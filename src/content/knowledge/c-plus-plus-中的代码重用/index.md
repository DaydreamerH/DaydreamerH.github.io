---
title: "C++中的代码重用"
description: "has-a关系的实现与模板类"
date: "2024-11-15 12:36:56"
category: "C++ 基础"
originalCategory: "C++快速入门"
track: "Programming Foundation"
level: intermediate
status: ready
published: true
minutes: 7
order: 1000
prerequisites: []
tags: ["C++"]
photos: "banner.jpg"
source: "_posts"
---C\+\+的一个主要目标是促进代码重用，公有继承是实现这种目标的机制之一，此外还有包含（组合、层次化）与私有或保护继承实现相应的目标。

# 包含对象成员的类
在这里，我们将创建`Student`类用以说明。

我们使用一个包含两个成员的类表示它，一个成员表示姓名，另一个成员用于表示分数。

对于姓名，我们可以使用字符数组表示，但是这限制了名字的长度，我们也可以用动态内存分配，但是这意味着需要提供大量的支持代码。

更好的方法是，使用一个由他人开发好的类的对象来表示，比如`string`类。

对于考试分数，也是同理，我们也可以使用一个已经开发好的类，叫做`valarray`.

## valarray类简介
valarray类是由头文件valarray支持的。这个类用于处理数值，它支持注入将数组中所有的元素的值相加遗迹在数组中找出最大和最小的值等操作。

valarray被定义为一个模板类，以便能够处理不同的数据类型。

模板特性意味着声明对象时，必须指定具体的数据类。类特性意味着使用valarray对象需要了解这个类的构造函数和其他类方法。

```
double gpa[5]{3.1, 3.5, 3.8, 2.9, 3.3};
valarray<double> v1; // size 0
valarray<double> v2(8); // size 8
valarray<double> v3(3., 8) // size 8, value 3.
valarray<double> v4(gpa, 4) // size 4, value gpa[0:3]
```

## Student类的设计

学生与姓名、成绩是包含关系。通常用于建立has-a关系的C\+\+技术是组合，即创建一个包含其他类对象的类。

```
#pragma once

#include<string>
#include<valarray>
using std::valarray;
using std::string;

class Student
{
	typedef valarray<double> ArrayDb;
	string name;
	ArrayDb scores;
	std::ostream& arr_out(std::ostream& os) const;

public:
	Student() :name("Null"), scores() {}
	explicit Student(const string& s) :name(s), scores() {}
	Student(const string& s, const ArrayDb& a) :name(s), scores(a) {}
	Student(const string& s, const double* pd, int n) :name(s), scores(pd, n) {}
	~Student(){}
	double Average() const;
	const string& Name() const;
	double& operator[](int i);
	double operator[](int i) const;

	friend std::istream& operator>>(std::istream& is, Student& stu);
	friend std::istream& getline(std::istream& is, Student& stu);
	friend std::ostream& operator<<(std::ostream& os, const Student& stu);
};
```

### 约束
C\+\+提供了各种限制程序结构的特性，这样做的根本原因是在编译阶段出现错误优于在运行阶段出现错误。

### 接口和实现
使用公有继承时，类可以继承接口，可能还有实现。获得接口是is-a关系的组成部分。

而使用组合，类可以获得实现，而不能获得接口。不继承接口是has-a关系的组成部分。

### 初始化顺序
当初始化列表包含多个项目时，这些项目被初始化的顺序为它们被声明的顺序，而不是在初始化列表中的顺序。

### 实现
```
#include "student.h"

std::ostream& Student::arr_out(std::ostream& os) const
{
	int i;
	int lim = scores.size();
	if (lim > 0)
	{
		for (i = 0; i < lim; i++)
		{
			os << scores[i] << ' ';
			if (i % 5 == 4)
				os << std::endl;
		}
	}
	else os << "Empty";
	return os;
}

double Student::Average() const
{
	if (scores.size() > 0)
		return scores.sum() / scores.size();
	else
		return 0.0;
}

const string& Student::Name() const
{
	return name;
}

double& Student::operator[](int i)
{
	return scores[i];
}

double Student::operator[](int i) const
{
	return scores[i];
}

std::istream& operator>>(std::istream& is, Student& stu)
{
	is >> stu.name;
	return is;
}

std::istream& getline(std::istream& is, Student& stu)
{
	getline(is, stu.name);
	return is;
}

std::ostream& operator<<(std::ostream& os, const Student& stu)
{
	os << stu.name << std::endl;
	stu.arr_out(os);
	return os;
}
```

# 私有继承
C\+\+还有另一种实现has-a关系的途径——私有继承。

使用私有继承，基类的公有成员和保护成员都将成为派生类的私有成员。

这意味着基类方法将不会成为派生对象公有接口的一部分，但可以在派生类的成员函数中使用它们。

包含将对象作为一个命名的成员对象添加到类中，而私有继承将对象作为一个未被命名的继承对象添加到类中。私有继承同样获得实现，但不获得接口。

## Student类的设计
使用多个基类的继承被称为多重继承。多重继承可能会出现一些问题，但在这里不涉及。

新的Student类不需要私有数据，因为两个基类已经提供了所需的所有数据成员。

### 初始化基类组件
隐式地继承组件而不是成员对象将影响代码的编写，因为再也不能使用name和scores来描述对象了，而必须使用用于公有继承的技术。

对于私有继承，新版本的构造函数将使用成员初始化列表语法，它使用类名而非成员名来标识构造函数。
```
Student(const char* str, const double* pd, int n)
    :std::string(str), ArrayDb(pd, n) {}
```

### 访问基类方法

使用私有继承时，只能在派生类的方法中使用基类的方法，但有时候可能希望基类工具是公有的。

私有继承是的能够使用类名和作用域解析符来调用基类的方法：
```
double Student::Average() const
{
    if(ArrayDb::size()>0)
        return ArrayDb::sum()/ArrayDb::size();
    return 0;
}
```

### 访问基类对象
使用强制类型转换，是私有继承访问基类对象本身的方法。

例如，我们将`Student`对象强制类型转换为`string`对象，其结果为继承而来的`string`对象。

```
const string & Student::Name() const
{
    return (const string &) *this;
}
```

### 访问基类的友元函数
同样的，我们可以通过显式类型转换，调用友元函数。
```
ostream& operator<<(ostream& os, const Student& stu)
{
    cout << (const string &) stu;
}
```

## 保护继承
保护继承是私有继承的变体，基类的公有成员和保护成员都将成为派生类的保护成员。

# 多重继承

MI描述的是有多个直接基类的类，与单继承一样，公有MI表示的也是is-a关系。

特别注意，当希望公有MI时，必须使用关键字public限定每一个类，否则编译器将认为这是私有派生。

MI可能会带来许多问题，其中两个主要的问题是：
- 从两个或更多相关基类那里继承同一个类的多个实例。
- 从两个不同的基类继承同名方法。

~~相较于单继承，MI麻烦的多，很多人强烈反对MI，甚至希望删除，比如UE所采用的C\+\+不支持MI~~

我们以如下继承关系为例：
```
class Worker
{...};
class Singer :public Worker
{...};
class Waiter :public Worker
{...};
class SingerWaiter :public Singer, pubcli Waiter
{...};
```
因为`Singer`和`Worker`都继承了一个`Worker`组件，所以`SingerWaiter`将包含两个`Worker`组件。

此时，如果将派生类对象的地址赋给基类指针，将出现二义性。必须使用类型转换来指定对象：

```
Worker* pw1 = (Waiter *) &ed;
Worker* pw2 = (Waiter *) &ed;
```

这只是表面的问题，而真正的问题在于，根本不需要`Worker`对象的两个拷贝。

C\+\+为解决这些问题，提出了虚基类。

## 虚基类
虚基类使得从多个类派生出的对象只继承一个基类对象。

通过在类声明中使用virtual，可以使得`Worker`被用作两个派生类的虚基类：
```
class Singer :public virtual Worker;
class Waiter :virtual public Worker;
```
此时，`SingerWaiter`只包含一个`Worker`对象的副本。

### 构造函数
使用虚基类时，需要对构造函数采用新的方式。

```
SingerWaiter(const Worker & wk, int m, in a)
    :Waiter(wk, m), Singer(wk, a){}
```

这将导致`wk`沿着两条路径传递给`Worker`对象。

为避免这种冲突，C\+\+在基类是虚的时，禁止信息通过中间类自动传递给基类。

因此，上述代码将初始化独属于`Waiter` `Singer`的数据成员，而不会传递`wk`中的信息。

此时`Worker`调用默认构造函数。

或者我们采用显式地调用所需的基类构造函数：
```
SingerWaiter(const Worker & wk, int p = 0, int v = Singer::other)
    :Worker(wk), Waiter(wk, p), Singer(wk, v) {}
```

对于虚基类必须这么做，但是这对于非虚基类则是非法的。

### 同名方法
在调用成员函数时，多重继承中，如果每个直接祖先都具备同名成员函数，此时将造成二义性。

我们可以使用作用域解析运算符来限定，但是更好的方法是重新定义该函数，并指出使用哪种方法。


# 类模板
继承和包含并不总是能够满足重用代码的需要。

C\+\+的类模板为生成通用的类声明提供了一种方法。模板提供参数化类型，即能够将类型名作为参数传递给这个类。

C\+\+库提供了多个模板类，如vector valarray等。

## 定义类模板
```
#pragma once

template<class Type>
class Stack
{
	enum {MAX = 10};
	Type items[MAX];
	int top;
public:
	Stack();
	bool isEmpty();
	bool isFull();
	bool push(const Type& item);
	bool pop(Type& item);
};

template<class Type>
Stack<Type>::Stack()
{
	top = 0;
}

template<class Type>
bool Stack<Type>::isEmpty()
{
	return top == 0;
}

template<class Type>
bool Stack<Type>::isFull()
{
	return top == MAX;
}

template<class Type>
bool Stack<Type>::push(const Type& item)
{
	if (top < Max)
	{
		items[top++] = item;
		return true;
	}
	return false;
}

template<class Type>
bool Stack<Type>::pop(Type& item)
{
	if (top > 0)
	{
		item = items[--top];
		return true;
	}
	return false;
}
```

模板类以下面这样的代码开头：
```
template<class Type>
```

关键字`template`告诉编译器，将要定义一个模板。尖括号中的内容相当于函数的参数列表。

这里使用`class`并不意味着`Type`必须是一个类，而只是表面`Type`是一个通用的类型说明符，在使用模板时，将使用实际的类型替换它。

模板常用作容器类，这是因为类型参数的概念非常适合于将相同的存储方案用于不同的类型。

## 模板的具体化
### 隐式实例化
隐式实例化是指声明一个或多个对象，指出所需的类型，而编译器使用通用模板提供的处方生成具体的类定义。

上述代码结尾隐式实例化。

### 显式实例化
当使用关键字template并指出所需类型来声明类时，编译器将生成类声明的显式实例化。

声明必须位于模板定义所在的名称空间。

### 显式具体化
显式具体化时特定类型的定义，有时候，可能需要在为特殊类型实例化时，对模板进行修改，使其行为不同。

例如：
```
template<TypeName T>
class SortedArray {...};
```

假设模板使用大于号进行排序，当`T`指代数字类型时，管用；当`T`指代某一种自定义类时，只需要重载运算符即可。

当`T`是char指针时，就会出现问题，虽然模板仍然能正常工作，但是比较的地址。

我们希望能够比较字母，我们这时候就希望具体化类模板：
```
template <> class Classname<spcialized-type-name> {...};
```
例如：
```
template <> class SortedArray <const char *>{...};
```

### 部分具体化
C\+\+还允许部分具体化，即部分限制模板的通用性。
```
template<class T1, class T2> class Pair{...};
template<class T1>class Pair<T1, int>{...};
```

关键字`template`后面的`<>`声明的是没有被具体化的类型参数，因此，上述第二个声明将`T2`具体化为int，但T1保持不变。

从这个角度来看，显式具体化就是把所有类型参数具体化后的结果。

如果由多个模板可供选择，编译器将使用具体化成都最高的模板。
## 成员模板
模板可用作结构、类或模板类的成员。

```
#pragma once

#include<iostream>
using std::cout;
using std::endl;

template<class T>
class beta
{
	template<typeName V>
	class hold
	{
		V val;
	public:
		hold(V v = 0) :val(v) {}
		void show() const { cout << val << endl; }
		V Value() const { return val; }
	};
	hold<T> q;
	hold<int> n;
public:
	beta(T t, int i) :q(t), n(i) {}
	template<typeName U>
	U blab(U u, T t) { return (n.Value() + q.Value() * u / t); }
	void Show() const { q.show(); n.show(); }
};
```

## 模板用作参数
模板可以包含类型参数和非类型参数，还可以包含本身就是模板的参数。

这种特性是为了实现STL.

## 模板类和友元
模板类声明也可以有友元，模板的友元分3类：
- 非模板友元。
- 约束模板友元，即友元的类型取决于类被实例化时的类型；
- 非约束模板友元，即友元的所有具体化都是类的每一个具体化的友元。

### 模板类的非模板友元函数
在模板类中将一个常规函数声明为友元，这将使得友元函数称为所有实例化的友元。
```
template <class T>
class HasFriend
{
public:
	friend void counts();
};
```

假设腰围友元函数提供模板类参数，必须使用特定的具体化，或者指名具体化，再单独定义。

```
template<class T>
class HasFriend
{
	friend void reports(HasFriend<T> &);
};
```

在本例中，`reports()`不是模板函数，而只是用了个模板做参数，这意味着要单独定义可能出现的数据类型对应的方法。
```
void reports(HasFriend<short> &){...};
void reports(HasFriend<int> &){...};
```

### 模板类的约束模板友元函数
可以修改前一个示例，使友元函数本身成为模板。

首先在类定义的前面声明每个模板函数：
```
template <typeName T> void counts();
template <typeName T> void reports(T &);
```

然后在函数中再次将模板声明为友元
```
template<typeName TT>
class BaseFriendT
{
	friend void counts<TT>();
	friend void reports<>(HasFriend<TT> &);
}
```
声明中的`<>`指出这是模板具体化，对于`reports()`，`<>`可以为空，因为可以从函数参数推断出模板类型参数。

当然也可以使用：
```
reports<HasFriend<TT>>(HasFriend<TT> &);
```

### 模板类的非约束模板友元函数
通过在类内部声明模板，可以创建非约束友元函数，即每个函数具体化都是每个类具体化的友元。

对于非约束友元，友元模板类型参数与模板类型参数是不同的：
```
template <class T>
class ManyFriend
{
	template<typeName C, typeName D>friend void show2(C&, D&);
};
```

这样友元函数是所有具体化类的友元，能够访问所有具体化的对象的成员。

当出现多个不同类型具体化的类时，它能够同时访问。

```
ManyFriend<int> a;
ManyFriend<double> b;
show2(a, b);
```

## 模板别名
可使用`typedef`为模板具体化指定别名：
```
typedef std::array<double, 12> arrd;
```

C\+\+11可以使用模板提供一系列别名：
```
template <typeName T>
	using arrrtype = std::array<T, 12>;
```

这将`arrtype`定义为一个模板别名，可使用它指定类型：
```
arrtype<double> a;
```

C\+\+11允许将语法`using = `用于非模板，这种语法与常规的`typedef`等价：
```
typedef const char * pcl;
using pc2 = const char *;
```
