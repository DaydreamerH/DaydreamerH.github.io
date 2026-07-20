attribute vec3 instanceColor;
varying vec3 vColor;
uniform float uTime;
uniform float uUseInstanceColor;

void main() {
  vec3 baseColor = mix(vec3(0.0, 0.68, 0.71), instanceColor, uUseInstanceColor);
  vColor = baseColor;
  vec4 world = instanceMatrix * vec4(position, 1.0);
  world.z += sin(world.x * 1.3 + world.y * 1.7 + uTime) * 0.18;
  gl_Position = projectionMatrix * modelViewMatrix * world;
}