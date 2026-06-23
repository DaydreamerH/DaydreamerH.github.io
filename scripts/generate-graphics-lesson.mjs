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

const fileNames = ["main.js", "vertex.glsl", "fragment.glsl"];
const defaultTeachingRules = [
  "每轮只提出一个问题。",
  "先判断用户回答，再决定是否应用 patch。",
  "回答正确或基本正确时，返回当前 checkpoint 的 patchId。",
  "回答不完整时给一个提示，不要应用 patch。",
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

  for (const entry of readdirSync(sourceDir)) {
    const source = join(sourceDir, entry);
    if (!statSync(source).isFile()) continue;

    const extension = extname(entry).toLowerCase();
    if (entry === "CMakeLists.txt" || allowed.has(extension)) {
      copyFileSync(source, join(referenceDir, entry));
      copied.push(entry);
    }
  }

  return copied;
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
  uAccentColor: { value: ${colorLiteral(state.accentColor, [0.0, 0.68, 0.71])} },
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

function buildMain(state = {}) {
  const shape = state.shape ?? "triangle";
  const cameraType = state.camera ?? (shape === "cube" ? "perspective" : "orthographic");
  const objectCount = Math.max(1, Number(state.objectCount ?? 1));
  const rotation = state.rotation ?? (shape === "cube" ? [0.35, 0.55, 0] : [0, 0, 0]);
  const cameraPosition = state.cameraPosition ?? (cameraType === "perspective" ? [2.4, 1.8, 4.2] : [0, 0, 3]);
  const cameraCode =
    cameraType === "perspective"
      ? `const camera = new THREE.PerspectiveCamera(${Number(state.fov ?? 45).toFixed(1)}, 1, 0.1, 100);`
      : "const camera = new THREE.OrthographicCamera(-1.4, 1.4, 1.1, -1.1, 0.1, 20);";

  return `// Generated CG experiment runtime
// Available objects: THREE, canvas, vertexShader, fragmentShader, report

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0xf8f8f8, 1);

const scene = new THREE.Scene();
${cameraCode}
camera.position.set(${cameraPosition.map((item) => Number(item).toFixed(3)).join(", ")});
camera.lookAt(0, 0, 0);

${buildGeometry({ ...state, shape })}

${buildUniforms(state)}

const material = new THREE.ShaderMaterial({
  vertexShader,
  fragmentShader,
  uniforms,
  side: THREE.DoubleSide
});

const meshes = [];
for (let index = 0; index < ${objectCount}; index += 1) {
  const mesh = new THREE.Mesh(geometry, material);
  const offset = index - (${objectCount} - 1) / 2;
  mesh.position.set(offset * 1.45, 0, ${objectCount > 1 ? "-Math.abs(offset) * 0.35" : "0"});
  mesh.rotation.set(${rotation.map((item) => Number(item).toFixed(3)).join(", ")});
  mesh.scale.setScalar(${Number(state.scale ?? 1).toFixed(2)});
  scene.add(mesh);
  meshes.push(mesh);
}

${state.showLight ? `const lightMarker = new THREE.Mesh(
  new THREE.SphereGeometry(0.08, 16, 16),
  new THREE.MeshBasicMaterial({ color: uniforms.uLightColor.value })
);
lightMarker.position.copy(uniforms.uLightPos.value);
scene.add(lightMarker);` : ""}

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
  ${state.animated ? "meshes.forEach((mesh, index) => { mesh.rotation.y = seconds * 0.75 + index * 0.4; mesh.rotation.x = 0.35; });" : ""}
  renderer.render(scene, camera);
  report({ shape: "${shape}", mode: "${state.mode ?? "solid"}", objects: meshes.length });
  ${state.animated ? "animationFrame = requestAnimationFrame(render);" : ""}
}

${state.animated ? "animationFrame = requestAnimationFrame(render);" : "render();"}

return () => {
  if (animationFrame) cancelAnimationFrame(animationFrame);
  geometry.dispose();
  material.dispose();
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
  vec2 grid = floor(vUv * 8.0);
  float mask = mod(grid.x + grid.y, 2.0);
  gl_FragColor = vec4(mix(uColor, uAccentColor, mask), 1.0);
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

function filesFromState(state) {
  return {
    "main.js": buildMain(state),
    "vertex.glsl": buildVertex(state),
    "fragment.glsl": buildFragment(state)
  };
}

function buildPatch(checkpoint) {
  const files = filesFromState(checkpoint.state);
  return {
    id: checkpoint.patchId,
    description: checkpoint.expectedObservation,
    changes: fileNames.map((file) => ({
      file,
      operation: "replace_all",
      content: files[file]
    }))
  };
}

function validateRecipe(recipe) {
  const required = ["id", "title", "source", "description", "starterState", "checkpoints"];
  for (const key of required) {
    if (!recipe[key]) throw new Error(`Recipe ${recipe.id ?? "(unknown)"} is missing ${key}.`);
  }
  for (const checkpoint of recipe.checkpoints) {
    if (!checkpoint.question.includes("？") && !checkpoint.question.includes("?")) {
      throw new Error(`Checkpoint ${recipe.id}/${checkpoint.id} must ask one question.`);
    }
    if (!checkpoint.patchId || !checkpoint.state) {
      throw new Error(`Checkpoint ${recipe.id}/${checkpoint.id} is missing patchId or state.`);
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
  if (recipe.preserveExisting && existsSync(outDir) && !options.force) {
    return { recipe, sourceDir, outDir, preserved: true };
  }

  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  const copiedFiles = copyReferenceFiles(sourceDir, outDir);
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
    referenceFiles: copiedFiles.map((file) => ({
      path: `reference/${file}`,
      role: file === "CMakeLists.txt" ? "原始章节构建入口" : "原始课程参考文件"
    })),
    teachingRules: recipe.teachingRules ?? defaultTeachingRules,
    checkpoints: recipe.checkpoints.map((checkpoint) => ({
      id: checkpoint.id,
      title: checkpoint.title,
      concept: checkpoint.concept,
      question: checkpoint.question,
      expectedKeywords: checkpoint.expectedKeywords ?? [],
      hint: checkpoint.hint,
      patchId: checkpoint.patchId,
      expectedObservation: checkpoint.expectedObservation
    }))
  };

  writeFile(outDir, "manifest.json", stableJson(manifest));
  writeFile(outDir, "lesson.md", `# ${recipe.title}\n\n${recipe.lesson ?? recipe.description}`);

  const starterFiles = filesFromState(recipe.starterState);
  for (const [file, content] of Object.entries(starterFiles)) {
    writeFile(outDir, `starter/${file}`, content);
  }

  for (const checkpoint of recipe.checkpoints) {
    const patch = buildPatch(checkpoint);
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

  return { recipe, sourceDir, outDir, preserved: false };
}

const recipeRoot = join(workspace, readOption("recipe-root", "src/graphics-lesson-recipes"));
const sourceRoot = join(workspace, readOption("source-root", "OpenGLProject/src"));
const outRoot = join(workspace, readOption("out-root", "src/graphics-lessons"));
const requestedId = readOption("id");
const requestedSource = readOption("source");
const createdAt = readOption("date", getLocalDateString());
const dryRun = hasFlag("dry-run");
const draft = hasFlag("draft");
const force = hasFlag("force");

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

  const result = generateLesson(recipe, { sourceRoot, outRoot, createdAt, draft, force });
  console.log(
    `${result.preserved ? "Preserved" : "Generated"} ${recipe.id}: ${toPosixPath(relative(workspace, sourceDir))} -> ${toPosixPath(relative(workspace, outDir))}`
  );
}
