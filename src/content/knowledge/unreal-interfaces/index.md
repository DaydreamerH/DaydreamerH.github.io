---
title: "Unreal Interfaces"
description: "UE 接口介绍"
date: "2026-04-24 13:17:00"
category: "Unreal / Gameplay"
originalCategory: "UE Gameplay LAB"
track: "Game Development"
level: intermediate
status: ready
published: true
minutes: 7
order: 1000
prerequisites: []
tags: ["UE", "C++"]
photos: "banner.png"
source: "_posts"
---当一个类继承自某个接口时，接口会确保该类实现一组共同的函数；接口非常适合用于哪些逻辑上需要相同功能，但在继承体系上完全不同的复杂类。

## 声明接口
在 C++ 中声明接口与声明普通的虚幻类相似，但存在一些区别：
- 接口类使用 `UINTERFACE` 宏，而不是 `UCLASS` 宏。
- 接口类继承自 `UInterface`，而不是 `UObject`.

事实上，`UINTERFACE` 并不是真正的接口，而是一个为反射系统提供可见性的空类。

C++ 接口声明实例如下：
```
#pragma once

#include "CoreMinimal.h"
#include "UObject/Interface.h"
#include "ReactToTriggerInterface.generated.h"

/*
此类不需要修改。
它是为反射系统提供可见性的空类。
使用 UINTERFACE 宏。
继承自 UInterface。
*/
UINTERFACE(MinimalAPI, Blueprintable)
class UReactToTriggerInterface : public UInterface
{
    GENERATED_BODY()
};

/* 真正的接口声明 */
class IReactToTriggerInterface
{
    GENERATED_BODY()

    // 在此类中添加接口函数。这是其他类为了实现该接口而需要继承的类。
public:
    // 在此处添加接口函数声明
};
```

真正的接口与空类同名，但 U 前缀被替换为了 I.
- U 前缀类：不需要构造函数或任何其他函数。
- I 前缀类：包含所有接口函数。

如果希望通过蓝图实现此接口，则必须有 `Blueprintable` 修饰符。

## 接口修饰符
使用接口修饰符，可以将类暴露给 UE 的反射系统。

- `Blueprintable`
  - 将此接口公开，使其可以由蓝图实现。
  - 如果接口包含除 `BlueprintImplementableEvent` 和 `BlueprintNativeEvent` 以外的任何函数，这些函数无法被公开给蓝图；如果包含了纯虚函数，将破坏这个接口的蓝图可实现性。
  - 使用 `NotBlueprintable` 或者 `meta=(CannotImplementInterfaceInBlueprint)` 可以明确该接口在蓝图中实现是不安全的。
- `BlueprintType`
  - 将此类公开为一种类型，以便在蓝图中作为变量类型使用。
- `DependsOn=(ClassName1, ClassName2, ...)`
  - 在构建系统编译此类之前，会先编译修饰符列出的所有类。
  - `ClassName` 必须指定同一包中的类。
- `MinimalAPI`
  - 仅导出该类的类型信息，供其他模块使用。
  - 该类可以被类型转换，但不能调用其函数。

## 实现接口
1. 包含接口的头文件。
2. 继承以 I 为前缀的接口类

## 声明接口函数
在接口中有多种方法声明函数，每种方法都可以在不同的上下文中实现或调用；但是所有函数必须在接口的 I 前缀类中声明，并且必须设为 `public` 才能对外部类可见。

### 仅限 C++ 的接口函数
在接口的头文件中声明一个虚 C++ 函数，且不使用 `UFUNCTION` 修饰符。这些函数必须是虚函数，以便在实现该接口的类中进行重写。

```
#pragma once

#include "ReactToTriggerInterface.generated.h"

/*
为反射系统提供可见性的空类。
使用 UINTERFACE 宏。
继承自 UInterface。
*/
UINTERFACE(MinimalAPI, Blueprintable)
class UReactToTriggerInterface : public UInterface
{
    GENERATED_BODY()
};

class IReactToTriggerInterface
{
    GENERATED_BODY()

public:
    // 声明一个虚函数
    virtual bool ReactToTrigger();
};
```

你可以在接口头文件、接口的 `.cpp` 中提供默认实现；也可以在派生类中实现该接口，可以创建实现针对该类的特定重写。

这种声明的 C++ 接口函数对蓝图不可见，且不能在标记为 `Blueprintable` 的接口中使用。

### 蓝图可调用的接口函数
要创建一个蓝图可调用的接口函数，必须执行以下操作：
1. 在函数声明中使用 `UFUNCTION` 宏，并添加 `BlueprintCallable` 修饰符。
2. 使用 `BlueprintImplementableEvent` 或 `BlueprintNativeEvent` 修饰符之一。
3. 蓝图可调用的接口函数不能是虚函数。

带有 `BlueprintCallable` 修饰符的函数可以在 C++ 或蓝图中通过指向实现该接口的对象的引用来调用。

注意，如果蓝图可调用的函数没有返回值，虚幻引擎会在蓝图中将其视为一个事件。

#### 蓝图实现事件
带有 `BlueprintImplementableEvent` 修饰符的函数不能在 C++ 中重写，但可以在任何实现或继承了该接口的蓝图类中重写。

```
#pragma once

#include "ReactToTriggerInterface.generated.h"

// ... (UINTERFACE 部分省略)

class IReactToTriggerInterface
{
    GENERATED_BODY()

public:
    /** 只能在蓝图中实现的事件 */
    UFUNCTION(BlueprintCallable, BlueprintImplementableEvent)
    bool ReactToTrigger();
};
```

#### 蓝图原生事件
带有 `BlueprintNativeEvent` 修饰符的函数可以在 C++ 中是实现，也可以在蓝图中实现。
```
#pragma once

#include "ReactToTriggerInterface.generated.h"

// ... (UINTERFACE 部分省略)

class IReactToTriggerInterface
{
    GENERATED_BODY()

public:
    /** 可以在 C++ 或蓝图中实现的事件 */
    UFUNCTION(BlueprintCallable, BlueprintNativeEvent)
    bool ReactToTrigger();
};
```

但是，对于 `BlueprintNativeEvent`，在 C++ 中实现时，需要定义一个 `FunctionName_Implementation` 的函数。

此外，若要在 C++ 安全地调用蓝图接口上的 `BlueprintImplementableEvent` 或 `BlueprintNativeEvent`，必须使用特殊的静态 `Execute_` 函数包装器。
```
bool bReacted = IReactToTriggerInterface::Execute_ReactToTrigger(OriginalObject);
```

## 接口函数类型
虚幻的接口函数分为三种形式：
- Base：基础接口类
  - 供子类实现的函数定义。
  - 仅当接口及其实现都在 C++ 中定义时使用。
- Implementation wrapper：实现接口的 C++ 类。
  - 在 C++ 中编写具体的接口逻辑。
  - 仅调用 C++ 端的实现，不会触发任何蓝图重写。
- Execute wrapper：由反射系统自动生成。
  - 促进 C++ 实现与蓝图实现之间的通信。
  - 调用包括 C++ 和蓝图重写在内的所有实现。

假设：
1. `MyFunction` 是在 `MyInterface.h` 中定义的 `BlueprintNativeEvent` 接口函数。
2. `MyInterfaceActor` 实现了该接口。
3. 在 `MyInterfaceActor.cpp` 中定义了 `MyFunction_Implementation`.
4. 有一系列继承自 `MyInterfaceActor` 的 C++ 类或蓝图类。

为了安全地调用所有继承该类的对象的 `MyFunction`，应该使用 `Execute_` 包装器。

也就是说，如果接口在蓝图中有可能被重写，不要直接调用 `MyFunction`，始终使用 `IMyInterface::Execute_MyFunction(ObjectPtr)`.

但如果这是一个虚函数，直接使用效率会更高。

## 判断一个类是否实现了某个接口
为了同时兼容实现接口的 C++ 类和蓝图类，可以使用以下方法判断：

```
bool bIsImplemented;

/* 方法 1：通过类信息判断。如果 OriginalObject 实现了 UReactToTriggerInterface，则返回 true */
bIsImplemented = OriginalObject->GetClass()->ImplementsInterface(UReactToTriggerInterface::StaticClass());

/* 方法 2：使用模板函数判断（推荐）。如果 OriginalObject 实现了 UReactToTriggerInterface，则返回 true */
bIsImplemented = OriginalObject->Implements<UReactToTriggerInterface>();

/* 方法 3：尝试类型转换。如果 OriginalObject 在 C++ 中实现了该接口，则 ReactingObject 不为空 */
IReactToTriggerInterface* ReactingObject = Cast<IReactToTriggerInterface>(OriginalObject);
```

需要注意：
1. `Cast<IInterface>` 具有局限性：
   - 模板化 `Cast<>` 方法仅适用于在 C++ 中实现接口的类。
   - 如果一个接口是在蓝图中实现的，那么在 C++ 层面该对象并不真正继承自 I 前缀的类，因此会返回 `nullptr`.
2. 在 C++ 代码中，可以使用 `TScriptInterface<>` 安全地存储接口指针及其对应的 `UObject`；它能痛楚实例 C++ 和蓝图实现的接口引用。
3. 建议统一使用 `Implements<UInterface>` 或 `ImplementsInterface()` 来判断一个对象是否实现了接口。

## 接口与其他类型之间的转换
UE 的转换系统支持从一个接口转换为另一个接口，或者在合适的情况下从接口转换为其他虚幻类型。

```
/* 1. 将对象转换为接口：如果 OriginalObject 实现了该接口，则 ReactingObject 不为空 */
IReactToTriggerInterface* ReactingObject = Cast<IReactToTriggerInterface>(OriginalObject);

/* 2. 接口转接口：如果 ReactingObject 不为空，且该对象同时实现了 ISomeOtherInterface，则转换成功 */
ISomeOtherInterface* DifferentInterface = Cast<ISomeOtherInterface>(ReactingObject);

/* 3. 接口转类：如果 ReactingObject 不为空，且原始对象是 AActor 或其派生类，则 ReactingActor 不为空 */
AActor* ReactingActor = Cast<AActor>(ReactingObject);
```

- 接口间转换：UE 支持接口间的横向转换，如果持有一个接口指针，可以尝试将其转为该对象实现的另一个接口，不需要先转回 `UObject`.
- 从接口找回 `Actor` 或 `Object`：拥有接口指针时，如果需要访问该对象的物理位置、组件或其他属性，可以直接将其 `Cast<AActor>`.

这些 `Cast` 操作都需要在 C++ 中实现接口；如果仅在蓝图中实现接口，这些转换会失败。

## 安全地存储接口指针
若要存储一个实现了特定接口的对象引用，可以使用 `TScriptInterface`.

```
UMyObject* MyObjectPtr;
TScriptInterface<IMyInterface> MyScriptInterface;

// 检查对象是否实现了该接口
if (MyObjectPtr->Implements<UMyInterface>())
{
    // 初始化 TScriptInterface
    MyScriptInterface = TScriptInterface<IMyInterface>(MyObjectPtr);
}

// 此时 MyScriptInterface 同时持有 MyObjectPtr（对象指针）和 MyInterfacePtr（接口指针）的引用
```

若拥有了接口指针：
- 获取原始对象指针：`UMyObject* MyRetrievedObjectPtr = MyScriptInterface.GetObject();`
- 获取接口指针：`IMyInterface* MyRetrievedInterfacePtr = MyScriptInterface.GetInterface();`

`TScriptInterface` 本身只是一个包含两个指针（UObject* 和 IInterface*）的结构体，从它获取指针的操作（`GetObject()` 或 `GetInterface()`）几乎是瞬间完成的，没有任何性能负担。

## 蓝图可实现的接口
如果希望蓝图能够实现某个接口，必须使用 `Blueprintable` 元数据修饰符。
- 函数限制：除了静态函数外，接口中的每个函数都必须声明为 `BlueprintNativeEvent` 或 `BlueprintImplementableEvent`。
- 底层行为：当蓝图实现一个在 C++ 中声明的接口时，它的行为类似于“蓝图接口资产”（Blueprint Interface Asset）。
- 该蓝图类的实例实际上并不包含该接口的 C++ 版本。

在 C++ 中不能使用 `Cast` 获取接口指针；并且只能使用 `Execute_` 静态包装函数触发蓝图逻辑。

`Execute_` 静态包装函数会通过反射系统（`ProcessEvent`）发起调用。由于蓝图类是 C++ 类的派生类，反射系统会优先执行蓝图中的重写版本；若蓝图未重写，则回退到 C++ 的 `_Implementation` 默认实现。这种机制确保了无论接口是在哪一层实现的，都能被正确调用。

## 实验
你可以使用 UEGameplayLAB 中的 `BP_TestActor` 来观察接口相关特性。

输出如下：
```
LogTemp: Warning: ===== Trigger Activated =====
LogTemp: Warning: ===== Step1: Spawn Actors =====
LogTemp: Warning: Spawned: BP_DoorActor_C_0
LogTemp: Warning: Spawned: BP_LightActor_C_0
LogTemp: Warning: Spawned: BP_BPImplActor_C_0
LogTemp: Warning: ===== Step2: Collect Interfaces =====
LogTemp: Warning: Implements Interface: BP_DoorActor_C_0
LogTemp: Warning: Implements Interface: BP_LightActor_C_0
LogTemp: Warning: Implements Interface: BP_BPImplActor_C_0
LogTemp: Warning: ===== Step3: Test Interfaces =====
LogTemp: Warning: ---- Testing: BP_DoorActor_C_0 ----
LogTemp: Warning: [Execute_] Calling...
LogTemp: Warning: Door Opened (C++)
LogTemp: Warning: [InterfacePtr] Valid (C++ case)
LogTemp: Warning: Door CPP Only Reaction
LogTemp: Warning: ---- Testing: BP_LightActor_C_0 ----
LogTemp: Warning: [Execute_] Calling...
LogTemp: Warning: Light Turned ON (C++)
LogTemp: Warning: [InterfacePtr] Valid (C++ case)
LogTemp: Warning: Default CPP Only Function
LogTemp: Warning: ---- Testing: BP_BPImplActor_C_0 ----
LogTemp: Warning: [Execute_] Calling...
LogBlueprintUserMessages: [BP_BPImplActor_C_0] BIImplActor Activated
LogTemp: Warning: [InterfacePtr] NULL (Blueprint case)
```

值得注意的是，为了避免蓝图 Actor 被过滤，在检查 `TScriptInterface<IReactToTriggerInterface>` 不直接使用 `bool` 判断，因为该类型的布尔运算符重载检查的是接口指针而非对象：
```
FORCEINLINE explicit operator bool() const
{
    return GetInterface() != nullptr;
}
```
