// Generated CG experiment runtime
// Available objects: THREE, OrbitControls, canvas, files, getFile, report

const sceneConfig = JSON.parse(getFile("scene.json") || "{}");
const geometryConfig = JSON.parse(getFile("geometry.json") || "{}");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0xf8f8f8, 1);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
camera.position.set(0, 2.5, 8);
camera.lookAt(0, 0, 0);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;

const geometry = new THREE.BoxGeometry(0.28, 0.28, 0.28);
const material = new THREE.ShaderMaterial({
  vertexShader: getFile("instancing.vertex.glsl"),
  fragmentShader: getFile("instancing.fragment.glsl"),
  uniforms: {
    uTime: { value: 0 },
    uUseInstanceColor: { value: Number(sceneConfig.useInstanceColor || 0) }
  }
});

const count = Number(sceneConfig.count || 16);
const mesh = new THREE.InstancedMesh(geometry, material, count);
const matrix = new THREE.Matrix4();
const color = new THREE.Color();
const colors = [];
const grid = Math.ceil(Math.sqrt(count));
for (let i = 0; i < count; i += 1) {
  const x = (i % grid) - (grid - 1) * 0.5;
  const y = Math.floor(i / grid) - (grid - 1) * 0.5;
  matrix.makeTranslation(x * 0.55, y * 0.55, 0);
  mesh.setMatrixAt(i, matrix);
  color.setHSL(i / Math.max(1, count), 0.45, 0.55);
  colors.push(color.r, color.g, color.b);
}
mesh.geometry.setAttribute("instanceColor", new THREE.InstancedBufferAttribute(new Float32Array(colors), 3));
scene.add(mesh);

let frame = 0;
function resize() {
  const bounds = canvas.parentElement.getBoundingClientRect();
  renderer.setSize(Math.max(1, bounds.width), Math.max(1, bounds.height), false);
  camera.aspect = Math.max(1, bounds.width) / Math.max(1, bounds.height);
  camera.updateProjectionMatrix();
}
function render(time = 0) {
  resize();
  controls.update();
  material.uniforms.uTime.value = time * 0.001;
  mesh.rotation.y = time * 0.00035;
  renderer.render(scene, camera);
  report({ instances: count, mode: sceneConfig.label || "instancing" });
  frame = requestAnimationFrame(render);
}
frame = requestAnimationFrame(render);
return () => {
  cancelAnimationFrame(frame);
  geometry.dispose();
  material.dispose();
  renderer.dispose();
};