---
title: "多层感知机"
description: "最简单的深度神经网络，多层感知机原理与实现；正则化与暂退法的原理与实现；训练中的注意事项。"
date: "2024-02-29 19:29:51"
category: "AI / 深度学习"
originalCategory: "PyTorch学习"
track: "AI / Deep Learning"
level: intermediate
status: ready
published: true
minutes: 11
order: 1000
prerequisites: []
tags: ["AI", "PyTorch"]
photos: "banner.jpg"
source: "_posts"
---
# 多层感知机
## 隐藏层
- 线性模型的弊端：线性意味着单调假设：任何特征的增大都会导致模型输出的增大或者模型输出的减小
### 在网络中加入隐藏层
最简单的方法是将许多全连接层堆叠在一起，每一层都输出到其上一层，直到生成最后的输出
- 前$L - 1$层看作表示，最后一层看作线性预测器
- 这种架构通常称为多层感知机

### 从线性到非线性
我们通过矩阵$X \in R^{n\times d}$开表示有$n$个样本的小批量，每个样本具有$d$个输入特征。

对于具有$h$个隐藏单元的单隐藏层多层感知机，用$H \in R^{n \times h}$表示隐藏层的输出，称为隐藏表示。

由于隐藏层和输出层是全连接的，所以我们有隐藏层权重$W^{(1)} \in R^{d\times h}$，隐藏层偏置$b^{(1)} \in R^{1\times h}$和输出层权重$W^{(2)}\in R^{h\times q}$，输出层偏置$b^{(2)} \in R^{1\times q}$

单隐藏层多层感知机的计算如下：
$$
H = XW^{(1)} + b^{(1)}\\
O = HW^{(2)} + b^{(2)}
$$

~~这不能说是毫无作用，只能说是屁用没有~~

一方面，导致参数过多，另一方面，隐藏层的输入是由仿射函数给出，输出的仍然是仿射函数，而线性模型已经能够表达一切仿射函数。

$$
O = HW^{(2)} + b^{(2)} = (XW^{(1)} + b^{(1)})W^{(2)} + b^{(2)} = XW + b
$$

为了发挥多层架构的潜力，我们还需要一个关键因素：在仿射变换之前对每个隐藏单元应用非线性的激活函数。

一般来说，有了激活函数，就不可能再将我们的多层感知机退化成线性模型。

## 激活函数
激活函数通过计算加权合并加上偏置来确定神经元是否应该被激活，他们将输入信号转换为输出的可微运算。

### ReLU函数
修正线性单元，提供了一种简单的非线性变换，给定元素$x$，ReLU函数被定义为该元素与0中的最大值：
$$
ReLU(x) = max(x, 0)
$$
当输入为0时，默认使用左侧的导数，即0。

但我们可以忽略这种情况，原因在于输入可能永远都不是0。

> 如果微妙的边界条件很重要，我们很可能在研究数学而非工程。

ReLU的好处在于求导表现好，要么让参数消失，要么让参数通过。

参数化ReLU函数：添加一个线性项，即是参数是负的，某些信息仍可能通过
$$
pReLU(x) = max(0, x) + \alpha min(0, x)
$$

### sigmoid函数
对于一个定义域在R上的输入，sigmoid函数将输入变换为区间$(0, 1)$上的输出。

因此sigmoid函数通常称为挤压函数，将范围$(-inf, inf)$上的任意输入压缩到区间$(0, 1)$上的某个值：
$$
sigmoid(x) = \frac{1}{1+exp(-x)}
$$

现在，sigmoid函数在隐藏层已经越来越少被使用，在大部分情况下，它被ReLU函数取代；sigmoid函数可以在时序控制中发生作用。

该函数的导数为：
$$
\frac{d}{dx}sigmoid(x) = \frac{exp(-x)}{(1+exp(-x))^2} = sigmoid(x)(1-sigmoid(x))
$$

### tanh函数
与sigmoid函数相似，tanh（双曲正切）函数也能将输入压缩转换到$(0,1)$区间。
$$
tanh(x) = \frac{1-exp(-2x)}{1+exp(-2x)}
$$

tanh函数的导数为：
$$
\frac{d}{dx}tanh(x) = 1 - tanh^2(x)
$$

# 绘制曲线
本节可以使用d2l库的帮助，迅速绘制需要的损失变化情况
```
from matplotlib_inline import backend_inline
from matplotlib import pyplot as plt

def use_svg_display(): #save
    backend_inline.set_matplotlib_formats('svg')

class Animator:  #save
    """在动画中绘制数据"""
    def __init__(self, xlabel=None, ylabel=None, legend=None, xlim=None,
                 ylim=None, xscale='linear', yscale='linear',
                 fmts=('-', 'm--', 'g-.', 'r:'), nrows=1, ncols=1,
                 figsize=(3.5, 2.5)):
        # 增量地绘制多条线
        if legend is None:
            legend = []
        use_svg_display()
        self.fig, self.axes = plt.subplots(nrows, ncols, figsize=figsize)
        if nrows * ncols == 1:
            self.axes = [self.axes, ]
        # 使用lambda函数捕获参数
        self.config_axes = lambda: d2l.set_axes(
            self.axes[0], xlabel, ylabel, xlim, ylim, xscale, yscale, legend)
        self.X, self.Y, self.fmts = None, None, fmts

    def add(self, x, y):
        # 向图表中添加多个数据点
        if not hasattr(y, "__len__"):
            y = [y]
        n = len(y)
        if not hasattr(x, "__len__"):
            x = [x] * n
        if not self.X:
            self.X = [[] for _ in range(n)]
        if not self.Y:
            self.Y = [[] for _ in range(n)]
        for i, (a, b) in enumerate(zip(x, y)):
            if a is not None and b is not None:
                self.X[i].append(a)
                self.Y[i].append(b)
        self.axes[0].cla()
        for x, y, fmt in zip(self.X, self.Y, self.fmts):
            self.axes[0].plot(x, y, fmt)
        self.config_axes()

        plt.draw()
        plt.pause(0.001)

        display.display(self.fig)
        display.clear_output(wait=True)
    def show(self):
        display.display(self.fig)

'''使用实例，对应高维线性回归简洁实现处'''
# 初始化
animator = Animator(xlabel='epoch', ylabel='loss', yscale='log', xlim=[1, num_epochs], ylim=[1e-3, 1e2], legend=['train', 'test'])
# 展示内容
animator.show()

animator.add(epoch+1, (train_loss/n_train,test_loss/n_test))
```

# 多层感知机的从零开始实现
为了与之前的softmax相比较，我们将继续使用Fashion-MNIST

```
import torch
from torchvision import datasets
from torch.utils import data
from torchvision import transforms

def load_data_fashion_mnist(batch_size, resize=None):
    trans = [transforms.ToTensor()]

    if resize:
        trans.insert(0, transforms.Resize(resize))

    trans = transforms.Compose(trans)

    mnist_train = datasets.FashionMNIST('../data', train=True, transform=trans, download=True)
    mnist_test = datasets.FashionMNIST('../data', train=False, transform=trans, download=True)

    return data.DataLoader(mnist_train, batch_size, shuffle=True), data.DataLoader(mnist_test, batch_size)

batch_size = 256

train_iter, test_iter = load_data_fashion_mnist(batch_size)
```
## 初始化模型参数
我们将层数和隐藏单元这两个变量都视为超参数。通常选择2的若干次幂作为层的宽度

我们用几个张量来表示参数，注意，对于每一个层我们都要记录一个权重矩阵和一个偏置向量

```
num_inputs = 784
num_hiddens = 256
num_outputs = 10

W1 = nn.Parameter(torch.randn((num_inputs, num_hiddens), requires_grad=True)*0.01)
b1 = nn.Parameter(torch.zeros(num_hiddens, requires_grad=True))
W2 = nn.Parameter(torch.randn((num_hiddens, num_outputs), requires_grad=True)*0.01)
b2 = nn.Parameter(torch.zeros(num_outputs, requires_grad=True))
```

## 实现激活函数
在这里实现激活函数
```
def relu(X):
    a = torch.zeros_like(X)
    return torch.max(a, X)
```

## 实现模型
注意对输入展开
```
def net(X):
    X = X.reshape(-1, num_inputs)
    H = relu(X@W1+b1)
    return (H@W2+b2)
```
## 损失函数
```
loss = nn.CrossEntropyLoss(reduction='none')
```

## 训练
```
def train_epoch(net, train_iter, loss, updater):
    total_loss = 0
    num_examples = 0
    for X,y in train_iter:
        y_hat = net(X)
        l = loss(y_hat, y)

        total_loss += l.sum()
        num_examples += len(y)

        updater.zero_grad()
        l.mean().backward()
        updater.step()

    return total_loss/num_examples

def test(net, test_iter):
    num_right = 0
    num_examples = 0
    with torch.no_grad():
        for X,y in test_iter:
            num_examples += len(y)
            y_hat = net(X)
            if len(y_hat)>1 and y_hat.shape[1]>1:
                y_hat = y_hat.argmax(axis = 1)
            cmp = y_hat.type(y.dtype) == y
            num_right += cmp.type(y_hat.dtype).sum()

    return num_right / num_examples

def train(net, train_iter, test_iter, loss, updater, num_epochs):
    for epoch in range(num_epochs):
        mean_loss = train_epoch(net, train_iter, loss, updater)
        print(f'epoch {epoch+1}, mean_loss {mean_loss}')
        print(test(net, test_iter))

num_epochs = 10
train(net, train_iter, test_iter, loss, updater, num_epochs)
```
# 多层感知机的简单实现
```
import torch
from torch import nn
```
## 模型
```
num_inputs = 28*28
num_hiddens = 256
num_outputs = 10

net = nn.Sequential(nn.Flatten(),nn.Linear(num_inputs, num_hiddens), nn.ReLU(), nn.Linear(num_hiddens, num_outputs))

def init_weights(m):
    if type(m) == nn.Linear:
        nn.init.normal_(m.weight, std=0.01)

net.apply(init_weights);
```
## 训练
与以往一致

# 模型选择、欠拟合与过拟合
机器学习的目标是发现模式，这些模式捕获到了训练集潜在的总体规律。
- 将模型在训练数据上拟合的比在潜在分布中更接近的现象称为过拟合
- 用于对抗过拟合的技术称为正则化

## 训练误差与泛化误差
- 训练误差是指模型在训练数据集上计算得到的误差
- 泛化误差是指模型从原始样本的分布中抽取的无限多数据样本时，模型的期望误差

### 统计学习理论
在监督学习场景中，我们假设训练数据和测试数据都是从相同的分布中独立抽取。

即独立同分布假设。

## 模型复杂性
影响模型泛化的因素：
1. 可调整参数的数量
2. 参数的取值
3. 训练样本的数量

- 当我们有简单的模型和大量的数据时，我们期望泛化误差与训练误差相接近
- 当我们有更复杂的模型和更少的样本时，我们预计训练误差会减小，但泛化误差会增大

## 模型选择
在机器学习中，我们通常在评估几个候选模型后选择最终的模型，这个过程叫做模型选择。

### 验证集
原则上，在我们确定所有的超参数之前，我们不希望用到测试集

- 如果我们在模型选择的过程中使用了测试数据，可能会有过拟合测试数据的风险
- 我们绝不能依靠测试数据进行模型选择，因为一旦过拟合测试数据，我们没有办法判断真实情况

我们将数据分成三份，训练集、测试集、验证集。也就是说，选择模型时依赖于验证机，而对单个模型进行泛化评价才使用测试集。

### k折交叉验证
当训练数据稀缺，无法满足一个合适的验证集时，采用该方法。

将原始训练数据分成K个不重叠的子集，执行K次模型训练和验证，每次在K-1个子集上训练，并在剩余一个子集上验证

通过对K次实验的结果取平均值来估计训练误差和泛化误差

## 多项式回归探索拟合程度
```
import math
import numpy as np
import torch
from torch import nn
```
### 生成数据集
我们将使用以下三阶多项式来生成训练数据于测试数据的标签：
$$
y = 5+1.2x-3.4\frac{x^2}{2!}+5.6\frac{x^3}{3!}+\epsilon, \epsilon\in N(0, 0.1^2)
$$
在优化过程中，我们通常希望避免非常大的梯度值或损失值，这就是将特征从$x^i$调整成$\frac{x^i}{i!}$的原因
```
max_degree = 20 # 多项式的最大阶数
n_train, n_test = 100, 100 # 训练数据集和测试数据集的大小
true_w = np.zeros(max_degree)
true_w[0:4] = np.array([5, 1.2, -3.4, 5.6])

features = np.random.normal(size = (n_train+n_test, 1))
np.random.shuffle(features)
poly_features = np.power(features, np.arange(max_degree).reshape(1, -1))
for i in range(max_degree):
    poly_features[:, i] /= math.gamma(i+1)

labels = np.dot(poly_features, true_w)
labels += np.random.normal(scale = 0.1,size=labels.shape)
```
转换为tensor格式
```
true_w, features, poly_features, labels = [torch.tensor(x, dtype=torch.float32) for x in [true_w, features, poly_features, labels]]
```
### 对模型进行训练和测试
首先我们实现一个函数来评估模型在给定数据集上的损失
```
def evaluate_loss(net, data_iter, loss):
    total_loss = 0
    num_examples = 0
    for X,y in data_iter:
        y_hat = net(X)
        y = y.reshape(y_hat.shape)
        l = loss(y_hat, y)

        total_loss += l.sum()
        num_examples += len(y)
    return total_loss/num_examples
```
定义训练函数
```
from torch.utils import data

def load_array(data_arrays, batch_size, is_train=True):
    dataset = data.TensorDataset(*data_arrays)
    return data.DataLoader(dataset, batch_size, shuffle=is_train)

def train(train_features, test_features, train_labels, test_labels, num_epochs = 400):
    loss = nn.MSELoss(reduction='none')
    # 偏置在多项式处实现
    net = nn.Sequential(nn.Linear(train_features.shape[1], 1, bias=False))
    batch_size = min(10, train_features.shape[0])

    train_iter = load_array((train_features, train_labels.reshape((-1,1))), batch_size, True)
    test_iter = load_array((test_features, test_labels.reshape((-1,1))),batch_size,False)

    trainer = torch.optim.SGD(net.parameters(), lr = 0.01)

    for epoch in range(num_epochs):
        train_loss = 0
        train_examples = 0
        for X,y in train_iter:
            y_hat = net(X)
            y = y.reshape(y_hat.shape)
            l = loss(y_hat, y)

            train_loss += l.sum()
            train_examples += len(y)

            trainer.zero_grad()
            l.mean().backward()
            trainer.step()
        with torch.no_grad():
            print(f'epoch:{epoch+1}, train_loss:{train_loss/train_examples}, test_loss: {evaluate_loss(net, test_iter, loss)}')
    print(f'weight: {net[0].weight.data.numpy()}')
    print(f'weight: {net[0].weight.data.numpy()}')
```
### 三阶多项式函数拟合（正常）
从poly_features中取出相应训练特征，每个样本有四个特征，分别对应：$1, x, \frac{x^2}{2}, \frac{x^3}{3!}$.
```
train(poly_features[:n_train, 0:4], poly_features[n_train:, 0:4], labels[:n_train], labels[n_train:])
```

### 线性函数拟合（欠拟合）
```
train(poly_features[:n_train, :2], poly_features[n_train:, :2], labels[:n_train], labels[n_train:])
```

### 高阶多项式函数拟合（过拟合）
```
train(poly_features[:n_train, :], poly_features[n_train:, :], labels[:n_train], labels[n_train:], num_epochs=1500)
```

# 权重衰减
本节将介绍正则化模型的技术，用以缓解过拟合问题
## 范数与权重衰减
在训练参数化机器学习模型时，权重衰减是使用最广泛的正则化技术，它通常也称为$L_2$正则化。

这项技术通过函数与0的距离来度量函数的复杂度。

一种简单的方法是通过线性函数$f(x) = w^Tx$中的权重向量的某个范数来度量其复杂度。如将其范数作为惩罚项添加到最小化损失中，将原来训练的目标改为最小化预测损失和惩罚项之和。

原损失函数为：
$$
L(w,b)=\frac{1}{n}\sum \frac{1}{2}[w^Tx^{(i)}+b-y^{(i)}]^2
$$

调整后为：
$$
L(w,b)+\frac{\lambda}{2}||w||^2
$$
其中，$\lambda$为正则化常数，来描述新的额外惩罚的损失影响。

通常，网络输出层的偏置项不会被正则化，在神经网络中的不同层是否对偏置进行处罚有不同的选择。

## 高维线性回归
我们将通过一个简单的例子来演示权重衰减
```
import torch
from torch import nn
```
首先，我们生成一组数据，函数为：
$$
y = 0.05+\sum_{i=1}^d0.01x_i+\epsilon, 其中\epsilon~N(0,0.01^2)
$$

我们选择标签是关于输入的线性函数，标签同时被均值为0，标准差为0.01的高斯噪声破坏。为了使过拟合更明显，我们将问题的位数增加到d=200，并使用一个只包含20个样本的小训练集。

```
n_train, n_test, num_inputs, batch_size = 20, 100, 200, 5

true_w, true_b = torch.ones((num_inputs, 1))*0.01, 0.05

def synthetic_data(W, b, num_examples):
    features = torch.normal(0, 0.1, size=(num_examples, W.shape[0]))
    labels = torch.matmul(features, W)+b
    return (features, labels.reshape((-1, 1)))

from torch.utils import data

def load_array(data_array, batch_size, is_train=True):
    dataset = data.TensorDataset(*data_array)
    return data.DataLoader(dataset, batch_size, is_train)

train_data = synthetic_data(true_w, true_b, n_train)
train_iter = load_array(train_data, batch_size)

test_data = synthetic_data(true_w, true_b, n_test)
test_iter = load_array(test_data, batch_size, False)
```
### 从零开始实现
#### 初始化模型参数
```
def init_params():
    w = torch.normal(0,1, size = (num_inputs, 1), requires_grad=True)
    b = torch.zeros(1,requires_grad=True)
    return w,b
```
#### 定义$L_2$范数惩罚
此处不定义正则化常数
```
def l2_penalty(w):
    return torch.sum(w.pow(2))/2
```
#### 定义训练代码实现
```
def loss(y_hat, y):
    return (y_hat-y).pow(2)/2

def sgd(params, lr, batch_size):
    with torch.no_grad():
        for param in params:
            param -= lr*param.grad/batch_size
            param.grad.zero_()

def train(train_iter, test_iter, num_epochs, lambd, batch_size):
    w, b = init_params()
    lr = 0.01
    for epoch in range(num_epochs):
        total_loss = 0
        n_train = 0
        for X,y in train_iter:
            y_hat = torch.matmul(X, w)+b
            y = y.reshape(y_hat.shape)
            l = loss(y_hat, y) + lambd*l2_penalty(w)

            total_loss += l.sum()
            n_train += len(y)

            l.sum().backward()
            sgd([w,b], lr, batch_size)
        print(f'epoch:{epoch+1}, train_loss:{total_loss/n_train}')

        with torch.no_grad():
            test_loss = 0
            n_test = 0

            for X,y in test_iter:
                y_hat = torch.matmul(X, w)+b
                y = y.reshape(y_hat.shape)
                l = loss(y_hat, y) + lambd*l2_penalty(w)

                test_loss += l.sum()
                n_test += len(y)

            print(f'test_loss:{test_loss/n_test}')
```
#### 忽略正则化直接训练
```
train(train_iter, test_iter, 100, 0, batch_size)
```
出现了严重的过拟合

#### 使用权重衰减
```
train(train_iter, test_iter, 100, 3, batch_size)
```
### 简洁实现
为了便于使用权重衰减，深度学习框架将权重衰减集成于优化算法，以便于任何损失函数结合使用。
```
def train_concise(wd):
    net = nn.Sequential(nn.Linear(num_inputs, 1))
    for param in net.parameters():
        param.data.normal_()
    loss = nn.MSELoss(reduction='none')
    num_epochs, lr = 100,0.03
    trainer = torch.optim.SGD(
        [{'params':net[0].weight, 'weight_decay':wd},
        {'params':net[0].bias}],lr = lr)
    for epoch in range(num_epochs):
        train_loss, test_loss = 0, 0
        for X,y in train_iter:
            l = loss(net(X), y)
            train_loss += l.sum()
            trainer.zero_grad()
            l.mean().backward()
            trainer.step()
        with torch.no_grad():
            for X,y in test_iter:
                l = loss(net(X), y)
                test_loss += l.sum()
            print(f'epoch:{epoch+1},train:{train_loss/n_train},test:{test_loss/n_test}')
```
# 暂退法
- 当面对更多的特征而样本不足时，线性模型往往会过拟合
- 给出更多的样本而不是特征时，线性模型不会过拟合

但是由于线性模型没有考虑特征之间的相互作用，其泛化的可靠性是有代价的。

泛化性和灵活性之间的这种基本权衡被描述为偏差-方差权衡

## 什么是好的预测模型
我们期待好的预测模型在未知的数据上有好的表现。

为了缩小训练性能与测试性能之间的差距，应该以简单的模型为目标。
- 简单性以较小维度的形式展现
- 简单性的另一种角度是平滑性，即函数不应该对其输入的微小变化敏感

### 暂退法的过程
在训练一个有多层的深度网络时，注入噪声只会在输入-输出映射上增强平滑性。

暂退法在前向传播过程中，计算每一内部层的同时注入噪声。

在表面上看，是在训练过程中丢弃一些神经元。

注入噪声可以采用无偏的方式，即每一层的期望等于没有噪声时的值。
- 毕晓普将高斯噪声添加到线性模型的输入中，具体实现为在每次训练迭代中，他将从均值为0的分布$\epsilon~N(0,x^2)$采样，并加到输入$x$中，产生扰动点的期望恰为$x$
- 标准暂退法正则化中，通过按保留的节点的分数进行规范化来消除每一层的偏差。如下：
    $$
    h^{'} = \begin{cases}
        0, 概率为p\\
        \frac{h}{1-p}, 其他情况
    \end{cases}
    $$
## 实践中的暂退法
通常我们在测试时不使用暂退法。

除非想要估计神经网络预测的“不确定性”：如果通过许多不同的暂退法遮盖后得到的预测结果都是一致的，那么我们可以说网络表现更稳定。

### 从零开始实现
#### 定义单层暂退法函数
要实现单层的暂退法函数，我们从均匀分布$U[0,1]$中抽取样本，样本数与这层神经网络的维度一致。

保留那些对应样本大于$p$的节点，把剩下的节点丢掉。

```
import torch
from torch import nn

def dropout_layer(X, drop_out):
    assert 0<=drop_out<=1

    if drop_out == 1:
        return torch.zeros_like(X.shape)
    elif drop_out == 0:
        return X

    mask = (torch.rand(X.shape)>drop_out).type(X.dtype)
    return mask*X/(1-drop_out)
```
#### 定义模型参数
我们定义两个隐藏层的多层感知机，每个隐藏层包含256个隐藏单元（使用Fashion-MNIST数据集）
```
num_inputs, num_hiddens1, num_hiddens2, num_outputs = 784, 256, 256, 10
```
#### 定义模型
我们可以将暂退法应用于每个隐藏层的输出，并且可以为每一层分别设置暂退概率。

常见的技巧是，在靠近输入层的地方设置较低的暂退概率。

注意，暂退法只在训练期间有效。
```
drop_out1, drop_out2 = 0.2, 0.5

class Net(nn.Module):
    def __init__(self, num_inputs, num_hiddens1, num_hiddens2, num_outputs, is_training = True):
        super(Net, self).__init__()
        self.num_inputs = num_inputs
        self.training = is_training
        self.lin1 = nn.Linear(num_inputs, num_hiddens1)
        self.lin2 = nn.Linear(num_hiddens1, num_hiddens2)
        self.lin3 = nn.Linear(num_hiddens2, num_outputs)
        self.relu = nn.ReLU()

    def forward(self, X):
        H1 = self.relu(self.lin1(X))
        if self.training == True:
            H1 = dropout_layer(H1, drop_out1)
        H2 = self.relu(self.lin2(X))
        if self.training == True:
            H2 = dropout_layer(H2, drop_out2)
        return self.lin3(H2)

net = Net(num_inputs, num_hiddens1, num_hiddens2, num_outputs)
```
#### 训练和测试
```
from d2l import torch as d2l
animator = Animator(xlabel='epoch', ylabel='loss', yscale='log', xlim=[1, num_epochs], ylim=[1e-1, 1], legend=['train', 'test'])
from IPython import display
trainer = torch.optim.SGD(net.parameters(), lr=0.5)
loss = nn.CrossEntropyLoss(reduction='none')
for epoch in range(num_epochs):
    train_loss = 0
    test_loss = 0
    n_train = 0
    n_test = 0
    net.training = True
    for X,y in train_iter:
        l = loss(net(X), y)
        train_loss += l.sum()
        n_train += len(y)
        trainer.zero_grad()
        l.mean().backward()
        trainer.step()
    with torch.no_grad():
        net.training = False
        for X,y in test_iter:
            l = loss(net(X), y)
            test_loss += l.sum()
            n_test += len(y)
        animator.show()
        animator.add(epoch+1, (train_loss/n_train,test_loss/n_test))
```
### 简洁实现
```
net = nn.Sequential(
    nn.Flatten(),
    nn.Linear(num_inputs, num_hiddens1),
    nn.ReLU(),
    nn.Dropout(drop_out1),
    nn.Linear(num_hiddens1, num_hiddens2),
    nn.ReLU(),
    nn.Dropout(drop_out2),
    nn.Linear(num_hiddens2, num_outputs),
)
def init_weight(m):
    if m.type == nn.Linear:
        nn.init.normal_(m.weight, std=0.01)
net.apply(init_weight)
```
其余部分与前文一致

# 前向传播、反向传播与计算图
## 前向传播
前向传播是指，按顺序计算和存储神经网络中每层的结果。

为简单起见，我们假设输入样本时$x\in R^d$，并且隐藏层不包含偏置项。

则中间变量为：
$$
z = W^{(1)}x
$$
其中，$W^{(1)}\in R^{h\times d}$为隐藏层的权重参数，将中间变量通过激活函数，得到隐藏层激活向量：
$$
h=\phi(z)
$$
设输出层权重参数为$W^{(2)}\in R^{q\times h}$，则输出向量为：
$$
o = W^{(2)} h
$$
单个数据样本的损失项为：
$$
L = l(o,y)
$$
正则化项为：
$$
s=\frac{\lambda}{2}(||W^{(1)}||^2_F+||W^{(2)}||^2_F)
$$
最后模型在给定样本上的正则化损失为：
$$
J = L+s
$$
在下面的讨论中，将$J$称为目标函数。

## 反向传播
反向传播指的是计算神经网络参数梯度的方法。

在本例中，我们的目标是计算$\frac{\partial J}{\partial W^{(1)}}$与$\frac{\partial J}{\partial W^{(2)}}$.

第一步，我们首先计算目标函数关于损失项与正则化项的梯度：
$$
\frac{\partial J}{\partial L}=1,\frac{\partial J}{\partial s} = 1
$$
接下来，计算目标函数关于输出变量$o$的梯度：
$$
\frac{\partial J}{\partial o}=prod(\frac{\partial J}{\partial L},\frac{\partial L}{\partial o})=\frac{\partial L}{\partial o}\in R^q
$$
然后计算正则化项关于两个参数的梯度：
$$
\frac{\partial s}{\partial W^{(1)}}=\lambda W^{(1)}, \frac{\partial s}{\partial W^{(2)}}=\lambda W^{(2)}
$$
随后我们计算最接近输出层的模型参数的梯度$\frac{\partial J}{\partial W^{(2)}}$:
$$
\frac{\partial J}{\partial W^{(2)}}=prod(\frac{\partial J}{\partial o},\frac{\partial o}{\partial W^{(2)}})+prod(\frac{\partial J}{\partial s},\frac{\partial s}{\partial W^{(2)}}) = \frac{\partial J}{\partial o}h^T+\lambda W^{(2)}
$$
同理：
$$
\frac{\partial J}{\partial W^{(1)}} = \frac{\partial J}{\partial z}x^T+\lambda W^{(1)}
$$

## 训练神经网络
在训练神经网络时，前向传播和反向传播相互依赖。
- 对于前向传播，我们沿着依赖的方向遍历计算图并计算其路径上的所有变量
- 随后将这些用于反向传播。

在训练神经网络时，在初始化模型参数后，我们交替使用前向传播和反向传播，利用反向传播给出的梯度来更新模型错那湖是。

注意，反向传播重复利用前向传播中存储的中间值，以避免重复计算，其带来的影响之一时我们需要保留中间值，直到反向传播完成。

这是训练比单纯的预测更需要内存或显存的原因之一。

# 数值稳定性和模型初始化
## 梯度消失和梯度爆炸
### 梯度消失
曾经sigmoid函数很流行，因为它类似于阈值函数。然而，它却是导致梯度消失的常见原因。
```
import torch
from d2l import torch as d2l

x = torch.arange(-8., 8., 0.1, requires_grad=True)
y = torch.sigmoid(x)
y.backward(torch.ones_like(x))

d2l.plot(x.detach().numpy(), [y.detach().numpy(), x.grad.numpy()],legend=['sigmoid', 'gradient'], figsize=(4.5, 2.5))
```
观察其梯度函数可知，当输入过大或过小时，其梯度接近于0；当网络有很多层时，我们必须非常小心，否则某一层可能会切断梯度。

如今更稳定的ReLU函数成为选择~~虽然从神经科学的角度看起来不态合理~~
### 梯度爆炸
梯度爆炸的原因在于深度网络初始化不合适，没有机会让梯度下降优化器收敛。
### 打破对称性
每一层的隐藏单元之间具有排列对称性。

利用暂退法正则化可以打破这种对称性。
## 参数初始化
解决或缓解上述问题的一种方法是参数初始化，优化期间的适当正则化。
- 默认初始化
- Xavier初始化
