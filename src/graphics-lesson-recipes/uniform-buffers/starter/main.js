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
camera.position.fromArray(cameraConfig.position || [3.2, 2.0, 4.8]);
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

const vertexShader = getFile(sceneConfig.material?.vertexShader || "ubo-cube.vertex.glsl");
const fragmentShader = getFile(sceneConfig.material?.fragmentShader || "ubo-cube.fragment.glsl");
if (!vertexShader || !fragmentShader) throw new Error("Uniform buffer lesson requires shader files.");

const sharedColorUniform = { value: makeColor(sceneConfig.sharedColor, [0.0, 0.68, 0.71]) };
const useSharedColor = { value: sceneConfig.useSharedColor ? 1 : 0 };
const geometry = new THREE.BoxGeometry(0.85, 0.85, 0.85);

(geometryConfig.cubes || []).slice(0, sceneConfig.cubeCount || 1).forEach((item) => {
  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uSharedColor: sharedColorUniform,
      uLocalColor: { value: makeColor(item.color, [0.13, 0.16, 0.19]) },
      uUseSharedColor: useSharedColor
    }
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.fromArray(item.position || [0, 0, 0]);
  mesh.rotation.set(...(item.rotation || [0, 0, 0]));
  scene.add(mesh);
});

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
  scene.traverse((object) => {
    if (object.isMesh && sceneConfig.animated) object.rotation.y += 0.004;
  });
  renderer.render(scene, camera);
  report({ mode: "uniform-buffers", cubeCount: sceneConfig.cubeCount || 1, sharedColor: Boolean(sceneConfig.useSharedColor) });
  animationFrame = requestAnimationFrame(render);
}

animationFrame = requestAnimationFrame(render);

return () => {
  if (animationFrame) cancelAnimationFrame(animationFrame);
  controls?.dispose();
  geometry.dispose();
  scene.traverse((object) => { object.material?.dispose?.(); });
  renderer.dispose();
};
