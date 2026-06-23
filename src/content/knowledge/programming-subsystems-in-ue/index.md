---
title: "Programming Subsystems In UE"
description: "子系统介绍"
date: "2026-05-28 13:42:29"
category: "Unreal / Gameplay"
originalCategory: "UE Gameplay LAB"
track: "Game Development"
level: advanced
status: ready
published: true
minutes: 5
order: 1000
prerequisites: []
tags: ["UE", "C++"]
photos: "banner.png"
source: "_posts"
---
UE 中的 Subsystems 是具有托管生命周期的自动实例化类。这些类提供了易于使用的拓展点，使程序员能够立即获得蓝图和 Python 暴露，避免了修改或重写引擎类。

目前支持的子系统生命周期包括：
- `UEngineSubsystems`
- `UEditorSubsystems`
- `UGameInstanceSubsystems`
- `ULocalPlayerSubsystems`

例如，创建一个继承子系统的类：
```
class UMyGamesSubsystem : public UGameInstanceSubsystem
```

1. 在 `UGameInstance` 创建后，也会创建一个名为 `UMyGamesSubsystems` 的实例。
2. 当 `UGameInstance` 初始化后，子系统的 `Initialize` 将被调用。
3. 当 `UGameInstance` 关闭时，子系统的 `Deinitialize` 将被调用。

## 子系统的好处
- 节省编程时间。
- 避免重写引擎类。
- 避免类过于臃肿：子系统可以防止在已经非常繁忙的类中添加过多的 API.
- 蓝图友好：子系统通过用户友好的类型化节点，使蓝图能够轻松访问相关功能。
- 支持 Python 脚本：子系统允许通过 Python 脚本进行编辑器脚本编写或编写测试代码。
- 模块化与一致性：子系统位代码块提供了良好的模块化和编码一致性。
- 插件开发：子系统在创建插件时特别有用。你不需要额外说明如何配置代码来使插件允许。用户只需要将插件添加到游戏中，而插件开发者可以确切地知道插件何时会被实例化和初始化。

## 使用蓝图访问子系统
子系统会自动暴露给蓝图，并提供能够理解上下文且不需要进行类型转换的智能节点。

开发者可以通过 `UFUNCTION()` 标记和规则来控制哪些 API 对蓝图可见。

## 子系统生命周期
### Engine 子系统
```
class UMyEngineSubsystem : public UEngineSubsystem { ... };
```

当 Engine 子系统所属的模块加载时，子系统将在模块的 `Startup()` 函数返回后执行 `Initialize()`；在模块的 `Shutdown()` 函数返回后执行 `Deinitialize()`.

这些子系统通过 `GEngine` 访问：
```
UMyEngineSubsystem* MySubsystem = GEngine->GetEngineSubsystem<UMyEngineSubsystem>();
```

### Editor 子系统
```
class UMyEditorSubsystem : public UEditorSubsystem { ... };
```

当 Editor 子系统所属的模块加载时，子系统将在模块的 `Startup()` 函数返回后将执行 `Initialize()`；在模块的 `Shutdown()` 函数返回后执行 `Deinitialize()`。
这些子系统通过 `GEditor` 访问，如下所示：
```
UMyEditorSubsystem* MySubsystem = GEditor->GetEditorSubsystem<UMyEditorSubsystem>();
```

### GameInstance 子系统
```
class UMyGameSubsystem : public UGameInstanceSubsystem { ... };
```
这些子系统可以通过 `UGameInstance` 访问，如下所示：
```
UGameInstance* GameInstance = ...;
UMyGameSubsystem* MySubsystem = GameInstance->GetSubsystem<UMyGameSubsystem>();
```
