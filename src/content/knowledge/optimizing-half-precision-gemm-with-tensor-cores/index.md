---
title: "Optimizing Half-Precision GEMM with Tensor Cores"
description: "半精度GEMM代码分析，取得和Cublas相近的结果。"
date: "2025-07-28 13:46:01"
category: "图形与高性能计算"
originalCategory: "CUDA入门"
track: "Rendering / HPC"
level: advanced
status: ready
published: true
minutes: 29
order: 1000
prerequisites: []
tags: ["CUDA", "TensorCore", "GEMM", "C"]
photos: "banner.jpg"
source: "_posts"
---参考仓库：[https://github.com/Bruce-Lee-LY/cuda_hgemm](https://github.com/Bruce-Lee-LY/cuda_hgemm)
# 目录
- [指令](#指令)
- [Tile层次结构与常量解释](#tile层次结构与常量解释)
  - [MMA Tile](#mma-tile)
  - [Warp Tile](#warp-tile)
  - [Block Tile](#block-tile)
  - [Chunk](#chunk)
  - [其他常量](#其他常量)
- [三级流水线](#三级流水线)
  - [变量](#变量)
  - [流水线预填充](#流水线预填充)
  - [流水线计算](#流水线计算)
  - [流水线排空](#流水线排空)
  - [流水线结构精简版](#流水线结构精简版)
- [代码详解](#代码详解)
  - [Grid 与 Block 设置](#grid-与-block-设置)
  - [变量创建](#变量创建)
    - [共享内存](#共享内存)
    - [C矩阵对应的Block Tile坐标(以MMA Tile为最小单位)](#c矩阵对应的block-tile坐标以mma-tile为最小单位)
    - [Warp相关](#warp相关)
    - [C_frag](#c_frag)
    - [内存与寄存器](#内存与寄存器)
  - [流水线预填充代码](#流水线预填充代码)
  - [流水线计算代码](#流水线计算代码)
  - [流水线排空代码](#流水线排空代码)
  - [从寄存器写回共享内存](#从寄存器写回共享内存)
  - [从共享内存将计算结果写回至全局内存](#从共享内存将计算结果写回至全局内存)
- [完整代码](#完整代码)

# 指令
在高性能编程中，保证计算单元得到充分运用，隐藏内存访问延迟非常重要。

所以在此处，我们将使用一些异步拷贝指令，以提高计算效率。

相关指令如下：
```
#define CP_ASYNC_CA(dst, src, Bytes) \
    asm volatile("cp.async.ca.shared.global.L2::128B [%0], [%1], %2;\n" ::"r"(dst), "l"(src), "n"(Bytes))

#define CP_ASYNC_CG(dst, src, Bytes) \
    asm volatile("cp.async.cg.shared.global.L2::128B [%0], [%1], %2;\n" ::"r"(dst), "l"(src), "n"(Bytes))

#define CP_ASYNC_COMMIT_GROUP() asm volatile("cp.async.commit_group;\n" ::)

#define CP_ASYNC_WAIT_GROUP(N) asm volatile("cp.async.wait_group %0;\n" ::"n"(N))

#define CP_ASYNC_WAIT_ALL() asm volatile("cp.async.wait_all;\n" ::)
```
- `CP_ASYNC_CG(dst, src, Bytes)` 是一个从全局内存到共享内存的异步拷贝操作。
  - 参数说明：
    - dst：目标地址，指向共享内存中的位置。
    - src：源地址，指向全局内存中的位置。
    - Bytes：需要拷贝的字节数。
  - `cg` 代表 "Cache Global"，这意味着数据在拷贝到共享内存后，它仍然会保留在L2缓存中。
- `CP_ASYNC_CA(dst, src, Bytes)` 与 `CP_ASYNC_CG(dst, src, Bytes)` 不同之处在于，数据拷贝至共享内存后，在L2缓存中的数据会被逐出。
- `CP_ASYNC_COMMIT_GROUP()` 是提交异步拷贝组的指令。
  - 这条指令的作用是提交当前所有未完成的异步拷贝请求，并将它们放入一个"组"中。GPU会开始处理这个组内的拷贝操作。
- `CP_ASYNC_WAIT_GROUP(N)` 等待异步拷贝组的完成。
  - N 是表示等待直到未完成的异步拷贝操作组的数量小于或等于 N.
- `CP_ASYNC_WAIT_ALL()` 等待所有异步拷贝完成。

# Tile层次结构与常量解释
## MMA Tile
MMA Tile 是 TensorCore 执行矩阵乘法累加的基本单元。WMMA操作的矩阵A、B、C的尺寸由以下变量定义：
```
// WMMA-TensorCore执行计算的Shape
#define MMA_M 16
#define MMA_N 16
#define MMA_K 16
```

- 矩阵A的 MMA Tile 大小为 `(MMA_M, MMA_K)`.
- 矩阵B的 MMA Tile 大小为 `(MMA_K, MMA_N)`.
- 矩阵C的 MMA Tile 大小为 `(MMA_M, MMA_N)`.

## Warp Tile
一个 Warp Tile 定义了一个Warp（32个线程）负责计算的C矩阵区域的尺寸。它由 MMA Tile 组成，且由Block Tile 细分得到。

一个 Warp Tile 的尺寸如下：
```
#define WT_M (BT_M / BT_COL_WT_NUM)
#define WT_N (BT_N / BT_ROW_WT_NUM)
```
其中，`(BT_M, BT_N)` 为 Block Tile 的尺寸，`BT_COL_WT_NUM` 与 `BT_ROW_WT_NUM`分别代表，在 Block Tile 中每列或每行有多少个 Warp Tile.

每个 Warp Tile 由多个 MMA Tile 组成，其关系如下：
```
#define WT_COL_MMA_NUM (WT_M / MMA_M)
#define WT_ROW_MMA_NUM (WT_N / MMA_N)
```

`WT_COL_MMA_NUM` 与 `WT_ROW_MMA_NUM` 分别代表，在 Warp Tile 中，每列或每行有多少个 MMA Tile.

```
#define WARP_COPY_BYTES (WARP_SIZE * sizeof(int4))
```
`WARP_COPY_BYTES` 定义了一个Warp（32个线程）在一次理想的宽拷贝操作中能够拷贝的总字节数。
- 每个线程可以拷贝一个 `int4`（16字节）的数据。这是因为GPU的加载/存储单元通常能够处理128位（16字节）的数据，使用 `int4` 可以利用这一特性。

```
#define WARP_SIZE 32
```
一个Warp有32个线程。
## Block Tile
Block Tile 定义了一个CUDA线程块（Thread Block）负责计算的C矩阵区域的尺寸。

Block Tile 的尺寸如下：
```
#define BT_M 256
#define BT_N 128
```

一个 Block Tile 的 Warp Tile 的构成情况：
```
#define BT_ROW_WT_NUM 2
#define BT_COL_WT_NUM 4
```

```
#define BT_WARP_NUM (BT_ROW_WT_NUM * BT_COL_WT_NUM)
```
一个 Block Tile 由 `BT_WARP_NUM` 个 Warp Tile 构成。

```
#define BT_THREAD_NUM (WARP_SIZE * BT_WARP_NUM)
```
一个 Block Tile 包含 `BT_THREAD_NUM` 个线程.

一个 Block Tile 中 MMA Tile 的构成情况如下：
```
#define BT_COL_MMA_NUM (BT_M / MMA_M)
#define BT_ROW_MMA_NUM (BT_N / MMA_N)
```

## Chunk
除了上述的基本分块，为协调 Block Tile 在K维度上的数据分批次拉取到共享内存中，定义了 `CHUNK_K`.

```
#define CHUNK_K 2
```

为了优化全局内存带宽和隐藏延迟，从全局内存搬运至共享内存时，我们不是每次只加载一个 `MMA_K` 大小的数据块，而是加载 `CHUNK_K` 个 `MMA_K` 大小的数据块。

但是在计算时，每个Warp的MMA操作仍然是基于 `MMA_K=16` 进行的。

```
#define SKEW_PADDING 8
#define MMA_SMEM_STRIDE_K (CHUNK_K * MMA_K + SKEW_PADDING)
```
描述了A和B矩阵在共享内存中K维度上的步长：
- `CHUNK_K * MMA_K`: 这部分是实际的有效数据宽度，即我们每次在K维度上加载的 `CHUNK_K` 个 `MMA_K` 大小的元素。
- `SKEW_PADDING`: 在这个有效宽度之后，增加了 SKEW_PADDING，来确保当多个Warp或线程访问共享内存中的A或B矩阵的不同行（在K维度上）时，它们不会发生Bank Conflict。

```
#define CHUNK_LINE_BYTES (CHUNK_K * MMA_K * sizeof(half))
```
`CHUNK_LINE_BYTES` 定义了从全局内存向共享内存搬运一次的字节数。

```
#define CHUNK_COPY_LINES_PER_WARP (WARP_COPY_BYTES / CHUNK_LINE_BYTES)
```

`CHUNK_COPY_LINES_PER_WARP` 计算一个Warp在一次 `WARP_COPY_BYTES` 的操作中，可以拷贝多少行（每行对应一个 `CHUNK_LINE_BYTES` 的数据）。

```
#define CHUNK_COPY_LINE_LANES (WARP_SIZE / CHUNK_COPY_LINES_PER_WARP)
```
`CHUNK_COPY_LINE_LANES` 描述了每个 `CHUNK_LINE_BYTES`（即K维度上的一个Chunk）的数据需要由Warp中的多少个线程（lane）来拷贝。

## 其他常量

```
#define THREAD_COPY_BYTES 16
```
`THREAD_COPY_BYTES` 描述了每个线程在异步拷贝中实际拷贝的字节数。在这里固定为16字节（sizeof(int4)）。

```
#define K_STAGE 3
```
`K_STAGE` 描述了共享内存的三级缓冲，用以移动指针。

```
#define BLOCK_STRIDE 16
```
定义了Grid的一个维度，将在后续章节详细介绍。

```
#define C_SMEM_STRIDE (BT_N + SKEW_PADDING)
```
C矩阵存储在共享内存中，每行占用的`half`个数。

# 三级流水线
本代码的总体结构为三级流水线，在本节将分三个阶段：流水线预填充、流水线计算、流水线排空介绍。

本节不涉及具体代码，只对思路做分析。

但在流水线分析前，我们需要对即将使用到的变量进行解释。

## 变量
- `K_STAGE = 3`: 流水线深度，意味着有 3 个共享内存缓冲区（逻辑上，通过偏移量区分）。
- `CHUNK_K = 2`: 每个 K 维度分块（Chunk）包含 `2 * MMA_K` 个元素。当一个 Chunk 从共享内存加载到寄存器时，通常会分两次加载（Chunk 的前半部分和后半部分）。
- `smem_store_idx`: 表示当前数据要拷贝到共享内存的哪个逻辑缓冲区（0, 1, 或 2）。
- `smem_load_idx`: 表示当前数据要从共享内存的哪个逻辑缓冲区加载到寄存器。
- `reg_store_idx`: 表示当前数据要加载到寄存器的哪个双缓冲区域（0 或 1）。
- `reg_load_idx`: 表示当前计算要使用寄存器的哪个双缓冲区域。
- `smem_stage_off`：表示一次搬运的 `CHUNK_K * MMA_K` 大小的块的数量。

初始状态：`smem_store_idx = 0`, `smem_load_idx = 0`
`smem_store_off = 0`, `smem_load_off = 0`
`reg_store_idx = 0`, `reg_load_idx = 1`, `smem_stage_off = BT_M + BT_N`.

## 流水线预填充

本阶段将最初的数据从全局内存预取到共享内存，并加载到寄存器。

### 第一次全局内存 -> 共享内存的拷贝 (Fetch Chunk 0)
- 操作：`CP_ASYNC_CG`.
- 源: 全局内存，对应 Chunk 0.
- 目标: 共享内存 缓冲区 0 (`smem_store_off = 0`).
- 作用：将 K 维度最开始的 `CHUNK_K` 长度的数据从 GMEM 拷贝到 SMEM 的第一个可用空间。
- `CP_ASYNC_COMMIT_GROUP()` 提交请求。

### 第二次全局内存 -> 共享内存的拷贝 (Fetch Chunk 1)
- 状态更新: `smem_store_idx` 变为 1，`smem_store_off` 变为 `smem_store_idx * smem_stage_off`。
- 操作: `CP_ASYNC_CG`
- 源: 全局内存 (GMEM)，对应 Chunk 1（K 维度从 `tile_k = CHUNK_K * MMA_K` 开始的数据）。
- 目标: 共享内存 缓冲区 1 (`smem_store_off = smem_stage_off`)。
- 作用: 将 K 维度的下一个 `CHUNK_K` 长度的数据从 GMEM 拷贝到 SMEM 的第二个可用空间。
- `CP_ASYNC_COMMIT_GROUP()` 提交请求。

### 等待与同步
- `CP_ASYNC_WAIT_GROUP(1)`: 等待直到只剩 1 个异步拷贝组未完成（即等待 Chunk 0 的拷贝完成）。
- `__syncthreads()`: 线程同步，确保 Chunk 0 已安全抵达共享内存缓冲区 0.

### 第一次共享内存到寄存器的拷贝 (Load Chunk 0, Part 1)
- 操作: `wmma::load_matrix_sync`
- 源: 共享内存 缓冲区 0 (`smem_load_off = 0`)，具体是 Chunk 0 的前半部分（即 K 维度的 tile_k=0 的数据）。
- 目标: 寄存器 缓冲区 `reg_store_idx` (0)。
- 作用: 将 Chunk 0 的第一部分加载到寄存器，准备计算。

## 流水线计算
主循环的每次迭代都执行“加载+计算”和“异步获取”的操作。

在这里，我们重点分析第一次循环的流程。

在进入第一次循环前，各变量的状态：
`smem_store_idx = 1`, `smem_load_idx = 0`
`smem_store_off = smem_stage_off`, `smem_load_off = 0`
`reg_store_idx = 0`, `reg_load_idx = 1`.

此时，寄存器存储了Chunk 0 Part 1.

### 寄存器索引切换
- `reg_store_idx ^= 1;` (`reg_store_idx` 变为 1)
- `reg_load_idx ^= 1;` (`reg_load_idx` 变为 0)

### 共享内存 -> 寄存器加载 (Load Chunk 0, Part 2)
- 操作: `wmma::load_matrix_sync`
- 源: 共享内存 缓冲区 0 (`smem_load_off = 0`)，具体是 Chunk 0 的后半部分（即 K 维度的 `tile_k = MMA_K` 的数据）。
- 目标: 寄存器 缓冲区 `reg_store_idx` (1).
- 作用: 将 Chunk 0 的第二部分加载到寄存器，准备计算。

### 寄存器数据计算 (Compute Chunk 0, Part 1)
- 操作: `wmma::mma_sync`
- 输入: 寄存器 缓冲区 `reg_load_idx` (0) (对应 Chunk 0 的前半部分)。
- 输出: C_frag 累加器。
- 作用: 对 Chunk 0 的前半部分数据执行 MMA 计算。

### 全局内存 -> 共享内存拷贝 (Fetch Chunk 2)
- 状态更新: `smem_store_idx` 变为 2，`smem_store_off` 变为 2 * `smem_stage_off`。
- 操作: `CP_ASYNC_CG`
- 源: 全局内存 (GMEM)，对应 Chunk 2（K 维度从 `tile_k = CHUNK_K * 2 * MMA_K`，即 `4 * MMA_K` 开始的数据）。
- 目标: 共享内存 缓冲区 2 (`smem_store_off = 2 * smem_stage_off`)。
- 作用: 将 K 维度的下一个 `CHUNK_K` 长度的数据从 GMEM 拷贝到 SMEM 的第三个可用空间。
- `CP_ASYNC_COMMIT_GROUP()` 提交请求。

### 等待与同步
- `CP_ASYNC_WAIT_GROUP(1)`: 等待直到只剩 1 个异步拷贝组未完成（即等待 Chunk 1 的拷贝完成，在预填充阶段发出的指令）。
- `__syncthreads()`: 线程同步，确保 Chunk 1 已安全抵达共享内存缓冲区 1。

### 指向共享内存待载入到寄存器的地址向前移动
- `smem_load_idx = (smem_load_idx + 1) % K_STAGE;` (`smem_load_idx` 变为 1)
- `smem_load_off = smem_load_idx * smem_stage_off;` (`smem_load_off` 变为 `smem_stage_off`)

### 寄存器索引切换
- `reg_store_idx ^= 1;` (`reg_store_idx` 变为 0)
- `reg_load_idx ^= 1;` (`reg_load_idx` 变为 1)

### 共享内存 -> 寄存器加载 (Load Chunk 1, Part 1)
- 操作: `wmma::load_matrix_sync`
- 源: 共享内存 缓冲区 1 (`smem_load_off = smem_stage_off`)，具体是 Chunk 1 的前半部分。
- 目标: 寄存器 缓冲区 `reg_store_idx` (0)。
- 作用: 将 Chunk 1 的第一部分加载到寄存器。

### 寄存器数据计算 (Compute Chunk 0, Part 2)
- 操作: `wmma::mma_sync`
- 输入: 寄存器 缓冲区 `reg_load_idx` (1) (对应 Chunk 0 的后半部分)。
- 输出: C_frag 累加器。
- 作用: 对 Chunk 0 的后半部分数据执行 MMA 计算。

### 循环结束
至此，Chunk 0 的所有计算都已完成，结果累加到 C_frag 中。

寄存器中，缓冲区 0 为 Chunk 1 Part 1，尚未计算；缓冲区 1 为 Chunk 0 Part 2，已经计算完成，在下一轮循环的第一次寄存器存入中被 Chunk 1 Part 2 替换。

共享内存中，缓冲区 0 为 Chunk 0，缓冲区 1 为 Chunk 1，缓冲区 2 为 Chunk 2（正在搬运，尚未要求异步拷贝命令完成）。

可以看出，循环中计算数据始终稍后于全局内存最新数据两个 Chunk.

## 流水线排空
当主循环结束时，我们已经获取了所有数据，但仍有 `K_STAGE-1` 个 Chunk 的数据需要计算（对于 K_STAGE=3 和 CHUNK_K=2，这通常是最后两个 Chunk）。

假设最后一个 Chunk 是 Chunk N-1.


循环结束时：
- 寄存器缓冲区 0 为 Chunk N-2 Part 1（尚未计算），缓冲区 1 为 Chunk N-3 Part 2（已完成计算）。
- 共享内存存入了 Chunk N-3 Chunk N-2，Chunk N-1 未要求完成拷贝。


### 寄存器索引切换
- `reg_store_idx ^= 1` (变为 1).
- `reg_load_idx ^= 1` (变为 0).

### 共享内存 -> 寄存器加载 (Load Chunk N-2, Part 2)
- 操作: `wmma::load_matrix_sync`
- 源: 共享内存 缓冲区 1 (`smem_load_off = smem_stage_off`)，具体是 Chunk N-2 的后半部分。
- 目标: 寄存器 缓冲区 `reg_store_idx` (1).
- 作用: 将 Chunk 1 的第一部分加载到寄存器。

### 寄存器数据计算 (Compute Chunk N-2, Part 1)
- 操作: `wmma::mma_sync`
- 输入: 寄存器 缓冲区 `reg_load_idx` (0) (对应 Chunk 1 的前半部分)。
- 输出: C_frag 累加器。
- 作用: 计算 Chunk N-2 的前半部分。

### 等待与同步
- `CP_ASYNC_WAIT_GROUP(0)`: 等待 Chunk N-1 载入共享内存。
- `__syncthreads();`: 线程同步。

### 指向共享内存待载入到寄存器的地址向前移动
- `smem_load_idx = (smem_load_idx + 1) % K_STAGE;`
- `smem_load_off = smem_load_idx * smem_stage_off;`

### 寄存器索引切换
- `reg_store_idx ^= 1` (变为 0).
- `reg_load_idx ^= 1` (变为 1).

### 共享内存 -> 寄存器加载 (Load Chunk N-1, Part 1)
- 操作: `wmma::load_matrix_sync`
- 源: 共享内存 缓冲区 0 (`smem_load_off = 0`)，具体是 Chunk N-1 的前半部分。
- 目标: 寄存器 缓冲区 `reg_store_idx` (0).
- 作用: 将 Chunk N-1 的第一部分加载到寄存器。

### 寄存器数据计算 (Compute Chunk N-2, Part 2)
- 操作: `wmma::mma_sync`
- 输入: 寄存器 缓冲区 `reg_load_idx` (1) (对应 Chunk N-2 的后半部分)。
- 输出: C_frag 累加器。
- 作用: 计算 Chunk N-2 的后半部分。

### 寄存器索引切换
- `reg_store_idx ^= 1` (变为 1).
- `reg_load_idx ^= 1` (变为 0).

### 共享内存 -> 寄存器加载 (Load Chunk N-1, Part 2)
- 操作: `wmma::load_matrix_sync`
- 源: 共享内存 缓冲区 1 (`smem_load_off = 1`)，具体是 Chunk N-1 的后半部分。
- 目标: 寄存器 缓冲区 `reg_store_idx` (1).
- 作用: 将 Chunk N-1 的第二部分加载到寄存器。

### 寄存器数据计算 (Compute Chunk N-1, Part 1)
- 操作: `wmma::mma_sync`
- 输入: 寄存器 缓冲区 `reg_load_idx` (0) (对应 Chunk N-1 的前半部分)。
- 输出: C_frag 累加器。
- 作用: 计算 Chunk N-1 的前半部分。

### 寄存器索引切换
- `reg_load_idx ^= 1` (变为 1).

### 寄存器数据计算 (Compute Chunk N-1, Part 2)
- 操作: `wmma::mma_sync`
- 输入: 寄存器 缓冲区 `reg_load_idx` (1) (对应 Chunk 1 的前半部分)。
- 输出: C_frag 累加器。
- 作用: 计算 Chunk N-1 的后半部分。

## 流水线结构精简版
考虑到，我自己看代码写流程十分痛苦，所以给一个简单的流程，免得忘了。

---
**1. 预填充阶段:**

    Fetch:      GMEM -> SMEM[0] (Chunk 0)

    Fetch:      GMEM -> SMEM[1] (Chunk 1)

    Wait:       SMEM[0] Ready

    Load:       SMEM[0] -> Reg[0] (Chunk 0 Part 1)

---
**2. 主循环 (第一次迭代):** (处理 `tile_k = CHUNK_K * (K_STAGE - 1)`)

    Load:       SMEM[0] -> Reg[1] (Chunk 0 Part 2)

    Compute:    Reg[0] (Chunk 0 Part 1)

    Fetch:      GMEM -> SMEM[2] (Chunk 2)

    Wait:       SMEM[1] Ready

    Load:       SMEM[1] -> Reg[0] (Chunk 1 Part 1)

    Compute:    Reg[1] (Chunk 0 Part 2)   <-- Chunk 0 计算完成

---
**3. 主循环 (第二次迭代):** (处理 `tile_k = CHUNK_K * K_STAGE`)

    Load:       SMEM[1] -> Reg[1] (Chunk 1 Part 2)

    Compute:    Reg[0] (Chunk 1 Part 1)

    Fetch:      GMEM -> SMEM[0] (Chunk 3)   <-- smem_store_idx 循环回 0

    Wait:       SMEM[2] Ready

    Load:       SMEM[2] -> Reg[0] (Chunk 2 Part 1)

    Compute:    Reg[1] (Chunk 1 Part 2)   <-- Chunk 1 计算完成

... (主循环继续，直到所有 Chunk 从 GMEM 获取命令均已发出)

---
**4. 排空阶段:** (假设最后一次 Fetch 是 Chunk `N-1`)

    Load:       SMEM[X] -> Reg[Y] (Chunk N-2 Part 2)

    Compute:    Reg[Z] (Chunk N-2 Part 1)

    Wait:       所有 GMEM -> SMEM 拷贝完成

    Load:       SMEM[A] -> Reg[B] (Chunk N-1 Part 1)   <-- 假设 N-1 是最后一个 chunk

    Compute:    Reg[C] (Chunk N-2 Part 2)   <-- Chunk N-2 计算完成

    Load:       SMEM[A] -> Reg[D] (Chunk N-1 Part 2)

    Compute:    Reg[B] (Chunk N-1 Part 1)

    Compute:    Reg[D] (Chunk N-1 Part 2)   <-- Chunk N-1 计算完成

---

# 代码详解
## Grid 与 Block 设置
一个线程块包含的线程数量，在之前的介绍中已经计算，是 `BT_WARP_NUM` 个。
```
dim3 block(BT_THREAD_NUM);
```

对于网格维度计算比较特殊，采用了三个维度。
- `gridDim.x`：设置为 `BLOCK_STRIDE`.
- `gridDim.y`：设置为 `CEIL_DIV(M, BT_M)` (向下取整的除法运算).
- `gridDim.z`：设置为 `CEIL_DIV(N, BT_N * BLOCK_STRIDE)`.

采用三个维度的 `gridDim` 将在计算 Block Tile 坐标时发挥作用。
## 变量创建
### 共享内存
在计算过程中，共享内存有两种用法：
- 存储 A B 矩阵在流水线计算时占用。
  - K维度一次搬运占用`MMA_SMEM_STRIDE_K`个`half`.
  - 一次搬运A矩阵`BT_M`行，B矩阵`BT_N`列。
  - K_STAGE个缓冲区间。
  - 总大小为：`MMA_SMEM_STRIDE_K * sizeof(half) * (BT_M + BT_N) * K_STAGE`.
- 临时存储 C 矩阵结果时的共享内存大小。
  - C矩阵每行占用`C_SMEM_STRIDE`个`half`.
  - C矩阵在一个Block有`BT_M`行。
  - 总大小为：`C_SMEM_STRIDE * sizeof(half) * BT_M`.

在不考虑设备限制的情况下，优先采用两种情况中的最大值。

```
size_t SHMEM_SZ =
        std::max((BT_M + BT_N) * MMA_SMEM_STRIDE_K * sizeof(half) * K_STAGE,
            BT_M * C_SMEM_STRIDE * sizeof(half));
```

计算完成后，对每个线程块使用的共享内存设置最大值：
```
if (dev_prop.sharedMemPerMultiprocessor > SHMEM_SZ)
    cudaFuncSetAttribute(blockGemmKernel,
                            cudaFuncAttributeMaxDynamicSharedMemorySize,
                            SHMEM_SZ);
```

申明共享内存准备载入以Chunk为单位载入AB矩阵的数据：
```
extern __shared__ half shmem[][MMA_SMEM_STRIDE_K];
```
### C矩阵对应的Block Tile坐标(以MMA Tile为最小单位)
```
const size_t block_tile_i = (blockIdx.z % 2) ?
        ((gridDim.y - blockIdx.y - 1) * BT_COL_MMA_NUM)
        : (blockIdx.y * BT_COL_MMA_NUM);
```

`blockIdx.y`表示目前在Block Tile大小下，沿着列方向下第`blockIdx.y`个的块，每个块包含`BT_COL_MMA_NUM`行MMA Tile.

在计算C矩阵中所对应的MMA Tile行坐标时，我们利用了`blockIdx.z % 2`做奇偶判断：
- 当`blockIdx.z`为奇数时，采用从小到大的顺序确定Block Tile的行，即第`blockIdx.y`行Block Tile，第`blockIdx.y * BT_COL_MMA_NUM`行MMA Tile.
- 当`blockIdx.z`为偶数时，采用从大到小的顺序确定Block Tile的行，即第`(gridDim.y - blockIdx.y - 1)`行Block Tile，第`(gridDim.y - blockIdx.y - 1) * BT_COL_MMA_NUM`行MMA Tile.

```
const size_t block_tile_j = (blockIdx.z * gridDim.x + blockIdx.x) * BT_ROW_MMA_NUM;
```
- `blockIdx.z`: 这是当前线程块在 Grid 的 Z 维度上的索引。它的范围是 0 到 gridDim.z - 1。
- `gridDim.x`: 这是 Grid 的 X 维度的大小，在之前被定义为 BLOCK_STRIDE。
- `(blockIdx.z * gridDim.x + blockIdx.x)`: 沿着N维度的线程块，每`gridDim.x`个线程块为一组，`blockIdx.z`表示在第几组，`blockIdx.z * gridDim.x`表示在第几个大块上，`blockIdx.x`表示在指定大线程块中的第几个线程块，因此该部分去定了N维度上，线程处于第几个线程块。
- `* BT_ROW_MMA_NUM`则表明了，该线程块前有多少个MMA Tile.

检查越界情况：
```
const size_t M_tiles = CEIL_DIV(M, MMA_M);
const size_t N_tiles = CEIL_DIV(N, MMA_N);
if (block_tile_i >= M_tiles || block_tile_j >= N_tiles)
{
    return;
}
```

```
const size_t K_tiles = CEIL_DIV(K, MMA_K);
```
`K_tiles`将在流水线循环计算中发挥作用。
### Warp相关
```
const size_t warp_id = threadIdx.x / WARP_SIZE;
const size_t lane_id = threadIdx.x % WARP_SIZE;
```
- `warp_id`: 当前线程在第几个Warp.
- `lane_id`: 当前线程属于Warp中的第几号线程.

### C_frag
```
wmma::fragment<wmma::accumulator, MMA_M, MMA_N, MMA_K, half> C_frag[WT_COL_MMA_NUM][WT_ROW_MMA_NUM];
#pragma unroll
    for (size_t i = 0; i < WT_COL_MMA_NUM; ++i)
    {
#pragma unroll
        for (size_t j = 0; j < WT_ROW_MMA_NUM; ++j)
        {
            wmma::fill_fragment(C_frag[i][j], 0.0);
        }
    }
```

- `WT_COL_MMA_NUM`: 表示有多少行MMA Tile.
- `WT_ROW_MMA_NUM`: 表示有多少列MMA Tile.

### 内存与寄存器
```
constexpr size_t shmem_idx_b_off = BT_M;
```
`size_t shmem_idx_b_off` 表示在一个共享内存中的逻辑缓冲区中，B矩阵写入的起点（B矩阵在A矩阵之后写入，所以要往后移动`shmem_idx_b_off`）.

```
constexpr size_t smem_stage_off = BT_M + BT_N;
```
`smem_stage_off` 表示一整个共享内存的逻辑缓冲区的偏移量，在多次进行全局内存到共享内存拷贝时，将作为单次偏移量进行累计。

```
half *shmem_warp_tile_ptr = &shmem[0][0] +
        (warp_id / BT_ROW_WT_NUM) * C_SMEM_STRIDE * WT_M +
        (warp_id % BT_ROW_WT_NUM) * WT_N;
```
`shmem_warp_tile_ptr`表示当前warp计算完后从寄存器搬运至共享内存时，共享内存的起始地点。

- 行方向移动：
  - `(warp_id / BT_ROW_WT_NUM)`: 号数/每行多少号，计算的是第几行的Warp Tile.
  - `(warp_id / BT_ROW_WT_NUM) * WT_M`: 第几行Warp Tile * 每个Warp Tile的行数，表示现在在第几行。
  - `(warp_id / BT_ROW_WT_NUM) * C_SMEM_STRIDE * WT_M`: 第几行 * 每行有多少个`half`，表示第几个`half`（只算了行方向的移动）。
- 列方向移动：
  - `(warp_id % BT_ROW_WT_NUM)`: 行数%每行多少号，计算的是第几列的Warp Tile.
  - `(warp_id % BT_ROW_WT_NUM) * WT_N`: 第几列Warp Tile * 每个Warp Tile的列数，表示现在在第几列。

移动的大小相加得到了，当前warp计算C矩阵后，将数据从寄存器写回到共享内存的起始地点。

```
half *shmem_warp_stream_ptr = &shmem[0][0] + warp_id * MMA_M * 2 * C_SMEM_STRIDE;

const size_t gmem_idx = (block_tile_i + warp_id * 2) * MMA_M * N + block_tile_j * MMA_N;
half *src_gmem_warp_stream_ptr = &C[gmem_idx];
```
- `shmem_warp_stream_ptr`代表从共享内存写回全局内存时的共享内存的起始地点。
- `gmem_idx`代表全局内存中C矩阵写入的起点。

我知道你肯定很好奇，为什么这个地方会有个`*2`的操作🫵.

在这里我只介绍结论：在写回操作中，一个Warp负责的区域不再是Warp Tile的形状，而是（32，128），具体的解释可见后文 [从共享内存将计算结果写回至全局内存](#从共享内存将计算结果写回至全局内存)。

```
const half *A_warp_ptr = &A[block_tile_i * MMA_M * K]
    + BT_M / BT_WARP_NUM * K * warp_id;
const half *B_warp_ptr = &B[block_tile_j * MMA_N * K]
    + BT_N / BT_WARP_NUM * K * warp_id;
```
- `A_warp_ptr`指向全局内存中，当前Warp所处理的块的起点。
  - `block_tile_i * MMA_M * K`: 移动至当前Block Tile的起点。
  - `BT_M / BT_WARP_NUM`为每个Warp负责的行数；`BT_M / BT_WARP_NUM * warp_id`为当前Warp负责的第几行；`+ BT_M / BT_WARP_NUM * warp_id * K`表示移动到当前Warp所负责的块的起点。
- `B_warp_ptr`指向全局内存中，当前Warp所处理的块的起点，B是列主序的，计算过程与`A_warp_ptr`类似。

```
constexpr size_t A_smem_iters = BT_M /
    (CHUNK_COPY_LINES_PER_WARP * BT_WARP_NUM);
constexpr size_t B_smem_iters = BT_N /
    (CHUNK_COPY_LINES_PER_WARP * BT_WARP_NUM);
```

- `A_smem_iters` 一个Block把BT_M行Chunk搬运完所需次数。
  - `CHUNK_COPY_LINES_PER_WARP` 描述了一个Warp一次能够搬运的Chunk的行数: `#define CHUNK_COPY_LINES_PER_WARP (WARP_COPY_BYTES / CHUNK_LINE_BYTES)`.
  - `CHUNK_COPY_LINES_PER_WARP * BT_WARP_NUM` 描述了一个Block Tile中所有Warp一次能搬运的行数（以`CHUNK_LINE_BYTES`为一行）。
  - `BT_M / (CHUNK_COPY_LINES_PER_WARP * BT_WARP_NUM)` 描述了一个Block搬运BT_M行Chunk需要的次数。
- `B_smem_iters` 同理。

```
size_t smem_store_idx = 0;
size_t smem_load_idx = 0;

size_t smem_store_off = 0;
size_t smem_load_off = 0;
```
这些变量在流水线部分有所涉及：
- `smem_store_idx`: 表示当需要从全局内存搬运至共享内存时，等待搬入的逻辑缓冲区的序号。
- `smem_load_idx`：表示当需要从共享内存搬运至寄存器时，等待搬出的逻辑缓冲区的序号。
- `smem_store_off`：代表共享内存中存储位置实际的偏移地址，常与`smem_stage_off` `shmem_idx_b_off`配合使用。
- `smem_load_off`: 代表共享内存中搬出位置实际的偏移地址，常与`smem_stage_off` `shmem_idx_b_off`配合使用。

```
int4 *A_lane_ptr = (int4 *)(A_warp_ptr + (lane_id / CHUNK_COPY_LINE_LANES) * K)
    + (lane_id % CHUNK_COPY_LINE_LANES);
```
`A_lane_ptr`描述了当前线程搬运的`int4`大小数据的起始地点。
- `CHUNK_COPY_LINE_LANES`描述了一行Chunk所需的线程数目。
- `lane_id / CHUNK_COPY_LINE_LANES`描述了当前线程负责第几行的Chunk搬运。
- `+ (lane_id / CHUNK_COPY_LINE_LANES) * K`将指针移动到指定的Chunk行。
- `+ (lane_id % CHUNK_COPY_LINE_LANES)`定位至该Chunk行第几个`int4`.

```
size_t A_smem_idx = smem_store_off + BT_M / BT_WARP_NUM * warp_id;
A_smem_idx += lane_id / CHUNK_COPY_LINE_LANES;
```
`A_smem_idx`描述了当前线程所负责的Chunk所在行数，或者说在共享内存中的行位置。
- `BT_M / BT_WARP_NUM * warp_id` 计算了当前Warp的行。
- `+= lane_id / CHUNK_COPY_LINE_LANES`计算了当前线程的在Warp中的行。

```
size_t B_smem_idx = smem_store_off + shmem_idx_b_off + BT_N / BT_WARP_NUM * warp_id;
B_smem_idx += lane_id / CHUNK_COPY_LINE_LANES;
int4 *B_lane_ptr = (int4 *)(B_warp_ptr + (lane_id / CHUNK_COPY_LINE_LANES) * K) + (lane_id % CHUNK_COPY_LINE_LANES);
```
`shmem_idx_b_off`: 在一个共享内存逻辑缓冲区，B矩阵的数据在A矩阵之后，所以需要向后移动A矩阵已填充的数据。

其余与A同理。

```
wmma::fragment<wmma::matrix_a, MMA_M, MMA_N, MMA_K, half, wmma::row_major> A_frag[2][WT_COL_MMA_NUM];
wmma::fragment<wmma::matrix_b, MMA_M, MMA_N, MMA_K, half, wmma::col_major> B_frag[2][WT_ROW_MMA_NUM];
```
分配双缓冲寄存器存储，每个缓冲区域的大小为`WT_M * MMA_K`.

## 流水线预填充代码
### 第一次从全局内存搬运至共享内存
```
#pragma unroll
    for (size_t i = 0; i < A_smem_iters; ++i)
    {
        ...
    }
```
循环以`A_smem_iters`进行，一次保证一个Block在该循环中能够完成`BT_M`行Chunk的搬运。

循环内：
```
uint32_t A_smem_lane_addr =
            __cvta_generic_to_shared(&shmem[A_smem_idx][0]) + (lane_id % CHUNK_COPY_LINE_LANES) * THREAD_COPY_BYTES;
```
- `&shmem[A_smem_idx][0]`描述了当前线程所在Chunk的行的起始地点。
- `__cvta_generic_to_shared(&shmem[A_smem_idx][0])`: 将 shmem 数组的元素地址（这是一个泛型指针）转换为共享内存地址。
- `+ (lane_id % CHUNK_COPY_LINE_LANES) * THREAD_COPY_BYTES`在该行内，按列进行位移，
  - `lane_id % CHUNK_COPY_LINE_LANES` 描述了当前线程所负责的大小为`THREAD_COPY_BYTES` 的块的序号。
  - `#define THREAD_COPY_BYTES 16`.
```
CP_ASYNC_CG(A_smem_lane_addr, A_lane_ptr, THREAD_COPY_BYTES);
```
一个线程一次拷贝一个`int4`大小的数据。

```
A_lane_ptr = (int4 *)((half *)A_lane_ptr + CHUNK_COPY_LINES_PER_WARP * K);
```
- `CHUNK_COPY_LINES_PER_WARP` 表示一个Warp拷贝一次的Chunk的行数。
- `CHUNK_COPY_LINES_PER_WARP * K` 表示在A矩阵中向下移动相应行数。
```
A_smem_idx += CHUNK_COPY_LINES_PER_WARP;
```
本轮循环结束，一个Warp拷贝了`CHUNK_COPY_LINES_PER_WARP`个Chunk，共享内存地址向后移动。

```
#pragma unroll
    for (size_t i = 0; i < B_smem_iters; ++i)
    {
        uint32_t B_smem_lane_addr =
            __cvta_generic_to_shared(&shmem[B_smem_idx][0]) + (lane_id % CHUNK_COPY_LINE_LANES) * THREAD_COPY_BYTES;
        CP_ASYNC_CG(B_smem_lane_addr, B_lane_ptr, THREAD_COPY_BYTES);
        B_lane_ptr = (int4 *)((half *)B_lane_ptr + CHUNK_COPY_LINES_PER_WARP * K);
        B_smem_idx += CHUNK_COPY_LINES_PER_WARP;
    }
```
B矩阵拷贝一致。
```
CP_ASYNC_COMMIT_GROUP();
```
按组提交异步拷贝任务。
### 第二次从全局内存搬运至共享内存
首先需要更新状态：
```
smem_store_idx = (smem_store_idx + 1) % K_STAGE;
smem_store_off = smem_store_idx * smem_stage_off;
```
- `smem_store_idx`存储所在的逻辑缓冲区序号向前移动，此处变为1.
- `smem_store_off`存储地址偏移同步更新。

```
A_smem_idx = smem_store_off + BT_M / BT_WARP_NUM * warp_id;
A_smem_idx += lane_id / CHUNK_COPY_LINE_LANES;
```
我们已经更新了存储偏移，所以这里与前文计算内容一致。
```
A_lane_ptr = (int4 *)(A_warp_ptr + CHUNK_K * MMA_K + (lane_id / CHUNK_COPY_LINE_LANES) * K) + (lane_id % CHUNK_COPY_LINE_LANES);
```
`A_lane_ptr`的计算与之前不同：
- `CHUNK_K * MMA_K`是一个Chunk的大小.
- 在上一次搬运时，已经完成了行`BT_M`列`CHUNK_K * MMA_K`的数据的搬运.
- 在即将到来的搬运，将沿着K维度处理下一个`(BT_M, CHUNK_K * MMA_K)`的数据。
- 所以在计算得到线程所在的行后，在列方向上移动`CHUNK_K * MMA_K`到达本次搬运的起点.
- 随后在下一个`CHUNK_K * MMA_K`范围内，根据`lane_id`分配指定列起点。

```
#pragma unroll
    for (size_t i = 0; i < A_smem_iters; ++i) {
        uint32_t A_smem_lane_addr =
            __cvta_generic_to_shared(&shmem[A_smem_idx][0]) + (lane_id % CHUNK_COPY_LINE_LANES) * THREAD_COPY_BYTES;
        CP_ASYNC_CG(A_smem_lane_addr, A_lane_ptr, THREAD_COPY_BYTES);
        A_lane_ptr = (int4 *)((half *)A_lane_ptr + CHUNK_COPY_LINES_PER_WARP * K);
        A_smem_idx += CHUNK_COPY_LINES_PER_WARP;
    }
```
搬运过程与之前一致。

```
B_smem_idx = smem_store_off + shmem_idx_b_off + BT_N / BT_WARP_NUM * warp_id;
B_lane_ptr = (int4 *)(B_warp_ptr + CHUNK_K * MMA_K + (lane_id / CHUNK_COPY_LINE_LANES) * K) + (lane_id % CHUNK_COPY_LINE_LANES);
    B_smem_idx += lane_id / CHUNK_COPY_LINE_LANES;

#pragma unroll
    for (size_t i = 0; i < B_smem_iters; ++i) {
        uint32_t B_smem_lane_addr =
            __cvta_generic_to_shared(&shmem[B_smem_idx][0]) + (lane_id % CHUNK_COPY_LINE_LANES) * THREAD_COPY_BYTES;
        CP_ASYNC_CG(B_smem_lane_addr, B_lane_ptr, THREAD_COPY_BYTES);
        B_lane_ptr = (int4 *)((half *)B_lane_ptr + CHUNK_COPY_LINES_PER_WARP * K);
        B_smem_idx += CHUNK_COPY_LINES_PER_WARP;
    }
```
B矩阵的拷贝也一致。
```
CP_ASYNC_COMMIT_GROUP();
```
提交。
### 等待与同步
```
CP_ASYNC_WAIT_GROUP(1);
__syncthreads();
```
我们即将针对第一个Chunk的前半部分进行拷贝，从共享内存搬运至寄存器；在这之前我们需要确认第一次搬运已经完成，并且线程同步。

### 第一次从共享内存搬运至寄存器
```
size_t reg_store_idx = 0;
size_t reg_load_idx = 1;
```
设置双缓冲地址序号。

每个Warp每次加载一个缓冲区的数值。

加载A矩阵的数据：
```
for (size_t i = 0; i < WT_COL_MMA_NUM; ++i) {
    ...
}
```
遍历`WT_COL_MMA_NUM`，按行依次载入`MMA_M * MMA_K`的数据。

循环内：
```
size_t A_smem_idx_inner = smem_load_off + (warp_id / BT_ROW_WT_NUM) * WT_M + i * MMA_M;
```
- `warp_id / BT_ROW_WT_NUM`: 用序号除以列数，计算当前Warp Tile在第几行。
- `(warp_id / BT_ROW_WT_NUM) * WT_M` 计算当前Warp Tile的起始地点。
- `i * MMA_M`: `i`表示当前 MMA Tile 在 Warp Tile 中的行号，`* MMA_M`.

```
const half *A_tile_ptr = &shmem[A_smem_idx_inner][0];
```
得到共享内存中本次搬运的 MMA Tile 的起始地址。
```
wmma::load_matrix_sync(A_frag[reg_store_idx][i], A_tile_ptr, MMA_SMEM_STRIDE_K);
```
调用API。

```
#pragma unroll
    for (size_t j = 0; j < WT_ROW_MMA_NUM; ++j) {
        size_t B_smem_idx_inner = smem_load_off + shmem_idx_b_off + (warp_id % BT_ROW_WT_NUM) * WT_N + j * MMA_N;
        const half *B_tile_ptr = &shmem[B_smem_idx_inner][0];
        wmma::load_matrix_sync(B_frag[reg_store_idx][j], B_tile_ptr, MMA_SMEM_STRIDE_K);
    }
```
B矩阵类似。
## 流水线计算代码
```
for (size_t tile_k = CHUNK_K * (K_STAGE - 1); tile_k < K_tiles; tile_k += CHUNK_K)
{
    ...
}
```

以`CHUNK_K`为单位遍历，因为每一次遍历都将从全局内存中载入一个Chunk到共享内存。

直到所有的Chunk均被载入进共享内存（最后一个只发出命令）。

### 寄存器索引切换
```
reg_store_idx ^= 1;
reg_load_idx ^= 1;
```

### 共享内存->寄存器
这里需要为寄存器1号缓冲区载入Chunk 0 的后半部分.
```
for (size_t i = 0; i < WT_COL_MMA_NUM; ++i) {
    size_t A_smem_idx_inner = smem_load_off + (warp_id / BT_ROW_WT_NUM) * WT_M + i * MMA_M;
    const half *A_tile_ptr = &shmem[A_smem_idx_inner][MMA_K];
    wmma::load_matrix_sync(A_frag[reg_store_idx][i], A_tile_ptr, MMA_SMEM_STRIDE_K);
}
```
`const half *A_tile_ptr = &shmem[A_smem_idx_inner][MMA_K];`这里在指定具体的共享内存起始地址时，从`MMA_K`开始，因为前半部分的数据已经在载入了寄存器0号缓冲区。

B矩阵类似：
```
#pragma unroll
        for (size_t j = 0; j < WT_ROW_MMA_NUM; ++j) {
            size_t B_smem_idx_inner = smem_load_off + shmem_idx_b_off + (warp_id % BT_ROW_WT_NUM) * WT_N + j * MMA_N;
            const half *B_tile_ptr = &shmem[B_smem_idx_inner][MMA_K];
            wmma::load_matrix_sync(B_frag[reg_store_idx][j], B_tile_ptr, MMA_SMEM_STRIDE_K);
        }
```
### 寄存器数据计算
我们需要计算寄存器0号缓冲区的数据：
```
#pragma unroll
        for (size_t i = 0; i < WT_COL_MMA_NUM; ++i) {
#pragma unroll
            for (size_t j = 0; j < WT_ROW_MMA_NUM; ++j) {
                 wmma::mma_sync(C_frag[i][j], A_frag[reg_load_idx][i], B_frag[reg_load_idx][j], C_frag[i][j]);
            }
        }
```
### 全局内存->共享内存
更新存储地址及偏移量：
```
smem_store_idx = (smem_store_idx + 1) % K_STAGE;
smem_store_off = smem_store_idx * smem_stage_off;
```
共享内存行地址计算与之前一致：
```
A_smem_idx = smem_store_off + BT_M / BT_WARP_NUM * warp_id;
A_smem_idx += lane_id / CHUNK_COPY_LINE_LANES;
```
由于已经载入了`tile_k`个`MMA_K`，所以`A_lane_ptr`需要向后位移相应行。
```
A_lane_ptr = (int4 *)(A_warp_ptr + tile_k * MMA_K + (lane_id / CHUNK_COPY_LINE_LANES) * K) + (lane_id % CHUNK_COPY_LINE_LANES);
```
载入操作与前文类似
```
#pragma unroll
    for (size_t i = 0; i < A_smem_iters; ++i) {
        uint32_t A_smem_lane_addr =
            __cvta_generic_to_shared(&shmem[A_smem_idx][0]) + (lane_id % CHUNK_COPY_LINE_LANES) * THREAD_COPY_BYTES;
        CP_ASYNC_CG(A_smem_lane_addr, A_lane_ptr, THREAD_COPY_BYTES);
        A_lane_ptr = (int4 *)((half *)A_lane_ptr + CHUNK_COPY_LINES_PER_WARP * K);
        A_smem_idx += CHUNK_COPY_LINES_PER_WARP;
    }
```

B矩阵类似：
```
    B_smem_idx = smem_store_off + shmem_idx_b_off + BT_N / BT_WARP_NUM * warp_id;
    B_lane_ptr = (int4 *)(B_warp_ptr + tile_k * MMA_K + (lane_id / CHUNK_COPY_LINE_LANES) * K) + (lane_id % CHUNK_COPY_LINE_LANES);
    B_smem_idx += lane_id / CHUNK_COPY_LINE_LANES;
#pragma unroll
        for (size_t i = 0; i < B_smem_iters; ++i) {
            uint32_t B_smem_lane_addr =
                __cvta_generic_to_shared(&shmem[B_smem_idx][0]) + (lane_id % CHUNK_COPY_LINE_LANES) * THREAD_COPY_BYTES;
            CP_ASYNC_CG(B_smem_lane_addr, B_lane_ptr, THREAD_COPY_BYTES);
            B_lane_ptr = (int4 *)((half *)B_lane_ptr + CHUNK_COPY_LINES_PER_WARP * K);
            B_smem_idx += CHUNK_COPY_LINES_PER_WARP;
        }
```
提交：
```
CP_ASYNC_COMMIT_GROUP();
```
### 等待与同步
```
CP_ASYNC_WAIT_GROUP(1);
__syncthreads();
```
### 更新共享内存载出地址与寄存器地址
```
smem_load_idx = (smem_load_idx + 1) % K_STAGE;
smem_load_off = smem_load_idx * smem_stage_off;

reg_store_idx ^= 1;
reg_load_idx ^= 1;
```
准备将共享内存下一个缓冲区的Chunk的前半部分载入到寄存器。
### 共享内存->寄存器
```
#pragma unroll
        for (size_t i = 0; i < WT_COL_MMA_NUM; ++i) {
            size_t A_smem_idx_inner = smem_load_off + (warp_id / BT_ROW_WT_NUM) * WT_M + i * MMA_M;
            const half *A_tile_ptr = &shmem[A_smem_idx_inner][0];
            wmma::load_matrix_sync(A_frag[reg_store_idx][i], A_tile_ptr, MMA_SMEM_STRIDE_K);
        }

#pragma unroll
        for (size_t j = 0; j < WT_ROW_MMA_NUM; ++j) {
            size_t B_smem_idx_inner = smem_load_off + shmem_idx_b_off + (warp_id % BT_ROW_WT_NUM) * WT_N + j * MMA_N;
            const half *B_tile_ptr = &shmem[B_smem_idx_inner][0];
            wmma::load_matrix_sync(B_frag[reg_store_idx][j], B_tile_ptr, MMA_SMEM_STRIDE_K);
        }
```
由于我们载入的是新的一块Chunk的前半部分，所以`shmem`的列又从0开始。

### 寄存器数据计算
由于我们已经更新了`reg_load_idx`，所以这里的代码与上文一致。
```
#pragma unroll
        for (size_t i = 0; i < WT_COL_MMA_NUM; ++i) {
#pragma unroll
            for (size_t j = 0; j < WT_ROW_MMA_NUM; ++j) {
                wmma::mma_sync(C_frag[i][j], A_frag[reg_load_idx][i], B_frag[reg_load_idx][j], C_frag[i][j]);
            }
        }
```
## 流水线排空代码
寄存器中0号缓冲区数据尚未计算，1号缓冲区已经计算完成。

目前尚未计算的数据还有两个Chunk，其中半个Chunk载入到0号缓冲区，还需载入3次。

共享内存最后一个Chunk的数据正在从全局内存载入，可以先将倒数第二个Chunk的后半部分载入。

随后计算寄存器0号缓冲区的结果；检查最后一块Chunk是否已经载入到共享内存。

再将最后一个Chunk的前半部分载入0号缓冲区，并计算寄存器1号缓冲区的结果。

这一部分思路和流水线计算类似，区别在于不再需要进行全局内存到共享内存的拷贝。
```
#pragma unroll
    for (size_t k_step = 0; k_step < CHUNK_K; ++k_step) {
        reg_store_idx ^= 1;
        reg_load_idx ^= 1;

#pragma unroll
        for (size_t i = 0; i < WT_COL_MMA_NUM; ++i) {
            size_t A_smem_idx_inner = smem_load_off + (warp_id / BT_ROW_WT_NUM) * WT_M + i * MMA_M;
            const half *A_tile_ptr = &shmem[A_smem_idx_inner][((k_step + 1) % CHUNK_K) * MMA_K];
            wmma::load_matrix_sync(A_frag[reg_store_idx][i], A_tile_ptr, MMA_SMEM_STRIDE_K);
        }

#pragma unroll
        for (size_t j = 0; j < WT_ROW_MMA_NUM; ++j) {
            size_t B_smem_idx_inner = smem_load_off + shmem_idx_b_off + (warp_id % BT_ROW_WT_NUM) * WT_N + j * MMA_N;
            const half *B_tile_ptr = &shmem[B_smem_idx_inner][((k_step + 1) % CHUNK_K) * MMA_K];
            wmma::load_matrix_sync(B_frag[reg_store_idx][j], B_tile_ptr, MMA_SMEM_STRIDE_K);
        }

#pragma unroll
        for (size_t i = 0; i < WT_COL_MMA_NUM; ++i) {
#pragma unroll
            for (size_t j = 0; j < WT_ROW_MMA_NUM; ++j) {
                wmma::mma_sync(C_frag[i][j], A_frag[reg_load_idx][i], B_frag[reg_load_idx][j], C_frag[i][j]);
            }
        }

        if (k_step + 2 == CHUNK_K) {
            smem_load_idx = (smem_load_idx + 1) % K_STAGE;
            smem_load_off = smem_load_idx * smem_stage_off;
            CP_ASYNC_WAIT_GROUP(0);
            __syncthreads();
        }
    }
```

此时寄存器仍然为0号缓冲区未计算，1号缓冲区完成计算。

且还需载入最后一个Chunk的后半部分。

再完成寄存器0号缓冲区的计算。
```
#pragma unroll
    for (size_t k_step = 1; k_step < CHUNK_K; ++k_step) {
        reg_store_idx ^= 1;
        reg_load_idx ^= 1;

#pragma unroll
        for (size_t i = 0; i < WT_COL_MMA_NUM; ++i) {
            size_t A_smem_idx_inner = smem_load_off + (warp_id / BT_ROW_WT_NUM) * WT_M + i * MMA_M;
            const half *A_tile_ptr = &shmem[A_smem_idx_inner][k_step * MMA_K];
            wmma::load_matrix_sync(A_frag[reg_store_idx][i], A_tile_ptr, MMA_SMEM_STRIDE_K);
        }

#pragma unroll
        for (size_t j = 0; j < WT_ROW_MMA_NUM; ++j) {
            size_t B_smem_idx_inner = smem_load_off + shmem_idx_b_off + (warp_id % BT_ROW_WT_NUM) * WT_N + j * MMA_N;
            const half *B_tile_ptr = &shmem[B_smem_idx_inner][k_step * MMA_K];
            wmma::load_matrix_sync(B_frag[reg_store_idx][j], B_tile_ptr, MMA_SMEM_STRIDE_K);
        }

#pragma unroll
        for (size_t i = 0; i < WT_COL_MMA_NUM; ++i) {
#pragma unroll
            for (size_t j = 0; j < WT_ROW_MMA_NUM; ++j) {
                wmma::mma_sync(C_frag[i][j], A_frag[reg_load_idx][i], B_frag[reg_load_idx][j], C_frag[i][j]);
            }
        }
    }
```

最后计算寄存器的1号缓冲区，这里就不更新`reg_load_idx`了（前文是为了表达清晰），直接使用`reg_store_idx`即可。

```
#pragma unroll
    for (size_t i = 0; i < WT_COL_MMA_NUM; ++i) {
#pragma unroll
        for (size_t j = 0; j < WT_ROW_MMA_NUM; ++j) {
            wmma::mma_sync(C_frag[i][j], A_frag[reg_store_idx][i], B_frag[reg_store_idx][j], C_frag[i][j]);
        }
    }
```

最后在准备写回结果前，线程同步：
```
__syncthreads();
```
## 从寄存器写回共享内存
```
#pragma unroll
    for (size_t i = 0; i < WT_COL_MMA_NUM; ++i)
    {
#pragma unroll
        for (size_t j = 0; j < WT_ROW_MMA_NUM; ++j)
        {
            half *C_tile_ptr = shmem_warp_tile_ptr + i * C_SMEM_STRIDE * MMA_M + j * MMA_N;
            wmma::store_matrix_sync(C_tile_ptr, C_frag[i][j], C_SMEM_STRIDE, wmma::mem_row_major);
        }
    }
```
以MMA为单位，每个Warp写回一个Warp Tile的数据。

等到结果全部搬运至共享内存：
```
__syncthreads();
```
## 从共享内存将计算结果写回至全局内存
```
#pragma unroll
    for (size_t i = 0; i < MMA_M; ++i)
    {
        *((int4 *)(src_gmem_warp_stream_ptr + (i * 2 + lane_id / 16) * N) + lane_id % 16) =
            *((int4 *)(shmem_warp_stream_ptr + (i * 2 + lane_id / 16) * C_SMEM_STRIDE) + lane_id % 16);
    }
```
在该部分，我们将对前文相关地址`*2`的原因做出解释。

首先我们关注共享内存的地址计算：
- `lane_id / 16` 将一个Warp中的线程分为前后两组，各组16个；在单次操作中，前16个线程负责搬运第`2 * i`行，而后16个线程负责搬运第`2 * i + 1`行。
- 一个线程每次搬运`int4`大小的数据，则一个线程每次搬运8个`half`；一行有16个线程负责搬运，则16个线程一共搬运128个`half`，恰好为Block Tile的列数。
- 循环是以`MMA_M`为目标进行的，进行16次循环，则一共完成32行数据的搬运。
- 所以一个Warp在将共享内存的结果写回全局内存时，负责的块的形状为(32, 128). 这与Warp负责Warp Tile大小的块的思路不同。

此时，我们便能对前文的地址做出解释：
```
half *shmem_warp_stream_ptr = &shmem[0][0] + warp_id * MMA_M * 2 * C_SMEM_STRIDE;

const size_t gmem_idx = (block_tile_i + warp_id * 2) * MMA_M * N + block_tile_j * MMA_N;
half *src_gmem_warp_stream_ptr = &C[gmem_idx];
```
- `shmem_warp_stream_ptr`: 在搬运时，warp以行为单位进行移动，一个warp负责32行，`MMA_M=16`，则一个warp会负责两行`MMA`，故总行数为`warp_id * MMA_M * 2`，总的移动数量为`warp_id * MMA_M * 2 * C_SMEM_STRIDE`.
- `gmem_idx`: 计算当前Warp所对应的搬运的块起始地址：
  - 确定Block Tile的起始地址：
    - 行：`block_tile_i`描述了当前Block Tile的起点在第几行MMA上，`block_tile_i * MMA_M`描述当前Block Tile的起点在第几行上，需要移动的数目为：`block_tile_i * MMA_M * N`.
    - 列：`block_tile_j`描述了当前Block Tile的起点在第几列MMA上，`block_tile_j * MMA_N`计算了当前Block Tile的列方向的起点。
  - 确定Warp负责的区域：
    - Warp在Block Tile按行负责，每个Warp负责32行，即一个Warp负责两行MMA，总行数为`warp_id * 2 * MMA_M`，需要移动的数目为`warp_id * 2 * MMA_M * N`.
  - 最终确定为：`block_tile_i * MMA_M * N + block_tile_j * MMA_N + warp_id * 2 * MMA_M * N`

接着，我们分析全局内存地址的计算：
- `(i * 2 + lane_id / 16)`：了当前线程所在的行（我们已经移动了`src_gmem_warp_stream_ptr`到指定的Warp所搬运的区域）
- `(i * 2 + lane_id / 16) * N)`计算移动的数目，得到了此次循环的第一行的第一个数据的位置。
- `+ lane_id % 16`，对不同线程的起始位置进行确定，移动的单位是`int4`.

回到 [内存与寄存器](#内存与寄存器)。
# 完整代码
```
#include "common.hpp"
using namespace nvcuda;

// BlockTile的Shape
#define BT_M 256
#define BT_N 128

// WMMA-TensorCore执行计算的Shape
#define MMA_M 16
#define MMA_N 16
#define MMA_K 16

// BlockTile内按照Warp 2x4拆分
#define BT_ROW_WT_NUM 2 // BlockTile每一行分为2个WarpTile
#define BT_COL_WT_NUM 4 // BlockTile每一列分为4个WarpTile

// WarpTile的Shape
#define WT_M (BT_M / BT_COL_WT_NUM) // WarpTile M-Axis的元素个数
#define WT_N (BT_N / BT_ROW_WT_NUM) // WarpTile N-Axis的元素个数

// 每个BlockTile的MMA Tile的数量
#define BT_COL_MMA_NUM (BT_M / MMA_M) // BlockTile每一列包含的MMA_TILE的数量
#define BT_ROW_MMA_NUM (BT_N / MMA_N) // BlockTile每一行包含的MMA_TILE的数量

// 每个WarpTile的MMA Tile的数量
#define WT_COL_MMA_NUM (WT_M / MMA_M) // WarpTile每一列包含MMA_TILE的数量
#define WT_ROW_MMA_NUM (WT_N / MMA_N) // WarpTile每一行包含MMA_TILE的数量

// 一个WARP有32个线程, 一个BlockTile内的线程数为BT_THREAD_NUM
#define WARP_SIZE 32
#define BT_WARP_NUM (BT_ROW_WT_NUM * BT_COL_WT_NUM)
#define BT_THREAD_NUM (WARP_SIZE * BT_WARP_NUM)

#define CHUNK_K 2      // 每次处理的MMA_TILE_K的Batch个数
#define SKEW_PADDING 8 // 为了解决BankConflict增加的Padding
#define MMA_SMEM_STRIDE_K (CHUNK_K * MMA_K + SKEW_PADDING)
#define C_SMEM_STRIDE (BT_N + SKEW_PADDING)

#define CHUNK_LINE_BYTES (CHUNK_K * MMA_K * sizeof(half))
#define WARP_COPY_BYTES (WARP_SIZE * sizeof(int4))
#define CHUNK_COPY_LINES_PER_WARP (WARP_COPY_BYTES / CHUNK_LINE_BYTES)
#define CHUNK_COPY_LINE_LANES (WARP_SIZE / CHUNK_COPY_LINES_PER_WARP)

#define THREAD_COPY_BYTES 16

#define BLOCK_STRIDE 16

#define K_STAGE 3

__global__ void blockGemmKernel(half *A, half *B, half *C, size_t M, size_t N, size_t K)
{
    const size_t M_tiles = CEIL_DIV(M, MMA_M);
    const size_t N_tiles = CEIL_DIV(N, MMA_N);
    const size_t K_tiles = CEIL_DIV(K, MMA_K);

    const size_t block_tile_i =
        (blockIdx.z % 2) ? ((gridDim.y - blockIdx.y - 1) * BT_COL_MMA_NUM) : (blockIdx.y * BT_COL_MMA_NUM);
    const size_t block_tile_j = (blockIdx.z * gridDim.x + blockIdx.x) * BT_ROW_MMA_NUM;
    if (block_tile_i >= M_tiles || block_tile_j >= N_tiles)
    {
        return;
    }
    extern __shared__ half shmem[][MMA_SMEM_STRIDE_K];
    const size_t warp_id = threadIdx.x / WARP_SIZE;
    const size_t lane_id = threadIdx.x % WARP_SIZE;
    wmma::fragment<wmma::accumulator, MMA_M, MMA_N, MMA_K, half> C_frag[WT_COL_MMA_NUM][WT_ROW_MMA_NUM];
#pragma unroll
    for (size_t i = 0; i < WT_COL_MMA_NUM; ++i)
    {
#pragma unroll
        for (size_t j = 0; j < WT_ROW_MMA_NUM; ++j)
        {
            wmma::fill_fragment(C_frag[i][j], 0.0);
        }
    }
    constexpr size_t shmem_idx_b_off = BT_M;
    constexpr size_t smem_stage_off = BT_M + BT_N;

    half *shmem_warp_tile_ptr = &shmem[0][0] +
                                  (warp_id / BT_ROW_WT_NUM) * C_SMEM_STRIDE * WT_M +
                                  (warp_id % BT_ROW_WT_NUM) * WT_N;

    half *shmem_warp_stream_ptr = &shmem[0][0] + warp_id * MMA_M * 2 * C_SMEM_STRIDE;

    const size_t gmem_idx = (block_tile_i + warp_id * 2) * MMA_M * N + block_tile_j * MMA_N;
    half *src_gmem_warp_stream_ptr = &C[gmem_idx];

    const half *A_warp_ptr = &A[block_tile_i * MMA_M * K] + BT_M / BT_WARP_NUM * K * warp_id;
    const half *B_warp_ptr = &B[block_tile_j * MMA_N * K] + BT_N / BT_WARP_NUM * K * warp_id;

    constexpr size_t A_smem_iters = BT_M / (CHUNK_COPY_LINES_PER_WARP * BT_WARP_NUM);
    constexpr size_t B_smem_iters = BT_N / (CHUNK_COPY_LINES_PER_WARP * BT_WARP_NUM);

    size_t smem_store_idx = 0;
    size_t smem_load_idx = 0;

    size_t smem_store_off = 0;
    size_t smem_load_off = 0;


    size_t A_smem_idx = smem_store_off + BT_M / BT_WARP_NUM * warp_id;
    int4 *A_lane_ptr = (int4 *)(A_warp_ptr + (lane_id / CHUNK_COPY_LINE_LANES) * K) + (lane_id % CHUNK_COPY_LINE_LANES);
    A_smem_idx += lane_id / CHUNK_COPY_LINE_LANES;

#pragma unroll
    for (size_t i = 0; i < A_smem_iters; ++i)
    {
        uint32_t A_smem_lane_addr =
            __cvta_generic_to_shared(&shmem[A_smem_idx][0]) + (lane_id % CHUNK_COPY_LINE_LANES) * THREAD_COPY_BYTES;
        CP_ASYNC_CG(A_smem_lane_addr, A_lane_ptr, THREAD_COPY_BYTES);
        A_lane_ptr = (int4 *)((half *)A_lane_ptr + CHUNK_COPY_LINES_PER_WARP * K);
        A_smem_idx += CHUNK_COPY_LINES_PER_WARP;
    }

    size_t B_smem_idx = smem_store_off + shmem_idx_b_off + BT_N / BT_WARP_NUM * warp_id;
    int4 *B_lane_ptr = (int4 *)(B_warp_ptr + (lane_id / CHUNK_COPY_LINE_LANES) * K) + (lane_id % CHUNK_COPY_LINE_LANES);
    B_smem_idx += lane_id / CHUNK_COPY_LINE_LANES;

#pragma unroll
    for (size_t i = 0; i < B_smem_iters; ++i)
    {
        uint32_t B_smem_lane_addr =
            __cvta_generic_to_shared(&shmem[B_smem_idx][0]) + (lane_id % CHUNK_COPY_LINE_LANES) * THREAD_COPY_BYTES;
        CP_ASYNC_CG(B_smem_lane_addr, B_lane_ptr, THREAD_COPY_BYTES);
        B_lane_ptr = (int4 *)((half *)B_lane_ptr + CHUNK_COPY_LINES_PER_WARP * K);
        B_smem_idx += CHUNK_COPY_LINES_PER_WARP;
    }
    CP_ASYNC_COMMIT_GROUP();

    smem_store_idx = (smem_store_idx + 1) % K_STAGE;
    smem_store_off = smem_store_idx * smem_stage_off;

    A_smem_idx = smem_store_off + BT_M / BT_WARP_NUM * warp_id;
    A_lane_ptr = (int4 *)(A_warp_ptr + CHUNK_K * MMA_K + (lane_id / CHUNK_COPY_LINE_LANES) * K) + (lane_id % CHUNK_COPY_LINE_LANES);
    A_smem_idx += lane_id / CHUNK_COPY_LINE_LANES;

#pragma unroll
    for (size_t i = 0; i < A_smem_iters; ++i) {
        uint32_t A_smem_lane_addr =
            __cvta_generic_to_shared(&shmem[A_smem_idx][0]) + (lane_id % CHUNK_COPY_LINE_LANES) * THREAD_COPY_BYTES;
        CP_ASYNC_CG(A_smem_lane_addr, A_lane_ptr, THREAD_COPY_BYTES);
        A_lane_ptr = (int4 *)((half *)A_lane_ptr + CHUNK_COPY_LINES_PER_WARP * K);
        A_smem_idx += CHUNK_COPY_LINES_PER_WARP;
    }

    B_smem_idx = smem_store_off + shmem_idx_b_off + BT_N / BT_WARP_NUM * warp_id;
    B_lane_ptr = (int4 *)(B_warp_ptr + CHUNK_K * MMA_K + (lane_id / CHUNK_COPY_LINE_LANES) * K) + (lane_id % CHUNK_COPY_LINE_LANES);
    B_smem_idx += lane_id / CHUNK_COPY_LINE_LANES;

#pragma unroll
    for (size_t i = 0; i < B_smem_iters; ++i) {
        uint32_t B_smem_lane_addr =
            __cvta_generic_to_shared(&shmem[B_smem_idx][0]) + (lane_id % CHUNK_COPY_LINE_LANES) * THREAD_COPY_BYTES;
        CP_ASYNC_CG(B_smem_lane_addr, B_lane_ptr, THREAD_COPY_BYTES);
        B_lane_ptr = (int4 *)((half *)B_lane_ptr + CHUNK_COPY_LINES_PER_WARP * K);
        B_smem_idx += CHUNK_COPY_LINES_PER_WARP;
    }
    CP_ASYNC_COMMIT_GROUP();

    CP_ASYNC_WAIT_GROUP(1);
    __syncthreads();

    wmma::fragment<wmma::matrix_a, MMA_M, MMA_N, MMA_K, half, wmma::row_major> A_frag[2][WT_COL_MMA_NUM];
    wmma::fragment<wmma::matrix_b, MMA_M, MMA_N, MMA_K, half, wmma::col_major> B_frag[2][WT_ROW_MMA_NUM];

    size_t reg_store_idx = 0;
    size_t reg_load_idx = 1;

#pragma unroll
    for (size_t i = 0; i < WT_COL_MMA_NUM; ++i) {
        size_t A_smem_idx_inner = smem_load_off + (warp_id / BT_ROW_WT_NUM) * WT_M + i * MMA_M;
        const half *A_tile_ptr = &shmem[A_smem_idx_inner][0];
        wmma::load_matrix_sync(A_frag[reg_store_idx][i], A_tile_ptr, MMA_SMEM_STRIDE_K);
    }
#pragma unroll
    for (size_t j = 0; j < WT_ROW_MMA_NUM; ++j) {
        size_t B_smem_idx_inner = smem_load_off + shmem_idx_b_off + (warp_id % BT_ROW_WT_NUM) * WT_N + j * MMA_N;
        const half *B_tile_ptr = &shmem[B_smem_idx_inner][0];
        wmma::load_matrix_sync(B_frag[reg_store_idx][j], B_tile_ptr, MMA_SMEM_STRIDE_K);
    }

#pragma unroll
    for (size_t tile_k = CHUNK_K * (K_STAGE - 1); tile_k < K_tiles; tile_k += CHUNK_K)
    {
        reg_store_idx ^= 1;
        reg_load_idx ^= 1;

#pragma unroll
        for (size_t i = 0; i < WT_COL_MMA_NUM; ++i) {
            size_t A_smem_idx_inner = smem_load_off + (warp_id / BT_ROW_WT_NUM) * WT_M + i * MMA_M;
            const half *A_tile_ptr = &shmem[A_smem_idx_inner][MMA_K];
            wmma::load_matrix_sync(A_frag[reg_store_idx][i], A_tile_ptr, MMA_SMEM_STRIDE_K);
        }

#pragma unroll
        for (size_t j = 0; j < WT_ROW_MMA_NUM; ++j) {
            size_t B_smem_idx_inner = smem_load_off + shmem_idx_b_off + (warp_id % BT_ROW_WT_NUM) * WT_N + j * MMA_N;
            const half *B_tile_ptr = &shmem[B_smem_idx_inner][MMA_K];
            wmma::load_matrix_sync(B_frag[reg_store_idx][j], B_tile_ptr, MMA_SMEM_STRIDE_K);
        }

#pragma unroll
        for (size_t i = 0; i < WT_COL_MMA_NUM; ++i) {
#pragma unroll
            for (size_t j = 0; j < WT_ROW_MMA_NUM; ++j) {
                 wmma::mma_sync(C_frag[i][j], A_frag[reg_load_idx][i], B_frag[reg_load_idx][j], C_frag[i][j]);
            }
        }

        smem_store_idx = (smem_store_idx + 1) % K_STAGE;
        smem_store_off = smem_store_idx * smem_stage_off;

        A_smem_idx = smem_store_off + BT_M / BT_WARP_NUM * warp_id;
        A_lane_ptr = (int4 *)(A_warp_ptr + tile_k * MMA_K + (lane_id / CHUNK_COPY_LINE_LANES) * K) +
                       (lane_id % CHUNK_COPY_LINE_LANES);
        A_smem_idx += lane_id / CHUNK_COPY_LINE_LANES;

#pragma unroll
        for (size_t i = 0; i < A_smem_iters; ++i) {
            uint32_t A_smem_lane_addr =
                __cvta_generic_to_shared(&shmem[A_smem_idx][0]) + (lane_id % CHUNK_COPY_LINE_LANES) * THREAD_COPY_BYTES;
            CP_ASYNC_CG(A_smem_lane_addr, A_lane_ptr, THREAD_COPY_BYTES);
            A_lane_ptr = (int4 *)((half *)A_lane_ptr + CHUNK_COPY_LINES_PER_WARP * K);
            A_smem_idx += CHUNK_COPY_LINES_PER_WARP;
        }

        B_smem_idx = smem_store_off + shmem_idx_b_off + BT_N / BT_WARP_NUM * warp_id;
        B_lane_ptr = (int4 *)(B_warp_ptr + tile_k * MMA_K + (lane_id / CHUNK_COPY_LINE_LANES) * K) +
                       (lane_id % CHUNK_COPY_LINE_LANES);
        B_smem_idx += lane_id / CHUNK_COPY_LINE_LANES;

#pragma unroll
        for (size_t i = 0; i < B_smem_iters; ++i) {
            uint32_t B_smem_lane_addr =
                __cvta_generic_to_shared(&shmem[B_smem_idx][0]) + (lane_id % CHUNK_COPY_LINE_LANES) * THREAD_COPY_BYTES;
            CP_ASYNC_CG(B_smem_lane_addr, B_lane_ptr, THREAD_COPY_BYTES);
            B_lane_ptr = (int4 *)((half *)B_lane_ptr + CHUNK_COPY_LINES_PER_WARP * K);
            B_smem_idx += CHUNK_COPY_LINES_PER_WARP;
        }

        CP_ASYNC_COMMIT_GROUP();
        CP_ASYNC_WAIT_GROUP(1);
        __syncthreads();

        smem_load_idx = (smem_load_idx + 1) % K_STAGE;
        smem_load_off = smem_load_idx * smem_stage_off;

        reg_store_idx ^= 1;
        reg_load_idx ^= 1;

#pragma unroll
        for (size_t i = 0; i < WT_COL_MMA_NUM; ++i) {
            size_t A_smem_idx_inner = smem_load_off + (warp_id / BT_ROW_WT_NUM) * WT_M + i * MMA_M;
            const half *A_tile_ptr = &shmem[A_smem_idx_inner][0];
            wmma::load_matrix_sync(A_frag[reg_store_idx][i], A_tile_ptr, MMA_SMEM_STRIDE_K);
        }

#pragma unroll
        for (size_t j = 0; j < WT_ROW_MMA_NUM; ++j) {
            size_t B_smem_idx_inner = smem_load_off + shmem_idx_b_off + (warp_id % BT_ROW_WT_NUM) * WT_N + j * MMA_N;
            const half *B_tile_ptr = &shmem[B_smem_idx_inner][0];
            wmma::load_matrix_sync(B_frag[reg_store_idx][j], B_tile_ptr, MMA_SMEM_STRIDE_K);
        }

#pragma unroll
        for (size_t i = 0; i < WT_COL_MMA_NUM; ++i) {
#pragma unroll
            for (size_t j = 0; j < WT_ROW_MMA_NUM; ++j) {
                wmma::mma_sync(C_frag[i][j], A_frag[reg_load_idx][i], B_frag[reg_load_idx][j], C_frag[i][j]);
            }
        }
    }

#pragma unroll
    for (size_t k_step = 0; k_step < CHUNK_K; ++k_step) {
        reg_store_idx ^= 1;
        reg_load_idx ^= 1;

#pragma unroll
        for (size_t i = 0; i < WT_COL_MMA_NUM; ++i) {
            size_t A_smem_idx_inner = smem_load_off + (warp_id / BT_ROW_WT_NUM) * WT_M + i * MMA_M;
            const half *A_tile_ptr = &shmem[A_smem_idx_inner][((k_step + 1) % CHUNK_K) * MMA_K];
            wmma::load_matrix_sync(A_frag[reg_store_idx][i], A_tile_ptr, MMA_SMEM_STRIDE_K);
        }

#pragma unroll
        for (size_t j = 0; j < WT_ROW_MMA_NUM; ++j) {
            size_t B_smem_idx_inner = smem_load_off + shmem_idx_b_off + (warp_id % BT_ROW_WT_NUM) * WT_N + j * MMA_N;
            const half *B_tile_ptr = &shmem[B_smem_idx_inner][((k_step + 1) % CHUNK_K) * MMA_K];
            wmma::load_matrix_sync(B_frag[reg_store_idx][j], B_tile_ptr, MMA_SMEM_STRIDE_K);
        }

#pragma unroll
        for (size_t i = 0; i < WT_COL_MMA_NUM; ++i) {
#pragma unroll
            for (size_t j = 0; j < WT_ROW_MMA_NUM; ++j) {
                wmma::mma_sync(C_frag[i][j], A_frag[reg_load_idx][i], B_frag[reg_load_idx][j], C_frag[i][j]);
            }
        }

        if (k_step + 2 == CHUNK_K) {
            smem_load_idx = (smem_load_idx + 1) % K_STAGE;
            smem_load_off = smem_load_idx * smem_stage_off;
            CP_ASYNC_WAIT_GROUP(0);
            __syncthreads();
        }
    }

#pragma unroll
    for (size_t k_step = 1; k_step < CHUNK_K; ++k_step) {
        reg_store_idx ^= 1;
        reg_load_idx ^= 1;

#pragma unroll
        for (size_t i = 0; i < WT_COL_MMA_NUM; ++i) {
            size_t A_smem_idx_inner = smem_load_off + (warp_id / BT_ROW_WT_NUM) * WT_M + i * MMA_M;
            const half *A_tile_ptr = &shmem[A_smem_idx_inner][k_step * MMA_K];
            wmma::load_matrix_sync(A_frag[reg_store_idx][i], A_tile_ptr, MMA_SMEM_STRIDE_K);
        }

#pragma unroll
        for (size_t j = 0; j < WT_ROW_MMA_NUM; ++j) {
            size_t B_smem_idx_inner = smem_load_off + shmem_idx_b_off + (warp_id % BT_ROW_WT_NUM) * WT_N + j * MMA_N;
            const half *B_tile_ptr = &shmem[B_smem_idx_inner][k_step * MMA_K];
            wmma::load_matrix_sync(B_frag[reg_store_idx][j], B_tile_ptr, MMA_SMEM_STRIDE_K);
        }

#pragma unroll
        for (size_t i = 0; i < WT_COL_MMA_NUM; ++i) {
#pragma unroll
            for (size_t j = 0; j < WT_ROW_MMA_NUM; ++j) {
                wmma::mma_sync(C_frag[i][j], A_frag[reg_load_idx][i], B_frag[reg_load_idx][j], C_frag[i][j]);
            }
        }
    }

#pragma unroll
    for (size_t i = 0; i < WT_COL_MMA_NUM; ++i) {
#pragma unroll
        for (size_t j = 0; j < WT_ROW_MMA_NUM; ++j) {
            wmma::mma_sync(C_frag[i][j], A_frag[reg_store_idx][i], B_frag[reg_store_idx][j], C_frag[i][j]);
        }
    }

    __syncthreads();

#pragma unroll
    for (size_t i = 0; i < WT_COL_MMA_NUM; ++i)
    {
#pragma unroll
        for (size_t j = 0; j < WT_ROW_MMA_NUM; ++j)
        {
            half *C_tile_ptr = shmem_warp_tile_ptr + i * C_SMEM_STRIDE * MMA_M + j * MMA_N;
            wmma::store_matrix_sync(C_tile_ptr, C_frag[i][j], C_SMEM_STRIDE, wmma::mem_row_major);
        }
    }
    __syncthreads();

#pragma unroll
    for (size_t i = 0; i < MMA_M; ++i)
    {
        *((int4 *)(src_gmem_warp_stream_ptr + (i * 2 + lane_id / 16) * N) + lane_id % 16) =
            *((int4 *)(shmem_warp_stream_ptr + (i * 2 + lane_id / 16) * C_SMEM_STRIDE) + lane_id % 16);
    }
}

void launch_gemm(size_t M, size_t N, size_t K, half *A, half *B, half *C, half alpha, half beta)
{
    // 获取平台SHMEM SIZE
    int dev_id = 0;
    cudaDeviceProp dev_prop;
    cudaGetDeviceProperties(&dev_prop, dev_id);

    size_t SHMEM_SZ =
        std::max((BT_M + BT_N) * MMA_SMEM_STRIDE_K * sizeof(half) * K_STAGE, BT_M * C_SMEM_STRIDE * sizeof(half));

    if (dev_prop.sharedMemPerMultiprocessor > SHMEM_SZ)
        cudaFuncSetAttribute(blockGemmKernel,
                             cudaFuncAttributeMaxDynamicSharedMemorySize,
                             SHMEM_SZ);

    dim3 block(BT_THREAD_NUM);
    dim3 grid(BLOCK_STRIDE, CEIL_DIV(M, BT_M), CEIL_DIV(N, BT_N * BLOCK_STRIDE));
    blockGemmKernel<<<grid, block, SHMEM_SZ>>>(A, B, C, M, N, K);
}

int main()
{
    testError(launch_gemm, 0);
    perf_measure(launch_gemm);
}
```
4060: 61T
