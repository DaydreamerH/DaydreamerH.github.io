import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const workspace = join(root, "..");
const lessonRoot = join(workspace, "src", "graphics-lessons", "hello-triangle");
const sourceRoot = join(workspace, "OpenGLProject", "src", "02_hello_triangle");

const write = (relativePath, content) => {
  const target = join(lessonRoot, relativePath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${content.trim()}\n`, "utf8");
};

const originalMain = readFileSync(join(sourceRoot, "main.cpp"), "utf8");
const originalCmake = readFileSync(join(sourceRoot, "CMakeLists.txt"), "utf8");
const hasIndexedDraw = originalMain.includes("glDrawElements");
const hasShaderProgram = originalMain.includes("glCreateProgram");
const hasVertexAttribPointer = originalMain.includes("glVertexAttribPointer");

rmSync(lessonRoot, { recursive: true, force: true });
mkdirSync(lessonRoot, { recursive: true });

write(
  "manifest.json",
  JSON.stringify(
    {
      id: "hello-triangle",
      title: "Hello Triangle",
      category: "OpenGL 基础",
      level: "intro",
      source: "OpenGLProject/src/02_hello_triangle",
      runtime: "three-shader-material",
      previewTitle: "Hello Triangle",
      aiBrief:
        "本实验把 OpenGL hello_triangle 转写为浏览器中的 Three.js ShaderMaterial 实验。AI 需要按 checkpoint 提问，确认用户理解后只返回预设 patchId，不要自由生成完整课程。",
      referenceBrief: [
        "OpenGL 版本中，顶点数据通过 VBO 上传，并由 VAO 记录顶点属性解释方式。",
        "glVertexAttribPointer(0, 3, GL_FLOAT, GL_FALSE, 3 * sizeof(float), (void*)0) 表示 location 0 每个顶点读取 3 个 float。",
        "顶点着色器把 aPos 写入 gl_Position，片元着色器输出固定颜色。",
        "WebGL 实验中用 Three.js BufferGeometry 对应顶点缓冲，用 ShaderMaterial 承载 vertex.glsl 与 fragment.glsl。",
        "课程包包含 reference/main.cpp，AI 可以参考它理解 OpenGL 原始任务，但不应要求用户在网页中编译 C++。"
      ],
      referenceFiles: [
        {
          path: "reference/main.cpp",
          role: "OpenGL 原始 hello_triangle 代码"
        },
        {
          path: "reference/CMakeLists.txt",
          role: "原始章节构建入口"
        }
      ],
      teachingRules: [
        "每轮只提出一个问题。",
        "先判断用户回答，再决定是否应用 patch。",
        "回答正确或基本正确时，返回当前 checkpoint 的 patchId。",
        "回答不完整时给一个提示，不要应用 patch。",
        "不要输出大段 OpenGL 或 WebGL 代码，代码变更由本地 patch 完成。"
      ],
      checkpoints: [
        {
          id: "triangle-vertices",
          title: "定义三角形的三个顶点",
          concept:
            "三角形由三个顶点组成。OpenGL 中 VBO 保存顶点数组，WebGL 实验中 BufferGeometry 的 position attribute 承担同样角色。",
          question:
            "如果一个顶点属性 location 每次读取 3 个 float，那么画一个三角形至少需要多少个 float？为什么？",
          expectedKeywords: ["3", "顶点", "float", "位置", "x", "y", "z"],
          hint: "先数三角形有几个顶点，再看每个顶点的位置由几个分量组成。",
          patchId: "01-triangle-vertices",
          expectedObservation: "预览中出现一个居中的深色三角形。"
        },
        {
          id: "fragment-color",
          title: "让片元着色器输出颜色",
          concept:
            "顶点着色器决定顶点位置，片元着色器决定最终像素颜色。固定颜色输出是理解 fragment shader 的第一步。",
          question:
            "顶点着色器已经决定了三角形的位置，为什么还需要片元着色器输出颜色？",
          expectedKeywords: ["片元", "像素", "颜色", "fragment", "FragColor", "gl_FragColor"],
          hint: "屏幕上每个被三角形覆盖的片元，都需要知道自己应该显示什么颜色。",
          patchId: "02-fragment-color",
          expectedObservation: "三角形变为接近 LearnOpenGL 示例的橙色。"
        },
        {
          id: "vertex-colors",
          title: "把每个顶点的颜色传给片元",
          concept:
            "顶点属性不只可以保存位置，也可以保存颜色。varying 会在光栅化阶段被插值后传入片元着色器。",
          question:
            "如果三个顶点分别有不同颜色，三角形内部的渐变颜色通常是在哪个阶段产生的？",
          expectedKeywords: ["光栅化", "插值", "varying", "顶点", "片元"],
          hint: "片元不是顶点，但它会收到由顶点数据插值得到的值。",
          patchId: "03-vertex-colors",
          expectedObservation: "三角形显示为由三个顶点颜色插值得到的渐变。"
        }
      ]
    },
    null,
    2
  )
);

write(
  "lesson.md",
  `
# Hello Triangle

这个实验从 OpenGLProject 的 \`src/02_hello_triangle\` 提取。网页中不直接运行 C++/OpenGL 代码，而是用 Three.js 和 WebGL shader 表达同样的图形学概念。

目标：

- 理解三角形顶点数据的组织方式。
- 理解顶点着色器与片元着色器的职责。
- 理解顶点属性如何扩展到颜色，并通过 varying 传递到片元阶段。

AI 教学只负责提问、判断和解释；代码修改由本课程包内的预设 patch 完成。
`
);

write(
  "starter/main.js",
  `
// Hello Triangle starter
// 可用对象：THREE, canvas, vertexShader, fragmentShader, report

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true
});

renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0xf8f8f8, 1);

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
camera.position.z = 1;

const positions = new Float32Array([
  // TODO: 三角形需要 3 个顶点，每个顶点 3 个 float。
]);

const geometry = new THREE.BufferGeometry();
geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

const material = new THREE.ShaderMaterial({
  vertexShader,
  fragmentShader,
  side: THREE.DoubleSide
});

const triangle = new THREE.Mesh(geometry, material);
scene.add(triangle);

function resize() {
  const bounds = canvas.parentElement.getBoundingClientRect();
  const width = Math.max(1, Math.floor(bounds.width));
  const height = Math.max(1, Math.floor(bounds.height));
  renderer.setSize(width, height, false);
}

function render() {
  resize();
  renderer.render(scene, camera);
  report({ vertices: positions.length / 3 });
}

window.addEventListener("resize", render);
render();

return () => {
  window.removeEventListener("resize", render);
  geometry.dispose();
  material.dispose();
  renderer.dispose();
};
`
);

write(
  "starter/vertex.glsl",
  `
void main() {
  gl_Position = vec4(position, 1.0);
}
`
);

write(
  "starter/fragment.glsl",
  `
void main() {
  gl_FragColor = vec4(0.13, 0.16, 0.19, 1.0);
}
`
);

write(
  "patches/01-triangle-vertices.json",
  JSON.stringify(
    {
      id: "01-triangle-vertices",
      description: "写入三个裁剪空间顶点，形成一个基础三角形。",
      changes: [
        {
          file: "main.js",
          operation: "replace",
          target:
            "const positions = new Float32Array([\n  // TODO: 三角形需要 3 个顶点，每个顶点 3 个 float。\n]);",
          content:
            "const positions = new Float32Array([\n   0.0,  0.6, 0.0,\n  -0.6, -0.5, 0.0,\n   0.6, -0.5, 0.0\n]);"
        }
      ]
    },
    null,
    2
  )
);

write(
  "patches/02-fragment-color.json",
  JSON.stringify(
    {
      id: "02-fragment-color",
      description: "让片元着色器输出固定橙色。",
      changes: [
        {
          file: "fragment.glsl",
          operation: "replace_all",
          content:
            "void main() {\n  gl_FragColor = vec4(1.0, 0.5, 0.2, 1.0);\n}"
        }
      ]
    },
    null,
    2
  )
);

write(
  "patches/03-vertex-colors.json",
  JSON.stringify(
    {
      id: "03-vertex-colors",
      description: "加入颜色 attribute，并通过 varying 传入 fragment shader。",
      changes: [
        {
          file: "main.js",
          operation: "replace",
          target:
            "const geometry = new THREE.BufferGeometry();\ngeometry.setAttribute(\"position\", new THREE.BufferAttribute(positions, 3));",
          content:
            "const colors = new Float32Array([\n  1.0, 0.2, 0.1,\n  0.0, 0.68, 0.71,\n  0.13, 0.16, 0.19\n]);\n\nconst geometry = new THREE.BufferGeometry();\ngeometry.setAttribute(\"position\", new THREE.BufferAttribute(positions, 3));\ngeometry.setAttribute(\"color\", new THREE.BufferAttribute(colors, 3));"
        },
        {
          file: "vertex.glsl",
          operation: "replace_all",
          content:
            "varying vec3 vColor;\n\nvoid main() {\n  vColor = color;\n  gl_Position = vec4(position, 1.0);\n}"
        },
        {
          file: "fragment.glsl",
          operation: "replace_all",
          content:
            "varying vec3 vColor;\n\nvoid main() {\n  gl_FragColor = vec4(vColor, 1.0);\n}"
        }
      ]
    },
    null,
    2
  )
);

write("reference/main.cpp", originalMain);
write("reference/CMakeLists.txt", originalCmake);
write(
  "reference/source-notes.md",
  `
# OpenGL Source Notes

- 原始入口：\`OpenGLProject/src/02_hello_triangle/main.cpp\`
- 提取状态：${hasShaderProgram ? "包含 shader program 创建与链接" : "未检测到 shader program"}
- 顶点属性：${hasVertexAttribPointer ? "检测到 glVertexAttribPointer，适合讲解 position attribute" : "未检测到 glVertexAttribPointer"}
- 绘制方式：${hasIndexedDraw ? "原始代码使用索引绘制，第一课先压缩为单三角形" : "原始代码未检测到索引绘制"}
- WebGL 实验保留的核心概念：顶点数组、shader program、顶点着色器、片元着色器、draw call。
- WebGL 实验不复刻 GLFW、GLAD、VAO/VBO/EBO 的完整 API，只用 Three.js 提供画布、渲染器和 BufferGeometry。
- 原始代码当前使用 \`glDrawElements(GL_TRIANGLES, 6, ...)\` 绘制矩形；本课程第一课先压缩为一个三角形，后续可以再扩展到 EBO/索引绘制。
 - 本文件只保留教学摘要，不复制 private OpenGL 仓库的完整源码。
`
);

console.log(`Generated graphics lesson: ${lessonRoot}`);
