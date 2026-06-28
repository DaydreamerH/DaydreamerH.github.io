// Generated CG experiment runtime
// Available objects: THREE, OrbitControls, canvas, files, getFile, report

const sceneConfig = JSON.parse(getFile("scene.json") || "{}");
const geometryConfig = JSON.parse(getFile("geometry.json") || "{}");

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0xf8f8f8, 1);

const scene = new THREE.Scene();

const cameraConfig = sceneConfig.camera || {};
const camera = new THREE.PerspectiveCamera(cameraConfig.fov || 45, 1, 0.1, 100);
camera.position.fromArray(cameraConfig.position || [2.4, 1.8, 4.2]);
camera.lookAt(...(cameraConfig.lookAt || [0, 0, 0]));

function makeColor(value, fallback) {
  const items = Array.isArray(value) ? value : fallback;
  return new THREE.Color(items[0], items[1], items[2]);
}

function makeVector(value, fallback) {
  const items = Array.isArray(value) ? value : fallback;
  return new THREE.Vector3(items[0], items[1], items[2]);
}

function buildGeometry(config) {
  if (config.type === "box") {
    const size = Array.isArray(config.size) ? config.size : [1, 1, 1];
    return new THREE.BoxGeometry(size[0], size[1], size[2]);
  }
  const geometry = new THREE.BufferGeometry();
  const attributes = config.attributes || {};
  Object.entries(attributes).forEach(([name, attribute]) => {
    geometry.setAttribute(name, new THREE.BufferAttribute(new Float32Array(attribute.values || []), attribute.itemSize || 3));
  });
  if (Array.isArray(config.index)) geometry.setIndex(config.index);
  return geometry;
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

const geometry = buildGeometry(geometryConfig);
const uniformConfig = sceneConfig.uniforms || {};
const textureConfig = sceneConfig.textures || {};
const diffuseMap = createTexture(textureConfig.diffuse || "");
const specularMap = createTexture(textureConfig.specular || "");

const uniforms = {
  uDiffuseMap: { value: diffuseMap },
  uSpecularMap: { value: specularMap },
  uDiffuseEnabled: { value: diffuseMap ? 1 : 0 },
  uSpecularEnabled: { value: specularMap ? 1 : 0 },
  uBaseColor: { value: makeColor(uniformConfig.uBaseColor, [0.95, 0.48, 0.2]) },
  uLightColor: { value: makeColor(uniformConfig.uLightColor, [1, 1, 1]) },
  uLightPos: { value: makeVector(uniformConfig.uLightPos, [1.2, 1, 2]) },
  uViewPos: { value: camera.position },
  uAmbientStrength: { value: Number(uniformConfig.uAmbientStrength ?? 0.34) },
  uSpecularStrength: { value: Number(uniformConfig.uSpecularStrength ?? 1.25) },
  uShininess: { value: Number(uniformConfig.uShininess ?? 44) }
};

const materialConfig = sceneConfig.material || {};
const activeVertexShader = getFile(materialConfig.vertexShader || "");
const activeFragmentShader = getFile(materialConfig.fragmentShader || "");
if (!activeVertexShader || !activeFragmentShader) {
  throw new Error("scene.json must provide material.vertexShader and material.fragmentShader that map to starter files.");
}

const material = new THREE.ShaderMaterial({
  vertexShader: activeVertexShader,
  fragmentShader: activeFragmentShader,
  uniforms
});
const disposableMaterials = [material];
const disposableTextures = [diffuseMap, specularMap].filter(Boolean);

const meshConfig = sceneConfig.mesh || {};
const mesh = new THREE.Mesh(geometry, material);
const rotation = Array.isArray(meshConfig.rotation) ? meshConfig.rotation : [0.35, 0.55, 0];
mesh.rotation.set(rotation[0] || 0, rotation[1] || 0, rotation[2] || 0);
mesh.scale.setScalar(Number(meshConfig.scale || 1));
scene.add(mesh);

const lightConfig = sceneConfig.lightMarker || {};
if (lightConfig.enabled) {
  const lightVertexShader = getFile(lightConfig.vertexShader || "");
  const lightFragmentShader = getFile(lightConfig.fragmentShader || "");
  if (!lightVertexShader || !lightFragmentShader) {
    throw new Error("lightMarker requires vertexShader and fragmentShader files when enabled.");
  }
  const lightMarkerMaterial = new THREE.ShaderMaterial({
    vertexShader: lightVertexShader,
    fragmentShader: lightFragmentShader,
    uniforms
  });
  disposableMaterials.push(lightMarkerMaterial);
  const lightMarker = new THREE.Mesh(
    new THREE.SphereGeometry(Number(lightConfig.radius || 0.08), 16, 16),
    lightMarkerMaterial
  );
  lightMarker.position.copy(uniforms.uLightPos.value);
  scene.add(lightMarker);
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

function render(time = 0) {
  resize();
  const seconds = time * 0.001;
  if (sceneConfig.animated) {
    mesh.rotation.y = seconds * 0.65;
    mesh.rotation.x = 0.35;
  }
  renderer.render(scene, camera);
  report({
    shape: sceneConfig.shape || "cube",
    mode: sceneConfig.mode || "lighting-maps",
    diffuseMap: Boolean(diffuseMap),
    specularMap: Boolean(specularMap)
  });
  if (sceneConfig.animated) animationFrame = requestAnimationFrame(render);
}

if (sceneConfig.animated) {
  animationFrame = requestAnimationFrame(render);
} else {
  render();
}

return () => {
  if (animationFrame) cancelAnimationFrame(animationFrame);
  geometry.dispose();
  disposableMaterials.forEach((item) => item.dispose());
  disposableTextures.forEach((item) => item.dispose());
  renderer.dispose();
};
