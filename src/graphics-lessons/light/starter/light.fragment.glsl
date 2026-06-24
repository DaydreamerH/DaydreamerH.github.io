uniform vec3 uLightColor;

void main() {
  gl_FragColor = vec4(uLightColor, 1.0);
}
