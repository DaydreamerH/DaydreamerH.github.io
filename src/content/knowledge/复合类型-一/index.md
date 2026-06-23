---
title: "复合类型（一）"
description: "数组、字符串、结构、共同体与枚举的介绍"
date: "2024-10-08 09:51:39"
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
photos: "banner.jpg"
source: "_posts"
---# 数组
数组是一种数据格式，能够存储多个同类型的值。每个值都存储在一个独立的数组元素中，计算机在内存中依次存储数组的各个元素。

要创建数组，可使用声明语句。数组声明应指出以下三点“
- 存储在每个元素中的值的类型
- 数组名
- 数组中的元素数

声明数组的通用格式如下：
```
typeName arraryName[arraySize];
```

数组的很多用途都是基于这样一个事实：可以单独访问数组元素。方法是使用下标或索引来对元素进行编号。C\+\+数组从0开始编号。

编译器不会检查使用的下标是否有效，但是程序运行后，这种错误可能破坏数据或代码，也可以导致程序异常终止。

```
#include<iostream>

int main()
{
	using std::cout;
	using std::endl;

	int nums[3];
	nums[0] = 1;
	nums[1] = 2;
	nums[2] = 3;

	cout << nums[0] << ' ' << nums[1] << ' ' << nums[2] << endl;

	int another_nums[3] = { 1, 2, 3 };
	cout << another_nums[0] << ' ' << another_nums[1] << ' ' << another_nums[2] << endl;

	cout << sizeof(nums) << ' ' << sizeof(nums[1]) << endl;

	return 0;
}
```

## 初始化
C\+\+允许在声明语句初始化数组元素。只需提供一个用逗号分割的值列表，并将它们用花括号括起来即可。

如果没有初始化函数中定义的数组，则其元素值将是不确定的，这意味着元素的值为以前驻留在该内存单元中的值。

C\+\+有几条关于初始化数组的规则：
- 只有在定义数组时才能使用初始化，此后就不能使用了，也不能将一个数组赋给另一个数组。
- 初始化数组时，提供的值可以少于数组的元素数目，编译器会将其他元素设置为0.
- 如果声明数组时空缺元素个数，必须进行初始化，C\+\+编译器将计算元素个数。但通常，让编译器计算元素个数是种很糟的做法。

C\+\+11允许使用大括号的初始化作为一种通用初始化方式，可用于所有类型，当然包括数组：
- 初始化数组时，可省略等号。
- 可不在大括号内包含任何东西，这将把所有元素都设置为0.
- 列表初始化禁止缩窄转换。

值得说明的是，C\+\+标准模板库提供了一种数组替代品，vector，而C\+\+11新增了模板类array. 它们比数组更复杂、更灵活。

# 字符串
字符串是存储在内存的连续字节中的一系列字符。C\+\+处理字符串的方式有两种：
- 将字符串存储在char数组中
- 使用string类库

## C风格字符串
C风格字符串具有一种特殊的性质：以空字符结尾，空字符被写作\0，其ASCII码为0，用来标记字符串的末尾。

在初始化char数组时，若存入字符串，则只需要使用一个用引号括起的字符串即可。该方式隐式地包含结尾的空字符。

### 拼接字符串
有时候，字符串很长，无法放到一行中。C\+\+允许拼接字符串字面值，即将两个用引号的字符串合并为一个。

事实上，任何两个由空白分隔的字符串常量都将自动拼接成一个。

### 存储字符串
要将字符串存储到数组中，最常用的方法有两种：
- 将数组初始化为字符串常量
- 将键盘或文件输入读入到数组中

```
#include<iostream>
#include<cstring>

int main()
{
	using namespace std;

	char name[10];
	char another_name[10] = "Hello";

	cin >> name;
	cout << name << ' ' << another_name << endl;

	cout << sizeof(another_name) << ' ' << strlen(another_name) << endl;
	return 0;
}
```
#### 字符串输入可能存在的缺陷
```
#include<iostream>
#include<cstring>

int main()
{
	using namespace std;

	char name[10];
	char dessert[10];

	cout << "Enter your name:" << endl;
	cin >> name;
	cout << "What do you want to eat?" << endl;
	cin >> dessert;
	cout << name << " want a " << dessert << endl;

	return 0;
}
```

当输入的name包含空格时，如：Alistair Dreeb，我们会发现dessert还未输入，就已经将Dreeb存入数组。

这是因为cin使用空白（空格、制表符和换行符）来确定字符串结束的位置，这意味着cin往往只读入一个单词。

#### 每次读取一行字符串输入
我们时常需要面向行而不是面向单词的方法。

istream中的类（如cin）提供了一些面向行的类成员函数：`getline()`和`get()`.

`getline()`读取整行，它使用通过回车键输入的换行符来确定输入结尾。该函数有两个参数，第一个参数是用来存储输入行的数组名称，第二个参数是要读取的字符数（包含在结尾处自动添加的空字符）。

`geline()`并不保存换行符。

`get()`有好几种变体，其中一种与`getline()`相似，接受的参数相同，并且都读到行尾，但`get()`并不再读取丢弃换行符，而是将其留在输入队列中。

```
cin.get(name，arraySize);
cin.get(); // read new line
cin.get(dessert, arraySize);

cin.get(name, arraySize).get().get(dessert, arraySize);
```
之所以可以将类成员函数拼接起来，是因为`cin.get()`返回一个cin对象，我们再次调用返回的cin对象的类成员函数即可。

`cin.getline()`同理。

需要指出的一点是，C\+\+允许函数有多个版本，条件是这些版本的参数列表不同。

如果使用的是`cin.get()`（没有参数），则编译器读取一个字符。

总的来说，我们更倾向于使用`get()`，这是因为它读取更仔细，当我们需要查看输入停止的原因是什么，只需要看下一个字符是不是换行符，若是，说明读取到行尾了，若不是，说明输入长度过长。

#### 空行和其他问题
当`get()`读取到空行时，将设置失效位，这意味着接下来的输入将被阻断，我们可以使用`cin.clear()`恢复输入。

当`getline()`读取到空行时，下一条输入语句将在结束读取的位置开始读取。

如果输入行的字符数比指定的多，二者都会把余下的字符留在输入队列中，`getline()`还会设置失效位，并关闭后面的输入。

#### 混合输入字符串和数字
```
#include<iostream>
#include<cstring>

int main()
{
	using namespace std;

	char name[10];
	int age;
	cin >> age;

	cin.get();

	cin.get(name, 10);

	cout << age << ' ' << name << endl;

	return 0;
}
```
我们需要注意cin读取数字时，将回车符残留在了输入队列中，需要单独读取。

## string类简介
要使用string类，必须在程序中包含头文件cstring。string位于名称空间std中。

```
#include<iostream>
#include<cstring>
#include<string>

int main()
{
	using namespace std;

	string name;
	string name2 = "world";

	cin >> name;
	cout << name << ' ' << name2 << endl;
	cout << name2[0] << endl;

	return 0;
}
```
在很多方面，使用string对象的方式与使用字符数组相同：
- 可以使用C风格字符串来初始化string对象。
- 可以使用cin来键盘输入存储到string对象。
- 可以使用cout来显示string对象。
- 可以使用数组表示法来访问存储在string对象中的字符。

类设计让程序能够自动处理string的大小，这使得与使用数组相比，使用string对象更方便，也更安全。

### C\+\+11字符串初始化
C\+\+11也允许列表初始化用于C风格字符串和string对象。

### 赋值、拼接和附加
- 可以将一个string对象赋给另一个string对象。
- string类简化了字符串合并操作，可以使用运算符+将两个string对象合并起来，还可以使用运算符+=把字符串附加到string对象的末尾。

### string类I/O
```
#include<iostream>
#include<cstring>
#include<string>

int main()
{
	using namespace std;

	char charr[20];
	string s;

	cin.get(charr, 20).get();

	getline(cin, s);

	cout << charr << ' ' << s << endl;

	return 0;
}
```
其中`getline(cin, s);`表明此处的`getline()`不是一个类方法，它将cin作为参数指出哪里去找输入流。

在引入string前，C\+\+早就有istream类，istream虽然考虑了int、double等类型，但没有处理string对象的类方法。

cin、cout之所以能处理string类用到了友元函数。

# 结构简介
结构是一种比数组更灵活的数据格式，因为同一个结构可以存储多种类型的数据。

结构是用户定义的类型，而结构声明定义了这种类型的数据属性。首先定义结构描述，然后按描述创建结构变量。

```
struct structName
{
	type name;
	...
};
```
定义结构后，便可以创建这种类型的变量了：
```
struct structName varName;

structName varName;
```

在C\+\+中省略struct不会出错。

我们可以使用成员运算符(.)来访问各个成员
`
varName.name
`.

```
#include<iostream>
struct inflatable
{
	char name[20];
	float volum;
	double price;
};

int main()
{
	using namespace std;

	inflatable guest =
	{
		"Hello",
		1.88,
		29.99
	};
	cout << guest.name << ' ' << guest.price << endl;

	return 0;
}
```
结构声明的位置很重要，对于包含两个或多个函数的程序来说，外部声明可以被其后面的任何函数使用，而内部声明只能被该声明所属的函数使用。通常应该使用外部声明。

同理，变量也可以在函数内部与外部声明。

C\+\+不提倡使用外部变量，但提倡使用外部结构声明。

## C\+\+11结构初始化
C\+\+11也支持将列表初始化用于结构，且等号是可选的。

## 其他结构属性
C\+\+使用户定义的类型与内置类型尽可能类似，例如，可以将结构作为参数传递给函数，函数可以返回一个结构，还可以使用赋值运算将一个结构赋给另一个同类型的结构。

结构允许同时定义和创建，为此，只需将变量名放在结束括号后面即可：
```
struct inflatable
{
	char name[20];
	float volum;
	double price;
}var1, var2;
```

甚至可以初始化以这种方式创建的变量。
```
struct inflatable
{
	char name[20];
	float volum;
	double price;
}var1 =
{
	"hello",
	1.99,
	19.99
};
```
然而，将结构定义和变量声明分开，可以使程序更易于阅读和理解。

还可以声明没有名称的结构类型，方法是省略名称，同时定义一种结构类型和一个这种类型的变量。

## 结构数组
C\+\+可以创建元素为结构的数组，方法和创建基本类型数组完全相同。

# 共用体
共用体（union）是一种数据格式，它能够存储不同的数据类型，但只能同时存储其中一种的数据类型。

共用体的句法与结构相似，但含义不同。

```
#include<iostream>
union one4all
{
	int int_val;
	double double_val;
};

int main()
{
	using namespace std;

	one4all var;
	var.int_val = 1;
	cout << var.int_val << endl;
	var.double_val = 1.1;
	cout << var.double_val << endl;

	return 0;
}
```
由于共同体每次只能存储一个值，因此它必须有足够的空间来存储最大的成员，所以，共用体的长度为其最大成员的长度。

共用体的用途之一是，当数据项使用两种或更多格式时，可节省空间。
```
#include<iostream>
struct sample {
	int type;
	union id {
		long id_num;
		char id_char[20];
	} id_val;
};

int main()
{
	using namespace std;
	sample var = { 0, 1 };
	if (var.type == 0)cout << var.id_val.id_num << endl;
	else cout << var.id_val.id_char << endl;

	return 0;
}
```

匿名共用体没有名称，其成员将称为位于相同地址位置处的变量。
```
#include<iostream>
struct sample {
	int type;
	union {
		long id_num;
		char id_char[20];
	};
};

int main()
{
	using namespace std;
	sample var = { 0, 1 };
	if (var.type == 0)cout << var.id_num << endl;
	else cout << var.id_char << endl;

	return 0;
}
```

共用体常用于节省内存。

# 枚举
C\+\+的enum工具提供了另一种创建符号常量的方式，这种方式可以替代const.

```
enum spectrum {red, orange, yellow, green};
```
这条语句完成两项工作：
- 让spectrum成为新类型的名称；spectrum被称为枚举，就像struct变量被称为结构一样。
- 将red、orange、yellow等作为符号常量，对应0~3，这些常量叫作枚举量。

可以用枚举名来声明这种类型的变量。

枚举变量具有一些特殊属性，在不进行强制类型转换的情况下，只能将定义枚举时使用的枚举量赋给这种枚举的变量。

对于枚举，只定义了赋值运算，没有定义算术运算。但在某些实现中，枚举量可以参与部分运算，这有可能违反类型本身的限制。

枚举量是整型，可被提升为int类型，但int类型不能自动转换为枚举类型。

## 设置枚举变量的值
在默认情况下，将整数值赋给枚举变量，第一个枚举量为0，第二个枚举量为1，以此类推。

可以使用赋值运算符来显式地设置枚举量的值。指定的值必须是整数，可以只是显式地定义其中一些枚举变量的值。

```
enum {first, second = 100, third};
```
first在默认情况下是0，而third比上一个大1，即101.

可以创建多个值相同的枚举量。甚至可以使用long或long long类型的值赋予枚举量。

## 枚举的取值范围
C\+\+现在通过强制类型转换，增加了可赋给枚举变量的合法值。

每个枚举都有取值范围，通过强制类型转换，可以将取值范围中的任意整数值赋给枚举变量。

取值范围的定义如下：首先找到上限，需要知道枚举量的最大值，找到大于这个最大值的、最小的2的幂，将它减一；计算下限，若枚举量的最小值不小于0，则为0，否则采用与寻找上线方式相同的方式。
