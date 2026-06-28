uniform sampler2D uDiffuseMap;
uniform sampler2D uSpecularMap;
uniform float uDiffuseEnabled;
uniform float uSpecularEnabled;
uniform vec3 uBaseColor;
uniform vec3 uLightColor;
uniform vec3 uLightPos;
uniform vec3 uViewPos;
uniform float uAmbientStrength;
uniform float uSpecularStrength;
uniform float uShininess;

varying vec3 vWorldPosition;
varying vec3 vNormal;
varying vec2 vUv;

void main() {
  vec3 diffuseColor = mix(uBaseColor, texture2D(uDiffuseMap, vUv).rgb, uDiffuseEnabled);

  vec3 ambient = uAmbientStrength * uLightColor * diffuseColor;

  vec3 normal = normalize(vNormal);
  vec3 lightDir = normalize(uLightPos - vWorldPosition);
  float diff = max(dot(normal, lightDir), 0.0);
  vec3 diffuse = diff * uLightColor * diffuseColor;

  vec3 viewDir = normalize(uViewPos - vWorldPosition);
  vec3 reflectDir = reflect(-lightDir, normal);
  float spec = pow(max(dot(viewDir, reflectDir), 0.0), uShininess);
  vec3 specularMask = mix(vec3(1.0), texture2D(uSpecularMap, vUv).rgb, uSpecularEnabled);
  vec3 specular = uSpecularStrength * spec * uLightColor * specularMask;

  gl_FragColor = vec4(ambient + diffuse + specular, 1.0);
}
