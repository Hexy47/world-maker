import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RigidBody } from '@react-three/rapier';
import * as THREE from 'three';

export function DataTower({ position }) {
  const ringsRef = useRef([]);
  const coreRef = useRef();

  useFrame((state, delta) => {
    const time = state.clock.elapsedTime;
    
    if (ringsRef.current[0]) ringsRef.current[0].rotation.y = time * 1.5;
    if (ringsRef.current[1]) ringsRef.current[1].rotation.x = time * 2.0;
    if (ringsRef.current[2]) ringsRef.current[2].rotation.z = time * 1.2;

    if (coreRef.current) {
      coreRef.current.position.y = 220 + Math.sin(time * 2) * 5;
    }
  });

  return (
    <group position={position}>
      {/* Massive collision base */}
      <RigidBody type="fixed" colliders="cuboid">
        <mesh position={[0, 90, 0]}>
          <boxGeometry args={[26, 180, 26]} />
          <meshStandardMaterial color={0x111111} roughness={0.9} />
        </mesh>
      </RigidBody>

      {/* Floating Core */}
      <mesh ref={coreRef} position={[0, 220, 0]}>
        <octahedronGeometry args={[14, 0]} />
        <meshStandardMaterial color={0xff00ff} emissive={0xff00ff} emissiveIntensity={2} />
      </mesh>

      {/* Rotating Rings */}
      <group position={[0, 220, 0]}>
        {[24, 38, 52].map((radius, i) => (
          <mesh key={i} ref={(el) => (ringsRef.current[i] = el)}>
            <torusGeometry args={[radius, 1.5, 16, 64]} />
            <meshBasicMaterial color={0x00ffff} />
          </mesh>
        ))}
      </group>

      {/* Ground Ring (LOD alternative to the massive sphere) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.1, 0]}>
        <ringGeometry args={[260, 270, 64]} />
        <meshBasicMaterial color={0x00ffff} transparent opacity={0.5} side={THREE.DoubleSide} />
      </mesh>

      {/* Central Laser Beam */}
      <mesh position={[0, 900, 0]}>
        <cylinderGeometry args={[8, 8, 1800, 16]} />
        <meshBasicMaterial color={0xff00ff} transparent opacity={0.3} blending={THREE.AdditiveBlending} />
      </mesh>
    </group>
  );
}
