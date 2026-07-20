varying vec2 vUv;
uniform float uMode;

float depthField(vec2 uv) {
  float mound = exp(-18.0 * distance(uv, vec2(0.5, 0.48)));
  float groove = exp(-120.0 * abs(uv.y - 0.48)) * smoothstep(0.18, 0.82, uv.x) * smoothstep(0.88, 0.62, uv.x);
  return 0.55 - mound * 0.22 + groove * 0.16;
}

float occlusion(vec2 uv) {
  float center = depthField(uv);
  float occ = 0.0;
  for (int i = 0; i < 10; i++) {
    float a = float(i) * 2.39996;
    vec2 dir = vec2(cos(a), sin(a));
    float sampleDepth = depthField(uv + dir * 0.045);
    occ += sampleDepth < center - 0.015 ? 1.0 : 0.0;
  }
  return occ / 10.0;
}

void main() {
  float depth = depthField(vUv);
  vec3 base = mix(vec3(0.88), vec3(0.0, 0.68, 0.71), smoothstep(0.38, 0.72, depth));
  float ao = uMode < 0.5 ? 0.0 : occlusion(vUv);
  if (uMode > 1.5) {
    ao = (ao + occlusion(vUv + vec2(0.012, 0.0)) + occlusion(vUv - vec2(0.012, 0.0))) / 3.0;
  }
  vec3 color = base * (1.0 - ao * 0.55);
  gl_FragColor = vec4(color, 1.0);
}