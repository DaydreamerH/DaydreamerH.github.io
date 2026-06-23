# CG Experiment Lesson Pipeline

This document defines how to turn graphics source code into static CG experiment lesson packs. It is written for future maintainers and AI coding agents that need to add lessons without changing the product rules each time.

The site does not run OpenGL source code directly. Source projects are treated as reference material. The actual browser experiment should run with WebGL-facing code, currently Three.js plus `ShaderMaterial`.

## Goals

- Keep every experiment as a static lesson pack under `src/graphics-lessons/`.
- Let AI guide the learner with short questions, but keep code changes deterministic through local patches.
- Use source code as reference material, not as user-facing implementation detail.
- Make lessons batch-generatable, reviewable, and testable before they appear on the site.

## Lesson Pack Layout

Each lesson lives in one folder:

```text
src/graphics-lessons/<lesson-id>/
  manifest.json
  lesson.md
  starter/
    main.js
    vertex.glsl
    fragment.glsl
  patches/
    01-topic-name.json
    02-topic-name.json
  reference/
    main.cpp
    source-notes.md
```

Required files:

- `manifest.json`: lesson metadata, AI teaching rules, checkpoints, and source notes.
- `starter/main.js`: initial browser-side experiment code.
- `starter/vertex.glsl`: initial vertex shader.
- `starter/fragment.glsl`: initial fragment shader.
- `patches/*.json`: local deterministic code changes applied after correct answers.

Optional files:

- `lesson.md`: user-facing reading material.
- `reference/*`: source code, source notes, or extracted snippets that help AI understand the original task.

## Manifest Contract

`manifest.json` is the main contract between the static site, the AI guide, and the lesson author.

Required user-facing fields:

```json
{
  "id": "hello-triangle",
  "title": "Hello Triangle",
  "category": "CG 实验",
  "level": "intro",
  "createdAt": "2026-06-23",
  "description": "在浏览器中补全一个基础三角形渲染实验，理解顶点数据、片元颜色和顶点颜色插值。",
  "previewTitle": "Hello Triangle"
}
```

Required AI-facing fields:

```json
{
  "source": "OpenGLProject/src/02_hello_triangle",
  "runtime": "three-shader-material",
  "aiBrief": "面向 AI 的课程说明，只用于指导对话，不直接展示给用户。",
  "referenceBrief": [
    "源代码中的核心概念摘要。"
  ],
  "teachingRules": [
    "每轮只提出一个问题。",
    "回答正确或基本正确时，返回当前 checkpoint 的 patchId。",
    "回答不完整时给一个提示，不要应用 patch。",
    "不要输出大段完整代码，代码变更由本地 patch 完成。"
  ]
}
```

Required checkpoint fields:

```json
{
  "id": "triangle-vertices",
  "title": "定义三角形顶点",
  "concept": "这一阶段要理解的概念。",
  "question": "只包含一个主问题。",
  "expectedKeywords": ["3", "顶点", "float"],
  "hint": "用户答错或不完整时给出的短提示。",
  "patchId": "01-triangle-vertices",
  "expectedObservation": "应用 patch 后用户应该在画布中看到什么。"
}
```

## Patch Contract

Patch files live in `patches/`. A patch is deterministic and must be safe to apply locally.

```json
{
  "id": "01-triangle-vertices",
  "description": "写入三个裁剪空间顶点。",
  "changes": [
    {
      "file": "main.js",
      "operation": "replace",
      "target": "const positions = new Float32Array([\\n  // TODO\\n]);",
      "content": "const positions = new Float32Array([\\n  0.0, 0.6, 0.0,\\n -0.6,-0.5, 0.0,\\n  0.6,-0.5, 0.0\\n]);"
    }
  ]
}
```

Supported operations:

- `replace`: replace an exact target string in one starter file.
- `replace_all`: replace an entire file.

Patch rules:

- One checkpoint should normally apply one patch.
- A patch may touch multiple files when the concept requires it.
- Avoid fragile targets. Put clear TODO blocks in starter code so replacements are stable.
- Do not rely on AI-generated code for required progress. AI should return `patchId`; the page applies local patch content.

## How To Choose Checkpoints

Checkpoint count should follow concept count, not file count.

Recommended ranges:

- Small experiment: 3-5 checkpoints.
- Medium experiment: 6-10 checkpoints.
- Large topic: split into multiple lessons.

Good checkpoint topics:

- What data is sent to the GPU?
- Which shader stage owns this responsibility?
- How is a vertex attribute interpreted?
- What value changes the visible result?
- What should the learner observe after this patch?

Avoid:

- Asking several questions in one checkpoint.
- Asking about syntax that is not related to the visual concept.
- Exposing internal source paths or runtime details in user-facing descriptions.
- Letting AI write the entire final code during the guided phase.

## Source-To-Lesson Batch Flow

Raw source projects can remain outside the tracked site repository. The current ignored source location is:

```text
OpenGLProject/
```

Recommended batch input shape:

```text
OpenGLProject/src/
  02_hello_triangle/
    main.cpp
    CMakeLists.txt
  03_shaders/
    main.cpp
    shader.vs
    shader.fs
```

Batch generation should follow these stages:

1. Scan each source lesson directory.
2. Copy only useful reference files into `reference/`.
3. Extract source notes into `reference/source-notes.md`.
4. Generate `starter/` WebGL files with TODO blocks.
5. Generate `manifest.json` with checkpoint drafts.
6. Generate patch drafts for each checkpoint.
7. Register the lesson in `src/data/graphicsLessons.ts`.
8. Build and verify.
9. Manually review user-facing text and visual behavior.

The existing sample generator is:

```bash
node scripts/generate-graphics-lesson.mjs
```

At the moment it is a fixed Hello Triangle generator. For real batch use, upgrade it to accept source and output arguments:

```bash
node scripts/generate-graphics-lesson.mjs --source-root OpenGLProject/src --out-root src/graphics-lessons --all --draft
```

Recommended future npm script:

```json
{
  "scripts": {
    "generate:graphics-lessons": "node scripts/generate-graphics-lesson.mjs --source-root OpenGLProject/src --out-root src/graphics-lessons --all --draft"
  }
}
```

After generation:

```bash
npm run build
npm run test:graphics-lab
```

## Registration Rule

After a lesson folder is generated, it must be imported in `src/data/graphicsLessons.ts`.

Current pattern:

```ts
import manifestRaw from "../graphics-lessons/<lesson-id>/manifest.json?raw";
import starterMain from "../graphics-lessons/<lesson-id>/starter/main.js?raw";
import vertexShader from "../graphics-lessons/<lesson-id>/starter/vertex.glsl?raw";
import fragmentShader from "../graphics-lessons/<lesson-id>/starter/fragment.glsl?raw";
import patch01Raw from "../graphics-lessons/<lesson-id>/patches/01-topic.json?raw";
```

When the number of lessons grows, replace manual imports with a typed `import.meta.glob` loader. That should be done before adding many lessons.

## Review Checklist

Before committing a generated lesson:

- `manifest.json` parses correctly.
- `category`, `description`, and card text are user-facing, not AI instructions.
- Every checkpoint asks exactly one main question.
- Every checkpoint has a matching patch file.
- Every patch can be applied from the current starter state.
- The final lesson state renders without shader errors.
- The first AI question appears only after API setup.
- The guided phase ends with a completion message and allows free questions or free code modification.
- No private repository-only paths are shown on user-facing cards.

## Handoff Notes For AI Agents

When another AI agent continues this pipeline:

1. Read this document first.
2. Inspect `src/graphics-lessons/hello-triangle/` as the reference implementation.
3. Do not expose `source`, `runtime`, or private paths in user-facing UI.
4. Prefer local patches over free-form generated code during checkpoints.
5. Keep lesson descriptions calm and functional.
6. Run build and graphics lab verification before committing.
