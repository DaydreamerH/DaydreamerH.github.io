---
title: "StylizedRenderer 第四阶段：MToon 材质、编辑器与 Sidecar 工作流"
description: "解析第四阶段的模块目录重组、MToon 参数模型、法线与纹理导入、运行时材质绑定、卡通光照组成、组件调试视图，以及材质 Sidecar 的保存和加载流程。"
date: "2026-08-11"
category: "图形与高性能计算"
track: "Rendering / Engine Architecture"
level: advanced
status: ready
published: true
minutes: 70
order: 0
prerequisites: ["StylizedRenderer 阶段一至三", "现代 OpenGL 基础", "切线空间与纹理采样基础", "实时光照基础"]
tags: ["C++", "OpenGL", "Rendering", "MToon", "Stylized Rendering", "Material Editor", "JSON"]
photos: "banner.png"
source: "StylizedRenderer development notes"
---

前三个阶段已经建立从模型资产到多 Pass HDR 输出的完整路径，但表面着色仍以 Unlit、法线调试和基础 PBR 为主。第四阶段沿用既有的 `RenderWorld → FramePipeline → ForwardOpaquePass` 框架，在材质层加入 MToon：同一个模型可以使用分段明暗、法线贴图、半球环境光、MatCap、边缘光和自发光形成风格化结果，并通过 Viewer 直接编辑每个导入材质。

MToon 被实现为新的 `MaterialKind`，继续使用 `MaterialTemplate`、`MaterialInstance`、`RuntimeMaterial` 和 `RuntimeResourceCache`。参数、纹理、运行时绑定、交互编辑和磁盘持久化分别进入对应模块，使 MToon 可以直接复用现有模型绘制与多 Pass 渲染框架。

~~~text
Model / Texture Files
  → ModelImporter / TextureImporter
  → MaterialAsset + TextureAsset
  → MaterialInstance<MToonMaterialParameters>
  → RuntimeResourceCache
  → RuntimeMaterial::bind
  → StaticModelRenderer
  → MToon Shader
  → HDR Forward Target

ViewerPanels
  ↔ editable MaterialInstance
  ↔ MToonMaterialSidecar (.mtoon.json)
~~~

## 系统结构调整

Graphics、Render 与 Viewer 按照资源所有权和执行职责重新组织目录，使设备接口、运行时资源、逐帧数据、渲染 Pass 和工具界面各自形成清晰模块：

~~~text
graphics/
├── device/
│   ├── GraphicsDevice
│   ├── GraphicsCommands
│   ├── GraphicsTypes
│   └── OpenGLContext
└── resources/
    ├── Buffer / VertexArray
    ├── Texture2D / RenderTexture / DepthTexture
    ├── Framebuffer / ShaderProgram
    └── GpuTimerQuery

render/
├── pipeline/   FrameContext / IRenderPass / FramePipeline
├── passes/     ShadowPass / ForwardOpaquePass / PostProcessPass
├── renderers/  StaticModelRenderer
├── resources/  RuntimeMesh / RuntimeMaterial / RuntimeResourceCache
└── world/      RenderWorld / RenderExtractor

viewer/
├── camera/     OrbitCameraController
└── ui/         ViewerPanels / ImGui backend
~~~

`GraphicsDevice` 与 `GraphicsTypes` 表达图形 API 入口，`resources` 保存有所有权的 GPU 对象；Render Pipeline 负责编排 Pass，Renderer 负责提交一类绘制，Render Resources 连接 Asset 与 GPU，Render World 则保存当前帧的扁平视图。这样的目录结构与前三阶段形成的职责一致，只是把原本位于同级目录的类型按照用途显式分组。

MToon 材质工作流涉及的主要类型如下：

| 层级 | 类型 | 职责 |
| --- | --- | --- |
| Asset | `MaterialAsset` | 保存导入的 Base Color、Normal Texture 与 Normal Scale |
| Importer | `TextureImporter` | 从独立图片创建指定颜色空间的 TextureAsset |
| Material | `MToonMaterialParameters` | 保存 MToon 标量、颜色和纹理 Handle |
| Material | `MToonMaterialSidecar` | 表示可持久化的材质记录与相对纹理路径 |
| Material | `MToonMaterialSidecarSerializer` | 校验 JSON、读写文件并报告字段级错误 |
| Runtime | `MaterialInstance` | 持有可编辑的 MToon 参数实例 |
| Runtime | `RuntimeMaterial` | 绑定 MToon Uniform 与 8 个纹理槽 |
| Runtime | `RuntimeResourceCache` | 缓存可编辑实例并提供语义化兜底纹理 |
| Render | `EnvironmentLightData` | 向 MToon 提供天空/地面半球环境光 |
| Render | `MToonDebugView` | 选择最终结果或单独输出某个着色分量 |
| Viewer | `ViewerPanels` | 选择材质、编辑参数、重置以及保存/加载 Sidecar |

## MaterialAsset：导入法线数据

`MaterialAsset` 仍然是与图形 API 无关的 CPU 资产。第四阶段新增两个字段：

~~~cpp
AssetHandle<TextureAsset> normalTexture;
float normalScale = 1.0F;
~~~

Base Color Texture 表示颜色，采样前需要从 sRGB 解码到线性空间；Normal Texture 表示方向数据，必须保持线性。即使两张贴图引用同一图片路径，Importer 也不能只按路径合并，因为它们需要不同的颜色空间和预处理语义。

Assimp 材质导入器因此引入 `ImportedTextureSemantic`，并把纹理缓存键写成：

~~~text
color:<texture path>
normal:<texture path>
~~~

颜色纹理以 `ColorSpace::Srgb` 注册，法线纹理以 `ColorSpace::Linear` 注册。`normalScale` 从 glTF Normal Texture Scale 读取，并限制为非负值。后续 `MaterialInstance` 创建 MToon 参数时，会把这两个字段复制到 `normalTexture` 与 `normalScale`。

### glTF UV 与切线手性的对齐

模型导入一直包含一次纹理垂直翻转，用于协调图片行方向与 OpenGL UV 约定。Base Color 只受 UV 位置影响，而 Normal Map 还依赖 Tangent、Bitangent 与 Normal 构成的 TBN 坐标系；只翻转图片或 UV 而不调整切线手性，会让法线的 Y 方向反转，凹凸看起来内外颠倒。

第四阶段将 Assimp 处理拆成两个步骤：先读取原始 Scene，对 glTF/GLB 中已有的 Bitangent 取反，再执行 Assimp Post Processing。Normal Map 的绿色通道也在导入时执行 `G = 255 - G`。这两项处理共同对齐当前 UV 翻转约定与切线空间方向。

这类修正集中在 Importer。`TextureAsset` 和顶点 Tangent 进入 Runtime 层后，Shader 便可以按统一约定构造 TBN，无需根据文件扩展名再次判断方向。

## TextureImporter：导入 Sidecar 外部纹理

模型导入器能够处理 glTF 内嵌和外部纹理，但 Sidecar 中的 Shade、MatCap、Rim Mask 或 Emission 可能并不属于原模型。`TextureImporter` 为这些独立图片提供统一入口：

~~~cpp
TextureImporter importer{assetRegistry};

auto texture = importer.import(
    imagePath,
    ColorSpace::Linear);
~~~

`import()` 依次验证路径非空、文件存在且为普通文件，调用已有图片解码函数生成 `TextureAsset`，写入调用方指定的颜色空间，最后注册到 `AssetRegistry`。失败时返回空 Handle，不会向 Registry 留下半初始化资产。

颜色空间由纹理用途决定：

| 通道 | 颜色空间 | 原因 |
| --- | --- | --- |
| Base Color | sRGB | 保存视觉颜色，采样时需要解码 |
| Shade | sRGB | 保存阴影侧表面颜色 |
| Normal | Linear | 保存方向分量 |
| Shading Shift | Linear | 保存控制标量 |
| MatCap | sRGB | 保存附加视觉颜色 |
| Rim Mask | Linear | 保存强度遮罩 |
| Emission | sRGB | 保存自发光颜色 |

## MToonMaterialParameters：组织材质实例

`MaterialKind` 新增 `MToon`，`MaterialInstance` 则新增：

~~~cpp
std::optional<MToonMaterialParameters> mtoonParameters;
~~~

使用 `optional` 而不是让所有材质实例都包含一套 MToon 参数，能够表达参数块是否与当前模板匹配。`makeMaterialInstance()` 只有在 Kind 为 MToon 时才 `emplace()` 参数；`RuntimeMaterial::bind()` 也会验证参数存在。模板与参数块不一致时，绑定直接失败。

`MToonMaterialParameters` 将数值参数与纹理引用分开：

~~~text
MToonMaterialParameters
├── Shade
│   ├── shadeColor
│   ├── shadingShift
│   ├── shadingShiftTextureScale
│   └── shadingToony
├── Normal
│   └── normalScale
├── GI
│   └── giEqualization
├── MatCap
│   ├── matcapColor
│   └── matcapStrength
├── Rim
│   ├── rimColor
│   ├── rimFresnelPower
│   ├── rimLift
│   └── rimLightingMix
├── Emission
│   ├── emissionColor
│   └── emissionStrength
└── textures
    ├── shade / normal / shadingShift
    ├── matcap / rimMask / emission
    └── Base Color 仍位于 MaterialInstance
~~~

由模型资产创建 MToon Instance 时，Base Color 沿用源材质；默认 Shade Color 为 Base Color 的 45%，Shade Texture 暂时复用 Base Color Texture；Normal Texture 与 Normal Scale 则直接沿用导入值。其余效果使用保守默认值：MatCap 和 Rim 默认无贡献，Emission 由黑色兜底纹理关闭。

这种初始化策略使普通 glTF 材质切换到 MToon 后立即可见，同时不会凭空加入强烈的边缘光或 MatCap。之后再由 Viewer 对具体材质进行调整。

## RuntimeResourceCache：让材质实例可编辑

第三阶段中，`getOrCreateMaterialInstance()` 返回 `const MaterialInstance*`。第四阶段的材质编辑器需要直接修改缓存实例，因此返回值改为可写指针：

~~~cpp
MaterialInstance* instance = cache.getOrCreateMaterialInstance(
    materialHandle,
    mtoonTemplateHandle,
    assets);
~~~

缓存键仍然是 `{materialId, templateId}`。一个 MaterialAsset 可以同时拥有 Unlit、PBR 和 MToon 实例；Viewer 对 MToon 参数的修改不会污染其他模板实例，也不会修改原始 MaterialAsset。

`resetMaterialInstance()` 使用同一 Material Asset 与 Template 重新调用 `makeMaterialInstance()`，再覆盖缓存中的现有实例。重置的是运行时编辑状态，源模型资产和纹理资产不变。

### 语义化兜底纹理

MToon 需要七类纹理。要求每个材质都提供全部图片会让最小材质难以使用，因此 Cache 新增黑色和中性法线纹理，与已有白色、错误纹理组成四种兜底资源：

| 纹理 | 像素值 | 用途 |
| --- | --- | --- |
| White | `(1,1,1,1)` | Base、Shade、Rim Mask 的乘法单位元 |
| Black | `(0,0,0,1)` | Shift、MatCap、Emission 的零贡献 |
| Neutral Normal | 编码后的 `(0,0,1)` | 不改变几何法线 |
| Error | 黑紫棋盘 | Handle 存在但资产无效或上传失败 |

兜底值按公式选择，而不是所有缺失纹理都返回白色。例如缺失 Emission 若返回白色，会让非自发光材质凭空发亮；缺失 Shading Shift 若返回白色，会把明暗分界整体偏移；缺失 Rim Mask 使用白色，则表示不额外遮蔽由颜色和 Fresnel 参数定义的边缘光。

## RuntimeMaterial：绑定八个纹理槽

MToon Runtime Material 初始化 Shader 后固定 Sampler 槽位：

~~~text
slot 0  Base Color
slot 1  Shadow Map
slot 2  Normal
slot 3  Shade
slot 4  Shading Shift
slot 5  MatCap
slot 6  Rim Mask
slot 7  Emission
~~~

slot 1 仍由 `StaticModelRenderer` 在 Shadow Map 有效时绑定；其余材质纹理由 `RuntimeMaterial::bind()` 解析。Bind 先取得所有 Texture2D，验证每个资源有效，再上传颜色与标量 Uniform，最后绑定纹理。任何步骤失败都不会提交当前 Draw Call。

这种职责分配与前三阶段保持一致：Runtime Material 处理实例级参数，StaticModelRenderer 处理 View、Light、Shadow 等逐帧参数。MToon 增加的 `uView`、环境光和 Debug View 因此由 Renderer 设置，而不是塞进每个 Material Instance。

## 顶点 Shader：构造稳定的世界空间切线

MToon Normal Mapping 要求顶点 Shader 额外输出 `vertexWorldTangent`。Normal 使用逆转置矩阵，Tangent 使用 Model Matrix 的 3×3 部分，再通过 Gram-Schmidt 从 Tangent 中去掉沿 Normal 的分量：

~~~text
T' = M · T
T  = normalize(T' - N dot(N, T'))
~~~

非均匀缩放后，直接变换得到的 Tangent 不一定与 Normal 正交。重新正交化能够保证 TBN 基底用于方向变换时不会引入额外倾斜。

若输入 Tangent 退化，Shader 根据 Normal 选择一个不平行的参考轴，通过叉积重建 Tangent。`inTangent.w` 保存 Bitangent 的手性符号，片元 Shader 使用：

~~~text
B = cross(N, T) × tangentSign
~~~

这样镜像 UV 岛可以使用相反手性的切线空间，而不需要额外传输完整 Bitangent。

## MToon Shader：组合风格化光照

MToon 片元结果由五部分相加：

~~~text
finalColor = directColor
           + indirectColor
           + matcapContribution
           + rimContribution
           + emissionContribution
~~~

与 PBR 不同，这里不追求微表面能量守恒，而是提供艺术可控的明暗分区与附加光照分量。每一部分都有独立参数和调试视图。

### Normal Mapping 与双面法线

`calculateSurfaceNormal()` 先根据 `gl_FrontFacing` 决定几何法线方向。背面使用负法线，使双面几何在背面观察时仍得到朝向观察侧的表面基底。随后重新正交化 Tangent，结合 Handedness 构造 TBN。

Normal Texture 只读取 XY：

~~~text
xy = texture(normalMap).xy × 2 - 1
xy = xy × normalScale
z  = sqrt(max(1 - dot(xy, xy), 0))
~~~

Z 由单位半球约束重建，再归一化并乘以 TBN 转到世界空间。只缩放 XY 可以控制法线扰动强度，同时保持 Z 与单位长度一致；若直接把采样 Z 与缩放后的 XY 拼接，Normal Scale 变化时方向分布会失真。

### Base、Shade 与明暗分界

方向光强度先计算 `N·L`。MToon 不把它直接作为连续 Lambert 亮度，而是通过 Shift 与 Toony 控制分区：

~~~text
finalShift = shadingShift
           + shiftTexture.r × shadingShiftTextureScale

transitionWidth = max(1 - shadingToony, 0.0001)

shadingFactor = clamp(
    (N·L + finalShift) / transitionWidth,
    0,
    1)
~~~

`shadingShift` 移动明暗边界；Shift Texture 允许按区域局部移动边界；`shadingToony` 越接近 1，Transition Width 越窄，Base 与 Shade 之间越接近硬切。较低值则产生更宽的过渡带。

Base Surface Color 来自 Base Texture 与 Base Color Factor。Shade Surface Color 来自 Shade Texture 与 Shade Color。二者分别乘方向光 Radiance，再按 `shadingFactor` 插值。因此 Shade 不是简单把 Base 变暗，而是可以拥有独立色相与图案。

### 阴影接收

MToon 复用第三阶段的 Directional Shadow Map、斜率相关 Bias 与 `3×3 PCF`。不同之处是 Shadow Visibility 乘在 Shading Factor 上：

~~~text
visibleShadingFactor = shadingFactor × shadowVisibility
directColor = mix(shadeColor, litColor, visibleShadingFactor)
~~~

被 Shadow Map 遮挡时，明面权重下降，颜色转向 Shade，而不是在最终颜色上简单乘黑。这种方式更符合 Toon 材质的两段式控制：投影区域仍保留由 Shade Color 定义的可读颜色。

### 半球环境光与 GI Equalization

`EnvironmentLightData` 保存 Sky Color、Ground Color 与 Intensity。Shader 根据世界法线 Y 分量计算半球权重：

~~~text
hemisphereWeight = normal.y × 0.5 + 0.5
directionalEnvironment = mix(ground, sky, hemisphereWeight)
uniformEnvironment = (sky + ground) × 0.5
environment = mix(
    directionalEnvironment,
    uniformEnvironment,
    giEqualization) × intensity
~~~

`giEqualization = 0` 时，朝上的表面偏向天空色，朝下的表面偏向地面色；接近 1 时，方向差异被压平为均匀环境光。它控制环境光对模型朝向的敏感度，减少复杂法线导致的零碎明暗，同时保留整体可读性。

### MatCap

MatCap 使用 View Space Normal 的 XY 映射纹理坐标：

~~~text
viewNormal = normalize(mat3(view) × worldNormal)
matcapUv = viewNormal.xy × 0.5 + 0.5
matcap = texture(matcapTexture, matcapUv)
       × matcapColor
       × matcapStrength
~~~

纹理看起来像包裹在相机周围的球面光照，其方向随观察坐标系保持稳定。MatCap 不依赖方向光位置，适合加入高光、材质质感或手绘明暗，但它是附加颜色而不是物理 BRDF。

### Rim Lighting

边缘光使用视线与法线夹角：

~~~text
rimBase = clamp(1 - N·V + rimLift, 0, 1)
rimFactor = pow(rimBase, rimFresnelPower)
~~~

`rimLift` 调整边缘光出现阈值，`rimFresnelPower` 控制轮廓宽度与集中程度，Rim Mask 则按 UV 局部抑制效果。`rimLightingMix` 在常量白光和受方向光/阴影影响的 Rim 之间插值：0 表示不受场景主光控制，1 表示边缘光随当前可见明面衰减。

### Emission

自发光由 Emission Texture、Emission Color 和非负 Strength 相乘：

~~~text
emission = texture(emissionTexture)
         × emissionColor
         × emissionStrength
~~~

它不乘方向光、环境光或阴影可见度，直接加入 HDR 输出。Strength 大于 1 时可以产生超过显示范围的颜色，后续由 Tone Mapping 处理，也为未来 Bloom 提供亮部来源。

## MToonDebugView：拆分着色结果

最终画面很难直接判断颜色来自 Shade、Rim、MatCap 还是 Emission。`MToonDebugView` 因此进入 `RenderView`，由 `StaticModelRenderer` 设置到 `uMToonDebugView`：

| 模式 | 输出 |
| --- | --- |
| Final | 所有分量相加 |
| Base | Base Color |
| Shade | Shade Surface Color |
| Lighting | `visibleShadingFactor` 灰度 |
| Rim | Rim Contribution |
| MatCap | MatCap Contribution |
| Emission | Emission Contribution |

Debug View 是视图级状态，不属于某个材质。切换后所有 MToon Draw Call 使用同一种分量输出，便于比较多个材质在相同光照下的响应。

`Lighting` 模式尤其适合检查 Shift、Toony、Normal Map 和 Shadow Map，因为这些因素最终都会进入 `visibleShadingFactor`。若 Lighting 分区正确而最终颜色异常，问题更可能位于 Base/Shade 颜色或附加分量。

## StaticModelRenderer：补充 MToon 视图参数

`StaticModelRenderer` 将 Basic PBR 与 MToon 共享的 Camera、Directional Light 和 Shadow Uniform 放在同一分支中。MToon 再额外绑定：

- View Matrix，用于 MatCap 的 View Space Normal；
- Sky/Ground Environment Color 与 Intensity；
- 当前 `MToonDebugView`。

每个 RenderItem 仍先调用 `RuntimeMaterial::bind()` 绑定实例参数，然后上传 World、Normal、View 与 Light 参数，最后构造 `DrawIndexedCommand`。MToon 没有绕开 `ForwardOpaquePass`，输出继续写入 `RGBA16F` HDR Color，之后经过统一的 Exposure、Tone Mapping 与 Gamma Correction。

## ViewerPanels：从渲染诊断扩展为材质编辑器

Viewer 原有面板只显示渲染统计和全局开关。第四阶段让 `ViewerPanels::draw()` 接收可写的 `AssetRegistry`、`RuntimeResourceCache`、当前 Material Template 与 `RenderWorld`，从而能够选择并修改缓存中的 MToon Instance。

### 收集与选择材质

面板遍历 SceneAsset 引用的 Mesh，再遍历 Mesh Primitive，收集去重后的 Material Handle。`selectedMaterial_` 保存当前选项；组合框显示 MaterialAsset Name。编辑目标是源材质与当前 MToon Template 组成的缓存实例，而不是所有使用同名 Shader 的物体。

编辑粒度与导入模型的材质分配一致：多个 Primitive 引用同一个 Material Handle 时会共享编辑结果，引用不同材质时可以分别调整。

### 参数分组

MToon 控件按计算阶段组织：

- Base / Shade：Base Color、Shade Color、Shift、Shift Scale、Toony 及纹理状态；
- Normal：Normal Scale 与 Normal Texture；
- GI：GI Equalization；
- MatCap：Color、Strength 与 Texture；
- Rim：Color、Power、Lift、Lighting Mix 与 Mask；
- Emission：Color、Strength 与 Texture。

面板直接修改 `MaterialInstance`，下一次 Draw Call 的 `RuntimeMaterial::bind()` 会读取新值，因此调节无需重新导入模型、重新编译 Shader 或重建 Pipeline。

纹理状态会显示资产来源路径；空 Handle 显示实际使用的 White、Black 或 Neutral Normal Fallback；非空但 Registry 查询失败则显示错误状态。第四阶段的界面主要编辑数值并观察已有纹理，Sidecar 加载负责把外部纹理路径恢复成新的 TextureAsset。

### 重置与输入捕获

“Reset Selected Material”调用 `RuntimeResourceCache::resetMaterialInstance()`，以源 MaterialAsset 重新生成当前 MToon Instance。它可以撤销本次运行中的参数编辑和 Sidecar 覆盖。

`ViewerPanels::wantsMouseCapture()` 返回 ImGui 的 `WantCaptureMouse`。Orbit Camera 在 UI 捕获鼠标时停止旋转、平移和缩放，避免拖动 Slider 或操作 Combo 时同时改变相机。这属于 Viewer 输入路由，而不是 Camera 类内部对 ImGui 的依赖。

## MToon Sidecar：保存模型之外的材质编辑

运行时 MaterialInstance 不属于模型文件，关闭 Viewer 后会消失。第四阶段使用与模型并列的 JSON Sidecar 保存 MToon 编辑结果：

~~~text
character.glb
character.mtoon.json
textures/
├── shade.png
├── normal.png
├── matcap.png
└── emission.png
~~~

Sidecar 路径由模型路径替换扩展名得到。文件根对象包含版本和材质数组：

~~~json
{
  "version": 1,
  "materials": [
    {
      "name": "Face",
      "baseColorFactor": [1.0, 1.0, 1.0, 1.0],
      "shadeColor": [0.45, 0.40, 0.40],
      "shadingShift": 0.0,
      "shadingShiftTextureScale": 1.0,
      "shadingToony": 0.9,
      "normalScale": 1.0,
      "giEqualization": 0.9,
      "matcapColor": [1.0, 1.0, 1.0],
      "matcapStrength": 0.0,
      "rimColor": [0.0, 0.0, 0.0],
      "rimFresnelPower": 5.0,
      "rimLift": 0.0,
      "rimLightingMix": 1.0,
      "emissionColor": [0.0, 0.0, 0.0],
      "emissionStrength": 1.0,
      "textures": {
        "baseColor": "textures/base.png",
        "shade": "textures/shade.png",
        "normal": "textures/normal.png",
        "shadingShift": "",
        "matcap": "textures/matcap.png",
        "rimMask": "",
        "emission": "textures/emission.png"
      }
    }
  ]
}
~~~

### MToonMaterialSidecar 与运行时实例的区别

`MToonSidecarMaterial` 不保存 Asset Handle，因为 Handle 只在一次运行的 `AssetRegistry` 中有效。它保存普通数值和文件路径；Capture 阶段把 Handle 解析为相对路径，Apply 阶段再通过 TextureImporter 将路径转换为新的 Handle。

纹理路径必须相对 Sidecar 目录。绝对路径会被 Serializer 拒绝，避免配置文件绑定某台机器的盘符或用户目录。保存时，TextureAsset 必须具有 Source Path，无法追溯来源的程序生成纹理不能直接写成 Sidecar 路径。

### Serializer 的验证规则

`MToonMaterialSidecarSerializer` 使用 nlohmann/json，但不会把 JSON 对象直接反序列化进结构体。它逐字段检查：

- Root 必须为 Object；
- Version 必须为无符号整数且等于当前版本 1；
- Materials 必须为 Array；
- Material Name 必须存在、非空且不能重复；
- 向量必须拥有正确分量数，标量和分量必须为有限数；
- 参数根据语义限制到允许范围；
- Texture Path 必须为字符串、为空或相对路径。

`MToonSidecarError` 保存 `material`、`field` 和 `message`。Viewer 可以显示“哪个材质的哪个字段为什么失败”，而不是只返回一个无法定位的 JSON Parse Error。

### 保存：临时文件与备份替换

`saveMToonSidecarFile()` 先序列化到字符串，再写入 `<path>.tmp`。若目标文件已经存在，先重命名为 `<path>.bak`，随后把临时文件重命名为正式路径；替换失败时尝试恢复备份。

~~~text
serialize
  → write .tmp
  → old file rename to .bak
  → .tmp rename to target
  → success: remove .bak
  → failure: restore .bak
~~~

这种流程避免程序在写入一半时留下截断 JSON。它不是跨所有文件系统都绝对原子的数据库事务，但比直接覆盖目标文件具有更可靠的失败恢复能力。

### 加载：先验证全部，再统一应用

Viewer 加载 Sidecar 后，按 Material Name 在当前模型中查找对应 Material Handle。每条记录先复制当前 MaterialInstance，在副本上调用 `applyMToonSidecarMaterial()`；纹理路径被解析到 Sidecar 目录，并按语义颜色空间导入。

所有记录都成功后，Viewer 才把 `PendingMaterial` 中的副本移动覆盖到真正实例。若中途出现不存在的材质、非法字段或纹理导入失败，现有实例不会被部分覆盖。这个两阶段应用方式使一次 Load 对材质参数具有整体提交语义。

空纹理路径表示保留当前 Handle，而不是强制清空纹理。相同的已加载 Source Path 会复用现有 Handle，避免每次点击 Load 都重复注册同一图片。

## 一帧中的调用关系

第四阶段没有改变三个 Render Pass 的顺序，变化集中在 Render Extraction 前后的材质数据和 Forward Shader：

~~~mermaid
flowchart TD
    A["ModelImporter"] --> B["MaterialAsset / Normal Texture"]
    B --> C["RuntimeResourceCache"]
    C --> D["MToon MaterialInstance"]
    D --> E["RenderExtractor"]
    E --> F["RenderWorld"]
    F --> G["ShadowPass"]
    G --> H["ForwardOpaquePass"]
    D --> I["RuntimeMaterial::bind"]
    I --> H
    H --> J["MToon Shader"]
    J --> K["HDR Color"]
    K --> L["PostProcessPass"]
    L --> M["Backbuffer"]
    N["ViewerPanels"] --> D
    N <--> O["MToon Sidecar"]
~~~

Viewer 每帧先根据当前 `MaterialKind` 选择 MToon Template，RenderExtractor 为可见 Primitive 取得对应 MaterialInstance 和 RuntimeMaterial。Shadow Pass 仍只消费几何体；Forward Pass 绘制时，RuntimeMaterial 绑定 MToon 实例参数，StaticModelRenderer 再绑定 Camera、Light、Environment、Debug View 与 Shadow Map。

ViewerPanels 在场景完成后绘制。用户本帧修改的参数保存在缓存实例中，下一帧提取仍会取得同一个 `{Material, Template}` Key，因此修改持续生效。切换到其他 MaterialKind 不会删除 MToon Instance；切回 MToon 后可以继续使用先前编辑状态。

## 使用与调试顺序

MToon 材质可以按以下顺序调整，减少多个分量同时变化造成的干扰：

1. 切换到 MToon，选择目标 Material；
2. 使用 Base Debug View 检查 Base Color 与 Base Texture；
3. 使用 Lighting Debug View 调整 Normal Scale、Shading Shift 与 Toony；
4. 切换 Shade View，确定 Shade Color 与 Shade Texture；
5. 调整 GI Equalization，使背光面保持需要的方向感；
6. 分别使用 MatCap、Rim、Emission View 调整附加分量；
7. 回到 Final 检查各分量叠加和 HDR Tone Mapping；
8. 点击 Save Materials 写入 `.mtoon.json`。

常见问题可以按数据层定位：

| 现象 | 检查位置 | 可能原因 |
| --- | --- | --- |
| 法线凹凸方向相反 | Importer / Lighting View | Green Channel 或 Tangent Handedness 不一致 |
| Normal Map 缺失但表面异常 | Neutral Normal Fallback | 空 Handle 没有解析到中性法线 |
| Shade 始终等于 Base | Shade Texture / Color | 默认复用 Base Texture，Shade Color 对比不足 |
| 明暗边界过硬 | Shading Toony | 数值过于接近 1 |
| 阴影区域变黑 | Shade Color | Shade 定义过暗，而不是 Shadow Map 直接乘黑 |
| MatCap 随模型旋转不符合预期 | View Matrix / View Normal | MatCap 本身固定在观察空间 |
| Rim 覆盖整个表面 | Lift / Fresnel Power | Lift 过高或 Power 过低 |
| Sidecar 无法保存 | Texture Source Path | 纹理没有可转换的来源路径 |
| Sidecar 无法加载 | Material Name / Field Error | 当前模型材质名不匹配或 JSON 字段非法 |
| 操作滑块时相机移动 | ImGui Mouse Capture | Viewer 未拦截 UI 捕获状态 |

## 材质工作流的延伸

MToon 已经覆盖 Base/Shade、Normal、Directional Shadow、半球环境光、MatCap、Rim、Emission、分量调试和外部 Sidecar 编辑，并通过 Opaque Forward Pass 进入 HDR 后处理链路。

现有结构可以继续增加 Masked 与 Transparent Pass，并把 Outline、UV Animation、Alpha Cutoff/Blend、Cull Mode、Render Queue 和纹理变换接入材质参数。Sidecar 也可以从材质名称匹配扩展到稳定资产标识，使模型材质重名和改名后的配置迁移更加可靠。

材质由此从模型导入后的静态参数，扩展为可以在运行时选择、编辑、调试、重置并持久化的工作对象。Asset 保存源数据，MaterialInstance 保存模板相关编辑状态，RuntimeMaterial 负责 GPU 绑定，Viewer 负责工具交互，Sidecar 负责跨运行保存。MToon 的各项效果沿着这条职责链进入现有渲染流程，模型导入、逐帧提取和 Frame Pipeline 仍保持各自清晰的功能划分。
