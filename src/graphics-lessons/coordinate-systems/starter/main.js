// Generated CG experiment runtime
// Available objects: THREE, OrbitControls, canvas, files, getFile, report

const sceneConfig = JSON.parse(getFile("scene.json") || "{}");
const geometryConfig = JSON.parse(getFile("geometry.json") || "{}");

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0xf8f8f8, 1);

const scene = new THREE.Scene();

const cameraConfig = sceneConfig.camera || {};
const camera = cameraConfig.type === "perspective"
  ? new THREE.PerspectiveCamera(cameraConfig.fov || 45, 1, 0.1, 100)
  : new THREE.OrthographicCamera(-1.4, 1.4, 1.1, -1.1, 0.1, 20);
camera.position.fromArray(cameraConfig.position || [0, 0, 3]);
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

const geometry = buildGeometry(geometryConfig);

const uniformConfig = sceneConfig.uniforms || {};
const uniforms = {
  uColor: { value: makeColor(uniformConfig.uColor, [0.13, 0.16, 0.19]) },
  uAccentColor: { value: makeColor(uniformConfig.uAccentColor, [0.42, 0.48, 0.52]) },
  uObjectColor: { value: makeColor(uniformConfig.uObjectColor, [0.95, 0.48, 0.2]) },
  uLightColor: { value: makeColor(uniformConfig.uLightColor, [1, 1, 1]) },
  uLightPos: { value: makeVector(uniformConfig.uLightPos, [1.5, 1.8, 2.2]) },
  uViewPos: { value: camera.position },
  uMixAmount: { value: Number(uniformConfig.uMixAmount ?? 0.35) },
  uAmbientStrength: { value: Number(uniformConfig.uAmbientStrength ?? 0.18) },
  uSpecularStrength: { value: Number(uniformConfig.uSpecularStrength ?? 0.45) },
  uShininess: { value: Number(uniformConfig.uShininess ?? 32) }
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
  uniforms,
  side: THREE.DoubleSide
});
const disposableMaterials = [material];

const meshConfig = sceneConfig.mesh || {};
const objectCount = Math.max(1, Number(meshConfig.count || 1));
const rotation = Array.isArray(meshConfig.rotation) ? meshConfig.rotation : [0, 0, 0];
const meshes = [];
for (let index = 0; index < objectCount; index += 1) {
  const mesh = new THREE.Mesh(geometry, material);
  const offset = index - (objectCount - 1) / 2;
  mesh.position.set(offset * 1.45, 0, objectCount > 1 ? -Math.abs(offset) * 0.35 : 0);
  mesh.rotation.set(rotation[0] || 0, rotation[1] || 0, rotation[2] || 0);
  mesh.scale.setScalar(Number(meshConfig.scale || 1));
  scene.add(mesh);
  meshes.push(mesh);
}

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
  uniforms,
  side: THREE.DoubleSide
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
  if (camera.isPerspectiveCamera) {
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
}

function render(time = 0) {
  resize();
  const seconds = time * 0.001;
  if (sceneConfig.animated) {
    meshes.forEach((mesh, index) => {
      mesh.rotation.y = seconds * 0.75 + index * 0.4;
      mesh.rotation.x = 0.35;
    });
  }
  renderer.render(scene, camera);
  report({ shape: sceneConfig.shape || "custom", mode: sceneConfig.mode || "solid", objects: meshes.length });
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
  renderer.dispose();
};
