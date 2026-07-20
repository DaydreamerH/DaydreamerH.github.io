varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorldPosition;
uniform sampler2D uDiffuseMap;
uniform sampler2D uNormalMap;
uniform vec3 uLightPos;
uniform vec3 uViewPos;
uniform float uMode;

void main() {
  vec3 albedo = texture2D(uDiffuseMap, vUv).rgb;
  vec3 baseNormal = normalize(vNormal);
  vec3 tangentNormal = texture2D(uNormalMap, vUv).rgb * 2.0 - 1.0;
  tangentNormal.xy *= mix(0.0, 1.55, step(0.5, uMode));
  vec3 normal = normalize(vec3(tangentNormal.xy, tangentNormal.z));
  normal = normalize(mix(baseNormal, normal, step(0.5, uMode)));
  vec3 lightDir = normalize(uLightPos - vWorldPosition);
  vec3 viewDir = normalize(uViewPos - vWorldPosition);
  vec3 halfDir = normalize(lightDir + viewDir);
  float diff = max(dot(normal, lightDir), 0.0);
  float spec = pow(max(dot(normal, halfDir), 0.0), 48.0) * 0.35;
  vec3 color = albedo * (0.18 + diff * 0.95) + spec;
  gl_FragColor = vec4(color, 1.0);
}