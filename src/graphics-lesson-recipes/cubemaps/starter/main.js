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
camera.position.fromArray(cameraConfig.position || [2.4, 1.5, 3.8]);
camera.lookAt(...(cameraConfig.lookAt || [0, 0, 0]));

let controls = null;
if (typeof OrbitControls === "function") {
  controls = new OrbitControls(camera, canvas);
  controls.target.set(...(cameraConfig.lookAt || [0, 0, 0]));
  controls.enableDamping = true;
}

function loadCubeTexture() {
  const faces = sceneConfig.cubemap?.faces || ["right", "left", "top", "bottom", "front", "back"];
  const urls = faces.map((name) => getFile("skybox-" + name + ".txt"));
  const texture = new THREE.CubeTextureLoader().load(urls);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const cubeTexture = loadCubeTexture();
if (sceneConfig.useSceneBackground) scene.background = cubeTexture;

const cubeVertex = getFile(sceneConfig.cubeMaterial?.vertexShader || "cube-reflect.vertex.glsl");
const cubeFragment = getFile(sceneConfig.cubeMaterial?.fragmentShader || "cube-reflect.fragment.glsl");
const skyboxVertex = getFile(sceneConfig.skyboxMaterial?.vertexShader || "skybox.vertex.glsl");
const skyboxFragment = getFile(sceneConfig.skyboxMaterial?.fragmentShader || "skybox.fragment.glsl");
if (!cubeVertex || !cubeFragment || !skyboxVertex || !skyboxFragment) throw new Error("Cubemap lesson requires cube and skybox shaders.");

const cubeMaterial = new THREE.ShaderMaterial({
  vertexShader: cubeVertex,
  fragmentShader: cubeFragment,
  uniforms: {
    uSkybox: { value: cubeTexture },
    uCameraPos: { value: camera.position },
    uReflectAmount: { value: Number(sceneConfig.cubeMaterial?.reflectAmount ?? 0) },
    uBaseColor: { value: new THREE.Color(0.0, 0.68, 0.71) }
  }
});
const cube = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.2), cubeMaterial);
cube.rotation.set(...(geometryConfig.cubeRotation || [0.25, 0.55, 0]));
scene.add(cube);

let skybox = null;
if (sceneConfig.showSkybox) {
  const skyboxMaterial = new THREE.ShaderMaterial({
    vertexShader: skyboxVertex,
    fragmentShader: skyboxFragment,
    uniforms: { uSkybox: { value: cubeTexture } },
    side: THREE.BackSide,
    depthWrite: false
  });
  skybox = new THREE.Mesh(new THREE.BoxGeometry(40, 40, 40), skyboxMaterial);
  skybox.renderOrder = -1;
  scene.add(skybox);
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
  cube.rotation.y += sceneConfig.animated === false ? 0 : 0.004;
  renderer.render(scene, camera);
  report({ mode: "cubemaps", skybox: Boolean(sceneConfig.showSkybox), reflectAmount: cubeMaterial.uniforms.uReflectAmount.value });
  animationFrame = requestAnimationFrame(render);
}

animationFrame = requestAnimationFrame(render);

return () => {
  if (animationFrame) cancelAnimationFrame(animationFrame);
  controls?.dispose();
  cube.geometry.dispose();
  cubeMaterial.dispose();
  skybox?.geometry.dispose();
  skybox?.material.dispose();
  cubeTexture.dispose();
  renderer.dispose();
};
