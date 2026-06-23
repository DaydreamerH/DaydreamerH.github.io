---
title: "UStruct and TSubclassOf in Unreal Engine"
description: "UStruct TSubclassOf 介绍"
date: "2026-04-23 15:59:29"
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
## `UStruct`
`UStruct` 是对标准 C++ 结构体的增强，使其能被虚幻的反射系统识别。

它比 `UObject` 更轻量，创建速度更快。

它可以使用 `UPROPERTY` ，但 `UStruct` 不由虚幻的 GC 系统管理生命周期，结构体内也不能定义 `UFUNCTION()`.

### 创建
1. 在 C++ 头文件中定义结构体。
2. 在结构体定义的最上方加上 `USTRUCT`.
3. 在结构体内部的第一行加上 `GENERATED_BODY()`.
4. 在虚幻中，结构体通常以大写字母 F 开头。

```
USTRUCT(BlueprintType) // 允许这个结构体在蓝图中使用
struct FMyUserStruct
{
    GENERATED_BODY()

    // 使用 UPROPERTY 宏让变量在编辑器或蓝图中可见
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Stats")
    int32 Health;
};
```

### 结构体说明符
- `BlueprintType`：将该结构体暴露给蓝图系统。
  - 能在蓝图类中创建一个该结构体类型的变量。
  - 能在蓝图图表里拆建或构建它。
- `Atomic`：指明该结构体在序列化时必须作为一个整体处理。
  - 通常用于某些特殊的数据结构，确保数据在传输或保存过程中不会被拆分。
  - 暗示引擎不要为该结构体生成过多的自动代码，仅将其视为一个简单的元数据容器。
- `NoExport`：UHT 不要为这个类生成自动化的 C++ 代码。
  - 编译器只会解析这个头文件里的元数据，而不会取生成对应的胶水代码。

### 使用建议
如果在结构体中定义了一个指向 `UObject` 的指针，只要给这个变量加上了 `UPROPERTY()` 宏，虚幻的 GC 就会追踪他。

结构体最适合用于简单的数据类型；如果数据需要进行复杂的交互，拥有复杂的生命周期或者需要处理极其复杂的逻辑，应该考虑使用 `UObject` 或者 `AActor`，而不是写在结构体里。

`UStruct` 本身不支持网络复制，但如果这个结构体时某个 Actor 的成员，该成员标记了该变量 `UPROPERTY(Replicated)`，那么结构体里的变量是可以被同步的；也就是说同步是基于属性而非结构体类型的。

当结构体带有 `BlueprintType` 标签时，引擎会自动生成该结构体的 `Make` 蓝图节点，可以把多个散装变量打包成一个结构体。

当结构体中至少有一个成员标记为 `BlueprintReadOnly` 或 `BlueprintReadWrite`，引擎会自动生成该结构体的 `Break` 节点，把结构体的内部属性暴露出来。


## `TSubclassOf`
`TSubclassOf` 就是一个带约束的类类型选择器；如果想让开发者在编辑器里选择一个类，而不是具体的实例就会用到它。

如果直接使用 `UClass*`，这意味着蓝图可以配置任何类；但如果使用 `TSubclassOf<UObject>`，就是说只能填写 `UObject` 或者它的子类。

当然，我们也可以在 C++ 中赋予 `TSubclassOf`.
```
UClass* ClassA = UDamageType::StaticClass();
TSubclassOf<UDamageType> ClassB;
ClassB = ClassA; // Performs a runtime check
TSubclassOf<UDamageType_Lava> ClassC;
ClassB = ClassC; // Performs a compile time check
```

- 当一个通用的 `UClass` 指针付给 `TSubclassOf<T>` 时，编译器无法提前知道这个指针里到底装的什么，因此必须等到程序运行时检查。
- `TSubclassOf<T>` 之间的赋值只有在类型不同时才体现编译期约束；相同类型之间只是普通赋值，不涉及额外检查。
