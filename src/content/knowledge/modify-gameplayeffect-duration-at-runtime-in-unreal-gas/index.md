---
title: "Modify GameplayEffect Duration at Runtime in Unreal GAS"
description: "在 Unreal GAS 中实现 GameplayEffect 持续时间的动态修改。"
date: "2025-08-27 20:02:01"
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
photos: "banner.jpg"
source: "_posts"
---
## 问题
在 Unreal Engine 的 **Gameplay Ability System (GAS)** 中，`GameplayEffect (GE)` 是一个非常核心的概念。
GE 可以用来表示 Buff、Debuff、DOT（持续伤害）、HOT（持续治疗）等效果。
它们通常拥有三种持续策略：
- **Instant**：立即生效，瞬时结束。
- **Infinite**：无限持续，直到被移除。
- **Has Duration**：有固定持续时间。

但是，GAS 默认的机制下 **GE 的持续时间一旦在应用时确定，就不能在运行时修改**。
这就带来了问题：
- 如果一个 Buff 应该因为技能升级而延长时间怎么办？
- 如果一个 DOT 效果受到某个状态影响需要提前结束怎么办？

在本人开发的项目中，一名角色的大招持续时间可以通过击杀来延长，**这当然可以通过Ability来控制GE生命周期，并动态延长Ability的持续时间解决**。

但我想尝试对GE的Duration进行修改，来实现相应的功能，以便在后续不得不针对GE的Duration修改时，能够直接采用相同的方案。

## 思路
首先尝试过直接修改 `GameplayEffectSpec.Duration`，但发现并不会影响已经应用的 `ActiveGameplayEffect`：
- **原因**：`FActiveGameplayEffect` 在应用时缓存了开始时间和持续时长，内部的计时器与复制系统不会因为修改 `Spec` 而自动更新。
- 因此，必须从 **AbilitySystemComponent (ASC)** 层面入手，直接操作 `ActiveGameplayEffect`。

我们通过继承 `UAbilitySystemComponent`，新增一个接口 `SetGameplayEffectDurationHandle`，实现运行时修改已应用 GE 的持续时间。

思路如下：
1. 找到指定句柄对应的 `FActiveGameplayEffect`。
2. 修改它的 `Spec.Duration`。
3. 重置开始时间，使“剩余时间 = 新持续时间”。
4. 标记 FastArray 条目脏数据，触发网络复制。
5. 调用 `CheckDuration` 刷新内部定时逻辑。
6. 广播事件，让监听方（例如 AbilityTask）能收到变化。

```
void USuperAbilitySystemComponent::SetGameplayEffectDurationHandle(
    FActiveGameplayEffectHandle Handle, float NewDuration)
{
    if (!Handle.IsValid()) { return; }
    // 检查传入句柄有效性。若句柄无效（例如未初始化或已被移除），
    // 直接返回不做任何操作，防止访问非法内存或无意义操作。

    const FActiveGameplayEffect* ActiveGameplayEffect = GetActiveGameplayEffect(Handle);
    // 使用 ASC 的只读接口通过句柄查询当前对应的 FActiveGameplayEffect（AGE）。
    // 注意这里返回的是 const 指针，说明 API 想保护 AGE 不被直接修改（常见设计）。

    if (!ActiveGameplayEffect) { return; }
    // 再次检查：如果没有找到对应 AGE（例如句柄对应的效果已被移除），
    // 就返回，防止后续对空指针的操作。

    FActiveGameplayEffect* AGE = const_cast<FActiveGameplayEffect*>(ActiveGameplayEffect);
    // const_cast 把 const FActiveGameplayEffect* 转成可写指针。
    // 含义/理由：在运行时直接修改 AGE 的成员（比如 Spec、StartWorldTime 等），
    // 但 API 只给了 const 视图；因此通过 const_cast 绕过编译器限制。
    // 注意：这在语义上可行前提是底层对象确实不是 const。

    if (NewDuration > 0) {
        AGE->Spec.Duration = NewDuration;
    } else {
        AGE->Spec.Duration = 0.01f; // 避免为 0
    }

    AGE->StartServerWorldTime = ActiveGameplayEffects.GetServerWorldTime();
    // 将 AGE 的服务器起始世界时间重置为当前服务器世界时间。
    // 含义：把“起始时间”设为现在，从而使剩余时间 = 新的 Spec.Duration。

    AGE->CachedStartServerWorldTime = AGE->StartServerWorldTime;
    // 更新缓存的服务器起始时间，确保内部逻辑/复制数据一致。

    AGE->StartWorldTime = ActiveGameplayEffects.GetWorldTime();
    // 将客户端可见的/本地世界时间的起始时间也重置为现在，
    // 这样客户端计时基线也能与服务器同步。

    ActiveGameplayEffects.MarkItemDirty(*AGE);
    // 标记 ActiveGameplayEffects（FastArray 容器）中的该条目为“脏”，
    // 确保修改通过网络复制给客户端。

    ActiveGameplayEffects.CheckDuration(Handle);
    // 重新评估 AGE 的到期逻辑。
    // 包括是否到期、是否需要重设定时器等。

    AGE->EventSet.OnTimeChanged.Broadcast(AGE->Handle, AGE->StartWorldTime, AGE->GetDuration());
    // 触发 OnTimeChanged 事件，通知监听者（例如 AbilityTask、UI）更新。

    OnGameplayEffectDurationChange(*AGE);
    // 调用 ASC 的回调，告诉上层 “某个 ActiveGameplayEffect 的持续时间已变更”。
}
```
## 使用
```
void URiptideAbility::ActivateAbility(
    const FGameplayAbilitySpecHandle Handle,
    const FGameplayAbilityActorInfo* ActorInfo,
    const FGameplayAbilityActivationInfo ActivationInfo,
    const FGameplayEventData* TriggerEventData)
{
    ...

    // 如果配置了 GE_Riptide（比如一个 Buff 或技能效果）
    else if (GE_Riptide)
    {
        // 给角色自己施加 GameplayEffect，并保存返回的句柄以便后续操作
        RiptideGameplayEffectHandle = ApplyGameplayEffectToOwner(
            Handle, ActorInfo, ActivationInfo, GE_Riptide.GetDefaultObject(), 1.f);

        ...

        // 仅在服务器（Authority）端绑定事件，避免多端重复逻辑
        if (HasAuthority(&ActivationInfo))
        {
            // 创建一个任务，等待指定的 GameplayEvent（KillEventTag）
            if (UAbilityTask_WaitGameplayEvent* WaitGameplayEvent =
                UAbilityTask_WaitGameplayEvent::WaitGameplayEvent(this, KillEventTag))
            {
                // 绑定事件回调，当收到事件时调用 OnKillEvent
                WaitGameplayEvent->EventReceived.AddDynamic(this, &ThisClass::OnKillEvent);

                // 激活这个任务
                WaitGameplayEvent->ReadyForActivation();
            }
        }
    }
}

void URiptideAbility::OnKillEvent(FGameplayEventData EventData)
{
    // 获取击杀者 Actor（Instigator），并确保它在服务器端
    AActor* KillerActor = const_cast<AActor*>(EventData.Instigator.Get());
    if (!KillerActor || !KillerActor->HasAuthority())
    {
        return;
    }

    // 定义额外增加的持续时间，这里固定为 5 秒
    constexpr float ExtraDuration = 5.f;

    // 调用扩展 Buff 持续时间的逻辑
    ExtendRiptideDurationOnKill(KillerActor, ExtraDuration);
}

void URiptideAbility::ExtendRiptideDurationOnKill(const AActor* KillerActor, float ExtraDuration)
{
    if (!KillerActor)
    {
        return;
    }

    // 先获取 PlayerState，再通过 PlayerState 找到对应的角色 Pawn
    const APlayerState* PlayerState = Cast<APlayerState>(KillerActor);
    const ABaseCharacter* Character = Cast<ABaseCharacter>(PlayerState->GetPawn());
    if (!Character)
    {
        return;
    }

    // 如果当前没有 Riptide 的有效 GameplayEffect 句柄，则直接返回
    if (!RiptideGameplayEffectHandle.IsValid())
    {
        return;
    }

    // 获取角色的 AbilitySystemComponent，并确认是我们扩展过的 USuperAbilitySystemComponent
    if (USuperAbilitySystemComponent* ASC =
        Cast<USuperAbilitySystemComponent>(Character->GetAbilitySystemComponent()))
    {
        // 检查当前 Riptide Buff 是否还在生效
        if (const FActiveGameplayEffect* ActiveGE =
            ASC->GetActiveGameplayEffect(RiptideGameplayEffectHandle))
        {
            // 获取 Buff 剩余的持续时间
            float RemainingTime = ActiveGE->GetTimeRemaining(GetWorld()->TimeSeconds);

            // 计算新的总持续时间 = 剩余时间 + 额外时间
            float NewDuration = RemainingTime + ExtraDuration;

            // 调用自定义的接口，动态修改 GameplayEffect 的持续时间
            ASC->SetGameplayEffectDurationHandle(RiptideGameplayEffectHandle, NewDuration);

            UE_LOG(LogTemp, Log, TEXT("%f"), NewDuration);
        }
    }
}
```
