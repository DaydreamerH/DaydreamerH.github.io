---
title: "基础矩阵乘法优化"
description: "本文介绍了基础矩阵乘法优化的方法，包括简单矩阵乘法实现、全局内存合并、使用共享内存、1D BlockTiling、2D BlockTiling."
date: "2025-05-24 14:32:16"
category: "图形与高性能计算"
originalCategory: "CUDA入门"
track: "Rendering / HPC"
level: advanced
status: ready
published: true
minutes: 5
order: 1000
prerequisites: []
tags: ["CUDA", "HPC", "C"]
photos: "banner.png"
source: "_posts"
---
# 测试环境
测试环境为：4060 GPU、CudaVersion 12.9、Driver Version: 576.52

## cuBLAS基线

测试代码：
```
#include <stdio.h>
#include <stdlib.h>
#include <cublas_v2.h>

const int M = 2048;
const int N = 2048;
const int K = 4096;
float alpha = 1.0f;
float beta = 0.5f;
const int ITER = 1000;

int main()
{
    cudaError_t cudaStat;
    cublasStatus_t stat;
    cublasHandle_t handle;

    stat = cublasCreate_v2(&handle);

    float* d_a, * d_b, * d_c;
    cudaMalloc((void**)&d_a, M * K * sizeof(float));
    cudaMalloc((void**)&d_b, K * N * sizeof(float));
    cudaMalloc((void**)&d_c, M * N * sizeof(float));

    cudaEvent_t start, end;
    cudaEventCreate(&start);
    cudaEventCreate(&end);

    cudaEventRecord(start);
    for (int i = 0; i < ITER; i++)
    {
        stat = cublasSgemm(handle,
            CUBLAS_OP_N,
            CUBLAS_OP_N,
            N, M, K,
            &alpha, d_b, N, d_a, K, &beta, d_c, N);
    }
    cudaEventRecord(end);
    cudaEventSynchronize(end);

    float msec = 0.f;
    cudaEventElapsedTime(&msec, start, end);

    long long workfload = long long(M) * N * K * 2 * ITER;
    double avg_GFlops = (double(workfload) / 1e9) / (double(msec) / 1e3);
    printf_s("cuBLAS AveragePerformance %10.11f GFlops\n", avg_GFlops);

    cudaFree(d_a);
    cudaFree(d_b);
    cudaFree(d_c);
    cublasDestroy(handle);
}
```
测试结果为：9771.48035954524 GFlops.

# 最简单的矩阵乘法实现
```
#include <stdio.h>
#include <stdlib.h>
#include <cublas_v2.h>
#include <device_launch_parameters.h>

const int M = 2048;
const int N = 2048;
const int K = 4096;
float alpha = 1.0f;
float beta = 0.5f;
const int ITER = 1000;

__global__ void SimpleGEMM(float* A, float* B, float* C, int M, int N, int K, float Alpha, float Beta)
{
    const unsigned int x = blockIdx.x * blockDim.x + threadIdx.x;
    const unsigned int y = blockIdx.y * blockDim.y + threadIdx.y;

    if (x < M && y < N)
    {
        float tmp = 0.f;
        for (int i = 0; i < K; ++i)
        {
            tmp += A[x * K + i] * B[i * N + y];
        }
        C[x * N + y] = Alpha * tmp + Beta * C[x * N + y];
    }

}
int main()
{
    cudaError_t cudaStat;

    float* d_a, * d_b, * d_c;
    cudaMalloc((void**)&d_a, M * K * sizeof(float));
    cudaMalloc((void**)&d_b, K * N * sizeof(float));
    cudaMalloc((void**)&d_c, M * N * sizeof(float));

    cudaEvent_t start, end;
    cudaEventCreate(&start);
    cudaEventCreate(&end);

    cudaEventRecord(start);

    dim3 blockDim(32, 32, 1);
    dim3 gridDim((M + blockDim.x - 1) / blockDim.x, (N + blockDim.y - 1) / blockDim.y, 1);

    for (int i = 0; i < ITER; i++)
    {
        SimpleGEMM <<<gridDim, blockDim>>> (d_a, d_b, d_c, M, N, K, alpha, beta);
    }
    cudaEventRecord(end);
    cudaEventSynchronize(end);

    float msec = 0.f;
    cudaEventElapsedTime(&msec, start, end);

    long long workfload = long long(M) * N * K * 2 * ITER;
    double avg_GFlops = (double(workfload) / 1e9) / (double(msec) / 1e3);
    printf_s("AveragePerformance %10.11f GFlops\n", avg_GFlops);

    cudaFree(d_a);
    cudaFree(d_b);
    cudaFree(d_c);
}
```

测试结果为：124.06101952324 GFlops

# 全局内存合并
在GPU中，通常将32个线程合并为一个wrap。如果每个线程从全局内存加载访问数据的地址是连续的，那么可以将访问合并成单个Load事务中。

```
#include <stdio.h>
#include <stdlib.h>
#include <cublas_v2.h>
#include <device_launch_parameters.h>

const int M = 2048;
const int N = 2048;
const int K = 4096;
float alpha = 1.0f;
float beta = 0.5f;
const int ITER = 1000;

const int BLOCKSIZE = 32;

__global__ void CoalescingGEMM(float* A, float* B, float* C, int M, int N, int K, float Alpha, float Beta)
{
    const unsigned int x = blockIdx.x * BLOCKSIZE + threadIdx.x/ BLOCKSIZE;
    const unsigned int y = blockIdx.y * BLOCKSIZE + threadIdx.x% BLOCKSIZE;

    if (x < M && y < N)
    {
        float tmp = 0.f;
        for (int i = 0; i < K; ++i)
        {
            tmp += A[x * K + i] * B[i * N + y];
        }
        C[x * N + y] = Alpha * tmp + Beta * C[x * N + y];
    }

}
int main()
{
    cudaError_t cudaStat;

    float* d_a, * d_b, * d_c;
    cudaMalloc((void**)&d_a, M * K * sizeof(float));
    cudaMalloc((void**)&d_b, K * N * sizeof(float));
    cudaMalloc((void**)&d_c, M * N * sizeof(float));

    cudaEvent_t start, end;
    cudaEventCreate(&start);
    cudaEventCreate(&end);

    cudaEventRecord(start);

    dim3 blockDim(BLOCKSIZE * BLOCKSIZE);
    dim3 gridDim((M + BLOCKSIZE - 1) / BLOCKSIZE, (N + BLOCKSIZE - 1) / BLOCKSIZE);

    for (int i = 0; i < ITER; i++)
    {
        CoalescingGEMM <<<gridDim, blockDim>>> (d_a, d_b, d_c, M, N, K, alpha, beta);
    }
    cudaEventRecord(end);
    cudaEventSynchronize(end);

    float msec = 0.f;
    cudaEventElapsedTime(&msec, start, end);

    long long workfload = long long(M) * N * K * 2 * ITER;
    double avg_GFlops = (double(workfload) / 1e9) / (double(msec) / 1e3);
    printf_s("AveragePerformance %10.11f GFlops\n", avg_GFlops);

    cudaFree(d_a);
    cudaFree(d_b);
    cudaFree(d_c);
}
```
访问B矩阵的地址为：B[i * N + blockIdx.y * BLOCKSIZE + 0]、B[i * N + blockIdx.y * BLOCKSIZE + 1]、B[i * N + blockIdx.y * BLOCKSIZE + 2]、B[i * N + blockIdx.y * BLOCKSIZE + 3]...B[i * N + blockIdx.y * BLOCKSIZE + 31]。

测试结果为：886.60094864169 GFlops

# 共享内存
```
#include <stdio.h>
#include <stdlib.h>
#include <cublas_v2.h>
#include <device_launch_parameters.h>

const int M = 2048;
const int N = 2048;
const int K = 4096;
float alpha = 1.0f;
float beta = 0.5f;
const int ITER = 1000;

template<const int CHUNKSIZE>
__global__ void CacheGEMM(float* A, float* B, float* C, int M, int N, int K, float Alpha, float Beta)
{
    const unsigned int cRow = blockIdx.x;
    const unsigned int cCol = blockIdx.y;

    const unsigned int threadRow = threadIdx.x / CHUNKSIZE;
    const unsigned int threadCol = threadIdx.x % CHUNKSIZE;

    A += cRow * CHUNKSIZE * K;
    B += cCol * CHUNKSIZE;
    C += cRow * CHUNKSIZE * N + cCol * CHUNKSIZE;


    __shared__ float As[CHUNKSIZE * CHUNKSIZE];
    __shared__ float Bs[CHUNKSIZE * CHUNKSIZE];

    float tmp = 0.f;
    for (int blkIdx = 0; blkIdx < K; blkIdx += CHUNKSIZE)
    {
        As[threadRow * CHUNKSIZE + threadCol] = A[threadRow * K + threadCol];
        Bs[threadRow * CHUNKSIZE + threadCol] = B[threadRow * N + threadCol];

        __syncthreads();

        A += CHUNKSIZE;
        B += CHUNKSIZE * N;

        for (int dotIdx = 0; dotIdx < CHUNKSIZE; ++dotIdx)
        {
            tmp += As[threadRow * CHUNKSIZE + dotIdx] * Bs[dotIdx * CHUNKSIZE + threadCol];
        }

        __syncthreads();
    }
    C[threadRow * N + threadCol] = Alpha * tmp + Beta * C[threadRow * N + threadCol];
}

int main()
{
    cudaError_t cudaStat;

    float* d_a, * d_b, * d_c;
    cudaMalloc((void**)&d_a, M * K * sizeof(float));
    cudaMalloc((void**)&d_b, K * N * sizeof(float));
    cudaMalloc((void**)&d_c, M * N * sizeof(float));

    cudaEvent_t start, end;
    cudaEventCreate(&start);
    cudaEventCreate(&end);

    cudaEventRecord(start);

    dim3 blockDim(32*32);
    dim3 gridDim((M + 32 - 1) / 32, (N + 32 - 1) / 32);

    for (int i = 0; i < ITER; i++)
    {
        CacheGEMM <32><<<gridDim, blockDim>>> (d_a, d_b, d_c, M, N, K, alpha, beta);
    }
    cudaEventRecord(end);
    cudaEventSynchronize(end);

    float msec = 0.f;
    cudaEventElapsedTime(&msec, start, end);

    long long workfload = long long(M) * N * K * 2 * ITER;
    double avg_GFlops = (double(workfload) / 1e9) / (double(msec) / 1e3);
    printf_s("AveragePerformance %10.11f GFlops\n", avg_GFlops);

    cudaFree(d_a);
    cudaFree(d_b);
    cudaFree(d_c);
}
```

测试结果为：1266.87052978032 GFlops.

# 1D BlockTiling
```
#include <stdio.h>
#include <stdlib.h>
#include <cublas_v2.h>
#include <device_launch_parameters.h>

const int M = 2048;
const int N = 2048;
const int K = 4096;
float alpha = 1.0f;
float beta = 0.5f;
const int ITER = 1000;

const int BM = 64;
const int BN = 64;
const int BK = 8;
const int TM = 8;

template<const int BM, const int BN, const int BK, const int TM>
__global__ void CacheGEMM(float* A, float* B, float* C, int M, int N, int K, float Alpha, float Beta)
{
    const unsigned int cRow = blockIdx.y;
    const unsigned int cCol = blockIdx.x;

    float threadResult[TM]{ 0 };

    const int threadCol = threadIdx.x % BN;
    const int threadRow = threadIdx.x / BN;

    __shared__ float As[BM * BK];
    __shared__ float Bs[BK * BN];

    A += cRow * BM * K;
    B += cCol * BN;
    C += cRow * BM * N + cCol * BN;

    const unsigned int innerRowA = threadIdx.x / BK;
    const unsigned int innerColA = threadIdx.x % BK;
    const unsigned int innerRowB = threadIdx.x / BN;
    const unsigned int innerColB = threadIdx.x % BN;

    for (int blkIdx = 0; blkIdx < K; blkIdx += BK)
    {
        As[innerRowA * BK + innerColA] = A[innerRowA * K + innerColA];
        Bs[innerRowB * BN + innerColB] = B[innerRowB * N + innerColB];
        __syncthreads();

        A += BK;
        B += BK * N;

        for (int dotIdx = 0; dotIdx < BK; ++dotIdx)
        {
            float tmpB = Bs[dotIdx * BN + threadCol];
            for (int resIdx = 0; resIdx < TM; ++resIdx)
            {
                threadResult[resIdx] += As[(threadRow * TM + resIdx) * BK + dotIdx] * tmpB;
            }
        }
        __syncthreads();
    }

    for (int resIdx = 0; resIdx < TM; ++resIdx) {
        C[(threadRow * TM + resIdx) * N + threadCol] =
            Alpha * threadResult[resIdx] +
            Beta * C[(threadRow * TM + resIdx) * N + threadCol];
    }
}

int main()
{
    cudaError_t cudaStat;

    float* d_a, * d_b, * d_c;
    cudaMalloc((void**)&d_a, M * K * sizeof(float));
    cudaMalloc((void**)&d_b, K * N * sizeof(float));
    cudaMalloc((void**)&d_c, M * N * sizeof(float));

    cudaEvent_t start, end;
    cudaEventCreate(&start);
    cudaEventCreate(&end);

    cudaEventRecord(start);

    dim3 blockDim(BM * BN / TM);
    dim3 gridDim((N + BN - 1) / BN, (M + BM - 1) / BM);

    for (int i = 0; i < ITER; i++)
    {
        CacheGEMM <BM, BN, BK, TM><<<gridDim, blockDim>>> (d_a, d_b, d_c, M, N, K, alpha, beta);
    }
    cudaEventRecord(end);
    cudaEventSynchronize(end);

    float msec = 0.f;
    cudaEventElapsedTime(&msec, start, end);

    long long workfload = long long(M) * N * K * 2 * ITER;
    double avg_GFlops = (double(workfload) / 1e9) / (double(msec) / 1e3);
    printf_s("AveragePerformance %10.11f GFlops\n", avg_GFlops);

    cudaFree(d_a);
    cudaFree(d_b);
    cudaFree(d_c);
}
```
测试结果为：3900.39077644847 GFlops.

# 2D BlockTiling
```
#include <algorithm>
#include <cassert>
#include <cstdio>
#include <cstdlib>
#include <cublas_v2.h>
#include <cuda_runtime.h>

#define CEIL_DIV(M, N) ((M) + (N)-1) / (N)
typedef unsigned int uint;
const int M = 2048;
const int N = 2048;
const int K = 4096;
float alpha = 1.0f;
float beta = 0.5f;
const int ITER = 1000;


const int BM = 128;
const int BN = 128;
const int BK = 8;
const int TM = 8;
const int TN = 8;


__global__ void sgemm2DWarpTiling(int M, int N, int K, float alpha,
    const float* A, const float* B, float beta,
    float* C) {

    const uint cRow = blockIdx.y;
    const uint cCol = blockIdx.x;

    const uint totalResultsBlocktile = BM * BN;

    const uint numThreadsBlocktile = totalResultsBlocktile / (TM * TN);

    assert(numThreadsBlocktile == blockDim.x);


    const int threadCol = threadIdx.x % (BN / TN);
    const int threadRow = threadIdx.x / (BN / TN);


    __shared__ float As[BM * BK];
    __shared__ float Bs[BK * BN];

    A += cRow * BM * K;
    B += cCol * BN;
    C += cRow * BM * N + cCol * BN;

    const uint innerRowA = threadIdx.x / BK;
    const uint innerColA = threadIdx.x % BK;
    const uint strideA = numThreadsBlocktile / BK;
    const uint innerRowB = threadIdx.x / BN;
    const uint innerColB = threadIdx.x % BN;
    const uint strideB = numThreadsBlocktile / BN;

    float threadResults[TM * TN] = { 0.0 };
    float regM[TM] = { 0.0 };
    float regN[TN] = { 0.0 };

    for (uint bkIdx = 0; bkIdx < K; bkIdx += BK) {
        for (uint loadOffset = 0; loadOffset < BM; loadOffset += strideA) {
            As[(innerRowA + loadOffset) * BK + innerColA] =
                A[(innerRowA + loadOffset) * K + innerColA];
        }
        for (uint loadOffset = 0; loadOffset < BK; loadOffset += strideB) {
            Bs[(innerRowB + loadOffset) * BN + innerColB] =
                B[(innerRowB + loadOffset) * N + innerColB];
        }
        __syncthreads();

        A += BK;
        B += BK * N;


        for (uint dotIdx = 0; dotIdx < BK; ++dotIdx) {

            for (uint i = 0; i < TM; ++i) {
                regM[i] = As[(threadRow * TM + i) * BK + dotIdx];
            }
            for (uint i = 0; i < TN; ++i) {
                regN[i] = Bs[dotIdx * BN + threadCol * TN + i];
            }
            for (uint resIdxM = 0; resIdxM < TM; ++resIdxM) {
                for (uint resIdxN = 0; resIdxN < TN; ++resIdxN) {
                    threadResults[resIdxM * TN + resIdxN] +=
                        regM[resIdxM] * regN[resIdxN];
                }
            }
        }
        __syncthreads();
    }


    for (uint resIdxM = 0; resIdxM < TM; ++resIdxM) {
        for (uint resIdxN = 0; resIdxN < TN; ++resIdxN) {
            C[(threadRow * TM + resIdxM) * N + threadCol * TN + resIdxN] =
                alpha * threadResults[resIdxM * TN + resIdxN] +
                beta * C[(threadRow * TM + resIdxM) * N + threadCol * TN + resIdxN];
        }
    }
}
int main()
{
    cudaError_t cudaStat;

    float* d_a, * d_b, * d_c;
    cudaMalloc((void**)&d_a, M * K * sizeof(float));
    cudaMalloc((void**)&d_b, K * N * sizeof(float));
    cudaMalloc((void**)&d_c, M * N * sizeof(float));

    cudaEvent_t start, end;
    cudaEventCreate(&start);
    cudaEventCreate(&end);

    cudaEventRecord(start);

    dim3 blockDim((BM * BN) /(TM * TN));
    dim3 gridDim((N + BN - 1) / BN, (M + BM - 1) / BM);

    for (int i = 0; i < ITER; i++)
    {
        sgemm2DWarpTiling<<<gridDim, blockDim>>> (M, N, K, alpha, d_a, d_b, beta, d_c);
    }
    cudaEventRecord(end);
    cudaEventSynchronize(end);

    float msec = 0.f;
    cudaEventElapsedTime(&msec, start, end);

    long long workfload = long long(M) * N * K * 2 * ITER;
    double avg_GFlops = (double(workfload) / 1e9) / (double(msec) / 1e3);
    printf_s("AveragePerformance %10.11f GFlops\n", avg_GFlops);

    cudaFree(d_a);
    cudaFree(d_b);
    cudaFree(d_c);
}
```
测试结果：7441.72510003879 GFlops.

# 向量化访问

```
#include <algorithm>
#include <cassert>
#include <cstdio>
#include <cstdlib>
#include <cublas_v2.h>
#include <cuda_runtime.h>

#define CEIL_DIV(M, N) ((M) + (N)-1) / (N)
typedef unsigned int uint;
const int M = 2048;
const int N = 2048;
const int K = 4096;
float alpha = 1.0f;
float beta = 0.5f;
const int ITER = 1000;


const int BM = 128;
const int BN = 128;
const int BK = 8;
const int TM = 8;
const int TN = 8;


__global__ void sgemmVectorize(int M, int N, int K, float alpha, float* A,
    float* B, float beta, float* C) {
    const int cRow = blockIdx.y;
    const int cCol = blockIdx.x;

    __shared__ float As[BM * BK];
    __shared__ float Bs[BK * BN];

    A += cRow * BM * K;
    B += cCol * BN;
    C += cRow * BM * N + cCol * BN;

    const int innerRowA = threadIdx.x / (BK / 4);
    const int innerColA = threadIdx.x % (BK / 4);
    const int innerRowB = threadIdx.x / (BN / 4);
    const int innerColB = threadIdx.x % (BN / 4);

    float regM[TM]{ 0.f };
    float regN[TN]{ 0.f };
    float threadResults[TM * TN]{ 0.f };

    const uint threadRow = threadIdx.x / (BN / TN);
    const uint threadCol = threadIdx.x % (BN / TN);

    for (int blkIdx = 0; blkIdx < K; blkIdx += BK)
    {
        float4 tmp =
            reinterpret_cast<float4*>(&A[innerRowA * K + innerColA * 4])[0];
        As[(innerColA * 4 + 0) * BM + innerRowA] = tmp.x;
        As[(innerColA * 4 + 1) * BM + innerRowA] = tmp.y;
        As[(innerColA * 4 + 2) * BM + innerRowA] = tmp.z;
        As[(innerColA * 4 + 3) * BM + innerRowA] = tmp.w;

        reinterpret_cast<float4*>(&Bs[innerRowB * BN + innerColB * 4])[0] =
            reinterpret_cast<float4*>(&B[innerRowB * N + innerColB * 4])[0];
        __syncthreads();

        A += BK;
        B += BK * N;

        for (uint dotIdx = 0; dotIdx < BK; ++dotIdx)
        {
            for (int i = 0; i < TM; i++)
            {
                regM[i] = As[dotIdx * BM + threadRow * TM + i];
            }
            for (int i = 0; i < TN; i++)
            {
                regN[i] = Bs[dotIdx * BN + threadCol * TN + i];
            }

            for (uint resIdxM = 0; resIdxM < TM; ++resIdxM)
            {
                for (uint resIdxN = 0; resIdxN < TN; ++resIdxN)
                {
                    threadResults[resIdxM * TN + resIdxN] += regM[resIdxM] * regN[resIdxN];
                }
            }
        }
        __syncthreads();
    }
    for (uint resIdxM = 0; resIdxM < TM; ++resIdxM)
    {
        for (uint resIdxN = 0; resIdxN < TN; resIdxN += 4)
        {
            float4 tmpC = reinterpret_cast<float4*>(&C[(threadRow * TM + resIdxM) * N + threadCol * TN + resIdxN])[0];
            tmpC.x = alpha * threadResults[resIdxM * TN + resIdxN + 0] + beta * tmpC.x;
            tmpC.y = alpha * threadResults[resIdxM * TN + resIdxN + 1] + beta * tmpC.y;
            tmpC.z = alpha * threadResults[resIdxM * TN + resIdxN + 2] + beta * tmpC.z;
            tmpC.w = alpha * threadResults[resIdxM * TN + resIdxN + 3] + beta * tmpC.w;
            reinterpret_cast<float4*>(&C[(threadRow * TM + resIdxM) * N + threadCol * TN + resIdxN])[0] = tmpC;
        }
    }
}

int main()
{
    cudaError_t cudaStat;

    float* d_a, * d_b, * d_c;
    cudaMalloc((void**)&d_a, M * K * sizeof(float));
    cudaMalloc((void**)&d_b, K * N * sizeof(float));
    cudaMalloc((void**)&d_c, M * N * sizeof(float));

    cudaEvent_t start, end;
    cudaEventCreate(&start);
    cudaEventCreate(&end);

    cudaEventRecord(start);

    dim3 blockDim((BM * BN) / (TM * TN));
    dim3 gridDim((N + BN - 1) / BN, (M + BM - 1) / BM);

    for (int i = 0; i < ITER; i++)
    {
        sgemmVectorize << <gridDim, blockDim >> > (M, N, K, alpha, d_a, d_b, beta, d_c);
    }
    cudaEventRecord(end);
    cudaEventSynchronize(end);

    float msec = 0.f;
    cudaEventElapsedTime(&msec, start, end);

    long long workfload = long long(M) * N * K * 2 * ITER;
    double avg_GFlops = (double(workfload) / 1e9) / (double(msec) / 1e3);
    printf_s("AveragePerformance %10.11f GFlops\n", avg_GFlops);

    cudaFree(d_a);
    cudaFree(d_b);
    cudaFree(d_c);
}
```

测试结果：8815.78086482437 GFlops.
