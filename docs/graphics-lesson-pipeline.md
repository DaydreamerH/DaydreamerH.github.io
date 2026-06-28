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
    scene.json
    geometry.json
    <runtime-shader-or-helper-files>
  patches/
    01-topic-name.json
    02-topic-name.json
  reference/
    main.cpp
    source-notes.md
```

Required files:

- `manifest.json`: lesson metadata, AI teaching rules, checkpoints, and source notes.
- `starter/main.js`: browser-side experiment entry file.
- `starter/*`: WebGL-facing shader, scene, geometry, data, or helper files used by the browser experiment.
- `patches/*.json`: local deterministic code changes applied after correct answers.

Optional files:

- `lesson.md`: user-facing reading material.
- `reference/*`: source code, source notes, or extracted snippets that help AI understand the original task.

Runtime rule:

- The browser executes the single `workspaceFiles` item whose `role` is `entry`; current generated lessons normally use `starter/main.js`.
- The entry file receives `THREE`, `OrbitControls`, `canvas`, `files`, `getFile`, and `report`.
- The runtime does not infer shader names. The entry file must read shader, json, or helper files through `getFile("exact-file-name")`, normally using file names declared in `scene.json`.
- Complex lessons should use `getFile("some-file.glsl")` when selecting among multiple shader files.
- Patches may modify any file in the lesson workspace and may add new files with `replace_all`.
- Do not put raw OpenGL-only files into `starter/` unless they have been converted into runnable WebGL/Three.js lesson files. Raw source files belong in `reference/`.
- File count is not limited. The lesson author may introduce more starter files when that makes the experiment clearer, for example `scene.json`, `geometry.json`, `cube.vertex.glsl`, `cube.fragment.glsl`, `light.vertex.glsl`, or `light.fragment.glsl`.
- Every visible starter file must be explained by `workspaceFiles` and connected to at least one checkpoint through `checkpoint.files`. If a file is not part of the learner-facing workflow, keep it in `reference/` instead of `starter/`.

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
  "workspaceFiles": [
    {
      "path": "main.js",
      "role": "entry",
      "concept": "browser runtime entry and scene orchestration",
      "visible": true
    },
    {
      "path": "cube.fragment.glsl",
      "role": "shader",
      "concept": "object material fragment lighting",
      "visible": true
    }
  ],
  "shaderSets": [
    {
      "name": "cube",
      "role": "object/material shader program",
      "vertex": "reference/cube.vs",
      "fragment": "reference/cube.fs"
    }
  ],
  "teachingRules": [
    "每轮只提出一个问题。",
    "回答正确或基本正确时，返回当前 checkpoint 的 patchId。",
    "回答不完整时给一个提示，不要应用 patch。",
    "不要输出大段完整代码，代码变更由本地 patch 完成。"
  ]
}
```

`workspaceFiles` describes files that the browser experiment can load and the learner may inspect. `shaderSets` describes the original source shader relationships for AI reference. A file can appear in both concepts only after it has been converted into a runnable starter file; otherwise it stays in `reference/`.

Required checkpoint fields:

```json
{
  "id": "triangle-vertices",
  "title": "定义三角形顶点",
  "concept": "这一阶段要理解的概念。",
  "files": ["geometry.json", "main.js"],
  "flow": "observe_then_question",
  "question": "只包含一个主问题。",
  "expectedKeywords": ["3", "顶点", "float"],
  "hint": "用户答错或不完整时给出的短提示。",
  "patchId": "01-triangle-vertices",
  "expectedObservation": "应用 patch 后用户应该在画布中看到什么。"
}
```

`checkpoint.files` declares which starter files are taught by that checkpoint. This field is required by the pipeline because every visible starter file must be covered by at least one checkpoint.

`checkpoint.flow` declares the teaching order:

- `observe_then_question`: apply the local patch first, run the preview, tell the learner what changed, then ask the learner to explain the phenomenon. Use this when the question depends on a visible result.
- `answer_then_patch`: ask the learner to predict or reason first, then apply the patch after a correct answer. Use this when the learning goal is prediction.
- `question_only`: ask a concept question and advance with `nextCheckpointId`; no code patch is applied.

Choose the flow from the learning goal. Do not make every checkpoint a code patch, and do not ask users to explain a visual result before the result exists.

For the final checkpoint, completion is only reached when the learner answers that final question correctly or basically correctly. The guide response should return `type: "summary"` and `answerCorrect: true`, with a short completion message and no `question`, `patchId`, or `nextCheckpointId`. If the answer is wrong, incomplete, or the learner says they do not know, repeat the same final question with a targeted hint instead of ending the lesson.

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

- `replace`: replace an exact target string in one lesson workspace file.
- `replace_all`: replace an entire file.

Patch rules:

- One checkpoint should normally apply one patch.
- A patch may touch multiple files when the concept requires it.
- A patch may add a new file by using `replace_all` on a file name that does not exist yet.
- A patch should only include files that actually change. Do not include unchanged files for review cosmetics or context padding.
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

## Course Folder Management

Graphics lessons are managed like blog posts: each lesson owns one folder, and the site scans lesson folders automatically. Do not centralize lesson content in a single registry or generator file.

Recommended folder naming:

```text
src/graphics-lessons/
  hello-triangle/
  shaders/
  textures/
```

Classification belongs to each lesson's `manifest.json`:

```json
{
  "id": "hello-triangle",
  "title": "Hello Triangle",
  "category": "Shader 基础",
  "series": "LearnOpenGL 基础",
  "order": 2,
  "createdAt": "2026-06-23"
}
```

The current required fields still follow the Manifest Contract above. Optional classification fields such as `series` and `order` may be added later when the WebGL index needs richer grouping.

## Recipe Drafts

Batch-generated lessons should start from recipe drafts. Recipes are stored separately from generated lesson packs:

```text
src/graphics-lesson-recipes/<lesson-id>/
  recipe.json
```

The recipe is the editable source for a generated lesson. It should contain the lesson id, source folder name, user-facing text, optional `series`/`order`, starter files, workspace file metadata, and checkpoint definitions. The generator converts those fields into a complete `src/graphics-lessons/<lesson-id>/` pack.

Generated lesson folders are build artifacts of this pipeline. Running the generator always rewrites the matching `src/graphics-lessons/<lesson-id>/` folder from its recipe; do not add per-lesson "preserve existing" exceptions. Manual changes that must survive regeneration belong in the recipe, source reference files, or another explicitly non-generated location.

There are several ways to define starter code:

- `starterState`: generator shorthand for state-driven lessons. It produces a small multi-file workspace, including `main.js`, `scene.json`, `geometry.json`, and shader files.
- `starterFiles`: explicit file map for lessons that need custom project structure, several runtime shader files, helper modules, or data files.
- `starterFilePaths`: explicit file map whose values are repository paths. Use this when a custom lesson has longer `main.js`, shader, json, or helper files that should remain readable outside the recipe JSON.
- `starterAssets`: static asset map for image or binary source files. The generator reads the source file and writes a text data URL into `starter/<path>`, so the browser lesson remains fully static and can still load the original texture through `getFile("<path>")`.

Prefer explicit `starterFilePaths` or `starterFiles` plus `workspaceFiles` when the source lesson has several shader programs, meaningful helper/data files, or real texture assets. Do not rely on the generator to blindly copy OpenGL source shaders into the editor. The lesson authoring AI should convert the source idea into WebGL-facing files, then explain and teach each visible file through checkpoints.

For texture lessons, keep original image files in the source project or another stable repository location, declare them through `starterAssets`, and mark the generated data URL files as `visible: false` unless inspecting the raw encoded asset is itself part of the lesson. If the source OpenGL code uses `container.png` and `container_specular.png`, the browser lesson should use those same images unless there is a deliberate teaching reason to replace them.

Checkpoint code changes also have two forms:

- `state`: quick shorthand that regenerates the whole state-driven runtime.
- `changes`: explicit deterministic patch list. Use this for multi-file lessons so each checkpoint can touch only the relevant file(s).

Use `createdAt` in `YYYY-MM-DD` format. This date should reflect the actual creation or update date of the lesson pack. `order` may describe a learning path, but it should not replace real dates for recent-update sorting.

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
7. Write the lesson into its own `src/graphics-lessons/<lesson-id>/` folder.
8. Build and verify.
9. Manually review user-facing text and visual behavior.

The current recipe-driven generator is:

```bash
npm run generate:graphics-lessons
```

It scans `src/graphics-lesson-recipes/*/recipe.json`, reads source references from `OpenGLProject/src`, and writes one self-contained folder per lesson under `src/graphics-lessons/`.

Useful direct commands:

```bash
node scripts/generate-graphics-lesson.mjs --id shaders
node scripts/generate-graphics-lesson.mjs --source 03_shaders
node scripts/generate-graphics-lesson.mjs --date 2026-06-24
node scripts/generate-graphics-lesson.mjs --dry-run
```

After generation:

```bash
npm run build
npm run test:graphics-lab
```

## Registration Rule

Generated lesson folders are loaded automatically by `src/data/graphicsLessons.ts` with `import.meta.glob`.

A lesson appears on the WebGL lesson index when it contains:

- `manifest.json`
- `starter/main.js`
- at least one `patches/*.json`

`starter/vertex.glsl` and `starter/fragment.glsl` are no longer required. If the original OpenGL lesson has several shader programs, the generated lesson should preserve those relationships as WebGL-facing starter files and expose the original source relationship through `shaderSets`.

The experiment detail page receives only the selected lesson payload. It should not need to know how many other lessons exist.

## Review Checklist

Before committing a generated lesson:

- `manifest.json` parses correctly.
- `category`, `description`, and card text are user-facing, not AI instructions.
- Every checkpoint asks exactly one main question.
- Every checkpoint declares `files`.
- Every checkpoint declares or inherits a valid `flow`.
- Every visible `starter/` file appears in at least one checkpoint's `files`.
- Every checkpoint with `patchId` has a matching patch file.
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
