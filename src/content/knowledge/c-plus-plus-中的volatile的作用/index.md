---
title: "C++中的volatile的作用"
description: "volatile关键字的注意事项"
date: "2024-12-07 14:43:44"
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


`volatile`是C语言中的一个关键字，用于修饰变量，表示该变量的值可能在任何时候被外部因素更改，例如硬件设备、操作系统或其他线程。

当一个变量被声明为`volatile`时，编译器会禁止对该变量进行优化，以确保每次访问变量时都会从内存中读取其值，而不是从寄存器或缓存中读取。

避免因为编译器优化而导致出现不符合预期的结果。

```
#include <stdio.h>
#include <stdlib.h>
#include <pthread.h>

volatile int counter = 0;
void *increment(void *arg){
    for(int i=0;i<10000;i++){
        count++;
    }
    return NULL;
}

int main(){
    pthread_t thread1, thread2;

    pthread_create(&thread1, NULL, increment, NULL);
    pthread_create(&thread2, NULL, increment, NULL);

    pthread_join(thread1, NULL);
    pthread_join(thread2, NULL);

    printf("Counter: %d\n", counter);

    return 0;
}
```

上面的代码声明了一个`volatile int`类型的全局变量`counter`，并创建了两个线程。

`counter`全局变量被访问时一定会从内存中读取。

当然，上述代码存在并发问题。
