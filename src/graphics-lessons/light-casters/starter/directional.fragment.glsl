uniform sampler2D uDiffuseMap;
uniform sampler2D uSpecularMap;
uniform vec3 uLightColor;
uniform vec3 uLightDirection;
uniform vec3 uViewPos;
uniform vec3 uAmbient;
uniform vec3 uDiffuse;
uniform vec3 uSpecular;
uniform float uShininess;

varying vec3 vWorldPosition;
varying vec3 vNormal;
varying vec2 vUv;

void main() {
  vec3 diffuseColor = texture2D(uDiffuseMap, vUv).rgb;
  vec3 specularMask = texture2D(uSpecularMap, vUv).rgb;

  vec3 ambient = uAmbient * diffuseColor;

  vec3 normal = normalize(vNormal);
  vec3 lightDir = normalize(-uLightDirection);
  float diff = max(dot(normal, lightDir), 0.0);
  vec3 diffuse = uDiffuse * diff * diffuseColor;

  vec3 viewDir = normalize(uViewPos - vWorldPosition);
  vec3 reflectDir = reflect(-lightDir, normal);
  float spec = pow(max(dot(viewDir, reflectDir), 0.0), uShininess);
  vec3 specular = uSpecular * spec * specularMask;

  gl_FragColor = vec4((ambient + diffuse + specular) * uLightColor, 1.0);
}
