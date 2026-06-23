uniform vec3 uObjectColor;
uniform vec3 uLightColor;

void main() {
  gl_FragColor = vec4(uObjectColor * uLightColor, 1.0);
}
