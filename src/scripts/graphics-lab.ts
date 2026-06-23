import * as THREE from "three";
import {
  autocompletion,
  closeBrackets,
  completionKeymap,
  type CompletionContext
} from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { javascript } from "@codemirror/lang-javascript";
import { searchKeymap } from "@codemirror/search";
import { EditorState } from "@codemirror/state";
import {
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  rectangularSelection
} from "@codemirror/view";

type LabFileName = "main.js" | "vertex.glsl" | "fragment.glsl";

type LabFile = {
  label: string;
  name: LabFileName;
  source: string;
};

type RuntimeCleanup = () => void;
type SmokeResult = {
  ok: boolean;
  activeFile: LabFileName;
  canvas: { width: number; height: number };
  status: string;
  error: string;
};

type GuidePatch = {
  file: LabFileName;
  operation: "replace_all" | "replace";
  target?: string;
  content: string;
};

type GuideResponse = {
  type?: "question" | "feedback" | "code_patch" | "debug_fix" | "summary";
  message?: string;
  question?: string;
  patches?: GuidePatch[];
  runAfterApply?: boolean;
  expectedObservation?: string;
};

declare global {
  interface Window {
    __graphicsLabSmokeTest?: () => Promise<{
      ok: boolean;
      activeFile: LabFileName;
      canvas: { width: number; height: number };
      status: string;
      error: string;
    }>;
    __graphicsLabGuideSmokeTest?: () => Promise<{
      ok: boolean;
      status: string;
      error: string;
      appliedFiles: LabFileName[];
    }>;
  }
}

const STORAGE_KEY = "daydreamerh.graphics-lab.v1";

const shaderLessonReference = {
  title: "LearnOpenGL Shader Primer",
  topic: "Shaders, GLSL, uniforms, vector swizzling, vertex-to-fragment data flow",
  summary: [
    "Shader 是运行在 GPU 上的小程序，图形管线的不同阶段通过输入和输出连接。",
    "GLSL 类似 C，常用 vec2/vec3/vec4、mat 系列、uniform、varying 和 main 函数。",
    "顶点着色器处理每个顶点的位置与可传递数据，片段着色器决定最终像素颜色。",
    "顶点着色器和片段着色器之间通过同名同类型的输出/输入变量传递数据。当前 Three.js WebGL1 示例使用 varying。",
    "uniform 是 CPU/应用侧传给 shader 的全局值，可以随时间更新，用来控制颜色、时间、矩阵或材质参数。",
    "向量 swizzling 可以用 .xyzw/.rgba/.stpq 组合访问或重组分量。"
  ],
  firstStep:
    "先确认用户理解 vertex shader 与 fragment shader 如何通过 varying 传递颜色，再让 AI 修改当前实验显示由 shader 控制的颜色变化。"
};

const jsCompletions = [
  "THREE.Scene",
  "THREE.PerspectiveCamera",
  "THREE.WebGLRenderer",
  "THREE.ShaderMaterial",
  "THREE.Mesh",
  "THREE.BoxGeometry",
  "THREE.SphereGeometry",
  "THREE.PlaneGeometry",
  "THREE.Color",
  "THREE.Vector2",
  "THREE.Vector3",
  "THREE.Matrix4",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "renderer.render",
  "renderer.setSize",
  "camera.lookAt",
  "scene.add",
  "uniforms",
  "vertexShader",
  "fragmentShader"
].map((label) => ({ label, type: "variable" }));

const glslCompletions = [
  "uniform",
  "varying",
  "attribute",
  "void main()",
  "gl_Position",
  "gl_FragColor",
  "projectionMatrix",
  "modelViewMatrix",
  "normalMatrix",
  "position",
  "normal",
  "uv",
  "vec2",
  "vec3",
  "vec4",
  "mat3",
  "mat4",
  "float",
  "normalize",
  "dot",
  "cross",
  "mix",
  "sin",
  "cos",
  "max",
  "min",
  "clamp",
  "texture2D"
].map((label) => ({ label, type: "keyword" }));

function labCompletionSource(fileName: LabFileName) {
  const completions = fileName === "main.js" ? jsCompletions : glslCompletions;

  return (context: CompletionContext) => {
    const word = context.matchBefore(/[\w.$]+/);
    if (!word || (word.from === word.to && !context.explicit)) return null;
    return {
      from: word.from,
      options: completions
    };
  };
}

const defaultFiles: Record<LabFileName, LabFile> = {
  "main.js": {
    name: "main.js",
    label: "main.js",
    source: `// Ctrl + Enter 运行，Ctrl + S 保存当前实验
// 可用对象：THREE, canvas, vertexShader, fragmentShader, report

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true
});

renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0xf8f8f8, 1);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
camera.position.set(2.8, 2.1, 4.2);
camera.lookAt(0, 0, 0);

const uniforms = {
  uTime: { value: 0 },
  uBaseColor: { value: new THREE.Color("#00adb5") },
  uInkColor: { value: new THREE.Color("#222831") }
};

const material = new THREE.ShaderMaterial({
  vertexShader,
  fragmentShader,
  uniforms
});

const cube = new THREE.Mesh(
  new THREE.BoxGeometry(1.45, 1.45, 1.45, 1, 1, 1),
  material
);
scene.add(cube);

const grid = new THREE.GridHelper(5, 10, 0x393e46, 0xd0d3d6);
grid.position.y = -1.15;
scene.add(grid);

let frame = 0;
const clock = new THREE.Clock();

function resize() {
  const bounds = canvas.parentElement.getBoundingClientRect();
  const width = Math.max(1, Math.floor(bounds.width));
  const height = Math.max(1, Math.floor(bounds.height));
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function animate() {
  frame = requestAnimationFrame(animate);
  const time = clock.getElapsedTime();

  uniforms.uTime.value = time;
  cube.rotation.x = time * 0.35;
  cube.rotation.y = time * 0.55;

  renderer.render(scene, camera);
  report({ time });
}

resize();
window.addEventListener("resize", resize);
animate();

return () => {
  cancelAnimationFrame(frame);
  window.removeEventListener("resize", resize);
  cube.geometry.dispose();
  material.dispose();
  renderer.dispose();
};`
  },
  "vertex.glsl": {
    name: "vertex.glsl",
    label: "vertex.glsl",
    source: `varying vec2 vUv;
varying vec3 vNormal;

uniform float uTime;

void main() {
  vUv = uv;
  vNormal = normalize(normalMatrix * normal);

  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`
  },
  "fragment.glsl": {
    name: "fragment.glsl",
    label: "fragment.glsl",
    source: `varying vec2 vUv;
varying vec3 vNormal;

uniform float uTime;
uniform vec3 uBaseColor;
uniform vec3 uInkColor;

void main() {
  vec3 normal = normalize(vNormal);
  vec3 lightDir = normalize(vec3(0.4, 0.8, 0.7));
  float diffuse = max(dot(normal, lightDir), 0.0);

  float pulse = 0.5 + 0.5 * sin(uTime + vUv.x * 6.2831);
  vec3 color = mix(uInkColor, uBaseColor, 0.35 + diffuse * 0.55);
  color += pulse * 0.08;

  gl_FragColor = vec4(color, 1.0);
}`
  }
};

const cloneDefaultFiles = () =>
  Object.fromEntries(
    Object.entries(defaultFiles).map(([name, file]) => [name, { ...file }])
  ) as Record<LabFileName, LabFile>;

function loadFiles() {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) return cloneDefaultFiles();

    const parsed = JSON.parse(saved) as Partial<Record<LabFileName, string>>;
    const files = cloneDefaultFiles();
    (Object.keys(files) as LabFileName[]).forEach((name) => {
      if (typeof parsed[name] === "string") {
        files[name].source = parsed[name] ?? files[name].source;
      }
    });
    if (
      files["main.js"].source.includes(
        "new THREE.BoxGeometry(1.4, 1.4, 1.4, 24, 24, 24)"
      )
    ) {
      files["main.js"].source = defaultFiles["main.js"].source;
    }
    if (files["vertex.glsl"].source.includes("animatedPosition")) {
      files["vertex.glsl"].source = defaultFiles["vertex.glsl"].source;
    }
    return files;
  } catch {
    return cloneDefaultFiles();
  }
}

function persistFiles(files: Record<LabFileName, LabFile>) {
  const payload = Object.fromEntries(
    (Object.keys(files) as LabFileName[]).map((name) => [name, files[name].source])
  );
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function extractJsonObject(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] ?? text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("AI 没有返回可解析的 JSON。");
  }
  return JSON.parse(candidate.slice(start, end + 1)) as GuideResponse;
}

function normalizeGuideResponse(response: GuideResponse): GuideResponse {
  return {
    type: response.type ?? "feedback",
    message: response.message ?? "",
    question: response.question ?? "",
    patches: Array.isArray(response.patches) ? response.patches : [],
    runAfterApply: Boolean(response.runAfterApply),
    expectedObservation: response.expectedObservation ?? ""
  };
}

function createEditorState(
  source: string,
  fileName: LabFileName,
  onChange: (source: string) => void
) {
  const languageExtension = fileName === "main.js" ? javascript() : [];

  return EditorState.create({
    doc: source,
    extensions: [
      lineNumbers(),
      highlightActiveLineGutter(),
      history(),
      drawSelection(),
      dropCursor(),
      rectangularSelection(),
      highlightActiveLine(),
      closeBrackets(),
      autocompletion({
        override: [labCompletionSource(fileName)],
        activateOnTyping: true
      }),
      EditorView.lineWrapping,
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          onChange(update.state.doc.toString());
        }
      }),
      keymap.of([
        indentWithTab,
        ...defaultKeymap,
        ...historyKeymap,
        ...searchKeymap,
        ...completionKeymap
      ]),
      EditorView.theme({
        "&": {
          height: "100%",
          backgroundColor: "#ffffff",
          color: "#222831",
          fontSize: "13px"
        },
        ".cm-scroller": {
          fontFamily:
            "JetBrains Mono, Fira Code, Consolas, 'SFMono-Regular', monospace",
          lineHeight: "1.58"
        },
        ".cm-gutters": {
          backgroundColor: "#f8f8f8",
          borderRight: "1px solid rgba(57, 62, 70, 0.14)",
          color: "#7b818a"
        },
        ".cm-activeLine": {
          backgroundColor: "rgba(0, 173, 181, 0.08)"
        },
        ".cm-activeLineGutter": {
          backgroundColor: "rgba(0, 173, 181, 0.1)",
          color: "#222831"
        },
        ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
          backgroundColor: "rgba(0, 173, 181, 0.2)"
        },
        "&.cm-focused": {
          outline: "none"
        }
      }),
      languageExtension
    ]
  });
}

function initGraphicsLab(root: HTMLElement) {
  const labWorkspace = root.querySelector<HTMLElement>("[data-lab-workspace]");
  const canvas = root.querySelector<HTMLCanvasElement>("[data-lab-canvas]");
  const editorHost = root.querySelector<HTMLElement>("[data-editor-host]");
  const fileTabs = [...root.querySelectorAll<HTMLButtonElement>("[data-file-tab]")];
  const runButton = root.querySelector<HTMLButtonElement>("[data-run]");
  const resetButton = root.querySelector<HTMLButtonElement>("[data-reset-lab]");
  const expandButton = root.querySelector<HTMLButtonElement>("[data-expand-editor]");
  const statusLabel = root.querySelector<HTMLElement>("[data-lab-status]");
  const statusDot = root.querySelector<HTMLElement>("[data-lab-status-dot]");
  const errorBox = root.querySelector<HTMLElement>("[data-lab-errors]");
  const autoRunToggle = root.querySelector<HTMLInputElement>("[data-auto-run]");
  const guideState = root.querySelector<HTMLElement>("[data-guide-state]");
  const guideLog = root.querySelector<HTMLElement>("[data-guide-log]");
  const guideForm = root.querySelector<HTMLFormElement>("[data-guide-form]");
  const guideInput = root.querySelector<HTMLTextAreaElement>("[data-guide-input]");
  const guideStartButton = root.querySelector<HTMLButtonElement>("[data-guide-start]");
  const guideDebugButton = root.querySelector<HTMLButtonElement>("[data-guide-debug]");
  const guideEndpointInput = root.querySelector<HTMLInputElement>("[data-guide-endpoint]");
  const guideKeyInput = root.querySelector<HTMLInputElement>("[data-guide-key]");
  const guideModelInput = root.querySelector<HTMLInputElement>("[data-guide-model]");

  if (!labWorkspace || !canvas || !editorHost || !runButton || !resetButton || !expandButton || !statusLabel || !statusDot || !errorBox) {
    return;
  }

  let files = loadFiles();
  let activeFile: LabFileName = "main.js";
  let cleanup: RuntimeCleanup | undefined;
  let runTimer = 0;
  let saveTimer = 0;
  let runId = 0;
  const guideHistory: Array<{ role: "user" | "assistant"; content: string }> = [];

  const setStatus = (type: "idle" | "running" | "ok" | "error", text: string) => {
    statusLabel.textContent = text;
    statusDot.dataset.state = type;
    root.dataset.labState = type;
    root.dataset.labMessage = text;
  };

  const setError = (message = "") => {
    errorBox.textContent = message;
    errorBox.hidden = !message;
    root.dataset.labError = message;
  };

  const setGuideState = (text: string) => {
    if (guideState) guideState.textContent = text;
    root.dataset.guideState = text;
  };

  const appendGuideEntry = (
    role: "assistant" | "user" | "system",
    title: string,
    message = ""
  ) => {
    if (!guideLog) return;
    const article = document.createElement("article");
    article.dataset.role = role;
    const strong = document.createElement("strong");
    strong.textContent = title;
    article.append(strong);
    if (message) {
      const paragraph = document.createElement("p");
      paragraph.textContent = message;
      article.append(paragraph);
    }
    guideLog.append(article);
    guideLog.scrollTop = guideLog.scrollHeight;
  };

  const saveSoon = () => {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      persistFiles(files);
      setStatus("idle", "已保存到当前浏览器");
    }, 260);
  };

  const scheduleRun = () => {
    if (!autoRunToggle?.checked) return;
    window.clearTimeout(runTimer);
    runTimer = window.setTimeout(() => {
      void runProgram();
    }, 620);
  };

  const editor = new EditorView({
    state: createEditorState(files[activeFile].source, activeFile, (source) => {
      files[activeFile].source = source;
      saveSoon();
      scheduleRun();
    }),
    parent: editorHost
  });

  const syncTabs = () => {
    fileTabs.forEach((tab) => {
      const isActive = tab.dataset.file === activeFile;
      tab.classList.toggle("is-active", isActive);
      tab.setAttribute("aria-selected", String(isActive));
    });
  };

  const switchFile = (fileName: LabFileName) => {
    activeFile = fileName;
    editor.setState(
      createEditorState(files[activeFile].source, activeFile, (source) => {
        files[activeFile].source = source;
        saveSoon();
        scheduleRun();
      })
    );
    syncTabs();
  };

  const getFilesSnapshot = () =>
    (Object.keys(files) as LabFileName[])
      .map((name) => `--- ${name} ---\n${files[name].source}`)
      .join("\n\n");

  const applyGuidePatches = (patches: GuidePatch[]) => {
    const changedFiles = new Set<LabFileName>();

    patches.forEach((patch) => {
      if (!(patch.file in files)) {
        throw new Error(`AI 请求修改不允许的文件：${patch.file}`);
      }
      if (patch.operation === "replace_all") {
        files[patch.file].source = patch.content;
        changedFiles.add(patch.file);
        return;
      }
      if (patch.operation === "replace") {
        if (!patch.target) throw new Error("replace patch 缺少 target。");
        if (!files[patch.file].source.includes(patch.target)) {
          throw new Error(`无法在 ${patch.file} 中找到 AI 指定的替换片段。`);
        }
        files[patch.file].source = files[patch.file].source.replace(patch.target, patch.content);
        changedFiles.add(patch.file);
        return;
      }
      throw new Error(`不支持的 patch 操作：${patch.operation}`);
    });

    if (changedFiles.has(activeFile)) {
      editor.setState(
        createEditorState(files[activeFile].source, activeFile, (source) => {
          files[activeFile].source = source;
          saveSoon();
          scheduleRun();
        })
      );
    }

    persistFiles(files);
  };

  const buildGuideMessages = (mode: "start" | "answer" | "debug", userText = "") => {
    const errorText = errorBox.textContent || "";
    const systemPrompt = `你是一个图形学实验导师，参考 LearnOpenGL 的 Shaders 教程，但当前页面使用 Three.js ShaderMaterial 与 WebGL1 风格 GLSL。

教学规则：
1. 目标是帮助用户理解原理，不要一次性讲完整教程。
2. 每轮最多提出一个关键问题。用户答对后，才给出代码修改。
3. 只允许修改 main.js、vertex.glsl、fragment.glsl。
4. 你必须只返回 JSON，不要返回 Markdown，不要返回解释性前后缀。
5. JSON schema:
{
  "type": "question | feedback | code_patch | debug_fix | summary",
  "message": "给用户看的简短反馈，最多 80 字",
  "question": "下一步问题，没有则为空字符串",
  "patches": [
    {
      "file": "main.js | vertex.glsl | fragment.glsl",
      "operation": "replace_all | replace",
      "target": "replace 时必须提供",
      "content": "完整新内容或替换内容"
    }
  ],
  "runAfterApply": true,
  "expectedObservation": "运行后用户应该观察到的现象"
}
6. 如果生成代码，优先使用 replace_all 给出完整文件，避免 target 匹配失败。
7. 代码必须能在当前 Three.js 环境运行。fragment.glsl 使用 gl_FragColor；顶点与片段之间使用 varying。`;

    const lessonPrompt = `当前教学主题：${shaderLessonReference.title}
话题：${shaderLessonReference.topic}
参考要点：
${shaderLessonReference.summary.map((item) => `- ${item}`).join("\n")}
第一阶段目标：${shaderLessonReference.firstStep}`;

    const userPrompt = `模式：${mode}
用户输入：${userText || "(无)"}
当前运行状态：${root.dataset.labState || "unknown"}
当前运行错误：${errorText || "(无)"}
当前代码：
${getFilesSnapshot()}`;

    return [
      { role: "system", content: systemPrompt },
      { role: "user", content: lessonPrompt },
      ...guideHistory.slice(-6),
      { role: "user", content: userPrompt }
    ];
  };

  const requestGuide = async (mode: "start" | "answer" | "debug", userText = "") => {
    if (!guideEndpointInput?.value || !guideKeyInput?.value || !guideModelInput?.value) {
      appendGuideEntry("system", "需要 API", "请先填写 Endpoint、API Key 和 Model。");
      setGuideState("等待 API");
      return;
    }

    setGuideState("AI 思考中");

    const response = await fetch(guideEndpointInput.value.trim(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${guideKeyInput.value.trim()}`
      },
      body: JSON.stringify({
        model: guideModelInput.value.trim(),
        messages: buildGuideMessages(mode, userText),
        temperature: 0.35,
        response_format: { type: "json_object" }
      })
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`API 请求失败：${response.status} ${detail.slice(0, 220)}`);
    }

    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      throw new Error("API 返回中没有 message.content。");
    }

    guideHistory.push({ role: "user", content: userText || mode });
    guideHistory.push({ role: "assistant", content });

    const parsed = normalizeGuideResponse(extractJsonObject(content));
    const patches = parsed.patches ?? [];

    if (parsed.message) appendGuideEntry("assistant", "AI 反馈", parsed.message);
    if (parsed.question) appendGuideEntry("assistant", "下一问", parsed.question);

    if (patches.length) {
      applyGuidePatches(patches);
      appendGuideEntry("system", "代码已应用", `${patches.map((patch) => patch.file).join(", ")} 已更新。`);
      if (parsed.expectedObservation) {
        appendGuideEntry("assistant", "观察目标", parsed.expectedObservation);
      }
      if (parsed.runAfterApply) {
        await runProgram();
      }
    }

    setGuideState(parsed.type === "question" ? "等待回答" : "已更新");
  };

  const stopRuntime = () => {
    if (cleanup) {
      cleanup();
      cleanup = undefined;
    }
  };

  const runProgram = async () => {
    const currentRun = ++runId;
    const capturedErrors: string[] = [];
    const originalError = console.error;

    stopRuntime();
    setError();
    setStatus("running", "正在运行当前代码...");

    console.error = (...args: unknown[]) => {
      capturedErrors.push(args.map(String).join(" "));
      originalError.apply(console, args);
    };

    try {
      const factory = new Function(
        "THREE",
        "canvas",
        "vertexShader",
        "fragmentShader",
        "report",
        `"use strict";\n${files["main.js"].source}`
      );
      const result = factory(
        THREE,
        canvas,
        files["vertex.glsl"].source,
        files["fragment.glsl"].source,
        () => undefined
      );

      cleanup = typeof result === "function" ? (result as RuntimeCleanup) : undefined;

      await new Promise((resolve) => window.setTimeout(resolve, 120));

      if (currentRun !== runId) return;

      if (capturedErrors.length) {
        setStatus("error", "运行完成，但发现控制台错误");
        setError(capturedErrors.slice(0, 3).join("\n\n"));
        return;
      }

      setStatus("ok", "运行成功，预览已更新");
    } catch (error) {
      if (currentRun !== runId) return;
      stopRuntime();
      setStatus("error", "运行失败");
      setError(error instanceof Error ? error.stack || error.message : String(error));
    } finally {
      console.error = originalError;
    }
  };

  const resetLab = () => {
    stopRuntime();
    files = cloneDefaultFiles();
    persistFiles(files);
    switchFile(activeFile);
    setError();
    void runProgram();
  };

  fileTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const fileName = tab.dataset.file as LabFileName | undefined;
      if (fileName && fileName in files) switchFile(fileName);
    });
  });

  runButton.addEventListener("click", () => {
    persistFiles(files);
    void runProgram();
  });

  resetButton.addEventListener("click", resetLab);

  expandButton.addEventListener("click", () => {
    const isExpanded = labWorkspace.classList.toggle("is-editor-expanded");
    expandButton.textContent = isExpanded ? "回到预览" : "展开编辑器";
    expandButton.setAttribute("aria-pressed", String(isExpanded));
    editor.requestMeasure();
  });

  guideStartButton?.addEventListener("click", () => {
    void requestGuide("start").catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      setGuideState("API 错误");
      appendGuideEntry("system", "API 错误", message);
    });
  });

  guideDebugButton?.addEventListener("click", () => {
    void requestGuide("debug", "请根据当前运行错误给出最小修复。").catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      setGuideState("API 错误");
      appendGuideEntry("system", "API 错误", message);
    });
  });

  guideForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    const userText = guideInput?.value.trim() ?? "";
    if (!userText) return;
    appendGuideEntry("user", "你的回答", userText);
    if (guideInput) guideInput.value = "";
    void requestGuide("answer", userText).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      setGuideState("API 错误");
      appendGuideEntry("system", "API 错误", message);
    });
  });

  guideInput?.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      guideForm?.requestSubmit();
    }
  });

  window.addEventListener("keydown", (event) => {
    if (!(event.ctrlKey || event.metaKey)) return;

    if (event.key === "Enter") {
      event.preventDefault();
      persistFiles(files);
      void runProgram();
    }

    if (event.key.toLowerCase() === "s") {
      event.preventDefault();
      persistFiles(files);
      setStatus("idle", "已手动保存");
    }
  });

  const smokeTest = async (): Promise<SmokeResult> => {
    await runProgram();
    await new Promise((resolve) => window.setTimeout(resolve, 180));

    return {
      ok: canvas.width > 0 && canvas.height > 0 && root.dataset.labState === "ok" && !errorBox.textContent,
      activeFile,
      canvas: { width: canvas.width, height: canvas.height },
      status: statusLabel.textContent || "",
      error: errorBox.textContent || ""
    };
  };

  const guideSmokeTest = async () => {
    const patches: GuidePatch[] = [
      {
        file: "vertex.glsl",
        operation: "replace_all",
        content: `varying vec2 vUv;
varying vec4 vertexColor;

uniform float uTime;

void main() {
  vUv = uv;
  float green = 0.5 + 0.5 * sin(uTime);
  vertexColor = vec4(vUv.x, green, vUv.y, 1.0);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`
      },
      {
        file: "fragment.glsl",
        operation: "replace_all",
        content: `varying vec2 vUv;
varying vec4 vertexColor;

void main() {
  gl_FragColor = vertexColor;
}`
      }
    ];

    applyGuidePatches(patches);
    await runProgram();
    await new Promise((resolve) => window.setTimeout(resolve, 180));

    return {
      ok: root.dataset.labState === "ok" && !errorBox.textContent,
      status: statusLabel.textContent || "",
      error: errorBox.textContent || "",
      appliedFiles: patches.map((patch) => patch.file)
    };
  };

  window.__graphicsLabSmokeTest = smokeTest;
  window.__graphicsLabGuideSmokeTest = guideSmokeTest;
  root.dataset.labReady = "true";
  root.dataset.guideReady = "true";

  syncTabs();
  setGuideState("等待 API");
  void runProgram();
}

document.querySelectorAll<HTMLElement>("[data-graphics-lab]").forEach(initGraphicsLab);
