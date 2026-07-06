uniform vec3 uColor;
uniform float uDepthTint;
varying vec3 vWorldPosition;

void main() {
  float depthHint = smoothstep(-5.0, 2.0, -vWorldPosition.z);
  vec3 tint = mix(uColor, vec3(0.0, 0.68, 0.71), uDepthTint * depthHint);
  gl_FragColor = vec4(tint, 1.0);
}
