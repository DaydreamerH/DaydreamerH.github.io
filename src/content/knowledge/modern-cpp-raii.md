---
title: "现代 C++ 与 RAII"
description: "用资源获取即初始化的思路管理内存、文件句柄、锁和临时对象，减少生命周期错误。"
category: "cpp"
track: "UE Gameplay Programmer"
level: "foundation"
status: "ready"
minutes: 30
order: 5
prerequisites: ["C++ 类", "构造与析构"]
tags: ["RAII", "smart pointer", "lifetime", "C++"]
---

## 为什么重要

游戏项目对稳定性和性能都敏感。RAII 可以让资源随着对象生命周期自动释放，是写可靠 C++ 的基本习惯。

## 需要掌握

- 构造函数获取资源，析构函数释放资源。
- `std::unique_ptr` 表示独占所有权。
- `std::shared_ptr` 表示共享所有权，但要警惕循环引用。
- UE 中也有自己的智能指针体系，例如 `TUniquePtr`、`TSharedPtr`、`TWeakPtr`。

## 实践任务

写一个小型资源管理类，负责打开文件、写入日志并在析构时关闭文件。然后解释为什么异常或提前返回时仍然安全。

## 面试追问

1. RAII 和手动 `new/delete` 相比解决了什么问题？
2. `unique_ptr` 为什么不能拷贝？
3. UE 的 `UObject` 生命周期为什么不能简单等同于 `shared_ptr`？
