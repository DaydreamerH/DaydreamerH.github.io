varying vec2 vUv;
uniform vec3 uColor;
uniform vec3 uAccentColor;

void main() {
  vec2 grid = floor(vUv * 4.0);
  float mask = mod(grid.x + grid.y, 2.0);
  vec3 calmBase = mix(uColor, vec3(0.88), 0.18);
  vec3 calmAccent = mix(uColor, uAccentColor, 0.32);
  gl_FragColor = vec4(mix(calmBase, calmAccent, mask), 1.0);
}
