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
camera.position.fromArray(cameraConfig.position || [2.5, 1.8, 3.8]);
camera.lookAt(...(cameraConfig.lookAt || [0, 0, 0]));

let controls = null;
if (typeof OrbitControls === "function") {
  controls = new OrbitControls(camera, canvas);
  controls.target.set(...(cameraConfig.lookAt || [0, 0, 0]));
  controls.enableDamping = true;
}

function makeColor(value, fallback) {
  const items = Array.isArray(value) ? value : fallback;
  return new THREE.Color(items[0], items[1], items[2]);
}

const vertexShader = getFile(sceneConfig.material?.vertexShader || "cull-face.vertex.glsl");
const fragmentShader = getFile(sceneConfig.material?.fragmentShader || "cull-face.fragment.glsl");
if (!vertexShader || !fragmentShader) throw new Error("Cull face lesson requires shader files.");

const sideMode = sceneConfig.cullFace === "front" ? THREE.BackSide : sceneConfig.cullFace === "back" ? THREE.FrontSide : THREE.DoubleSide;
const material = new THREE.ShaderMaterial({
  vertexShader,
  fragmentShader,
  uniforms: {
    uColor: { value: makeColor(sceneConfig.material?.color, [0.0, 0.68, 0.71]) },
    uBackHint: { value: Number(sceneConfig.material?.backHint ?? 0) }
  },
  side: sideMode
});
const wireMaterial = new THREE.MeshBasicMaterial({ color: 0x222831, wireframe: true, transparent: true, opacity: 0.18 });

const geometry = new THREE.BoxGeometry(1.45, 1.45, 1.45);
const cube = new THREE.Mesh(geometry, material);
cube.rotation.set(...(geometryConfig.rotation || [0.2, 0.45, 0.0]));
if (sceneConfig.frontFace === "cw") cube.scale.x = -1;
scene.add(cube);

if (sceneConfig.showWireframe !== false) {
  const wire = new THREE.Mesh(geometry, wireMaterial);
  wire.rotation.copy(cube.rotation);
  wire.scale.copy(cube.scale);
  scene.add(wire);
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
  if (sceneConfig.animated) cube.rotation.y += 0.006;
  renderer.render(scene, camera);
  report({ mode: "cull-face", cullFace: sceneConfig.cullFace || "none", frontFace: sceneConfig.frontFace || "ccw" });
  animationFrame = requestAnimationFrame(render);
}

animationFrame = requestAnimationFrame(render);

return () => {
  if (animationFrame) cancelAnimationFrame(animationFrame);
  controls?.dispose();
  geometry.dispose();
  material.dispose();
  wireMaterial.dispose();
  renderer.dispose();
};
