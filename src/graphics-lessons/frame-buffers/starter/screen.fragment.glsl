uniform sampler2D uScreenTexture;
uniform float uEffect;
varying vec2 vUv;

void main() {
  vec3 color = texture2D(uScreenTexture, vUv).rgb;
  if (uEffect > 1.5) {
    float gray = dot(color, vec3(0.2126, 0.7152, 0.0722));
    color = vec3(gray);
  } else if (uEffect > 0.5) {
    color = vec3(1.0) - color;
  }
  gl_FragColor = vec4(color, 1.0);
}
