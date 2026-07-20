varying vec2 vUv;
uniform float uMode;

vec3 fakePosition(vec2 uv) {
  return vec3((uv - 0.5) * 4.0, sin(uv.x * 8.0) * 0.25 + cos(uv.y * 7.0) * 0.2);
}

vec3 fakeNormal(vec2 uv) {
  return normalize(vec3(sin(uv.x * 9.0) * 0.35, cos(uv.y * 8.0) * 0.35, 1.0));
}

vec3 fakeAlbedo(vec2 uv) {
  return mix(vec3(0.17, 0.2, 0.23), vec3(0.0, 0.68, 0.71), smoothstep(0.2, 0.9, uv.x));
}

void main() {
  vec3 pos = fakePosition(vUv);
  vec3 normal = fakeNormal(vUv);
  vec3 albedo = fakeAlbedo(vUv);
  if (uMode > 0.5 && uMode < 1.5) {
    if (vUv.x < 0.333) gl_FragColor = vec4(pos * 0.18 + 0.5, 1.0);
    else if (vUv.x < 0.666) gl_FragColor = vec4(normal * 0.5 + 0.5, 1.0);
    else gl_FragColor = vec4(albedo, 1.0);
    return;
  }
  vec3 result = albedo * 0.08;
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    vec3 lightPos = vec3(sin(fi * 1.7) * 2.2, cos(fi * 1.1) * 1.5, 1.6);
    vec3 lightColor = 0.42 + 0.58 * vec3(fract(fi * 0.23), fract(fi * 0.37), fract(fi * 0.51));
    vec3 lightDir = normalize(lightPos - pos);
    float dist = length(lightPos - pos);
    float atten = 1.0 / (1.0 + 0.7 * dist + 0.3 * dist * dist);
    result += albedo * lightColor * max(dot(normal, lightDir), 0.0) * atten * 2.2;
  }
  gl_FragColor = vec4(result, 1.0);
}