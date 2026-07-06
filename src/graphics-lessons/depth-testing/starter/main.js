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
camera.position.fromArray(cameraConfig.position || [2.6, 2.0, 4.2]);
camera.lookAt(...(cameraConfig.lookAt || [0.2, 0.1, -0.8]));

let controls = null;
if (typeof OrbitControls === "function") {
  controls = new OrbitControls(camera, canvas);
  controls.target.set(...(cameraConfig.lookAt || [0.2, 0.1, -0.8]));
  controls.enableDamping = true;
}

function makeColor(value, fallback) {
  const items = Array.isArray(value) ? value : fallback;
  return new THREE.Color(items[0], items[1], items[2]);
}

function makeMaterial(config, fallbackColor, depthEnabled) {
  const vertexShader = getFile(sceneConfig.material?.vertexShader || "depth.vertex.glsl");
  const fragmentShader = getFile(sceneConfig.material?.fragmentShader || "depth.fragment.glsl");
  if (!vertexShader || !fragmentShader) throw new Error("Depth testing lesson requires shader files.");
  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uColor: { value: makeColor(config?.color, fallbackColor) },
      uDepthTint: { value: Number(config?.depthTint ?? 0) }
    },
    depthTest: depthEnabled,
    depthWrite: depthEnabled,
    transparent: Boolean(config?.transparent),
    opacity: Number(config?.opacity ?? 1)
  });
}

const depthEnabled = sceneConfig.depthTest !== false;
const planeMaterial = makeMaterial(sceneConfig.planeMaterial, [0.72, 0.72, 0.72], depthEnabled);
const cubeMaterial = makeMaterial(sceneConfig.cubeMaterial, [0.13, 0.16, 0.19], depthEnabled);
const backCubeMaterial = makeMaterial(sceneConfig.backCubeMaterial, [0.0, 0.68, 0.71], depthEnabled);

const plane = new THREE.Mesh(
  new THREE.PlaneGeometry(8, 8),
  planeMaterial
);
plane.rotation.x = -Math.PI / 2;
plane.position.y = -0.52;
scene.add(plane);

const instances = Array.isArray(geometryConfig.cubes) ? geometryConfig.cubes : [];
const cubeGeometry = new THREE.BoxGeometry(1, 1, 1);
const cubes = instances.map((item, index) => {
  const material = index === 0 ? cubeMaterial : backCubeMaterial;
  const cube = new THREE.Mesh(cubeGeometry, material);
  const position = Array.isArray(item.position) ? item.position : [0, 0, 0];
  const rotation = Array.isArray(item.rotation) ? item.rotation : [0, 0, 0];
  cube.position.set(position[0] || 0, position[1] || 0, position[2] || 0);
  cube.rotation.set(rotation[0] || 0, rotation[1] || 0, rotation[2] || 0);
  cube.renderOrder = Number(item.renderOrder || index);
  scene.add(cube);
  return cube;
});

if (sceneConfig.drawBackCubeFirst) {
  cubes.forEach((cube, index) => {
    cube.renderOrder = index === 0 ? 2 : 1;
  });
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
  renderer.render(scene, camera);
  report({
    mode: sceneConfig.mode || "depth-testing",
    depthTest: depthEnabled,
    drawOrder: sceneConfig.drawBackCubeFirst ? "back-first" : "front-first"
  });
  animationFrame = requestAnimationFrame(render);
}

animationFrame = requestAnimationFrame(render);

return () => {
  if (animationFrame) cancelAnimationFrame(animationFrame);
  controls?.dispose();
  plane.geometry.dispose();
  cubeGeometry.dispose();
  [planeMaterial, cubeMaterial, backCubeMaterial].forEach((item) => item.dispose());
  renderer.dispose();
};
