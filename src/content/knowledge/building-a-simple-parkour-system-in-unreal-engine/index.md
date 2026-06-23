---
title: "Building a Simple Parkour System in Unreal Engine"
description: "一个简单的攀爬模块实现"
date: "2025-11-15 22:29:13"
category: "Unreal / Gameplay"
originalCategory: "UE相关"
track: "Game Development"
level: intermediate
status: ready
published: true
minutes: 5
order: 1000
prerequisites: []
tags: ["UE", "MotionWarping", "C++"]
photos: "banner.jpg"
source: "_posts"
---![](result.gif)

# UE5 实现一个简单的攀爬（Parkour）模块 —— 代码解析与系统说明

在这篇文章中，我将通过一个完整的 `ParkourComponent` 代码实现，介绍如何在 UE 中实现一个基础但稳定的攀爬系统。本系统支持：

- 前方检测墙体
- 自动判断攀爬类型（Jump / Mantle / Climb / Vault）
- 自动计算目标点并使用 Motion Warping 对齐动画
- 在攀爬过程中自动控制摄像机与角色输入

本文会结合核心代码对整个系统进行详细说明，帮助你快速了解 UE 中一个可扩展的攀爬系统是如何实现的。

# 一、系统总体设计概述

整个攀爬模块基于三个阶段：

## **1. 环境检测（Three-step Tracing）**

进入攀爬前，系统使用三类球形 Sweep 探测来判断是否能够攀爬且属于什么类型：

1. **Forward Trace**：检测前方是否存在墙体
2. **Vertical Trace（Top）**：检测墙顶位置，计算墙体高度
3. **Vertical Trace（Thickness）**：检测墙体厚度与可站立区域

最终决定包含：

- WallNormal（墙体法线）
- WallRotation（面对墙体的旋转）
- WallHeight（墙高）
- WallTopLocation（墙顶位置）
- WallEndLocation（墙后落点）
- WallIsThick（墙是否够厚）

## **2. 动作选择（Parkour Type Decision）**

系统根据墙的高度决定不同动作：

```cpp
if (WallHeight < 150.f)
    ParkourType = EParkourType::Jump;
else if (WallHeight < 250.f)
    ParkourType = EParkourType::Climb;
```

## **3. 动作执行（Motion Warping + Camera + Input）**

包括：

- 设置 Motion Warping 的 Start / End 目标点
- 根据动画需求动态偏移位置（Offset）
- 攀爬期间关闭部分输入
- 使摄像机自动跟随角色旋转

动画过程会非常平滑自然。

# 二、三次关键射线检测分析

攀爬系统最关键的逻辑是三次球形 Sweep 探测，下面详细分析其作用与实现。

## **1. Forward Trace（前向检测）**

### **目的：检测前方是否有墙体**

```cpp
StartLocation = Character->GetActorLocation() - FVector(0,0,20);
EndLocation   = StartLocation + Character->GetActorForwardVector() * 50;
```

用途：

- 判断是否有可攀爬墙体
- 获取墙体法线 ImpactNormal
- 获取墙体旋转（用于 Motion Warping）
- 若撞到 Pawn 则不进行攀爬

检测到墙体后：

```cpp
WallLocation = HitResult.ImpactPoint;
WallNormal   = HitResult.ImpactNormal;
WallRotation = MakeRotFromX(-WallNormal);
```

## **2. Vertical Trace（检测墙体高度）**

### **目的：找出墙顶位置与墙高**

顶部向下 Sweep：

```cpp
Start = EndLocation + FVector(0,0,900);
End   = WallLocation - WallNormal * Scale;
```

若检测到顶部：

```cpp
WallTopLocation = HitResult.ImpactPoint;
WallHeight = WallTopLocation.Z - 角色脚底Z;
```

并绘制调试球：

```cpp
DrawDebugSphere(..., FColor::Magenta);
```

## **3. Vertical Trace（检测墙体厚度）**

### **目的：判断墙体是否有足够厚度用于落脚**

使用 Scale = 65.f 再 Sweep 一次：

```cpp
VerticalTrace(65.f)
```

判断墙是否够厚：

```cpp
WallIsThick = HitResult.bBlockingHit &&
               WallEndLocation.Z >= (WallTopLocation.Z - 5);
```

厚墙通常用于 Mantle，而薄墙可用于 Vault。

# 三、Motion Warping 使用与目标点计算

Motion Warping 的作用是让动画的 Root Motion 自动对齐到环境的真实位置。

系统设置两个 Warp Target：

- **Start**：动作开始点
- **End**：动作结束点（最终要站的位置）

```cpp
MotionWarpingComponent->AddOrUpdateWarpTargetFromLocationAndRotation(
    "Start", StartLocation, WallRotation);

MotionWarpingComponent->AddOrUpdateWarpTargetFromLocationAndRotation(
    "End", EndLocation, WallRotation);
```

## **Offset 的作用：微调位置以匹配最真实的攀爬效果**

```cpp
WarpOffset(StartLocation, StartForwardOffset, StartUpOffset);
WarpOffset(EndLocation, EndForwardOffset, EndUpOffset);
```

### 为什么需要 Offset？

动画中的 Root Motion 与关卡环境永远不可能百分之百匹配。
因此必须通过 Offset 手动微调：

### ✔ UpOffset（上下调节）

- **角色在动画结束时高于实际墙面 → 使用负的 UpOffset**
- **角色陷入墙体或位置偏低 → 增加 UpOffset**

示例：

- `UpOffset = -10` → 下移 10 cm
- `UpOffset = 15` → 上移 15 cm

### ✔ ForwardOffset（前后调节）

- **角色在动作开始时离墙太近 → 减少 ForwardOffset**
- **角色陷入墙体 → 增加 ForwardOffset**
- **攀爬动作起跳不自然 → 调整 ForwardOffset 让站位更正确**

Offset 的存在极大提高了 Motion Warping 的“容错性”，让你能适配各种不同动画和场景尺寸。

# 四、攀爬过程中的摄像机控制

攀爬过程中，不希望玩家乱转视角导致动作不自然，因此本系统加入了摄像机与输入控制。

## **1. 进入攀爬时的设置**

```cpp
Character->DisableInput();
Character->CameraBoom->bDoCollisionTest = false;
Character->bUseControllerRotationYaw = false;
```

效果：

- 禁用玩家移动输入
- 关闭摄像机碰撞避免抖动
- 摄像机通过 Lag 平滑跟随角色旋转

## **2. Tick 中锁定 Controller 的 Yaw**

攀爬时角色面向墙体，而控制器方向可能不同，需要同步：

```cpp
ControlRot.Yaw = Character->GetActorRotation().Yaw;
Controller->SetControlRotation(ControlRot);
```

避免：

- 摄像机回弹
- 动作结束后瞬间旋转

## **3. 离开攀爬时恢复默认设置**

```
Character->EnableInput();
Character->CameraBoom->bDoCollisionTest = true;
Character->bUseControllerRotationYaw = true;
```

并同步一次摄像机角度，保证退出攀爬时画面平滑。

# 五、ParkourComponent
这里是跑酷组件的代码，后续将跑酷组件的功能部分分解到GAS框架下。

```
#include "Components/ParkourComponent.h"
#include "GameFramework/Character.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "DrawDebugHelpers.h"
#include "Characters/BaseCharacter.h"
#include "Components/CapsuleComponent.h"
#include "GameFramework/SpringArmComponent.h"
#include "Kismet/KismetMathLibrary.h"

UParkourComponent::UParkourComponent()
{
	PrimaryComponentTick.bCanEverTick = true;
	SphereTraceRadius = 15.f;
}

EParkourType UParkourComponent::GetParkourType()
{
	if (ACharacter* Character = Cast<ACharacter>(GetOwner()))
	{
		const FHitResult HitResult = ForwardTrace();
		if (!HitResult.IsValidBlockingHit())
			return EParkourType::Jump;

		if (Cast<APawn>(HitResult.GetActor()))
			return EParkourType::None;

		WallLocation = HitResult.ImpactPoint;
		WallNormal = HitResult.ImpactNormal;
		WallRotation = UKismetMathLibrary::MakeRotFromX(-WallNormal);

		CalWallHeight();
		CalWallThickness();

		if (GEngine)
		{
			GEngine->AddOnScreenDebugMessage(
				-1, 1.f, FColor::Green,
				FString::Printf(TEXT("WallHeight: %.2f, WallIsThick: %d"), WallHeight, WallIsThick)
			);
		}

		EParkourType ParkourType = EParkourType::Jump;

		if (WallHeight < 150.f)
		{
			ParkourType = EParkourType::Jump;
		}
		/*else if (WallHeight < 150.f)
		{
			/*if (WallIsThick)
				ParkourType = EParkourType::Mantle;
			else
				ParkourType = EParkourType::Vault;#1#
		}*/
		else if (WallHeight < 250.f)
		{
			ParkourType = EParkourType::Climb;
		}

		if (ParkourType != EParkourType::Jump && ParkourType != EParkourType::None)
		{
			SetMotionWarpingTargets(ParkourType);
			SetParkourState(true);

			UAnimMontage* MontageToPlay = nullptr;
			switch (ParkourType)
			{
				case EParkourType::Mantle: MontageToPlay = MantleMontage; break;
				case EParkourType::Vault:  MontageToPlay = VaultMontage; break;
				case EParkourType::Climb:  MontageToPlay = ClimbMontage; break;
				default: break;
			}

			if (MontageToPlay && Character->GetMesh()->GetAnimInstance())
			{
				FOnMontageEnded MontageEndedDelegate;
				MontageEndedDelegate.BindLambda([this](UAnimMontage*, bool)
				{
					SetParkourState(false);
				});

				Character->PlayAnimMontage(MontageToPlay);
				Character->GetMesh()->GetAnimInstance()->Montage_SetEndDelegate(MontageEndedDelegate, MontageToPlay);
			}
		}

		return ParkourType;
	}

	return EParkourType::Jump;
}

void UParkourComponent::BeginPlay()
{
	Super::BeginPlay();
}

void UParkourComponent::TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction)
{
	Super::TickComponent(DeltaTime, TickType, ThisTickFunction);

	if (bIsInParkour)
	{
		if (ACharacter* Character = Cast<ACharacter>(GetOwner()))
		{
			if (AController* Controller = Character->GetController())
			{
				FRotator ControlRot = Controller->GetControlRotation();
				ControlRot.Yaw = Character->GetActorRotation().Yaw;
				Controller->SetControlRotation(ControlRot);
			}
		}
	}

}

FHitResult UParkourComponent::ForwardTrace()
{
	if (!GetWorld()) return FHitResult();

	if (ACharacter* Character = Cast<ACharacter>(GetOwner()))
	{
		if (Character->GetCharacterMovement() && Character->GetCharacterMovement()->IsMovingOnGround())
		{
			FHitResult HitResult;
			FVector StartLocation = Character->GetActorLocation() - FVector(0.f, 0.f, 20.f);
			FVector EndLocation = StartLocation + Character->GetActorForwardVector() * 50.f;

			FCollisionQueryParams TraceParams;
			TraceParams.bTraceComplex = true;
			TraceParams.AddIgnoredActor(GetOwner());

			GetWorld()->SweepSingleByChannel(
				HitResult,
				StartLocation,
				EndLocation,
				FQuat::Identity,
				ECollisionChannel::ECC_Visibility,
				FCollisionShape::MakeSphere(SphereTraceRadius),
				TraceParams
			);

			DrawDebugSphere(GetWorld(), StartLocation, SphereTraceRadius, 16, FColor::Blue, false, 1.f);
			DrawDebugSphere(GetWorld(), EndLocation, SphereTraceRadius, 16, FColor::Blue, false, 1.f);
			DrawDebugLine(GetWorld(), StartLocation, EndLocation, FColor::Cyan, false, 1.f, 0, 2.f);

			if (HitResult.IsValidBlockingHit())
			{
				DrawDebugSphere(GetWorld(), HitResult.Location, SphereTraceRadius * 1.2f, 16, FColor::Red, false, 1.f);
				DrawDebugLine(GetWorld(), HitResult.Location, HitResult.Location + HitResult.Normal * 40.f, FColor::Green, false, 1.f, 0, 2.f);
			}*/

			return HitResult;
		}
	}
	return FHitResult();
}

void UParkourComponent::VerticalTrace(float Scale, FHitResult& HitResult, bool bTopToDown)
{
	FVector EndLocation;
	FVector StartLocation;
	if(bTopToDown)
	{
		EndLocation = WallLocation - WallNormal * Scale;
		StartLocation = EndLocation + FVector(0.f, 0.f, 900.f);
	}
	else
	{
		StartLocation = WallLocation - WallNormal * Scale;
		EndLocation = StartLocation + FVector(0.f, 0.f, 900.f);
	}

	/*DrawDebugLine(GetWorld(), StartLocation, EndLocation, FColor::Yellow, false, 100.f, 0, 2.f);*/

	FCollisionQueryParams TraceParams;
	TraceParams.bTraceComplex = true;
	TraceParams.AddIgnoredActor(GetOwner());

	GetWorld()->SweepSingleByChannel(
		HitResult,
		StartLocation,
		EndLocation,
		FQuat::Identity,
		ECollisionChannel::ECC_WorldStatic,
		FCollisionShape::MakeSphere(SphereTraceRadius),
		TraceParams
	);

	/*DrawDebugSphere(GetWorld(), StartLocation, SphereTraceRadius, 16, FColor::Yellow, false, 100.f);
	DrawDebugSphere(GetWorld(), EndLocation, SphereTraceRadius, 16, FColor::Yellow, false, 100.f);
	DrawDebugLine(GetWorld(), StartLocation, EndLocation, FColor::Orange, false, 100.f, 0, 2.f);
	*/

	if (HitResult.IsValidBlockingHit())
	{
		DrawDebugSphere(GetWorld(), HitResult.Location, SphereTraceRadius * 1.2f, 16, FColor::Cyan, false, 100.f);
	}
}

void UParkourComponent::CalWallHeight()
{
	if (!GetWorld()) return;

	FHitResult HitResult;
	VerticalTrace(5.f, HitResult);

	if (ACharacter* Character = Cast<ACharacter>(GetOwner());
		Character && HitResult.IsValidBlockingHit())
	{
		WallTopLocation = HitResult.ImpactPoint;
		WallHeight = WallTopLocation.Z -
			(Character->GetActorLocation().Z - Character->GetCapsuleComponent()->GetScaledCapsuleHalfHeight());

		DrawDebugSphere(GetWorld(), WallTopLocation, SphereTraceRadius, 16, FColor::Magenta, false, 1.f);
	}
	else
	{
		WallTopLocation = FVector::ZeroVector;
		WallHeight = 0.f;
	}
}

void UParkourComponent::CalWallThickness()
{
	if (!GetWorld()) return;

	FHitResult HitResult;
	VerticalTrace(65.f, HitResult);
	WallEndLocation = HitResult.bBlockingHit ? HitResult.ImpactPoint : WallTopLocation;
	WallIsThick = HitResult.bBlockingHit && WallEndLocation.Z >= (WallTopLocation.Z-5.f);
}

void UParkourComponent::SetMotionWarpingTargets(EParkourType ParkourType)
{
	if(ABaseCharacter* BaseCharacter = Cast<ABaseCharacter>(GetOwner()))
	{
		if(UMotionWarpingComponent* MotionWarpingComponent = BaseCharacter->MotionWarpingComponent)
		{
			float StartForwardOffset;
			float StartUpOffset;
			float EndForwardOffset;
			float EndUpOffset;

			FVector StartLocation = WallTopLocation;
			FVector EndLocation = WallEndLocation;

			switch (ParkourType)
			{
			case EParkourType::Mantle:
				StartForwardOffset = MantleStartForwardOffset;
				EndForwardOffset = MantleEndForwardOffset;
				StartUpOffset = MantleStartUpOffset;
				EndUpOffset = MantleEndUpOffset;
				break;

			case EParkourType::Climb:
				StartForwardOffset = ClimbStartForwardOffset;
				EndForwardOffset = ClimbEndForwardOffset;
				StartUpOffset = ClimbStartUpOffset;
				EndUpOffset = ClimbEndUpOffset;
				break;

			case EParkourType::Vault:
				StartForwardOffset = VaultStartForwardOffset;
				EndForwardOffset = VaultEndForwardOffset;
				StartUpOffset = VaultStartUpOffset;
				EndUpOffset = VaultEndUpOffset;
				break;

			default:
				StartForwardOffset = 0.f;
				EndForwardOffset = 0.f;
				StartUpOffset = 0.f;
				EndUpOffset = 0.f;
				break;
			}
			WarpOffset(StartLocation, StartForwardOffset, StartUpOffset);
			WarpOffset(EndLocation, EndForwardOffset, EndUpOffset);

			MotionWarpingComponent->AddOrUpdateWarpTargetFromLocationAndRotation
				(FName("Start"), StartLocation, WallRotation);
			MotionWarpingComponent->AddOrUpdateWarpTargetFromLocationAndRotation
				(FName("End"), EndLocation, WallRotation);

			if (GEngine)
			{
				GEngine->AddOnScreenDebugMessage(
					-1, 3.f, FColor::Cyan,
					FString::Printf(TEXT("StartLocation: X=%.2f Y=%.2f Z=%.2f"),
						StartLocation.X, StartLocation.Y, StartLocation.Z)
				);
				GEngine->AddOnScreenDebugMessage(
					-1, 3.f, FColor::Yellow,
					FString::Printf(TEXT("EndLocation: X=%.2f Y=%.2f Z=%.2f"),
						EndLocation.X, EndLocation.Y, EndLocation.Z)
				);
			}
		}
	}
}

void UParkourComponent::WarpOffset(FVector& Location, float ForwardOffset, float UpOffset)
{
	Location.Z += UpOffset;
	Location += UKismetMathLibrary::GetForwardVector(WallRotation) * ForwardOffset;
}

void UParkourComponent::SetParkourState(bool bInParkour)
{
	bIsInParkour = bInParkour;
	if(ABaseCharacter* Character = Cast<ABaseCharacter>(GetOwner()))
	{
		if(bInParkour)
		{
			Character->DisableInput(Character->GetController<APlayerController>());
			Character->GetCharacterMovement()->SetMovementMode(MOVE_Flying);
			Character->GetCapsuleComponent()->SetCollisionEnabled(ECollisionEnabled::NoCollision);
			Character->CameraBoom->bDoCollisionTest = false;
			Character->bUseControllerRotationYaw = false;
			Character->CameraBoom->bEnableCameraRotationLag = true;
			Character->CameraBoom->CameraRotationLagSpeed = 10.f;
		}
		else
		{
			Character->EnableInput(Character->GetController<APlayerController>());
			Character->GetCharacterMovement()->SetMovementMode(MOVE_Walking);
			Character->GetCapsuleComponent()->SetCollisionEnabled(ECollisionEnabled::QueryAndPhysics);
			if (AController* Controller = Character->GetController())
			{
				FRotator ControlRot = Controller->GetControlRotation();
				ControlRot.Yaw = Character->GetActorRotation().Yaw;
				Controller->SetControlRotation(ControlRot);
			}
			Character->CameraBoom->bDoCollisionTest = true;
			Character->bUseControllerRotationYaw = true;
			Character->CameraBoom->bEnableCameraRotationLag = false;
			Character->CameraBoom->CameraRotationLagSpeed = 10.f;
		}
	}
}

```
