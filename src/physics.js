/**
 * physics.js — Rapier Physics Engine (System Level)
 * Exposes the physics world and helper functions for creating rigid bodies.
 * The game loop (Time.js) is now responsible for calling world.step().
 */

import RAPIER from '@dimforge/rapier3d-compat';
import { SETTINGS } from '../game.config.js';

let world = null;
let initialized = false;

// ─── Init ────────────────────────────────────────────────────────────────────
export async function initPhysics() {
  await RAPIER.init();
  world = new RAPIER.World({ x: 0, y: SETTINGS.GRAVITY, z: 0 });
  initialized = true;
  
  // Make RAPIER available globally for the Player.js controller flags
  window.RAPIER = RAPIER;
  
  console.log('[Physics System] Rapier initialized');
  return world;
}

export function clearPhysicsWorld() {
  if (world) {
    world.free();
  }
  world = new RAPIER.World({ x: 0, y: SETTINGS.GRAVITY, z: 0 });
  console.log('[Physics System] World cleared and reset');
}

export function stepWorld() {
  if (initialized && world) {
    world.step();
  }
}

// ─── Static ground / building collider ───────────────────────────────────────
export function addStaticBox(x, y, z, hw, hh, hd) {
  if (!world) return null;
  const bodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z);
  const body = world.createRigidBody(bodyDesc);
  const col = RAPIER.ColliderDesc.cuboid(hw, hh, hd)
    .setFriction(0.8)
    .setRestitution(0.0);
  world.createCollider(col, body);
  return body;
}

// ─── Dynamic block (falls, stacks) ───────────────────────────────────────────
export function addDynamicBlock(x, y, z, size) {
  if (!world) return null;
  const half = size / 2;
  const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(x, y, z)
    .setAdditionalMass(SETTINGS.BLOCK_MASS);
  const body = world.createRigidBody(bodyDesc);
  const col = RAPIER.ColliderDesc.cuboid(half, half, half)
    .setFriction(SETTINGS.BLOCK_FRICTION)
    .setRestitution(SETTINGS.BLOCK_RESTITUTION);
  world.createCollider(col, body);
  return body;
}

// ─── Trimesh Collider (For large imported GLTFs) ─────────────────────────────
export function createTrimeshCollider(meshGroup) {
  if (!world) return null;

  meshGroup.traverse((child) => {
    if (child.isMesh && child.geometry) {
      const geometry = child.geometry;
      const vertices = geometry.attributes.position.array;
      let indices;
      
      if (geometry.index) {
        indices = geometry.index.array;
      } else {
        indices = new Uint32Array(vertices.length / 3);
        for (let i = 0; i < indices.length; i++) indices[i] = i;
      }

      // Extract world transform
      const pos = new THREE.Vector3();
      const rot = new THREE.Quaternion();
      const scale = new THREE.Vector3();
      child.matrixWorld.decompose(pos, rot, scale);

      // CRITICAL FIX: Rapier trimesh uses raw local vertices, so we must manually apply the scale
      const scaledVertices = new Float32Array(vertices.length);
      for (let i = 0; i < vertices.length; i += 3) {
        scaledVertices[i]   = vertices[i]   * scale.x;
        scaledVertices[i+1] = vertices[i+1] * scale.y;
        scaledVertices[i+2] = vertices[i+2] * scale.z;
      }

      const colliderDesc = RAPIER.ColliderDesc.trimesh(
        scaledVertices,
        new Uint32Array(indices)
      );

      const rigidBodyDesc = RAPIER.RigidBodyDesc.fixed();
      
      // Apply the mesh's world position/rotation
      rigidBodyDesc.setTranslation(pos.x, pos.y, pos.z);
      rigidBodyDesc.setRotation({ x: rot.x, y: rot.y, z: rot.z, w: rot.w });

      const body = world.createRigidBody(rigidBodyDesc);
      world.createCollider(colliderDesc, body);
    }
  });
}

// ─── Create Player Controller ───────────────────────────────────────────────
export function createPlayerPhysics(x, y, z) {
  if (!world) return null;

  const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
    .setTranslation(x, y, z);
  const playerBody = world.createRigidBody(bodyDesc);

  const colliderDesc = RAPIER.ColliderDesc.capsule(0.7, 0.4)
    .setFriction(SETTINGS.PLAYER_FRICTION)
    .setRestitution(SETTINGS.PLAYER_RESTITUTION);
  world.createCollider(colliderDesc, playerBody);

  const playerController = world.createCharacterController(0.05);
  playerController.setSlideEnabled(true);
  playerController.setMaxSlopeClimbAngle(45 * Math.PI / 180);
  playerController.setMinSlopeSlideAngle(30 * Math.PI / 180);
  playerController.enableAutostep(0.5, 0.2, true);
  playerController.enableSnapToGround(0.5);

  return { playerBody, playerController };
}

// ─── Hot reload ──────────────────────────────────────────────────────────────
export function setGravity(g) {
  if (!world) return;
  world.gravity.y = g; 
  SETTINGS.GRAVITY = g;
}

export function getWorld() { return world; }
