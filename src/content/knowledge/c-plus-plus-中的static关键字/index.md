---
title: "C++中的static关键字"
description: "static关键字的注意事项"
date: "2024-12-07 14:25:22"
category: "C++ 基础"
originalCategory: "C++八股"
track: "Programming Foundation"
level: foundation
status: ready
published: true
minutes: 5
order: 1000
prerequisites: []
tags: ["C++"]
source: "_posts"
---
参考：
https://csguide.cn/


`static`是一个非常重要的关键字，它可以用于变量、函数和类中。

# static修饰全局变量
`static`修饰全局变量可以将变量的作用域限定在当前文件中，使得其他文件无法访问该变量。

同时，static修饰的全局变量在程序启动时被初始化（可以简单理解为在执行main函数之前，会执行一个全局初始化函数，在那里会执行全局变量的初始化），生命周期和程序一样长。

```
// a.cpp
static int a = 10;
int main(){
    cout<<a<<endl;
}

// b.cpp
extern int a;
void fun(){
    cout<<a<<endl; // error，链接错误
}
```

# static修饰局部变量
`static`修饰局部变量可以使得变量在函数调用结束后不会被销毁，而是一直存在于内存中，下次调用该函数时可以继续使用。

同时，由于`static`修饰的局部变量的作用域仅限于函数内部，所以其他函数无法访问该变量。

```
void fun(){
    static int count = 0;
    count++;
    cout<<count<<endl;
}

int main(){
    fun();
    fun();
}
```

# static修饰函数
`static`修饰函数可以将函数的作用域限定在当前文件中，使得其他文件无法访问该函数。

同时，由于`static`修饰的函数只能在当前文件中被调用，因此可以避免命名冲突和代码重复定义。

```
// a.cpp
static void fun(){}

int main(){
    fun();
}

// b.cpp
extern void fun();
void fun2(){
    fun(); // error
}
```

# static修饰类成员变量和函数
static修饰类成员变量和函数可以使得它们在所有类对象中共享，且不需要创建对象就可以。

```
class MyClass{
    public:
        static int count;
        static void foo(){cout<<count<<endl;}
}

// 直接访问
MyClass::count;
MyClass::foo();
```
