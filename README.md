# DaydreamerH Game Dev Training Desk

面向游戏开发学习与求职准备的个人训练工作台。当前包含知识库、AI 辅助问答与 CG/WebGL 实验模块，内容以静态文件维护，便于长期扩展与 Git 管理。

## 技术选择

- Astro：生成静态页面，适合文档型知识库与实验索引。
- Markdown/MDX Content Collection：知识文章以文件形式维护。
- Three.js：承载浏览器中的 CG/WebGL 实验。
- CodeMirror：提供实验代码编辑体验。
- 本地课程包：AI 负责提问、判断与解释，代码推进优先使用本地预设 patch。

## 常用命令

```bash
npm install
npm run dev -- --port 4321
npm run build
npm run test:graphics-lab
npm run preview
```

## 新增知识文章

在 `src/content/knowledge` 下新增 Markdown 或 MDX 文件，并补充 frontmatter。字段约束见 `src/content/config.ts`，分类显示名称见 `src/data/navigation.ts`。

```md
---
title: "知识点标题"
description: "一句话说明这个知识点解决什么问题。"
category: "ue-core"
track: "UE Gameplay Programmer"
level: "foundation"
status: "ready"
minutes: 30
order: 40
prerequisites: ["前置知识"]
tags: ["UE", "C++"]
---

正文内容。
```

## CG 实验课程包

CG 实验课程放在：

```text
src/graphics-lessons/
```

每个课程包通常包含：

```text
manifest.json
lesson.md
starter/
patches/
reference/
```

新增或批量生成课程前，先阅读完整规范：

```text
docs/graphics-lesson-pipeline.md
```

当前参考课程：

```text
src/graphics-lessons/hello-triangle/
```

当前样例生成器：

```bash
node scripts/generate-graphics-lesson.mjs
```

这个生成器目前仍是 Hello Triangle 专用脚本。后续做批量生成时，应升级为可接受源码目录与输出目录的通用脚本，例如：

```bash
node scripts/generate-graphics-lesson.mjs --source-root OpenGLProject/src --out-root src/graphics-lessons --all --draft
```

生成或修改课程包后，运行：

```bash
npm run build
npm run test:graphics-lab
```
