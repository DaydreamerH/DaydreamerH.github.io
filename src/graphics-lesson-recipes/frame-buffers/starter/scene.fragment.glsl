uniform sampler2D uTexture;
uniform vec3 uTint;
varying vec2 vUv;

void main() {
  vec4 texColor = texture2D(uTexture, vUv);
  gl_FragColor = vec4(texColor.rgb * uTint, 1.0);
}
