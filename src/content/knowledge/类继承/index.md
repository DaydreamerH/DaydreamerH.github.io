---
title: "类继承"
description: "公有继承、虚函数与纯虚函数"
date: "2024-11-13 14:37:50"
category: "C++ 基础"
originalCategory: "C++快速入门"
track: "Programming Foundation"
level: intermediate
status: ready
published: true
minutes: 8
order: 1000
prerequisites: []
tags: ["C++"]
photos: "banner.jpg"
source: "_posts"
---
# 一个简单的基类
从一个类派生出另一个类时，原始类称为基类，继承类称为派生类。

我们通过具体的案例来说明继承，首先我们创造一个基类。
```
#pragma once
#include<string>

using std::string;
class TableTennisPlayer
{
	string first_name;
	string last_name;
	bool  has_table;
public:
	TableTennisPlayer(const string fn = "none", const string ln = "none", bool ht = false);

	void Name() const;
	bool HasTable() const { return has_table; }
	void ResetTable(bool v) { has_table = v; }
};
```
```
#include "tablenn0.h"
#include <iostream>

TableTennisPlayer::TableTennisPlayer(const string fn, const string ln, bool ht)
	:first_name(fn), last_name(ln), has_table(ht)
{

}

void TableTennisPlayer::Name() const
{
	std::cout << last_name << ',' << first_name << std::endl;
}
```

## 派生一个类
```
class RatedPlayer : public TableTennisPlayer
{
    ...
};
```

冒号指出`RatedPlayer`类的基类是`TableTennisPlayer`类，上述的特殊声明头表示`TableTennisPlayer`是一个公有基类，这被称为公有派生。

派生类对象包含基类对象。

使用公有派生，基类的公有成员将成为派生类的公有成员；基类的私有部分也将成为派生类的一部分，但只能通过基类的公有和保护方法访问。

- 派生类对象存储了基类的数据成员；
- 派生类对象可以使用基类的方法。

在继承后，我们需要添加：
- 派生类自己的构造函数。
- 派生类可以根据需要添加额外的数据成员和成员函数。

在这个例子中，我们需要记录运动员得分情况，类声明如下：
```
class RatedPlayer :public TableTennisPlayer
{
	unsigned int rating;
public:
	RatedPlayer(unsigned int r = 0,
        const string& fn = "none", const string& ln = "none",
             bool ht = false);
	RatedPlayer(unsigned int r = 0, const TableTennisPlayer& tp);
	void ResetRating(unsigned int r) { rating = r; }
};
```

### 构造函数：访问权限的考虑
派生类不能直接访问基类的私有成员，而必须通过基类方法进行访问。

具体而言，`RatedPlayer`不能直接设置继承的私有成员，而必须使用基类的公有方法来访问私有的基类成员。

派生类构造函数必须使用基类构造函数。

创建派生类对象时，程序首先创建基类对象，这意味着基类对象应当在程序进入派生类构造函数之前被创建。

C\+\+使用成员初始化列表语法来完成这种工作：
```
RatedPlayer::RatedPlayer(unsigned int r, const string& fn, const string& ln, bool ht)
	:TableTennisPlayer(fn, ln, ht)
{
	rating = r;
}
```

如果省略初始化列表，此时没有调用基类构造函数，程序将使用默认的基类构造函数，这意味着将执行如下操作：
```
RatedPlayer::RatedPlayer(unsigned int r, const string& fn, const string& ln, bool ht)
	:TableTennisPlayer()
{
	rating = r;
}
```

除非要使用默认构造函数，否则显式调用正确的基类构造函数。

在第二个构造函数中，我们可以使用基类的复制构造函数：
```
RatedPlayer::RatedPlayer(unsigned int r, const TableTennisPlayer& tp)
	:TableTennisPlayer(tp)
{
	rating = r;
}
```

由于基类并没有定义复制构造函数，编译器将为此自动生成一个。

在本例中，使用隐式复制构造函数时合适的，因为这个类没有直接使用动态分配（在string中使用了动态内存分配，成员复制会调用string类的复制构造函数）。


有关派生类的构造对象的要点如下：
- 首先创建基类对象；
- 派生类构造函数应通过成员初始化列表将基类信息传递给基类构造函数；
- 派生类构造函数应初始化派生类新增的数据成员。

### 派生类和基类之间的特殊关系
- 派生类对象可以使用基类的方法，条件是方法不是私有的。
- 基类指针可以在不进行显式类型转换的情况下，指向派生类对象。
- 基类引用可以在不进行显式类型转换的情况下，引用派生类对象。

但是基类指针或引用只能用于调用基类方法，不能使用其调用派生类方法。

此外，不可以将基类对象和地址赋给派生类引用和指针。

# 继承关系
C\+\+有3中继承方式：公有继承、私有继承和保护继承。

公有继承时最常用的方式，建立一种is-a关系，即派生类对象也是一个基类对象，可以对基类对象执行的任何操作，也可以对派生类对象执行。

# 多态公有继承
当我们希望同一个方法在派生类和基类中的行为是不同的，需要实现多态公有继承。

有两种方法可用于多态公有继承：
- 在派生类中重新定义基类方法。
- 使用虚方法。

在这里我们声明一个基类和一个派生类，并由此介绍多态公有继承。

```
#pragma once

#include<string>

class Brass
{
	std::string fullName;
	long acctNum;
	double balance;
public:
	Brass(const std::string& s = "Nullbody", long an = -1, double bal = 0.01);
	void Deposit(double amt);
	virtual void Withdraw(double amt);
	double Balance() const;
	virtual void ViewAcct() const;
	virtual ~Brass();
};

class BrassPlus :public Brass
{
	double maxLoan;
	double rate;
	double owesBank;
public:
	BrassPlus(const std::string s = "Nullbody", long an = -1, double bal = 0., double ml = 500, double r = 0.11125);
	BrassPlus(const Brass& ba, double ml = 500., double r = 0.11125);
	virtual void ViewAcct() const;
	virtual void Withdraw(double amt);
	void ResetMax(double m) { maxLoan = m; }
	void ResetRate(double r) { rate = r; }
	void ResetOwes() { owesBank = 0; }
};
```

值得注意的是：
- `Brass`类和`BrassPlus`类都声明了`ViewAcct()`和`Withdraw()`方法，但二者这些方法的行为是不同的。
- `Brass`类在声明`ViewAcct()`和`Withdraw()`时使用了关键字`virtual`，这些方法被称为虚方法。
- `Brass`类还声明了一个虚析构函数。

同一函数名指代的方法的行为由对象类型来确定。

而虚函数方法有些特殊，如果方法是通过引用或指针而不是对象调用的，他将确定使用哪一种方法。如果没有使用关键字`virtual`，程序将根据引用类型或指针类型选择方法。
如果没有使用`virtual`，程序将根据引用类型或指针类型选择方法，反之，程序将根据引用或指针指向的对象的类型来选择方法。

虚函数这种行为非常方便，因此，我们需要经常在基类中将派生类会重新定义的方法声明为虚方法。

方法在基类中被声明为虚后，它在派生类中将自动生成为虚方法。在派生类声明中使用`vitrual`指出那些函数是虚方法也不失为一个好办法。

类实现如下：
```
#include "brass.h"
#include<iostream>

using std::cout;
using std::endl;

Brass::Brass(const std::string& s, long an, double bal)
{
	fullName = s;
	acctNum = an;
	balance = bal;
}

void Brass::Deposit(double amt)
{
	if (amt < 0)
		cout << "Negative deposit not allowed." << endl;
	else
		balance += amt;
}

void Brass::Withdraw(double amt)
{
	if (amt < 0)
		cout << "Negative withdraw amount not allowed." << endl;
	else if (amt <= balance)
		balance -= amt;
	else
		cout << "Withdraw amount too large." << endl;
}

double Brass::Balance() const
{
	return balance;
}

void Brass::ViewAcct() const
{
	cout << fullName << endl;
	cout << acctNum << endl;
	cout << balance << endl;
}

BrassPlus::BrassPlus(const std::string s, long an, double bal, double ml, double r)
	:Brass(s, an, bal)
{
	maxLoan = ml;
	rate = r;
	owesBank = 0;
}

BrassPlus::BrassPlus(const Brass& ba, double ml, double r)
	:Brass(ba)
{
	maxLoan = ml;
	rate = r;
	owesBank = 0;
}

void BrassPlus::ViewAcct() const
{
	Brass::ViewAcct();
	cout << maxLoan << endl;
	cout << owesBank << endl;
	cout << rate;
}

void BrassPlus::Withdraw(double amt)
{
	double bal = Balance();
	if (amt <= bal)
		Brass::Withdraw(amt);
	else if (amt <= bal + maxLoan - owesBank)
	{
		double advance = amt - bal;
		owesBank += advance * (1. + rate);
		Deposit(advance);
		Brass::Withdraw(amt);
	}
	else cout << "No more"<<endl;
}
```

## 为何需要虚析构函数

为了确保执行的析构函数的行为符合对象类型，使用虚析构函数可以确保正确的析构函数序列调用。

# 静态联编和动态联编
将源代码中的函数调用解释为执行特定的函数代码块被称为函数联编。

在C\+\+中，由于函数重载的缘故，这项任务相较于在C中更为复杂，编译器必须查看函数参数以及函数名才能确定使用哪一个函数。

早期的C\+\+编译器可以在编译过程中完成这种编译，这样的过程称为静态联编。

但是虚函数的出现是的这个工作变得更为困难，因为使用哪一个函数不能在编译中确定，因为编译器不知道用户将选择哪个类型的对象。

所以编译器必须生成能够在程序运行时选择正确的虚方法的代码，这称为动态联编。


## 指针和引用类型的兼容

在C\+\+中，动态联编与通过指针和引用调用方法相关。

通常C\+\+不允许讲义中类型的地址赋给另一种类型的指针，也不允许一种类型的引用指向另一种类型。

然而，指向基类的引用或指针可以引用派生类对象，而不必进行显式类型转换。

将派生类引用或指针转换为基类引用或指针被称为向上强制转换，这使公有继承不需要进行显式类型转换。

相反，将基类指针或引用转换为派生类指针或引用称为向下强制转换，如果不使用显式类型转换，则向下强制转换是不允许的。原因是is-a关系通常不可逆。

隐式向上强制转换使基类指针或引用可以指向基类对象或派生类对象，因此需要动态联编。

## 虚成员函数和动态联编
如果基类中某方法没有声明为虚方法，那么当使用指针或引用调用该方法时，在编译过程中，指针类型一致，此时编译器对非虚方法使用静态联编。

如果基类中某方法声明为虚方法，那么编译器生成的代码将在程序执行时，根据对象类的调用函数，使用动态联编。

### 为什么有两种类型的联编

- 为使程序能够在运行阶段进行决策，必须采取一些方法来耿总基类指针或引用指向的对象类型，这增加了额外的处理开销。
- 在设计类时，可能包含一些不需要派生类重新定义的基类方法，这些方法不应该设置为虚函数，从逻辑上指出不要重新定义该函数。

C\+\+的指导原则之一是，不要为不使用的特性付出代价。

### 虚函数的工作原理
C\+\+规定了虚函数的行为，但将实现方法留给了编译器作者。

通常编译器处理虚函数的方法是：给每个对象添加一个隐藏成员，隐藏成员中保存了一个指向函数地址数组的指针。这种数组称为虚函数表。

虚函数表存储了为类对象进行声明的虚函数的地址。

例如，基类对象包含一个指针，指向基类中所有虚函数的地址表，派生类对象将包含一个指向独立地址表的指针，如果派生类提供了虚函数的新定义，该虚函数表将保存新函数的地址，否则保存函数原始版本的地址；如果派生类定义了新的虚函数，则新地址也将加入该表中。

无论类中包含的虚函数是1个还是10个，都只需要在对象中添加一个地址成员，只是对应表的大小不同而已。

调用虚函数时，程序将查看存储在对象中的虚函数地址表的地址，然后查表：如果使用类声明中定义的第一个虚函数，则程序使用数组中的第一个函数地址，同理，使用第n个虚函数则查找第n个地址。

使用虚函数在内存和执行速度方面有一定的成本：
- 每个对象都将增大，增大量为存储地址的空间。
- 每个类编译器都创建虚函数地址表。
- 每个虚函数调用都需要查表。

## 有关虚函数的注意事项
### 构造函数
构造函数不能是虚函数，创建派生类对象时，将调用派生类的构造函数，而不是基类的构造函数，随后派生类的构造函数将使用基类的构造函数。

这种顺序与继承机制不同。

### 析构函数
析构函数应当是虚函数，除非类不做基类。

对于基类，无论析构函数实际上是否有任何行为，都要声明一个显式的虚析构函数。

### 友元
友元不能时虚函数，因为友元不是类成员。

### 没有重新定义
如果派生类没有重新定义函数，将使用函数的基类版本，如果存在多级继承，则将使用最新的虚函数版本。

### 重新定义将隐藏方法
```
class A
{
public:
    virtual void fun(int m) const;
};

class B :public A
{
public:
    virtual void fun() const;
};
```

上述代码可能会导致编译器警告。

在使用时可能出现问题，
例如：
```
A a;
a.fun(); // valid
a.fun(5); // invalid
```

新定义将`fun()`定义为一个不接受任何参数的函数，重新定义不会生成函数的两个重载版本，二十隐藏了接受一个int参数的基类版本。

重新定义继承的方法并不是重载。

如果重新定义派生类中的函数，将不只是使用相同的函数参数列表覆盖及类声明，无论参数列表是否相同，该操作将隐藏所有的同名基类方法。

- 如果重新定义继承的方法，应确保与原来的原型完全相同，除非返回类型是基类引用或指针，此时可以将其修改为指向派生类的引用或指针。
- 如果基类声明被重载了，又需要在派生类中重新定义重载方法，则应在派生类中重新定义所有的基类版本。否则，未被重新定义的版本将被隐藏。

# 访问控制：protected

private和protected之间的区别只有在基类派生的类中才会表现出来。

它让派生类能够访问公众不能使用的内部函数。

最好对数据成员采用私有访问控制，不要使用保护访问控制；同时通过基类方法使派生类能够访问基类数据。

# 抽象基类

有时候，使用is-a规则并不是看上去那样简单，例如，当我们试图记录、操作圆形和椭圆时，我们一般认为圆形是特殊的椭（它的长轴短轴相等）。由此我们可以从`Ellipse`类派生出`Circle`类。

但这种派生是笨拙的，因为圆形只需要一个值就可以描述其大小和形状，并不需要长半轴、短半轴，在计算面积时也更简单。

这时，可能单独写一个`Circle`类更为简单。

但是，不可否认的是圆和椭圆有很多共同点，分别定义则忽略了这个事实。

于是，我们想将圆与椭圆的共性单独放到一个抽象基类里，由这个抽象基类派生出圆和椭圆。

例如，我们可以认为这两个类的共同点是中心坐标、`Move()`方法与`Area()`方法，其中`Area()`不能直接定义，对于两个类而言是不同的，而且基类本身也不包含计算面积所需的变量。

```
#pragma once

class BaseEllipse
{
	double x;
	double y;
public:
	BaseEllipse(double x0 = 0, double y0 = 0) :x(x0), y(y0) {}
	virtual ~BaseEllipse(){}
	void Move(int nx, int ny) { x = nx; y = ny; }
	virtual double Area() const = 0;
};
```
其中，通过使用纯虚函数提供未实现的函数，纯虚函数声明的结尾处为=0.

当类声明中包含纯虚函数时，则不能创建该类的对象，包含纯虚函数的类只用作基类。要成为真正的抽象基类，必须至少包含一个纯虚函数。

抽象基类ABC可以被视作一种必须实施的接口，ABC要求具体派生类必须覆盖其纯虚函数，迫使派生类遵循ABC设置的接口规则。这种模型在基于组件的编程模式中很常见，使得组件设计人员能够指定一种接口约定。

# 继承和动态内存分配

## 派生类不使用new
假设基类使用了动态内存分配，这时为基类设置了相应的析构函数、复制构造函数和重载赋值运算符。

现在，派生出的子类不使用新的new，这时并不需要定义显式析构函数、复制构造函数和赋值运算符。

- 派生类的默认析构函数总是要进行一些操作，执行自身的代码后调用基类析构函数。
- 派生类进行复制构造函数时，成员复制将根据数据类型采用相应的复制方式，但复制类成员或继承的类组件时，则是使用该类的复制构造函数。
- 类的默认赋值运算符将自动使用基类的赋值运算符来对基类组件进行赋值。

## 派生类使用new
当派生类使用了new，就必须为派生类显式定义析构函数、复制构造函数和赋值运算符。
