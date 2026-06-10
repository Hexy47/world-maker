import React, { useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { RigidBody, useRapier } from '@react-three/rapier';
import { useKeyboardControls } from '@react-three/drei';
import * as THREE from 'three';

const SPEED = 25;
const SPRINT_MULT = 3;
const JUMP_FORCE = 15;

export const Player = React.forwardRef(({ spawnPosition = [0, 10, 0] }, ref) => {
  const [, getKeys] = useKeyboardControls();
  const { camera } = useThree();
  const { rapier, world } = useRapier();

  // Mouse look state
  const pitchRef = useRef(0);
  const yawRef = useRef(0);

  // Bind mouse movement
  React.useEffect(() => {
    const handleMouseMove = (e) => {
      if (document.pointerLockElement) {
        let mx = e.movementX;
        let my = e.movementY;
        // Clamp extreme mouse deltas to prevent the 180-degree snap glitch
        if (Math.abs(mx) > 100) mx = Math.sign(mx) * 100;
        if (Math.abs(my) > 100) my = Math.sign(my) * 100;
        
        yawRef.current -= mx * 0.002;
        pitchRef.current -= my * 0.002;
        pitchRef.current = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitchRef.current));
      }
    };
    document.addEventListener('mousemove', handleMouseMove);
    return () => document.removeEventListener('mousemove', handleMouseMove);
  }, []);

  // Lock pointer on click
  React.useEffect(() => {
    const handleClick = () => {
      try {
        const promise = document.body.requestPointerLock({
          unadjustedMovement: true,
        });
        if (promise && promise.catch) {
          promise.catch(() => {
            document.body.requestPointerLock();
          });
        }
      } catch (err) {
        document.body.requestPointerLock();
      }
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  useFrame((state, delta) => {
    if (!ref.current) return;
    
    const keys = getKeys();
    
    // Apply camera rotation based on mouse
    camera.quaternion.setFromEuler(new THREE.Euler(pitchRef.current, yawRef.current, 0, 'YXZ'));
    
    // Movement logic
    const forward = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(0, yawRef.current, 0));
    const right = new THREE.Vector3(1, 0, 0).applyEuler(new THREE.Euler(0, yawRef.current, 0));
    
    const moveDir = new THREE.Vector3();
    if (keys.forward) moveDir.add(forward);
    if (keys.backward) moveDir.sub(forward);
    if (keys.right) moveDir.add(right);
    if (keys.left) moveDir.sub(right);
    
    if (moveDir.lengthSq() > 0) moveDir.normalize();

    const speed = keys.sprint ? SPEED * SPRINT_MULT : SPEED;
    
    // Get current velocity from Rapier
    const linvel = ref.current.linvel();
    const currentVelocity = new THREE.Vector3(linvel.x, linvel.y, linvel.z);
    
    // Apply horizontal movement (we don't use character controller here for simplicity, raw impulses work well in R3F, 
    // but kinematic position based is safer. Let's use kinematic position based!)
    
    // Actually, dynamic rigidbodies with locked rotations are perfectly stable in React Rapier!
    currentVelocity.x = moveDir.x * speed;
    currentVelocity.z = moveDir.z * speed;

    // Raycast down to check if grounded
    const rayOrigin = ref.current.translation();
    rayOrigin.y -= 1.0; // slightly above bottom of capsule
    const rayDir = { x: 0, y: -1, z: 0 };
    const ray = new rapier.Ray(rayOrigin, rayDir);
    const hit = world.castRay(ray, 0.2, true);
    const onGround = hit !== null;

    if (keys.jump && onGround) {
      currentVelocity.y = JUMP_FORCE;
    }

    ref.current.setLinvel(currentVelocity, true);
    
    // Sync Camera to Body perfectly
    const pos = ref.current.translation();
    camera.position.set(pos.x, pos.y + 0.8, pos.z);
  });

  return (
    <RigidBody 
      ref={ref} 
      colliders="capsule" 
      mass={1} 
      type="dynamic" 
      position={spawnPosition} 
      enabledRotations={[false, false, false]} 
      friction={0} // No friction so we don't stick to walls
    >
      <mesh visible={false}>
        <capsuleGeometry args={[0.7, 0.8]} />
        <meshBasicMaterial color="red" />
      </mesh>
    </RigidBody>
  );
});
