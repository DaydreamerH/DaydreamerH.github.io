---
title: "Optix：Context"
description: "Context介绍。"
date: "2025-09-18 19:58:07"
category: "图形与高性能计算"
originalCategory: "OptiX入门"
track: "Rendering / HPC"
level: advanced
status: ready
published: true
minutes: 6
order: 1000
prerequisites: []
tags: ["CG", "OptiX"]
photos: "banner.jpg"
source: "_posts"
---
# Introduction
本节将要介绍的API包括：
```
optixDeviceContextCreate
optixDeviceContextDestroy
optixDeviceContextGetProperty
optixDeviceContextSetLogCallback
optixDeviceContextSetCacheEnabled
optixDeviceContextSetCacheLocation
optixDeviceContextSetCacheDatabaseSizes
optixDeviceContextGetCacheEnabled
optixDeviceContextGetCacheLocation
optixDeviceContextGetCacheDatabaseSizes
```
一个context是通过`optixDeviceContextCreate`创建的，用于管理单个GPU.

NVIDIA OptiX的设备上下文的创建需要指定与该设备关联的CUDA context.

为了方便，你可以传入0作为context，此时OptiX会使用当前的CUDA context.

```
OptixDeviceContext context = nullptr;
cudaFree(0);
CUcontext cuCtx = 0;
optixDeviceContextCreate(cuCtx, 0, &context);
```

当你想要为context设置回调函数，或者查询日志时，可以通过`OptixDeviceContextOptions`指定额外的选项。

context中有一小部分属性用于查询各种大小和限制，可以通过`optixDeviceContextGetProperty`获取相关属性：最大追踪深度（maximum trace depth）、最大可遍历图深度（maximum traversable graph depth）、每个构建输入的最大几何体数量（maximum primitives per build input）以及每个加速结构的最大实例数量（maximum number of instances per acceleration structure）。

context可能会保留启动光线追踪内核所需的GPU资源。一些API对象还会保留host内存。

这些资源在API中遵循创建/销毁模式。应用程序必须调用optixDeviceContextDestroy来清理与该上下文相关的主机和设备资源。

如果在销毁上下文时，与该上下文相关联的其他API对象仍然存在，它们也会被同时销毁。

上下文（context）可以持有一个解密密钥（decryption key）。当指定了密钥时，所有传入 API 的用户代码都必须使用对应的会话密钥进行加密。这样可以最大程度地减少输入代码被安全攻击的风险。

应用程序可以组合使用任意支持的GPU，只要数据传输和同步处理得当即可。

一些应用程序可能为了简化多GPU管理，会限制这种组合的多样性，例如，只混合使用具有相同流处理器（streaming multiprocessor）版本的 GPU，以简化数据共享。

# Sending messages with a callback function
指定一个日志回调函数与指向host内存的指针这一组合，可以在创建上下文时，或者之后使用`optixDeviceContextSetLogCallback`实现。

该回调函数用于传递各种信息。

如果同时有多个OptiX函数并发调用，该回调函数必须是线程安全的。

回调函数必须是以下类型的函数指针：
```
typedef void(*optixLogCallback)(
    unsigned int level,
    const char* tag,
    const char* message,
    void* cbdata
);
```
其中：
- level: 表示消息的严重程度。
- tag: 简短的消息类别描述。
- message：以空字符结尾的日志消息。
- cbdata：设置回调函数时提供的指针值。


level包含的级别如下：
- disable：禁用所有消息，在这种情况下，不会调用回调函数。
- fatal：不可恢复的错误。上下文以及OptiX本身并不可用。
- error：可恢复的错误，例如传入了无效的调用参数。
- warning：提示API可能不会完全按照应用程序预期工作，或者性能可能低于预期。
- print：状态和进度消息。

# Compilation cache
在创建OptixModule、OptixProgramGroup和OptixPipeline对象时，如果启用了缓存（caching），输入程序的编译结果会被缓存到磁盘。

后续的编译可以重用这些缓存数据，从而加快对象的创建速度。

缓存可以在多个OptixDeviceContext对象之间共享，OptiX会负责确保多线程访问缓存的正确性；
但是，如果不希望在不同 OptixDeviceContext 之间共享缓存，可以为每个上下文设置不同的缓存路径。

通过设置环境变量 OPTIX_CACHE_MAXSIZE 为 0 可以完全禁用缓存；
通过环境变量禁用缓存不会影响已有的缓存文件或其内容。

## optixDeviceContextSetCacheEnabled(..., int enabled)
当`enabled`的值为1时，磁盘缓存被启用；值为0时，缓存被禁用。当缓存被禁用时，不会使用任何内存缓存。

缓存数据库在设备上下文创建时以及通过此函数调用启用缓存时初始化。

如果在创建设备上下文时无法初始化缓存数据库，缓存将被禁用；如果启用了日志回调，会向日志报告相关信息。此时，调用`optixDeviceContextCreate`并不会返回错误。

若要确保上下文创建时缓存初始化成功，可以使用`optixDeviceContextGetCacheEnabled`查询状态。

如果缓存被禁用，可以重新配置缓存后再使用`optixDeviceContextSetCacheEnabled`启用。

如果通过`optixDeviceContextSetCacheEnabled`无法初始化缓存数据库，将返回错误。

垃圾回收（garbage collection）会在下次写入缓存数据库时执行，而不是在启用缓存时执行。

## optixDeviceContextSetCacheLocation(..., const char* location)
磁盘缓存会被创建在由`location`指定的目录中。`location`必须是以`NULL`结尾的字符串。如果目录不存在，会自动创建该目录。

如果缓存当前已启用，则缓存数据库会立即创建；否则，缓存数据库会在之后启用缓存时创建。

如果因为任何原因无法在指定位置创建缓存数据库文件（例如路径无效或目录不可写），将返回错误，并且缓存会被禁用。

如果磁盘缓存位于网络共享上，其行为未定义。

磁盘缓存的位置可以通过环境变量`OPTIX_CACHE_PATH`覆盖。当启用磁盘缓存时，该环境变量的值优先于通过此函数传入的路径。

## optixDeviceContextSetCacheDatabaseSizes(..., size_t lowWaterMark, size_t highWaterMark)
参数`lowWaterMark`和`highWaterMark`用于设置磁盘缓存垃圾回收的低水位和高水位标记。将任一标记设置为0会禁用垃圾回收。

垃圾回收仅在写入缓存数据库时发生：当缓存数据大小超过高水位标记时，会触发垃圾回收，并一直进行，直到大小降到低水位标记为止。

如果任一标记非零且高水位标记小于低水位标记，将返回错误。

如果多个设备上下文访问同一个缓存数据库且设置了不同的高低水位标记，写入缓存数据库时，每个设备上下文会使用自己的标记值。

高水位标记可以通过环境变量`OPTIX_CACHE_MAXSIZE`覆盖。
将`OPTIX_CACHE_MAXSIZE`设置为 0 会禁用缓存。
负值和非整数值将被忽略。

`OPTIX_CACHE_MAXSIZE`的值优先于通过函数传入的`highWaterMark`。

低水位标记（low water mark）将被设置为`OPTIX_CACHE_MAXSIZE`的一半。

## get* functions
与上面的函数相对于的`get*`函数支持获取相关cache属性。

# Validation mode
验证模式（validation mode）可以帮助发现那些平时可能无法检测到，或者仅偶尔发生且难以定位的错误。

验证模式会在应用程序执行期间启用额外的测试和设置。由于这些额外处理可能会降低性能，因此验证模式应仅在调试阶段或完成应用程序后的最终测试阶段使用。

验证模式可以通过在`OptixDeviceContextOptions`结构体中设置相应字段来启用：
```
OptixDeviceContextOptions options = {};
options.validationMode = OPTIX_DEVICE_CONTEXT_VALIDATION_MODE_ALL;
```

当启用验证模式时，如果检测到错误，会发出`OPTIX_ERROR_VALIDATION_FAILURE`。
函数`optixLaunch`在执行完`launch`后会进行同步，并报告任何发生的错误。

在 OptiX 中，如果启用了validation mode，它会产生以下效果：

- 所有的OptiX调试异常（debug exceptions）都会被隐式启用。
- 如果用户没有提供自己的exception program（异常处理程序），OptiX会自动提供一个默认的。

一旦在异常处理程序里捕获到第一个非用户定义的异常，就会立即被报告，并且当前的launch（光线追踪启动任务）会立刻终止。

这种行为的作用是让异常更容易被发现，而不是“静悄悄地”被忽略掉。
