uniform sampler2D uDiffuseMap;
uniform sampler2D uSpecularMap;
uniform int uUseDirLight;
uniform int uUsePointLights;
uniform int uUseSpotLight;
uniform vec3 uViewPos;
uniform vec3 uAmbientBase;
uniform float uShininess;

uniform vec3 uDirDirection;
uniform vec3 uDirAmbient;
uniform vec3 uDirDiffuse;
uniform vec3 uDirSpecular;

uniform vec3 uPointPositions[4];
uniform vec3 uPointAmbient[4];
uniform vec3 uPointDiffuse[4];
uniform vec3 uPointSpecular[4];
uniform float uPointConstant[4];
uniform float uPointLinear[4];
uniform float uPointQuadratic[4];

uniform vec3 uSpotPosition;
uniform vec3 uSpotDirection;
uniform vec3 uSpotAmbient;
uniform vec3 uSpotDiffuse;
uniform vec3 uSpotSpecular;
uniform float uSpotConstant;
uniform float uSpotLinear;
uniform float uSpotQuadratic;
uniform float uSpotCutOff;
uniform float uSpotOuterCutOff;

varying vec3 vWorldPosition;
varying vec3 vNormal;
varying vec2 vUv;

vec3 applyLight(vec3 lightDir, vec3 ambientStrength, vec3 diffuseStrength, vec3 specularStrength, vec3 normal, vec3 viewDir, vec3 diffuseColor, vec3 specularMask) {
  float diff = max(dot(normal, lightDir), 0.0);
  vec3 reflectDir = reflect(-lightDir, normal);
  float spec = pow(max(dot(viewDir, reflectDir), 0.0), uShininess);
  vec3 ambient = ambientStrength * diffuseColor;
  vec3 diffuse = diffuseStrength * diff * diffuseColor;
  vec3 specular = specularStrength * spec * specularMask;
  return ambient + diffuse + specular;
}

vec3 calcDirectional(vec3 normal, vec3 viewDir, vec3 diffuseColor, vec3 specularMask) {
  vec3 lightDir = normalize(-uDirDirection);
  return applyLight(lightDir, uDirAmbient, uDirDiffuse, uDirSpecular, normal, viewDir, diffuseColor, specularMask);
}

vec3 calcPoint(int index, vec3 normal, vec3 viewDir, vec3 diffuseColor, vec3 specularMask) {
  vec3 delta = uPointPositions[index] - vWorldPosition;
  float distanceToLight = length(delta);
  vec3 lightDir = normalize(delta);
  float attenuation = 1.0 / (
    uPointConstant[index] +
    uPointLinear[index] * distanceToLight +
    uPointQuadratic[index] * distanceToLight * distanceToLight
  );
  return applyLight(lightDir, uPointAmbient[index], uPointDiffuse[index], uPointSpecular[index], normal, viewDir, diffuseColor, specularMask) * attenuation;
}

vec3 calcSpot(vec3 normal, vec3 viewDir, vec3 diffuseColor, vec3 specularMask) {
  vec3 delta = uSpotPosition - vWorldPosition;
  float distanceToLight = length(delta);
  vec3 lightDir = normalize(delta);
  float theta = dot(lightDir, normalize(-uSpotDirection));
  float epsilon = max(uSpotCutOff - uSpotOuterCutOff, 0.0001);
  float intensity = clamp((theta - uSpotOuterCutOff) / epsilon, 0.0, 1.0);
  float attenuation = 1.0 / (uSpotConstant + uSpotLinear * distanceToLight + uSpotQuadratic * distanceToLight * distanceToLight);
  return applyLight(lightDir, uSpotAmbient, uSpotDiffuse, uSpotSpecular, normal, viewDir, diffuseColor, specularMask) * attenuation * intensity;
}

void main() {
  vec3 diffuseColor = texture2D(uDiffuseMap, vUv).rgb;
  vec3 specularMask = texture2D(uSpecularMap, vUv).rgb;
  vec3 normal = normalize(vNormal);
  vec3 viewDir = normalize(uViewPos - vWorldPosition);

  vec3 result = uAmbientBase * diffuseColor;
  if (uUseDirLight == 1) {
    result += calcDirectional(normal, viewDir, diffuseColor, specularMask);
  }
  if (uUsePointLights == 1) {
    result += calcPoint(0, normal, viewDir, diffuseColor, specularMask);
    result += calcPoint(1, normal, viewDir, diffuseColor, specularMask);
    result += calcPoint(2, normal, viewDir, diffuseColor, specularMask);
    result += calcPoint(3, normal, viewDir, diffuseColor, specularMask);
  }
  if (uUseSpotLight == 1) {
    result += calcSpot(normal, viewDir, diffuseColor, specularMask);
  }

  gl_FragColor = vec4(result, 1.0);
}
