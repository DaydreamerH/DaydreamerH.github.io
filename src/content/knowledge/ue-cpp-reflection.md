---
title: "UE C++ 反射系统"
description: "理解 UCLASS、UPROPERTY、UFUNCTION 如何把 C++ 类型暴露给编辑器、蓝图、序列化和 GC。"
category: "ue-core"
track: "UE Gameplay Programmer"
level: "foundation"
status: "ready"
minutes: 35
order: 10
prerequisites: ["C++ 类与指针", "UE 模块基础"]
tags: ["UObject", "Reflection", "GC", "Blueprint"]
---

## 为什么重要

UE 的 C++ 不是普通 C++ 的直接使用方式。反射宏让引擎能识别类、属性和函数，并把它们接入编辑器、蓝图、序列化、网络同步和垃圾回收。

## 需要掌握

- `UCLASS`、`USTRUCT`、`UENUM` 的用途。
- `UPROPERTY` 对对象生命周期和 GC 的影响。
- `UFUNCTION` 如何暴露给蓝图和网络 RPC。
- 什么时候使用 `UObject`、`AActor`、`UActorComponent`。

## 实践任务

创建一个 `UActorComponent`，包含一个可在编辑器调整的生命值属性，并暴露一个蓝图可调用的扣血函数。

## 面试追问

1. 为什么 UE 对 `UObject*` 成员通常需要 `UPROPERTY`？
2. `UObject` 和普通 C++ 对象的生命周期管理有什么区别？
3. `BlueprintCallable` 和 `BlueprintImplementableEvent` 适合什么场景？
