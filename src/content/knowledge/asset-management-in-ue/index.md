---
title: "Asset Management In UE"
description: "资产管理"
date: "2026-06-08 21:32:19"
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
---
UE 会自动处理资产的加载与卸载，这为开发者提供了一种告知引擎合适需要某个资产的方法。

在某些情况下，可能需要精确控制资产的发现、加载和审计的时机与方式；针对这些场景，资产管理器可以提供帮助。

资产管理器是一个独特的全局对象，存在于编辑器和已打包的游戏中；它可以被项目重写和自定义，并提供一个管理资产的框架，能够将内容划分为你项目语境中有意义的块，同时保留 UE 的松散包结构的优点。
- 块：根据项目需求把资产分成逻辑分组，每组在运行时或打包时可作为一个独立单元处理；最终优化运行时内存/加载时间，控制首包大小、便于差分更新与按需下载。
- 松散包结构：引擎中每个资产通常以独立包存在，包之间可通过引用连接，但不会被强制合并成单一大文件。

资产管理器还提供了一组工具，用于审计磁盘和内存使用情况，能够提供优化资产组织所需的信息。

## 主资产和次级资产
UE 的资产管理系统将所有资产分为两类：主资产和次级资产。

资产管理器可以通过主资产 ID 直接操作主资产，该 ID 可通过调用 `GetPrimaryAssetId` 获取；若要将某个继承自特定 `UObject` 类的资产指定为主资产，可重写该类的 `GetPrimaryAssetId` 函数，使其返回有效的 `FPrimaryAssetId` 结构；主资产 ID 由两部份组成：
- 用于标识一组资产的唯一主资产类型。
- 具体主资产的名称，名称默认为在 `Content Browser` 中显示的资产名。

次级资产不会被资产管理器直接处理，而是在被主资产引用或使用时由引擎自动加载。

默认情况下，只有 `UWorld` 资产被视为主资产，其他所有资产均为次级资产。

## 蓝图类资产和数据资产
资产管理器处理两类不同的资产：蓝图类和非蓝图资产。

### 蓝图类
要创建新的蓝图主资产，需要在内容浏览器中新建一个继承自重写了 `GetPrimaryAssetId` 函数的类的蓝图。这个基类可以是 `Primary Data Asset` 或其子类，也可以是重写了 `GetPrimaryAssetId` 的 Actor 子类。

要访问蓝图主资产，可以在 C++ 中调用如 `GetPrimaryAssetObjectClass` 之类的函数。或使用名称中带有 `Class` 的蓝图资产管理器函数。

得到类之后，你可以像使用其他蓝图类那样用它生成新实例，或者使用 `Get Defaults` 函数从与该蓝图关联的类默认对象读取只读数据。

对于那些不需要实例化的蓝图类，可以将数据存放在继承自 `UPrimaryDataAsset` 的数据专用蓝图中。

### 非蓝图资产
当你的主资产类型不需要存储蓝图数据时，可以使用非蓝图资产；非蓝图资产在代码中访问更简单，并且更节省内存。

要在编辑器中创建新的非蓝图主资产，可以在高级内容浏览器窗口中新建一个数据资产，这种方式创建的资产并不是创建一个类，而是某个类的实例。

要访问其类，需要用 `GetPrimaryAssetObject` 等函数加载；随后可以访问它们直接读取数据。

## Asset Manager
`Asset Manager` 对象是一个单例，负责主资产的发现与加载。

引擎中包含的基础资产管理器提供了基本的管理功能，但可以拓展以满足项目的特定需求。

对象的异步加载是通过资产管理器内部的 `Streamable Manager` 负责实际的异步对象加载工作，同时使用 `Streamable Handle` 将对象保持在内存中，直到它们不再需要并可以被卸载。

与单例的 `Asset Manager` 不同，引擎在不同部分和不同使用场景中存在多个 `Streamable Manager`.

## 资产包(Asset Bundle)
一个资产包是与某个主资产关联的一组特定资产列表。资产包通过在某个 `UObject` 的 `TSoftObjectPtr` 或 `FStringAssetReference` 成员的 `UPROPERTY` 部分使用 `AssetBundles` 元标签来创建。

该标签的值表示次级资产应存放到的包的名称。例如，下面这个静态网格资产，存放在名为 `MeshPtr` 的成员变量中，当该 `UObject` 保存时会被加入名为 `TestBundle` 的资产包：
```
/** Mesh */	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = Display, AssetRegistrySearchable, meta = (AssetBundles = "TestBundle"))	TSoftObjectPtr MeshPtr;
```

另一种使用资产包的方法是在运行时由项目的 `Asset Manager` 类注册它们：需要编写代码填充一个 `FAssetBundleData` 结构体，然后将该结构体传递给资产管理器。可以通过重写 `UpdateAssetBundleData` 函数，或使用与包中次级资产关联的主资产 ID 调用 `AddDynamicAsset` 来完成此操作。
