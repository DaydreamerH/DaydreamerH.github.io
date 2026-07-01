import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import sharp from "sharp";

const rootDir = process.cwd();
const knowledgeDir = path.join(rootDir, "src", "content", "knowledge");
const outputName = "card-banner.webp";
const supportedExtensions = new Set([".avif", ".jpeg", ".jpg", ".png", ".webp"]);
const force = process.argv.includes("--force");

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function findMarkdownFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await findMarkdownFiles(entryPath)));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
      files.push(entryPath);
    }
  }

  return files;
}

function readFrontmatter(markdown) {
  if (!markdown.startsWith("---")) return null;
  const end = markdown.indexOf("\n---", 3);
  if (end === -1) return null;
  return markdown.slice(3, end);
}

function readPhotosField(frontmatter) {
  const match = frontmatter.match(/^photos:\s*(.+?)\s*$/m);
  if (!match) return null;

  return match[1]
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/^\[(.+)\]$/, "$1")
    .split(",")[0]
    .trim()
    .replace(/^["']|["']$/g, "");
}

async function shouldRegenerate(sourcePath, outputPath) {
  if (force) return true;
  if (!(await pathExists(outputPath))) return true;

  const [sourceStat, outputStat] = await Promise.all([fs.stat(sourcePath), fs.stat(outputPath)]);
  return sourceStat.mtimeMs > outputStat.mtimeMs;
}

async function generateCardBanner(markdownPath) {
  const markdown = await fs.readFile(markdownPath, "utf8");
  const frontmatter = readFrontmatter(markdown);
  if (!frontmatter) return { status: "skipped", reason: "no frontmatter" };

  const photos = readPhotosField(frontmatter);
  if (!photos) return { status: "skipped", reason: "no photos" };

  const postDir = path.dirname(markdownPath);
  const sourcePath = path.resolve(postDir, photos);
  const outputPath = path.join(postDir, outputName);
  const extension = path.extname(sourcePath).toLowerCase();

  if (!supportedExtensions.has(extension)) {
    return { status: "skipped", reason: `unsupported ${extension || "file"}` };
  }

  if (!(await pathExists(sourcePath))) {
    return { status: "warning", reason: `missing ${path.relative(rootDir, sourcePath)}` };
  }

  if (!(await shouldRegenerate(sourcePath, outputPath))) {
    return { status: "unchanged", outputPath };
  }

  await sharp(sourcePath)
    .resize({
      width: 640,
      height: 360,
      fit: "cover",
      position: "attention",
      withoutEnlargement: true,
    })
    .webp({ quality: 68, effort: 4 })
    .toFile(outputPath);

  return { status: "generated", outputPath };
}

const markdownFiles = await findMarkdownFiles(knowledgeDir);
const summary = {
  generated: 0,
  unchanged: 0,
  skipped: 0,
  warning: 0,
};
const warnings = [];

for (const markdownPath of markdownFiles) {
  const result = await generateCardBanner(markdownPath);
  summary[result.status] += 1;
  if (result.status === "warning") {
    warnings.push(result.reason);
  }
}

console.log(
  `Card banners: ${summary.generated} generated, ${summary.unchanged} unchanged, ${summary.skipped} skipped, ${summary.warning} warnings.`
);

for (const warning of warnings) {
  console.warn(`- ${warning}`);
}
