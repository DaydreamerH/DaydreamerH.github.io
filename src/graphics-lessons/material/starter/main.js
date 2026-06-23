// Generated CG experiment runtime
// Available objects: THREE, canvas, vertexShader, fragmentShader, report

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0xf8f8f8, 1);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45.0, 1, 0.1, 100);
camera.position.set(2.400, 1.800, 4.200);
camera.lookAt(0, 0, 0);

const geometry = new THREE.BoxGeometry(1, 1, 1);

const uniforms = {
  uColor: { value: new THREE.Color(0.130, 0.160, 0.190) },
  uAccentColor: { value: new THREE.Color(0.420, 0.480, 0.520) },
  uObjectColor: { value: new THREE.Color(0.950, 0.480, 0.200) },
  uLightColor: { value: new THREE.Color(1.000, 1.000, 1.000) },
  uLightPos: { value: new THREE.Vector3(1.500, 1.800, 2.200) },
  uViewPos: { value: camera.position },
  uMixAmount: { value: 0.35 },
  uAmbientStrength: { value: 0.18 },
  uSpecularStrength: { value: 0.45 },
  uShininess: { value: 32.0 }
};

const material = new THREE.ShaderMaterial({
  vertexShader,
  fragmentShader,
  uniforms,
  side: THREE.DoubleSide
});

const meshes = [];
for (let index = 0; index < 1; index += 1) {
  const mesh = new THREE.Mesh(geometry, material);
  const offset = index - (1 - 1) / 2;
  mesh.position.set(offset * 1.45, 0, 0);
  mesh.rotation.set(0.350, 0.550, 0.000);
  mesh.scale.setScalar(1.00);
  scene.add(mesh);
  meshes.push(mesh);
}



let animationFrame = 0;

function resize() {
  const bounds = canvas.parentElement.getBoundingClientRect();
  const width = Math.max(1, Math.floor(bounds.width));
  const height = Math.max(1, Math.floor(bounds.height));
  renderer.setSize(width, height, false);
  if (camera.isPerspectiveCamera) {
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
}

function render(time = 0) {
  resize();
  const seconds = time * 0.001;
  
  renderer.render(scene, camera);
  report({ shape: "cube", mode: "ambient", objects: meshes.length });
  
}

render();

return () => {
  if (animationFrame) cancelAnimationFrame(animationFrame);
  geometry.dispose();
  material.dispose();
  renderer.dispose();
};
