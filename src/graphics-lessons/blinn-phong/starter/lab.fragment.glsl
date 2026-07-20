varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorldPosition;
uniform sampler2D uWallMap;
uniform vec3 uLightPos;
uniform vec3 uViewPos;
uniform float uMode;

void main() {
  vec3 albedo = texture2D(uWallMap, vUv).rgb;
  vec3 normal = normalize(vNormal);
  vec3 lightDir = normalize(uLightPos - vWorldPosition);
  vec3 viewDir = normalize(uViewPos - vWorldPosition);
  vec3 reflectDir = reflect(-lightDir, normal);
  vec3 halfDir = normalize(lightDir + viewDir);
  float diff = max(dot(normal, lightDir), 0.0);
  float phong = pow(max(dot(viewDir, reflectDir), 0.0), mix(16.0, 96.0, step(1.5, uMode)));
  float blinn = pow(max(dot(normal, halfDir), 0.0), mix(32.0, 128.0, step(1.5, uMode)));
  float spec = mix(phong, blinn, step(0.5, uMode));
  vec3 color = albedo * (0.16 + diff * 0.72) + vec3(1.0, 0.93, 0.82) * spec * 0.65;
  gl_FragColor = vec4(color, 1.0);
}