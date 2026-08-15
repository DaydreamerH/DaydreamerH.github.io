---
title: "StylizedRenderer 第五阶段：Inverse Hull 与屏幕空间描边系统"
description: "解析 MToon 描边参数、Forward MRT、Inverse Hull Mask、深度与法线边缘检测、HDR 轮廓合成、调试视图及 Viewer 控制如何组成完整描边管线。"
date: "2026-08-15"
category: "图形与高性能计算"
track: "Rendering / Engine Architecture"
level: advanced
status: ready
published: true
minutes: 70
order: 0
prerequisites: ["StylizedRenderer 阶段一至四", "现代 OpenGL 基础", "深度缓冲与法线空间", "后处理基础"]
tags: ["C++", "OpenGL", "Rendering", "MToon", "Outline", "Inverse Hull", "Screen Space"]
photos: "banner.png"
source: "StylizedRenderer development notes"
---

MToon 的 Base/Shade、MatCap、Rim 与 Emission 已经能够构成完整的风格化表面，但角色轮廓仍完全依赖颜色和明暗关系。第五阶段在现有 HDR Forward Pipeline 中加入两条互补的描边路径：Inverse Hull 负责稳定的物体外轮廓和材质级宽度控制，屏幕空间边缘检测负责深度断层与法线突变形成的内部结构线。

两类结果不是直接写入最终窗口。Forward Pass 先输出 HDR Color、World Normal 与 Depth；Outline Mask Pass 使用扩张背壳生成带颜色的 Shell Mask；Screen Space Outline Pass 再读取四张纹理，完成深度边缘、法线边缘、Shell Mask 合并和 HDR 颜色覆盖；Post Process 最后执行曝光、Tone Mapping 与 Gamma Correction。

~~~text
ShadowPass
  → Shadow Map

ForwardOpaquePass
  ├→ HDR Color
  ├→ Encoded World Normal
  └→ Depth

OutlineMaskPass
  ├← Forward Depth
  └→ Colored Shell Outline Mask

ScreenSpaceOutlinePass
  ├← HDR Color
  ├← Normal
  ├← Depth
  ├← Shell Mask
  └→ Outlined HDR Color

PostProcessPass
  └→ Backbuffer
~~~

## 描边系统的类与资源关系

| 层级 | 类型 | 职责 |
| --- | --- | --- |
| Material | `MToonOutlineParameters` | 保存材质级描边开关、模式、宽度、颜色和光照混合 |
| Material | `MToonTextureBindings` | 保存 Outline Width Mask Texture Handle |
| Graphics | `CullMode` | 控制 Inverse Hull 绘制正面、背面或关闭剔除 |
| Graphics | `Framebuffer` | 支持多个颜色附件组成 MRT |
| Graphics | `DepthTextureDesc` | 区分普通深度采样和硬件比较采样 |
| Pipeline | `FrameContext` | 在 Pass 间传递 HDR、Normal、Depth 与 Outline Mask |
| Pass | `ForwardOpaquePass` | 生成场景颜色、表面法线和深度 |
| Pass | `OutlineMaskPass` | 扩张 MToon 网格并渲染带颜色的背壳 Mask |
| Pass | `ScreenSpaceOutlinePass` | 检测深度/法线边缘并合成新的 HDR 输出 |
| Viewer | `ViewerPanels` | 编辑材质描边、全局屏幕描边与 Debug View |

描边参数分为两个层级。`MToonOutlineParameters` 属于具体材质，可以让角色皮肤、头发、衣服使用不同宽度和颜色；`ScreenSpaceOutlineSettings` 属于整个视图，统一控制深度和法线边缘检测。前者跟随 Material Instance 保存到 Sidecar，后者保存在 Screen Space Pass 中并由 Viewer 实时调整。

## MToonOutlineParameters：材质级轮廓设置

`MToonMaterialParameters` 新增 `outline` 参数块：

~~~cpp
enum class OutlineWidthMode : std::uint8_t
{
    World,
    Screen
};

struct MToonOutlineParameters
{
    bool enabled = false;
    OutlineWidthMode widthMode = OutlineWidthMode::Screen;
    float width = 1.0F;
    glm::vec3 color{0.0F};
    float lightingMix = 0.0F;
};
~~~

`enabled` 决定该材质是否进入 Inverse Hull Pass；`width` 表示世界空间距离或屏幕像素数，含义由 Width Mode 决定；`color` 是线条基础颜色；`lightingMix` 控制轮廓是否受方向光颜色与强度影响。

默认关闭 Outline，避免普通模型切换到 MToon 时自动多出外壳 Draw Call。默认 Width Mode 为 Screen，使角色远近变化时仍保持接近固定的像素粗细。Color 默认为黑色，Lighting Mix 为 0，此时轮廓不受主光变化影响。

### Outline Width Mask

`MToonTextureBindings` 增加 `outlineWidthMaskTexture`。Mask 红色通道乘在材质 Outline Width 上：

~~~text
finalWidth = max(outline.width, 0) × clamp(mask.r, 0, 1)
~~~

白色区域使用完整宽度，黑色区域不发生顶点扩张，灰色区域产生过渡。它可以减弱面部、手指或细小饰品的轮廓，同时保留头发和服装外边缘。空 Handle 使用 White Texture，因此没有提供 Mask 的材质仍按统一宽度绘制。

Outline Width Mask 是控制数据，Sidecar 加载时按 `ColorSpace::Linear` 导入。若误用 sRGB，采样值会经过非线性解码，中间灰度对应的实际宽度将发生偏移。

### Sidecar 中的描边记录

MToon Sidecar 新增 Outline Object 和 Width Mask 路径：

~~~json
{
  "outline": {
    "enabled": true,
    "widthMode": "screen",
    "width": 2.0,
    "color": [0.03, 0.04, 0.06],
    "lightingMix": 0.25
  },
  "textures": {
    "outlineWidthMask": "textures/body_outline_mask.png"
  }
}
~~~

Serializer 将 Width Mode 写成 `world` 或 `screen`，读取时拒绝其他字符串；Width 限制到 `[0, 100]`，Color 分量和 Lighting Mix 限制到 `[0, 1]`。Capture 将 Texture Handle 转换为 Sidecar 目录下的相对路径，Apply 则使用 TextureImporter 恢复为 Linear TextureAsset。

## Framebuffer：从单颜色附件扩展到 MRT

屏幕空间法线边缘要求每个可见片元输出表面法线。重新绘制一遍所有物体会增加 Draw Call 和顶点处理，因此 Forward Pass 在写颜色时同步写出 Normal。`FramebufferDesc` 的单个 `colorTexture` 被替换为：

~~~cpp
std::span<const RenderTexture* const> colorTextures;
~~~

Framebuffer 创建时遍历所有颜色纹理，依次连接到 `GL_COLOR_ATTACHMENT0 + index`，再调用 `glNamedFramebufferDrawBuffers()` 启用对应输出。创建逻辑还会查询 `GL_MAX_COLOR_ATTACHMENTS` 与 `GL_MAX_DRAW_BUFFERS`，使用两者较小值验证附件数量。

所有 Color 与 Depth Attachment 必须有效且 Extent 一致。Forward Framebuffer 使用：

~~~text
Color Attachment 0: RGBA16F HDR Color
Color Attachment 1: RGBA8 Encoded World Normal
Depth Attachment:   Depth24Stencil8
~~~

Outline Mask Framebuffer 只有一个 RGBA8 Color Attachment，并复用 Forward Depth；Screen Space Outline Framebuffer 只有一个 RGBA16F Color Attachment，用于保存合成后的 HDR 结果。

## ForwardOpaquePass：输出颜色、法线与深度

`ForwardOpaquePass` 新增 `normal_` RenderTexture，并在 Resize 时与 HDR Color、Depth、Framebuffer 一起事务式重建。全部资源创建成功后才移动覆盖成员，避免窗口缩放失败后留下附件尺寸不一致的状态。

执行开始时，Pass 将三种结果写入 FrameContext：

~~~cpp
frame.hdrColor = &hdrColor_;
frame.normal = &normal_;
frame.depth = &depth_;
frame.framebuffer = &framebuffer_;
~~~

所有材质 Shader 都增加 `layout(location = 1) out vec4 outNormal`。世界空间法线从 `[-1,1]` 编码到 `[0,1]`：

~~~text
encodedNormal = normal × 0.5 + 0.5
~~~

MToon 输出 Normal Map 扰动后的 Surface Normal，Basic PBR 同样输出最终着色法线，Unlit 和 Debug Normal 则输出几何法线。屏幕空间边缘检测因此不依赖当前表面着色模式。

Normal Attachment 清理为 `(0.5, 0.5, 1.0, 0.0)`。RGB 对应中性法线编码，Alpha 为 0 表示没有几何覆盖。实际片元输出 Alpha 1，Screen Space Pass 可以借此跳过背景和无效邻居，避免 Normalize 一个没有表面含义的清屏值。

### FrameContext 的资源链

FrameContext 新增两个非拥有指针：

~~~cpp
RenderTexture* normal = nullptr;
RenderTexture* outlineMask = nullptr;
~~~

Forward Pass 生产 Normal，Outline Mask Pass 生产 Outline Mask，Screen Space Outline Pass 同时消费两者。合成完成后，它把 `frame.hdrColor` 从原始 Forward Color 改写为自己的 `outlinedHdrColor_`，Post Process 不需要知道 HDR 颜色经过了多少中间阶段。

这种“生产者更新逻辑资源指针”的方式延续了第三阶段的 FrameContext 设计。Pass 只依赖当前指针指向的有效结果，而不直接持有其他 Pass 对象。

## GraphicsDevice：轮廓绘制需要的状态接口

Inverse Hull 依赖面剔除和深度写入控制，Graphics 层新增：

~~~cpp
void setCullMode(CullMode mode);
void setDepthWrite(bool enabled);
void clearColorAttachment(uint32_t index, const ClearValue& value);
~~~

`CullMode::Front` 只保留网格背面，是普通 Inverse Hull 的核心；`CullMode::Back` 用于镜像变换后的反向绕序；`CullMode::None` 在 Pass 结束时恢复为主渲染当前使用的无剔除状态。`setDepthWrite(false)` 保持深度测试仍然启用，但不允许扩张外壳修改 Forward Depth。

`clearColorAttachment()` 使用 `glClearBufferfv` 清理指定 MRT Attachment。Forward Pass 可以单独把 Normal Attachment 清成 Alpha 0，而不影响 HDR Color；Outline Mask Pass也可以清空自己的 Color Attachment，而不清理与 Forward 共享的 Depth。

## OutlineMaskPass：Inverse Hull 外轮廓

`OutlineMaskPass` 拥有 Outline Shader、RGBA8 Mask Texture 和 Framebuffer。Mask Texture 随窗口 Extent 创建，Framebuffer 则推迟到 Execute 阶段建立，因为它需要连接由 Forward Pass 拥有的 Depth Texture。

~~~text
OutlineMaskPass owns:
  Outline Mask Texture
  Outline Framebuffer
  Outline Shader

OutlineMaskPass borrows:
  Forward Depth
  RenderWorld Items
  Material Instances
  Runtime Resource Cache
~~~

`ensureFramebuffer()` 验证 Mask 与 Forward Depth 尺寸一致，再将二者组合为 Framebuffer。窗口 Resize 后，Mask 被重建并清空旧 Framebuffer；下一次 Execute 会使用新的 Forward Depth 重新连接附件。

### 为什么共享 Forward Depth

Inverse Hull 把顶点沿法线向外扩张。如果完全不进行深度测试，模型背后的壳层也可能覆盖到画面前方；如果让它重新写深度，又会污染后续依赖真实表面深度的屏幕空间检测。

Pass 因此复用 Forward Depth，并设置：

~~~text
Depth Test:  enabled
Depth Write: disabled
Cull Mode:   front faces
~~~

只有扩张后位于可见表面外侧、同时通过现有深度测试的背面片元写入 Mask。Forward Depth 保持不变，可以继续交给 Screen Space Pass。

### Draw Item 筛选

Pass 遍历 `RenderWorld::items`，只处理：

- Opaque Render Item；
- Primitive 与 Material Instance 有效；
- Instance 包含 MToon Parameters；
- Outline Enabled；
- Outline Width 大于 0。

因此 Outline Mask Draw Call 数量只与启用材质的可见 Primitive 有关。没有 MToon 或没有开启 Outline 的物体不会产生额外壳层绘制。

### 世界空间宽度

World Mode 直接在世界空间扩张：

~~~text
expandedWorldPosition = worldPosition + worldNormal × finalWidth
clipPosition = ViewProjection × expandedWorldPosition
~~~

宽度使用场景单位，近处看起来更粗，远处自然变细。它适合希望轮廓具有真实空间尺度的物体，但不同模型尺度需要分别调整 Width。

### 屏幕空间宽度

Screen Mode 先分别投影原位置和沿法线移动一个世界单位的位置，得到法线在屏幕上的方向：

~~~text
positionNdc = clip.xy / clip.w
normalNdc = normalClip.xy / normalClip.w
directionPixels = (normalNdc - positionNdc) × viewport × 0.5
screenDirection = normalize(directionPixels)
pixelOffset = screenDirection × finalWidth
ndcOffset = pixelOffset × 2 / viewport
clip.xy += ndcOffset × clip.w
~~~

Width 此时近似表示像素数。乘回 `clip.w` 是因为最终还会执行透视除法；若直接把 NDC Offset 加到 Clip Position，远近物体的最终偏移会不一致。

投影后的法线方向可能在正对相机处趋近零。Shader 检查 Clip W 与方向长度，无法得到稳定方向时不做偏移，避免产生 NaN 顶点破坏整个三角形。

### 镜像变换与剔除方向

负缩放会改变三角形绕序。Pass 计算：

~~~text
determinant(mat3(world)) < 0
~~~

行列式为负表示变换翻转了手性，此时将 Cull Mode 从 Front 改为 Back。否则镜像模型会剔除错误的一面，导致描边缺失或内部壳层可见。

### Outline Color 与 Lighting Mix

Mask 的 RGB 直接保存最终 Shell Outline Color，Alpha 保存 Coverage。颜色计算为：

~~~text
lightRadiance = max(lightColor, 0) × max(intensity, 0)
outlineLighting = mix(1, lightRadiance, lightingMix)
finalOutlineColor = outlineColor × outlineLighting
~~~

Lighting Mix 为 0 时轮廓保持美术指定颜色，为 1 时完全跟随方向光颜色与强度。Mask 保存的是 HDR 合成前的线性颜色，后续与场景 HDR Color 混合后一起进入 Tone Mapping。

## ScreenSpaceOutlinePass：深度与法线边缘

`ScreenSpaceOutlinePass` 使用与 Post Process 相同的全屏三角形，片元 Shader 同时绑定：

~~~text
slot 0: Forward HDR Color
slot 1: Shell Outline Mask
slot 2: Forward Depth
slot 3: Forward Normal
~~~

Pass 自己拥有一张 `RGBA16F outlinedHdrColor_` 和无 Depth Attachment 的 Framebuffer。每帧只提交一次全屏 Draw Call；完成后将该纹理设为新的 `frame.hdrColor`。

### ScreenSpaceOutlineSettings

~~~cpp
struct ScreenSpaceOutlineSettings
{
    bool enabled = false;
    glm::vec3 color{0.0F};
    float width = 1.0F;
    float depthThreshold = 0.01F;
    float normalThreshold = 0.2F;
    OutlineDebugView debugView = OutlineDebugView::Final;
};
~~~

Screen Outline 默认关闭，但 Pass 仍会执行 Shell Mask Composite。这样材质级 Inverse Hull 与全局屏幕边缘可以独立启用；关闭 Screen Outline 不会让 MToon Shell 描边消失。

### 深度线性化

Depth Buffer 保存的是投影后的非线性深度，靠近 Near Plane 的精度更高。直接比较纹理值会让同样的世界空间距离在近处和远处产生不同响应。RenderExtractor 因此把 Camera Near/Far 写入 `RenderView`，Composite Shader 再恢复 View Space 深度：

~~~text
z_ndc = depth × 2 - 1
linearDepth = 2 × near × far /
              [far + near - z_ndc × (far - near)]
~~~

背景深度接近 1 时直接跳过中心像素，避免整片天空被识别为几何边缘。

### 深度边缘检测

Shader 以中心像素为基准，在 `3×3` 邻域采样八个方向。采样间距为：

~~~text
offset = texelSize × max(screenOutlineWidth, 1)
~~~

Width 增大并不是执行多轮形态学膨胀，而是扩大比较半径。它会检测更远邻居形成更宽的响应范围，同时也可能跨过更细的几何细节。

每个邻居使用相对深度差：

~~~text
relativeDifference = abs(neighborDepth - centerDepth) /
                     max(centerDepth, epsilon)
~~~

除以中心深度可以减弱观察距离对阈值的影响。八个方向取最大差异，再用：

~~~text
smoothstep(threshold, threshold × 2, maximumDifference)
~~~

生成连续 Coverage。Depth Threshold 越小，对细微深度变化越敏感；过小会把曲面量化和远距离噪声也识别为轮廓。

### 法线边缘检测

Normal Texture 的 RGB 先从 `[0,1]` 解码回 `[-1,1]`。中心或邻居 Alpha 为 0 时表示没有表面数据，对应采样会被跳过。

法线差异定义为：

~~~text
normalDifference = 1 - clamp(dot(centerNormal, neighborNormal), -1, 1)
~~~

两法线同向时结果为 0，垂直时为 1，反向时为 2。八个邻居同样取最大值，并通过 Normal Threshold 到两倍 Threshold 的 Smoothstep 转换为 Coverage。

深度边缘擅长检测物体轮廓、遮挡交界和明显台阶，法线边缘擅长检测深度连续但朝向突变的折角、硬表面分区和 Normal Map 细节。两者取最大值：

~~~text
screenCoverage = max(depthEdge, normalEdge)
~~~

## 合并 Shell 与 Screen Edge

Shell Mask Alpha 是 Inverse Hull Coverage，Screen Coverage 来自深度/法线检测。最终覆盖率为：

~~~text
combinedCoverage = max(shellCoverage, screenCoverage)
~~~

颜色选择遵循 Shell 优先：当前像素只要存在 Shell Coverage，就使用 Mask 中保存的材质级 Outline Color；否则使用全局 `ScreenOutlineColor`。最后在线性 HDR 空间混合：

~~~text
composited = mix(hdrColor, outlineColor, combinedCoverage)
~~~

这种组合保留了材质对外轮廓颜色的控制，同时让屏幕空间内部线使用统一颜色。两种 Coverage 重叠时不重复叠加，也不会因为两次 Alpha Blend 让线条过黑。

## OutlineDebugView：检查每一种中间数据

Screen Space Pass 提供六种输出：

| 模式 | 显示内容 | 适合检查 |
| --- | --- | --- |
| Final | 最终 HDR 合成 | 整体描边结果 |
| Surface Normal | Forward Normal Attachment | 法线输出、背景 Alpha、Normal Map |
| Linear Depth | Near/Far 归一化深度 | 深度范围和相机参数 |
| Shell Outline Mask | Inverse Hull Coverage | 材质开关、宽度、剔除与 Depth Test |
| Screen Edge | Depth/Normal 合并边缘 | Width 和两个 Threshold |
| Combined Outline | Shell 与 Screen 最终 Coverage | 两种算法的覆盖关系 |

Surface Normal 直接显示已经编码的 RGB；无几何覆盖处显示黑色。Linear Depth 将恢复后的深度映射到 Near/Far 区间，Far Plane 和背景趋近白色。其余三种 Mask View 使用灰度显示 Coverage，不受 Outline Color 与 Tone Mapping 干扰。

调试顺序可以从输入到输出逐层推进：先看 Surface Normal 和 Linear Depth，再看 Shell Mask 与 Screen Edge，最后看 Combined Outline。若输入正确而 Screen Edge 全黑，问题通常是 Threshold 过高；若 Shell Mask 缺块，则应检查材质参数、Width Mask、镜像变换和 Cull Mode。

## Pipeline：五个 Pass 的执行顺序

Viewer 将管线组装为：

~~~text
0 ShadowPass
1 ForwardOpaquePass
2 OutlineMaskPass
3 ScreenSpaceOutlinePass
4 PostProcessPass
~~~

顺序与资源依赖严格对应：Outline Mask 必须等待 Forward Depth，Screen Space 必须等待 Forward 的 HDR/Normal/Depth 和 Shell Mask，Post Process 必须读取已经合成轮廓的 HDR Color。

~~~mermaid
flowchart TD
    A["RenderExtractor"] --> B["RenderWorld"]
    B --> C["ShadowPass"]
    B --> D["ForwardOpaquePass"]
    C --> D
    D --> E["HDR + Normal + Depth"]
    B --> F["OutlineMaskPass"]
    E --> F
    F --> G["Shell Mask"]
    E --> H["ScreenSpaceOutlinePass"]
    G --> H
    H --> I["Outlined HDR"]
    I --> J["PostProcessPass"]
    J --> K["Backbuffer"]
~~~

`OutlineMaskPass` 可能没有任何 Draw Call，但仍会清空并输出有效 Mask；`ScreenSpaceOutlinePass` 即使 Screen Outline Disabled 也保持一次全屏 Draw Call，用于 Shell Composite 和 Debug View。Viewer 因而将其状态区分为 Active、Composite Only、Debug View、Idle 和 Failed。

## ViewerPanels：材质描边与全局边缘控制

MToon 材质面板新增 Outline Group：

- Outline Enabled；
- Width Mode：World / Screen；
- Outline Width；
- Outline Color；
- Outline Lighting Mix；
- Outline Width Mask 状态。

World Mode 的 Drag Speed 更小，适合按场景单位精调；Screen Mode 使用更大的步进，以像素为单位调整。参数直接写入选中的 MToon Material Instance，并随下一帧 Outline Mask Pass 生效。

全局 Screen Space Outline 面板提供：

- Screen Outline Enabled；
- Screen Outline Color；
- Screen Outline Width，范围 1 到 8；
- Depth Threshold，范围 0.001 到 0.1；
- Normal Threshold，范围 0.01 到 1；
- Outline Debug View。

这些设置通过 `ScreenSpaceOutlinePass::setSettings()` 整体更新。材质 Outline 与全局 Screen Outline 分开显示，避免把“某个材质是否画壳”和“整张画面是否检测边缘”混为同一种开关。

诊断面板同时显示两个新 Pass 的执行状态、Draw Call、GPU Time、Render Target Extent、Format 与 Rebuild Count。Forward Target 统计增加 Normal Format，便于确认 MRT 已成功建立。

## 方向光阴影的同步调整

描边系统引入了更多对 Depth 和轮廓稳定性的观察，方向光阴影也同步改用比较采样与加权 PCF。`DepthTextureDesc` 新增 `comparisonSampling`：开启后设置 `GL_COMPARE_REF_TO_TEXTURE`、`GL_LEQUAL` 和 Linear Filter，Shader 使用 `sampler2DShadow` 直接提交 `(uv, referenceDepth)`。

`3×3` PCF 权重由均匀九宫格改为可分离的 `[1,2,1] × [1,2,1]`，总权重为 16。中心和相邻轴向样本权重更高，阴影边缘比简单九点平均更平滑。

Shadow Pass 写入深度时启用：

~~~text
glPolygonOffset(factor = 2, units = 4)
~~~

它在 Rasterization 阶段偏移 Shadow Depth，减少表面与自身深度图竞争造成的 Shadow Acne。MToon 的 Shadow Bias 改用 Geometric Normal，而不是 Normal Map 扰动后的 Surface Normal，避免细碎法线纹理让 Bias 在相邻像素间剧烈变化。

Forward Pass 还创建 1×1 Comparison Depth 作为 Fallback Shadow Map。即使阴影关闭或 Shadow Pass 没有输出，PBR/MToon Shader 的 `sampler2DShadow` 仍绑定类型匹配的有效纹理，同时由 `uShadowEnabled` 决定是否使用结果，避免未绑定 Sampler 带来的未定义状态或驱动验证错误。

## 使用与调试顺序

材质外轮廓可以按以下顺序调整：

1. 选择 MToon Material，开启 Outline；
2. 切换 Shell Outline Mask Debug View；
3. 先用 Screen Width Mode 确认外轮廓完整；
4. 调整 Width 与 Width Mask，控制不同部位线宽；
5. 设置 Color 与 Lighting Mix；
6. 检查镜像部件和双面几何是否保持正确剔除；
7. 保存 MToon Sidecar。

屏幕空间结构线可以按以下顺序调整：

1. 在 Surface Normal View 检查法线是否连续且背景为无效值；
2. 在 Linear Depth View 检查 Near/Far 与场景深度；
3. 开启 Screen Outline；
4. 暂时提高 Normal Threshold，只调整 Depth Threshold；
5. 暂时提高 Depth Threshold，再调整 Normal Threshold；
6. 恢复两者并调整 Width；
7. 在 Combined Outline View 检查与 Shell 的重叠；
8. 回到 Final 检查 HDR 合成和 Tone Mapping 后的颜色。

常见问题可以按资源链定位：

| 现象 | 检查位置 | 可能原因 |
| --- | --- | --- |
| 所有 Shell Mask 为黑 | Material Outline | 未启用、Width 为 0 或没有 MToon Parameters |
| 镜像部件没有轮廓 | Cull Mode | World Matrix 手性翻转未处理 |
| 轮廓穿过物体表面 | Shared Depth | Depth Test 或 Forward Depth Attachment 不正确 |
| 描边后深度检测异常 | Depth Write | Shell Pass 修改了 Forward Depth |
| 远处 World Outline 太细 | Width Mode | 世界宽度受透视缩小，改用 Screen Mode |
| 面部描边过粗 | Width Mask | Mask 缺失或应降低对应区域灰度 |
| 天空出现 Screen Edge | Normal Alpha / Depth | 背景有效性判断不正确 |
| 整个曲面布满法线线条 | Normal Threshold | 阈值太低或 Normal Map 频率过高 |
| 深度边缘随距离变化明显 | Linearization | Near/Far 未传入或比较了非线性深度 |
| Outline Color 被压暗 | Lighting Mix | 材质轮廓混入了方向光 Radiance |
| Post Process 看不到描边 | FrameContext HDR | Composite 后未更新 `frame.hdrColor` |

## 描边管线的延伸

第五阶段把轮廓从单一 Shader 技巧扩展为多资源、多 Pass 系统。Material Instance 决定具体表面的 Shell 风格，Forward MRT 提供屏幕空间输入，Outline Mask Pass 生成材质化外轮廓，Screen Space Pass 补充深度和法线结构线，FrameContext 则让结果沿 HDR 管线继续传递。

现有结构可以继续加入不同颜色的对象 ID Edge、可分离膨胀/腐蚀、半分辨率 Outline、Temporal Stability、距离自适应阈值，以及透明物体的专用轮廓。MRT Normal 也可以被 SSAO、Decal 或其他屏幕空间效果复用；Shell Mask 中的 RGB/Alpha 还可以扩展为更多材质分类信息。

两种描边方式保留各自优势：Inverse Hull 与物体几何和材质绑定，外轮廓稳定且可按区域控制；Screen Space 与几何复杂度无关，只需一次全屏绘制便能发现遮挡与内部折角。通过共享 Forward 结果并在 HDR 阶段统一合成，它们成为同一渲染框架中的互补 Pass，而不是互相覆盖的两套特效。
