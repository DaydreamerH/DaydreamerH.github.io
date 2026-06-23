varying vec3 vNormal;
varying vec3 vWorldPosition;
uniform vec3 uObjectColor;
uniform vec3 uLightColor;
uniform vec3 uLightPos;
uniform float uAmbientStrength;

void main() {
  vec3 ambient = uAmbientStrength * uLightColor;
  vec3 normal = normalize(vNormal);
  vec3 lightDir = normalize(uLightPos - vWorldPosition);
  float diff = max(dot(normal, lightDir), 0.0);
  vec3 diffuse = diff * uLightColor;
  gl_FragColor = vec4((ambient + diffuse) * uObjectColor, 1.0);
}
