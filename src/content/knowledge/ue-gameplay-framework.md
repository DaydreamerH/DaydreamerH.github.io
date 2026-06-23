---
title: "Gameplay Framework 基础"
description: "掌握 GameMode、GameState、PlayerController、Pawn、Character 等核心类的职责边界。"
category: "gameplay"
track: "UE Gameplay Programmer"
level: "foundation"
status: "ready"
minutes: 45
order: 20
prerequisites: ["UE C++ 反射系统", "Actor 生命周期"]
tags: ["GameMode", "PlayerController", "Pawn", "Character"]
---

## 为什么重要

Gameplay Framework 决定了一个 UE 项目的玩法代码放在哪里。职责划分清楚，后续做输入、角色、AI、UI、多人同步都会更稳定。

## 需要掌握

- `GameMode` 只存在于服务器侧，适合放规则和生成逻辑。
- `GameState` 保存所有玩家都需要知道的对局状态。
- `PlayerController` 表示玩家意图和本地控制。
- `Pawn` 是可被控制的实体，`Character` 在此基础上提供移动组件。
- `PlayerState` 保存玩家身份、分数等跨 Pawn 的信息。

## 实践任务

搭建一个第三人称样例关卡：自定义 `GameMode`、`PlayerController` 和 `Character`，实现移动、跳跃、冲刺和一个简单交互物。

## 面试追问

1. 为什么多人游戏中不要把全局规则放进 `PlayerController`？
2. `Pawn` 和 `Character` 的主要区别是什么？
3. `GameMode` 与 `GameState` 的复制行为有什么不同？
