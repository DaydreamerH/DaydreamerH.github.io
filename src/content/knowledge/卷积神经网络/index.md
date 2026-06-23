---
title: "卷积神经网络"
description: "卷积层的引入、实现，与卷积神经网络的尝试"
date: "2024-03-06 13:05:35"
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
---本章介绍的卷积神经网络，是一类强大的、为处理图像数据而设计的神经网络。
# 从全连接到卷积层
我们之前讨论的多层感知机十分适合处理表格数据，其中行对应样本，列对应特征。

然而对于高维感知数据，这种缺少结构的网络可能会变得不实用。
## 不变性
设计适合于计算机视觉的神经网络架构
- 平移不变性：不管检测对象出现在图像中的哪个位置，神经网络的前面几层应该对相同的图像区域具有相似的反应。
- 局部性：神经网络的前面几层应该只探索输入图像中的局部区域，而不过度在意图像中相关较远区域的关系。

## 多层感知机的限制
多层感知机的输入是二维图像$X$，其隐藏表示$H$在数学上是一个矩阵。

使用$[X]_{i,j}$和$[H]_{i,j}$分别表示输入图像和隐藏表示中位置$(i,j)$处的像素。

为了使每个隐藏神经元都能接收每个输入像素的信息，我们将参数从权重矩阵替换为四阶权重张量$W$。

> 回顾全连接层的计算 $H_i = \sum_k [W]_{i,k}\times [X]_k + b$

假设$U$包含偏置参数，我们可以将全连接层形式化地表示为:
$$
[H]_{i,j} = [U]_{i,j}+\sum_k \sum_l[W]_{i,j,k,l}[X]_{k,l}
$$

进行替换，使得$k=i+a, l=j+b$则算式更新为：
$$
[H]_{i,j} = [U]_{i,j}+\sum_{a}\sum_{b}[V]_{i,j,a,b}[X]_{i+a,j+b}
$$
其中，$V$和$W$存在一一对应关系，索引$a$和$b$通过在正偏移和负偏移之间移动覆盖了整张图像。

### 平移不变性
检测对象在输入$X$中的平移应该仅导致隐藏表示$H$中的平移。

也就是说，$V$和$U$不依赖于$(i,j)$的值，即$[V]_{i,j,a,b}=[V]_{a,b}$.并且$U$是一个常数。

简化$H$定义为：
$$
[H]_{i,j} = u+\sum_a\sum_b[V]_{a,b}[X]_{i+a, j+b}
$$

这就是卷积，注意，由于$V$不再依赖于图像中的位置，系数要少得多。
### 局部性
为了收集用来训练参数$[H]_{i,j}$的信息，我们不应偏离到距$(i,j)$很远的位置。

这意味着在$|a|>\Delta$或$|b|>\Delta$的范围，我们可以设置$[V]_{a,b}=0$.

$$
[H]_{i,j} = u + \sum_{i-\Delta}^\Delta\sum_{j-\Delta}^\Delta[V]_{a,b}[X]_{i+a, j+b}
$$

简而言之，上式是一个卷积层，而卷积神经网络式包含卷积层的一类特殊的神经网络。

### 总结
在深度学习中，$V$称为卷积核或滤波器，或者简单地称为该卷积层的权重，通常该权重是可学习的参数。

当图像处理的局部区域很小时，卷积神经网络的参数远远小于多层感知机；而参数大幅下降的代价是，特征现在是平移不变的，并且当确定每个隐藏激活值时，每一层只包含局部的信息。

## 卷积
在数学中，两个函数之间的卷积被定义为：
$$
(f*g)(x) = \int f(z)g(x-z)dz
$$
也就是说，卷积是当把一个函数“翻转”并移位$x$后，测量$f$和$g$之间的重叠。

当函数为离散对象时，积分就变成求和。

对于二维张量，则为$f$的索引$(a,b)$和$g$的索引$(i-a,j-b)$上的对应加和：
$$
(f*g)(x) = \sum_a\sum_bf(a,b)g(i-a)(j-b)
$$

### 通道

图像一般包含3个通道/3种原色，是一个由高度、宽度和颜色组成的三维张量。

前两个轴与像素的空间位置有关，而第三个轴可以看作每个像素的多维表示。

因此我们就$X$索引为$[X]_{i,j,k}$，由此卷积相应地调整为$[V]_{a,b,c}$.

由于输入图像是三维的，我们的隐藏表示$H$也最好采用三维张量。换句话说，对于每个空间位置，我们想要采用一组而不是一个隐藏表示。

因此，我们可以把隐藏表示想象为一系列具有二位张量的通道，这些通道有时也称为特征映射，因为每个通道都向后续层提供一组空间化的学习特征。

为了支持输入$X$和隐藏表示$H$中的多个通道，我们可以在$V$中添加第四个坐标，即$[V]_{a,b,c,d}$
$$
[H]_{i,j,d} = \sum_{a-\Delta}^\Delta\sum_{b-\Delta}^\Delta\sum_c[V]_{a,b,c,d}[X]_{i+a, j+b, c}
$$

# 图像卷积
## 互相关运算
我们暂时忽略通道这一情况，看看如何处理二维图像数据和隐藏表示。

假设卷积核至于图像中每个大小完全合适的位置进行互相关运算，卷积核大小为$k_h\times k_w$，输入大小为$n_h\times n_w$，则输出大小为$(n_h-k_h+1)\times (n_w-k_w+1)$

程序实现：
```
import torch
from torch import nn
from d2l import torch as d2l

def corr2d(X, K): #@save
    h, w = K.shape
    Y = torch.zeros(size=(X.shape[0]-h+1,X.shape[1]-w+1))
    for i in range(Y.shape[0]):
        for j in range(Y.shape[1]):
            Y[i][j] = (X[i:i+h, j:j+w]*K).sum()
    return Y
```
验证：
```
X = torch.tensor([[0,1,2], [3,4,5], [6,7,8]])
K = torch.tensor([[0,1],[2,3]])

corr2d(X,K)
```
## 卷积层
卷积层对输入和卷积核进行互相关运算，并在添加标量偏置之后产生输出。

卷积层中两个被训练的参数是卷积核核标量偏置。

定义卷积层如下：
```
class Conv2D(nn.Module):
    def __init__(self, kernel_size):
        super().__init__()
        self.weight = nn.Parameter(torch.rand(kernel_size))
        self.bias = nn.Parameter(torch.zeros(1))
    def forward(self, X):
        return corr2d(X, self.weight)+self.bias
```
## 图像中目标的边缘检测
如下，是卷积层的一个简单应用，通过找到像素变化的位置来检测图像中不同颜色的边缘。

首先我们构造一个6像素*8像素的黑白图像，中间四列为黑色（0），其余像素为白色（1）。
```
X = torch.ones((6, 8))
X[:, 2:6] = 0
```

接下来构造一个高度为1、宽度为2的卷积核$K$。当进行互相关运算时，如果水平相邻的两元素相同，则输出为零，否则输出为非零。
```
K = torch.tensor([[1,-1]])
```

然后，我们对参数$X$和$K$执行互相关运算。
```
Y = corr2d(X, K)
```
输出中的1代表从白色到黑色的边缘，-1代表从黑色到白色的边缘。

这个卷积核只可以检测垂直边缘，无法检测水平边缘。

## 学习卷积核
如果我们只需寻找黑白的边缘，那么上述的边缘检测器足以，然而，当有了更复杂数值的卷积核，或者连续的卷积层时，我们不可能手动设计卷积核。

现在，我们看看是否可以通过仅查看“输入-输出”对来学习由$X$生成$Y$的卷积核。

我们线构造一个卷积层，并将其卷积核初始化为随机张量。

随后在每次迭代中，比较$Y$与卷积层输出的平方误差，计算梯度更新卷积核。

在此处，我们使用内置的二维卷积层，并忽略偏置。
```
conv2d = nn.Conv2d(1, 1, kernel_size=(1, 2), bias = False)

X = X.reshape((1, 1, 6, 8)) # 批量大小、通道为1
Y = Y.reshape((1, 1, 6, 7))
lr = 3e-2
num_epochs = 10

for epoch in range(num_epochs):
    Y_hat = conv2d(X)
    l = (Y-Y_hat)**2/2
    conv2d.zero_grad()
    l.sum().backward()
    conv2d.weight.data[:] -= lr*conv2d.weight.grad
    if (epoch+1)%2 == 0:
        print(f'epoch {epoch+1} loss {l.sum()/len(Y)}')
```

卷积核大小常见的有：$3\times 3$, $5\times 5$ ,..., $11\times 11$
# 填充和步幅
- 填充用以解决原始图像的边缘信息丢失的问题
- 步幅用以解决输入分辨率过于冗余的问题
## 填充
在应用多层卷积时，我们常常丢失边缘像素。由于我们通常使用小卷积核，因此对于任何单个卷积，我们可能只会丢失几像素。

但随着我们应用许多连续的卷积层，累积丢失的像素数就会增多，解决这个问题的简单方法是填充。

在输入图像的边缘填充元素。

通常，如果说我们添加$p_h$行填充，和$p_w$列填充，则输出的形状将变为$(n_h-k_h+p_h+1)\times (n_w-k_w+p_w+1)$.

需注意，这里的$p_h$并不是后续编程中的参数padding，而是两倍关系。

在许多情况下，我们需要设置$p_h = k_h -1$和$p_w=k_w-1$，使输入和输出具有相同高度和宽度。

一般而言，如果$k_h$是奇数，我们将在高度的两侧填充$\frac{p_k}{2}$行，如果$k_h$是偶数，则一种可能性是在输入顶部填充$\lceil \frac{p_h}{2} \rceil$行，在底部填充$\lfloor \frac{p_h}{2} \rfloor$行。

卷积神经网络中卷积核的高度和宽度通常为奇数。

选择奇数的好处：
- 保持空间维度的同时，我们可以在顶部和底部填充相同数量的行，在左侧和右侧填充相同数量的列。
- 使用奇数的核大小和填充大小也提供了书写上的便利。
  - 对于任何二维张量$X$，当满足卷积核的大小是奇数，所有侧边的填充行数和列数相同，输出与输入具有相同高度和宽度这三个条件是，可以得出输出$Y[i, j]$是通过可以输入X[i, j]为中心、与卷积核进行互相关运算得到的。

例如，在下面的例子中，我们创建一个高度和宽度为3的二维卷积层，并在所有侧边填充1像素。给定高度和宽度为8的输入，则输出的高度和宽度也为8.

```
def comp_conv2d(conv2d, X):
    # 这里表示批量大小和通道都是1
    X = X.reshape((1,1)+X.shape)
    Y = conv2d(X)
    # 省略前两个维度：批量大小、通道
    return Y.reshape(Y.shape[2:])

conv2d = nn.Conv2d(1, 1, kernel_size=3, padding=1)
X = torch.rand(size=(8,8))
comp_conv2d(conv2d, X).shape
```
## 步幅
有时候为了高效计算或是缩减采样次数，卷积窗口可以跳过中间位置，每次滑动多个元素。

但一般来说，步幅不应该超过卷积核大小。

通常，当垂直步幅为$s_h$，水平步幅为$s_w$时，输出形状为：
$$
\lfloor (n_h -k_h+p_h+s_h)/s_h\rfloor + \lfloor (n_w-k_w+p_w+s_w)/s_w\rfloor
$$

# 多输入多输出通道
当我们添加通道时，我们的输入和隐藏表示都变成了三维张量。

每个RGB输入图像具有$3\times h \times w$的形状。

## 多输入通道
当输入包含多个通道时，需要构造一个具有与输入数据相同的输入通道数的卷积核。

假设输入的通道数为$c_i$，那么卷积核的输入通道数也需要为$c_i$。

为了加深理解，接下来实现多输入通道互相关运算。

简单来说，我们所做的就是对每个通道执行互相关操作，然后将结果相加。

```
def corr2d_multi_in(X, K):
    return sum(d2l.corr2d(x, k) for x,k in zip(X, K))

X = torch.tensor([[[0.,1.,2.],[3.,4.,5.,],[6.,7.,8.]],[[1.,2.,3.],[4.,5.,6.],[7.,8.,9.]]])

K = torch.tensor([[[0.,1.],[2.,3.]],[[1.,2.],[3.,4.]]])

corr2d_multi_in(X,K)
```

## 多输出通道
到目前为止，不论有多少个输入通道，我们都只有一个输出通道。

在最流行的神经网络架构中，随着神经网络层数的增加，我们常会增加输出通道的维数，通过减少空间分布率获得更大的通道深度。

我们可以将每个通道看作对不同特征的响应。

用$c_i$和$c_o$分别表示输入和输出通道的数量，并用$k_w$和$k_h$表示卷积核的宽高。

为了获取多个通道的输出，我们可以为每个输出通道创建一个形状为$c_i\times k_w\times k_h$的卷积核张量，这样的卷积核形状为$c_o\times c_i \times k_h\times k_w$.

```
def corr2d_multi_in_out(X, K):
    return torch.stack([corr2d_multi_in(X,k)for k in K], 0)

K = torch.stack((K, K+1, K+2), 0)
K.shape

corr2d_multi_in_out(X,K)
```

## $1\times 1$卷积层
卷积的本质是有效提取相邻像素间的相关特征，而$1\times 1$的卷积显然没有此作用。

其实$1\times 1$卷积唯一的计算发生在通道上。

我们可以把它看作在每个像素位置应用的全连接层，以$c_i$个输入值转为$c_o$个输出值，因为这仍是一个全连接层，所以跨像素的权重是一致的。

同时，$1\times 1$卷积层需要的权重维度为$c_o\times c_i$，再额外加上一个偏置。

```
def corr2d_multi_in_out_1x1(X, K):
    c_i, h, w = X.shape
    c_o = K.shape[0]
    X = X.reshape((c_i, h*w))
    K = K.reshape((c_o, c_i))
    return torch.matmul(K, X).reshape((c_o, h, w))
```
# 汇聚层
我们机器学习的任务，通常会跟全局图像的问题有关，所以最后一层的神经元应该对整个输入的全局敏感。

此外，当检测较低层的特征时，我们希望这些特征保持某种程度的平移不变性。
## 最大汇聚和平均汇聚
不同于卷积层的输入与卷积核的互相关运算，汇聚层不包含任何参数，汇聚操作是确定性的，我们通常计算汇聚窗口中所有元素的最大值或平均值，分别称为最大汇聚和平均汇聚。

与互相关运算符一样，汇聚窗口从输入张量的左上角开始，从左往右，从上往下在输入张量内滑动。

汇聚窗口的形状为$p\times q$的汇聚层，称为$p\times q$汇聚层，汇聚操作称为$o\times q$汇聚。

在下面的代码`pool2d`函数中，我们实现汇聚层的前向传播。
```
def pool2d(X, pool_size, mode = 'max'):
    p_h, p_w = pool_size
    Y = torch.zeros(size=(X.shape[0]-p_h+1, X.shape[1]-p_w+1))
    for i in range(Y.shape[0]):
        for j in range(Y.shape[1]):
            if mode=='max':
                Y[i, j] = X[i:i+p_h, j:j+p_w].max()
            else:
                Y[i, j] = X[i:i+p_j, j:j+p_w].mean()
    return Y


X = torch.tensor([[0.,1.,2.],[3.,4.,5.],[6.,7.,8.]])
pool2d(X, (2,2,))
```
## 填充和步幅
与之前一样，我们可以通过填充和步幅获得所需的输出形状。

下面我们用深度学习框架中内置的二维最大汇聚层来演示汇聚层中填充和步幅的使用。

```
X= torch.arange(16, dtype=torch.float32).reshape((1,1,4,4))
X
```
默认情况下，深度学习框架中的步幅与汇聚窗口大小相同。
```
pool2d = nn.MaxPool2d(3)
pool2d(X)
```
填充和步幅可以手动设定。
```
pool2d = nn.MaxPool2d(3, stride=1, padding=1)
pool2d(X).shape
```
## 多个通道
在处理多通道输入数据时，汇聚层在每个输入通道上单独运算，而不是像卷积层那样在通道上对输入进行汇总。

这意味着汇聚层的输出通道和输入通道数相同。

# LeNet
总体来看，LeNet由以下两个部分组成：
- 卷积编码器：由两个卷积层组成
- 全连接层稠密块：由三个全连接层组成

每个卷积块的基本单元是一个卷积层、一个sigmoid函数和平均汇聚层。

> 虽然ReLU函数和最大汇聚层更有效，但它们在那时还没有出现。

每个卷积层使用$5\times 5$卷积核和一个sigmoid函数，这些层将输入映射到多个二维特征输出，通常同时增加通道的数量。

第一个卷积层由6个输出通道，第二个卷积层有16个输出通道。

每个$2\times 2$汇聚操作通过空间降采样将维数减少4倍。

为了将卷积快的输出传递给稠密块，我们必须在小批量中展平每个样本。

使用深度学习框架实现此类模型非常简单。
```
net = nn.Sequential(nn.Conv2d(1, 6, kernel_size=5, padding=2),
nn.Sigmoid(), nn.AvgPool2d(kernel_size=2, stride=2), nn.Conv2d(6, 16, kernel_size=5), nn.Sigmoid(), nn.AvgPool2d(kernel_size=2, stride=2), nn.Flatten(), nn.Linear(16*5*5, 120), nn.Sigmoid(), nn.Linear(120, 84), nn.Sigmoid(), nn.Linear(84, 10))
```
将原始模型的最后一层高斯激活去除，除此以外该模型与LeNet一致。

检查模型：
```
X = torch.rand(size=(1,1,28,28), dtype=torch.float32)

for layer in net:
    X = layer(X)
    print(layer.__class__.__name__, 'output shape: \t',X.shape)
```
训练：
```
def evaluate_accuracy_gpu(net, data_iter, device=None):
    '''测试准确率'''
    if isinstance(net, nn.Module):
        net.eval() # 设置为评估模式
        if not device:
            device = next(iter(net.parameters())).device

    num_correct = 0
    num_examples = 0

    with torch.no_grad():
        for X,y in data_iter:
            if isinstance(X, list):
                X = [x.to(device) for x in X]
            else:
                X.to(device)
            y = y.to(device)

            y_hat = net(X)
            y_hat = y_hat.argmax(axis=1)

            cmp = y_hat.type(y.dtype) == y
            a = cmp.type(y_hat.dtype).sum()

            num_correct += a
            num_examples += len(y)
    return num_correct/num_examples

from d2l import torch as d2l
def train(net, train_iter, test_iter, num_epochs, lr, device):
    trainer = torch.optim.SGD(net.parameters(), lr=lr)
    loss = nn.CrossEntropyLoss()

    def init_weights(m):
        if type(m) == nn.Linear or type(m) == nn.Conv2d:
            nn.init.xavier_uniform_(m.weight)
    net.apply(init_weights)
    net.to(device)
    print('training device:', device)

    animator = d2l.Animator(xlabel='epoch', xlim=[1, num_epochs], legend=['train_loss', 'test_acc'])

    for epoch in range(num_epochs):
        train_loss = 0
        test_loss = 0
        n_train = 0
        n_test = 0

        net.train()
        for X,y in train_iter:
            trainer.zero_grad()
            X, y = X.to(device), y.to(device)
            y_hat = net(X)
            l = loss(y_hat, y)
            l.backward()
            trainer.step()

            train_loss += l*X.shape[0]
            n_train += len(y)

            with torch.no_grad():
                test_acc = evaluate_accuracy_gpu(net, test_iter, device)
                animator.add(epoch+1, (None, test_acc.cpu().detach().numpy()))
        animator.add(epoch+1, ((train_loss/n_train).cpu().detach().numpy(), None))
        print(f'train_loss: {train_loss/n_train}, test_acc: {test_acc}')
```
需要注意的是，画图时的横坐标可以添加batch与总数目之比，避免出现垂直下降的情况。
