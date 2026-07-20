varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorldPosition;
uniform sampler2D uWallMap;
uniform vec3 uLightPos;
uniform float uMode;

float blockerDepth(vec2 uv) {
  return 0.48 + 0.16 * sin(uv.x * 10.0) * cos(uv.y * 8.0);
}

float shadowTest(vec2 uv, float currentDepth) {
  float bias = 0.018;
  if (uMode < 1.5) {
    return currentDepth > blockerDepth(uv) + bias ? 0.55 : 0.0;
  }
  float sum = 0.0;
  for (int x = -1; x <= 1; x++) {
    for (int y = -1; y <= 1; y++) {
      vec2 offset = vec2(float(x), float(y)) * 0.012;
      sum += currentDepth > blockerDepth(uv + offset) + bias ? 1.0 : 0.0;
    }
  }
  return sum / 9.0 * 0.55;
}

void main() {
  vec3 albedo = texture2D(uWallMap, vUv).rgb;
  vec3 lightDir = normalize(uLightPos - vWorldPosition);
  float diff = max(dot(normalize(vNormal), lightDir), 0.0);
  vec2 lightUv = vUv * 0.72 + vec2(0.12, 0.08);
  float currentDepth = lightUv.y + 0.08 * sin(lightUv.x * 8.0);
  float shadow = uMode < 0.5 ? 0.0 : shadowTest(lightUv, currentDepth);
  vec3 color = albedo * (0.18 + diff * (1.0 - shadow));
  gl_FragColor = vec4(color, 1.0);
}