---
title: "Unreal UFunctions"
description: "UFunctions 介绍"
date: "2026-04-25 15:14:16"
category: "Unreal / Gameplay"
originalCategory: "UE Gameplay LAB"
track: "Game Development"
level: foundation
status: ready
published: true
minutes: 5
order: 1000
prerequisites: []
tags: ["UE", "C++"]
photos: "banner.png"
source: "_posts"
---## UFunction 声明
`UFUNCTION` 是用以告诉引擎该函数被反射系统识别和管理的宏。
```
UFUNCTION([说明符1, 说明符2...], [meta(键1="值1", ...)])
ReturnType FunctionName([参数列表]);
```
其核心功能与用途如下：
- 蓝图暴露：可以将 C++ 函数暴露给蓝图，让开发者在不修改 C++ 代码的情况下，在蓝图中调用或拓展这些函数。
- 委托绑定：可以绑定到委托上，用于处理用户输入等操作。
- 网络回调：可以作为网络回调函数，当某个变量因网络更新而改变时，自动触发并运行自定义代码。
- 控制台命令：可以创建自定义的控制台命令。
- 编辑器拓展：可以在观其编辑器中为游戏对象添加具有自定义功能的按钮。

## 函数说明符
### 蓝图交互相关
- `BlueprintCallable`：最常用，允许在蓝图或关卡蓝图中调用该函数。
- `BlueprintPure`：声明为纯函数，没有执行引脚，不会修改对象状态，通常用于获取数据。
  - 注意：纯函数不缓存结果，不建议在其中执行复杂计算或输出数组。
- `BlueprintImplementableEvent`：在 C++ 中声明，但在蓝图中实现。
- `BlueprintNativeEvent`：设计为在蓝图中重写，但在 C++ 中有默认实现。
  - C++ 实现需写在 `FunctionName_Implementation` 中。
- `BlueprintAuthorityOnly`：仅在具有网络权限时才会在蓝图中执行。
- `BlueprintCosmetic`：表现型函数，不会在 dedicated server 上运行。

### 网络与 RPC 相关
- `Server`：在客户端调用，在服务器执行。需实现 `_Implementation`。
- `Client`：在服务器调用，在拥有该对象的客户端执行。需实现 `_Implementation`。
- `NetMulticast`：在服务器调用，在服务器和所有客户端执行。
- `Reliable` / `Unreliable`：配合 `Server` 或 `Client` 使用。前者保证到达（即使网络拥塞），后者可能因带宽限制丢包。
- `WithValidation`：为 RPC 添加验证逻辑。需实现 `_Validate`，返回 `false` 则终止调用并可能断开恶意客户端。

### 编辑器与开发工具
- `CallInEditor`：在编辑器选中实例时，在细节面板生成一个按钮来触发此函数。
- `Category`：定义函数在蓝图右键菜单中的分类层级（如 "MyProject|Combat"）。
- `Exec`：允许通过游戏内控制台（Console）直接输入函数名执行。

### 其他特殊说明符
- `SealedEvent`：防止该事件在子类中被重写。
- `CustomThunk`：由开发者手动编写转换函数，而不是由 `UnrealHeaderTool` 自动生成。

### 参数说明符
- `Out`：将参数声明为引用传递。
  - 允许函数在内部修改该参数的值，并将修改后的结果传回给调用者。在蓝图中，这类参数通常表现为右侧的输出引脚。
- `Optinal`：允许调用者在调用函数时省略该参数，为调用提供便利。
