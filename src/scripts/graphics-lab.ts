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

declare global {
  interface Window {
    __graphicsLabSmokeTest?: () => Promise<{
      ok: boolean;
      activeFile: LabFileName;
      canvas: { width: number; height: number };
      status: string;
      error: string;
    }>;
  }
}

const STORAGE_KEY = "daydreamerh.graphics-lab.v1";

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

  if (!canvas || !editorHost || !runButton || !resetButton || !expandButton || !statusLabel || !statusDot || !errorBox) {
    return;
  }

  let files = loadFiles();
  let activeFile: LabFileName = "main.js";
  let cleanup: RuntimeCleanup | undefined;
  let runTimer = 0;
  let saveTimer = 0;
  let runId = 0;

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
    const isExpanded = root.classList.toggle("is-editor-expanded");
    expandButton.textContent = isExpanded ? "回到预览" : "展开编辑器";
    expandButton.setAttribute("aria-pressed", String(isExpanded));
    editor.requestMeasure();
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

  window.__graphicsLabSmokeTest = smokeTest;
  root.dataset.labReady = "true";

  syncTabs();
  void runProgram();
}

document.querySelectorAll<HTMLElement>("[data-graphics-lab]").forEach(initGraphicsLab);
