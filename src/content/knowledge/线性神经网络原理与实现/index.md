---
title: "线性神经网络原理与实现"
description: "线性回归与softmax的实现"
date: "2024-02-26 20:18:11"
category: "AI / 深度学习"
originalCategory: "PyTorch学习"
track: "AI / Deep Learning"
level: intermediate
status: ready
published: true
minutes: 6
order: 1000
prerequisites: []
tags: ["PyTorch", "AI"]
photos: "banner.jpg"
source: "_posts"
---# 线性回归
## 线性回归的从零开始实现
### 生成数据集
根据带有噪声的线性模型构造一个数据集

$y=Xw+b+噪声$，其中噪声服从均值为0的正态分布，并将标准差设为$0.01$

```
import torch
from matplotlib_inline import backend_inline
from matplotlib import pyplot as plt

'''绘制基础函数部分省略，见PyTorch数据处理入门'''

def synthetic_data(w, b, num_examples):
    '''得到带有噪声的线性数据集'''
    X = torch.normal(0, 1, (num_examples, len(w)))
    y = torch.matmul(X, w)+b # 线性关系
    y += torch.normal(0, 0.01, y.shape)

    return X, y.reshape((-1, 1))

# 设置正确的w和b
true_w = torch.tensor([2.5, 3])
true_b = 3

# 生成特征与标签
features, labels = synthetic_data(true_w, true_b, 1000)

# 展现一号特征与标签的关系
set_figsize()

plt.scatter(features[:, 1].numpy(), labels.numpy(), 1)
```

### 读取数据集
- 训练模型时要对数据集进行遍历，每次抽取小批量样本，并使用它们来更新我们的模型
- 有必要定义一个函数，具备打乱数据集中的样本，并以小批量方式获取数据集
  - 将接受批量大小、特征矩阵和标签向量作为输入
  - 生成大小为batch_size的小批量，每个小批量包含一组特征和标签
```
import random

def data_iter(batch_size, features, labels):
    num_sample = len(labels)
    indices = list(range(num_sample))

    random.shuffle(indices)

    for i in range(0, num_sample, batch_size):
        batch_indices = torch.tensor(indices[i:min(i+batch_size, num_sample)])
        yield features[batch_indices], labels[batch_indices]
```
用以下代码对迭代器进行测试
```
batch_size = 10

for X, y in data_iter(batch_size, features, labels):
    print(X, '\n', y)
    break
```

### 初始化模型参数
在训练参数前，需要先有一些参数
```
w = torch.normal(0, 1, features[0].shape, requires_grad=True)
b = torch.zeros(1, requires_grad=True)
```

### 定义模型
```
def linreg(X, w, b):
    return torch.matmul(X,w)+b
```

### 定义损失函数
```
def loss(y_hat, y):
    return (y_hat - y.reshape(y_hat.shape))**2/2
```
需注意，这里对标签y的格式有调整，在本例batch_size=10时，y_hat.shape为([10])，而y.shape为([10,1])
### 定义优化方法
此处我们使用小批量随机梯度下降法优化

```
def sgd(params, lr, batch_size):
    with torch.no_grad():
        for param in params:
            param -= lr*param.grad/batch_size
            param.grad.zero_()
```

### 训练
```
lr = 0.1
net = linrag
num_epochs = 3

for epoch in range(num_epochs):
    for X,y in data_iter(batch_size, features, labels):
        l = loss(net(X, w, b), y)
        l.sum().backward()
        sgd([w, b], lr, batch_size)
    with torch.no_grad():
        train_l = loss(net(X, w, b), y)
        print(train_l.sum())

print(w, b)
```

## 线性回归的简单实现
### 生成数据集
```
import numpy as np
import torch
from torch.utils import data

true_w = torch.tensor([2, -3])
true_b = -1

def synthetic_data(w, b, num_examples):
    X = torch.normal(0, 1, (num_examples, len(w)))
    y = torch.matmul(X, w)+b

    y += torch.normal(0, 0.01, y.shape)
    return X, y.reshape((-1, 1))

num_examples = 1000

features, labels = synthetic_data(true_w, true_b, num_examples)
```
### 读取数据集
此处调用框架的API来实现
```
def load_array(data_arrays, batch_size, is_train=True):
    '''构造一个PyTorch数值迭代器'''

    dataset = data.TensorDataset(*data_arrays)
    return data.DataLoader(dataset, batch_size, shuffle=is_train)

batch_size = 10
data_iter = load_array((features, labels), batch_size)
```
### 定义模型
对于标准深度学习模型，我们可以使用框架的预定义好的层。

1. 我们先定义一个模型变量net，它是一个Sequential类的实例
2. Sequential类将多个层串联在一起
   1. 当给定输入数据时，Sequential实例将数据传入第一层
   2. 然后第一层的输出作为第二层的输入

```
from torch import nn

# 第一个参数指定输入特征形状，第二个参数指定输出特征形状
net = nn.Sequential(nn.Linear(2, 1))
```

### 初始化模型参数
- 深度学习框架通常有预定义方法来初始化参数
- 在这里，指定每个权重的参数应该从均值为0、标准差为0.01的正态分布中随机抽样，偏置参数将初始化为0

```
net[0].weight.data.normal_(0,0.01)
net[0].bias.data.fill_(0.)
```

### 定义损失函数
计算均方误差使用的是MSELoss类，其也称为平方$L_2$范数。默认情况下，返回所有样本损失的平均值

```
loss = nn.MSELoss()
```
### 定义优化算法
小批量随机梯度下降算法是一种优化神经网络的标准工具

当我们实例化SGD实例时，需要指定优化的参数和优化算法所需要的超参数

```
trainer = torch.optim.SGD(net.parameters(), lr = 0.03)
```

### 训练
在每轮里，我们将完整遍历一次数据集（train_data),不断地从中获得小批量的输入和相应的标签。

对于每个小批量：
1. 通过调用net(X)生成预测并计算损失
2. 通过反向传播来计算梯度
3. 通过调用优化器来更新模型参数

```
num_epochs = 3

for epoch in range(num_epochs):
    for X,y in data_iter:
        l = loss(net(X), y)
        trainer.zero_grad()
        l.backward()
        trainer.step()
    l = loss(net(features, labels))
    print(f'epoch{epoch+1}, loss{l:f}')

print(net[0].weight.data, net[0].bias.data[0])
```

补充，如果将小批量损失的平均值变为小批量损失的总量，应将学习率除以batch_size

# softmax回归
## 基本原理介绍
### 分类问题
- 特征：假设输入的是一张2*2像素的图像，每个像素点可以用标量表示，那么我们就拥有了四个特征
- 标签
  - 对于有一定自然顺序的分类，如{婴儿，少年，中年，老人}，我们可以采用{1，2，3，4}作为标签，并将这个问题转变为回归问题
  - 一般的分类问题并不与类别之间的自然顺序相关，可采用独热编码
### 网络架构
为了估计所有可能的条件概率，我们需要一个有多个输出的模型，每个类别对应一个输出

例如我们有四种特征和三个标签，那么我们需要12个标量表示权重，3个标量表示偏置
$$
o_1 = x_1w_{11}+x_2w_{12}+x_3w_{13}+b_1\\
o_2 = x_1w_{21}+x_2w_{22}+x_3w_{23}+b_2\\
o_3 = x_1w_{31}+x_2w_{32}+x_3w_{33}+b_3
$$

由于计算每个输出取决于所有输入，因此softmax回归的输出层也是全连接层

### softmax计算
我们需要优化参数以最大化观测数据的概率

首先，我们希望模型的输出$\hat y$可以作为属于类j的概率，然后选择具有最大输出值的类别$argmax_jy_j$，作为我们的预测

我们不能将未规范化的预测作为输出：
- 没有限制这些输出数值的总和为1
- 根据输入不同，输出可以是负值

要将输出视为概率，我们必须保证在任何数据上的输出都是非负的总和且总和为1

此外我们需要一个训练的目标函数，来激励模型精确地估计概率

softmax用以解决这些问题

$$
\hat y = softmax(o), 其中\hat y_j = \frac{exp(o_j)}{\sum_kexp(o_k)}
$$

### 交叉熵损失
#### 信息量
对于某一个事件，他发生的信息量与其发生的概率呈负相关，具体大小表现为$-log(p(x))$
#### 熵
对于一个分布$P$，分布$P$所有发生的事件的信息量的期望是该分布的熵
$$
H(x) = -\sum_j P(j)log(P(j))
$$
#### 相对熵
我们先假设目标分布$P$，真实无误地刻画了对应事件发生的概率

我们目前拥有分布$Q$，这是我们临时拥有的刻画事件发生概率的分布，是不准确的

相对熵描述了，完美的P相对临时的Q，所体现出的优势，即信息增益

其表达式为：
$$
D_{KL}(p||q) = \sum_{i=1}^{n}p(x_i)log(\frac{p(x_i)}{q(x_i)})
$$

#### 交叉熵
对相对熵进行变式：
$$
\sum_{i=1}^{n}p(x_i)log(\frac{p(x_i)}{q(x_i)}) = \sum_{i=1}^{n}p(x_i)log({p(x_i)}) - \sum_{i=1}^{n}p(x_i)log({q(x_i)})\\
= -H(p(x_i)) - \sum_{i=1}^{n}p(x_i)log({q(x_i)})
$$

等式的后一部分即为交叉熵

在机器学习中，我们需要对使predicts与labels尽量一致，即使相对熵尽可能的小，而等式的前一项固定（因为分布$P$固定），只能对交叉熵进行调整

#### softmax损失函数
以交叉熵为损失函数，具体表现为：
$$
l(\hat y, y) = -\sum_i^n y_ilog(\hat y_i)
$$

带入$\hat y_i$，对损失函数进行求导：
$$
-\sum_i^n y_ilog(\frac{exp(o_j)}{\sum_kexp(o_j)}) = -\sum_i^n y_ilog({exp(o_j)}) + \sum_i^ny_ilog(\sum_kexp(o_j))
$$

## 图像分类数据集
本次使用Fashion-MINST
```
%matplotlib inline
import torch
import torchvision
from torch.utils import data
from torchvision import transforms
```
### 获取数据集
```
trans = transforms.ToTensor()
mnist_train = torchvision.datasets.FashionMNIST(
    root = '../data', train=True, transform=trans, download = True
)
mnist_test = torchvision.datasets.FashionMNIST(
    root='../data', train = False, transform=trans, download = False
)
```
### 数据集的形式
```
# 展示训练集总数
len(mnist_train)

# 展示图像的形式
mnist_train[0][0].shape

# 分类标签
mnist_train[0][1]
```
### 获取文本标签
```
def get_fashion_mnist_labels(labels):
    '''返回文本标签'''
    text_labels = ['t-shirt', 'trouser', 'pullover', 'dress', 'coat', 'sandal', 'shirt', 'sneaker', 'bag', 'ankle boot']
    return [text_labels[int(i)] for i in labels]
```
### 可视化样本
```
from matplotlib import pyplot as plt
def show_images(imgs, num_rows, num_cols, titles = None, scale = 1.5):
    figsize = (num_cols*scale, num_rows*scale)
    _, axes = plt.subplots(num_rows, num_cols, figsize = figsize)
    axes = axes.flatten()

    for i, (ax, img) in enumerate(zip(axes, imgs)):
        if torch.is_tensor(img):
            # 图像张量
            ax.imshow(img.numpy())
        else:
            # PIL图像
            ax.imshow(img)
        ax.axes.get_xaxis().set_visible(False)
        ax.axes.get_yaxis().set_visible(False)
        if titles:
            ax.set_title(titles[i])
    return axes

from matplotlib_inline import backend_inline
def use_svg_display():
    backend_inline.set_matplotlib_formats('svg')
use_svg_display()

X, y = next(iter(data.DataLoader(mnist_train, batch_size = 10)))
show_images(X.reshape(10, 28, 28), 2, 9, titles=get_fashion_mnist_labels(y))
```
### 整合组件
下面实现数据迭代器，此外，这个函数还接受一个可选参数resize，将图像调整为另一种形状

```
def load_data_fashion_mnist(batch_size, resize=None):
    trans = [transforms.ToTensor()]
    if resize:
        trans.insert(0, transforms.Resize(resize))
    trans = transforms.Compose(trans)
    mnist_train = torchvision.datasets.FashionMNIST(root = '../data', train=True, transform=trans, download = True)
    mnist_test = torchvision.datasets.FashionMNIST(root='../data', train = False, transform=trans, download = False)

    return (data.DataLoader(mnist_train, batch_size, shuffle=True),data.DataLoader(mnist_test, batch_size, shuffle=False))
```
用以下代码进行测试：
```
train_iter, test_iter = load_data_fashion_mnist(32, 64)
for X,y in train_iter:
    print(X.shape)
    break
```
## softmax回归从零开始实现
### 获取数据集，得到迭代器
```
import torch
from torchvision import transforms
from torchvision import datasets
from torch.utils import data
# 获取数据集
def load_data_fashion_mnist(batch_size, resize=None):
    trans = [transforms.ToTensor()]

    if resize:
        trans.insert(0, transforms.Resize(resize))

    trans = transforms.Compose(trans)

    mnist_train = datasets.FashionMNIST('../data', train = True, transform=trans, download=True)
    mnist_test = datasets.FashionMNIST('../data', train=False, transform=trans, download=True)

    return (data.DataLoader(mnist_train, batch_size, shuffle=True), data.DataLoader(mnist_test, batch_size))

batch_size = 256
train_iter, test_iter = load_data_fashion_mnist(batch_size)
```

### 初始化模型参数
输入的特征有$1\times 28\times 28 = 784$，种类有10种
```
# 初始化模型参数
num_inputs = 1*28*28
num_outputs = 10

W = torch.normal(0, 0.01, size = (num_inputs, num_outputs), requires_grad=True)
b = torch.zeros(10, requires_grad=True)
```

### 定义softmax操作
```
def softmax(X):
    X_exp = torch.exp(X)
    X_exp_sum = X_exp.sum(1, keepdim=True)
    return X_exp/X_exp_sum
```
### 定义模型
```
# 定义模型
def net(X):
    return softmax(torch.matmul(X.reshape((-1, W.shape[0])), W)+b)
```
### 定义损失函数
$$
loss(y, \hat y) = -\sum_{j=1}^qy_jlog\hat y_j
$$
由于标签为独热编码，实际上该算式除了正确类别以外的项都消失了

程序实现如下：
1. 找到正确结果我们预测的发生概率
2. 计算$-logy_j$

```
def loss(y_hat, y):
    return -torch.log(y_hat[range(len(y_hat)), y])
```

### 分类精度
假设预测结果y_hat为矩阵，且第二个维度存储每个类别的预测分数
```
def accuracy(net, test_iter):
    '''返回准确率'''
    num_right = 0
    total_num = 0
    with torch.no_grad():
        for X,y in test_iter:
            y_hat = net(X)
            y_hat = y_hat.argmax(axis=1)

            cmp = y_hat.type(y.dtype) == y
            num_right += cmp.type(y_hat.dtype).sum()
            total_num += len(y)

    return num_right/total_num
```
### 训练
首先我们完成一轮训练的方法，该方法接收模型、迭代器、损失函数和优化函数
```
def train_epoch(net, train_iter, loss, updater):
    if isinstance(net, torch.nn.Module):
        net.train()

    loss_sum = 0
    num_examples = 0

    for X,y in train_iter:
        y_hat = net(X)
        l = loss(y_hat, y)

        loss_sum += l.sum()
        num_examples += len(y)

        if isinstance(updater, torch.optim.Optimizer):
            updater.zero_grad()
            l.mean().backward()
            updater.step()
        else :
            l.sum().backward()
            updater(X.shape[0])

    return loss_sum/num_examples
```
其次我们实现完整的训练过程，接收模型、训练迭代器、测试迭代器、轮次、损失函数、更新器
```
def train(net, train_iter, test_iter, loss, updater, num_epochs):
    for epoch in range(num_epochs):
        train_loss = train_epoch(net, train_iter, loss, updater)
        print(f'epoch {epoch+1}, train_loss {train_loss}')

        # 测试
        print(f'测试集准确率：{accuracy(net, test_iter)}')
```

训练，启动！
```
num_epochs = 10
train(net, train_iter, test_iter, loss, updater, num_epochs)
```
### 预测
```
def get_fashion_mnist_labels(labels):
    '''返回文本标签'''
    text_labels = ['t-shirt', 'trouser', 'pullover', 'dress', 'coat', 'sandal', 'shirt', 'sneaker', 'bag', 'ankle boot']
    return [text_labels[int(i)] for i in labels]
from matplotlib import pyplot as plt
def show_images(imgs, num_rows, num_cols, titles = None, scale = 1.5):
    figsize = (num_cols*scale, num_rows*scale)
    _, axes = plt.subplots(num_rows, num_cols, figsize = figsize)
    axes = axes.flatten()

    for i, (ax, img) in enumerate(zip(axes, imgs)):
        if torch.is_tensor(img):
            # 图像张量
            ax.imshow(img.numpy())
        else:
            # PIL图像
            ax.imshow(img)
        ax.axes.get_xaxis().set_visible(False)
        ax.axes.get_yaxis().set_visible(False)
        if titles:
            ax.set_title(titles[i])
    return axes

from matplotlib_inline import backend_inline
def use_svg_display():
    backend_inline.set_matplotlib_formats('svg')
use_svg_display()

def predict(net, test_iter, n=6):
    for X,y in test_iter:
        break

    trues = get_fashion_mnist_labels(y)
    preds = get_fashion_mnist_labels(net(X).argmax(axis=1))

    titles = [true+'\n'+pred for true, pred in zip(trues, preds)]
    show_images(X[0:n].reshape((n, 28, 28)), 1, n, titles=titles[0:n])

predict(net, test_iter)
```
## softmax回归的简洁实现
### 获取数据集
```
import torch
from torchvision import datasets
from torchvision import transforms
from torch.utils import data

batch_size = 256

def load_data_Fashion_MNIST(batch_size, resize = None):
    trans = [transforms.ToTensor()]

    if resize:
        trans.insert(0, transforms.Resize(resize))

    trans = transforms.Compose(trans)

    train_MNIST = datasets.FashionMNIST('../data', train=True, download=True, transform=trans)
    test_MNIST = datasets.FashionMNIST('../data', download=True, transform=trans)

    return data.DataLoader(train_MNIST, batch_size, shuffle = True), data.DataLoader(test_MNIST, batch_size)

train_iter, test_iter = load_data_Fashion_MNIST(batch_size)
```
### 初始化模型参数
```
from torch import nn
num_inputs = 1*28*28
num_outputs = 10

net = nn.Sequential(nn.Flatten(), nn.Linear(num_inputs, num_outputs))

def init_weights(m):
    if type(m) == nn.Linear:
        nn.init.normal_(m.weight, std=0.01)

net.apply(init_weights);
```
### 重新看待softmax实现
在上一节实现中，我们虽然按照理论顺序进行计算，但没有考虑到指数带来的不稳定性
$$
loss(y, \hat y) = -\sum_{j=1}^qy_jlog\hat y_j\\
\hat y_j = \frac{exp(o_j)}{\sum_kexp(o_k)}
$$
首先，如果某些$o_k$因为还未规范化，出现过大的情况，将导致上溢

于是优化方法是对所有$o_k-max(o_k)$，表现为：
$$
\hat y_j = \frac{exp(o_j-max(o_k))}{\sum_kexp(o_k-max(o_k))}
$$
此时，又担心$exp((o_k)-max(o_k))$部分出现过小的情况，对应指数结果出现接近于0的值，受精度限制，导致下溢

为了解决反向传播过程中可能出现的数值稳定性，干脆将相关内容带入损失函数，得到：
$$
log(\hat y_j) = o_j - max(o_k) - log(\sum_kexp(o_k-max(o_k)))
$$
在这种情况下，我们将没有规范化的预测传入损失函数，实质上同时计算softmax及其对数，解决了反向传播可能出现的问题

代码：
```
loss = nn.CrossEntropyLoss(reduction='none')
```

### 优化算法
随机梯度下降
```
trainer = torch.optim.SGD(net.parameters(), lr = 0.1)
```
### 训练
```
def train_epoch(net, train_iter, loss, updater):
    loss_sum = 0
    num_examples = 0
    for X,y in train_iter:
        y_hat = net(X)
        l = loss(y_hat, y)

        loss_sum += l.sum()
        num_examples += y.numel()

        updater.zero_grad()
        l.mean().backward()
        updater.step()
    return loss_sum/num_examples

def accuracy(net, test_iter):
    right_num = 0
    total_num = 0

    for X,y in test_iter:
        y_hat = net(X)
        y_hat = y_hat.argmax(axis = 1)

        cmp = y_hat.type(y.dtype) == y
        right_num += cmp.type(y_hat.dtype).sum()
        total_num += y.numel()

    return right_num/total_num

num_epochs = 10
def train(net, train_iter, test_iter, loss, updater, num_epochs):
    for epoch in range(num_epochs):
        loss_mean = train_epoch(net, train_iter, loss, updater)
        print(f'epoch:{epoch+1}, loss:{loss_mean}')
        print(f'test:{accuracy(net, test_iter)}')


train(net, train_iter, test_iter, loss, trainer, 10)
```
