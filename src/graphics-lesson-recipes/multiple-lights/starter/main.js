// Generated CG experiment runtime
// Available objects: THREE, OrbitControls, canvas, files, getFile, report

const sceneConfig = JSON.parse(getFile("scene.json") || "{}");
const geometryConfig = JSON.parse(getFile("geometry.json") || "{}");

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0xf8f8f8, 1);

const scene = new THREE.Scene();
const clock = new THREE.Clock();

function makeColor(value, fallback) {
  const items = Array.isArray(value) ? value : fallback;
  return new THREE.Color(items[0], items[1], items[2]);
}

function makeVector(value, fallback) {
  const items = Array.isArray(value) ? value : fallback;
  return new THREE.Vector3(items[0], items[1], items[2]);
}

function createTexture(fileName) {
  const source = getFile(fileName);
  if (!source) return null;
  const texture = new THREE.TextureLoader().load(source);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const cameraConfig = sceneConfig.camera || {};
const camera = new THREE.PerspectiveCamera(cameraConfig.fov || 45, 1, 0.1, 100);
camera.position.fromArray(cameraConfig.position || [4.2, 2.8, 6.4]);
camera.lookAt(...(cameraConfig.lookAt || [0.2, 0.2, -2.8]));

let controls = null;
if (typeof OrbitControls === "function") {
  controls = new OrbitControls(camera, canvas);
  controls.target.set(...(cameraConfig.lookAt || [0.2, 0.2, -2.8]));
  controls.enableDamping = true;
}

const textureConfig = sceneConfig.textures || {};
const diffuseMap = createTexture(textureConfig.diffuse || "");
const specularMap = createTexture(textureConfig.specular || "");
const lightConfig = sceneConfig.lights || {};
const pointLights = (lightConfig.pointLights || []).slice(0, 4);
while (pointLights.length < 4) {
  pointLights.push({ position: [0, 0, 0], ambient: [0, 0, 0], diffuse: [0, 0, 0], specular: [0, 0, 0] });
}

const spotLight = lightConfig.spotLight || {};
const uniforms = {
  uDiffuseMap: { value: diffuseMap },
  uSpecularMap: { value: specularMap },
  uUseDirLight: { value: lightConfig.useDirLight ? 1 : 0 },
  uUsePointLights: { value: lightConfig.usePointLights ? 1 : 0 },
  uUseSpotLight: { value: lightConfig.useSpotLight ? 1 : 0 },
  uViewPos: { value: camera.position },
  uAmbientBase: { value: makeColor(lightConfig.ambientBase, [0.12, 0.12, 0.12]) },
  uDirDirection: { value: makeVector(lightConfig.dirLight?.direction, [-0.2, -1, -0.3]).normalize() },
  uDirAmbient: { value: makeColor(lightConfig.dirLight?.ambient, [0.05, 0.05, 0.05]) },
  uDirDiffuse: { value: makeColor(lightConfig.dirLight?.diffuse, [0.4, 0.4, 0.4]) },
  uDirSpecular: { value: makeColor(lightConfig.dirLight?.specular, [0.5, 0.5, 0.5]) },
  uPointPositions: { value: pointLights.map((item) => makeVector(item.position, [0, 0, 0])) },
  uPointAmbient: { value: pointLights.map((item) => makeColor(item.ambient, [0.05, 0.05, 0.05])) },
  uPointDiffuse: { value: pointLights.map((item) => makeColor(item.diffuse, [0.8, 0.8, 0.8])) },
  uPointSpecular: { value: pointLights.map((item) => makeColor(item.specular, [1, 1, 1])) },
  uPointConstant: { value: pointLights.map((item) => Number(item.constant ?? 1)) },
  uPointLinear: { value: pointLights.map((item) => Number(item.linear ?? 0.09)) },
  uPointQuadratic: { value: pointLights.map((item) => Number(item.quadratic ?? 0.032)) },
  uSpotPosition: { value: makeVector(spotLight.position, camera.position.toArray()) },
  uSpotDirection: { value: makeVector(spotLight.direction, [-0.35, -0.25, -1]).normalize() },
  uSpotAmbient: { value: makeColor(spotLight.ambient, [0, 0, 0]) },
  uSpotDiffuse: { value: makeColor(spotLight.diffuse, [1, 1, 1]) },
  uSpotSpecular: { value: makeColor(spotLight.specular, [1, 1, 1]) },
  uSpotConstant: { value: Number(spotLight.constant ?? 1) },
  uSpotLinear: { value: Number(spotLight.linear ?? 0.09) },
  uSpotQuadratic: { value: Number(spotLight.quadratic ?? 0.032) },
  uSpotCutOff: { value: Number(spotLight.cutOff ?? 0.976296) },
  uSpotOuterCutOff: { value: Number(spotLight.outerCutOff ?? 0.953717) },
  uShininess: { value: Number(sceneConfig.material?.shininess ?? 32) }
};

const activeVertexShader = getFile(sceneConfig.material?.vertexShader || "");
const activeFragmentShader = getFile(sceneConfig.material?.fragmentShader || "");
if (!activeVertexShader || !activeFragmentShader) {
  throw new Error("scene.json must provide material.vertexShader and material.fragmentShader.");
}

const cubeMaterial = new THREE.ShaderMaterial({
  vertexShader: activeVertexShader,
  fragmentShader: activeFragmentShader,
  uniforms
});

const geometry = new THREE.BoxGeometry(1, 1, 1);
const instances = Array.isArray(geometryConfig.instances) ? geometryConfig.instances : [{ position: [0, 0, 0] }];
const cubes = instances.map((item, index) => {
  const mesh = new THREE.Mesh(geometry, cubeMaterial);
  const position = Array.isArray(item.position) ? item.position : [0, 0, 0];
  const rotation = Array.isArray(item.rotation) ? item.rotation : [0, 0, 0];
  mesh.position.set(position[0] || 0, position[1] || 0, position[2] || 0);
  mesh.rotation.set(rotation[0] || 0, rotation[1] || 0, rotation[2] || 0);
  mesh.scale.setScalar(Number(item.scale || 1));
  mesh.userData.spinSeed = index + 1;
  scene.add(mesh);
  return mesh;
});

const markerGeometry = new THREE.SphereGeometry(0.09, 16, 16);
const markerMaterials = [];
if (lightConfig.showPointMarkers && lightConfig.usePointLights) {
  pointLights.forEach((light, index) => {
    const material = new THREE.MeshBasicMaterial({ color: makeColor(light.diffuse, [1, 1, 1]) });
    markerMaterials.push(material);
    const marker = new THREE.Mesh(markerGeometry, material);
    marker.position.copy(uniforms.uPointPositions.value[index]);
    scene.add(marker);
  });
}
if (lightConfig.showSpotMarker && lightConfig.useSpotLight) {
  const material = new THREE.MeshBasicMaterial({ color: 0xeeeeee });
  markerMaterials.push(material);
  const marker = new THREE.Mesh(markerGeometry, material);
  marker.position.copy(uniforms.uSpotPosition.value);
  scene.add(marker);
}

let animationFrame = 0;

function resize() {
  const bounds = canvas.parentElement.getBoundingClientRect();
  const width = Math.max(1, Math.floor(bounds.width));
  const height = Math.max(1, Math.floor(bounds.height));
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function render() {
  resize();
  const seconds = clock.getElapsedTime();
  if (sceneConfig.animated) {
    cubes.forEach((mesh) => {
      mesh.rotation.y += 0.0025 * mesh.userData.spinSeed;
      mesh.rotation.x = Math.sin(seconds * 0.45 + mesh.userData.spinSeed) * 0.12;
    });
  }
  controls?.update();
  renderer.render(scene, camera);
  report({
    mode: sceneConfig.mode || "multiple-lights",
    cubes: cubes.length,
    dirLight: Boolean(lightConfig.useDirLight),
    pointLights: lightConfig.usePointLights ? 4 : 0,
    spotLight: Boolean(lightConfig.useSpotLight)
  });
  animationFrame = requestAnimationFrame(render);
}

animationFrame = requestAnimationFrame(render);

return () => {
  if (animationFrame) cancelAnimationFrame(animationFrame);
  controls?.dispose();
  geometry.dispose();
  markerGeometry.dispose();
  cubeMaterial.dispose();
  markerMaterials.forEach((item) => item.dispose());
  [diffuseMap, specularMap].filter(Boolean).forEach((item) => item.dispose());
  renderer.dispose();
};
