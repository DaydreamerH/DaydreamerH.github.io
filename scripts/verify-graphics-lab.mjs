import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const webglIndexPath = join(root, "dist", "webgl", "index.html");
const webglLessonPath = join(root, "dist", "webgl", "hello-triangle", "index.html");

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
const runtimeMatch = html.match(/<script[^>]+type="module"[^>]+src="\/(_astro\/webgl\.[^"]+\.js)"/);
const lessonRuntimeMatch = html.match(
  /<script[^>]+type="module"[^>]+src="\/(_astro\/_lessonId_[^"]+\.js)"/
);
const matchedRuntime = runtimeMatch?.[1] ?? lessonRuntimeMatch?.[1] ?? "";
const runtimeScriptPath = matchedRuntime ? join(root, "dist", matchedRuntime) : "";
const runtimeScript = runtimeScriptPath && existsSync(runtimeScriptPath)
  ? readFileSync(runtimeScriptPath, "utf8")
  : "";

checks.push(
  {
    name: "AI guide runtime",
    test: () =>
      runtimeScript.includes("__graphicsLabGuideSmokeTest") &&
      runtimeScript.includes("guideReady") &&
      runtimeScript.includes("patchId")
  }
);

const failures = checks.filter((check) => !check.test(html));

if (failures.length) {
  console.error("Graphics Lab verification failed:");
  failures.forEach((failure) => console.error(`- ${failure.name}`));
  process.exit(1);
}

console.log("Graphics Lab build artifact verification passed.");
