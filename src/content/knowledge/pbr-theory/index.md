---
title: "PBR 理论：从渲染方程到实时材质工作流"
description: "整理 Physically Based Rendering 的核心思路：辐射度量、渲染方程、微表面 BRDF、Cook-Torrance 模型、metallic-roughness 工作流、IBL 与实时渲染中的工程细节。"
date: "2026-07-20"
category: "图形与高性能计算"
track: "Rendering / HPC"
level: advanced
status: ready
published: true
minutes: 45
order: 0
prerequisites: []
tags: ["CG", "PBR", "Shading", "BRDF", "IBL", "AI Generated"]
photos: "banner.png"
source: "https://learnopengl.com/PBR/Theory"
---

PBR，Physically Based Rendering，通常被翻译为基于物理的渲染。这个名字听起来很重，但在实时渲染里，它并不意味着完整模拟现实世界中每一条光线的传播，而是把材质和光照放进一组更稳定的物理约束中：光不会凭空变多，材质参数有明确含义，同一个材质换到不同光照环境中仍然像同一种材料。

如果只从代码角度看，PBR 可能就是一段 Cook-Torrance shader。但如果从渲染管线角度看，PBR 更像一套协议：美术制作贴图时遵守一套参数语义，shader 用一套能量模型解释这些参数，后处理和环境光又提供足够大的动态范围，让材质能在真实光照强度下工作。

这篇文章以 LearnOpenGL 的 PBR Theory 为主线，结合实时渲染常见实现，整理 PBR 的基本概念、数学结构和工程落地方式。

## 为什么需要 PBR

在传统经验光照模型里，一个材质往往有 diffuse、specular、shininess 之类的参数。它们很容易写，也很容易在某个场景里调出不错的效果：

- 漫反射颜色控制物体固有色。
- 高光颜色控制反光颜色。
- shininess 控制高光大小。

问题是，这些参数之间没有强约束。一个材质可以同时拥有非常亮的 diffuse 和非常亮的 specular，结果就是反射出的能量超过入射能量。它在某个固定光源下可能看起来正常，但换到 HDR 天空盒、室内灯光、夜景或高曝光场景中就会失真。

PBR 想解决的是这种“不稳定”。它希望材质满足几个条件：

- 参数接近现实材料属性，而不是只服务于某张截图。
- 光照计算满足能量守恒。
- 漫反射与镜面反射共享同一份入射能量。
- 粗糙度控制微表面分布，而不是简单改变高光亮度。
- 金属和非金属具有不同的反射行为。
- 颜色计算在线性空间中进行，显示前再做 tone mapping 与 gamma correction。

因此，PBR 不是让画面自动好看，而是让画面更可解释、更可迁移、更适合复杂光照环境。

## 先区分几个光度量

学习 PBR 前，需要先把几个经常混在一起的概念分开。它们都是描述光的量，但含义不同。

Radiant flux，辐射通量，表示单位时间内传递的总能量，单位是瓦特。

Irradiance，辐照度，表示单位面积接收到多少入射能量：

$$
E = \frac{d\Phi}{dA}
$$

Radiance，辐射亮度，描述的是沿某个方向、穿过单位投影面积、单位立体角的能量：

$$
L = \frac{d^2\Phi}{dA \cos\theta d\omega}
$$

实时 shader 里通常不会显式写出这些单位，但理解它们有助于解释渲染方程。尤其是 radiance，它带有方向性。我们最终看到的颜色，可以理解为从表面点沿观察方向出射的 radiance。

## 渲染方程：PBR 的位置在哪里

渲染方程描述一个表面点向观察方向射出的光：

$$
L_o(p, \omega_o) =
\int_{\Omega}
f_r(p, \omega_i, \omega_o)
L_i(p, \omega_i)
(n \cdot \omega_i)
d\omega_i
$$

各项含义如下：

- $L_o(p, \omega_o)$：从点 $p$ 沿观察方向 $\omega_o$ 出射的 radiance。
- $L_i(p, \omega_i)$：从方向 $\omega_i$ 入射到点 $p$ 的 radiance。
- $f_r(p, \omega_i, \omega_o)$：BRDF，描述入射方向到出射方向的反射比例。
- $(n \cdot \omega_i)$：余弦项，表示斜射光在表面上被摊薄。
- $\Omega$：表面法线所在半球的所有入射方向。

这条公式说明，一个点最终有多亮，不只取决于光源有多亮，还取决于从所有方向来的光、材质如何反射这些光，以及入射方向与表面法线的夹角。

实时渲染无法对整个半球做完整积分，所以常拆成两部分：

- 直接光照：场景中有限数量的点光、方向光、聚光灯逐个计算。
- 间接光照：环境贴图、irradiance map、prefilter map、BRDF LUT 等近似积分。

PBR 的核心，就落在 $f_r$ 的设计上。也就是：材质到底如何分配入射光。

## BRDF 应该满足什么

BRDF 是 Bidirectional Reflectance Distribution Function，双向反射分布函数。它回答一个问题：从方向 $\omega_i$ 入射的光，有多少会反射到方向 $\omega_o$？

一个适合 PBR 的 BRDF 至少应满足两件事。

第一是 Helmholtz reciprocity，互易性：

$$
f_r(\omega_i,\omega_o)=f_r(\omega_o,\omega_i)
$$

直觉上，从 A 方向照到 B 方向的反射关系，与从 B 方向照到 A 方向应该一致。真实物理材料通常满足这个性质。

第二是能量守恒：

$$
\int_{\Omega} f_r(\omega_i,\omega_o)(n\cdot\omega_o)d\omega_o \le 1
$$

也就是说，表面向整个半球反射出的能量不能超过入射能量。实时渲染里不会每次都显式验证这个积分，但 shader 的结构必须朝这个方向设计。

常见 PBR 会把 BRDF 拆成漫反射和镜面反射：

$$
f_r = k_d f_{diffuse} + k_s f_{specular}
$$

这里 $k_d$ 和 $k_s$ 不是随便调的两层颜色。它们代表入射能量在 diffuse 和 specular 之间的分配。

## Lambert 漫反射为什么要除以 pi

非金属材质会有明显漫反射。光进入表面后，在内部发生散射，再从许多方向离开。最简单的漫反射模型是 Lambert：

$$
f_{diffuse} = \frac{c}{\pi}
$$

这里 $c$ 是 diffuse albedo 或 base color。除以 $\pi$ 是为了能量归一化。Lambert 假设出射 radiance 与方向无关，但出射到整个半球时仍要积分：

$$
\int_{\Omega} \frac{c}{\pi}(n\cdot\omega_o)d\omega_o = c
$$

如果不除以 $\pi$，漫反射会在积分意义上反射出过多能量。很多早期经验 shader 可以看起来更亮，就是因为它偷偷破坏了这个约束。

这也是 PBR 初学时容易混乱的地方：屏幕上一个像素的颜色看起来只是 RGB，但 shader 里的 RGB 实际上是在模拟能量传输。多一个 $\pi$ 或少一个 $\pi$，不是数学洁癖，而是会影响材质在不同光照环境中的稳定性。

## 镜面反射：Cook-Torrance 微表面模型

PBR 的镜面项通常使用 Cook-Torrance 微表面模型：

$$
f_{specular} =
\frac{D(h)F(v,h)G(l,v,h)}
{4(n \cdot l)(n \cdot v)}
$$

其中：

- $n$ 是宏观表面法线。
- $l$ 是指向光源的方向。
- $v$ 是指向相机的方向。
- $h$ 是半程向量，$h = normalize(l+v)$。
- $D$ 是 Normal Distribution Function，描述微表面法线分布。
- $F$ 是 Fresnel 项，描述角度相关反射率。
- $G$ 是 Geometry 项，描述微表面之间的遮蔽和阴影。

这个公式的核心思想是：宏观表面并不是一个完美镜面，而是由大量微小镜面组成。只有法线刚好朝向半程向量 $h$ 的微表面，才会把光线从 $l$ 反射到 $v$。粗糙度越高，微表面法线越分散，高光越宽；粗糙度越低，微表面法线越集中，高光越尖锐。

分母 $4(n \cdot l)(n \cdot v)$ 来自微表面模型的几何变换，用于把微表面上的分布转换到宏观表面上的 BRDF。实际代码里会加一个很小的 epsilon，避免接近 0 时出现数值问题。

## NDF：GGX 为什么常见

NDF，Normal Distribution Function，描述有多少微表面法线朝向某个方向。实时 PBR 中常见选择是 GGX，也叫 Trowbridge-Reitz：

$$
D_{GGX}(n,h,\alpha)=
\frac{\alpha^2}
{\pi((n \cdot h)^2(\alpha^2-1)+1)^2}
$$

$\alpha$ 是粗糙度参数，常由 roughness 转换：

$$
\alpha = roughness^2
$$

GGX 相比 Blinn-Phong 有更长的尾部。也就是说，它不只在高光中心附近有贡献，在远离中心的地方仍保留较自然的反射拖尾。这对金属、粗糙塑料、潮湿表面都很重要，因为现实材质的反射并不总是一个很干净的圆形亮斑。

从直觉上看：

- roughness 低：$D$ 在 $n\cdot h$ 接近 1 时非常集中，高光小而亮。
- roughness 高：$D$ 分布更宽，高光变宽，峰值降低。

注意，粗糙度不是“高光强度”。它控制的是微表面法线分布。高光变暗往往是因为同样的能量被摊到更大的角度范围里，而不是简单把 specular 乘了一个小数。

## Fresnel：为什么掠射角更亮

Fresnel 项描述反射率随角度变化。大多数材质在正面看时反射较弱，在掠射角看时反射明显增强。实时渲染常使用 Schlick 近似：

$$
F = F_0 + (1 - F_0)(1 - v \cdot h)^5
$$

$F_0$ 是法线方向上的基础反射率。对多数非金属，$F_0$ 通常较低，常见默认值为 0.04。金属的 $F_0$ 则通常来自 baseColor，因此金属高光带有材质颜色。

metallic-roughness 工作流里常见写法是：

$$
F_0 = mix(vec3(0.04), baseColor, metallic)
$$

这句话背后有一个很重要的材质语义：

- 非金属：baseColor 主要表示漫反射颜色，specular 通常接近灰色。
- 金属：baseColor 主要表示镜面反射颜色，diffuse 基本消失。

因此金属不是“更亮的塑料”。金属和非金属的能量分配方式不同。把一个塑料材质的 specular 调亮，不等于它变成金属。

## Geometry 项：微表面遮蔽与自阴影

即使一个微表面法线方向正确，也不代表它一定能被光照到，或者一定能被相机看到。粗糙表面上的微结构会互相遮挡，这就是 Geometry 项要近似的内容。

常见实时实现使用 Schlick-GGX：

$$
G_{SchlickGGX}(n,x,k)=
\frac{n \cdot x}
{(n \cdot x)(1-k)+k}
$$

直接光照中常用：

$$
k = \frac{(roughness+1)^2}{8}
$$

然后组合视线方向和光照方向：

$$
G = G_{SchlickGGX}(n,v,k)G_{SchlickGGX}(n,l,k)
$$

roughness 越高，微表面越混乱，自遮蔽越明显。这个项会削弱一些本来由 $D$ 和 $F$ 预测出来的反射，让材质更符合微观几何直觉。

## 能量守恒：diffuse 与 specular 不能各拿一份完整能量

PBR 中常用 Fresnel 项估计镜面反射比例：

$$
k_s = F
$$

留给漫反射的比例是：

$$
k_d = (1-k_s)(1-metallic)
$$

这条式子同时表达了两件事。

第一，镜面反射越强，漫反射越弱。光被 specular 反射走了，就不能再完整进入材质内部产生 diffuse。

第二，metallic 越高，漫反射越少。金属中的自由电子会吸收入射光并快速以镜面形式重新辐射，因此金属没有明显的传统漫反射。

最终直接光照中，一个简化的组合形式是：

$$
L_o =
(k_d\frac{baseColor}{\pi}+f_{specular})
L_i
(n\cdot l)
$$

这里最容易出错的是重复加能量。比如 diffuse 用了 baseColor，specular 又用 baseColor，再额外给金属保留强 diffuse，就会让材质在强光下不受控。

## Metallic-Roughness 工作流

现代实时渲染和资产交换中，很常见的一套 PBR 参数是 metallic-roughness。glTF 2.0 的默认材质模型也采用这条路线。

常见贴图含义如下：

- `baseColor`：非金属的漫反射颜色，或金属的镜面反射颜色。
- `metallic`：0 表示非金属，1 表示金属。中间值常用于混合、污渍、边缘磨损或材质过渡。
- `roughness`：控制微表面法线分布，越低越接近镜面，越高越粗糙。
- `normal`：改变局部法线方向，不改变真实几何轮廓。
- `ambientOcclusion`：主要用于衰减间接光或环境光。
- `emissive`：材质自身发光，但不一定照亮其他物体，除非渲染器额外处理 GI 或 bloom。

一个典型材质贴图通道可能这样打包：

- BaseColor：RGB，sRGB 颜色。
- Normal：RGB，线性数据。
- Metallic-Roughness：B 通道存 metallic，G 通道存 roughness。
- AO：R 通道，线性数据。

这里要特别注意颜色贴图和数据贴图的区别。BaseColor 是颜色，通常需要从 sRGB 解码到线性空间。Metallic、roughness、normal、AO 是数据，不应该做 gamma 解码。

## Specular-Glossiness 工作流

除了 metallic-roughness，还有 specular-glossiness 工作流。它直接提供 diffuse color、specular color 和 glossiness。

这套工作流对某些材质更直观，比如可以显式控制非金属的 specular 颜色。但它的参数自由度更高，也更容易被调出不符合能量约束的材质。metallic-roughness 的优点是约束更强，参数更少，更适合大规模资产生产和跨工具交换。

两种工作流并不是谁绝对更物理。它们都是对材质空间的参数化。关键在于 shader 如何解释这些参数，以及制作流程是否有一致规范。

## 直接光照中的 shader 骨架

一个典型 Cook-Torrance 直接光照片元流程如下：

```glsl
vec3 N = normalize(normal);
vec3 V = normalize(cameraPos - worldPos);
vec3 L = normalize(lightPos - worldPos);
vec3 H = normalize(V + L);

float distance = length(lightPos - worldPos);
float attenuation = 1.0 / max(distance * distance, 0.001);
vec3 radiance = lightColor * attenuation;

float NdotL = max(dot(N, L), 0.0);
float NdotV = max(dot(N, V), 0.0);

vec3 F0 = mix(vec3(0.04), baseColor, metallic);
float D = DistributionGGX(N, H, roughness);
float G = GeometrySmith(N, V, L, roughness);
vec3 F = FresnelSchlick(max(dot(H, V), 0.0), F0);

vec3 numerator = D * G * F;
float denominator = max(4.0 * NdotV * NdotL, 0.001);
vec3 specular = numerator / denominator;

vec3 kS = F;
vec3 kD = (vec3(1.0) - kS) * (1.0 - metallic);
vec3 diffuse = kD * baseColor / PI;

vec3 Lo = (diffuse + specular) * radiance * NdotL;
```

这里有几个实现细节：

- `roughness` 通常需要 clamp 到一个很小的下限，避免完美镜面导致数值不稳定。
- `NdotV` 和 `NdotL` 接近 0 时，分母需要保护。
- 点光源的 `1 / distance^2` 衰减更符合物理，但实际项目常会加范围裁剪和艺术控制。
- 所有参与光照的颜色应在线性空间中。
- 最终输出到屏幕前需要 tone mapping 和 gamma correction。

## PBR 为什么依赖 HDR

PBR 与 HDR 管线关系很紧。现实光照强度跨度很大，太阳、天空、室内灯、霓虹灯、反射高光不可能都被压在 $[0,1]$ 里。如果过早 clamp 到 LDR，很多信息会丢失。

比如亮度 2、8、20 的区域，在 LDR clamp 后都可能变成 1。此时 bloom 不再知道谁更亮，tone mapping 也无法进行合理压缩。PBR 材质在这种环境下会变得平，金属反射和高光层次都被破坏。

典型流程是：

1. 在线性 HDR 空间累积直接光和间接光。
2. 在 HDR 空间做 bloom、曝光、tone mapping 等处理。
3. 最后转换到显示设备需要的 sRGB 或显示空间。

常见 tone mapping 公式如 Reinhard：

$$
color_{mapped} = \frac{color}{color+1}
$$

或者曝光形式：

$$
color_{mapped} = 1 - e^{-color \cdot exposure}
$$

这些公式的作用不是简单“压暗”，而是把高动态范围映射到显示器可表达范围，同时尽量保留暗部、中间调和高光层次。

## IBL：环境光如何进入 PBR

如果只有直接光，PBR 材质会显得不完整。真实物体不仅被灯照亮，也被天空、墙面、地面和周围物体反射来的光照亮。IBL，Image Based Lighting，就是用环境贴图近似这些来自许多方向的光。

IBL 通常拆成 diffuse IBL 和 specular IBL。

### Diffuse irradiance

漫反射只依赖表面法线方向，不太依赖观察方向。可以把环境 cubemap 对半球卷积，生成 irradiance map：

$$
L_{diffuse}^{IBL}(n) =
\int_{\Omega} L_i(\omega_i)(n\cdot\omega_i)d\omega_i
$$

运行时只需要用法线方向采样 irradiance map：

$$
diffuseIBL \approx irradiance(n) \cdot \frac{baseColor}{\pi}
$$

由于漫反射是低频结果，irradiance map 可以很模糊，分辨率也不需要很高。

### Specular prefilter

镜面环境光更复杂。它不仅依赖法线，还依赖观察方向和 roughness。低 roughness 的金属需要清晰反射，高 roughness 的材质需要模糊反射。

实时渲染常用预过滤环境贴图：

- roughness 低时采样较清晰的 mip。
- roughness 高时采样更模糊的 mip。

反射方向为：

$$
R = reflect(-V, N)
$$

运行时可以写成：

```glsl
vec3 R = reflect(-V, N);
vec3 prefilteredColor = textureLod(prefilterMap, R, roughness * maxMipLevel).rgb;
```

### BRDF LUT

Cook-Torrance specular 的 IBL 积分仍然复杂。常见做法是 split-sum approximation，把环境贴图预过滤和 BRDF 积分拆开。BRDF 中和 $NdotV$、roughness 相关的部分可以预计算到一张 2D LUT 中。

最终常见形式是：

$$
specularIBL \approx prefilteredColor(R, roughness) \cdot (F \cdot brdf.x + brdf.y)
$$

这就是许多引擎中 `prefilterMap + brdfLUT` 的来源。它不是随便查两张图，而是在用预计算近似渲染方程中的环境镜面反射积分。

## 法线贴图与切线空间

PBR 材质通常高度依赖 normal map。它可以在不增加几何细分的情况下改变局部法线，影响 diffuse 和 specular 的方向计算。

Normal map 一般存储在 tangent space 中。采样后需要从 $[0,1]$ 还原到 $[-1,1]$：

```glsl
vec3 tangentNormal = texture(normalMap, uv).xyz * 2.0 - 1.0;
```

然后用 TBN 矩阵转换到 world space 或 view space：

```glsl
vec3 N = normalize(TBN * tangentNormal);
```

如果 TBN 错误，会出现非常隐蔽的问题：

- 高光方向跟贴图纹理对不上。
- 左右翻转或接缝处明暗突变。
- 法线细节随着模型旋转出现异常。

因此 PBR 的“材质正确”不仅是 BRDF 正确，还包括顶点切线、UV、normal map 编码和空间转换都正确。

## AO 应该影响什么

Ambient Occlusion 描述的是局部几何对环境光的遮挡。它适合用来衰减 indirect diffuse 或 ambient 项，但不应该粗暴乘到所有光照上。

如果 AO 直接乘到 direct light 和 specular 上，会出现几个问题：

- 强光照到凹槽时也被不合理压黑。
- 金属高光被 AO 贴图压掉，看起来像脏污贴图。
- 室外阳光下材质显得沉闷。

更合理的做法是让 AO 主要影响环境光：

```glsl
vec3 ambient = (diffuseIBL + specularIBL) * ao;
vec3 color = ambient + directLighting;
```

实际项目中也可能对 specular AO 做单独近似，但这通常比简单 `finalColor *= ao` 更细致。

## Gamma、sRGB 与线性空间

PBR 的很多错误最后都能追到颜色空间。

显示器响应大致不是线性的，sRGB 图片也通常不是线性编码。如果直接在 sRGB 值上做光照乘法和加法，结果会偏暗或对比异常。正确流程通常是：

1. BaseColor 从 sRGB 解码到线性空间。
2. Metallic、roughness、AO、normal 按线性数据读取。
3. 在线性空间做所有光照计算。
4. HDR tone mapping。
5. 输出到 sRGB。

Gamma correction 可以写成：

$$
color_{srgb} = color_{linear}^{1/2.2}
$$

但在现代 API 或引擎里，常会通过 sRGB texture format 和 sRGB framebuffer 自动完成一部分转换。关键是要清楚哪些贴图是颜色，哪些贴图是数据。

## PBR 贴图制作中的数值直觉

一些常见经验：

- 纯黑 baseColor 很少见，因为现实材料通常仍会反射一些光。
- 非金属 baseColor 不应该过亮，否则在强光下容易过曝。
- 非金属 metallic 应接近 0，金属区域应接近 1。
- 中间 metallic 值通常表示混合、污垢、氧化层或贴图过渡，不应该大面积滥用。
- roughness 贴图比 specular 强度更能塑造材质层次。
- 金属的 baseColor 可以有明显颜色，如铜、金、铝的反射色不同。
- 非金属 specular 通常比较低，并且不强烈带色。

如果一个材质在某个环境下看起来“对”，换到另一个 HDRI 下就崩，通常说明参数不是物理意义上的材质参数，而是在给某个灯光条件做特化。

## PBR 调试时应该看哪些 buffer

调 PBR 不应该只看最终画面。更可靠的方法是拆开看中间量：

- BaseColor：确认 sRGB 解码是否正确，颜色是否过亮或过暗。
- Metallic：确认金属/非金属区域是否干净。
- Roughness：确认高光范围是否由 roughness 控制，而不是贴图被 gamma 破坏。
- Normal：确认法线方向、TBN、Y 通道方向是否正确。
- NdotL / NdotV：确认法线和方向向量是否在同一空间。
- Specular：确认金属是否有带色高光，非金属是否不过强。
- Diffuse：确认金属区域是否基本没有 diffuse。
- IBL diffuse/specular：确认环境光是否过强或过弱。
- Tone mapped color：确认 HDR 到 LDR 的映射是否压掉层次。

如果只看 final color，很容易把 shader 错误误认为贴图错误，或者把颜色空间问题误认为 roughness 问题。

## 常见误区

### 把 roughness 当成高光强度

Roughness 控制的是微表面法线分布。高 roughness 会让高光变宽、峰值降低，但它不是直接削弱 specular 的强度滑块。

### 金属仍然保留强 diffuse

金属的 baseColor 主要进入 specular $F_0$。如果金属仍然有强 diffuse，它通常会看起来像有金属光泽的塑料。

### AO 乘到全部光照

AO 主要描述环境遮蔽。把 AO 直接乘到 direct lighting 会让阳光和高光都被压黑。

### 忽略数据贴图的颜色空间

Roughness、metallic、AO、normal 都是数据贴图。它们不应该被 sRGB 解码，否则数值会整体漂移。

### 忘记 tone mapping

PBR 需要 HDR。没有 tone mapping 的 HDR 值直接输出到 LDR 会被截断，材质层次会丢失。

### 只在一个光照环境下调材质

PBR 材质应该能在多个环境下保持材料感。只在一盏灯下调出来的材质，很可能是“画面参数”，不是“材质参数”。

## 与 Blinn-Phong 的区别

Blinn-Phong 并非不能用，它很适合教学和轻量效果。但它和 PBR 的目标不同。

Blinn-Phong 通常写成：

$$
specular = k_s \max(n \cdot h, 0)^{shininess}
$$

它可以控制高光大小，却没有完整描述能量守恒、Fresnel、微表面遮蔽和环境积分。PBR 的 Cook-Torrance 则把这些因素拆开：

$$
specular = \frac{DGF}{4(n\cdot l)(n\cdot v)}
$$

因此 PBR 参数更适合跨环境复用。美术调 roughness，不是在调一个指数，而是在调微表面分布；调 metallic，也不是简单调颜色，而是在改变 diffuse/specular 的能量分配。

## 在游戏引擎中的落地

实际引擎的 PBR 通常还会加入许多工程处理：

- 多光源裁剪：clustered lighting、tiled deferred、forward+。
- 阴影：shadow map、PCF、VSM、ray traced shadow。
- 反射：SSR、reflection probe、planar reflection、ray tracing。
- GI：lightmap、irradiance volume、DDGI、Lumen 类系统。
- 材质分层：clear coat、sheen、subsurface、anisotropy。
- 性能优化：LUT、预积分、贴图压缩、mip bias、分支裁剪。

这些扩展不会改变 PBR 的核心原则，但会让引擎材质更接近真实生产需求。例如汽车漆可能需要 clear coat，布料可能需要 sheen，头发和拉丝金属可能需要 anisotropy，皮肤可能需要 subsurface scattering。

所以学习 PBR 时，可以先掌握基础 metallic-roughness，再逐步理解这些材质扩展是如何在基础 BRDF 上增加新 lobe 或新近似的。

## 一个最小 PBR mental model

可以把 PBR 理解成下面这条链：

1. 光从某个方向到达表面。
2. 法线和入射方向决定入射能量的有效面积。
3. Fresnel 决定有多少能量直接发生镜面反射。
4. 剩余能量中，非金属部分进入材质内部形成漫反射。
5. Roughness 通过微表面分布决定镜面反射被摊得多宽。
6. Geometry 项处理微表面之间的遮蔽。
7. 直接光逐个累积，环境光通过 IBL 近似半球积分。
8. HDR 结果经过 tone mapping 和 gamma correction 显示到屏幕。

这个 mental model 比背公式更重要。公式只是把这些直觉固定成可以运行的代码。

## 小结

PBR 的价值不在于让 shader 变复杂，而在于让材质和光照变得一致。它用渲染方程说明光照积分的目标，用 BRDF 描述材质如何反射光，用 Cook-Torrance 微表面模型处理镜面反射，用 Fresnel 表达角度相关反射，用 Geometry 项近似微表面遮蔽，用能量守恒约束 diffuse 和 specular 的关系，再通过 metallic-roughness 工作流把这些理论变成可制作、可交换、可调试的材质参数。

如果后续继续深入，可以沿着几条线展开：

- 从直接光 PBR shader 写到完整 IBL。
- 从 metallic-roughness 扩展到 clear coat、sheen、anisotropy。
- 从单一材质球扩展到延迟渲染、forward+ 和多光源管理。
- 从 BRDF 扩展到 BTDF、subsurface scattering 和 participating media。

理解 PBR 的关键，不是记住某一份 shader，而是始终追问：这一步在处理哪一部分能量？在哪个空间计算？输入贴图是什么语义？有没有破坏能量守恒？如果这些问题能回答清楚，PBR 就不再是一串公式，而是一套可以持续扩展的渲染思维。

## 参考资料

- LearnOpenGL: [PBR Theory](https://learnopengl.com/PBR/Theory)
- Khronos glTF 2.0: [Metallic-Roughness Material](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#metallic-roughness-material)
- Brian Karis: [Real Shading in Unreal Engine 4](https://cdn2.unrealengine.com/Resources/files/2013SiggraphPresentationsNotes-26915738.pdf)
- Brent Burley: [Physically-Based Shading at Disney](https://disneyanimation.com/publications/physically-based-shading-at-disney/)
