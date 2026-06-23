import helloTriangleManifestRaw from "../graphics-lessons/hello-triangle/manifest.json?raw";
import helloTriangleMain from "../graphics-lessons/hello-triangle/starter/main.js?raw";
import helloTriangleVertex from "../graphics-lessons/hello-triangle/starter/vertex.glsl?raw";
import helloTriangleFragment from "../graphics-lessons/hello-triangle/starter/fragment.glsl?raw";
import helloTrianglePatch01Raw from "../graphics-lessons/hello-triangle/patches/01-triangle-vertices.json?raw";
import helloTrianglePatch02Raw from "../graphics-lessons/hello-triangle/patches/02-fragment-color.json?raw";
import helloTrianglePatch03Raw from "../graphics-lessons/hello-triangle/patches/03-vertex-colors.json?raw";
import helloTriangleReferenceMain from "../graphics-lessons/hello-triangle/reference/main.cpp?raw";

export type GraphicsLabFileName = "main.js" | "vertex.glsl" | "fragment.glsl";

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
  level: string;
  source: string;
  runtime: string;
  previewTitle: string;
  aiBrief: string;
  referenceBrief: string[];
  referenceFiles?: Array<{
    path: string;
    role: string;
  }>;
  referenceCode?: string;
  teachingRules: string[];
  checkpoints: Array<{
    id: string;
    title: string;
    concept: string;
    question: string;
    expectedKeywords: string[];
    hint: string;
    patchId: string;
    expectedObservation: string;
  }>;
  starterFiles: Record<GraphicsLabFileName, string>;
  patches: Record<string, GraphicsLessonPatch>;
};

const parseJson = <T>(raw: string): T => JSON.parse(raw) as T;

const helloTriangleManifest = parseJson<Omit<GraphicsLesson, "starterFiles" | "patches">>(
  helloTriangleManifestRaw
);

const helloTrianglePatches = [
  parseJson<GraphicsLessonPatch>(helloTrianglePatch01Raw),
  parseJson<GraphicsLessonPatch>(helloTrianglePatch02Raw),
  parseJson<GraphicsLessonPatch>(helloTrianglePatch03Raw)
];

export const graphicsLessons: GraphicsLesson[] = [
  {
    ...helloTriangleManifest,
    starterFiles: {
      "main.js": helloTriangleMain.trim(),
      "vertex.glsl": helloTriangleVertex.trim(),
      "fragment.glsl": helloTriangleFragment.trim()
    },
    referenceCode: helloTriangleReferenceMain.trim(),
    patches: Object.fromEntries(helloTrianglePatches.map((patch) => [patch.id, patch]))
  }
];

export const defaultGraphicsLesson = graphicsLessons[0];
