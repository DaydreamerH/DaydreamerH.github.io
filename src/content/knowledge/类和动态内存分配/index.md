---
title: "类和动态内存分配"
description: "类的特殊成员函数，返回对象或其引用的注意事项与对象指针"
date: "2024-11-1 15:16:24"
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
# 动态内存和类
## StringBad
接下来，将要编写一个简单的String类，该类存在一些缺陷供我们讨论。

StringBad类声明如下：
```
#pragma once
#include<iostream>

class StringBad
{
private:
	char* str;
	int len;
	static int num_strings;
public:
	StringBad();
	~StringBad();
	StringBad(const char* str);
	friend std::ostream& operator<<(std::ostream& os, const StringBad& st);
};
```
其中，我们使用char指针来表示字符，这意味着声明本身没有为字符串分配存储空间，而是需要在构造函数使用new来分配空间；除此以外，我们将`num_strings`声明为静态存储类，这意味着所有的类对象共享同一个静态成员，用以统计创建了多少个对象。

成员函数的实现如下：
```
#include<cstring>
#include "stringbad.h"

int StringBad::num_strings = 0;

StringBad::StringBad(const char* s)
{
	len = strlen(s);
	str = new char[len + 1];
	strcpy(str, s);
	num_strings++;
}

StringBad::StringBad()
{
	len = 5;
	str = new char[len + 1];
	strcpy(str, "EMPTY");
	num_strings++;
}

StringBad::~StringBad()
{
    --num_strings;
	delete[]str;
}

std::ostream& operator<<(std::ostream& os, const StringBad& st)
{
	os << st.str;
	return os;
}
```
在实现中，我们首先初始化静态成员`num_strings`为0. 需要注意的是，不能在类声明中初始化静态成员变量，这是因为声明描述了如何分配内存，但并不直接分配内存。

对于静态类成员，可以在类声明之外使用单独的语句来进行初始化，这是因为静态类成员是单独存储的，而不是对象的组成部分。初始化是在方法文件中实现的，而不是类声明文件，这是因为如果头文件被多个程序使用，将出现多个初始化语句的副本，从而引发错误。

但是，对于静态数据成员为const整型或枚举类型，则可以在类声明中进行初始化。

接下来，我们将编写程序使用该类，并观察出现的问题：
```
#include<iostream>
#include "stringbad.h"

using std::cout;
using std::endl;

void fun1(StringBad& sb);
void fun2(StringBad sb);

int main()
{
	{
		StringBad s1("First.");
		StringBad s2("Second.")
		cout << s1 << endl；
		fun1(s1);
		cout << s1 << endl;
		fun2(s1);
		cout << s1 << endl;

		StringBad s3;
		s3 = s2;
	}

}

void fun1(StringBad& sb)
{
	cout << sb << endl;
}

void fun2(StringBad sb)
{
	cout << sb << endl;
}
```

在不同的编译器上，上述代码执行结果不同，

最重要的问题在于`fun2()`，它接受一个对象作为函数参数，而当函数执行结束时，被传入的对象将自动调用析构函数，使得原始字符串无法识别。

初次以外，当对象的生命周期结束时，将依次删除`s3` `s2`和`s1`. 虽然在程序中，只将`s2`初始化给`s3`，当这种操作修改了`s2`.

如果打印`num_strings`，会发现`num_strings`为负值，这意味着在创建对象时，还存在一种隐藏的构造函数被调用。
```
s3 = s2; ---->s3 = StringBad(s2);
```
隐藏的构造函数原型为`StringBad(const StringBad&)`，当我们使用一个对象来初始化另一个对象时，编译器将自动生成上述构造函数。自动生成的构造函数不知道要修改静态变量`num_strings`.

### 特殊成员函数
C\+\+自动提供如下的成员函数：
- 默认构造函数，如果没有定义构造函数。
- 默认析构函数，如果没有定义。
- 复制构造函数，如果没有定义。
- 赋值运算符，如果没有定义。
- 地址运算符，如果没有定义。

更准确地说，如果程序使用对象有一定的需求，编译器将生成上述三个函数的定义。

C\+\+11还提供了另外两个特殊成员的函数：移动构造函数和移动赋值构造函数。

#### 默认构造函数
如果没有提供任何构造函数，C\+\+将创建默认构造函数，编译器将提供一个不接受任何参数，也不执行任何操作的构造函数。

另外，带参数的构造函数也可以作为一种默认构造函数，只要所有参数都有默认值。

#### 复制构造函数
复制构造函数用于将一个对象复制到新创建的对象中。也就是说，它适用于初始化过程而不是常规的赋值过程。

它接受一个指向类对象的常量引用为参数。

#### 何时调用复制构造函数
新建一个对象并将其初始化为同类现有对象时，复制构造函数都将被调用。

每当程序生成了对象副本时，编译器都将使用复制构造函数，具体地说，当函数按值传递对象或函数返回对象时，也将使用复制构造函数。

由于按值传递对象将调用复制构造函数，因此在上述代码中，应该按引用传递对象，这可以节省调用构造函数的时间和存储对象的空间。

#### 默认的复制构造函数的功能
默认的复制构造函数将逐个复制非静态成员，复制的是成员的值。

如果成员本身就是一个类对象，那么将使用这个类的复制构造函数来复制成员对象。

### 错误原因分析
关于`num_strings`计数异常在于两点，其一调用`fun2()`时使用了复制构造函数，该函数没有修改静态成员，导致构造与析构的计数不统一。

关于字符串乱码的原因，则是因为在默认使用复制构造函数时，复制的是`str`指向的地址，而非字符串内容。这导致当新的对象析构时，释放了原对象的存储内容。

所以我们可以定义一个进行深度复制的复制构造函数来解决问题。
```
StringBad::StringBad(const StringBad& sb)
{
	len = sb.len;
	str = new char[len + 1];
	strcpy_s(str, len+1, sb.str);
	num_strings++;
}
```

除此以外，在赋值`s3`时使用了赋值运算符，这也是导致计数异常的原因之一。

ANSI C允许结构赋值，而C\+\+允许类对象赋值，这是通过自动为类重载赋值运算符实现的。

这种运算符的原型如下：
```
Class_name & Class_name::operator=(const Class_name &);
```

将已有对象赋给另一个对象时，将使用重载的运算符，基本原理与默认复制构造函数一致。

这意味着在本例中，`s3.str`与`s2.str`指向同一目标，将同样导致数据损坏；并且静态成员也没有进行更新。

解决办法与复制构造函数相似，提供赋值运算符定义。但也有一些区别：
- 由于目标对象不是新创建的对象，可能引用了以前分配的数据，所以应先释放被分配的内存。
- 函数应当避免对象赋给自己，否则创新赋值前的删除操作将造成数据损坏。
- 函数返回一个只想调用对象的引用。

```
StringBad& StringBad::operator=(const StringBad& sb)
{
	if (this == &sb)
		return *this;
	delete[] str;
	len = strlen(sb.str);
	str = new char[len + 1];
	strcpy_s(str, len + 1, sb.str);
	return *this;
}
```

# 在构造函数中使用new时应注意的事项
- 如果构造函数中使用new来初始化指针成员，则应在析构函数中使用delete.
- new和delete必须相互兼容。
- 如果有多个构造函数，则必须以相同的方式使用new，要么都带中括号，要么都不带。因为析构函数无法重载。然而，可以自由决定某一个构造函数中是否使用new，也delete可以用于空指针。

ps: 空指针有三种选择：NULL 0和nullptr. 在很多头文件中，NULL是一个被定义为0的符号常量。C程序员通常使用NULL而传统C\+\+通常使用0，但是C\+\+11提供了nullptr，这是更好的选择。

- 应定义一个复制构造函数，通过深度复制将一个对象初始化为另一个对象。
- 应定义一个赋值运算符，通过深度赋值将一个对象复制给另一个对象。

# 有关返回对象的说明
## 返回指向const对象的引用
使用const引用的常见原因时旨在提高效率，但对于合适可以采用这种方式存在一些限制。

有三点需要注意：
- 返回对象将调用复制构造函数，而返回引用不会。
- 引用指向的对象应在调用函数执行时就存在。例如如果函数返回传递给它的对象，那么通过返回引用就可以提高效率。
- 关注参数的类型，如果是const参数，返回该参数的引用时必须也为const.

## 返回指向非const的引用
两种常见的返回非const对象情形是，重载运算符以及重载与cout一起使用的<<运算符。前者这样做旨在提高效率，而后者必须这样做。

## 返回对象
如果被返回的对象是被调用函数中的局部变量，则不应按引用方式返回它，这时应返回对象。

# 使用指向对象的指针
使用对象指针时，需要注意几点：
- 使用常规表示法来声明指向对象的指针。
- 可以将指针初始化为指向已有的对象。
- 可以使用new来初始化指针，这将创建一个新的对象。
- 对类使用new将调用相应的类构造函数来初始化新创建的对象。
- 可以使用->运算符通过指针访问类方法。
- 可以对对象指针应用解除引用运算符来或的对象。
