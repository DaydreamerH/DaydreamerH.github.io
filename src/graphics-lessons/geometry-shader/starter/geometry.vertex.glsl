uniform float uMode;

void main() {
  float size = mix(12.0, 72.0, step(0.5, uMode));
  gl_PointSize = size;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}