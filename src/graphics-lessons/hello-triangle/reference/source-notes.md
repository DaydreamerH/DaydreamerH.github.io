# OpenGL Source Notes

- 原始入口：`OpenGLProject/src/02_hello_triangle/main.cpp`
- 提取状态：包含 shader program 创建与链接
- 顶点属性：检测到 glVertexAttribPointer，适合讲解 position attribute
- 绘制方式：原始代码使用索引绘制，第一课先压缩为单三角形
- WebGL 实验保留的核心概念：顶点数组、shader program、顶点着色器、片元着色器、draw call。
- WebGL 实验不复刻 GLFW、GLAD、VAO/VBO/EBO 的完整 API，只用 Three.js 提供画布、渲染器和 BufferGeometry。
- 原始代码当前使用 `glDrawElements(GL_TRIANGLES, 6, ...)` 绘制矩形；本课程第一课先压缩为一个三角形，后续可以再扩展到 EBO/索引绘制。
 - 本文件只保留教学摘要，不复制 private OpenGL 仓库的完整源码。
