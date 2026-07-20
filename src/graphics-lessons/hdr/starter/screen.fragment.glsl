varying vec2 vUv;
uniform float uMode;
uniform float uExposure;

vec3 sceneColor(vec2 uv) {
  float glow = 3.8 * exp(-42.0 * distance(uv, vec2(0.34, 0.56)));
  float bar = smoothstep(0.02, 0.0, abs(uv.y - 0.36)) * 1.4;
  return vec3(0.08, 0.1, 0.12) + vec3(1.0, 0.76, 0.42) * glow + vec3(0.0, 0.68, 0.71) * bar;
}

void main() {
  vec3 hdr = sceneColor(vUv);
  vec3 ldrClamp = clamp(hdr, 0.0, 1.0);
  vec3 toneMapped = vec3(1.0) - exp(-hdr * uExposure);
  vec3 color = mix(ldrClamp, toneMapped, step(0.5, uMode));
  gl_FragColor = vec4(pow(color, vec3(1.0 / 2.2)), 1.0);
}