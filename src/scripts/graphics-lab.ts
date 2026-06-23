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
type WorkspaceTab = LabFileName | "ai";

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

type LessonPatch = {
  id: string;
  description: string;
  changes: GuidePatch[];
};

type LessonCheckpoint = {
  id: string;
  title: string;
  concept: string;
  question: string;
  expectedKeywords: string[];
  hint: string;
  patchId: string;
  expectedObservation: string;
};

type CheckpointAdvanceResult = {
  previousId: string;
  currentId: string;
  moved: boolean;
  completed: boolean;
};

type GraphicsLesson = {
  id: string;
  title: string;
  category: string;
  level: string;
  createdAt: string;
  description: string;
  source: string;
  runtime: string;
  previewTitle: string;
  aiBrief: string;
  referenceBrief: string[];
  referenceFiles?: Array<{
    path: string;
    role: string;
  }>;
  referenceCode?: string;
  teachingRules: string[];
  checkpoints: LessonCheckpoint[];
  starterFiles: Record<LabFileName, string>;
  patches: Record<string, LessonPatch>;
};

type GuideResponse = {
  type?: "question" | "feedback" | "code_patch" | "summary";
  message?: string;
  question?: string;
  patchId?: string;
  patches?: GuidePatch[];
  runAfterApply?: boolean;
  expectedObservation?: string;
  nextCheckpointId?: string;
};

declare global {
  interface Window {
    __graphicsLabSmokeTest?: () => Promise<SmokeResult>;
    __graphicsLabGuideSmokeTest?: () => Promise<{
      ok: boolean;
      status: string;
      error: string;
      appliedFiles: LabFileName[];
      checkpointId: string;
    }>;
  }
}

const STORAGE_KEY_PREFIX = "daydreamerh.graphics-lab.lesson";

const fallbackLesson: GraphicsLesson = {
  id: "fallback",
  title: "Hello Triangle",
  category: "CG 实验",
  level: "intro",
  createdAt: "2026-06-23",
  description: "在浏览器中补全一个基础三角形渲染实验。",
  source: "inline",
  runtime: "three-shader-material",
  previewTitle: "Hello Triangle",
  aiBrief: "基础三角形实验。",
  referenceBrief: [],
  referenceCode: "",
  teachingRules: [],
  checkpoints: [],
  starterFiles: {
    "main.js": `const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setClearColor(0xf8f8f8, 1);
const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
camera.position.z = 1;
const geometry = new THREE.BufferGeometry();
geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array([
  0.0, 0.6, 0.0,
  -0.6, -0.5, 0.0,
  0.6, -0.5, 0.0
]), 3));
const material = new THREE.ShaderMaterial({ vertexShader, fragmentShader, side: THREE.DoubleSide });
const triangle = new THREE.Mesh(geometry, material);
scene.add(triangle);
function resize() {
  const bounds = canvas.parentElement.getBoundingClientRect();
  renderer.setSize(Math.max(1, Math.floor(bounds.width)), Math.max(1, Math.floor(bounds.height)), false);
}
resize();
renderer.render(scene, camera);
return () => {
  geometry.dispose();
  material.dispose();
  renderer.dispose();
};`,
    "vertex.glsl": "void main() {\n  gl_Position = vec4(position, 1.0);\n}",
    "fragment.glsl": "void main() {\n  gl_FragColor = vec4(0.13, 0.16, 0.19, 1.0);\n}"
  },
  patches: {}
};

const fileNames: LabFileName[] = ["main.js", "vertex.glsl", "fragment.glsl"];

const jsCompletions = [
  "THREE.Scene",
  "THREE.OrthographicCamera",
  "THREE.PerspectiveCamera",
  "THREE.WebGLRenderer",
  "THREE.ShaderMaterial",
  "THREE.Mesh",
  "THREE.BufferGeometry",
  "THREE.BufferAttribute",
  "THREE.Float32BufferAttribute",
  "THREE.DoubleSide",
  "Float32Array",
  "renderer.render",
  "renderer.setSize",
  "scene.add",
  "geometry.setAttribute",
  "vertexShader",
  "fragmentShader"
].map((label) => ({ label, type: "variable" }));

const glslCompletions = [
  "attribute",
  "uniform",
  "varying",
  "void main()",
  "gl_Position",
  "gl_FragColor",
  "position",
  "color",
  "uv",
  "normal",
  "vec2",
  "vec3",
  "vec4",
  "mat3",
  "mat4",
  "float",
  "normalize",
  "dot",
  "mix",
  "sin",
  "cos",
  "clamp"
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

function parseLesson(root: HTMLElement): GraphicsLesson {
  try {
    const raw = root.dataset.lessonPayload;
    if (!raw) return fallbackLesson;
    const lesson = JSON.parse(raw) as GraphicsLesson;
    if (!lesson.id || !lesson.starterFiles) return fallbackLesson;
    return lesson;
  } catch {
    return fallbackLesson;
  }
}

function makeStorageKey(lessonId: string) {
  return `${STORAGE_KEY_PREFIX}.${lessonId}.v1`;
}

function cloneStarterFiles(lesson: GraphicsLesson): Record<LabFileName, LabFile> {
  return Object.fromEntries(
    fileNames.map((name) => [
      name,
      {
        name,
        label: name,
        source: lesson.starterFiles[name] ?? fallbackLesson.starterFiles[name]
      }
    ])
  ) as Record<LabFileName, LabFile>;
}

function loadFiles(lesson: GraphicsLesson) {
  try {
    const saved = window.localStorage.getItem(makeStorageKey(lesson.id));
    if (!saved) return cloneStarterFiles(lesson);

    const parsed = JSON.parse(saved) as Partial<Record<LabFileName, string>>;
    const files = cloneStarterFiles(lesson);
    fileNames.forEach((name) => {
      if (typeof parsed[name] === "string") {
        files[name].source = parsed[name] ?? files[name].source;
      }
    });
    return files;
  } catch {
    return cloneStarterFiles(lesson);
  }
}

function persistFiles(lesson: GraphicsLesson, files: Record<LabFileName, LabFile>) {
  const payload = Object.fromEntries(fileNames.map((name) => [name, files[name].source]));
  window.localStorage.setItem(makeStorageKey(lesson.id), JSON.stringify(payload));
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
    patchId: response.patchId ?? "",
    patches: Array.isArray(response.patches) ? response.patches : [],
    runAfterApply: Boolean(response.runAfterApply),
    expectedObservation: response.expectedObservation ?? "",
    nextCheckpointId: response.nextCheckpointId ?? ""
  };
}

function removeQuestionSentences(message: string, question: string) {
  if (!message || !question) return message;
  return message
    .split(/(?<=[。！？!?])\s*/)
    .filter((sentence) => {
      const trimmed = sentence.trim();
      return trimmed && !/[？?]/.test(trimmed) && !trimmed.includes("请回答");
    })
    .join("")
    .trim();
}

function compactReferenceCode(code = "") {
  if (!code) return "(无)";
  const lines = code.split(/\r?\n/);
  const useful = lines.filter((line) => {
    const trimmed = line.trim();
    return (
      trimmed.startsWith("const char *vertexShaderSource") ||
      trimmed.startsWith("const char *fragmentShaderSource") ||
      trimmed.includes("layout (location = 0)") ||
      trimmed.includes("gl_Position") ||
      trimmed.includes("FragColor") ||
      trimmed.includes("float vertices[]") ||
      trimmed.includes("unsigned int indices[]") ||
      trimmed.includes("glGenVertexArrays") ||
      trimmed.includes("glBindBuffer") ||
      trimmed.includes("glBufferData") ||
      trimmed.includes("glVertexAttribPointer") ||
      trimmed.includes("glEnableVertexAttribArray") ||
      trimmed.includes("glUseProgram") ||
      trimmed.includes("glDrawElements") ||
      trimmed.includes("glDrawArrays")
    );
  });
  return useful.slice(0, 80).join("\n") || lines.slice(0, 80).join("\n");
}

function escapeHtml(value = "") {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderInlineMarkdown(value = "") {
  return escapeHtml(value)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

function renderGuideMarkdown(markdown = "") {
  const lines = markdown.split(/\r?\n/);
  const html: string[] = [];
  let listOpen = false;
  let codeOpen = false;
  const codeBuffer: string[] = [];

  const closeList = () => {
    if (!listOpen) return;
    html.push("</ul>");
    listOpen = false;
  };

  const closeCode = () => {
    if (!codeOpen) return;
    html.push(`<pre><code>${escapeHtml(codeBuffer.join("\n"))}</code></pre>`);
    codeBuffer.length = 0;
    codeOpen = false;
  };

  lines.forEach((line) => {
    const trimmed = line.trim();

    if (trimmed.startsWith("```")) {
      if (codeOpen) {
        closeCode();
      } else {
        closeList();
        codeOpen = true;
      }
      return;
    }

    if (codeOpen) {
      codeBuffer.push(line);
      return;
    }

    if (!trimmed) {
      closeList();
      return;
    }

    const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      closeList();
      const level = Math.min(5, heading[1].length + 2);
      html.push(`<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`);
      return;
    }

    const quote = trimmed.match(/^>\s+(.+)$/);
    if (quote) {
      closeList();
      html.push(`<blockquote>${renderInlineMarkdown(quote[1])}</blockquote>`);
      return;
    }

    const listItem = trimmed.match(/^[-*]\s+(.+)$/) || trimmed.match(/^\d+[.)]\s+(.+)$/);
    if (listItem) {
      if (!listOpen) {
        html.push("<ul>");
        listOpen = true;
      }
      html.push(`<li>${renderInlineMarkdown(listItem[1])}</li>`);
      return;
    }

    closeList();
    html.push(`<p>${renderInlineMarkdown(trimmed)}</p>`);
  });

  closeCode();
  closeList();
  return html.join("");
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
          fontFamily: "JetBrains Mono, Fira Code, Consolas, 'SFMono-Regular', monospace",
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
  const lesson = parseLesson(root);
  const labWorkspace = root.querySelector<HTMLElement>("[data-lab-workspace]");
  const canvas = root.querySelector<HTMLCanvasElement>("[data-lab-canvas]");
  const editorHost = root.querySelector<HTMLElement>("[data-editor-host]");
  const fileTabs = [...root.querySelectorAll<HTMLButtonElement>("[data-file-tab]")];
  const guideTab = root.querySelector<HTMLButtonElement>("[data-guide-tab]");
  const guideWorkspace = root.querySelector<HTMLElement>("[data-guide-workspace]");
  const guideSetup = root.querySelector<HTMLElement>("[data-guide-setup]");
  const guideConversation = root.querySelector<HTMLElement>("[data-guide-conversation]");
  const guideAlert = root.querySelector<HTMLElement>("[data-guide-alert]");
  const guideChatAlert = root.querySelector<HTMLElement>("[data-guide-chat-alert]");
  const guideConfigureButton = root.querySelector<HTMLButtonElement>("[data-guide-configure]");
  const runButton = root.querySelector<HTMLButtonElement>("[data-run]");
  const resetButton = root.querySelector<HTMLButtonElement>("[data-reset-lab]");
  const expandButton = root.querySelector<HTMLButtonElement>("[data-expand-editor]");
  const statusLabel = root.querySelector<HTMLElement>("[data-lab-status]");
  const statusDot = root.querySelector<HTMLElement>("[data-lab-status-dot]");
  const errorBox = root.querySelector<HTMLElement>("[data-lab-errors]");
  const autoRunToggle = root.querySelector<HTMLInputElement>("[data-auto-run]");
  const guideState = root.querySelector<HTMLElement>("[data-guide-state]");
  const guideStateMirror = root.querySelector<HTMLElement>("[data-guide-state-mirror]");
  const guideLog = root.querySelector<HTMLElement>("[data-guide-log]");
  const guideForm = root.querySelector<HTMLFormElement>("[data-guide-form]");
  const guideInput = root.querySelector<HTMLTextAreaElement>("[data-guide-input]");
  const guideStartButton = root.querySelector<HTMLButtonElement>("[data-guide-start]");
  const guideReturnButton = root.querySelector<HTMLButtonElement>("[data-guide-return]");
  const guideEndpointInput = root.querySelector<HTMLInputElement>("[data-guide-endpoint]");
  const guideKeyInput = root.querySelector<HTMLInputElement>("[data-guide-key]");
  const guideModelInput = root.querySelector<HTMLInputElement>("[data-guide-model]");
  const labHints = root.querySelector<HTMLElement>("[data-lab-hints]");

  if (
    !labWorkspace ||
    !canvas ||
    !editorHost ||
    !runButton ||
    !resetButton ||
    !expandButton ||
    !statusLabel ||
    !statusDot ||
    !errorBox
  ) {
    return;
  }

  let files = loadFiles(lesson);
  let activeFile: LabFileName = "main.js";
  let activeWorkspaceTab: WorkspaceTab = "ai";
  let guideConversationStarted = false;
  let cleanup: RuntimeCleanup | undefined;
  let runTimer = 0;
  let saveTimer = 0;
  let runId = 0;
  let currentCheckpointIndex = 0;
  let guideWorkspaceInitialized = false;
  let lessonFreeMode = false;
  const completedPatches = new Set<string>();
  const guideHistory: Array<{ role: "user" | "assistant"; content: string }> = [];

  root.dataset.lessonId = lesson.id;
  root.dataset.checkpointId = lesson.checkpoints[0]?.id ?? "";

  const currentCheckpoint = () => lesson.checkpoints[currentCheckpointIndex];

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
    if (guideStateMirror) guideStateMirror.textContent = text;
    root.dataset.guideState = text;
  };

  const setGuideAlert = (message = "") => {
    [guideAlert, guideChatAlert].forEach((alert) => {
      if (!alert) return;
      alert.textContent = message;
      alert.hidden = !message;
    });
  };

  const setGuidePhase = (phase: "setup" | "conversation") => {
    guideConversationStarted = phase === "conversation";
    if (guideSetup) guideSetup.hidden = phase !== "setup";
    if (guideConversation) guideConversation.hidden = phase !== "conversation";
    if (guideReturnButton) guideReturnButton.hidden = !guideConversationStarted || phase !== "setup";
    root.dataset.guidePhase = phase;
  };

  const resetGuideSession = () => {
    guideHistory.length = 0;
    guideConversationStarted = false;
    if (guideLog) guideLog.innerHTML = "";
    setGuideAlert();
    setGuideState("等待 API");
  };

  const hasGuideApiConfig = () =>
    Boolean(
      guideEndpointInput?.value.trim() &&
        guideKeyInput?.value.trim() &&
        guideModelInput?.value.trim()
    );

  const appendGuideEntry = (
    role: "assistant" | "user" | "system",
    title: string,
    message = ""
  ) => {
    if (!guideLog) return;
    const article = document.createElement("article");
    if (role === "system") {
      article.className = "guide-event";
      const label = document.createElement("span");
      label.textContent = title;
      article.append(label);
      if (message) {
        const paragraph = document.createElement("p");
        paragraph.textContent = message;
        article.append(paragraph);
      }
    } else {
      article.className = `message ${role === "user" ? "from-user" : "from-coach"}`;
      const body = document.createElement("div");
      body.className = "message-body";
      if (message) {
        body.innerHTML = renderGuideMarkdown(message);
      }
      if (title) {
        const label = document.createElement("span");
        label.textContent = title;
        article.append(label);
      }
      article.append(body);
    }
    guideLog.append(article);
    guideLog.scrollTop = guideLog.scrollHeight;
  };

  const saveSoon = () => {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      persistFiles(lesson, files);
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
      const isActive = activeWorkspaceTab !== "ai" && tab.dataset.file === activeFile;
      tab.classList.toggle("is-active", isActive);
      tab.setAttribute("aria-selected", String(isActive));
    });
    guideTab?.classList.toggle("is-active", activeWorkspaceTab === "ai");
    guideTab?.setAttribute("aria-selected", String(activeWorkspaceTab === "ai"));
  };

  const switchFile = (fileName: LabFileName) => {
    activeWorkspaceTab = fileName;
    activeFile = fileName;
    editorHost.hidden = false;
    if (guideWorkspace) guideWorkspace.hidden = true;
    if (labHints) labHints.hidden = false;
    editor.setState(
      createEditorState(files[activeFile].source, activeFile, (source) => {
        files[activeFile].source = source;
        saveSoon();
        scheduleRun();
      })
    );
    syncTabs();
  };

  const resetLessonCode = () => {
    stopRuntime();
    files = cloneStarterFiles(lesson);
    completedPatches.clear();
    currentCheckpointIndex = 0;
    lessonFreeMode = false;
    root.dataset.checkpointId = currentCheckpoint()?.id ?? "";
    persistFiles(lesson, files);
    editor.setState(
      createEditorState(files[activeFile].source, activeFile, (source) => {
        files[activeFile].source = source;
        saveSoon();
        scheduleRun();
      })
    );
    setError();
  };

  const switchGuide = () => {
    if (!guideWorkspaceInitialized) {
      resetLessonCode();
      guideWorkspaceInitialized = true;
    }
    activeWorkspaceTab = "ai";
    editorHost.hidden = true;
    if (guideWorkspace) guideWorkspace.hidden = false;
    if (labHints) labHints.hidden = true;
    setGuidePhase(guideConversationStarted ? "conversation" : "setup");
    syncTabs();
  };

  const getFilesSnapshot = () =>
    fileNames.map((name) => `--- ${name} ---\n${files[name].source}`).join("\n\n");

  const advanceCheckpoint = (patchId?: string, nextCheckpointId?: string): CheckpointAdvanceResult => {
    const previousId = currentCheckpoint()?.id ?? "";
    const patchCheckpointIndex = patchId
      ? lesson.checkpoints.findIndex((checkpoint) => checkpoint.patchId === patchId)
      : -1;
    const isLastPatch = patchCheckpointIndex === lesson.checkpoints.length - 1;

    if (nextCheckpointId) {
      const found = lesson.checkpoints.findIndex((checkpoint) => checkpoint.id === nextCheckpointId);
      if (found >= 0) currentCheckpointIndex = found;
    } else if (patchCheckpointIndex >= 0 && !isLastPatch) {
      currentCheckpointIndex = patchCheckpointIndex + 1;
    } else if (patchId && currentCheckpoint()?.patchId === patchId) {
      currentCheckpointIndex = Math.min(currentCheckpointIndex + 1, lesson.checkpoints.length - 1);
    }

    const currentId = currentCheckpoint()?.id ?? "";
    root.dataset.checkpointId = currentId;
    return {
      previousId,
      currentId,
      moved: Boolean(currentId && currentId !== previousId),
      completed: Boolean(patchId && isLastPatch)
    };
  };

  const applyGuidePatches = (patches: GuidePatch[]) => {
    const changedFiles = new Set<LabFileName>();

    patches.forEach((patch) => {
      if (!fileNames.includes(patch.file)) {
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
          throw new Error(`无法在 ${patch.file} 中找到 patch 指定片段。`);
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

    persistFiles(lesson, files);
    return [...changedFiles];
  };

  const applyLessonPatch = (patchId: string) => {
    const patch = lesson.patches[patchId];
    if (!patch) throw new Error(`课程包中不存在 patchId：${patchId}`);
    const changedFiles = applyGuidePatches(patch.changes);
    completedPatches.add(patchId);
    return { patch, changedFiles };
  };

  const buildGuideMessages = (mode: "start" | "answer", userText = "") => {
    const checkpoint = currentCheckpoint();
    const errorText = errorBox.textContent || "";
    const systemPrompt = `你是图形学实验教练，当前网站是纯静态页面，课程内容和代码 patch 已经预设在本地。
必须遵守：
1. 每轮最多提出一个问题。
2. 不要一次性讲完整教程，不要输出长篇代码。
3. 预设课程推进模式下，用户回答正确或基本正确时，优先返回 patchId，让网页应用本地预设 patch。
4. 预设课程推进模式下，用户回答不完整时，只给简短反馈和一个提示，不要返回 patchId。
5. 自由实验模式下，允许用户自由提问和要求修改代码；如果用户要求改变画面、shader、动画、交互或渲染效果，优先返回最小 patches，并设置 runAfterApply=true，不要只给文字解释。
6. 只允许修改 main.js、vertex.glsl、fragment.glsl。
7. 如果需要提问，只能写在 question 字段；message 字段不要包含问号、请回答、下一问等提问句。
8. start 模式优先使用当前 checkpoint.question 作为唯一问题，不要自行追加同义问题。
9. patches 只支持两种格式：{"file":"main.js","operation":"replace","target":"原片段","content":"新片段"} 或 {"file":"fragment.glsl","operation":"replace_all","content":"完整文件内容"}。
10. 只返回 JSON，不返回 Markdown。
JSON schema:
{
  "type": "question | feedback | code_patch | summary",
  "message": "给用户看的简短反馈或过渡说明，最多 80 字，不得包含问题",
  "question": "唯一的下一步问题，没有则为空字符串",
  "patchId": "要应用的本地预设 patch id，没有则为空字符串",
  "patches": [{"file": "main.js | vertex.glsl | fragment.glsl", "operation": "replace | replace_all", "target": "replace 时必填", "content": "替换内容"}],
  "runAfterApply": true,
  "expectedObservation": "应用 patch 后应观察到的现象",
  "nextCheckpointId": "可选，进入的 checkpoint id"
}`;

    const lessonPrompt = `课程：${lesson.title}
类别：${lesson.category}
用户可见描述：${lesson.description}
创建时间：${lesson.createdAt}
内部参考来源：${lesson.source}
内部运行环境：${lesson.runtime}
AI 教学摘要：${lesson.aiBrief}
参考要点：
${lesson.referenceBrief.map((item) => `- ${item}`).join("\n")}
参考源码摘录：
${compactReferenceCode(lesson.referenceCode)}
教学规则：
${lesson.teachingRules.map((item) => `- ${item}`).join("\n")}
当前 checkpoint：
${checkpoint ? JSON.stringify(checkpoint, null, 2) : "(已无 checkpoint)"}
已完成 patchId：${[...completedPatches].join(", ") || "(无)"}
当前阶段：${lessonFreeMode ? "自由实验模式，用户可以要求解释或修改代码；如果用户要求改变效果，优先返回 patches 让网页直接应用。" : "预设课程推进模式，优先使用本地 patchId。"}`;

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

  const requestGuide = async (mode: "start" | "answer", userText = "") => {
    if (!hasGuideApiConfig()) {
      setGuidePhase("setup");
      setGuideAlert("请先填写 Endpoint、API Key 和 Model。");
      setGuideState("等待 API");
      return;
    }

    setGuideAlert();
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
        temperature: 0.25,
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
    const directPatches = parsed.patches ?? [];

    if (mode === "start") {
      if (guideLog) guideLog.innerHTML = "";
      setGuidePhase("conversation");
    }

    let changedFiles: LabFileName[] = [];
    let checkpointMoved = false;
    let lessonCompleted = false;
    if (parsed.patchId) {
      const result = applyLessonPatch(parsed.patchId);
      changedFiles = result.changedFiles;
      const advanceResult = advanceCheckpoint(parsed.patchId, parsed.nextCheckpointId);
      checkpointMoved = advanceResult.moved;
      lessonCompleted = advanceResult.completed;
      if (lessonCompleted) lessonFreeMode = true;
    } else if (directPatches.length) {
      changedFiles = applyGuidePatches(directPatches);
      const advanceResult = advanceCheckpoint(undefined, parsed.nextCheckpointId);
      checkpointMoved = advanceResult.moved;
    }

    const shouldAskNextQuestion =
      Boolean(changedFiles.length) &&
      checkpointMoved &&
      Boolean(currentCheckpoint()) &&
      !parsed.question;
    const shouldRepeatCurrentQuestion =
      mode === "answer" &&
      !lessonCompleted &&
      !checkpointMoved &&
      !changedFiles.length &&
      !directPatches.length &&
      Boolean(currentCheckpoint()) &&
      !parsed.question;
    const parsedQuestion = lessonCompleted ? "" : parsed.question;
    const displayedQuestion =
      parsedQuestion ||
      (mode === "start" && parsed.type === "question" ? currentCheckpoint()?.question : "") ||
      (shouldAskNextQuestion ? currentCheckpoint()?.question : "") ||
      (shouldRepeatCurrentQuestion ? currentCheckpoint()?.question : "");
    const displayedMessage = removeQuestionSentences(parsed.message ?? "", displayedQuestion ?? "");
    const retryMessage =
      shouldRepeatCurrentQuestion && !displayedMessage
        ? "再想一下这个关键点。可以结合提示重新回答。"
        : "";
    const completionMessage =
      lessonCompleted && !displayedQuestion
        ? "预设实验已完成。你可以继续让 AI 解释当前代码，也可以直接要求它修改代码、shader 或画面效果。"
        : "";
    const aiText = [displayedMessage, retryMessage, displayedQuestion ?? "", completionMessage]
      .filter(Boolean)
      .join("\n\n");
    if (aiText) appendGuideEntry("assistant", "AI Guide", aiText);

    if (changedFiles.length && parsed.runAfterApply) {
      await runProgram();
    }

    setGuideState(displayedQuestion ? "等待回答" : lessonCompleted ? "可自由提问" : "已更新");
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
    const shouldReturnToGuide = activeWorkspaceTab === "ai";
    resetLessonCode();
    resetGuideSession();
    if (shouldReturnToGuide) {
      switchGuide();
    } else {
      switchFile(activeFile);
    }
    void runProgram();
  };

  fileTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const fileName = tab.dataset.file as LabFileName | undefined;
      if (fileName && fileNames.includes(fileName)) switchFile(fileName);
    });
  });

  guideTab?.addEventListener("click", switchGuide);

  runButton.addEventListener("click", () => {
    persistFiles(lesson, files);
    void runProgram();
  });

  resetButton.addEventListener("click", resetLab);

  expandButton.addEventListener("click", () => {
    const isExpanded = labWorkspace.classList.toggle("is-editor-expanded");
    expandButton.setAttribute("aria-label", isExpanded ? "恢复预览" : "展开工作区");
    expandButton.setAttribute("title", isExpanded ? "恢复预览" : "展开工作区");
    expandButton.setAttribute("aria-pressed", String(isExpanded));
    editor.requestMeasure();
  });

  guideStartButton?.addEventListener("click", () => {
    void requestGuide("start").catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      setGuideState("API 错误");
      setGuideAlert(message);
    });
  });

  guideConfigureButton?.addEventListener("click", () => {
    setGuidePhase("setup");
  });

  guideReturnButton?.addEventListener("click", () => {
    setGuidePhase(guideConversationStarted ? "conversation" : "setup");
  });

  guideForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!guideConversationStarted) {
      setGuidePhase("setup");
      setGuideAlert("请先填写 API 并生成第一问。");
      setGuideState("等待 API");
      return;
    }
    const userText = guideInput?.value.trim() ?? "";
    if (!userText) return;
    appendGuideEntry("user", "", userText);
    if (guideInput) guideInput.value = "";
    void requestGuide("answer", userText).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      setGuideState("API 错误");
      setGuideAlert(message);
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
      if (activeWorkspaceTab === "ai") {
        guideForm?.requestSubmit();
        return;
      }
      persistFiles(lesson, files);
      void runProgram();
    }

    if (event.key.toLowerCase() === "s") {
      event.preventDefault();
      persistFiles(lesson, files);
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
    const checkpoint = currentCheckpoint();
    if (!checkpoint) throw new Error("课程没有 checkpoint。");
    const result = applyLessonPatch(checkpoint.patchId);
    advanceCheckpoint(checkpoint.patchId);
    await runProgram();
    await new Promise((resolve) => window.setTimeout(resolve, 180));

    return {
      ok: root.dataset.labState === "ok" && !errorBox.textContent,
      status: statusLabel.textContent || "",
      error: errorBox.textContent || "",
      appliedFiles: result.changedFiles,
      checkpointId: root.dataset.checkpointId || ""
    };
  };

  window.__graphicsLabSmokeTest = smokeTest;
  window.__graphicsLabGuideSmokeTest = guideSmokeTest;
  root.dataset.labReady = "true";
  root.dataset.guideReady = "true";

  setGuidePhase("setup");
  setGuideState("等待 API");
  switchGuide();
  void runProgram();
}

document.querySelectorAll<HTMLElement>("[data-graphics-lab]").forEach(initGraphicsLab);
