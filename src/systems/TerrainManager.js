import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { getWorld } from '../physics.js';

let terrainMesh = null;
let terrainCollider = null;
let terrainBody = null;
let heightData = null;
let segments = 128;
let size = 200;

export function initTerrain(scene, terrainSize = 200, terrainSegments = 128) {
  size = terrainSize;
  segments = terrainSegments;

  // Visual Mesh (High vertex density for sculpting)
  const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
  geometry.rotateX(-Math.PI / 2); // Lay flat
  
  const material = new THREE.MeshStandardMaterial({
    color: 0x3d4f35, // Natural grass green
    roughness: 0.8,
    metalness: 0.1,
    flatShading: true // Gives a nice stylized/low-poly sculpted look
  });

  terrainMesh = new THREE.Mesh(geometry, material);
  terrainMesh.receiveShadow = true;
  terrainMesh.castShadow = true;
  terrainMesh.name = 'Terrain'; // Tag for raycasting
  scene.add(terrainMesh);

  // Physics Heightfield
  initPhysicsCollider();

  return terrainMesh;
}

function initPhysicsCollider() {
  const world = getWorld();
  if (!world) return;

  const numRows = segments + 1;
  const numCols = segments + 1;
  
  if (!heightData) {
    heightData = new Float32Array(numRows * numCols);
  }

  // If we already have a body, we just remove the old collider
  if (!terrainBody) {
    const bodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(0, 0, 0);
    terrainBody = world.createRigidBody(bodyDesc);
  } else if (terrainCollider) {
    world.removeCollider(terrainCollider);
  }

  // Rapier heightfield scale must match the physical size of the mesh
  const scale = new RAPIER.Vector3(size, 1.0, size);
  
  // Create heightfield collider
  const colliderDesc = RAPIER.ColliderDesc.heightfield(segments, segments, heightData, scale)
    .setFriction(0.8)
    .setRestitution(0.0);
    
  terrainCollider = world.createCollider(colliderDesc, terrainBody);
}

/**
 * Sculpts the terrain by modifying vertex heights.
 * @param {THREE.Vector3} point The world intersection point from the raycaster
 * @param {number} radius Brush radius
 * @param {number} intensity Brush strength
 * @param {string} mode 'raise', 'lower', or 'flatten'
 */
export function sculptTerrain(point, radius, intensity, mode = 'raise') {
  if (!terrainMesh) return false;

  const positions = terrainMesh.geometry.attributes.position.array;
  const numRows = segments + 1;
  const numCols = segments + 1;

  let modified = false;

  for (let i = 0; i < positions.length; i += 3) {
    const vx = positions[i];
    const vy = positions[i + 1]; // Y is up
    const vz = positions[i + 2];

    const dx = vx - point.x;
    const dz = vz - point.z;
    const distSq = dx * dx + dz * dz;
    const radiusSq = radius * radius;

    if (distSq < radiusSq) {
      // Smooth bell-curve falloff based on distance
      const falloff = 1.0 - Math.sqrt(distSq) / radius;
      const delta = intensity * Math.pow(falloff, 2);

      if (mode === 'raise') {
        positions[i + 1] += delta;
      } else if (mode === 'lower') {
        positions[i + 1] -= delta;
      } else if (mode === 'flatten') {
        // Move towards the target point's Y smoothly
        positions[i + 1] += (point.y - positions[i + 1]) * (delta * 0.5);
      }

      // Update the physics heightmap array
      // We map the vertex index to the Rapier heightData array.
      // Rapier expects the data to match its internal grid orientation.
      const vIdx = i / 3;
      const col = vIdx % numCols;
      const row = Math.floor(vIdx / numCols);
      
      // Update heightData array
      heightData[col * numRows + row] = positions[i + 1];
      modified = true;
    }
  }

  if (modified) {
    // Notify Three.js to re-upload to GPU
    terrainMesh.geometry.attributes.position.needsUpdate = true;
    // Recompute normals so lighting updates on the new hills
    terrainMesh.geometry.computeVertexNormals();
    return true; // Indicates we need to update physics later
  }
  return false;
}

/**
 * Call this on MouseUp to commit the physics changes, 
 * avoiding massive lag during the drag stroke.
 */
export function commitTerrainPhysics() {
  if (!terrainMesh) return;
  initPhysicsCollider();
}

export function getTerrainMesh() {
  return terrainMesh;
}
