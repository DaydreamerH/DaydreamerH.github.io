---
title: "StylizedRenderer 第三阶段：从单次绘制到多 Pass HDR 渲染管线"
description: "解析第三阶段的材质运行时、RenderWorld 提取、方向光阴影、HDR 前向渲染、后处理与 GPU Pass 诊断，建立可继续扩展的逐帧渲染框架。"
date: "2026-08-08"
category: "图形与高性能计算"
track: "Rendering / Engine Architecture"
level: advanced
status: ready
published: true
minutes: 75
order: 0
prerequisites: ["StylizedRenderer 阶段一与二", "现代 OpenGL 基础", "PBR 与 Shadow Mapping 基础"]
tags: ["C++", "OpenGL", "Rendering", "Frame Pipeline", "PBR", "Shadow Mapping", "HDR"]
photos: "banner.png"
source: "StylizedRenderer development notes"
---

前两个阶段中，`StaticModelRenderer` 取得 `RenderWorld` 后便直接向窗口帧缓冲提交绘制。这个入口适合验证模型导入、资源上传和视锥裁剪，却无法表达一帧中前后相依的渲染工作：阴影必须先于场景着色生成，HDR 场景颜色必须先于 Tone Mapping 产生，每个中间结果还需要明确的尺寸、格式和生命周期。

第三阶段在 `RenderWorld` 与最终屏幕输出之间加入 `FramePipeline`。模型仍然沿用已有的 Asset、Runtime Cache 和渲染提取链路，但屏幕不再是唯一输出目标：方向光深度首先写入 Shadow Map，不透明物体随后写入 HDR Color 与 Depth，最终由全屏后处理将 HDR 结果转换到窗口默认帧缓冲。

完整的数据与资源流如下：

~~~text
SceneAsset + Camera + DirectionalLight
  → RenderExtractor
  → RenderWorld
      ├─ shadowItems + ShadowView
      └─ items + RenderView + RuntimeMaterial
  → FramePipeline
      ├─ ShadowPass
      │    └─ Depth32F Shadow Map
      ├─ ForwardOpaquePass
      │    └─ RGBA16F Color + Depth24Stencil8
      └─ PostProcessPass
           └─ Exposure + Tone Mapping + Gamma → Backbuffer
~~~

绘制不再集中在 Viewer 的单次调用中，而是由多个 `IRenderPass` 按顺序消费同一个 `FrameContext`。Pass 之间通过明确的帧资源指针传递结果，因此阴影、主场景与后处理既能独立管理资源，也能组成稳定的数据依赖链。

## 系统框架

| 层级 | 核心类型 | 职责 |
| --- | --- | --- |
| Asset | `MaterialAsset`、`MaterialTemplate` | 保存导入参数与材质程序配置 |
| Material | `MaterialInstance` | 将一份资产参数绑定到指定材质模板 |
| Runtime | `RuntimeMaterial`、`RuntimeResourceCache` | 编译 Shader、缓存材质实例并绑定 GPU 参数 |
| Extraction | `RenderExtractor`、`RenderWorld` | 生成主视图、阴影视图及两组绘制项 |
| Graphics | `RenderTexture`、`DepthTexture`、`Framebuffer` | 封装离屏颜色、深度和附件组合 |
| Pipeline | `FrameContext`、`IRenderPass`、`FramePipeline` | 组织 Pass 顺序、共享帧资源并记录执行结果 |
| Pass | `ShadowPass`、`ForwardOpaquePass`、`PostProcessPass` | 分别完成阴影生成、HDR 场景着色与显示变换 |
| Diagnostics | `GpuTimerQuery`、`ViewerPanels` | 统计 Pass 状态、绘制次数、资源规格和 GPU 时间 |

`ViewerApplication` 位于最外层，负责创建材质模板、构造 Pass 顺序、设置用户可调参数，并在每帧把 `RenderWorld` 与 framebuffer 尺寸写入 `FrameContext`。具体渲染逻辑由 Pipeline 和各个 Pass 执行，Viewer 只承担系统组装与交互职责。

这里需要区分四种容易混淆的对象：

- `MaterialAsset` 是模型导入得到的 CPU 数据，来源于 glTF 材质；
- `MaterialInstance` 是某份 MaterialAsset 与某个 MaterialTemplate 的参数组合；
- `RuntimeMaterial` 是 MaterialTemplate 对应的 GPU Shader 与绑定逻辑；
- `RenderItem` 是当前帧对 Primitive、Instance 和 RuntimeMaterial 的非拥有引用。

相同的分层也应用于渲染目标。`RenderTexture` 和 `DepthTexture` 拥有 GPU 图像，`Framebuffer` 只定义这些图像如何成为附件，`FrameContext` 则在一帧内传递它们的地址。资源所有权不会随着 Pass 之间的数据传递而转移。

## Material：从资产参数到 Shader 绑定

前一阶段的材质主要承担 Base Color 数据传递，Shader 与绘制器的关系仍然固定。第三阶段把材质拆分为三个层次，使“使用哪套着色逻辑”“每个物体有哪些参数”“GPU 上实际绑定什么”成为不同问题。

### MaterialAsset：扩充导入材质参数

`MaterialAsset` 仍然是材质数据进入引擎后的第一种表示。第三阶段在原有 Base Color、Alpha Mode 和 Double Sided 之外增加 `metallicFactor` 与 `roughnessFactor`：

~~~cpp
struct MaterialAsset
{
    std::string name;
    glm::vec4 baseColorFactor{1.0F};
    AssetHandle<TextureAsset> baseColorTexture;

    float metallicFactor = 0.0F;
    float roughnessFactor = 1.0F;

    AlphaMode alphaMode = AlphaMode::Opaque;
    float alphaCutoff = 0.5F;
    bool doubleSided = false;
};
~~~

Assimp 材质导入器分别查询 glTF Metallic Factor 与 Roughness Factor。Metallic 被限制在 `[0, 1]`，Roughness 被限制在 `[0.04, 1]`。下限不是文件格式要求，而是当前 BRDF 实现的数值保护：完全为零的粗糙度会让 GGX 分布趋近无限窄，有限精度下容易出现极亮像素或除零问题。

这里保存的是 Factor，而不是已经创建好的 GPU Uniform。MaterialAsset 可以在没有 OpenGL Context 的环境中导入和检查，也可以被不同 Material Template 重复使用。材质参数只有进入 Runtime 层后才转换为具体 Shader 绑定。

### MaterialTemplate：定义着色程序类型

`MaterialTemplate` 保存模板名称、`MaterialKind`、顶点/片元 Shader 路径和 `variantKey`。当前材质种类包括：

- `Unlit`：采样 Base Color，不进行光照计算；
- `DebugNormal`：将世界空间法线映射到可视颜色，用于检查法线与变换；
- `BasicPbr`：使用方向光、金属度与粗糙度计算直接光照，并接收 Shadow Map。

模板只描述一类材质所使用的程序，不保存某个模型的颜色或纹理。`isValid()` 以顶点和片元 Shader 路径是否齐全作为最低有效条件。Viewer 在初始化时把三种模板注册到 `AssetRegistry`，切换显示模式时只需更换传给 `RenderExtractor` 的模板 Handle。

### MaterialInstance：保存每个材质的参数

`MaterialInstance` 由模板 Handle 与资产参数组成：

~~~cpp
struct MaterialInstance
{
    AssetHandle<MaterialTemplate> templateHandle;
    glm::vec4 baseColorFactor{1.0F};
    float metallic = 0.0F;
    float roughness = 1.0F;
    AssetHandle<TextureAsset> baseColorTexture;
};
~~~

`makeMaterialInstance()` 从 `MaterialAsset` 复制 Base Color、Base Color Texture、Metallic 与 Roughness。同一份导入材质可以与不同模板组合：例如切换到 Debug Normal 时，几何体与源材质不需要重新导入，只会解析出另一组模板/资产组合实例。

`RuntimeResourceCache` 使用 `{materialId, templateId}` 作为 `MaterialInstanceKey`。这个二元键非常重要：只按材质资产缓存会让不同 Shader 模式错误地共享同一个实例，只按模板缓存又会丢失每个 Primitive 的材质参数。

当 Primitive 没有 Material Handle 时，Cache 仍然创建一个带有效 Template Handle 的默认 Instance。它使用白色 Base Color、Metallic 0 和 Roughness 1，并让空纹理 Handle 在绑定阶段解析为白色纹理。这种处理使“模型没有材质”成为一种可绘制的默认状态，而不是导致整个 Render Extraction 失败。

材质实例缓存返回的是容器中对象的地址，`RenderItem` 只保存该地址而不复制参数。只要一帧中不清理或重建 `RuntimeResourceCache`，这些指针就保持稳定。关闭阶段必须先停止使用 RenderWorld，再清理 Cache；否则 RenderItem 中的材质指针会失效。

### RuntimeMaterial：连接材质与 GPU

`RuntimeMaterial` 对应模板的 GPU 表示。构造时从 `AssetRegistry` 读取 `MaterialTemplate`，通过 `GraphicsDevice` 编译 `ShaderProgram`，并一次性设置固定纹理槽：Base Color 使用 slot 0，PBR 阴影图使用 slot 1。

绘制时，`bind()` 检查 Instance 的模板 Handle 是否与自身一致，再按 `MaterialKind` 上传参数：

- Unlit 绑定 `uBaseColorFactor` 与 Base Color Texture；
- Debug Normal 不需要材质纹理和标量参数；
- Basic PBR 额外绑定 `uMetallic` 与 `uRoughness`。

纹理仍由 `RuntimeResourceCache::getOrCreateTexture()` 延迟上传。空纹理 Handle 返回 1×1 白纹理，使纯色材质可以沿用同一采样路径；资产或上传失败时返回黑紫棋盘 Error Texture，使资源错误直接反映在画面中。

Runtime Material 本身按 Template ID 缓存，而不是按 Material Instance 缓存。这意味着使用同一个 Basic PBR 模板的一百个 Primitive 共享一份 Shader Program，只在每次 Draw Call 前切换 Base Color、Metallic、Roughness 和纹理。模板决定程序，实例决定参数，这正是两层缓存能够分开的原因。

`bind()` 还检查 `instance.templateHandle == templateHandle_`。这项检查防止把 Unlit Instance 交给 Basic PBR Runtime Material：两者即使都含有 Base Color，也不能假设 Uniform 布局和纹理槽约定相同。材质系统由此在真正提交 Draw Call 之前拦截模板错配。

### 三种材质模式如何使用

Unlit、Debug Normal 与 Basic PBR 共享 `static_model.vert`。顶点 Shader 统一输出世界空间位置、经过 Normal Matrix 变换的世界空间法线和第一套 UV，因此片元 Shader 可以在不修改网格输入布局的情况下切换。

Unlit 的输出为：

~~~text
color = texture(baseColorTexture, uv) × baseColorFactor
~~~

它适合检查纹理、UV 和 Base Color 导入是否正确。由于结果仍写入 HDR Render Texture 并经过 Post Process，曝光和 Gamma 仍会影响最终显示。

Debug Normal 将归一化法线从 `[-1, 1]` 映射到 `[0, 1]`：

~~~text
displayNormal = normalize(worldNormal) × 0.5 + 0.5
~~~

它适合检查导入法线、节点非均匀缩放与 Normal Matrix。若直接使用 Model Matrix 变换法线，非均匀缩放会破坏法线与表面的垂直关系；当前 Vertex Shader 使用 `transpose(inverse(mat3(world)))` 对应的 `uNormalMatrix`，避免这一问题。

Basic PBR 才读取 Camera、Directional Light、Metallic、Roughness 与 Shadow Map。三种模式使用相同 Pipeline，说明材质模式负责“表面如何着色”，Pass 负责“结果写到哪里以及何时执行”。

## RenderExtractor：生成主视图与阴影视图

`RenderExtractor` 继续负责把持久场景数据转换为当前帧数据，但输出内容已经从一组可见物体扩展为两个用途不同的集合。

`RenderWorld` 不是一份场景副本，而是 Renderer 需要的扁平化帧快照：

~~~text
RenderWorld
├── mainView
│   ├── view / projection / viewProjection
│   ├── cameraPosition / viewport / frustum
│   └── mainLight
├── shadowView
│   ├── lightViewProjection
│   └── shadowMap extent
├── items[]
├── shadowItems[]
└── renderStats
~~~

Pass 不读取 SceneAsset 的父子节点，也不计算 Camera Matrix。所有会影响当前帧绘制的场景信息在 Extraction 阶段被转换为 RenderView、ShadowView 和扁平 Item 数组。这样做的直接价值是，Shadow Pass 与 Forward Pass 可以只遍历连续绘制列表，不需要重复理解资产层级。

### 主视图绘制项

提取器首先计算节点世界矩阵、法线矩阵与世界空间 Bounds，再使用 Camera 的 View-Projection 构造 Frustum。通过视锥测试的 Primitive 会生成 `RenderItem`，其中保存：

- `RuntimeMeshPrimitive` 指针；
- `MaterialInstance` 与 `RuntimeMaterial` 指针；
- World Matrix 与逆转置 Normal Matrix；
- World Bounds、Object ID、材质分类和渲染标志。

`MaterialAsset::alphaMode` 被映射为 `Opaque`、`Masked` 或 `Transparent`，双面属性写入 `DoubleSided` 标志。第三阶段的 `ForwardOpaquePass` 只提交 `Opaque` 项，但分类已经在提取阶段完成，后续增加 Masked 与 Transparent Pass 时无需重新解析源模型。

法线矩阵在每个节点计算一次，然后被该节点的所有 Primitive 复用：

~~~text
normalMatrix = transpose(inverse(mat3(worldMatrix)))
~~~

`worldBounds` 则按 Primitive 单独计算，因为一个 Mesh 中不同 Primitive 的局部范围可能不同。Object ID 当前使用节点索引，能够在不引入完整 Entity 系统的前提下保留绘制项与源节点之间的对应关系。

Render Stats 也在此处形成。`totalItems` 统计遇到的有效 Primitive，`visibleItems` 与 `culledItems` 反映主相机视锥测试结果，材质分类计数则发生在可见项生成后。Pass 的 Draw Call 是执行结果，因此由 ForwardOpaquePass 完成后回写，不与提取统计混在一起。

### 阴影绘制项

投射阴影的 Primitive 会同时生成更紧凑的 `ShadowRenderItem`。阴影深度只依赖几何体与 World Matrix，因此该结构不携带材质、法线矩阵和主相机信息。阴影集合在主相机视锥剔除之前建立，避免相机画面之外但仍能向画面内部投影的物体被错误移除。

提取器将全部阴影投射者的世界 Bounds 合并为 `shadowCasterBounds`，再据此计算方向光视图：

1. 使用合并 Bounds 的中心作为光照视图目标；
2. 使用 Bounds 半径确定正交投影的左右、上下范围；
3. 沿方向光反方向放置虚拟光源相机；
4. 依据半径设置 Near/Far 范围；
5. 组合正交投影与 View Matrix，得到 `ShadowView::viewProjection`。

方向光没有透视衰减，正交投影能够保持平行光线的几何关系。使用场景投射者 Bounds 自适应投影范围，比固定世界尺寸更容易利用 Shadow Map 的有限分辨率。

光方向接近世界 Y 轴时，固定使用 `(0,1,0)` 作为 LookAt Up Vector 会与观察方向近似共线，叉积结果趋近零。实现检测 `abs(lightDirection.y) > 0.99`，此时改用世界 X 轴作为 Up Vector，保证 Light View Matrix 能够稳定构造。

Near Plane、光源相机距离和 Far Margin 都按 Bounds 半径缩放，因此模型整体尺寸改变时，阴影视锥仍保持相似比例。该方案适合当前单模型 Viewer；对于大范围动态场景，投射者总 Bounds 会随物体移动改变，容易造成投影范围和阴影 Texel 在帧间漂移，后续需要稳定级联或 Texel Snap 处理。

## Graphics：建立可采样的离屏目标

多 Pass 渲染要求前一个阶段的输出能够被后一个阶段采样。Graphics 层因此增加了三种移动语义 RAII 对象。

### RenderTexture

`RenderTexture` 表示可作为颜色附件、也可作为 Shader 输入的二维纹理。它保存 OpenGL 对象 ID、Extent 与 Format，并通过 `bind(slot)` 进入指定纹理槽。主场景颜色使用 `RGBA16Float`，每通道半精度浮点能够保留大于 1.0 的光照结果，为曝光和 Tone Mapping 留出动态范围。

创建过程使用 `glCreateTextures` 与 `glTextureStorage2D` 分配不可变存储。`RGBA8` 映射到 `GL_RGBA8`，`RGBA16Float` 映射到 `GL_RGBA16F`。离屏颜色纹理设置线性过滤和 Clamp-to-Edge；后处理在画面边缘采样时不会从另一侧重复纹理，也不会因为最近邻采样形成像素跳变。

`RenderTextureDesc::sampled` 已经表达了资源可能被后续 Shader 读取的意图。当前 OpenGL 实现为所有 RenderTexture 建立可采样二维纹理，未来如果加入只作为瞬时附件的 Renderbuffer 或显式图形 API，这个字段可以参与资源类型和 Usage Flag 的选择。

### DepthTexture

`DepthTexture` 同时服务于深度测试和深度采样。Forward Pass 使用 `Depth24Stencil8` 作为常规深度/模板附件；Shadow Pass 使用 `Depth32Float` 保存光源视角下的高精度深度。两种用途共享对象接口，但格式和采样语义由创建描述决定。

Depth Texture 使用最近邻过滤和 Clamp-to-Edge。它的 `GL_TEXTURE_COMPARE_MODE` 被设为 `GL_NONE`，所以 `texture(uShadowMap, uv).r` 返回原始深度，而不是硬件比较结果。PCF 的九次比较完全写在 Basic PBR Shader 中，这使 Bias、Kernel 和边界规则都保持可见，适合作为当前阶段的阴影实现；若改用 `sampler2DShadow`，比较操作可以交给纹理采样器完成。

### Framebuffer

`FramebufferDesc` 接收可选的 Color Texture 与 Depth Texture。创建时由 `Framebuffer` 连接附件并验证尺寸与完整性。Shadow Framebuffer 只含深度附件，Forward Framebuffer 同时包含 HDR Color 和 Depth-Stencil。

创建 Framebuffer 时依次检查：

1. 至少存在一个颜色或深度附件；
2. 所有附件对象都有效；
3. Color 与 Depth 的 Extent 完全一致；
4. `glCheckNamedFramebufferStatus` 返回 `GL_FRAMEBUFFER_COMPLETE`。

`Depth24Stencil8` 被连接到 `GL_DEPTH_STENCIL_ATTACHMENT`，`Depth32Float` 则连接到 `GL_DEPTH_ATTACHMENT`。当 Framebuffer 只有深度附件时，Draw Buffer 和 Read Buffer 都设置为 `GL_NONE`，否则 OpenGL 仍可能因为缺少颜色输出而将 Framebuffer 判定为不完整。

Framebuffer 不拥有 C++ 层面的附件对象，Texture 与 Framebuffer 统一由对应 Pass 管理。类成员按声明顺序的逆序析构，因此 Framebuffer 会先于它引用的 Texture 成员释放。资源重建则先在局部变量中创建新 Texture 与新 Framebuffer，只有整组对象都有效时才移动到成员中；任一步失败，旧资源继续保持可用。

`ForwardOpaquePass::resize()` 在 framebuffer 尺寸发生变化时，以临时对象创建整组新资源，全部成功后再移动替换旧对象。这样的提交方式可以避免创建中途失败后留下“新颜色附件配旧深度附件”的不一致状态。窗口尺寸没有变化时直接复用已有目标，`renderTargetRebuildCount` 则记录实际重建次数。

## FrameContext：传递一帧的输入与中间结果

`FrameContext` 是 Pass 之间共享的逐帧工作区。输入部分包含 framebuffer 尺寸、`RenderWorld`、`deltaTime`、阴影开关、曝光和 Tone Mapping 开关；中间结果包含 `shadowMap`、`hdrColor`、`depth` 与当前 `framebuffer`。

~~~cpp
struct FrameContext
{
    Extent2D framebufferSize{};
    RenderWorld* renderWorld = nullptr;

    RenderTexture* hdrColor = nullptr;
    DepthTexture* depth = nullptr;
    Framebuffer* framebuffer = nullptr;
    DepthTexture* shadowMap = nullptr;

    float deltaTime = 0.0F;
    bool shadowsEnabled = true;
    float exposure = 1.0F;
    bool toneMappingEnabled = true;
};
~~~

这些字段都是一帧内的借用引用。FrameContext 不销毁 RenderWorld，也不销毁任何纹理；真正所有者分别是 Viewer 和各个 Pass。Pipeline 执行结束后可以读取字段进行调试，但不能把这些指针保存到拥有对应 Pass 更久的对象中。

`framebuffer` 表示当前阶段最近写入的目标。Forward Pass 将其设为自身离屏 Framebuffer，Post Process 输出到默认 Framebuffer 后再设为 `nullptr`。这个字段目前主要用于表达状态和诊断；随着 Pass 数量增加，它也可以成为验证目标切换是否符合预期的入口。

这种设计没有让 Pass 直接查找彼此。`ShadowPass` 把生成的深度纹理写入 `frame.shadowMap`，`ForwardOpaquePass` 读取它并写入 HDR 目标，`PostProcessPass` 再读取 `frame.hdrColor`。依赖关系由数据是否存在表达，Pass 自身只关心输入是否有效。

## IRenderPass 与 FramePipeline：组织执行顺序

`IRenderPass` 规定三个接口：

~~~cpp
class IRenderPass
{
public:
    virtual bool resize(Extent2D extent) = 0;
    virtual bool execute(FrameContext& frame) = 0;
    virtual std::string_view name() const noexcept = 0;
};
~~~

`FramePipeline` 以 `unique_ptr<IRenderPass>` 保存有序 Pass。`resize()` 将新尺寸依次传给所有 Pass，只有全部成功才记录有效 Extent；`execute()` 按插入顺序执行，任一 Pass 返回失败便终止本帧后续处理。当前 Viewer 的顺序固定为：

~~~text
ShadowPass → ForwardOpaquePass → PostProcessPass
~~~

顺序本身就是资源依赖。若把 Post Process 放在 Forward 之前，`hdrColor` 尚未产生，执行会直接失败；若省略 Shadow Pass，Forward Pass 仍可工作，只是 `shadowMap == nullptr` 时关闭阴影采样。

### addPass：建立所有权与计时对象

`addPass()` 拒绝空指针，并为新 Pass 同时创建一个 `GpuTimerQuery`：

~~~text
PassEntry
├── unique_ptr<IRenderPass> pass
├── GpuTimerQuery timer
└── bool lastExecutionSucceeded
~~~

Pipeline 不按名称查找或自动排序 Pass，插入顺序就是执行顺序。这种方式简单且可预测，但调用方必须在组装阶段保证生产者位于消费者之前。未来引入 Render Graph 时，可以把当前 FrameContext 中的资源读写关系转成显式依赖并自动排序。

### resize：资源尺寸的统一入口

Pipeline 在获得非零 Extent 后才允许执行。窗口最小化时 Viewer 会跳过渲染，因此不会创建零尺寸纹理。`resize()` 对 Pass 逐个调用：Shadow Pass 只验证窗口尺寸，Forward Pass 重建随窗口变化的 HDR/Depth 目标，Post Process 不持有同尺寸 Render Target，只验证输入即可。

这里的窗口 Extent 与 Shadow Extent 是两套概念。前者决定最终图像和 HDR 目标大小，后者来自 `ShadowView`，默认固定为 2048×2048。将二者分开可以避免用户拖动窗口时无意义地改变阴影分辨率。

### execute：失败即停止本帧

每个 Pass 执行前启动对应 Timer，执行后结束 Query，并记录返回值。某个 Pass 失败时，Pipeline 立即返回 `false`。例如 Forward Pass 创建失败后继续执行 Post Process，只会让后处理读取空的 `hdrColor`；尽早终止能把错误保留在最接近根因的位置。

Pipeline 不在每帧结束时清空 FrameContext，因为后续面板可能还需要读取资源状态。相反，各个生产 Pass 在执行开始时重置自己负责的输出：Shadow Pass 先令 `shadowMap = nullptr`，Forward Pass 验证目标后再写入 HDR、Depth 与 Framebuffer。这样即使条件开关改变，也不会误用上一帧残留指针。

## ShadowPass：生成方向光深度图

`ShadowPass` 初始化一组只输出深度的 Shader，并在需要时按 `ShadowView::extent` 创建 `Depth32Float` 与 depth-only Framebuffer。默认阴影分辨率为 2048×2048，它不随窗口尺寸变化；`resize()` 只验证窗口 Extent，真正的阴影资源由 `ensureResources()` 根据 ShadowView 延迟建立。

执行过程包括：

1. 将 `frame.shadowMap` 清空，避免沿用上一帧无效结果；
2. 阴影关闭时直接成功返回；
3. 绑定 Shadow Framebuffer 并切换到阴影分辨率 Viewport；
4. 清理深度附件；
5. 为每个 `ShadowRenderItem` 上传 `uModel` 和统一的 `uLightViewProjection`；
6. 提交索引绘制，将最近表面深度写入 Shadow Map；
7. 把 Depth Texture 写回 `frame.shadowMap`。

Shadow Shader 不执行颜色输出，也不需要材质采样。它只计算：

~~~glsl
gl_Position = uLightViewProjection * uModel * vec4(position, 1.0);
~~~

因此阴影绘制项可以保持最小数据规模，避免把主渲染材质绑定逻辑带入深度阶段。

`ensureResources()` 根据 `ShadowView::extent` 检查现有深度图。如果尺寸一致则直接复用；否则创建新的 Depth Texture 和 depth-only Framebuffer。重建计数只在旧 Framebuffer 已经存在时递增，因此首次创建不被记作 Resize。

阴影关闭和场景没有投射者都属于合法空工作，而不是执行错误。前者使 `frame.shadowMap` 保持为空，后者避免创建没有用途的深度资源。Forward Renderer 根据空指针与 `ReceiveShadow` 标志共同决定 `uShadowEnabled`，材质 Shader 因而不需要知道阴影为什么不可用。

## ForwardOpaquePass：HDR 前向着色

`ForwardOpaquePass` 拥有 `StaticModelRenderer`、HDR Color、Depth Texture 和 Framebuffer。执行时先把这些资源写入 `FrameContext`，再绑定离屏 Framebuffer、设置 Viewport、清理颜色与深度，最后让 `StaticModelRenderer` 绘制所有不透明项。

`StaticModelRenderer` 不再持有单一固定 Shader。它从每个 `RenderItem` 取得 `RuntimeMaterial`，调用 `bind()` 上传材质参数，再补充对象和视图级 Uniform。Basic PBR 还会接收 Camera Position、方向光参数、Light View-Projection 与 Shadow Map。

渲染器只遍历 `RenderMaterialClass::Opaque`。每个有效 Item 的调用顺序为：

~~~text
RuntimeMaterial::bind(instance)
  → 上传材质 Uniform，绑定 Base Color Texture
  → 上传 ViewProjection / Model / NormalMatrix
  → Basic PBR 上传 Camera / Light / Shadow Uniform
  → 绑定 Shadow Map 到 slot 1
  → GraphicsDevice::drawIndexed
~~~

材质参数、对象参数和视图参数具有不同更新频率，当前实现为了保持边界清晰而在每个 Draw Call 中逐项设置。后续优化可以对相同 RuntimeMaterial 的 Item 排序，减少 Shader 切换；Camera 和 Light 数据也可以迁移到 Uniform Buffer，使同一 Pass 中的 Draw Call 共享视图常量。

`ReceiveShadow` 只控制主着色时是否采样阴影，`CastShadow` 则控制是否进入 `shadowItems`。两者是独立标志：一个物体可以投射但不接收阴影，也可以接收其他物体阴影但不写入 Shadow Map。

### Basic PBR 的直接光照

片元 Shader 使用 Cook-Torrance 微表面模型：

~~~text
f_r = k_d · baseColor / π + D_GGX · G_Smith · F_Schlick / (4(N·V)(N·L))
L_o = f_r · radiance · max(N·L, 0)
~~~

其中：

- `D_GGX` 描述微表面法线围绕 Half Vector 的分布；
- `G_Smith` 估计视线与光线方向上的微表面遮蔽；
- `F_Schlick` 近似不同观察角度下的 Fresnel 反射；
- 非金属的基础反射率使用 `F0 = 0.04`，金属则在 F0 中混入 Base Color；
- `roughness` 被限制到 `[0.04, 1]`，避免趋近零时分布函数产生过高尖峰；
- `k_d = (1 - F)(1 - metallic)`，使金属不再保留漫反射项。

当前光照由单个方向光和常量环境项组成。HDR Render Texture 保留镜面高光与高强度光源产生的超范围值，而不是在主材质 Shader 内提前截断到 `[0, 1]`。

### GGX 法线分布项

微表面模型把宏观表面看作大量方向不同的微小镜面。`D` 项描述有多少微表面法线与 Half Vector 对齐。Shader 先计算：

~~~text
α  = roughness²
α² = roughness⁴
D  = α² / { π [(N·H)²(α² - 1) + 1]² }
~~~

Roughness 越小，分布越集中在 `N·H = 1` 附近，高光更窄、更亮；Roughness 越大，微表面方向越分散，高光覆盖范围更宽。代码中的 `max(denominator, 0.001)` 用于限制极端角度和低粗糙度造成的数值放大。

### Smith 几何遮蔽项

并非所有朝向正确的微表面都能同时被光照到并被相机看到，部分会被其他微表面遮挡。Shader 使用 Schlick-GGX 分别估计视线和光线方向：

~~~text
k = (roughness + 1)² / 8
G₁(x) = x / [x(1-k) + k]
G = G₁(N·V) × G₁(N·L)
~~~

这里使用的是适合直接光照的 Roughness 重映射。`N·V` 或 `N·L` 接近零时，几何项会压低掠射方向上不稳定的镜面贡献。

### Schlick Fresnel 与金属度

Fresnel 项描述反射率随观察角度增大的现象：

~~~text
F = F₀ + (1 - F₀)(1 - H·V)⁵
~~~

非金属使用约 4% 的基础镜面反射率，即 `F0 = vec3(0.04)`；金属没有独立的漫反射颜色，其 Base Color 表达带色镜面反射，因此代码使用 `mix(0.04, baseColor, metallic)`。Metallic 处于 0 与 1 之间时，相当于在两种材质响应之间插值，常用于经过过滤的材质边界。

能量分配通过 `(1-F)` 从入射能量中扣除已经进入镜面反射的部分，再乘 `(1-metallic)` 去除金属漫反射。最终漫反射使用 Lambert `baseColor / π`，镜面项则除以 `4(N·V)(N·L)` 完成 Cook-Torrance 归一化。

### 当前环境项的含义

Shader 最后加入 `baseColor × 0.03` 作为常量环境光。它只用于避免未受方向光照射的区域完全为黑，并不等价于 IBL：它没有对半球入射辐射积分，也不会随环境、法线、粗糙度和观察方向变化。后续接入 Irradiance Map、Prefilter Map 与 BRDF LUT 时，这个常量项应由物理意义更完整的环境漫反射和环境镜面反射替代。

### Shadow Map 的采样与 PCF

世界空间片元位置乘以 Light View-Projection 后得到光源裁剪空间坐标。经过透视除法和 `[-1, 1] → [0, 1]` 映射后，`xy` 用于采样 Shadow Map，`z` 是当前片元相对光源的深度。

直接比较当前深度与纹理深度会产生硬边缘和 Shadow Acne。当前实现采用两项修正：

~~~text
bias = max(0.0025 × (1 - N·L), 0.0005)
~~~

表面越倾斜，Bias 越大，以补偿深度图离散采样造成的自遮挡。随后以 `1 / textureSize` 计算单个 Texel 尺寸，在中心像素周围执行 `3×3` 深度比较，九次结果的平均值作为可见度：

~~~text
visibility = Σ compare(currentDepth - bias, sampledDepth) / 9
~~~

这是一种基础 Percentage-Closer Filtering。它并不先平均深度，而是平均九次二值可见性判断，因此边缘会形成有限宽度的过渡区域。超出 Shadow Map `[0, 1]` 范围的片元按可见处理，避免边界外错误投影阴影。

PCF Kernel 的实际世界尺寸取决于正交投影范围和 Shadow Map 分辨率。同样的 `3×3` Kernel 在更大的投影范围内覆盖更宽的世界区域，因此阴影会显得更软、细节更少。当前 Bounds 自适应方案提高了有效分辨率，但也意味着场景 Bounds 变化会改变滤波对应的世界尺度。

Bias 同样与投影和深度精度相关。值过小会出现 Acne，值过大则让阴影与物体底部脱离，形成 Peter Panning。当前常量适用于默认场景尺度；若允许大范围调整 Shadow Projection，应把 Bias 暴露为光源或 Shadow Pass 参数，或根据 Texel 世界尺寸进行缩放。

## PostProcessPass：从 HDR 到显示输出

`PostProcessPass` 使用一个覆盖屏幕的超大三角形。三个顶点分别位于 `(-1,-1)`、`(3,-1)` 和 `(-1,3)`，无需拼接两个三角形，屏幕内部也不会出现对角线插值接缝。

Pass 绑定默认 Framebuffer，采样 Forward Pass 的 HDR Color，并依次执行：

1. 曝光缩放：`exposed = hdrColor × exposure`；
2. 指数 Tone Mapping：`mapped = 1 - exp(-exposed)`；
3. Gamma 校正：`output = pow(mapped, 1 / 2.2)`。

Tone Mapping 关闭时，曝光后的颜色会直接 Clamp 到 `[0, 1]`，但 Gamma 校正仍然执行。这样可以分别观察 HDR 映射对高光层次的影响，以及显示空间校正对中间调亮度的影响。

曝光属于帧级参数而不是材质参数。它通过 `FrameContext` 传递给 Post Process，使整个场景保持统一的显示变换，也为后续自动曝光、Bloom 或颜色分级留下固定入口。

### 为什么不能直接显示 HDR Texture

Forward Shader 在线性颜色空间中计算光照，`RGBA16F` 可以保存大于 1 的值；普通窗口 Backbuffer 最终只能显示有限范围。若直接把 HDR 值写入低动态范围目标，超过 1 的部分会同时截断为白色，高光内部的层次全部消失。

指数 Tone Mapping `1-exp(-x)` 将 `[0,+∞)` 单调压缩到 `[0,1)`。低亮度区域近似线性，高亮度区域逐渐趋近 1，因此能够在保留暗部关系的同时压缩高光。Exposure 在映射之前缩放线性亮度：提高 Exposure 会让更多值进入曲线肩部，画面更亮但高光更快压缩；降低 Exposure 则保留更强光源的层次，同时压暗中间调。

### Gamma 校正的位置

光照与 Tone Mapping 都在线性空间执行，最后一步才使用 `pow(color, 1/2.2)` 转换为近似显示空间。若在 PBR 计算前对颜色做 Gamma，点积、能量相加和 BRDF 乘法都将在非线性数值上运行，明暗关系会失真。

Base Color Texture 在上传时使用 sRGB 内部格式，硬件采样会先将其解码为线性值；HDR Render Texture 使用线性 `RGBA16F`；Post Process 最后进行显示编码。这形成完整的颜色空间路径：

~~~text
sRGB Base Color Texture
  → 采样时解码到 Linear
  → Linear PBR Lighting
  → Linear HDR RGBA16F
  → Tone Mapping
  → Gamma Encode
  → Backbuffer
~~~

## GPU Pass 计时与运行诊断

`FramePipeline` 为每个 Pass 创建一个 `GpuTimerQuery`。计时器使用 `GL_TIME_ELAPSED` 测量 GPU 执行区间，而不是用 CPU 时钟包围 `execute()`；后者通常只测到命令提交时间，无法代表 GPU 真正完成绘制的耗时。

每个计时器维护三个 Query 槽并循环使用。准备开始新一轮计时时，它只在目标槽的 `GL_QUERY_RESULT_AVAILABLE` 为真时读取结果；结果尚未完成时跳过本次计时，而不是调用阻塞式读取等待 GPU。这种延迟获取会让面板显示较早一帧的耗时，但不会为了诊断数据破坏正常渲染并行性。

单个槽从 `begin()` 到 `end()` 的过程为：

~~~text
检查 nextQueryIndex 是否仍 pending
  → pending 且结果未就绪：本帧放弃计时
  → pending 且结果就绪：读取纳秒并换算为毫秒
  → glBeginQuery(GL_TIME_ELAPSED)
  → Pass::execute
  → glEndQuery
  → 标记当前槽 pending
  → nextQueryIndex 循环前进
~~~

三个槽允许 CPU 在 GPU 尚未完成前一帧时继续提交后续工作。`elapsedMilliseconds()` 返回最近一次已完成结果，而不是正在执行的 Query。Pipeline 的 `hasCompleteGpuTiming()` 要求所有 Pass 都至少获得过一次结果，只有此时总耗时才具有可比较意义。

各 Pass 的 GPU 时间相加可以近似表示管线总成本，但它不是完整 Frame Time：模型提取发生在 CPU，ImGui 在 Pipeline 之后绘制，驱动调度、交换缓冲和其他 GPU 工作也不在这些区间内。该统计适合比较 Shadow、Forward 与 Post Process 的相对成本，不应直接当作整帧延迟。

`ViewerPanels` 汇总以下状态：

- 每个 Pass 的执行成功状态、Draw Call 与 GPU 毫秒数；
- Shadow Map 的尺寸、格式和重建次数；
- Forward HDR/Depth 的尺寸、格式和重建次数；
- 所有 Pass 均有有效结果时的 GPU 总耗时；
- 阴影开关、Exposure 与 Tone Mapping 开关；
- 主视图的可见、剔除及材质分类统计。

这些指标覆盖了数据提取、资源生命周期、Pass 执行和 GPU 成本四个层面。例如 Shadow Pass Draw Call 为零但 `shadowItems` 非空时，应检查阴影开关与 Pass 状态；窗口缩放后重建计数持续增长，则应检查 Extent 是否在帧间抖动；某个 Pass 无 GPU 时间但仍成功执行，可能只是对应 Query 尚未就绪。

### 使用面板定位问题

调试可以从数据是否在正确阶段出现开始，而不是直接检查最终 Shader：

| 现象 | 首先检查 | 可能原因 |
| --- | --- | --- |
| `Total Items` 为 0 | SceneAsset 与 RuntimeMesh | 模型没有有效 Primitive，或 GPU Mesh 创建失败 |
| `Visible Items` 为 0 | Camera、Bounds、Frustum | 相机位置、投影参数或世界 Bounds 不正确 |
| Shadow Draw Call 为 0 | `shadowItems`、阴影开关 | 没有投射者，或 Shadow Pass 被禁用 |
| Forward Draw Call 少于 Visible | Material Class | Masked/Transparent 尚未由 Opaque Pass 绘制 |
| Shadow Map 有效但没有阴影 | ReceiveShadow、Light Matrix | Item 禁止接收阴影，或阴影坐标落在范围外 |
| 阴影表面出现条纹 | Bias | Bias 太小导致自遮挡 |
| 阴影与物体分离 | Bias | Bias 太大导致 Peter Panning |
| 高光全部变白 | Exposure/Tone Mapping | 曝光过高，或关闭映射后 HDR 值被 Clamp |
| 法线颜色异常 | Debug Normal | 法线导入、Normal Matrix 或模型变换错误 |
| Resize Count 每帧增加 | framebuffer Extent | 上层持续提交变化尺寸或未正确缓存 Extent |

这种排查顺序对应真实数据流。只有 Items、材质、Pass 输出和目标尺寸均有效后，才需要进入片元 Shader 检查 BRDF 或采样细节。

## ViewerApplication：组装和驱动管线

### 初始化材质与 Pass

`createMaterialTemplates()` 先注册 Unlit、Debug Normal 和 Basic PBR 三个模板。三者共用静态模型顶点 Shader，通过不同片元 Shader 改变表面着色方式。模板进入 `AssetRegistry` 后得到带类型的 Handle，`activeMaterialTemplateHandle` 始终指向当前选中的一个。

`createRuntimeResources()` 随后初始化 `RuntimeResourceCache` 和 `RenderExtractor`，再创建 Pipeline 与三个 Pass。每个 Pass 在移入 Pipeline 前完成自身 Shader 或全屏几何资源的初始化：

~~~cpp
auto shadow = std::make_unique<ShadowPass>(graphicsDevice);
shadow->initialize();
pipeline.addPass(std::move(shadow));

auto forward = std::make_unique<ForwardOpaquePass>(
    graphicsDevice, assetRegistry, runtimeResourceCache);
forward->initialize();
pipeline.addPass(std::move(forward));

auto postProcess = std::make_unique<PostProcessPass>(graphicsDevice);
postProcess->initialize();
pipeline.addPass(std::move(postProcess));
~~~

Pass 的 `unique_ptr` 移入 Pipeline 后，由 Pipeline 负责其生命周期。Viewer 另外保存非拥有的具体 Pass 指针，只用于查询 Draw Call、渲染目标格式和重建次数，不参与释放。

### 每帧渲染

`onRender()` 首先取得窗口 framebuffer 的像素尺寸。它与逻辑窗口尺寸并不总是相同，高 DPI 环境下创建纹理和设置 Viewport 应以 framebuffer 尺寸为准。尺寸发生变化时调用：

~~~cpp
if (pipelineExtent != framebufferExtent)
{
    pipeline.resize(framebufferExtent);
    pipelineExtent = framebufferExtent;
}
~~~

随后，`RenderExtractor` 使用当前 Camera、Directional Light 和 Material Template 重新生成 `RenderWorld`。材质模式是在提取时确定的，因为 Runtime Material 指针属于 RenderItem 的一部分。得到逐帧绘制数据后，再构造 FrameContext：

~~~cpp
FrameContext frame;
frame.framebufferSize = framebufferSize;
frame.renderWorld = &renderWorld;
frame.deltaTime = deltaTime;
frame.shadowsEnabled = shadowsEnabled;
frame.exposure = exposure;
frame.toneMappingEnabled = toneMappingEnabled;

pipeline.execute(frame);
~~~

`execute()` 返回后，默认 framebuffer 已经包含 Post Process 的输出。Viewer 此时开始 ImGui Frame 并绘制诊断面板，使面板覆盖在完成 Tone Mapping 的场景之上。

### 切换材质模式

Viewer 面板修改 `activeMaterialKind` 后，`updateActiveMaterialTemplate()` 将它映射到对应 Handle。新 Handle 在下一帧提取时生效：

~~~text
activeMaterialKind
  → activeMaterialTemplateHandle
  → RenderExtractor::extract
  → MaterialInstanceKey(materialId, templateId)
  → RuntimeMaterial
  → ForwardOpaquePass
~~~

Pipeline 顺序不随材质模式变化。Unlit 与 Debug Normal 沿用同一套 HDR Forward 和 Post Process；Basic PBR 则额外使用方向光参数与 Shadow Map。这个用法表明 Material Template 改变的是 RenderItem 的着色策略，而不是整条帧管线的拓扑。

### 关闭顺序

`onShutdown()` 先关闭 ViewerPanels，再释放 FramePipeline、RenderExtractor 和 RuntimeResourceCache。Pipeline 的析构会依次销毁 Pass 及其 Framebuffer、Texture、Shader、Buffer 和 GPU Query。所有对象都在 `GraphicsDevice` 与 OpenGL Context 仍然有效时析构，延续了前两个阶段的资源生命周期约定。

## 如何增加一个新的 Render Pass

当前接口下，一个新 Pass 需要回答三个问题：它读取什么、写出什么、资源是否随窗口尺寸变化。以在 HDR 场景之后加入 Bloom 为例，Bloom Pass 应读取 `frame.hdrColor`，创建自己的亮部提取与模糊纹理，并将合成结果写回新的 HDR 输出。它应插入 ForwardOpaquePass 与 PostProcessPass 之间：

~~~text
ShadowPass
  → ForwardOpaquePass: 写 frame.hdrColor
  → BloomPass: 读旧 HDR，写合成 HDR
  → PostProcessPass: 读合成 HDR，输出 Backbuffer
~~~

类的基本形态仍遵循 `IRenderPass`：

~~~cpp
class BloomPass final : public IRenderPass
{
public:
    bool initialize();
    bool resize(Extent2D extent) override;
    bool execute(FrameContext& frame) override;
    std::string_view name() const noexcept override;

private:
    RenderTexture brightColor_;
    RenderTexture blurredColor_;
    Framebuffer framebuffer_;
};
~~~

`initialize()` 创建与尺寸无关的 Shader、Sampler 或全屏几何；`resize()` 创建与 framebuffer 尺寸相关的 Texture 和 Framebuffer；`execute()` 验证输入、绑定输出、提交绘制，并更新 FrameContext 中供下游读取的资源。失败时返回 `false`，让 Pipeline 停止执行。

当前 FrameContext 对资源采用固定字段，增加 Bloom 时可以直接扩展结构，但 Pass 数量继续增长后会产生大量可选指针。Render Graph 的下一步通常是让 Pass 以逻辑名称声明资源读写，由图系统负责创建、复用和传递物理资源。第三阶段的接口已经把 Pass 生命周期和顺序独立出来，因此可以逐步迁移，而不必改动 Asset 与 Render Extraction 层。

## 当前渲染路径

一帧画面的调用关系可以归纳为：

~~~mermaid
flowchart TD
    A["ViewerApplication::onRender"] --> B["RenderExtractor::extract"]
    B --> C["RuntimeResourceCache 解析材质与网格"]
    C --> D["RenderWorld"]
    D --> E["FramePipeline::execute"]
    E --> F["ShadowPass"]
    F --> G["Depth32F Shadow Map"]
    G --> H["ForwardOpaquePass"]
    D --> H
    H --> I["RGBA16F HDR Color"]
    I --> J["PostProcessPass"]
    J --> K["默认 Framebuffer"]
    K --> L["ViewerPanels"]
~~~

当前实现以单方向光、单张 Shadow Map 和不透明前向渲染为主。Masked 与 Transparent 已完成分类，但尚未进入独立 Pass；PBR 参数目前使用 Base Color Texture、Metallic Factor 与 Roughness Factor，尚未采样 Metallic-Roughness、Normal、Occlusion 和 Emissive 贴图；阴影投影根据投射者总 Bounds 计算，尚未加入稳定级联、Texel 对齐和可调 Filter Kernel；后处理目前包含曝光、指数 Tone Mapping 与 Gamma 校正。

这些边界对应着明确的扩展位置：透明物体可以增加排序后的 Transparent Pass，更多材质通道可以扩展 MaterialInstance 与 RuntimeMaterial，Bloom 可以读取 `hdrColor` 并在 Post Process 前插入新 Pass，级联阴影则可以把单个 ShadowView 扩展为多个 Cascade View。新增功能继续消费 RenderWorld 与 FrameContext，无需回到模型导入和底层 OpenGL 对象管理中重新建立数据通路。

第三阶段最终形成的是一套可组合的渲染框架：Asset 描述持久数据，Runtime Cache 管理 GPU 表示，RenderExtractor 生成当前帧视图，FramePipeline 安排执行顺序，各 Pass 拥有自己的目标和算法，Viewer 负责组装与诊断。渲染器由此从“能够绘制模型”进入“能够组织一帧”的阶段。
