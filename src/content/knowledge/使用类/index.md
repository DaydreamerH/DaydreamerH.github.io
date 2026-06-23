---
title: "使用类"
description: "运算符重载、友元和类型转换"
date: "2024-10-30 19:24:25"
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
---# 运算符重载
运算符重载是一种形式的C\+\+多态。运算符重载将重载的概念拓展到运算符上，允许赋予C\+\+运算符多种含义。

要重载运算符需要使用被称为运算符函数的特殊函数形式：
```
operatorop(argument-list)
```
其中，`op`必须是有效的C\+\+运算符。
## 计算时间
在这里，我们创建一个时间类，并通过时间相加的实现介绍运算符重载。
### 使用成员函数实现
```
// mytime.h
#pragma once

class Time {
	int minutes;
	int hours;
public:
	Time();
	Time(int h, int m);
	void AddMin(int m);
	void AddHour(int h);
	Time Sum(const Time& t);
	void Show() const;
};
```
```
//mytime.cpp
#include "time.h"
#include <iostream>
Time::Time()
{
	hours = 0;
	minutes = 0;
}

Time::Time(int h, int m)
	:hours(h), minutes(m)
{

}

void Time::AddHour(int h)
{
	hours += h;
}

void Time::AddMin(int m)
{
	minutes += m;
	if (minutes >= 60)
	{
		minutes -= 60;
		hours++;
	}
}

Time Time::Sum(const Time& t)
{
	Time result;
	result.hours = hours + t.hours;
	result.minutes = minutes + t.minutes;
	if (result.minutes >= 60)
	{
		result.minutes -= 60;
		result.hours++;
	}
	return result;
}

void Time::Show() const
{
	using std::cout;
	using std::endl;
	cout << hours << ":" << minutes << endl;
}
```
```
//main.cpp
#include"mytime.h"

int main()
{
	Time coding(3, 30);
	Time sleeping(20, 30);

	Time result = coding.Sum(sleeping);
	result.Show();
}
```

### 添加加法运算符
只需要将`Sum()`的名称改为`operator+()`即可。

```
// mytime.h
#pragma once

class Time {
	int minutes;
	int hours;
public:
	Time();
	Time(int h, int m);
	void AddMin(int m);
	void AddHour(int h);
	Time operator+(const Time& t);
	void Show() const;
};
```

```
// mytime.cpp
...
Time Time::operator+(const Time& t)
{
	Time result;
	result.hours = hours + t.hours;
	result.minutes = minutes + t.minutes;
	if (result.minutes >= 60)
	{
		result.minutes -= 60;
		result.hours++;
	}
	return result;
}
...
```

```
// main.cpp
#include"mytime.h"

int main()
{
	Time coding(3, 30);
	Time sleeping(20, 30);

	Time result = coding + sleeping;
	result.Show();
}
```

在使用重载运算符时，运算符左侧的对象是调用对象，运算符右侧的对象是作为参数传递的对象。

## 重载限制
多数C\+\+运算符都可以用这样的方式重载。重载的运算符不必是成员函数，但必须至少有一个操作数是用户定义的类型。

- 重载后的运算符必须至少有一个操作数是用户定义的类型，这将防止用户为标准类型重载运算符。
- 使用运算符时不能违反运算符原来的语法规则，也不能修改运算符的运算优先级。
- 不能创建新的运算符。
- 大部分运算符都可以通过成员或非成员函数进行重载，但`= () [] ->`只能通过成员函数进行重载。

# 友元
C\+\+控制对类对象私有部分的访问，通常公有类方法提供唯一的访问途径，但是有时这种限制过于严苛，C\+\+还提供了另一种形式的访问权限，即友元。

友元有三种：
- 友元函数
- 友元类
- 友元成员函数

通过让函数称为类的友元，可以赋予函数与类的成员函数相同的访问权限。

## 为何需要友元
在刚才的例子中，我们通过成员函数重载运算符，实现两个`Time`对象相加，如果我要重载乘法运算，实现`Time`对象和整型相乘，那么我们只能使用如下格式：
```
Time result = coding * 20;
```
而不能将`20`与`coding`位置交换，这是因为运算符左侧的操作数才是调用对象。

如果我们可以重载非成员函数，就可以以任意顺序相乘。
```
Time operator*(double m, const Time &t);

// Time result = 20 * coding;
Times result = operator*(20, coding);
```

使用非成员函数可以按需的顺序获得操作数，但是非成员函数不能直接访问类的私有数据。因此，友元函数应运而生。

## 创建友元
创建友元函数的第一步是将其原型放在类声明中，并在原型声明前加上关键字`friend`：
```
friend Time operator*(double m, const Time & t);
```
该原型意味着下面两点：
- 虽然`operator*()`函数是在类声明中声明的，但它不是成员函数。
- 该函数与成员函数的访问权限相同。

在编写函数定义时，由于它不是成员函数，所以不需要使用`Time::`限定符。另外也不要在定义中使用关键字`friend`，定义应该如下：
```
Time operator*(double m, const Time & t)
{
    Time result;
    long totalminutes = t.hours * m * 60 + t.minutes*m;
    result.hours = totalminutes/60;
    result.minutes = totalminutes%60;
    return result;
}
```

## 常用的友元：重载<<运算符
假设`trip`是`Time`对象，为了输出它的信息，我们可以重载`<<`.

如果我们选择使用成员函数重载运算符，将出现与平常相违背的用法：
```
trip<<cout;
```
因为必须将`trip`放在运算符左侧才能顺利调用成员函数。

在这里，我们可以使用友元函数，并如下重载运算符：
```
void operator<<(ostream & os, const Time & t)
{
    os<<t.hours<<' '<<t.minutes<<endl;
}
```

但这样仍然存在问题，这种实现不允许像通常那样多个<<连用。

在iostream中，<<运算符要求左边是一个ostream对象，为了连用<<，ostream类将operator<<()实现返回一个指向ostream对象的引用。
具体地说，它返回一个指向调用对象的引用。

所以我们可以对友元函数采用相同的方法，只需修改operator<<()，让它返回ostream对象的引用即可。

```
ostream & operator<<(ostream & os, const Time & t)
{
    os << t.hours << ' ' << t.minutes << endl;
    return os;
}
```

# 类的自动转换和强制类型转换
将一个标准类型变量的值赋给另一种标准类型的变量时，如果这两种类型兼容，则C\+\+将自动将这个值转换为接收变量的类型。

我们可以将类定义成与疾病类型或另一个类相关，使得从一种类型转换为另一种类型是有意义的。在这种情况下，程序员可以指示C\+\+如何自动进行转换，或通过强制类型转换来完成。


接下来，我们将定义一个磅转换为英石的类，并基于此介绍类的类型转换。

```
// stonewt.h
#pragma once

class Stonewt
{
	enum {Lbs_per_stn = 14};
	int stone;
	double pds_left;
	double pounds;
public:
	Stonewt(double lbs);
	Stonewt(int stn, double lbs);
	Stonewt();
	~Stonewt();
	void show_lbs() const;
	void show_stn() const;
};
```

```
// stonewt.cpp
#include"stonewt.h"
#include<iostream>

using std::cout;
using std::endl;

Stonewt::Stonewt(double lbs)
{
	stone = int(lbs)/ Lbs_per_stn;
	pds_left = int(lbs) % Lbs_per_stn + lbs - (int)lbs;
	pounds = lbs;
}

Stonewt::Stonewt(int stn, double lbs)
{
	stone = stn;
	pds_left = lbs;
	pounds = stn * Lbs_per_stn + lbs;
}

Stonewt::Stonewt()
{
	stone = pounds = pds_left = 0;
}

Stonewt::~Stonewt()
{
}

void Stonewt::show_lbs() const
{
	cout << pounds << endl;
}

void Stonewt::show_stn() const
{
	cout << stone << ' ' << pds_left << endl;
}
```

在C\+\+中，接受一个参数的构造函数为将类型与该参数相同的值转换为类提供了蓝图。也就是说，下面的构造函数，提供了将double转换为Stonewt的蓝图。

```
Stonewt(double lbs);
```
这意味着，我们可以如下编写代码：
```
Stonewt Cat;
Cat = 19.6;
```
程序将使用构造函数创建一个临时的Stonewt对象，并将16.7作为初始值，随后逐成员复制到Cat.

需要注意的是，只接收一个参数的构造函数才能作为转换函数，这一过程称为隐式转换。

但是，如果后续参数提供了默认值，便可以将第一个参数类型的值转换为对应类。

虽然这种特性似乎还不错，但是有时我们总是需要关闭这些特性，避免意外的类型转换，因此，C\+\+新增了关键字explicit，用于关闭这种自动特性。

```
explicit Stonewt(double lbs);
```

这样将关闭隐式类型转换，但仍然允许显式类型转换：
```
Cat = Stonewt(19.6);
```


## 转换函数
我们是否可以将自定义的类转换为其他类型？

这需要使用特殊的C\+\+运算符函数——转换函数。

转换函数是用户定义的强制类型转换，可以像使用强制类型转换那样使用它们。

要转换为`typeName`类型，需要使用如下形式的转换函数：
```
operator typeName();
```
- 转换函数必须是类方法。
- 转换函数不能指定返回类型。
- 转换函数不能有参数。

例如，如果我们希望将Stonewt对象转换为double类型，可以声明转换函数如下：
```
operator double() const;
```

定义如下：
```
Stonewt::operator double() const
{
	return pounds;
}
```

那么我们就可以强制类型转换Stonewt为double：
```
Stonewt Cat(19.6);
double pds = Cat;
```

需要注意的是，如果我们定义了多个不同类型的转换函数，可能会出现二义性问题：
```
cout<<Cat;
```
在只有一个转换函数时，Cat将转换为double类型；当出现多个可被输出的类型时，将产生二义性进而报错。


此外转换函数也有缺陷，例如你熬夜加班写了如下代码：
```
int ar[20];
...
Stonewt Temp(14, 4);
...
int temp = 1;
...
cout<<ar[Temp];
```
假设，你实现了Stonewt转换为int的转换函数，那么这段代码将不会报错。

在C\+\+11中，允许使用关键字explicit将转换运算符声明为显式的，这在一定程度上减少了上述错误发生的可能。

通常，最好选择竟在被显式地调用时才会执行的函数。
