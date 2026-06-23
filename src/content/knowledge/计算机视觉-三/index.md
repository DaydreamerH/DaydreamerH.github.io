---
title: "计算机视觉（三）"
description: ""
date: "2024-03-14 14:24:30"
category: "AI / 深度学习"
originalCategory: "AI / 深度学习"
track: "AI / Deep Learning"
level: foundation
status: draft
published: false
minutes: 5
order: 1000
prerequisites: []
tags: ["cv", "AI"]
source: "_posts"
---# 边缘检测
图像中的边缘是像素灰度值发生加速变化而不连续的结果。

## 检测原理
像素灰度值的变化可利用计算导数的方法来检测，一般使用一阶或二阶导数。
