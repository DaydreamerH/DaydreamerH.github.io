---
title: "Unreal Delegates"
description: "委托介绍"
date: "2026-04-26 15:39:28"
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
---
委托提供了一种通用且类型安全的方式来调用 C++ 对象的成员函数；它允许你将一个函数绑定到特定对象上，并在未来某个时刻调用，哪怕调用者并不知道该对象的具体类型。

委托支持拷贝，但不推荐传递值，应该选择传递引用。

委托具有三种类型：
- Single：只能绑定一个函数，
- Multicast：可以绑定多个函数并一次触发。
- Dynamic：与 `UObject` 集成，支持序列化。

## 声明委托
### 声明宏
UE 通过一系列预定义的宏来声明委托；需要根据目标函数的签名来选择合适的宏：
- 无返回值：`DECLARE_DELEGATE`.
- 有返回值：`DECLARE_DELEGATE_RetVal`.
- 参数数量：宏的后缀决定了参数数量， `_OneParam`，`_TwoParams`等。

### 支持的特性
- 返回值：支持带返回值的函数。
- `const` 函数：支持绑定到 `const` 成员函数。
- `Payload`：支持最多四个负载遍历。
- 参数限制：函数签名最多支持 8 个参数。

### 宏的变体
依据委托的类型，宏的前缀会有所不同：
- `DECLARE_MULTICAST_DELEGATE...`：多播委托。
- `DECLARE_DYNAMIC_DELEGATE...`：动态委托，以支持蓝图。
- `DECLARE_DYNAMIC_MULTICAST_DELEGATE...`：动态多播委托，最常用于蓝图事件。

### 修饰符
委托可以使用类似 `UFUNCTION` 的修饰符，但要卸载 `UDELEGATE` 宏里。
```
UDELEGATE(BlueprintAuthorityOnly)
DECLARE_DYNAMIC_MULTICAST_DELEGATE_FourParams(FInstigatedAnyDamageSignature, float, Damage, const UDamageType*, DamageType, AActor*, DamagedActor, AActor*, DamageCauser);
```

### 声明位置
委托能够在全局作用域、命名空间内、类声明内声明，但不能在函数体内声明。

## 绑定委托
委托系统能够识别不同类型的对象，并提供相应的安全机制：如果你将委托绑定到 `UObject` 或共享指针类，系统会保留一个弱引用。这意味着对象如果被销毁，委托能感知到，可以使用 `IsBound()` 或者 `ExecuteIfBound` 安全地处理。

绑定函数如下：
- `BindStatic`：绑定全局静态函数。
- `BindRaw`：绑定原始 C++ 指针；这并不安全，因为没有引用计数，对象删了再调用会崩溃。
- `BindLambda`：绑定 Lambda 表达式。
- `BindSP`：绑定基于共享指针的对象成员函数（自动弱引用）。
- `BindUObject`：绑定 `UObject` 成员函数（自动弱引用，最常用）。
- `UnBind`：解绑。

### Payload Data
在调用 `Bind` 时传入额外的参数，这些参数会存储在委托内部；当委托被触发时，这些预存的参数会自动传给目标函数。

除了 Dynamic 委托外，所有委托类型都支持负载数据。

目标函数的参数列表中，负载参数必须排在委托自定的参数之后。

```
MyDelegate.BindRaw( &MyFunction, true, 20 );
```

## 执行委托
### 执行函数
- `Execute`：直接执行委托。
  - 他不检查委托是否已经绑定，如果对未绑定的委托调用此函数，可能会导致崩溃或内存错误。
- `ExecuteIfBound`：先检查后执行。这对于无返回值的委托非常方便且安全。
- `IsBound`：手动检查委托是否已经绑定。

在执行委托前，必须读入其已经绑定；如果委托有返回值或输出参数，执行未绑定的委托可能会访问未初始化的内存，甚至在某些情况下修改内存；即使使用 `ExecuteIfBound` ，也要注意输出参数。


## 动态委托
### 声明动态委托
动态委托的声明方式与标准委托基本一致。

必须使用动态委托专属的宏变体，主要包括：
- `DECLARE_DYNAMIC_DELEGATE`：用于创建动态单播委托。
- `DECLARE_DYNAMIC_MULTICAST_DELEGATE`：用于创建动态多播委托。

这些宏同样支持返回值（`_RetVal`）和多个参数（`_OneParam` 等）的组合。

### 绑定动态委托
- `BindDynamic(UserObject, FuncName)`：用于动态单播委托，将一个 `UObject` 的成员函数绑定到委托上。它会自动将函数名转换为字符串。
- `AddDynamic(UserObject, FuncName)`：用于动态多播委托，向多播列表中添加一个绑定。
- `RemoveDynamic(UserObject, FuncName)`：用于动态多播委托，从多播列表中移除之前添加的绑定。

## 多播委托
多播委托拥有单播委托的大部分功能，例如对对象的弱引用，支持在结构体中使用，易于拷贝等。

但是多播委托不能有返回值，因为它同时处理多个函数，无法统一处理多个返回值。

### 声明多播委托
必须使用多播委托专属的宏变体，主要包括：
- `DECLARE_MULTICAST_DELEGATE`：用于创建标准的多播委托。
- `DECLARE_DYNAMIC_MULTICAST_DELEGATE`：用于创建动态多播委托。

### 绑定多播委托
| 函数 | 描述 | 安全性/备注 |
| :--- | :--- | :--- |
| Add() | 向调用列表中添加一个已有的委托对象。 | - |
| AddStatic() | 绑定全局静态函数。 | - |
| AddRaw() | 绑定原始 C++ 指针成员函数。 | 不安全：无引用计数，对象销毁后调用会崩溃。 |
| AddLambda() | 绑定 Lambda 表达式（匿名函数）。 | 通常用于不捕获指针的简单逻辑。 |
| AddSPLambda() | 绑定 Lambda，仅在指定的共享指针有效时执行。 | 自动弱引用检查。 |
| AddWeakLambda() | 绑定 Lambda，仅在指定的 UObject 有效时执行。 | 自动弱引用检查。 |
| AddSP() | 绑定基于共享指针的成员函数。 | 推荐：保留弱引用，对象销毁后自动失效。 |
| AddUObject() | 绑定 UObject 成员函数。 | 推荐：保留弱引用，最常用的绑定方式。 |
| Remove() | 从调用列表中移除特定的函数。 | 性能为 O(N)，且可能打乱剩余委托的顺序。 |
| RemoveAll() | 移除所有绑定到指定对象的函数。 | 常用在对象析构时清理所有相关绑定。 |

### 执行多播委托
多播委托通过调用 `Broadcast()` 函数来一次性触发所有绑定的函数。

即使没有任何函数绑定，调用 `Broadcast()` 也是绝对安全的，不会崩溃。

绑定函数的执行顺序是未定义的。也就是说，它们不一定按照你添加的顺序执行。
