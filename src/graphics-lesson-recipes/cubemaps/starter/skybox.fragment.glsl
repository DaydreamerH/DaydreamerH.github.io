uniform samplerCube uSkybox;
varying vec3 vDirection;

void main() {
  gl_FragColor = textureCube(uSkybox, normalize(vDirection));
}
