---
title: "循环"
description: "循环语法"
date: "2024-10-10 10:01:48"
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
# for循环
## for循环的组成部分
for循环的组成部分完成下面这些内容：
1. 设置初始值
2. 执行测试，看看循环是否应该继续进行
3. 执行循环操作
4. 更新用于测试的值
```
for(initialization; test-expression; update-experssion)
    body
```

示例如下：
```
#include<iostream>
int main()
{
	int arraySize = 16;
	long long result[16];
	result[0] = result[1] = 1LL;

	for (int i = 2; i < arraySize; i++)
		result[i] = i * result[i - 1];

	for (int i = 0; i < arraySize; i++)
		std::cout << i << "!: " << result[i] << std::endl;

	return 0;
}
```

### 表达式和语句
在C\+\+中，任何值或任何有效的值和运算符的组合都是表达式。

### 非表达式和语句
任何表达式加上分号都是语句，但反过来就不对了。

就目前介绍的语句而言，返回语句、声明语句和for语句都不满足表达式的要求。

但是，for循环是由三个表达式构成的，又允许用户在for中声明变量。这是通过定义一种新的表达式，声明语句表达式实现的，声明语句不带分号声明，只能出现在for语句中。

所以严格来讲，for的格式应该如下：
```
for(init_statement condition; update)
    body
```
由于init_statement是一条声明语句，以及存在分号，所以for表面上看只有一个分号。

## 递增运算符与递减运算符
\+\+，\-\-分别代表对变量+1或-1.

这两种运算符都有两个变体，粗略来说：
- 当运算符置于操作数前面时，在操作数参与其他运算前先+1/-1.
- 当运算符置于操作数后面时，在操作数参与其他运算后+1/-1.

### 副作用和顺序点
副作用指的是在计算表达式时对某些东西进行了修改；顺序点是指程序执行过程的一个点。

在C\+\+中，语句中的分号就是一个顺序点，这意味着程序处理下一条语句之前，赋值运算符、递增运算符和递减运算符执行的所有修改都必须完成。

另外，任何一个完整表达式的末尾都是一个顺序点。

```
++x>10; // (x+1)>10
x++>10; // x>10, x++
```

但在C\+\+11中，为了更好地描述多线程编程，将顺序点改为顺序，它表示有些事件在其他事件前发生。
### 效率
前缀、后缀在执行速度上有细微的差别，尤其当用户自定义运算符时，前缀则将对应值+1，而后缀需要复制一个副本，将原变量+1，返回副本。

一般而言，使用前缀更快一些。
## 修改步长
在for循环更新数据时，当然可以选择增加变化的步长。

## 逗号运算符
逗号运算符允许将两个表达式放到C\+\+句法只允许放在一个表达式的地方。

这在循环中非常方便，例如我们可以在循环的更新中，对两个变量同时处理。

```
#include<iostream>
#include<string>
int main()
{
	using namespace std;

	string word;
	cin >> word;

	for (int j = 0, i = word.size() - 1; j < word.size() / 2; ++j, --i)
	{
		char temp = word[j];
		word[j] = word[i];
		word[i] = temp;
	}

	cout << word << endl;

	return 0;
}
```

# while循环
while循环是没有初始化和更新部分的for循环，它只有测试条件和循环体：
```
while(test-condition)
	body
```
## for与while
在C\+\+中，for与while本质上是相同的，因此使用哪个只是风格上的问题。

他们之间存在三个差别：
- 在for循环中省略了测试条件时，将认为条件为true.
- 在for循环中，可使用初始化语句声明一个局部变量，但在while循环中不能这么做。
- 如果循环体包含continue语句，情况将有所不同。

在设计循环时：
- 指定循环终止的条件。
- 在首次测试之前初始化条件。
- 在条件被再次测试之前更新条件。

## 延时循环
while循环可用于等待一段时间。
```
long wait = 0;
while (wait < 10000)
	wait++;
```
上述内容虽然可以延迟一定时间，但是当计算机处理的速度发生变化后，必须修改计数限制。

更好的方法是让系统时钟来完成这种工作。

函数`clock()`虽然能够返回系统时间，但返回的单位不一定是秒，在不同系统上数据类型也不一致。

头文件ctime提供了相应的解决方案，首先它定义了一个符号常量——`CLOCKS_PER_SEC`，该常量等于每秒钟包含的系统时间单位数。因此将系统时间初一这个值，可以得到描述；ctime将`clock_t`作为`clock()`返回类型的别名，这意味着可以将变量声明为`clock_t`类型，编译器将把它转换为long、unsigned int或合适系统的其他类型。

```
#include<iostream>
#include<ctime>
int main()
{
	using namespace std;

	float sec;
	cin >> sec;
	clock_t delay = sec * CLOCKS_PER_SEC;
	clock_t start = clock();

	while (clock() - start < delay)
		;

	return 0;
}
```
# do while 循环
```
do
	body
while(test-expression);
```

do while是出口条件循环，这意味着这种循环将首先执行循环体，然后再判断条件表达式。

# 基于范围的for循环（C\+\+11）
C\+\+11新增了一种循环：基于范围的for循环。这简化了一种常见的循环任务，对数组或容器类的每个元素执行相同的操作：
```
#include<iostream>
int main()
{
	using namespace std;
	double prices[3]{ 1.1, 1.2, 1.3 };

	for (double price : prices)
		cout << price << endl;

	return 0;
}
```
