varying vec2 vUv;
uniform vec3 uColor;
uniform vec3 uAccentColor;

void main() {
  vec2 grid = floor(vUv * 8.0);
  float mask = mod(grid.x + grid.y, 2.0);
  gl_FragColor = vec4(mix(uColor, uAccentColor, mask), 1.0);
}
