import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const webglHtmlPath = join(root, "dist", "webgl", "index.html");

const checks = [
  {
    name: "built WebGL page",
    test: () => existsSync(webglHtmlPath)
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
    name: "runtime script",
    test: (html) => /<script[^>]+type="module"[^>]+src="\/_astro\/webgl\./.test(html)
  }
];

const html = existsSync(webglHtmlPath) ? readFileSync(webglHtmlPath, "utf8") : "";
const runtimeMatch = html.match(/<script[^>]+type="module"[^>]+src="\/(_astro\/webgl\.[^"]+\.js)"/);
const runtimeScriptPath = runtimeMatch ? join(root, "dist", runtimeMatch[1]) : "";
const runtimeScript = runtimeScriptPath && existsSync(runtimeScriptPath)
  ? readFileSync(runtimeScriptPath, "utf8")
  : "";

checks.push(
  {
    name: "AI guide runtime",
    test: () =>
      runtimeScript.includes("__graphicsLabGuideSmokeTest") &&
      runtimeScript.includes("guideReady")
  }
);

const failures = checks.filter((check) => !check.test(html));

if (failures.length) {
  console.error("Graphics Lab verification failed:");
  failures.forEach((failure) => console.error(`- ${failure.name}`));
  process.exit(1);
}

console.log("Graphics Lab build artifact verification passed.");
