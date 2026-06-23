---
title: "C++中class和struct区别"
description: "class struct注意事项"
date: "2024-12-08 15:16:35"
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


C++中为了兼容C语言而保留了C语言的struct关键字，并且加以扩充了含义。

在C语言中，struct只能包含成员变量，不能包含成员函数。

在C++中，struct类似于class，既可以包含成员变量，也可以包含成员函数。

# 不同点
C++中的struct和class基本是通用的，但是：
- class中的类成员默认为私有，而struct中的成员默认是公有。
- class的基础默认私有，而struct的继承默认公有。
- class可以用于定义模板参数，struct则不能。

# 使用习惯
struct通常用来定义一些POD。

POD是C++定义的一类数据结构概念，比如int float等都是POD类型的。

而class用于定义一些非POD对象，面对对象编程。
