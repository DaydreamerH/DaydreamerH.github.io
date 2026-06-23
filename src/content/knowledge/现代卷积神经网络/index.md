---
title: "现代卷积神经网络"
description: "AlexNet VGG NiN GoogLeNet BatchNorm ResNet原理介绍与实现"
date: "2024-03-07 16:18:02"
category: "AI / 深度学习"
originalCategory: "PyTorch学习"
track: "AI / Deep Learning"
level: intermediate
status: ready
published: true
minutes: 9
order: 1000
prerequisites: []
tags: ["AI", "PyTorch", "cv"]
photos: "banner.jpg"
source: "_posts"
---
# 深度卷积神经网络（AlexNet）
2012年，AlexNet首次证明了学习到的特征可以超越手动设计的特征。

AlexNet的架构与LeNet非常相似。

在这里我们介绍的架构是稍微精简版的AlexNet，去除了当年需要两个小型GPU同时运算的设计特点。

AlexNet与LeNet的差异：
- AlexNet比相对较小的LeNet-5要深得多。AlexNet由8层组成：5个卷积层、2个全连接隐藏层和1个全连接输出层。
- AlexNet使用ReLU而不是sigmoid作为其激活函数

> 考虑到电脑捞逼，又不想花钱，所以这里用resize后的Fashion-MNIST做数据集。
## 模型设计
- 在AlexNet的第一层，卷积窗口的形状是$11\times 11$。
  - 由于ImageNet中大多数图像高宽都比MNIST图像的大十倍以上，因此需要一个更大的卷积窗口来捕获目标
- AlexNet的卷积通道数是LeNet的十倍
- 在最后一个卷积层后有两个全连接层，分别有4096个输出，这两个全连接层接近1GB的参数
  - 由于早期GPU显存有限，原始的AlexNet采用了双数据流设计。
## 激活函数
AlexNet将激活函数改为ReLU，一方面函数的计算更简单；另一方面，当使用不同的参数初始化时，ReLU激活函数使训练模型更加容易。

## 容量控制和预处理
AlexNet通过暂退法控制全连接层的模型复杂度，而LeNet只使用了权重衰减。

为了进一步扩增数据，AlexNet在训练时增加了大量的图像增强数据，如翻转、裁切和变色，这使得模型更健壮，更大的样本有效地减少了过拟合。

## 模型搭建
```
import torch
from torch import nn
from d2l import torch as d2l

net = nn.Sequential(
    nn.Conv2d(1, 96, kernel_size=11, stride=4, padding=1), nn.ReLU(),
    nn.MaxPool2d(kernel_size=3, stride=2),
    nn.Conv2d(96, 256, kernel_size=5, padding=2), nn.ReLU(),
    nn.MaxPool2d(kernel_size=3, stride=2),
    nn.Conv2d(256, 384, kernel_size=3, padding=1), nn.ReLU(),
    nn.Conv2d(384, 384, kernel_size=3, padding=1), nn.ReLU(),
    nn.Conv2d(384, 256, kernel_size=3, stride=2), nn.ReLU(),
    nn.Flatten(),
    nn.Linear(6400, 4096), nn.ReLU(),
    nn.Dropout(p=0.5),
    nn.Linear(4096, 4096), nn.ReLU(),
    nn.Dropout(p=0.5),
    nn.Linear(4096, 10)
)
```
检查：
```
X = torch.rand(size=(1,1,224,224))
for layer in net:
    X = layer(X)
    print(layer.__class__.__name__, X.shape)
```
## 读取数据集
```
from torchvision import transforms
from torchvision import datasets
from torch.utils import data
def load_data_fashion_mnist(batch_size, resize=None):
    trans = [transforms.ToTensor()]

    if resize:
        trans.insert(0, transforms.Resize(resize))

    trans = transforms.Compose(trans)

    mnist_train = datasets.FashionMNIST('../data', train=True, transform=trans, download=True)
    mnist_test = datasets.FashionMNIST('../data', train=False, transform=trans, download=True)

    return data.DataLoader(mnist_train, batch_size, shuffle=True), data.DataLoader(mnist_test, batch_size)

batch_size = 128
train_iter, test_iter = load_data_fashion_mnist(batch_size, 224)
```
## 训练AlexNet

# 使用块的网络（VGG）
虽然AlexNet证明深层网络卓有成效，但它没有提供一个通用的模板来指导，后续的研究人员设计新的网络。

## VGG块
经典卷积神经网络的基本组成部分是下面这个序列：
- 带填充以保持分辨率的卷积层
- 非线性激活函数
- 汇聚层

而一个VGG块与之类似，由一系列卷积层组成，后面再加上用于空间降采样的最大汇聚层。

在最初的VGG论文中，作者使用了带有$3\times 3$卷积核，填充为1的卷积层，以及带有$2\times 2$汇聚窗口、步幅为2的最大汇聚层。

VGG块的实现：
```
def vgg_block(num_convs, in_channels, out_channels):
    layers = []
    for _ in range(num_convs):
        layers.append(nn.Conv2d(in_channels, out_channels, kernel_size=3, padding=1))
        layers.append(nn.ReLU())
        in_channels = out_channels
    layer.append(nn.MaxPool2d(kernel_size=2, stride=2))
    return nn.Sequential(*layers)
```

## VGG网络
与AlexNet、LeNet一样，VGG网络可以分为两部分，第一部分主要由卷积层和汇聚层组成，第二部分由全连接组成。

原始VGG网络有5个卷积块，其中前2个块各包含一个卷积层，后3个块各包含两个卷积层。

第一块有64个输出通道，后续每个块都将输出通道数翻倍，直到输出通道数达到512.

由于该网络使用8个卷积层和3个全连接层，因此它通常被称为VGG-11。
```
def vgg(conv_arch):
    conv_blks = []
    in_channels = 1

    for (num_convs, out_channels) in conv_arch:
        conv_blks.append(vgg_block(num_convs, in_channels, out_channels))
        in_channels = out_channels

    return nn.Sequential(
        *conv_blks, nn.Flatten(),
        nn.Linear(out_channels*7*7, 4096), nn.ReLU(), nn.Dropout(p=0.5),
        nn.Linear(4096, 4096), nn.ReLU(), nn.Dropout(p=0.5),
        nn.Linear(4096, 10)
    )

conv_arch=((1, 64), (1, 128), (2, 256), (2, 512), (2, 512))
net = vgg(conv_arch)
```
检查：
```
X = torch.rand(size=(1,1,224,224))
for layer in net:
    X = layer(X)
    print(layer.__class__.__name__, X.shape)
```
## 训练
由于VGG-11比AlexNet的计算量更大，所以我们将缩减通道数，将其用于Fashion-MNIST数据集。
```
from d2l import torch as d2l

ratio = 4
small_conv_arch = [(pair[0], pair[1]//ratio)for pair in conv_arch]
net = vgg(small_conv_arch)

train_iter, test_iter = d2l.load_data_fashion_mnist(batch_size, resize=224)

def train(net, train_iter, test_iter, num_epochs, device, lr):
    loss = nn.CrossEntropyLoss()
    optimizer = torch.optim.SGD(net.parameters(), lr=lr)

    def init_weights(m):
        if type(m) == nn.Linear or type(m) == nn.Conv2d:
            nn.init.xavier_uniform_(m.weight)

    net.apply(init_weights)
    net.to(device)

    for epoch in range(num_epochs):
        train_loss = 0
        n_train = 0
        for X,y in train_iter:
            X, y = X.to(device), y.to(device)
            y_hat = net(X)
            l = loss(y_hat, y)

            optimizer.zero_grad()
            l.backward()
            optimizer.step()

            train_loss += l*X.shape[0]
            n_train += X.shape[0]

        print(f'epoch: {epoch+1}')
        print(f'train loss: {train_loss/n_train}')
        with torch.no_grad():
            test_acc = 0
            n_test = 0
            for X,y in test_iter:
                X, y = X.to(device), y.to(device)
                y_hat = net(X)
                y_hat = y_hat.argmax(axis = 1)
                cmp = y_hat.type(y.dtype) == y
                test_acc += cmp.type(y.dtype).sum()
                n_test += len(y)
            print(f'test acc: {test_acc/n_test}')

train(net, train_iter, test_iter, num_epochs, 'cuda:0', lr)
```


# 网络中的网络（NiN）
LeNet、AlexNet和VGG都有共同的设计模式，通过一系列的卷积层与汇聚层来提取空间结构特征；然后通过全连接层对特征表征进行处理。

其中AlexNet与VGG的改进主要在于如何扩大和加深这两个模块。

有时可以想象在早期使用全连接层，但如果这样做，可能会完全放弃表征的空间结构。

NiN提供了一个非常简单的方法：在每个像素的通道上分别使用多层感知机。

## NiN块
卷积层的输入和输出由四维张量组成，张量的每个轴分别对应样本、通道、高度和宽度。

全连接层的输入和输出通常是分别对应于样本和特征的二位张量。

NiN的想法是在每个像素的位置应用一个全连接层，如果将权重连接到每个空间位置，我们可以将其视为$1\times 1$的卷积层。

从另一个角度看，是将空间维度的每个像素视为单个样本，将通道视为不同的维度。

NiN块以一个普通卷积层开始，后面两个是$1\times 1$卷积层，这两层充当带有ReLU激活函数的逐像素全连接层

```
def nin_block(in_channels, out_channels, kernel_size, strides, padding):
    return nn.Sequential(
        nn.Conv2d(in_channels, out_channels, kernel_size=kernel_size, stride=strides, padding=padding),
        nn.ReLU(),
        nn.Conv2d(out_channels, out_channels, kernel_size=1),
        nn.ReLU(),
        nn.Conv2d(out_channels, out_channels, kernel_size=1),
        nn.ReLU()
    )
```
## NiN网络
NiN网络使用窗口形状为$11\times 11$，$5\times 5$和$3\times 3$的卷积层，输出通道数与AlexNet相同，而每个NiN块后有一个最大汇聚层，汇聚窗口形状为$3\times 3$，步幅为2。

NiN与AlexNet之间的一个显著区别是NiN完全取消了全连接层，而使用了一个NiN块，其输出通道等于标签类别数，最后放一个全局汇聚层，生成一个对数几率。

NiN设计的一个优点是，它显著降低了模型所需的参数，然而这种设计有时会增加训练模型的时间。

```
net = nn.Sequential(
    nin_block(1, 96, 11, 4, 0),
    nn.MaxPool2d(kernel_size=3, stride=2),
    nin_block(96, 256, kernel_size=5, strides=1, padding=1),
    nn.MaxPool2d(kernel_size=3, stride=2),
    nin_block(256, 384, kernel_size=3, strides=1, padding=1),
    nn.MaxPool2d(kernel_size=3, stride=2),
    nin_block(384, 10, kernel_size=3, padding=1, strides=1),
    nn.AdaptiveAvgPool2d((1, 1)),
    nn.Flatten()
)
```

## 训练模型
~~与以前一样，不想写了~~

# 含并行连接的网络（GoogLeNet）
GoogLeNet论文的重点是解决了多大的卷积核最合适的问题。

该论文的观点是，有时使用大小不同的卷积核组合是有利的。

## Inception块
Inception块由4条并写路径组成。
- 前3条路径使用窗口大小为$1\times 1$、$3\times 3$、$5\times 5$的卷积层，从不同的空间大小中提取信息
- 中间的两条路径在输入上执行$1\times 1$卷积。以减小通道数，从而降低模型复杂度
- 第四条路径使用$3\times 3$最大汇聚层，然后使用$1\times 1$卷积层来改变通道数

实现如下：
```
class Inception(nn.Module):
    def __init__(self, in_channels, c1, c2, c3, c4, **kwargs):
        super().__init__()

        self.p1 = nn.Conv2d(in_channels, c1, kernel_size=1)
        self.p2 = nn.Sequential(
            nn.Conv2d(in_channels, c2[0], kernel_size=1),
            nn.ReLU(),
            nn.Conv2d(c2[0], c2[1], kernel_size=3, padding=1),
            nn.ReLU()
        )
        self.p3 = nn.Sequential(
            nn.Conv2d(in_channels, c3[0], kernel_size=1),
            nn.ReLU(),
            nn.Conv2d(c3[0], c3[1], kernel_size=5, padding=2),
            nn.ReLU()
        )
        self.p4 = nn.Sequential(
            nn.MaxPool2d(kernel_size=3, padding=1, stride=1),
            nn.Conv2d(in_channels, c4, kernel_size=1),
            nn.ReLU()
        )
    def forward(self, X):
        p1_result = self.p1(X)
        p2_result = self.p2(X)
        p3_result = self.p3(X)
        p4_result = self.p4(X)

        return torch.cat((p1_result, p2_result, p3_result, p4_result), dim=1)
```

## GooLeNet模型
一共使用9个Inception块和全局平均汇聚层的堆叠类生成其估计值。

Inception块之间的最大汇聚层可以降低维度。

现在我们逐一实现GoogLeNet的每个模块，第一个模块使用64个通道、$7\times 7$卷积层。
```
b1 = nn.Sequential(
    nn.Conv2d(1, 64, kernel_size=7, stride=2, padding=3),
    nn.ReLU(),
    nn.MaxPool2d(kernel_size=3, stride=2, padding=1)
)
```
第二个模块使用两个卷积层：第一个卷积层是64个通道、$1\times 1$卷积层；第二个卷积层使用将通道增加为3倍的$3\times 3$卷积层。
```
b2 = nn.Sequential(
    nn.Conv2d(64, 64, kernel_size=1),
    nn.ReLU(),
    nn.Conv2d(64, 192, kernel_size=3, padding=1),
    nn.ReLU(),
    nn.MaxPool2d(kernel_size=3, stride=2, padding=1)
)
```

第三个模块串联两个完整的Inception块。

- 第一个Inception块
  - 输出通道数为：64，128，32，32，总共为256个通道
  - 第二条路径和第三条路径首先将输入通道数分别减少到$\frac{1}{2}$和$\frac{1}{12}$
- 第二个Inception块
  - 输出通道数为：128，192，96，64，总共为480个通道
  - 第二条路径和第三条路径首先将输入通道分别减少到$\frac{1}{2}$和$\frac{1}{8}$

```
b3 = nn.Sequential(
    Inception(192, 64, (96, 128), (16, 32), 32),
    Inception(256, 128, (128, 192), (32, 96), 64),
    nn.MaxPool2d(kernel_size=3, stride=2, padding=1)
)
```
第四个模块，串联了5个Inception块，其输出通道分别为：192+208+48+64=512，160+224+64+64=512，128+256+64+64=512，112+288+64+64=528，256+320+128+128=832.

这些路径的通道数的分配与第三个模块相似，输出通道数最多的是含$3\times 3$卷积层的第二条路径，其次是仅含$1\times 1$卷积层的第一条路径，最后是含$5\times 5$卷积层的第三条路径和含$3\times 3$最大汇聚层的第四条路径。

其中第二条路径和第三条路径都会先按比例减少通道数，这些比例在各个Inception块中略有不同。
```
b4 = nn.Sequential(
    Inception(480, 192, (96, 208), (16, 48), 64),
    Inception(512, 160, (112, 224), (24, 64), 64),
    Inception(512, 128, (128, 256), (26, 64), 64),
    Inception(512, 112, (144, 288), (32, 64), 64),
    Inception(528, 256, (160, 320), (32, 128), 128),
    nn.MaxPool2d(kernel_size=3, stride=2, padding=1)
)
```

第五个模块包含输出通道数为256+320+128+128=832和384+384+128+128=1024.

由于第五个模块后面紧跟输出层，所以该模块使用了全局平均汇聚层。
```
b5 = nn.Sequential(
    Inception(832, 256, (160, 320), (32, 128), 128),
    Inception(832, 384, (192, 384), (48, 128), 128),
    nn.AdaptiveAvgPool2d((1,1)),
    nn.Flatten()
)

net = nn.Sequential(b1,b2,b3,b4,b5, nn.Linear(1024, 10))
```

为了便于训练，将Fashion-MNIST的宽高改为96。

测试模型运行：
```
X = torch.rand(size=(1,1,96,96))
for layer in net:
    X = layer(X)
    print(layer.__class__.__name__, X.shape)
```

## 训练模型
如果出现虚拟内存不足，改小batch_size.

# 批量规范化
## 训练深层网络
训练神经网络的影响因素：
- 数据预处理的方式通常会对最终结果产生巨大的影响。
- 对于典型的多层感知机或卷积神经网络，当训练时，中间层中的变量可能具有更大的变化范围，模型参数随着训练更新而变换莫测；这种偏移可能会阻碍网络的收敛。~~网络层心不齐~~
- 更深层的网络很复杂，容易过拟合

批量规范化应用于单个可选层：在每次训练迭代中，首先规范化输入，即减去其均值并处以标准差，这二者均基于当前小批量处理。接下来，应用比例系数和比例偏移。

只有使用足够大的小批量，批量规范化这种方法才是有效且稳定的。

从形式上来说，用$x\in B$表示一个来自小批量$B$的输入，批量规范化$BN$根据以下表达式转换$x$:

$$
BN(x) = \gamma \odot \frac{x-\hat\mu_B}{\hat\sigma_B}+\beta
$$

式中，$\hat\mu_B$是小批量B的样本均值，$\hat\sigma_B$是小批量B的样本标准差。应用标准化后，生成的小批量的均值为0，方差为1.

由于单位方差是一个主观的选择，因此我们通常包含拉伸参数$\gamma$和偏移参数$\beta$。

需注意，$\gamma, \beta$是需要与其他模型参数一起学习的参数。

关于$\hat\mu_B, \hat\sigma_B$的计算：
$$
\hat\mu_B = \frac{1}{|B|}\sum_{x\in B}x\\
\hat\sigma_B = \frac{1}{|B|}\sum_{x\in B}(x-\hat\mu_B)^2+\epsilon
$$

注意，我们在方差的估计值添加一个小的常量$\epsilon>0$，以确保永远不会除以零。

另外，优化中的各种噪声源通常会导致更快的训练和较少的过拟合，虽然目前尚未在理论上明确证明。

另外，批量规范化层在训练模型和预测模型中的功能不同：
- 训练模式下，我们无法使用整个数据集来估计均值和方差，所以只能根据每个小批量的均值和方差不断训练模型。
- 在预测模式下，可以根据整个数据集精确计算批量规范化所需的均值和方差。

## 批量规范化层
由于批量规范化在完整的小批量上执行，因此我们不能像之前在其他层那样忽略批量的大小。
### 全连接层
通常，我们将批量规范化置于全连接层中的仿射变换和激活函数之间。

设全连接层的输入为$x$，权重参数和偏置参数分别为$W, b$，激活函数为$\phi$，批量规范化层为$BN$。

那么使用批量规范化的全连接层的输出的计算公式为：
$$
h = \phi(BN(Wx+b))
$$
### 卷积层
对于卷积层，我们可以在卷积层之后和非线性激活函数之间应用批量规范化。

当卷积具有多个输出通道时，每个通道都需要执行批量规范化，每个通道都有自己的拉伸参数和偏移参数，这两个参数都是标量。

### 预测过程中的批量规范化
- 首先，我们不再需要样本均值中的噪声以及在微批量上估计每个小批量产生的样本方差。
- 其次，我们可能需要使用模型对逐个样本进行预测，一种常用的方法是通过移动平均估算整个训练数据集的样本均值和方差，并在预测时使用它们得到确定的输出。

## 从零实现
```
def batch_norm(x, gamma, beta, moving_mean, moving_var, eps, momentum):
    if not torch.is_grad_enabled():
        # 预测模式下，使用移动平均所得的均值和方差
        X_hat = (X-moving_mean)/torch.sqrt(moving_var+eps)
    else:
        # 训练模式
        assert len(X.shape) in (2, 4)
        if len(X.shape) == 2:
            # 使用全连接层
            mean = X.mean(dim=0)
            var = ((X-mean)**2).mean(dim=0)
        else:
            # 使用卷积层
            mean = X.mean(dim=(0, 2, 3), keepdim=True)
            var = ((X-mean)**2).mean(dim=(0,2,3), keepdim=True)
        X_hat = (X-mean)/torch.sqrt(eps+var)
        moving_mean = (1-momentum)*mean+momentum*moving_mean
        moving_var = (1-momentum)*var+momentum*moving_var

    Y = gamma*X_hat+beta
    return Y, moving_mean, moving_var
```

接下来我们创建一个正确的BatchNorm层，这个层将保存拉伸参数和偏移参数，以及均值和方差的移动平均值。
```
class BatchNorm(nn.Module):
    def __init__(self, num_features, dim):
        super().__init__()

        if dim == 2:
            shape = (1, num_features)
        else:
            shape = (1, num_features, 1, 1)

        self.gamma = nn.Parameter(torch.ones(size=shape, requires_grad=True))
        self.beta = nn.Parameter(torch.zeros(size=shape, requires_grad=True))
        self.moving_mean = torch.ones(size=shape)
        self.moving_var = torch.ones(size=shape)

    def forward(self, X):
        # 先看一下moving_mean和moving_var与X的设备是不是同一个
        if self.moving_mean.device != X.device:
            self.moving_mean.to(X.device)
            self.moving_var.to(X.device)

        Y, self.moving_mean, self.moving_var = batch_norm(X, self.gamma, self.beta, self.moving_mean, self.moving_var, eps=1e-5, momentum=0.9)

        return Y
```

## 使用批量规范化层的LeNet
批量规范化应该应用于卷积、全连接层之后，相应激活函数之前。
```
net = nn.Sequential(
    nn.Conv2d(1, 6, kernel_size=5), BatchNorm(6, 4), nn.Sigmoid(),
    nn.AvgPool2d(kernel_size=2, stride=2),
    nn.Conv2d(6, 16, kernel_size=5), BatchNorm(16, 4), nn.Sigmoid(),
    nn.AvgPool2d(kernel_size=2, stride=2), nn.Flatten(),
    nn.Linear(16*4*4, 120), BatchNorm(120, 2), nn.Sigmoid(),
    nn.Linear(120, 84), BatchNorm(84, 2), nn.Sigmoid(),
    nn.Linear(84, 10)
)
```

训练过程与之前一致，只是学习率可以大得多。

## 简明实现
```
net = nn.Sequential(
    nn.Conv2d(1, 6, kernel_size=5), nn.BatchNorm2d(6), nn.Sigmoid(),
    nn.AvgPool2d(kernel_size=2, stride=2),
    nn.Conv2d(6, 16, kernel_size=5), nn.BatchNorm2d(16), nn.Sigmoid(),
    nn.AvgPool2d(kernel_size=2, stride=2), nn.Flatten(),
    nn.Linear(16*4*4, 120), nn.BatchNorm1d(120), nn.Sigmoid(),
    nn.Linear(120, 84), nn.BatchNorm1d(84), nn.Sigmoid(),
    nn.Linear(84, 10)
)
```
通常高级API变体的运行速度快得多，因为它的代码已编译c++或CUDA。

## 争议
总结就是批量规范化很玄学。

# 残差网络（ResNet）

## 问题
随着网络越来越深：
- 靠近输入的块在更新时，由于梯度较小，更新速度慢；而靠近输出的块变换速度快。
- 靠近输出的块没有及时得到有效的信息，其更新对损失影响小
- 损失值在很长的一段时间不能有效下降

需想办法，降低梯度下降时的路径长度，避免出现梯度消失。

## 函数类（书上的理由）
关于这个概念的解释很长，在此写下自己的理解。

- 函数类是函数的结合，这些函数具有相同的结构，不同之处在于参数的具体数值
- 对于深度学习而言，框架的可能性的集合就是函数类，我们希望通过训练，在这个类里面找到一个最接近真实函数的函数
- 在构建更复杂框架时，应尽量包含经过实践验证，有效的小框架
- 对于深度神经网络，如果我们能将新添加的层训练成恒等函数，新模型和原模型将同样有效

## 残差块
残差映射在现实中往往更容易优化，因此我们将传统的$f(x)$函数改为$f(x)-x$。

对于传统的块：
1. 卷积层
2. 批量规范化层
3. 激活函数
4. 卷积层
5. 批量规范化层
6. 激活函数

而残差块为：
1. 卷积层
2. 批量规范化层
3. 激活函数
4. 卷积层
5. 批量规范化层
6. 与输入相加
7. 激活函数

ResNet沿用了VGG的卷积层设计：
1. 残差块里有两个相同输出通道数的$3\times 3$卷积层，每个卷积层后接一个批量规范化层和一个ReLU激活函数
2. 通过跨层数据通道，跳过两个卷积运算，将输入直接加载最后的ReLU激活函数之前
    - 这样的设计要求两个卷积层的输出与输入相同
    - 如果想改变通道数，需要引入额外的$1\times 1$卷积层改变输入的形状

残差块的实现：
```
import torch
from torch import nn
from torch.nn import functional as F

import torch
from torch import nn
from torch.nn import functional as F

class Residual(nn.Module):
    def __init__(self, input_channels, num_channels, use_1x1conv=False, strides=1):
        super().__init__()

        self.conv1 = nn.Conv2d(input_channels, num_channels, kernel_size=3, padding=1, stride=strides)
        self.conv2 = nn.Conv2d(num_channels, num_channels, kernel_size=3, padding=1)

        if use_1x1conv:
            # 统一了输出形状：(w-1)/stride, (h-1)/stride
            self.conv3 = nn.Conv2d(input_channels, num_channels, kernel_size=1, stride=strides)
        else:
            self.conv3 = None

        self.bn1 = nn.BatchNorm2d(num_channels)
        self.bn2 = nn.BatchNorm2d(num_channels)

    def forward(self, X):
        Y = self.bn2(self.conv2(F.relu(self.bn1(self.conv1(X)))))
        if self.conv3:
            X = self.conv3(X)
        Y += X
        return Y
```
## ResNet模型
ResNet的前两层跟之前介绍的GoogLeNet中的一样：在输出通道数为64，步幅为2的$7\times 7$卷积层后，接步幅为2的$3\times 3$的最大汇聚层，不同之处在于增加了批量规范化层。

```
b1 = nn.Sequential(
    nn.Conv2d(1, 64, kernel_size=7, stride=2, padding=3),
    nn.BatchNorm2d(64), nn.ReLU(),
    nn.MaxPool2d(kernel_size=3, stride=2, padding=1)
)
```
GoogLeNet在后面接了四个由Inception块的组成的模块。ResNet则使用四个由残差块组成的模块。

第一个模块的通道数与输入通道数一致。

之后的每个模块在第一个残差块里将上一个模块的通道数翻倍，并且高度、宽度减半。

需注意，在这里，第一个块没有使用$1\times 1$卷积层。
```
def resnet_block(input_channels, output_channels, num_residuals, first_block=False):
    blk = []
    for i in range(num_residuals):
        if i == 0 and not first_block:
            blk.append(Residual(input_channels, output_channels, True, strides=2))
        else:
            blk.append(Residual(output_channels, output_channels))

    return blk
```
构建四个模块
```
b2 = nn.Sequential(*resnet_block(64, 64, 2, True))
b3 = nn.Sequential(*resnet_block(64, 128, 2))
b4 = nn.Sequential(*resnet_block(128, 256, 2))
b5 = nn.Sequential(*resnet_block(256, 512, 2))
```

最后，与GoogLeNet一样，加入全局平均汇聚层和全连接层
```
net = nn.Sequential(
    b1, b2, b3, b4, b5
    nn.AdaptiveAvgPool2d((1, 1)),
    nn.Flatten(),
    nn.Linear(512, 10)
)
```
验证
```
X = torch.rand(size=(1, 1, 224, 224))
for layer in net:
    X = layer(X)
    print(layer.__class__.__name__, X.shape)
```
## 训练
与之前一致，注意内存大小。
