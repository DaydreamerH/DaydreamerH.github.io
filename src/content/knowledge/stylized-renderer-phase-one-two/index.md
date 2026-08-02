---
title: "StylizedRenderer 阶段一与二：从图形抽象到静态模型渲染"
description: "梳理 StylizedRenderer 前两个阶段的系统架构，说明图形资源、资产导入、场景变换、运行时缓存、渲染提取与静态模型绘制之间的职责和调用关系。"
date: "2026-08-02"
category: "图形与高性能计算"
track: "Rendering / Engine Architecture"
level: intermediate
status: ready
published: true
minutes: 45
order: 0
prerequisites: ["C++ 基础", "现代 OpenGL 基础", "线性代数基础"]
tags: ["C++", "OpenGL", "Rendering", "Asset Pipeline", "Scene Graph", "Assimp"]
photos: "banner.png"
source: "StylizedRenderer development notes"
---

StylizedRenderer 的前两个阶段建立了一条完整的静态模型渲染链路。第一阶段封装窗口、OpenGL 上下文和基础 GPU 资源，使程序能够稳定地提交索引绘制；第二阶段在此基础上加入模型导入、CPU 资产管理、场景层级、运行时 GPU 缓存、视锥体裁剪和静态模型渲染。

系统当前的数据流可以概括为：

~~~text
模型文件
  → ModelImporter
  → AssetRegistry 中的 CPU Asset
  → RuntimeResourceCache 中的 GPU Resource
  → RenderExtractor 生成 RenderWorld
  → StaticModelRenderer 提交 DrawIndexed
  → GraphicsDevice 执行 OpenGL 绘制
~~~

这条链路刻意区分了四种数据：文件格式数据、引擎资产、GPU 资源和逐帧渲染数据。各层只依赖相邻层，Assimp 类型不会进入 Renderer，OpenGL 对象也不会进入资产导入器。

## 系统框架

前两个阶段的主要模块及职责如下：

| 模块 | 核心类型 | 职责 |
| --- | --- | --- |
| Core | `Application` | 管理程序生命周期与每帧执行顺序 |
| Platform | `Window` | 封装 GLFW 窗口、输入与 framebuffer 尺寸 |
| Graphics | `OpenGLContext`、`GraphicsDevice` | 初始化 OpenGL，创建资源并提交绘制 |
| Asset | `AssetRegistry`、各类 `Asset` | 保存与图形 API 无关的 CPU 资产 |
| Importer | `ModelImporter` | 将 glTF/GLB 转换为引擎资产 |
| Scene | `Transform`、`Scene`、`Camera` | 管理空间变换、实体层级和观察参数 |
| Render | `RuntimeResourceCache`、`RenderExtractor` | 上传 GPU 资源并生成逐帧绘制列表 |
| Renderer | `StaticModelRenderer` | 读取绘制列表、设置材质参数并提交命令 |
| Viewer | `ViewerApplication`、`OrbitCameraController` | 组装各模块，提供交互与调试界面 |

其中有两组名称容易混淆：

- `SceneAsset` 保存模型文件导入得到的节点层级，属于持久 CPU 数据。
- `Scene` 管理程序运行期间创建的实体和变换，属于运行时场景容器。
- `MeshAsset` 保存可重新上传的顶点与索引。
- `RuntimeMesh` 保存由这些数据创建的 Buffer 和 VertexArray。
- `RenderWorld` 既不拥有场景，也不拥有 GPU 资源；它只是当前帧的可绘制视图。

## Application：确定生命周期边界

程序入口实例化 `ViewerApplication`，随后调用基类 `core::Application::run()`。`Application` 在构造阶段创建 `Window`、`OpenGLContext` 和 `GraphicsDevice`，并通过四个虚函数把具体业务交给 Viewer：

~~~cpp
class ViewerApplication final : public stylized::core::Application
{
protected:
    bool onInit() override;
    void onUpdate(float deltaTime) override;
    void onRender() override;
    void onShutdown() override;
};
~~~

主循环具有固定顺序：

~~~text
pollEvents
  → 查询 framebuffer 尺寸
  → 设置 viewport
  → onUpdate(deltaTime)
  → onRender()
  → swapBuffers
~~~

窗口最小化时 framebuffer 尺寸可能为零。主循环会进入 `waitEvents()`，恢复后重新计算帧间隔，避免无效绘制和异常大的 `deltaTime`。

`onShutdown()` 在窗口和 OpenGL context 销毁之前执行。Viewer 在这里依次释放面板、Renderer、Extractor 和 RuntimeResourceCache，确保 Buffer、Texture 与 VertexArray 的析构发生在有效 context 内。

### Window 与 OpenGLContext

`platform::Window` 封装 GLFW 句柄，并向上层暴露引擎自己的输入枚举和查询接口：

~~~cpp
window.isMouseButtonPressed(MouseButton::Left);
window.getCursorPosition(cursorX, cursorY);
window.consumeScrollDelta();
window.getFramebufferSize(width, height);
~~~

`graphics::OpenGLContext` 负责创建 OpenGL 4.5 context、加载 GLAD、配置垂直同步并输出驱动信息。初始化阶段还启用深度测试和调试输出，因此后续 Graphics 对象只处理资源与绘制，不重复管理 context 状态。

## Graphics 层：封装一次索引绘制

Graphics 层提供 `Buffer`、`VertexArray`、`ShaderProgram` 和 `Texture2D`，由 `GraphicsDevice` 统一创建。资源对象采用 RAII：对象持有 OpenGL ID，禁止拷贝，允许移动，并在析构时释放对应资源。

`core::NonCopyable` 为这些类型提供统一语义：

~~~cpp
class NonCopyable
{
protected:
    NonCopyable() = default;
    ~NonCopyable() = default;
    NonCopyable(const NonCopyable&) = delete;
    NonCopyable& operator=(const NonCopyable&) = delete;
    NonCopyable(NonCopyable&&) = default;
    NonCopyable& operator=(NonCopyable&&) = default;
};
~~~

### 描述结构与 GraphicsDevice

调用方通过描述结构表达资源需求：

- `BufferDesc`：容量、使用方式和调试名称；
- `VertexArrayDesc`：顶点流、索引缓冲和属性布局；
- `ShaderProgramDesc`：顶点、片元着色器路径；
- `Texture2DDesc`：尺寸、格式、过滤与寻址方式；
- `DrawIndexedCommand`：Shader、VAO、拓扑、索引类型和索引范围。

创建入口集中在 `GraphicsDevice`：

~~~cpp
auto vertexBuffer = device.createBuffer(vertexDesc, vertexBytes);
auto indexBuffer = device.createBuffer(indexDesc, indexBytes);
auto vertexArray = device.createVertexArray(vertexArrayDesc);
auto shader = device.createShaderProgram(shaderDesc);
auto texture = device.createTexture2D(textureDesc, pixels);
~~~

这种接口让 Render 层描述“需要什么资源和绘制”，OpenGL 后端负责把描述转换为 DSA 调用。后续增加其他图形后端时，上层的数据组织不必围绕 `GLuint` 和 `GLenum` 设计。

### Buffer：GPU 字节存储

`graphics::Buffer` 管理连续 GPU 存储，可在创建时上传初始数据，也可按字节范围更新：

~~~cpp
BufferDesc desc;
desc.size = vertices.size() * sizeof(StaticMeshVertex);
desc.usage = BufferUsage::Static;

Buffer vertexBuffer = device.createBuffer(
    desc,
    std::as_bytes(std::span(vertices)));
~~~

模板更新接口把元素索引换算为字节偏移：

~~~cpp
vertexBuffer.update<StaticMeshVertex>(firstVertex, newVertices);
~~~

元素类型必须是 trivially copyable。Buffer 上传的是稳定的二进制布局，含有指针、虚函数或自定义所有权的对象不能直接作为 GPU 数据。

### VertexArray：定义顶点解释规则

`graphics::VertexArray` 保存顶点流与 shader attribute 的对应关系。当前静态网格顶点为：

~~~cpp
struct StaticMeshVertex
{
    glm::vec3 position;
    glm::vec3 normal;
    glm::vec4 tangent;
    glm::vec2 texCoord0;
};
~~~

`vertexBinding` 描述一条数据流使用的 Buffer、起始偏移和 stride；`VertexAttributeDesc` 则定义某个 shader location 从哪条数据流、哪个成员偏移处取值：

~~~cpp
attributes[0] = {
    .location = 0,
    .binding = 0,
    .format = VertexAttributeFormat::Float3,
    .offset = offsetof(StaticMeshVertex, position)
};

attributes[3] = {
    .location = 3,
    .binding = 0,
    .format = VertexAttributeFormat::Float2,
    .offset = offsetof(StaticMeshVertex, texCoord0)
};
~~~

`offsetof` 给出成员相对结构体起点的字节偏移，`sizeof(StaticMeshVertex)` 作为相邻顶点之间的 stride。索引 Buffer 单独绑定为 VAO 的 element buffer，供 `glDrawElements` 决定顶点复用和三角形连接关系。

### ShaderProgram：编译、链接与参数设置

`graphics::ShaderProgram` 从文件编译顶点和片元 shader，完成链接并缓存 uniform location。Renderer 使用类型化接口设置矩阵和材质参数：

~~~cpp
shader.setMat4("uViewProjection", viewProjection);
shader.setMat4("uModel", model);
shader.setMat3("uNormalMatrix", normalMatrix);
shader.setVec4("uBaseColorFactor", baseColorFactor);
shader.setInt("uBaseColorTexture", 0);
~~~

ShaderProgram 保存源文件路径，并提供 `reload()`，可在开发阶段重新编译着色器。第一阶段的 foundation shader 验证顶点、UV、纹理和索引绘制；第二阶段的 static model shader 加入模型矩阵、法线矩阵与 Base Color。

### Texture2D：格式与颜色空间

`graphics::Texture2D` 创建存储、设置 wrap/filter，并上传二维像素。上传期间将 `GL_UNPACK_ALIGNMENT` 临时设为 1，可正确处理行字节数不是 4 的倍数的图像。

纹理格式同时表达颜色空间。Base Color 是颜色数据，上传为 sRGB 内部格式，让硬件在采样时转换到线性空间；法线、粗糙度和遮罩等数据纹理应使用线性格式。`Texture2D` 只拥有 GPU 图像，来源路径和资产语义由 `TextureAsset` 保存。

### DrawIndexedCommand：提交绘制

Renderer 通过命令结构提交一次索引绘制：

~~~cpp
DrawIndexedCommand command;
command.shader = &shader;
command.vertexArray = &vertexArray;
command.topology = PrimitiveTopology::Triangles;
command.indexType = IndexType::UnsignedInt;
command.indexCount = indexCount;
command.firstIndex = 0;

device.drawIndexed(command);
~~~

`GraphicsDevice::drawIndexed()` 绑定命令中的 Shader 和 VertexArray，计算首索引的字节偏移，最终调用 OpenGL。Renderer 不接触资源内部的 OpenGL ID。

## Asset 层：保存可复用的 CPU 数据

模型导入发生在 CPU 端。资产类型不包含 OpenGL 对象，因此可以在没有图形 context 的工具程序中读取、验证和加工模型。

### AssetHandle 与 AssetRegistry

`AssetHandle<T>` 是带静态类型的轻量引用：

~~~cpp
AssetHandle<MeshAsset> mesh;
AssetHandle<MaterialAsset> material;
AssetHandle<TextureAsset> texture;
~~~

Handle 内部保存 64 位 `AssetId`，空 ID 表示无资源。`AssetRegistry` 使用单调递增的 ID 注册资产，并以类型擦除容器持有对象：

~~~cpp
auto sceneHandle = registry.emplace<SceneAsset>(std::move(sceneAsset));
const SceneAsset* scene = registry.get(sceneHandle);
registry.remove(sceneHandle);
~~~

`get<T>()` 同时检查 ID 是否存在以及实际资产类型是否为 `T`。Handle 不拥有对象；资源被移除后，对应查询返回 `nullptr`。当前 ID 不回收，因此不存在旧 Handle 指向后续新资产的问题。

### MeshAsset 与 MeshPrimitiveAsset

一个 `MeshAsset` 可以包含多个 `MeshPrimitiveAsset`：

~~~text
MeshAsset
├── name
├── localBounds
└── primitives[]
    ├── vertices[]
    ├── indices[]
    ├── material
    └── localBounds
~~~

Primitive 是材质和 Draw Call 的基本边界。每个 Primitive 保存自己的顶点、索引、材质 Handle 和局部 AABB；Mesh 的 Bounds 是所有 Primitive Bounds 的并集。导入器将索引统一为 `uint32_t`，并生成缺失的平滑法线和切线数据。

### MaterialAsset 与 TextureAsset

`MaterialAsset` 保存当前静态材质所需的数据：

~~~cpp
struct MaterialAsset
{
    std::string name;
    glm::vec4 baseColorFactor{1.0f};
    AssetHandle<TextureAsset> baseColorTexture;
    AlphaMode alphaMode = AlphaMode::Opaque;
    float alphaCutoff = 0.5f;
    bool doubleSided = false;
};
~~~

导入阶段会保留 glTF 的 Alpha Mode、Alpha Cutoff 与双面标志。当前 `StaticModelRenderer` 已使用 Base Color Factor 和 Base Color Texture；透明模式和双面状态尚未接入绘制状态切换，因此现阶段应优先使用不透明静态模型。

`TextureAsset` 保存宽高、像素格式、颜色空间、解码后的字节、来源路径和调试名称。它是图片的 CPU 表示；对应的 GPU `Texture2D` 在首次渲染需要时创建。

### SceneAsset：导入文件的节点层级

`SceneAsset` 保存模型文件中的节点数组：

~~~cpp
struct SceneNodeAsset
{
    std::string name;
    Transform localTransform;
    AssetHandle<MeshAsset> mesh;
    std::uint32_t parentIndex = invalidNodeIndex;
};
~~~

`parentIndex` 指向同一数组中的父节点，根节点使用 `invalidNodeIndex`。节点可以只承担层级变换而不引用 Mesh。`SceneAsset::isValid()` 检查父索引范围、自引用和祖先环，阻止非法层级进入渲染提取。

## ModelImporter：从 glTF/GLB 到资产关系

`ModelImporter` 的调用入口为：

~~~cpp
ModelImporter importer{registry};
AssetHandle<SceneAsset> scene = importer.import(modelPath);
~~~

导入过程使用 Assimp 完成三角化、相同顶点合并、平滑法线生成、切线空间计算、缓存局部性优化、图元分类和数据结构验证。Assimp 的 `aiScene`、`aiNode`、`aiMesh` 与 `aiMaterial` 只存在于导入实现内部。

整个过程分为 staging 和注册两个阶段：

1. 读取材质，解析 Base Color、透明模式、双面标志和纹理引用；
2. 解码外部图片或 GLB 内嵌图片，并按来源缓存重复纹理；
3. 遍历节点，保存局部 TRS 与父节点索引；
4. 将节点引用的 Assimp Mesh 转换为 Mesh 和 Primitive；
5. 验证 staging 数据；
6. 按 Texture、Material、Mesh、Scene 的顺序注册资产并回填 Handle。

注册顺序对应资源依赖：Material 依赖 Texture，Primitive 依赖 Material，SceneNode 依赖 Mesh。若任何一步失败，Importer 会按相反顺序移除本次已经注册的资源，使 Registry 不会保留引用不完整的资产集合。

### 图片解码与 UV 方向

外部图片和压缩内嵌图片由 stb_image 解码为 RGBA8。未压缩的 Assimp `aiTexel` 也会转换为相同通道顺序。导入器按来源建立缓存键，同一张图片被多个材质使用时只生成一个 `TextureAsset`。

stb_image 的像素行从上向下排列，而当前引擎保留 Assimp 提供的 UV。图片在解码后执行一次垂直翻转，使纹理坐标与 OpenGL 采样方向一致。这个约定集中在导入边界，Shader 和 RuntimeResourceCache 无需再次修改 UV。

## Scene 与 Camera：建立空间关系

### Transform

`scene::Transform` 保存平移、四元数旋转和缩放，并生成局部矩阵：

~~~cpp
Transform transform;
transform.setTranslation({0.0f, 1.0f, 0.0f});
transform.setRotation(glm::quat(...));
transform.setScale({1.0f, 1.0f, 1.0f});

glm::mat4 local = transform.localMatrix();
~~~

节点的世界矩阵按父子关系计算：

~~~text
world(child) = world(parent) * local(child)
~~~

四元数避免直接累积欧拉角产生的万向节问题，也便于后续动画系统进行旋转插值。

### Scene 与 EntityId

`scene::Scene` 是运行时 Entity/Transform 容器。`createEntity()` 返回带 index 和 generation 的 `EntityId`，slot 保存局部 Transform、父子关系、缓存的世界矩阵与 dirty 标志。

修改父节点 Transform 后，Scene 将其子树标记为 dirty。下一次查询世界矩阵时递归解析父节点并更新缓存；未修改的层级直接返回已有矩阵。实体销毁后 generation 增加，使旧 `EntityId` 无法访问复用后的 slot。

当前模型 Viewer 直接从 `SceneAsset` 提取导入节点，`Scene` 则为运行时创建、重设父级和编辑实体提供基础设施。二者共享 `Transform` 约定，但生命周期和用途不同。

### Camera 与 OrbitCameraController

`scene::Camera` 保存位置、观察目标和投影参数：

~~~cpp
camera.setPerspective(verticalFov, aspect, nearPlane, farPlane);
camera.lookAt(position, target, up);

glm::mat4 view = camera.viewMatrix();
glm::mat4 projection = camera.projectionMatrix();
glm::mat4 viewProjection = camera.viewProjectionMatrix();
~~~

`OrbitCameraController` 位于 Viewer 层，将窗口输入转换为 Camera 状态：

- 左键拖动改变 yaw 与 pitch；
- 中键拖动沿相机 right/up 平移观察目标；
- 滚轮改变轨道半径；
- `focus(Bounds)` 根据包围球半径和垂直 FOV 计算可容纳模型的观察距离；
- framebuffer 尺寸变化时更新 aspect ratio。

Camera 保持纯数学职责，具体输入映射由 Controller 决定，因此后续可以替换为自由相机、第一人称相机或编辑器相机。

## RuntimeResourceCache：连接 CPU Asset 与 GPU Resource

`RuntimeResourceCache` 持有 `GraphicsDevice` 引用，并按 AssetId 缓存上传结果：

~~~cpp
const RuntimeMesh* mesh = cache.getOrCreateMesh(meshHandle, registry);
const Texture2D& texture = cache.getOrCreateTexture(textureHandle, registry);
~~~

第一次请求 Mesh 时，`RuntimeMesh::create()` 为每个 Primitive 创建顶点 Buffer、索引 Buffer 和 VertexArray，并保留索引数量、索引类型、材质 Handle 与局部 Bounds。后续请求同一 Handle 时直接返回缓存对象。

Texture 的上传流程读取 `TextureAsset` 的格式与颜色空间，选择对应的 Graphics 格式并创建 `Texture2D`。空纹理 Handle 返回 1×1 白色纹理，使只有 Base Color Factor 的材质仍能使用同一 Shader；无效资产或上传失败返回黑紫棋盘错误纹理，便于定位资源问题。

缓存采用延迟创建：模型导入完成时只有 CPU Asset，第一次执行 RenderExtractor 时才上传实际使用的 Mesh，Renderer 首次需要材质纹理时再上传 Texture。`clear()` 会释放缓存中的 GPU 对象及 fallback 纹理。

## RenderExtractor：从场景生成一帧绘制数据

`RenderWorld` 是 Renderer 的逐帧输入：

~~~text
RenderWorld
├── mainView
│   ├── view / projection / viewProjection
│   ├── cameraPosition
│   └── frustum
├── items[]
│   ├── RuntimeMeshPrimitive*
│   ├── Material Handle
│   ├── world / normalMatrix
│   ├── worldBounds
│   └── objectId
└── renderStats
~~~

`RenderExtractor::extract()` 执行以下步骤：

1. 清空上一帧 Items 和统计数据；
2. 从 Camera 填充 `RenderView` 并构造 Frustum；
3. 根据 `parentIndex` 解析所有 SceneAsset 节点的世界矩阵；
4. 通过 RuntimeResourceCache 获取节点 Mesh 的 GPU 表示；
5. 为每个 Primitive 计算世界 Bounds 和法线矩阵；
6. 执行视锥体测试，通过后写入 `RenderItem`。

世界矩阵解析使用三态标记：未访问、正在访问、已完成。递归期间再次遇到“正在访问”的节点说明层级存在环，提取立即失败。这个检查与 `SceneAsset::isValid()` 共同保护父子变换计算。

### Bounds 与 Frustum

`math::Bounds` 保存 AABB 的 minimum 和 maximum。局部 Bounds 在导入 Mesh 时根据顶点位置生成；转换到世界空间时，将 AABB 八个角点乘以世界矩阵，再重新计算 min/max。该方法能够正确覆盖旋转和非均匀缩放后的网格。

`math::Frustum` 从 View-Projection 矩阵提取六个平面。AABB 测试使用每个平面法线方向上的正顶点：若该顶点仍位于平面外侧，整个包围盒都在视锥体外，可以在 Draw Call 之前剔除。

~~~cpp
item.worldBounds = primitive.localBounds().transformed(worldMatrix);

if (!renderWorld.mainView.frustum.intersects(item.worldBounds))
{
    ++renderWorld.renderStats.culledItems;
    continue;
}
~~~

OpenGL 后续仍会执行图元裁剪，但 CPU 视锥体裁剪可以跳过完全不可见的 Primitive，减少状态设置和 Draw Call。

## StaticModelRenderer：消费 RenderWorld

`StaticModelRenderer` 在初始化时创建静态模型 Shader，并将 Base Color 采样器固定到纹理单元 0。每帧先设置 View-Projection，再遍历可见 `RenderItem`：

~~~cpp
shader.setMat4("uViewProjection", renderWorld.mainView.viewProjection);

for (const RenderItem& item : renderWorld.items)
{
    const MaterialAsset* material = registry.get(item.material);
    const Texture2D& texture = cache.getOrCreateTexture(
        material ? material->baseColorTexture
                 : AssetHandle<TextureAsset>{},
        registry);

    shader.setMat4("uModel", item.world);
    shader.setMat3("uNormalMatrix", item.normalMatrix);
    shader.setVec4("uBaseColorFactor",
                   material ? material->baseColorFactor
                            : glm::vec4{1.0f});

    texture.bind(0);

    DrawIndexedCommand command;
    command.shader = &shader;
    command.vertexArray = &item.primitive->vertexArray();
    command.topology = PrimitiveTopology::Triangles;
    command.indexType = item.primitive->indexType();
    command.indexCount = item.primitive->indexCount();
    command.firstIndex = 0;
    device.drawIndexed(command);
}
~~~

实际实现由 Runtime Primitive 的 VertexArray、IndexType 和 IndexCount 组装 `DrawIndexedCommand`。Renderer 无需遍历 Assimp 节点、计算父子变换、创建 Buffer 或执行裁剪，这些工作都已在前置模块完成。

当前 Renderer 是不透明 Base Color 路径。它尚未根据 `AlphaMode` 配置 alpha test/blending，也未根据 `doubleSided` 切换面剔除；这些字段已经保存在资产中，可在后续材质与 Render Pass 系统中接入。

## Viewer 中的完整调用过程

Viewer 将上述模块组装为初始化、更新、渲染和关闭四个阶段：

~~~mermaid
flowchart TD
    A[ViewerApplication::onInit] --> B[创建 RuntimeResourceCache]
    B --> C[创建 RenderExtractor]
    C --> D[初始化 StaticModelRenderer]
    D --> E[ModelImporter::import]
    E --> F[AssetRegistry 保存 CPU Asset]

    G[onUpdate] --> H[Window 输入]
    H --> I[OrbitCameraController]
    I --> J[Camera]

    K[onRender] --> L[RenderExtractor::extract]
    J --> L
    F --> L
    L --> M[RuntimeResourceCache 按需上传 Mesh]
    M --> N[Bounds 与 Frustum Culling]
    N --> O[RenderWorld]
    O --> P[StaticModelRenderer]
    P --> Q[按需上传 Texture]
    Q --> R[GraphicsDevice::drawIndexed]
    R --> S[ViewerPanels 显示统计]
~~~

### 初始化

`createRuntimeResources()` 依次创建并初始化 RuntimeResourceCache、RenderExtractor 和 StaticModelRenderer。`loadScene()` 构造 ModelImporter，将命令行传入的模型路径转换为 SceneAsset Handle，并验证返回资产。

### 更新

`onUpdate()` 读取鼠标和滚轮输入，更新轨道相机；按下 Escape 时调用 `requestExit()`。Camera 的 View 与 Projection 在提取 RenderWorld 时读取。

### 渲染

`onRender()` 清理颜色和深度缓冲，从 SceneAsset 提取 RenderWorld，并在首次获得有效 Bounds 后调用 `focus()`。StaticModelRenderer 绘制可见 Items，ViewerPanels 随后显示资产数量、节点数量、可见项、剔除项、Draw Call 和相机信息。

### 关闭

`onShutdown()` 先关闭 ImGui 面板，再释放 Renderer、Extractor 和 RuntimeResourceCache。基类退出后才销毁 GraphicsDevice、OpenGLContext 和 Window。

## 加载与调试模型

Viewer 接受 glTF 或 GLB 文件路径：

~~~text
stylized_viewer <model.gltf|model.glb>
~~~

加载后无需手动创建 Mesh 或材质，完整路径为：

~~~text
路径
  → Assimp 解析
  → TextureAsset / MaterialAsset / MeshAsset / SceneAsset
  → RuntimeMesh / Texture2D
  → RenderItem
  → DrawIndexed
~~~

调试时可以利用 ViewerPanels 的统计信息定位层级：

- `Nodes = 0`：导入器没有形成有效节点数组；
- Registry 中存在资产但 `Total Items = 0`：节点可能没有 Mesh，或 RuntimeMesh 创建失败；
- `Total Items > 0` 且 `Visible Items = 0`：所有 Primitive 被视锥体剔除，应检查模型 Bounds、相机位置和矩阵约定；
- `Visible Items > 0` 且 `Draw Calls = 0`：检查 Renderer 初始化、Primitive 有效性和纹理资源；
- Draw Call 正常但纹理方向错误：检查 UV 与图片垂直翻转约定；
- 顶点位置或属性异常：检查 VertexArray 的 stride、format、binding 与 `offsetof`；
- 黑紫棋盘纹理：TextureAsset 无效或 GPU 上传失败；
- 透明或双面材质显示异常：当前 Renderer 尚未应用相应绘制状态。

程序还提供 `--smoke-test`：创建隐藏窗口和渲染环境，运行三帧后自动退出，用于验证窗口、context、GraphicsDevice 和生命周期是否能够正常建立与销毁。

## 阶段成果与边界

第一阶段完成了稳定的 OpenGL 资源生命周期和索引绘制接口；第二阶段完成了静态模型从文件到屏幕的完整数据链。当前系统已经具备后续渲染功能所需的关键边界：

- Graphics 层负责 API 资源和命令；
- Asset 层负责可持久、可验证的 CPU 数据；
- RuntimeResourceCache 负责资产到 GPU 的延迟转换；
- RenderExtractor 负责从场景生成逐帧可见列表；
- Renderer 只消费 RenderWorld 并提交绘制。

当前实现仍是单一的前向不透明 Base Color 路径，尚未形成显式 Render Pass、Framebuffer 与 HDR 后处理流程，也未接入完整 PBR、透明排序、阴影、骨骼动画和风格化材质。已有的 `GraphicsDevice`、`RuntimeResourceCache` 与 `RenderWorld` 为这些功能提供了稳定入口，无需让新增 Pass 重新理解模型文件或场景导入细节。

最终，一帧静态模型渲染可以归纳为：

~~~text
Window 输入
  → OrbitCameraController 更新 Camera
  → RenderExtractor 解析节点与可见性
  → RuntimeResourceCache 提供 GPU Primitive
  → RenderWorld 保存当前帧绘制项
  → StaticModelRenderer 设置矩阵与 Base Color
  → GraphicsDevice 提交索引绘制
~~~

这条管线构成了渲染器前两个阶段的核心框架：资产数据、运行时资源和逐帧绘制职责彼此独立，又通过 Handle、Cache 和 RenderWorld 连成完整链路。
