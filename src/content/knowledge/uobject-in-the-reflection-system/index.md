---
title: "UObject in the Reflection System"
description: "反射系统介绍"
date: "2026-04-15 10:51:47"
category: "Unreal / Gameplay"
originalCategory: "UE Gameplay LAB"
track: "Game Development"
level: advanced
status: ready
published: true
minutes: 16
order: 1000
prerequisites: []
tags: ["UE", "C++"]
photos: "banner.jpg"
source: "_posts"
---
UE中所有对象的基类都是 `UObject`. 而 `UClass` 宏的作用是标记 `UObject` 的子类，以便 `UObject` 处理系统可以识别他们。

## `UCLASS` 宏
`UCLASS` 是用来告知 UE，被标记的这个 C++ 类要进入反射系统，变成引擎可管理的类型。

```
class MyActor
{
};
```
未被标记的 `MyActor`，不能 Spawn GC Blueprint.

引入 `UCLASS` 标记：
```
UCLASS()
class MyActor
{
};
```
具备反射信息，可以 Spawn GC 序列化。

每个 `UCLASS` 类，在运行时都有一个对应的 `UClass` 对象。
- 运行时类型识别(RTTI)：可以在运行时询问一个对象，是什么类。
- 属性系统：引擎可以通过 `UClass` 知道一个类有哪些变量，从而实现编辑器中的属性面板显示、序列化与网络同步。
- 动态实例化：可以使用 `StaticClass` 或 `GetClass` 获取 `UClass` 对象，然后通过 `NewObject<T>(...)` 动态地创建该类实例。

总的来说：
- `UCLASS` ： C++ 代码中编写的“蓝图”或模板。它定义了对象应该有哪些属性和函数。
- `UClass` ：每一个被 `UCLASS()` 标记的类会创建一个单例对象。这个对象包含了该类的所有元数据。

一个 `UClass` 元数据对象，包含类名、父类、属性列表、函数列表、构造方式与 CDO(Class Default Object) 指针。

也就是说，当一个 C++ 类被 `UClass` 标记后，UHT 会为其生成反射信息，并在运行时，创建对应的 `UClass` 对象，在 `UClass` 初始化过程中，引擎会构建该类的 CDO ，作为该类所有实例的默认模板。

## `UObject` 实例创建
### `NewObject`
```
template< class T >
T* NewObject
(
    UObject* Outer = (UObject*)GetTransientPackage(),
    UClass* Class = T::StaticClass()
)
```
`NewObject` 是基于 `UClass` + CDO 创建一个 `UObject` 实例的通用工厂函数。
- `Outer`：对象的归属者，或者所在容器。
- `Class`：指定创建那种类型。

### `NewNamedObject`（已被废除）

这个函数实质上早就已经被废除了，在实验中，我们使用 `NewObject` 的重载版本测试。

~~这是 UE4 早期版本的遗留产物，我实在是难以理解为什么 5.7 的文档还在提及这个函数~~

```
template< class TClass >
TClass* NewNamedObject
(
    UObject* Outer,
    FName Name,
    EObjectFlags Flags = RF_NoFlags,
    UObject const* Template=NULL
)
```
通过允许为新实例指定一个名称以及对象标记和一个要指定为参数的模板对象， `NewNamedObject()` 在 `NewObject()` 上展开。


### `ConstructObject`（已被废除）

~~我实在是难以理解为什么 5.7 的文档还在提及这个函数~~

```
template< class T >
T* ConstructObject
(
    UClass* Class,
    UObject* Outer = (UObject*)GetTransientPackage(),
    FName Name=NAME_None,
    EObjectFlags SetFlags=RF_NoFlags,
    UObject const* Template=NULL,
    bool bCopyTransientsFromClassDefaults=false,
    struct FObjectInstancingGraph* InstanceGraph=NULL
)
```
`ConstructObject` 是 `UObject` 创建的“底层通用构造接口”，而 `NewObject` 是它的简化封装。

他包含的步骤如下：
1. 分配 UObject 内存
2. 设置 Outer / Name / Flags
3. 选择 Template（默认是 CDO）
4. 复制属性（InitProperties）
5. 处理子对象（InstanceGraph）
6. 调用构造初始化（FObjectInitializer）

最大的区别是，使用 `ConstructObject` 可以指定构造的模板，而不是默认使用 CDO.

### `EObjectFlags`
`EObjectFlags` 用于描述 UObject 的类型、生命周期状态、GC行为等，是 UE 对象系统的核心位标记。

- **Object Type（对象类型）**
  - `RF_Public (0x00000001)`：对象在其所属 Package 外部可见
  - `RF_Standalone (0x00000002)`：即使没有引用，也会被保留（常用于编辑器资源）
  - `RF_Native (0x00000004)`：本地（C++）对象，仅用于 UClass
  - `RF_Transactional (0x00000008)`：支持事务（Undo/Redo）
  - `RF_ClassDefaultObject (0x00000010)`：类默认对象（CDO）
  - `RF_ArchetypeObject (0x00000020)`：原型对象（模板对象）
  - `RF_Transient (0x00000040)`：不会被保存到磁盘

- **Garbage Collection（垃圾回收）**
  - `RF_RootSet (0x00000080)`：根对象，不会被 GC 回收
  - `RF_IsLazyReferenced (0x00000100)`：被延迟引用（Lazy Pointer）引用
  - `RF_Unreachable (0x00000200)`：GC 标记为不可达
  - `RF_TagGarbageTemp (0x00000400)`：对象被标记为供使用垃圾回收的各种实用程序所使用。

- **对象生命周期（Lifecycle）**
  - `RF_NeedLoad (0x00000800)`：对象需要从磁盘加载
  - `RF_AsyncLoading (0x00001000)`：正在异步加载
  - `RF_NeedPostLoad (0x00002000)`：对象需要后加载
  - `RF_NeedPostLoadSubobjects (0x00004000)`：子对象需要 PostLoad 修复
  - `RF_PendingKill (0x00008000)`：已标记为待销毁（逻辑死亡）
  - `RF_BeginDestroyed (0x00010000)`：已调用 BeginDestroy
  - `RF_FinishDestroyed (0x00020000)`：已调用 FinishDestroy

- **特殊掩码（Masks）**
  - `RF_AllFlags (0x0003ffff)`：所有标记（调试用）
  - `RF_NoFlags (0x00000000)`：无标记

- **预定义标记组（Groups）**
  - `RF_Load`
    `RF_Public | RF_Standalone | RF_Native | RF_Transactional | RF_ClassDefaultObject | RF_ArchetypeObject`
    → 从磁盘加载对象常见标记组合

  - `RF_PropagateToSubobjects`
    `RF_Public | RF_ArchetypeObject | RF_Transactional`
    → 子对象从其 Outer / Archetype 继承的标记

## `UObject` 管理
### 自动属性初始化
> UObjects are automatically zeroed on initialization, before the constructor is called. This happens for the whole class, UProperties and native members alike. Members can subsequently be initialized with custom values in the class constructor.

文档的描述其实并不准确，过于简略了。

Object 创建的初始化过程如下：
1. 内存分配：引擎分配一块足以容纳该类的内存。
2. 强制归零：引擎将这块内存全部置为0.
3. 模板注入：引擎将该类的 CDO 内存镜像直接拷贝到新内存。
4. 构造函数修正：主要是防止所有实例共享同一个组件指针。

而原文档忽视了 CDO 的作用，具有一定的误导性。

但实际上 CDO 的复制并非整块复制，我们会在后续的实验里看到更详细的过程；从某种意义上来讲，使用构造作为初始化的结果，在部分情况下是成立的，也就是说，CDO 的复制并不是一定复制，而是有条件地、分情况地部分复制。

### 自动引用管理
在标准的 C++ 中，如果删除了一个对象，那么指向它的原生指针就会变成野指针，但是虚幻 C++ 不一样。

如果一个指针被标记为 `UPROPERTY()` 或者存储在如 `TArray` 等 UE 容器中；当一个 `AActor` 或者 `UActorComponent` 被销毁时，GC 系统会利用反射系统遍历内存，最终它会找到所有指向该被销毁对象的符合上述要求的指针，并强行把它们设置为 `nullptr`.

这很方便，因为我们不再需要在销毁时手动通知其他类，只需要养成及时判空的习惯，就能同时检测到因为未赋值和被销毁导致的空。

如果一个 `UObject*` 没有加上 `UPROPERTY`，GC 系统在扫描时会跳过这块内存，这有两个风险：
1. 对象被误删：GC 看不到原生指针，有可能认为该指针指向的对象不被任何指针引用，导致对象被回收。
2. 野指针崩溃：当对象被回收后，原生指针很有可能依然指向原来的内存地址，如果访问它，程序会直接崩溃。

但如果你不想让这个指针保护这个对象不被 GC 清除，又想确保指针能够被反射系统观察，安全地进行使用，就该使用 `TWeakObjectPtr`.

### 序列化
序列化的核心是增量存储。

当保存一个放置在关卡中的 Actor 时，引擎并不会把它的所有变量都存进硬盘，只会存储与它的 CDO  有区别的变量才存。

例如，如果一个 `AEnemy` 的 CDO 中变量是 100. 但存入关卡的实例的变量是 200，那么就需要额外存储，如果都是100，引擎在文件里完全不记录这个变量。

加载时，引擎先把 CDO 默认数据拷贝到对象上，然后再把文件记录的数据覆盖上去。

当游戏更新时，如果在已有的类定义中增加了 `UPROPERTY` 变量，加载旧存档时，如果引擎在文件里没有这个新变量，它会直接从新版本的 CDO 拷贝一个默认值给它；如果是原生变量，加载旧存档，会导致乱码或未定义的值。

如果你希望尽可能地减少游戏存储体积，不在文件存储某些变量，又能够让某些变量能够被反射系统管理，例如在蓝图里对这些变量进行操作，那么就需要使用 `Transient`.

`Transient` 的意思是，反射系统知道这个变量，但不会把它存进硬盘。

如果需要做复杂的数据迁移，例如修改 `int` 变量为 `float`，就需要使用 `UObject::Serialize`.

### 属性自动更新
当一个 `UClass` 的 CDO 发生改变，引擎会在载入对应实例时，对所有相关数据进行修改。

引擎在加载关卡时，会进行一次三方比对：
- 旧 CDO 的值。
- 当前实例的值。
- 新 CDO 的值。

如果 实例值 == 旧 CDO，那么 实例值 == 新 CDO.
否则，保留实例值。

这种机制能够满足批量修改的同时，保留局部细节。

而这种特性就急于增量存储，对于默认值与 CDO 一致的情况，文件中根本没有存储变量的值，每一次加载都是从 CDO 获取；对于不一样的变量值，每一次加载，都会从文件的记录获取手动设置的值，覆盖掉 CDO 的值。

但我们也需要注意，如果存在希望统一修改变量为新的值的情形，这种修改方式不会修改手动设置的值。

### 反射系统与编辑器耦合
当将一个变量标记为 `UPROPERTY(EditAnyWhere)` 时，引擎并不是简单地记录了这个变量。编辑器会插叙该类对应的 `UClass` 对象。由于 `UClass` 存储了所有属性的元数据，编辑器会动态地渲染修改 UI.

我们可以通过 `UPROPERTY` 宏内的关键字实现：
| 分类 | 关键字 | 说明与用途 |
| :--- | :--- | :--- |
| **编辑器访问** | **EditAnywhere** | **最常用**。在类原型（蓝图）和关卡实例的细节面板中均可编辑。 |
| | **VisibleAnywhere** | 均可见但不可编辑。**常用于组件指针**，防止组件对象本身被替换或置空。 |
| | **EditDefaultsOnly** | 仅能在蓝图编辑器（类默认值）中修改，场景里的实例无法单独修改。 |
| | **EditInstanceOnly** | 仅能在摆放到场景里的具体实例上修改，不影响类默认值。 |
| **蓝图交互** | **BlueprintReadOnly** | 蓝图脚本可以读取（Get）该变量，但不能连线修改（Set）它。 |
| | **BlueprintReadWrite** | 蓝图脚本既可以读取也可以修改该变量。 |
| | **Category = "Name"** | 在编辑器面板和蓝图右键菜单中对变量进行分组显示。 |
| **生命周期** | **Transient** | **瞬时变量**。不参与磁盘存取，但受 GC 监控，对象销毁时自动置空。 |
| | **DuplicateTransient** | 复制对象（如 Ctrl+D）时，该变量会重置为默认值，不随新对象拷贝。 |
| | **Instanced** | 每个实例拥有该对象的独立副本。常用于在编辑器里直接编辑子对象。 |
| **网络同步** | **Replicated** | 基础同步。变量在服务器更改后会自动同步到所有相关的客户端。 |
| | **ReplicatedUsing = Func** | **RepNotify**。当同步发生时，在客户端自动触发指定的 C++ 或蓝图函数。 |
| **元数据 (meta)** | **AllowPrivateAccess** | 允许将 `private` 作用域下的变量暴露给蓝图使用。 |
| | **ClampMin / Max** | 限制在编辑器面板中输入的数值范围（仅限 UI 交互层的限制）。 |
| | **DisplayName** | 在编辑器界面显示一个更直观的名字，而不受 C++ 变量命名的限制。 |


### 运行时类型识别与类型转换机制
在标准 C++ 中，`dynamic_cast` 依赖于编辑器生成的 RTTI 且性能开销较大，UE 通过反射系统实现了一套更安全、更高效且功能更丰富的机制。

虚幻的 `Cast<T>` 利用了反射系统中的 `UClass` 信息。它会直接检查对象的类层次结构，判断当前对象是否是目标类；如果转换失败，它会返回 `nullptr`，我们只需要用 `if` 判断就好了。

通过 `GENERATED_BODY()` 宏，每一个类有一个自动定义的 `typedef Super`.

这意味着，我们可以直接使用父类方法 `Super::`，且在修改继承关系时，需要修改类声明，但不用担心函数体内的 `Super` 调用的变动。

如果你需要知道某个对象是不是某个类，不需要进行转换，只需要使用 `IsA` 即可：
```
if (Enemy->IsA(AMegaBoss::StaticClass()))
{
    // 确认是 MegaBoss，但不进行指针转换
}
```
`IsA` 比 `Cast` 更轻量，因为他不涉及返回新的指针，只是一个 bool 查询。

### 垃圾回收
引擎会构建一张图（引用图）记录所有 `UObject` 之前的相互引用关系；在图中的搜索起点，叫做根集，这些对象被标记为绝对不可删除。

GC 启动时，从根集向下遍历，凡是能顺着引用链路找到的对象，都被视为正常使用；哪些无法从根集触达的对象，会被认为不再需要并被移除。

也就是说如果你希望保留某个对象存活，你要么使用一个 `UPROPERTY` 指针引用它，要么在 UE 提供的容器中存储指向它的指针。

`Actor` 通常不需要额外标记，因为它们被所属的 Level 引用，而 Level 连接着根集。

为了处理成千上万的对象而不产生卡顿，引擎引入了集群概念，将多个对象打包处理。
| 设置项 (Setting) | 功能介绍 | 优点 | 缺点 / 注意事项 |
| :--- | :--- | :--- | :--- |
| **UObject Clusters** | 将逻辑上相关的对象（如一个 Actor 及其拥有的所有组件）打包成一个“簇”进行整体管理。 | **极大地提升可达性分析速度**。GC 扫描时只需检查簇头，无需遍历每个子对象。 | 销毁大簇时，所有成员需在同一帧完成清理，可能导致**瞬时掉帧 (Hitch)**。 |
| **Merge GC Clusters** | 当一个簇中的对象引用了另一个簇中的对象时，引擎会将这两个簇合并为一个更大的簇。 | 进一步减少 GC 扫描时的开销和频率。 | **容易导致内存常驻**。只要大簇中有一个对象被引用，整个合并后的簇都无法被回收。 |
| **Actor Clustering** | 专门针对 Actor 的集群优化。需配合 `bCanBeInCluster` 变量或重写 `CanBeInCluster` 函数使用。 | **适合静态物体**。对关卡中大量放置后不再移动或销毁的物体（如 StaticMeshActor）效果极佳。 | 默认对大多数 Actor 关闭；不适合频繁动态创建和销毁的 Actor。 |
| **Blueprint Clustering** | 针对蓝图生成的类信息（UBlueprintGeneratedClass）及其元数据进行集群处理。 | 优化了类层级的管理逻辑，减少了蓝图系统在 GC 时的负担。 | **注意：** 该设置优化的是“类数据”本身，而非蓝图生成的每一个实例对象。 |

集群的目的是将点对点的扫描变成块对块的扫描。

集群越多，GC 的扫描速度越快；但清理时，如果一次性释放大量内存，可能造成性能毛刺。

## 实验
### `UObject` 实例创建与属性初始化
使用 UEGameplayLAB 中的 `BP_ObjectCreationTester` 我们可以得到 `UObject` 创建过程的相关信息。

代码的基本内容如下：
1. 修改 CDO（Class Default Object）的默认值
2. 使用 `NewObject` 创建实例（不传 Template）
   → 观察实例是否继承 CDO 的修改
3. 手动创建一个 Template 对象，并修改其值
4. 使用 `NewObject(..., Template)` 创建实例
   → 观察实例是否继承 Template 的值
5. 在 `Constructor` 和 `PostInitProperties` 中打印变量
   → 区分“构造阶段”和“初始化完成阶段”的数据变化

```
LogTemp: Warning: ========== Object Creation Test ==========
LogTemp: Warning: ---- NewObject ----
LogTemp: Warning: Before Modify CDO: Config=100 Normal=100
LogTemp: Warning: After Modify CDO: Config=300 Normal=300
LogTemp: Warning: [Constructor] 0000096370727840 Config=100 Normal=100
LogTemp: Warning: [PostInit] 0000096370727840 Config=300 Normal=100
LogTemp: Warning: Instance: Config=300 Normal=100
LogTemp: Warning: ---- NewNamedObject (Template Path) ----
LogTemp: Warning: [Constructor] 0000096370727880 Config=100 Normal=100
LogTemp: Warning: [PostInit] 0000096370727880 Config=300 Normal=100
LogTemp: Warning: [Constructor] 0000096370727900 Config=100 Normal=100
LogTemp: Warning: [PostInit] 0000096370727900 Config=999 Normal=999
LogTemp: Warning: Template: Config=999 Normal=999
LogTemp: Warning: Instance: Config=999 Normal=999
```

现在我们发现，如果我们直接修改 CDO，他似乎并没有完全生效，因为非 Config 变量的值并没有因为 CDO 的默认值改变而改变；而如果我们给出非 CDO 的 Template，它的所有默认值均会生效。

这暗示着实例创建时，UE 并不是简单地将所有内容从 CDO 内存区域拷贝到新的实例的内存区域，而是有更多的实现细节。

当调用 `NewObject<UTestObject>()` 时，如果没有显式传入 Template，引擎会默认使用 CDO（Class Default Object）作为 DefaultData。但这里并不是简单的“拿 CDO 做一次完整拷贝”。

首先执行构造函数，此时对象内存虽然已经分配，但还没有应用 Template 的覆盖逻辑，因此打印结果为：
`[Constructor] Config=100 Normal=100`.

接着进入 `FObjectInitializer::PostConstructInit` → `InitProperties`，这一步才是真正决定“默认值来源”的核心阶段。

关键分支在于：`Class->GetDefaultObject(false) == DefaultData`.

也就是 `Template == CDO` 的情况。

在这个分支中，引擎不会遍历所有属性，而是走一个优化路径，只遍历 `PostConstructLink` 链表中的属性：

```
for (FProperty* P = Class->PostConstructLink; P; P = P->PostConstructLinkNext)
{
    P->CopyCompleteValue_InContainer(Obj, DefaultData);
}
```
`PostConstructLink` 只包含“需要额外初始化”的属性，例如带有 `Config`、需要从 `ini` 加载的变量。

因此结果是：Config 被从 CDO 复制（300）, Normal 不参与复制，保持构造阶段的值（100）.

最终表现为：`Instance: Config=300 Normal=100`.

这说明 CDO 并不是一个“完整模板”，而是一个“按规则选择性应用的默认数据源”。

再看显式 Template 的路径。

当调用：`NewObject(..., Template)` 且 Template 不是 CDO 时，`InitProperties` 会走另一条分支，即完整复制路径。

此时引擎会遍历 PropertyLink（完整属性链表）：

```
for (FProperty* P = Class->PropertyLink; P; P = P->PropertyLinkNext)
{
    P->CopyCompleteValue_InContainer(Obj, DefaultData);
}
```

这意味着所有 `UPROPERTY` 都会被逐一复制.

因此结果是：`Instance: Config=999 Normal=999`.

这条路径的语义非常直接：Template 是一个“完整数据快照”，新对象会被完全覆盖。

对比两条路径，本质区别可以总结为：

CDO 不是“数据模板”，而是“默认值规则的来源”，Template 才是真正的“数据模板”。

进一步具体化：

CDO 路径的特点是：
- 只复制 PostConstructLink 中的属性（例如 Config）。
- 普通变量依赖构造函数。
- 是“规则驱动”的初始化。
- 目的是优化性能并避免重复初始化。

Template 路径的特点是：
- 复制 `PropertyLink` 中的全部属性。
- 完全覆盖构造函数结果。
- 是“数据驱动”的初始化。
- 目的是实现精确克隆。

这也解释了实验中“不符合直觉”的现象：

修改 CDO 后，普通变量没有生效，是因为它根本没有参与复制流程，而 `Config` 生效，是因为它被列入了 `PostConstructLink`.

所以 `UObject` 初始化 = 构造函数初始化 + 条件化属性复制；`UObject` 初始化 ≠ 简单的 CDO 内存拷贝。

### 自动引用关系管理
使用 UEGameplayLAB 的 `BP_GCTestActor` 能够观察到三类指针（`UPROPERTY` `TWeakObjectPtr` 原生指针）的具体表现：
- 被 `UPROPERTY` 标记的指针在 GC 后依然有效，对象可以被安全访问。这说明该对象仍然存在于 GC 的可达路径中，没有被回收。
- `TWeakObjectPtr` 在 GC 后变为无效（IsValid = false），说明其指向的对象已经被回收。这验证了弱引用不会参与对象的生命周期管理，仅用于安全地检测对象是否仍然存在。
- 原生指针在 GC 后依然保持原始地址，但其指向的对象实际上已经被释放，成为悬空指针。这种指针既不会被 GC 更新，也不会自动失效，如果继续解引用，将导致未定义行为甚至程序崩溃。

`UPROPERTY` 的作用是让引用关系对 GC 可见，从而参与生命周期管理；弱引用用于安全访问；而原生指针完全脱离 GC 体系，需要开发者自行保证安全性。
