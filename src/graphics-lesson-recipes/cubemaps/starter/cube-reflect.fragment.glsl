uniform samplerCube uSkybox;
uniform vec3 uCameraPos;
uniform float uReflectAmount;
uniform vec3 uBaseColor;
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;

void main() {
  vec3 I = normalize(vWorldPosition - uCameraPos);
  vec3 R = reflect(I, normalize(vWorldNormal));
  vec3 envColor = textureCube(uSkybox, R).rgb;
  vec3 color = mix(uBaseColor, envColor, uReflectAmount);
  gl_FragColor = vec4(color, 1.0);
}
