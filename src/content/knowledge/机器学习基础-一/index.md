---
title: "机器学习基础（一）"
description: "常见任务与线性回归"
date: "2023-10-14 20:07:06"
category: "AI / 深度学习"
originalCategory: "杂七杂八"
track: "AI / Deep Learning"
level: foundation
status: ready
published: true
minutes: 5
order: 1000
prerequisites: []
tags: ["AI"]
photos: "banner.jpg"
source: "_posts"
---
# 学习算法
对于某类任务T和性能度量P，一个计算机程序认为可以从经验E中学习是指，通过经验E改进后，它在任务T上由性能度量P衡量的性能会有所提升。
## 任务T
### 分类
在这类任务中，计算机需要指定某些输入属于$k$类中的哪一类。
### 输入缺失分类
输入向量的每个度量不被保证。
### 回归
在这类任务中，计算机需要对给定输入预测数值。
### 转录
在这类任务中，机器学习系统预测一些相对非结构化表示的数据，并转录信息为离散的文本形式。
### 机器翻译
输入是一种语言的符号序列，计算机程序必须将其转换为另一种语言的符号序列。
### 结构化输出
输出是向量或者其他包含多个值的数据结构，并且构成输出的这些不同元素间具有重要关系。
### 异常检测
计算机程序在一组事件或对象中筛选，并标记不正常或非典型的个体。
### 合成和采样
机器学习程序生成一些和训练数据相似的新样本。
### 缺失值填补
机器学习算法给定一个新样本$x \in R^n$,$x$中某些元素缺失，算法必须填补这些缺失值。
### 去噪
机器学习算法的输入是，$干净样本 x \in R^n$经过未知损坏过程后得到的损坏样本$\widetilde{x} \in R^n$.算法根据损坏后的样本$\widetilde{x}$预测干净的样本$x$，或者更一般地预测条件概率分布$p(x|\widetilde{x})$.
### 密度估计或概率质量函数估计
机器学习算法学习函数$p_{model} : R^n \rightarrow R$,其中$p_{model}(x)$可以解释成样本采样空间的概率密度函数或者概率质量函数。
## 性能度量P
- 对于诸如分类、缺失输入分类和转录任务，通常度量模型的准确率或错误率
- 对于密度估计任务，最常用的方法是输出模型在一些样本上概率对数的平均值。
## 经验E
### 无监督学习算法(unsupervised learning algorithm)
训练含有很多特征的数据集，然后学习出这个数据集上有用的结构性质。

观察随机向量$x$的好几个样本，试图显示或隐式地学习出概率分布$p(x)$，或者该分布一些有意思的性质
### 监督学习算法(supervised learning algorithm)
训练含有很多特征的数据集，不过数据集中的样本都有一个标签(label)或目标(target)。

观察随机向量$x$及其相关联的值或向量$y$，然后从$x$预测$y$，通常是估计$p(y|x)$。
# 线性回归
建立一个系统，将向量$x \in R^n$作为输入，预测标量$y \in R$作为输出。线性回归的输出是其输入的线性函数。
## 基本定义
令$\widehat{y}$表示模型预测$y$应该取的值。我们定义输出为：
$$
\widehat{y} = w^T x
$$
其中$w \in R^n$是参数向量。
## 参数
参数是控制系统行为的值。

在线性回归中，我们可以将$w$看作一组决定每个特征如何影响预测的权重。
## 性能度量P
### 测试集
- 输入的设计矩阵记作：$X^{(test)}$
- 回归目标向量记作：$y^{(test)}$
### 均方误差(mean squard error)
m个输入样本组成的设计矩阵评估模型性能。
$$
MSE_{test} = \frac{1}{m}\sum_i(\widehat{y}^{test} - y^{test})^2_i\\
MSE_{test} = \frac{1}{m}||\widehat{y}^{(train)}-y^{(train)}||^2_2
$$
### 最小化$MSE_{train}$
设计一个算法，通过观察训练集$(X^{train},y^{train})$获得经验，减小$MSE_{train}$以改进权重$w$

求$MSE_{train}$的导数为0的情况：
$$
\nabla_w MSE_{train} = 0\\
\nabla_w \frac{1}{m}||\widehat{y}^{(train)}-y^{(train)}||^2_2=0\\
\frac{1}{m} \nabla_w ||X^{(train)}w-y^{(train)}||^2_2==0\\
$$
> $$
> x^Tx=\sum_i|x_i^2|=||x||^2_2\\
> $$

$$
\nabla_w (X^{(train)}w-y^{(train)})^T(X^{(train)}w-y^{(tain)})=0\\
$$
> $$
> (AB)^T = B^TA^T,(A-B)^T = A^T - B^T,x^Ty=y^Tx\\
> x^Ty = (x^Ty)^T = y^Tx\\{\text{ 两个向量乘积是标量，标量转置是自身}}\\
> $$

$$
\nabla_w (w^TX^{(train)T}X^{(train)}w-2w^TX^{(train)T}y^{(train)}-y^{(train)T}y^{(train)})=0\\
$$
> $a$为常数,A是矩阵：
> $$
\nabla_x(x^Ta) = a\\
\nabla_x(x^TAx)=(A^T+A)x
> $$
$$
2X^{(train)T}X^{(train)}w-2X^{(train)T}y^{(train)}=0\\
w=(X^{(train)T}X^{(train)})^{-1}X^{(train)T}y^{(train)}
$$
我们得到了最终的$w$的表达式，称为正规方程。

## 截距b
线性回归通常指额外附加参数b的模型
$$
\widehat{y}=w^Tx+b
$$
截距项b通常称为仿射变换的偏置参数。
## 总结
在线性回归中，我们制定了任务，预测$y$，指定了度量参数，均方误差$MSE$，并推到了降低误差的方法。
