---
title: "StylizedRenderer：实时风格化角色渲染框架"
description: "完整项目文档：从资产导入、渲染管线到 MToon、动画、GPU Morph 与 Viewer。"
category: "Graphics / Rendering"
track: "Computer Graphics"
level: advanced
status: ready
published: true
minutes: 60
order: 1101
tags: ["C++", "OpenGL", "GLSL", "NPR", "Rendering"]
---

StylizedRenderer 是一个基于 C++ 和 OpenGL 实现的实时风格化渲染项目，当前主要面向三渲二角色渲染场景。

所谓“三渲二”，是指使用三维模型、三维变换、三维动画和实时光照等技术作为基础，但最终呈现出接近二维动画或插画的视觉效果。与传统写实渲染相比，风格化渲染并不一定追求物理上的完全准确，而更加关注画面的艺术表现，例如：

明确的明暗分界；
稳定的角色面部光照；
可控的阴影颜色；
清晰的角色轮廓；
具有艺术风格的高光、边缘光和材质表现；
角色表情、头发和服装在动画过程中的稳定性。
这个项目并不是为了实现一个完整的游戏引擎，而是希望围绕风格化角色渲染，搭建一个结构清晰、便于扩展和调试的实时渲染框架。

项目的最终使用形态是一个角色查看器。用户可以在 Viewer 中加载角色模型，调整材质和光照参数，切换不同的渲染调试模式，播放角色动画，并观察阴影、描边和后处理等效果。

## 技术栈
技术	用途
C++20	引擎、场景、资产和渲染逻辑
GLSL	Vertex Shader、Fragment Shader 和 Compute Shader
OpenGL 4.5 Core	图形 API 和 GPU 渲染后端
CMake	项目构建和依赖管理
GLFW	窗口、输入和 OpenGL Context 创建
GLAD	OpenGL 函数加载
GLM	向量、矩阵、四元数和空间变换计算
Assimp	模型、场景、材质、骨骼和动画数据导入
stb_image	图像文件解码
Dear ImGui	Viewer 调试面板和参数控制
nlohmann/json	相机数据和材质配置等 JSON 数据处理
Blender Python	模型转换、动画烘焙、相机导出和辅助资产处理

## 目录结构
```
StylizedRenderer/
├── CMakeLists.txt
├── CMakePresets.json
├── README.md
├── cmake/
├── engine/
├── apps/
│   └── viewer/
├── assets/
│   └── shaders/
├── tools/
│   └── blender/
└── build/
```

### engine
`engine` 是项目的核心引擎库，包含与具体 Viewer 界面无关的基础能力：
```
engine/
├── include/
│   ├── animation/
│   ├── asset/
│   ├── core/
│   ├── graphics/
│   ├── material/
│   ├── math/
│   ├── platform/
│   ├── render/
│   └── scene/
└── src/
    ├── animation/
    ├── asset/
    ├── core/
    ├── graphics/
    ├── material/
    ├── math/
    ├── platform/
    ├── render/
    └── scene/
```
这些模块功能如下：
- `core` : 应用生命周期和基础类型。
- `platform` : 窗口、输入等平台相关功能。
- `graphics` : OpenGL Context、GraphicsDevice和 GPU 资源的封装。
- `asset` : 模型、纹理、材质、动画等字串的导入。
- `scene` : Entity、Transform、Camera 和场景数据。
- `material` : Material Template、 Material Instance 和 MToon 参数。
- `render` : RenderWorld、 Render Pass、 Frame Pipeline 和 渲染资源。
- `animation` : 骨骼动画、 Morph Target 和 表情状态。
- `math` : 包围盒、视锥体和其他数学辅助结构。

### apps/viewer
apps/viewer 是项目当前的应用程序入口。

它主要负责：
- 创建和管理应用；
- 读取模型和相机数据；
- 创建运行时场景；
- 构建 Render Pipeline；
- 管理 Viewer 的用户输入；
- 创建 ImGui 界面；
- 展示渲染调试视图；
- 显示 CPU/GPU 性能信息；
- 连接底层引擎模块。

### assets/shaders
存放 GLSL Shader，按照功能拆分如下：
```
assets/shaders/
├── foundation/
├── static_model/
├── material/
├── shadow/
├── face_hair_shadow/
├── outline/
├── postprocess/
└── morph/
```
不同目录对应不同渲染阶段或材质功能：
- `foundation` : 基础绘制。
- `static_model` : 静态模型。
- `material` : Unlit、 PBR、 MToon 和法线调试。
- `shadow` : 阴影绘制。
- `face_hair_shadow` : 面部和头发阴影。
- `outline` : 描边和边缘检测。
- `postprocess` : 后处理和 FXAA.
- `morph` : Moprh Target 顶点变形。

### tools/blender
tools/blender 存放与 Blender 相关的 Python 工具。

## 一帧画面的数据流
一帧画面生成大致需要以下步骤：
1. 外部资产
2. 资产导入
3. CPU 侧资产
4. GPU 侧运行时资源创建
5. `Scene`
6. `RenderExtractor`
7. `RenderWorld`
8. `FrameContext`
9. `FramePipeline`
10. 多个 `RenderPass`
11. `GraphicsDevice`
12. `OpenGL`
13. `GPU Shader` 执行
14. 最终屏幕图像

### 资产导入
项目首先从磁盘中读取模型、纹理、材质、骨骼和动画数据。

模型导入主要使用 `Assimp` 完成，导入器将外部文件中的数据转换为引擎内的数据结构，包含：节点层级、网格和 Primitive 、顶点位置、法线和切线、UV、顶点颜色、索引、材质参数、纹理引用、骨骼权重、动画关键帧、Morph Target数据等。

这个阶段的结果属于 CPU 侧资产数据，主要用于描述文件内容。

### 创建运行时资源
由于 CPU 侧资产还不能直接拿给 GPU 使用，引擎需要依据上一步导入的 CPU 侧数据，创建对应的运行时资源：
1. 顶点数据上传到 Vertex Buffer
2. 索引数据上传到 Index Buffer
3. 顶点布局创建到 Vertex Array
4. 纹理数据上传到 OpenGL Texture
5. 材质参数与 Shader Program 建立绑定
6. 需要动画的模型创建 Skinning Palette
7. 需要 Morph Target 的模型创建对应的 GPU Buffer

该步骤中涉及的对象主要位于 `render/resources` 和 `graphics/resources` 中。

其中，`graphics` 主要描述 OpenGL 资源，`render` 描述这些 GPU 资源如何作为模型、材质和实例参与渲染。

### Scene 更新
运行时 Scene 保存当前帧的逻辑状态，例如 Transform、Camera 相关数据、角色当前播放的动画、当前 Morph 权重、灯光参数、材质参数、渲染开关等。

### RenderExtractor 提取渲染数据
RenderExtractor 将 Scene 中的数据整理为当前帧的渲染数据，它需要计算：
1. 每个物体的世界矩阵、法线矩阵
2. 世界空间包围盒
3. 当前使用的材质实例
4. 当前使用的 Vertex Array
5. 当前使用的 Skinning Palette
6. 物体的材质分类
7. 阴影投射和接收标志
8. Object ID
9. 描边策略索引
10. 当前相机的视锥体
11. 主光源和环节光数据

也就是说 Scene 不需要知道某个 Entity 最终使用哪个 Vertex Array；Render Pass 也不需要完整理解层级结构，Render Extractor 将两者之间的数据完成转换。

### RenderWorld
RenderWorld 是面向渲染的一帧数据快照，包含：
1. 当前渲染视图
2. 当前帧需要绘制的 RenderItem
3. 阴影 RenderItem
4. 面部和头发阴影 RenderItem
5. 不透明物体
6. 遮罩物体
7. 透明物体
8. 光源数据
9. 相机和裁剪信息
10. 材质相关选项

经过从 Scene 中提取后，RenderWorld 的好处是每一个 Pass 都可以直接获取所需数据，不再需要访问复杂的 Scene 结构。

### FrameContext
FrameContext 保存一帧渲染过程中需要共享的资源和配置。

包含：
1. framebuffer 尺寸
2. RenderWorld
3. HDR 颜色纹理
4. LDR 颜色纹理
5. normal 纹理
6. material ID 纹理
7. outline mask
8. depth texture
9. shadow map
10. 面部和头发阴影纹理
11. delta time
12. 阴影开关
13. exposure
14. tone mapping 开关
15. FXAA 开关

FrameContext 不负责决定每个 Pass 的具体算法，而是为每个 Pass 提供输入和输出资源。

### FramePipeline
FramePipeline 按固定顺序执行多个 Pass.

在本项目中包含的 Pass 如下：
1. ShadowPass
2. FaceHairShadowPass
3. ForwardOpaquePass
4. ForwardTransparentPass
5. OutlineMaskPass
6. ScreenSpaceOutlinePass
7. PostProcessPass
8. FxaaPass

Pass 需要实现统一的接口，处理：资源resize、当前帧执行、读写纹理和Framebuffer等。

Pipeline 的职责是组织执行顺序。

### OpenGL 和 GPU 执行
每个 Pass 都会调用 GraphicsDevice 中的工具，使用 OpenGL 资源接口，例如：
1. 绑定 Framebuffer
2. 绑定 Shader Program
3. 绑定 Texture
4. 设置 uniform
5. 绑定 Vertex Array
6. 设置深度测试和混合状态
7. 发起 Draw Call
8. 执行 Compute Dispatch
9. 读取 GPU Timer Query

## 重点设计思路
### Scene 和渲染数据分离
Scene 主要面向场景逻辑和编辑，而RenderWorld 更关心当前帧绘制。
- Renderer 不需要了解全部场景细节。
- Pass 可以直接使用线性数组进行遍历。
- 渲染可以集中完成裁剪和分类。

### GPU 资源与 RAII
OpenGL 资源通常用整数形式的 name 表示，例如 Buffer 之类的 ID.

但裸的 ID 实际上并没有明确的所有权，如果所有代码都不加限制的创建和删除资源，容易出现重复释放、资源泄漏、移动后不同对象持有同一个 ID 的问题。

本项目对 GPU 资源进行封装，使用 RAII 和移动语义管理生命周期。

### Render Pass 独立组织
不同渲染阶段有不同的输入和输出，如果将所有逻辑塞到一个巨大函数中，后续不同渲染效果与计算会变得难以维护。

独立 Pass 的方式将每个阶段拥有清晰职责。

## 图像基础设施与应用生命周期
在分析资产导入、渲染管线和风格化算法前，我们需要先简单介绍下该项目如何创建一个可用的 OpenGL 环境。

### Application
Application 是程序生命周期的基础框架，初始化过程位于：
```
engine/include/core/Application.hpp
engine/src/core/Application.cpp
```

构造一个 `Application` 时，依次创建：
```cpp
window_ = std::make_unique<platform::Window>(windowDesc);
glContext_ = std::make_unique<graphics::OpenGLContext>(*window_);
graphicsDevice_ = std::make_unique<graphics::GraphicsDevice>(*glContext_);
```

Window 必须先存在，OpenGLContext 才能绑定到特定窗口，GraphicsDevice 才能安全地创建和操作 GPU 资源。

Application 通过四个虚函数将通用生命周期交给具体应用扩展：
```
virtual bool onInit();
virtual void onUpdate(float deltaTime);
virtual void onRender();
virtual void onShutdown();
```

最终我们使用的 Viewer 的 `ViewerApplication` 继承自该类，并分别完成：
- `onInit` : 创建Shader、渲染资源、UI 和场景。
- `onUpdate` : 处理输入、相机、动画和表情。
- `onRender` : 提取 RenderWorld 并执行 FramePipeline.
- `onShutdown` : 释放场景、Render Pass 和运行时 GPU 资源。

### Window 与 OpenGLContext
Window 模块对 GLFW 窗口进行了简单封装，负责：
- 创建和销毁窗口；
- 轮询窗口事件；
- 交换前后缓冲区；
- 查询输入
- 获取 framebuffer 尺寸
- 暴露必要的原生窗口句柄

### 主循环
`Application::run` 负责驱动主循环:
```
轮询窗口事件：
1. 获取 framebuffer 尺寸
2. 计算 deltaTime
3. 设置 viewport
4. onUpdate
5. onRender
6. swapBuffers
```

### GraphicsDevice
Context 初始化完成后，Application 会创建 `GraphicsDevice`.

GraphicsDevice 对上层提供两类能力：

1. 渲染状态与绘制命令：
```
setViewport
setCullMode
setDepthTest
setDepthWrite
setAlphaBlending
clear
bindFramebuffer
drawIndexed
```
2. GPU 资源创建：
```
createBuffer
createVertexArray
createShaderProgram
createTexture2D
createRenderTexture
createDepthTexture
createFramebuffer
createGpuTimerQuery
```

### GPU 资源与 RAII
项目将常用 GPU 对象封装为 C++ 类型：
```
Buffer
VertexArray
Texture2D
RenderTexture
DepthTexture
Framebuffer
ShaderProgram
GpuTimeQuery
```

这些对象具有以下特征：
1. 保存一个 OpenGL 对象 ID.
2. 禁止复制。
3. 支持移动。
4. 析构时释放对应资源。
5. 可以通过 `isValid` 判断创建是否成功。

以 Buffer 为例：
```
class Buffer final : public core::NonCopyable
{
public:
    Buffer(Buffer&& other) noexcept;
    Buffer& operator=(Buffer&& other) noexcept;
    ~Buffer();

private:
    uint32_t id_ = 0;
};
```

如果允许复制，那么两个对象可能同时认为自己拥有同一个OpenGL Buffer，最终造成重复释放。

移动语义则表示所有权转移。

### ShaderProgram
ShaderProgram 负责从文件读取 GLSL，编译 Shader，并链接：
1. 创建 Shader 对象。
2. 编译各 Shader Stage.
3. 检查编译结果。
4. 链接 Program.
5. 检查链接结果。
6. 删除临时 Shader 对象。
7. 保存最终 Program.

### 销毁顺序
1. `Viewer::onShutdown`
2. 释放场景和 Morph 资源
3. 释放 FramePipeline 和 Render Pass
4. 释放 RuntimeResourceCache
5. 释放其余 GPU 资源
6. 销毁 GraphicsDevice
7. 销毁 OpenGLContext
8. 销毁 Window

前文已经提到，`Application` 中成员的顺序为：
```
std::unique_ptr<platform::Window> window_;
std::unique_ptr<graphics::OpenGLContext> glContext_;
std::unique_ptr<graphics::GraphicsDevice> graphicsDevice_;
```
C++ 会按照声明顺序的逆序析构。

## 资产导入与运行时资源转换
为了导入外部模型，渲染器需要有一个导入模块，完成模型的解析、校验和格式转换，形成引擎能理解的 CPU 数据。

本项目将这个过程划分为以下层次：
1. ModelImporter
2. AssetRegistry 管理的 CPU 资源
3. RuntimeResourceCache
4. RuntimeMesh / RuntimeMaterial / Texture2D
5. RenderWorld
6. Render Pass

### Asset 与 Runtime Resource

磁盘文件、CPU 资产和 GPU 资源分别服务于不同的阶段：

磁盘文件：`.glb` 或 `.gltf` 文件关注数据的存储和交换，一般包含：
- 场景节点
- Mesh 和 Primitive
- 顶点和索引
- 材质与纹理
- 骨骼和权重
- 动画关键帧
- Morph Target
- 相机数据

CPU 资产：外部文件转换后的引擎内部表示，他们使用原生 C++ 数据结构，而不是 OpenGL Buffer、Texture 或 Shader：
- SceneAsset
- MeshAsset
- MaterialAsset
- TextureAsset
- AnimationClipAsset

CPU 资产保存节点、材质和动画之间的关系，为场景、动画和 GPU 上传提供数据源。

运行时资源是为了实际绘制创建的数据：
- RuntimeMesh
- RuntimeMeshPrimitive
- RuntimeMaterial
- MaterialInstance
- Texture2D
- SkinningPalette
- RuntimeMeshInstance

这些对象会进一步关联：Vertex Buffer、Index Buffer、Vertex Array、OpenGL Texture、Shader Program、Morph Target Buffer、骨骼矩阵 Buffer，并存储材质参数。

### 模型导入入口
模型导入入口是 `ModelImporter` :
```cpp
class ModelImporter
{
public:
    explicit ModelImporter(AssetRegistry& registry);

    AssetHandle<SceneAsset> import(const std::filesystem::path& path);
}
```

Viewer 加载模型时，会创建一个 ModelImporter，并将 AssetRegistry 传入：
```cpp
ModelImporter importer{assetRegistry_};

sceneInstance->sceneHanle =
    importer.import(modelPath);
```

成功后返回的是一个 Handle 而非完整的 SceneAsset 副本，Viewer 随时可以通过该 Hanle 获取实际资产：
```
const SceneAsset* sceneAsset =
    assetRegistry_.get(sceneHandle);
```

Handle 的好处是各模块之间传递的是轻量级标识而不是复制或者移动较大的网格或者纹理等其他数据。

### Assimp 解析与预处理
项目使用 Assimp 解析模型文件，导入开始前，会进行包含路径、文件等检查，确认有效后，读取模型，并执行一组后处理：
```cpp
aiProcess_Triangulate |
aiProcess_JoinIdenticalVertices |
aiProcess_GenSmoothNormals |
aiProcess_CalcTangentSpace |
aiProcess_ImproveCacheLocality |
aiProcess_SortByPType |
aiProcess_ValidateDataStructure
```

将多边形统一为三角形后，渲染阶段就可以使用统一的
```cpp
glDrawElements(GL_TRIANGLES, ...);
```
不需要再额外考虑其他形状。

### 分阶段转换
Assimp 完成解析后，对象并不会被立刻写入 AssetRegistry，而是先转为一组临时数据：
```cpp
std::vector<TextureAsset> stagedTextures;
std::vector<StagedMaterial> stagedMaterials;
std::vector<StagedMesh> stagedMeshes;
StagedScene stagedScene;
```
随后依次执行：
1. stageMaterials 转换为纹理和材质
2. stageScene 转为节点、Mesh 和 Primitive
3. stageCameras 转换为场景相机
4. stageSkins 转为骨骼、权重和逆绑定权重
5. stageAnimations 转为节点动画和 Morph 动画

之所以要额外加一个 staged 数据，主要有两个原因：
1. 外部文件引用通常使用数组下标，而引擎内部使用 AssetHandle；只有所有数据都完成转换后，才建立最终的引用。
2. 避免失败造成残损数据进入 Registry.

也就是说，只有注册全部资产完成，才会返回 SceneHandle，否则直接丢弃 Staged 数据，返回空的 Handle.

### CPU 资产数据结构
#### SceneAsset
SceneAsset 保存模型中的场景结构：
```cpp
struct SceneAsset
{
    std::string name;
    std::vector<SceneNodeAsset> nodes;
    std::vector<AnimatioClipAsset> animations;
    std::vector<CameraAsset> cameras;
};
```

其中 SceneNodeAsset 包含：
```cpp
struct SceneNodeAsset
{
    std::string name;
    Transform localTransform;
    AssetHandle<MeshAsset> mesh;
    uint32_t parentIndex;
};
```

关于父子节点关系，在 node 中并不会直接通过父节点保存子节点数组来确认，而是子节点记录父节点序号来做。

子节点的局部变换相对于父节点定义，最终世界变换需要沿层级组合：
1. 根节点世界矩阵 = 根节点局部矩阵。
2. 子节点世界矩阵 = 父节点世界矩阵 * 子节点局部矩阵。

节点也并不保存具体的网格数据，而是存储 Mesh Handle，因此一个 Mesh 理论上可以被多个节点引用。

#### MeshAsset 与 Primitive
一个 MeshAsset 可以包含多个 Primitive：
```cpp
struct MeshAsset
{
    std::string name;
    std::vector<MeshPrimitiveAsset> primitives;
    Bound localBounds;
};
```

Primitive 是实际参与 Draw Call 的几何单元：
```cpp
struct MeshPrimitiveAsset
{
    std::vector<StaticMeshVertex> vertices;
    std::vector<uint32_t> indices;

    std::vector<VectorSkinData> skinVertices;
    SkinAsset skin;

    std::vector<MorphTargetAsset> morphTargets;

    AssetHandle<MaterialAsset> material;
    Bound localBounds;
};
```

因为不同部分往往使用不同的材质，而一个 Draw Call 一般只能绑定一套确定的材质状态，所以一个 Mesh 需要拆成多个 Primitive.

基础顶点数据如下：
```cpp
struct StaticMeshVertex
{
    glm::vec3 position;
    glm::vec3 normal;
    glm::vec4 tangent;
    glm::vec2 texCoord0;
};
```

而顶点索引数据使用的是 `uint32_t`，绘制时通过 Index Buffer 重用顶点。

#### 骨骼数据
如果 Primitive 包含骨骼蒙皮，那么每个顶点会包含：
```cpp
struct VertexSkinData
{
    glm::uvec4 joints;
    glm::vec4 weights;
};
```
`joints` 表示该顶点会受那些骨骼影响，而 `weights` 表示每个骨骼的影响比例。

当然，这也意味着在本项目中，每个顶点最多受到四个骨骼的影响，多余的骨骼会丢弃。

SkinAsset 保存骨骼与场景节点之间的关系
```cpp
struct SkinAsset
{
    std::vector<uint32_t> jointNodeIndices;
    std::vector<glm::mat4> inverseBindMatrices;
    std::vector<Bounds> jointLocalBounds;
};
```

其中，`jointNodeIndices` 将骨骼索引映射到 SceneAsset 的节点索引；动画系统更新节点姿态后，就可以根据这些节点计算蒙皮矩阵，典型骨骼矩阵计算形式如下：
```
SkinMatrix[joint]
    = 当前骨骼全局矩阵
    × InverseBindMatrix[joint]
```

至于具体的骨骼动画的计算和上传，会在动画章节详细展开。

#### Morph Target
Morph Target 保存相对于基础网格的顶点增量：
```cpp
struct MorphTargetAsset
{
    std::string name;
    std::vector<glm::vec3> positionDeltas;
    std::vector<glm::vec3> normalDeltas;
    std::vector<glm::vec3> tangentDeltas;
};
```
某个顶点的变形结果可以表示为：
```
最终位置
    = 基础位置
    + Σ(目标位置增量 × 目标权重)
```

#### MaterialAsset
MaterialAsset 保存从模型文件导入的基础材质信息：
```cpp
struct MaterialAsset
{
    glm::vec4 baseColorFactor;

    AssetHandle<TextureAsset> baseColorTexture;
    AssetHandle<TextureAsset> normalTexture;

    float normalScale;
    float metallicFactor;
    float roughnessFactor;

    AlphaMode alphaMode;
    float alphaCutoff;
    bool doubleSided;
};
```

在该项目中，AlphaMode 包含 Opaque、Mask 和 Blend.

该分类决定了对应的 Primitive 进入何种 Render Pass.

#### TextureAsset
TextureAsset 保存解码后的 CPU 像素：
```cpp
struct TextureAsset
{
    uint32_t width;
    uint32_t height;

    TexturePixelFormat format;
    ColorSpace colorSpace;

    bool generateMipMaps;
    std::vector<std::byte> pixels;
};
```
颜色纹理通常使用 sRGB，而法线、遮罩和其他数据纹理通常使用 Linear，为了区分不同的数值空间，运行时上传纹理，需要依据像素格式 `format` 与颜色空间 `colorSpace` 选择 GPU 格式。

GPU 在采样 sRGB 纹理时，可以自动转换到线性空间。

### AssetRegistry 与 AssetHandle
所有的正式 CPU 资产都由 AssetRegistry 持有：
```cpp
std::unordered_map<
    uint64_t,
    std::unique_ptr<AssetEntryBase>
> assets_;
```

注册资产时，Registry 会分配一个递增的 AssetId：
```cpp
AssetHandle<TextureAsset>
AssetHandle<MaterialAsset>
AssetHandle<MeshAsset>
AssetHandle<SceneAsset>
```

AssetHandle 带有模板类型，避免 Handle 的混用。

获取资产时，Registry 会检查实际类型：
```cpp
if (entry->type() != typeid(T))
{
    return nullptr;
}
```

之所以提出 Handle 来管理资产索引，而不是直接使用裸指针，是因为：
1. Handle 体积小，适合相互传递；
2. Registry 集中拥有 CPU 资产；
3. 资产关系可以通过 Handle 表示；
4. Hash Map 扩容并不会使 Handle 本身失效；
5. 空 Handle 可以统一标识没有资源。

Handle 现在只封装了一个递增 ID，本身无法确认版本信息；不过 Registry 也不会复用已经分配了的 ID，因此一般情况下不会出现旧的 Handle 指向新资产的问题。~~至少现在节点少，id 是 `uint64_t` 类型，应该不会超过吧~~

### 从临时索引到正式 Handle
在前文我们说到，Assimp 场景中的各类资产常常靠数组下标相互引用，而现在进入 AssetRegistry 需要统一使用 AssetHandle.

为此，需要逐个进行转换，项目按照以下依赖顺序进行资源的注册：
1. TextureAsset
2. MaterialAsset
3. MeshAsset
4. SceneAsset

首先注册 TextureAsset，得到纹理 Handle：
```cpp
textureHandles.push_back(
    registry_.emplace<TextureAsset>(...)
);
```

然后将 StagedMaterial 中的纹理下标转换成 Handle：
```cpp
material.asset.baseColorTexture =
    textureHandles[textureIndex];
```

MaterialAsset 注册完成后，将 Primitive 的材质下标转换为 Material Handle:
```cpp
mesh.asset.primitives[primitiveIndex].material =
    materialHandles[materialIndex];
```

最后是 SceneNodeAsset 绑定 MeshHandle:
```cpp
stagedScene.asset.nodes[nodeIndex].mesh =
    meshHandles[meshIndex];
```

最终引用关系如下：
```
SceneAsset
    -> SceneNodeAsset
    -> MeshAsset
    -> MeshPrimitiveAsset
    -> MaterialAsset
    -> TextureAsset
```

### 导入失败与回滚
注册资产可能失败，如果失败了，导入会进行回滚，移除所有注册的内容；回滚的顺序与依赖顺序相反，从而避免AssetRegistry 留下无法访问的半成品资产。

### RuntimeResourceCache
CPU 资产注册完成后，并不会立即把所有数据全部上传到 GPU，GPU 资源由 `RuntimeResourceCache` 按需创建，该类包含以下核心接口：
```cpp
getOrCreateMesh(...)
getOrCreateTexture(...)
getOrCreateRuntimeMaterial(...)
getOrCreateMaterialInstance(...)
```

以创建 mesh 资源为例：
```cpp
const RuntimeMesh* runtimeMesh =
    resourceCache.getOrCreateMesh(
        meshHandle,
        assetRegistry);
```

执行过程为：
1. 检查 Handle
2. 依据 AssetId 查询缓存
   1. 存在，直接返回 RuntimeMesh
   2. 不存在，从 AssetRegistry 获取 MeshAsset
3. 将 MeshAsset 上传为 RuntimeMesh
4. 保存到缓存
5. 返回 RuntimeMesh

伪代码如下：
```cpp
if (cache.contains(handle))
{
    return cachedRuntimeMesh;
}

const MeshAsset* asset = registry.get(handle);
RuntimeMesh runtime = RuntimeMesh::create(device, *asset);
cache.emplace(handle.id(), std::move(runtime));

return cachedRuntimeMesh;
```

当一个 Mesh 被多次引用时，基础的 VB 和 IB 只需要传一次。

### Mesh 的 GPU 上传
`RuntimeMesh::create` 会遍历 MeshAseet 中的所有 Primitive，并逐个创建 `RuntimeMeshPrimitive`.

每个 RuntimeMeshPrimitive 包含：
```cpp
graphics::Buffer vertexBuffer_;
graphics::Buffer indexBuffer_;
graphics::VertexArray vertexArray_;

uint32_t indexCount_;
AssetHandle<MaterialAsset> material_;
Bounds localBounds_;
```

对于静态网格，Vertex Buffer 直接上传前文提到的 `StaticMeshVertex`，包含以下信息：
```
Position
Normal
Tangent
TexCoord0
```

对于蒙皮网络，项目会先将几何属性与骨骼属性合并：
```
Position
Normal
Tangent
TexCoord0
Joints
Weights
```

随后创建：
1. Vertex Buffer：保存顶点属性
2. Index Buffer：保存三角形索引
3. Vertex Array：描述 Buffer 中每个属性的位置和步长

静态网格的顶点属性位置为：
1. position: location = 0
2. normal: location = 1
3. tangent: location = 2
4. texcoord0: location = 3

蒙皮网络再次基础上额外上传：
1. joint indices: location = 4
2. joint weights: location = 5

Vertex Array 将 C++ 顶点和 GLSL 输入关联起来：
```
layout(location = 0) in vec3 inPosition;
layout(location = 1) in vec3 inNormal;
layout(location = 2) in vec4 inTangent;
layout(location = 3) in vec2 inTexCoord;
layout(location = 4) in uvec4 inJoints;
layout(location = 5) in vec4 inWeights;
```

### 纹理上传与回退
RuntimeResourceCache 会将 TextureAsset 转换为 GPU Texture2D：
```
TextureAsset.width/height
    -> Texture2DDesc.width/height

TextureAsset.format + colorSpace
    -> Texture2DDesc.format

TextureAsset.pixels
    -> GPU Texture 数据

TextureAsset.generateMipmaps
    -> 是否生成 Mipmap
```

此外，为了避免后续 Shader 读到空值，缓存还会初始化一些默认纹理，包含黑白、错误纹理等。

### MaterialAsset、MaterialInstance 和 RuntimeMaterial
项目中的材质分为三个层次：
1. MaterialAsset：从模型文件导入的原始参数。
2. MaterialInstance：某个材质模板下可调节的具体参数。
3. RuntimeMaterial：GPU Shader 及其绑定逻辑。

MaterialInstance 将 Asset 带来的基础数据映射到特定材质模板；其缓存键由两部分组成，MaterialAssetID + MaterialTemplateID.

详细内容会在 MToon 材质章节展开。

RuntimeMaterial 实际持有 Shader Program，并在绘制前完成：
1. 绑定 Shader
2. 上传材质参数
3. 从 RuntimeResourceCache 获取纹理
4. 设置与材质模板相关的 GPU 状态。

### 加载场景后的运行时初始化
Viewer 获得 SceneAsset 后，会创建场景实例相关的数据：
1. ScenePose
2. MorphPose
3. SkinningPaletteSet
4. RuntimeMeshInstance
5. 材质 Sidecar
6. 角色 Sidecar

一般流程如下：
```
导入 SceneAsset
    -> 校验 SceneAsset
    -> 加载材质 Sidecar
    -> 加载角色 Sidecar
    -> 初始化 ScenePose
    -> 初始化 MorphPose
    -> 创建并上传 Bind Pose 蒙皮矩阵
    -> 为带 Morph Target 的节点创建 RuntimeMeshInstance
```

### 总结
```
GLB 文件
    -> Assimp aiScene
    -> StagedTexture / StagedMaterial / StagedMesh / StagedScene
    -> AssetRegistry
        -> TextureAsset
        -> MaterialAsset
        -> MeshAsset
        -> SceneAsset
    -> RuntimeResourceCache
        -> Texture2D
        -> RuntimeMaterial
        -> MaterialInstance
        -> RuntimeMesh
    -> SceneRuntimeInstance
        -> ScenePose
        -> MorphPose
        -> SkinningPalette
        -> RuntimeMeshInstance
    -> RenderExtractor
    -> RenderWorld
    -> Render Pass
    -> Draw Call
```

## Scene、RenderExtractor 与 RenderWorld
即使我们导入资产，创建了 CPU 资产和 GPU 资产，还不能直接交给 Render Pass，渲染器需要知道：
1. 当前帧哪些物体需要绘制
2. 每个物体使用什么 Mesh
3. 使用什么材质
4. 世界变换是什么
5. 如果有动画，骨骼矩阵是什么
6. 如果有 Morph 变形，变形后的 Vertex Array 长什么样
7. 是否投射或者接收阴影
8. 是否参与描边
9. 是否处于视锥体外，需要被剔除

诸如此类的问题由 RenderExtractor 来处理：它将场景资产、动画姿态、运行时 GPU 资源和当前摄像机状态整理成一份当前帧的渲染快照。

他处理以下资产：
1. SceneAsset
2. ScenePose
3. SkinningPalette
4. Morph Runtime Resource
5. Material / Mesh Runtime Resource
6. Camera
7. Light

最终 Render Pass 只需要直接遍历 RenderWorld 中已经处理完成的 RenderItem.

### 为什么不能让 Render Pass 直接访问 Scene
Render Pass 不止一个，如果每个 Pass 都需要遍历场景，处理各种节点层级、材质检查、动画姿态、包围盒等，就会出现大量的时间浪费。

一方面，每个 Pass 都需要能够理解 Scene 的内部结构；另一方面，不同 Pass 可能获得不一致的变换或材质。

因此，项目将场景数据统一交给 RenderExtractor 准备，结果存储在 RenderWorld 中，由 Render Pass 负责计算。


### SceneAsset、ScenePose 与 SceneRuntimeInstance

SceneAsset 在 CPU 资产部分已经介绍过了，是从模型导入后的静态资产描述：
```cpp
struct SceneAsset
{
    std::string name;
    std::vector<SceneNodeAsset> nodes;
    std::vector<AnimationClipAsset> animations;
    std::vector<CameraAsset> cameras;
};
```

ScenePose 保存了当前场景实例的姿态：
1. 动画播放器修改局部变换
2. ScenePose 重新计算世界矩阵
3. RenderExtractor 使用当前世界矩阵

它内部维护：
```
localTransforms_
worldMatrices_
resolutionStates_
worldMatricesDirty_
version_
```

初始化时，ScenePose 会从 SceneAsset 复制所有节点的局部变换：
```cpp
for (const asset::SceneNodeAsset& node : sceneAsset.nodes)
{
    localTransform_.push_back(node.localTransform);
}
```

动画系统可能会修改某个节点的局部变换，修改后，将 `worldMatricesDirty_` 标为 `true`，来说明当前世界矩阵不能直接使用。

SceneRuntimeInstance 是 Viewer 中的一个具体的场景实例：
```
struct SceneRuntimeInstance
{
    scene::Transform rootTransform;

    AssetHandle<SceneAsset> sceneHandle;

    AnimationPlayer animationPlayer;
    ScenePose scenePose;
    SceneMorphPose morphPose;

    SkinningPaletteSet skinningPalettes;

    std::vector<RuntimeMeshInstance>
        morphMeshInstances;
};
```

同一个 SceneAsset 可以被多个 SceneRuntimeInstance 使用，这意味这每个实例所拥有的世界位置、动画时间、动画姿态、morph 权重、材质覆盖、渲染开关都可以不同。

### ScenePose 计算世界矩阵
节点的世界矩阵通过父子关系递归计算。

1. 对于没有父节点的节点：
```cpp
WorldMatrix[node] =
    LocalMatrix[node];
```

2. 对于有父节点的节点：
```cpp
WorldMatrix[node]
    = WorldMatrix[parent]
    × LocalMatrix[node]
```

动画可能修改部分节点，未来避免每次修改都对所有层级进行重新计算，这里会使用 `worldMatricesDirty_` 标记世界矩阵是否会重新更新。
1. 修改局部变换：`worldMatricesDirty_ = true`
2. `updateWorldMatrices()`：重新解析节点层级，写入 `worldMatrices_`，随后 `worldMatricesDirty_ = true`

此外，RenderExtractor 在提取世界矩阵信息时也会进行检查，避免存在脏标记的矩阵被提取。

既然存在父子关系，那么节点层级就需要避免有环的情况，从而避免世界矩阵的计算无限递归。

`resolutionStates_` 为此服务，当更新世界矩阵时，会标记状态为 1 代表正在解析，如果在递归过程中重复遇到了该状态，表明出现循环，会立即终止。

### RenderExtractor 提取步骤
RenderExtractor 的渲染快照提取有三个步骤：
1. `beginFrame`：
   - 清空上一帧 RenderWorld
   - 写入 Camera 和 Light
   - 计算摄像机视锥体
2. `appendScene`：
   - 遍历场景节点
   - 解析 Mesh 和材质
   - 计算世界变换和包围盒
   - 创建 RenderItem
   - 分类主渲染、阴影和面部阴影
3. `endFrame`：
    - 阴影范围计算 ShadowView

如果存在多个场景，流程如下：
```
beginFrame
    -> appendScene(scene A)
    -> appendScene(scene B)
    -> appendScene(scene C)
    -> endFrame
```

来实现多个场景导入并渲染，且共享一套摄像机、主光源。

#### `beginFrame`：准备当前帧的全局数据
首先清空上一帧的结果：
```cpp
renderWorld.clear();
```

然后从 Camera 中读取：
1. view matrix
2. projection matrix
3. viewProjection matrix
4. camera position
5. near plane
6. far plane

并根据 viewProjection 矩阵构造视锥体：
```cpp
renderWorld.mainView.frustum =
    math::Frustum::fromViewProjection(
        renderWorld.mainView.viewProjection);
```

如果视锥体无效，则提取失败，终止。

完成视锥体计算后，主光源写入 RenderView：
```cpp
renderWorld.mainView.mainLight = mainLight;
```

至此，RenderWorld 具备了当前帧的全局相机和灯光信息。

#### `appendScene`：将一个场景加入当前帧
```cpp
bool appendScene(
    const SceneAsset& sceneAsset,
    const ScenePose& scenePose,
    const SkinningPaletteSet& skinningPalettes,
    span<const RuntimeMeshInstance> morphMeshInstances,
    const glm::mat4& instanceWorldMatrix,
    const FaceSdfExtractionData* faceSdf,
    const AssetRegistry& assetRegistry,
    AssetHandle<MaterialTemplate> materialTemplate,
    RenderWorld& renderWorld);
```

首先，Extractor 会检查输入数据的一致性：
```cpp
if (!scenePose.isForScene(sceneAsset) ||
    scenePose.worldMatricesDirty() ||
    scenePose.nodeCount() != sceneAsset.nodes.size() ||
    morphMeshInstances.size() != sceneAsset.nodes.size())
{
    return false;
}
```
保证：
1. ScenePose 确实属于当前 SceneAsset
2. 世界矩阵已经更新
3. 节点数量一致
4. 每个节点都有对应的 Morph Runtime Instance 槽位

随后 Extractor 按节点顺序遍历 SceneAsset：
```cpp
for (std::size_t nodeIndex = 0;
     nodeIndex < nodeCount;
     ++nodeIndex)
{
    const SceneNodeAsset& node =
        sceneAsset.node[nodeIndex];
}
```

没有 Mesh 的节点不会形成 RenderItem：
```cpp
if (node.mesh.isNull())
{
    continue;
}
```

对于有 Mesh 的节点，先从 AssetRegistry 获取 CPU Mesh：
```cpp
const MeshAsset* sourceMesh =
    assetRegistry.get(node.mesh);
```

然后从 RuntimeResourceCache 获取 GPU 运行时 Mesh：
```cpp
const RuntimeMesh* runtimeMesh =
    resourceCache_.getOrCreate(
        node.mesh,
        assetRegistry
    );
```

随后计算节点世界变换，先从 ScenePose 中获取当前节点的世界矩阵：
```cpp
const glm::mat4* poseWorldMatrix =
    scenePose.worldMatrix(
        static_cast<uint32_t>(nodeIndex));
```

然后叠加场景实例的根变换：
```cpp
const glm::mat4 worldMatrix =
    instanceWorldMatrix *
    *poseWorldMatrix;
```

一个顶点的最终使用的世界变换计算过程：
1. 顶点局部坐标
2. 节点局部层级变换
3. ScenePose 的节点世界变换
4. SceneRuntimeInstance 的根变换
5. 世界空间坐标

如果有多个模型实例：
```
SceneAsset A
    -> instanceWorldMatrix A
    -> RenderItems A

SceneAsset B
    -> instanceWorldMatrix B
    -> RenderItems B
```

两者可以共享一个 RenderWorld，但拥有不同的世界位置。

位置变换使用 `worldMatrix` 来同步，但是法线不能简单乘以同一个矩阵：
```cpp
const glm::mat3 normalMatrix =
    glm::transpose(
        glm::inverse(
            glm::mat3{worldMatrix}));
```
如果直接使用世界矩阵，可能会破坏法线的垂直关系，使用逆转置矩阵可以保持正确的法线方向。

RenderItem 同时保存：
```
glm::mat4 world;
glm::mat3 normalMatrix;
```

普通的 Primitive 使用 RuntimeMesh 本身的 Vertex Array：
```cpp
vertexArray = &primitive.vertexArray();
morphedLocalBounds = &primitive.localBounds();
```

如果有 Primitive 有 Morph Target，则使用 `RuntimeMeshInstance` 提供的输出 Vertex Array：
```cpp
vertexArray =
    morphMeshInstance.vertexArray(
        primitiveIndex);

morphedLocalBounds =
    morphMeshInstance.localBounds(
        primitiveIndex);
```

这意味着 RenderExtractor 不需要了解具体的 Morph Compute Shader 的内部算法，它只需要选择 Vertex Array 的来源。

接下来考虑包围盒，包围盒与视锥体裁剪、阴影范围、阴影投影矩阵、角色 focus 等内容有关。

对于没有骨骼蒙皮的静态网格，直接将本地包围盒变换到世界空间：
```cpp
item.worldBounds =
    morphedLocalBounds->transformed(
        worldMatrix);
```

对于蒙皮网格，使用当前 SkinningPalette 中的局部包围盒：
```cpp
math::Bounds skinnedLocalBounds =
    skinningPalette->currentLocalBounds();
```

随后在做世界变换：
```cpp
item.worldBounds =
    skinnedLocalBounds.transformed(
        worldMatrix);
```

如果网格同时存在蒙皮和 Morph，则当前包围盒可能不够，需要重新计算，先算 Morph 的最大位置偏移：
```cpp
const float morphRadius =
    morphMeshInstance.maximumPositionDelta(
        primitiveIndex) *
    maximumLinearScale(
        skinningPalette->matrices());
```

再拓展包围盒：
```cpp
skinnedLocalBounds =
    expandBounds(
        skinnedLocalBounds,
        morphRadius);
```

每个 Primitive 都有一个 Material Hanle:
```cpp
const AssetHandle<MaterialAsset>
    sourceMaterialHandle =
        primitive.material();
```

Extractor 根据 MaterialAsset 和当前 MaterialTemplate 创建或获取 MaterialInstance：
```cpp
item.materialInstance =
    resourceCache_.getOrCreateMaterialInstance(
        sourceMaterialHandle,
        materialTemplate,
        assetRegistry);
```

然后根据 MaterialInstance 的模板获取 RuntimeMaterial：
```cpp
item.runtimeMaterial =
    resourceCache_.getOrCreateRuntimeMaterial(
        item.materialInstance->templateHandle,
        assetRegistry);
```

最终 RenderItem 同时保存：
```
const MaterialInstance* materialInstance;
RuntimeMaterial* runtimeMaterial;
```

- MaterialInstance: 当前实例的参数。
- RuntimeMaterial：Shader 和运行时绑定逻辑。

Pass 会使用 RuntimeMaterial 绑定 Shader，再使用 MaterialInstance 上传具体参数。

随后要考虑材质类型，如前文所说，Opaque、Mask、Blend 将决定 Pass 的种类。

导入的 MaterialAsset 中包含 AlphaMode，Extractor 将其转换为：
```cpp
enum class RenderMaterialClass
{
    Opaque,
    Masked,
    Transparent
};
```

映射关系如下：
```
Opaque
    -> ForwardOpaquePass

Masked
    -> ForwardOpaquePass，但 Shader 中执行 alpha cutoff

Transparent
    -> ForwardTransparentPass
```

接下来考虑阴影，为了做好实时的写实阴影和卡通阴影混合的效果，最基本的区分投射阴影和接受阴影的开关：
```cpp
RenderItemFlags::CastShadow |
RenderItemFlags::ReceiveShadow
```

具有 CastShadow 的 Primitive 可以加入 shadowItems；具有 ReceiveShadow 的 Primitive，会扩展 shadowReciverBounds.

透明材质暂不支持阴影。

在之前我们提到，RenderExtractor 会先计算每个RenderItem 的世界包围盒，再使用主摄像机视锥体判断是否可见：
```cpp
if (!renderWorld.mainView.frustum.intersects(
        item.worldBounds))
{
    ++renderWorld.renderStats.culledItems;
    continue;
}
```

如果包围盒完全位于某个视锥体外，则认为物体不可见，可见物体会继续加入：
```cpp
renderWorld.items.push_back(item);
```

前文提到，我们利用 View-Projection 矩阵完成视锥体计算；项目从矩阵中提取出六个平面，平面方程通常来自：
```
row3 + row0
row3 - row0
row3 + row1
row3 - row1
row3 + row2
row3 - row2
```

每个平面随后归一化：
```cpp
dot(plane.normal, point)
    + plane.distance
```

进行平面测试时，并不会针对包围盒的8个点都进行测试，而是针对每个平面选择最有利的顶点：
```cpp
const glm::vec3 positiveVertex{
    plane.normal.x >= 0.0F
        ? maximum.x : minimum.x,

    plane.normal.y >= 0.0F
        ? maximum.y : minimum.y,

    plane.normal.z >= 0.0F
        ? maximum.z : minimum.z
};
```

如果这个顶点都位于平面外，那么整个包围盒也一定在平面外，可以直接裁剪。

虽然我们会依据包围盒和视锥体的相对关系，裁剪 mesh，但是一个物体可能不在视锥体内，仍会影响可见区域的阴影，因此，阴影投射列表不能等同于主视图可见列表：
```
先判断 CastShadow
    -> 加入 shadowItems
    -> 扩展 shadowCasterBounds

再判断 ReceiveShadow
    -> 扩展 shadowReceiverBounds

最后判断主摄像机视锥体
    -> 决定是否加入 main render items
```

在这里通过手动设置来管理阴影计算。

#### `endFrame`：构建方向光 ShadowView
Extractor 会维护两个范围：
```cpp
math::Bounds shadowCasterBounds;
math::Bounds shadowReceiverBounds;
```
随后构建 ShadowView:
1. 计算包围盒中心和半径
2. 根据主光方向放置光源相机
3. 转换到光源空间
4. 计算正交投影范围
5. 合并接收阴影的深度范围
6. 构造光源 ViewProjection 矩阵

方向光使用正交投影：
```cpp
glm::orthoRH_NO(
    left,
    right,
    bottom,
    top,
    nearPlane,
    farPlane);
```

那么正交投影的实际范围就需要确认，我们会依据两个 shadow bounds 来确认：
1. 提取 `shadowCasterBounds` 的中心 `center` 与半径 `radius`，作为光源视角计算的基准参照
2. 放置光源相机，将光源相机置于 `center - lightDirection * eyeDistance`，以朝向 `center` 构筑 `view` 矩阵（`eyedistance` 是手动设置的常量）。
3. 利用光源相机的 `view` 矩阵，将两个 Bound 切换到光源空间；检查接收包围盒的最大 Z，若大于0，就说明包围盒在光源的后方，需要反向推动 `lightPosition` 重新算 `view` 矩阵。
4. 接下来算 Projection 矩阵，获取投射包围盒的 X/Y 极值，并叠加一个宽容宽度，得到正交视口，这使得阴影贴图的分辨率全额集中在几何体上，大幅提升阴影边缘清晰度。
5. 计算当前视口在 Shadow Map 分辨率下的物理尺寸，然后把中心点坐标换算到像素个数上去，取整，得到 `snappedCenterX` 和 `snappedCenterY`，再乘回物理尺寸，回到物理坐标，然后重新整理正交的上下左右，最后能得到一个稳定的投影网格
6. 接下来考虑深度范围，将投影和接收包围盒的 Z 取机制，作为近远平面
7. 最后导出投影矩阵

#### FaceSDF

为了照顾卡通渲染角色的面部不出现极其糟糕的阴影，对于脸部的阴影需要单独计算。

首先，Extractor 会根据头部节点的世界矩阵，计算面部局部坐标系在世界空间中的方向：
```
faceForward
faceRight
faceUp
```

输入来自 `FaceSdfExtractionData`:
```cpp
glm::vec3 headRight;
glm::vec3 headForward;
uint32_t headNodeIndex;
```

首先获取头部节点的世界矩阵：
```cpp
const glm::mat4* headPoseMatrix =
    scenePose.worldMatrix(
        faceSdf->headNodeIndex);
```

叠加场景实例变换：
```cpp
headWorld =
    instanceWorldMatrix *
    *headPoseMatrix;
```

同步面部的方向：
```cpp
const glm::mat3 headBasis{headWorld};

faceForward =
    headBasis *
    faceSdf->headForward;

rightCandidate =
    headBasis *
    faceSdf->headRight;
```

为了保证三个方向相互垂直，会重新进行正交化：
1. Right 减去 Forward 方向的分量
2. normalize Right
3. 叉乘算 Up
4. 再次叉乘矫正 Right

结果写入 RenderItem：
```cpp
item.faceForward = faceForward;
item.faceRight = faceRight;
item.faceUp = faceUp;
item.faceSdfFrameValid = true;
```

#### Face-Hair Shadow
SDF 的阴影始终和人物整体的写实阴影有些不符，且头发的阴影不能正确表现，为此，需要单独做一个刘海到面部的正交投影：
1. 沿 faceForward 放置特殊相机
2. 使用正交投影
3. 渲染头发阴影投射物
4. 生成 faceHairShadowMask
5. Mtoon 面部 Shader 采样

具体的内容在后续渲染环境介绍。

### RenderItem
当一个 Primitive 通过所有检查并确认对主摄像机可见后，会形成一个完整的 RenderItem：
```cpp
struct RenderItem
{
    const RuntimeMeshPrimitive* primitive;
    const graphics::VertexArray* vertexArray;

    const material::MaterialInstance* materialInstance;
    RuntimeMaterial* runtimeMaterial;

    const SkinningPalette* skinningPalette;

    glm::mat4 world;
    glm::mat3 normalMatrix;

    bool faceSdfFrameValid;
    bool receivesFaceHairShadow;

    glm::vec3 faceForward;
    glm::vec3 faceRight;
    glm::vec3 faceUp;

    math::Bounds worldBounds;

    uint32_t objectId;
    uint32_t outlinePolicyIndex;

    RenderMaterialClass materialClass;
    RenderItemFlags flags;
};
```

Render Pass 直接读取 RenderWorld 中的 item 即可。

在这里，我们注意到有一组 id 和 描边策略没有介绍，这是一个控制屏幕描边的参数，利用分组信息、与描边策略，解决断裂描边、重合描边的问题，后续渲染环节介绍。

### RenderWorld
RenderWorld 面向当前帧、面向渲染执行、经过预处理的只读数据快照。

记录：
1. 当前摄像机视图
2. 当前主光源
3. 当前可见 RenderItem
4. 阴影 RenderItem
4. 面部头发阴影 RenderItem
5. 阴影投射范围
6. 阴影接收范围
7. 描边策略
8. 当前帧统计

### 帧数据传递
在 Viewer 中，一帧相关的数据传递包含以下环节：
```
SceneRuntimeInstance
    -> AnimationPlayer 更新动画时间
    -> ScenePose 更新节点局部变换
    -> ScenePose 计算节点世界矩阵
    -> MorphPose 更新 Morph 权重
    -> RuntimeMeshInstance 执行 Morph 变形
    -> SkinningPaletteSet 更新骨骼矩阵
    -> RenderExtractor::beginFrame
    -> RenderExtractor::appendScene
    -> 生成 RenderItem / ShadowRenderItem
    -> RenderExtractor::endFrame
    -> 生成 ShadowView
    -> FramePipeline 消费 RenderWorld
```

## FramePipeline 与多 Pass 渲染
上一章中，`RenderExtractor` 将场景、动画和运行时资源整理成了 `RenderWorld`.

但 `RenderWorld` 只描述了这一帧要画什么，还没有说明具体的绘制顺序；为了得到最终的画面，需要完成：
1. 主光源阴影
2. 面部过滤阴影
3. 头发投射面部阴影
4. 不透明物体渲染
5. 透明物体渲染
6. 几何描边
7. HDR 后处理
8. FXAA
9. 输出到窗口

即：
```
RenderWorld
    -> ShadowPass
    -> FaceFilteredShadowPass
    -> FaceHairShadowPass
    -> ForwardOpaquePass
    -> ForwardTransparentPass
    -> OutlineMaskPass
    -> ScreenSpaceOutlinePass
    -> PostProcessPass
    -> FxaaPass
    -> 默认 Framebuffer
```

### 为什么需要多个 Render Pass
一个完整画面无法通过一次 Draw Call 或一次 Framebuffer 绘制完成。

例如主场景 Shader 需要采样阴影图，但阴影图必须提前从光源视角生成；描边也需要当前画面的深度、法线和材质标识；后处理则需要读取已经生成的 HDR 颜色。

一个帧渲染过程本质上是一条资源生产和消费链：
前一个 Pass 生成资源，后一个 Pass 读取资源，生成新的资源。

### IRenderPass
所有 Pass 都实现统一的 `IRenderPass` 接口：
```cpp
class IRenderPass
{
public:
    virtual ~IRenderPass() = default;

    virtual bool resize(
        graphics::Extent2D extent) = 0;

    virtual bool execute(
        FrameContext& frame) = 0;

    virtual std::string_view name()
        const noexcept = 0;
};
```

#### resize
当窗口 framebuffer 尺寸变化时，Pass 可以重新创建与屏幕分辨率相关的资源，例如：
- HDR Color Texture
- Normal Texture
- Material ID Texture
- Depth Texture
- Outline Texture
- LDR Texture
- Framebuffer

#### execute
读取当前 `FrameContext` 中已有的数据，执行自己的渲染逻辑，并将结果持续写回 `FrameContext`.

#### name
为调试界面和性能统计提供可读名称，例如：
```cpp
ShadowPass
ForwardOpaquePass
ScreenSpaceOutlinePass
PostProcessPass
FxaaPass
```

### FramePipeline
FramePipeline 内部按使用顺序数组保存 Pass：
```cpp
struct PassEntry
{
    std::unique_ptr<IRenderPass> pass;
    graphics::GpuTimerQuery timer;
    bool lastExecutionSucceeded = false;
};

std::vector<PassEntry> passes_;
```

添加 Pass 时，Pipeline 同时为其创建一个 GPU Timer Query：
```cpp
bool FramePipeline::addPass(std::unique_ptr<IRenderPass> pass)
{
    PassEntry entry;
    entry.pass = std::move(pass);
    entry.timer =
        graphicsDevice_.createGpuTimerQuery();

    passes_.push_back(std::move(entry));
    return true;
}
```
因此，每个 Pass 都可以得到独立的 GPU 执行时间。

#### 顺序执行
每一帧中，Pipeline 按添加顺序执行所有 Pass:
```cpp
for (PassEntry& entry : passes_)
{
    const bool timingStarted =
        entry.timer.begin();

    entry.lastExecutionSucceeded =
        entry.pass->execute(frame);

    if (timingStarted)
    {
        entry.timer.end();
    }

    if (!entry.lastExecutionSucceeded)
    {
        return false;
    }
}
```

这里没有自动分析依赖关系，Pass 顺序就是 Viewer 创建资源时的注册顺序。

这意味着，我们需要手动保持资源依赖正确。

### FrameContext
Pass 之间没有通过全局变量交换数据，而是共享一个 FrameContext:
```cpp
struct FrameContext
{
    graphics::Extent2D framebufferSize;

    RenderWorld* renderWorld = nullptr;

    graphics::RenderTexture* hdrColor = nullptr;
    graphics::RenderTexture* ldrColor = nullptr;
    graphics::RenderTexture* normal = nullptr;
    graphics::RenderTexture* materialId = nullptr;
    graphics::RenderTexture* outlineMask = nullptr;

    graphics::DepthTexture* depth = nullptr;
    graphics::Framebuffer* framebuffer = nullptr;

    graphics::DepthTexture* shadowMap = nullptr;
    graphics::DepthTexture* faceFilteredShadowMap = nullptr;
    graphics::RenderTexture* faceHairShadowMask = nullptr;

    float deltaTime = 0.0F;
    bool shadowsEnabled = true;
    float exposure = 1.0F;
    bool toneMappingEnabled = true;
    bool fxaaEnabled = true;
};
```

Viewer 在执行 Pipeline 前创建 FrameContext:
```cpp
FrameContext frame;

frame.framebufferSize = framebufferExtent;
frame.renderWorld = &renderWorld_;

frame.framebuffer = nullptr;
frame.hdrColor = nullptr;

frame.shadowsEnabled = shadowsEnabled_;
frame.exposure = exposure_;
frame.toneMappingEnabled = toneMappingEnabled_;
frame.fxaaEnabled = fxaaEnabled_;

framePipeline_->execute(frame);
```

开始执行时，大部分中间资源指针为空，各个 Pass 会逐步写入自己的输出，例如：
```
ShadowPass
    -> frame.shadowMap

ForwardOpaquePass
    -> frame.hdrColor
    -> frame.depth
    -> frame.normal
    -> frame.materialId
    -> frame.framebuffer

OutlineMaskPass
    -> frame.outlineMask

ScreenSpaceOutlinePass
    -> 替换 frame.hdrColor

PostProcessPass
    -> frame.ldrColor

FxaaPass
    -> 输出到默认 Framebuffer
```

因此，FrameContext 可以理解为一份逐步完善的帧级资源表；这些指针都不拥有资源，真正的 RenderTexture、DepthTexture 和 Framebuffer 通常由对应的 Pass 持有，FrameContext 只负责在当前帧传递引用。

### Pass 执行顺序
1. ShadowPass
2. FaceFilterShadowPass
3. FaceHairShadowPass
4. ForwardOpaquePass
5. ForwardTransparentPass
6. OutlineMaskPass
7. ScreenSpaceOutlinePass
8. PostProcessPass
9. FxaaPass

可以用资源流表示为：
```
RenderWorld.shadowItems
    -> ShadowPass
    -> shadowMap

RenderWorld.items
    -> ForwardOpaquePass
    -> hdrColor + depth + normal + materialId

    -> ForwardTransparentPass
    -> 更新 hdrColor

    -> OutlineMaskPass
    -> outlineMask

depth + normal + materialId + outlineMask + hdrColor
    -> ScreenSpaceOutlinePass
    -> outlinedHdrColor

    -> PostProcessPass
    -> ldrColor

    -> FxaaPass
    -> 默认 Framebuffer
```

### ShadowPass
ShadowPass 的输入来自：
```cpp
RenderWorld.shadowView
RenderWorld.shadowItems
```

其中：
- shdaowView 保存光源的 View-Projection 矩阵
- shadowItems 保存所有需要投射阴影的几何
- 每个 ShadowRenderItem 包含 Mesh、Vertex Array、世界矩阵、材质类型和 SkinningPalette.

ShadowPass 创建一个只包含深度附件的 Framebuffer.

在此处，深度纹理开启 comparison sampling，后续主场景 Shader 可以将当前片元的光源空间深度和 Shadow Map 比较。

详细执行过程如下：
1. 设置 Shadow Map 分辨率
2. 清空深度
3. 开启 Polygon Offset
4. 遍历 ShadowItems
5. 设置 Light View-Projection
6. 设置 Model Matrix
7. 绑定 SkinningPalette
8. 处理 Mask 材质
9. 绘制深度
10. 关闭 Polygon Offset
11. 结果写入FrameContext

主光源的变换矩阵会传入 Shader:
```cpp
shader_.setMat4(
    "uLightViewProjection",
    shadowView.viewProjection
)
```

每个物体还会传入自己的世界矩阵：
```cpp
shader_.setMat4(
    "uModel",
    item.world);
```

最终顶点在光源裁剪空间中的位置：
```cpp
LightClipPosition
    = LightViewProjection
    × Model
    × LocalPosition
```

ShadowPass 开启:
```cpp
graphicsDevice_.setPolygonOffset(
    true,
    2.0F,
    4.0F);
```

其目的是降低 Shadow Acne.

Shadow Map 中保存的深度和主渲染计算的深度可能存在轻微的误差，如果二者几乎相等，表面可能错误地认为自己被遮挡，形成条纹状阴影。

Polygon Offset 会在生成 Shadow Map 时，对深度进行偏移，降低这种自遮挡现象；不过，偏移过大也可能造成阴影与物体分离。

此外，Shadow Pass 会过滤调 Mask 中小于 Cutoff 的点，避免产生错误的阴影。

Shadow Pass 执行完成后：
```cpp
frame.shadowMap = &depth_;
```

后续 Forward Pass 可以通过 `frame.shadowMap` 采样主光源阴影。

### FaceFilteredShadowPass
针对某些被标记为 `excludeFromFaceFilteredShadow` 的阴影投射物，将他们排除在 ShadowMap 计算外，主要还是把刘海的采样的混乱的阴影给移除。

所以，系统中存在两个方向光的 Shadow Map.

### FaceHairShadowPass
FaceHairShadowPass 专门生成头发投射到面部的阴影 Mask:
```cpp
RenderWorld.faceHairShadowView
RenderWorld.faceHairShadowItems
```

`faceHairShadowView` 由 RenderExtractor 根据头部世界坐标系生成。

该 Pass 的计算过程为：
1. 绑定 Face Hair Shadow Framebuffer
2. 清空颜色和深度
3. 绘制头发阴影投射物
4. 根据头发纹理 Alpha 裁剪
5. 输出 Face Hair Shadow Mask

完成计算后：
```
frame.faceHairShadowMask = &mask_;
```

### ForwardOpaquePass
ForwardOpaquePass 是主体场景渲染阶段。

它会创建一个包含多个附件的 Framebuffer：
```
Forward Opaque Framebuffer
    ├── Attachment 0：HDR Color
    ├── Attachment 1：Normal
    ├── Attachment 2：Material ID
    └── Depth Attachment：Depth/Stencil
```

执行开始时，这些资源会写入 FrameContext：
```cpp
frame.hdrColor = &hdrColor_;
frame.depth = &depth_;
frame.normal = &normal_;
frame.materialId = &materialId_;
frame.framebuffer = &framebuffer_;
```

片元 Shader 的输出可以概括为：
```cpp
layout(location = 0) out vec4 outColor;
layout(location = 1) out vec4 outNormal;
layout(location = 2) out vec4 outMaterialId;
```

一次绘制最终完成：最终场景颜色、屏幕空间法线和描边材质标识。

ForwardOpaquePass 会读取：
```cpp
frame.renderWorld
frame.shadowMap
frame.faceFilteredShadowMap
frame.faceHairShadowMask
```

真正的材质绘制由 `StaticModelRenderer` 完成。它会根据 `RenderItem` 绑定网格、材质实例、骨骼矩阵和光照参数，并将阴影图、面部 SDF、头发阴影等按需传给对应 Shader。这样，ForwardOpaquePass 只负责建立渲染目标和状态，材质差异则留在 Renderer 与 MaterialInstance 中处理。

其中 HDR 颜色使用 `RGBA16Float` 保存；法线与材质 ID 分别存入独立附件。这样的组织方式并不等同于完整的延迟渲染：主要光照仍在前向 Shader 内完成，但后续描边能得到稳定的几何信息，而无需重复绘制所有角色。

#### 为什么采用 Forward+辅助附件，而不是完整 G-Buffer
完整的延迟渲染通常会先把位置、法线、反照率、金属度等全部写入 G-Buffer，后续再执行统一光照。对于大量动态光源的写实场景，这种方式很有吸引力；但角色风格化材质往往拥有高度定制的光照逻辑：Toon Ramp、SDF 面部阈值、MatCap、Rim、透明与纹理遮罩都更适合在材质 Shader 内直接完成。

本项目保留前向渲染的直接性，只额外输出后续确实需要的三类信息。其职责可以概括为：

| 附件 | 格式 | 内容 | 后续用途 |
| --- | --- | --- | --- |
| HDR Color | `RGBA16Float` | 材质完成光照后的线性颜色 | 描边合成、曝光、Tone Mapping |
| Normal | `RGBA8` | 编码后的几何法线 | 屏幕空间法线边缘检测 |
| Material ID | `RGBA8` | 描边策略索引的编码值 | 查询颜色、阈值与分组策略 |
| Depth/Stencil | `Depth24Stencil8` | 主相机深度 | 遮挡、深度边缘检测、外壳描边深度测试 |

这里有两个容易忽略的细节。第一，Normal 附件保存的是插值得到的**几何法线**，而不是法线贴图作用后的表面法线；前者更稳定，避免皮肤、布料纹理的微小细节被当成描边。第二，Material ID 不直接存“材质颜色”，而是存策略表索引。策略变化时只需更新 SSBO，而不必重新绘制整个不透明场景。

#### 绘制前的对象状态
`StaticModelRenderer` 会逐个处理 `RenderWorld.items`。每个 `RenderItem` 已包含本次 Draw Call 所需的世界矩阵、法线矩阵、Primitive、Vertex Array、运行时材质、骨骼调色板、描边策略索引，以及投射/接收阴影等标志。Renderer 不必回头遍历 Scene 的父子节点，也不会在绘制期间做资产导入或 GPU 资源创建。

#### 输入、输出与所有权
从接口角度看，ForwardOpaquePass 的输入并不是一个“大场景对象”，而是一组已经完成职责分离的数据。它的输入可以列为：

| 输入 | 提供者 | 作用 |
| --- | --- | --- |
| `frame.renderWorld` | `RenderExtractor` | 提供主相机、主光、可见 RenderItem、阴影视图和描边策略 |
| `frame.framebufferSize` | Window/Application | 决定目标尺寸；尺寸变化会触发 Pass 重建附件 |
| `frame.shadowMap` | `ShadowPass` | 普通主光 Shadow Map；关闭阴影或无效时改用 Pass 内部的回退深度纹理 |
| `frame.faceFilteredShadowMap` | 第二个 `ShadowPass` | 面部使用的过滤版主光阴影图 |
| `frame.faceHairShadowMask` | `FaceHairShadowPass` | 头发投射到面部的局部遮罩 |
| AssetRegistry 与 RuntimeResourceCache | Viewer 初始化时注入 | 按 Handle 取得 CPU 资产、GPU 网格、纹理与材质实例 |

需要特别区分“借用”和“拥有”。上表中的 `RenderWorld`、Shadow Map 与头发遮罩都是来自其他阶段的借用指针；ForwardOpaquePass 不销毁它们。相反，HDR Color、Normal、Material ID、Depth 与自己的 Framebuffer 是 Pass 的成员，随 Pass 生命周期由 RAII 管理。Pass 成功后仅把这些成员的地址写入 `FrameContext`，供后续 Pass 借用：

```text
ForwardOpaquePass owns
    hdrColor_ / normal_ / materialId_ / depth_ / framebuffer_

ForwardOpaquePass execute(frame)
    -> frame.hdrColor     = &hdrColor_
    -> frame.normal       = &normal_
    -> frame.materialId_  = &materialId_
    -> frame.depth        = &depth_
    -> frame.framebuffer  = &framebuffer_
```

这套约定避免了 FrameContext 变成资源管理器：它只描述“这一帧目前已经有什么”，不会让多个 Pass 同时以为自己负责删除同一个 OpenGL 对象。

对每个物体，Renderer 会依次完成：

1. 根据双面材质和世界矩阵行列式决定背面剔除方向；负缩放模型会反转绕序，因此需要反向剔除；
2. 绑定 RuntimeMaterial，让材质实例中的常量、纹理和 Shader Program 进入 GPU 状态；
3. 写入 Alpha Mask、模型矩阵、相机矩阵、法线矩阵和描边策略 ID；
4. 若对象是蒙皮网格，将 `SkinningPalette` 绑定到固定的 SSBO binding；
5. 对 PBR 与 MToon 材质补充光源、相机、环境光、Shadow Map、Face SDF 与头发阴影等 uniform；
6. 最后以 Primitive 的索引格式与索引数量发起 `drawIndexed`。

这也是项目将 `RuntimeMaterial`、`MaterialInstance` 与 `RenderItem` 分开的原因：前者管理可复用的 Shader 与默认 GPU 绑定，第二者保存可编辑参数，第三者仅表示“这一帧、这个对象该如何被画出来”。

#### Resize 与资源重建
ForwardOpaquePass 的 `resize` 不是原地修改纹理，而是先创建一套新的 HDR、Normal、Material ID、Depth 与 Framebuffer，全部成功后再以移动语义替换旧资源。这样窗口尺寸变化或资源创建失败时，不会留下半有效的 Framebuffer。Pass 还记录渲染目标重建次数，Viewer 可以用它辅助判断频繁 resize 是否造成了异常开销。

### ForwardTransparentPass
透明物体在不透明阶段之后绘制，并复用不透明阶段创建的 HDR Color、深度和 Framebuffer：

1. 关闭深度写入，保留深度测试；
2. 开启 Alpha Blend；
3. 关闭 Normal 与 Material ID 附件的写入；
4. 绘制 `RenderWorld` 中分类为 Transparent 的对象；
5. 恢复深度写入、混合状态和附件写入状态。

这样透明物体可以被不透明几何正确遮挡，又不会覆盖描边所依赖的法线和材质策略缓冲。

#### 透明队列与排序
透明对象不能像不透明对象一样随意调换绘制顺序：标准 Alpha Blend 会把当前片元与已经存在的颜色混合，因此通常需要从远到近绘制。`StaticModelRenderer` 在进入 Transparent 队列时，会以相机位置到物体世界空间包围盒中心的距离进行稳定排序，再按远到近提交 Draw Call。稳定排序还能在距离相同或近似相同的对象之间维持原有顺序，降低画面抖动。

项目的分类来自导入材质的 Alpha Mode：Opaque 与 Masked 进入前向不透明阶段，Blend 进入透明阶段。Masked 材质虽然也会依据 alpha 丢弃片元，但它仍写入深度、法线与材质 ID，因此能参与阴影和屏幕空间描边；真正的 Blend 材质则只更新 HDR Color。这一差异对于头发卡片、镂空衣物与半透明饰品非常重要。

当前排序粒度是“按 RenderItem 的包围盒中心”，它适合角色查看器中的大多数透明部件，但不能从根本上解决同一网格内部三角形互相穿插的排序问题。若以后需要处理大量玻璃、粒子或复杂半透明层，可在当前 Pass 之后扩展深度预写、加权混合 OIT 或按三角形拆分等方案；现有 FrameContext 的资源传递方式不需要推倒重来。

#### 输入、输出与状态恢复
ForwardTransparentPass 有意不创建颜色或深度附件。它的输入是前一阶段已经准备好的 `frame.framebuffer`、`frame.hdrColor`、`frame.depth`，以及同一份 RenderWorld 与两类阴影资源；它的可见输出仅是被 Alpha Blend 更新后的 HDR Color。Normal、Material ID 与 Depth 的内容保持不变，因此也不需要重新写回新的资源指针。

```text
输入：已有的 Forward Opaque Framebuffer + Transparent RenderItem
状态：DepthTest = on, DepthWrite = off, Blend = on
写入：仅 Attachment 0（HDR Color）
保持：Attachment 1（Normal）、Attachment 2（Material ID）、Depth
输出：仍指向同一 HDR/Depth/Framebuffer 的 FrameContext
```

Pass 在绘制前显式关闭第 1、2 号颜色附件写入，结束后再逐项恢复写入开关、混合、深度写入、默认 Framebuffer 与 viewport。这里不能只依赖“下一 Pass 会重新设置状态”：OpenGL 状态是全局上下文状态，遗漏一次恢复就可能让后续 Outline 或 PostProcess 在错误附件上绘制。将恢复逻辑放在 Pass 内，是独立 Pass 设计的一部分。

### OutlineMaskPass：几何外壳描边
角色轮廓不能完全依赖屏幕空间边缘检测。对于服装外轮廓、头发剪影等区域，本项目使用基于几何外壳（shell）的描边：对需要描边的 MToon 不透明物体再绘制一次，顶点沿世界空间法线外扩，并只渲染背面。

顶点着色器中的核心过程可以概括为：
```glsl
worldPosition = uModel * localPosition;
worldNormal = normalize(uNormalMatrix * localNormal);
expandedWorldPosition =
    worldPosition + worldNormal * outlineWidth;
```

`outlineWidth` 既可以来自全局 World 模式，也可以来自材质自身的描边宽度与宽度遮罩纹理。通过正面剔除只留下膨胀模型的背面，就会在原始模型边缘露出一圈颜色。

这一路径的优势是轮廓宽度以世界单位定义，角色靠近或远离镜头时具有自然的透视变化；同时它支持蒙皮顶点，动画时描边会随骨骼一起变形。描边颜色还可选择混入主光照，避免它始终像纯黑贴纸一样脱离画面。

#### 外壳描边的完整绘制过程
OutlineMaskPass 并不新建深度纹理，而是把 ForwardOpaquePass 的深度附件附着到自己的 Framebuffer。这样外壳片元会自动接受原始不透明场景的深度测试：被角色本体遮住的部分不会泄露到前景，而轮廓外侧露出的部分才写入 `outlineMask`。

执行时的状态与普通材质绘制不同：

1. 先清空 `outlineMask` 为透明黑色；
2. 关闭深度写入，但保留深度测试，保证描边不改变主场景的遮挡关系；
3. 对每个符合条件的 Opaque MToon Item，读取全局或材质的 World 描边配置；
4. 根据模型是否含负缩放选择 Front 或 Back 剔除，使最终留下的是外壳背面；
5. 绑定宽度遮罩纹理、骨骼调色板和模型/法线矩阵，绘制扩张后的 Primitive；
6. 完成后恢复剔除与深度写入状态，并把 `outlineMask` 写回 FrameContext。

顶点阶段会先执行与主体模型相同的骨骼蒙皮，再换算世界坐标并沿法线外扩。因此，外壳不是静态复制的角色网格，而是与主网格共享姿势的第二层几何。Morph Target 的输出顶点 Buffer 同样会被这个 Pass 使用，表情变化、发梢形变或衣物形变不会出现“本体变了、描边没变”的错位。

#### 世界宽度、遮罩与光照混合
`MToonOutlineParameters` 的 `widthMode` 区分 World 和 Screen。当前几何外壳路径只处理 World 模式；Screen 模式交给后面的屏幕空间描边。World 宽度直观、易于控制，但在透视下远处角色线条会变细，这恰好符合大多数三维角色画面的空间感。

对于头发末端、面部、饰品接缝等区域，整块网格使用同一宽度通常显得笨重。`outlineWidthMaskTexture` 在顶点着色器中采样，将材质给出的宽度乘以 0 到 1 的局部遮罩。美术可以让不需要轮廓的区域为 0，让外轮廓或发梢保留更宽的线条，而不必拆分额外网格。

片元阶段还根据 `lightingMix` 在纯色与主光辐射之间插值。`lightingMix = 0` 时是稳定的固定色描边；提高该值后，轮廓会随场景光线变亮或变暗。两种表现没有绝对优劣：固定色更接近传统赛璐珞，光照混合则更容易融入有明暗层次的服装与环境。

#### 输入与输出：外壳描边到底写了什么
OutlineMaskPass 的输入可分成“几何输入”“共享深度输入”和“材质策略输入”三部分：

| 输入类别 | 具体内容 | 来源 |
| --- | --- | --- |
| 几何 | Opaque `RenderItem`、VAO、Index Buffer、世界矩阵、法线矩阵 | `RenderWorld.items` |
| 动画 | 可选 `SkinningPalette`，以及 Morph 后的动态 VAO | RenderItem / RuntimeMeshInstance |
| 材质 | MToon Outline 开关、World 宽度、颜色、光照混合、宽度遮罩纹理 | `MaterialInstance` 与 `RuntimeResourceCache` |
| 共享附件 | 主不透明 Pass 的 Depth Texture | `frame.depth` |
| 全局设置 | 全局描边模式、宽度和颜色 | `OutlineMaskPass::globalSettings_` |
| 光照 | 主方向光颜色和强度 | `RenderWorld.mainView.mainLight` |

它的输出并不是最终屏幕颜色，而是一张 `RGBA8` 的 `outlineMask`。RGB 保存已经计算出的描边颜色，A 保存覆盖度。未绘制区域在清空后是 `(0, 0, 0, 0)`，描边区域是 `(outlineColor, 1)`。这种设计使下游 Composite 可以自由决定描边与原画面的混合方式；如果将描边直接画进 HDR Color，后续就无法单独显示 Shell Mask 或同屏叠加另一种描边算法。

Pass 结束时唯一新增的 FrameContext 字段是：
```cpp
frame.outlineMask = &outlineMask_;
```
`frame.hdrColor` 并未在这里改变。也就是说，外壳描边是“先生成可组合证据，再由后续阶段决定如何合成”，这也是它能够与 ScreenSpaceOutlinePass 共存的前提。

### ScreenSpaceOutlinePass：深度、法线和材质感知描边
外壳描边擅长剪影，却难以覆盖同一模型内部的形体交界。本项目因此叠加第二条屏幕空间描边路径。

它首先通过 `screen_edge.frag` 读取深度、几何法线与材质 ID，在全屏三角形上检测两类边缘：

- 深度不连续，用于发现物体之间或前后层次之间的边界；
- 法线不连续，用于发现模型表面的转折。

材质 ID 并非仅仅是调试信息。`RenderExtractor` 会为每个材质实例注册一份 `ScreenOutlinePolicy`，其中包含颜色、采样宽度、深度阈值、法线阈值以及分组信息；策略表再作为 SSBO 上传。这样不同材质可以有不同的描边敏感度，属于同一显式分组的材质又可以抑制不必要的法线接缝。

边缘检测结果先写入单独的 `screenEdgeMask`，随后 `outline_composite.frag` 将它与几何外壳的 `outlineMask` 合成：
```text
depth + normal + materialId
        -> screenEdgeMask

screenEdgeMask + outlineMask + hdrColor
        -> outlinedHdrColor
```

合成阶段还会检查邻域支持度，避免单个不稳定像素在镜头运动时变成闪烁的黑点。Viewer 提供法线、线性深度、外壳遮罩、深度边缘、法线边缘、策略索引和分组等调试视图，便于定位“该画线而未画”或“接缝被误画”的具体原因。

几何外壳和屏幕空间检测并不是互相替代的方案：前者负责稳定的角色外剪影，后者补充内部结构与物体交界，两者取最大覆盖率后再进行合成。

#### 深度边缘如何避免随距离失控
深度缓冲中的值不是线性的：近处精度很高，远处变化被压缩。若直接比较两个深度值，近景与远景会使用完全不同的有效阈值。`screen_edge.frag` 会利用相机 near/far plane 将深度还原为线性视空间距离，再基于中心像素与 3×3 邻域的差异计算边缘覆盖率。

这意味着描边配置中的深度阈值描述的是更接近“真实距离差”的量，而不是难以理解的深度缓冲数值。Shader 还会判断边界归属：只有当前像素应当拥有该边界时才输出线条，减少相邻像素同时宣称同一条边界、导致线条过粗或不对称的情况。

#### 法线边缘与材质分组
法线边缘通过中心像素与邻域法线点积的差异来估计表面转折。此处并不简单地“法线不同就画线”，而是先检查材质策略。若相邻像素是同一策略，并且该策略没有启用自法线检测，则跳过；若它们来自不同材质但明确归入同一 Group，则会保留深度边缘、抑制仅由法线差造成的内部接缝。

这套规则解决的是角色资产中很常见的问题：身体、衣服、头发会因为工作流或贴图需要被拆成多个材质，而美术并不总希望每条材质边界都变成黑线。Group 让“哪些部分视觉上属于一个整体”成为明确数据，而不是靠调一个全局阈值碰运气。

#### 两阶段全屏合成的原因
ScreenSpaceOutlinePass 先绘制一次全屏三角形得到 Raw Edge，再绘制第二次全屏三角形做 Composite。看似多了一次绘制，实际换来了职责清晰：第一阶段只回答“这里是否是深度/法线边缘，以及原因是什么”，第二阶段只负责把边缘、外壳遮罩和 HDR 颜色组合，并处理调试显示。

Composite 阶段并不会把 Raw Edge 直接二值化。它会观察周围八个像素，检查直线方向或曲线邻域是否有足够连续的支持，再以连续 coverage 混合原色与描边色。这样能抑制孤立噪点，又不会让缓慢移动的斜线在某一帧突然断开。调试模式可以单独查看 depth coverage、normal coverage 和最终 coverage，正是为了让这类参数调整可解释。

#### 输入与输出：两张中间纹理、两次全屏绘制
ScreenSpaceOutlinePass 的输入比外壳描边更接近图像处理，而不是几何绘制：

| 输入 | 含义 | 被哪一个 Shader 使用 |
| --- | --- | --- |
| `frame.hdrColor` | 已完成不透明与透明绘制的线性颜色 | Composite |
| `frame.depth` | 主相机深度，用于线性化、遮挡边界判断 | Edge Detect、Composite 调试 |
| `frame.normal` | 不受法线贴图细节干扰的几何法线 | Edge Detect、Composite 调试 |
| `frame.materialId` | 每像素描边策略索引 | Edge Detect、Composite |
| `frame.outlineMask` | 外壳描边的颜色与 coverage | Composite |
| `RenderWorld.outlinePolicies` | 每种材质的颜色、宽度、阈值、分组、标志 | 上传为 policy SSBO |
| `RenderView.nearPlane/farPlane` | 深度线性化参数 | Edge Detect、Composite 调试 |

第一张全屏三角形使用 `screen_edge.frag`，输出 `screenEdgeMask`：R 是合并后的 edge coverage，G 是纯 depth edge coverage，B 是纯 normal edge coverage，A 固定为 1。RGB 分量分开保存不是为了最终显示，而是为了让 Composite 调试模式能准确回答“这根线来自深度还是法线”。

第二张全屏三角形使用 `outline_composite.frag`，读取 `screenEdgeMask` 与 `outlineMask`。它会选择外壳颜色或当前策略的屏幕描边颜色，以 `max(shellCoverage, screenCoverage)` 作为覆盖度，将结果与输入 HDR Color 混合。输出是一张新的 `outlinedHdrColor_`；随后 Pass 原子式地替换 FrameContext 的颜色入口：

```text
执行前：frame.hdrColor -> ForwardOpaquePass.hdrColor_
执行后：frame.hdrColor -> ScreenSpaceOutlinePass.outlinedHdrColor_

其余：frame.depth / frame.normal / frame.materialId 继续指向原附件
```

由于不能在读取一张纹理的同时又把它作为同一 Draw Call 的颜色附件写入，Pass 必须使用独立的 `outlinedHdrColor_`，而不能原地覆盖旧 HDR Color。这是 FrameContext 指针会被替换、但旧纹理仍由 ForwardOpaquePass 持有的实际原因。

### 后处理与 FXAA
描边完成后，`PostProcessPass` 将 HDR 图像转换为 LDR 图像。Shader 中先施加可调 exposure，再根据开关选择指数型 tone mapping 或直接截断，最后执行 gamma 校正：
```glsl
mappedColor = vec3(1.0) - exp(-hdrColor * exposure);
gammaCorrectedColor = pow(mappedColor, vec3(1.0 / 2.2));
```

最后的 `FxaaPass` 在默认 Framebuffer 上绘制全屏三角形。它根据中心与四个对角采样的亮度估计边缘方向，在局部范围内重新采样颜色。由于角色描边本身包含许多高对比边缘，FXAA 对最终观感尤其有帮助；同时它可以在 Viewer 中关闭，以便区分锯齿问题和描边算法问题。

#### 为什么后处理放在描边之后
HDR 颜色是线性空间中叠加的结果。描边也在 HDR 阶段合成，因此它与自发光、环境光和主光具有一致的曝光关系；如果先 Tone Mapping 再描边，黑线与高亮区域在曝光变化时往往会显得割裂。项目最终的顺序是：
```text
线性 HDR 场景颜色
    -> 外壳与屏幕空间描边合成
    -> exposure / Tone Mapping / gamma
    -> FXAA
    -> 默认 Framebuffer
```

`PostProcessPass` 输出的 LDR 纹理是专门的 `RGBA8` 中间结果，FXAA 再读取它并写入默认 Framebuffer。把抗锯齿放到 LDR 阶段，亮度估计更符合最终显示结果，也避免把高动态范围的极亮像素带入 FXAA 的阈值判断。

#### 全屏三角形而不是全屏四边形
PostProcess 与 FXAA 都使用覆盖屏幕的单个三角形，顶点位置为 `(-1,-1)`、`(3,-1)`、`(-1,3)`。相比由两个三角形构成的矩形，它少一次顶点/索引处理，也没有共享对角线处因为插值或采样精度带来的潜在接缝。纹理坐标可以超出 0 到 1，再由光栅化区域自然覆盖整张屏幕，是一个简洁且常用的全屏 Pass 写法。

Tone Mapping 是否开启、曝光值和 FXAA 是否开启都属于 `FrameContext` 的帧级选项。这表示它们无需修改材质或重建 Pipeline，Viewer 改变一个复选框或滑条即可在下一帧生效，适合直接观察风格取舍。

#### 输入与输出：从 HDR 到窗口像素
后处理的边界十分明确：PostProcessPass 负责颜色空间与动态范围转换，FxaaPass 负责最终边缘平滑。两者各自的输入输出如下：

| 阶段 | 输入 | 处理 | 输出 | 输出消费者 |
| --- | --- | --- | --- |
| PostProcessPass | `frame.hdrColor`、`frame.exposure`、Tone Mapping 开关 | 曝光、指数映射/截断、gamma | `RGBA8 ldrColor_` | FxaaPass |
| FxaaPass | `frame.ldrColor`、FXAA 开关、反屏幕尺寸 | 亮度梯度估计、沿边方向采样 | 默认 Framebuffer | Window 显示 |

PostProcessPass 成功后设置：
```cpp
frame.ldrColor = &ldrColor_;
frame.framebuffer = &framebuffer_;
```
这里的 framebuffer 是 PostProcess 自己的离屏 FBO，而不是窗口。FxaaPass 读取 `ldrColor_` 后绑定 `nullptr`，这在 OpenGL 封装中代表默认 Framebuffer，也就是用户最终看到的窗口后台缓冲；它绘制结束后将 `frame.framebuffer` 重新设为 `nullptr`，表示帧级离屏渲染已经结束。

FXAA Shader 还接受 `uInverseScreenSize`，即 `(1 / width, 1 / height)`。这让一个“采样一个像素”的偏移在任何窗口分辨率下都成立；若直接使用固定 UV 步长，窗口缩放后边缘检测半径就会失真。关闭 FXAA 时 Shader 直接输出中心颜色，因此该开关不改变中间资源或管线拓扑，只改变最后一次全屏绘制的分支。

## 从 RenderWorld 到屏幕像素：一帧渲染的完整实现
前文分别介绍了各个 Pass。为了把它们串成真正可追踪的执行过程，本节以一帧中一个带骨骼、Morph、MToon、投影阴影和描边的角色 Primitive 为例，沿着实际 C++ 与 GLSL 的数据通路说明：输入在哪里生成、每一步的公式是什么、结果写进哪一张资源、后续又由谁读取。

### 0. 进入 Pipeline 前：RenderExtractor 准备的输入
Pipeline 不直接接收 `Scene`。在 `FramePipeline::execute(frame)` 被调用之前，Viewer 先调用 RenderExtractor，把逻辑场景转换为只含渲染所需数据的 `RenderWorld`。对一个 Primitive 而言，提取阶段需要汇合以下输入：

| 输入来源 | 代表数据 | 提取后放入 RenderWorld 的结果 |
| --- | --- | --- |
| `ScenePose` | 当前节点局部变换、父子层级 | `item.world`、`item.normalMatrix` |
| Mesh/Primitive Asset | 顶点、索引、材质 Handle、Skin、Morph | Primitive、VAO、局部/世界包围盒 |
| `RuntimeResourceCache` | GPU 网格、GPU 材质、纹理 | `RuntimeMesh`、`RuntimeMaterial`、`MaterialInstance` |
| `SkinningPaletteSet` | 当前 Pose 对应的关节矩阵 Buffer | 可选 `item.skinningPalette` |
| `RuntimeMeshInstance` | Morph 后的动态 VAO、保守 Bounds | 实际参与绘制的 VAO 与 Bounds |
| Camera / Directional Light | View、Projection、主光方向、相机位置 | `mainView`、`shadowView` |

由此得到的 `RenderItem` 可以理解为一份“已经解引用的 Draw Call 描述”。它不再保存“第几个节点、该去哪里找网格”这种间接信息，而是直接持有 Primitive、VertexArray、世界矩阵与材质实例的指针。前向、阴影、外壳描边等 Pass 只需筛选同一组 Item，就能保证它们使用相同姿势、相同 Morph 输出和相同世界变换。

对于普通节点，世界矩阵由父子层级递推：
```text
World(root)  = Local(root)
World(child) = World(parent) × Local(child)
```

若 Viewer 在一个场景实例外又施加了实例变换，最终用于渲染的矩阵是：
```text
item.world = instanceWorld × ScenePose.worldMatrix(node)
```

法线不能在非均匀缩放下直接乘 Model Matrix，因此 `item.normalMatrix` 是世界矩阵左上 3×3 部分的逆转置。之后顶点 Shader 以它变换法线，才能维持法线与变换后表面的垂直关系。

### 1. 方向光阴影视图：先决定“光从哪里看角色”
ShadowPass 需要的不是相机矩阵，而是 `RenderWorld.shadowView.viewProjection`。它由 RenderExtractor 根据当前帧的阴影投射物和接收物包围盒计算，而不是使用固定的、覆盖整张世界地图的正交相机。

设投射物世界包围盒为 `B_caster`，其中心为 `C`，半径近似为包围盒 extent 的长度 `r`；主方向光方向归一化为 `d`。代码先构造光源观察点：
```text
lightPosition = C - d × (2r)
V_light       = lookAtRH(lightPosition, C, up)
```

接着把投射物包围盒变换到光空间：
```text
B_light = transform(B_caster, V_light)
left   = B_light.min.x - margin
right  = B_light.max.x + margin
bottom = B_light.min.y - margin
top    = B_light.max.y + margin
```

这一步比“以球体半径创建正方形正交投影”更紧凑。阴影图分辨率是固定的；正交投影范围越大，每个 texel 覆盖的世界空间面积越大，角色上的阴影就越粗糙。用光空间包围盒拟合后，阴影 texel 会集中在当前角色和接收区域。

为了避免角色轻微移动就让整张 Shadow Map 平移半个 texel，代码还会执行 texel snapping。若投影宽高分别为 `W = right - left`、`H = top - bottom`，阴影图尺寸为 `(N_x, N_y)`，则：
```text
texelWidth  = W / N_x
texelHeight = H / N_y

snappedCenterX = round((left + right) / (2 × texelWidth)) × texelWidth
snappedCenterY = round((bottom + top) / (2 × texelHeight)) × texelHeight
```

再以 snapped center 重建 `left/right/bottom/top`。这样相机或动画的微小变化只要没有跨过一个阴影 texel，就不会使整片阴影连续漂移。最后，结合投射物和接收物在光空间的 Z 范围，构造 `P_light = orthoRH_NO(...)`，并写入：
```text
shadowView.viewProjection = P_light × V_light
shadowView.extent         = Shadow Map 分辨率
```

### 2. ShadowPass：把可投影的深度写入 Shadow Map
ShadowPass 的输入是 `RenderWorld.shadowItems` 和刚刚构建的 `shadowView`。每个 ShadowRenderItem 有自己的世界矩阵、VAO、材质分类与可选 SkinningPalette；透明 Blend 物体不会进入此集合，Masked 物体会进入并执行 alpha discard。

Pass 建立一个只含 `Depth32Float` 附件的 FBO，并启用 comparison sampling。核心顶点代码位于 `assets/shaders/shadow/shadow.vert`：
```glsl
if (uSkinningEnabled)
{
    skinningMatrix =
        jointMatrices[joints.x] * weights.x +
        jointMatrices[joints.y] * weights.y +
        jointMatrices[joints.z] * weights.z +
        jointMatrices[joints.w] * weights.w;
    localPosition = (skinningMatrix * vec4(inPosition, 1.0)).xyz;
}

gl_Position =
    uLightViewProjection * uModel * vec4(localPosition, 1.0);
```

其数学形式为：
```text
p_skin  = (Σᵢ wᵢ Jᵢ) × p_local
p_light = P_light × V_light × M_world × p_skin
```

GPU 随后将 `p_light.z / p_light.w` 对应的深度写入 Shadow Map。Shadow fragment shader 不需要输出颜色；它只在 Masked 材质时读取 Base Color alpha，并执行：
```glsl
if (texture(uBaseColorTexture, vTexCoord).a *
        uBaseColorFactor.a < uAlphaCutoff)
{
    discard;
}
```

这保证树叶、睫毛、发卡等被 alpha 裁掉的区域也不会意外投出实心阴影。Pass 绘制期间会开启 `PolygonOffset(2.0, 4.0)`。原因是 Shadow Map 写入与主渲染采样都存在深度离散误差；若表面深度恰好等于自身记录的深度，误差可能把自身判断为遮挡。Polygon Offset 让深度写入产生小偏移，降低 acne；但偏移过大则会形成 Peter Panning，因此参数需要在稳定性和贴合度之间权衡。

Pass 成功后的 FrameContext 输出为：
```text
Main ShadowPass         -> frame.shadowMap
FaceFiltered ShadowPass -> frame.faceFilteredShadowMap
```

两个 ShadowPass 使用相同结构，区别仅是 FaceFiltered 版本会跳过 `excludeFromFaceFilteredShadow` 标记的投射物。这个输出不是最终阴影颜色，而是一张“从光源看，最近遮挡物有多远”的深度比较纹理，真正的可见度由主材质 Shader 在下一阶段计算。

### 3. Forward 顶点阶段：把动画顶点送到主相机
不透明前向阶段开始后，StaticModelRenderer 为每个 RenderItem 绑定 VAO、材质、模型矩阵、法线矩阵、主相机 ViewProjection 和可选皮肤 SSBO。若 Primitive 含 Morph，VAO 的顶点 Buffer 已经在本帧由 Compute Shader 更新；若不含 Morph，它指向原始 RuntimeMesh Vertex Buffer。因此主顶点 Shader 无需知道“这个顶点是否由 Morph 得来”，只消费统一顶点布局。

`static_model.vert` 的关键流程是：
```glsl
localPosition = inPosition;
localNormal   = inNormal;
localTangent  = inTangent.xyz;

if (uSkinningEnabled)
{
    skinningMatrix = calculateSkinningMatrix();
    localPosition  = (skinningMatrix * vec4(inPosition, 1.0)).xyz;
    localNormal    = mat3(skinningMatrix) * localNormal;
    localTangent   = mat3(skinningMatrix) * localTangent;
}

worldPosition = uModel * vec4(localPosition, 1.0);
worldNormal   = normalize(uNormalMatrix * localNormal);
gl_Position   = uViewProjection * worldPosition;
```

完整的空间变换链为：
```text
Morph 输出（可选）
    -> 骨骼局部空间：p_skin = Σᵢ wᵢ Jᵢ p_morph
    -> 世界空间：    p_world = M_world p_skin
    -> 裁剪空间：    p_clip = P_camera V_camera p_world
    -> NDC：         p_ndc = p_clip.xyz / p_clip.w
    -> 光栅化：      由 GPU 插值得到每个片元的 worldPosition、normal、UV、tangent
```

顶点 Shader 还有两项为风格化服务的额外输出。第一，`uSurfaceOffset` 沿几何法线推开当前材质层，用于处理作者有意叠在同一基础表面的细节层，减少 z-fighting，但不破坏它与其他物体的正常深度关系。第二，启用 spherical face normal 时，Shader 会用顶点相对球心的位置计算近似球面法线，并按到设定半径表面的距离生成 `sphereWeight`。片元 Shader 之后可以只在受影响区域混合这条更稳定的法线。

### 4. MToon 片元阶段：从纹理、光照和遮挡合成三个 MRT 输出
光栅化之后，`mtoon.frag` 对每一个覆盖片元执行。其输入并不只有“法线和光方向”，而是上一节顶点插值、材质纹理与参数、主光/环境光/相机、两张 Shadow Map、可选 Face SDF 和头发阴影 Mask。完整的处理顺序可概括为：

```text
Base Color + Alpha Mask
    -> 几何法线 / 法线贴图 / TBN
    -> 普通或球面稳定的 Toon N·L
    -> Face SDF 与 Hair Mask 修正面部 shading factor
    -> Shadow Map 得到投影可见度
    -> Toon 直接光 + 投影阴影
    -> 环境光、AO、MatCap、Rim、Emission、Specular
    -> outColor + outNormal + outMaterialId
```

首先，Base Color 由常量因子和贴图相乘：
```glsl
baseColor = uBaseColorFactor * texture(uBaseColorTexture, uv);
if (uAlphaMaskEnabled != 0 && baseColor.a < uAlphaCutoff)
    discard;
```

法线贴图通过世界空间 TBN 变换。设几何法线为 `N_g`，切线为 `T`，副切线为 `B = cross(N_g, T) × tangentSign`，从法线纹理重建的切线空间法线为 `N_t`，则：
```text
N_surface = normalize([T B N_g] × N_t)
```

这条 `N_surface` 用于正常光照细节；用于 Toon 阈值的法线则可以是：
```text
N_toon = normalize(mix(N_surface, N_sphere, sphereWeight))
NdotL  = dot(N_toon, normalize(-uLightDirection))
```

随后使用 Shift、Toony 和 `fwidth` 建立抗锯齿的分界。这里的 `fwidth` 是同一数值在当前片元邻域的屏幕导数估计，能让非常锐利的阈值在亚像素边缘仍平滑过渡：
```glsl
threshold       = -(uShadingShift + sampledShift * scale);
transitionWidth = max(1.0 - uShadingToony, 0.0001);
aaWidth         = max(transitionWidth * 0.5, fwidth(NdotL));
normalFactor    = smoothstep(
    threshold - aaWidth,
    threshold + aaWidth,
    NdotL);
```

投影阴影采样时，世界坐标会再次变换到光源裁剪空间：
```text
p_shadow = P_light V_light p_world
uvz      = p_shadow.xyz / p_shadow.w × 0.5 + 0.5
```

若 `uvz` 位于 Shadow Map 外，则视为不受这张图影响；否则计算基于朝向的 bias，并对周边 5×5 texel 使用中心权重更高的 tent 核比较采样：
```text
visibility = (Σ₍ₓ,ᵧ₎ comparisonSample(uv + (x,y)×texelSize,
                                      depth - bias) × weightₓ × weightᵧ) / 81
```

这里 `comparisonSample` 由 `sampler2DShadow` 执行“当前深度是否不大于 Shadow Map 已存深度”的比较。可见度为 1 表示受光，为 0 表示处于投影阴影。若材质启用 shadow cutoff，则对可见度再执行一次 `smoothstep(cutoff - aa, cutoff + aa, visibility)`，把连续投影压缩成更有赛璐珞感的边缘。

MToon 的直接光并非简单乘 visibility。它先计算：
```text
toonColor       = mix(shadeColor, litColor, faceShadingFactor) × toonRamp
castShadowColor = shadeColor × toonRamp(最暗端)
directColor     = mix(castShadowColor, toonColor, shadowMask)
```

其中 `faceShadingFactor` 是普通 Toon 因子、Face SDF 因子和头发遮挡共同确定的面部/局部明暗；`shadowMask` 是方向光投影可见度。将两者分离后，美术可以分别控制“模型自身哪边是阴影”和“环境中某个物体是否挡住了主光”。

最后写入三个 Render Target：
```glsl
outColor      = vec4(finalColor, baseColor.a);
outNormal     = vec4(geometricNormal * 0.5 + 0.5, 1.0);
outMaterialId = vec4(uOutlineMaterialId, 1.0);
```

`finalColor` 继续保留在线性 HDR 空间中；Normal 与 Material ID 则是为后续屏幕空间描边生产的辅助数据。这正是前向材质与后处理合作的接口。

### 5. 从三个 MRT 附件得到两种描边
ForwardOpaquePass 结束时，FrameContext 中已经有 `hdrColor`、`depth`、`normal` 与 `materialId`。随后两条描边路径并行地基于这些信息工作。

**几何外壳路径**的输入是 Opaque RenderItem、同一套 VAO/SkinningPalette、材质的 World Outline 参数和主深度纹理。Outline 顶点 Shader 仍先蒙皮，再执行：
```text
p_outlineWorld = p_world + normalize(N_world) × width × widthMask(uv)
p_outlineClip  = P_camera V_camera p_outlineWorld
```
Pass 剔除外壳正面，仅让扩张网格的背面在原模型剪影外露出；其片元输出为 `(outlineColor, 1)` 写进 `outlineMask`。它不修改 HDR Color，因此完整保留“描边覆盖度”和“描边颜色”这两项独立信息。

**屏幕空间路径**不再读取网格。它以全屏三角形采样 Depth、Normal 与 Material ID。深度缓冲值 `z_d` 先由 near/far 还原到线性视空间距离：
```text
z_ndc    = 2z_d - 1
z_linear = 2 × near × far /
           (far + near - z_ndc × (far - near))
```

Shader 在中心像素的 3×3 邻域比较 `z_linear`，得到 depth coverage；同时解码法线 `N = normal.rgb × 2 - 1`，以 `1 - dot(N_center, N_neighbor)` 得到 normal difference。是否输出某个差异还要查询 Material ID 对应的 `ScreenOutlinePolicy`：同组材质可以抑制法线接缝、不同材质可以有自己的深度和法线阈值。

第一张全屏绘制把结果写入：
```text
screenEdgeMask.r = max(depthCoverage, normalCoverage)
screenEdgeMask.g = depthCoverage
screenEdgeMask.b = normalCoverage
```

第二张全屏绘制读取 `hdrColor`、`outlineMask`、`screenEdgeMask` 与 policy SSBO：
```text
shellCoverage    = outlineMask.a
screenCoverage   = 连续性过滤后的 screenEdgeMask.r
combinedCoverage = max(shellCoverage, screenCoverage)
outlineColor     = shellCoverage > 0 ? outlineMask.rgb : policy.color
outlinedHdr      = mix(hdrColor, outlineColor, combinedCoverage)
```

输出 `outlinedHdrColor` 后，ScreenSpaceOutlinePass 将 `frame.hdrColor` 改指向这张新纹理。旧 HDR Color 仍由 ForwardOpaquePass 所有，直到本帧所有后续采样结束才会随 Pass 生命周期处理。这避免了 OpenGL 读写同一纹理的反馈问题。

### 6. HDR、Tone Mapping、FXAA 与最终输出
到后处理阶段，输入是已经合成描边的线性 `outlinedHdrColor`，以及 FrameContext 中由 Viewer 控制的 `exposure`、Tone Mapping 开关和 FXAA 开关。PostProcessPass 在自己的 `RGBA8 ldrColor` FBO 上绘制全屏三角形，执行：
```text
exposed = hdrColor × max(exposure, 0)
mapped  = toneMapping ? 1 - exp(-exposed)
                       : clamp(exposed, 0, 1)
ldr     = pow(max(mapped, 0), 1 / 2.2)
```

指数映射会让高亮逐渐趋近 1，而不是硬截断；gamma 校正则把线性颜色转换为更适合显示器显示的编码空间。Pass 的输出是：
```text
frame.ldrColor = &PostProcessPass::ldrColor_
```

FxaaPass 是最后一个消费者。它接收 `ldrColor` 与：
```text
uInverseScreenSize = (1 / framebufferWidth, 1 / framebufferHeight)
```

对中心、左上、右上、左下、右下五个采样点计算亮度：
```text
luma = 0.299R + 0.587G + 0.114B
```
由对角亮度差估计边缘方向 `dir`，再在该方向上采样得到 `colorA` 与 `colorB`。若 `colorB` 的亮度超出原局部范围，使用较保守的 `colorA`；否则使用 `colorB`。这个选择避免模糊跨越真正强对比边缘的颜色。

FxaaPass 最终绑定默认 Framebuffer，输出的是窗口后台缓冲而不是新的离屏纹理：
```text
frame.ldrColor -> FxaaPass -> default Framebuffer -> swapBuffers -> 屏幕
```

至此，一帧的资源流闭合：ScenePose、Morph 与 Skinning 生成几何输入；RenderExtractor 生成 RenderWorld 与阴影视图；ShadowPass 生成深度比较纹理；Forward Pass 生成 HDR/Depth/Normal/Material ID；描边生成新的 HDR；后处理生成 LDR；FXAA 将其提交给窗口。每个阶段都有可定位的输入、可观察的输出和明确的下游消费者，正是该项目能持续扩展风格化效果而不让渲染流程失控的基础。

## MToon 材质：把“可控的风格”放进参数系统
项目提供 Unlit、基础 PBR、法线调试与 MToon 多种材质模板，其中 MToon 是三渲二角色表现的主体。它不是只将 Lambert 光照二值化，而是将多组艺术控制统一到 `MToonMaterialParameters` 和材质纹理绑定中。

### Toon 明暗与投影阴影
对于直接光照，Shader 先计算法线与光线的夹角，再以 `shadingShift` 和 `shadingToony` 控制明暗阈值与过渡宽度；着色偏移纹理可以为局部区域进一步调整阈值。亮部颜色、阴影色和 Toon Ramp 随后组合成明确但仍带抗锯齿过渡的色阶。

主光源阴影来自 Shadow Map。Shader 使用法线相关 bias，并采用 5×5 tent filter 软化采样；如果启用阴影截断，则把连续可见度收紧为更接近动画赛璐珞风格的阴影边界。为了避免刘海等特定物体干扰面部，管线还维护一张 FaceFiltered Shadow Map：投射物可被标记为排除，启用 Face SDF 的面部材质便能采样这张更干净的阴影图。

#### 从 N·L 到 Toon 色阶
常规 Lambert 漫反射可以写为 `max(dot(N, L), 0)`。MToon 的目标不是保留连续亮度，而是把它变成可由美术明确控制的明暗区间。项目先计算用于 Toon 阈值的法线与主光夹角 `normalDotLight`，然后引入两组参数：

```text
threshold       = -(shadingShift + shadingShiftTexture × scale)
transitionWidth = max(1 - shadingToony, ε)
shadingFactor   = smoothstep(threshold - width, threshold + width, N·L)
```

`shadingShift` 决定明暗交界整体向亮部还是暗部移动；`shadingToony` 越接近 1，过渡带越窄，画面越像硬边赛璐珞。实际宽度还会与 `fwidth(N·L)` 取较大值，让屏幕像素覆盖的阈值变化得到抗锯齿处理。结果不是简单的 0 或 1，而是稳定的连续因子，可用于在 `shadeColor` 与 `litColor` 之间混合，再以 Toon Ramp 赋予色带风格。

为让面部的 Toon 阈值更稳定，材质还可启用 spherical face normal。此时项目会按权重将普通表面法线与近似球面的法线混合，仅用于直接光的明暗分界；真正的阴影、Rim、高光等仍可使用保留细节的表面法线。这个分工避免了“为了稳定脸部阴影而让所有光照都变得过于平滑”。

#### 投影阴影如何融入 Toon 光照
Shadow Map 采样输出的 visibility 是“光源对当前点可见多少”，而非最终颜色。MToon 先生成无投影阴影的 Toon 颜色，再用可见度在它和更暗的 cast-shadow 颜色之间插值。这样，模型自身的 Toon 明暗与外部投影阴影仍共享 Toon Ramp 和 Shade Color，视觉上会像同一位画师处理的色阶，而不是把一层灰色阴影硬盖在材质上。

采样前，Shader 会根据表面朝向计算 bias，减轻 Shadow Acne；并可让法线贴图的细节有限参与位置偏移，防止微小法线扰动过度拉扯投影阴影。5×5 tent filter 使用中心权重更高的核，能隐藏 Shadow Map 的离散像素，又不会像大范围平均那样把赛璐珞边界洗得过软。

### 材质参数、纹理与回退资源
MToon 的每种可选纹理都能独立缺省。`RuntimeResourceCache` 会为缺失贴图提供白色、黑色或法线等语义正确的回退纹理，因此 Shader 不需要为“有没有贴图”布满分支。例如，白色的颜色/遮罩纹理意味着保持参数原值，黑色的自发光纹理意味着无额外发光，默认法线纹理意味着不扰动几何法线。

参数与纹理的组合方式遵循“颜色 × 纹理 × 强度”的直觉。例如，Rim 由 Rim Mask、Fresnel 因子、Rim Color 和 Lighting Mix 共同决定；高光由 Specular Texture、Specular Color、主光辐射、幂次和强度共同决定。这允许美术只用常量快速得到基础效果，也可以逐步加贴图限定影响区域，而不需要更换材质类型。

#### MToon Shader 的输入与输出
MToon 是整个管线中输入最丰富的 Shader 之一。将它展开后可以看出，项目没有把所有效果隐藏在某个“大纹理”里，而是让每类数据拥有明确来源：

| 输入组 | 代表数据 | 来源 | 解决的问题 |
| --- | --- | --- | --- |
| 顶点插值 | 世界位置、几何法线、切线、UV、球面脸法线权重 | `static_model.vert` | 得到每个片元的局部几何信息 |
| 基础材质 | Base Color、Shade、Normal、AO、Alpha Cutoff | `MaterialInstance` + 纹理 | 定义角色自身颜色与表面细节 |
| 风格控制 | Shading Shift、Toony、Toon Ramp、MatCap、Rim、Emission、Specular | MToon 参数与纹理 | 将连续光照转为可控艺术表现 |
| 场景光照 | 主方向光、天空/地面环境光、相机位置 | `RenderWorld.mainView` | 提供直接光、间接光和视角相关效果 |
| 遮挡信息 | Shadow Map、FaceFiltered Shadow Map、FaceHair Mask | 前序 Shadow Pass | 处理全局投影、面部过滤投影与刘海投影 |
| 面部信息 | Face SDF、头部基向量、局部阴影视图 | `RenderExtractor` + sidecar | 稳定脸部的二维式明暗 |

最终 Shader 必须同时写出三项，而非只有最终颜色：
```glsl
outColor      = vec4(finalColor, baseAlpha);
outNormal     = vec4(geometricNormal * 0.5 + 0.5, 1.0);
outMaterialId = vec4(encodedOutlinePolicyId, 1.0);
```

这三项输出服务的对象不同：`outColor` 进入当前画面，`outNormal` 为未来的 ScreenSpaceOutlinePass 保留稳定形状信息，`outMaterialId` 让未来的像素能检索“我所属材质的描边规则”。从这个角度看，MToon 不只是一个最终着色器，它也是前向渲染与屏幕空间后处理之间的信息生产者。

### 让材质拥有更多画面语言
除了主明暗，MToon 还支持以下叠加项：

- 天空—地面渐变的环境光，以及 GI 均衡参数；
- 切线空间法线贴图与可调强度；
- MatCap，用于提供与视角相关的艺术化反射；
- 基于 Fresnel 的边缘光及其遮罩；
- 自发光、AO、纹理化高光；
- Alpha Mask 裁剪；
- 世界空间外壳描边与屏幕空间描边策略。

这些项最终在同一个前向片元着色器中合成。与此同时，Shader 会把未经法线贴图扰动的几何法线写入描边附件：光照仍可使用细节法线，但布料或头发贴图的细节不会被误识别为一圈不断跳动的屏幕描边。

#### 间接光、MatCap、Rim 与高光的分工
MToon 的环境光并不是一个固定常量。Shader 根据法线的 Y 分量，在天空色与地面色之间插值得到方向性环境光；`giEqualization` 可进一步把这种方向性拉向均匀环境光。这样角色顶部和底部仍有基本层次，但不会因为环境光方向过强而破坏美术设定的主明暗。

MatCap 使用观察空间法线的 XY 分量计算 UV，因此它像一个附着在屏幕上的材质球反射，可方便地制作金属、丝绸或眼睛高光等强风格效果。Rim 则基于 `1 - dot(N, V)` 的 Fresnel 关系，使用 `rimFresnelPower` 控制边缘收缩，用 `rimLift` 抬高基础覆盖范围；`rimLightingMix` 决定它是独立的装饰光还是会被场景光照影响。

常规高光使用半角向量 `H = normalize(L + V)` 与 `pow(max(dot(N,H),0), power)`。它并不试图成为完整的物理微表面模型，而是与纹理遮罩、颜色、强度和幂次组合，提供更接近二次元角色的可画性。最后，自发光直接加入结果，适合眼睛、特效贴图或不希望受主光影响的装饰。

最终颜色可概括为：
```text
finalColor = directToon
           + indirectEnvironment × occlusion
           + matcap
           + rim
           + emission
           + specular
```

这个结构的意义在于，每个贡献都能单独观察与调节。MToon Debug View 已经支持查看基础色、阴影色、投影阴影、Rim、MatCap 和自发光，使“角色看起来不对”可以拆解为具体的材质分量，而不是笼统地调一个总亮度。

### Face SDF 与头发投影：面部稳定性的专门处理
面部是角色渲染中最敏感的区域。单纯用逐像素法线决定面部明暗，角色转头或光线略微变化时，鼻梁、脸颊等局部法线容易让阴影跳动，破坏手绘感。

本项目的 Face SDF 路径使用头部局部坐标系中的前、右、上向量，将主光方向投影到面部平面，得到光源相对脸部的水平角度；随后按左右光照方向镜像采样 SDF 纹理，并以 SDF 值决定 Toon 明暗。它可以与普通法线明暗按强度混合，而不是强制替换整个材质。

另一条 `FaceHairShadowPass` 会从头部局部视角渲染指定头发投射体，生成一张小尺寸的头发阴影 Mask。面部 Shader 在世界空间投影后对该遮罩进行 3×3 采样并平滑，最终把可见度并入同一套 Toon 阴影因子。因而“刘海压在额头上”的阴影既有独立的可调分辨率、范围、偏移、软度与强度，也能与角色面部色阶保持一致。

#### Face SDF 的坐标与镜像逻辑
Face SDF 并不把光线直接投影到世界坐标的某个平面。`RenderExtractor` 会从头部节点当前的世界矩阵中恢复一组正交的 faceForward、faceRight、faceUp，因此角色抬头、歪头或播放动画时，面部坐标系仍随头骨一起运动。Shader 先从主光方向中移除 Up 方向分量，得到面部平面的水平光方向，再通过它与 Forward/Right 的点积求得相对角度。

角色左右脸通常可以共享一张 SDF 贴图。项目会根据光线位于脸部哪一侧决定是否镜像 U 坐标，并与 sidecar 中的 `flipHorizontal` 配置共同作用。随后以 SDF 采样值减去归一化光照角度，得到带符号的阈值；`smoothstep` 与 `fwidth` 用于控制软度和像素级抗锯齿。这个过程可以理解为：SDF 贴图编码“这张脸在某个光照角度下应该有多大阴影”，主光方向再从中选择对应切线。

`strength` 允许 Face SDF 与普通法线 Toon 结果混合。调到 1 时，面部明暗完全遵从 SDF；调低后，模型局部法线仍保留部分影响。这对于不同面部拓扑、不同光照风格或希望轻微保留鼻梁体积感的角色都很实用。

#### 头发阴影为何需要独立相机
若只依赖主光 Shadow Map，头发投影到面部的细小轮廓会与全角色、地面等对象争夺同一张阴影图的 texel；同时刘海常常会产生不符合二维表现的碎裂阴影。FaceHairShadowPass 因此以头部为中心创建一台局部正交相机，只渲染指定的刘海投射物，并且可按头发 alpha 做裁剪。

这个局部视图的宽、高、深度、相机距离、分辨率和 UV 偏移全部可以独立配置。它跟随头部世界变换生成，因而角色动画不会让阴影纹理停留在旧位置；Mask 生成后，面部 Shader 会在投影坐标周围做 3×3 采样，再按 softness 与 strength 转为可见度。最终它与 Face SDF 取更暗的一侧，使头发遮挡自然进入相同的 Shade Color 与 Toon Ramp，而不是以另一套灰度滤镜叠在脸上。

#### 面部系统的输入—中间结果—输出
Face SDF 与 FaceHairShadow 不是孤立插件，而是一条完整的数据链：

```text
sidecar JSON
    -> 面部材质、头节点、局部前/右方向、SDF 纹理
    -> RenderExtractor 根据当前 ScenePose 得到世界空间面部基向量
    -> FaceHairShadowPass 根据头部局部相机绘制 hairShadowMask
    -> StaticModelRenderer 只向符合条件的面部 RenderItem 绑定上述资源
    -> mtoon.frag 计算 faceShadingFactor
    -> outColor / outNormal / outMaterialId
```

对 Face SDF 而言，输入是 UV、主光方向、faceForward/right/up、SDF 纹理、镜像开关、offset、softness 和 strength；中间结果是“光照相对脸部的角度”与“该角度下 SDF 给出的阈值”的差；输出是 0 到 1 的 `sdfVisibility`。它随后与普通 `normalShadingFactor` 混合，并不会直接输出颜色。

对刘海阴影而言，输入是像素世界坐标、局部阴影视图投影矩阵、Mask 纹理、UV 偏移、softness 和 strength；中间结果是世界坐标投影后的 UV 以及周围 3×3 采样平均值；输出是 `faceHairShadowVisibility`。Shader 最终取 `min(shadingFactor, faceHairShadowVisibility)`，得到更暗的一方作为 `faceShadingFactor`。因此两个系统都只生产“应当多亮”的因子，颜色仍由统一的 MToon Shade Color 与 Ramp 决定。

## 动画、蒙皮与 Morph Target
渲染效果必须在角色运动时保持成立，因此项目将节点动画、骨骼蒙皮和表情 Morph 纳入同一帧更新流程。

`AnimationPlayer` 从导入的关键帧中采样平移、旋转、缩放和 Morph 权重。向量轨道使用线性插值，旋转使用四元数球面插值；采样结果写入 `ScenePose` 与 `SceneMorphPose`，随后更新节点世界矩阵。

对于蒙皮网格，`SkinningPaletteSet` 以节点和 Skin 定义为单位复用调色板，只有 Pose 版本发生变化时才重新计算并上传关节矩阵。渲染时，顶点 Shader 通过 SSBO 中的关节矩阵进行蒙皮，因此主材质、阴影和外壳描边可以共享同一套骨骼动画结果。

Morph Target 则采用 GPU Compute Shader。初始化时，每个含 Morph 的 Primitive 会准备基础顶点、稀疏 delta、每顶点 delta 范围、权重和动态输出顶点缓冲；权重变化后，以每组 64 个顶点调度 Compute：
```text
基础顶点 + Morph delta × 权重
    -> 动态顶点 Buffer
    -> Vertex Shader / ShadowPass / OutlineMaskPass
```

Compute 结束后会插入可见性屏障，确保后续顶点输入读到最新结果。这样表情、口型等形变不会只出现在主渲染中，而会同步影响阴影、描边与轮廓。

### 从动画时间到渲染姿势
每帧更新时，Viewer 先推进 `AnimationPlayer` 的播放时间，处理循环、暂停、停止、播放速度和 seek；然后将当前时间采样为节点局部 Transform 与 Morph 权重。若切换动画或停止播放，Pose 会先恢复到 bind pose，再写入当前动画结果，避免上一段动画留下没有被新动画覆盖的局部变换。

节点动画与 Morph 动画在数据上是两条并行通路：

```text
AnimationClipAsset
    ├── Translation / Rotation / Scale channels
    │       -> ScenePose
    │       -> updateWorldMatrices
    │       -> SkinningPaletteSet
    └── Morph weight channels
            -> SceneMorphPose
            -> RuntimeMeshInstance::MorphState
            -> Morph Compute Shader
```

向量关键帧采用线性插值；旋转关键帧会先统一四元数符号，再用 SLERP 插值，从而走较短旋转路径并保持单位四元数。相机节点还支持独立的插值阈值，用来避免外部相机轨道中异常跨度的关键帧造成突兀插值。所有这些工作都发生在 CPU 场景状态层，渲染层只消费已经准备好的矩阵与顶点缓冲。

### Skinning Palette 的更新与复用
一个角色的多个 Primitive 可能引用同一套骨骼定义。`SkinningPaletteSet` 初始化时会比较网格节点、关节节点索引和 inverse bind matrix，把相同 Skin 合并为一个 Palette Group；不同 Primitive 只保存指向这份 Palette 的引用。这样同一套身体骨骼不会因为皮肤、衣服、鞋子各有一个 Primitive 就被重复上传多份。

每个关节矩阵的核心关系是：
```text
jointMatrix = inverse(meshNodeWorld)
            × jointNodeWorld
            × inverseBindMatrix
```

顶点保存至多四个关节索引与权重，顶点 Shader 将对应关节矩阵按权重线性组合后变换位置、法线和切线。`ScenePose` 有版本号；当世界矩阵未改变时，`SkinningPaletteSet` 会跳过计算和 GPU 上传。这是一个很小但很关键的优化：静止展示角色或暂停动画时，渲染仍可继续，但不必每帧重复传输相同的骨骼矩阵。

### GPU Morph 的数据布局与调度
Morph Target 若在 CPU 上逐顶点叠加，表情变化时会占用 CPU 时间，并且还要将完整顶点流再次上传。项目选择把叠加过程放到 Compute Shader：CPU 只更新较小的权重 Buffer，GPU 则读取基础顶点、每个顶点的 delta 范围和连续存放的 Morph delta，直接写入动态顶点 Buffer。

每个顶点的计算逻辑是：
```glsl
result = baseVertex;
for (delta : deltasOfThisVertex)
{
    weight = morphWeights[delta.targetIndex];
    result.position += delta.position * weight;
    result.normal   += delta.normal   * weight;
    result.tangent  += delta.tangent  * weight;
}
normalize(result.normal);
normalize(result.tangent);
```

这里采用“每个顶点一段 delta 范围”的压缩布局，而不是为每个 Target 复制一整份顶点数组。对于大多数顶点只受少数表情影响的角色模型，这能减少无效读取。输出顶点 Buffer 会建立自己的 Vertex Array，但索引 Buffer 与原始 RuntimeMesh 共享；既保留了 Morph 后的顶点属性，又避免重复存储索引。

`RuntimeMeshInstance` 还记录每个 Primitive 已应用的 Morph 版本。若滑条、动画或表情系统没有改变权重，Compute 不会再次调度；若权重改变，Viewer 会统计本帧和累计的 Morph 上传/更新次数。该数据与 CPU 动画、骨骼更新、渲染管线耗时一起显示，使性能分析不必只看一个笼统的帧率。

### 动画与形变链路的输入和输出
角色运动涉及三个层次的结果，它们的输入与消费者各不相同：

| 阶段 | 主要输入 | 主要输出 | 直接消费者 |
| --- | --- | --- | --- |
| AnimationPlayer | AnimationClip、当前时间、`deltaTime`、bind pose | 局部 TRS、Morph 权重 | ScenePose、SceneMorphPose |
| ScenePose | 节点父子关系、局部 TRS | 每节点世界矩阵、Pose 版本 | RenderExtractor、SkinningPaletteSet |
| SkinningPaletteSet | 世界矩阵、inverse bind matrix、网格节点 | GPU joint matrix SSBO | 主材质、ShadowPass、OutlineMaskPass |
| Morph Compute | 基础顶点、delta、权重、输出 Buffer | 形变后 position/normal/tangent | 所有使用该 Primitive 的 Vertex Array |
| RenderExtractor | 当前 Pose、Morph RuntimeMeshInstance | 更新后的 world bounds、RenderItem | 全部 Render Pass |

其中 RenderExtractor 会对 Morph Primitive 使用其保守的局部包围盒，并结合最大位置增量，以免表情或形变导致顶点越出原始包围盒后被错误地视锥裁剪。换言之，Morph Compute 的输出不仅影响“顶点长什么样”，还间接影响当前帧物体是否被判定为可见、是否进入阴影投射集合。

ShadowPass、ForwardOpaquePass 和 OutlineMaskPass 都通过同一 RenderItem 指向的 VAO 与 SkinningPalette 读取数据。因此，角色动画的一份输入结果会被多个 Pass 重用，而不是每个 Pass 自己重新计算姿势；这既保证了本体、阴影和描边一致，也避免了渲染阶段出现难以调试的时间不同步。

## Viewer：将渲染框架变成可观察的角色查看器
`apps/viewer` 不是单纯的样例入口，而是当前项目的验证和调参界面。它负责加载场景、初始化运行时资源与 Pipeline，并提供轨道相机、场景相机、动画播放和渲染设置控制。

基于 Dear ImGui 的面板能够调整主光、阴影、曝光、Tone Mapping、FXAA、MToon 参数、描边参数、动画播放和 Morph 权重；同时可以显示各 Pass 状态、Draw Call 数、CPU 分阶段耗时以及 GPU Pass 计时。渲染错误不再只能凭最终画面猜测，而可以沿着“资产—场景—RenderWorld—Pass—附件”的路径检查。

项目还支持 MToon 材质 sidecar 配置。它将与模型绑定但不一定适合直接写回源资产的材质覆盖、面部 SDF 和头发阴影配置序列化为 JSON，Viewer 在加载场景时应用这些配置，并可保存当前调整结果。这使美术调参和模型导入保持相对独立。

### 一帧中的 Viewer 调度顺序
Viewer 继承引擎的 `Application` 生命周期。窗口事件、输入与时间步长由基础 Application 统一处理；Viewer 则在 `onUpdate` 与 `onRender` 中填入角色查看器特有逻辑。简化后的每帧顺序如下：

```text
窗口事件与 deltaTime
    -> 轨道相机 / 场景相机更新
    -> AnimationPlayer 采样
    -> ScenePose、Skinning Palette、Morph Buffer 更新
    -> RenderExtractor 生成 RenderWorld
    -> FramePipeline 执行所有 Pass
    -> ImGui 面板绘制
    -> 交换前后缓冲
```

这种顺序确保 UI 看到的是刚刚执行完的 Pipeline 状态，也确保渲染使用的是本帧最新的骨骼、表情和相机。模型可以作为命令行参数传入；相机轨道则可从 JSON 加载。Viewer 同时保存独立控制相机与场景相机，方便在“还原镜头”和“自由检查材质细节”之间切换。

### 参数编辑如何作用到下一帧
Viewer 的面板并不直接改写 Shader 源文件。材质、光照、描边与后处理开关最终写入 `MaterialInstance`、Pass settings 或 FrameContext 字段：

| 面板类别 | 写入对象 | 生效位置 |
| --- | --- | --- |
| MToon 颜色、Ramp、Rim、MatCap、Face SDF | `MaterialInstance` | 下一次 `RuntimeMaterial::bind` 设置 uniform/纹理 |
| 世界描边、屏幕描边和调试视图 | Outline Pass settings | 下一次 Outline Pass 执行 |
| 阴影开关、曝光、Tone Mapping、FXAA | `FrameContext` | 本帧后续 Pass 或下一帧 Pipeline |
| 播放、循环、速度、时间轴 | `AnimationPlayer` | 下一次动画采样 |
| Morph 权重 | `MorphState` | 版本变化后触发 Compute Shader |

这说明 Viewer 并不是“把所有参数塞进全局变量”的临时界面。它通过项目正式的材质、渲染 Pass 和动画接口调节状态，因此面板操作本身也在验证这些抽象边界是否足够清晰。

### Viewer 的输入与输出边界
作为应用层，Viewer 连接了文件、引擎和最终窗口。它的输入输出可以按生命周期理解：

| 阶段 | 输入 | 处理 | 输出 |
| --- | --- | --- | --- |
| 启动 | 命令行模型路径、可选相机 JSON、窗口描述 | 创建 Application、OpenGL Context、GraphicsDevice 与材质模板 | 可运行的 Viewer 环境 |
| 场景加载 | glTF/GLB、纹理、动画、可选 MToon sidecar | ModelImporter 导入资产；创建 RuntimeResourceCache、SkinningPalette、Morph 实例 | `SceneRuntimeInstance` |
| 每帧更新 | 输入事件、deltaTime、UI 交互、当前动画/表情状态 | 相机控制、动画采样、骨骼上传、Morph Compute | 最新 ScenePose 与运行时顶点数据 |
| 每帧渲染 | SceneRuntimeInstance、相机、主光、材质模板 | RenderExtractor + FramePipeline | 默认 Framebuffer 中的最终 LDR 图像 |
| UI/诊断 | Pass 状态、计时查询、RenderWorld 统计、材质参数 | ImGui 组织为可操作面板 | 可视化参数、调试附件与性能信息 |

`SceneRuntimeInstance` 正是 Viewer 避免把“加载结果”散落在多个全局容器中的关键。它把一个场景的源文件路径、Scene Handle、ScenePose、SceneMorphPose、AnimationPlayer、SkinningPaletteSet、每节点的 Morph Mesh Instance 和 Face SDF 运行时配置组合在一起。即使未来 Viewer 支持同时加载多个角色，每个角色也能拥有独立姿势、动画和面部配置，再由 RenderExtractor 逐个 append 到同一 RenderWorld。

在最终输出之外，Viewer 还会输出一组诊断数据：渲染项数量、Opaque/Masked/Transparent 分类统计、每个 Pass 的 Draw Call、GPU 毫秒数、CPU 分阶段耗时、Morph 上传数量与渲染目标重建次数。这些数据没有参与颜色计算，却直接决定项目能否被有效维护；因为渲染系统出现问题时，“知道某张图是错的”远不如“知道它在第几个 Pass、哪一种输入资源、哪一项状态后变错”有价值。

### 调试视图与性能观察
对于实时渲染，最终画面很重要，但中间量更能说明问题。Viewer 既提供 MToon 分量调试，也提供描边附件调试：可以查看几何法线、线性深度、Shell Mask、Screen Edge、深度边缘、法线边缘、策略索引和分组。比如某段衣物多出黑线时，可先看它是否被分到意外 Group，再看法线边缘是否过于敏感，而不是盲目降低整张画面的描边阈值。

性能层面，FramePipeline 为每个 Pass 配置 GPU Timer Query，并保留单 Pass 与总 GPU 时间；Viewer 还记录帧间隔、动画采样、骨骼更新、Morph 更新、RenderExtractor、Pipeline 与 UI 的 CPU 时间，以及 Draw Call 数和资源重建次数。性能数据按阶段拆分后，才能判断问题来自导入、动画、CPU 提取、某个特定渲染 Pass，还是单纯的 UI 开销。

### Sidecar 配置的工作流价值
导入的 glTF/GLB 材质数据是外部资产的一部分，直接修改它既不方便版本管理，也可能破坏与 DCC 工具之间的往返流程。MToon sidecar 以独立 JSON 文件记录“某个材质名称应覆盖哪些 MToon 参数”、面部所属节点、Face SDF 纹理与头发阴影投射体等信息。

加载场景时，Viewer 先从模型创建基础材质实例，再尝试加载 sidecar 并按材质名称应用覆盖；保存时则从当前实例捕获参数写回 sidecar。这样模型可以保持来源干净，渲染风格配置也能和项目代码一起迭代、审阅和复用。对于同一个角色尝试多套光照或描边风格时，sidecar 比重新导出整份模型更轻量。

## 项目重点回顾
StylizedRenderer 的核心价值不在于堆叠某一个视觉技巧，而在于为角色风格化渲染建立了可追踪的结构：

1. 从 Assimp 导入的 CPU 资产，到运行时 GPU 资源，再到 RenderWorld，职责边界明确；
2. 以 FramePipeline 和 FrameContext 编排阴影、前向绘制、描边、后处理与抗锯齿，资源流清晰可检查；
3. MToon、Face SDF、头发投影阴影和双路径描边共同处理三渲二角色最容易失真的面部、层次和轮廓；
4. 骨骼动画与 GPU Morph Target 不只服务主画面，也贯穿阴影和描边；
5. Viewer 将参数调试、附件可视化和性能计时放到同一环境中，支持持续迭代。

从这个基础继续演进，可以进一步探索多光源或级联阴影、更完善的透明排序、资源热更新、批处理与实例化、更多材质扩展，以及将目前的角色查看器发展为完整的内容制作与验证工具。无论新增何种效果，现有的 Scene 提取、帧级资源传递和独立 Pass 结构都能为其提供明确的接入位置。
