uniform vec3 uObjectColor;
uniform vec3 uLightColor;
uniform float uAmbientStrength;

void main() {
  vec3 ambient = uAmbientStrength * uLightColor;
  gl_FragColor = vec4(ambient * uObjectColor, 1.0);
}
