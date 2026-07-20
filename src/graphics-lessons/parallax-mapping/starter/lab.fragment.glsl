varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorldPosition;
uniform sampler2D uDiffuseMap;
uniform sampler2D uNormalMap;
uniform sampler2D uHeightMap;
uniform vec3 uLightPos;
uniform vec3 uViewPos;
uniform float uMode;

vec2 parallaxUv(vec2 uv, vec3 viewDir) {
  float height = texture2D(uHeightMap, uv).r;
  float scale = mix(0.0, 0.08, step(0.5, uMode));
  vec2 offset = viewDir.xy / max(viewDir.z, 0.22) * (height - 0.5) * scale;
  if (uMode > 1.5) {
    float layers = 8.0;
    vec2 stepUv = offset / layers;
    vec2 current = uv;
    for (int i = 0; i < 8; i++) {
      current -= stepUv;
      float sampleHeight = texture2D(uHeightMap, current).r;
      if (sampleHeight < float(i) / layers) break;
    }
    return current;
  }
  return uv - offset;
}

void main() {
  vec3 viewDir = normalize(uViewPos - vWorldPosition);
  vec2 uv = parallaxUv(vUv, viewDir);
  vec3 albedo = texture2D(uDiffuseMap, uv).rgb;
  vec3 tangentNormal = texture2D(uNormalMap, uv).rgb * 2.0 - 1.0;
  vec3 normal = normalize(mix(normalize(vNormal), tangentNormal, 0.85));
  vec3 lightDir = normalize(uLightPos - vWorldPosition);
  float diff = max(dot(normal, lightDir), 0.0);
  gl_FragColor = vec4(albedo * (0.2 + diff * 0.95), 1.0);
}