// Generated CG experiment runtime
// Available objects: THREE, OrbitControls, canvas, files, getFile, report

const sceneConfig = JSON.parse(getFile("scene.json") || "{}");
const geometryConfig = JSON.parse(getFile("geometry.json") || "{}");

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: Boolean(sceneConfig.antialias)
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0xf8f8f8, 1);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(sceneConfig.fov || 45, 1, 0.1, 100);
camera.position.fromArray(sceneConfig.cameraPosition || [2.6, 1.8, 4.2]);
camera.lookAt(...(sceneConfig.lookAt || [0, 0, 0]));

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.target.fromArray(sceneConfig.lookAt || [0, 0, 0]);

function makeFallbackTexture() {
  const texture = new THREE.DataTexture(new Uint8Array([238, 238, 238, 255]), 1, 1, THREE.RGBAFormat);
  texture.needsUpdate = true;
  return texture;
}

function makeTexture(fileName, colorSpace = "srgb") {
  const dataUrl = getFile(fileName);
  const fallback = makeFallbackTexture();
  if (!dataUrl) return fallback;
  const texture = new THREE.TextureLoader().load(dataUrl, () => render());
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = colorSpace === "srgb" ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  return texture;
}

function makeGeometry(config) {
  if (config.type === "plane") {
    const geometry = new THREE.PlaneGeometry(config.width || 3, config.height || 3, config.segments || 1, config.segments || 1);
    if (config.rotateX) geometry.rotateX(config.rotateX);
    return geometry;
  }
  if (config.type === "points") {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(config.positions || []), 3));
    return geometry;
  }
  return new THREE.BoxGeometry(config.size?.[0] || 1, config.size?.[1] || 1, config.size?.[2] || 1);
}

const uniforms = {
  uTime: { value: 0 },
  uMode: { value: Number(sceneConfig.mode || 0) },
  uStrength: { value: Number(sceneConfig.strength ?? 1) },
  uExposure: { value: Number(sceneConfig.exposure ?? 1) },
  uLightPos: { value: new THREE.Vector3(...(sceneConfig.lightPos || [1.2, 1.8, 2.2])) },
  uViewPos: { value: camera.position },
  uWallMap: { value: makeTexture("wall-texture.txt") },
  uWoodMap: { value: makeTexture("wood-texture.txt") },
  uContainerMap: { value: makeTexture("container-texture.txt") },
  uDiffuseMap: { value: makeTexture("diffuse-map.txt") },
  uNormalMap: { value: makeTexture("normal-map.txt", "linear") },
  uHeightMap: { value: makeTexture("height-map.txt", "linear") }
};

const material = new THREE.ShaderMaterial({
  vertexShader: getFile(sceneConfig.vertexShader || "lab.vertex.glsl"),
  fragmentShader: getFile(sceneConfig.fragmentShader || "lab.fragment.glsl"),
  uniforms,
  side: THREE.DoubleSide
});

const geometry = makeGeometry(geometryConfig);
let mesh;
if (geometryConfig.type === "points") {
  mesh = new THREE.Points(geometry, material);
} else {
  mesh = new THREE.Mesh(geometry, material);
}
mesh.rotation.set(...(sceneConfig.rotation || [0, 0, 0]));
mesh.position.set(...(sceneConfig.position || [0, 0, 0]));
scene.add(mesh);

if (sceneConfig.showLight) {
  const lightMarker = new THREE.Mesh(
    new THREE.SphereGeometry(0.08, 18, 18),
    new THREE.MeshBasicMaterial({ color: 0x00adb5 })
  );
  lightMarker.position.copy(uniforms.uLightPos.value);
  scene.add(lightMarker);
}

let frame = 0;
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
  controls.update();
  uniforms.uTime.value = time * 0.001;
  if (sceneConfig.animated) mesh.rotation.y = time * 0.0005;
  renderer.render(scene, camera);
  report({ mode: sceneConfig.label || "advanced", files: Object.keys(files).length });
  frame = requestAnimationFrame(render);
}

frame = requestAnimationFrame(render);

return () => {
  cancelAnimationFrame(frame);
  geometry.dispose();
  material.dispose();
  Object.values(uniforms).forEach((uniform) => uniform.value?.dispose?.());
  renderer.dispose();
};