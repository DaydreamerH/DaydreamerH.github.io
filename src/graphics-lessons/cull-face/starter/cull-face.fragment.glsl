uniform vec3 uColor;
uniform float uBackHint;
varying vec3 vLocalPosition;

void main() {
  vec3 edgeTint = mix(uColor, vec3(1.0), smoothstep(0.35, 0.72, length(vLocalPosition)));
  gl_FragColor = vec4(edgeTint + vec3(uBackHint * 0.12), 1.0);
}
