// Generated CG experiment runtime
// Available objects: THREE, OrbitControls, canvas, files, getFile, report

const sceneConfig = JSON.parse(getFile("scene.json") || "{}");
const geometryConfig = JSON.parse(getFile("geometry.json") || "{}");

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0xf8f8f8, 1);
renderer.sortObjects = true;

const scene = new THREE.Scene();
const cameraConfig = sceneConfig.camera || {};
const camera = new THREE.PerspectiveCamera(cameraConfig.fov || 45, 1, 0.1, 100);
camera.position.fromArray(cameraConfig.position || [0, 1.2, 4.2]);
camera.lookAt(...(cameraConfig.lookAt || [0, 0.2, -0.7]));

let controls = null;
if (typeof OrbitControls === "function") {
  controls = new OrbitControls(camera, canvas);
  controls.target.set(...(cameraConfig.lookAt || [0, 0.2, -0.7]));
  controls.enableDamping = true;
}

function makeColor(value, fallback) {
  const items = Array.isArray(value) ? value : fallback;
  return new THREE.Color(items[0], items[1], items[2]);
}

function loadTexture(fileName) {
  const source = getFile(fileName);
  if (!source) return null;
  const texture = new THREE.TextureLoader().load(source);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

const planeMaterial = new THREE.MeshBasicMaterial({
  color: makeColor(sceneConfig.plane?.color, [0.68, 0.68, 0.68]),
  side: THREE.DoubleSide
});
const plane = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), planeMaterial);
plane.rotation.x = -Math.PI / 2;
plane.position.y = -0.55;
scene.add(plane);

const vertexShader = getFile(sceneConfig.material?.vertexShader || "blending.vertex.glsl");
const fragmentShader = getFile(sceneConfig.material?.fragmentShader || "alpha-blend.fragment.glsl");
if (!vertexShader || !fragmentShader) throw new Error("Blending lesson requires vertex and fragment shaders.");

const textureFile = sceneConfig.material?.texture || "window-texture.txt";
const transparentTexture = loadTexture(textureFile);
const transparentMaterial = new THREE.ShaderMaterial({
  vertexShader,
  fragmentShader,
  uniforms: {
    uTexture: { value: transparentTexture },
    uDiscardThreshold: { value: Number(sceneConfig.material?.discardThreshold ?? -1) },
    uTint: { value: makeColor(sceneConfig.material?.tint, [1, 1, 1]) }
  },
  transparent: Boolean(sceneConfig.material?.transparent),
  depthTest: true,
  depthWrite: sceneConfig.material?.depthWrite !== false,
  side: THREE.DoubleSide
});

const quadGeometry = new THREE.PlaneGeometry(1, 1);
const quads = (geometryConfig.quads || []).map((item) => {
  const mesh = new THREE.Mesh(quadGeometry, transparentMaterial);
  const position = Array.isArray(item.position) ? item.position : [0, 0, 0];
  mesh.position.set(position[0] || 0, position[1] || 0, position[2] || 0);
  mesh.scale.set(item.scale?.[0] || 1, item.scale?.[1] || 1, item.scale?.[2] || 1);
  scene.add(mesh);
  return mesh;
});

function updateTransparentOrder() {
  if (!sceneConfig.sortBackToFront) {
    quads.forEach((mesh, index) => { mesh.renderOrder = index; });
    return;
  }
  const ranked = quads
    .map((mesh) => ({ mesh, distance: camera.position.distanceTo(mesh.position) }))
    .sort((a, b) => b.distance - a.distance);
  ranked.forEach((item, index) => { item.mesh.renderOrder = index; });
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
  controls?.update();
  updateTransparentOrder();
  renderer.render(scene, camera);
  report({
    mode: sceneConfig.mode || "blending",
    transparent: Boolean(sceneConfig.material?.transparent),
    depthWrite: transparentMaterial.depthWrite,
    sorted: Boolean(sceneConfig.sortBackToFront)
  });
  animationFrame = requestAnimationFrame(render);
}

animationFrame = requestAnimationFrame(render);

return () => {
  if (animationFrame) cancelAnimationFrame(animationFrame);
  controls?.dispose();
  plane.geometry.dispose();
  quadGeometry.dispose();
  planeMaterial.dispose();
  transparentMaterial.dispose();
  transparentTexture?.dispose?.();
  renderer.dispose();
};
