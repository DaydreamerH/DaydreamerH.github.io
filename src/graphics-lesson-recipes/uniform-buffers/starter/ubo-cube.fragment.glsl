uniform vec3 uSharedColor;
uniform vec3 uLocalColor;
uniform int uUseSharedColor;

void main() {
  vec3 color = uUseSharedColor == 1 ? uSharedColor : uLocalColor;
  gl_FragColor = vec4(color, 1.0);
}
