---
title: "函数（二）"
description: "内联函数、引用变量、默认参数、函数重载、函数模板的介绍"
date: "2024-10-15 14:24:39"
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
# C\+\+内联函数
内联函数是C\+\+为提高程序运行速度所做的一项改进。

常规函数与内联函数之间的主要区别不在于编写方式，而在于C\+\+编译器如何将它们组合到程序中。

编译过程的最终产品是可执行程序，由一组机器语言指令组成。运行程序时，操作系统将这些指令载入到计算机内存中，因此每条指令都有特定的内存地址。计算机将逐步执行这些指令。

常规函数调用会使得程序跳到另一个地址，并在函数结束时返回。C\+\+内联函数提供了另一种选择：内联函数的编译代码与其他程序代码内联在一起，编译器将使用相应的函数代码直接替换函数调用。对于内联代码，程序无需跳到另一个位置处执行代码，再跳回来。因此内联函数的运行速度比馋常规函数更快，但占用内存更多。

要使用这项特性，必须采取下述措施之一：
- 在函数声明前加上关键字inline.
- 在函数定义前加上关键字inline.

通常的做法是省略原型，将整个定义放在本应提供原型的地方。然而，如果函数定义占用多行，则将其作为了内联函数有些不合适。

程序员请求将函数作为内联函数时，编译器不一定会满足这个要求，它可能认为该函数过大或注意到函数调用了自己，因此不将其作为内联函数。

```
#include<iostream>
using namespace std;

inline double square(double x) { return x * x; };

int main()
{
	double x = 1.4;
	cout << square(x);
	return 0;
}
```

# 引用变量
引用是已定义的变量的别名。引用变量的主要用途是作用函数的形参，通过将引用变量用作参数，函数将使用原始数据而不是副本。这样除指针意外，引用也为函数处理大型结构提供了一种非常方便的途径，同时，对于设计类而言，引用也是必不可少的。

## 创建引用变量
C\+\+给&符号赋予了另一个含义，将其用来声明引用。

```
#include<iostream>
using namespace std;

int main()
{
	int rats = 10;
	int& rodents = rats;
	cout << rats << ' ' << rodents << endl;
	rodents = 20;
	cout << rats << ' ' << rodents << endl;
	return 0;
}
```

在声明引用时必须将其初始化，而不像指针那样，可以先声明再赋值。

引用更接近const指针，一旦与某个变量关联起来，就将一直效忠于它。

## 将引用用作函数参数
引用经常被用作函数参数，使得函数中的变量名成为调用程序中的变量的变名。按引用传递允许被调用的函数能够访问调用函数中的变量。
```
#include<iostream>
using namespace std;
void swap1(int&, int&);
void swap2(int*, int*);
void show(int, int);
int main()
{
	int wallet1 = 300;
	int wallet2 = 350;
	show(wallet1, wallet2);
	swap1(wallet1, wallet2);
	show(wallet1, wallet2);
	swap2(&wallet1, &wallet2);
	show(wallet1, wallet2);
}

void swap1(int& w1, int& w2)
{
	int temp;
	temp = w1;
	w1 = w2;
	w2 = temp;
}

void swap2(int* w1, int* w2)
{
	int temp = *w1;
	*w1 = *w2;
	*w2 = temp;
}

void show(int w1, int w2)
{
	cout << w1 << ' ' << w2 << endl;
}
```

### 临时变量、引用参数和const
如果实参与引用参数不匹配，C\+\+将生成临时变量。当且仅当参数为const引用时，C\+\+才允许这样做。

如果引用参数是const，则编译器将在下面两种情况下生成临时变量：
- 实参的类型正确，但不是左值；
- 实参的类型不正确，但可以转换为正确的类型。

常规变量和const变量都是左值，因为可以通过地址访问它们。但常规变量属于可修改的左值，const变量属于不可修改的左值。

### 应尽可能使用const
- 可以避免无意中修改数据的编程错误
- 使用const函数能够引用const和非const实参，否则只能接受const数据
- 使用const引用使函数能够正确生成并使用临时变量

## 将引用用于结构
引用非常适合用于结构和类，这也是引用诞生的目的之一。

```
#include<iostream>
using namespace std;
struct free_throws
{
	string name;
	int made;
	int attempts;
	float percent;
};

void display(const free_throws& ft);
void set_pc(free_throws& ft);
free_throws& accumulate(free_throws& target, const free_throws& source);

int main()
{
	free_throws one = { "Ifelsa Branch",13,14 };
	free_throws two = { "Andor Knott",10,16 };
	free_throws three = { "Minnie Max",7,9 };

	free_thorws four;

	set_pc(one);
	display(one);

	set_pc(two);
	set_pc(three);

	four = accumulate(three, two);
	display(four);
	display(three);

	return 0;
}

void display(const free_throws& ft)
{
	cout<<ft.name<<' '<<ft.made<<' '<<ft.attempts<<' '<<ft.percent<<endl;
}

void set_pc(free_throws& ft)
{
	if(ft.attempts)
	{
		ft.percent = 100f*float(ft.made)/float(ft.attempts);
	}
	else ft.percent = 0;
}

free_throws& accumulate(free_throws& target, const free_throws& source)
{
	target.attempts += source.attempts;
	target.made += source.made;
	set_pc(target);
	return target;
}
```

### 为何返回引用而不是结构
传统返回机制与按值传递函数类似，计算关键字return后的表达式，将结果返回给调用函数。这意味着这个值被复制到一个临时变量，而调用程序将继续使用这个值。

如果`accumulate()`返回的是结构，而不是指向结构的引用，则将把整个结构复制到一个临时位置，再把它拷贝给`four`，但在返回值为引用时，直接把`three`复制到`four`.

### 返回引用需要注意的问题
返回引用最重要的一点是避免返回函数终止时不存在的单元引用。

为了避免这个问题：
- 返回一个作为参数的引用，在上述代码中正是这样做的。
- 用new来分配新的存储空间
	```
	const free_throws& clone(const free_throws& ft)
	{
		free_throws& *pt;
		*pt = ft;

		return *pt
	}
	```
	第一条语句创建一个无名的`free_throws`结构，并创建指针指向该结构。最后返回的是*pt，似乎返回了结构，但根据函数声明返回了引用。
	```
	free_throws & jolly = clone(one);
	```
	这使得`jolly`成为了新的结构引用。但这种方法存在问题，由于该方法隐藏了new的调用，容易遗忘使用delete释放内存。

### 返回时使用const
在返回引用时，如果我们不需要修改引用的内容，那么使用const能够有效地避免模糊性。

这使得它不可被赋值或修改，但可以赋值给其他变量。

## 将引用用于对象

将类对象传递给函数时，C\+\+通常的做法是使用引用。

下面我们演示字符串拼接，将一个字符串拼接在另一个字符串的首尾。

其中一种方法会导致程序崩溃。
```
#include<iostream>
#include<string>

using std::cout;
using std::endl;

string version1(const string& str1, const string& str2);
const string& version2(const string& str1, const string& str2);
const string& version3(const string& str1, const string& str2);

int main()
{
	string str1 = "aa";
	string str2 = "bb";
	string result;

	result = version1(str1, str2);
	cout << result << endl;

	result = version2(str1, str2);
	cout << result << endl;

	result = version3(str1, str2);
	cout << result << endl;

	return 0;
}

string& version1(const string& str1, const string& str2)
{
	string tmp;
	tmp = str1 + str2 + st1;
	return tmp;
}

const string& version2(const string& str1, const string& str2)
{
	str1 = str1 + str2 + str1;
	return str1;
}

const string& version3(const string& str1, const string& str2)
{
	string tmp = str1 + str2 + str1;
	return tmp;
}
```

在`version3()`中，试图返回已经被释放的变量。

### 对象、继承和引用
继承是一种语言特性，它能够使一个类的特性传递给另一个类的特性。

被继承的类称为基类，继承其他类的类称为派生类。

派生类继承了基类的方法，这意味着派生类可以使用基类的部分特性。

而继承的另一个作用就是引用，基类的引用可以指向派生类对象，而无需进行强制类型转换。这意味着，我们可以定义一个接受基类引用作为参数的函数，调用函数时，既可以将基类对象作为参数，也可以将该基类的派生类对象作为参数。

## 何时使用引用参数
使用引用参数的主要原因有两个：
- 程序员能够修改调用函数中的数据对象。
- 通过传递引用而不是整个数据对象，可以提高程序的运行速度。

那什么时候使用指针，什么时候使用引用，什么时候使用值呢？
- 对于使用传递的值而不加修改的函数：
  - 如果数据对象很小，则按值传递。
  - 如果数据对象时数组，则使用指针，并声明为指向const的指针。
  - 如果数据对象是较大的结构，则使用const指针或const引用。
  - 如果数据对象是类对象，则使用const引用。类设计的语义常常要求使用引用，这是C\+\+增加这一特性的原因。
- 对于修改调用函数中数据的函数：
  - 如果数据类型是内置数据类型，则使用指针。
  - 如果数据对象是数组，则只能使用指针。
  - 如果数据对象是结构，指针、结构均可。
  - 如果数据对象是类对象，则使用引用。

# 默认参数
默认参数指的是当函数调用中省略了实参时，自动使用的一个值，这极大地提高了函数的灵活性。

我们通过函数原型来设置默认值，方法是将值赋给原型的参数。

对于带参数列表的函数，必须从右向左添加默认值，这意味着，设置默认值的参数之间不能有未设置默认值的参数。

```
int h1(int a = 1, int b = 1, int c = 1); // valid
int h2(int a, int b = 1, int c = 1); // valid
int h3(int a, int b = 1, int c); // invalid
```

# 函数重载
函数动态是C\+\+在C语言基础上新增的功能，函数重载（函数多态）能够让我们使用多个重名的函数。

函数重载的关键是函数参数列表，也被称为函数特征标。

C\+\+允许定义名称相同的函数，条件是它们的特征标不同。如果参数数目、参数类型不同，则特征标也不同。

例如，我们可以定义多个`print()`函数：
```
void print(string s);
void print(double d, int width);
void print(char* s, int width);
```

使用重载的函数时，需要在函数调用中使用正确的参数类型。没有匹配的原型并不会自动停止使用其中的某个函数，因为C\+\+将尝试使用标准类型转换强制进行匹配。但是如果进行可以通过类型转换与多个原型匹配，C\+\+将拒绝这种函数调用，并将其视为错误。

此外，为了避免参数与多个原型匹配，编译器在检查函数特征标时，将把类型引用和类型本身视为同一个特征标。

匹配函数时，还要区分const和非const变量。

在重载时，一定要满足特征标不同，而返回类型不做限制。

```
#include<iostream>
#include<cstring>

using std::cout;
using std::endl;

unsigned long left(unsigned long num, const unsigned length);
char* left(char* s, const unsigned length);


int main()
{
	char s[] = "Hello world.";
	unsigned long num = 12345678;
	const int width = 10;

	for (int i = 1; i <= width; i++)
	{
		char* result = left(s, i);
		cout << result << endl;
		cout << left(num, i) << endl;
		delete result;
	}
	return 0;
}

unsigned long left(unsigned long num, const unsigned length)
{
	unsigned long tool = 10;

	while (num / tool > 10)
		tool *= 10;

	unsigned long result = 0;
	unsigned count = 0;

	while (tool > 0 && count < length)
	{
		result *= 10;
		result += num / tool;
		num %= tool;
		tool /= 10;
		count++;
	}

	return result;
}

char* left(char* s, unsigned length)
{
	char* result = new char[length + 1];

	if (strlen(s) < length)
	{
		strcpy_s(result, strlen(s), s);
		return result;
	}

	for (unsigned i = 0; i < length; i++)
	{
		result[i] = s[i];
	}
	result[length] = '\0';

	return result;
}
```

# 函数模板
函数模板是通用的函数描述，它们使用泛型来定义函数。

通过将类型作为参数传递给模板，可使编译器生成该类型的函数。

由于模板允许以泛型的方式编写程序，因此有时也被称为通用编程，由于类型使用参数表示的，因此模板特性有时也被称为参数化类型。

当我们自定义一个数值交换函数时，如果参数类型可能为多种数据类型，那么我们需要反复重载函数，它们之间的区别仅仅在于数据类型的不同。

而利用函数模板，则可以自动化完成这一过程，而且更可靠。

```
template <typename AnyType>
void Swap(AnyType &a, AnyType &b)
{
	AnyType temp;
	temp = a;
	a = b ;
	b = temp;
}
```

第一行指出，要建立一个模板，并将类型命名为AnyType. 关键字`template`和`typename`是必须的，你也可以使用`class`代替`typename`.

除此外，必须使用简括。类型名可以任意选择，只要遵守C\+\+命名规则即可。

模板并不创建任何函数，而只是告诉编译器如何定义函数，需要交换double的函数时，编译器将按模板模式创建这样的函数，并用double代替AnyType.

## 重载的模板
需要多个对不同类型使用同一种算法的函数时，可使用模板，然而并非所有的类型都使用相同的算法，为满足这种需求，可以像重载常规函数定义那样重载模板定义。

```
#include<iostream>

using std::cout;
using std::endl;

template <typename T>
void Swap(T& a, T& b);
template <typename T>
void Swap(T *a, T *b, int n);
template <typename T>
void Show(T *a, int size);

int main()
{
	int a = 1, b = 0;
	int c[]{ 1, 2,3,4,5 };
	int d[]{ 6,7,8,9,10 };

	Swap(a, b);
	cout << a << ' ' << b << endl;
	Swap(c, d, 4);
	Show(c, sizeof(c)/sizeof(c[0]));
	Show(d, sizeof(d)/sizeof(d[0]));

	return 0;
}

template <typename T>
void Swap(T& a, T& b)
{
	T temp = a;
	a = b;
	b = temp;
}

template <typename T>
void Swap(T *a, T *b, int n)
{
	for (int i = 0; i < n; i++)
	{
		T temp = a[i];
		a[i] = b[i];
		b[i] = temp;
	}
}

template <typename T>
void Show(T *a, int size)
{
	for (int i = 0; i < size; i++)cout << a[i] << ' ';
	cout << endl;
}
```

## 显式具体化
编写的函数模板可能无法处理某些类型，这时候需要为特定类型提供具体化的模板定义。

当编译器找到与函数调用匹配的具体化定义时，将使用该定义，而不再寻找模板。

### 第三代具体化（ISO/ANSI C\+\+标准）
- 对于给定的函数名，可以有非模板函数、模板函数和显式具体化模板函数以及它们的重载版本。
- 显式具体化的原型和定义应以`template<>`打头，并通过名称来指出类型。
- 具体化由于常规模板，而非模板函数优先于具体化和常规模板。

```
#include<iostream>
#include<string>
using std::cout;
using std::endl;
using std::string;

struct job
{
	string name;
	double money;
};

template<typename T>
void Swap(T& a, T& b);

template<>
void Swap<job>(job& a, job& b);

int main()
{
	int a = 0, b = 1;
	job c{ "Cook", 10 }, d{ "programer", 1 };
	Swap(a, b);
	cout << a << ' ' << b << endl;
	Swap(c, d);
	cout << c.name << ' ' << c.money << endl << d.name << ' ' << d.money << endl;
	return 0;
}

template<typename T>
void Swap(T& a, T& b)
{
	T temp = a;
	a = b;
	b = temp;
}

template<>
void Swap<job>(job& a, job& b)
{
	job temp;
	temp.money = a.money;
	temp.name = a.name;

	a.money = b.money;
	a.name = b.name;

	b.money = temp.money;
	b.name = temp.name;
}
```

### 实例化和具体化
在代码中包含函数模板本身并会生成函数定义，它只是一个用于生成函数定义的方案。

编译器使用模板为特定类型生成函数定义时，得到的是模板实例，这种实例化方式被称为隐式实例化。

显式实例化的本质是命令编译器创建特定的实例，其语法是声明所需的种类，并在声明前加上关键字template.
```
template void Swap<int>(int, int);
```
上述代码将命令编译器使用`Swap()`模板生成一个使用int类型的实例。

与显式实例化不同的是，显式具体化使用下面两个等价的声明：
```
template<> void Swap<int>(int&, int&);
template<> void Swap(int&, int&);
```
区别在于这些代码要求不能使用`Swap()`模板生成函数定义，而应使用转为int类型显式定义的函数定义。

试图在同一个文件中使用同一种类型的显式实例和显式具体化将出错。

隐式实例化、显式实例化和显式具体化统称为具体化。它们的相同之处在于它们表现的都是使用具体类型的函数定义，而不是通用描述。引入显式实例化后，必须使用新的语法——在声明中使用前缀template和template<>，区分显式实例化和显式具体化。

## 编译器选择使用哪个函数模板
面对函数重载、函数模板和函数模板重载，C\+\+需要一个定义良好的策略来决定为函数调用使用哪一个函数定义。这个过程称为重载解析，其步骤如下：

1. 创建候选函数列表，其中包括与被调用函数的名称相同的函数和模板函数
2. 使用候选函数列表创建可行函数列表，这些都是参数数目正确的函数，为此有一个隐式转换序列。
3. 确定是否有最佳的可行函数，如果有，则使用它，否则调用出错。

编译器按照以下顺序确定哪个可行函数是最佳的：
1. 完全匹配，但常规函数优于模板。
2. 提升转换。
3. 标准转换。
4. 用户定义的转换。

### 完全匹配与最佳匹配
在进行完全匹配时，C\+\+允许某些“无关紧要的转换”（在此不详细列出）。这意味着在实际操作中，可能存在多个匹配的原型，绝大部分时候编译器会报告包含ambigous的错误信息。

但有时，即使两个函数都完全匹配，也可顺利完成重载解析：
- 指向非const数据的指针和引用优先于非const指针和引用参数匹配。
- 非模板函数优于模板函数（包括显式具体化）。
- 如果两个完全匹配的函数都是模板函数，则较具体的模板函数优先。例如，显式具体化将优先于模板隐式生成的具体化。这里的具体是指编译器推断使用哪种类型时执行转换最少。

### 创建自定义选择
在一些情况下，可以通过编写合适的函数调用，引导编译器做出我们希望的选择。

```
#include<iostream>
using std::endl;
using std::cout;

template<class T>
T lesser(const T a, const T b);

int lesser(const int a, const int b);

int main()
{
	int a = 1, b = 2;
	double c = 2.3, d = 4.6;

	cout << lesser(a, b) << endl;
	cout << lesser(c, d) << endl;

	cout << lesser<>(a, b) << endl;
	cout << lesser<int>(c, d) << endl;
}

template<class T>
T lesser(const T a, const T b)
{
	return a < b ? a : b;
}

int lesser(const int a, const int b)
{
	return a < b ? a : b;
}
```

`cout << lesser<>(a, b) << endl;`指出必须使用模板函数实例化后的函数，在这里使用int代替T进行实例化；

`cout << lesser<int>(c, d) << endl;`指出使用显式实例化后得到的函数，在这里`a`和`b`将被强制类型转换为int类型。
