/**
 * physics.js — Rapier Physics Engine wrapper
 * Handles: world init, player capsule, static colliders, block bodies
 * All tunable values come from game.config.js → editable in God Panel
 */

import RAPIER from '@dimforge/rapier3d-compat';
import { SETTINGS } from '../game.config.js';

let world = null;
let playerBody = null;
let playerController = null;
let initialized = false;

// ─── Init ────────────────────────────────────────────────────────────────────
export async function initPhysics() {
  await RAPIER.init();

  world = new RAPIER.World({ x: 0, y: SETTINGS.GRAVITY, z: 0 });

  // Character controller — handles slope climbing, step-ups, snap-to-ground
  playerController = world.createCharacterController(0.05);
  playerController.setSlideEnabled(true);
  playerController.setMaxSlopeClimbAngle(45 * Math.PI / 180);
  playerController.setMinSlopeSlideAngle(30 * Math.PI / 180);
  playerController.enableAutostep(0.5, 0.2, true);
  playerController.enableSnapToGround(0.5);

  initialized = true;
  console.log('[Physics] Rapier initialized');
  return world;
}

// ─── Player capsule (created after init) ─────────────────────────────────────
export function createPlayerBody(x, y, z) {
  const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
    .setTranslation(x, y, z);
  playerBody = world.createRigidBody(bodyDesc);

  // Capsule collider: radius 0.4m, half-height 0.7m = total 1.8m player
  const colliderDesc = RAPIER.ColliderDesc.capsule(0.7, 0.4)
    .setFriction(SETTINGS.PLAYER_FRICTION)
    .setRestitution(SETTINGS.PLAYER_RESTITUTION);
  world.createCollider(colliderDesc, playerBody);

  return playerBody;
}

// ─── Static ground / building collider ───────────────────────────────────────
export function addStaticBox(x, y, z, hw, hh, hd) {
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

// ─── Step + Player Movement ───────────────────────────────────────────────────
let verticalVelocity = 0;
let onGround = false;

export function stepPhysics(delta, moveInput) {
  if (!initialized || !world || !playerBody) return null;

  const { forward, right, jump } = moveInput;

  // Apply gravity to vertical velocity
  verticalVelocity += SETTINGS.GRAVITY * delta;
  verticalVelocity = Math.max(verticalVelocity, SETTINGS.TERMINAL_VELOCITY);

  // Jump
  if (jump && onGround) {
    verticalVelocity = SETTINGS.JUMP_FORCE;
  }

  // Desired movement this frame
  const desiredMove = {
    x: (right  * SETTINGS.PLAYER_SPEED) * delta,
    y: verticalVelocity * delta,
    z: (forward * SETTINGS.PLAYER_SPEED) * delta
  };

  // Let Rapier's character controller compute actual movement (handles collisions)
  playerController.computeColliderMovement(
    playerBody.collider(0),
    desiredMove,
    RAPIER.QueryFilterFlags.EXCLUDE_SENSORS
  );

  const corrected = playerController.computedMovement();
  const pos = playerBody.translation();
  playerBody.setNextKinematicTranslation({
    x: pos.x + corrected.x,
    y: pos.y + corrected.y,
    z: pos.z + corrected.z
  });

  // Check if grounded
  onGround = playerController.computedGrounded();
  if (onGround && verticalVelocity < 0) verticalVelocity = 0;

  world.step();

  return playerBody.translation();
}

// ─── Gravity hot-reload (called from God Panel sliders) ──────────────────────
export function setGravity(g) {
  if (!world) return;
  world.gravity = { x: 0, y: g, z: 0 };
  SETTINGS.GRAVITY = g;
}

export function setPlayerSpeed(s) { SETTINGS.PLAYER_SPEED = s; }
export function setJumpForce(j)   { SETTINGS.JUMP_FORCE = j; }

export function isGrounded() { return onGround; }
export function getWorld()   { return world; }
