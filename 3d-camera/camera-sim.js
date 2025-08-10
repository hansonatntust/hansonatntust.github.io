import * as THREE from 'https://unpkg.com/three@0.158.0/build/three.module.js';
import { OrbitControls } from 'https://unpkg.com/three@0.158.0/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'https://unpkg.com/three@0.158.0/examples/jsm/loaders/GLTFLoader.js';

// Status: initialize DOM hooks and base state
const ui = {
  moveStyle: document.getElementById('moveStyle'),
  shotSize: document.getElementById('shotSize'),
  angle: document.getElementById('angle'),
  playPause: document.getElementById('playPause'),
  reset: document.getElementById('reset'),
  showHelpers: document.getElementById('showHelpers'),
  duration: document.getElementById('duration'),
  durationVal: document.getElementById('durationVal'),
  focal: document.getElementById('focal'),
  focalVal: document.getElementById('focalVal'),
  builtinObject: document.getElementById('builtinObject'),
  modelFile: document.getElementById('modelFile'),
  modelScale: document.getElementById('modelScale'),
  modelScaleVal: document.getElementById('modelScaleVal'),
};

const canvases = {
  omniscient: document.getElementById('omniscient'),
  film: document.getElementById('film'),
};

// Utilities
const deg = (r) => (r * 180) / Math.PI;
const rad = (d) => (d * Math.PI) / 180;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const easeInOut = (t) => 0.5 * (1 - Math.cos(Math.PI * t));

function focalToVFovDeg(focalMm) {
  // Approximate mapping assuming 35mm full-frame with 24mm film height.
  // three.js PerspectiveCamera uses vertical FOV in degrees.
  const filmHeightMm = 24;
  const vfov = 2 * Math.atan(filmHeightMm / (2 * focalMm));
  return deg(vfov);
}

// Core scene shared by both views
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0f17);

// Lights
const ambient = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambient);
const dir = new THREE.DirectionalLight(0xffffff, 1.0);
dir.position.set(5, 10, 4);
scene.add(dir);

// Ground and helpers
const grid = new THREE.GridHelper(40, 40, 0x114488, 0x112233);
scene.add(grid);
const axes = new THREE.AxesHelper(1.5);
scene.add(axes);

// Target object in center (simple mannequin-like)
const target = new THREE.Group();
scene.add(target);
const matBody = new THREE.MeshStandardMaterial({ color: 0x8aa0ff, roughness: 0.5, metalness: 0.1 });
const matAccent = new THREE.MeshStandardMaterial({ color: 0xffc857, roughness: 0.6, metalness: 0.05 });

const base = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.8, 0.2, 24), matAccent);
base.position.y = 0.1;
const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.45, 1.1, 8, 16), matBody);
torso.position.y = 1.2;
const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 24, 16), matBody);
head.position.y = 2.05;
const nose = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), new THREE.MeshStandardMaterial({ color: 0xff7b7b }));
nose.position.set(0, 2.05, 0.26);

const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.2, 12), new THREE.MeshStandardMaterial({ color: 0x777777 }));
stand.position.set(-0.75, 0.6, -0.75);

const card = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.6, 0.4), new THREE.MeshStandardMaterial({ color: 0x99aabb }));
card.position.set(-0.75, 1.1, -0.75);
card.rotation.y = rad(30);

const lookAtPos = new THREE.Vector3(0, 1.7, 0);

[base, torso, head, nose, stand, card].forEach((o) => target.add(o));

// Built-in mannequin parts reference
const mannequinParts = [base, torso, head, nose, stand, card];
let primitiveMesh = null; // for built-in primitives
let loadedModel = null;   // for GLTF/GLB model

function clearTargetChildren() {
  // remove all children but do not dispose materials/geometries of mannequin
  while (target.children.length) target.remove(target.children[0]);
}

function restOnGround() {
  // Place target so its bounding box min.y == 0
  const box = new THREE.Box3().setFromObject(target);
  if (isFinite(box.min.y)) {
    target.position.y -= box.min.y;
  }
}

function updateLookAtFromTarget() {
  const box = new THREE.Box3().setFromObject(target);
  const size = new THREE.Vector3();
  box.getSize(size);
  const headish = Math.max(0.8, box.min.y + size.y * 0.6);
  lookAtPos.set(0, headish, 0);
}

function setMannequin() {
  clearTargetChildren();
  mannequinParts.forEach((o) => target.add(o));
  if (primitiveMesh) { primitiveMesh.geometry?.dispose?.(); primitiveMesh.material?.dispose?.(); primitiveMesh = null; }
  loadedModel = null;
  target.scale.set(1,1,1);
  target.position.set(0,0,0);
  restOnGround();
  updateLookAtFromTarget();
  updatePathPreview();
}

function setPrimitive(type) {
  clearTargetChildren();
  if (primitiveMesh) { primitiveMesh.geometry?.dispose?.(); primitiveMesh.material?.dispose?.(); }
  let geom;
  const mat = new THREE.MeshStandardMaterial({ color: 0x8aa0ff, roughness: 0.5, metalness: 0.1 });
  switch(type){
    case 'cube': geom = new THREE.BoxGeometry(1,1,1); break;
    case 'sphere': geom = new THREE.SphereGeometry(0.6, 32, 16); break;
    case 'cylinder': geom = new THREE.CylinderGeometry(0.5, 0.5, 1.2, 32); break;
    default: geom = new THREE.BoxGeometry(1,1,1); break;
  }
  primitiveMesh = new THREE.Mesh(geom, mat);
  target.add(primitiveMesh);
  loadedModel = null;
  target.scale.set(1,1,1);
  target.position.set(0,0,0);
  restOnGround();
  updateLookAtFromTarget();
  updatePathPreview();
}

const gltfLoader = new GLTFLoader();
async function setUserModelFromFile(file){
  clearTargetChildren();
  if (primitiveMesh) { primitiveMesh.geometry?.dispose?.(); primitiveMesh.material?.dispose?.(); primitiveMesh = null; }
  const url = URL.createObjectURL(file);
  try {
    const gltf = await gltfLoader.loadAsync(url);
    loadedModel = gltf.scene;
    // Normalize pivot: center at origin and rest on ground
    const box = new THREE.Box3().setFromObject(loadedModel);
    const center = box.getCenter(new THREE.Vector3());
    loadedModel.position.sub(center); // center to origin
    // Update box after recentering
    const box2 = new THREE.Box3().setFromObject(loadedModel);
    loadedModel.position.y -= box2.min.y; // rest on ground
    target.add(loadedModel);
  } catch (e) {
    console.error('模型載入失敗', e);
  } finally {
    URL.revokeObjectURL(url);
  }
  target.scale.set(parseFloat(ui.modelScale.value), parseFloat(ui.modelScale.value), parseFloat(ui.modelScale.value));
  target.position.set(0,0,0);
  restOnGround();
  updateLookAtFromTarget();
  updatePathPreview();
}


// Film camera (the simulated shot)
const filmCam = new THREE.PerspectiveCamera(50, 16 / 9, 0.05, 100);
scene.add(filmCam);

// Helper to visualize film camera in omniscient view
const camHelper = new THREE.CameraHelper(filmCam);
scene.add(camHelper);

// Omniscient observer camera
const observerCam = new THREE.PerspectiveCamera(55, 1, 0.05, 200);
observerCam.position.set(6, 4, 6);
observerCam.lookAt(0, 1.2, 0);
const controls = new OrbitControls(observerCam, canvases.omniscient);
controls.target.set(0, 1.2, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.maxPolarAngle = rad(85);
controls.minDistance = 2;
controls.maxDistance = 40;

// Renderers
const rendererOmni = new THREE.WebGLRenderer({ canvas: canvases.omniscient, antialias: true });
rendererOmni.outputColorSpace = THREE.SRGBColorSpace;
const rendererFilm = new THREE.WebGLRenderer({ canvas: canvases.film, antialias: true, preserveDrawingBuffer: false });
rendererFilm.outputColorSpace = THREE.SRGBColorSpace;

function resizeRenderers() {
  // Omniscient
  const oRect = canvases.omniscient.getBoundingClientRect();
  const fRect = canvases.film.getBoundingClientRect();

  const dpr = clamp(window.devicePixelRatio || 1, 1, 2);

  rendererOmni.setSize(oRect.width, oRect.height, false);
  rendererOmni.setPixelRatio(dpr);
  observerCam.aspect = oRect.width / oRect.height;
  observerCam.updateProjectionMatrix();

  rendererFilm.setSize(fRect.width, fRect.height, false);
  rendererFilm.setPixelRatio(dpr);
  filmCam.aspect = fRect.width / fRect.height;
  filmCam.updateProjectionMatrix();
}
window.addEventListener('resize', resizeRenderers);
resizeRenderers();

// Path visualization
const pathMaterial = new THREE.LineDashedMaterial({ color: 0x00e5ff, dashSize: 0.15, gapSize: 0.08 });
const pathGeom = new THREE.BufferGeometry();
const pathLine = new THREE.Line(pathGeom, pathMaterial);
pathLine.computeLineDistances();
scene.add(pathLine);

// Animation state
let playing = false;
let t0 = 0; // animation start timestamp
let lastT = 0; // persisted when paused

function setPlaying(p) {
  playing = p;
  ui.playPause.textContent = playing ? '暫停' : '播放';
  if (playing) {
    t0 = performance.now() - lastT * 1000; // resume
  } else {
    lastT = getProgressSeconds();
  }
}

function getProgressSeconds() {
  if (!playing) return lastT;
  const now = performance.now();
  const dt = (now - t0) / 1000;
  return dt;
}

function getNormalizedT() {
  const seconds = getProgressSeconds();
  const duration = parseFloat(ui.duration.value);
  if (seconds <= 0) return 0;
  const looped = seconds % duration;
  const t = clamp(looped / duration, 0, 1);
  if (!playing) lastT = looped; // keep lastT within duration
  return t;
}

// Controls wiring
ui.playPause.addEventListener('click', () => setPlaying(!playing));
ui.reset.addEventListener('click', () => {
  lastT = 0;
  t0 = performance.now();
  setPlaying(false);
});
ui.showHelpers.addEventListener('change', () => {
  const v = ui.showHelpers.checked;
  grid.visible = v; axes.visible = v; camHelper.visible = v; pathLine.visible = v;
});
ui.duration.addEventListener('input', () => {
  ui.durationVal.textContent = parseFloat(ui.duration.value).toFixed(1);
});
ui.focal.addEventListener('input', () => {
  ui.focalVal.textContent = ui.focal.value;
  filmCam.fov = focalToVFovDeg(parseFloat(ui.focal.value));
  filmCam.updateProjectionMatrix();
});
ui.focal.dispatchEvent(new Event('input'));

['moveStyle', 'shotSize', 'angle'].forEach((id) => {
  ui[id].addEventListener('change', () => { updatePathPreview(); });
});

ui.builtinObject.addEventListener('change', (e) => {
  const v = e.target.value;
  if (v === 'mannequin') setMannequin();
  else setPrimitive(v);
});

ui.modelFile.addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  if (file) setUserModelFromFile(file);
});

ui.modelScale.addEventListener('input', (e) => {
  const s = parseFloat(e.target.value);
  ui.modelScaleVal.textContent = s.toFixed(1);
  target.scale.set(s, s, s);
  restOnGround();
  updateLookAtFromTarget();
  updatePathPreview();
});

// initialize mannequin as default
setMannequin();

// Determine base distance and height from shot/angle
function getBaseConfig() {
  const shot = ui.shotSize.value; // wide | medium | close
  const ang = ui.angle.value; // eye | low | high | bird

  let distance = 3;
  if (shot === 'wide') distance = 6;
  else if (shot === 'medium') distance = 3;
  else if (shot === 'close') distance = 1.2;

  let height = 1.7;
  if (ang === 'eye') height = 1.7;
  else if (ang === 'low') height = 0.6;
  else if (ang === 'high') height = 3.0;
  else if (ang === 'bird') height = 8.0;

  return { distance, height };
}

function getYawRangeDeg() {
  const style = ui.moveStyle.value;
  switch (style) {
    case 'arcLeft': return -60;
    case 'arcRight': return 60;
    case 'orbit360': return 360;
    default: return 0;
  }
}

function basePose() {
  const { distance, height } = getBaseConfig();
  // default yaw 30 degrees
  const yaw = rad(30);
  const pos = new THREE.Vector3(Math.sin(yaw) * distance, height, Math.cos(yaw) * distance);
  return { pos, look: lookAtPos.clone() };
}

function motionAt(t) {
  // t in [0,1]
  const style = ui.moveStyle.value;
  const { distance, height } = getBaseConfig();
  const ease = easeInOut(t);

  // Start at yaw 30 deg
  let yaw0 = rad(30);
  let yaw = yaw0;
  let y = height;
  let dist = distance;
  let truck = 0; // lateral x in camera local space

  switch (style) {
    case 'static':
      break;
    case 'dollyIn':
      dist = lerp(distance, Math.max(0.3, distance * 0.35), ease);
      break;
    case 'dollyOut':
      dist = lerp(distance, distance * 1.8, ease);
      break;
    case 'truckLeft':
      truck = -distance * 0.6 * (Math.sin(Math.PI * (ease - 0.5)) + 1) / 2; // smooth left
      break;
    case 'truckRight':
      truck = distance * 0.6 * (Math.sin(Math.PI * (ease - 0.5)) + 1) / 2; // smooth right
      break;
    case 'arcLeft':
      yaw = yaw0 + rad(lerp(0, -60, ease));
      break;
    case 'arcRight':
      yaw = yaw0 + rad(lerp(0, 60, ease));
      break;
    case 'craneUp':
      y = lerp(height, height + 2.5, ease);
      break;
    case 'craneDown':
      y = lerp(height, Math.max(0.3, height - 2.5), ease);
      break;
    case 'orbit360':
      yaw = yaw0 + rad(360 * t);
      break;
    case 'handheld':
      // small jitter around base distance and height with pseudo-random noise
      const j = (seed) => Math.sin(2 * Math.PI * (t * 2 + seed)) * 0.05 + Math.sin(2 * Math.PI * (t * 3.7 + seed * 2.1)) * 0.03;
      yaw = yaw0 + j(0) * 0.7;
      y = height + j(1) * 0.7;
      dist = distance + j(2) * 0.8;
      break;
  }

  // Convert spherical to world position
  const forward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
  const pos = new THREE.Vector3().copy(forward).multiplyScalar(dist).setY(y);
  // Apply truck in camera-local x
  pos.add(right.multiplyScalar(truck));

  const look = lookAtPos.clone();
  return { pos, look };
}

function updateCameraPose(t) {
  const m = motionAt(t);
  filmCam.position.copy(m.pos);
  filmCam.lookAt(m.look);
  camHelper.update();
}

// Path preview
function updatePathPreview() {
  const N = 100;
  const positions = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const tt = i / (N - 1);
    const { pos } = motionAt(tt);
    positions[i * 3 + 0] = pos.x;
    positions[i * 3 + 1] = pos.y;
    positions[i * 3 + 2] = pos.z;
  }
  pathGeom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  pathGeom.computeBoundingSphere();
  pathLine.computeLineDistances();
}
updatePathPreview();

// Initial cam FOV
filmCam.fov = focalToVFovDeg(parseFloat(ui.focal.value));
filmCam.updateProjectionMatrix();

// Main loop
function renderLoop() {
  requestAnimationFrame(renderLoop);

  const t = getNormalizedT();
  updateCameraPose(t);

  controls.update();

  rendererOmni.render(scene, observerCam);
  rendererFilm.render(scene, filmCam);
}
renderLoop();

// Ensure helpers toggled initial state
ui.showHelpers.dispatchEvent(new Event('change'));

// Keyboard shortcuts
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') { e.preventDefault(); setPlaying(!playing); }
  if (e.key === 'r') { ui.reset.click(); }
});
