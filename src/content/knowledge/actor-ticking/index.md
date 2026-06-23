---
title: "Actor Ticking"
description: "Tick 组与 Tick 依赖"
date: "2026-04-28 20:58:11"
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
---## Ticking
Tick 是指在 Actor 或组件上定期执行的一段代码或蓝图脚本，通常是每帧执行一次。

Tick 组和 Tick 依赖是开发者用来精确控制每帧逻辑执行顺序的工具，对于保证游戏逻辑的正确性和物理表现的稳定性至关重要。

### Tick Groups
Tick 组决定了 Actor 或组件在每一帧中相对于引擎其他处理过程的执行先后顺序：引擎会按顺序处理这些组。只有当前 Tick 组内所有的 Actor 和组件都完成了 Tick，引擎才会开始处理下一个 Tick组。

Tick 组顺序：
1. `TG_PrePhysics`：帧的开始。
2. `TG_DuringPhysics`：开始物理模拟，处理过程中，引擎的物理数据可能随时被更新，也可能在组内所有成员 Tick 完成后更新。
3. `TG_PostPhysics`：本帧的物理模拟已经完成，引擎正在使用本帧的物理模拟。
    - 随后处理延迟动作，计时器管理，更新摄像机，更新关卡流和流式加载操作。
4. `TG_PostUpdateWork`：无特定引擎活动映射。

#### `TG_PrePhysics`
如果 `Actor` 需要与物理对象交互，或者拥有基于物理的组件，应将其放在此 Tick 组。这样，`Actor` 的移动在物理模拟开始前就已经完成，可以被物理模拟考虑进去。

该组中的物理数据是上一帧的。

#### `TG_DuringPhysics`
此组与物理模拟同时运行，因此无法确定该组内读取的物理数据是上一帧还是本帧的。物理模拟可以在该组执行期间的任意时间完成，且无法确认何时完成。

因为物理数据可能落后一帧，建议只把对物理数据不敏感或能容忍一帧误差的逻辑放在此组。例如更新库存界面或小地图显示。

#### `TG_PostPhysics`
当此组运行时，本帧的物理模拟结果已经完整可用。适合放置需要基于本帧最终物理位置进行检查的逻辑，例如武器或移动射线检测，以确保所有物理对象处于将在本帧渲染时的位置。

对于需要视觉上与武器/物体精确对齐的效果，即便一帧的延迟也很明显。

#### `TG_PostUpdateWork`
此组在 `TG_PostPhysics` 之后运行。主要用途是在粒子系统中注入最后时刻的信息。

`TG_PostPhysics` 在摄像机更新之后执行。如果某些效果依赖于摄像机的精确朝向，可将控制这些效果的 `Actor` 放在此组。

它也适用于需要在帧内所有其他逻辑之后运行的游戏逻辑，例如在同一帧内两个角色试图同时对对方产生冲突的效果。

### Tick Dependency
Tick 依赖是指个体间的依赖关系：也就是说，在同一个组内，我们也可指定某个 Actor 必须等待另一个特定的 Actor /组件完成 Tick 后再开始。

`AddTickPrerequisiteActor` 和 `AddTickPrerequisiteComponent` 函数（可用于 Actor 和 Component）会让被调用的 `Actor` 或组件在指定的另一个 `Actor` /组件完成 `Tick` 之前等待才执行 `Tick`。

对于帧内大致同时发生、但其中一个 `Actor` /组件要先准备出另一个需要的数据的情况，这非常有用。之所以用它而不是把相关对象移动到不同的 Tick 组，是因为同一组内的许多 `Actor` 可以并行更新；如果这些 `Actor` 只是分别依赖一两个其他对象，而不需要等待整个组完成再 `Tick`，就没必要把整个组迁移到新的 Tick 组。

### 示例
设想一个游戏：玩家控制一个带动画的瞄准角色（用激光点射），激光命中点会在场景上放置一个准星（reticule）Actor；当激光持续指向某类目标时，某个计量表会充能，HUD Actor 在屏幕上显示该计量表：
- 玩家角色在 `TG_PrePhysics` 中移动和播放动画。它需在物理模拟前完成移动/动画，以便物理模拟的对象能正确跟随与交互。
- HUD 可以在任意 Tick 组更新，但将其放在 `TG_DuringPhysics` 是个不错的选择：一方面 HUD 不直接依赖物理数据，另一方面也不应阻塞或被物理模拟阻塞。注意 HUD 的显示会滞后一帧（本帧瞄准的目标在计量表上会在下一帧才反映）。
- 准星 `Actor` 在 `TG_PostPhysics` 更新，这样它做射线检测时使用的是本帧物理模拟的最终结果，能够确保准星精确地出现在目标表面，并据此正确调整计量表数值。
- `TG_PostUpdateWork` 中更新激光粒子效果，使用瞄准 Actor 和准星的最终位置信息来渲染。

Tick 依赖可用来消除粒子效果对 `TG_PostUpdateWork` 的需求：把激光粒子也放到 `TG_PostPhysics`，并通过将激光的 Tick 依赖设置为准星，保证激光在准星完成 Tick 之后再更新。这样既能确保激光使用准星的正确位置，又不用等待与之无关的其它后物理组成员，效率更高。

尽管准星需要瞄准 `Actor` 先完成 Tick 才能工作，但准星无需对瞄准 `Actor` 设置 Tick 依赖，因为两者已经处在不同的 Tick 组（瞄准在 PrePhysics，准星在 PostPhysics），组的顺序本身已保证了它们的执行顺序。

## Actor Spawning
在 `BeginPlay` 中，`Actor` 会向引擎注册其主 `Tick` 及其组件的 `Tick` 函数。

可以通过 `PrimaryActorTick` 成员将 `Actor` 的 `Tick` 函数设置在特定 Tick 组运行，或完全禁用。

一般在构造函数完成这些设置：
```
PrimaryActorTick.bCanEverTick = true;
PrimaryActorTick.bTickEvenWhenPaused = true;
PrimaryActorTick.TickGroup = TG_PrePhysics;
```

## Component Tick
与 `Actor` 一样，组件也可以被分配到不同的 Tick 组。过去 `Actor` 会在它自己的 `Tick` 中一并 `Tick` 所有组件，这仍然会发生，但需要放在不同组的组件会被加入一个管理何时 Tick 的列表。给组件分配 Tick 组应使用与给 `Actor` 分配相同的标准。组件使用的 Tick 结构名不同于 `Actor`，但工作方式相同：

```
PrimaryComponentTick.bCanEverTick = true;
PrimaryComponentTick.bTickEvenWhenPaused = true;
PrimaryComponentTick.TickGroup = TG_PrePhysics;
```

## 高级 Tick 功能
默认的 `Actor` 或组件 `Tick` 函数可以在运行时分别通过 `AActor::SetActorTickEnabled` 和 `UActorComponent::SetComponentTickEnabled` 启用或禁用。此外，`Actor` 或组件可以有多个自定义 Tick 函数。实现方法是定义一个继承自 `FTickFunction` 的结构体并重写 `ExecuteTick` 和 `DiagnosticMessage` 方法。

引擎自带的默认 `Actor` /组件 Tick 结构体（`FActorTickFunction` 和 `FComponentTickFunction`）是很好的参考，位于 `EngineBaseTypes.h` 中。


将自定义 Tick 结构体添加到 `Actor` 或组件后，通常在所属类的构造函数中进行初始化。要启用并注册该 `Tick` 函数，常见做法是重写 `AActor::RegisterActorTickFunctions`，在其中调用 Tick 结构体的 `SetTickFunctionEnable`，然后使用所属 Actor 的关卡作为参数调用 `RegisterTickFunction`。这样创建的 `Actor` 或组件即可拥有多次 Tick 的能力（包括在不同 Tick 组中运行并为每个 Tick 函数设置单独依赖）。若需手动设置 Tick 依赖，可在要设为依赖的 Tick 结构体上调用 `AddPrerequisite`，并传入被依赖的 Tick 结构体作为参数。
