---
title: "C++中explicit的作用"
description: "explicit关键字"
date: "2024-12-10 15:08:16"
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
---参考：
https://csguide.cn/

在C\+\+中，`explicit`通常用于构造函数的声明中，用于防止隐式转换。当将一个参数传递给构造函数时，如果构造函数声明中使用了`explicit`关键字，则只能使用显式转换进行类型转换，而不能进行隐式转换。

这种机制可以防止编译器自动执行预期外的类型转换，提高代码的安全性。

# 什么是隐式类型转换

当表达式需要的类型与你所给予的类型不一致的时候，有时会自动发生类型转换，就叫做隐式类型转换。

# explicit的作用
假设有一个类：
```
class Example{
    int x;
public:
    Example(int n):x(n) {}
};
```

我们可以通过下面的代码创建一个对象：
```
Example example = 20;
```

1. 20首先会被隐式类型转换为Example类的临时对象。
2. 隐式类型转换后的临时对象再通过复制构造函数生成example.

如果在后续我们定义了一个接受Example类对象的函数，当我们传入10时，也会直接进行类型转换：
```
void fun(Example e);

fun(10);
```

如果我们希望只接受Example类型的参数，就可以将构造函数声明加上`explicit`：
```
class Example{
    int x;
public:
    explicit Example(int n):x(n) {}
};
```

这样就必须调用显式类型转换：
```
fun(Example(10));
```

在开发中，使用`explicit`关键字可以防止不必要的隐式转换，提高代码的可读性和安全性。

尤其是构造函数参数只有一种类型的，建议加上`explicit`.
