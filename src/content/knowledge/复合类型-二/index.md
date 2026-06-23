---
title: "复合类型（二）"
description: "指针"
date: "2024-10-09 09:29:58"
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
# 指针和自由存储空间
指针是一个变量，其存储的是地址的值，而不是值本身。

常规变量的地址应用地址运算符（&）可得。

\*运算符称为间接值或解除引用运算符，将其应用于指针，可以得到该地址存储的值。

```
#include<iostream>

int main()
{
	using namespace std;

	int num = 6;
	int* ptr = &num;

	cout << hex;
	cout << ptr << ' ' << &num << endl;
	cout << dec;
	cout << *ptr << ' ' << num << endl;

	*ptr = *ptr + 1;
	cout << *ptr << ' ' << num << endl;

	return 0;
}
```
## 声明和初始化指针
计算机需要跟踪指针指向的值的类型，指针声明必须指定指针指向的数据类型。

需要说明的是，\*一般靠近数据类型`type* name`，但传统C一般采用`type *name`格式。

当一次声明多个指针时，每个指针变量名都需要使用一个\*.

在声明语句中初始化指针，通过将对应值的地址交给指针来实现。

## 指针的危险
在C\+\+创建指针时，计算机将用来分配存储地址的内存，但不会分配用来存储指针所指向的数据的内存，为数据提供空间是一个独立的步骤。

下面的行为将导致数据存储的地址不确定，可能会带来难以跟踪的bug.

```
long* ptr;
*ptr = 233333;
```
## 指针和数字
指针不是整型，虽然计算机通常把地址当作整数来处理。

从概念上看，指针与整数是截然不同的类型。整数可以执行算术运算，而指针描述的是地址，地址间的运算在不少时候是没有意义的。

因此，不能简单地将整数赋给指针，如果要将数字值作为地址来使用，应通过强制类型转换将数字转换为适当的地址类型。

```
int* pt;
pt = (int*)0xB8000000;
```

## 使用new来分配内存
指针真正的用武之地在于，在运行阶段，分配未命名的内存以及存储值。

为一个数据对象获得并指定分配内存的通用格式如下：
```
typeName * pointer_name = new typeName;
```
需要在两个地方指定数据类型：用来指定需要什么样的内存和用来声明合适的指针。

对于指针需要指出的是，new分配的内存块，通常与常规变量声明分配的内存块不同，常规变量的值存储在称为栈的内存块中，而new从被称为堆或自由存储区的内存区域分配内存。

## 使用delete释放内存
delete运算符使得在使用完内存后，能够将其归还给内存池，这是通向最有效的使用内存的关键一步。

使用内存时，后面要加上指向内存块的指针。
```
delete pt;
```
这将释放pt指向的内存，但不会删除pt本身。

一定要配对地使用new和delete，否则将发生内存泄露，被分配的内存再也无法使用了。

但是，不要尝试释放已经释放的内存块，C\+\+标准指出，这样做的结果是不确定的。另外，也不能使用delete释放声明变量的内存。

一般来说，不要创建两个指向同一个内存块的指针，因为这将增加错误地删除同一个内存块两次的可能性。

## 动态数组
通常而言，new是用来处理大型数据的。

在编译时给数组分配内存称为静态联编，意味着数组是在编译时加入到程序中的，但使用new时，如果在运行阶段需要数组，则创建它，如果不需要则不创建，还可以在程序运行时选择数组的长度，这被称为动态联编，意味着数组是在程序运行时创建的。

### 使用new创建动态数组
在C\+\+中，创建动态数组很容易，只需要将数组的元素类型和元素数目告诉new即可。必须在类型名后加上方括号，其中包含元素数目。

```
int * psome = new int [10];
```

new运算符返回第一个元素的地址。

当程序使用完new分配的内存块时，应使用delete释放它们：
```
delete [] psome;
```
方括号告诉程序，释放整个数组，而不仅仅时指针指向的元素。

为数组分配内存的通用格式如下：
```
type_name * pointer_name = new type_name [num_elements];
```

### 使用动态数组
数组和指针基本等价是C和C\+\+的优点之一，这意味着，我们可以采用类似数组的方式访问动态数组。
```
#include<iostream>

int main()
{
	using namespace std;

	double* ptr = new double[3];
	ptr[0] = 0.1;
	ptr[1] = 0.2;
	ptr[2] = 0.3;
	cout << ptr[0] << ' ' << ptr[1] << ' ' << ptr[2] << endl;

	return 0;
}
```
除此以外，由于指针本质是变量，我们也可以对指针进行加减，调整指针指向的内存位置。

# 指针、数组和指针算术
```
#include<iostream>

int main()
{
	using namespace std;
	int i_nums[3]{ 1,2,3 };
	double d_nums[3]{ 1.,2.,3. };
	int* i_ptr = i_nums;
	double* d_ptr = &d_nums[0];

	cout << i_ptr << ' ' << *i_ptr << endl;
	i_ptr = i_ptr + 1;
	cout << i_ptr << ' ' << *i_ptr << endl;

	cout << d_ptr << ' ' << *d_ptr << endl;
	d_ptr = d_ptr + 1;
	cout << d_ptr << ' ' << *d_ptr << endl;

	return 0;
}
```

在多数情况下，C\+\+将数组名解释为数组第一个元素的地址。

将指针变量+1后，其增加的值等于指向的类型占用的字节数。通常使用数组表示法的时候，C\+\+会进行由`arrayname[i]`到`*(arrayname+1)`的转换。

但是，当使用`sizeof`时，数组名得到的结果是数组的长度，而指针得到的结果是指针本身的长度。

## 指针和字符串
如果给cout提供一个字符的地址，则它将从该字符开始打印，直到遇到一个空字符为止。

在cout和多数C\+\+表达式中，char数组名、char指针以及用引号括起的字符串常量都被解释为字符串第一个字符的地址。

```
#include<iostream>
#include<cstring>
int main()
{
	using namespace std;
	char animal[20] = "rabbit";
	const char* bird = "wren";
	char* ptr;

	cout << animal << ' ' << bird << endl;
	cin >> animal;
	ptr = animal;
	cout << ptr << ' ' << (int*)ptr << endl;
	cout << animal << ' ' << (int*)animal << endl;

	ptr = new char[strlen(animal) + 1];
	strcpy_s(ptr, strlen(animal)+1, animal);
	cout << ptr << ' ' << (int*)ptr << endl;
	cout << animal << ' ' << (int*)animal << endl;

	delete []ptr;

	return 0;
}
```
首先关注const指针，字符串字面值是常量，这就是为什么代码在声明中使用关键字const的原因。
- 有些编译器将字符串字面值视为只读常量，如果试图修改它们，将导致运行阶段错误。在C\+\+中，字符串字面值都被视为常量，但并不是所有的编译器都对以前的行为做了这样的修改。
- 有些编译器只使用字符串字面值的一个副本来表示程序中所有的该字面值。C\+\+不能保证字符串字面值被唯一地存储。

指针被声明为const后，编译器将禁止改变指针指向的位置的内容。

其次，我们应该关注，最初ptr未被初始化，所以不应该之间将信息读入ptr指向的位置。

随后，在cout部分，如果给cout提供一个指针，它将打印地址，但如果指针类型是char*，则cout将显示指向的字符串。如果我们要显示字符串的地址，则必须将这种指针强制转换为另一种指针类型，如int*.

最后，当我们想要获得字符串副本时，首先需要分配内存，在这里我们使用new进行内存分配，再使用`strcpy_s()`将animal中的内容拷贝至ptr指向的内存空间。根据它们的地址，可知它们是存储在不同位置的内容相同的字符串。

## 使用new创建动态结构
将new用于结构有两步组成：创建结构和访问其成员。

创建结构如下：
```
struct_name* ptr = new struct_name;
```
访问成员时，由于不再有结构变量的具体名称，不能直接使用句点访问；C\+\+专门为这种情况提供了运算符（->），可用于指向结构的指针，就像点运算符可用于结构名一样。

此外，我们也可使用解析符，将指针转为结构后再使用句点访问。

```
#include<iostream>
#include<cstring>
#include<string>
using namespace std;
struct sample {
	int id;
	string name;
};

int main()
{
	sample* ptr = new sample;

	ptr->id = 0;
	(*ptr).name = "hello";
	cout << (*ptr).id << ' ' << ptr->name;

	return 0;
}
```

## 自动存储、静态存储和动态存储
### 自动存储
在函数内部定义的常规变量使用自动存储空间，称为自动变量，这意味着它们在所属函数调用时被自动产生，在该函数结束时自动消亡。

实际上，自动变量是一个局部变量，其作用域为包含它的代码块。
### 静态存储
静态存储时整个程序执行期间都存在的存储方式。使变量成为静态的方式有两种：一种是在函数外面定义它，另一种是在声明变量时使用关键字static.

### 动态存储
new和delete运算符提供了一种比自动变量更灵活的方式。它们管理一个内存池，这在C\+\+中被称为自由存储空间或堆。该内存池同用于静态变量和自动变量的内存是分开的。

在堆中的数据生命周期不完全受程序或函数的生存时间控制。与常规变量相比，使用new和delete让程序员对程序如何使用内存有更大的控制权，然而，内存管理也变更复杂了。

在栈中，自动添加和删除机制使得占用的内存总是连续的，但new和delete的相互影响可能导致占用的自由存储不连续，这使得跟踪分配内存的位置更困南。

# 数组的替代品
## 模板类vector
模板类vector类似与string类，也是一种动态数组。要创建vector类需要头文件vector，vector包含在名称空间std中。

用户可以在运行阶段设置vector对象的长度，可在末尾添加新的附加数据，还可在中间插入新数据。

基本上，它是new创建动态数组的替代品。实际上vector确实使用new和delete来管理内存的。

模板使用不同的语法来指出它存储的数据类型，vector类使用不同的语法来指定元素数。

一般而言，创建vector对象如下：
```
vector<typeName> vt(n_elem);
```
其中参数n_elem既可是整型变量也可是整型常量。

## 模板类array（C\+\+11）
vector类功能比数组强大，但付出的代价是效率稍低。

如果需要的是固定长度的数组，使用array是更好的选择。要创建array类需要头文件array，array包含在名称空间std中。

array对象创建的语法如下：
```
array<typeName, n_elem> arr;
```

与创建vector不同的是，n_elem不能是变量。
## 示例
```
#include<iostream>
#include<vector>
#include<array>

int main()
{
	using namespace std;

	vector<double> d_nums(3) ;
	d_nums[0] = 1.1;
	d_nums[1] = 2.2;
	d_nums[2] = 3.3;

	cout << d_nums[0] << ' ' << d_nums[1] << ' ' << d_nums[2] << endl;

	array<double, 3> a_nums{ 1.,2.,3. };
	cout << a_nums[0] << ' ' << a_nums[1] << ' ' << a_nums[2] << endl;

	// cout << a_nums[-2] << endl;

	return 0;
}
```
需要指出，C\+\+不检查越界错误。

我们可以使用成员函数`at()`：
```
a_nums.at(1) = 2.3;
```
与中括号表示法不同在于，使用`at()`，将在运行期间捕获非法索引。这种额外检查的代价是运行时间更长。
