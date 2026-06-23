---
title: "Refactoring Lag Compensation——Introducing Sphere-Based Collision Verification"
description: "重构延迟补偿组件，并拓展球体碰撞验证。"
date: "2026-03-11 16:17:48"
category: "Unreal / Gameplay"
originalCategory: "UE相关"
track: "Game Development"
level: advanced
status: ready
published: true
minutes: 5
order: 1000
prerequisites: []
tags: ["UE", "C++"]
photos: "banner.jpg"
source: "_posts"
---为了满足“爆炸子弹”的需求，现在需要对过去实现的延迟补偿组件重构与拓展。

## 状态管理
`ULagCompensationComponent` 会在每帧对角色的 `PhyAsset` 进行存储。

### 初始化
在 `ULagCompensationComponent::BeginPlay` 中，先获取 `Character` 的 `Mesh` 与 `BodyInstance`，避免后续记录时，频繁获取指针。

```
// 需要存储的PhyAsset碰撞体对应的骨骼名称
UPROPERTY(EditDefaultsOnly)
TArray<FName> BonesToRecord;
// 存储由骨骼名称到碰撞体的映射
TMap<FName, FBodyInstance*> BodyInstanceCache;

void ULagCompensationComponent::BeginPlay()
{
	Super::BeginPlay();

	OwnerCharacter = Cast<ABaseCharacter>(GetOwner());
	if(OwnerCharacter)
	{
		CachedMesh = OwnerCharacter->GetMesh();
		BodyInstanceCache.Empty();
		for (const FName& BoneName : BonesToRecord)
		{
			if (FBodyInstance* BI = CachedMesh->GetBodyInstance(BoneName))
			{
				BodyInstanceCache.Add(BoneName, BI);
			}
		}
	}
}
```

完成骨骼名称与碰撞体的映射关系存储。

### 记录状态
记录状态仅发生在服务器上，每帧存储一次当前角色的帧历史信息。

```
USTRUCT()
struct FFramePackage
{
	GENERATED_BODY()

	UPROPERTY()
	float Time = 0.f;

	UPROPERTY()
	TMap<FName, FTransform> BoneTransforms;
};
```

帧历史信息包含：
- 存储时的服务器时间；
- 骨骼名称与碰撞体对应刚体的世界变换。

在 `TickComponent` 中，服务器每帧调用一次 `SaveFramePackage` 记录一次 `FFramePackage`:
1. 检查缓存 `Mesh` 指针与 `BodyInstance` 指针受否有效。
2. 获取当前帧时间，计入 `FramePackage`.
3. 遍历 `BodyInstanceCahe` ，将骨骼名称与世界坐标系下的Transform塞入 `FramePackage`.

```
void ULagCompensationComponent::SaveFramePackage()
{
	if(!CachedMesh || BodyInstanceCache.Num() == 0) return;

	FFramePackage Frame;
	Frame.Time = GetWorld()->GetGameState()->GetServerWorldTimeSeconds();

	for (auto& It : BodyInstanceCache)
	{
		const FName& BoneName = It.Key;

		if (FBodyInstance* BI = It.Value)
		{
			FTransform BodyWorldTransform = BI->GetUnrealWorldTransform();
			Frame.BoneTransforms.Add(BoneName, BodyWorldTransform);
		}
	}

	FrameHistory.Add(Frame);
}
```

### 移除状态
延迟补偿应有一定时间限制，故需要在每帧清除超时的历史记录。

有效时间：
```
UPROPERTY(EditDefaultsOnly)
float MaxRecordTime = 1.f;
```

当 当前帧时间-包记录时间 大于 最大记录时间，需要将其移除。
```
void ULagCompensationComponent::PruneOldFrames()
{
	if(FrameHistory.Num() <= 1) return;

	const float CurrentTime = GetWorld()->GetGameState()->GetServerWorldTimeSeconds();
	int32 KeepFromIndex = 0;
	for (; KeepFromIndex < FrameHistory.Num(); ++KeepFromIndex)
	{
		if (CurrentTime - FrameHistory[KeepFromIndex].Time <= MaxRecordTime)
			break;
	}

	if (KeepFromIndex > 0)
	{
		FrameHistory.RemoveAt(0, KeepFromIndex);
	}
}
```

### 存储与移除
```
void ULagCompensationComponent::TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction)
{
	Super::TickComponent(DeltaTime, TickType, ThisTickFunction);

	if(GetOwnerRole() == ROLE_Authority)
	{
		SaveFramePackage();
		PruneOldFrames();

/*#if !UE_BUILD_SHIPPING
		DebugShowHistory();
#endif*/
	}
}
```

## 状态搜索
延迟补偿的核心，是根据命中请求的生效时间，回档相关方的空间信息，进行命中验证。

在完成状态的记录后，对状态进行索引是必要的。

### 总体思路
依据时间对存储的 `FrameHistory` 进行搜索与插值：
1. 搜索：返回最接近命中时间的历史信息，通常为两帧，即大于命中时间的最小记录时间的帧与小于命中时间的最大记录时间的帧。
2. 插值：依据索引得到的两帧与命中时间进行插值，得到理论命中时间下，相关方的空间信息。

在少数情况下，命中时间恰为记录帧时间，则无需插值；部分网络延迟较高的情况下，命中时间不再记录时间区域，则不再进行延迟补偿。

```
FFramePackage ULagCompensationComponent::GetFramePackageAtTime(float HitTime) const
{
	if(FrameHistory.Num() == 0)return FFramePackage();

	FFramePackage OutLeftFrame;
	FFramePackage OutRightFrame;
	if (!GetFramesForTime(HitTime, OutLeftFrame, OutRightFrame)) return FFramePackage();
	if (OutLeftFrame.Time == HitTime) return OutLeftFrame;
	if (OutRightFrame.Time == HitTime) return OutRightFrame;

	FFramePackage FinalFrame;
	InterpolateFrame(OutLeftFrame, OutRightFrame, FinalFrame, HitTime);
	return FinalFrame;
}
```

### 搜索
基于时间搜索相关帧，采用二分法搜索：`FrameHistory` 天然具有时间顺序，记录帧时间随序号增大而增大。

```
bool ULagCompensationComponent::GetFramesForTime(float HitTime, FFramePackage& OutLeftFrame,
	FFramePackage& OutRightFrame) const
{
	int32 Left = 0;
	int32 Right = FrameHistory.Num()-1;
	int32 TargetIndex = 0;

	if (HitTime < FrameHistory[Left].Time || HitTime > FrameHistory[Right].Time) return false;

	while (Left <= Right)
	{
		const int32 Mid = (Left + Right) / 2;
		if (FrameHistory[Mid].Time <= HitTime)
		{
			TargetIndex = Mid;
			Left = Mid + 1;
		}
		else
		{
			Right = Mid - 1;
		}
	}

	OutLeftFrame = FrameHistory[TargetIndex];
	OutRightFrame = TargetIndex + 1 < FrameHistory.Num() ? FrameHistory[TargetIndex + 1] : OutLeftFrame;
	return true;
}
```

### 插值
插值基于左右帧与命中时间实现：
1. 当左右帧时间基本一致时，放弃插值，直接返回左帧。
2. 计算插值比例 `Alpha`，为 （命中时间-左帧时间）/左右帧时间间隔。
3. 随后遍历左帧记录碰撞体空间信息，依据右帧相同骨骼的空间信息，完成对应的插值。
```
void ULagCompensationComponent::InterpolateFrame(const FFramePackage& LeftFrame, const FFramePackage& RightFrame,
                                                 FFramePackage& OutFinalFrame, float Time) const
{
	if(FMath::IsNearlyEqual(LeftFrame.Time, RightFrame.Time, KINDA_SMALL_NUMBER))
	{
		OutFinalFrame = LeftFrame;
		return;
	}

	const float Alpha = FMath::Clamp((Time - LeftFrame.Time)/(RightFrame.Time-LeftFrame.Time), 0.f, 1.f);
	OutFinalFrame.Time = Time;

	for(const auto& LeftBonePair:LeftFrame.BoneTransforms)
	{
		const FName& BoneName = LeftBonePair.Key;
		if (const FTransform* RightBoneTransform = RightFrame.BoneTransforms.Find(BoneName))
		{
			FTransform OutBoneTransform;
			InterpolateTransform(LeftBonePair.Value, *RightBoneTransform, OutBoneTransform, Alpha);
			OutFinalFrame.BoneTransforms.Add(BoneName, OutBoneTransform);
		}
	}
}
```

具体插值包含：`Location` `Rotation` `Scale`:
```
void ULagCompensationComponent::InterpolateTransform(const FTransform& LeftTransform, const FTransform& RightTransform,
	FTransform& OutTransform, const float alpha) const
{
	OutTransform.SetLocation(
		FMath::Lerp(LeftTransform.GetLocation(), RightTransform.GetLocation(), alpha)
	);
	OutTransform.SetRotation(
		FQuat::Slerp(LeftTransform.GetRotation(), RightTransform.GetRotation(), alpha)
	);
	OutTransform.SetScale3D(
		FMath::Lerp(LeftTransform.GetScale3D(), RightTransform.GetScale3D(), alpha)
	);
}
```

## 回档
回档操作是指，基于时间，针对特定角色的碰撞体，进行回溯，确认其在历史某一时刻的实际位置。
1. 获取指定时间的理论空间信息。
2. 记录此刻的目标角色指针、Mesh指针、动画开闭情况、组件Tick情况。
3. 停止指定角色的动画，关闭Mesh组件Tick。
4. 遍历目标角色的 `BodyInstanceCache` 记录当前时刻的骨骼名称与碰撞体空间信息。
5. 依据历史帧，设置碰撞体空间信息，使用 `ETeleportType::TeleportPhysics` 避免碰撞。
6. 更新Mesh的重叠状态。

此刻信息由结构体 `FRewindContext` 记录，便于在回档验证完成后恢复现场。
```
USTRUCT()
struct FRewindContext
{
	GENERATED_BODY()

	UPROPERTY()
	TObjectPtr<ABaseCharacter> TargetCharacter = nullptr;

	UPROPERTY()
	TObjectPtr<USkeletalMeshComponent> Mesh = nullptr;

	bool bOldPauseAnims = false;
	bool bOldComponentTickEnabled = false;

	TMap<FName, FTransform> OriginalBodyTransforms;
};


bool ULagCompensationComponent::RewindTargetToHitTime(ABaseCharacter* TargetCharacter, float HitTime,
                                                      FRewindContext& OutContext)
{
	if (!TargetCharacter) return false;

	ULagCompensationComponent* TargetLagComp = TargetCharacter->FindComponentByClass<ULagCompensationComponent>();
	USkeletalMeshComponent* Mesh = TargetCharacter->GetMesh();
	if (!TargetLagComp || !Mesh) return false;

	const FFramePackage TargetFrame = TargetLagComp->GetFramePackageAtTime(HitTime);
	if (TargetFrame.BoneTransforms.Num() == 0) return false;

	OutContext.TargetCharacter = TargetCharacter;
	OutContext.Mesh = Mesh;
	OutContext.bOldPauseAnims = Mesh->bPauseAnims;
	OutContext.bOldComponentTickEnabled = Mesh->IsComponentTickEnabled();
	OutContext.OriginalBodyTransforms.Empty();

	Mesh->bPauseAnims = true;
	Mesh->SetComponentTickEnabled(false);

	for (auto& It : TargetLagComp->BodyInstanceCache)
	{
		if (FBodyInstance* BI = It.Value)
		{
			OutContext.OriginalBodyTransforms.Add(It.Key, BI->GetUnrealWorldTransform());
		}
	}

	for (const auto& BonePair : TargetFrame.BoneTransforms)
	{
		if (FBodyInstance* BI = TargetLagComp->BodyInstanceCache.FindRef(BonePair.Key))
		{
			BI->SetBodyTransform(BonePair.Value, ETeleportType::TeleportPhysics);
			BI->UpdateBodyScale(BonePair.Value.GetScale3D());
		}
	}

	Mesh->UpdateOverlaps();
	return true;
}
```

### 群体回档
为了满足新增的爆炸范围伤害需求，基于 `RewindTargetToHitTime` 实现群体回档：
1. 使用 `TArray<FRewindContext>` 类型记录群体角色的状态。
2. 遍历角色列表，使用 `RewindTargetToHitTime` 实现群体回档。

```
bool ULagCompensationComponent::RewindTargetsToHitTime(
	const TArray<TObjectPtr<AActor>>& TargetActors,
	float HitTime,
	TArray<FRewindContext>& OutContexts)
{
	OutContexts.Reset();

	bool bAnySuccess = false;

	for (AActor* TargetActor : TargetActors)
	{
		ABaseCharacter* TargetCharacter = Cast<ABaseCharacter>(TargetActor);
		if (!TargetCharacter) continue;

		if (TargetCharacter == GetOwner()) continue;

		FRewindContext Context;
		if (RewindTargetToHitTime(TargetCharacter, HitTime, Context))
		{
			OutContexts.Add(MoveTemp(Context));
			bAnySuccess = true;
		}
	}

	return bAnySuccess;
}
```

## 恢复
恢复过程基于回档时记录的上下文来实现。
1. 遍历上下文中记录的 `OriginalBodyTransforms`，分别对曾移动的碰撞体进行恢复。
2. 恢复 `Character` 组件tick状态、动画播放状态，并更新碰撞。

```
void ULagCompensationComponent::RestoreRewoundTarget(const FRewindContext& Context)
{
	if (!Context.TargetCharacter || !Context.Mesh) return;

	ULagCompensationComponent* TargetLagComp = Context.TargetCharacter->FindComponentByClass<ULagCompensationComponent>();
	if (!TargetLagComp) return;

	for (const auto& BonePair : Context.OriginalBodyTransforms)
	{
		if (FBodyInstance* BI = TargetLagComp->BodyInstanceCache.FindRef(BonePair.Key))
		{
			BI->SetBodyTransform(BonePair.Value, ETeleportType::TeleportPhysics);
            BI->UpdateBodyScale(BonePair.Value.GetScale3D());
		}
	}

	Context.Mesh->SetComponentTickEnabled(Context.bOldComponentTickEnabled);
	Context.Mesh->bPauseAnims = Context.bOldPauseAnims;
	Context.Mesh->UpdateOverlaps();
}
```

### 群体恢复
基于 `TArray<FRewindContext>` 变量遍历恢复：
```
void ULagCompensationComponent::RestoreRewoundTargets(
	const TArray<FRewindContext>& RewindContexts)
{
	for (const FRewindContext& Context : RewindContexts)
	{
		RestoreRewoundTarget(Context);
	}
}
```

## 验证
伤害命中验证的核心，是基于用户提交的验证请求信息，对子弹实际运行状态与碰撞情况进行复盘。

用户提交的信息包含：
1. 子弹直接命中的目标。
2. 子弹命中时间。
3. 子弹的起点。
4. 子弹的终点。
5. 子弹本体的半径。
6. 客户端碰撞结果。
7. 额外的目标，用以处理爆炸回档。
8. 子弹类型。

```
USTRUCT()
struct FHitVerificationRequest
{
	GENERATED_BODY()

	UPROPERTY()
	AActor* TargetActor = nullptr;

	UPROPERTY()
	float HitTime = 0.f;

	UPROPERTY()
	FVector_NetQuantize TraceStart;

	UPROPERTY()
	FVector_NetQuantize HitLocation;

	UPROPERTY()
	float ProjectileSphereRadius = 0.f;

	UPROPERTY()
	FHitResult HitResult;

	UPROPERTY()
	TArray<TObjectPtr<AActor>> AdditionalTargets;

	UPROPERTY()
	EProjectileHitType HitType = EProjectileHitType::DirectOnly;
};
```

### 整体流程
1. 若子弹直接命中为角色，基于请求体、命中角色进行子弹命中伤害验证，并将验证得到的碰撞信息写入 `ImpactHitResult`.
2. 若子弹未直接命中角色，基于请求体，直接模拟子弹扫掠，并将得到的碰撞信息写入 `ImpactHitResult`.
3. 若 `ImpactHitResult` 为有效碰撞、子弹属于爆炸类且额外目标列表中存在待判定对象，则进行爆炸伤害判定。

```
void ULagCompensationComponent::Server_DamageVerification_Implementation(const FHitVerificationRequest& Request)
{
	ABaseCharacter* InstigatorCharacter = Cast<ABaseCharacter>(GetOwner());
	if (!InstigatorCharacter) return;

	ABaseCharacter* TargetCharacter = Cast<ABaseCharacter>(Request.TargetActor);
	FHitResult ImpactHitResult;

	if (TargetCharacter!=nullptr)
	{
		ValidateAndApplyDirectHit(Request, TargetCharacter, ImpactHitResult);
	}
	else
	{
		SweepProjectileHit(Request, ImpactHitResult);
	}

	if (ImpactHitResult.IsValidBlockingHit() &&
		Request.HitType == EProjectileHitType::Explosive && Request.AdditionalTargets.Num() > 0)
	{
		ValidateAndApplyExplosionHit(Request, ImpactHitResult);
	}
}
```

### 子弹扫掠
子弹依据伤害请求中的起点与终点，在服务器上进行扫掠是伤害验证的基础操作，有两个重要作用：
1. 在相关方回档的情况下，子弹扫掠将直接决定子弹命中伤害是否有效；若 `Sphere` 成功命中指定角色，则判定伤害有效。
2. 若子弹具有爆炸效果，扫掠得到的碰撞点将作为爆炸范围的中心。

扫掠行为：
1. 基于请求的起点和终点，确定扫掠方向、扫掠起点与扫掠长度，其中长度会略长于原请求，以确保准确命中。
2. 扫掠时，会采用 `ECC_GameTraceChannel2` ，该 `CollisionChannel` 被子弹本体所忽略，避免子弹干扰扫掠结果。

```
bool ULagCompensationComponent::SweepProjectileHit(const FHitVerificationRequest& Request, FHitResult& OutHit) const
{
	FCollisionQueryParams Params;

	constexpr float ExtensionDistance = 10.0f;
	const FVector TraceDirection = (Request.HitLocation - Request.TraceStart).GetSafeNormal();
	const FVector ExtendedHitLocation = Request.HitLocation + (TraceDirection * ExtensionDistance);

	return GetWorld()->SweepSingleByChannel(
		OutHit,
		Request.TraceStart,
		ExtendedHitLocation,
		FQuat::Identity,
		ECC_GameTraceChannel2,
		FCollisionShape::MakeSphere(Request.ProjectileSphereRadius),
		Params
	);
}
```

### 子弹直接命中验证
当上传的伤害验证信息中，`TargetActor` 为有效角色时，将进行子弹直接命中角色验证：
1. 获取子弹的基础伤害，来源于Character的属性集。
2. 使用 `RewindTargetToHitTime` 恢复命中角色的历史状态。
3. 基于 `SweepProjectileHit` 进行验证，当碰撞有效，且碰撞目标与请求命中目标一致时，判定伤害有效。
4. 恢复指定角色状态。
5. 若伤害有效，施加伤害。

```
void ULagCompensationComponent::ValidateAndApplyDirectHit(const FHitVerificationRequest& Request,
	ABaseCharacter* TargetCharacter, FHitResult& OutVerifiedHit)
{
	const float ProjectileDamage = GetProjectileBaseDamage();
	if (ProjectileDamage <= 0.f) return;

	FRewindContext RewindContext;
	if (!RewindTargetToHitTime(TargetCharacter, Request.HitTime, RewindContext))
	{
		return;
	}

	const bool bDirectHitValidated = VerifyDirectHit(Request, TargetCharacter, OutVerifiedHit);

	RestoreRewoundTarget(RewindContext);

	if (!bDirectHitValidated)
	{
		return;
	}

	ApplyDamage(TargetCharacter, OutVerifiedHit, ProjectileDamage);
}
```

#### 获取子弹伤害
```
float ULagCompensationComponent::GetProjectileBaseDamage() const
{
	const ABaseCharacter* InstigatorCharacter = Cast<ABaseCharacter>(GetOwner());
	if (!InstigatorCharacter) return 0.f;

	const UAbilitySystemComponent* InstigatorASC = InstigatorCharacter->GetAbilitySystemComponent();
	if (!InstigatorASC) return 0.f;

	const UBaseAttributeSet* BaseAttributes = InstigatorASC->GetSet<UBaseAttributeSet>();
	if (!BaseAttributes) return 0.f;

	return BaseAttributes->GetBaseDamage();
}
```

#### 验证碰撞
```
bool ULagCompensationComponent::VerifyDirectHit(const FHitVerificationRequest& Request, ABaseCharacter* TargetCharacter,
	FHitResult& OutHit) const
{
	if (!TargetCharacter)
	{
		return false;
	}

	const bool bValidated = SweepProjectileHit(Request, OutHit);
	return bValidated && (OutHit.GetActor() == TargetCharacter);
}
```
### 爆炸范围伤害验证
当前文中必定存在的扫掠结果为有效碰撞，且子弹属于爆炸子弹，包含预期伤害目标时，进行爆炸伤害验证。
1. 获取爆炸伤害（暂时使用Projectile代替）。
2. 创建 `TArray<FRewindContext>` 对所有相关方进行回档。
3. 验证Sphere碰撞结果，返回记录有效碰撞角色的数组。
4. 恢复所有相关的状态。
5. 遍历有效伤害角色，施加伤害。

```
void ULagCompensationComponent::ValidateAndApplyExplosionHit(
	const FHitVerificationRequest& Request,
	const FHitResult& VerifiedHit)
{
	if (Request.AdditionalTargets.Num() == 0)
	{
		return;
	}

	const float ProjectileDamage = GetProjectileBaseDamage();
	if (ProjectileDamage <= 0.f)
	{
		return;
	}

	TArray<FRewindContext> RewindContexts;
	const bool bRewoundAnyTarget = RewindTargetsToHitTime(
		Request.AdditionalTargets,
		Request.HitTime,
		RewindContexts
	);

	if (!bRewoundAnyTarget)
	{
		return;
	}

	TArray<ABaseCharacter*> RewoundTargets;
	for (const FRewindContext& Context : RewindContexts)
	{
		if (Context.TargetCharacter)
		{
			RewoundTargets.Add(Context.TargetCharacter);
		}
	}

	const TArray<ABaseCharacter*> ValidTargets = VerifyExplosionTargets(RewoundTargets, VerifiedHit);

	RestoreRewoundTargets(RewindContexts);

	for (ABaseCharacter* TargetCharacter : ValidTargets)
	{
		if (!TargetCharacter) continue;

		ApplyDamage(TargetCharacter, VerifiedHit, ProjectileDamage);
	}
}
```

#### 验证碰撞
完成相关方的群体回档后，基于爆炸中心，指定的爆炸半径（暂时硬编码），进行一次针对Pawn的球体碰撞检测，检测得到的列表与请求伤害列表的交集，作为施加伤害的对象，遍历施加伤害。
```
TArray<ABaseCharacter*> ULagCompensationComponent::VerifyExplosionTargets(
	const TArray<ABaseCharacter*>& RewoundTargets,
	const FHitResult& VerifiedHit)
{
	TArray<ABaseCharacter*> ValidTargets;

	if (RewoundTargets.Num() == 0)
	{
		return ValidTargets;
	}

	const FVector ExplosionCenter = VerifiedHit.ImpactPoint;
	constexpr float ExplosionRadius = 300.f;

	TArray<FOverlapResult> Overlaps;

	FCollisionQueryParams Params;
	Params.AddIgnoredActor(GetOwner());

	const bool bOverlap = GetWorld()->OverlapMultiByChannel(
		Overlaps,
		ExplosionCenter,
		FQuat::Identity,
		ECC_Pawn,
		FCollisionShape::MakeSphere(ExplosionRadius),
		Params
	);

	if (!bOverlap)
	{
		return ValidTargets;
	}

	TSet<AActor*> OverlappedActors;

	for (const FOverlapResult& Result : Overlaps)
	{
		if (AActor* Actor = Result.GetActor())
		{
			OverlappedActors.Add(Actor);
		}
	}

	for (auto TargetActor : RewoundTargets)
	{
		if (!TargetActor) continue;

		if (OverlappedActors.Contains(TargetActor))
		{
			ValidTargets.Add(TargetActor);
		}
	}

	return ValidTargets;
}
```

## 施加伤害
```
void ULagCompensationComponent::ApplyDamage(const ABaseCharacter* TargetCharacter, const FHitResult& HitResult, const float Damage)
{
	if(!TargetCharacter)return;
	UAbilitySystemComponent* TargetASC = TargetCharacter->GetAbilitySystemComponent();
	if(!TargetASC)return;
	OwnerCharacter = OwnerCharacter == nullptr ? Cast<ABaseCharacter>(GetOwner()) : OwnerCharacter.Get();
	if(!OwnerCharacter || !OwnerCharacter->HasAuthority())return;
	OwnerASC = OwnerASC == nullptr ? OwnerCharacter->GetAbilitySystemComponent() : OwnerASC.Get();
	if(!OwnerASC) return;

	FGameplayEffectContextHandle ContextHandle = OwnerASC->MakeEffectContext();
	ContextHandle.AddHitResult(HitResult);
	FGameplayEffectSpecHandle SpecHandle = OwnerASC->MakeOutgoingSpec(GE_ProjectileDamage, 1.f, ContextHandle);
	if(SpecHandle.IsValid())
	{
		SpecHandle.Data->SetSetByCallerMagnitude
			(FGameplayTag::RequestGameplayTag(FName("Data.Damage")), Damage);
		OwnerASC->ApplyGameplayEffectSpecToTarget(*SpecHandle.Data.Get(), TargetASC);
	}
}
```
