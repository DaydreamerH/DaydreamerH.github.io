varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorldPosition;
uniform sampler2D uWallMap;
uniform vec3 uLightPos;
uniform float uMode;

void main() {
  vec3 encoded = texture2D(uWallMap, vUv).rgb;
  vec3 albedo = mix(encoded, pow(encoded, vec3(2.2)), step(1.5, uMode));
  vec3 normal = normalize(vNormal);
  float diff = max(dot(normal, normalize(uLightPos - vWorldPosition)), 0.0);
  vec3 linearColor = albedo * (0.08 + diff * 1.2);
  vec3 mapped = mix(linearColor, pow(linearColor, vec3(1.0 / 2.2)), step(0.5, uMode));
  gl_FragColor = vec4(mapped, 1.0);
}