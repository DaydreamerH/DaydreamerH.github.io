---
title: "深度学习计算"
description: "层块的创建，文件的读取，参数的管理与使用GPU"
date: "2024-03-05 13:50:28"
category: "AI / 深度学习"
originalCategory: "PyTorch学习"
track: "AI / Deep Learning"
level: foundation
status: ready
published: true
minutes: 5
order: 1000
prerequisites: []
tags: ["AI", "PyTorch"]
photos: "banner.jpg"
source: "_posts"
---# 层和块
- 我们首先学习的是具有单一输出的线性模型
  - 接受一些输入
  - 生成相应的标量输出
  - 具有一组相关参数，更新这些参数可以优化某目标函数
- 然后考虑具有多个输出的网络，利用向量化算法来描述整层神经元
  - 接收一组输入
  - 生成相应的输出
  - 由一组可调整参数描述
- 随后我们学习率多层感知机，整个模型及其组成层都是上述架构。

事实证明，研究讨论比单个层大但比整个模型小的组件更有价值。
> 例如，ResNet-152架构就有数百层，这些层是由层组的重复模式组成

为了实现这些复杂的网络，引入了神经网络块的概念。

块可以描述单个层、由多个层组成的组件或整个模型本身。

使用块的好处是可以将一些块组成更大的组件，这一过程往往是递归的。

从编程的角度来看，块由类表示，类的任何子类都必须定义一个将其输入转换为输出的前向传播的函数，并且必须存储任何必须的参数。

## 自定义块
块必须提供以下功能：
- 将输入数据作为其前向传播函数的参数
- 通过前向传播函数来生成输出。
- 计算其输出关于输入的梯度，可通过反向传播函数进行访问
- 存储和访问前向传播计算所需的参数
- 根据需要初始化模型参数

此处定义一个块，其输入有样本有20维特征，经过256个隐藏单元组成的隐藏层后，在输出层输出10维结果。
```
from torch.nn import functional as F
class MLP(nn.Module):
    '''该类继承了表示块的类，我们只需要提供构造函数与前向传播函数'''
    def __init__(self):
        # 调用父类构造函数执行必要的初始化
        # 这样，在类的实例化时也可以指定其他函数参数
        super().__init__()
        self.hidden = nn.Linear(20, 256)
        self.out = nn.Linear(256, 10)

    # 定义模型的前向传播
    def forward(self, X):
        return self.out(F.relu(self.hidden(X)))
```
关于使用：
```
X = torch.rand(2, 20)
net = MLP()
net(X)
```

块的一个主要优点在于其多功能性，我们可以子类化块，以创建层、整个模型或具有中等复杂度的各种组件。

## 顺序块
接下来学习Sequential类是如何工作的。

为了构建我们自己的简化的Sequential，只需要定义下面两个关键函数：
- 将块逐个追加到列表中的函数
- 前向传播函数，用于将输入按追加块的顺序传递给块组成的“链条”

```
class MySequential(nn.Module):
    def __init__(self, *args):
        super().__init__()
        for idx, module in enumerate(args):
            # 这里，module是Module子类的一个实例，我们把它保存至Module类的成员变量_modules中。
            # _modules的原型是OrderedDict
            self._modules[str(idx)] = module

    def forward(self, X):
        for block in self._modules.values():
            X = block(X)
        return X
```

__init__函数将每个块逐个添加到有序字典_modules中。

使用_modules的主要优点是：在模块的参数初始化过程中，系统知道在_modules字典查找需要初始化参数的子块。

当MySequential的前向传播函数被调用时，每个添加的块都按照它们被添加的顺序执行。

```
net = MySequential(nn.Linear(20, 256), nn.ReLU(), nn.Linear(256, 10))
net(X)
```

## 在前向传播函数中执行代码
并不是所有的结构都是简单的顺序架构。

当需要更强的灵活性时，我们需要定义自己的块。

有时，我们可能希望合并既不是上一层的结果也不是可更新参数的项，我们称之为常熟参数。

例如，我们需要一个计算函数$f(x,y)=cw^Tx$的层，其中$x$是输入，$w$是参数，而$c$是某个在优化过程中没有更新的指定常量。

实现如下：
```
class FixedHiddenMLP(nn.Module):
    def __init__(self):
        super().__init__()
        # 不计算梯度的随机权重参数
        self.rand_weight = torch.rand((20, 20), requires_grad=False)
        self.lin = nn.Linear(20, 20)

    def forward(self, X):
        X = self.lin(X)
        X = F.relu(torch.mm(X, self.rand_weight)+1)
        return X
```
# 参数管理
```
import torch
from torch import nn

net = nn.Sequential(nn.Linear(4, 8), nn.ReLU(), nn.Linear(8, 1))
X = torch.rand(size=(2, 4))
net(X)
```
## 参数访问
当通过Sequential类定义模型时，我们可以通过索引来访问模型的任意层。

模型就像一个列表，每层的参数都在其属性中。
```
print(net[2].weight.shape)
```
### 目标参数
```
print(net[2].bias)
print(net[2].bias.data)
net[2].weight.data == None
```
### 一次性访问所有参数
```
print(*[(name, param.shape) for name, param in net[0].named_parameters()])

print(*[(name, param.shape) for name, param in net.named_parameters()])
```

```
net.state_dict()['2.bias'].data
```

### 从嵌套块中收集参数
```
def block1():
    return nn.Sequential(nn.Linear(4, 8), nn.ReLU(),
    nn.Linear(8, 4), nn.ReLU())

def block2():
    net = nn.Sequential()
    for i in range(4):
        net.add_module(f'block{i}', block1())
    return net

rgnet = nn.Sequential(block2(), nn.Linear(4, 1))
```
```
rgnet[0][1][0].bias.data
```
## 参数初始化
### 内置初始化
我们首先调用内置的初始化器。
```
def init_normal(m):
    if type(m) == nn.Linear:
        nn.init.normal_(m.weight, mean =0, std=0.01)
        nn.init.zeros_(m.bias)
net = nn.Sequential(nn.Linear(20, 10))
net[0].weight.data, net[0].bias.data
net.apply(init_normal)
net[0].weight.data, net[0].bias.data
```
### 自定义初始化
有时，深度学习框架没有提供我们所需要的初始化方法。

例如，我们使用以下分布为任意权重参数$w$定义初始化方法。
$$
w~\begin{cases}
    U(5, 10), 可能性\frac{1}{4}\\
    0, 可能性\frac{1}{2}\\
    U(-10, -5), 其他
\end{cases}
$$
```
def my_init(m):
    if type(m) == nn.Linear():
        nn.init.uniform_(m.weight, -10, 10)
        m.weight.data *= m.weight.data.abs()>=5
```
## 参数绑定
有时，我们希望在多个层间共享参数，我们可以定义一个稠密层，然后使用这个稠密层来设置另一个层的参数。
```
shared = nn.Linear(20, 20)
net = nn.Sequential(nn.Linear(10, 20), nn.ReLU(),
shared, nn.ReLU(),
shared, nn.ReLU())

net[2].weight.data == net[4].weight.data
net[2].weight.data = torch.rand(size=(20, 20))
net[2].weight.data == net[4].weight.data
```
## 延后初始化
到目前为止，我们建立网络时忽略了需要做的以下事情：
- 我们定义了网络架构，但没有指定输入的维度
- 我们添加层时，没有指定前一层的输出维度
- 我们在初始化参数时，甚至没有信心来确定模型应该包含多少个参数

这里的诀窍是框架的延迟初始化，即直到数据第一次通过模型传递时，框架才会动态地推断出每个层的大小。

# 自定义层
深度学习成功背后的一个因素是神经网络的灵活性，我们可以用创造性的方式组合不同的层，从而设计出适用于各种任务的结构。

## 不带参数的层
```
from torch import nn
class CenteredLayer(nn.Module):
    def __init__(self):
        super().__init__()

    def forward(self, X):
        return X - X.mean()

layer = CenteredLayer()

net = nn.Sequential(nn.Linear(8, 128), CenteredLayer())
Y = net(torch.rand(4, 8))
Y.mean()
```

## 带参数的层
我们实现自定义版本的全连接层。
```
class MyLinear(nn.Module):
    def __init__(self, in_units, units):
        super().__init__()
        self.weight = nn.Parameter(torch.randn(in_units, units))
        self.bias = nn.Parameter(torch.randn(units, ))
    def forward(self, X):
        linear = torch.matmul(X, self.weight.data) + self.bias.data
        return F.relu(linear)

linear = MyLinear(5, 3)
linear(torch.rand(2, 5))
```
# 读写文件
## 加载和保存张量
对于单个张量，我们可以直接调用load和save函数分别读写它们。这两个函数都要求我们提供名称，save要求将要保存的变量作为输入。

```
x = torch.arange(4)
x
torch.save(x, 'x-file')
x2 = torch.load('x-file')
x2
```
我们可以存储一个张量列表，随后将它们读回内存。

```
y = torch.zeors(4)
torch.save([x, y],'x-file')
x2, y2 = torch.load('x-file')
x2, y2
```
我们甚至可以读取或写入从字符串映射到张量的字典。
```
mydict = {'x':x, 'y':y}
torch.save(mydict,'mydict')
mydict2 = torch.load('mydict')
mydict2
```
## 加载和保存模型参数
深度学习框架提供了内置函数来保存和加载整个网络。

注意，这将保存模型的参数而不是整个模型。因此，为了恢复模型，我们需要用代码生成架构，然后从磁盘加载参数。

首先我们从熟悉的多层感知机开始尝试。
```
class MLP(nn.Module):
    def __init__(self):
        super().__init__()
        self.hidden = nn.Linear(20, 256)
        self.out = nn.Linear(256, 10)

    def forward(self, X):
        return self.out(F.relu(self.hidden(X)))

net = MLP()
```
接下来，我们将模型的参数保存至一个叫mlp.params的文件中。
```
torch.save(net.state_dict(),'mlp.params')
```
为了恢复模型，我们实例化了原始多层感知机模型的一个备份。这里我们不需要随机初始化模型参数，而是直接读取文件中存储的参数。
```
clone = MLP()
clone.load_state_dict(torch.load('mlp.params'))
clone.eval()
```

# GPU
## 计算设备
我们可以指定用于存储和计算的设备。默认情况下张量在内存中创建，使用CPU计算。

在PyTorch中，CPU和GPU可以用`torch.device('cpu')`和`torch.device('GPU')`表示。

如果有多个GPU设备，可以使用`torch.device(f'cuda:{i}')`来比表示第i块GPU。

查询GPU数量：
```
torch.cuda.device_count()
```
现在定义两个方便的函数：
```
def try_gpu(i=0): #@save
    if torch.cuda.device_count() >= i+1:
        return torch.device(f'cuda:{i}')
    return torch.device('cpu')

def try_all_gpus(): #@save
    devices = [torch.device(f'cuda:{i}') for i in range(torch.cuda.device_count())]
    return devices if devices else [torch.device('cpu')]
```
## 张量与GPU
我们可以查询张量所在的设备。
```
x = torch.rand(2, 3)
x.device
```
### 存储在GPU上
```
X = torch.ones(2, 3, device = try_gpu())
X
```
### 复制
跨GPU复制
```
Z = X.cuda(1)
print(X)
print(Z)
```
对于两个GPU上的变量，不能简单地将其相加，因为运行时引擎不知道该怎么做，它在同一设备上找不到数据而导致失败。
## 神经网络与GPU
类似地，神经网络模型可以指定设备，下面的代码将模型参数放在GPU上。
```
net = nn.Sequential(nn.Linear(3, 1))
net = net.to(device=try_gpu())
```
只要所有的数据和参数都在同一个设备上，我们就可以有效地学习模型。
