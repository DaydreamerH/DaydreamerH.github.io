---
title: "函数（一）"
description: "函数的基础内容"
date: "2024-10-11 14:16:59"
category: "C++ 基础"
originalCategory: "C++快速入门"
track: "Programming Foundation"
level: foundation
status: ready
published: true
minutes: 7
order: 1000
prerequisites: []
tags: ["C++"]
photos: "banner.png"
source: "_posts"
---
# 函数的基本知识
要使用C\+\+函数，必须完成如下工作：
- 提供函数的定义
- 提供函数的原型
- 调用函数

## 定义函数
没有返回值的函数通用格式如下：
```
void functionName(parameterList)
{
    statements
    return; // optional
}
```

有返回值的函数通用格式如下：
```
typeName functionName(parameterList)
{
    statements
    return value;
}
```
对于有返回值的函数，必须使用返回语句，以便将其值返回给调用函数。值本身可以是常量、变量，也可以是表达式，只是其结果的类型必须为typeName或可以被转换为typeName。

C\+\+对于返回值的类型有一定的限制，不能是数组，但可以是其他任何类型，甚至包括结构和对象。

函数会在执行遇到的第一条返回语句后结束。

### 函数如何返回值
函数通过将返回值复制到指定的CPU寄存器或内存单元中将其返回。

随后调用程序查看该内存单元。

返回函数和调用函数必须就该内存单元存储的数据的类型达成一致。

## 函数原型和函数调用
### 为什么需要原型
原型描述了函数到编译器的接口，也就是说，它将函数返回值的类型以及参数的类型和数量告诉编译器。

编译器之所以不通过在文件中搜索函数定义而需要函数原型，不仅因为搜索过程效率低下，还有可能出现函数不在文件中。C\+\+允许将一个程序放在多个文件中，单独编译这些文件，再将它们组合起来。

避免使用函数原型的唯一方法是在首次使用函数之前定义它，但是C\+\+的编程风格是将main放在最前面。

### 原型的语法
函数原型是一条语句，必须以分号结束。

获得原型最简单的方法是，复制函数定义头，并添加分号。

然而函数原型其实并不要求提供变量名，有类型列表即可。即使提供了变量名，也只相当于占位符，因此与函数定义中的变量名不同也没什么问题。

### 原型的功能
原型可以帮助程序员降低程序出错的机率。

原型确保以下几点：
- 编译器正确处理函数返回值。
- 编译器检查使用的参数数目是否正确。
- 编译器检查使用的参数类型是否正确；如果不正确，则转换为正确的类型。

# 函数参数和按值传递
C\+\+按值传递参数，这意味着将数值参数传递给函数，而后者将其赋给一个新的变量。

在函数中声明的变量（包括参数）是该函数私有的，在函数被调用时，计算机将为这些变量分配内存，函数结束时，计算机将释放这些内存。

## 多个参数
函数可以有多个参数，在调用函数时，只需使用逗号将这些参数分开即可。

在定义函数时，只需用逗号分隔开，调用函数时同理。

### 示例
抽卡游戏中，从total张卡中抽出choices张卡，如果choices张卡与主办方预设的choices张卡完全一致，则会获得大奖，求概率。

```
#include<iostream>
double probability(unsigned choices, unsigned total);
int main()
{
	using namespace std;
	unsigned choices;
	unsigned total;

	cin >> choices >> total;

	cout << probability(choices, total);

	return 0;
}

double probability(unsigned choices, unsigned total)
{
	double result = 1.;
	while (choices > 0)
	{
		result *= (double)total / choices;
		--choices;
		--total;
	}
	return result;
}
```
值得注意的是，在这个例子中我们并没有先单独算分子分母再做除法，而是交替进行乘除法，这样做中间的因子更小，哪怕因子过多，也不会使得中间结果超出最大浮点数。

# 函数和数组
```
#include<iostream>
const int ArSize = 8;
int sum_arr(int arr[], int n);

int main()
{
	using namespace std;
	int cookies[ArSize]{ 1, 2, 4, 8, 16, 32, 64, 128 };

	int sum = sum_arr(cookies, ArSize);
	cout << sum << endl;
}

int sum_arr(int arr[], int n)
{
	int total = 0;
	for (int i = 0; i < n; i++)
		total += arr[i];
	return total;
}
```
## 函数如何使用指针来处理数组
在大多数情况下，C\+\+和C语言一样，也将数组视为指针。该规则有一些例外：
- 首先数组声明使用数组名来标记存储位置
- 对数组名使用sizeof将得到整个数组的长度
- 将地址运算符&用于数组名时，将返回得到整个数组的地址

在上述程序中，调用函数时将`cookies`作为参数传入，实际上传入了int*类型，而函数原型与定义中，用的是int []，这二者在函数参数列表处等价。

当然我们也可以用`int sum_arr(int* arr, int n)`.

## 将数组作为参数意味着什么
上述程序中，我们将数组作为参数传入，实质上并没有传递数组的副本，而是传递的数组的位置、元素类型。

数组与指针相对应，可以节省复制整个数组所需的时间和内存。如果数组很大，则使用拷贝的系统开销将非常大；程序不仅需要更多的计算内存，还需要花费时间来复制大块的数据。

但是，使用原始数组增加了破坏数据的风险。

当然，我们可以通过const关键字来保护原始数组不被函数修改，在声明形参时如果使用关键字const，就可以保证指针指向的是常量数据，函数不能通过该指针修改数据。

## 使用数组区间的函数
我们可以通过传递两个指针来实现指定元素区间，其中一个指针标识数组的开头，另一个指针标识数组的尾部。

STL方法使用“超尾”概念来指定区间，也就是说，对于数组而言，标识数组结尾的参数将是指向最后一个参数后面的指针。
```
#include<iostream>
const int ArSize = 8;
void showArray(const int* begin, const int* end);

int main()
{
	using namespace std;
	int cookies[ArSize]{ 1, 2, 4, 8, 16, 32, 64, 128 };
	int* pr = cookies;
	showArray(pr, pr+ArSize);
	return 0;
}

void showArray(const int* begin, const int* end)
{
	using std::cout;

	while (begin != end)
	{
		cout << *begin << ' ';
		++begin;
	}
}
```
## 指针和const
将const用于指针有一些很微妙的地方：
- 让指针指向一个常量对象，这样防止通过该指针修改所指向的值。
- 将指针本身声明为常量，防止修改指针指向的位置。

首先，声明一个指向常量的指针pt：
```
int age = 39;
const int* pt = &age;
```
pt的声明并不意味着值本身确实是个常量，但是对于pt自己而言，这个值是常量。

在这里我们是将常规变量的地址赋给const指针，我们还可以将const变量的地址赋给指向const的指针。
```
const int age = 39;
cnost int* pt = &age;
```
但是我们不能将const变量的地址赋给常规指针，这很荒谬。

简单来说，如果数据类型并不是指针，则可以将const数据或非const数据的地址赋给指向const的指针，但只能将非const数据的地址赋给非const指针。

如果指针指向的是另一个指针，情况将更为复杂。当只有一层间接关系时，才可以将非const地址或指针赋给const指针。

当我们试图保证指针指向的地址不被修改时，我们应将const靠近变量。
```
int* const pt;
```
当然，const可以同时保证指针本身以及指向的变量不被修改。
```
const int* const pt;
```
# 函数和二维数组
为编写将二维数组作为参数的函数，必须牢记，数组名被视为其地址，因此，相应的形参是一个指针，就像一维数组一样。

例如，我们将一个三行四列的数组传入函数，则应该如下实现：
```
int sum(int ar[][4], int size);
// or: int sum(int (*ar)[4], int size);

int main()
{
	int data[3][4] = {...};
	int total = sum(data, 3);
}
```
这是因为data本身是个数组名，即一个指向包含三个元素的指针，只不过这次的元素类型是一个包含4个整型的数组。

需要注意的是`int (*ar)[4]`，声明的是一个指向四个由int组成的数组的指针，而不是`int *ar[4]`，四个指向int的指针组成的数组。

除此以外，我们在声明参数的时候没有使用const，这是因为这种关键字只能用于指向基本类型的指针，而ar是指向指针的指针。

# 函数和结构
处理结构时，最直接的方式是像处理基本类型一样处理结构。

但如果结构非常大，则复制会增加内存要求，大多数人更倾向于使用指针来访问结构内存。

当然，C\+\+提供了第三种方式，引用来解决，这种方法将在后面介绍。

# 函数指针
与数据项相似，函数也有地址。函数的地址是存储器机器语言代码的内存的开始地址。

对程序而言，如果知道函数的地址，则可以对他进行调用，这与直接调用其他函数相比，较为笨拙。

但它允许在不同的时间传递不同的函数地址，这意味着，根据需要可以更自由地选择调用哪个函数。

## 函数指针的基础知识
假设我们要调用一个函数`estimate()`，估算编写指定行数的代码所需的时间，并且希望不同的程序员都能按自己提供的算法计算时间，那么我们就需要传递函数地址。

我们需要完成下面三步：
- 获取函数的地址
- 声明一个函数指针
- 使用函数指针来调用函数

### 函数地址
获取函数地址非常简单，只需要函数名即可。

例如`estimate`就是函数地址。

### 声明函数指针
声明指向某种数据类型的指针时，必须指定指针指向的类型。

声明函数指针就需要声明函数的返回类型以及函数的参数列表。

假设估算所用的函数如下：
```
double pam(int);
```
那么函数指针应该声明为：`double (*pf)(int)`，其中`(*pf)`是函数，`pf`是函数指针。

需要注意的是括号，如果去掉了括号，则意味着这是一个返回double类型指针的函数，因为*的优先级比括号小。

`estimate`函数原型如下：
```
estimate(int, double (*pf)(int));
```

### 使用指针调用函数
在前文我们已经知道`(*pf)`就是函数，那么现在只要传入合适的参数即可使用。

实际上，C\+\+也允许像使用函数名一样使用`pf`.

```
#include<iostream>
using namespace std;
double first_method(int lns);
double sec_method(int lns);

void estimate(int lns, double (*pf)(int));

int main()
{
	const int lines = 10;

	cout << "First method: ";
	estimate(lines, first_method);
	cout << endl;
	cout << "Second method: ";
	estimate(lines, sec_method);
}

double first_method(int lns)
{
	return 0.003 * lns;
}

double sec_method(int lns)
{
	return 0.005 * lns;
}

void estimate(int lns, double (*pf)(int))
{
	cout << (*pf)(lns); // or: cout<< pf(lns);
}
```
## 深入探讨函数指针
函数指针的表示可能非常恐怖。

下面是一些函数的原型，它们的特征标和返回类型相同：
```
const double* f1(const double ar[], int n);
const double* f2(const double *, int n);
const double* f3(const double [], int n);
```

这些函数的参数列表实际上完全一致，这意味着，当我们声明一个函数指针用以指向其中一个函数的地址时，实际上可以指向其余两个函数的地址。

进行声明与初始化：
```
const double* (*pf)(const double *, int) = f1;
```

当然，使用C\+\+11的自动判断类型功能，代码要简洁得多：
```
auto p2 = f2;
```

当这里有三个函数可供选择时，如果有一个函数指针数组就会很方便。

声明与初始化如下：
```
const double* (*pa[3])(const double *, int) = {f1, f2, f3};
```

`[3]`放置的位置很有意思，首先`pa`是一个包含三个元素的数组，而要声明这样的数组秒首先需要使用`pa[3]`.

而运算符[]的优先级高于*，这意味着这个数组是包含三个指针的数组。

这里不能使用auto，因为自动推断类型只能用于单值初始化，而不能用于初始化列表。

上述声明的其他部分指出，每个指针指向的是：特征标（参数列表）为const double *, int且返回类型为const double *的函数。因此，pa是一个包含三个指针的数组，其中每个指针都指向这样的函数。

调用这个数组中的函数：
```
auto pb = pa;

const double * px = pa[0](v, 3);
const double * py = (*pb[1])(v, 3);
```

我们还可以创建指向整个数组的指针，由于数组名是指向函数指针的指针，因此指向该数组的指针将是一个指向指针的指针的指针。

这看起来就不想写，但是我们有auto.
```
auto pc = &pa;
```

当然，你非要自己写，那么可以按照下面的写法：
```
const double *(*(*pd)[3]) (const double *, int) = &pa;
```

调用函数，需要认识到：既然`pd`是指向数组的指针，那么`*pd`就是数组，那么`*pd[0]`就是函数指针，所以我们可以直接`*pd[0](v, 3)`来调用函数。当然，我们还是可以采取直接调用函数的方式`(*(*pd[0]))(v, 3)`。如果要获取函数返回的指针的值，则应写为`*(*pd[0])(v,3)`或者`*(*(*pd[0]))(v, 3)`.

### 使用typedef进行简化
除auto外，我们还可以使用typedef简化声明。

typedef能够给类型取别名，如下：

```
typedef double fun; // makes fun another name for double
```

简化上述的复杂的声明可以这样做：
```
typedef const double * *(*p_fun)(const double *, int);
p_fun p1 = f1;
```
