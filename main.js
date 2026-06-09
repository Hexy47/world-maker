import * as THREE from 'three';
import { io } from 'socket.io-client';
import { SETTINGS } from './game.config.js';

// Systems
import { Time } from './src/systems/Time.js';
import { Input } from './src/systems/Input.js';
import { Player } from './src/entities/Player.js';
import { loadLabWorld, loadSandboxWorld, clearCurrentWorld, worldGroup } from './src/systems/WorldManager.js';
import { UIManager } from './src/ui/UIManager.js';
import { StudioManager } from './src/systems/StudioManager.js';

import { initPhysics, createPlayerPhysics, stepWorld, addStaticBox, setGravity } from './src/physics.js';
import { initPostProcessing, initFog, renderFrame, resizeComposer, setBloomStrength, setBloomThreshold } from './src/graphics.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';

let socket;
let isGod = false;

// UI Elements
const loginScreen = document.getElementById('login-screen');
const joinBtn = document.getElementById('join-btn');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const uiLayer = document.getElementById('ui-layer');
const notificationsBox = document.getElementById('notifications');
const godInstructions = document.getElementById('god-instructions');
const statsBox = document.getElementById('stats-box');
const fpsCounter = document.getElementById('fps-counter');
const resolutionCounter = document.getElementById('resolution-counter');
const chatPanel = document.getElementById('chat-panel');
const chatMessages = document.getElementById('chat-messages');
const chatInputRow = document.getElementById('chat-input-row');
const chatInput = document.getElementById('chat-input');

let chatOpen = false;
let playerName = 'Guest';
let playerIsGod = false;

// Three.js Globals
let camera, scene, renderer, controls;
let raycaster;
const objects = []; // For collision and raycasting
const otherPlayers = {}; // Maps socket ID to Three.js Mesh
const blockMeshes = {}; // Maps block ID to Three.js Mesh
const npcMeshes = {}; // Maps NPC id to Three.js Group

// Player Entity
let localPlayer = null;

const gameHub = document.getElementById('game-hub');
const hubUsername = document.getElementById('hub-username');
let selectedGame = 'sandbox';

// Wait for login -> Show Hub
joinBtn.addEventListener('click', () => {
  const name = usernameInput.value.trim();
  if (!name) return;
  playerName = name;
  
  hubUsername.innerText = name;
  loginScreen.style.display = 'none';
  gameHub.style.display = 'flex';
});

// Leave Game
document.getElementById('leave-btn').addEventListener('click', () => {
  if (socket) socket.disconnect();
  
  // Clean up Three.js scene
  if (scene) {
    while(scene.children.length > 0){ 
      scene.remove(scene.children[0]); 
    }
  }
  objects.length = 0;
  for(let id in otherPlayers) delete otherPlayers[id];
  for(let id in blockMeshes) delete blockMeshes[id];
  
  uiLayer.style.display = 'none';
  statsBox.style.display = 'none';
  gameHub.style.display = 'flex';
  document.body.removeChild(renderer.domElement);
  
  // Reset states
  controls.unlock();
  window.inCar = null;
});

// Click a game in the hub
document.querySelectorAll('.play-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    const card = e.target.closest('.game-card');
    selectedGame = card.getAttribute('data-game');
    
    const name = usernameInput.value.trim();
    const password = passwordInput.value.trim();
    
    // Store credentials for seamless auto-reconnects
    window.username = name;
    window.password = password;
    
    socket = io();
    
    socket.on('connect', () => {
      console.log('Connected to server with ID:', socket.id);
      
      // Send initial join, or auto-rejoin if the connection dropped briefly
      if (window.username) {
        socket.emit('join', { name: window.username, password: window.password, game: selectedGame });
      }
    });

  socket.on('disconnect', () => {
    console.log('Disconnected from server (auto-reconnecting...)');
    // DO NOT kick to login screen. Let socket.io auto-reconnect in the background.
  });

    socket.on('init', (data) => {
      isGod = data.isGod;
      playerIsGod = data.isGod;
      gameHub.style.display = 'none';
      uiLayer.style.display = 'block';
      
      if (isGod) {
        godInstructions.style.display = 'inline';
      }
      
      statsBox.style.display = 'block';
      updateResolutionDisplay();

      initThreeJS();
      
      // Add existing players
      for (let id in data.players) {
        if (id !== socket.id) {
          addOtherPlayer(data.players[id]);
        }
      }
      
      // Populate existing blocks and players
      if (data.blocks) {
        data.blocks.forEach(b => {
          addBlock(b.position.x, b.position.y, b.position.z, b.color, b.id);
        });
      }
      
      window.customWorldData = data.customData;  initChat();
      appendChatMessage('', `Welcome to ${selectedGame}! Press T to chat.`, false, true);
      animate();
    });
  });
});

function initThreeJS() {
  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
  camera.position.y = SETTINGS.EYE_HEIGHT;

  scene = new THREE.Scene();
  scene.add(worldGroup);

  // Setup Global Synced Day/Night Sky
  window.sky = new Sky();
  window.sky.scale.setScalar(450000);
  scene.add(window.sky);
  
  window.sun = new THREE.Vector3();
  const uniforms = window.sky.material.uniforms;
  uniforms['turbidity'].value = 10;
  uniforms['rayleigh'].value = 2;
  uniforms['mieCoefficient'].value = 0.005;
  uniforms['mieDirectionalG'].value = 0.8;

  window.sunLight = new THREE.DirectionalLight(0xffffff, 2.0);
  window.sunLight.castShadow = true;
  window.sunLight.shadow.mapSize.width = 2048;
  window.sunLight.shadow.mapSize.height = 2048;
  window.sunLight.shadow.camera.near = 0.5;
  window.sunLight.shadow.camera.far = 1000;
  window.sunLight.shadow.camera.left = -500;
  window.sunLight.shadow.camera.right = 500;
  window.sunLight.shadow.camera.top = 500;
  window.sunLight.shadow.camera.bottom = -500;
  scene.add(window.sunLight);

  // Renderer — lean init, graphics.js applies real settings
  renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1); // hard lock — graphics.js also enforces this
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  window.addEventListener('resize', onWindowResize);

  // Implement pure HTML5 Pointer Lock (bypassing Three.js controls)
  controls = {
    isLocked: false,
    lock: () => {
      if (window.pauseMenu) window.pauseMenu.style.display = 'none';
      if (window.worldShiftMenu) window.worldShiftMenu.style.display = 'none';
      // RAW MOUSE INPUT: Bypasses Windows OS mouse acceleration and polling spikes
      const promise = document.body.requestPointerLock({ unadjustedMovement: true });
      if (!promise) {
        document.body.requestPointerLock(); // Fallback
      } else {
        promise.catch(() => document.body.requestPointerLock());
      }
    },
    unlock: () => document.exitPointerLock()
  };

  document.addEventListener('pointerlockchange', () => {
    controls.isLocked = (document.pointerLockElement === document.body);
    
    // NATIVE PAUSE MENU UX: When ESC is pressed, pointer unlocks natively.
    if (!controls.isLocked && uiLayer.style.display === 'block') {
      // Don't show pause menu if the God Menu is open
      if (!window.worldShiftMenu || window.worldShiftMenu.style.display !== 'flex') {
        if (window.pauseMenu) window.pauseMenu.style.display = 'flex';
      }
    }
  });

  document.body.addEventListener('click', (e) => {
    // Only auto-lock if we aren't clicking inside a menu
    if (uiLayer.style.display === 'block') {
      if (window.pauseMenu && window.pauseMenu.style.display === 'flex') return;
      if (window.worldShiftMenu && window.worldShiftMenu.style.display === 'flex') return;
      controls.lock();
    }
  });

  // ─── Initialize UI Systems ───────────────────────────────────────────────
  UIManager.init(controls, playerIsGod);
  if (playerIsGod) {
    StudioManager.init(camera, renderer, scene, controls);
  }

  // Hotkeys not handled by Input.js movement bindings
  document.addEventListener('keydown', (event) => {
    if (chatOpen) return;
    if (event.code === 'KeyP' && playerIsGod) {
      toggleGodPanel();
    }
    if (event.code === 'KeyB' && playerIsGod) {
      StudioManager.toggle();
    }
    if (event.code === 'KeyQ' && playerIsGod) {
      if (window.worldShiftMenu.style.display === 'flex') {
        window.worldShiftMenu.style.display = 'none';
        controls.lock();
      } else {
        window.worldShiftMenu.style.display = 'flex';
        controls.unlock();
      }
    }
  });

  window.addEventListener('publishWorld', () => {
    if (!playerIsGod) return;
    
    // Extract matrices of all InstancedMeshes in the worldGroup
    const worldData = [];
    worldGroup.children.forEach(child => {
      if (child.isInstancedMesh && child.userData.isEditable) {
        const matrices = [];
        const matrix = new THREE.Matrix4();
        for (let i = 0; i < child.count; i++) {
          child.getMatrixAt(i, matrix);
          matrices.push(matrix.toArray());
        }
        worldData.push({ id: child.uuid, matrices });
      }
    });

    socket.emit('publishWorld', { room: selectedGame, data: worldData });
    showNotification('World Published to Server!');
  });
  
  window.addEventListener('shiftWorld', (e) => {
    const targetWorld = e.detail;
    clearCurrentWorld(scene);
    
    if (targetWorld === 'sandbox') {
      loadSandboxWorld(scene);
    } else if (targetWorld === 'lab') {
      loadLabWorld(scene);
    } else if (targetWorld === 'sim') {
      loadGTAWorld();
    }

    // Recreate the player's rigid body since the old world was completely destroyed
    const startPos = targetWorld === 'lab' ? {x: 0, y: 2, z: 0} : {x: 0, y: 10, z: 0};
    const physicsData = createPlayerPhysics(startPos.x, startPos.y, startPos.z);
    localPlayer.body = physicsData.playerBody;
    localPlayer.controller = physicsData.playerController;
    localPlayer.velocity.set(0, 0, 0);
    
    // Sync with server (so players in The Sim don't see players in The Lab)
    socket.emit('shiftWorld', targetWorld);
  });

  raycaster = new THREE.Raycaster();

  window.inCar = null;

  // Fog
  initFog(scene);

  // Post-processing (bloom + SMAA)
  window._composer = initPostProcessing(renderer, scene, camera);

  // Init Rapier physics (async, must be ready before worlds load)
  initPhysics().then(() => {
    // Load the specific world
    if (selectedGame === 'gta') {
      loadGTAWorld();
    } else if (selectedGame === 'shooter') {
      loadShooterWorld();
    } else {
      loadFlatgrassWorld();
    }

    // Initialize Player Entity
    localPlayer = new Player(camera, camera.position);
    const { playerBody, playerController } = createPlayerPhysics(camera.position.x, camera.position.y, camera.position.z);
    localPlayer.body = playerBody;
    localPlayer.controller = playerController;

    window._physicsReady = true;
    console.log('[Physics] World colliders & Player ready');
  });

  // God Panel
  buildGodPanel();

  // Interaction Logic
  document.addEventListener('mousedown', (event) => {
    if (!controls.isLocked) return;

    if (selectedGame === 'gta' && event.button === 0) {
      if (window.inCar) {
        // Exit Car
        window.inCar = null;
        camera.position.y = SETTINGS.EYE_HEIGHT;
        showNotification("Exited Vehicle");
        return;
      }

      // Try to enter car
      const center = new THREE.Vector2(0, 0);
      raycaster.setFromCamera(center, camera);
      const intersects = raycaster.intersectObjects(window.gtaCars || [], false);

      if (intersects.length > 0 && intersects[0].distance < 10) {
        window.inCar = intersects[0].object;
        camera.position.y = 2.5; // Lower camera to car level
        showNotification("Entered Vehicle! Press Left Click to exit.");
        return;
      }
    }

    if (!isGod) return;

    if (event.button === 0) { // Left click to place block
      const center = new THREE.Vector2(0, 0);
      raycaster.setFromCamera(center, camera);
      const intersects = raycaster.intersectObjects(objects, false);

      if (intersects.length > 0) {
        const intersect = intersects[0];
        const pos = intersect.point.clone().add(intersect.face.normal.clone().multiplyScalar(0.5));
        pos.x = Math.floor(pos.x) + 0.5;
        pos.y = Math.floor(pos.y) + 0.5;
        pos.z = Math.floor(pos.z) + 0.5;
        socket.emit('placeBlock', { position: pos });
      }
    }
  });
}

function loadFlatgrassWorld() {
  scene.background = new THREE.Color(SETTINGS.SKY_COLOR);

  const starGeometry = new THREE.BufferGeometry();
  const starMaterial = new THREE.PointsMaterial({ color: 0xffffff, size: 3.0, sizeAttenuation: false });
  const starVertices = [];
  for(let i=0; i<SETTINGS.STAR_COUNT; i++) {
    const x = THREE.MathUtils.randFloatSpread(2000);
    const y = THREE.MathUtils.randFloat(0, 500); 
    const z = THREE.MathUtils.randFloatSpread(2000);
    starVertices.push(x, y, z);
  }
  starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starVertices, 3));
  scene.add(new THREE.Points(starGeometry, starMaterial));

  const sunGeometry = new THREE.SphereGeometry(30, 32, 32);
  const sunMaterial = new THREE.MeshBasicMaterial({ color: 0xffffee });
  const sun = new THREE.Mesh(sunGeometry, sunMaterial);
  sun.position.set(500, 800, 500);
  scene.add(sun);

  const dirLight = new THREE.DirectionalLight(0xffffee, SETTINGS.SUN_INTENSITY);
  dirLight.position.copy(sun.position);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.width = 2048;
  dirLight.shadow.mapSize.height = 2048;
  dirLight.shadow.camera.near = 0.5;
  dirLight.shadow.camera.far = 2000;
  dirLight.shadow.camera.left = -100;
  dirLight.shadow.camera.right = 100;
  dirLight.shadow.camera.top = 100;
  dirLight.shadow.camera.bottom = -100;
  scene.add(dirLight);

  scene.add(new THREE.AmbientLight(0x404040, SETTINGS.AMBIENT_INTENSITY));

  const floorGeometry = new THREE.PlaneGeometry(SETTINGS.GROUND_SIZE, SETTINGS.GROUND_SIZE, 10, 10);
  floorGeometry.rotateX(-Math.PI / 2);
  const floorMaterial = new THREE.MeshLambertMaterial({ color: SETTINGS.GROUND_COLOR });
  const floor = new THREE.Mesh(floorGeometry, floorMaterial);
  floor.receiveShadow = true;
  scene.add(floor);
  objects.push(floor);

  const gridHelper = new THREE.GridHelper(SETTINGS.GROUND_SIZE, SETTINGS.GROUND_SIZE / 10, 0x000000, 0x000000);
  gridHelper.material.opacity = 0.15;
  gridHelper.material.transparent = true;
  scene.add(gridHelper);
}

function loadGTAWorld() {
  scene.background = new THREE.Color(0x0a0a1a); // Dark night sky
  scene.fog = new THREE.FogExp2(0x0a0a1a, 0.002);

  // Night Stars
  const starGeom = new THREE.BufferGeometry();
  const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 2.0 });
  const starVerts = [];
  for(let i=0; i<3000; i++) {
    starVerts.push(THREE.MathUtils.randFloatSpread(2000), THREE.MathUtils.randFloat(100, 800), THREE.MathUtils.randFloatSpread(2000));
  }
  starGeom.setAttribute('position', new THREE.Float32BufferAttribute(starVerts, 3));
  scene.add(new THREE.Points(starGeom, starMat));

  // Moon Light (Shadows disabled for massive FPS gain on weak GPUs)
  const moonLight = new THREE.DirectionalLight(0x5555ff, 0.5);
  moonLight.position.set(-500, 500, -500);
  moonLight.castShadow = false; 
  worldGroup.add(moonLight);
  window.moonLight = moonLight;
  worldGroup.add(new THREE.AmbientLight(0x111122, 0.5));

  // Ground (Asphalt)
  const floorGeom = new THREE.PlaneGeometry(SETTINGS.GROUND_SIZE, SETTINGS.GROUND_SIZE);
  floorGeom.rotateX(-Math.PI / 2);
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8 });
  const floor = new THREE.Mesh(floorGeom, floorMat);
  floor.receiveShadow = true;
  worldGroup.add(floor);
  objects.push(floor);

  // Add Physics Collider for Ground
  addStaticBox(0, -0.5, 0, SETTINGS.GROUND_SIZE/2, 0.5, SETTINGS.GROUND_SIZE/2);

  // Procedural City Generation (Expanded 3x size)
  const blockSize = 40;
  const roadWidth = 10;
  const cityExtent = 1200; // Was 400. This makes the city absolutely massive.

  // Pre-calculate buildings to instantiate
  const buildingData = [];
  for (let x = -cityExtent; x < cityExtent; x += blockSize + roadWidth) {
    for (let z = -cityExtent; z < cityExtent; z += blockSize + roadWidth) {
      if (Math.abs(x) < 50 && Math.abs(z) < 50) continue;
      if (Math.random() > 0.8) continue;

      const height = THREE.MathUtils.randFloat(20, 150);
      const isNeon = Math.random() > 0.7;
      
      buildingData.push({
        x: x, y: height / 2, z: z,
        width: blockSize, height: height, depth: blockSize,
        isNeon: isNeon,
        color: isNeon ? new THREE.Color().setHSL(Math.random(), 1, 0.5) : new THREE.Color(0x222222)
      });
    }
  }

  // Create two InstancedMeshes (one for dark buildings, one for neon glowing ones)
  const baseGeom = new THREE.BoxGeometry(1, 1, 1);
  const darkMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0.3 });
  const neonMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1.0, roughness: 0.6, metalness: 0.3 });

  const numDark = buildingData.filter(b => !b.isNeon).length;
  const numNeon = buildingData.filter(b => b.isNeon).length;

  const darkMesh = new THREE.InstancedMesh(baseGeom, darkMat, numDark);
  const neonMesh = new THREE.InstancedMesh(baseGeom, neonMat, numNeon);
  
  darkMesh.userData.isEditable = true;
  darkMesh.uuid = 'GTA_DarkBuildings';
  neonMesh.userData.isEditable = true;
  neonMesh.uuid = 'GTA_NeonBuildings';
  
  darkMesh.castShadow = true; darkMesh.receiveShadow = true;
  neonMesh.castShadow = true; neonMesh.receiveShadow = true;

  const dummy = new THREE.Object3D();
  let darkIdx = 0, neonIdx = 0;

  window.cityBuildingData = []; // Store for physics

  buildingData.forEach(b => {
    dummy.position.set(b.x, b.y, b.z);
    dummy.scale.set(b.width, b.height, b.depth);
    dummy.quaternion.identity();
    dummy.updateMatrix();

    if (b.isNeon) {
      let customArr = window.customWorldData?.find(d => d.id === 'GTA_NeonBuildings')?.matrices[neonIdx];
      if (customArr) {
        dummy.matrix.fromArray(customArr);
        dummy.matrix.decompose(dummy.position, dummy.quaternion, dummy.scale);
      }
      neonMesh.setMatrixAt(neonIdx, dummy.matrix);
      neonMesh.setColorAt(neonIdx, b.color);
      neonIdx++;
    } else {
      let customArr = window.customWorldData?.find(d => d.id === 'GTA_DarkBuildings')?.matrices[darkIdx];
      if (customArr) {
        dummy.matrix.fromArray(customArr);
        dummy.matrix.decompose(dummy.position, dummy.quaternion, dummy.scale);
      }
      darkMesh.setMatrixAt(darkIdx, dummy.matrix);
      darkMesh.setColorAt(darkIdx, b.color);
      darkIdx++;
    }

    // Save collider info (Rapier uses half-extents)
    window.cityBuildingData.push({
      x: b.x, y: b.y, z: b.z,
      hw: b.width/2, hh: b.height/2, hd: b.depth/2
    });
    
    // Create physical box
    addStaticBox(b.x, b.y, b.z, b.width/2, b.height/2, b.depth/2);
  });

  worldGroup.add(darkMesh);
  worldGroup.add(neonMesh);
  objects.push(darkMesh, neonMesh);

  // Spawn Cars on the roads
  window.gtaCars = [];
  for(let i=0; i<30; i++) {
    const carGeom = new THREE.BoxGeometry(4, 2, 8);
    const carMat = new THREE.MeshStandardMaterial({ color: Math.random() * 0xffffff, metalness: 0.8, roughness: 0.2 });
    const car = new THREE.Mesh(carGeom, carMat);
    
    // Pick a random road position (between blocks)
    let cx, cz;
    if (Math.random() > 0.5) {
      cx = (Math.floor(Math.random() * 20) - 10) * (blockSize + roadWidth) - (roadWidth/2);
      cz = THREE.MathUtils.randFloat(-cityExtent, cityExtent);
    } else {
      cz = (Math.floor(Math.random() * 20) - 10) * (blockSize + roadWidth) - (roadWidth/2);
      cx = THREE.MathUtils.randFloat(-cityExtent, cityExtent);
    }
    
    car.position.set(cx, 1, cz);
    car.castShadow = true;
    car.receiveShadow = true;
    worldGroup.add(car);
    objects.push(car);
    window.gtaCars.push(car);
  }
}

function loadShooterWorld() {
  loadFlatgrassWorld();
}

function addBlock(x, y, z, color, id) {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshLambertMaterial({ 
    color: color
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  objects.push(mesh);
  blockMeshes[id] = mesh;
}

function addOtherPlayer(playerData) {
  const geometry = new THREE.CylinderGeometry(0.5, 0.5, SETTINGS.OTHER_PLAYER_HEIGHT, 32);
  const material = new THREE.MeshLambertMaterial({ 
    color: SETTINGS.OTHER_PLAYER_COLOR
  }); // Shiny red for other players
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(playerData.position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  
  // Add name tag
  // Keeping it simple without text geometry for now, just the shape
  
  scene.add(mesh);
  otherPlayers[playerData.id] = mesh;
}

// ─── Create a glowing NPC mesh with floating name tag ───────────────────────
function createNPCMesh(name, color) {
  const group = new THREE.Group();

  // Body (capsule-ish: cylinder + two half-spheres)
  const bodyGeo = new THREE.CylinderGeometry(0.4, 0.4, 1.6, 16);
  const bodyMat = new THREE.MeshLambertMaterial({
    color: color || 0xffffff,
    emissive: new THREE.Color(color || 0xffffff),
    emissiveIntensity: 0.4
  });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.name = 'body';
  body.position.y = 0.8;
  body.castShadow = true;
  group.add(body);

  // Head
  const headGeo = new THREE.SphereGeometry(0.35, 16, 16);
  const head = new THREE.Mesh(headGeo, bodyMat);
  head.position.y = 1.9;
  head.castShadow = true;
  group.add(head);

  // Floating name tag (canvas texture)
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.roundRect(4, 4, 248, 56, 8);
  ctx.fill();
  ctx.fillStyle = '#' + new THREE.Color(color || 0xffffff).getHexString();
  ctx.font = 'bold 28px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(name, 128, 40);

  const texture = new THREE.CanvasTexture(canvas);
  const labelGeo = new THREE.PlaneGeometry(1.5, 0.4);
  const labelMat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false });
  const label = new THREE.Mesh(labelGeo, labelMat);
  label.position.y = 2.7;
  // Label always faces camera (handled in animate loop)
  label.name = 'nameLabel';
  group.add(label);

  return group;
}

function setupSocketListeners() {
  socket.on('playerJoined', (player) => {
    addOtherPlayer(player);
  });

  socket.on('playerLeft', (id) => {
    if (otherPlayers[id]) {
      scene.remove(otherPlayers[id]);
      delete otherPlayers[id];
    }
  });

  socket.on('playerMoved', (player) => {
    if (otherPlayers[player.id]) {
      otherPlayers[player.id].position.copy(player.position);
      // We could sync rotation too, but keeping it simple for the base
    }
  });

  socket.on('blockPlaced', (block) => {
    addBlock(block.position.x, block.position.y, block.position.z, block.color, block.id);
  });

  socket.on('worldUpdated', (customData) => {
    window.customWorldData = customData;
    // Force reload the current world
    window.dispatchEvent(new CustomEvent('shiftWorld', { detail: selectedGame }));
  });
  
  socket.on('notification', (msg) => {
    showNotification(msg);
  });

  socket.on('forceReload', () => {
    window.location.reload();
  });

  socket.on('chatMessage', (data) => {
    appendChatMessage(data.name, data.text, data.isGod);
  });

  // ── NPC events ──────────────────────────────────────────────────────────
  socket.on('npcMoved', (data) => {
    if (!scene) return;
    if (!npcMeshes[data.id]) {
      npcMeshes[data.id] = createNPCMesh(data.name, data.color);
      scene.add(npcMeshes[data.id]);
    }
    npcMeshes[data.id].position.set(data.position.x, data.position.y, data.position.z);
  });

  socket.on('npcSpeak', (data) => {
    // Flash the NPC mesh briefly when they speak
    const mesh = npcMeshes[data.id];
    if (mesh) {
      const body = mesh.getObjectByName('body');
      if (body) {
        const orig = body.material.emissiveIntensity;
        body.material.emissiveIntensity = 2.0;
        setTimeout(() => { body.material.emissiveIntensity = orig; }, 600);
      }
    }
  });
}

function showNotification(msg) {
  const el = document.createElement('div');
  el.className = 'notification';
  el.innerText = msg;
  notificationsBox.appendChild(el);
  setTimeout(() => {
    if(el.parentNode) el.parentNode.removeChild(el);
  }, 5000);
}

function onWindowResize() {
  if (!camera || !renderer) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  updateResolutionDisplay();
}

function updateResolutionDisplay() {
  if(resolutionCounter) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    resolutionCounter.innerText = `Res: ${w}x${h}`;
  }
}

// ─── CHAT SYSTEM ─────────────────────────────────────────────────────────────

function initChat() {
  // Press T to open chat
  document.addEventListener('keydown', (e) => {
    if (e.code === 'KeyT' && !chatOpen && controls && controls.isLocked) {
      openChat();
      e.preventDefault();
    }
    if (e.code === 'Enter' && chatOpen) {
      sendChatMessage();
      e.preventDefault();
    }
    if (e.code === 'Escape' && chatOpen) {
      closeChat();
      e.preventDefault();
    }
  });
}

function openChat() {
  chatOpen = true;
  chatInputRow.style.display = 'block';
  chatInput.value = '';
  // Unlock mouse so user can type freely
  if (controls) controls.unlock();
  // Small delay so the T keypress doesn't get typed into the input
  setTimeout(() => chatInput.focus(), 30);
}

function closeChat() {
  chatOpen = false;
  chatInputRow.style.display = 'none';
  chatInput.blur();
}

function sendChatMessage() {
  const text = chatInput.value.trim();
  if (!text) { closeChat(); return; }
  // Show locally immediately
  appendChatMessage(playerName, text, playerIsGod);
  // Send to everyone else via the server
  socket.emit('chatMessage', { text });
  chatInput.value = '';
  closeChat();
}

function appendChatMessage(name, text, isGodMsg = false, isSystem = false) {
  const el = document.createElement('div');
  el.className = 'chat-msg' + (isGodMsg ? ' is-god' : '') + (isSystem ? ' system-msg' : '');
  if (isSystem) {
    el.textContent = text;
  } else {
    const nameSpan = document.createElement('span');
    nameSpan.className = 'chat-name';
    nameSpan.textContent = (isGodMsg ? '⚡' : '') + name + ':';
    const textSpan = document.createElement('span');
    textSpan.className = 'chat-text';
    textSpan.textContent = ' ' + text;
    el.appendChild(nameSpan);
    el.appendChild(textSpan);
  }
  chatMessages.appendChild(el);
  // Auto-scroll to bottom
  chatMessages.scrollTop = chatMessages.scrollHeight;
  // Fade out old messages after 30 seconds
  setTimeout(() => {
    el.style.transition = 'opacity 1s';
    el.style.opacity = '0';
    setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 1000);
  }, 30000);
}

let lastFpsTime = performance.now();
let frameCount = 0;

function animate() {
  requestAnimationFrame(animate);

  // Process Universal Day/Night Cycle (60 min total: 45m Day, 15m Night)
  const totalCycleMs = 60 * 60 * 1000;
  const dayMs = 45 * 60 * 1000;
  const nightMs = 15 * 60 * 1000;
  
  const currentMs = Date.now() % totalCycleMs;
  let elevation;
  
  if (currentMs < dayMs) {
    // Daytime: map 0-45m to a positive arc (0 to 90 to 0)
    const progress = currentMs / dayMs;
    elevation = Math.sin(progress * Math.PI) * 90;
  } else {
    // Nighttime: map 45-60m to a negative arc (0 to -90 to 0)
    const progress = (currentMs - dayMs) / nightMs;
    elevation = -Math.sin(progress * Math.PI) * 90;
  }
  
  // Continuous rotation for the sun around the horizon over the full 60 mins
  const azimuth = (currentMs / totalCycleMs) * 360;

  const phi = THREE.MathUtils.degToRad(90 - elevation);
  const theta = THREE.MathUtils.degToRad(azimuth);

  window.sun.setFromSphericalCoords(1, phi, theta);
  window.sky.material.uniforms['sunPosition'].value.copy(window.sun);
  
  window.sunLight.position.copy(window.sun).multiplyScalar(500);
  
  // Change sun color and intensity based on sunset/night
  if (elevation > 0) {
    window.sunLight.intensity = Math.max(0.1, Math.sin(THREE.MathUtils.degToRad(elevation)) * 2.5);
    window.sunLight.color.setHSL(0.1 + (elevation/90)*0.1, 1.0, 0.6 + (elevation/90)*0.4);
  } else {
    // Night time moonlight
    window.sunLight.intensity = 0.2;
    window.sunLight.color.setHex(0x5588ff);
  }

  // Update Game Logic
  Time.update();
  
  const time = performance.now();
  frameCount++;
  if (time - lastFpsTime >= 1000) {
    fpsCounter.innerText = `FPS: ${frameCount}`;
    
    // Broadcast telemetry to the server so the AI Launcher can see it
    if (socket && socket.connected) {
      socket.emit('telemetry', {
        fps: frameCount,
        objects: scene ? scene.children.length : 0,
        players: Object.keys(otherPlayers).length + 1
      });
    }

    frameCount = 0;
    lastFpsTime = time;
  }

  // Day/Night Cycle for GTA World
  if (selectedGame === 'gta' && window.moonLight) {
    const timeSpeed = 0.0005;
    window.moonLight.position.x = Math.sin(time * timeSpeed) * 1000;
    window.moonLight.position.z = Math.cos(time * timeSpeed) * 1000;
  }

  // Billboard NPC name labels to always face camera
  for (const id in npcMeshes) {
    const label = npcMeshes[id].getObjectByName('nameLabel');
    if (label && camera) label.quaternion.copy(camera.quaternion);
  }

  // === FIXED TIME STEP SYSTEMS LOOP ===
  if (controls.isLocked) {
    Time.tick(
      // 1. Physics & Logic Update (runs at fixed 60Hz)
      (fixedDelta) => {
        if (window._physicsReady && localPlayer) {
          localPlayer.fixedUpdate(fixedDelta);
          stepWorld();
        }
      },
      // 2. Render Update (runs as fast as possible, interpolates)
      (alpha) => {
        if (window._physicsReady && localPlayer) {
          localPlayer.renderUpdate(alpha);
        }

        // Car override
        if (window.inCar) {
          camera.position.y = 2.5;
          window.inCar.position.x = camera.position.x;
          window.inCar.position.z = camera.position.z;
          const euler = new THREE.Euler(0,0,0,'YXZ');
          euler.setFromQuaternion(camera.quaternion);
          window.inCar.rotation.y = euler.y;
        }

        // Emitting 144 times a second kills FPS/Networking. Throttle to 15Hz.
        if (!window._lastMoveEmit || time - window._lastMoveEmit > 66) {
          socket.emit('move', { position: camera.position, rotation: camera.rotation });
          window._lastMoveEmit = time;
        }
        
        renderFrame(); // bloom + SMAA post-processing
      }
    );
  } else {
    // If paused, just render
    renderFrame();
  }
}

// ─── God Physics Panel ────────────────────────────────────────────────────────
let godPanelOpen = false;
let godPanelEl = null;

// Hot-reload setters for God Panel since they were removed from physics.js
const setPlayerSpeed = (s) => { SETTINGS.PLAYER_SPEED = s; };
const setJumpForce = (j) => { SETTINGS.JUMP_FORCE = j; };

function buildGodPanel() {
  if (!playerIsGod) return;
  const panel = document.createElement('div');
  panel.id = 'god-panel';
  panel.style.cssText = `
    position:fixed; top:50%; right:20px; transform:translateY(-50%);
    background:rgba(0,0,0,0.85); border:1px solid #00ffcc44;
    border-radius:12px; padding:20px; width:260px;
    font-family:monospace; color:#00ffcc; display:none;
    box-shadow:0 0 30px #00ffcc22; z-index:1000;
    backdrop-filter:blur(10px);
  `;

  const sliders = [
    { label:'Gravity',       key:'GRAVITY',        min:-50,  max:0,   step:0.5,  setter: setGravity },
    { label:'Player Speed',  key:'PLAYER_SPEED',   min:1,    max:30,  step:0.5,  setter: setPlayerSpeed },
    { label:'Jump Force',    key:'JUMP_FORCE',     min:0,    max:30,  step:0.5,  setter: setJumpForce },
    { label:'Bloom Strength',key:'BLOOM_STRENGTH', min:0,    max:5,   step:0.1,  setter: setBloomStrength },
    { label:'Bloom Cutoff',  key:'BLOOM_THRESHOLD',min:0,    max:1,   step:0.05, setter: setBloomThreshold },
  ];

  let html = `<div style="font-size:14px;font-weight:bold;margin-bottom:14px;letter-spacing:2px;">⚙️ GOD PANEL</div>`;
  sliders.forEach(s => {
    html += `
      <div style="margin-bottom:12px">
        <label style="display:flex;justify-content:space-between;margin-bottom:4px;font-size:11px">
          <span>${s.label}</span>
          <span id="val-${s.key}">${SETTINGS[s.key]}</span>
        </label>
        <input type="range" min="${s.min}" max="${s.max}" step="${s.step}"
          value="${SETTINGS[s.key]}"
          style="width:100%;accent-color:#00ffcc"
          oninput="
            document.getElementById('val-${s.key}').innerText=this.value;
            window._godSetters['${s.key}'](parseFloat(this.value));
          ">
      </div>`;
  });
  html += `<div style="font-size:10px;opacity:0.5;margin-top:10px">Press P to close</div>`;
  panel.innerHTML = html;
  document.body.appendChild(panel);
  godPanelEl = panel;

  // Store setter map for inline oninput handlers
  window._godSetters = {
    GRAVITY: setGravity,
    PLAYER_SPEED: setPlayerSpeed,
    JUMP_FORCE: setJumpForce,
    BLOOM_STRENGTH: setBloomStrength,
    BLOOM_THRESHOLD: setBloomThreshold
  };
}

function toggleGodPanel() {
  if (!godPanelEl) return;
  godPanelOpen = !godPanelOpen;
  godPanelEl.style.display = godPanelOpen ? 'block' : 'none';
  if (godPanelOpen) controls.unlock();
}
