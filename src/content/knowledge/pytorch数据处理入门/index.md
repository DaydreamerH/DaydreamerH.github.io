---
title: "PyTorch数据处理入门"
description: "张量的创建与运算操作"
date: "2024-02-26 11:37:19"
category: "AI / 深度学习"
originalCategory: "PyTorch学习"
track: "AI / Deep Learning"
level: intermediate
status: ready
published: true
minutes: 5
order: 1000
prerequisites: []
tags: ["PyTorch", "AI"]
photos: "banner.jpg"
source: "_posts"
---# PyTorch数据操作入门
## 张量
### 什么是张量
张量表示一个由数值组成的数组，这个数组可能有多个维度。
- 具有一个轴的张量对应数学上的向量
- 具有两个轴的张量对应数学上的矩阵

### 张量的创建与基础特性
我们可以使用arange创建一个行向量x
```
import torch

x = torch.arange(12)
print(x)
```
我们可以通过张量的shape属性访问张量的形状
```
x.shape

# 输出torch.Size([12])
```
如果只想知道张量中元素的总数，即形状的所有元素乘积，可以检查它的大小
```
x.numel()

# 输出12
```
改变一个张量的形状而不改变元素数量和元素值，可以调用reshape函数
```
x = x.reshape(4,3)
```
不需要通过手动指定每个维度来改变形状，也就是说，如果我们的目标现状是（高度，宽度），那么已知高度可以自动计算出宽度
```
x = x.reshape(4,-1)
x = x.reshape(-1,3)
```
有时我们想要使用全0或全1等其余常量，或从特定分布中随机采样的数字来初始化矩阵

例如我们可以创建一个形状为(3,2,4)的张量，其所有元素都为0或者其所有元素都为1
```
x = torch.zeros(3,2,4)

y = torch.ones(3,2,4)
```
我们也可以从某个特定的概率分布中随机采样来得到张量中每个元素的值
```
# 从正态分布中采样（4，3）张量

x = torch.randn(4,3)
```
我们还可以通过python列表来初始化张量

```
list = [[1, 2, 3], [4, 5, 6]]

x = torch.tensor(list)
```

### 张量的运算
- 按元素运算
```
x = torch.tensor([2., 3., 4.])
y = torch.tensor([3., 2., 1.])

print(x+y)
print(x-y)
print(x*y)
print(x/y)
print(x**y)
print(torch.exp(x))
```
- 按线性代数运算
  - 向量点积
  - 矩阵乘法
- 张量连接：端对端叠起来形成一个更大的张量
  - 提供张量列表
  - 给出沿哪个轴连接
```
X = torch.arange(12, dtype = torch.float32).reshape(3, 4)
Y = torch.randn(3, 4)

print(torch.cat((X, Y), dim = 0)) # 沿轴0连接，得到（6，4）张量

print(torch.cat((X, Y),dim = 1))  # 沿轴1连接，得到（3，8）张量
```
- 逻辑运算
  - 对于每一个位置，如果X和Y在该位置相同则对应True，否则False
```
print(X == Y)
```
- 对张量中的所有元素求和，会产生一个单元素张量
```
X.sum()
```

### 广播
未来满足形状不同的两个张量能够按元素操作，我们应该使用广播机制
- 通过适当复制元素来扩展一个或两个数组，以便在转换之后，两个张量具有相同的形状
- 对生成的数组执行按元素操作

```
x = torch.tensor([1,2,3])
y = torch.tensor([[4],[5],[6]])
print(x+y)
# x和y均广播为（3，3）张量，x将行复制到列，y将列复制到行
```

### 索引和切片
```
X = torch.arange(12).reshape(3, 4)
print(X)

# 取第2个元素
print(X[1])

# 取最后一个元素
print(X[-1])

# 取第1个元素的第2一个元素
print(X[0, 1])

# 取除了第一个元素以外的元素组成的张量
print(X[1: 4])

# 取第一、二行元素，并修改所有轴1元素为0
X[0:2, :] = 0

print(X)
```

### 节省内存

执行一些操作可能导致为结果新分配内存
```
X = torch.arange(12).reshape(3, 4)
Y = torch.arange(5, 17).reshape(3,4)

before = id(Y)

Y = Y + X

after = id(Y)

print(before, after)

# 首先计算结果
# 随后分配内存空间存储
# 最后将Y指向新的内存空间
```
如上的操作可能是不可取的
- 在机器学习中，我们可能有数百兆的参数，并且在一秒内多次更新所有参数。通常情况下我们希望原地执行更新。
- 如果我们不原地更新，其他引用仍然会指向旧的内存位置，这样我们的某些代码可能会无意中引用旧的参数

执行原地更新的操作非常简单：Y[:] = expression

例如：
```
Z = torch.zeros_like(X)

before_Z = id(Z)

Z[:] = X + Y

after_Z = id(Z)

print(before_Z, after_Z)

# 此时Z没有更改指向的内存

Z += Z

after_Z = id(Z)

print(before_Z, after_Z)

# 此时同样没有更改指向的内存
```
### 转为其他Python对象
```
A = X.numpy()

B = torch.tensor(A)

print(type(A), type(B))
```

### 总结
深度学习存储和操作数据的主要接口是张量。

## 数据预处理
本处以pandas包为例
### 读取数据集
```
import os
import pandas as pd

os.makedirs(os.path.join('..', 'data'), exist_ok=True) # 创建data文件夹

# 设置文件路径，创建csv文件
data_file = os.path.join('..', 'data', 'house_tiny.csv')

# 打开文件，并输入内容；在写入文件时，不要为了工整加入不合适的空格
with open(data_file, 'w') as f:
    f.write("NumRooms, Alley, Price\n")
    f.write("NA,Pave,127500\n")
    f.write("2,NA,10600\n")
    f.write("4,NA,178100\n")
    f.write("NA,NA,1400000\n")

# 读取csv文件
data = pd.read_csv(data_file)

print(data)
```
### 处理缺失值
首先对数据集进行划分，分为inputs，outputs
```
inputs, outputs = data.iloc[:, 0:2], data.iloc[:, 2]
```
对于连续数值列的缺失，我们利用该列其余数值的平均值进行替换
```
inputs = inputs.fillna(inputs.mean())
print(inputs)
```
对于类别值或离散值，将NaN视为一个类别。

在此例中，将Pave与NaN分别视为两类，创建两列，用0或1标注类别

```
inputs = pd.get_dummies(inputs, dummy_na = True)
print(inputs)
```
### 转换成张量格式
```
X, y = torch.tensor(inputs.values), torch.tensors(outputs.values)
print(X, y)
```

### 补充：删除NaN最多的列
```
nan_num = inputs.isna().sum()
nan_num_max_col = nan_num.idxmax()

inputs = inputs.drop(columns = nan_num_max_col)

print(inputs)
```

## 线性代数
- 标量
- 向量
### 矩阵
```
# 创建矩阵
A = torch.arange(20).reshape(4, 5)
print(A)
# 矩阵的转置
B = A.T
print(B)
# 对称矩阵
B = torch.tensor([[1, 2, 3], [2, 0, 4], [3, 4, 5]])
print(B==B.T)
```
### 降维
我们可以对任意张量进行的一个有用的操作是计算其元素的和
- 默认情况下调用求和函数会沿所有的轴降低维度，使其变为一个标量
- 还可以指定张量沿哪一个轴通过求和降低维度
```
A = torch.arange(20, dtype = torch.float32).reshape(4, 5)
print(A)
# 沿所有轴降低维度
print(A.sum())
print(A.sum(axis = [0, 1]))

# 沿指定轴降低维度
print(A.sum(axis = 0))
print(A.sum(axis = 1))
```

与求和相关的量是平均值，我们通过将总和除以元素总数来计算平均值
- 计算平均值的函数也可以沿指定轴降低维度
```
# 平均值
print(A.mean())
print(A.sum()/A.numel())

# 平均值沿指定轴降低维度
print(A.mean(axis = 0), A.sum(axis = 0)/A.shape[0])
print(A.mean(axis = 1), A.sum(axis = 1)/A.shape[1])
```
有时在调用函数来计算总和或平均值时保持轴数不变会很有用
```
# 非降维求和
print(A.sum(axis = 0, keepdims = True))
print(A.sum(axis = 1, keepdims = True))

# 沿某个轴计算A的元素的累积总和，可以调用cumsum函数
print(A.cumsum(axis = 1))
```

### 点积
已知向量$x$, $y$，二者的点积为$x^Ty$
```
y = torch.ones(4, dtype=torch.float32)

x = torch.arange(4, dtype=torch.float32)

print(x, y, torch.dot(x,y), torch.sum(x*y))

# 注意运算执行顺序
print(x*y.sum(), (x*y).sum())
```
### 矩阵-向量积
已有矩阵$A \in R^{m\times n}$，向量$x \in R^n$

将矩阵看作：
$$
A = \left[
\begin{matrix}
a^T_1\\
a^T_2\\
.\\
.\\
.\\
a^T_m
\end{matrix}
\right]
$$
那么矩阵向量积为
$$
Ax = \left[
\begin{matrix}
a_1^Tx\\
a_2^Tx\\
.\\
.\\
.\\
a_m^Tx
\end{matrix}
\right]
$$
```
A = torch.arange(20, dtype=torch.float32).reshape(5, 4)

x = torch.arange(4, dtype=torch.float32)

print(torch.mv(A, x))
```

### 矩阵-矩阵乘法
```
A = torch.arange(20, dtype=torch.float32).reshape(5, 4)

B = torch.arange(20, dtype=torch.float32).reshape(4, 5)

print(torch.mm(A, B))
```

### 范数
非严谨地说，向量的范数标识一个向量有多大，指分量的大小而非维度

范数具有三个性质
1. 按常数因子缩放向量的所有元素，其范数也会按相同常数因子的绝对值缩放
$$
f(\alpha x) = |\alpha|f(x)
$$
2. $f(x+y)\leq f(x)+f(y)$
3. $f(x)\geq 0$

$L_2$范数是向量元素平方和的平方根
```
u = torch.tensor([3., -4.])
print(torch.norm(u))
```
$L_1$范数是向量元素的绝对值之和
```
print(torch.abs(u).sum())
```
## 微积分
### 导数的编程表达与matplotlib绘图
```
from matplotlib_inline import backend_inline
from matplotlib import pyplot as plt
import numpy as np

def f(x):
    return 3*x**2 - 4*x

def numerical_limit(f, x, h):
    return (f(x+h)-f(x))/h


h = 0.1
for i in range(5):
    print(numerical_limit(f, x=1, h = h))
    h/=10


# 绘制
def use_svg_display():
    backend_inline.set_matplotlib_formats('svg')

def set_figsize(figsize=(5,5)):
    use_svg_display()
    plt.rcParams['figure.figsize'] = figsize

def set_axes(axes, xlabel, ylabel, xlim, ylim, xscale, yscale, legend):
    axes.set_xlabel(xlabel)
    axes.set_ylabel(ylabel)
    axes.set_xscale(xscale)
    axes.set_yscale(yscale)
    axes.set_xlim(xlim)
    axes.set_ylim(ylim)
    if legend:
        axes.legend(legend)
    axes.grid()

def plot(X, Y=None, xlabel=None, ylabel=None, legend=None, xlim=None, ylim=None, xscale='linear', yscale='linear', fmts=('-','m--', 'g-', 'r:'),figsize=(5,5),axes = None):
    if legend is None:
        legend = []

    set_figsize(figsize)

    axes = axes if axes else plt.gca()

    def has_one_axis(X):
        return(hasattr(X, "ndim") and X.ndim == 1 or isinstance(X, list) and not hasattr(X[0], "__len__"))

    if has_one_axis(X):
        X=[X]
    if Y is None:
        X, Y = [[]]* len(X),X
    elif has_one_axis(Y):
        Y = [Y]
    if(len(X)!=len(Y)):
        X = X * len(Y)
    axes.cla()
    for x, y, fmt in zip(X, Y, fmts):
        if len(X):
            axes.plot(x, y, fmt)
        else :
            axes.plot(y, fmt)

    set_axes(axes=axes, xlabel=xlabel, ylabel=ylabel,xlim=xlim,ylim=ylim,xscale=xscale,yscale=yscale,legend=legend)

x = np.arange(0, 3, 0.1)
plot(x, [f(x), 2*x-3], xlabel='x', ylabel='f(x)', legend=['f(x)', 'Tangent Line(x=1)'])])
```
### 偏导数、梯度、链式法则

## 自动微分
### 基本示例
我们对$y = 2x^Tx$，关于列向量$x$求导
```
import torch


x = torch.arange(4.0)

print(x)

# 在计算y关于x的梯度之前，需要一个区域来存储梯度
# 我们应避免在每次求导时都分配新的内存

# 分配区域
x.requires_grad_(True)
# 等效于 x = torch.arange(4., requires_grad=True)

print(x.grad)

y = torch.dot(x,x)*2
print(y)

# 进行反向传播，并展示梯度
y.backward()
print(x.grad)

# 验证计算结果
print(x.grad == 4*x)
```
在默认情况下，PyTorch会累积梯度，有时我们需要清除之前的值
```
x.grad.zero_()
y = x.sum()
y.backward()
x.grad()
```
### 非标量变量的反向传播
- 当y不是标量时，向量y关于向量x的导数的最自然解释是一个矩阵
- 我们通常会试图计算一批训练样本中每个组成部分的损失函数的导数
```
x.grad.zero_()
y = x*x
y.backward(torch.ones(len(x)))
# 等效于y.sum().backward()
x.grad
```
### 分离计算
考虑这样一个情景，$y$是$x$的函数，$z$是$y$与$x$的函数
- 我们只想要将$y$视作常数
- 只考虑$x$在被$y$计算后发挥作用
```
# 以y=x*x, z=y*x为例
x.grad_zero_()

y = x*x
u = y.detach
z = u*x

z.sum.backward()
print(x.grad == u)
```
### Python控制流的梯度计算
使用自动微分的好处在于，即使构建函数需要通过Python的控制流，我们也可以得到计算结果

## 概率论基础
