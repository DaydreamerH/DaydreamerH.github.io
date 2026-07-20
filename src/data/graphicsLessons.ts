export type GraphicsLabFileName = string;

export type GraphicsLessonPatch = {
  id: string;
  description: string;
  changes: Array<{
    file: GraphicsLabFileName;
    operation: "replace_all" | "replace";
    target?: string;
    content: string;
  }>;
};

export type GraphicsLesson = {
  id: string;
  title: string;
  category: string;
  series?: string;
  order?: number;
  level: string;
  createdAt: string;
  description: string;
  source: string;
  runtime: string;
  previewTitle: string;
  aiBrief: string;
  referenceBrief: string[];
  referenceFiles?: Array<{
    path: string;
    role: string;
  }>;
  shaderSets?: Array<{
    name: string;
    role?: string;
    vertex?: string;
    geometry?: string;
    fragment?: string;
  }>;
  workspaceFiles?: Array<{
    path: GraphicsLabFileName;
    role: "entry" | "shader" | "helper" | "data" | "metadata";
    label?: string;
    concept?: string;
    visible?: boolean;
  }>;
  referenceCode?: string;
  teachingRules: string[];
  checkpoints: Array<{
    id: string;
    title: string;
    concept: string;
    files?: GraphicsLabFileName[];
    flow?: "question_only" | "answer_then_patch" | "observe_then_question";
    question: string;
    expectedKeywords: string[];
    hint: string;
    patchId: string;
    expectedObservation: string;
  }>;
  starterFiles: Record<GraphicsLabFileName, string>;
  patches: Record<string, GraphicsLessonPatch>;
};

export type GraphicsLessonSummary = Pick<
  GraphicsLesson,
  "id" | "title" | "category" | "level" | "createdAt" | "description" | "previewTitle"
> & {
  checkpointCount: number;
};

const manifestModules = import.meta.glob("../graphics-lessons/*/manifest.json", {
  query: "?raw",
  import: "default",
  eager: true
});

const starterModules = import.meta.glob("../graphics-lessons/*/starter/*", {
  query: "?raw",
  import: "default",
  eager: true
});

const patchModules = import.meta.glob("../graphics-lessons/*/patches/*.json", {
  query: "?raw",
  import: "default",
  eager: true
});

const referenceModules = import.meta.glob("../graphics-lessons/*/reference/*", {
  query: "?raw",
  import: "default",
  eager: true
});

const parseJson = <T>(raw: unknown): T => JSON.parse(String(raw)) as T;

const getLessonIdFromPath = (path: string) => {
  const match = path.match(/graphics-lessons\/([^/]+)\//);
  if (!match) throw new Error(`Cannot resolve graphics lesson id from path: ${path}`);
  return match[1];
};

const getStarterFileName = (path: string): GraphicsLabFileName | null => path.split("/").at(-1) ?? null;

const lessonsById = new Map<string, GraphicsLesson>();

for (const [path, raw] of Object.entries(manifestModules)) {
  const manifest = parseJson<Omit<GraphicsLesson, "starterFiles" | "patches">>(raw);
  lessonsById.set(manifest.id, {
    ...manifest,
    starterFiles: {},
    patches: {}
  });
}

for (const [path, raw] of Object.entries(starterModules)) {
  const lesson = lessonsById.get(getLessonIdFromPath(path));
  const fileName = getStarterFileName(path);
  if (lesson && fileName) {
    lesson.starterFiles[fileName] = String(raw).trim();
  }
}

for (const [path, raw] of Object.entries(patchModules)) {
  const lesson = lessonsById.get(getLessonIdFromPath(path));
  if (lesson) {
    const patch = parseJson<GraphicsLessonPatch>(raw);
    lesson.patches[patch.id] = patch;
  }
}

for (const [path, raw] of Object.entries(referenceModules)) {
  const lesson = lessonsById.get(getLessonIdFromPath(path));
  if (lesson) {
    const fileName = path.split("/").at(-1) ?? "reference";
    const content = String(raw).trim();
    lesson.referenceCode = [lesson.referenceCode, `--- ${fileName} ---\n${content}`].filter(Boolean).join("\n\n");
  }
}

export const graphicsLessons: GraphicsLesson[] = [...lessonsById.values()].sort((a, b) => {
  const dateCompare = b.createdAt.localeCompare(a.createdAt);
  if (dateCompare !== 0) return dateCompare;
  return a.title.localeCompare(b.title);
});

export const graphicsLessonSummaries: GraphicsLessonSummary[] = graphicsLessons.map((lesson) => ({
  id: lesson.id,
  title: lesson.title,
  category: lesson.category,
  level: lesson.level,
  createdAt: lesson.createdAt,
  description: lesson.description,
  previewTitle: lesson.previewTitle,
  checkpointCount: lesson.checkpoints.length
}));

export const defaultGraphicsLesson = graphicsLessons[0];
