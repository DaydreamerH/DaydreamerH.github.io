---
title: "Morph Target：从资产导入到 GPU Compute 与 Skinning"
description: "梳理 Morph Target 的数学基础、资产数据、动画权重、GPU 数据布局，以及与骨骼蒙皮和渲染管线的衔接。"
date: "2026-09-12"
category: "Graphics / Rendering"
track: "Computer Graphics"
level: advanced
status: ready
published: true
minutes: 25
order: 0
prerequisites:
  - "OpenGL Buffer"
  - "Compute Shader"
  - "基础骨骼蒙皮"
tags:
  - "Morph Target"
  - "BlendShape"
  - "OpenGL"
  - "Compute Shader"
  - "GPU Skinning"
photos: "banner.png"
---

## Morph Target 概念
Morph Target 又称 BlendShape，是一种基于顶点的形变技术。

他以一个基础网格为起点，为特定表情或局部形变保存一组顶点偏移量：最终顶点 = 基础顶点 + Delta * 权重。

例如一个角色可以拥有多个表情，以 “张嘴” 为例，它并不记录新的模型，而是记录每个顶点都需要移动多少；权重为 0 时不产生形变，权重为 1 时完全应用该目标，权重为 0.5 时应用一半形变。

BlendShape 通常指多个形变目标的组合系统，Morph Target 则更强调单个目标本身。实际项目中两者经常混用。

## Morph Target 数学原理
### 顶点位置 Delta
Morph Target 通常保存相对于基础网格的顶点偏移：
$$
ΔP_i = Pi_{target} - P_0
$$

应用多个 Morph Target 时，最终位置为：
$$
P = P_0 + Σ(w_i × ΔP_i)
$$

### 法线与切线 Delta
如果只修改顶点位置而不更新法线，模型的光照结果可能错误。因此 Morph Target 也可以保存法线和切线偏移：
$$
N' = N_0 + Σ(w_i × ΔN_i) \\
T' = T_0 + Σ(w_i × ΔT_i)
$$
叠加后需要重新归一化。

此外，如果叠加后的长度接近于 0，会退回到基础的法线或切线，避免归一化产生无效值。

### 多个 Morph Target 混合
Morph Target 的混合通常是线性叠加：

$$
P = P_0 \\
  + w_1 × ΔP_1 \\
  + w_2 × ΔP_2 \\
  + w_3 × ΔP_3
$$

这种方式简单高效，但是可以会导致不同目标之间的冲突，例如张嘴和闭嘴同时存在等问题：需要单独增加修正的 Delta ，并根据多个基础权重计算修正权重，目前还没有实现。

### 权重范围与限制
常见权重范围：$0 ≤ w_i ≤ 1$。

项目在处理权重时会限制其范围。

#### 与骨骼变换的组合
Morph Target 通常在模型局部空间中计算，骨骼动画则使用关节矩阵变换顶点。两者组合需要明确：
1. Delta 所处的坐标空间
2. Morph 与 Skinning 的执行顺序
3. 法线使用的变换矩阵
4. 包围盒是否覆盖形变后的范围

一般顺序是：
1. 基础顶点
2. Morph 形变
3. 骨骼蒙皮
4. 世界空间变换

## Morph Target 资产制作与导入
### DCC 软件
本项目使用的素材在 Blender 中利用 MMD 相关插件制作。

### 基础网格与目标网格的要求
Morph Target 依赖顶点一一对应，因此基础网格和目标网格必须满足：
- 顶点数量一致；
- 顶点顺序一致；
- 三角形索引一致；
- UV 通常保持一致
- 不能在目标网格中随意增加或删除顶点。

### Morph Target 的数据组成
一个 Morph Target 通常包含：
- position Delta
- normal Delta
- tangent Delta

`MorphTargetAsset` 如下：
```cpp
struct MorphTargetAsset
{
    std::string name;

    std::vector<glm::vec3> positionDeltas;
    std::vector<glm::vec3> normalDeltas;
    std::vector<glm::vec3> tangentDeltas;
};
```

其中，position Deltas 必须存在，其余的 Deltas 可以为空。

### Morph 数据导入流程
1. 模型文件
2. Assimp 导入器
3. Morph Target Asset
4. Mesh Primitive Asset
5. Mesh Asset
6. RuntimeMeshInstance
7. GPU Buffer

完成以下目标：
- 读取名称；
- 读取偏移；
- 绑定到对应的 Mesh Primitive；
- 检查数据长度和有效性；
- 交给运行时资源系统创建 GPU 资源。

### 数据合法性校验
需要检查
- 名称：Morph Target 必须有有效名称，方便动画曲线或控制器查找。
- 顶点数量：position Delta 数量必须等于基础网格顶点数。
- 浮点值：所有偏移都必须是有限值。
- 网格有效性：
  - 基础顶点是否存在
  - 索引是否越界
  - 三角形索引数量是否正确
  - Morph Target 数量是否合理
  - 包围盒是否有效

以上检查均在 CPU 侧提前检查。

### 资产导入时的坐标空间
Morph Delta 必须和基础顶点处在同一个坐标空间，在本项目中使用基础网格的局部空间。

## 动画系统中的 Morph 权重
### Morph 权重
Morph Target 本身只保存顶点应该怎么移动，不会主动产生动画。

动画系统需要为每个 Morph Target 提供一个权重：
```
张嘴 = 0.0
张嘴 = 0.5
张嘴 = 1.0
```

权重决定该目标当前参与形变的程度。

因此，Morph 动画的核心不是不停的修改模型，而是不断更新一组权重。

### Morph Animation Channel
动画文件通常为 Morph Target 保存一条动画通道：
```
通道名称：MouthOpen
关键帧时间：0.0、0.5、1.0
关键帧权重：0.0、1.0、0.0
```

运行时根据当前动画时间，找到相邻关键帧并计算权重。

### 关键帧插值
使用的是线性插值: `w = lerp(w0, w1, alpha)`.

### Animation Player
AnimationPlayer 通常负责：
1. 推进动画时间
2. 找到当前动画片段
3. 采样 Morph 动画通道
4. 插值计算与权重
5. 将权重写入运行时姿态对象

它不直接修改 GPU Buffer，也不负责具体的 Compute Shader 调用。

相关职责划分如下：
- AnimationPlayer：计算当前权重
- SceneMorphPose：保存当前场景级权重
- MorphState：保存 Primitive 级权重
- RuntimeMeshInstance：上传 GPU 并触发 Compute

### SceneMorphPose
`SceneMorphPose` 用于保存整个场景中各个节点的 Morph 权重。

可以理解为：
```
Node 0 → 一组 Morph 权重
Node 1 → 一组 Morph 权重
Node 2 → 一组 Morph 权重
```

它主要负责：
- 与当前 SceneAsset 绑定
- 按节点保存权重数组
- 提供 `setWeights()`
- 提供 `weights()`
- 通过版本号表示姿态是否变化

当动画播放器采样出新权重时，会更新 SceneMorphPose，后续渲染系统再把它同步到对应的 Mesh Primitive.

### MorphState
`MorphState` 是单个 Primitive 的 Morph 状态。

它主要保存：
1. 当前权重数组
2. Morph Target 数量
3. 活动目标数量
4. 版本号

此外他还需要：
1. 设置指定目标权重
2. 将权重限制在合法范围
3. 统计当前非零目标数量
4. 检测权重是否真正变化
5. 变化递增版本号

#### 版本号
如果每帧都无条件更新 Morph，会产生很多重复工作：
- 更新 Weight Buffer
- 执行 Compute Shader
- 插入内存屏障

但角色可能连续多帧保持相同表情，所以，我们使用版本号来确认数据是否更新，避免重复的运算。

### 完整的权重更新流程
1. 动画播放
2. 采样 Morph Animation Channel
3. 计算当前权重
4. 写入 SceneMorphPose
5. 同步到 MorphState
6. 比较版本号
7. 更新 Morph Weight Buffer
8. Dispatch Compute Shader

权重没有变化时，则跳过 Weight Buffer 更新与后续计算，复用上一帧的结果。

## Morph 数据的 CPU 表示
### MorphTargetAsset
项目在资产使用 `MorphTargetAsset` 表示一个 Morph Target:
```cpp
struct MorphTargetAsset
{
    std::string name;

    std::vector<glm::vec3> positionDeltas;
    std::vector<glm::vec3> normalDeltas;
    std::vector<glm::vec3> tangentDeltas;
};
```

### MeshPrimitiveAsset
每个 Mesh Primitive 保存自己的 Morph Target:
```cpp
struct MeshPrimitiveAsset
{
    std::vector<StaticMeshVertex> vertices;
    std::vector<MorphTargetAsset> morphTargets;
    std::vector<std::uint32_t> indices;
};
```

因此一个Primitive 包含一个基础的顶点数组和多个 MorphTargetAsset，每个 MorphTarget 的 Delta 都与 Primitive 的顶点数组对应。

### CPU 侧原始布局
资产导入后的数据仍然是相对直观的结构：
```
vertices[0...V-1]

morphTargets[0]
    positionDeltas[0...V-1]
    normalDeltas[0...V-1]
    tangentDeltas[0...V-1]

morphTargets[1]
    positionDeltas[0...V-1]
    normalDeltas[0...V-1]
    tangentDeltas[0...V-1]
```

### buildGpuMorphData
`RuntimeMeshInstance` 初始化 Primitive 时，会调用 `buildGpuMorphData()`，把资产层数据转换成 GPU 需要的格式：
- baseVertices
- vertexOffsets
- deltas

同时计算：
- conservativeBounds
- maximumPositionDelta

处理顺序：
1. 遍历顶点
   1. 记录当前delta起点
   2. 遍历所有 MorphTarget
      1. 读取当前顶点的位置、法线、切线 偏移
      2. 判断是否存在变化
      3. 如果有变化，写入 deltas


#### vertexOffsets
`vertexOffsets` 的长度是顶点数量+1；对于顶点 i，它对应的 Delta 范围是 `[vertexOffsets[i], vertexOffsets[i + 1])`.

例如：`vertexOffsets = [0, 2, 2, 5]`，表示：
1. Vertex 0 使用 deltas[0] 和 deltas[1]
2. Vertex 1 没有 Delta
3. Vertex 2 使用 deltas[2]、deltas[3]、deltas[4]

后续 GPU 计算某个顶点，可以直接找到该顶点对应的 Delta 区间。


#### GpuMorphDelta
```cpp
struct GpuMorphDelta
{
    glm::vec4 position;
    glm::vec4 normal;
    glm::vec4 tangent;
    glm::uvec4 metadata;
};
```

其中 `metadata.x` 用来表示这条 Delta 属于哪个 Morph Target，以便 Shader 可以通过该索引读取对应权重。

#### GpuMorphBaseVertex
```cpp
struct GpuMorphBaseVertex
{
    glm::vec4 position;
    glm::vec4 normal;
    glm::vec4 tangent;
};
```

它保存 Morph 计算所需的基础 position、normal 和 tangent。

### 包围盒计算
Morph 带来偏移，所以需要重新计算包围盒，对于每个顶点，代码会累计所有 Morph Target 可能产生的最大/最小偏移值，然后把以下两个位置加入包围盒：
```cpp
vertex.position + minimumDelta
vertex.position + maximumDelta
```

### 数据总结
#### 资产导入后的结构
```
MeshAsset
└── primitives[]
    └── MeshPrimitiveAsset
        ├── vertices[V]
        ├── indices[]
        └── morphTargets[T]
            ├── MorphTarget 0
            │   ├── name
            │   ├── positionDeltas[V]
            │   ├── normalDeltas[V]
            │   └── tangentDeltas[V]
            ├── MorphTarget 1
            └── ...
```
#### 初始化时转换的结构
```
GpuMorphData
├── baseVertices[V]
├── vertexOffsets[V + 1]
├── deltas[D]
├── conservativeBounds
└── maximumPositionDelta
```

其中 `baseVertices` 包含各个顶点的基础位置、法线与切线；`vertexOffsets` 记录每个顶点对应哪个 Delta；`deltas` 只保存非零的目标-顶点组合。

#### 运行时权重结构
当前 Morph 权重保存在：
```
MorphState
├── weights_[T]
├── activeTargetCount_
└── version_
```

### 最终的 CPU/GPU 分工
CPU 保存：
```
基础顶点
稀疏 Delta
顶点 Offset
当前权重
版本号
包围盒
```

GPU 保存：
```
Base Vertex Buffer
Morph Offset Buffer
Morph Delta Buffer
Morph Weight Buffer
Output Vertex Buffer
```

GPU 分工
```
最终顶点 = 基础顶点 + Delta × 权重
```

顶点索引通过 vertexOffsets 找到属于自己的 Delta，Delta 通过 targetIndex 找到对应权重，最后用“基础顶点 + Delta × 权重”得到最终顶点。

## Morph Target 的 GPU 数据布局
CPU 侧完成 Morph 数据整理后，`RuntimeMeshInstance` 会为每个包含 Morph Target 的 Primitive 创建独立的 GPU Buffer.

### GPU Buffer 总览
项目中的 `morph.comp` 使用以下绑定：
| Binding | Buffer | 作用 | 更新频率 |
|---|---|---|---|
| 0 | `BaseVertexBuffer` | 基础顶点 position、normal、tangent | 初始化后基本不变 |
| 1 | `MorphOffsetBuffer` | 每个顶点对应的 Delta 范围 | 初始化后不变 |
| 2 | `MorphDeltaBuffer` | 稀疏 position、normal、tangent Delta | 初始化后不变 |
| 3 | `MorphWeightBuffer` | 当前 Morph 权重 | 权重变化时更新 |
| 4 | `OutputVertexBuffer` | Compute 输出的最终顶点 | Compute 每次重写 |

### BaseVertexBuffer
CPU 侧的基础顶点会转换为：
```cpp
struct GpuMorphBaseVertex
{
    glm::vec4 position;
    glm::vec4 normal;
    glm::vec4 tangent;
};
```

Shader 中对应：
```
struct BaseVertex
{
    vec4 position;
    vec4 normal;
    vec4 tangent;
};
```

每个线程根据自己的 `vertexIndex` 读取：
```
BaseVertex result = baseVertices[vertexIndex];
```

### MorphOffsetBuffer
这个 Buffer 保存：
```
vertexOffsets[0...vertexCount]
```

Shader 中
```
for (uint deltaIndex = vertexOffsets[vertexIndex];
     deltaIndex < vertexOffsets[vertexIndex + 1];
     ++deltaIndex)
{
    ...
}
```

它不保存 Delta 的内容，它只告诉 Shader，当前顶点应该读 `MorphDeltaBuffer` 的哪一段数据。

### MorphDeltaBuffer
项目中的 Delta 结构是：
```cpp
struct GpuMorphDelta
{
    glm::vec4 position;
    glm::vec4 normal;
    glm::vec4 tangent;
    glm::uvec4 metadata;
};
```

glsl 中对应：
```
struct MorphDelta
{
    vec4 position;
    vec4 normal;
    vec4 tangent;
    uvec4 metadata;
};
```

其中：
```
position.xyz：位置偏移
normal.xyz：法线偏移
tangent.xyz：切线偏移
metadata.x：Morph Target 索引
```

Shader 通过：
```
float weight = morphWeights[delta.metadata.x];
```

找到某条 Delta 对因的权重。

### MorphWeightBuffer
Weight Buffer 保存：
```
Morph Target 0 的权重
Morph Target 1 的权重
Morph Target 2 的权重
...
```

每次权重改变，需要使用 `morphWeightBuffer.update(...)` 更新 Weight Buffer.

Base、Offset 和 Delta 通常不需要每帧上传，Weight 是运行时变化最频繁的数据。

### OutputVertexBuffer
Output Buffer 保存 Compute Shader 计算后的结果：
- 最终 position
- 最终 normal
- 最终 tangent

它同时绑定为：`Shader Storage Buffer` 以及后续绘制阶段使用的 `Vertex Buffer`.

### 静态网格和蒙皮网格
静态网格使用 `StaticMeshVertex` 包含：`position` `normal` `tangent` `texCoord`.

蒙皮网格使用 `MorphedSkinnedVertex`，除了 Morph 相关数据，还保留 `texCoord` `joints` `weights`.

Computer Shader 只覆盖位置、法线和偏移，不会破坏 `joints` 和 `weights`，因此并不影响后续进行骨骼蒙皮。

#### Stride 和属性偏移
静态网格和蒙皮网格的顶点结构大小不同，所以在 RuntimeMeshInstance 会把以下参数传入 Shader：
```
uOutputStrideWords
uPositionOffsetWords
uNormalOffsetWords
uTangentOffsetWords
```

Shader 先计算当前顶点在输出 Buffer 中的起点：
```
uint outputBase =
    vertexIndex * uOutputStrideWords;
```

根据不同属性的 offset 写入：
```
storeVec3(outputBase + uPositionOffsetWords, result.position);
storeVec3(outputBase + uNormalOffsetWords, result.normal);
storeVec3(outputBase + uTangentOffsetWords, result.tangent);
```

## Compute Shader 实现 Morph
Morph 的核心是对大量顶点执行相互独立的计算：每个顶点读取自己的基础数据；读取对应的 Delta；乘以权重；得到最终顶点。

### Workgroup 与 Invocation
Shader 声明：
```
layout(local_size_x = 64) in;
```

表示一个 Workgroup 包含 64 个 invocation.

项目采用一个 inovation 处理一个顶点，线程编号通过：
```
uint vertexIndex = gl_GlobalInvocationID.x;
```
获得。

如果顶点数量不是 64 的整数倍，会多启动一些线程，因此需要边界处理：
```
if (vertexIndex >= uVertexCount)
{
    return;
}
```

### Dispatch 数量计算
CPU 侧按照顶点数量计算 Workgroup 数：
```cpp
constexpr std::uint32_t workGroupSize = 64;

dispatchCount =
    (vertexCount + workGroupSize - 1) /
    workGroupSize;
```

### Shader 读取基础顶点
每个线程首先读取自己的基础顶点：
```
BaseVertex result =
    baseVertices[vertexIndex];
```

### 查找当前顶点的 Delta
Shader 通过 `vertexOffsets` 找到当前顶点对应的 Delta 范围：
```
for (uint deltaIndex = vertexOffsets[vertexIndex];
     deltaIndex < vertexOffsets[vertexIndex + 1];
     ++deltaIndex)
{
    ...
}
```

当前顶点不会遍历整个 Delta Buffer，只处理自己的区间。

### 读取权重并累加 Delta
每条 Delta 通过 `metadata.x` 保存自己的 Morph Target 索引：
```
MorphDelta delta =
    morphDeltas[deltaIndex];

float weight =
    morphWeights[delta.metadata.x];
```

然后累加：
```
result.position.xyz +=
    delta.position.xyz * weight;

result.normal.xyz +=
    delta.normal.xyz * weight;

result.tangent.xyz +=
    delta.tangent.xyz * weight;
```

### 法线和切线归一化
位置计算完成后，Shader 会重新归一化法线和切线：
```
result.normal.xyz =
    normalizeOrFallback(
        result.normal.xyz,
        baseVertices[vertexIndex].normal.xyz);
```

如果向量长度国小，则回退到基础法线和切线。

### 写入输出顶点
Shader 会根据顶点索引、顶点 Stride 和属性 offset，计算输出位置：
```
uint outputBase =
    vertexIndex * uOutputStrideWords;
```

然后分别写入 position，normal和 tangent.

## Morph 与 Skinning 的衔接
- Morph：修改顶点的局部形状
- Skinning：让顶点跟随骨骼运动

### 顶点数据格式
一个带 Morph 和 Skinning 的顶点包含：
```
position
normal
tangent
texCoord
joint indices
joint weights
```

其中 Morph Compute 只修改：
```
position
normal
tangent
```

不会修改：
```
texCoord
joint indices
joint weights
```

### 项目的执行顺序
1. 基础顶点
2. Morph Compute Shader
3. 形变后的局部 position/normal/tangent
4. Vertex Shader 读取 joint indices/joint weights
5. Skinning Palette 计算骨骼变换
6. 模型矩阵、视图投影矩阵
7. 最终绘制位置

Morph Delta 和基础顶点都处于模型的局部空间， Compute Shader 先在这个空间完成形变；随后 Vertex Shader 再将形变后的顶点应用骨骼矩阵。

### Skinning Palette
顶点着色器中，骨骼矩阵存储在 `SkinningPaletteBuffer`：
```
readonly buffer SkinningPaletteBuffer
{
    mat4 jointMatrices[];
};
```

在本项目中，每个顶点最多使用四个骨骼索引与其对应的权重：
```
mat4 skinningMatrix =
    inJointWeights.x * jointMatrices[inJointIndices.x] +
    inJointWeights.y * jointMatrices[inJointIndices.y] +
    inJointWeights.z * jointMatrices[inJointIndices.z] +
    inJointWeights.w * jointMatrices[inJointIndices.w];
```

然后将 Morph 后的顶点位置传入骨骼变换：
```
localPosition =
    (skinningMatrix * vec4(inPosition, 1.0)).xyz;
```
`inPosition` 即Compute Shader 输出的结果。


### 法线和切线的处理
Skinning 不是只需要变换位置的，也需要变换方向。

在顶点着色器中，使用骨骼矩阵的 3*3 部分完成对 Morph 输出的法线和切线进行变换：
```
mat3 skinningDirectionMatrix =
    mat3(skinningMatrix);

localNormal =
    skinningDirectionMatrix * localNormal;

localTangent =
    skinningDirectionMatrix * inTangent.xyz;
```

之后，法线还会通过 `uNormalMatrix` 变换到世界空间并归一化。

### RenderExtractor 选择顶点
`RenderExtractor` 会根据 Primitive 是否有 Morph Target 选择顶点数组：
- 没有 Morph Target 选择 RuntimeMesh 的原始 VertexArray.
- 有 Morph Target 使用 RuntimeMeshInstance 的 Morph VertexArray.

如果 Primitive 同时有 Skinning 数据，则 RenderItem 还会持有对应的 SkinningPalette.

因此，同一个 RenderItem 可以同时拥有：
```
Morph 后的 VertexArray
+
当前帧的 Skinning Palette
```

## Compute 结果如何进入渲染管线
Morph Compute Shader 的输出是后续几何 Pass 直接使用的顶点数据。
```
Morph Compute
    ↓
Output Vertex Buffer
    ↓
Memory Barrier
    ↓
VertexArray
    ↓
Forward / Shadow / OutlineMask 等几何 Pass
```

### Output Vertex Buffer
`RuntimeMeshInstance` 中的 `vertexBuffer` 同时承担两种角色：
- Compute 阶段：作为 SSBO，被 Shader 写入
- 绘制阶段：作为 Vertex Buffer，被 Vertex Shader 读取

Compute 完成后不需要重新创建 VertexArray，只需要让它读取更新后的同一份 Buffer。

### Memory Barrior
Compute Shader 通过 SSBO 写入 Output Vertex Buffer，后续绘制则通过顶点属性读取同一份 Buffer。

这两种访问路径可能使用不同缓存，因此 Dispatch 后需要显式声明：Compute 的写入必须对后续 Shader Storage 和 Vertex Attribute 读取可见。

本项目封装为 `makeComputeWritesVisibleToVertexInput();` 其内部调用
```cpp
glMemoryBarrier(
    GL_SHADER_STORAGE_BARRIER_BIT |
    GL_VERTEX_ATTRIB_ARRAY_BARRIER_BIT);
```
- `GL_SHADER_STORAGE_BARRIER_BIT` 保证 Compute 写入对后续 SSBO 访问可见。
- `GL_VERTEX_ATTRIB_ARRAY_BARRIER_BIT` 保证 Compute 写入后对后续 Vertex Attribute 读取可见。

项目不会在每个 Primitive Dispatch 后立即插入 Barrier，而是：
- 遍历所有 Morph Primitive
- 执行需要的 Compute Dispatch
- 只要至少有一次 Dispatch
- 统一调用一次 Memory Barrier

`glMemoryBarrier()` 不表示 CPU 需要等待 GPU 完成，他表达的是 GPU 内部的资源依赖。

## Morph 更新与版本缓存
Morph 数据并不需要每帧重新上传和计算，项目使用版本号判断权重是否变化，只更新真正发生变化的 Primitive.

### SceneMorphPose
`SceneMorphPose` 保存每个节点的动画权重，当动画采样结果与已有权重不同：
```cpp
sceneMorphPose.setWeights(nodeIndex, weights);
```

会更新该节点权重，并递增版本号。

### MorphState
Viewer 中的 `applyMorphAnimation()` 先比较 `appliedMorphPoseVersion` 和 `sceneInstance.morphPose.version()`.

如果两者相同，说明场景级 Morph 权重没有变化，直接返回，不再遍历所有节点和 Primitive。

如果版本不同：
1. 遍历节点
2. 读取节点的动画权重
3. 遍历节点的 Morph Primitive
4. 调用 `MorphState::setWeight()`

最后更新viewer版本号。

每个 Morph Primitive 都有独立了的 `MorphState`：
```
weights_
activeTargetCount_
version_
```

调用 `setWeight(targetIndex, weight);` 时，会检查权重，若权重不一致才更新权重与版本号。

### RuntimeMeshInstance
每个 Primitive 记录 `appliedMorphVersion`，在 RuntimeMeshInstance 中与 `morphState.version()` 比较，相同说明当前 Output Vertex Buffer 已经对应最新权重，则跳过 weight buffer 上传和compute dispatch.

不同则执行：
1. 更新 MorphWeightBuffer
2. Dispatch Compute Shader
3. appliedMorphVersion = morphState.version()

### 两层缓存
SceneMorphPose 的版本号用以避免动画权重未变化时，遍历所有节点和 Primitive.

MorphState 的版本号避免在某个 Primitive 权重未变化时，重复上传和计算。

- 动画权重未变化：跳过 applyMorphAnimation
- 动画权重变化：更新 MorphState
- 某个 MorphState 未变化：跳过该 Primitive 的 Compute
- 某个 MorphState 变化：更新 Weight Buffer 并 Dispatch


## 总结
```
Morph 资产 Delta
    ↓
CPU 验证与稀疏化
    ↓
GPU Base / Offset / Delta Buffer
    ↓
动画系统产生权重
    ↓
SceneMorphPose
    ↓
MorphState 版本变化
    ↓
更新 Weight Buffer
    ↓
Compute Shader 写 Output Vertex Buffer
    ↓
Memory Barrier
    ↓
Skinning Vertex Shader
    ↓
RenderExtractor 创建 RenderItem
    ↓
Shadow / Forward / OutlineMask 绘制
```
