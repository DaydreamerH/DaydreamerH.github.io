# Blog Topic Audit - 2026-06-28

## 现有内容概览

仅按标题、分类和标签观察，博客主要集中在以下方向：

- Unreal / Gameplay：Actor 生命周期、Tick、Subsystem、Tasks、Delegates、反射宏、UPROPERTY/UFUNCTION、接口、智能指针、资源引用、Asset Manager、GAS、多人 TPS、动画、材质瞄准镜、对象池、延迟补偿。
- C++ 基础：关键字、类型转换、类、继承、内存、字节对齐、函数与复合类型。
- 图形与高性能计算：OptiX、CUDA、GEMM、矩阵分解、Bank Conflict、Warp Tiling。
- AI / 深度学习：PyTorch、CNN/RNN/Transformer、CV、数据处理、注意力机制。
- 计算机基础：OS、Socket、分布式系统。
- 其他笔记与作品集：课程笔记、项目总结、个人记录。

## 本次补充选题

新增文章：`Gameplay Tags in Unreal Engine`

选题理由：

- 现有 UE 文章里已经多次局部使用 Gameplay Tags，例如 GAS 开火预测、瞄准镜材质参数、子弹对象池与命中 Cue，但缺少一篇独立介绍标签系统的基础文章。
- Gameplay Tags 是 GAS、GameplayCue、Ability 规则、武器分类、状态表达、数据驱动条件判断之间的共同语义层。
- 该主题能连接已有 UE Gameplay 内容，且不会重复 Actor 生命周期、Tick、Subsystem、Tasks、Delegates、反射、资产管理等已覆盖主题。

## 标注

新增文章在 frontmatter `tags` 中标注 `AI Generated`。
