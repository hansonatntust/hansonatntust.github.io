import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
import TWEEN from 'three/addons/libs/tween.module.js';

// ---- 變數宣告 ----
let mainCamera, shotCamera, scene, renderer, mainControls;
let shotPreviewRenderer, shotPreviewContainer;
let targetObject;
let shotRig; // 攝影機載具（用來同時移動相機與相機外觀模型）

// 時間軸 / 關鍵幀
let keyframes = [];
let defaultKFDuration = 1200;
let isPlayingTimeline = false;
let activeTimelineTweens = [];

const mainContainer = document.getElementById('main-canvas-container');
const initialShotCamPos = new THREE.Vector3(0, 2, 10); // 虛擬攝影機初始位置（看向中心目標）

// ---- 初始化函式 ----
function init() {
    // ---- 場景 ----
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x333333);
    scene.fog = new THREE.Fog(0x333333, 20, 50);

    // ---- 目標物 ----
    const targetGeometry = new THREE.CapsuleGeometry(0.5, 1, 4, 16);
    const targetMaterial = new THREE.MeshStandardMaterial({ color: 0xff4444 });
    targetObject = new THREE.Mesh(targetGeometry, targetMaterial);
    targetObject.position.set(0, 1, 0);
    targetObject.castShadow = true;
    scene.add(targetObject);

    // ---- 地板 ----
    const groundGeometry = new THREE.PlaneGeometry(50, 50);
    const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x555555, side: THREE.DoubleSide });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // ---- 光源 ----
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
    directionalLight.position.set(5, 10, 7.5);
    directionalLight.castShadow = true;
    scene.add(directionalLight);

    // ---- 全知視角主攝影機 ----
    mainCamera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    mainCamera.position.set(5, 5, 15);
    mainCamera.lookAt(scene.position);

    // ---- 虛擬攝影機 Rig 與 2D 鏡頭視角 ----
    shotRig = new THREE.Group();
    shotRig.position.copy(initialShotCamPos);
    scene.add(shotRig);

    shotCamera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 1000);
    shotCamera.position.set(0, 0, 0); // 放在 rig 原點
    shotRig.add(shotCamera);
    shotCamera.lookAt(targetObject.position);

    // ---- 虛擬攝影機外觀模型（只給主攝影機看，不進 2D 預覽）----
    const shotCamObject = buildCameraModel();
    // 放在 rig 原點，與 shotCamera 同位置
    shotRig.add(shotCamObject);
    // 使用圖層隔離：模型在 layer 1；主攝影機啟用 layer 1；2D 鏡頭不啟用 layer 1
    shotCamObject.traverse(obj => obj.layers.set(1));
    mainCamera.layers.enable(1);
    shotCamera.layers.disable(1);

    // ---- 渲染器 ----
    // 1. 主渲染器（3D 全知視角）
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    mainContainer.appendChild(renderer.domElement);

    // 2. 預覽視窗渲染器（2D 鏡頭視角）
    shotPreviewContainer = document.getElementById('shot-preview-container');
    shotPreviewRenderer = new THREE.WebGLRenderer({ antialias: true });
    shotPreviewRenderer.setSize(320, 180);
    shotPreviewContainer.appendChild(shotPreviewRenderer.domElement);

    // ---- 控制器（讓使用者自由切換 3D 視角位置）----
    mainControls = new OrbitControls(mainCamera, renderer.domElement);
    mainControls.target.set(0, 1, 0);
    mainControls.update();

    // ---- 建立 GUI ----
    createGUI();

    // ---- 監聽視窗大小變化 ----
    window.addEventListener('resize', onWindowResize);
}

function buildCameraModel() {
    const group = new THREE.Group();

    const camBody = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.5, 0.8),
        new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.2, roughness: 0.6 })
    );

    const camLens = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 0.2, 0.3, 16),
        new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.5, roughness: 0.4 })
    );
    camLens.rotation.x = Math.PI / 2;
    camLens.position.z = 0.55;

    group.add(camBody);
    group.add(camLens);

    return group;
}

// ---- GUI 控制面板 ----
function createGUI() {
    const gui = new GUI();

    // 運鏡（以相機自身座標系移動）
    const moveParams = {
        '推進（Dolly In）': () => animateMove({ z: 5 }, { mode: 'relative' }),
        '後退（Dolly Out）': () => animateMove({ z: -5 }, { mode: 'relative' }),
        '平移左（Truck Left）': () => animateMove({ x: -3 }, { mode: 'relative' }),
        '平移右（Truck Right）': () => animateMove({ x: 3 }, { mode: 'relative' }),
        '升高（Pedestal Up）': () => animateMove({ y: 3 }, { mode: 'relative' }),
        '降低（Pedestal Down）': () => animateMove({ y: -3 }, { mode: 'relative' }),
        '繞行左 90°（Arc Left）': () => animateArc(Math.PI / 2),
        '繞行右 90°（Arc Right）': () => animateArc(-Math.PI / 2),
        '搖攝左 45°（Pan Left）': () => animatePanTilt({ yaw: Math.PI / 4 }),
        '搖攝右 45°（Pan Right）': () => animatePanTilt({ yaw: -Math.PI / 4 }),
        '俯仰上 22.5°（Tilt Up）': () => animatePanTilt({ pitch: Math.PI / 8 }),
        '俯仰下 22.5°（Tilt Down）': () => animatePanTilt({ pitch: -Math.PI / 8 }),
    };
    const movements = gui.addFolder('運鏡手法');
    Object.keys(moveParams).forEach(k => movements.add(moveParams, k));
    movements.open();

    // 拍攝距離
    const distanceParams = {
        '遠景（WIDER-SHOT）': () => animateMoveTo({ x: 0, y: 3, z: 12 }),
        '中景（MEDIUM-SHOT）': () => animateMoveTo({ x: 0, y: 2, z: 6 }),
        '近景（CLOSE-SHOT）': () => animateMoveTo({ x: 0, y: 1.5, z: 3 }),
    };
    const distance = gui.addFolder('拍攝距離');
    Object.keys(distanceParams).forEach(k => distance.add(distanceParams, k));
    distance.open();

    // 拍攝角度
    const angleParams = {
        '平視（Eye Level）': () => animateMoveTo({ x: 0, y: 1.5, z: 8 }),
        '高角度（High Angle）': () => animateMoveTo({ x: 0, y: 8, z: 5 }),
        '低角度（Low Angle）': () => animateMoveTo({ x: 0, y: 0.5, z: 5 }),
        '鳥瞰（Bird\'s-eye）': () => animateMoveTo({ x: 0, y: 15, z: 0.1 }), // z=0.1 避免萬向節鎖
    };
    const angles = gui.addFolder('拍攝角度');
    Object.keys(angleParams).forEach(k => angles.add(angleParams, k));
    angles.open();

    // 時間軸 / 關鍵幀
    const timelineState = {
        '每幀時長(ms)': defaultKFDuration,
        '循環播放': false,
        '關鍵幀數': 0,
        '加入關鍵幀': () => {
            addKeyframe(timelineState['每幀時長(ms)']);
            timelineState['關鍵幀數'] = keyframes.length;
        },
        '播放': () => playTimeline(timelineState['循環播放']),
        '停止': () => stopTimeline(),
        '清除全部': () => { keyframes = []; timelineState['關鍵幀數'] = 0; },
        '移除最後一幀': () => { if (keyframes.length>0) { keyframes.pop(); timelineState['關鍵幀數']=keyframes.length; } },
    };

    const timeline = gui.addFolder('時間軸 / 關鍵幀');
    timeline.add(timelineState, '每幀時長(ms)', 200, 5000, 100).onChange(v => defaultKFDuration = v);
    timeline.add(timelineState, '循環播放');
    timeline.add(timelineState, '關鍵幀數').listen();
    timeline.add(timelineState, '加入關鍵幀');
    timeline.add(timelineState, '播放');
    timeline.add(timelineState, '停止');
    timeline.add(timelineState, '清除全部');
    timeline.add(timelineState, '移除最後一幀');
    timeline.open();
}

// ---- 運鏡：以相機自身座標系移動（Dolly/Truck/Pedestal）----
function animateMove(move, options = {}) {
    if (isPlayingTimeline) return;
    const duration = options.duration ?? 1000;
    const mode = options.mode ?? 'relative'; // 'relative' | 'absolute'

    const start = shotRig.position.clone();
    let end = start.clone();

    if (mode === 'absolute') {
        end.set(
            move.x ?? start.x,
            move.y ?? start.y,
            move.z ?? start.z,
        );
    } else {
        // 相機自身座標系：forward/right/up
        const forward = new THREE.Vector3();
        shotCamera.getWorldDirection(forward); // -Z 方向
        const worldUp = new THREE.Vector3(0, 1, 0);
        const right = new THREE.Vector3().crossVectors(forward, worldUp).normalize();
        const up = new THREE.Vector3().crossVectors(right, forward).normalize();

        const dx = move.x ?? 0; // Truck (+x 右)
        const dy = move.y ?? 0; // Pedestal (+y 上)
        const dz = move.z ?? 0; // Dolly (+z 往前)

        end.addScaledVector(right, dx)
           .addScaledVector(up, dy)
           .addScaledVector(forward, dz); // forward 已指向 -Z，所以 +dz 表示往前
    }

    new TWEEN.Tween(shotRig.position)
        .to({ x: end.x, y: end.y, z: end.z }, duration)
        .easing(TWEEN.Easing.Quadratic.InOut)
        .onUpdate(() => {
            // 保持鏡頭朝向目標
            shotCamera.lookAt(targetObject.position);
        })
        .start();
}

// ---- 運鏡：移動到絕對位置（用於距離/角度）----
function animateMoveTo(pos, duration = 1000) {
    if (isPlayingTimeline) return;
    const start = shotRig.position.clone();
    const end = new THREE.Vector3(
        pos.x ?? start.x,
        pos.y ?? start.y,
        pos.z ?? start.z,
    );

    new TWEEN.Tween(shotRig.position)
        .to({ x: end.x, y: end.y, z: end.z }, duration)
        .easing(TWEEN.Easing.Quadratic.InOut)
        .onUpdate(() => {
            shotCamera.lookAt(targetObject.position);
        })
        .start();
}

// ---- 運鏡：圍繞目標 Arc （水平繞行）----
function animateArc(angle, duration = 1500) {
    if (isPlayingTimeline) return;
    const pivot = targetObject.position.clone();
    const start = shotRig.position.clone();
    const rel = start.clone().sub(pivot);
    const radius = Math.sqrt(rel.x * rel.x + rel.z * rel.z);
    const startAngle = Math.atan2(rel.x, rel.z);

    const state = { a: 0 };
    new TWEEN.Tween(state)
        .to({ a: angle }, duration)
        .easing(TWEEN.Easing.Quadratic.InOut)
        .onUpdate(() => {
            const a = startAngle + state.a;
            shotRig.position.x = pivot.x + radius * Math.sin(a);
            shotRig.position.z = pivot.z + radius * Math.cos(a);
            shotCamera.lookAt(pivot);
        })
        .start();
}

// ---- 運鏡：Pan / Tilt （原地旋轉鏡頭）----
function animatePanTilt({ yaw = 0, pitch = 0 }, duration = 1000) {
    if (isPlayingTimeline) return;
    // 以 shotCamera 的當前旋轉為基礎做增量
    const startEuler = new THREE.Euler().copy(shotCamera.rotation);
    const endEuler = new THREE.Euler(
        startEuler.x + pitch,
        startEuler.y + yaw,
        startEuler.z,
        'YXZ'
    );

    const state = { x: startEuler.x, y: startEuler.y, z: startEuler.z };
    new TWEEN.Tween(state)
        .to({ x: endEuler.x, y: endEuler.y, z: endEuler.z }, duration)
        .easing(TWEEN.Easing.Quadratic.InOut)
        .onUpdate(() => {
            shotCamera.rotation.set(state.x, state.y, state.z, 'YXZ');
        })
        .start();
}

// ---- 時間軸 / 關鍵幀 API ----
function addKeyframe(duration = defaultKFDuration) {
    const kf = {
        position: shotRig.position.clone(),
        rotation: shotCamera.quaternion.clone(),
        duration: Math.max(0, Number(duration) || defaultKFDuration),
    };
    keyframes.push(kf);
}

function stopTimeline() {
    isPlayingTimeline = false;
    activeTimelineTweens.forEach(t => t.stop());
    activeTimelineTweens = [];
}

function playTimeline(loop = false) {
    if (keyframes.length < 2) return;
    // 停止現有動畫，避免干擾
    stopTimeline();
    TWEEN.removeAll();

    // 將相機狀態設為首幀
    const first = keyframes[0];
    shotRig.position.copy(first.position);
    shotCamera.quaternion.copy(first.rotation);

    // 建立每段 tween（位置與旋轉一起插值）
    let chain = null;
    isPlayingTimeline = true;

    for (let i = 1; i < keyframes.length; i++) {
        const prev = keyframes[i - 1];
        const next = keyframes[i];
        const state = { t: 0 };
        const seg = new TWEEN.Tween(state)
            .to({ t: 1 }, Math.max(0, Number(next.duration) || defaultKFDuration))
            .easing(TWEEN.Easing.Quadratic.InOut)
            .onUpdate(() => {
                const pos = new THREE.Vector3().lerpVectors(prev.position, next.position, state.t);
                shotRig.position.copy(pos);
                const q = new THREE.Quaternion();
                q.slerpQuaternions(prev.rotation, next.rotation, state.t);
                shotCamera.quaternion.copy(q);
            });

        activeTimelineTweens.push(seg);
        if (chain) chain.chain(seg);
        chain = seg;
    }

    if (chain) {
        chain.onComplete(() => {
            isPlayingTimeline = false;
            if (loop) {
                playTimeline(true);
            }
        });
        // 啟動第一段（activeTimelineTweens[0]）
        if (activeTimelineTweens.length > 0) {
            activeTimelineTweens[0].start();
        }
    }
}

// ---- 視窗大小調整 ----
function onWindowResize() {
    mainCamera.aspect = window.innerWidth / window.innerHeight;
    mainCamera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    // 2D 預覽固定大小，這裡不自動調整
}

// ---- 動畫循環 ----
function animate() {
    requestAnimationFrame(animate);

    TWEEN.update(); // 更新補間動畫
    mainControls.update(); // 更新主攝影機控制器

    // 渲染主場景（3D 全知視角）
    renderer.render(scene, mainCamera);

    // 渲染預覽視窗（2D 鏡頭視角）
    shotPreviewRenderer.render(scene, shotCamera);
}

// ---- 啟動 ----
init();
animate();
