import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const webglIndexPath = join(root, "dist", "webgl", "index.html");
const webglLessonPath = join(root, "dist", "webgl", "hello-triangle", "index.html");
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

const checks = [
  {
    name: "built WebGL lesson index",
    test: () => existsSync(webglIndexPath)
  },
  {
    name: "built WebGL lesson page",
    test: () => existsSync(webglLessonPath)
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
    test: (html) =>
      html.includes("data-lesson-payload") &&
      html.includes("Hello Triangle") &&
      html.includes("01-triangle-vertices")
  },
  {
    name: "runtime script",
    test: () => Boolean(matchedRuntime)
  }
];

const html = existsSync(webglLessonPath) ? readFileSync(webglLessonPath, "utf8") : "";
const lessonPageHtml = lessonPagePaths.map((path) => ({
  path,
  html: readFileSync(path, "utf8")
}));
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
