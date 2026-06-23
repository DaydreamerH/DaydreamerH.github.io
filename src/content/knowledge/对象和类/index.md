---
title: "对象和类"
description: "C++类的基础介绍"
date: "2024-10-23 17:41:28"
category: "C++ 基础"
originalCategory: "C++快速入门"
track: "Programming Foundation"
level: foundation
status: ready
published: true
minutes: 6
order: 1000
prerequisites: []
tags: ["C++"]
photos: "banner.jpg"
source: "_posts"
---
# 抽象和类
## 基本类型

指定基本类型需要完成三个工作：
- 决定数据对象需要的内存数量。
- 决定如何解释内存中的位。
- 决定可使用数据对象执行的操作或方法。

## C\+\+中的类
类是一种将抽象转换为用户定义类型的C\+\+工具，它将数据表示和操纵数据的方法组合成一个整洁的包。

为开发一个类并编写一个使用它的程序，需要完成多个步骤。这里将开发过程分成多个阶段：通常C\+\+程序员将接口放在头文件中，并将实现放在源代码文件中。

### 声明类
在这里我们以股票为例，先定义一个`Stock`类。

```
#ifndef STOCK_H_
#define STOCK_H_

#include<string>

class Stock
{
private:
	std::string company;
	long shares;
	double share_val;
	double total_val;
	void set_tot() { total_val = share_val * shares; };
public:
	void acquire(const std::string& co, long n, double pr);
	void buy(long num, double price);
	void sell(long num, double price);
	void update(double price);
	void show();
};


#endif // !STOCK_H_
```

首先，C\+\+关键字class指出这些代码定义了一个类设计。这种语法指出，`Stock`是这个新类的类型名。我们可以借此创建`Stock`对象：`Stock ally;`

存储的数据以类数据成员的形式出现；执行的操作以类函数成员的形式出现。成员函数可以就地定义，也可以用原型表示，对于描述函数接口而言，原型就足够了，它们的完整定义包含在实现文件里。

#### 访问控制
关键字`private`和`public`也是新的，它们描述了对类成员的访问控制。使用类对象的程序可以直接访问共有部分，但只能通过公有成员函数来访问对象的私有程序。

因此公有成员函数是程序和对象的私有成员之间的桥梁，提供了对象和程序之间的接口。

防止程序直接访问数据被称为数据隐藏，此外C\+\+还提供了`protected`关键字控制访问，将在后续继承部分介绍。

#### 控制对成员的访问
无论类成员是数据成员还是成员函数，都可以在类的共有部分或私有部分声明它。

隐藏数据是OOP主要目标之一，因此数据项通常放在私有部分，组成类接口的成员函数放在共有部分。

通常从程序员使用私有成员函数来处理不属于公有接口的实现细节。

不必在类声明中使用关键字`private`，这是类对象的默认访问控制。

```
class Stock
{
	std::string company;
	long shares;
	double share_val;
	double total_val;
	void set_tot() { total_val = share_val * shares; };
public:
	...
};
```

### 类和结构
C\+\+实际上对结构进行了拓展，结构可以包含成员函数，也可以控制访问。结构和类的唯一区别在于结构的默认访问类型是`public`而类是`private`.

### 实现类成员函数
成员函数定义与常规函数定义非常相似，也有函数头和函数体，也可以有返回类型和参数，但成员函数两个特殊的特征：
- 定义成员函数时，使用作用域解析运算符`::`来标识函数所属的类。
- 类方法可以访问类的private组件。

我们可以实现类方法如下：
```
#include<iostream>
#include "stock.h"

void Stock::acquire(const std::string& co, long n, double pr)
{
	company = co;
	if (n < 0)
		std::cout << "Error" << std::endl;

	else
		shares = n;

	share_val = pr;
	set_tot();
}

void Stock::buy(long num, double pr)
{
	if (num < 0)std::cout << "Error" << std::endl;
	else
	{
		shares += num;
		share_val = pr;
		set_tot();
	}
}

void Stock::sell(long num, double price)
{
	if (num<0 || num>shares)std::cout << "Error" << std::endl;

	else
	{
		shares -= num;
		share_val = price;
		set_tot();
	}
}

void Stock::update(double price)
{
	if (price < 0)std::cout << "Error" << std::endl;

	else
	{
		share_val = price;
		set_tot();
	}
}

void Stock::show()
{
	std::cout << company << ' ' << shares << ' ' << total_val << std::endl;
}
```

#### 内联函数
定义位于类声明中的函数都将自动成为内联函数。类声明长江短小的成员函数作为内联函数，`set_tot()`符合这样的要求。

如果愿意，也可以在类声明之外定义成员函数，并使其成为内联函数。为此，只需在类实现部分中定义函数时使用`inline`限定符即可。

内联函数的特殊规则要求在每个使用它们的文件中都对其进行定义。确保内联定义对多文件程序中的所有文件都可用的、最简便的方法是：将内联定义在定义类的头文件中。

### 使用类
```
#include<iostream>
#include"stock.h"

int main()
{
	Stock st;
	st.acquire("Open", 10, 20.);
	st.show();
	st.buy(10, 21);
	st.show();
	st.update(25);
	st.show();
	st.sell(20, 30);
	st.show();
	return 0;
}
```

# 类的构造函数和析构函数
C\+\+的目标之一是让使用类对象就像使用标准类型一样。为了在创建类对象时，能够顺利进行初始化同时保护私有成员不被后续程序直接访问，C\+\+提供了一种特殊的成员函数——类构造函数。
## 构造函数
### 声明和定义类构造函数
```
Stock(const string &co, long n = 0, double pt = 0.);
Stock::Stock(const string &co, long n = 0, double pr = 0.)
{
	company = co;
	if(n<0)
	{
		std::cout<<"Error"<<endl;
	}
	shares = n;
	share_val = pr;
	set_tot();
}
```
构造函数的声明和定义可见上，需要注意的是，一般我们不将类成员名称作为参数的名称，这容易引起混乱。为避免这种混乱，有两种常见的做法：
- 在数据成员名中使用m_前缀。
- 在成员名中使用后缀_.

### 使用构造函数

C\+\+提供了两种使用构造函数来初始化对象的方法。
- 一种是显式地调用构造函数
	```
	Stock food = Stock("Food", 1, 1);
	```
- 一种是隐式地调用构造函数
	```
	Stock food("Food", 1, 1);
	```

每次创建类对象时，C\+\+都是用类构造函数。

此外与与其它类方法不同，构造函数被用来创建对象，而不能通过对象来调用。

### 默认构造函数
默认构造函数是在未提供显式初始值时，用来创建对象的构造函数。也就是说，当且仅当没有定义任何构造函数时，编译器会提供默认构造函数。

但是如果为类定义了构造函数后，程序员就必须为它提供默认的构造函数。不然在如下的声明将报错：
```
Stock stock1;
```
之所以有这样的规定，是出于禁止创建未初始化对象的想法。如果想要创建一个未初始化的对象，则必须加上不接受任何参数的构造函数。

此外默认构造函数只能有一个，通常在定义默认构造函数时，应确保类成员有一个合理的初始值。
```
Stock()
{
	company = "no name";
	shares = 0;
	share_val = 0;
	total_val = 0;
}
```

需要注意隐式地调用默认构造函数时，不要使用圆括号。

### C\+\+11 列表初始化
在C\+\+11中，只要提供与某个构造函数的参数列表匹配的内容，并用大括号阔气，就可以将列表初始化的语法用于类。

## 析构函数
在对象过期时，程序将自动调用一个特殊的成员函数——析构函数。

析构函数的名称需要在类名前加上~. 例如`Stock`的析构函数名称为`~Stock()`.

析构函数的作用在于收尾工作，例如当构造函数调用new来分配内存时，析构函数负责delete.

## 改进Stock类
```
#ifndef STOCK_H_
#define STOCK_H_

#include<string>

class Stock
{
private:
	std::string company;
	long shares;
	double share_val;
	double total_val;
	void set_tot() { total_val = share_val * shares; };
public:
	Stock() { company = "no name"; shares = share_val = total_val = 0; }
	~Stock() { std::cout << "Delete" << std::endl; }
	void acquire(const std::string& co, long n, double pr);
	void buy(long num, double price);
	void sell(long num, double price);
	void update(double price);
	void show();
};


#endif // !STOCK_H_
```
# const成员函数
```
const Stock land = "KP";
land.show();
```
第二行代码无法执行，因为`show`无法确保调用对象不被修改。

为了提供一种显式地表示函数无法修改调用对象，在声明函数时将const关键字置于函数的括号后。
```
void show () const;
```

只要类成员函数不修改类对象，那么我们就应该在声明末尾加上const.

# this指针

当方法涉及到两个或多个类对象时，可能需要使用C\+\+的指针。

例如，当我们想要比较两个`Stock`对象的股价高低，我们既可以声明一个返回股票价格的成员函数来直接比较`double getTotalVal() const {return total_val;}`；也可以定义一个成员函数，查看两个对象的股价并返回较高的那个。

首先，成员函数可以直接访问调用对象的股价，但是对于另一个类对象，就需要将其作为参数传入，在这里不修改类对象的成员，所以加上const，为了提高效率，采用引用的方式；而成员函数还需要返回类对象，由于返回的要么是调用对象，其被函数末尾的const限制无法修改，要么返回传入对象，其被const限制，所以返回类型也应加上const.
```
const Stock & compare(const Stock & s) const;
```
当我们试图实现时，问题产生了，如何返回调用对象。

C\+\+解决这类问题的方法是使用this指针：this指针指向用来调用成员函数的对象。

一般来说，所有的类方法都将this指针设置为调用它的对象的地址。之前使用类成员时默认调用了this.

所以需要返回调用对象本身时，只需要返回*this即可。

# 对象数组
用户通常创建同一个类的多个对象，这时候创建对象数组较为合适。声明对象数组的语法与声明标准类型数组相同。

```
Stock my_choice[4];
```

当程序创建未被显式初始化的类对象时，总是默认调用构造函数。所以当创建对象数组时，类要么没有显式地定义构造函数，要么定义了一个显式的默认构造函数；否则在创建的同时，需要依次进行初始化。

# 类作用域
在类中定义的名称的作用域都为整个类，这意味着它们在该类已知，在类外不可知。这也是为什么我们可以在不同的类中使用相同的类成员；同时这也意味着在调用公有函数时，必须通过对象。

## 作用域为类的常量
在某些情况下，使符号常量的作用域为类很有用。例如，类声明可能使用字面值30来指定数组的长度，该常量对所有对象来说都是相同的，因此创建一个为所有对象共享的常量是一个不错的选择。

第一种方式是在类中声明一个枚举。在类声明中声明的枚举的作用域为整个类，因此可以用枚举为整型常量作用域提供为整个类的符号名称。
```
class Bakery
{
	enum {Months = 12};
	double costs(Months);
	...
};
```
但是，使用用这种方式声明的枚举并不会创建类数据成员，也就是说所有的对象都不包含枚举，作为一个符号名称，在作用域为整个类的代码中遇到它，编译器将用12代替。

另一种在类中定义常量的方式是使用关键字`static`.

```
class Bakery
{
	static const int Months = 12;
	...
};
```

这将创建一个名为Months的常量，该常量将与其他静态变量存储在一起，而不是存储在对象中。因此`Monsths`是一个常量，被所有`Bakery`对象共享。

### 作用域内枚举（C\+\+11）
传统的枚举存在一些问题，其中之一是两个枚举定义中的枚举量可能发生冲突：
```
enum egg {small, medium, large};
enum t_shirt {small, medium, large};
```
两个枚举的`small`位于相同的作用域中，它们将发生冲突。

为避免这个问题，C\+\+11提供了一种新枚举，其枚举量的作用域为类。

```
enum class egg {small, medium, large};
enum class t_shirt{small, medium, large};
```

也可以使用关键字struct代替class，无论用那种方式，都需要使用枚举名来限定枚举量：
```
egg choice = egg::small;
```
C\+\+11还提高了作用域内枚举的类型安全，在有些情况下，常规枚举将自动转换为整型，但作用域内枚举不能隐式地转换为整型，可以进行显式地转换。

除此以外，C\+\+11还支持指定枚举的底层类型：
```
enum class:short egg{small, medium, large};
```
在这里将底层类型设置为`short`，底层类型必须为整型。
