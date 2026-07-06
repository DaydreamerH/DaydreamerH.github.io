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
camera.position.fromArray(cameraConfig.position || [3.0, 2.1, 4.6]);
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

function makeMaterial(config, fallbackColor, depthTest = true) {
  const vertexShader = getFile(sceneConfig.material?.vertexShader || "stencil.vertex.glsl");
  const fragmentShader = getFile(sceneConfig.material?.fragmentShader || "stencil.fragment.glsl");
  if (!vertexShader || !fragmentShader) throw new Error("Stencil lesson requires shader files.");
  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uColor: { value: makeColor(config?.color, fallbackColor) },
      uAlpha: { value: Number(config?.alpha ?? 1) }
    },
    depthTest,
    depthWrite: depthTest,
    transparent: Number(config?.alpha ?? 1) < 1
  });
}

const planeMaterial = makeMaterial(sceneConfig.planeMaterial, [0.65, 0.65, 0.65], true);
const cubeMaterial = makeMaterial(sceneConfig.cubeMaterial, [0.13, 0.16, 0.19], true);
const outlineMaterial = makeMaterial(sceneConfig.outlineMaterial, [0.0, 0.68, 0.71], false);
outlineMaterial.side = THREE.BackSide;

const plane = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), planeMaterial);
plane.rotation.x = -Math.PI / 2;
plane.position.y = -0.52;
scene.add(plane);

const cubeGeometry = new THREE.BoxGeometry(1, 1, 1);
const instances = Array.isArray(geometryConfig.cubes) ? geometryConfig.cubes : [];
const cubes = [];
const outlines = [];

instances.forEach((item) => {
  const position = Array.isArray(item.position) ? item.position : [0, 0, 0];
  const rotation = Array.isArray(item.rotation) ? item.rotation : [0, 0, 0];
  const cube = new THREE.Mesh(cubeGeometry, cubeMaterial);
  cube.position.set(position[0] || 0, position[1] || 0, position[2] || 0);
  cube.rotation.set(rotation[0] || 0, rotation[1] || 0, rotation[2] || 0);
  scene.add(cube);
  cubes.push(cube);

  if (sceneConfig.outlinePass?.enabled) {
    const outline = new THREE.Mesh(cubeGeometry, outlineMaterial);
    outline.position.copy(cube.position);
    outline.rotation.copy(cube.rotation);
    outline.scale.setScalar(Number(sceneConfig.outlinePass.scale || 1.08));
    outline.renderOrder = 2;
    scene.add(outline);
    outlines.push(outline);
  }
});

if (sceneConfig.maskPreview?.enabled) {
  const maskMaterial = makeMaterial(sceneConfig.maskPreview, [0.0, 0.68, 0.71], false);
  maskMaterial.transparent = true;
  maskMaterial.depthWrite = false;
  instances.forEach((item) => {
    const position = Array.isArray(item.position) ? item.position : [0, 0, 0];
    const rotation = Array.isArray(item.rotation) ? item.rotation : [0, 0, 0];
    const mask = new THREE.Mesh(cubeGeometry, maskMaterial);
    mask.position.set(position[0] || 0, position[1] || 0, position[2] || 0);
    mask.rotation.set(rotation[0] || 0, rotation[1] || 0, rotation[2] || 0);
    mask.scale.setScalar(Number(sceneConfig.maskPreview.scale || 1.01));
    scene.add(mask);
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
    mode: sceneConfig.mode || "stencil-testing",
    outline: Boolean(sceneConfig.outlinePass?.enabled),
    outlineScale: sceneConfig.outlinePass?.scale || 1
  });
  animationFrame = requestAnimationFrame(render);
}

animationFrame = requestAnimationFrame(render);

return () => {
  if (animationFrame) cancelAnimationFrame(animationFrame);
  controls?.dispose();
  plane.geometry.dispose();
  cubeGeometry.dispose();
  [planeMaterial, cubeMaterial, outlineMaterial].forEach((item) => item.dispose());
  renderer.dispose();
};
