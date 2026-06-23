---
title: "Genshin-Impact-But-TPS项目"
description: "一款多人TPS夺旗游戏项目简介"
date: "2025-03-21 17:50:00"
category: "Unreal / Gameplay"
originalCategory: "项目开发"
track: "Game Development"
level: foundation
status: ready
published: true
minutes: 5
order: 1000
prerequisites: []
tags: ["UE", "C++"]
photos: "ue.jpg"
source: "_posts"
---# 项目演示

<iframe src="//player.bilibili.com/player.html?isOutside=true&aid=114532617885530&bvid=BV1YNEDzoEMk&cid=30035083681&p=1" scrolling="no" border="0" frameborder="no" framespacing="0" allowfullscreen="true"  width=100% height=500></iframe>

# 本项目概述
本项目是一个基于UE5的多人在线第三人称射击游戏。

项目使用的插件包含：
- VRM4U（导入模型）
- OnlineSubsystem（构建会话）

本项目可通过Steam平台或局域网进行联机游戏。

# 代码结构
[仓库](https://github.com/DaydreamerH/Genshin-Impact-But-TPS)

本项目CPP代码可见于：
```
DaydreamerH/Genshin-Impact-But-TPS
├── Source
│   ├── ShootGame
│   │   ├── Private
│   │   │   ├── BombZone
│   │   │   │   └── BombZone.cpp
│   │   │   ├── CameraShake
│   │   │   │   ├── FireCameraShake.cpp
│   │   │   │   ├── GrenadeLauncherCameraShake.cpp
│   │   │   │   ├── PistolCameraShake.cpp
│   │   │   │   ├── RocketLauncherCameraShake.cpp
│   │   │   │   └── ShotGunCameraShake.cpp
│   │   │   ├── Components
│   │   │   │   ├── BuffComponent.cpp
│   │   │   │   ├── CombatComponent.cpp
│   │   │   │   └── LagCompensationComponent.cpp
│   │   │   ├── GameMode
│   │   │   │   ├── LobbyGameMode.cpp
│   │   │   │   ├── ShootGameMode.cpp
│   │   │   │   └── TeamsShootGameMode.cpp
│   │   │   ├── GameState
│   │   │   │   ├── LobbyGameState.cpp
│   │   │   │   └── ShootGameState.cpp
│   │   │   ├── HUD
│   │   │   │   ├── Announcement.cpp
│   │   │   │   ├── BackToMainMenu.cpp
│   │   │   │   ├── CharacterOverlay.cpp
│   │   │   │   ├── DamageIndicator.cpp
│   │   │   │   ├── ElimAnnouncement.cpp
│   │   │   │   ├── OverheadWidget.cpp
│   │   │   │   └── PlayerHUD.cpp
│   │   │   ├── Pickup
│   │   │   │   ├── AmmoPickup.cpp
│   │   │   │   ├── HealthPickup.cpp
│   │   │   │   ├── JumpPickup.cpp
│   │   │   │   ├── Pickup.cpp
│   │   │   │   ├── PickupSpawnPoint.cpp
│   │   │   │   ├── ShieldPickup.cpp
│   │   │   │   └── SpeedPickup.cpp
│   │   │   ├── Player
│   │   │   │   ├── MyPlayerState.cpp
│   │   │   │   ├── PlayerAnimInstance.cpp
│   │   │   │   └── PlayerCharacter.cpp
│   │   │   ├── PlayerController
│   │   │   │   └── MyPlayerController.cpp
│   │   │   ├── PlayerStart
│   │   │   │   └── TeamPlayerStart.cpp
│   │   │   ├── SpawnPoints
│   │   │   │   └── GenericSpawnPoint.cpp
│   │   │   ├── Weapon
│   │   │   │   ├── Bomb.cpp
│   │   │   │   ├── BulletShell.cpp
│   │   │   │   ├── GrenadeProjectile.cpp
│   │   │   │   ├── HitScanWeapon.cpp
│   │   │   │   ├── Projectile.cpp
│   │   │   │   ├── ProjectileBullet.cpp
│   │   │   │   ├── ProjectileWeapon.cpp
│   │   │   │   ├── RocketMovementComponent.cpp
│   │   │   │   ├── RocketProjectile.cpp
│   │   │   │   ├── ShotGunWeapon.cpp
│   │   │   │   └── Weapon.cpp
│   │   │   └── ShotGunReloadAnimNotify.cpp
│   │   ├── Public
│   │   │   ├── BombZone
│   │   │   │   └── BombZone.h
│   │   │   ├── CameraShake
│   │   │   │   ├── FireCameraShake.h
│   │   │   │   ├── GrenadeLauncherCameraShake.h
│   │   │   │   ├── PistolCameraShake.h
│   │   │   │   ├── RocketLauncherCameraShake.h
│   │   │   │   └── ShotGunCameraShake.h
│   │   │   ├── Components
│   │   │   │   ├── BuffComponent.h
│   │   │   │   ├── CombatComponent.h
│   │   │   │   ├── CombatStates.h
│   │   │   │   └── LagCompensationComponent.h
│   │   │   ├── GameMode
│   │   │   │   ├── LobbyGameMode.h
│   │   │   │   ├── ShootGameMode.h
│   │   │   │   └── TeamsShootGameMode.h
│   │   │   ├── GameState
│   │   │   │   ├── LobbyGameState.h
│   │   │   │   └── ShootGameState.h
│   │   │   ├── HUD
│   │   │   │   ├── Announcement.h
│   │   │   │   ├── BackToMainMenu.h
│   │   │   │   ├── CharacterOverlay.h
│   │   │   │   ├── DamageIndicator.h
│   │   │   │   ├── ElimAnnouncement.h
│   │   │   │   ├── OverheadWidget.h
│   │   │   │   └── PlayerHUD.h
│   │   │   ├── Pickup
│   │   │   │   ├── AmmoPickup.h
│   │   │   │   ├── HealthPickup.h
│   │   │   │   ├── JumpPickup.h
│   │   │   │   ├── Pickup.h
│   │   │   │   ├── PickupSpawnPoint.h
│   │   │   │   ├── ShieldPickup.h
│   │   │   │   └── SpeedPickup.h
│   │   │   ├── Player
│   │   │   │   ├── MyPlayerState.h
│   │   │   │   ├── PlayerAnimInstance.h
│   │   │   │   ├── PlayerCharacter.h
│   │   │   │   ├── PlayerSoundType.h
│   │   │   │   ├── TurningPlace.h
│   │   │   │   └── team.h
│   │   │   ├── PlayerController
│   │   │   │   ├── Announcement.h
│   │   │   │   └── MyPlayerController.h
│   │   │   ├── PlayerStart
│   │   │   │   └── TeamPlayerStart.h
│   │   │   ├── SpawnPoints
│   │   │   │   └── GenericSpawnPoint.h
│   │   │   ├── Weapon
│   │   │   │   ├── Bomb.h
│   │   │   │   ├── BulletShell.h
│   │   │   │   ├── GrenadeProjectile.h
│   │   │   │   ├── HitScanWeapon.h
│   │   │   │   ├── Projectile.h
│   │   │   │   ├── ProjectileBullet.h
│   │   │   │   ├── ProjectileWeapon.h
│   │   │   │   ├── RocketMovementComponent.h
│   │   │   │   ├── RocketProjectile.h
│   │   │   │   ├── ShotGunWeapon.h
│   │   │   │   ├── Weapon.h
│   │   │   │   └── WeaponTypes.h
│   │   │   └── ShotGunReloadAnimNotify.h
│   │   ├── ShootGame.Build.cs
│   │   ├── ShootGame.cpp
│   │   └── ShootGame.h
│   ├── ShootGame.Target.cs
│   └── ShootGameEditor.Target.cs
```

# SSR实现过程
## 理解网络延迟与命中判定
在典型的客户端-服务器架构游戏中，当玩家开火时，客户端会将射击指令发送到服务器。然而，由于网络延迟，这个指令到达服务器时会有一个时间差。在此期间，目标玩家可能已经移动。如果服务器直接使用目标玩家当前的位置进行判定，那么即使在玩家屏幕上看起来是命中了，服务器也可能判定为未命中。这就是经典的“我打了你，但服务器说没有”的问题。

## 服务器端回溯（SSR）的核心思想
SSR 的精髓在于：当服务器收到射击请求时，它会将目标玩家的狀態「回溯」到射击发生的那个精确时间点，然后在这个回溯后的状态上进行命中判定。 这样一来，无论网络延迟如何，命中判定都将基于玩家开火时目标实际所处的位置，极大地提升了准确性和玩家的沉浸感。

## 我的 SSR 实现剖析
以下是我的 SSR 系统在代码层面是如何运作的：

1. 维护玩家位置的历史记录

   该系统的基础是服务器能够精确地记录和存储每个玩家的历史位置。在我的项目中，ULagCompensationComponent 承担了这一关键职责。

   - SaveFramePackage: 此函数定期调用（通常在每个 Tick），以捕获角色碰撞箱的当前状态。它将这些信息与时间戳打包成一个 FFramePackage 结构。
   - FrameHistory: 这些 FFramePackage 实例存储在一个双向链表中，创建玩家动作的时间顺序历史记录。为了有效管理内存，系统只保留最长 MaxRecordTime（例如 0.5 秒）的历史记录，并丢弃较旧的帧。

2. 定位和插值处理正确的历史帧

   当开火时，服务器需要找到命中判定的精确历史上下文。

   - GetFrameToCheck: 给定 HitTime（从客户端传来的射击时间戳），此函数会在 FrameHistory 中搜索最能代表该时间点目标状态的 FFramePackage。
   - 插值 (InterpBetweenFrames): 如果 HitTime 落在两个记录帧之间，系统不会只选择最接近的帧。相反，它会在这两个帧之间执行线性插值，以精确估计在确切 HitTime 时目标碰撞箱的位置和旋转。这提供了更平滑、更准确的回溯。

3. 在回溯状态上执行命中判定

   确定目标角色的过去位置后，服务器可以继续执行命中检测。

   - 缓存和移动碰撞箱: 在回溯之前，目标角色的当前碰撞箱位置会被缓存。然后，其实际的碰撞箱会被暂时移动到所选（或插值处理过的）历史 FFramePackage 中的位置和旋转。
   - 禁用网格碰撞: 为了确保命中追踪只与指定的碰撞箱（例如头部、躯干等）交互，而不是与角色的整体网格碰撞，角色的主网格碰撞会被暂时禁用。
   - 命中检测 (ConfirmHit, ProjectileConfirmHit, ShotGunConfirmHit):
     - 对于单发武器，会从射击来源到预期目的地执行射线追踪，检查与现在回溯的碰撞箱的交叉点。
     - 爆头通常会被优先处理和检查。
     - 对于投射物武器，系统会模拟投射物的路径并检查与回溯碰撞箱的碰撞。
     - 对于霰弹枪类武器，会执行多次追踪，可能会击中多个目标的各个身体部位。
     - 恢复原始状态: 关键是，命中检查完成后，角色的碰撞箱会立即从缓存中恢复到其当前实时位置，并且重新启用其网格碰撞。整个回溯和恢复过程对所有玩家来说都是无缝且不可见的。
4. 应用伤害和服务器端验证

   最后，命中检查的结果会用于应用伤害。

服务器 RPCs (ServerScoreRequest_Implementation, etc.): 客户端射击请求会通过远程过程调用 (RPC) 发送到服务器。这些是安全的服务器权威性调用。

伤害应用: 收到 RPC 后，服务器会执行 SSR 流程。如果命中确认，服务器会计算伤害（考虑爆头伤害加成），并直接应用至目标角色。这种服务器端伤害应用可防止客户端虚假命中或操纵伤害。

# 不足之处
1. 动画状态管理混乱，没有使用动画层接口，而是采用基础的Montage动画去做不同武器的区分，随着动画素材的增加，动画管理会变得非常复杂。
2. 没有为对象间获取数据提供接口，而是采用了直接访问的方式，这会导致代码的耦合度较高，不利于代码的维护和扩展。
