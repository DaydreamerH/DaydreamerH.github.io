import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const webglIndexPath = join(root, "dist", "webgl", "index.html");
const webglRoot = join(root, "dist", "webgl");
const sourceLessonRoot = join(root, "src", "graphics-lessons");
const expectedLessonCount = existsSync(sourceLessonRoot)
  ? readdirSync(sourceLessonRoot, { withFileTypes: true }).filter(
      (entry) => entry.isDirectory() && existsSync(join(sourceLessonRoot, entry.name, "manifest.json"))
    ).length
  : 0;
const lessonPagePaths = existsSync(webglRoot)
  ? readdirSync(webglRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(webglRoot, entry.name, "index.html"))
      .filter((path) => existsSync(path))
  : [];

const sourceLessons = existsSync(sourceLessonRoot)
  ? readdirSync(sourceLessonRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && existsSync(join(sourceLessonRoot, entry.name, "manifest.json")))
      .map((entry) => {
        const lessonDir = join(sourceLessonRoot, entry.name);
        const manifest = JSON.parse(readFileSync(join(lessonDir, "manifest.json"), "utf8"));
        const starterDir = join(lessonDir, "starter");
        const starterFiles = existsSync(starterDir)
          ? readdirSync(starterDir, { withFileTypes: true }).filter((file) => file.isFile()).map((file) => file.name)
          : [];
        const starterSources = Object.fromEntries(
          starterFiles.map((file) => [file, readFileSync(join(starterDir, file), "utf8")])
        );
        const patchDir = join(lessonDir, "patches");
        const patches = existsSync(patchDir)
          ? readdirSync(patchDir, { withFileTypes: true })
              .filter((file) => file.isFile() && file.name.endsWith(".json"))
              .map((file) => JSON.parse(readFileSync(join(patchDir, file.name), "utf8")))
          : [];
        return { id: entry.name, manifest, starterFiles, starterSources, patches };
      })
  : [];

const lessonPageHtml = lessonPagePaths.map((path) => ({
  path,
  lessonId: path.split(/[\\/]/).at(-2) ?? "",
  html: readFileSync(path, "utf8")
}));

function validateLessonContracts() {
  return sourceLessons.every(({ manifest, starterFiles, starterSources, patches }) => {
    const workspaceFiles = Array.isArray(manifest.workspaceFiles) ? manifest.workspaceFiles : [];
    const entryFiles = workspaceFiles.filter((file) => file.role === "entry");
    if (entryFiles.length !== 1) return false;
    const entryFile = entryFiles[0].path;
    if (!starterFiles.includes(entryFile)) return false;
    const entrySource = starterSources[entryFile] ?? "";
    if (entrySource.includes("Available objects: THREE, canvas, vertexShader")) return false;
    if (/\|\|\s*(vertexShader|fragmentShader)\b/.test(entrySource)) return false;

    if (starterFiles.includes("scene.json")) {
      const scene = JSON.parse(starterSources["scene.json"]);
      const shaderRefs = [
        scene.material?.vertexShader,
        scene.material?.fragmentShader,
        scene.lightMarker?.enabled ? scene.lightMarker?.vertexShader : "",
        scene.lightMarker?.enabled ? scene.lightMarker?.fragmentShader : ""
      ].filter(Boolean);
      if (!shaderRefs.every((file) => starterFiles.includes(file))) return false;
    }

    const workspacePaths = new Set(workspaceFiles.map((file) => file.path));
    if (!starterFiles.every((file) => workspacePaths.has(file))) return false;
    if (!workspaceFiles.every((file) => file.role && typeof file.concept === "string")) return false;
    const lessonFilePaths = new Set([
      ...workspacePaths,
      ...patches.flatMap((patch) => patch.changes?.map((change) => change.file) ?? [])
    ]);
    const checkpoints = Array.isArray(manifest.checkpoints) ? manifest.checkpoints : [];
    if (!checkpoints.every((checkpoint) => Array.isArray(checkpoint.files))) return false;
    if (!checkpoints.every((checkpoint) => checkpoint.files.every((file) => lessonFilePaths.has(file)))) return false;
    const taughtFiles = new Set(checkpoints.flatMap((checkpoint) => checkpoint.files));
    const visibleWorkspaceFiles = workspaceFiles.filter((file) => file.visible !== false).map((file) => file.path);
    if (!visibleWorkspaceFiles.every((file) => taughtFiles.has(file))) return false;

    const patchIds = new Set(patches.map((patch) => patch.id));
    const checkpointPatchIds = checkpoints
      .map((checkpoint) => checkpoint.patchId)
      .filter(Boolean);
    if (!checkpointPatchIds.every((patchId) => patchIds.has(patchId))) return false;

    return patches.every((patch) =>
      Array.isArray(patch.changes) &&
      patch.changes.every((change) =>
        change.file &&
        lessonFilePaths.has(change.file) &&
        ["replace", "replace_all"].includes(change.operation) &&
        (change.operation !== "replace" || typeof change.target === "string") &&
        typeof change.content === "string"
      )
    );
  });
}

const representativeLessonPage = lessonPageHtml[0];
const html = representativeLessonPage?.html ?? "";

const checks = [
  {
    name: "built WebGL lesson index",
    test: () => existsSync(webglIndexPath)
  },
  {
    name: "built WebGL lesson pages",
    test: () => lessonPagePaths.length > 0
  },
  {
    name: "built generated lesson pages",
    test: () => lessonPagePaths.length === expectedLessonCount
  },
  {
    name: "graphics lab mount",
    test: (html) => html.includes("data-graphics-lab")
  },
  {
    name: "preview canvas",
    test: (html) => html.includes("data-lab-canvas")
  },
  {
    name: "editor host",
    test: (html) => html.includes("data-editor-host")
  },
  {
    name: "AI guide panel",
    test: (html) =>
      html.includes("data-guide-tab") &&
      html.includes("data-guide-workspace") &&
      html.includes("data-guide-start")
  },
  {
    name: "lesson payload",
    test: () =>
      lessonPageHtml.every(({ html }) => html.includes("data-lesson-payload"))
  },
  {
    name: "runtime script",
    test: () => Boolean(matchedRuntime)
  },
  {
    name: "lesson data contracts",
    test: () => validateLessonContracts()
  }
];

const scriptMatches = [...html.matchAll(/<script[^>]+type="module"[^>]+src="\/(_astro\/[^"]+\.js)"/g)];
const runtimeScripts = scriptMatches
  .map((match) => join(root, "dist", match[1]))
  .filter((scriptPath) => existsSync(scriptPath))
  .map((scriptPath) => readFileSync(scriptPath, "utf8"));
const runtimeScript = runtimeScripts.find((script) => script.includes("__graphicsLabGuideSmokeTest")) ?? "";
const matchedRuntime = Boolean(runtimeScript);

checks.push(
  {
    name: "AI guide runtime",
    test: () =>
      runtimeScript.includes("__graphicsLabGuideSmokeTest") &&
      runtimeScript.includes("guideReady") &&
      runtimeScript.includes("patchId")
  },
  {
    name: "all lesson pages contain lab payload",
    test: () =>
      lessonPageHtml.every(({ html }) =>
        html.includes("data-graphics-lab") &&
        html.includes("data-lesson-payload") &&
        html.includes("data-lab-canvas") &&
        html.includes("data-editor-host") &&
        html.includes("data-guide-start")
      )
  }
);

const failures = checks.filter((check) => !check.test(html));

if (failures.length) {
  console.error("Graphics Lab verification failed:");
  failures.forEach((failure) => console.error(`- ${failure.name}`));
  process.exit(1);
}

console.log("Graphics Lab build artifact verification passed.");
