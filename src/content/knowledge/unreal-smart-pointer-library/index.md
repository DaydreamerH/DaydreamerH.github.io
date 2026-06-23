---
title: "Unreal Smart Pointer Library"
description: "智能指针"
date: "2026-04-20 20:26:33"
category: "Unreal / Gameplay"
originalCategory: "UE Gameplay LAB"
track: "Game Development"
level: foundation
status: ready
published: true
minutes: 7
order: 1000
prerequisites: []
tags: ["UE", "C++"]
photos: "banner.jpg"
source: "_posts"
---
Unreal 提供了一套用于普通 C++ 对象的智能指针系统 (Shared/Weak/Unique/SharedRef) 用来管理内存和生命周期，但它不能用于 UObject ，因为 UObject 由 UE 自己的 GC 统一管理。

## 智能指针类型
- Shared Pointers：多人共同拥有一个对象。
  - 引用计数管理生命周期。
  - 最后一个 `SharedPtr` 销毁，则释放对象。
  - 可以为 `nullptr`.
- `TSharedRef`：加强版 `SharedPtr`.
  - 一定不能为空。
  - 永远保证引用有效对象。
  - 可以转换成 `SharedPtr`.
- `TWeakPtr`：只观察，不控制生命周期。
  - 不增加引用计数。
  - 对象可能随时被释放。
  - 可以临时升级为 `SharedPtr`.
- `TUniquePtr`：独占所有权模型。
  - 只有一个拥有者。
  - 不能复制，只能移动。
  - 超出作用域自动释放。

不能混用 `UniquePtr` 和 `SharedPtr` ，否则会导致重复释放、悬空指针或其他未定义行为。

## 智能指针的优势
- `SharedPtr/SharedRef` 防止内存泄漏：对象在没有任何引用时自动释放。
- `WeakPtr` 用于打破循环引用。
- 线程安全：引用计数可以跨线程来安全管理，但可以关闭线程安全来提升性能。
- 运行时安全：`SharedRef` 强约束指针保证有效。
- 内存开销：
  - `TSharedPtr` 大约为两倍原生指针，并带有控制块。
  - `TUniquePtr` 近似原生指针的大小。

## 智能指针辅助工具
- `TSharedFromThis`：让对象能够安全地生成 `SharedPtr` 或者 `SharedRef` 指向自己。
- `MakeShared`：一次性分配内存，性能最好，构造函数必须 `public`.
- `MakeShareable`：可以接管已有的裸指针，可以使用 `private constructor`，可以自定义删除逻辑，但效率较慢。
- `StaticCastSharedPtr / Ref`：用于继承体系中更多向下转型；类似于 `static_cast` ，但封装了只能指针的逻辑。
- `ConstCastSharedPtr`：用于去掉 `const` 限制。

## 智能指针使用的注意事项
### 性能
智能指针虽然方便且安全，但在底层代码中并不总是最佳选择，因为他们存在额外的性能开销。

智能指针适合高层系统、资源管理、工具层管理，但涉及到底层引擎代码和渲染代码时不建议使用。

尽管相比原生指针，智能指针有额外的开销，但它们依然保持了高效：
- 所有操作都是常数时间。
- 在正式发布版本中，访问的数据与原始指针几乎一样快。
- 仅仅是拷贝智能指针时，永远不会触发新的内存分配。
- 线程安全的智能指针通常时无锁的，避免了昂贵的互斥锁开销。

而其性能开销在于：
- 创建与拷贝：比原始指针更重，因为需要处理引用计数等逻辑。
- 引用计数更新：每次拷贝或销毁都会增加/减少计数，这会消耗 CPU 周期。
- 内存占用：部分智能指针的大小是原始指针的两倍。
- 堆分配开销：某些情况下会产生两次堆分配：一次给对象，一次给控制块。
  - `MakeShareable` 通常会导致两次堆分配，内存不连续，缓存命中率低。
  - `MakeShared` 将对象和控制块分配在同一块连续内存，性能更好。

### 自引用
默认情况下，对象并不知道谁在引用它，也没有引用计数的控制器地址，所以如果在成员函数内直接 `TSharedRef(this)`，由于 `this` 只是个裸指针，他会错误地创建一个全新的引用计数器，可能引发双重释放。

解决方案是让类继承 `TSharedFromThis`，相当于给对象内置了一个反向查找的能力，他提供两个函数用以返回指向自己的共享指针：
- `AsShared()`：模板中定义的基类类型，始终返回继承是填写的那个类型。
- `SharedThis(this)`：精确的类类型，能够自动识别派生类类型，避免手动转换.

需要注意的是智能指针的控制块是在对象构造完成之后才被初始化的，不能在构造函数中使用这两个函数，否则会导致程序崩溃。

当对象需要把自己作为一个 `TSharedPtr` 或 `TSharedRef` 传给别人时，他能找到那个已经存在的引用计数器，而不是瞎搞一个新的。

### 类型转换
与原始指针一样，智能指针的向上转换同样是隐式的。

但对于其他类型的转换，必须使用 UE 提供的专用工具函数：
- 静态转换 `StaticCastSharedPtr<T>`：常用于向下转换，但必须确认该对象确实是目标类型。
- 常量转换 `ConstCastSharedPtr<T>`：用于移除或添加 `const`.
- 向上转换 `MakeSharedReference<T>`：某些需要显式向上转换时使用。

此外 UE 智能指针不支持动态转换，因为虚环的智能指针库是一套独立于 `UObject` 系统的轻量级模板，没有利用 C++ 的 RTTI，因此无法在运行时自动判断转换是否安全；也就是说不能像 `Cast<UObject>` 返回的是否是 `nullptr` 来判断转换是否成功。

## 线程安全
所有的智能指针默认是单线程安全的，如果需要在多个线程之间共享同一个智能指针，必须在声明时明确指定线程安全模式。

例如：
```
TSharedPtr<T, EPSMode::ThreadSafe>
```

此外如果类继承了 `TSharedFromThis`，在模板参数也需要加上。

即使使用了 `EPSMode::ThreadSafe` 也只能保证读取和拷贝的安全，不能保证写入操作，与修改对象的成员变量的操作的安全。

## 共享指针
共享指针是一种强引用且可为空的智能指针：
- 共享所有权：多个指针可以同时指向同一个对象，只要还有一个共享指针存在，对象就不会被释放。
- 自动失效：它可以安全地引用易变对象，如果对象被释放，指针会自动变为空。
- 弱引用支持：避免循环引用。

### 声明与初始化
```
// Create an empty shared pointer
TSharedPtr<FMyObjectType> EmptyPointer;
// Create a shared pointer to a new object
TSharedPtr<FMyObjectType> NewPointer(new FMyObjectType());
// Create a Shared Pointer from a Shared Reference
TSharedRef<FMyObjectType> NewReference(new FMyObjectType());
TSharedPtr<FMyObjectType> PointerFromReference = NewReference;
// Create a Thread-safe Shared Pointer
TSharedPtr<FMyObjectType, ESPMode::ThreadSafe> NewThreadsafePointer = MakeShared<FMyObjectType, ESPMode::ThreadSafe>(MyArgs);
```
- 空指针：仅声明，不指向任何东西。
- 裸指针包装：最直接，但一般推荐使用 `MakeShared`.
- 从引用转换：这是一个隐式转换，因为 `TSharedRef` 保证有效，转为可控的 `TSharedPtr` 绝对安全。
- 线程安全初始化。

### 引用计数的变化逻辑
当创建第一个 `TSharedPtr` 指向一个对象时，它成为了该对象的拥有者；执行拷贝时，内部引用计数增加；当指针变量本身被销毁时，计数减小；最后一个指向该对象的指针消失时，计数归零，对象释放。

### 重置与清空
如果想让一个智能指针不再指向某个对象，有两种等价写法：
- `Pointer.Reset()`
- `Pointer = nullptr`

这都会导致该指针放弃所有权，引用计数减小。

有时候，如果我们不想增加计数再减少计数，只需要转移所有权时，我们可以使用：
- `MoveTemp(ptr)`：强制将左值转为右值引用进行移动。有静态断言。
- `MoveTempIfPossible`：相较于 `MoveTemp` 更宽松。

### 共享指针与共享引用的转换
- 引用转指针：隐式且安全。
- 指针转引用：必须调用 `TSharedRef()` 函数；如果指针为空，该调用会直接触发 Assert；所以为了避免程序崩溃，应该先检查后转换。

### 指针间的比较
可以直接使用 `==` `!=` 来比较智能指针：只有当两个智能指针指向内存中同一个对象时，它们才被视为相等。

另外由于 `TSharedPtr` 是可空的，所在访问前必须确认它是否指向了一个真实存在的对象，一般有三种方法：
- `IsValide()`：最明确、可读性最高的方法。
- `bool` 操作符：最简洁。
- `Get()`：获取底层裸指针并手动判空，通常用于兼容旧代码。

### 解引用
调用对象的方法：
- `Node->Fun()`
- `Node.Get()->Fun()`
- `(*Node).Fun()`

### 自定义删除
通常情况下，当智能指针的引用计数归零时，它会自动调用 `delete` 来销毁对象并释放内存。但在某些特殊情况下，标准的 `delete` 并不适用，这时候就需要自定义删除逻辑。

在以下场景需要自定义删除：
- 非堆内存管理：对象不是通过 `new` 创建的；例如对象池分配后，销毁时需要放回池子，而不是销毁内存。
- 需要调用特定 API 销毁：例如某些第三方库的对象。
- 资源关闭：对象代表一个句柄，销毁前需要先关闭或通知 GPU.

```
// 1. 定义你的特殊销毁逻辑
void DestroyMyObjectType(FMyObjectType* ObjectAboutToBeDeleted) {
    // 这里写特殊的清理逻辑，比如放回池子或者记录日志
    delete ObjectAboutToBeDeleted;
}

// 2. 创建智能指针时绑定这个逻辑
TSharedRef<FMyObjectType> NewReference(
    new FMyObjectType(),
    [](FMyObjectType* Obj) {
        DestroyMyObjectType(Obj); // 引用计数归零时，系统会调用这个 Lambda
    }
);
```

在创建 `TSharedPtr` 或 `TSharedRef` 时，你可以传入一个 Lambda 表达式或函数指针作为第二个参数。

需要注意，如果使用了 `MakeShared`，通常无法直接传入自定义删除器。

## 弱指针
弱指针不会增加对象的引用计数；当对象被销毁后，自动将自己设为 `nullptr`.

### `Pin` 函数
不能直接通过弱指针访问对象的成员，因为你在访问的那一刻，另一个线程可能删除了这个对象，所以为了安全必须使用 `Pin()`.
```
TWeakPtr<FMyObject> WeakPtr = SharedPtr;

// 访问前必须先 Pin
if (TSharedPtr<FMyObject> LockedPtr = WeakPtr.Pin())
{
    // 进入这个作用域，LockedPtr 变成了强引用，对象现在是安全的
    LockedPtr->DoSomething();
}
// 出了作用域，LockedPtr 销毁，强引用计数减 1
```

`Pin()` 的作用就是尝试将弱指针临时升级为一个拥有者：
- 如果对象还在，创建一个新的强引用；此时引用计数+1.
- 如果对象已死：返回一个空的 `TSharedPtr`.

### 声明
弱指针不能直接 `New` 出来，必须通过现有的共享引用或共享指针。
```
TSharedRef<FMyObjectType> ObjectOwner = MakeShared<FMyObjectType>(); // 强引用，计数 = 1
TWeakPtr<FMyObjectType> ObjectObserver(ObjectOwner); // 弱引用，不增加计数
```

### 拷贝
弱指针的拷贝非常轻量且安全，无论对象死活，都可以随意拷贝。

### 其他注意事项
- 绝对不要把弱指针当成容器的 Key.
- `IsValid()` 并不等于安全，如果要访问对象成员，要用 `Pin()`.
