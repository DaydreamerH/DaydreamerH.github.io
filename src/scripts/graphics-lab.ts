import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
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

type LabFileName = string;
type WorkspaceTab = LabFileName | "ai" | "review";

type LabFile = {
  label: string;
  name: LabFileName;
  source: string;
};

type RuntimeCleanup = () => void;
type RuntimeResult =
  | RuntimeCleanup
  | {
      cleanup?: RuntimeCleanup;
      dispose?: RuntimeCleanup;
      renderer?: THREE.WebGLRenderer;
      camera?: THREE.Camera;
      scene?: THREE.Scene;
      render?: () => void;
    };
type CameraSnapshot = {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  up: THREE.Vector3;
  zoom?: number;
};
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

type ChangeReviewEntry = {
  file: LabFileName;
  operation: GuidePatch["operation"];
  startLine: number;
  endLine: number;
  before: string;
  after: string;
  compacted?: boolean;
};

type ChangeReviewDiffRow = {
  kind: "context" | "add" | "remove" | "fold";
  oldLine?: number;
  newLine?: number;
  text: string;
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
  files?: LabFileName[];
  flow?: "question_only" | "answer_then_patch" | "observe_then_question";
  question: string;
  expectedKeywords: string[];
  hint: string;
  patchId?: string;
  expectedObservation?: string;
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
  shaderSets?: Array<{
    name: string;
    role?: string;
    vertex?: string;
    fragment?: string;
  }>;
  workspaceFiles?: Array<{
    path: LabFileName;
    role: "entry" | "shader" | "helper" | "data" | "metadata";
    label?: string;
    concept?: string;
    visible?: boolean;
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
  answerCorrect?: boolean;
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
const PREVIEW_LAYOUT_KEY = "daydreamerh.graphics-lab.preview-layout";
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

function isDevServerNoise(message: string) {
  return message.includes("[vite] Error: send was called before connect");
}

function labCompletionSource(fileName: LabFileName) {
  const completions = isJavaScriptFile(fileName) ? jsCompletions : isShaderFile(fileName) ? glslCompletions : [];

  return (context: CompletionContext) => {
    if (!completions.length) return null;
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
    if (!raw) throw new Error("Missing lesson payload.");
    const lesson = JSON.parse(raw) as GraphicsLesson;
    if (!lesson.id || !lesson.starterFiles) throw new Error("Invalid lesson payload.");
    return lesson;
  } catch (error) {
    root.dataset.labError = error instanceof Error ? error.message : String(error);
    throw error;
  }
}

function isJavaScriptFile(fileName: LabFileName) {
  return /\.(c|m)?[jt]s$/i.test(fileName);
}

function isShaderFile(fileName: LabFileName) {
  return /\.(glsl|vert|frag|vs|fs)$/i.test(fileName);
}

function getWorkspaceFileMeta(lesson: GraphicsLesson, fileName: LabFileName) {
  return lesson.workspaceFiles?.find((file) => file.path === fileName);
}

function getEntryFileName(lesson: GraphicsLesson) {
  const entryFile = lesson.workspaceFiles?.find((file) => file.role === "entry" && lesson.starterFiles?.[file.path]);
  if (!entryFile) {
    throw new Error(`Graphics lesson "${lesson.id}" must declare exactly one workspaceFiles entry with role="entry".`);
  }
  return entryFile.path;
}

function sortLessonFileNames(lesson: GraphicsLesson, names: Iterable<LabFileName>) {
  const entryFileName = getEntryFileName(lesson);
  const metadata = new Map((lesson.workspaceFiles ?? []).map((file, index) => [file.path, { ...file, index }]));
  const roleOrder = new Map([
    ["entry", 0],
    ["data", 1],
    ["metadata", 2],
    ["shader", 3],
    ["helper", 4]
  ]);

  return [...new Set(names)].sort((a, b) => {
    if (a === entryFileName) return -1;
    if (b === entryFileName) return 1;
    const aMeta = metadata.get(a);
    const bMeta = metadata.get(b);
    const aRole = roleOrder.get(aMeta?.role ?? "") ?? 9;
    const bRole = roleOrder.get(bMeta?.role ?? "") ?? 9;
    if (aRole !== bRole) return aRole - bRole;
    if (aMeta && bMeta && aMeta.index !== bMeta.index) return aMeta.index - bMeta.index;
    if (aMeta && !bMeta) return -1;
    if (!aMeta && bMeta) return 1;
    return a.localeCompare(b);
  });
}

function getLessonFileNames(lesson: GraphicsLesson) {
  const names = Object.keys(lesson.starterFiles ?? {});
  const uniqueNames = new Set<string>(names);
  (lesson.workspaceFiles ?? []).forEach((file) => uniqueNames.add(file.path));
  const entryFileName = getEntryFileName(lesson);
  if (!uniqueNames.has(entryFileName)) uniqueNames.add(entryFileName);
  return sortLessonFileNames(lesson, uniqueNames);
}

function getVisibleLessonFileNames(lesson: GraphicsLesson) {
  const hiddenFiles = new Set(
    (lesson.workspaceFiles ?? [])
      .filter((file) => file.visible === false)
      .map((file) => file.path)
  );
  return getLessonFileNames(lesson).filter((name) => !hiddenFiles.has(name));
}

function isKnownFileName(fileNames: LabFileName[], fileName: string): fileName is LabFileName {
  return fileNames.includes(fileName);
}

function hashText(text = "") {
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
}

function makeStorageKey(lesson: GraphicsLesson) {
  const lessonSignature = [
    ...getLessonFileNames(lesson),
    ...Object.entries(lesson.starterFiles ?? {}).map(([file, source]) => `${file}:${source.length}:${hashText(source)}`),
    ...(lesson.workspaceFiles ?? []).map((file) => `${file.path}:${file.role}:${file.visible === false ? "hidden" : "visible"}`),
    ...Object.keys(lesson.patches ?? {})
  ]
    .sort()
    .join("|");
  let hash = 0;
  for (let index = 0; index < lessonSignature.length; index += 1) {
    hash = (hash * 31 + lessonSignature.charCodeAt(index)) >>> 0;
  }
  return `${STORAGE_KEY_PREFIX}.${lesson.id}.v3.${hash.toString(36)}`;
}

function cloneStarterFiles(lesson: GraphicsLesson, fileNames: LabFileName[]): Record<LabFileName, LabFile> {
  return Object.fromEntries(
    fileNames.map((name) => [
      name,
      {
        name,
        label: name,
        source: lesson.starterFiles[name] ?? ""
      }
    ])
  ) as Record<LabFileName, LabFile>;
}

function loadFiles(lesson: GraphicsLesson, fileNames: LabFileName[]) {
  try {
    const saved = window.localStorage.getItem(makeStorageKey(lesson));
    if (!saved) return cloneStarterFiles(lesson, fileNames);

    const parsed = JSON.parse(saved) as Partial<Record<LabFileName, string>>;
    const mergedNames = [...new Set([...fileNames, ...Object.keys(parsed)])];
    const files = cloneStarterFiles(lesson, mergedNames);
    mergedNames.forEach((name) => {
      if (typeof parsed[name] === "string") {
        const starterSource = lesson.starterFiles[name] ?? "";
        const savedSource = parsed[name] ?? "";
        files[name].source = savedSource.trim() || !starterSource.trim() ? savedSource : files[name].source;
      }
    });
    return files;
  } catch {
    return cloneStarterFiles(lesson, fileNames);
  }
}

function persistFiles(lesson: GraphicsLesson, files: Record<LabFileName, LabFile>) {
  const payload = Object.fromEntries(Object.values(files).map((file) => [file.name, file.source]));
  window.localStorage.setItem(makeStorageKey(lesson), JSON.stringify(payload));
}

function extractJsonObject(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] ?? text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("AI did not return a parseable JSON object.");
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
    nextCheckpointId: response.nextCheckpointId ?? "",
    answerCorrect: Boolean(response.answerCorrect)
  };
}

function removeQuestionSentences(message: string, question: string) {
  if (!message || !question) return message;
  return message
    .split(/(?<=[。！？?!])\s*/)
    .filter((sentence) => {
      const trimmed = sentence.trim();
      return trimmed && !/[？?]/.test(trimmed) && !trimmed.includes("please answer");
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

function describeWorkspaceFiles(lesson: GraphicsLesson) {
  const metadata = new Map((lesson.workspaceFiles ?? []).map((file) => [file.path, file]));
  return getLessonFileNames(lesson)
    .map((name) => {
      const file = metadata.get(name);
      const role = file?.role ?? (name === getEntryFileName(lesson) ? "entry" : name.endsWith(".glsl") ? "shader" : "helper");
      const concept = file?.concept ? ` | ${file.concept}` : "";
      const visibility = file?.visible === false ? " | hidden metadata" : "";
      return `- ${name} | ${role}${concept}${visibility}`;
    })
    .join("\n");
}

function describeShaderSets(lesson: GraphicsLesson) {
  if (!lesson.shaderSets?.length) return "(无)";
  return lesson.shaderSets
    .map((set) => {
      const stages = [set.vertex ? `vertex=${set.vertex}` : "", set.fragment ? `fragment=${set.fragment}` : ""]
        .filter(Boolean)
        .join(", ");
      return `- ${set.name}${set.role ? ` | ${set.role}` : ""}${stages ? ` | ${stages}` : ""}`;
    })
    .join("\n");
}

function describeCheckpointFiles(checkpoint?: LessonCheckpoint) {
  if (!checkpoint?.files?.length) return "(鏈０鏄?";
  return checkpoint.files.map((file) => `- ${file}`).join("\n");
}

function describePatchableFiles(lesson: GraphicsLesson, fileNames: LabFileName[]) {
  return fileNames
    .map((name) => {
      const file = getWorkspaceFileMeta(lesson, name);
      return `- ${name}${file?.role ? ` | ${file.role}` : ""}${file?.concept ? ` | ${file.concept}` : ""}`;
    })
    .join("\n");
}

function createEditorState(
  source: string,
  fileName: LabFileName,
  onChange: (source: string) => void
) {
  const languageExtension = isJavaScriptFile(fileName) ? javascript() : [];

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
  const previewPanel = root.querySelector<HTMLElement>(".lab-preview-panel");
  const previewDragHandle = root.querySelector<HTMLElement>("[data-preview-drag]");
  const previewResizeHandle = root.querySelector<HTMLElement>("[data-preview-resize]");
  const canvas = root.querySelector<HTMLCanvasElement>("[data-lab-canvas]");
  const editorHost = root.querySelector<HTMLElement>("[data-editor-host]");
  const fileTabsContainer = root.querySelector<HTMLElement>("[data-file-tabs]");
  let fileTabs = [...root.querySelectorAll<HTMLButtonElement>("[data-file-tab]")];
  const guideTab = root.querySelector<HTMLButtonElement>("[data-guide-tab]");
  const changeReviewTab = root.querySelector<HTMLButtonElement>("[data-change-review-tab]");
  const changeReview = root.querySelector<HTMLElement>("[data-change-review]");
  const changeReviewBody = root.querySelector<HTMLElement>("[data-change-review-body]");
  const changeReviewEmpty = root.querySelector<HTMLElement>("[data-change-review-empty]");
  const guideWorkspace = root.querySelector<HTMLElement>("[data-guide-workspace]");
  const guideSetup = root.querySelector<HTMLElement>("[data-guide-setup]");
  const guideConversation = root.querySelector<HTMLElement>("[data-guide-conversation]");
  const guideAlert = root.querySelector<HTMLElement>("[data-guide-alert]");
  const guideChatAlert = root.querySelector<HTMLElement>("[data-guide-chat-alert]");
  const guideConfigureButton = root.querySelector<HTMLButtonElement>("[data-guide-configure]");
  const runButton = root.querySelector<HTMLButtonElement>("[data-run]");
  const runButtonLabel = root.querySelector<HTMLElement>("[data-run-label]");
  const resetButton = root.querySelector<HTMLButtonElement>("[data-reset-lab]");
  const previewHideButton = root.querySelector<HTMLButtonElement>("[data-preview-hide]");
  const previewShowButton = root.querySelector<HTMLButtonElement>("[data-preview-show]");
  const orbitToggleButton = root.querySelector<HTMLButtonElement>("[data-orbit-toggle]");
  const sidebarToggleButton = root.querySelector<HTMLButtonElement>("[data-toggle-lab-sidebar]");
  const workspaceLabel = root.querySelector<HTMLElement>("[data-workspace-label]");
  const workspaceTitle = root.querySelector<HTMLElement>("[data-workspace-title]");
  const statusLabel = root.querySelector<HTMLElement>("[data-lab-status]");
  const statusDot = root.querySelector<HTMLElement>("[data-lab-status-dot]");
  const errorBox = root.querySelector<HTMLElement>("[data-lab-errors]");
  const autoRunToggle = root.querySelector<HTMLInputElement>("[data-auto-run]");
  const guideState = root.querySelector<HTMLElement>("[data-guide-state]");
  const guideStateMirror = root.querySelector<HTMLElement>("[data-guide-state-mirror]");
  const guideSurface = root.querySelector<HTMLElement>(".lab-chat-surface");
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
    !previewPanel ||
    !canvas ||
    !editorHost ||
    !runButton ||
    !resetButton ||
    !statusLabel ||
    !statusDot ||
    !errorBox
  ) {
    return;
  }

  let entryFileName = getEntryFileName(lesson);
  let workspaceFileNames = getLessonFileNames(lesson);
  let fileNames = getVisibleLessonFileNames(lesson);
  let files = loadFiles(lesson, workspaceFileNames);
  workspaceFileNames = getLessonFileNames({ ...lesson, starterFiles: Object.fromEntries(Object.keys(files).map((name) => [name, files[name].source])) });
  fileNames = getVisibleLessonFileNames({
    ...lesson,
    starterFiles: Object.fromEntries(workspaceFileNames.map((name) => [name, files[name].source]))
  });
  let activeFile: LabFileName = files[entryFileName] ? entryFileName : fileNames[0];
  let activeWorkspaceTab: WorkspaceTab = "ai";
  let guideConversationStarted = false;
  let cleanup: RuntimeCleanup | undefined;
  let runTimer = 0;
  let saveTimer = 0;
  let runId = 0;
  let orbitEnabled = false;
  let orbitControls: OrbitControls | undefined;
  let runtimeResult: Exclude<RuntimeResult, RuntimeCleanup> | undefined;
  let orbitAnimationFrame = 0;
  let defaultCameraSnapshot: CameraSnapshot | undefined;
  let currentCheckpointIndex = 0;
  let guideWorkspaceInitialized = false;
  let lessonFreeMode = false;
  let latestChangeReview: ChangeReviewEntry[] = [];
  let selectedChangeReviewIndex = 0;
  let changeReviewUnread = false;
  const completedPatches = new Set<string>();
  const guideHistory: Array<{ role: "user" | "assistant"; content: string }> = [];

  root.dataset.lessonId = lesson.id;
  root.dataset.checkpointId = lesson.checkpoints[0]?.id ?? "";

  const currentCheckpoint = () => lesson.checkpoints[currentCheckpointIndex];
  const isObservationCheckpoint = (checkpoint?: LessonCheckpoint) =>
    Boolean(checkpoint?.patchId && checkpoint.flow === "observe_then_question");
  const isPatchAlreadyApplied = (patchId?: string) => Boolean(patchId && completedPatches.has(patchId));

  const countLines = (text: string) => text.split(/\r\n|\r|\n/).length;

  const lineNumberAt = (source: string, index: number) => countLines(source.slice(0, Math.max(index, 0)));

  const normalizeNewlines = (text: string) => text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  const originalIndexFromNormalizedIndex = (source: string, normalizedIndex: number) => {
    if (normalizedIndex <= 0) return 0;
    let offset = 0;
    for (let index = 0; index < source.length; index += 1) {
      if (offset === normalizedIndex) return index;
      if (source[index] === "\r" && source[index + 1] === "\n") {
        offset += 1;
        index += 1;
      } else {
        offset += 1;
      }
    }
    return source.length;
  };

  const findPatchTargetRange = (source: string, target: string) => {
    const directIndex = source.indexOf(target);
    if (directIndex >= 0) {
      return {
        start: directIndex,
        end: directIndex + target.length
      };
    }

    const normalizedSource = normalizeNewlines(source);
    const normalizedTarget = normalizeNewlines(target);
    const normalizedIndex = normalizedSource.indexOf(normalizedTarget);
    if (normalizedIndex < 0) return null;

    return {
      start: originalIndexFromNormalizedIndex(source, normalizedIndex),
      end: originalIndexFromNormalizedIndex(source, normalizedIndex + normalizedTarget.length)
    };
  };

  const splitLines = (text: string) => normalizeNewlines(text).split("\n");

  const makeDiffRows = (before: string, after: string, startLine: number): ChangeReviewDiffRow[] => {
    const beforeLines = splitLines(before);
    const afterLines = splitLines(after);
    const dp = Array.from({ length: beforeLines.length + 1 }, () => Array(afterLines.length + 1).fill(0));

    for (let oldIndex = beforeLines.length - 1; oldIndex >= 0; oldIndex -= 1) {
      for (let newIndex = afterLines.length - 1; newIndex >= 0; newIndex -= 1) {
        dp[oldIndex][newIndex] =
          beforeLines[oldIndex] === afterLines[newIndex]
            ? dp[oldIndex + 1][newIndex + 1] + 1
            : Math.max(dp[oldIndex + 1][newIndex], dp[oldIndex][newIndex + 1]);
      }
    }

    const rows: ChangeReviewDiffRow[] = [];
    let oldIndex = 0;
    let newIndex = 0;
    let oldLine = startLine;
    let newLine = startLine;

    const pushContext = (text: string) => {
      const isFold = text === "...";
      rows.push({
        kind: isFold ? "fold" : "context",
        oldLine: isFold ? undefined : oldLine,
        newLine: isFold ? undefined : newLine,
        text
      });
      if (!isFold) {
        oldLine += 1;
        newLine += 1;
      }
    };

    while (oldIndex < beforeLines.length && newIndex < afterLines.length) {
      if (beforeLines[oldIndex] === afterLines[newIndex]) {
        pushContext(beforeLines[oldIndex]);
        oldIndex += 1;
        newIndex += 1;
      } else if (dp[oldIndex + 1][newIndex] >= dp[oldIndex][newIndex + 1]) {
        rows.push({ kind: "remove", oldLine, text: beforeLines[oldIndex] });
        oldIndex += 1;
        oldLine += 1;
      } else {
        rows.push({ kind: "add", newLine, text: afterLines[newIndex] });
        newIndex += 1;
        newLine += 1;
      }
    }

    while (oldIndex < beforeLines.length) {
      const text = beforeLines[oldIndex];
      if (text === "...") {
        rows.push({ kind: "fold", text });
      } else {
        rows.push({ kind: "remove", oldLine, text });
        oldLine += 1;
      }
      oldIndex += 1;
    }

    while (newIndex < afterLines.length) {
      const text = afterLines[newIndex];
      if (text === "...") {
        rows.push({ kind: "fold", text });
      } else {
        rows.push({ kind: "add", newLine, text });
        newLine += 1;
      }
      newIndex += 1;
    }

    return rows;
  };

  const makeChangeDiffBlock = (entry: ChangeReviewEntry) => {
    const diff = document.createElement("div");
    diff.className = "change-review-diff";

    const header = document.createElement("div");
    header.className = "change-review-hunk";
    header.textContent = `@@ -${entry.startLine},${countLines(entry.before)} +${entry.startLine},${countLines(entry.after)} @@`;
    diff.append(header);

    makeDiffRows(entry.before, entry.after, entry.startLine).forEach((row) => {
      const line = document.createElement("div");
      line.className = `change-review-line is-${row.kind}`;

      const oldNumber = document.createElement("span");
      oldNumber.className = "change-review-line-number";
      oldNumber.textContent = row.oldLine ? String(row.oldLine) : "";

      const newNumber = document.createElement("span");
      newNumber.className = "change-review-line-number";
      newNumber.textContent = row.newLine ? String(row.newLine) : "";

      const marker = document.createElement("span");
      marker.className = "change-review-marker";
      marker.textContent = row.kind === "add" ? "+" : row.kind === "remove" ? "-" : row.kind === "fold" ? "..." : "";

      const code = document.createElement("code");
      code.textContent = row.kind === "fold" ? "部分内容未展开" : row.text || " ";

      line.append(oldNumber, newNumber, marker, code);
      diff.append(line);
    });

    return diff;
  };

  const compactCodePreview = (
    before: string,
    after: string,
    fallbackStartLine = 1,
    contextLines = 4,
    maxLines = 42
  ) => {
    const beforeLines = splitLines(before);
    const afterLines = splitLines(after);
    let prefix = 0;
    while (
      prefix < beforeLines.length &&
      prefix < afterLines.length &&
      beforeLines[prefix] === afterLines[prefix]
    ) {
      prefix += 1;
    }

    let suffix = 0;
    while (
      suffix < beforeLines.length - prefix &&
      suffix < afterLines.length - prefix &&
      beforeLines[beforeLines.length - 1 - suffix] === afterLines[afterLines.length - 1 - suffix]
    ) {
      suffix += 1;
    }

    const beforeChangeEnd = beforeLines.length - suffix;
    const afterChangeEnd = afterLines.length - suffix;
    const beforeStart = Math.max(0, prefix - contextLines);
    const afterStart = Math.max(0, prefix - contextLines);
    const beforeEnd = Math.min(beforeLines.length, beforeChangeEnd + contextLines);
    const afterEnd = Math.min(afterLines.length, afterChangeEnd + contextLines);

    const clip = (lines: string[], start: number, end: number) => {
      const selected = lines.slice(start, end);
      let compacted = start > 0 || end < lines.length;
      if (selected.length > maxLines) {
        selected.splice(Math.floor(maxLines / 2), selected.length - maxLines, "...");
        compacted = true;
      }
      if (start > 0) selected.unshift("...");
      if (end < lines.length) selected.push("...");
      return {
        compacted,
        text: selected.join("\n")
      };
    };

    const beforePreview = clip(beforeLines, beforeStart, beforeEnd);
    const afterPreview = clip(afterLines, afterStart, afterEnd);
    return {
      before: beforePreview.text,
      after: afterPreview.text,
      compacted: beforePreview.compacted || afterPreview.compacted,
      startLine: fallbackStartLine + beforeStart,
      endLine: fallbackStartLine + Math.max(beforeStart, beforeEnd - 1)
    };
  };

  const renderChangeReview = () => {
    if (!changeReviewBody || !changeReviewEmpty) return;
    changeReviewBody.replaceChildren();
    const hasChanges = latestChangeReview.length > 0;
    changeReviewEmpty.hidden = hasChanges;
    changeReviewBody.hidden = !hasChanges;
    changeReview?.classList.toggle("has-review", hasChanges);
    changeReviewTab?.classList.toggle("has-change", hasChanges && changeReviewUnread);
    changeReviewTab?.setAttribute(
      "title",
      hasChanges ? "查看 AI 最近一次代码修改" : "暂无 AI 代码修改"
    );

    if (!hasChanges) return;

    selectedChangeReviewIndex = Math.min(selectedChangeReviewIndex, latestChangeReview.length - 1);
    const selectedEntry = latestChangeReview[selectedChangeReviewIndex];
    const shell = document.createElement("div");
    shell.className = "change-review-shell";

    const fileList = document.createElement("div");
    fileList.className = "change-review-files";
    latestChangeReview.forEach((entry, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "change-review-file";
      button.classList.toggle("is-active", index === selectedChangeReviewIndex);
      button.setAttribute("aria-pressed", String(index === selectedChangeReviewIndex));

      const name = document.createElement("strong");
      name.textContent = entry.file;
      const summary = document.createElement("span");
      const operationLabel = entry.operation === "replace_all" ? "完整替换" : "局部替换";
      summary.textContent = `${operationLabel} 路 Line ${entry.startLine}-${entry.endLine}`;
      button.append(name, summary);
      button.addEventListener("click", () => {
        selectedChangeReviewIndex = index;
        renderChangeReview();
      });
      fileList.append(button);
    });

    const article = document.createElement("article");
    article.className = "change-review-entry";

    const meta = document.createElement("div");
    meta.className = "change-review-meta";
    const file = document.createElement("strong");
    file.textContent = selectedEntry.file;
    const detail = document.createElement("span");
    const operationLabel = selectedEntry.operation === "replace_all" ? "完整替换" : "局部替换";
    detail.textContent = `${operationLabel}${selectedEntry.compacted ? " / 变更片段" : ""} / Line ${selectedEntry.startLine}-${selectedEntry.endLine}`;
    meta.append(file, detail);

    article.append(meta, makeChangeDiffBlock(selectedEntry));
    shell.append(fileList, article);
    changeReviewBody.append(shell);
  };

  const flashChangeReview = () => {
    [changeReview, changeReviewTab].forEach((element) => {
      if (!element) return;
      element.classList.remove("is-change-updated");
      void element.offsetWidth;
      element.classList.add("is-change-updated");
    });
  };

  const setRunFeedback = (type: "idle" | "running" | "ok" | "error", text: string) => {
    const labels = {
      idle: "运行",
      running: "运行中",
      ok: "完成",
      error: "错误"
    };
    runButton.dataset.runState = type;
    runButton.dataset.runFeedback = text;
    runButton.disabled = type === "running";
    if (runButtonLabel) runButtonLabel.textContent = labels[type];
  };

  const setStatus = (type: "idle" | "running" | "ok" | "error", text: string) => {
    const shortLabels = {
      idle: text.includes("保存") ? "已保存" : "等待",
      running: "运行中",
      ok: "完成",
      error: "错误"
    };
    statusLabel.textContent = shortLabels[type];
    statusLabel.title = text;
    statusDot.dataset.state = type;
    root.dataset.labState = type;
    root.dataset.labMessage = text;
    setRunFeedback(type, text);
  };

  const setError = (message = "") => {
    errorBox.textContent = message;
    errorBox.hidden = !message;
    root.dataset.labError = message;
  };

  const setOrbitButtonState = () => {
    if (!orbitToggleButton) return;
    orbitToggleButton.classList.toggle("is-active", orbitEnabled);
    orbitToggleButton.setAttribute("aria-pressed", String(orbitEnabled));
    orbitToggleButton.title = orbitEnabled ? "关闭轨道控制器" : "开启轨道控制器";
  };

  const disposeOrbitControls = () => {
    if (orbitAnimationFrame) {
      window.cancelAnimationFrame(orbitAnimationFrame);
      orbitAnimationFrame = 0;
    }
    if (!orbitControls) return;
    orbitControls.dispose();
    orbitControls = undefined;
  };

  const captureCameraSnapshot = (camera: THREE.Camera): CameraSnapshot => {
    const cameraWithZoom = camera as THREE.Camera & { zoom?: number };
    return {
      position: camera.position.clone(),
      quaternion: camera.quaternion.clone(),
      up: camera.up.clone(),
      zoom: typeof cameraWithZoom.zoom === "number" ? cameraWithZoom.zoom : undefined
    };
  };

  const renderRuntimePreview = () => {
    if (runtimeResult?.render) {
      runtimeResult.render();
    } else if (runtimeResult?.scene && runtimeResult?.renderer && runtimeResult?.camera) {
      runtimeResult.renderer.render(runtimeResult.scene, runtimeResult.camera);
    }
  };

  const restoreCameraSnapshot = () => {
    const camera = runtimeResult?.camera;
    if (!camera || !defaultCameraSnapshot) return;

    camera.position.copy(defaultCameraSnapshot.position);
    camera.quaternion.copy(defaultCameraSnapshot.quaternion);
    camera.up.copy(defaultCameraSnapshot.up);

    const cameraWithProjection = camera as THREE.Camera & {
      zoom?: number;
      updateProjectionMatrix?: () => void;
    };
    if (typeof defaultCameraSnapshot.zoom === "number") {
      cameraWithProjection.zoom = defaultCameraSnapshot.zoom;
    }
    cameraWithProjection.updateProjectionMatrix?.();
    renderRuntimePreview();
  };

  const createTrackedThree = () => {
    const captured: Pick<Exclude<RuntimeResult, RuntimeCleanup>, "renderer" | "camera" | "scene"> = {};

    class CapturedWebGLRenderer extends THREE.WebGLRenderer {
      constructor(...args: ConstructorParameters<typeof THREE.WebGLRenderer>) {
        super(...args);
        captured.renderer = this;
      }
    }

    class CapturedPerspectiveCamera extends THREE.PerspectiveCamera {
      constructor(...args: ConstructorParameters<typeof THREE.PerspectiveCamera>) {
        super(...args);
        captured.camera = this;
      }
    }

    class CapturedOrthographicCamera extends THREE.OrthographicCamera {
      constructor(...args: ConstructorParameters<typeof THREE.OrthographicCamera>) {
        super(...args);
        captured.camera = this;
      }
    }

    class CapturedScene extends THREE.Scene {
      constructor(...args: ConstructorParameters<typeof THREE.Scene>) {
        super(...args);
        captured.scene = this;
      }
    }

    const trackedThree = {
      ...THREE,
      WebGLRenderer: CapturedWebGLRenderer,
      PerspectiveCamera: CapturedPerspectiveCamera,
      OrthographicCamera: CapturedOrthographicCamera,
      Scene: CapturedScene,
      OrbitControls
    } as typeof THREE;

    return { THREE: trackedThree, captured };
  };

  const normalizeRuntimeResult = (
    result: unknown,
    captured: Pick<Exclude<RuntimeResult, RuntimeCleanup>, "renderer" | "camera" | "scene">
  ) => {
    runtimeResult = undefined;
    cleanup = undefined;
    if (typeof result === "function") {
      cleanup = result as RuntimeCleanup;
      runtimeResult = Object.values(captured).some(Boolean) ? { ...captured } : undefined;
      return;
    }
    if (!result || typeof result !== "object") return;

    const candidate = result as Exclude<RuntimeResult, RuntimeCleanup>;
    runtimeResult = { ...captured, ...candidate };
    cleanup = candidate.cleanup ?? candidate.dispose;
  };

  const applyOrbitControls = () => {
    disposeOrbitControls();
    setOrbitButtonState();
    if (!orbitEnabled) {
      restoreCameraSnapshot();
      defaultCameraSnapshot = undefined;
      return;
    }

    const renderer = runtimeResult?.renderer;
    const camera = runtimeResult?.camera;
    if (!renderer || !camera) {
      setError("当前代码需要返回 { renderer, camera } 后才能使用轨道控制器。");
      return;
    }

    defaultCameraSnapshot = captureCameraSnapshot(camera);
    orbitControls = new OrbitControls(camera, renderer.domElement);
    orbitControls.enableDamping = true;
    orbitControls.dampingFactor = 0.08;

    const renderOrbitFrame = () => {
      if (!orbitControls || !runtimeResult?.renderer || !runtimeResult?.camera) return;
      orbitControls.update();
      renderRuntimePreview();
      orbitAnimationFrame = window.requestAnimationFrame(renderOrbitFrame);
    };

    renderOrbitFrame();
  };

  const clamp = (value: number, min: number, max: number) => {
    if (max < min) return min;
    return Math.min(Math.max(value, min), max);
  };
  const getPreviewSafeTop = () => {
    const topbar = document.querySelector<HTMLElement>("[data-topbar]");
    if (!topbar || topbar.classList.contains("is-hidden")) return 8;
    const rect = topbar.getBoundingClientRect();
    return Math.max(8, Math.ceil(rect.bottom) + 8);
  };

  const applyPreviewLayout = (layout: Partial<{ left: number; top: number; width: number; height: number }>) => {
    const width = clamp(layout.width ?? (previewPanel.offsetWidth || 360), 260, window.innerWidth - 16);
    const safeTop = getPreviewSafeTop();
    const height = clamp(layout.height ?? (previewPanel.offsetHeight || 240), 190, window.innerHeight - safeTop - 8);
    const left = clamp(layout.left ?? window.innerWidth - width - 42, 8, window.innerWidth - width - 8);
    const top = clamp(layout.top ?? safeTop, safeTop, window.innerHeight - height - 8);

    previewPanel.style.width = `${width}px`;
    previewPanel.style.height = `${height}px`;
    previewPanel.style.left = `${left}px`;
    previewPanel.style.top = `${top}px`;
    previewPanel.style.right = "auto";
  };

  const savePreviewLayout = () => {
    const rect = previewPanel.getBoundingClientRect();
    try {
      localStorage.setItem(
        PREVIEW_LAYOUT_KEY,
        JSON.stringify({
          left: Math.round(rect.left),
          top: Math.round(rect.top),
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        })
      );
    } catch {
      // Ignore storage failures; the preview still works without persistence.
    }
  };

  const restorePreviewLayout = () => {
    try {
      const raw = localStorage.getItem(PREVIEW_LAYOUT_KEY);
      if (!raw) return;
      applyPreviewLayout(JSON.parse(raw) as Partial<{ left: number; top: number; width: number; height: number }>);
    } catch {
      applyPreviewLayout({});
    }
  };

  const initPreviewWindowControls = () => {
    restorePreviewLayout();

    previewDragHandle?.addEventListener("pointerdown", (event) => {
      if ((event.target as HTMLElement).closest("button")) return;
      const rect = previewPanel.getBoundingClientRect();
      const offsetX = event.clientX - rect.left;
      const offsetY = event.clientY - rect.top;
      previewPanel.classList.add("is-dragging");
      previewDragHandle.setPointerCapture(event.pointerId);

      const handleMove = (moveEvent: PointerEvent) => {
        applyPreviewLayout({
          left: moveEvent.clientX - offsetX,
          top: moveEvent.clientY - offsetY,
          width: rect.width,
          height: rect.height
        });
      };
      const handleUp = () => {
        previewPanel.classList.remove("is-dragging");
        previewDragHandle.removeEventListener("pointermove", handleMove);
        previewDragHandle.removeEventListener("pointerup", handleUp);
        previewDragHandle.removeEventListener("pointercancel", handleUp);
        savePreviewLayout();
      };

      previewDragHandle.addEventListener("pointermove", handleMove);
      previewDragHandle.addEventListener("pointerup", handleUp);
      previewDragHandle.addEventListener("pointercancel", handleUp);
    });

    previewResizeHandle?.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      const rect = previewPanel.getBoundingClientRect();
      const startX = event.clientX;
      const startY = event.clientY;
      const right = rect.right;
      previewPanel.classList.add("is-resizing");
      previewResizeHandle.setPointerCapture(event.pointerId);

      const handleMove = (moveEvent: PointerEvent) => {
        const width = rect.width + startX - moveEvent.clientX;
        applyPreviewLayout({
          left: right - width,
          top: rect.top,
          width,
          height: rect.height + moveEvent.clientY - startY
        });
      };
      const handleUp = () => {
        previewPanel.classList.remove("is-resizing");
        previewResizeHandle.removeEventListener("pointermove", handleMove);
        previewResizeHandle.removeEventListener("pointerup", handleUp);
        previewResizeHandle.removeEventListener("pointercancel", handleUp);
        savePreviewLayout();
        resizePreviewSoon();
      };

      previewResizeHandle.addEventListener("pointermove", handleMove);
      previewResizeHandle.addEventListener("pointerup", handleUp);
      previewResizeHandle.addEventListener("pointercancel", handleUp);
    });

    window.addEventListener("resize", () => {
      const rect = previewPanel.getBoundingClientRect();
      applyPreviewLayout({ left: rect.left, top: rect.top, width: rect.width, height: rect.height });
      savePreviewLayout();
    });
  };

  const getGuideStateType = (text: string) => {
    if (text.includes("错误")) return "error";
    if (text.includes("更新")) return "done";
    if (text.includes("等待回答") || text.includes("自由提问")) return "active";
    if (text.includes("生成") || text.includes("分析") || text.includes("请求") || text.includes("思考")) return "running";
    return "waiting";
  };

  const setGuideState = (text: string) => {
    const stateType = getGuideStateType(text);
    if (guideState) guideState.textContent = text;
    if (guideStateMirror) guideStateMirror.textContent = text;
    if (guideState) guideState.dataset.state = stateType;
    if (guideStateMirror) guideStateMirror.dataset.state = stateType;
    root.dataset.guideState = text;
    root.dataset.guideStateType = stateType;
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
    requestAnimationFrame(syncGuideChatFrame);
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
    scrollLatestGuideMessageIntoView();
  };

  const resizeGuideInput = () => {
    if (!guideInput) return;
    guideInput.style.height = "auto";
    guideInput.style.height = `${Math.min(guideInput.scrollHeight, 180)}px`;
    syncGuideChatFrame();
  };

  const syncGuideChatFrame = () => {
    if (!guideSurface || !guideForm || guideConversation?.hidden) return;
    const rect = guideSurface.getBoundingClientRect();
    if (!rect.width) return;
    labWorkspace.style.setProperty("--lab-chat-left", `${rect.left}px`);
    labWorkspace.style.setProperty("--lab-chat-fixed-width", `${rect.width}px`);
    guideSurface.style.paddingBottom = `${Math.ceil(guideForm.offsetHeight + 42)}px`;
    guideSurface.style.paddingTop = guideConversation?.hidden ? "" : "0px";
  };

  const syncGuideChatFrameDuringTransition = (duration = 420) => {
    const startedAt = performance.now();
    const tick = (now: number) => {
      syncGuideChatFrame();
      if (now - startedAt < duration) {
        requestAnimationFrame(tick);
      }
    };
    requestAnimationFrame(tick);
  };

  const scrollLatestGuideMessageIntoView = () => {
    const latest = guideLog?.lastElementChild;
    if (!latest || !guideForm) return;

    requestAnimationFrame(() => {
      syncGuideChatFrame();
      const latestRect = latest.getBoundingClientRect();
      const composerTop = guideForm.getBoundingClientRect().top;
      const safeGap = 24;
      if (latestRect.bottom > composerTop - safeGap) {
        window.scrollBy({
          top: latestRect.bottom - composerTop + safeGap,
          behavior: "smooth"
        });
      }
    });
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

  const bindFileTab = (tab: HTMLButtonElement) => {
    tab.addEventListener("click", () => {
      const fileName = tab.dataset.file;
      if (fileName && isKnownFileName(fileNames, fileName)) switchFile(fileName);
    });
  };

  const createFileTab = (fileName: LabFileName) => {
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("role", "tab");
    button.dataset.fileTab = "";
    button.dataset.file = fileName;
    button.setAttribute("aria-selected", "false");

    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.setAttribute("width", "15");
    icon.setAttribute("height", "15");
    icon.setAttribute("viewBox", "0 0 24 24");
    icon.setAttribute("fill", "none");
    icon.setAttribute("stroke", "currentColor");
    icon.setAttribute("stroke-width", "2");
    icon.setAttribute("stroke-linecap", "round");
    icon.setAttribute("stroke-linejoin", "round");
    icon.setAttribute("aria-hidden", "true");
    [["polyline", "16 18 22 12 16 6"], ["polyline", "8 6 2 12 8 18"]].forEach(([tag, points]) => {
      const polyline = document.createElementNS("http://www.w3.org/2000/svg", tag);
      polyline.setAttribute("points", points);
      icon.append(polyline);
    });

    const label = document.createElement("span");
    label.textContent = fileName;
    button.append(icon, label);
    bindFileTab(button);
    return button;
  };

  const syncFileTabs = () => {
    if (!fileTabsContainer) return;
    const existing = new Map(fileTabs.map((tab) => [tab.dataset.file ?? "", tab]));
    fileNames.forEach((fileName) => {
      if (existing.has(fileName)) return;
      const tab = createFileTab(fileName);
      fileTabsContainer.append(tab);
      fileTabs.push(tab);
    });
    fileTabs = fileTabs.filter((tab) => Boolean(tab.isConnected));
  };

  const ensureFile = (fileName: LabFileName, source = "") => {
    if (!files[fileName]) {
      files[fileName] = {
        name: fileName,
        label: fileName,
        source
      };
    }
    if (!fileNames.includes(fileName)) {
      fileNames = sortLessonFileNames(lesson, [...fileNames, fileName]);
      syncFileTabs();
    }
    return files[fileName];
  };

  syncFileTabs();

  const syncTabs = () => {
    fileTabs.forEach((tab) => {
      const isActive = activeWorkspaceTab !== "ai" && activeWorkspaceTab !== "review" && tab.dataset.file === activeFile;
      tab.classList.toggle("is-active", isActive);
      tab.setAttribute("aria-selected", String(isActive));
    });
    guideTab?.classList.toggle("is-active", activeWorkspaceTab === "ai");
    guideTab?.setAttribute("aria-selected", String(activeWorkspaceTab === "ai"));
    changeReviewTab?.classList.toggle("is-active", activeWorkspaceTab === "review");
    changeReviewTab?.setAttribute("aria-selected", String(activeWorkspaceTab === "review"));
    labWorkspace.dataset.workspaceMode =
      activeWorkspaceTab === "ai" ? "guide" : activeWorkspaceTab === "review" ? "review" : "editor";
    labWorkspace.classList.toggle("is-guide-mode", activeWorkspaceTab === "ai");
    labWorkspace.classList.toggle("is-review-mode", activeWorkspaceTab === "review");
    labWorkspace.classList.toggle("is-code-mode", activeWorkspaceTab !== "ai" && activeWorkspaceTab !== "review");
    if (workspaceLabel) {
      workspaceLabel.textContent =
        activeWorkspaceTab === "ai" ? "AI Guide" : activeWorkspaceTab === "review" ? "Review" : "Editor";
    }
    if (workspaceTitle) {
      workspaceTitle.textContent =
        activeWorkspaceTab === "ai" ? lesson.title : activeWorkspaceTab === "review" ? "最近修改" : activeFile;
    }
    requestAnimationFrame(syncGuideChatFrame);
  };

  const resizePreviewSoon = () => {
    window.setTimeout(() => {
      void runProgram();
      editor.requestMeasure();
    }, 260);
  };

  const switchFile = (fileName: LabFileName) => {
    ensureFile(fileName);
    activeWorkspaceTab = fileName;
    activeFile = fileName;
    editorHost.hidden = false;
    if (guideWorkspace) guideWorkspace.hidden = true;
    if (changeReview) changeReview.hidden = true;
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
    entryFileName = getEntryFileName(lesson);
    workspaceFileNames = getLessonFileNames(lesson);
    fileNames = getVisibleLessonFileNames(lesson);
    files = cloneStarterFiles(lesson, workspaceFileNames);
    activeFile = files[activeFile] ? activeFile : files[entryFileName] ? entryFileName : fileNames[0];
    syncFileTabs();
    completedPatches.clear();
    currentCheckpointIndex = 0;
    lessonFreeMode = false;
    latestChangeReview = [];
    selectedChangeReviewIndex = 0;
    changeReviewUnread = false;
    renderChangeReview();
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
    if (changeReview) changeReview.hidden = true;
    if (labHints) labHints.hidden = true;
    setGuidePhase(guideConversationStarted ? "conversation" : "setup");
    syncTabs();
  };

  const switchChangeReview = () => {
    activeWorkspaceTab = "review";
    changeReviewUnread = false;
    editorHost.hidden = true;
    if (guideWorkspace) guideWorkspace.hidden = true;
    if (changeReview) changeReview.hidden = false;
    if (labHints) labHints.hidden = true;
    renderChangeReview();
    syncTabs();
  };

  const getFilesSnapshot = () =>
    fileNames.map((name) => `--- ${name} ---\n${files[name]?.source ?? ""}`).join("\n\n");

  const advanceCheckpoint = (patchId?: string, nextCheckpointId?: string): CheckpointAdvanceResult => {
    const previousId = currentCheckpoint()?.id ?? "";
    const patchCheckpointIndex = patchId
      ? lesson.checkpoints.findIndex((checkpoint) => checkpoint.patchId === patchId)
      : -1;
    const patchIndex = patchCheckpointIndex >= 0 ? patchCheckpointIndex : currentCheckpointIndex;
    const isLastStep = patchIndex === lesson.checkpoints.length - 1;

    if (nextCheckpointId) {
      const found = lesson.checkpoints.findIndex((checkpoint) => checkpoint.id === nextCheckpointId);
      if (found >= 0) currentCheckpointIndex = found;
    } else if (patchCheckpointIndex >= 0 && !isLastStep) {
      currentCheckpointIndex = patchCheckpointIndex + 1;
    } else if (patchId && currentCheckpoint()?.patchId === patchId) {
      currentCheckpointIndex = Math.min(currentCheckpointIndex + 1, lesson.checkpoints.length - 1);
    } else if (!patchId && currentCheckpointIndex < lesson.checkpoints.length - 1) {
      currentCheckpointIndex += 1;
    }

    const currentId = currentCheckpoint()?.id ?? "";
    root.dataset.checkpointId = currentId;
    return {
      previousId,
      currentId,
      moved: Boolean(currentId && currentId !== previousId),
      completed: Boolean((patchId || !nextCheckpointId) && isLastStep)
    };
  };

  const applyGuidePatches = (patches: GuidePatch[]) => {
    const changedFiles = new Set<LabFileName>();
    const nextFiles = Object.fromEntries(Object.values(files).map((file) => [file.name, file.source])) as Record<LabFileName, string>;
    const changeReviewBatch: ChangeReviewEntry[] = [];

    patches.forEach((patch) => {
      ensureFile(patch.file);
      if (!(patch.file in nextFiles)) nextFiles[patch.file] = files[patch.file].source;
      const source = nextFiles[patch.file] ?? "";
      if (patch.operation === "replace_all") {
        if (source === patch.content) return;
        const preview = compactCodePreview(source, patch.content, 1, 3, 34);
        changeReviewBatch.push({
          file: patch.file,
          operation: patch.operation,
          startLine: preview.startLine,
          endLine: preview.endLine,
          before: preview.before,
          after: preview.after,
          compacted: preview.compacted
        });
        nextFiles[patch.file] = patch.content;
        changedFiles.add(patch.file);
        return;
      }
      if (patch.operation === "replace") {
        if (!patch.target) throw new Error("replace patch 缺少 target。");
        const targetRange = findPatchTargetRange(source, patch.target);
        if (!targetRange) {
          throw new Error(`无法在 ${patch.file} 中找到 patch 指定片段。`);
        }
        const before = source.slice(targetRange.start, targetRange.end);
        if (before === patch.content) return;
        const startLine = lineNumberAt(source, targetRange.start);
        const preview = compactCodePreview(before, patch.content, startLine, 3, 34);
        changeReviewBatch.push({
          file: patch.file,
          operation: patch.operation,
          startLine: preview.startLine,
          endLine: preview.endLine,
          before: preview.before,
          after: preview.after,
          compacted: preview.compacted
        });
        nextFiles[patch.file] = `${source.slice(0, targetRange.start)}${patch.content}${source.slice(targetRange.end)}`;
        changedFiles.add(patch.file);
        return;
      }
      throw new Error(`不支持的 patch 操作：${patch.operation}`);
    });

    changedFiles.forEach((fileName) => {
      ensureFile(fileName);
      files[fileName].source = nextFiles[fileName];
    });

    latestChangeReview = changeReviewBatch;
    selectedChangeReviewIndex = 0;
    changeReviewUnread = latestChangeReview.length > 0 && activeWorkspaceTab !== "review";
    renderChangeReview();
    if (latestChangeReview.length) {
      flashChangeReview();
    }

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
    if (completedPatches.has(patchId)) {
      return { patch, changedFiles: [] as LabFileName[] };
    }
    const changedFiles = applyGuidePatches(patch.changes);
    completedPatches.add(patchId);
    return { patch, changedFiles };
  };

  const prepareObservationCheckpoint = async (checkpoint: LessonCheckpoint) => {
    if (!checkpoint.patchId || isPatchAlreadyApplied(checkpoint.patchId)) return [] as LabFileName[];
    const result = applyLessonPatch(checkpoint.patchId);
    if (result.changedFiles.length) {
      await runProgram();
    }
    return result.changedFiles;
  };

  const buildGuideMessages = (mode: "start" | "answer", userText = "") => {
    const checkpoint = currentCheckpoint();
    const errorText = errorBox.textContent || "";
    const freeModeRequest = lessonFreeMode && mode === "answer";
    const systemPrompt = `你是图形学实验教练。课程内容、checkpoint 和本地 patch 已经由静态课程包提供。
必须遵守：
1. 每轮最多提出一个问题。
2. 预设课程推进模式下，用户主要回答概念；代码变更优先通过本地 patchId 完成。
3. checkpoint.flow 为 observe_then_question 时，页面会在提问前自动应用该 checkpoint 的 patchId。你应先用 message 简短说明 expectedObservation，再在 question 中提问；用户回答正确或基本正确时只返回 nextCheckpointId，不要重复返回当前 patchId。
4. checkpoint.flow 为 answer_then_patch 时，如果用户回答正确或基本正确，只返回当前 patchId，让页面在回答后应用代码。
5. checkpoint.flow 为 question_only 或没有 patchId 时，如果用户回答正确或基本正确，只返回 nextCheckpointId。
6. 如果用户回答错误、不完整或说不知道，给一个紧密相关的提示，并重复当前 checkpoint.question；不要推进 checkpoint。
7. 如果用户明确说某个概念不懂，只解释这个概念与当前 checkpoint 的直接关系，最多 120 字，然后重复当前问题。
8. 自由实验模式下，不要再回到 checkpoint 提问；用户问概念就直接解释，用户要求修改效果就返回最小 patches。需要立即展示效果时可设置 runAfterApply=true；若用户开启 Auto，页面会在代码变更后自动运行。
9. 只能修改课程工作区文件列表中的文件；确需新增辅助文件时，可以在 patches 中给出新文件名。
10. 当前运行入口文件是 ${entryFileName}；运行环境注入 THREE、OrbitControls、canvas、files、getFile、report。多文件课程必须通过 getFile("file-name") 读取 shader、json 或 helper，不要依赖固定文件名。
11. message 字段不要包含问题；需要提问只能写在 question 字段。
12. start 模式必须优先使用当前 checkpoint.question 作为唯一问题。
13. 用户回答正确或基本正确时设置 answerCorrect=true；回答错误、不完整或说不知道时设置 answerCorrect=false。
14. 如果当前 checkpoint 是最后一个，且用户回答正确或基本正确，返回 type="summary"、answerCorrect=true、message 为结束反馈，不要返回 question、patchId 或 nextCheckpointId。
15. 只返回 JSON，不返回 Markdown。
JSON schema:
{
  "type": "question | feedback | code_patch | summary",
  "message": "给用户看的简短反馈或过渡说明，最多 80 字，不包含问题",
  "question": "唯一的下一步问题，没有则为空字符串",
  "patchId": "要应用的本地预设 patch id，没有则为空字符串",
  "patches": [{"file": "课程文件名或新文件名", "operation": "replace | replace_all", "target": "replace 时必填", "content": "替换内容"}],
  "runAfterApply": true,
  "expectedObservation": "应用 patch 后应观察到的现象",
  "nextCheckpointId": "可选，进入的 checkpoint id",
  "answerCorrect": true
}`;

    const checkpointPrompt = freeModeRequest
      ? `当前阶段：自由实验模式。课程预设提问已经结束。不要使用 checkpoint 序列继续追问用户，不要返回 patchId 或 nextCheckpointId。结合当前代码和课程资料直接回答或返回 patches。`
      : `教学规则：
${lesson.teachingRules.map((item) => `- ${item}`).join("\n")}
checkpoint 序列：
${lesson.checkpoints
  .map((item, index) => `${index + 1}. ${item.id} | ${item.title} | ${item.patchId ? `patchId=${item.patchId}` : "concept-only"}`)
  .join("\n")}
当前 checkpoint：
${checkpoint ? JSON.stringify(checkpoint, null, 2) : "(无 checkpoint)"}
当前 checkpoint 的代码是否已应用：
${isPatchAlreadyApplied(checkpoint?.patchId) ? "已应用；如果 flow 是 observe_then_question，应围绕现象提问，不要再次返回 patchId。" : "未应用；如果 flow 是 answer_then_patch，回答正确后再返回 patchId。"}
当前 checkpoint 关联文件：
${describeCheckpointFiles(checkpoint)}
已完成 patchId：
${[...completedPatches].join(", ") || "(无)"}
当前阶段：预设课程推进模式。概念 checkpoint 用 nextCheckpointId 推进；代码 checkpoint 用本地 patchId 推进。`;

    const lessonPrompt = `课程：${lesson.title}
类别：${lesson.category}
用户可见描述：${lesson.description}
创建时间：${lesson.createdAt}
内部参考来源：${lesson.source}
内部运行环境：${lesson.runtime}
AI 教学摘要：${lesson.aiBrief}
课程入口文件：${entryFileName}
实验工作区文件：
${describeWorkspaceFiles(lesson)}
可修改课程文件列表：
${describePatchableFiles(lesson, fileNames)}
源课程 shader 关系：
${describeShaderSets(lesson)}
参考要点：
${lesson.referenceBrief.map((item) => `- ${item}`).join("\n")}
参考源码摘录：
${compactReferenceCode(lesson.referenceCode)}
${checkpointPrompt}`;

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

    if (!lessonFreeMode) {
      const checkpoint = currentCheckpoint();
      if (isObservationCheckpoint(checkpoint) && !isPatchAlreadyApplied(checkpoint.patchId)) {
        await prepareObservationCheckpoint(checkpoint);
      }
    }

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
    const allowCourseAdvance = !lessonFreeMode;
    const checkpointIndexBeforeResponse = currentCheckpointIndex;
    const isLastCheckpointBeforeResponse = checkpointIndexBeforeResponse === lesson.checkpoints.length - 1;
    const terminalAnswerCorrect =
      mode === "answer" &&
      isLastCheckpointBeforeResponse &&
      (parsed.answerCorrect || parsed.type === "summary");

    if (mode === "start") {
      if (guideLog) guideLog.innerHTML = "";
      setGuidePhase("conversation");
    }

    let changedFiles: LabFileName[] = [];
    let checkpointMoved = false;
    let lessonCompleted = false;
    if (allowCourseAdvance && parsed.patchId) {
      const result = applyLessonPatch(parsed.patchId);
      changedFiles = result.changedFiles;
      const advanceResult = advanceCheckpoint(parsed.patchId, parsed.nextCheckpointId);
      checkpointMoved = advanceResult.moved;
      lessonCompleted = advanceResult.completed;
      if (lessonCompleted) lessonFreeMode = true;
    } else if (directPatches.length) {
      let fallbackPatchId = "";
      try {
        changedFiles = applyGuidePatches(directPatches);
      } catch (error) {
        fallbackPatchId = allowCourseAdvance ? currentCheckpoint()?.patchId ?? "" : "";
        if (!fallbackPatchId) throw error;
        const result = applyLessonPatch(fallbackPatchId);
        changedFiles = result.changedFiles;
      }
      if (allowCourseAdvance) {
        const advanceResult = advanceCheckpoint(fallbackPatchId || undefined, parsed.nextCheckpointId);
        checkpointMoved = advanceResult.moved;
        lessonCompleted = advanceResult.completed;
        if (lessonCompleted) lessonFreeMode = true;
      }
    } else if (allowCourseAdvance && parsed.nextCheckpointId && !terminalAnswerCorrect) {
      const advanceResult = advanceCheckpoint(undefined, parsed.nextCheckpointId);
      checkpointMoved = advanceResult.moved;
      lessonCompleted = advanceResult.completed;
      if (lessonCompleted) lessonFreeMode = true;
    }

    if (
      allowCourseAdvance &&
      terminalAnswerCorrect &&
      !lessonCompleted &&
      !parsed.patchId &&
      !directPatches.length
    ) {
      lessonCompleted = true;
      lessonFreeMode = true;
    }

    let preparedObservationFiles: LabFileName[] = [];
    if (!lessonCompleted && allowCourseAdvance && checkpointMoved) {
      const nextCheckpoint = currentCheckpoint();
      if (isObservationCheckpoint(nextCheckpoint) && !isPatchAlreadyApplied(nextCheckpoint.patchId)) {
        preparedObservationFiles = await prepareObservationCheckpoint(nextCheckpoint);
      }
    }

    const shouldAskNextQuestion =
      (Boolean(changedFiles.length) || Boolean(parsed.nextCheckpointId) || Boolean(preparedObservationFiles.length)) &&
      checkpointMoved &&
      Boolean(currentCheckpoint()) &&
      !parsed.question;
    const shouldRepeatCurrentQuestion =
      mode === "answer" &&
      !lessonCompleted &&
      !checkpointMoved &&
      !changedFiles.length &&
      !directPatches.length &&
      Boolean(currentCheckpoint());
    const parsedQuestion =
      lessonCompleted || (terminalAnswerCorrect && isLastCheckpointBeforeResponse) || (shouldRepeatCurrentQuestion && !lessonFreeMode)
        ? ""
        : lessonFreeMode
          ? ""
          : parsed.question
            ? currentCheckpoint()?.question
            : "";
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
    const observationMessage =
      preparedObservationFiles.length && currentCheckpoint()?.expectedObservation
        ? `预览已更新：${currentCheckpoint()?.expectedObservation}`
        : "";
    const aiText = [displayedMessage, observationMessage, retryMessage, displayedQuestion ?? "", completionMessage]
      .filter(Boolean)
      .join("\n\n");
    if (aiText) appendGuideEntry("assistant", "AI Guide", aiText);

    if (changedFiles.length && (parsed.runAfterApply || Boolean(autoRunToggle?.checked))) {
      await runProgram();
    }

    setGuideState(displayedQuestion ? "等待回答" : lessonCompleted || lessonFreeMode ? "可自由提问" : "已更新");
  };

  const stopRuntime = () => {
    disposeOrbitControls();
    defaultCameraSnapshot = undefined;
    if (cleanup) {
      cleanup();
      cleanup = undefined;
    }
    runtimeResult = undefined;
  };

  const runProgram = async () => {
    const currentRun = ++runId;
    const capturedErrors: string[] = [];
    const originalError = console.error;

    stopRuntime();
    setError();
    setStatus("running", "正在运行当前代码...");

    console.error = (...args: unknown[]) => {
      const message = args.map(String).join(" ");
      if (!isDevServerNoise(message)) {
        capturedErrors.push(message);
      }
      originalError.apply(console, args);
    };

    try {
      const tracked = createTrackedThree();
      const fileSources = Object.fromEntries(Object.values(files).map((file) => [file.name, file.source])) as Record<string, string>;
      const getFile = (fileName: string) => fileSources[fileName] ?? "";
      const factory = new Function(
        "THREE",
        "OrbitControls",
        "canvas",
        "files",
        "getFile",
        "report",
        `"use strict";\n${files[entryFileName]?.source ?? ""}`
      );
      const result = factory(
        tracked.THREE,
        OrbitControls,
        canvas,
        Object.freeze({ ...fileSources }),
        getFile,
        () => undefined
      );

      normalizeRuntimeResult(result, tracked.captured);
      applyOrbitControls();

      await new Promise((resolve) => window.setTimeout(resolve, 120));

      if (currentRun !== runId) return;

      if (capturedErrors.length) {
        setStatus("error", "运行完成，但发现控制台错误");
        setError(capturedErrors.slice(0, 3).join("\n\n"));
        return;
      }

      setStatus("ok", "运行成功，预览已更新");
      window.setTimeout(() => {
        if (runButton.dataset.runState === "ok") {
          setRunFeedback("idle", "");
        }
      }, 1200);
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
    const shouldReturnToReview = activeWorkspaceTab === "review";
    resetLessonCode();
    resetGuideSession();
    if (shouldReturnToGuide) {
      switchGuide();
    } else if (shouldReturnToReview) {
      switchChangeReview();
    } else {
      switchFile(activeFile);
    }
    void runProgram();
  };

  fileTabs.forEach(bindFileTab);

  guideTab?.addEventListener("click", switchGuide);
  changeReviewTab?.addEventListener("click", switchChangeReview);

  runButton.addEventListener("click", () => {
    persistFiles(lesson, files);
    void runProgram();
  });

  resetButton.addEventListener("click", resetLab);

  previewHideButton?.addEventListener("click", () => {
    labWorkspace.classList.add("is-preview-hidden");
    if (previewShowButton) previewShowButton.hidden = false;
    resizePreviewSoon();
  });

  previewShowButton?.addEventListener("click", () => {
    labWorkspace.classList.remove("is-preview-hidden");
    previewShowButton.hidden = true;
    resizePreviewSoon();
  });

  orbitToggleButton?.addEventListener("click", () => {
    orbitEnabled = !orbitEnabled;
    applyOrbitControls();
  });

  sidebarToggleButton?.addEventListener("click", () => {
    const isCollapsed = labWorkspace.classList.toggle("is-sidebar-collapsed");
    sidebarToggleButton.setAttribute("aria-label", isCollapsed ? "展开边栏" : "收起边栏");
    sidebarToggleButton.setAttribute("title", isCollapsed ? "展开边栏" : "收起边栏");
    sidebarToggleButton.setAttribute("aria-pressed", String(isCollapsed));
    syncGuideChatFrameDuringTransition(520);
    window.setTimeout(() => {
      editor.requestMeasure();
    }, 260);
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
    if (guideInput) {
      guideInput.value = "";
      resizeGuideInput();
    }
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

  guideInput?.addEventListener("input", resizeGuideInput);
  window.addEventListener("resize", syncGuideChatFrame);
  initPreviewWindowControls();

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
    const checkpoint = lesson.checkpoints.find((item) => item.patchId);
    if (!checkpoint?.patchId) throw new Error("课程没有可应用 patch 的 checkpoint。");
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

