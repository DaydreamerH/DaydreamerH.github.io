// Generated CG experiment runtime
// Available objects: THREE, OrbitControls, canvas, files, getFile, report

const sceneConfig = JSON.parse(getFile("scene.json") || "{}");
const geometryConfig = JSON.parse(getFile("geometry.json") || "{}");

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0xf8f8f8, 1);

const worldScene = new THREE.Scene();
const screenScene = new THREE.Scene();
const screenCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

const cameraConfig = sceneConfig.camera || {};
const camera = new THREE.PerspectiveCamera(cameraConfig.fov || 45, 1, 0.1, 100);
camera.position.fromArray(cameraConfig.position || [2.8, 1.7, 4.2]);
camera.lookAt(...(cameraConfig.lookAt || [0, 0, -0.6]));

let controls = null;
if (typeof OrbitControls === "function") {
  controls = new OrbitControls(camera, canvas);
  controls.target.set(...(cameraConfig.lookAt || [0, 0, -0.6]));
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
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

const sceneVertex = getFile(sceneConfig.material?.vertexShader || "scene.vertex.glsl");
const sceneFragment = getFile(sceneConfig.material?.fragmentShader || "scene.fragment.glsl");
const screenVertex = getFile(sceneConfig.screen?.vertexShader || "screen.vertex.glsl");
const screenFragment = getFile(sceneConfig.screen?.fragmentShader || "screen.fragment.glsl");
if (!sceneVertex || !sceneFragment || !screenVertex || !screenFragment) throw new Error("Framebuffer lesson requires scene and screen shaders.");

const cubeTexture = loadTexture(sceneConfig.textures?.cube || "container-texture.txt");
const floorTexture = loadTexture(sceneConfig.textures?.floor || "wall-texture.txt");

function makeSceneMaterial(texture, tint) {
  return new THREE.ShaderMaterial({
    vertexShader: sceneVertex,
    fragmentShader: sceneFragment,
    uniforms: {
      uTexture: { value: texture },
      uTint: { value: makeColor(tint, [1, 1, 1]) }
    }
  });
}

const cubeMaterial = makeSceneMaterial(cubeTexture, sceneConfig.material?.cubeTint);
const floorMaterial = makeSceneMaterial(floorTexture, sceneConfig.material?.floorTint);
const cubeGeometry = new THREE.BoxGeometry(1, 1, 1);
(geometryConfig.cubes || []).forEach((item) => {
  const mesh = new THREE.Mesh(cubeGeometry, cubeMaterial);
  mesh.position.fromArray(item.position || [0, 0, 0]);
  mesh.rotation.set(...(item.rotation || [0, 0, 0]));
  worldScene.add(mesh);
});

const floor = new THREE.Mesh(new THREE.PlaneGeometry(7, 7), floorMaterial);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.52;
worldScene.add(floor);

let renderTarget = null;
const screenMaterial = new THREE.ShaderMaterial({
  vertexShader: screenVertex,
  fragmentShader: screenFragment,
  depthTest: false,
  depthWrite: false,
  uniforms: {
    uScreenTexture: { value: null },
    uEffect: { value: Number(sceneConfig.screen?.effect ?? 0) }
  }
});
const screenQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), screenMaterial);
screenScene.add(screenQuad);

let animationFrame = 0;
function resize() {
  const bounds = canvas.parentElement.getBoundingClientRect();
  const width = Math.max(1, Math.floor(bounds.width));
  const height = Math.max(1, Math.floor(bounds.height));
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  if (!renderTarget || renderTarget.width !== width || renderTarget.height !== height) {
    renderTarget?.dispose();
    renderTarget = new THREE.WebGLRenderTarget(width, height, { depthBuffer: true });
    screenMaterial.uniforms.uScreenTexture.value = renderTarget.texture;
  }
}

function render() {
  resize();
  controls?.update();
  if (sceneConfig.useFramebuffer) {
    renderer.setRenderTarget(renderTarget);
    renderer.clear();
    renderer.render(worldScene, camera);
    renderer.setRenderTarget(null);
    renderer.render(screenScene, screenCamera);
  } else {
    renderer.setRenderTarget(null);
    renderer.render(worldScene, camera);
  }
  report({ mode: "frame-buffers", framebuffer: Boolean(sceneConfig.useFramebuffer), effect: sceneConfig.screen?.effect ?? 0 });
  animationFrame = requestAnimationFrame(render);
}

animationFrame = requestAnimationFrame(render);

return () => {
  if (animationFrame) cancelAnimationFrame(animationFrame);
  controls?.dispose();
  renderTarget?.dispose();
  cubeGeometry.dispose();
  cubeMaterial.dispose();
  floorMaterial.dispose();
  screenMaterial.dispose();
  cubeTexture?.dispose?.();
  floorTexture?.dispose?.();
  renderer.dispose();
};
