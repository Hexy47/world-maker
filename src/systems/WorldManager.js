import * as THREE from 'three';
import { SETTINGS } from '../../game.config.js';
import { clearPhysicsWorld, addStaticBox } from '../physics.js';

export let currentWorldMeshes = [];

// Helper to clear existing world
export function clearCurrentWorld(scene) {
  // 1. Remove all world meshes from Three.js scene
  currentWorldMeshes.forEach(mesh => {
    scene.remove(mesh);
    if (mesh.geometry) mesh.geometry.dispose();
    if (mesh.material) mesh.material.dispose();
  });
  currentWorldMeshes = [];

  // 2. Clear Rapier physics world (removes all colliders/bodies)
  clearPhysicsWorld();
  
  // Note: the player entity is re-added after clearPhysicsWorld is called by the main script
}

// ─── THE LAB (Aperture Science Style) ───────────────────────────────────────
export function loadLabWorld(scene) {
  clearCurrentWorld(scene);

  // Sterile white grid floor
  const floorGeo = new THREE.PlaneGeometry(100, 100);
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.2,
    metalness: 0.1
  });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  currentWorldMeshes.push(floor);

  // Add a subtle blue glowing grid helper
  const gridHelper = new THREE.GridHelper(100, 100, 0x0088ff, 0xaaaaaa);
  gridHelper.position.y = 0.01;
  gridHelper.material.opacity = 0.5;
  gridHelper.material.transparent = true;
  scene.add(gridHelper);
  currentWorldMeshes.push(gridHelper);

  // Physics for floor
  addStaticBox(0, -0.5, 0, 50, 0.5, 50);

  // Add 4 massive sterile walls
  const wallGeo = new THREE.BoxGeometry(100, 20, 2);
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.5 });
  
  const walls = [
    { x: 0, z: -50, rotY: 0 },
    { x: 0, z: 50, rotY: 0 },
    { x: -50, z: 0, rotY: Math.PI / 2 },
    { x: 50, z: 0, rotY: Math.PI / 2 }
  ];

  walls.forEach(w => {
    const wall = new THREE.Mesh(wallGeo, wallMat);
    wall.position.set(w.x, 10, w.z);
    wall.rotation.y = w.rotY;
    wall.castShadow = true;
    wall.receiveShadow = true;
    scene.add(wall);
    currentWorldMeshes.push(wall);

    if (w.rotY === 0) {
      addStaticBox(w.x, 10, w.z, 50, 10, 1);
    } else {
      addStaticBox(w.x, 10, w.z, 1, 10, 50);
    }
  });

  // Bright surgical lighting
  const ambient = new THREE.AmbientLight(0xffffff, 0.8);
  scene.add(ambient);
  currentWorldMeshes.push(ambient);

  const overhead = new THREE.DirectionalLight(0xffffff, 1.5);
  overhead.position.set(0, 50, 0);
  overhead.castShadow = true;
  scene.add(overhead);
  currentWorldMeshes.push(overhead);

  console.log('[WorldManager] The Lab loaded');
}

// ─── THE SANDBOX (Flat Endless Grid) ────────────────────────────────────────
export function loadSandboxWorld(scene) {
  clearCurrentWorld(scene);

  const floorGeo = new THREE.PlaneGeometry(SETTINGS.GROUND_SIZE, SETTINGS.GROUND_SIZE);
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0x222222,
    roughness: 0.8,
  });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  currentWorldMeshes.push(floor);

  // Massive grid helper
  const gridHelper = new THREE.GridHelper(SETTINGS.GROUND_SIZE, SETTINGS.GROUND_SIZE / 10, 0x555555, 0x333333);
  gridHelper.position.y = 0.05;
  scene.add(gridHelper);
  currentWorldMeshes.push(gridHelper);

  addStaticBox(0, -0.5, 0, SETTINGS.GROUND_SIZE / 2, 0.5, SETTINGS.GROUND_SIZE / 2);

  const ambient = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambient);
  currentWorldMeshes.push(ambient);

  const sun = new THREE.DirectionalLight(0xffeedd, 1.0);
  sun.position.set(100, 200, 100);
  sun.castShadow = true;
  scene.add(sun);
  currentWorldMeshes.push(sun);

  console.log('[WorldManager] The Sandbox loaded');
}
