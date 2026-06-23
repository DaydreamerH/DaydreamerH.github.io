---
title: "Tasks Systems In UE"
description: "任务系统"
date: "2026-05-28 14:44:57"
category: "Unreal / Gameplay"
originalCategory: "UE Gameplay LAB"
track: "Game Development"
level: foundation
status: ready
published: true
minutes: 6
order: 1000
prerequisites: []
tags: ["UE", "C++"]
photos: "banner.png"
source: "_posts"
---任务系统是一个作业管理器，它能够实现异步执行游戏性代码的能力；支持构建和允许由存在依赖关系的任务所组成的有向无环图；是对 UE 中所使用的作业管理器 TaskGraph 的改进。

TasksSystem 和 TaskGraph 均使用调度器和工作线程。

## 启动任务
启动一个任务需要提供该任务的调试名称以及作为一个任务体的可调用对象：
```cpp
Launch(
    UE_SOURCE_LOCATION,
    []{ UE_LOG(LogTemp, Log, TEXT("Hello Tasks!")); }
);
```

上述代码启动了一个会异步执行给定函数的任务。第一个参数是任务的调试名称（最好是唯一的）。其目的是为了便于调试任务，并帮助定位启动该任务的代码。

`UE_SOURCE_LOCATION` 是一个宏，它会生成一个格式为源文件名及该宏所在行号的字符串。

这个例子展示了一个即发即弃的任务，这意味着不需要关心任务启动后的后续情况，因为它最终一定会执行。

如果需要等待任务完成或获取其执行结果。这可以通过使用 `Launch` 调用所返回的 `Task` 对象来实现：
```cpp
FTask Task = Launch(UE_SOURCE_LOCATION, []{});
```

任务执行可以返回一个结果，`FTask` 是 `TTask<void>` 的别名，它是泛型 `TTask<ResultType>` 的一个特化版本。`ResultType` 应当与任务体返回的结果类型相匹配：
```cpp
TTask<bool> Task = Launch(UE_SOURCE_LOCATION, []{ return true; });
```

任务是异步执行的，且可能会与启动线程并发允许，因此它们的执行顺序是未确定的。

我们可以通过指定任务的优先级来影响任务的执行顺序。

任务的优先级 `ETaskPriority` 包括：`High` `Normal` `BackgroundHigh` `BackgroundNormal` `BackgroundLow`.

```cpp
Launch(UE_SOURCE_LOCATION, []{}, ETaskPriority::High);
```

高优先级的任务会先于低优先级任务执行。

任务体通常使用 Lambda 表达式，也可以是任何可调用对象：
```cpp
void Func() {}
Launch(UE_SOURCE_LOCATION, &Func);

struct FFunctor
{
    void operator()() {}
};
Launch(UE_SOURCE_LOCATION, FFunctor{});
```

### FTask
`FTask` 是实际任务的句柄，类似于智能指针。它使用引用计数来管理生命周期。

启动一个任务会开启其生命周期并分配相应资源。如果要释放持有的引用，可以通过以下方式重置任务句柄：
```cpp
FTask Task = Launch(UE_SOURCE_LOCATION, []{});
Task = {}; // 释放引用
```

释放任务局部本身并不会导致任务被销毁；系统自身也持有用于执行该任务的引用，该引用会在任务完成后被释放。

## 等待任务完成
- 检查任务是否已经完成：`bool bCompleted = Task.IsCompleted();`.
- 等待任务完成：`Task.Wait();`.
- 含超时条件的等待：`bool bTaskCompleted = Task.Wait(FTimespan::FromMillisecond(100))`.
- 等待所有任务完成：`TArray<FTask> Tasks = ...; Wait(Tasks);`.
- 获取任务执行结果（该调用会一直阻塞，直到任务完成且结果就绪）：`TTask<int> Task = ...; int Result = Task.GetResult();`

虽然 UE 提供了显式的等待操作，但这应该尽量避免使用；最好是定义任务之间的依赖关系构建任务图，并设计基于任务的异步 API.

## Busy-waiting and Oversubscription
忙等待在 UE 5.5 中已被废弃。

在之前的版本中忙等待是一种在等待某些事件完成的同时执行其他任务的办法；该机制已经被超额订阅取代。

超额订阅是一种在线等待期间唤醒其他线程的机制，解决了随机死锁和延迟问题，代价是由于引入了额外线程而导致内存占用略微上升。

大多数等待函数都已经默认配置了超额订阅作用域（oversubscription scopes），因此程序员无需执行任何特殊操作即可自动受益于这一新机制。

这些额外增加的线程被称为备用线程（standby threads），它们将与等待线程的超额订阅范围一同显示在 Unreal Insights 中。

多线程开发中，等待不可避免：
- 在 5.5 版本之前（忙等待）：处于等待状态的线程 A 不能闲着。它会尝试在自己的调用栈上“顺手”抓一些其他不相关的任务来执行。虽然看起来没有浪费 CPU，但这种“乱接私活”的行为经常导致死锁、卡顿和调用栈溢出。
- 在 5.5 版本中（超额订阅）：
  - 当线程 A 需要等待时，它会老老实实地进入真正的挂起（等待）状态。
  - 为了不让 CPU 核心因为线程 A 的挂起而闲置，系统会临时唤醒一个“备用线程”来顶替线程 A 搬砖。
  - 这种临时增加活动线程数量的行为就叫做“超额订阅”。一旦线程 A 等待的事情完成了，备用线程就会重新进入休眠。

## 前置条件
任务可以对其他任务产生依赖：如果任务 A 只能在任务 B 完成之后执行，那么任务 B 就被称为任务 A 的前置条件，而任务 A 则称为任务 B 的后继任务；最终构建任务的有向无环图。

使用任务依赖关系的主要优势在于它不会阻塞工作线程。此外，依赖关系允许你强制规定任务的执行顺序，而这种顺序在通常情况下是无法保证的。以下代码构建了一个简单的“前置到后继”依赖关系：
```cpp
FTask Prerequisite = Launch(UE_SOURCE_LOCATION, []{});
FTask Subsequent = Launch(UE_SOURCE_LOCATION, []{}, Prerequisite);
```

如果一个任务有多个前置条件，可以使用 `Prerequisites()` 辅助函数：
```cpp
FTask A = Launch(UE_SOURCE_LOCATION, []{});
FTask B = Launch(UE_SOURCE_LOCATION, []{}, A);
FTask C = Launch(UE_SOURCE_LOCATION, []{}, A);
FTask D = Launch(UE_SOURCE_LOCATION, []{}, Prerequisites(B, C));
```

## 嵌套任务
前置条件属于执行依赖任务，而嵌套任务则属于完成依赖关系。

例如任务 A 在其执行期间启动了任务 B，而只有在任务 A 自身的执行体结束且任务 B 也已完成时，任务 A 才算真正完成。

当一个系统对外提供基于任务的异步接口，但作为内部实现细节的任务 B 不便暴露给外部时，这是一种非常常见的模式：

```cpp
FTask TaskA = Launch(UE_SOURCE_LOCATION,
[]
{
    FTask TaskB = Launch(UE_SOURCE_LOCATION, [] {});
    TaskB.Wait();
}
);
```

这是一个实现该目标的基本方法，但它非常低效。因为执行任务 A 的工作线程会被阻塞以等待任务 B 完成，因而无法在此期间被用于执行其他任务。

解决方案是使用嵌套任务。在我们的示例中，任务 A 是父任务，而任务 B 是嵌套任务，因为它的执行应当被嵌套在任务 A 的执行过程中：
```cpp
FTask TaskA = Launch(UE_SOURCE_LOCATION,
[]
   {
        FTask TaskB = Launch(UE_SOURCE_LOCATION, [] {});
        AddNested(TaskB);
   }
);
TaskA.Wait(); // 只有当 TaskA 和 TaskB 都完成时，该方法才会返回
```

## 管道
管道是一条由多个任务组成的任务链，这些任务会一个接一个地执行。设想一个被多个线程访问的共享资源，同步此类访问的经典方法是互斥锁，但这会带来巨大的性能开销。

对于复杂的资源，通常希望提供一个异步接口，允许发起对该资源进行操作的异步操作，并能够检查操作是否完成。

管道的设计初衷是为了简化异步接口的实现过程；为每一个共享资源分配一个管道，所有对该共享资源的访问都将在该管道启动的任务内部进行：
```cpp
class FThreadSafeResource
{
public:
    TTask<bool> Access()
    {
        return Pipe.Launch(TEXT("Access()"), [this] { return ThreadUnsafeResource.Access(); });
    }

    FTask Mutate()
    {
        return Pipe.Launch(TEXT("Mutate()"), [this] { ThreadUnsafeResource.Mutate(); });
    }
private:
    FPipe Pipe{ TEXT("FThreadSafeResource pipe")};
    FThreadUnsafeResource ThreadUnsafeResource;
};

FThreadSafeResource ThreadSafeResource;
// 多个线程并发访问同一个实例
bool bRes = ThreadSafeResource.Access().GetResult();
FTask Task = ThreadSafeResource.Mutate();
```

`FThreadSafeResource` 提供了一个公共的、基于任务的线程安全异步接口。它封装了一个非线程安全的资源。该实现直截了当，主要由一些样板代码组成。任何对非线程安全资源的访问都发生在管道化的任务内部。

由于这些管道任务是顺序执行的，因此不需要任何额外的同步机制。管道是轻量级的对象，所以它们不会存储其任务的集合。即使拥有数千个管道，也不会导致明显的性能下降。

要使得一个任务成为管道任务，需要通过管道来启动：
```cpp
FPipe Pipe{ UE_SOURCE_LOCATION };
FTask TaskA = Pipe.Launch(UE_SOURCE_LOCATION, []{});
FTask TaskB = Pipe.Launch(UE_SOURCE_LOCATION, []{});
```

`TaskA` 和 `TaskB` 不会并发执行，因此在访问共享资源时它们不需要相互同步。虽然大多数情况下执行顺序是可以预期的，但任务的启动顺序并不能得到完全保证。

管道任务支持与其他任务相同的功能。例如，它们可以拥有依赖关系，并遵循相同的运行规则。依赖关系会首先被解析，然后任务才会进入管道。这意味着，带有未解决依赖项的任务不会阻塞管道的执行，且依赖关系可以改变管道任务的实际执行顺序。

管道 API 是线程安全的。
管道对象是不可拷贝（non-copyable）且不可移动（non-movable）的。
无法在多个管道中启动同一个任务。

## 任务事件
Task Events 是一种特殊的任务类型，他没有任务体，也不执行任何代码。

任务事件在初始状态不会被激活，而是需要显式地触发；任务事件可用作同步和信号。

它们类似于一次性使用的 `FEvent`，可以用作其他任务的前置条件或后继任务。

### 启动并拦截任务执行
可以将任务事件用作任务的前置条件。初始状态下，事件处于未激发状态（即尚未完成），这意味着该任务存在未决的依赖项。在依赖关系解决之前，该任务不会被调度和执行。通过调用 `Trigger()` 触发任务事件，可以将其切换为激发状态。
```cpp
FTaskEvent Event{ UE_SOURCE_LOCATION };
FTask Task = Launch(UE_SOURCE_LOCATION, []{}, Event);
Event.Trigger();
```

### 合并任务
合并任务依赖于 `TaskA` 和 `TaskB`。等待该合并任务完成即意味着等待它的所有依赖项完成，而无需对每个依赖项进行单独的等待调用。

这里的合并任务，本质是合并条件，而非合并任务的具体内容，合并多个任务便于统一等待、统一依赖关系。

```cpp
FTask TaskA = Launch(UE_SOURCE_LOCATION, []{});
FTask TaskB = Launch(UE_SOURCE_LOCATION, []{});
FTaskEvent Joiner{ UE_SOURCE_LOCATION };
Joiner.AddPrerequisites(Prerequisites(TaskA, TaskB));
Joiner.Trigger();
...
Joiner.Wait();
```

### 在任务执行中途暂停并等待事件
通常来说，出于性能和可扩展性的考虑，在任务执行中途进行等待并不是一个好主意。如果你发现自己处于这种境地，建议尽可能考虑使用前置条件重新设计。
```cpp
FTaskEvent Event{ UE_SOURCE_LOCATION };
FTask Task = Launch(UE_SOURCE_LOCATION,
    [&Event]
    {
        ...
        Event.Wait();
        ...
    });
...
Event.Trigger();
```

### 手动显式标记任务完成
执行一个任务，但不让其在执行体结束时自动标记为已完成。相反，通过使用 `AddNested(Event)` 将事件嵌套其中，可以在后续合适的时候再通过调用 `Event.Trigger()` 来显式地将其标记为“已完成”。
```cpp
FTaskEvent Event{ UE_SOURCE_LOCATION };
FTask Task = Launch(UE_SOURCE_LOCATION,
    [&Event]
    {
        AddNested(Event);
    });
...
Event.Trigger();
```
