---
title: "UE Actor Lifecycle"
description: "Actor 生命周期介绍"
date: "2026-04-14 09:01:27"
category: "Unreal / Gameplay"
originalCategory: "UE Gameplay LAB"
track: "Game Development"
level: intermediate
status: ready
published: true
minutes: 9
order: 1000
prerequisites: []
tags: ["UE", "C++"]
photos: "banner.jpg"
source: "_posts"
---## 从硬盘加载
当 `UEgine::LoadMap` 或者 level streaming 使用 `UWorld::AddToWorld` 时，任何已经处于 level 的 Actor 是从硬盘加载的。

1. 当 Actor 从硬盘加载完毕后，会触发 `PostLoad` 函数，如果需要对旧版本数据做兼容处理或修复，就写在这里。 `PostLoad` 和 `PostActorCreated` 不会同时触发：前者说明 Actor 时读档进来的，后者说明 Actor 是新诞生的，例如 `SpawnActor` 或在编辑器手动拖入场景。
2. World 会调用 `UAISystemBase::InitializeActorsForPlay` ，为 Actor 开始运行游戏做准备：
   - 在这个阶段所有 Actor 已经在内存中就绪，属性也已经通过 `PostLoad` 修复完毕，引擎 现在开始建立 Actor 之间的逻辑关联。
3. Level 会对所有尚未初始化的 Actor 与通过 Seamless Travel 携带过来的 Actor 调用 `ULevel::RouteActorInitialize`.
   - 非初始化 Actor 是指那些已经存在于 Level 中，但还没有执行游戏逻辑初始化的 Actor.
   - Seamless Travel carry-over 是指玩家从关卡 A 切换到关卡 B 时，某些 Actor 不会被销毁，而是被“携带”到了新关卡。
4. 初始化组件：
   1. `AActor::PreInitializeComponents` 会在Actor的组件执行初始化之前被调用。
   2. `UActorComponent::InitializeComponent` 是一个辅助函数，用于创建并初始化 Actor 上定义的每个组件。
   3. `AActor::PostInitializeComponents` 则会在 Actor 的所有组件都完成初始化之后被调用。
5. 当关卡开始时，调用 `AActor::BeginPlay`.


```
UWorld::LoadMap()
├── （反序列化阶段）
│   ├── Actor 从磁盘加载到内存
│   └── AActor::PostLoad()
│       └── 👉 用于版本兼容 / 数据修复
│
├── （准备阶段）
│   └── UAISystemBase::InitializeActorsForPlay()
│       └── 👉 建立 Actor 之间的初步运行环境
│
├── （初始化阶段）
│   └── ULevel::RouteActorInitialize()
│       ├── AActor::PreInitializeComponents()
│       ├── UActorComponent::InitializeComponent()
│       └── AActor::PostInitializeComponents()
│
└── （运行阶段）
    └── AActor::BeginPlay()
```

## 在编辑器中运行
在编辑器环境下运行， Actors 是从编辑器复制的，而非从硬盘加载。之后的流程与从硬盘加载的流程类似：
1. 当 Actor 从编辑器复制到 World 时，调用 `UObject::PostDublicate`.
2. `UAISystemBase::InitializeActorsForBeginPlay`.
3. `ULevel::RouteActorInitialize`.
4. 初始化组件：
   1. `AActor::PreInitilizeComponents`.
   2. `UActorComponent::InitializeComponent`.
   3. `AActor::PostInitializeComponents`.
5. `AActor::BeginPlay`.

```
UEditorEngine::PlayInEditor()
├── UWorld::CreatePIEWorld()
│
├── （复制阶段）
│   ├── 从编辑器世界复制 Actor
│   └── UObject::PostDuplicate()
│       └── 👉 PIE 世界中的 Actor 副本初始化
│
├── （准备阶段）
│   └── UAISystemBase::InitializeActorsForPlay()
│
├── （初始化阶段）
│   └── ULevel::RouteActorInitialize()
│       ├── AActor::PreInitializeComponents()
│       ├── UActorComponent::InitializeComponent()
│       └── AActor::PostInitializeComponents()
│
└── （运行阶段）
    └── AActor::BeginPlay()
```

## Spawning
1. `UWorld::SpawnActor`.
2. 当 Actor 被创建后， `AActor::PostSpawnInitialize` 被调用，初始化 Actor 的基础属性，设置 Transform Owner 或 Instigator 等。
3. `AActor::PostActorCreated` is called for spawned Actors after its creation, any constructor implementation behavior should go here. `PostActorCreated` is mutually exclusive with `PostLoad`.
   - 这句话的意思是，如果有些初始化逻辑，本来想写在构造函数里，但是因为构造函数拿不到运行时信息，就写在 `PostActorCreated` 里。
   - 但我个人认为，基本没有初始化逻辑需要放在这个函数，尤其考虑到我可以在 `PostInitializeComponents` 或 `BeginPlay` 中完成相关内容的初始化；这个函数更多的意义是区分 `Spawn` 和 `Load`.
4. `AActor::ExecuteConstruction` 内部调用 `AActor::OnConstruction`.
5. `AActor::OnConstruction`： Blueprint Actors 在这里：
   - 创建组件。
   - 初始化变量。
   - 根据参数动态生成结构。
6. `AActor::PostActorConstruction`：Construction 完成。
7. 初始化组件：
   1. `AActor::PreInitilizeComponents`.
   2. `UActorComponent::InitializeComponent`.
   3. `AActor::PostInitializeComponents`.
8. `UWorld::OnActorSpawned`：广播 Spawn 事件。
9. `AActor::BeginPlay`.

```
UWorld::SpawnActor()
├── Actor 构造（Constructor）
├── AActor::PostSpawnInitialize()
│   ├── AActor::PostActorCreated()
│   ├── AActor::ExecuteConstruction()
│   │   ├── AActor::OnConstruction()
│   │   └── AActor::PostActorConstruction()
│
├── （阶段切换：进入初始化管线）
├── ULevel::RouteActorInitialize()
│   ├── AActor::PreInitializeComponents()
│   ├── UActorComponent::InitializeComponent()
│   └── AActor::PostInitializeComponents()
│
├── UWorld::OnActorSpawned()
└── AActor::BeginPlay()
```

## Deferred Spawn
Deferred Spawn 会在 Actor 创建后，但在 Blueprint 构造之前暂停，我们能够在构造逻辑执行前注入必要的数据和依赖，然后通过 `FinishSpawning` 继续生命周期。
- `UWorld::SpawnActorDeferred` ：允许在蓝图构造逻辑前，引入额外的初始化，即允许在 `OnConstruction` 前修改 Actor 状态。
- 当 Actor 的任何属性被设置为 `ExposeOnSpawn` 时，它就可以被延迟生成；在 `AActor::PostActorCreated` 后：
  1. 完成属性初始化，并调用多种初始化函数，最终得到一个不完整的 Actor 实例。
  2. `AActor::FinishSpawning` 在 Spawn 完成后调用，内部调用 `AActor::ExecuteConstruction`.

```
UWorld::SpawnActorDeferred()
├── Actor 构造（Constructor）
├── AActor::PostSpawnInitialize()
│   └── AActor::PostActorCreated()
│
├── 【暂停点：Construction 被延迟】
│   👉 此时：
│      - Actor 已存在 ✅
│      - 但 OnConstruction 未执行 ❌
│      - Blueprint组件未创建 ❌
│
│   👉 可执行：
│      - 数据注入（Data Injection）
│      - 设置属性 / 依赖
│
└── AActor::FinishSpawning()
    ├── AActor::ExecuteConstruction()
    │   ├── AActor::OnConstruction()
    │   └── AActor::PostActorConstruction()
    │
    ├── ULevel::RouteActorInitialize()
    │   ├── AActor::PreInitializeComponents()
    │   ├── UActorComponent::InitializeComponent()
    │   └── AActor::PostInitializeComponents()
    │
    ├── UWorld::OnActorSpawned()
    └── AActor::BeginPlay()
```

## End of Actor Lifecycle
- `AActor::Destroy`：当在游戏运行时，一个 Actor 需要被移除时调用该函数；这个 Actor 被标记为待移除，随后从 Level 的 Actor 数组中移除。
- `AActor::EndPlay`: 用来确保 Actor 的生命周期结束，调用的来源如下：
  - 明确调用 `Destroy`.
  - 当编辑器停止游戏运行。
  - 关卡切换.
  - 包含该 Actor 流关卡被卸载。
  - Actor 的生命周期到期时。
  - 应用程序关闭。
无论是那种情况，这个 Actor 会被标记为 `RF_PendingKill`，这样 UE 在下一个垃圾回收时，将它从内从中释放。
- `AActor::OnDestroyed`：这是对 Destroy 的遗留响应接口。最好把这里的逻辑移到 `EndPlay`，因为 `OnDestroyed` 只有在显式调用 `Destroy` 时才会被触发，而 `EndPlay` 还能处理多种“非正常死亡”。

## Garbage Collection
有时当物体被标记为 destruction，GC 会将其从内存移除，并释放任何其使用的资源。
1. `UObject::BeginDestroy`：这是一个对象释放内存，并处理多线程资源的地方。
2. `UObject::IsReadyForFinishDestroy`：垃圾回收进程会调用此函数来判断对象是否可以被永久释放，如果返回否，则该函数将对象的实际销毁推迟到下一次垃圾回收循环。
3. `UObject::FinishDestroy`：释放内部数据结构的最后机会，内存被正式释放前的最后一次调用。

UE 的垃圾回收会构建对象集群，以便将这些对象作为一个整体共同销毁；与逐个删除对象相比，集群化能够减少垃圾回收相关的总耗时和整体内存抖动：当一个对象加载时，它可能会创建子对象，通过将主对象及其子对象组合成一个单一的垃圾回收集群，引擎可以延迟释放集群占用的资源，直到整个对象都准备好被释放，然后一次性释放所有资源。


```
AActor::Destroy()
├── 标记 Actor 为 PendingKill（不会立即销毁）
├── 从 Level Actor 列表中移除
│
├── AActor::EndPlay(EndPlayReason)
│   ├── 👉 所有“生命周期结束”都会走这里（核心入口）
│   ├── 可用资源仍然有效（组件 / World 仍可访问）
│   └── 推荐在此做清理逻辑（解绑 / 停止系统）
│
├── AActor::Destroyed()
│   ├── ⚠️ 仅在显式调用 Destroy 时触发
│   └── 遗留接口（Legacy）
│
├── （等待 Garbage Collection）
│
├── UObject::BeginDestroy()
│   ├── 开始释放资源（可能跨线程）
│
├── UObject::IsReadyForFinishDestroy()
│   ├── 返回 false → 延迟到下一次 GC
│
└── UObject::FinishDestroy()
    └── 最终内存释放
```

## 实验
你可以使用 UEGameplayLAB 来进行实验。

### PIE 下 Level 中的 Actor
针对 PIE 场景中的 Actor，UE的文档描述的并不准确。

在 PIE 环境下，官方文档将其描述为调用 `PostDuplicate`，且误导性地忽略了它仍然会调用 `PostLoad`.

使用 UEGameplayLAB 中的代码，将其中的 `BP_LifecycleProbeActor` 移到场景中，不要保存场景，观察日志输出：
```
LogTemp: Warning:
[BP_LifecycleProbeActor_C_UAID_60FF9E195527A4D102_2110724063][Default][Value=0] Constructor
LogTemp: Warning:
[BP_LifecycleProbeActor_C_UAID_60FF9E195527A4D102_2110724063][Default][Value=0] PostDuplicate
LogTemp: Warning:
[BP_LifecycleProbeActor_C_UAID_60FF9E195527A4D102_2110724063][Default][Value=0] PostLoad
LogTemp: Warning:
[BP_LifecycleProbeActor_C_UAID_60FF9E195527A4D102_2110724063][Default][Value=0] OnConstruction
LogTemp: Warning:
[BP_LifecycleProbeActor_C_UAID_60FF9E195527A4D102_2110724063][Default][Value=0] PreInitializeComponents
LogTemp: Warning:
[BP_LifecycleProbeActor_C_UAID_60FF9E195527A4D102_2110724063][Default][Value=0] PostInitializeComponents
LogTemp: Warning:
[BP_LifecycleProbeActor_C_UAID_60FF9E195527A4D102_2110724063][Default][Value=0] BeginPlay
```

我们发现实际上，它仍然调用了 `PostLoad`.

在 `PostDuplicate` 打上断点，并观察堆栈，可以发现 UE 的 Duplicate 操作是在 `StaticDuplicateObjectEx` 中完成的，其内部通过序列化写入 + 反序列化读取构建新的对象图，在这个过程中仍然需要调用 `PostLoad`.

此外如果对场景进行保存，再次运行，输出的日志如下：
```
LogTemp: Warning:
[BP_LifecycleProbeActor_C_UAID_60FF9E195527A4D102_2110724063][Default][Value=0] Constructor
LogTemp: Warning:
[BP_LifecycleProbeActor_C_UAID_60FF9E195527A4D102_2110724063][Default][Value=0] PostLoad
LogTemp: Warning:
[BP_LifecycleProbeActor_C_UAID_60FF9E195527A4D102_2110724063][Default][Value=0] OnConstruction
LogTemp: Warning:
[BP_LifecycleProbeActor_C_UAID_60FF9E195527A4D102_2110724063][Default][Value=0] PreInitializeComponents
LogTemp: Warning:
[BP_LifecycleProbeActor_C_UAID_60FF9E195527A4D102_2110724063][Default][Value=0] PostInitializeComponents
LogTemp: Warning:
[BP_LifecycleProbeActor_C_UAID_60FF9E195527A4D102_2110724063][Default][Value=0] BeginPlay
```
在 PIE 场景中，Actor 的初始化路径并非单一。对于未保存到关卡资产中的 Actor，PIE 会通过 `StaticDuplicateObjectEx` 将 Editor World 中的对象复制到 PIE World，此时会触发 `PostDuplicate`，并在内部序列化过程中执行类似反序列化初始化逻辑，从而表现为 `PostLoad` 也被调用。

而对于已经保存到关卡（.umap）的 Actor，PIE 可以直接通过加载关卡资产构建对象，此时仅触发 `PostLoad`，不会经过 `PostDuplicate`。

因此，是否调用 `PostDuplicate` 取决于 PIE 在构建运行时 World 时选择的是“对象复制路径”还是“资源加载路径”。

文档所描述的流程过于简化了。

#### 序列化与反序列化

本质上 UObject 与 二进制数据流相互转换。

程序里的对象，如 Actor 包含指针、组件、数组等一些列内容，这些东西不能直接存进硬盘，不能跨进程传，不能内存复制，所以必须转成纯数据。

序列化做的就是把对象拆成可存储的数据，而反序列化则是把数据恢复成对象。

序列化不仅仅是存文件用的，而是对象复制的基础。

#### StaticDuplicateObjectEx
它的逻辑可以归纳为：
1. 准备阶段：清理 flags，创建空的 UObject.
2. 写阶段：Serialize Write.
3. 图结构收集。
4. 读阶段：Serialize Read.
5. PostDuplicate
6. ConditionalPostLoad
7. Subobject 修复 + Finalize

在这个函数中，先调用 `PostDuplicate` 随后调用 `ConditionalPostLoad`.

#### ConditionalPostLoad
这是一个为 `PostLoad` 的调用做安全保证的函数。

在 UE 调用 `PostLoad` 前，必须保证三件事：
1. 避免重复 `PostLoad`.
2. 保证顺序正确。
3. 支持多来源对象。

`ConditionalPostLoad` 是 UE 用来统一管理 `PostLoad` 执行的调度器，它通过 `RF_NeedPostLoad` 控制是否执行，并确保 Archetype → Subobject → Self 的顺序正确，最终调用真正的 `PostLoad`.

### SpawnTester
为了测试 Spawned Actor 的生命周期，你可以使用 UEGameplayLAB 中的 `BP_SpawnTester` 来测试。

通过使用 `bTestSpawn` `bTestDeferred` `bTestDestroy` 观察 Actor 的生命周期。

同时启用三个测试，结果与文档一致，输出的日志如下：
```
LogTemp: Warning: [BP_LifecycleProbeActor_C_0][Default][Value=0] Constructor
LogTemp: Warning: [BP_LifecycleProbeActor_C_0][Default][Value=0] PostActorCreated
LogTemp: Warning: [BP_LifecycleProbeActor_C_0][Default][Value=0] OnConstruction
LogTemp: Warning: [BP_LifecycleProbeActor_C_0][Default][Value=0] PreInitializeComponents
LogTemp: Warning: [BP_LifecycleProbeActor_C_0][Default][Value=0] PostInitializeComponents
LogTemp: Warning: [BP_LifecycleProbeActor_C_0][Default][Value=0] BeginPlay
LogTemp: Warning: [BP_LifecycleProbeActor_C_1][Default][Value=0] Constructor
LogTemp: Warning: [BP_LifecycleProbeActor_C_1][Default][Value=0] PostActorCreated
LogTemp: Warning: === BEFORE FinishSpawning ===
LogTemp: Warning: [BP_LifecycleProbeActor_C_1][Deferred][Value=777] OnConstruction
LogTemp: Warning: [BP_LifecycleProbeActor_C_1][Deferred][Value=777] PreInitializeComponents
LogTemp: Warning: [BP_LifecycleProbeActor_C_1][Deferred][Value=777] PostInitializeComponents
LogTemp: Warning: [BP_LifecycleProbeActor_C_1][Deferred][Value=777] BeginPlay
LogTemp: Warning: === CALL Destroy ===
LogTemp: Warning: [BP_LifecycleProbeActor_C_0][Spawn] EndPlay (Destroyed)
LogTemp: Warning: [BP_LifecycleProbeActor_C_0][Spawn][Value=200] Destroyed
LogTemp: Warning: === CALL Destroy ===
LogTemp: Warning: [BP_LifecycleProbeActor_C_1][Deferred] EndPlay (Destroyed)
LogTemp: Warning: [BP_LifecycleProbeActor_C_1][Deferred][Value=777] Destroyed
```

其中编号为 0 的为正常Spawn，而 1 为 Deferred Spawn.

- 正常 Spawn 的流程遵循：`PostActorCreated` -> `OnConstruction` -> 初始化组件 -> `BeginPlay` 的顺序，且对 `TestValue` 的修改发生在 `BeginPlay` 之后。
- 而 Deferred Spawn 则不一样，在完成 `PostActorCreated` 后，它等待 `FinishSpawning` 发生，我们在 `ATestSpawner` 中，在 `FinishSpawning` 前，修改了 `TestValue` （顺便也修改了 `DebugTag` ），在后续的蓝图变量与组件初始化时，相关参数的值已经被修改。

Deferred Spawn 的本质是将 Actor 生命周期拆分为“对象创建”与“构造执行”两个阶段。
