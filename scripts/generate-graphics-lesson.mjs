import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const workspace = join(scriptDir, "..");
const args = process.argv.slice(2);

const defaultEntryFileName = "main.js";
const defaultTeachingRules = [
  "每轮只提出一个问题。",
  "先判断用户回答，再决定是否应用 patch。",
  "checkpoint 有 patchId 且回答正确或基本正确时，返回当前 checkpoint 的 patchId。",
  "checkpoint 没有 patchId 且回答正确或基本正确时，返回下一个 checkpoint 的 nextCheckpointId，不要应用 patch。",
  "回答不完整或错误时给一个提示，并重复当前 checkpoint 问题，不要应用 patch，也不要推进 checkpoint。",
  "不要输出大段 OpenGL 或 WebGL 代码，代码变更由本地 patch 完成。"
];

function readOption(name, fallback = "") {
  const index = args.findIndex((arg) => arg === `--${name}`);
  if (index === -1) return fallback;
  const value = args[index + 1];
  return value && !value.startsWith("--") ? value : fallback;
}

function hasFlag(name) {
  return args.includes(`--${name}`);
}

function toPosixPath(path) {
  return path.replace(/\\/g, "/");
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeFile(root, relativePath, content) {
  const target = join(root, relativePath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${String(content).trim()}\n`, "utf8");
}

function stableJson(value) {
  return JSON.stringify(value, null, 2);
}

function getLocalDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function listRecipeFiles(recipeRoot) {
  if (!existsSync(recipeRoot)) return [];
  return readdirSync(recipeRoot)
    .map((entry) => join(recipeRoot, entry, "recipe.json"))
    .filter((path) => existsSync(path));
}

function copyReferenceFiles(sourceDir, outDir) {
  const referenceDir = join(outDir, "reference");
  mkdirSync(referenceDir, { recursive: true });
  const copied = [];
  const allowed = new Set([".cpp", ".h", ".hpp", ".vs", ".fs", ".glsl", ".txt", ".md", ".cmake"]);
  const ignoredDirectories = new Set([".git", ".vs", ".vscode", "build", "out", "dist", "node_modules"]);

  const visit = (dir, relativeDir = "") => {
    for (const entry of readdirSync(dir)) {
      const source = join(dir, entry);
      const stats = statSync(source);
      if (stats.isDirectory()) {
        if (!ignoredDirectories.has(entry)) visit(source, join(relativeDir, entry));
        continue;
      }
      if (!stats.isFile()) continue;

      const extension = extname(entry).toLowerCase();
      const relativeFile = join(relativeDir, entry);
      if (entry === "CMakeLists.txt" || allowed.has(extension)) {
        const target = join(referenceDir, relativeFile);
        mkdirSync(dirname(target), { recursive: true });
        copyFileSync(source, target);
        copied.push(toPosixPath(relativeFile));
      }
    }
  };

  visit(sourceDir);

  return copied;
}

function shaderSetsFromSource(sourceDir) {
  const shaderEntries = readdirSync(sourceDir)
    .filter((entry) => statSync(join(sourceDir, entry)).isFile())
    .filter((entry) => [".vs", ".fs", ".glsl"].includes(extname(entry).toLowerCase()))
    .sort((a, b) => a.localeCompare(b));

  const sourceFiles = {};
  for (const entry of shaderEntries) {
    const extension = extname(entry).toLowerCase();
    const shaderName = entry.replace(/\.(vs|fs|glsl)$/i, "");
    const outputName =
      extension === ".vs"
        ? `${shaderName}.vertex.glsl`
        : extension === ".fs"
          ? `${shaderName}.fragment.glsl`
          : entry;
    sourceFiles[outputName] = `reference/${entry}`;
  }

  const groups = new Map();
  for (const file of Object.keys(sourceFiles)) {
    const match = file.match(/^(.*)\.(vertex|fragment)\.glsl$/);
    if (!match) continue;
    const [, name, stage] = match;
    const group = groups.get(name) ?? {
      name,
      role: name === "light" ? "light marker shader program" : "object/material shader program"
    };
    group[stage] = sourceFiles[file];
    groups.set(name, group);
  }

  return [...groups.values()];
}

function entryFileNameFromRecipe(recipe) {
  return recipe.entryFile || recipe.starterState?.entryFile || defaultEntryFileName;
}

function starterFilesFromRecipe(recipe) {
  return {
    ...(recipe.starterState ? filesFromState(recipe.starterState, entryFileNameFromRecipe(recipe)) : {}),
    ...(recipe.starterFiles ?? {})
  };
}

function inferWorkspaceFileRole(fileName, entryFileName) {
  if (fileName === entryFileName) return "entry";
  if (fileName.endsWith(".glsl")) return "shader";
  if (fileName.endsWith(".json")) return "metadata";
  return "helper";
}

function inferWorkspaceFileConcept(fileName, entryFileName) {
  if (fileName === entryFileName) return "browser runtime entry and scene orchestration";
  if (fileName === "scene.json") return "camera, uniforms, material shader routing, and animation settings";
  if (fileName === "geometry.json") return "geometry attributes, indices, and primitive data";
  if (fileName === "vertex.glsl") return "default vertex transform shader";
  if (fileName === "fragment.glsl") return "default fragment color shader";
  if (fileName.endsWith(".vertex.glsl")) return `${fileName.replace(".vertex.glsl", "")} vertex stage`;
  if (fileName.endsWith(".fragment.glsl")) return `${fileName.replace(".fragment.glsl", "")} fragment stage`;
  if (fileName.endsWith(".json")) return "lesson metadata consumed by runtime or AI";
  return "lesson helper file";
}

function collectLessonFileNames(recipe, starterFiles) {
  const names = new Set(Object.keys(starterFiles));
  const entryFileName = entryFileNameFromRecipe(recipe);
  for (const checkpoint of recipe.checkpoints ?? []) {
    if (checkpoint.state) {
      Object.keys(filesFromState(checkpoint.state, entryFileName)).forEach((file) => names.add(file));
    }
    if (Array.isArray(checkpoint.changes)) {
      checkpoint.changes.forEach((change) => names.add(change.file));
    }
  }
  return [...names];
}

function buildWorkspaceFiles(recipe, starterFiles) {
  const entryFileName = entryFileNameFromRecipe(recipe);
  const explicitFiles = new Map((recipe.workspaceFiles ?? []).map((file) => [file.path, file]));
  const hasProgramShader = collectLessonFileNames(recipe, starterFiles).some((path) => path.endsWith(".vertex.glsl") || path.endsWith(".fragment.glsl"));
  return collectLessonFileNames(recipe, starterFiles)
    .sort((a, b) => a.localeCompare(b))
    .map((path) => ({
      path,
      role: inferWorkspaceFileRole(path, entryFileName),
      concept: inferWorkspaceFileConcept(path, entryFileName),
      visible: path.endsWith(".json") || (hasProgramShader && ["vertex.glsl", "fragment.glsl"].includes(path)) ? false : true,
      ...(explicitFiles.get(path) ?? {})
    }));
}

function colorLiteral(value, fallback) {
  const items = Array.isArray(value) ? value : fallback;
  return `new THREE.Color(${items.map((item) => Number(item).toFixed(3)).join(", ")})`;
}

function vectorLiteral(value, fallback) {
  const items = Array.isArray(value) ? value : fallback;
  return `new THREE.Vector3(${items.map((item) => Number(item).toFixed(3)).join(", ")})`;
}

function buildGeometry(state) {
  if (state.shape === "quad") {
    return `const geometry = new THREE.BufferGeometry();
geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array([
  -0.7,  0.7, 0.0,
   0.7,  0.7, 0.0,
  -0.7, -0.7, 0.0,
   0.7, -0.7, 0.0
]), 3));
geometry.setAttribute("uv", new THREE.BufferAttribute(new Float32Array([
  0.0, 1.0,
  1.0, 1.0,
  0.0, 0.0,
  1.0, 0.0
]), 2));
geometry.setIndex([0, 2, 1, 1, 2, 3]);`;
  }

  if (state.shape === "cube") {
    return "const geometry = new THREE.BoxGeometry(1, 1, 1);";
  }

  const colorAttribute =
    state.mode === "vertex-color"
      ? `
geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array([
  1.0, 0.2, 0.1,
  0.0, 0.68, 0.71,
  0.13, 0.16, 0.19
]), 3));`
      : "";

  return `const geometry = new THREE.BufferGeometry();
geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array([
   0.0,  0.6, 0.0,
  -0.6, -0.5, 0.0,
   0.6, -0.5, 0.0
]), 3));${colorAttribute}`;
}

function buildUniforms(state) {
  return `const uniforms = {
  uColor: { value: ${colorLiteral(state.color, [0.13, 0.16, 0.19])} },
  uAccentColor: { value: ${colorLiteral(state.accentColor, [0.42, 0.48, 0.52])} },
  uObjectColor: { value: ${colorLiteral(state.objectColor, [0.95, 0.48, 0.2])} },
  uLightColor: { value: ${colorLiteral(state.lightColor, [1, 1, 1])} },
  uLightPos: { value: ${vectorLiteral(state.lightPos, [1.5, 1.8, 2.2])} },
  uViewPos: { value: camera.position },
  uMixAmount: { value: ${Number(state.mixAmount ?? 0.35).toFixed(2)} },
  uAmbientStrength: { value: ${Number(state.ambientStrength ?? 0.18).toFixed(2)} },
  uSpecularStrength: { value: ${Number(state.specularStrength ?? 0.45).toFixed(2)} },
  uShininess: { value: ${Number(state.shininess ?? 32).toFixed(1)} }
};`;
}

function buildUniformConfig(state) {
  return {
    uColor: Array.isArray(state.color) ? state.color : [0.13, 0.16, 0.19],
    uAccentColor: Array.isArray(state.accentColor) ? state.accentColor : [0.42, 0.48, 0.52],
    uObjectColor: Array.isArray(state.objectColor) ? state.objectColor : [0.95, 0.48, 0.2],
    uLightColor: Array.isArray(state.lightColor) ? state.lightColor : [1, 1, 1],
    uLightPos: Array.isArray(state.lightPos) ? state.lightPos : [1.5, 1.8, 2.2],
    uMixAmount: Number(state.mixAmount ?? 0.35),
    uAmbientStrength: Number(state.ambientStrength ?? 0.18),
    uSpecularStrength: Number(state.specularStrength ?? 0.45),
    uShininess: Number(state.shininess ?? 32)
  };
}

function objectShaderProgramName(state = {}) {
  return typeof state.shaderProgram === "string" && state.shaderProgram ? state.shaderProgram : "";
}

function objectVertexShaderFile(state = {}) {
  const program = objectShaderProgramName(state);
  return state.vertexShaderFile ?? (program ? `${program}.vertex.glsl` : "vertex.glsl");
}

function objectFragmentShaderFile(state = {}) {
  const program = objectShaderProgramName(state);
  return state.fragmentShaderFile ?? (program ? `${program}.fragment.glsl` : "fragment.glsl");
}

function lightShaderProgramName(state = {}) {
  return typeof state.lightProgram === "string" && state.lightProgram ? state.lightProgram : "light";
}

function lightVertexShaderFile(state = {}) {
  return `${lightShaderProgramName(state)}.vertex.glsl`;
}

function lightFragmentShaderFile(state = {}) {
  return `${lightShaderProgramName(state)}.fragment.glsl`;
}

function buildGeometrySpec(state = {}) {
  if (state.shape === "quad") {
    return {
      type: "buffer",
      attributes: {
        position: {
          itemSize: 3,
          values: [
            -0.7, 0.7, 0,
            0.7, 0.7, 0,
            -0.7, -0.7, 0,
            0.7, -0.7, 0
          ]
        },
        uv: {
          itemSize: 2,
          values: [
            0, 1,
            1, 1,
            0, 0,
            1, 0
          ]
        }
      },
      index: [0, 2, 1, 1, 2, 3]
    };
  }

  if (state.shape === "cube") {
    return {
      type: "box",
      size: [1, 1, 1]
    };
  }

  const attributes = {
    position: {
      itemSize: 3,
      values: [
        0, 0.6, 0,
        -0.6, -0.5, 0,
        0.6, -0.5, 0
      ]
    }
  };
  if (state.mode === "vertex-color") {
    attributes.color = {
      itemSize: 3,
      values: [
        1, 0.2, 0.1,
        0.1, 0.7, 0.35,
        0.1, 0.38, 1
      ]
    };
  }
  return {
    type: "buffer",
    attributes
  };
}

function buildSceneConfig(state = {}) {
  const shape = state.shape ?? "triangle";
  const cameraType = state.camera ?? (shape === "cube" ? "perspective" : "orthographic");
  const cameraPosition = state.cameraPosition ?? (cameraType === "perspective" ? [2.4, 1.8, 4.2] : [0, 0, 3]);
  const rotation = state.rotation ?? (shape === "cube" ? [0.35, 0.55, 0] : [0, 0, 0]);
  return {
    shape,
    mode: state.mode ?? "solid",
    camera: {
      type: cameraType,
      fov: Number(state.fov ?? 45),
      position: cameraPosition,
      lookAt: state.lookAt ?? [0, 0, 0]
    },
    material: {
      vertexShader: objectVertexShaderFile(state),
      fragmentShader: objectFragmentShaderFile(state)
    },
    lightMarker: {
      enabled: Boolean(state.showLight),
      vertexShader: lightVertexShaderFile(state),
      fragmentShader: lightFragmentShaderFile(state),
      radius: Number(state.lightMarkerRadius ?? 0.08)
    },
    uniforms: buildUniformConfig(state),
    mesh: {
      count: Math.max(1, Number(state.objectCount ?? 1)),
      rotation,
      scale: Number(state.scale ?? 1)
    },
    animated: Boolean(state.animated)
  };
}

function buildMain(state = {}) {
  return `// Generated CG experiment runtime
// Available objects: THREE, OrbitControls, canvas, files, getFile, report

const sceneConfig = JSON.parse(getFile("scene.json") || "{}");
const geometryConfig = JSON.parse(getFile("geometry.json") || "{}");

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0xf8f8f8, 1);

const scene = new THREE.Scene();

const cameraConfig = sceneConfig.camera || {};
const camera = cameraConfig.type === "perspective"
  ? new THREE.PerspectiveCamera(cameraConfig.fov || 45, 1, 0.1, 100)
  : new THREE.OrthographicCamera(-1.4, 1.4, 1.1, -1.1, 0.1, 20);
camera.position.fromArray(cameraConfig.position || [0, 0, 3]);
camera.lookAt(...(cameraConfig.lookAt || [0, 0, 0]));

function makeColor(value, fallback) {
  const items = Array.isArray(value) ? value : fallback;
  return new THREE.Color(items[0], items[1], items[2]);
}

function makeVector(value, fallback) {
  const items = Array.isArray(value) ? value : fallback;
  return new THREE.Vector3(items[0], items[1], items[2]);
}

function buildGeometry(config) {
  if (config.type === "box") {
    const size = Array.isArray(config.size) ? config.size : [1, 1, 1];
    return new THREE.BoxGeometry(size[0], size[1], size[2]);
  }
  const geometry = new THREE.BufferGeometry();
  const attributes = config.attributes || {};
  Object.entries(attributes).forEach(([name, attribute]) => {
    geometry.setAttribute(name, new THREE.BufferAttribute(new Float32Array(attribute.values || []), attribute.itemSize || 3));
  });
  if (Array.isArray(config.index)) geometry.setIndex(config.index);
  return geometry;
}

const geometry = buildGeometry(geometryConfig);

const uniformConfig = sceneConfig.uniforms || {};
const uniforms = {
  uColor: { value: makeColor(uniformConfig.uColor, [0.13, 0.16, 0.19]) },
  uAccentColor: { value: makeColor(uniformConfig.uAccentColor, [0.42, 0.48, 0.52]) },
  uObjectColor: { value: makeColor(uniformConfig.uObjectColor, [0.95, 0.48, 0.2]) },
  uLightColor: { value: makeColor(uniformConfig.uLightColor, [1, 1, 1]) },
  uLightPos: { value: makeVector(uniformConfig.uLightPos, [1.5, 1.8, 2.2]) },
  uViewPos: { value: camera.position },
  uMixAmount: { value: Number(uniformConfig.uMixAmount ?? 0.35) },
  uAmbientStrength: { value: Number(uniformConfig.uAmbientStrength ?? 0.18) },
  uSpecularStrength: { value: Number(uniformConfig.uSpecularStrength ?? 0.45) },
  uShininess: { value: Number(uniformConfig.uShininess ?? 32) }
};

const materialConfig = sceneConfig.material || {};
const activeVertexShader = getFile(materialConfig.vertexShader || "");
const activeFragmentShader = getFile(materialConfig.fragmentShader || "");
if (!activeVertexShader || !activeFragmentShader) {
  throw new Error("scene.json must provide material.vertexShader and material.fragmentShader that map to starter files.");
}

const material = new THREE.ShaderMaterial({
  vertexShader: activeVertexShader,
  fragmentShader: activeFragmentShader,
  uniforms,
  side: THREE.DoubleSide
});
const disposableMaterials = [material];

const meshConfig = sceneConfig.mesh || {};
const objectCount = Math.max(1, Number(meshConfig.count || 1));
const rotation = Array.isArray(meshConfig.rotation) ? meshConfig.rotation : [0, 0, 0];
const meshes = [];
for (let index = 0; index < objectCount; index += 1) {
  const mesh = new THREE.Mesh(geometry, material);
  const offset = index - (objectCount - 1) / 2;
  mesh.position.set(offset * 1.45, 0, objectCount > 1 ? -Math.abs(offset) * 0.35 : 0);
  mesh.rotation.set(rotation[0] || 0, rotation[1] || 0, rotation[2] || 0);
  mesh.scale.setScalar(Number(meshConfig.scale || 1));
  scene.add(mesh);
  meshes.push(mesh);
}

const lightConfig = sceneConfig.lightMarker || {};
if (lightConfig.enabled) {
const lightVertexShader = getFile(lightConfig.vertexShader || "");
const lightFragmentShader = getFile(lightConfig.fragmentShader || "");
if (!lightVertexShader || !lightFragmentShader) {
  throw new Error("lightMarker requires vertexShader and fragmentShader files when enabled.");
}
const lightMarkerMaterial = new THREE.ShaderMaterial({
  vertexShader: lightVertexShader,
  fragmentShader: lightFragmentShader,
  uniforms,
  side: THREE.DoubleSide
});
disposableMaterials.push(lightMarkerMaterial);
const lightMarker = new THREE.Mesh(
  new THREE.SphereGeometry(Number(lightConfig.radius || 0.08), 16, 16),
  lightMarkerMaterial
);
lightMarker.position.copy(uniforms.uLightPos.value);
scene.add(lightMarker);
}

let animationFrame = 0;

function resize() {
  const bounds = canvas.parentElement.getBoundingClientRect();
  const width = Math.max(1, Math.floor(bounds.width));
  const height = Math.max(1, Math.floor(bounds.height));
  renderer.setSize(width, height, false);
  if (camera.isPerspectiveCamera) {
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
}

function render(time = 0) {
  resize();
  const seconds = time * 0.001;
  if (sceneConfig.animated) {
    meshes.forEach((mesh, index) => {
      mesh.rotation.y = seconds * 0.75 + index * 0.4;
      mesh.rotation.x = 0.35;
    });
  }
  renderer.render(scene, camera);
  report({ shape: sceneConfig.shape || "custom", mode: sceneConfig.mode || "solid", objects: meshes.length });
  if (sceneConfig.animated) animationFrame = requestAnimationFrame(render);
}

if (sceneConfig.animated) {
  animationFrame = requestAnimationFrame(render);
} else {
  render();
}

return () => {
  if (animationFrame) cancelAnimationFrame(animationFrame);
  geometry.dispose();
  disposableMaterials.forEach((item) => item.dispose());
  renderer.dispose();
};`;
}

function buildVertex(state = {}) {
  const mode = state.mode ?? "solid";
  if (mode === "vertex-color") {
    return `attribute vec3 color;
varying vec3 vColor;

void main() {
  vColor = color;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
  }
  if (["uv-gradient", "checker", "texture-mix"].includes(mode)) {
    return `varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
  }
  if (["ambient", "diffuse", "phong", "material"].includes(mode)) {
    return `varying vec3 vNormal;
varying vec3 vWorldPosition;

void main() {
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPosition.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}`;
  }
  return `void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
}

function buildFragment(state = {}) {
  const mode = state.mode ?? "solid";
  if (mode === "vertex-color") {
    return `varying vec3 vColor;

void main() {
  gl_FragColor = vec4(vColor, 1.0);
}`;
  }
  if (mode === "uv-gradient") {
    return `varying vec2 vUv;

void main() {
  gl_FragColor = vec4(vUv, 1.0 - vUv.x, 1.0);
}`;
  }
  if (mode === "checker") {
    return `varying vec2 vUv;
uniform vec3 uColor;
uniform vec3 uAccentColor;

void main() {
  vec2 grid = floor(vUv * 4.0);
  float mask = mod(grid.x + grid.y, 2.0);
  vec3 calmBase = mix(uColor, vec3(0.88), 0.18);
  vec3 calmAccent = mix(uColor, uAccentColor, 0.32);
  gl_FragColor = vec4(mix(calmBase, calmAccent, mask), 1.0);
}`;
  }
  if (mode === "texture-mix") {
    return `varying vec2 vUv;
uniform vec3 uColor;
uniform vec3 uAccentColor;
uniform float uMixAmount;

void main() {
  vec3 textureA = vec3(vUv, 1.0 - vUv.x);
  vec3 textureB = mix(uAccentColor, uColor, smoothstep(0.15, 0.85, vUv.y));
  gl_FragColor = vec4(mix(textureA, textureB, uMixAmount), 1.0);
}`;
  }
  if (mode === "color-multiply") {
    return `uniform vec3 uObjectColor;
uniform vec3 uLightColor;

void main() {
  gl_FragColor = vec4(uObjectColor * uLightColor, 1.0);
}`;
  }
  if (mode === "ambient") {
    return `uniform vec3 uObjectColor;
uniform vec3 uLightColor;
uniform float uAmbientStrength;

void main() {
  vec3 ambient = uAmbientStrength * uLightColor;
  gl_FragColor = vec4(ambient * uObjectColor, 1.0);
}`;
  }
  if (mode === "diffuse") {
    return `varying vec3 vNormal;
varying vec3 vWorldPosition;
uniform vec3 uObjectColor;
uniform vec3 uLightColor;
uniform vec3 uLightPos;
uniform float uAmbientStrength;

void main() {
  vec3 ambient = uAmbientStrength * uLightColor;
  vec3 normal = normalize(vNormal);
  vec3 lightDir = normalize(uLightPos - vWorldPosition);
  float diff = max(dot(normal, lightDir), 0.0);
  vec3 diffuse = diff * uLightColor;
  gl_FragColor = vec4((ambient + diffuse) * uObjectColor, 1.0);
}`;
  }
  if (mode === "phong" || mode === "material") {
    return `varying vec3 vNormal;
varying vec3 vWorldPosition;
uniform vec3 uObjectColor;
uniform vec3 uLightColor;
uniform vec3 uLightPos;
uniform vec3 uViewPos;
uniform float uAmbientStrength;
uniform float uSpecularStrength;
uniform float uShininess;

void main() {
  vec3 normal = normalize(vNormal);
  vec3 lightDir = normalize(uLightPos - vWorldPosition);
  vec3 viewDir = normalize(uViewPos - vWorldPosition);
  vec3 reflectDir = reflect(-lightDir, normal);

  vec3 ambient = uAmbientStrength * uLightColor;
  float diff = max(dot(normal, lightDir), 0.0);
  vec3 diffuse = diff * uLightColor;
  float spec = pow(max(dot(viewDir, reflectDir), 0.0), uShininess);
  vec3 specular = uSpecularStrength * spec * uLightColor;

  gl_FragColor = vec4((ambient + diffuse + specular) * uObjectColor, 1.0);
}`;
  }
  return `uniform vec3 uColor;

void main() {
  gl_FragColor = vec4(uColor, 1.0);
}`;
}

function buildObjectVertexShader(state = {}) {
  if (["ambient", "diffuse", "phong", "material", "color-multiply"].includes(state.mode ?? "")) {
    return buildVertex({ ...state, mode: ["ambient", "diffuse", "phong", "material"].includes(state.mode) ? state.mode : "diffuse" });
  }
  return buildVertex(state);
}

function buildObjectFragmentShader(state = {}) {
  return buildFragment(state);
}

function buildLightVertexShader() {
  return `void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
}

function buildLightFragmentShader() {
  return `uniform vec3 uLightColor;

void main() {
  gl_FragColor = vec4(uLightColor, 1.0);
}`;
}

function filesFromState(state = {}, entryFileName = defaultEntryFileName) {
  const files = {
    [entryFileName]: buildMain(state),
    "geometry.json": stableJson(buildGeometrySpec(state)),
    "scene.json": stableJson(buildSceneConfig(state)),
    "vertex.glsl": buildVertex(state),
    "fragment.glsl": buildFragment(state)
  };
  const program = objectShaderProgramName(state);
  if (program) {
    delete files["vertex.glsl"];
    delete files["fragment.glsl"];
    files[`${program}.vertex.glsl`] = buildObjectVertexShader(state);
    files[`${program}.fragment.glsl`] = buildObjectFragmentShader(state);
  }
  if (state.showLight || state.lightProgram || state.includeLightShaders) {
    files[lightVertexShaderFile(state)] = buildLightVertexShader();
    files[lightFragmentShaderFile(state)] = buildLightFragmentShader();
  }
  if (state.extraFiles && typeof state.extraFiles === "object") {
    Object.assign(files, state.extraFiles);
  }
  return files;
}

function buildPatch(checkpoint, entryFileName = defaultEntryFileName) {
  if (!checkpoint.patchId) {
    throw new Error(`Checkpoint ${checkpoint.id} cannot build patch without patchId.`);
  }
  if (Array.isArray(checkpoint.changes)) {
    return {
      id: checkpoint.patchId,
      description: checkpoint.expectedObservation,
      changes: checkpoint.changes
    };
  }
  if (!checkpoint.state) {
    throw new Error(`Checkpoint ${checkpoint.id} cannot build patch without state or changes.`);
  }
  const files = filesFromState(checkpoint.state, entryFileName);
  return {
    id: checkpoint.patchId,
    description: checkpoint.expectedObservation,
    changes: Object.entries(files).map(([file, content]) => ({
      file,
      operation: "replace_all",
      content
    }))
  };
}

function validateRecipe(recipe) {
  const required = ["id", "title", "source", "description", "checkpoints"];
  for (const key of required) {
    if (!recipe[key]) throw new Error(`Recipe ${recipe.id ?? "(unknown)"} is missing ${key}.`);
  }
  const starterFiles = starterFilesFromRecipe(recipe);
  const entryFileName = entryFileNameFromRecipe(recipe);
  if (!starterFiles[entryFileName]) {
    throw new Error(`Recipe ${recipe.id} must provide starter/${entryFileName} through starterState or starterFiles.`);
  }
  const lessonFileNames = collectLessonFileNames(recipe, starterFiles);
  const workspaceFiles = buildWorkspaceFiles(recipe, starterFiles);
  const visibleWorkspaceFiles = workspaceFiles
    .filter((file) => file.visible !== false)
    .map((file) => file.path);
  const taughtFiles = new Set(
    recipe.checkpoints
      .flatMap((checkpoint) => checkpoint.files ?? [])
      .filter((file) => visibleWorkspaceFiles.includes(file))
  );
  const untouchedVisibleFiles = visibleWorkspaceFiles.filter((file) => !taughtFiles.has(file));
  if (untouchedVisibleFiles.length) {
    throw new Error(
      `Recipe ${recipe.id} has visible workspace files not connected to checkpoint.files: ${untouchedVisibleFiles.join(", ")}.`
    );
  }
  for (const checkpoint of recipe.checkpoints) {
    if (!checkpoint.question.includes("？") && !checkpoint.question.includes("?")) {
      throw new Error(`Checkpoint ${recipe.id}/${checkpoint.id} must ask one question.`);
    }
    if (checkpoint.files && !Array.isArray(checkpoint.files)) {
      throw new Error(`Checkpoint ${recipe.id}/${checkpoint.id} files must be an array.`);
    }
    for (const file of checkpoint.files ?? []) {
      if (!lessonFileNames.includes(file)) {
        throw new Error(`Checkpoint ${recipe.id}/${checkpoint.id} references unknown workspace file: ${file}.`);
      }
    }
    if (Array.isArray(checkpoint.changes)) {
      for (const [index, change] of checkpoint.changes.entries()) {
        if (!change.file) {
          throw new Error(`Checkpoint ${recipe.id}/${checkpoint.id} change ${index + 1} is missing file.`);
        }
        if (!["replace", "replace_all"].includes(change.operation)) {
          throw new Error(`Checkpoint ${recipe.id}/${checkpoint.id} change ${index + 1} uses unsupported operation.`);
        }
        if (change.operation === "replace" && typeof change.target !== "string") {
          throw new Error(`Checkpoint ${recipe.id}/${checkpoint.id} replace change ${index + 1} is missing target.`);
        }
        if (typeof change.content !== "string") {
          throw new Error(`Checkpoint ${recipe.id}/${checkpoint.id} change ${index + 1} is missing content.`);
        }
      }
    }
    if (checkpoint.patchId && !checkpoint.state && !checkpoint.changes) {
      throw new Error(`Checkpoint ${recipe.id}/${checkpoint.id} has patchId but is missing state or changes.`);
    }
    if (!checkpoint.patchId && (checkpoint.state || checkpoint.changes)) {
      throw new Error(`Checkpoint ${recipe.id}/${checkpoint.id} has state/changes but is missing patchId.`);
    }
  }
}

function generateLesson(recipe, options) {
  validateRecipe(recipe);

  const sourceDir = join(options.sourceRoot, recipe.source);
  if (!existsSync(sourceDir)) {
    throw new Error(`Missing source directory for ${recipe.id}: ${sourceDir}`);
  }

  const outDir = join(options.outRoot, recipe.id);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  const copiedFiles = copyReferenceFiles(sourceDir, outDir);
  const shaderSets = shaderSetsFromSource(sourceDir);
  const starterFiles = starterFilesFromRecipe(recipe);
  const entryFileName = entryFileNameFromRecipe(recipe);
  const manifest = {
    id: recipe.id,
    title: recipe.title,
    category: recipe.category ?? "CG 实验",
    series: recipe.series,
    order: recipe.order,
    level: recipe.level ?? "intro",
    createdAt: recipe.createdAt ?? options.createdAt,
    description: recipe.description,
    source: toPosixPath(relative(workspace, sourceDir)),
    runtime: "three-shader-material",
    previewTitle: recipe.previewTitle ?? recipe.title,
    draft: Boolean(recipe.draft ?? options.draft),
    aiBrief: recipe.aiBrief,
    referenceBrief: recipe.referenceBrief ?? [],
    shaderSets,
    workspaceFiles: buildWorkspaceFiles(recipe, starterFiles),
    referenceFiles: copiedFiles.map((file) => ({
      path: `reference/${file}`,
      role: file === "CMakeLists.txt" ? "原始章节构建入口" : "原始课程参考文件"
    })),
    teachingRules: recipe.teachingRules ?? defaultTeachingRules,
    checkpoints: recipe.checkpoints.map((checkpoint) => ({
      id: checkpoint.id,
      title: checkpoint.title,
      concept: checkpoint.concept,
      files: checkpoint.files ?? [],
      question: checkpoint.question,
      expectedKeywords: checkpoint.expectedKeywords ?? [],
      hint: checkpoint.hint,
      patchId: checkpoint.patchId,
      expectedObservation: checkpoint.expectedObservation
    }))
  };

  writeFile(outDir, "manifest.json", stableJson(manifest));
  writeFile(outDir, "lesson.md", `# ${recipe.title}\n\n${recipe.lesson ?? recipe.description}`);

  for (const [file, content] of Object.entries(starterFiles)) {
    writeFile(outDir, `starter/${file}`, content);
  }

  for (const checkpoint of recipe.checkpoints.filter((item) => item.patchId)) {
    const patch = buildPatch(checkpoint, entryFileName);
    writeFile(outDir, `patches/${patch.id}.json`, stableJson(patch));
  }

  writeFile(
    outDir,
    "reference/source-notes.md",
    `# Source Notes

- Source entry: \`${toPosixPath(relative(workspace, sourceDir))}\`
- Generated lesson id: \`${recipe.id}\`
- Checkpoint count: ${recipe.checkpoints.length}
- Browser runtime: Three.js BufferGeometry + ShaderMaterial
- Reference files: ${copiedFiles.join(", ") || "none"}
- Source projects are reference material. The browser experiment uses generated WebGL-facing files.`
  );

  return { recipe, sourceDir, outDir };
}

const recipeRoot = join(workspace, readOption("recipe-root", "src/graphics-lesson-recipes"));
const sourceRoot = join(workspace, readOption("source-root", "OpenGLProject/src"));
const outRoot = join(workspace, readOption("out-root", "src/graphics-lessons"));
const requestedId = readOption("id");
const requestedSource = readOption("source");
const createdAt = readOption("date", getLocalDateString());
const dryRun = hasFlag("dry-run");
const draft = hasFlag("draft");

const recipes = listRecipeFiles(recipeRoot).map(readJson);
const selectedRecipes = recipes.filter((recipe) => {
  if (requestedId) return recipe.id === requestedId;
  if (requestedSource) return recipe.source === requestedSource;
  return true;
});

if (!selectedRecipes.length) {
  throw new Error("No graphics lesson recipes matched the requested selection.");
}

for (const recipe of selectedRecipes) {
  const sourceDir = join(sourceRoot, recipe.source);
  const outDir = join(outRoot, recipe.id);
  if (dryRun) {
    console.log(`Would generate ${recipe.id}: ${toPosixPath(relative(workspace, sourceDir))} -> ${toPosixPath(relative(workspace, outDir))}`);
    continue;
  }

  const result = generateLesson(recipe, { sourceRoot, outRoot, createdAt, draft });
  console.log(
    `Generated ${recipe.id}: ${toPosixPath(relative(workspace, sourceDir))} -> ${toPosixPath(relative(workspace, outDir))}`
  );
}
