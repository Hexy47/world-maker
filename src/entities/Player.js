/**
 * Player.js — The Player Controller Entity
 * 
 * Handles reading from the Input system and applying movement to the Physics body.
 * Also perfectly interpolates the camera between physics ticks to guarantee smoothness.
 */

import * as THREE from 'three';
import { Input } from '../systems/Input.js';
import { SETTINGS } from '../../game.config.js';

export class Player {
  constructor(camera, startPos) {
    this.camera = camera;
    
    // Smooth camera rotation state
    this.pitch = 0; // up/down
    this.yaw = 0;   // left/right
    
    // Physics state
    this.velocity = new THREE.Vector3();
    this.onGround = false;
    
    // Interpolation state (where we were last tick, where we are now)
    this.prevPos = new THREE.Vector3(startPos.x, startPos.y, startPos.z);
    this.currPos = new THREE.Vector3(startPos.x, startPos.y, startPos.z);
    
    // We will bind this to Rapier later in physics.js refactor
    this.body = null;
    this.controller = null;

    // Set initial camera rotation
    this.camera.rotation.set(0, 0, 0);
  }

  /**
   * Called exactly 60 times a second by Time.js
   * Handles hard logic: reading input, collision, jumping
   */
  fixedUpdate(fixedDelta) {
    // 1. Handle Custom Mouse Look (from clamped Input system)
    const mouseDelta = Input.consumeMouseDelta();
    const sensitivity = 0.002;
    
    this.yaw -= mouseDelta.x * sensitivity;
    this.pitch -= mouseDelta.y * sensitivity;
    
    // Clamp pitch to strictly prevent breaking neck / 180 snap NaNs
    const PI_2 = Math.PI / 2 - 0.01;
    this.pitch = Math.max(-PI_2, Math.min(PI_2, this.pitch));

    // Apply rotation explicitly
    this.camera.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
    
    // 2. Movement Directions
    const forward = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(0, this.yaw, 0));
    const right = new THREE.Vector3(1, 0, 0).applyEuler(new THREE.Euler(0, this.yaw, 0));

    const moveDir = new THREE.Vector3();
    if (Input.isActionPressed('move_forward')) moveDir.add(forward);
    if (Input.isActionPressed('move_backward')) moveDir.sub(forward);
    if (Input.isActionPressed('move_right')) moveDir.add(right);
    if (Input.isActionPressed('move_left')) moveDir.sub(right);

    if (moveDir.lengthSq() > 0) moveDir.normalize();

    const speed = Input.isActionPressed('sprint') ? SETTINGS.PLAYER_SPEED * SETTINGS.PLAYER_SPRINT_MULT : SETTINGS.PLAYER_SPEED;

    // 3. Apply Gravity and Jump
    this.velocity.y += SETTINGS.GRAVITY * fixedDelta;
    this.velocity.y = Math.max(this.velocity.y, SETTINGS.TERMINAL_VELOCITY);

    if (Input.isActionPressed('jump') && this.onGround) {
      this.velocity.y = SETTINGS.JUMP_FORCE;
    }

    // 4. Send Desired Movement to Physics (Rapier handles collision)
    const desiredMove = {
      x: moveDir.x * speed * fixedDelta,
      y: this.velocity.y * fixedDelta,
      z: moveDir.z * speed * fixedDelta
    };

    // Save previous position for interpolation
    this.prevPos.copy(this.currPos);

    if (this.controller && this.body) {
      // Let Rapier resolve collisions
      this.controller.computeColliderMovement(
        this.body.collider(0),
        desiredMove,
        // Assuming RAPIER is global or we import it later
        window.RAPIER ? window.RAPIER.QueryFilterFlags.EXCLUDE_SENSORS : 0
      );

      const corrected = this.controller.computedMovement();
      const pos = this.body.translation();
      
      this.currPos.set(pos.x + corrected.x, pos.y + corrected.y, pos.z + corrected.z);
      
      // Update actual Rapier body
      this.body.setNextKinematicTranslation(this.currPos);
      
      this.onGround = this.controller.computedGrounded();
      if (this.onGround && this.velocity.y < 0) {
        this.velocity.y = -1; // small downward force to stick to ground slopes
      }
    } else {
      // Fallback if physics isn't loaded yet (just fly)
      this.currPos.add(desiredMove);
    }
  }

  /**
   * Called every single frame as fast as the monitor can run.
   * Interpolates the camera between prevPos and currPos based on alpha.
   */
  renderUpdate(alpha) {
    // Smoothly glide camera between the last physics tick and the current one.
    // This makes movement perfectly smooth even if Physics is 60fps and Render is 144fps.
    const interpPos = new THREE.Vector3().lerpVectors(this.prevPos, this.currPos, alpha);
    
    this.camera.position.set(
      interpPos.x,
      interpPos.y + SETTINGS.EYE_HEIGHT,
      interpPos.z
    );
  }
}
