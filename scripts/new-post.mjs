import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const knowledgeRoot = join(root, "src", "content", "knowledge");

const args = process.argv.slice(2);

function readOption(name) {
  const index = args.findIndex((arg) => arg === `--${name}`);
  if (index === -1) return "";
  return args[index + 1] && !args[index + 1].startsWith("--") ? args[index + 1] : "";
}

function hasFlag(name) {
  return args.includes(`--${name}`);
}

function getTitle() {
  const titleArg = args.find((arg, index) => {
    if (arg.startsWith("--")) return false;
    const previous = args[index - 1] ?? "";
    return !previous.startsWith("--");
  });
  return (readOption("title") || titleArg || "").trim();
}

function slugify(input) {
  return input
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/c\+\+/g, "c-plus-plus")
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function today() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function yamlString(value) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

const title = getTitle();

if (!title) {
  console.error('Usage: npm run new:post -- "文章标题" [--slug custom-slug] [--category cpp] [--draft]');
  process.exit(1);
}

const slug = slugify(readOption("slug") || title);

if (!slug) {
  console.error("Could not generate a valid slug. Use --slug custom-slug.");
  process.exit(1);
}

const targetDir = join(knowledgeRoot, slug);
const targetFile = join(targetDir, "index.md");

if (existsSync(targetFile)) {
  console.error(`Post already exists: ${targetFile}`);
  process.exit(1);
}

const category = readOption("category") || "notes";
const track = readOption("track") || "Knowledge Base";
const level = readOption("level") || "foundation";
const status = hasFlag("draft") ? "draft" : readOption("status") || "ready";
const published = hasFlag("draft") ? "false" : "true";
const minutes = readOption("minutes") || "20";
const date = readOption("date") || today();

mkdirSync(targetDir, { recursive: true });

const content = `---
title: ${yamlString(title)}
description: ""
date: "${date}"
category: "${category}"
track: "${track}"
level: "${level}"
status: "${status}"
published: ${published}
minutes: ${minutes}
order: 0
prerequisites: []
tags: []
photos: "banner.png"
---

## 摘要

`;

writeFileSync(targetFile, content, "utf8");

console.log(`Created post: ${targetFile}`);
