varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorldPosition;
uniform sampler2D uWallMap;
uniform vec3 uLightPos;
uniform float uMode;

float radialBlocker(vec3 dir) {
  return 1.2 + 0.18 * sin(dir.x * 7.0) + 0.12 * cos(dir.z * 6.0);
}

float pointShadow(vec3 fragToLight) {
  float current = length(fragToLight);
  vec3 dir = normalize(fragToLight);
  float bias = 0.035;
  if (uMode < 1.5) return current - bias > radialBlocker(dir) ? 0.55 : 0.0;
  float shadow = 0.0;
  for (int i = 0; i < 6; i++) {
    vec3 offset = vec3(float(i - 2) * 0.035, float(i % 3 - 1) * 0.025, float(i - 3) * 0.02);
    shadow += current - bias > radialBlocker(normalize(dir + offset)) ? 1.0 : 0.0;
  }
  return shadow / 6.0 * 0.55;
}

void main() {
  vec3 albedo = texture2D(uWallMap, vUv).rgb;
  vec3 fragToLight = vWorldPosition - uLightPos;
  vec3 lightDir = normalize(-fragToLight);
  float diff = max(dot(normalize(vNormal), lightDir), 0.0);
  float attenuation = 1.0 / (1.0 + 0.32 * length(fragToLight) + 0.18 * length(fragToLight) * length(fragToLight));
  float shadow = uMode < 0.5 ? 0.0 : pointShadow(fragToLight);
  vec3 color = albedo * (0.12 + diff * attenuation * (1.0 - shadow) * 2.2);
  gl_FragColor = vec4(color, 1.0);
}