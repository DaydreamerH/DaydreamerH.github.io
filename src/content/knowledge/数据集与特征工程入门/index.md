---
title: "数据集与特征工程入门"
description: ""
date: "2024-01-25 13:55:27"
category: "AI / 深度学习"
originalCategory: "AI / 深度学习"
track: "AI / Deep Learning"
level: foundation
status: draft
published: false
minutes: 5
order: 1000
prerequisites: []
tags: ["AI"]
source: "_posts"
---
# sklearn数据集
## sklearn数据集API介绍
sklearn.datasets
- 加载获取流行数据集
### datasets.load_*()
- 获取小规模数据集，数据包含在datasets里
- 鸢尾花数据集：`sklearn.datasets.load_iris()`
- 波士顿房价数据集：`sklearn.datasets.load_bostn()`
### datasets.fetch_*(data_home = None, subset = "all")
- 获取大规模数据集，需要从网络上下载
- -subset可选
  - train
  - test
  - all
### 返回结果
返回Bunch类，继承至字典
- data：特征数据数组
  - 是[n_samples * n_features]的二维numpy.ndarray数组
- target：标签数组
  - 是[n_samples]的一维数组
- DESCR：数据描述
- feature_name：特征名
- target_names：标签名

## 数据集的划分
- 训练数据集
- 测试数据集
### sklearn.model_selection.train_test_split(arrays, *options)
- 输入的参数
  - x 数据集的特征值
  - y 数据集的标签值
  - test_size 测试集的大小，float类型
  - random_state 随机数种子，不同的种子会造成不同的随机采样结果
- 返回的结果
  - 训练集特征值
  - 测试集特征值
  - 训练集目标值
  - 测试集目标值

## 示例
```
from sklearn.datasets import load_iris
from sklearn.model_selection import train_test_split


def show_dataset():
    iris = load_iris()
    print("鸢尾花数据集：\n", iris)
    print("相关描述：\n", iris["DESCR"])
    print("查看特征值的名字：\n", iris.feature_names)

    x_train, x_test, y_train, y_test = train_test_split(iris.data, iris.target, test_size = 0.2)
    print("训练集的特征值的结构：\n", x_train.shape)

    return None


if __name__=="__main__":
    show_dataset()

```
# 特征工程
数据和特征决定了机器学习的上限，模型和算法只是逼近这个上限
## 特征抽取
将任意数据转换为可用于机器学习的数字特征
### 字典特征提取
sklearn.feature_exctraction.DictVectorizer(sparse = True,...)
- 常用方法
  - DictVectorizer.fit_transform(X)
    - X是字典或包含字典的迭代器
    - 返回sparse矩阵
  - DictVectorizer.inverse_transform(X)
    - X是array数组或者sparse矩阵
    - 返回转换之前的数据格式
  - DictVectorizer.get_feature_names()
    - 返回类别名称
- sparse=True返回稀疏矩阵
  - 稀疏矩阵是指只保留非0的特征值，及位置
  - 省略0，节省内存
  - 比如某些互斥类别区分时，往往存在多个0，少量1的情况，只保留1及其位置
- sparse=False返回完整矩阵
#### one-hot编码
对于类别区分，one-hot编码可能导致部分类别在数字大小上差距较大，影响分类情况

例如有以下分类：车、人、猫

数据集有2个样本：分别是车和猫

- 对于稀疏矩阵
  - (0, 0) 1
  - (1, 2) 2
- 对于完整矩阵
  - (1, 0, 0)
  - (0, 0, 1)
- 对于one-hot编码
  - 1
  - 4

#### 应用场景
- 数据集当中类别特征较多
  1. 将数据集的特征转为字典类型
  2. DictVectorizer转换
- 最初的数据是字典类型

#### 示例
```
from sklearn.feature_extraction import DictVectorizer


def show_extraction():
    data = [{"种类" : "猫", "value" : 100}, {"种类" : "狗", "value" : 10},{"种类" : "猪", "value" : 0}]

    '''
        sparse = True
        稀疏矩阵
    '''
    transfer = DictVectorizer()
    data_new = transfer.fit_transform(data)
    print("data_new: \n", data_new)

    '''
        sparse = False
    '''
    transfer = DictVectorizer(sparse=False)
    data_new  = transfer.fit_transform(data)
    print("feature_name: \n", transfer.get_feature_names_out())
    print("data_new: \n", data_new)



if __name__ == "__main__":
    show_extraction()

```


### 文本特征提取
#### sklearn.feature_extraction.text.CountVectorizer(stop_words = [])
- 返回词频矩阵
- stop_words，停用词
  - 例如if，too等不重要的词忽略，则加入此列表
- 常用方法
  - CountVectorizer.fit_transform(X)
    - X是文本或者包含文本字符串的可迭代对象
    - 返回sparse矩阵
  - CountVectorizer.inverse_transform(X)
    - X是array数组或者sparse矩阵
    - 返回之前的数据格式
  - CountVectorizer.get_feature_name()
    - 返回单词列表

#### 示例
```
from sklearn.feature_extraction.text import CountVectorizer


def show_extraction():
    texts = ["english good much", "english is good hello"]

    transfer = CountVectorizer()
    data_new = transfer.fit_transform(texts)
    print("sparse矩阵:\n", data_new)
    print(transfer.get_feature_names_out())
    print(data_new.toarray())
    return None


if __name__ == "__main__":
    show_extraction()

```

#### 中文文本特征提取
