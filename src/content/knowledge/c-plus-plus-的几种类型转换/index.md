---
title: "C++的几种类型转换"
description: ""
date: "2024-12-11 15:20:26"
category: "C++ 基础"
originalCategory: "C++八股"
track: "Programming Foundation"
level: foundation
status: ready
published: true
minutes: 5
order: 1000
prerequisites: []
tags: ["C++"]
source: "_posts"
---
在C语言中，我们大多数使用`(type_name) exp`的方式来进行类型转换。

但是在C\+\+中，更推荐使用四个转换操作符来实现显式类型转换：
- static_cast
- dynamic_cast
- const_cast
- reinterpret_cast

# static_cast
用法：`static_cast<new_type> (expression)`

`static_cast`和C语言强制类型转换基本等价。

## 基本类型之间的转换
将一个基本类型转换为另一个基本类型。

## 指针类型之间的转换
将一个指针类型转换为另一个指针类型，尤其是在类层次结构中从基类指针转换为派生类指针。

这种转换不执行运行时类型检查，可能不安全，要自己保证指针确实可以相互转换。

## 引用类型之间的转换
类似于指针类型之间的转换，可以将一个引用类型转换为另一个引用类型。

也应注意安全性。

# dynamic_cast
用法：`dynamic_cast <new_type> (expression)`

`dynamic_cast`在C\+\+中主要应用于父子类层次结构中的安全类型转换。

在运行时，它会执行类型检查，相比`static_cast`更安全。

## 向下类型转换
当需要将基类指针或引用转换为派生类指针或引用时，`dynamic_cast`可以确保类型兼容性。

如果转换失败，`dynamic_cast`返回空指针或抛出异常。

## 多态类型检查
处理多态对象时，`dynamic_cast`可以用来确定对象的实际类型。

只有在基类存在虚函数的情况下才有可能将基类指针转换为子类。

这是因为它要用到虚函数表。

## 底层原理
`dynamic_cast`的底层依赖于运行时类型信息。

C++编译器在编译时为支持多态的类生成RTTI，它包含了类的类型信息，和类层次结构。

使用虚函数时，编译器会为每个类生成一个虚函数表，并在其中存储指向虚函数的指针。

1. 首先`dynamic_cast`通过查询对象的vptr来获取其RTTI。
2. 随后比较请求的目标类型与从RTTI获得的实际类型，如果目标类型是其基类或实际类型，则转换成功。
3. 如果目标是派生类，检查类层次结构，以确定转换是否合法。在类层次结构中找到了目标类型，则转化成功，否则失败。
4. 成功时返回转换后的指针或引用。
5. 失败，对于指针返回空指针，对于引用，抛出异常。

相较于`static_cast`，`dynamic_cast`更安全，但是性能可能更低，因为前者在编译时期就已经完成。

# const_cast
用法：`const_cast <new_type> (expression)`new_type必须是指针、引用或指向对象类型成员的指针。


下面的行为都不安全，需要谨慎使用。
## 修改const对象

当需要修改cons对象时，可以用`const_cast`来删除const属性。

```
const int a = 42;
int* mutable_ptr = const_cast<int*> (&a);

*mutable_ptr = 43;
```

## const对象调用非const成员函数
当需要使用const对象调用非const成员函数时，可以使用`const_cast`删除对象的const属性。

# reinterpret_cast
用法：`reinterpret_cast`

用于在不同类型之间进行低级别的转换。

它仅仅是重写解释底层比特，也就是对指针所指的那片比特位换个类型做解释，不进行任何类型检查。
