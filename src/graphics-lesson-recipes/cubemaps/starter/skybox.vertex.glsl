varying vec3 vDirection;

void main() {
  vDirection = position;
  mat4 viewNoTranslation = mat4(mat3(viewMatrix));
  vec4 pos = projectionMatrix * viewNoTranslation * vec4(position, 1.0);
  gl_Position = pos.xyww;
}
