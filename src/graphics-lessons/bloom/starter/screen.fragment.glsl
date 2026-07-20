varying vec2 vUv;
uniform float uMode;

vec3 baseScene(vec2 uv) {
  float lampA = 5.0 * exp(-80.0 * distance(uv, vec2(0.3, 0.58)));
  float lampB = 2.8 * exp(-110.0 * distance(uv, vec2(0.7, 0.43)));
  return vec3(0.06, 0.07, 0.08) + vec3(1.0, 0.78, 0.42) * lampA + vec3(0.0, 0.68, 0.71) * lampB;
}

vec3 blurBright(vec2 uv, float radius) {
  vec3 sum = vec3(0.0);
  float weight = 0.0;
  for (int x = -4; x <= 4; x++) {
    for (int y = -4; y <= 4; y++) {
      vec2 offset = vec2(float(x), float(y)) * radius;
      vec3 c = baseScene(uv + offset);
      float bright = max(max(c.r, c.g), c.b);
      vec3 brightColor = bright > 1.0 ? c : vec3(0.0);
      float w = exp(-float(x * x + y * y) * 0.12);
      sum += brightColor * w;
      weight += w;
    }
  }
  return sum / weight;
}

void main() {
  vec3 sceneColor = baseScene(vUv);
  vec3 bloom = blurBright(vUv, mix(0.005, 0.014, step(1.5, uMode)));
  vec3 hdr = sceneColor + bloom * step(0.5, uMode);
  vec3 mapped = vec3(1.0) - exp(-hdr * 0.85);
  gl_FragColor = vec4(pow(mapped, vec3(1.0 / 2.2)), 1.0);
}