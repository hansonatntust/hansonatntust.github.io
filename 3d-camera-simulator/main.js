import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
import TWEEN from 'three/addons/libs/tween.module.js';

// ---- 變數宣告 ----
let mainCamera, shotCamera, scene, renderer, mainControls;
let shotPreviewRenderer, shotPreviewContainer;
let targetObject;

const mainContainer = document.getElementById('main-canvas-container');
const initialShotCamPos = new THREE.Vector3(0, 2, 10); // 虛擬攝影機初始位置

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
    
    // ---- 虛擬攝影機模型 ----
    const shotCamObject = new THREE.Group();
    const camBody = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.5, 0.8),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    const camLens = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 0.2, 0.3, 16),
        new THREE.MeshBasicMaterial({ color: 0x333333 })
    );
    camLens.rotation.x = Math.PI / 2;
    camLens.position.z = 0.5;
    shotCamObject.add(camBody);
    shotCamObject.add(camLens);

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

    // ---- 攝影機 ----
    // 1. 全知視角主攝影機
    mainCamera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    mainCamera.position.set(5, 5, 15);
    mainCamera.lookAt(scene.position);

    // 2. 鏡頭視角虛擬攝影機
    shotCamera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 1000);
    shotCamera.position.copy(initialShotCamPos);
    shotCamObject.position.copy(shotCamera.position);
    shotCamObject.lookAt(targetObject.position);
    shotCamera.add(shotCamObject); // 將攝影機模型加入攝影機中
    scene.add(shotCamera);


    // ---- 渲染器 ----
    // 1. 主渲染器
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    mainContainer.appendChild(renderer.domElement);

    // 2. 預覽視窗渲染器
    shotPreviewContainer = document.getElementById('shot-preview-container');
    shotPreviewRenderer = new THREE.WebGLRenderer({ antialias: true });
    shotPreviewRenderer.setSize(320, 180);
    shotPreviewContainer.appendChild(shotPreviewRenderer.domElement);


    // ---- 控制器 ----
    mainControls = new OrbitControls(mainCamera, renderer.domElement);
    mainControls.target.set(0, 1, 0);
    mainControls.update();

    // ---- 建立 GUI ----
    createGUI();

    // ---- 監聽視窗大小變化 ----
    window.addEventListener('resize', onWindowResize);
}

// ---- GUI 控制面板 ----
function createGUI() {
    const gui = new GUI();
    const targetLookAt = new THREE.Vector3(0, 1, 0);

    const params = {
        'Dolly In': () => animateCamera({ z: '-=5' }),
        'Dolly Out': () => animateCamera({ z: '+=5' }),
        'Truck Left': () => animateCamera({ x: '-=3' }),
        'Truck Right': () => animateCamera({ x: '+=3' }),
        'Pedestal Up': () => animateCamera({ y: '+=3' }),
        'Pedestal Down': () => animateCamera({ y: '-=3' }),
    };

    const movements = gui.addFolder('運鏡手法 (Movement)');
    movements.add(params, 'Dolly In');
    movements.add(params, 'Dolly Out');
    movements.add(params, 'Truck Left');
    movements.add(params, 'Truck Right');
    movements.add(params, 'Pedestal Up');
    movements.add(params, 'Pedestal Down');

    const arcParams = {
        'Arc Left': () => animateArc(Math.PI / 2),
        'Arc Right': () => animateArc(-Math.PI / 2),
    };
    movements.add(arcParams, 'Arc Left');
    movements.add(arcParams, 'Arc Right');

    const panTiltParams = {
        'Pan Left': () => animatePanTilt({ y: Math.PI / 4 }),
        'Pan Right': () => animatePanTilt({ y: -Math.PI / 4 }),
        'Tilt Up': () => animatePanTilt({ x: Math.PI / 8 }),
        'Tilt Down': () => animatePanTilt({ x: -Math.PI / 8 }),
    };
    movements.add(panTiltParams, 'Pan Left');
    movements.add(panTiltParams, 'Pan Right');
    movements.add(panTiltParams, 'Tilt Up');
    movements.add(panTiltParams, 'Tilt Down');
    
    movements.open();

    const shotDistanceParams = {
        'WIDER-SHOT': () => animateCamera({ x: 0, y: 3, z: 12 }, true),
        'MEDIUM-SHOT': () => animateCamera({ x: 0, y: 2, z: 6 }, true),
        'CLOSE-SHOT': () => animateCamera({ x: 0, y: 1.5, z: 3 }, true),
    };
    const distance = gui.addFolder('拍攝距離 (Shot Distance)');
    distance.add(shotDistanceParams, 'WIDER-SHOT');
    distance.add(shotDistanceParams, 'MEDIUM-SHOT');
    distance.add(shotDistanceParams, 'CLOSE-SHOT');
    distance.open();

    const shotAngleParams = {
        'Eye Level': () => animateCamera({ x: 0, y: 1.5, z: 8 }, true),
        'High Angle': () => animateCamera({ x: 0, y: 8, z: 5 }, true),
        'Low Angle': () => animateCamera({ x: 0, y: 0.5, z: 5 }, true),
        'Bird\'s-eye': () => animateCamera({ x: 0, y: 15, z: 0.1 }, true), // z=0.1 to avoid gimbal lock
    };
    const angles = gui.addFolder('拍攝角度 (Shot Angle)');
    angles.add(shotAngleParams, 'Eye Level');
    angles.add(shotAngleParams, 'High Angle');
    angles.add(shotAngleParams, 'Low Angle');
    angles.add(shotAngleParams, "Bird's-eye");
    angles.open();
}

// ---- 動畫函式 ----
function animateCamera(targetPosition, absolute = false) {
    const currentPos = shotCamera.position.clone();
    const finalPos = new THREE.Vector3();

    if (absolute) {
        finalPos.set(targetPosition.x, targetPosition.y, targetPosition.z);
    } else {
        const relativePos = new THREE.Vector3(
            eval(currentPos.x + (targetPosition.x || '0')),
            eval(currentPos.y + (targetPosition.y || '0')),
            eval(currentPos.z + (targetPosition.z || '0')),
        );
        finalPos.copy(relativePos);
    }

    new TWEEN.Tween(shotCamera.position)
        .to(finalPos, 1000)
        .easing(TWEEN.Easing.Quadratic.InOut)
        .onUpdate(() => {
            shotCamera.lookAt(targetObject.position);
        })
        .start();
}

function animateArc(angle) {
    const currentPos = shotCamera.position.clone();
    const pivot = targetObject.position.clone();
    const relativePos = currentPos.clone().sub(pivot);

    const initialAngle = Math.atan2(relativePos.x, relativePos.z);
    
    new TWEEN.Tween({ angle: 0 })
        .to({ angle: angle }, 1500)
        .easing(TWEEN.Easing.Quadratic.InOut)
        .onUpdate((obj) => {
            const newAngle = initialAngle + obj.angle;
            const radius = Math.sqrt(relativePos.x * relativePos.x + relativePos.z * relativePos.z);
            shotCamera.position.x = pivot.x + radius * Math.sin(newAngle);
            shotCamera.position.z = pivot.z + radius * Math.cos(newAngle);
            shotCamera.lookAt(pivot);
        })
        .start();
}

function animatePanTilt(targetRotation) {
    const currentRot = shotCamera.rotation.clone();
    const finalRot = new THREE.Euler(
        currentRot.x + (targetRotation.x || 0),
        currentRot.y + (targetRotation.y || 0),
        currentRot.z, // Keep z rotation the same
        'YXZ' // Using a common order to mitigate gimbal lock
    );

    new TWEEN.Tween(shotCamera.rotation)
        .to({ x: finalRot.x, y: finalRot.y, z: finalRot.z }, 1000)
        .easing(TWEEN.Easing.Quadratic.InOut)
        .start();
}


// ---- 視窗大小調整 ----
function onWindowResize() {
    mainCamera.aspect = window.innerWidth / window.innerHeight;
    mainCamera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);

    // 預覽視窗大小固定，所以不用調整
}

// ---- 動畫循環 ----
function animate() {
    requestAnimationFrame(animate);

    TWEEN.update(); // 更新補間動畫
    mainControls.update(); // 更新主攝影機控制器
    
    // 渲染主場景
    renderer.render(scene, mainCamera);

    // 渲染預覽視窗
    shotPreviewRenderer.render(scene, shotCamera);
}

// ---- 啟動 ----
init();
animate();