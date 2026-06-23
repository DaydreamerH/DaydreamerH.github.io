---
title: "Understanding UPROPERTY"
description: "UPROPERTY 介绍"
date: "2026-04-23 14:34:25"
category: "Unreal / Gameplay"
originalCategory: "UE Gameplay LAB"
track: "Game Development"
level: advanced
status: ready
published: true
minutes: 7
order: 1000
prerequisites: []
tags: ["UE", "C++"]
photos: "banner.png"
source: "_posts"
---
在 UE 中，声明一个属性依然遵循标准 C++ 的变量语法。

为了让这个变量能在被 UE 引擎识别，必须在变量声明的前一行加上 `UPROPERTY` 宏，宏主要包含两个部分：
- 元数据：用于控制变量在编辑器中的表现。
- 变量说明符：定义变量的行为。

## 数据类型
### 整数类型
虚幻引擎为了保证跨平台的一致性，不直接使用标准 C++ 的 `int`，而是使用带位数后缀的显式类型：
| 变量类型 | 说明 | 字节大小 | 范围 (近似) |
| :--- | :--- | :--- | :--- |
| uint8 | 8位 无符号整数 | 1 字节 | 0 到 255 |
| uint16 | 16位 无符号整数 | 2 字节 | 0 到 65,535 |
| uint32 | 32位 无符号整数 | 4 字节 | 0 到 42亿 |
| uint64 | 64位 无符号整数 | 8 字节 | 0 到 1.8x10^19 |
| int8 | 8位 有符号整数 | 1 字节 | -128 到 127 |
| int16 | 16位 有符号整数 | 2 字节 | -32,768 到 32,767 |
| int32 | 32位 有符号整数 | 4 字节 | -21亿 到 21亿 |
| int64 | 64位 有符号整数 | 8 字节 | -9x10^18 到 9x10^18 |

#### Bitmask
在游戏开发中，我们常用一个整数的不同位来表示多个开关；只需在 `UPROPERTY` 中添加 `Bitmask` 标签，整数在编辑器中就不再是一个输入框，而是一组勾选框。
```
UPROPERTY(EditAnywhere, Meta = (Bitmask))
int32 BasicBits;
```

通过 `UPARAM` 宏，也可以让蓝图函数的输入参数显示为位掩码选择器。

但是默认的 Flag 1 很不好用，为了让编辑器显示有意义的名字，需要结合 `UENUM`.
```
UENUM(Meta = (Bitflags))
enum class EColorBits : uint8
{
    ECB_Red,
    ECB_Green,
    ECB_Blue
};
```
这是位索引模式，每一个枚举型代表第几个比特位。

如果希望直接定义十六进制掩码，需要开启特定的元数据：
```
UENUM(Meta = (Bitflags, UseEnumValuesAsMaskValuesInEditor = "true"))
enum class EElementalType : uint8
{
    None  = 0x00, // 0
    Fire  = 0x01, // 1 (位 0)
    Ice   = 0x02, // 2 (位 1)
    Light = 0x04  // 4 (位 2)
};
// 配合这个宏，可以让枚举直接支持 C++ 位运算（如 EElementalType::Fire | EElementalType::Ice）
ENUM_CLASS_FLAGS(EElementalType);
```

在完成 `UENUM` 定义后，我们可以通过 `BitmaskEnum` 引用枚举：
```
/*~ This property lists flags matching the names of values from EColorBits. */
UPROPERTY(EditAnywhere, Meta = (Bitmask, BitmaskEnum = "EColorBits"))
int32 ColorFlags;
```

当然，我们也可利用 `UPARAM` 让蓝图的输入参数使用指定的枚举：
```
/*~ MyOtherFunction shows flags named after the values from EColorBits. */
UFUNCTION(BlueprintCallable)
void MyOtherFunction(UPARAM(meta=(Bitmask, BitmaskEnum = "EColorBits")) int32 ColorFlagsParam)
```

### 浮点类型
UE 使用标准的 C++ 浮点数类型：`float` `double`.

### 布尔类型

| 声明方式 | 示例代码 | 说明 |
| :--- | :--- | :--- |
| **标准 C++ bool** | `bool bIsThirsty;` | 最常用的方式，语义清晰。在内存中通常占用 1 个字节（8 位）。 |
| **位域 (Bitfield)** | `uint32 bIsHungry : 1;` | 使用整数类型（如 uint32）并指定只占 1 位。极其节省空间。 |

一般情况使用 `bool` 就好了，除非这个类有成千上万的实例，包含大量的开关，且内存预算非常吃紧，才考虑使用位域。


### 字符串

| 类型 | 性质 | 主要用途 | 特点 |
| :--- | :--- | :--- | :--- |
| **FString** | 动态变量 | 字符串操作（修改、拼接、解析） | 唯一允许直接修改、操作的字符串类型。开销相对较大。 |
| **FName** | 系统常量 | 资源路径、骨骼节点名、标签 (Tag) | 在全局字符串表中引用。不区分大小写，极快且节省内存，但不可修改。 |
| **FText** | 语言相关 | UI 界面显示、玩家看到的文本 | 支持本地化（多语言）、格式化。具有“文化感知”能力。 |

`TCHAR` 是虚幻的字符类型，由于不同平台对宽字符的定义不同，虚环使用 `TCHAR` 实现跨平台兼容。

`TEXT()` 宏：在 UE 中，所有的字符串字面量都必须包裹在 `TEXT()` 宏里；它会根据平台自动将字符串转为正确的编码格式。

## 属性说明符
### 编辑器可见性与权限
Edit（可编辑）和 Visible（仅可见）系列是互斥的。

| 说明符 | 效果描述 | 适用场景 |
| :--- | :--- | :--- |
| EditAnywhere | 在编辑器窗口（原型和实例）中均可编辑。 | 最通用的设置，如“初始生命值”。 |
| EditDefaultsOnly | 仅在类默认值（蓝图编辑器）中可编辑，实例不可改。 | 控制关卡中所有该类物体统一的属性。 |
| EditInstanceOnly | 仅在场景中的实例（Details 面板）中可编辑。 | 针对关卡中某个特定物体的特殊微调。 |
| VisibleAnywhere | 各处均可见，但无法修改。 | 仅用于显示调试数据或状态。 |
| VisibleDefaultsOnly | 仅在原型中可见，不可编辑。 | 较少使用，用于显示类默认信息。 |
| VisibleInstanceOnly | 仅在实例中可见，不可编辑。 | 显示特定实例的实时运行时状态。 |

### 蓝图交互
| 说明符 | 效果描述 | 注意事项 |
| :--- | :--- | :--- |
| BlueprintReadOnly | 蓝图只能读取，不能通过节点修改。 | 保护关键数据不被蓝图逻辑破坏。 |
| BlueprintReadWrite | 蓝图既能读取也能通过 Set 节点修改。 | 与 BlueprintReadOnly 互斥。 |
| BlueprintAssignable | 仅限多播委托，允许蓝图绑定事件。 | 常用于 UI 按钮点击或状态改变回调。 |
| BlueprintCallable | 仅限多播委托，允许蓝图调用该委托。 | 像调用函数一样执行委托。 |
| Category="Name" | 定义在编辑器面板中的分类标题。 | 使用 "A\|B" 可以创建嵌套子分类。 |

### 网络与持久化
| 说明符 | 效果描述 | 核心用途 |
| :--- | :--- | :--- |
| Replicated | 该变量应通过网络从服务器同步到客户端。 | 联机游戏同步位置、血量等。 |
| ReplicatedUsing=Func | 同步时自动调用指定的 C++ 回调函数。 | “OnRep”模式，用于同步后执行视觉表现。 |
| SaveGame | 标记此属性应被存盘系统记录。 | 简化存档系统的开发。 |
| Transient | 瞬态变量，不被保存或加载。 | 运行时临时缓存，如当前的瞄准目标。 |
| Config | 允许将该变量的值存储在 .ini 配置文件中。 | 用于调整游戏全局设置或插件参数。 |

### 高级显示与逻辑控制
| 说明符 | 效果描述 | 备注 |
| :--- | :--- | :--- |
| AdvancedDisplay | 属性默认隐藏，需点击面板下方小箭头才显示。 | 避免 UI 过于杂乱，隐藏非核心参数。 |
| Interp | 允许该变量在 Sequencer（定格动画）中随时间变化。 | 制作过场动画所需的插值属性。 |
| DuplicateTransient | 复制物体时，该变量会被重置为默认值。 | 防止两个物体共用同一个唯一的 ID 标识。 |
| Instanced | 对象属性专用。创建实例时会获得该对象的唯一副本。 | 用于处理 Subobjects（子对象）的深度拷贝。 |
| NoClear | 禁止在编辑器中将该引用设为 None（清除按钮消失）。 | 强制要求必须引用某个资源。 |


## 元数据说明符
`Meta` 标签主要用于控制编辑器界面的行为；元数据仅存在于编辑器中，不要编写依赖元数据的游戏逻辑，因为在正式打包后，元数据会被剥离。
### 界面限制与输入控制
| 元数据标签 | 作用描述 | 适用类型 |
| :--- | :--- | :--- |
| ClampMin / ClampMax | 限制在 UI 中输入数值的最小值或最大值。 | float, int |
| UIMin / UIMax | 限制滑动条 (Slider) 的范围，但允许手动输入超出范围的值。 | float, int |
| ArrayClamp | 将数值限制在 0 到指定数组的长度之间。 | int |
| EditCondition | 设置一个布尔表达式，只有满足条件时该属性才可编辑。 | 所有类型 |
| HideAlphaChannel | 在颜色选择器中隐藏 Alpha (透明度) 通道。 | FColor, FLinearColor |

### 资源与类选择器
| 元数据标签 | 作用描述 | 适用类型 |
| :--- | :--- | :--- |
| AllowedClasses | 限制资源选择器只显示特定的资源类（如只显示 StaticMesh）。 | FSoftObjectPath |
| AllowAbstract | 是否允许在下拉列表中选择“抽象类”。 | TSubclassOf |
| BlueprintBaseOnly | 限制只显示蓝图类，不显示 C++ 原生类。 | TSubclassOf |
| ContentDir | 强制路径选择器从项目的 Content 目录开始查找。 | FDirectoryPath |
| FilePathFilter | 设置文件选择器的后缀名过滤（如 "uasset", "png"）。 | FFilePath |

### 蓝图交互拓展
| 元数据标签 | 作用描述 | 使用场景 |
| :--- | :--- | :--- |
| ExposeOnSpawn | 在“从类生成 Actor”节点上直接显示该属性。 | 类似于构造函数参数注入 |
| InlineEditConditionToggle | 将布尔值变成其他属性左侧的一个勾选框。 | 节省面板空间 |
| ScriptName | 导出到其他脚本语言（如 Python）时使用的别名。 | 跨语言开发 |
