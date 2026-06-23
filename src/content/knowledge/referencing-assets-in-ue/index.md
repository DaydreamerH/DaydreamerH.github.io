---
title: "Referencing Assets In UE"
description: ""
date: "2026-05-31 19:42:36"
category: "Unreal / Gameplay"
originalCategory: "UE Gameplay LAB"
track: "Game Development"
level: foundation
status: ready
published: true
minutes: 5
order: 1000
prerequisites: []
tags: ["UE", "C++"]
photos: "banner.png"
source: "_posts"
---UE 提供了多种机制来控制资产的引用方式，进而控制其如何被加载到内存中：
- 硬引用：对象 A 引用了对象 B，当对象 A 被加载时，会导致对象 B 也自动加载到内存中。
- 软引用：对象 A 通过一种间接的机制来引用对象 B.

## 硬引用
只要对象被加载和实例化，它硬引用的所有资产也会被同步加载。

需要进行谨慎设计，避免加载过多资产导致内存占用暴涨。
### 直接属性引用
这是资产引用中最常见的一种情况，通过 `UPROPERTY` 宏暴露给编辑器。

```
// AStrategyBuilding Class
UPROPERTY(EditDefaultsOnly, Category=Building)
USoundCue* ConstructionStartStinger;
```

- 编辑器限制：该属性只能作为对象的默认属性的一部分进行设置。
- 工作流程：设计师会创建一个继承自 `AStrategyBuilding` 的新蓝图类，然后将他们想要的声音资产保存到该蓝图中。
- 内存行为：每当设计师创建的这个蓝图类被加载时，它在 `UPROPERTY` 中引用的声音资产也会自动被加载到内存中。

### 构造时引用
程序员明确直到某个属性需要加载哪个特定资产，并在对象构造阶段直接设置该属性。

这需要使用 `ConstructHelpers`，它专用于在对象的构造阶段寻找资产和类。
```
/** 灰色生命条纹理 */
UPROPERTY()
class UTexture2D* BarFillTexture;

AStrategyHUD::AStrategyHUD(const FObjectInitializer& ObjectInitializer)
    : Super(ObjectInitializer)
{
    static ConstructorHelpers::FObjectFinder<UTexture2D>
        BarFillObj(TEXT("/Game/UI/HUD/BarFill"));
    ...
    BarFillTexture = BarFillObj.Object;
    ...
}
```
- 工作原理：在上述构造函数中，`ConstructHelpers` 类会尝试在内存中查找该资产，如果找不到就会进行加载。这里必须使用资产的完整硬编码路径来指定加载对象。
- 崩溃风险：如果资产不存在，或者因为程序导致加载失败，该属性将被设置为 `nullptr`。
- 如果后续代码默认该引用必然有效，最好在赋值后立即加上断言，确保资产已经成功加载。

## 软引用
### 间接属性引用
控制资产加载时机的一种简单方法是使用 `TSoftObjectPtr`. 对设计师而言，它的使用体验与直接属性引用完全相同。

在底层，该属性并不存储直接指针，而是存储为一个字符串，并配合模板代码来安全地检查资产是否已被加载。

可以使用 `IsPending()` 方法来检查资产是否已准备好被访问。需要注意的是，使用 `TSoftObjectPtr` 要求你在需要使用该资产时手动进行加载。

可以使用 `LoadObject<>()` `StaticLoadObject()` `FStreamableManager` 加载对象。前两种方法会进行同步加载，这可能会导致游戏帧率卡顿。

```
UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category=Building)
TSoftObjectPtr<UStaticMesh> BaseMesh;

UStaticMesh* GetLazyLoadedMesh()
{
    // 检查资产是否未加载（处于挂起状态）
    if (BaseMesh.IsPending())
    {
        const FSoftObjectPath& AssetRef = BaseMesh.ToStringReference();
        // 使用同步加载方式将其加载到内存中
        BaseMesh = Cast<UStaticMesh>(Streamable.SynchronousLoad(AssetRef));
    }
    return BaseMesh.Get();
}
```

上述代码使用 `UStaticMesh` 的 `TSoftObjectPtr` 在运行时实现静态网格体的延迟加载。

代码首先检查该资产是否已被加载。如果尚未加载，则使用 `FStreamableManager`（代码中的 `Streamable` 对象）进行同步加载；如果已经加载，则直接将 `TSoftObjectPtr` 内部的 `UStaticMesh` 指针返回给调用者。

如果希望延迟加载一个 `UClass`，可以使用类似的处理方法，只需将 `TSoftObjectPtr` 替换为 `TSoftClassPtr`.

#### 流式传输管理器与异步加载
`FStreamableManager` 在创建时，最好将其放置在某种全局游戏单例对象中，如 DefaultEngine.ini 中通过 `GameSingletonClassName` 指定的自定义全局单例类。

常用两种方式进行加载：
- `SynchronousLoad`：会执行一次简单的阻塞式加载并返回对象；对小型对象可能影响不大，但可能阻塞主线程。
- `RequestAsyncLoad`：异步加载一组资产，并在加载完成后调用委托。
```
void UGameCheatManager::GrantItems()
{
    TArray<FSoftObjectPath> ItemsToStream;
    // 获取全局单例中的 StreamableManager
    FStreamableManager& Streamable = UGameGlobals::Get().StreamableManager;

    for(int32 i = 0; i < ItemList.Num(); ++i)
    {
        ItemsToStream.AddUnique(ItemList[i].ToStringReference());
    }

    // 请求异步加载，并在完成后触发 GrantItemsDeferred 委托
    Streamable.RequestAsyncLoad(ItemsToStream, FStreamableDelegate::CreateUObject(this, &UGameCheatManager::GrantItemsDeferred));
}

void UGameCheatManager::GrantItemsDeferred()
{
    // 此时所有资产已加载完毕，可以安全访问
    for(int32 i = 0; i < ItemList.Num(); ++i)
    {
        UGameItemData* ItemData = ItemList[i].Get();
        if(ItemData)
        {
            MyPC->GrantItem(ItemData);
        }
    }
}
```
`ItemList` 是一个由设计师在编辑器中配置的 `TArray< TSoftObjectPtr<UGameItem> >`。代码遍历该列表，将它们转换为字符串引用，然后将它们排入加载队列。当所有这些道具都加载完毕（或因丢失而加载失败）后，它会调用传入的委托。该委托随后遍历相同的道具列表，对它们进行解引用并提供给 `MyPC`。

`StreamableManager` 会在委托被调用之前，对它正在加载的所有资产保持硬引用；所以，在委托被触发之前，等待异步加载的任何对象都不会被垃圾回收系统回收。

一旦委托被调用结束，`StreamableManager` 就会释放这些硬引用。因此，如果你想确保这些资产继续留在内存中，你必须在其他地方（例如玩家的背包、组件属性中）建立起对它们的硬引用。

### 查找/加载对象
如果想要在运行时构建一个路径字符串，并用它来获取对象的引用，则需要使用 `FindObject<>()` `LoadObject<>()`：
- `FindObject<>()`： 如果你只想在对象已经被加载或创建的情况下使用它，这是正确的选择。
- `LoadObject<>()`： 如果对象尚未加载，而你希望将其加载进来，则应选择此函数。

`LoadObject<>()` 在底层会自动执行与 `FindObject` 等价的操作，因此你没有必要先尝试查找对象再去加载它，直接调用 `LoadObject<>()` 即可。

```
// 示例 1：在内存中查找现有的功能测试对象
AFunctionalTest* TestToRun = FindObject<AFunctionalTest>(TestsOuter, *TestName);

// 示例 2：如果默认网格纹理不在内存中，则将其加载进来
GridTexture = LoadObject<UTexture2D>(NULL, TEXT("/Engine/EngineMaterials/DefaultWhiteGrid.DefaultWhiteGrid"), NULL, LOAD_None, NULL);
```

在加载 `UClass` 时，虚幻引擎提供了一个特化版本的函数：`LoadClass<>()`。这是一种更简便的加载类的方法，并且它会自动进行类型验证。
```
DefaultPreviewPawnClass = LoadClass<APawn>(NULL, *PreviewPawnName, NULL, LOAD_None, NULL);
```
