// Hello Triangle starter
// 可用对象：THREE, canvas, vertexShader, fragmentShader, report

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true
});

renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0xf8f8f8, 1);

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
camera.position.z = 1;

const positions = new Float32Array([
  // TODO: 三角形需要 3 个顶点，每个顶点 3 个 float。
]);

const geometry = new THREE.BufferGeometry();
geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

const material = new THREE.ShaderMaterial({
  vertexShader,
  fragmentShader,
  side: THREE.DoubleSide
});

const triangle = new THREE.Mesh(geometry, material);
scene.add(triangle);

function resize() {
  const bounds = canvas.parentElement.getBoundingClientRect();
  const width = Math.max(1, Math.floor(bounds.width));
  const height = Math.max(1, Math.floor(bounds.height));
  renderer.setSize(width, height, false);
}

function render() {
  resize();
  renderer.render(scene, camera);
  report({ vertices: positions.length / 3 });
}

window.addEventListener("resize", render);
render();

return () => {
  window.removeEventListener("resize", render);
  geometry.dispose();
  material.dispose();
  renderer.dispose();
};
