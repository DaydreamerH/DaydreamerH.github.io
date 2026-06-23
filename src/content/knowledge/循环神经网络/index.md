---
title: "循环神经网络"
description: "从序列模型到文本预处理，循环神经网络的原理与实现过程"
date: "2024-03-17 13:49:16"
category: "AI / 深度学习"
originalCategory: "PyTorch学习"
track: "Programming Foundation"
level: intermediate
status: ready
published: true
minutes: 15
order: 1000
prerequisites: []
tags: ["AI", "PyTorch", "nlp"]
photos: "banner.jpg"
source: "_posts"
---
到目前为止的学习中，我们默认数据都来自某种分布，并且所有样本都是独立同分布。

然而，大多数的数据并非如此，例如文章中的单词是按顺序写的，如果顺序被随机地重排，就很难理解文章原本的意思。

有时，我们不仅接收一个序列作为输入，而且可能期望继续猜测这个序列的后续信息。

# 序列模型
## 统计工具
处理序列数据需要统计工具和新的神经网络架构。

以股票价格为例，用$x_t$表示价格，即在时间步$t\in Z^+$时观察到的价格。

> 注意，我们讨论的$t$通常是离散的，并在整数或其子集上变化。

假设一个交易员想在$t$日的股市中表现良好，于是通过以下途径预测$x_i$：
$$
x_i \sim P(x_i|x_{i-1}, x_{i-2}, ..., x_1)
$$

### 自回归模型
输入数据的数量，会因为$t$的不同而不同，也就是说，输入数据的数量将会随着我们遇到的数据量增加而增加，因此需要一个近似方法来使这个计算变得容易处理。

- 第一种策略：假设在现实情况下相当长的序列$x_{t-1}, x_{t-2}, ..., x_1$可能是不必要的，因此我们只需要满足某个长度为$\tau$的时间跨度。
  - 当下获得的直接好处，参数的数量总是不变的
  - 这就使我们能够训练回归模型
  - 这种模型称为自回归模型，因为它们对自身执行回归
- 第二种策略：保留一些对过去观测的总结$h_t$，并且同时更新预测$\hat x_t$和总结$h_t$；这就产生了基于$\hat x_t=P(x_t|h_t)$估计$x_t$，以及公式$h_t=g(h_{t-1}, x_{t-1})$
  - 由于$h_t$从未被观测到，这类模型也称为隐变量自回归模型

训练数据的生成：
- 一个经典的方法是使用历史观测来预测下一个未来观测
- 一个常见的假设是虽然特定值$x_t$可能会改变，但是序列本身的动力学不会改变。

统计学家称不变的动力学为平稳的，因此，整个序列的估计值都通过以下方式获取：
$$
P(x_1, ..., x_T) = \prod_{t=1}^TP(x_t|x_{t-1}, \dots, x_1)
$$

注意，如果我们处理的是离散的对象，而不是连续的数字，则上述的考虑仍然有效，只是我们需要使用分类器而不是回归模型来估计$P(x_t|x_t-1,...,x_1)$

### 马尔可夫模型
在自回归模型的近似法中，我们使用$x_{t-1}, ..., x_{t-\tau}$，而不是$x_{t-1},...,x_1$来估计$x_t$。

只要是近似精确的，我们就说序列满足马尔可夫条件。

特别是，如果$\tau=1$我们就得到一个一阶马尔可夫模型，$P(x)$由下式给出：
$$
P(x_1, \dots, x_t) = \prod_{t=1}^TP(x_t|x_{t-1}), \quad当P(x_1|x_0) = P(x_1)
$$

## 训练
在了解上述统计工具后，我们在实践中尝试一下。

首先，我们使用正弦函数和一些可加性噪声来生成序列数据，时间步为$1, 2, ..., 1000$

```
from torch import nn
import torch
from torch.utils import data

T = 1000
time = torch.arange(1, T+1, dtype=torch.float32)
x = torch.sin(0.01*time) + torch.normal(0,0.2, (T,))

from d2l import torch as d2l
d2l.plot(time, [x], 'time', 'x', xlim=[1, 1000], figsize=(6,3))
```
接下来，我们将这个序列转换为模型的特征-标签对。

基于嵌入维度$\tau$，我们将数据映射为数据对$y_t=x_t$和$x_t=[x_{t-\tau},...,x_{t-1}]$.

这比我们提供的数据样本少了$\tau$个。简单的解决办法是：
- 只要有足够长的序列就丢弃这几项
- 用零填充序列

```
tau = 4
features = torch.zeros(size=(T-tau, tau))

for i in range(tau):
    features[:, i] = x[i:T-tau+i]
labels = x[tau:].reshape((-1,1))
```

此处，我们使用前600个特征-标签对进行训练。
```
batch_size, n_train = 16, 600

train_dataset = data.TensorDataset(*(features[:n_train], labels[:n_train]))
train_iter = data.DataLoader(train_dataset, batch_size, True)
```
在这里，构建一个简单的架构训练模型。
```
def init_weight(m):
    if type(m) == nn.Linear:
        nn.init.xavier_uniform_(m.weight)

net = nn.Sequential(
    nn.Linear(4, 10), nn.ReLU(), nn.Linear(10, 1)
)

net.apply(init_weight)

loss = nn.MSELoss()
```
训练模型：
```
def train(net, train_iter, num_epochs, loss, lr):
    trainer = torch.optim.Adam(net.parameters(), lr)
    for epoch in range(num_epochs):
        n_train = 0
        total_loss = 0
        for X,y in train_iter:
            y_hat = net(X)
            l = loss(y_hat, y)

            trainer.zero_grad()
            l.sum().backward()
            trainer.step()

            n_train+=len(y)
            total_loss+=l.sum()
        print(f'epoch {epoch+1}, loss{total_loss/n_train}')
```
## 预测
首先检查模型预测下一个时间步的能力，也就是单步预测：
```
onestep_preds = net(features)
d2l.plot([time, time[tau:]], [x.detach().numpy(), onestep_preds.detach().numpy()], 'time', 'x', legend=['data', '1-step preds'], xlim=[1,1000],figsize=(6,3))
```
可以看出单步预测效果不错，即使时间步超过了训练集的时间步范围。

但有个问题，如果数据观测序列的时间步直到604，为了预测后面的时间步结果，我们需要一步一步向前推进。

通常，对于直到$x_t$的观测序列，其在时间步$t+k$处的预测输出$\hat x_{t+k}$称为$k$步预测。
```
multistep_preds = torch.zeros(T)
multistep_preds[:n_train+tau] = x[:n_train+tau]
for i in range(n_train+tau, T):
    multistep_preds[i] = net(multistep_preds[i-tau:i].reshape((1, -1)))
d2l.plot([time, time[tau:], time[n_train+tau:]],[x.detach().numpy(), onestep_preds.detach().numpy(), multistep_preds[n_train+tau:].detach().numpy()], 'time', 'x', legend=['data', '1-step preds', 'multistep preds'], xlim=[1,1000],figsize=(6,3))
```
点划线的预测显然并不理想，经过几个预测步骤之后，预测的结果很快就会衰减到一个常数。

这是因为误差的累积。
# 文本预处理
1. 将文本作为字符串加载到内存中
2. 将字符串拆分为词元
3. 建立一个词表，将拆分的词元映射到数字索引
4. 将文本转换为数字索引序列

## 读取数据集
```
d2l.DATA_HUB['time_machine'] = (d2l.DATA_URL+'timemachine.txt','090b5e7e70c295757f55df93cb0a180b9691891a')

def read_time_machine():
    with open(d2l.download('time_machine'),'r') as f:
        lines = f.readlines()
    return [re.sub('[^A-Za-z]+', ' ', line).strip().lower() for line in lines]

lines = read_time_machine()
print(f'# 文本总行数:{len(lines)}')
print(lines[0])
print(lines[10])
```
## 词元化
下面的tokenize函数将文本行列表作为输入，列表中的每个元素是一个文本序列。

每个文本序列有被拆分成一个词元列表(token)，词元是文本的基本单位。

最后返回一个由词元列表组成的列表，其中的每个词元都是一个字符串。
```
def tokenize(lines, token='word'):
    if token == 'word':
        return [line.split() for line in lines]
    elif token == 'char':
        return [list(line) for line in lines]
    else:
        print('未知词元')

tokens = tokenize(lines)
for i in range(11):
    print(token[i])
```
## 词表
词元的类型是字符串，而模型需要的输入是数字。

构建一个字典，一般叫做词表，用来将字符串类型的词元映射到从0开始的数字索引中。

我们先将训练集中的所有文档合并在一起，对它们的唯一词元进行统计，得到的统计结果称为语料库。

然后根据每个唯一词元出现的频率，为其分配一个数字索引。

很少出现的词元通常被移除，这可以降低复杂度。

语料库中不存在或已移除的任何词元都将映射到一个特定的未知词元'\<unk\>'.

我们可以选择增加一个列表，用于保存那些被保留的词元，例如填充次元('\<pad\>')、序列开始词元('\<bos\>')、序列结束词元('\<eos\>')

```
class Vocab:
    def __init__(self, tokens=None, min_freq=0, reversed_tokens=None):
        if tokens is None:
            tokens = []
        if reversed_tokens is None:
            reversed_tokens = []

        counter = count_corpus(token) # 按出现频率排序
        self._token_freqs = sorted(counter.items(), key=lambda x:x[1], reverse=True)

        self.idx_to_token = ['<unk>'] + reversed_tokens
        self.token_to_idx = {token: idx for idx, token in enumerate(self.idx_to_token)}

        for token, freq in self._token_freqs:
            if freq<min_freq:
                break
            if token not in self.token_to_idx:
                self.idx_to_token.append(token)
                self.token_to_idx[token] = len(self.idx_to_token)-1
    def __len__(self):
        return len(self.idx_to_token)

    def __getitem__(self, tokens):
        if not isinstance(tokens, (list, tuple)):
            return self.token_to_idx.get(tokens, self.unk)
        return [self.__getitem__(token) for token in tokens]

    def to_tokens(self, indices):
        if not isinstance(indices, (list, tuple)):
            return self.idx_to_token[indices]
        return [self.idx_to_token[index] for index in indices]

    @property
    def unk(self):
        return 0

    @property
    def token_freqs(self):
        return self._token_freqs

def count_corpus(tokens):
    if len(tokens) == 0 or isinstance(tokens[0], list):
        tokens = [token for line in tokens for token in line]
    return collections.Counter(tokens)
```
在使用上述函数时，我们将所有功能打包到load_corpus_time_machine函数中，该函数返回corpus和vocab。

1. 为简化训练，我们使用字符实现文本词元化
2. 时光机器数据集种的每个文本行不一定是一个句子或一个段落，还可能是一个但词，因此返回的corpus仅处理为单个列表，而不是使用多词元列表组成一个列表

```
def load_corpus_time_machine(max_tokens=-1):
    '''返回时光机器数据集的词元索引列表和词表'''
    lines = read_time_machine()
    tokens = tokenize(lines, 'char')
    vocab = Vocab(tokens)
    corpus = [vocab[token] for line in tokens for token in line]
    if max_tokens>0:
        corpus = corpus[:max_tokens]
    return corpus, vocab

corpus, vocab = load_corpus_time_machine()
len(corpus), len(vocab)
```

# 语言模型和数据集
假设长度为$T$的文本序列中的词元依次为$x_1, x_2, ..., x_T$。于是，$x_t(1\leq x\leq T)$可以被认为是文本序列在时间步$t$处的观测或标签。

在给定这样的文本序列时，语言模型的目标时估计序列的联合概率
$$
P(x_1,x_2,\dots,x_T)
$$

## 学习语言模型
我们面对的问日是如何对一个文档，甚至是一个词元序列进行建模。

假设在单词级别对文本数据进行词元化。

基本概率规则：
$$
P(x_1,x_2,\dots,x_T)=\prod_{t=1}^TP(x_t|x_1,\dots, x_{t-1})
$$

具体而言，包含4个单词的一个文本序列的概率是：
$$
P(deep, learning, is ,fun) = P(deep)P(learning|deep)P(is|learning, fun)\\P(fun|is,learning,deep)
$$

为了训练语言模型，我们需要计算单词出现的概率，以及给定前面几个单词后出现某个单词的条件概率，这些概率本质上就是语言模型的参数。

假设我们拥有所有网络上的文本，训练数据集中单词的概率可以根据给定单词的相对词频来计算。

例如，可以将估计值$\hat P(deep)$计算为任何以deep开头的句子出现的概率。

另外，我们也可以统计deep在数据集中出现的次数，然后将其除以整个语料库中的单词总数。这种方法效果不错，特别是对于频繁出现的单词。

接下来我们可以尝试估计：
$$
P(learning|deep) = \frac{n(deep, learning)}{n(deep)}
$$
其中，$n(x)$和$n(x, x')$分别是单个单词和连续单词对出现的次数。

遗憾的是，由于连续单词对出现的频率低得多，因此估计这类单词出现的正确概率要困难得多。

除非我们提供某种解决方案，以将这些单词组合指定为非零计数，否则将无法在语言模型中使用它们。

如果数据集很小，或者单词非常罕见，那么这类单词组合即使出现一次的机会也可能找不到。

一种常见的策略是执行某种形式的拉普拉斯平滑：
$$
\hat P(x) = \frac{n(x)+\epsilon_1/m}{n+\epsilon_1}\\
\hat P(x'|x) = \frac{n(x,x')+\epsilon_2\hat P(x')}{n(x)+\epsilon_2}\\
\hat P(x''|x',x) = \frac{n(x,x',x'')+\epsilon_3\hat P(x'')}{n(x,x')+\epsilon_3}
$$

然而这样的模型很容易变得无效，原因表现如下几个方面：
- 我们需要存储所有的计数
- 完全忽略了单词的意思
- 长单词序列中的大部分是没出现过的

## 马尔可夫模型与n元语法
如果$P(x_t|x_1,\dots,x_{t-1})=P(x_t|x_{t-1})$，则序列上的分布满足一阶马尔可夫性质。

阶数越高，对应的依赖关系就越长。

这种性质推导出了许多可以应用于序列建模的近似公式：
$$
P(x_1,x_2,x_3,x_4) = P(x_1)P(x_2)P(x_3)P(x_4)\\
P(x_1,x_2,x_3,x_4) = P(x_1)P(x_2|x_1)P(x_3|x_2)P(x_4|x_3)\\
P(x_1,x_2,x_3,x_4) = P(x_1)P(x_2|x_1)P(x_3|x_2,x_1)P(x_4|x_3,x_2)
$$

通常，涉及1个，2个和3个变量的概率公式分别称为一元语法、二元语法和三元语法模型。

## 自然语言统计
在真实数据上进行自然语言统计，并打印前10个最常用的单词。

```
import re
import torch
import random
from d2l import torch as d2l

d2l.DATA_HUB['time_machine'] = (d2l.DATA_URL+'timemachine.txt','090b5e7e70c295757f55df93cb0a180b9691891a')

def read_time_machine():
    with open(d2l.download('time_machine'),'r') as f:
        lines = f.readlines()
    return [re.sub('[^A-Za-z]+', ' ', line).strip().lower() for line in lines]

tokens =d2l.tokenize(read_time_machine())
corpus = [token for line in tokens for token in line]
vocab = d2l.Vocab(corpus)

vocab.token_freqs[:10]
```
出现较多的词往往没有吸引人的地方，这些词通常被称为停用词，因此可以被过滤掉。

尽管如此，它们本身是有意义的，我们仍然会在模型中使用它们。

此外，词频衰减速度相当快也是一个问题。
```
freqs = [freq for token, freq in vocab.token_freqs]
d2l.plot(freqs, xlabel='token: x',ylabel='frequency: n(x)', xscale='log', yscale='log')
```
词频以一种明确的方式迅速衰减，将前几个单词作为例外去除后，剩余的单词与其词频变化规律大致遵循双对数坐标图上的一条直线。

这意味着单词的频率满足齐普夫定律，即第$i$个最常用单词的频率$n_i$满足
$$
n_i \propto\frac{1}{i^a}
$$
等价于：
$$
logn_i=-\alpha logi+c
$$
其中，$\alpha$是描述分布的指数，$c$是常数。

这告诉我们想通过技术统计和平滑来对单词建模是不可行的，因为这样建模会大大高估尾部单词的频率，也就是所谓的不常用单词。

- 除了一元语法，单词序列似乎也遵循齐普夫定律，只是$\alpha$更小
- 词表中$n$元组的数量并没有那么大，这说明语言存在相当多的结构，这些结构给了我们应用模型的希望。
- 很多$n$元组很少出现，这使得拉普拉斯平滑不适合语言建模。

## 读取长序列数据
假设我们将使用神经网络来训练语言模型，模型中的网络一次处理具有预定义长度的一个小批量序列。

现在的问题是如何随机生成一个小批量数据的特征和标签以供读取。

由于文本序列是任意长的，可以被拆分为具有相同时间步数的子序列。

当训练神经网络时，这样的小批量子序列将输入模型中。

我们可以任意选择初始位置，有相当的的自由度。

但是，我们该如何确定初始位置呢？

我们应该从随机偏移量开始拆分，以同时获得覆盖性和随机性。

### 随机抽样
在随机抽样中，每个样本都是在原始的长序列上任意捕获的子序列。

对于语言建模，目标是基于到目前为止我们看到的词元来预测下一个词元，因此标签是移位了一个词元的原始序列。

下面的代码每次可以从数据中随机生成一个小批量。

batch_size指定了每个小批量样本中子序列样本的数目，num_steps是每个子序列中预定义的时间步数。
```
def seq_data_iter_random(corpus, batch_size, num_steps):
    '''使用随机抽样生成一个小批量的子序列'''
    # 从随机偏移量开始对序列进行分区，随机范围包含num_steps-1
    corpus = corpus[random.randint(0, num_steps - 1):]
    # 减去1，是因为我们需要考虑标签
    num_subseqs = (len(corpus)-1)//num_steps
    # 长度为num_steps的子序列的起始索引
    initial_indices = list(range(0, num_subseqs*num_steps, num_steps))
    # 在随机抽样的迭代过程中
    # 来自两个相邻的、随机的、小批量中的子序列不一定在原始序列中相邻
    random.shuffle(initial_indices)

    def data(pos):
        return corpus[pos:pos+num_steps]

    num_batchs = num_subseqs//batch_size
    for i in range(0, batch_size*num_batchs, batch_size):
        initial_indices_per_batch = initial_indices[i:i+batch_size]
        X = [data(j) for j in initial_indices_per_batch]
        Y = [data(j+1) for j in initial_indices_per_batch]
        yield torch.tensor(X), torch.tensor(Y)
```
下面我们生成一个从0到34的序列。假设批量大小为2，时间步数为5。

```
my_seq = list(range(35))

for X,Y in seq_data_iter_random(my_seq, 2, 5):
    print(X, Y)
```

### 顺序分区
在迭代过程中，除了可以对原始序列随机抽样，我们还可以保证两个相邻的小批量中的子序列在原始序列中也是相邻的。

这种策略基于小批量的迭代过程中，保留了拆分的子序列的顺序，因此称为顺序分区。

```
def seq_data_iter_sequential(corpus, batch_size, num_steps):
    '''使用顺序分区生成一个小批量子序列'''
    offset = random.randint(0, num_steps)
    num_tokens = ((len(corpus)-offset-1)//batch_size)*batch_size
    Xs = torch.tensor(corpus[offset:offset+num_tokens])
    Ys = torch.tensor(corpus[offset+1:offset+num_tokens+1])
    Xs, Ys = Xs.reshape(batch_size, -1), Ys.reshape(batch_size, -1)
    num_batchs = Xs.shape[1]//num_steps
    for i in range(0, num_steps*num_batchs, num_steps):
        X = Xs[:, i:i+num_steps]
        Y = Ys[:, i:i+num_steps]
        yield X, Y
```
验证：
```
for X, Y in seq_data_iter_sequential(my_seq, 2, 5):
    print(X, Y)
```
### 数据迭代器
将上面的两个抽样函数包装到一个类中，以便稍后将其作为数据迭代器。
```
class SeqDataLoader:
    def __init__(self, batch_size, num_steps, use_random_iter, max_tokens):
        if use_random_iter:
            self.data_iter_fn = seq_data_iter_random
        else:
            self.data_iter_fn = seq_data_iter_sequential
        self.corpus, self.vocab = load_corpus_time_machine(max_tokens)
        self.batch_size, self.num_steps = batch_size, num_steps

    def __iter__(self):
        return self.data_iter_fn(self.corpus, self.batch_size, self.num_steps)
```

最后我们定义一个函数，返回数据迭代器和词表。
```
def load_data_time_machine(batch_size, num_steps, use_random_iter=False, max_tokens=10000):
    data_iter = SeqDataLoader(batch_size, num_steps, use_random_iter, max_tokens)
    return data_iter, data_iter.vocab
```

# 循环神经网络
在n元语法模型中，其中单词$x_t$在时间步$t$的条件概率仅取决于前面$n-1$个单词。

对于时间步$t-(n-1)$之前的单词，如果我们想将其可能产生的影响合并到$x_t$上，需要增大$n$，这将导致模型的参数增加。

隐变量模型将有助于解决这个问题：
$$
P(x_t|x_{t-1},\dots,x_1) \approx P(x_t|h_{t-1})
$$
其中，$h_{t-1}$是隐状态，存储了到时间步$t-1$的序列信息。

通常我们可以基于当前的输入$x_t$和之前的隐状态$h_{t-1}$来计算时间步$t$处的任何时间的隐状态：
$$
h_t = f(x_t,h_{t-1})
$$
对于函数$f$，隐变量模型不是近似值，然而这样的操作可能会使得计算和存储的成本都变得昂贵。

循环神经网络是具有隐状态的神经网络。

## 有隐状态的循环神经网络
假设我们在时间步$t$有小批量输入$X_t\in R^{n\times d}$。对于$n$个序列样本的小批量，$X_t$的每一行对应于来自该序列的时间步$t$处的一个样本。

用$H_t\in R^{n\times h}$表示时间步$t$的隐藏变量，与MLP不同，我们在这里保存了前一个时间的隐藏变量$H_{t-1}$。并引入了一个新的权重参数$w_{hh}\in R^{h\times h}$，来描述如何在当前时间步中使用前一个时间步的隐藏变量。

当前时间步的隐藏变量由当前时间步的输入与前一个时间步的隐藏变量共同计算得出：
$$
H_t = \phi(X_tW_{xh}+H_{t-1}W_{hh}+b_h)
$$

相较于MLP，多了个$H_{t-1}W_{hh}$，从而实例化了$h_t=f(x_t,h_{t-1})$.

这些变量捕获并保留了序列直到当前时间步的历史信息，就如当前时间步中神经网络的状态或记忆，因此这样的隐藏变量被称为隐状态。

由于在当前的时间步中，隐状态使用的定义与前一个时间步中使用的定义相同，因此计算是循环的，基于该循环计算的隐状态神经网络被命名为循环神经网络。

有许多不同的方法可以构建循环神经网络，如上式。

对于时间步$t$，输出层的输出类似于MLP：
$$
O_t = H_tW_{hq} +b_q
$$
循环神经网络的参数包含隐藏层的权重和偏置：$W_{xh}\in R^{d\times h}, W_{hh}\in R^{h\times h}, b_h\in R^{1\times h}$，以及输出层权重和偏置：$W_{qh}\in R^{h\times q}, b_q\in R^{1\times q}$.

值得一提的是，即使在不同的时间步，循环神经网络也总是使用这些模型参数。

因此循环神经网络的开销，不会随着时间步的增加而增加。

关于隐状态的计算：$X_tW_{xh}+H_{t-1}W_{hh}$，相当于$X_t$和$H_{t-1}$的连接与$H_{t-1}$和$W_{hh}$的连接的矩阵乘法。

二者计算结果并非完全一致，存在细微的差别。
```
import torch


X, W_xh = torch.normal(0, 1, (3, 1)), torch.normal(0, 1, (1, 4))
H, W_hh = torch.normal(0, 1, (3,4)), torch.normal(0, 1, (4, 4))

result = torch.matmul(X, W_xh)+torch.matmul(H, W_hh)
another = torch.matmul(torch.cat((X, H), 1), torch.cat((W_xh, W_hh), 0))

another == result
```
## 困惑度
~~确实困惑，不知道这书写的什么~~

我们可以通过计算序列的似然概率来度量模型的质量。然而这是一个难以理解、难以比较的数字，较短的序列比较长的序列更可能出现。

如果想要压缩文本，我们可以根据当前词元集预测的下一个词元。

一个更好的语言模型应该能让我们更准确地预测下一个词元，它应该允许我们在压缩序列时花费更少的比特，所以我们可以通过一个序列中所有的$n$个词元的交叉熵损失的平均值来衡量：
$$
\frac{1}{n}\sum_{t=1}^n-logP(x_t|x_{t-1},\dots, x_1)
$$
其中，$P$由语言模型给出，$x_t$是在时间步$t$从该序列中观测到的实际词元。这使得不同长度的文本的性能具有了可比性。

困惑度即为：
$$
exp(\frac{1}{n}\sum_{t=1}^n-logP(x_t|x_{t-1},\dots, x_1))
$$
可作为评估模型的依据：
- 在最好的情况下，模型总是完美估计标签词元的概率为1.在这种情况下，模型的困惑度为1
- 在最好的情况下，模型总是预测标签词元的概率为0.在这种情况下，困惑度为正无穷大
- 在基线上，模型的预测是词表的所有可用词元上的均匀分布。在这种情况下，困惑度等于词表中唯一词元的数量。任何模型都无法超越这个上限，这是实际编码中最好的情况。

# 循环神经网络从零开始实现
首先读取数据集：
```
import math
import torch
from torch import nn
from torch.nn import functional as F
from d2l import torch as d2l
import re
import random

batch_size, num_steps = 32, 35

d2l.DATA_HUB['time_machine'] = (d2l.DATA_URL+'timemachine.txt','090b5e7e70c295757f55df93cb0a180b9691891a')

def read_time_machine(): #@save
    with open(d2l.download('time_machine'),'r') as f:
        lines = f.readlines()
    return [re.sub('[^A-Za-z]+', ' ', line).strip().lower() for line in lines]

def load_corpus_time_machine(max_tokens=-1): #@save
    '''返回时光机器数据集的词元索引列表和词表'''
    lines = read_time_machine()
    tokens = d2l.tokenize(lines, 'char')
    vocab = d2l.Vocab(tokens)
    corpus = [vocab[token] for line in tokens for token in line]
    if max_tokens>0:
        corpus = corpus[:max_tokens]
    return corpus, vocab

def seq_data_iter_sequential(corpus, batch_size, num_steps):
    '''使用顺序分区生成一个小批量子序列'''
    offset = random.randint(0, num_steps)
    num_tokens = ((len(corpus)-offset-1)//batch_size)*batch_size
    Xs = torch.tensor(corpus[offset:offset+num_tokens])
    Ys = torch.tensor(corpus[offset+1:offset+num_tokens+1])
    Xs, Ys = Xs.reshape(batch_size, -1), Ys.reshape(batch_size, -1)
    num_batchs = Xs.shape[1]//num_steps
    for i in range(0, num_steps*num_batchs, num_steps):
        X = Xs[:, i:i+num_steps]
        Y = Ys[:, i:i+num_steps]
        yield X, Y

class SeqDataLoader:
    def __init__(self, batch_size, num_steps, use_random_iter, max_tokens):
        if use_random_iter:
            self.data_iter_fn = seq_data_iter_random
        else:
            self.data_iter_fn = seq_data_iter_sequential
        self.corpus, self.vocab = load_corpus_time_machine(max_tokens)
        self.batch_size, self.num_steps = batch_size, num_steps

    def __iter__(self):
        return self.data_iter_fn(self.corpus, self.batch_size, self.num_steps)

def load_data_time_machine(batch_size, num_steps, use_random_iter=False, max_tokens=10000):
    data_iter = SeqDataLoader(batch_size, num_steps, use_random_iter, max_tokens)
    return data_iter, data_iter.vocab

train_iter, vocab = load_data_time_machine(batch_size, num_steps)
```
## 独热编码
在train_iter中，每个词元都表示为一个数字索引，将这些索引直接输入神经网络可能会导致学习困难。

我们通常将每个词元表示为更具表达力的特征向量。

最简单的表示为独热编码。

简而言之，独热编码是将每个索引映射为相互不同的单位向量：假设词表中不同词元的数量为$N$，词元索引的范围为$[0,N-1]$.如果词元的索引是整数$i$，那么我们创建一个长度为$N$的全0向量，并将第$i$个元素设置为1.

我们每次抽样的小批量数据形状是二维张量，即(批量大小，时间步数).one_hot函数将这样一个小批量数据转成三维张量，张量的最后一个维度等于词表大小。

我们经常转换输入的维度，以便获得形状为(时间步数，批量大小，词表大小)的输出。这将使我们能够更方便地通过最外层的维度，一步步地更新小批量数据的隐状态。

```
X = torch.arange(10).reshape(2, 5)
F.one_hot(X.T, 28).shape
```

## 初始化模型参数
隐藏单元数num_hiddens是一个可调的超参数。当训练语言模型是，输入和输出来自相同的词表，因此它们具有共同的维度，即词表的大小。

```
def get_params(vocab_size, num_hiddens, device):
    num_inputs = num_outputs = vocab_size

    def normal(shape):
        return torch.randn(shape, device=device)*0.01

    W_xh = normal((num_inputs, num_hiddens))
    W_hh = normal((num_hiddens, num_hiddens))
    b_h = torch.zeros(num_hiddens, device=device)

    W_qh = normal((num_hiddens, num_outputs))
    b_q = torch.zeros(num_outputs, device=device)

    params = [W_xh, W_hh, b_h, W_qh, b_q]
    for param in params:
        param.requires_grad_(True)
    return params
```
## 循环神经网络模型
为了定义循环神经网络模型，我们首先需要一个init_rnn_state函数在初始化时返回隐状态。

这个函数的返回值是一个张量，张量用全0填充，形状为（批量大小，隐藏单元数）。在后面的章节中我们将会遇到隐状态包含多个变量的情况，而使用元组可以更容易地处理。

```
def init_rnn_state(batch_size, num_hiddens, device):
    return (torch.zeros((batch_size, num_hiddens), device =device), )
```

下面的rnn函数定义如何在一个时间步内计算隐状态和输出。

循环神经网络模型通过inputs最外层的维度实现循环，以便逐时间步更新小批量数据的隐状态H。这里使用tanh作为激活函数，当元素在实数上服从均匀分布时，tanh函数的平均值为0.
```
def rnn(inputs, state, params):
    W_xh, W_hh, b_h, W_qh, b_q = params
    H, = state
    outputs=[]
    for X in inputs:
        H = torch.tanh(torch.mm(X, W_xh)+torch.mm(H, W_hh)+b_h)
        Y = torch.mm(H, W_qh) + b_q
        outputs.append(Y)
    return torch.cat(outputs, dim=0), (H,)
```
定义了所需的函数之后，创建一个类包装这些函数，并存储从零开始的循环神经网络模型的参数。
```
class RNNModelScratch: #@save
    '''从零开始实现的循环神经网络'''
    def __init__(self, vocab_size, num_hiddens, device,
    get_params, init_state, forward_fn):
        self.vocab_size = vocab_size
        self.num_hiddens = num_hiddens
        self.params = get_params(vocab_size, num_hiddens, device)
        self.init_state, self.forward_fn = init_state, forward_fn

    def __call__(self, X, state):
        X = F.one_hot(X.T, self.vocab_size).type(torch.float32)
        return self.forward_fn(X, state, self.params)

    def begin_state(self, batch_size, device):
        return self.init_state(batch_size, self.num_hiddens, device)
```
我们检查输出是否具有正常的形状，例如隐状态的维数是否保持不变，
```
num_hiddens = 512
net = RNNModelScratch(len(vocab), num_hiddens, d2l.try_gpu(), get_params, init_rnn_state, rnn)
state = net.begin_state(X.shape[0], d2l.try_gpu())
Y, new_state = net(X.to(d2l.try_gpu()), state)
Y.shape, len(new_state), new_state[0].shape
```
## 预测
我们首先定义预测函数来生成prefix之后的新字符，prefix是一个用户提供的包含多个字符的字符串。

在循环遍历prefix中的初始字符时。我们不断地将隐状态传递到下一个时间步，但是不生成任何输出，这被称为预热器，因此在此期间模型会自行更新，但不会进行预测。

预热期结束后，隐状态的值通常比初始值更适合预测，从而预测字符并输出它们。
```
def predict(prefix, num_preds, net, vocab, device):
    '''在prefix后面生成新字符'''
    state = net.begin_state(batch_size=1, device=device)
    outputs = [vocab[prefix[0]]]
    get_input = lambda: torch.tensor([outputs[-1]], device=device).reshape((1, 1))
    # 预热
    for y in prefix[1:]:
        _, state = net(get_input(), state)
        outputs.append(vocab[y])
    # 预测num_preds
    for _ in range(num_preds):
        y, state = net(get_input(), state)
        outputs.append(int(y.argmax(dim=1).reshape(1)))
    return ''.join([vocab.idx_to_token[i] for i in outputs])
```
现在我们可以测试，将前缀指定为time traveller，并基于这个前缀生成10个后续字符。由于我们还没有训练网络，他会生成荒诞的内容。

```
predict('time traveller', 10, net, vocab, device=d2l.try_gpu())
```
## 梯度截断
对于长度为$T$的序列，我们在迭代中计算$T$个时间步上的梯度，将会在反向传播过程中产生长度为$O(T)$的矩阵乘法链。当$T$较大时，它可能导致数值不稳定，例如可能导致梯度爆炸或梯度消失。

因此，循环神经网络往往需要额外的方式来支持稳定训练。

一般来说，当解决优化问题时，我们对模型参数采用更新步骤。假设在向量形式的$x$中，或者在小批量数据的负梯度$g$，使用$\eta >0$作为学习率时，在一次迭代中，我们将$x$更新为$x-\eta g$。

如果我们进一步假设目标函数$f$表现良好，即函数$f$在常数$L$下是利普希茨连续的，也就是说，对于任意$x$和$y$，有
$$
|f(x)-f(y)|\leq L||x-y||
$$

在这种情况下，我们可以安全地假设：如果我们通过$\eta g$更新参数向量，则
$$
|f(x)-f(x-\eta g)|\leq L\eta ||g||
$$

这意味着，我们不会观测到超过$L\eta ||g|| $的变化，它限制了取得进展的速度，但同时限制了事情变糟的程度。

有时梯度可能很大，从而优化算法可能无法收敛。我们可以通过降低学习率$\eta$来解决这个问题。

但是如果我们很少得到大的梯度，降低学习率似乎并非好的方法。一个流行的替代方案是通过将梯度$g$投影回给定半径(如$\theta)$的球来截断梯度$g$，如下式：
$$
g \larr min(1,\frac{\theta}{||g||})g
$$

通过这样做，我们知道梯度范数永远不会超过$\theta$，并且更新后的梯度方向完全与$g$的原始方向一致。

同时，它限制任何给定的小批量数据对参数向量的影响，这赋予模型一定程度的稳定性。

梯度截断提供了一个快速修复梯度报站的方法，虽然它不能完全解决问题，但它是众多有效的技术之一。

下面我们定义一个函数来截断模型的梯度：
```
def grad_clipping(net, theta): #@save
    if isinstance(net, nn.Module):
        params = [p for p in net.parameters()]
    else:
        params = net.params

    norm = torch.sqrt(sum(torch.sum((p.grad**2))for p in params))
    if norm>theta:
        for param in params:
            param.grad[:] *= theta/norm
```

## 训练
在训练模型之前，我们定义一个函数在一轮内训练模型。与之前的训练函数不同：
- 序列数据的不同抽样方法将导致隐状态初始化的差异
- 我们在更新模型参数之前截断梯度。这样操作的目的是，即使训练过程中某个点上发生了梯度爆炸，也能保证模型不会发散
- 我们用困惑度来评估模型。这样的度量保证了不同长度的序列具有可比性

当使用顺序分区时，我们只在每轮的起始位置初始化状态，当前小批量的最后一个样本的隐状态，将用于初始化下一个小批量数据的第一个样本的隐状态。

这样存储在隐状态中的序列的历史信息可以在一轮内流经相邻的子序列。

然而，在任何一点的隐状态的计算，都依赖同一轮前面所有的小批量数据，使得梯度计算变得复杂。为了减小计算量，在处理任何一个小批量数据之前，我们先分离梯度，使得隐状态的梯度计算总是限制在一个小批量数据的时间步内。

当使用随机抽样时，因为每个样本都是在一个随机位置抽样的，所以需要为每轮重新初始化状态。

```
def train_epoch(net, train_iter, loss, updater, device, use_random_iter):
    '''训练网络一轮'''
    state = None
    metric = d2l.Accumulator(2) # 训练损失之和，词元数量
    for X,Y in train_iter:
        if state is None or use_random_iter:
            state = net.begin_state(X.shape[0], device)
        else:
            if isinstance(net, nn.Module) and not isinstance(state, tuple):
                # state对于nn.GRU是一个张量
                state.detach_()
            else:
                # state对于nn.LSTM或对于我们从零开始实现的模型是一个由张量组成的元组
                for s in state:
                    s.detach_()
        y = Y.T.reshape(-1)
        X,y = X.to(device), y.to(device)
        y_hat, state = net(X, state)
        l = loss(y_hat, y.long()).mean()
        updater.zero_grad()
        l.backward()
        grad_clipping(net, 1)
        updater.step()
        metric.add(l*y.numel(), y.numel())
    return math.exp(metric[0]/metric[1])
```
总的训练过程如下：
```
def train(net, train_iter, vocab, lr, num_epochs, device, use_random_iter=False):
    loss = nn.CrossEntropyLoss()
    animator = d2l.Animator(xlabel='epoch', ylabel='perplexity', legend=['train'], xlim=[10, num_epochs])

    updater = torch.optim.SGD(net.params, lr)
    pr = lambda prefix: predict(prefix, 50, net, vocab, device)

    for epoch in range(num_epochs):
        ppl = train_epoch(net, train_iter, loss, updater, device, use_random_iter)
        if (epoch+1)%10 == 0:
            print(pr('time traveller'))
            animator.add(epoch+1, [ppl])
        print(pr('time traveller'))
```
由于数据集较小，所以使用更多的轮次训练：
```
train(net, train_iter, vocab, 1, 100000, 'cuda:0')
```
# 循环神经网络的简洁实现
虽然前文对理解循环神经网络具有指导意义，但并不方便。本节将利用深度学习的框架提供的API高效实现相同的语言模型。

以下内容，为读取数据集获得迭代器与词表的代码，与前文重复：
```
import torch
from torch import nn
from torch.nn import functional as F
from d2l import torch as d2l

import re
import random


d2l.DATA_HUB['time_machine'] = (d2l.DATA_URL+'timemachine.txt','090b5e7e70c295757f55df93cb0a180b9691891a')

def read_time_machine():
    with open(d2l.download('time_machine'), 'r') as f:
        lines = f.readlines()
    return [re.sub('[^A-Za-z]+', ' ', line).strip().lower() for line in lines]

def tokenize(lines, token='word'):
    if token == 'word':
        return [line.split() for line in lines]
    else:
        return [list(line) for line in lines]

import collections


def count_corpus(tokens):
    if len(tokens) == 0 or isinstance(tokens[0], list):
        tokens = [token for line in tokens for token in line]
    return collections.Counter(tokens)

class Vocab:
    def __init__(self, tokens, min_freq=0, reversed_tokens=None):
        if tokens is None:
            tokens = []
        if reversed_tokens is None:
            reversed_tokens = []

        counter = count_corpus(tokens)
        self._token_freqs = sorted(counter.items(), key=lambda x:x[1], reverse=True)

        self.idx_to_token = ['<unk>'] + reversed_tokens
        self.token_to_idx = {token: idx for idx, token in enumerate(self.idx_to_token)}

        for token, freq in self._token_freqs:
            if freq<min_freq:
                break
            if token not in self.token_to_idx:
                self.idx_to_token.append(token)
                self.token_to_idx[token] = len(self.idx_to_token)-1

    def __len__(self):
        return len(self.idx_to_token)

    def __getitem__(self, tokens):
        if not isinstance(tokens, (list, tuple)):
            return self.token_to_idx.get(tokens, self.unk)

        return [self.__getitem__(token) for token in tokens]

    def to_tokens(self, indices):
        if not isinstance(indices, (list, tuple)):
            return self.idx_to_token[indices]
        return [self.idx_to_token[index] for index in indices]

    @property
    def unk(self):
        return 0

    @property
    def token_freqs(self):
        return self._token_freqs

def seq_data_iter_random(corpus, batch_size, num_steps):
    corpus = corpus[random.randint(0, num_steps-1):]
    num_subseqs = (len(corpus)-1)//num_steps # 考虑标签
    initial_indices = list(range(0, num_subseqs*num_steps, num_steps))

    random.shuffle(initial_indices)

    def data(pos):
        return corpus[pos:pos+num_steps]

    num_batchs = num_subseqs//batch_size

    for i in range(0, num_batchs*batch_size, batch_size):
        initial_indices_per_batch = initial_indices[i:i+batch_size]
        X = [data(j) for j in initial_indices_per_batch]
        Y = [data(j+1) for j in initial_indices_per_batch]
        yield torch.tensor(X), torch.tensor(Y)

def seq_data_iter_sequential(corpus, batch_size, num_steps):
    offset = random.randint(0, num_steps)
    num_tokens = ((len(corpus)-offset-1)//batch_size)*batch_size
    Xs = torch.tensor(corpus[offset:offset+num_tokens])
    Ys = torch.tensor(corpus[offset+1:offset+num_tokens+1])
    Xs, Ys = Xs.reshape((batch_size, -1)), Ys.reshape((batch_size, -1))
    num_batchs = Xs.shape[1]//num_steps
    for i in range(0, num_steps*num_batchs, num_steps):
        X = Xs[:, i:i+num_steps]
        Y = Ys[:, i:i+num_steps]
        yield X, Y

def load_corpus_time_machine(max_tokens = -1):
    lines = read_time_machine()
    tokens = tokenize(lines, 'char')
    vocab = Vocab(tokens)
    corpus = [vocab[token] for line in tokens for token in line]
    if max_tokens>0:
        corpus = corpus[:max_tokens]
    return corpus, vocab

class SeqDataLoader:
    def __init__(self, batch_size, num_steps, use_random_iter, max_tokens):
        if use_random_iter:
            self.data_iter_fn = seq_data_iter_random
        else:
            self.data_iter_fn = seq_data_iter_sequential

        self.corpus, self.vocab = load_corpus_time_machine(max_tokens)
        self.batch_size, self.num_steps = batch_size, num_steps

    def __iter__(self):
        return self.data_iter_fn(self.corpus, self.batch_size, self.num_steps)

def load_data_time_machine(batch_size, num_steps,use_random_iter=False, max_tokens = 10000):
    data_iter = SeqDataLoader(batch_size, num_steps, use_random_iter, max_tokens)
    return data_iter, data_iter.vocab

batch_size, num_steps = 32, 35
train_iter, vocab = load_data_time_machine(batch_size, num_steps)
```
## 定义模型
我们构建一个具有256个隐藏单元的单隐藏层的循环神经网络层rnn_layer，
```
num_hiddens = 256
rnn_layer = nn.RNN(len(vocab), num_hiddens)
```
我们使用张量来初始化状态，它的形状是(隐藏层数，批量大小，隐藏单元数)
```
state = torch.zeros((1, batch_size, num_hiddens))
state.shape
```

通过一个隐状态和一个输入，我们就可以用更新后的隐状态计算输出。

需要强调的是，rnn_layer的输出Y不涉及输出层的计算，它是指每个时间步的隐状态，这些隐状态可以用作后续输出层的输出。

```
X = torch.rand(size=(num_steps, batch_size, len(vocab)))
Y, state_new = rnn_layer(X, state)
Y.shape, state_new.shape
```

我们为完整的循环神经网络定义一个RNNModel类，rnn_layer只包含隐藏的循环层，我们还需要单独创建一个输出层。

```
class RNNModel(nn.Module):
    def __init__(self, rnn_layer, vocab_size, **kwargs):
        super(RNNModel, self).__init__(**kwargs)
        self.rnn = rnn_layer
        self.vocab_size = vocab_size
        self.num_hiddens = self.rnn.hidden_size

        if not self.rnn.bidirectional:
            self.rnn_directions = 1
            self.linear = nn.Linear(self.num_hiddens, self.vocab_size)

        else:
            self.rnn_directions = 2
            self.linear = nn.Linear(self.num_hiddens*2, self.vocab_size)

    def forward(self, inputs, state):
        X = F.one_hot(inputs.T.long(), self.vocab_size)
        X = X.type(torch.float32)
        Y, state = self.rnn(X, state)
        output = self.linear(Y.reshape(-1, Y.shape[-1]))
        return output, state

    def begin_state(self, device, batch_size=1):
        if not isinstance(self.rnn, nn.LSTM):
            return torch.zeros(size=(self.rnn.num_layers*self.rnn_directions, batch_size, self.num_hiddens), device=device)
        else:
            return (
                torch.zeros((
                    self.num_hiddens*self.rnn.num_layers, batch_size, self.num_hiddens
                ), device=device),
                torch.zeros((
                    self.num_hiddens*self.rnn.num_layers,batch_size,
                    self.num_hiddens
                ), device=device)
            )
```
## 训练与预测
在训练模型之前，我们基于一个具有随机权重的模型进行预测：
```
device = 'cuda:0'
net = RNNModel(rnn_layer, len(vocab))
net = net.to(device)

def predict(prefix, num_preds, net, vocab, device) :
    outputs = [vocab[prefix[0]]]
    state = net.begin_state(batch_size=1, device=device)
    get_input = lambda: torch.tensor([outputs[-1]], device=device).reshape((1,1))
    for y in prefix[1:]:
        _, state = net(get_input(), state)
        outputs.append(vocab[y])
    for _ in range(num_preds):
        y, state = net(get_input(), state)
        outputs.append(int(y.argmax(dim=1).reshape(1)))
    return ''.join([vocab.idx_to_token[i]for i in outputs])

predict('time', 5, net, vocab, device)
```

接下来，对该模型进行训练。
```
import math


def grad_clipping(params, theta):
    norm = torch.sqrt(sum(torch.sum((p.grad**2)) for p in params))
    if norm>theta:
        for p in params:
            p.grad[:] *= theta/norm

def train_epoch(net, train_iter, loss, updater, use_random_iter):
    state = None
    total_loss, n_train = 0, 0
    for X, Y in train_iter:
        if state == None or use_random_iter:
            state = net.begin_state(batch_size=X.shape[0], device=device)
        else:
            if isinstance(net, nn.Module):
                state.detach_()
            else:
                for s in state:
                    s.detach_()
        y = Y.T.reshape(-1)

        X, y = X.to(device), y.to(device)
        y_hat, state = net(X, state)
        l = loss(y_hat, y).mean()

        updater.zero_grad()
        l.backward()
        grad_clipping(net.parameters(), theta=1)
        updater.step()

        total_loss += l*y.numel()
        n_train += y.numel()

    return math.exp(total_loss/n_train)

def train(net, train_iter, vocab, lr, num_epochs, device, use_random_iter):
    updater = torch.optim.SGD(net.parameters(), lr)
    loss = nn.CrossEntropyLoss(reduction='none')
    animator = d2l.Animator(xlabel='epoch', ylabel='perlexity', legend=['train'], xlim=[10, num_epochs])

    for epoch in range(num_epochs):
        ppl = train_epoch(net, train_iter, loss, updater, use_random_iter)
        if (epoch+1)%10 == 0:
            animator.add(epoch+1, [ppl])

    print(predict('time', 5, net, vocab, device))
```
