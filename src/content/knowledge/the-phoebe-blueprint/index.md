---
title: "The Phoebe Blueprint"
description: "英雄射击占点项目，新角色粗稿。"
date: "2026-01-16 19:53:35"
category: "Unreal / Gameplay"
originalCategory: "UE相关"
track: "Game Development"
level: advanced
status: ready
published: true
minutes: 5
order: 1000
prerequisites: []
tags: ["UE", "C++", "GAS"]
photos: "banner.png"
source: "_posts"
---
为了体现出项目代码的可拓展性，现在必须加入一个新的角色——菲比。

## 主武器
狙击枪

由于我并没有找到符合Lyra框架的狙击枪动画，不得不考虑使用第一人称动画与Lyra步枪locomotion动画混合的方式制作相关动画效果。
## 被动技能
主武器的子弹碰撞后将爆炸，对范围内的敌人造成较低伤害。

每次主武器命中敌人将积累杀人书，降低主武器爆炸半径，提高主武器基础伤害。

死亡后，杀人书计数重置；杀人书最多叠加至五层。

### GC
需要继承已有的 `ProjectileHit` 效果，并额外补充一个爆炸粒子效果。
### 子弹类
需要继承已有的 `BaseProjectile` ，并额外补充一段伤害判定。
### 延迟补偿
需要继承已有的 `LagCompensationComponent` ，并额外补充一段爆炸伤害验证。
### 属性
需要为该角色单独提供计数属性。
#### 角色类
单独补充一个书挂在角色的mesh上，并展示层数数量。

## 小技能：菲比团子
逻辑描述：两阶段施法放置自动攻击的实体。

### 4.1 施法流程
1.  Phase A (Predictive)：激活 GA，开启 `WaitTargetData` 任务，生成客户端预测的虚影位置。
2.  Phase B (Authoritative)：按下左键触发 `GameplayEvent`，服务器调用 `SpawnActor` 生成 `BP_PhoebeTuanzi`。

### 4.2 团子实体架构
- 独立 ASC：团子作为独立 Actor 挂载 `AbilitySystemComponent`。
- 自动攻击 (GA_Tuanzi_Laser)：
    - 利用 `SphereOverlap` 每 0.2s 筛选最近敌人。
    - 激光表现：通过 `GameplayCue` 触发。
- 生存属性：拥有独立的 `Health` 属性，受击逻辑对接 Lyra 的 `DamageExecution`。
## 震荡共鸣
开启后，朝指定位置释放震荡光球，并消耗所有的杀人书层数。

依据消耗的杀人书层数x，释放震荡波，释放次数为1+x，释放间隔为3s.

震荡波将降低敌人的移动速度，并阻止敌人换弹与瞄准，单次负面效果持续0.5s.

### 逻辑流转
- 层数快照：进入 GA 后立即读取并存储 `StackCount` 为整型变量 $x$。
- 消耗机制：通过 `GameplayEffect` 立即重置角色的 `StackCount`。
- 循环迭代：
    - 执行 `Loop` 次数为 $1 + x$。
    - 使用 `FTimerHandle` 或 `WaitDelay` 设定 3s 间隔。
    - 每一波次在目标位置生成 `BP_ShockwaveActor`。

### 5.2 负面状态
- GE 效果应用：
    - Tags 注入：`Status.Lock.Reload` (禁止换弹)、`Status.Lock.ADS` (禁止瞄准)。
    - 属性修改：`Character.Movement.MaxSpeed` 降低 80%。
    - 持续时间：单次波次生效 0.5s。
