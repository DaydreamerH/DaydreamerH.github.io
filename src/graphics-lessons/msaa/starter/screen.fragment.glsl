varying vec2 vUv;
uniform float uMode;

float edge(vec2 uv) {
  return uv.y - (0.25 + uv.x * 0.55);
}

void main() {
  float d = edge(vUv);
  float hard = step(0.0, d);
  float smooth = smoothstep(-0.015, 0.015, d);
  float samples = 0.0;
  samples += step(0.0, edge(vUv + vec2(-0.006, -0.006)));
  samples += step(0.0, edge(vUv + vec2( 0.006, -0.004)));
  samples += step(0.0, edge(vUv + vec2(-0.004,  0.006)));
  samples += step(0.0, edge(vUv + vec2( 0.005,  0.005)));
  float coverage = samples * 0.25;
  float mask = mix(hard, smooth, step(0.5, uMode));
  mask = mix(mask, coverage, step(1.5, uMode));
  vec3 a = vec3(0.93);
  vec3 b = vec3(0.0, 0.68, 0.71);
  gl_FragColor = vec4(mix(a, b, mask), 1.0);
}