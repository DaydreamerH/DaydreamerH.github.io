---
title: "Gameplay Tags in Unreal Engine"
description: "从命名、注册、容器匹配到 GameplayTagQuery，整理 UE 标签系统的核心用法。"
date: "2026-06-28"
category: "Unreal / Gameplay"
originalCategory: "UE Gameplay LAB"
track: "Game Development"
level: intermediate
status: ready
published: true
minutes: 8
order: 1000
prerequisites: ["UObject", "Gameplay Framework"]
tags: ["UE", "C++", "GameplayTags", "AI Generated"]
photos: "banner.png"
source: "AI Generated"
---

## 为什么需要 Gameplay Tags

`Gameplay Tags` 是一套层级化的名字系统，用 `FGameplayTag` 表示单个标签，用 `FGameplayTagContainer` 表示标签集合。和直接写字符串或枚举相比，它更适合表达“可组合、可继承、可被设计师配置”的游戏语义。

例如：

```text
State.Movement.Sprinting
State.Combat.Reloading
Weapon.Rifle.Sniper
Ability.Fire.Primary
GameplayCue.Weapon.Impact.Metal
```

这种命名方式天然带有父子关系。`Weapon.Rifle.Sniper` 不只是一个孤立值，它也可以被视为匹配 `Weapon` 或 `Weapon.Rifle`。Epic 的官方文档也把 Gameplay Tags 描述为层级标签系统，可用于标记对象、状态、属性或能力，并通过项目设置、配置文件或代码注册。

Gameplay Tags 最适合解决三类问题：

- 状态表达：角色是否正在换弹、眩晕、瞄准、冲刺。
- 分类分发：根据武器、表面材质、技能类型选择动画、音效、特效或伤害逻辑。
- 条件判断：能力是否可激活、某个交互是否允许、某个效果是否应该被阻止。

## 命名先于代码

标签系统的第一件事不是写 C++，而是设计命名树。好的标签树应该稳定、短、可读，并且按照游戏语义而不是代码模块组织。

推荐把最顶层分成少量领域：

```text
Ability.*
State.*
Event.*
GameplayCue.*
Weapon.*
Character.*
Surface.*
UI.*
Data.*
```

不要把临时实现细节塞进标签里，例如 `BP_Rifle_01.TempFlag`。标签一旦被蓝图、Data Asset、Gameplay Effect、Ability、动画蓝图引用，就会变成项目公共协议；频繁重命名会带来引用迁移成本。

一个实用规则是：如果这个名字会出现在策划表、蓝图节点、GAS 规则或调试日志里，它适合作为 Gameplay Tag；如果它只是某个函数内部的局部判断，普通变量更合适。

## 注册方式

常见注册方式有三种。

第一种是在 Project Settings 的 Gameplay Tags 面板里添加。这对设计师友好，适合原型和小项目。

第二种是 `.ini` 配置。项目中通常会把标签写入 `DefaultGameplayTags.ini`，便于版本管理和团队审查。

第三种是 Native Gameplay Tags。C++ 项目里更推荐为核心协议使用原生标签声明，因为它有更好的集中管理和编译期可发现性。通常在头文件声明：

```cpp
UE_DECLARE_GAMEPLAY_TAG_EXTERN(TAG_State_Combat_Reloading);
UE_DECLARE_GAMEPLAY_TAG_EXTERN(TAG_Weapon_Rifle_Sniper);
```

然后在 `.cpp` 中定义：

```cpp
UE_DEFINE_GAMEPLAY_TAG(TAG_State_Combat_Reloading, "State.Combat.Reloading");
UE_DEFINE_GAMEPLAY_TAG(TAG_Weapon_Rifle_Sniper, "Weapon.Rifle.Sniper");
```

相比到处调用 `FGameplayTag::RequestGameplayTag(FName("State.Combat.Reloading"))`，原生声明更不容易拼错，也方便全局搜索引用。

## FGameplayTag 与 FGameplayTagContainer

`FGameplayTag` 表示一个标签；`FGameplayTagContainer` 是多个标签的集合。很多 Gameplay 判断本质上都是“目标标签集合是否满足某个条件”。

常见写法：

```cpp
FGameplayTag ReloadingTag = TAG_State_Combat_Reloading;

if (CharacterTags.HasTag(ReloadingTag))
{
    return false;
}
```

在层级匹配上，需要区分“精确匹配”和“父子匹配”。如果角色拥有 `State.Combat.Reloading`，那么它通常也应该被 `State.Combat` 这类查询命中；但如果你判断的是具体动画分支，可能需要精确匹配。

可以把 Container 想成对象当前的“语义快照”。例如一个角色当前可能同时拥有：

```text
State.Movement.Sprinting
State.Weapon.ADS
Weapon.Rifle.Sniper
Team.Blue
```

这样动画、材质、武器逻辑、UI 都可以读取同一组语义状态，而不需要彼此知道内部变量名。

## GameplayTagQuery

当条件从“包含某个标签”变成“包含 A 且不包含 B，或者包含 C 的任意子标签”时，手写 `if` 会迅速变复杂。`FGameplayTagQuery` 用来表达更复杂的标签条件，适合放在 Data Asset 或可配置规则里。

例如一个技能激活条件可以被描述成：

- 必须拥有 `Weapon.Rifle`。
- 不能拥有 `State.Combat.Reloading`。
- 不能拥有 `State.Dead`。

这种规则如果写死在 Ability 里，后期每加一把武器或一个状态都要改代码；如果做成 Tag Query，设计师可以在数据里调整条件，C++ 只负责执行查询。

## 和 GAS 的关系

GAS 几乎把 Gameplay Tags 当作自己的通用语言。Ability 可以通过标签判断是否允许激活，Gameplay Effect 可以授予或移除标签，Gameplay Cue 通过标签分发视觉和音效表现。

一个典型流程是：

1. 角色进入换弹 Ability。
2. Ability 或 Gameplay Effect 添加 `State.Combat.Reloading`。
3. 开火 Ability 因为 Blocked Tags 中包含 `State.Combat.Reloading` 而无法激活。
4. 动画蓝图或 UI 读取该标签，显示换弹状态。
5. 换弹结束后移除标签，开火能力恢复。

这比到处同步 `bIsReloading` 更稳，因为状态由 Ability System Component 持有，网络复制、预测和规则判断都可以围绕同一套标签语义组织。

## 普通 Gameplay 中也值得使用

即使项目没有使用 GAS，Gameplay Tags 仍然有价值。

武器系统可以用标签决定不同武器的行为：

```cpp
if (WeaponTags.HasTag(TAG_Weapon_Rifle_Sniper))
{
    AimProfile = SniperAimProfile;
}
```

命中反馈可以用标签选择不同 Cue 或 Niagara：

```text
Surface.Metal
Surface.Glass
Surface.Flesh
```

交互系统可以用标签描述对象能力：

```text
Interact.Openable
Interact.Pickup
Interact.Locked
```

这样做的好处是：系统之间交换的是稳定语义，而不是彼此的具体类名。门、宝箱、武器箱都可以拥有 `Interact.Openable`，交互组件只需要理解标签，不需要认识每一种 Actor 子类。

## 常见坑

不要把 Gameplay Tags 当成万能替代品。它适合表达离散语义，不适合表达连续数值。血量、速度、弹药数量应该继续用属性或变量；`State.Health.Low` 可以作为派生状态，但不应该替代真实血量。

不要在 Tick 中频繁用字符串请求标签。核心标签应该缓存或使用 Native Gameplay Tags；运行时字符串请求既难查错，也容易制造隐藏成本。

不要让命名树无限膨胀。标签越多，越需要维护规范。一个项目最好有一份简短的标签命名约定：顶层域、大小写、是否允许复数、临时标签前缀、废弃标签处理方式。

不要混淆 Actor Tags 和 Gameplay Tags。Actor 自带的 Tags 是简单 `FName` 数组，适合很轻量的关卡标记；Gameplay Tags 则有注册表、层级、容器、查询和更完整的工具链。Gameplay 规则复杂时优先使用 Gameplay Tags。

## 一个小型命名模板

对于多人 TPS，可以从下面这棵树开始：

```text
Ability.Fire.Primary
Ability.Fire.Secondary
Ability.Reload
Ability.Sprint

State.Combat.Reloading
State.Combat.Firing
State.Movement.Sprinting
State.Movement.InAir
State.Weapon.ADS
State.Dead

Weapon.Rifle
Weapon.Rifle.Sniper
Weapon.Pistol
Weapon.Projectile
Weapon.Hitscan

GameplayCue.Weapon.Fire
GameplayCue.Weapon.Impact.Default
GameplayCue.Weapon.Impact.Metal
GameplayCue.Weapon.Impact.Flesh

Data.Damage
Data.Cooldown
Data.Recoil
```

这套命名可以连接已有的本地开火预测、瞄准镜材质参数、子弹对象池和延迟补偿文章：Ability 使用标签表达能否执行，武器用标签选择表现，命中结果用标签分发 Cue，网络同步只传递必要的状态和结果。

## 小结

Gameplay Tags 的价值不在于“多一种枚举”，而在于建立项目内统一的语义层。C++、蓝图、GAS、动画、特效、数据资产都能围绕同一套标签说话。

当一个状态会跨系统传播、会被设计师配置、会参与网络预测或会出现在调试日志中，优先考虑 Gameplay Tags。它会让项目从“很多布尔值和字符串”逐步变成“可查询、可组合、可复用的游戏语义图”。

## 参考

- Epic Games Documentation：[Using Gameplay Tags in Unreal Engine](https://dev.epicgames.com/documentation/en-us/unreal-engine/using-gameplay-tags-in-unreal-engine)。
- Epic Games C++ API：[FGameplayTagContainer](https://dev.epicgames.com/documentation/en-us/unreal-engine/API/Runtime/GameplayTags/FGameplayTagContainer)。
- Epic Games Documentation：[Gameplay Ability System](https://dev.epicgames.com/documentation/en-us/unreal-engine/gameplay-ability-system-for-unreal-engine) 中关于 Ability Tags、Blocked Tags、Gameplay Cues 的相关说明。
