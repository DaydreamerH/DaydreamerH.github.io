import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const knowledgeRoot = join(root, "src", "content", "knowledge");
const reviewRoot = join(root, "src", "reviews", "knowledge");
const args = process.argv.slice(2);

function readOption(name) {
  const index = args.findIndex((arg) => arg === `--${name}`);
  if (index === -1) return "";
  return args[index + 1] && !args[index + 1].startsWith("--") ? args[index + 1] : "";
}

function hasFlag(name) {
  return args.includes(`--${name}`);
}

function todayId() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

function nowIsoWithTimezone() {
  const date = new Date();
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absolute = Math.abs(offsetMinutes);
  const hours = String(Math.floor(absolute / 60)).padStart(2, "0");
  const minutes = String(absolute % 60).padStart(2, "0");
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 19);
  return `${local}${sign}${hours}:${minutes}`;
}

function readJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, "utf8"));
}

function usage() {
  console.error("Usage: npm run review:record -- --slug <post-slug> --input <coach-feedback.json> [--append]");
  process.exit(1);
}

const slug = readOption("slug");
const input = readOption("input");
const shouldAppend = hasFlag("append");

if (!slug || !input) usage();

const postDir = join(knowledgeRoot, slug);
const reviewPath = join(reviewRoot, `${slug}.json`);
const inputPath = resolve(input);
const outputPath = resolve(reviewPath);

if (!existsSync(postDir)) {
  console.error(`Knowledge post not found: ${postDir}`);
  process.exit(1);
}

if (!existsSync(inputPath)) {
  console.error(`Feedback input not found: ${inputPath}`);
  process.exit(1);
}

if (inputPath === outputPath) {
  console.error("Refusing to use the review output file itself as --input.");
  process.exit(1);
}

const inputPayload = JSON.parse(readFileSync(inputPath, "utf8"));
if (inputPayload.slug && inputPayload.slug !== slug) {
  console.error(`Feedback slug mismatch: input is "${inputPayload.slug}", but --slug is "${slug}".`);
  process.exit(1);
}

const feedbackItems = Array.isArray(inputPayload.drafts) ? inputPayload.drafts : [inputPayload];
const emptyReview = {
  slug,
  summary: {
    reviewCount: 0,
    lastReviewedAt: "",
    lastPerformance: "skipped",
    activeMarkCount: 0,
    resolvedMarkCount: 0
  },
  sessions: [],
  marks: []
};

const baseReview = shouldAppend ? readJson(reviewPath, emptyReview) : emptyReview;

let next = {
  ...baseReview,
  slug,
  sessions: [...baseReview.sessions],
  marks: [...baseReview.marks]
};

let lastSession = next.sessions.at(-1);

function appendFeedback(feedback) {
  const reviewedAt = feedback.reviewedAt || nowIsoWithTimezone();
  const sequence = String(next.sessions.length + 1).padStart(3, "0");
  const sessionId = feedback.id || `rv-${todayId()}-${slug}-${sequence}`;
  const suggestedMarks = Array.isArray(feedback.suggestedMarks) ? feedback.suggestedMarks : [];

  const createdMarks = suggestedMarks.map((mark, index) => ({
    id: mark.id || `mk-${todayId()}-${slug}-${String(next.marks.length + index + 1).padStart(3, "0")}`,
    status: mark.status || "active",
    type: mark.type || "unclear",
    severity: mark.severity || "medium",
    quote: mark.quote || "",
    reason: mark.reason || "",
    sessionId,
    createdAt: mark.createdAt || reviewedAt,
    resolvedAt: mark.resolvedAt ?? null
  })).filter((mark) => mark.quote && mark.reason);

  const session = {
    id: sessionId,
    reviewedAt,
    performance: feedback.performance || "skipped",
    score: feedback.score,
    questions: Array.isArray(feedback.questions) ? feedback.questions : [],
    coachSummary: feedback.coachSummary || "",
    createdMarks: createdMarks.map((mark) => mark.id)
  };

  next.sessions.push(session);
  next.marks.push(...createdMarks);
  lastSession = session;
}

for (const feedback of feedbackItems) {
  appendFeedback(feedback);
}

const activeMarkCount = next.marks.filter((mark) => mark.status === "active").length;
const resolvedMarkCount = next.marks.filter((mark) => mark.status === "resolved").length;

next.summary = {
  reviewCount: next.sessions.length,
  lastReviewedAt: lastSession?.reviewedAt || "",
  lastPerformance: lastSession?.performance || "skipped",
  activeMarkCount,
  resolvedMarkCount
};

mkdirSync(reviewRoot, { recursive: true });
writeFileSync(reviewPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
const modeLabel = shouldAppend ? "Appended" : "Replaced";
console.log(`${modeLabel} ${feedbackItems.length} review session(s): ${reviewPath}`);

try {
  unlinkSync(inputPath);
  console.log(`Removed imported feedback input: ${inputPath}`);
} catch (error) {
  console.warn(`Imported review data, but could not remove input file: ${inputPath}`);
  console.warn(error.message);
}
