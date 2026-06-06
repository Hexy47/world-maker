import * as THREE from 'three';
import { initThreeJS } from './counter.js';

// Initialize Three.js scene, camera, and renderer
function initThreeJS() {
  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.y = 2; // Eye level

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8B0000); // Dark red ground
  // Removed fog so we can clearly see everything

  // Add Outer Space Stars (Fixed)
  const starGeometry = new THREE.BufferGeometry();
  const starMaterial = new THREE.PointsMaterial({ color: 0xffffff, size: 3.0, sizeAttenuation: false });
  const starVertices = [];
  for(let i=0; i<5000; i++) {
    const x = THREE.MathUtils.randFloatSpread(2000);
    const y = THREE.MathUtils.randFloat(0, 500); // Lower stars so they are right in front of us
    const z = THREE.MathUtils.randFloatSpread(2000);
    starVertices.push(x, y, z);
  }
  starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starVertices, 3));
  const stars = new THREE.Points(starGeometry, starMaterial);
  scene.add(stars);

  // The test cube has been removed.

  const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
  dirLight.position.set(50, 100, 50);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.width = 1024;
  dirLight.shadow.mapSize.height = 1024;
  dirLight.shadow.camera.near = 0.5;
  dirLight.shadow.camera.far = 500;
  dirLight.shadow.camera.left = -50;
  dirLight.shadow.camera.right = 50;
  dirLight.shadow.camera.top = 50;
  dirLight.shadow.camera.bottom = -50;
  scene.add(dirLight);

  // Soft ambient light to fill in the shadows realistically
  const ambientLight = new THREE.AmbientLight(0x404040, 0.5);
  scene.add(ambientLight);

  controls = new PointerLockControls(camera, document.body);

  document.body.addEventListener('click', () => {
    controls.lock();
  });

  // Camera is automatically updated by PointerLockControls

  const onKeyDown = function (event) {
    switch (event.code) {
      case 'ArrowUp':
      case 'KeyW': moveForward = true; break;
      case 'ArrowLeft':
      case 'KeyA': moveLeft = true; break;
      case 'ArrowDown':
      case 'KeyS': moveBackward = true; break;
      case 'ArrowRight':
      case 'KeyD': moveRight = true; break;
      case 'Space': if (canJump === true) velocity.y += 350; canJump = false; break;
    }
  };

  const onKeyUp = function (event) {
    switch (event.code) {
      case 'ArrowUp':
      case 'KeyW': moveForward = false; break;
      case 'ArrowLeft':
      case 'KeyA': moveLeft = false; break;
      case 'ArrowDown':
      case 'KeyS': moveBackward = false; break;
      case 'ArrowRight':
      case 'KeyD': moveRight = false; break;
    }
  };

  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);

  raycaster = new THREE.Raycaster();

  // Floor (Optimized Lambert Material)
  const floorGeometry = new THREE.PlaneGeometry(2000, 2000, 10, 10);
  floorGeometry.rotateX(-Math.PI / 2);
  const floorMaterial = new THREE.MeshLambertMaterial({ 
    color: 0x8B0000 // Dark red
  });
  const floor = new THREE.Mesh(floorGeometry, floorMaterial);
  floor.receiveShadow = true;
  scene.add(floor);
  objects.push(floor);

  // Removed GridHelper to save on line drawing overhead on weak GPUs

  // Renderer with Shadows Enabled
  // Anti-aliasing disabled for massive performance boost
  renderer = new THREE.WebGLRenderer({ antialias: false });
  // Limit pixel ratio to 1 to drastically improve FPS on high-res monitors
  renderer.setPixelRatio(1);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.BasicShadowMap;
  // Tone mapping for realistic lighting colors
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  document.body.appendChild(renderer.domElement);

  window.addEventListener('resize', onWindowResize);
  
  // Building Logic
  document.addEventListener('mousedown', (event) => {
    if (!controls.isLocked || !isGod) return;
    if (event.button === 0) { // Left click
      // Find intersection
      const center = new THREE.Vector2(0, 0);
      raycaster.setFromCamera(center, camera);
      const intersects = raycaster.intersectObjects(objects, false);

      if (intersects.length > 0) {
        const intersect = intersects[0];
        
        // Snap to grid (1x1x1 blocks)
        const pos = intersect.point.clone().add(intersect.face.normal.clone().multiplyScalar(0.5));
        pos.x = Math.floor(pos.x) + 0.5;
        pos.y = Math.floor(pos.y) + 0.5;
        pos.z = Math.floor(pos.z) + 0.5;

        socket.emit('placeBlock', { position: pos });
      }
    }
  });
}

function addBlock(data) {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshLambertMaterial({ 
    color: data.color
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(data.position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  objects.push(mesh);
  blockMeshes[data.id] = mesh;
}

function addOtherPlayer(playerData) {
  const geometry = new THREE.CylinderGeometry(0.5, 0.5, 2, 32);
  const material = new THREE.MeshLambertMaterial({ 
    color: 0xff0000
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
    addBlock(block);
  });
  
  socket.on('notification', (msg) => {
    showNotification(msg);
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
    // Since we forced pixel ratio to 1, we just display the CSS window size
    const w = window.innerWidth;
    const h = window.innerHeight;
    resolutionCounter.innerText = `Res: ${w}x${h}`;
  }
}

let prevTime = performance.now();
let lastFpsTime = performance.now();
let frameCount = 0;

function animate() {
  requestAnimationFrame(animate);

  const time = performance.now();
  
  frameCount++;
  if (time - lastFpsTime >= 1000) {
    fpsCounter.innerText = `FPS: ${frameCount}`;
    frameCount = 0;
    lastFpsTime = time;
  }

  if (controls.isLocked === true) {
    const delta = (time - prevTime) / 1000;

    velocity.x -= velocity.x * 10.0 * delta;
    velocity.z -= velocity.z * 10.0 * delta;
    velocity.y -= 9.8 * 100.0 * delta; // 100.0 = mass

    direction.z = Number(moveForward) - Number(moveBackward);
    direction.x = Number(moveRight) - Number(moveLeft);
    direction.normalize();

    if (moveForward || moveBackward) velocity.z -= direction.z * 400.0 * delta;
    if (moveLeft || moveRight) velocity.x -= direction.x * 400.0 * delta;

    // A simple collision check (only Y axis for jumping)
    controls.moveRight(-velocity.x * delta);
    controls.moveForward(-velocity.z * delta);

    camera.position.y += (velocity.y * delta);

    if (camera.position.y < 2) {
      velocity.y = 0;
      camera.position.y = 2;
      canJump = true;
    }

    // Emit position to server
    if (velocity.x !== 0 || velocity.z !== 0 || velocity.y !== 0) {
       socket.emit('move', {
         position: camera.position,
         rotation: camera.rotation
       });
    }
  }

  prevTime = time;
  renderer.render(scene, camera);
}
