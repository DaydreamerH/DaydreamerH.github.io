---
title: "OptiX：Implemetation principles"
description: "OptiX编程的注意事项"
date: "2025-09-16 22:36:09"
category: "图形与高性能计算"
originalCategory: "OptiX入门"
track: "Rendering / HPC"
level: advanced
status: ready
published: true
minutes: 5
order: 1000
prerequisites: []
tags: ["CG", "OptiX"]
photos: "banner.jpg"
source: "_posts"
---# Error handling
OptiX的API调用会返回枚举值，通过减产返回值，我们可以判断调用是否成功。

可以在创建device context时注册一个日志回调函数：
以接收额外的调试或错误信息，如编译失败、资源不足等。

一些编译相关的函数，可以传入一个字符串buffer，buffer将填充错误信息、警告、资源使用情况。

# Thread safety
Host functions: 几乎所有主机端函数都是线程安全的，如果由特殊情况，会在API文档标注。

线程安全的前提是输出缓冲区（ouput buffer）和临时/状态缓冲区（temporary/state buffer）必须唯一，
也就是说，不同线程不能同时写同一块GPU内存，否则会发生数据竞争。

例如，你可以创造多个加速结构，即使它们来自相同的几何体，但只要它们各自有独立的输出buffer和临时buffer.

如果某个函数需要临时内存或状态内存，OptiX API会在参数列表里明确要求你传入。

# Stateless model
如果输入是相同的，那么输出一定相同。OptiX内部并不会保存任何隐式的GPU状态。

在 OptiX 的函数调用中，使用的 CUstream 必须属于 用来创建这个 OptixDeviceContext 的 CUcontext。

- CUContext:
  - CUDA 里的“上下文”（context）。
  - 可以理解为 GPU 上运行环境的“容器”，里面包含内存分配、流、纹理对象、内核配置等状态。
- CUStream
  - CUDA 流（stream），是任务（kernel、内存拷贝等）在 GPU 上执行的“队列”。
  - 不同的 stream 可以让 GPU 做并发执行。
- OptixDeviceContext
  - OptiX 的设备上下文，它是依赖于 CUDA 的 CUcontext 创建的。
  - 相当于 OptiX 在某个 CUDA 上下文里的“工作空间”。

先用某个 CUDA 上下文（CUcontext）创建了 OptixDeviceContext。

那么以后在调用 OptiX 函数时，如果传入一个 CUDA stream（CUstream），它必须和这个 CUDA 上下文绑定。

有些 OptiX 的 API 函数需要你传入一个 CUDA stream (CUstream)，这些函数会在 GPU 上产生实际工作（比如 kernel 启动、内存操作）。

在调用它们时，你必须保证 GPU 的当前上下文 (current CUcontext) == 创建 OptixDeviceContext 时绑定的那个 CUcontext。

OptiX 在执行 API 的过程中 不会偷偷切换上下文。

```
// 假设当前 CUDA 上下文 cuCtxA
cuCtxSetCurrent(cuCtxA);

// 用 cuCtxA 创建 OptiX 上下文
OptixDeviceContext optixCtx;
optixDeviceContextCreate(cuCtxA, 0, &optixCtx);

// 创建一个 CUDA stream
CUstream stream;
cuStreamCreate(&stream, CU_STREAM_DEFAULT);

// 正确：当前上下文 = OptiX 上下文绑定的 cuCtxA
optixLaunch(pipeline, stream, ...);

// 错误：如果此时切换了上下文
cuCtxSetCurrent(cuCtxB); // 另一个不相关的上下文
optixLaunch(pipeline, stream, ...); // 行为未定义
```

# Asynchronous execution
OptiX 在 GPU 上的工作（比如光线追踪、加速结构构建）会被 投递到你传入的 CUDA stream；这些投递使用的是 异步 CUDA API（类似 cuLaunchKernelAsync、cuMemcpyAsync），
意味着：工作只是 排队到 GPU stream，并不是立即完成。

当你在 CPU 端调用一个 OptiX API（比如 optixLaunch）：
CPU 端的函数会等到所有 GPU 工作都被排队进 stream 里，然后返回。
换句话说：CPU 端不会在还没把 GPU 指令投递完就返回。

CPU 并不会等待 GPU 把这些工作实际执行完；所以 GPU 工作会在后台异步进行。

# Opaque types
API 中的一些类型对用户“不可见”，内部实现细节被隐藏了。
例如：
- OptixModule：表示一个已编译的 GPU 程序模块。
- OptixPipeline：表示光线追踪程序管线。

用户只能通过 API 提供的函数操作它们，而不能访问内部结构。

不透明类型本质上可以当作句柄或指针来使用。

# Function table and entry function
OptiX 的 Host API 不是直接静态链接的，而是通过一个 函数表（OptixFunctionTable） 来管理所有函数指针。
- 当 OptiX 新版本增加函数时，不破坏旧版本 API
- 用户可以动态获取当前版本的函数地址

OptiX 定义了一个 结构体 OptixFunctionTable。
这个结构体里面 存放了所有 Host API 函数的指针。

```
struct OptixFunctionTable
{
    OptixResult (*optixDeviceContextCreate)(...);
    OptixResult (*optixModuleCreateFromPTX)(...);
};
```

## optixQueryFunctionTable
OptiX driver 库提供了一个符号 optixQueryFunctionTable，用以动态获取对应版本API的函数指针表。

```
OptixQueryFunctionTable_t* optixQueryFunctionTable;

OptixFunctionTable optixFunctionTable = {};
OptixResult result = optixQueryFunctionTable(
    OPTIX_ABI_VERSION, 0, 0, 0, &optixFunctionTable,
    sizeof(OptixFunctionTable));
```

其中`OPTIX_ABI_VERSION`宏定义了当前函数表对应的 API 二进制接口版本。
- 保证函数表和库版本匹配
- 防止不同版本之间的函数指针不一致或出错

## 使用函数表调用API
通过函数表显式调用，可以在运行时选择不同版本的函数，保证向前兼容。

```
CUcontext fromContext = nullptr
...
OptixDeviceContextOptions options = {}
...
OptixResult result = optixFunctionTable.optixDeviceContextCreate(
fromContext, &options, &context );
```

## stubs
由于通过函数表实例进行显式调用比较不方便，OptiX 提供了可选的 stubs（封装函数），将函数表中的地址封装成普通 C 函数。

使用时，包含头文件`optix_stubs.h`，随后调用普通函数即可，不需要显式写`optixFunctionTable`.

```
#include <optix_stubs.h>

OptixResult result = optixDeviceContextCreate(fromContext, &options, &context);
```
