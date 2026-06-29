// Generated CG experiment runtime
// Available objects: THREE, OrbitControls, canvas, files, getFile, report

const sceneConfig = JSON.parse(getFile("scene.json") || "{}");
const geometryConfig = JSON.parse(getFile("geometry.json") || "{}");

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0xf8f8f8, 1);

const scene = new THREE.Scene();
const clock = new THREE.Clock();

function makeColor(value, fallback) {
  const items = Array.isArray(value) ? value : fallback;
  return new THREE.Color(items[0], items[1], items[2]);
}

function makeVector(value, fallback) {
  const items = Array.isArray(value) ? value : fallback;
  return new THREE.Vector3(items[0], items[1], items[2]);
}

function createTexture(fileName) {
  const source = getFile(fileName);
  if (!source) return null;
  const texture = new THREE.TextureLoader().load(source);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function buildGeometry(config) {
  if (config.type === "box") {
    const size = Array.isArray(config.size) ? config.size : [1, 1, 1];
    return new THREE.BoxGeometry(size[0], size[1], size[2]);
  }
  const geometry = new THREE.BufferGeometry();
  const attributes = config.attributes || {};
  Object.entries(attributes).forEach(([name, attribute]) => {
    geometry.setAttribute(name, new THREE.BufferAttribute(new Float32Array(attribute.values || []), attribute.itemSize || 3));
  });
  if (Array.isArray(config.index)) geometry.setIndex(config.index);
  return geometry;
}

const cameraConfig = sceneConfig.camera || {};
const camera = new THREE.PerspectiveCamera(cameraConfig.fov || 45, 1, 0.1, 100);
camera.position.fromArray(cameraConfig.position || [3.4, 2.2, 5.2]);
camera.lookAt(...(cameraConfig.lookAt || [0, 0.2, -2]));

const textureConfig = sceneConfig.textures || {};
const diffuseMap = createTexture(textureConfig.diffuse || "");
const specularMap = createTexture(textureConfig.specular || "");
const uniformConfig = sceneConfig.uniforms || {};
const lightPos = makeVector(uniformConfig.uLightPos, [1.2, 1, 2]);
const spotDirection = makeVector(uniformConfig.uSpotDirection, [-0.45, -0.2, -1]).normalize();

const uniforms = {
  uDiffuseMap: { value: diffuseMap },
  uSpecularMap: { value: specularMap },
  uLightColor: { value: makeColor(uniformConfig.uLightColor, [1, 1, 1]) },
  uLightDirection: { value: makeVector(uniformConfig.uLightDirection, [-0.2, -1, -0.3]).normalize() },
  uLightPos: { value: lightPos },
  uSpotDirection: { value: spotDirection },
  uViewPos: { value: camera.position },
  uAmbient: { value: makeColor(uniformConfig.uAmbient, [0.2, 0.2, 0.2]) },
  uDiffuse: { value: makeColor(uniformConfig.uDiffuse, [0.5, 0.5, 0.5]) },
  uSpecular: { value: makeColor(uniformConfig.uSpecular, [1, 1, 1]) },
  uConstant: { value: Number(uniformConfig.uConstant ?? 1) },
  uLinear: { value: Number(uniformConfig.uLinear ?? 0.09) },
  uQuadratic: { value: Number(uniformConfig.uQuadratic ?? 0.032) },
  uCutOff: { value: Number(uniformConfig.uCutOff ?? 0.976296) },
  uOuterCutOff: { value: Number(uniformConfig.uOuterCutOff ?? 0.953717) },
  uShininess: { value: Number(uniformConfig.uShininess ?? 32) }
};

const materialConfig = sceneConfig.material || {};
const activeVertexShader = getFile(materialConfig.vertexShader || "");
const activeFragmentShader = getFile(materialConfig.fragmentShader || "");
if (!activeVertexShader || !activeFragmentShader) {
  throw new Error("scene.json must provide material.vertexShader and material.fragmentShader.");
}

const cubeMaterial = new THREE.ShaderMaterial({
  vertexShader: activeVertexShader,
  fragmentShader: activeFragmentShader,
  uniforms
});

const geometry = buildGeometry(geometryConfig);
const meshConfig = sceneConfig.mesh || {};
const instances = Array.isArray(geometryConfig.instances) ? geometryConfig.instances : [{ position: [0, 0, 0] }];
const cubes = instances.map((item, index) => {
  const mesh = new THREE.Mesh(geometry, cubeMaterial);
  const position = Array.isArray(item.position) ? item.position : [0, 0, 0];
  const rotation = Array.isArray(item.rotation) ? item.rotation : [0, 0, 0];
  mesh.position.set(position[0] || 0, position[1] || 0, position[2] || 0);
  mesh.rotation.set(rotation[0] || 0, rotation[1] || 0, rotation[2] || 0);
  mesh.scale.setScalar(Number(item.scale || meshConfig.scale || 1));
  mesh.userData.spinSeed = index + 1;
  scene.add(mesh);
  return mesh;
});

const disposableMaterials = [cubeMaterial];
const disposableTextures = [diffuseMap, specularMap].filter(Boolean);
let markerGeometry = null;
let lightMarker = null;

const lightConfig = sceneConfig.lightMarker || {};
if (lightConfig.enabled) {
  const lightVertexShader = getFile(lightConfig.vertexShader || "");
  const lightFragmentShader = getFile(lightConfig.fragmentShader || "");
  if (!lightVertexShader || !lightFragmentShader) {
    throw new Error("lightMarker requires vertexShader and fragmentShader files when enabled.");
  }
  const lightMarkerMaterial = new THREE.ShaderMaterial({
    vertexShader: lightVertexShader,
    fragmentShader: lightFragmentShader,
    uniforms
  });
  disposableMaterials.push(lightMarkerMaterial);
  markerGeometry = new THREE.SphereGeometry(Number(lightConfig.radius || 0.09), 16, 16);
  lightMarker = new THREE.Mesh(markerGeometry, lightMarkerMaterial);
  lightMarker.position.copy(lightPos);
  scene.add(lightMarker);
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
  const elapsed = clock.getElapsedTime();
  if (sceneConfig.animated) {
    cubes.forEach((mesh) => {
      mesh.rotation.y += 0.004 * mesh.userData.spinSeed;
      mesh.rotation.x += 0.0015;
    });
  }
  if (sceneConfig.mode === "spot") {
    const base = makeVector(uniformConfig.uSpotDirection, [-0.45, -0.2, -1]).normalize();
    uniforms.uSpotDirection.value.copy(base);
    if (sceneConfig.animated) {
      uniforms.uSpotDirection.value.x += Math.sin(elapsed * 0.7) * 0.18;
      uniforms.uSpotDirection.value.normalize();
    }
  }
  if (lightMarker) lightMarker.position.copy(uniforms.uLightPos.value);

  renderer.render(scene, camera);
  report({
    shape: sceneConfig.shape || "multi-cube",
    mode: sceneConfig.mode || "directional",
    cubeCount: cubes.length,
    diffuseMap: Boolean(diffuseMap),
    specularMap: Boolean(specularMap),
    attenuation: sceneConfig.mode !== "directional",
    spotCone: sceneConfig.mode === "spot"
  });
  animationFrame = requestAnimationFrame(render);
}

animationFrame = requestAnimationFrame(render);

return () => {
  if (animationFrame) cancelAnimationFrame(animationFrame);
  geometry.dispose();
  if (markerGeometry) markerGeometry.dispose();
  disposableMaterials.forEach((item) => item.dispose());
  disposableTextures.forEach((item) => item.dispose());
  renderer.dispose();
};
