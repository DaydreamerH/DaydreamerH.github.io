---
title: "分支语句和逻辑运算符"
description: "如题"
date: "2024-10-10 13:48:28"
category: "C++ 基础"
originalCategory: "C++快速入门"
track: "Programming Foundation"
level: foundation
status: ready
published: true
minutes: 5
order: 1000
prerequisites: []
tags: ["C++"]
photos: "banner.jpg"
source: "_posts"
---
# if语句
当C\+\+程序必须决定是否执行某个操作时，通常使用if语句来实现选择。

if有两种格式：if和if else.

```
if (test-condition)
    statement

if (test-condition)
    statement
else if(test-condition)
    statement
else statement
```
# 逻辑表达式
- 逻辑OR运算符（||），将两个表达式组合在一起，如果原来表达式中的任何一个或全部都为true，则得到的表达式的值为true，否则为false.
- 逻辑AND运算符（&&），也是将两个表达式组合成一个表达式，仅当原来的两个表达式都为true时，得到的表达式的值才为true.
- 逻辑NOT运算符（！），将它后面的表达式的真值取反。

C\+\+逻辑AND和OR运算符的优先级都低于关系运算符，另一方面！运算符的优先级高于所有的关系运算符和算术运算符，此外AND运算符的优先级高于逻辑OR运算符。
# ?:运算符
?:常被用来代替if else语句的运算符，该运算符通用格式如下：
```
expression ? expression2: expression3
```
如果expression1为true，则整个条件表达式的值为expression2的值；否则，整个表达式的值为expression3的值。

# switch语句
C\+\+的switch语句能够更容易地从大型列表中进行选择。
```
switch (interger-expression)
{
    case label1 : statement(s)
    case label2 : statement(s)
    ...
    default : statement(s)
}
```
switch与if else相比，if else更为通用，例如它可以处理取值范围，switch语句中的每个case标签都必须是一个单独的值，另外这个值还必须是整数，因此switch无法处理浮点测试，还必须是常量。

# break和continue语句
break和continue语句都使程序能够跳过部分代码。
- 可以在switch语句或任何循环中使用break语句，使程序跳到switch或循环后面的语句处执行。
- continue语句用于循环中，让程序跳过循环体余下的代码，并开始新的循环。
