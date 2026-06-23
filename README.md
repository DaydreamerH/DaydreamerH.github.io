# CGWeb Knowledge Base

面向 UE5 游戏行业求职准备的纯静态知识库。当前版本先聚焦知识库模块，后续可以继续扩展测验、实验任务和作品集追踪。

## 技术选择

- Astro：生成纯静态页面，适合文档型知识库。
- Markdown/MDX Content Collection：知识点以文件形式维护，便于 Git 管理和长期扩展。
- 原生前端筛选：当前无需后端，也无需数据库。

## 常用命令

```bash
npm install
npm run dev -- --port 4321
npm run build
npm run preview
```

## 新增知识点

在 `src/content/knowledge` 下新增 Markdown 文件，并补充 frontmatter：

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

## 为什么重要

正文内容。
```

`category`、`track`、`level` 等字段的合法值定义在 `src/content/config.ts`。分类显示名称位于 `src/data/navigation.ts`。
