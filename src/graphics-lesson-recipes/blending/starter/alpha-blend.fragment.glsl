uniform sampler2D uTexture;
uniform float uDiscardThreshold;
uniform vec3 uTint;
varying vec2 vUv;

void main() {
  vec4 texColor = texture2D(uTexture, vUv);
  if (uDiscardThreshold >= 0.0 && texColor.a < uDiscardThreshold) {
    discard;
  }
  gl_FragColor = vec4(texColor.rgb * uTint, texColor.a);
}
