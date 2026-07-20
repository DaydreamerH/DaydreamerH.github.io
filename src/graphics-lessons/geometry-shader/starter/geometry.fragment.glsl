uniform float uMode;

void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float circle = smoothstep(1.0, 0.86, dot(p, p));
  float diamond = smoothstep(0.88, 0.74, abs(p.x) + abs(p.y));
  float mask = mix(circle, diamond, step(1.5, uMode));
  vec3 color = mix(vec3(0.13, 0.16, 0.19), vec3(0.0, 0.68, 0.71), mask);
  gl_FragColor = vec4(color, mask);
}