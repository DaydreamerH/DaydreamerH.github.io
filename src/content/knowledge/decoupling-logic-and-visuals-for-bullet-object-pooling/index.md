---
title: "Decoupling Logic and Visuals for Bullet Object Pooling"
description: "尝试引入对象池技术管理多人TPS下的子弹，关于子弹同步，逻辑与视觉效果拆分的问题的预想方案。"
date: "2025-12-21 16:13:42"
category: "Unreal / Gameplay"
originalCategory: "UE相关"
track: "Game Development"
level: foundation
status: ready
published: true
minutes: 5
order: 1000
prerequisites: []
tags: ["UE"]
photos: "banner.gif"
source: "_posts"
---由于此前的测试的游戏项目，在面临多人同时开火的场景时，会出现掉帧的情况，势必要对已有的子弹生成的逻辑进行修改。

## 子弹类
在本项目中，子弹以`ABaseProjectile`存在，并为一个角色派生了一个特殊的子弹子类。

```
// #include ...

class ABaseCharacter;
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnPredictedProjectileDestroyed, const FPredictionKey&, PredictionKey);

struct FGameplayCueTag;
class UGameplayEffect;
class AFieldSystemActor;
class ADecalActor;
class USphereComponent;
class UNiagaraSystem;
class UProjectileMovementComponent;

UCLASS()
class HEROSHOOTERS_API ABaseProjectile : public AActor
{
	GENERATED_BODY()
public:
	ABaseProjectile();
	virtual void Tick(float DeltaTime) override;

	void InitDamage(float d);

	FOnPredictedProjectileDestroyed OnPredictedProjectileDestroyed;

	void SetPredictionKey(const FPredictionKey& Key);
protected:
	virtual void BeginPlay() override;

	void OnPredictedHit(const FHitResult& Hit, ABaseCharacter* Character);
	void OnAuthoritativeHit(const FHitResult& Hit, ABaseCharacter* SourceCharacter);

	virtual FGameplayTag GetImpactCueTag(UAbilitySystemComponent* SourceASC, const FHitResult& Hit);
	void PlayImpactCue(ABaseCharacter* SourceCharacter, const FHitResult& Hit, bool bLocal = false);

	void ApplyProjectileDamage(ABaseCharacter* SourceCharacter, const FHitResult& Hit);
public:
	UPROPERTY(EditDefaultsOnly)
	TObjectPtr<UStaticMeshComponent> ProjectileMesh;
	UPROPERTY(EditDefaultsOnly)
	TObjectPtr<USphereComponent> CollisionComponent;

	UPROPERTY(EditDefaultsOnly)
	UProjectileMovementComponent* ProjectileMovementComponent;
	UPROPERTY(EditAnywhere)
	float InitialSpeed = 100000.f;
	UPROPERTY(EditAnywhere)
	float GravityScale = 0.f;

	UPROPERTY(EditDefaultsOnly)
	TObjectPtr<UNiagaraSystem> TrailSystem;

	UPROPERTY(EditDefaultsOnly)
	TSubclassOf<UGameplayEffect> GE_ProjectileDamage;

	UPROPERTY(EditDefaultsOnly)
	FGameplayTag DefaultCueTag;
	UPROPERTY(EditDefaultsOnly)
	FGameplayTag GlassCueTag;
	UPROPERTY(EditDefaultsOnly)
	FGameplayTag PlayerCueTag;
	UPROPERTY(EditDefaultsOnly)
	FGameplayTag RiptideCueTag;

	virtual bool IsNetRelevantFor(const AActor* RealViewer,
		const AActor* ViewTarget, const FVector& SrcLocation) const override;
private:
	UFUNCTION()
	void OnProjectileHit(UPrimitiveComponent* HitComp, AActor* OtherActor,
					 UPrimitiveComponent* OtherComp, FVector NormalImpulse,
					 const FHitResult& Hit);

	float Damage = 0.f;

	UPROPERTY()
	FPredictionKey AssociatedPredictionKey;
};
```

原有子弹由三类核心功能所构成：演出+预测+伤害判定。

### 演出
子弹的演出由以下要素构成：
- 子弹的静态网格体。
- 子弹的轨迹粒子系统。
- 子弹命中时所选择的命中演出效果。

### 预测
对于高网络延迟的客户端，如果每一次开火都需要经过服务器确认再生成子弹，势必会造成卡手的不良体验，关于子弹预测的内容，可以在 [Implementation of a Local Firing Prediction Mechanism in Multiplayer TPS with Unreal Engine GAS](https://daydreamerh.github.io/2025/11/10/Implementation%20of%20a%20Local%20Firing%20Prediction%20Mechanism%20in%20Multiplayer%20TPS%20with%20Unreal%20Engine%20GAS/) 看到更详细的介绍。

### 伤害判定
子弹的碰撞分为两类：预测碰撞与权威碰撞。
- 预测碰撞：子弹拥有者所在客户端，本地预测性子弹发生碰撞生成及时性的碰撞演出效果。
- 权威碰撞：服务器权威子弹碰撞，将造成伤害，并触发且同步给所有客户端碰撞演出效果。

权威子弹在服务器一经生成便获得伤害数值，并被设置为`replicate`，同步给非子弹拥有者所在的所有其他客户端。

权威子弹在服务器命中玩家，则会额外施加一个伤害效果。

## 对象池
在UE中，对于子弹这类生命周期短、生成频繁的`Actor`，不断`Spawn`和`Destroy`的开销非常大，尤其考虑到多人场景下，这类子弹还存在着大量的同步，将带来巨大的性能消耗，引入对象池技术缓解这类开销是非常重要的。

首先考虑简单单人场景下的对象池，我们只需要在`PoolManager`中预先生成大量子弹，当玩家开火时，将`Spawn`与`Destroy`行为更换为`Active`与`InActive`即可：
- 激活对象：对象可见+开启碰撞+对象transform+对象速度+对象伤害+开启粒子效果等。
- 空闲对象：对象不可见+关闭碰撞+速度清零+清空伤害属性+关闭粒子效果等。

这样，每次开火，从列表中寻找空闲子弹激活即可。

但对于多人游戏场景中，这类方法过于简单。

## 方案一：直接引入对象池
在现有的子弹生成逻辑下直接引入对象池有许多问题。

该方案的实现过程如下：
- 实现对象池管理对象的基类，引入两个接口用于激活、空闲对象。
- 子弹继承该基类，并重写相应接口。
- 实现`PoolManager`，预先生成子弹。
- 将已有代码中的所有子弹`Spawn`与`Destroy`更换为`Active`与`InActive`.

假设此时有三名玩家C1 C2 S，分别代表客户端1 客户端2 服务器（房主），那么：
1. C1申请开火，本地预测性`Active`子弹，向服务器发送请求命令。
2. S接收命令，`Active`权威子弹，该子弹具备同步属性，向C2发出同步信息。
3. C2接收同步信息，需要生成子弹。

在C2，不能直接使用对象池已有的子弹，按照引擎的逻辑需要同步生成一个新的子弹。

多人射击游戏中，假设玩家开火频率一致，这么做会导致大量的子弹仍然需要一个生成、销毁开销。

## 方案二：放弃子弹同步
如果需要充分使用对象池，意味着每个客户端的子弹严格意义上都是独一无二的，相互之间难以同步。

在方案一的基础上，我们选择放弃子弹的同步，转为只同步生成这一行为。

由于本项目在GAS框架下开发，如果只同步生成子弹的行为，我们可以将该操作交给`GameplayCue`来做：在管理开火演出效果的`Cue`中，额外增加子弹生成的命令，子弹生成的数据（例如transform、速度等）来源于技能给予。

当`Cue`实现子弹生成时，使用对象池来进行；而当子弹销毁时，调用`InActive`实现。

但这又带来了分工不明确的问题，由于服务器子弹同时具备视觉效果与伤害逻辑两个功能，把这个内容放在`Cue`中实现，显得职责混乱。

## 最终方案：拆分子弹与伤害逻辑
为了使得`GameplayCue`只具备演出职责，不参与数字逻辑计算，我们不得不将子弹的职责进行拆分。

子弹将只负责演出效果，不参与任何伤害计算；判断命中玩家，造成伤害的行为，交由射线检测或多段射线检测来实现。

由此，我们将按照以下步骤完成该方案：
1. 重新整理子弹的功能：
   - 移除伤害施加。
   - 移除本地预测回滚。
   - 实现`Active` `InActive`接口。
2. 实现对象池管理类。
3. 开火技能：
   - 移除预测子弹存储。
   - 移除子弹生成。
   - 将相关数据传递给`GameplayCue`.
   - 开启射线伤害检测。
4. GameplayCue：
   - 从对象池中取得子弹，按参数生成。

这样实现后，所有子弹均为本地执行，放弃了子弹的同步，放弃了子弹碰撞进行伤害判断；服务器将额外进行射线检测来对伤害进行判断；完成了职责的重新划分，有效降低了子弹反复生成、摧毁的开销。

本方案等价于将“子弹”降级为纯客户端演出单元，将“命中与伤害”上升为服务器权威判定逻辑，以牺牲严格物理一致性为代价，换取可预测的性能与清晰的系统边界。

此外，考虑到Cue的同步存在网络延迟，子弹生成的位置与状态需要预演。
