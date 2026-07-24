---
title: "IBL 实战：从 Diffuse Irradiance 到 Specular Prefilter"
description: "从渲染方程出发，分析 diffuse irradiance、GGX specular prefilter、BRDF LUT 的采样方法、预计算过程与运行时组合。"
date: "2026-07-24"
category: "图形与高性能计算"
track: "Rendering / OpenGL"
level: advanced
status: ready
published: true
minutes: 45
order: 0
prerequisites: ["PBR 基础", "Cubemap", "HDR", "Cook-Torrance BRDF"]
tags: ["CG", "OpenGL", "PBR", "IBL", "Diffuse", "Specular", "LearnOpenGL", "AI Generated"]
photos: "banner.png"
source: "LearnOpenGL IBL"
---

PBR 材质模型规定表面如何响应入射光，但它本身并不提供入射光的方向分布。若场景只计算少量点光源或方向光，渲染方程只在少数离散方向上被求值，无法表达天空、地面及远处场景共同形成的环境照明。

Image Based Lighting（IBL）将 HDR 环境图解释为定义在球面方向上的入射辐射亮度函数 $L_i(\omega)$，并用它近似远距离环境对表面的照明。环境图既可以包含天空等间接照明，也可以包含太阳或灯具等高亮辐射源；因此 IBL 更准确的含义是“以图像表示入射光场”，而不只是补充环境色。

本文采用实时 metallic-roughness PBR 中常见的 split-sum IBL 管线，依次讨论：

- 将环境图与余弦核卷积，得到 diffuse irradiance。
- 使用 GGX 重要性采样生成 roughness 相关的 prefiltered environment map。
- 将镜面 BRDF 中与环境无关的部分积分为二维 BRDF LUT。
- 在运行时根据法线、反射方向、粗糙度和视角重组这些预计算结果。

## 为什么 IBL 要拆成 diffuse 和 specular

表面点 $p$ 沿观察方向 $\omega_o$ 的反射辐射亮度为：

$$
L_o(p, \omega_o)=\int_{\Omega} f_r(p,\omega_i,\omega_o)L_i(p,\omega_i)(n\cdot\omega_i)d\omega_i
$$

其中 $L_i$ 是环境图提供的入射辐射亮度，$f_r$ 是 BRDF，$n\cdot\omega_i$ 是投影立体角产生的余弦权重。直接在每个像素上对半球执行数百至数千次环境图采样并不适合实时渲染。对常见的 metallic-roughness 材质，可以分别预计算 BRDF 的漫反射项与镜面反射项：

- Lambert 漫反射项本身与观察方向无关，余弦加权积分后的方向变化平滑。
- 微表面镜面反射具有明显方向性，并同时受观察方向、粗糙度、Fresnel 和几何遮蔽影响。

这两部分的数值特性完全不同，所以预计算策略也不同：

- diffuse IBL 可以把环境辐射亮度与余弦核预卷积，得到按法线方向查询的 irradiance cubemap。
- specular IBL 无法压缩到一张固定模糊程度的 cubemap，因为积分还依赖反射方向、roughness 和 `NdotV`。实时渲染通常用 split-sum approximation，将其拆为 prefiltered environment map 与 BRDF LUT。

这种拆分来自两类 BRDF 的变量依赖关系，而不是单纯的代码组织方式。

## IBL 预计算管线

一条常见的 IBL 预计算管线可以概括成下面五步：

1. 读取 HDR equirectangular 环境图。
2. 把 equirectangular 贴图转换成 cubemap。
3. 对 cubemap 做 diffuse 卷积，得到 irradiance map。
4. 对 cubemap 按 roughness 预过滤，得到 prefilter map。
5. 离线或预计算生成 2D BRDF LUT，运行时和 prefilter map 一起参与 specular IBL。

在常见的 IBL 预计算实现里，前 3 步一般是：

- `stbi_loadf("newport_loft.hdr", ...)` 读取 HDR。
- `equirectangularToCubemapShader` 把 HDR 2D 环境图烘焙成 `envCubeMap`。
- `irradianceShader` 把 `envCubeMap` 再卷积成 `irradianceMap`。

然后在此基础上继续做：

- `glGenerateMipmap(GL_TEXTURE_CUBE_MAP)` 为环境 cubemap 建 mip。
- `prefilterShader` 按 mip 层和 roughness 写入 `prefilterMap`。
- `brdfShader` 渲染一个全屏 quad，生成 `brdfLUTTexture`。

理解这条链路之后，再看 shader 里的三个贴图：

```glsl
uniform samplerCube irradianceMap;
uniform samplerCube prefilterMap;
uniform sampler2D brdfLUT;
```

它们就不再像“PBR 固定三件套”，而是三个明确服务于不同积分近似的缓存结果。

## 第一步：为什么要先把 HDR 转成 Cubemap

很多 HDR 环境贴图以经纬展开形式存储。对单位方向 $d=(x,y,z)$，可以通过经度与纬度将其转换为二维纹理坐标：

$$
u=\frac{\operatorname{atan2}(z,x)}{2\pi}+\frac{1}{2},
\qquad
v=\frac{\arcsin(y)}{\pi}+\frac{1}{2}
$$

经纬图便于交换和编辑，但在两极处采样密度高度不均，纹理横向边界还需要环绕处理。预计算通常先把它重投影为 cubemap，使后续步骤可以直接用三维方向向量采样。

所以实际实现里，通常会先创建一个 `envCubeMap`，再用六个相机视角把 2D HDR 图重投影到 cubemap 六个面上：

```cpp
Shader equirectangularToCubemapShader("cubemap.vs", "equirectangular_to_cubemap.fs");
...
glFramebufferTexture2D(..., envCubeMap, 0);
renderCube();
```

该过程本质上是一次方向域重采样：

- 将 FBO 的颜色附件依次绑定到 cubemap 六个面。
- 使用 90 度透视投影和六组视图矩阵覆盖整个球面方向。
- 将每个输出片元对应的三维方向转换为经纬 UV，再从 HDR 纹理读取线性浮点颜色。

得到的 `envCubeMap` 近似表示 $L_i(\omega)$。cubemap 面边界必须使用 `GL_CLAMP_TO_EDGE`，否则双线性过滤可能从另一侧边界取样而产生接缝。各面还应保持一致的朝向约定；上下方向翻转或视图矩阵错误会同时污染 irradiance 与 specular prefilter。

## Diffuse IBL：为什么 irradianceMap 只跟法线有关

Lambert BRDF 为：

$$
f_d=\frac{c_{diff}}{\pi}
$$

它与观察方向 $\omega_o$ 无关，因此漫反射部分可以写为：

$$
L_o^d(N)=\frac{c_{diff}}{\pi}
\underbrace{\int_{\Omega^+(N)}L_i(\omega_i)(N\cdot\omega_i)d\omega_i}_{E(N)}
$$

积分 $E(N)$ 只依赖法线方向，因此可以为球面上的每个 $N$ 预先计算并存入 cubemap。运行时不再遍历半球，只需以世界空间法线查询一次纹理。

### 如何在法线局部坐标系中采样半球

对 irradiance cubemap 的每个输出 texel，其方向就是当前卷积中心 $N$。先构造以 $N$ 为 z 轴的局部正交基：

```glsl
vec3 up = abs(N.y) < 0.999 ? vec3(0.0, 1.0, 0.0)
                           : vec3(1.0, 0.0, 0.0);
vec3 right = normalize(cross(up, N));
up = cross(N, right);
```

局部半球方向可由方位角 $\phi\in[0,2\pi)$ 和天顶角 $\theta\in[0,\pi/2]$ 参数化：

$$
\omega_i(\theta,\phi)=
(\sin\theta\cos\phi,\ \sin\theta\sin\phi,\ \cos\theta)
$$

球面面积元不是 $d\theta d\phi$，而是：

$$
d\omega=\sin\theta\,d\theta\,d\phi
$$

同时 $N\cdot\omega_i=\cos\theta$，所以规则网格采样时每个样本的完整权重是 $\cos\theta\sin\theta$：

```glsl
vec3 sum = vec3(0.0);
float weight = 0.0;

for (float phi = 0.0; phi < TWO_PI; phi += delta)
{
    for (float theta = 0.0; theta < HALF_PI; theta += delta)
    {
        vec3 tangentDir = vec3(
            sin(theta) * cos(phi),
            sin(theta) * sin(phi),
            cos(theta)
        );
        vec3 L = tangentDir.x * right
               + tangentDir.y * up
               + tangentDir.z * N;

        float w = cos(theta) * sin(theta);
        sum += texture(envCubeMap, L).rgb * w;
        weight += w;
    }
}

vec3 diffuseConvolution = sum / max(weight, 1e-4);
```

若直接近似辐照度积分 $E(N)$，离散和应乘以步长面积 $\Delta\theta\Delta\phi$；若像上例一样除以总权重，得到的是归一化的余弦卷积。许多实时教程将 Lambert 的 $1/\pi$ 一并吸收到预计算约定中，使常量环境 $L_i=C$ 时纹理输出仍为 $C$。因此必须明确 irradiance map 的定义：它存储的是 $E(N)$，还是已经除以 $\pi$ 的 diffuse convolution。预计算和运行时只要采用同一约定即可，但不能重复或遗漏 $1/\pi$。

### 为什么结果可以使用较低分辨率

余弦核会显著衰减高频方向变化：远离法线的样本权重降低，半球内大量方向又被累加到同一个输出 texel。结果通常是低频函数，因此每个面 `32x32` 或 `64x64` 的 irradiance cubemap 已能保存主要变化。分辨率过高不会恢复被卷积消除的细节，只会增加预计算时间与显存占用。

规则角度网格便于理解，但样本在球面上并不均匀。生产实现也可以采用 cosine-weighted importance sampling，使 PDF 与积分中的余弦项匹配，从而用更少样本获得较低方差。若 $\omega_i$ 按 $p(\omega_i)=\cos\theta/\pi$ 采样，则 Monte Carlo 估计为：

$$
E(N)\approx\frac{1}{M}\sum_{k=1}^{M}
\frac{L_i(\omega_k)\cos\theta_k}{p(\omega_k)}
=\frac{\pi}{M}\sum_{k=1}^{M}L_i(\omega_k)
$$

## Diffuse IBL 在运行时怎么用

若 irradiance map 已采用吸收 $1/\pi$ 的 diffuse-convolution 约定，运行时为：

```glsl
vec3 irradiance = texture(irradianceMap, N).rgb;
vec3 diffuse = irradiance * albedo;
vec3 ambient = (kD * diffuse) * ao;
```

这里需要保持以下语义一致：

- 采样方向是 `N`，不是 `V`，也不是 `R`。
- `irradiance` 是预卷积结果，不是沿 `N` 方向读取的一次原始环境颜色。
- 若纹理存储严格意义上的 $E(N)$，则此处必须使用 `irradiance * albedo / PI`；只有预计算已包含 $1/\pi$ 时才能省略。
- `kD = (1 - kS) * (1 - metallic)` 仍然要保留，因为能量分配规则并不会因为是环境光就消失。

对于金属，`metallic = 1` 时 $k_D=0$，环境漫反射应被完全抑制；其主要环境响应由镜面项承担。

## 仅有 diffuse IBL 为什么还不够

仅计算 `irradianceMap` 时，非金属材质已经能够获得低频环境漫反射，但所有环境镜面反射仍然缺失。对金属而言，理想化 metallic 工作流会令漫反射分量趋近于零，其环境外观几乎完全由镜面项决定。因此只包含 diffuse IBL 会产生以下结果：

- 光滑金属看起来发灰。
- 高光没有环境形状。
- roughness 改变时，环境反射层次不对。

specular IBL 的目标就是在可接受的实时成本内恢复这部分与方向、视角和粗糙度相关的环境响应。

## Specular IBL 为什么比 diffuse 难

Cook-Torrance 镜面 BRDF 为：

$$
f_s(\omega_i,\omega_o)=
\frac{D(h)\,F(\omega_o,h)\,G(\omega_i,\omega_o)}
{4(N\cdot\omega_i)(N\cdot\omega_o)}
$$

因此环境镜面项同时依赖：

- 法线 `N`
- 视线 `V`
- 反射方向 `R`
- roughness
- Fresnel
- 微表面几何项

其中法线分布函数 $D$ 决定镜面 lobe 的宽度，Fresnel 项 $F$ 依赖角度和基础反射率 $F_0$，几何项 $G$ 描述微表面的遮蔽与阴影。将所有变量直接预计算到纹理需要过高维度，不能像 diffuse 一样只按 $N$ 查询。

split-sum approximation 将积分近似分解为：

$$
L_o^s \approx
\underbrace{L_{\text{prefilter}}(R,\alpha)}_{\text{环境与 GGX lobe}}
\cdot
\underbrace{\left(F_0A(N\cdot V,\alpha)+B(N\cdot V,\alpha)\right)}_{\text{BRDF 积分}}
$$

其中 $\alpha$ 由 roughness 映射得到。第一项保留环境颜色和反射方向，第二项保存视角、粗糙度、Fresnel 与几何遮蔽的影响。这个乘积不是严格的代数恒等式，而是用低维预计算换取实时性能的近似。

## Prefilter Map：把 roughness 编进 mip 层

在典型实现里，`prefilterMap` 的生成会是这一类逻辑：

```cpp
glTexParameteri(GL_TEXTURE_CUBE_MAP, GL_TEXTURE_MIN_FILTER, GL_LINEAR_MIPMAP_LINEAR);
glGenerateMipmap(GL_TEXTURE_CUBE_MAP);
...
for (unsigned int mip = 0; mip < maxMipLevels; ++mip)
{
    float mipRoughness = float(mip) / float(maxMipLevels - 1);
    prefilterShader.setFloat("roughness", mipRoughness);
    ...
    glFramebufferTexture2D(..., prefilterMap, mip);
    renderCube();
}
```

这里的 mip 层不是由普通图像缩小自动产生的最终结果，而是预过滤 shader 分别渲染的 roughness 切片：

- 同一张 cubemap，使用多个 mip 层。
- 每个 mip 层对应一个 roughness 区间。
- roughness 越高，GGX lobe 越宽，输出写入尺寸越小的 mip。

这不是普通纹理采样意义上的图像缩小，而是将不同粗糙度下的环境镜面卷积结果存入不同 mip。

于是运行时就可以这样取：

```glsl
vec3 R = reflect(-V, N);
vec3 prefilteredColor = textureLod(prefilterMap, R, roughness * MAX_REFLECTION_LOD).rgb;
```

相邻 mip 之间使用三线性过滤，因此连续 roughness 可以在离散预计算层之间插值。`MAX_REFLECTION_LOD` 必须与实际生成的最高层一致；例如生成 5 层时其值为 4，而不是 cubemap 完整 mip 链的理论层数。

## GGX Prefilter：如何采样镜面 lobe

### Hammersley 序列

纯随机样本容易在有限样本数下形成聚簇和空洞。预计算通常采用 Hammersley 低差异序列：

$$
\xi_i=\left(\frac{i}{M},\ \operatorname{RadicalInverse}_2(i)\right)
$$

第二维通过翻转整数的二进制位构造 Van der Corput 序列。它不是增加样本数量，而是使有限样本更均匀地覆盖单位正方形，减少静态噪点。

```glsl
vec2 Hammersley(uint i, uint sampleCount)
{
    return vec2(float(i) / float(sampleCount), RadicalInverseVdC(i));
}
```

### 从二维样本生成 GGX 半程向量

二维样本 $\xi=(\xi_x,\xi_y)$ 通过 GGX 分布反演为局部半程向量 $H$。一种常见映射为：

$$
\phi=2\pi\xi_x
$$

$$
\cos\theta=
\sqrt{\frac{1-\xi_y}{1+(\alpha^2-1)\xi_y}}
$$

其中常见约定是 $\alpha=roughness^2$。不同代码可能把平方操作放在 roughness 映射或 GGX 函数内部，必须与直接光使用的 NDF 参数化一致。

```glsl
vec3 ImportanceSampleGGX(vec2 Xi, vec3 N, float roughness)
{
    float a = roughness * roughness;
    float phi = TWO_PI * Xi.x;
    float cosTheta = sqrt((1.0 - Xi.y) /
                         (1.0 + (a * a - 1.0) * Xi.y));
    float sinTheta = sqrt(max(1.0 - cosTheta * cosTheta, 0.0));

    vec3 Ht = vec3(cos(phi) * sinTheta,
                   sin(phi) * sinTheta,
                   cosTheta);

    vec3 up = abs(N.z) < 0.999 ? vec3(0.0, 0.0, 1.0)
                              : vec3(1.0, 0.0, 0.0);
    vec3 tangent = normalize(cross(up, N));
    vec3 bitangent = cross(N, tangent);
    return normalize(tangent * Ht.x + bitangent * Ht.y + N * Ht.z);
}
```

### 从半程向量恢复入射方向

预过滤 cubemap 的当前输出方向记为 $R$。经典 split-sum 预过滤假设 $N=V=R$，然后从采样得到的半程向量反射视线，恢复入射光方向：

$$
L=2(V\cdot H)H-V
$$

```glsl
vec3 N = normalize(localPos);
vec3 R = N;
vec3 V = R;

vec3 prefiltered = vec3(0.0);
float totalWeight = 0.0;

for (uint i = 0u; i < SAMPLE_COUNT; ++i)
{
    vec2 Xi = Hammersley(i, SAMPLE_COUNT);
    vec3 H = ImportanceSampleGGX(Xi, N, roughness);
    vec3 L = normalize(2.0 * dot(V, H) * H - V);

    float NdotL = max(dot(N, L), 0.0);
    if (NdotL > 0.0)
    {
        prefiltered += texture(envCubeMap, L).rgb * NdotL;
        totalWeight += NdotL;
    }
}

prefiltered /= max(totalWeight, 1e-4);
```

这里按 GGX 分布生成 $H$，相当于把样本集中到对当前 roughness 贡献最大的镜面 lobe 内。若改用均匀半球采样，大部分样本在低 roughness 时几乎没有贡献，需要显著更多样本才能达到相同方差。

假设 $N=V=R$ 是重要近似：它使 prefilter map 只需要方向与 roughness 两个维度，但也丢失了实际 $N$ 与 $V$ 不重合时环境和 BRDF 的相关性。掠射角和高频环境下的误差通常最明显。

### 为什么还要根据 PDF 选择源环境图 mip

若始终从源环境 cubemap 的 mip 0 采样，低概率样本可能偶然命中极亮 texel，形成离散亮点。可根据每个 GGX 样本覆盖的立体角选择源纹理 mip：

$$
p(L)=\frac{D(H)(N\cdot H)}{4(V\cdot H)}
$$

$$
\Omega_s\approx\frac{1}{M\,p(H)},\qquad
\Omega_t\approx\frac{4\pi}{6\,r^2}
$$

其中 $M$ 是样本数，$r$ 是源 cubemap 单面分辨率。对应 mip 为：

$$
mip=\frac{1}{2}\log_2\frac{\Omega_s}{\Omega_t}
$$

```glsl
float D = DistributionGGX(N, H, roughness);
float pdf = max(D * NdotH / (4.0 * HdotV), 1e-4);
float saSample = 1.0 / (float(SAMPLE_COUNT) * pdf);
float saTexel = 4.0 * PI / (6.0 * resolution * resolution);
float mipLevel = roughness == 0.0
    ? 0.0
    : 0.5 * log2(saSample / saTexel);

prefiltered += textureLod(envCubeMap, L, mipLevel).rgb * NdotL;
```

这要求源 `envCubeMap` 预先拥有普通 mip 链。这里源 mip 用于匹配单个 Monte Carlo 样本的覆盖范围，而目标 `prefilterMap` 的 mip 则编码材质 roughness；两者用途不同。

### 为什么不能用普通高斯模糊

高斯核定义在二维纹理距离上，不包含球面立体角、GGX 法线分布或反射几何关系。cubemap 各面的二维距离也不能在边界处直接代表球面角距离。因此 prefilter 不是对六张方形图分别做模糊，而是对方向函数 $L_i(\omega)$ 进行 GGX 加权积分。

## BRDF LUT：为什么还要多一张 2D 纹理

prefilter map 只近似了环境辐射亮度在 GGX lobe 内的分布，尚未完整包含 Fresnel 与几何遮蔽。Schlick Fresnel 可写为：

$$
F(V,H)=F_0+(1-F_0)(1-V\cdot H)^5
$$

令 $F_c=(1-V\cdot H)^5$，则：

$$
F=F_0(1-F_c)+F_c
$$

这使 BRDF 积分可以拆成 $F_0$ 的缩放系数 $A$ 与偏置系数 $B$。在固定 NDF 和 Geometry 模型后，二者只依赖 $N\cdot V$ 与 roughness，因此可以存入二维纹理的 R、G 通道。

```cpp
Shader brdfShader("brdf.vs", "brdf.fs");
...
glTexImage2D(GL_TEXTURE_2D, 0, GL_RG16F, 512, 512, 0, GL_RG, GL_FLOAT, 0);
...
renderQuad();
```

BRDF LUT 的坐标通常定义为：

- `x = NdotV`
- `y = roughness`

### LUT 的数值积分过程

对 LUT 的每个 texel，取 $N=(0,0,1)$，根据横坐标重建位于 xz 平面的观察方向：

```glsl
vec3 V = vec3(
    sqrt(max(1.0 - NdotV * NdotV, 0.0)),
    0.0,
    NdotV
);
vec3 N = vec3(0.0, 0.0, 1.0);
```

随后使用与 prefilter 相同的 Hammersley 与 GGX 重要性采样。每个有效样本计算：

$$
G_{vis}=
\frac{G(N,V,L)\,(V\cdot H)}
{(N\cdot H)(N\cdot V)}
$$

并累积：

$$
A\mathrel{+}=(1-F_c)G_{vis},
\qquad
B\mathrel{+}=F_cG_{vis}
$$

```glsl
vec2 IntegrateBRDF(float NdotV, float roughness)
{
    vec3 N = vec3(0.0, 0.0, 1.0);
    vec3 V = vec3(sqrt(max(1.0 - NdotV * NdotV, 0.0)),
                  0.0,
                  NdotV);

    float A = 0.0;
    float B = 0.0;

    for (uint i = 0u; i < SAMPLE_COUNT; ++i)
    {
        vec3 H = ImportanceSampleGGX(
            Hammersley(i, SAMPLE_COUNT), N, roughness);
        vec3 L = normalize(2.0 * dot(V, H) * H - V);

        float NdotL = max(L.z, 0.0);
        float NdotH = max(H.z, 0.0);
        float VdotH = max(dot(V, H), 0.0);

        if (NdotL > 0.0)
        {
            float G = GeometrySmith(N, V, L, roughness);
            float GVis = G * VdotH /
                         max(NdotH * NdotV, 1e-4);
            float Fc = pow(1.0 - VdotH, 5.0);

            A += (1.0 - Fc) * GVis;
            B += Fc * GVis;
        }
    }

    return vec2(A, B) / float(SAMPLE_COUNT);
}
```

LUT 不存储环境颜色，也不依赖具体 HDR 图，因此只需生成一次，并可在多个环境之间复用。前提是运行时使用的 NDF、Geometry 函数、roughness 参数化和 LUT 生成过程保持一致；只替换其中某一项会使预积分不再对应当前 BRDF。

运行时读取 $A,B$ 后，将 Fresnel 的材质参数 $F_0$ 代回：

```glsl
vec2 envBRDF = texture(brdfLUT, vec2(max(dot(N, V), 0.0), roughness)).rg;
vec3 specular = prefilteredColor * (F * envBRDF.x + envBRDF.y);
```

对非金属，$F_0$ 通常约为 `0.04`；对金属，$F_0$ 来自 base color。由此同一张两通道 LUT 可以支持不同材质颜色。

## 最终的环境镜面项是怎么组合出来的

在完整 IBL shader 中，环境部分的核心代码一般是：

```glsl
vec3 F = fresnelSchlickRoughness(max(dot(N, V), 0.0), F0, roughness);
vec3 kS = F;
vec3 kD = 1.0 - kS;
kD *= 1.0 - metallic;

vec3 irradiance = texture(irradianceMap, N).rgb;
vec3 diffuse = irradiance * albedo;

vec3 prefilteredColor = textureLod(prefilterMap, R, roughness * MAX_REFLECTION_LOD).rgb;
vec2 envBRDF = texture(brdfLUT, vec2(max(dot(N, V), 0.0), roughness)).rg;
vec3 specular = prefilteredColor * (F * envBRDF.x + envBRDF.y);

vec3 ambient = (kD * diffuse + specular) * ao;
```

组合过程中各数据承担不同变量：

- `irradianceMap` 提供 diffuse IBL。
- `prefilterMap + brdfLUT` 提供 specular IBL。
- `kD / kS` 继续负责能量分配，避免 diffuse 和 specular 各拿一整份能量。

`R`、`N` 与 `V` 必须位于和环境 cubemap 相同的坐标空间。常见做法是在世界空间完成 IBL 查询；若使用局部空间或视图空间，则必须对环境图方向进行对应变换。

## 为什么 `fresnelSchlickRoughness` 比普通 Fresnel 更合适

在直接光部分，通常仍然使用普通的：

```glsl
vec3 F = fresnelSchlick(max(dot(H, V), 0.0), F0);
```

但在环境光部分，它改成了：

```glsl
vec3 fresnelSchlickRoughness(float cosTheta, vec3 F0, float roughness)
```

`fresnelSchlickRoughness` 是常见的间接光近似修正。它限制粗糙表面在掠射角处的 Fresnel 增长，避免环境 diffuse 权重因 `kD = 1 - kS` 被过度压低。该函数不是 split-sum 推导的必然组成，也不应替换直接光中基于 `VdotH` 的 Schlick Fresnel。

更完整的渲染器可能使用多重散射补偿或其他能量保持模型，而不是这一经验形式。选择哪种方案取决于 BRDF 模型以及与内容制作流程的一致性。

## 为什么预计算纹理使用浮点格式

常见实现会使用：

- `GL_RGB16F`
- `GL_RGBA16F`
- `GL_RG16F`

IBL 积分处理的是线性 HDR 辐射亮度。若在预计算阶段将值截断到 `[0, 1]`，太阳、窗户和灯具等高亮区域的能量差异会永久丢失；后续卷积无法从 LDR 数据恢复这些差异。

所以：

- 原始 HDR 环境图要用浮点加载。
- cubemap、irradianceMap、prefilterMap 要用半浮点或浮点格式。
- BRDF LUT 也常用高精度格式，避免低 roughness 区域产生条带。

IBL、直接光与 emissive 应在线性 HDR 空间中合成，最终显示前再执行 tone mapping 与输出变换。例如：

```glsl
color = color / (color + vec3(1.0));
color = pow(color, vec3(1.0 / 2.2));
```

示例中的幂函数是近似 gamma 编码；使用 sRGB framebuffer 时应避免再次手动编码。tone mapping 也不是 IBL 预计算的一部分，不应对 `envCubeMap`、`irradianceMap` 或 `prefilterMap` 提前执行。

## 采样质量、性能与误差来源

预计算结果的质量主要由输出分辨率、样本数、采样分布和源环境图共同决定：

- diffuse 卷积通常使用较低分辨率，但样本过少会产生方向性条纹；增大输出分辨率不能消除积分噪声。
- specular prefilter 在低 roughness 时对高频环境最敏感。Hammersley 序列、GGX 重要性采样以及基于 PDF 的源 mip 选择能够显著减少亮点与闪烁。
- BRDF LUT 的低 `NdotV`、低 roughness 区域变化最剧烈。`RG16F` 与足够的积分样本可减少条带和量化误差。
- cubemap 面边界、坐标系约定和纹理过滤状态会影响所有预计算结果，应在生成各阶段后分别可视化检查。

经典 split-sum IBL 还具有明确的模型边界：

- 环境图表示无限远光照，不包含场景内局部反射、遮挡变化和视差。室内反射探针通常需要 box projection 或局部探针混合。
- prefilter 中的 $N=V=R$ 假设会丢失环境与 BRDF 的部分相关性，掠射角误差较明显。
- 基础形式通常只近似单次微表面散射，粗糙金属可能出现能量损失；多重散射补偿可以改善这一问题。
- 单个标量 AO 同时乘 diffuse 与 specular 只是粗略遮蔽。更完整的方案会区分 diffuse AO、specular occlusion 与 bent normal。
- 以上推导面向各向同性 GGX。anisotropy、clear coat、sheen 等 lobe 需要相应的预过滤或额外近似。

## 从 Diffuse IBL 到 Specular IBL

把 IBL 拆成两个连续阶段，目的不是分别记住两套代码，而是逐步理解环境积分如何从一个仅含漫反射的近似扩展为完整的材质响应。

### 第一阶段：建立环境漫反射

这一阶段只引入 irradiance map，重点是：

- 把环境图从视觉背景重新理解为按方向存储的入射辐射亮度。
- 利用 Lambert BRDF 与观察方向无关的性质，将余弦加权半球积分预卷积为 irradiance cubemap。
- 在运行时用表面法线查询环境辐照度，再与材质的漫反射响应组合。

它建立了 IBL 最基本的思维方式：将昂贵的方向积分提前计算，运行时只保留低成本查询。但此时材质仍缺少来自环境的镜面反射，尤其不能完整表达金属和低粗糙度表面。

### 第二阶段：补全环境镜面反射

这一阶段引入 prefilter map 与 BRDF LUT，重点是：

- 理解镜面积分为什么同时依赖反射方向、roughness 与 `NdotV`，因而不能复用 irradiance map。
- 用 GGX 重要性采样预过滤环境图，并通过 cubemap 的 mip 层近似存储不同 roughness 下的镜面 lobe。
- 用二维 BRDF LUT 保存与环境无关、由 `NdotV` 和 roughness 决定的预积分系数。
- 在运行时按 split-sum approximation 重组环境项与 BRDF 项。

完成这一阶段后，非金属表面的环境高光、金属的有色反射以及粗糙度引起的反射展宽，才都能进入同一套实时近似。

## 实现检查项

### 区分 diffuse 与 specular 的查询方向

- diffuse 用了 `R` 去采样
- specular 用了 `N` 去采样

正确关系是：

- diffuse IBL 查 `N`
- specular IBL 查 `R`

irradiance map 的自变量是法线方向；prefilter map 的自变量是镜面反射方向与 roughness。

### 区分源环境 mip 与目标 prefilter mip

源环境 mip 用于匹配 Monte Carlo 样本的立体角，目标 prefilter mip 用于存储不同 roughness 的积分结果。两套 mip 链都可能存在，但生成方式和用途不同。

### 不应使用 `prefilterMap` 替代 `brdfLUT`

`prefilterMap` 只近似环境相关部分，`NdotV`、Fresnel 与 Geometry 的积分系数仍由 LUT 提供。

### 环境图、法线、视线不在同一空间

如果 `N`、`V`、`R` 和 cubemap 采样方向不在同一坐标空间，反射会随相机或模型变换产生错误旋转。

### 把数据贴图当成 sRGB

HDR 环境图通常按线性浮点数据读取；BRDF LUT 是数值查找表，也必须关闭 sRGB 解码。base color 等颜色纹理则通常需要 sRGB 到线性的转换。

## 预计算数据的职责

四类数据分别对应不同的函数或积分结果：

- 原始 `envCubeMap`：环境沿各方向的 HDR 入射辐射亮度。
- `irradianceMap`：环境对 diffuse BRDF 的低频卷积结果。
- `prefilterMap`：环境对 specular BRDF 的 roughness 相关预过滤结果。
- `brdfLUT`：specular IBL 中与环境无关、与 `NdotV + roughness` 相关的积分项。

运行时执行低成本查询与组合：

- 用 `N` 查 diffuse 环境项
- 用 `R` 和 roughness 查 specular 环境项
- 再用 Fresnel、metallic、roughness、AO 把它们拼回材质响应

## 小结

从实现层次上看，diffuse IBL 和 specular IBL 是对渲染方程中两类材质响应的分别近似。

diffuse IBL 利用 Lambert BRDF 与观察方向无关的性质，将余弦加权半球积分压缩为按法线查询的 irradiance map。采样时必须考虑球面面积元或采用与余弦项匹配的重要性采样，并在预计算与运行时之间统一 $1/\pi$ 的归一化约定。

specular IBL 使用 GGX 重要性采样和 Hammersley 序列生成 roughness 相关的 prefilter map，再将 Fresnel 与 Geometry 中依赖 `NdotV` 和 roughness 的部分积分为 BRDF LUT。运行时通过 split-sum approximation 重组环境项与 BRDF 项。

最终完整形式就是：

```glsl
ambient = (kD * diffuseIBL + specularIBL) * ao;
finalColor = ambient + directLighting;
```

其中：

- `diffuseIBL` 来自 `irradianceMap`
- `specularIBL` 来自 `prefilterMap + brdfLUT`

该结构以有限维纹理和少量运行时采样近似高维环境积分，是实时 metallic-roughness PBR 中最常见的 IBL 基础方案之一。

## 参考资料

- LearnOpenGL: [Diffuse irradiance](https://learnopengl.com/PBR/IBL/Diffuse-irradiance)
- LearnOpenGL: [Specular IBL](https://learnopengl.com/PBR/IBL/Specular-IBL)
