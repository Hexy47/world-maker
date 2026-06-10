import React, { useRef, useMemo, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { InstancedRigidBodies } from '@react-three/rapier';
import * as THREE from 'three';

const CHUNK_SIZE = 400;
const CITY_EXTENT = 1200;

const darkMatStandard = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0.3, vertexColors: true });
const neonMatStandard = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1.0, roughness: 0.6, metalness: 0.3, vertexColors: true });
const darkMatBasic = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true });
const neonMatBasic = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true });
const boxGeometry = new THREE.BoxGeometry(1, 1, 1);

export function CityChunk({ chunkData, isDark }) {
  const meshRef = useRef();
  const buildings = isDark ? chunkData.dark : chunkData.neon;
  const count = buildings.length;
  
  if (count === 0) return null;

  const [visible, setVisible] = useState(true);
  const [useBasic, setUseBasic] = useState(false);

  // Compute exact center in World Coordinates
  const towerX = chunkData.cx * CHUNK_SIZE - CITY_EXTENT + CHUNK_SIZE / 2;
  const towerZ = chunkData.cz * CHUNK_SIZE - CITY_EXTENT + CHUNK_SIZE / 2;

  // Extract arrays for InstancedRigidBodies
  const instances = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const scales = new Float32Array(count * 3);
    const rotations = new Float32Array(count * 4); // quaternions
    const colors = new Float32Array(count * 3);
    
    for (let i = 0; i < count; i++) {
      const b = buildings[i];
      positions[i * 3 + 0] = b.x;
      positions[i * 3 + 1] = b.y;
      positions[i * 3 + 2] = b.z;
      
      scales[i * 3 + 0] = b.width;
      scales[i * 3 + 1] = b.height;
      scales[i * 3 + 2] = b.depth;
      
      rotations[i * 4 + 0] = 0;
      rotations[i * 4 + 1] = 0;
      rotations[i * 4 + 2] = 0;
      rotations[i * 4 + 3] = 1;
      
      colors[i * 3 + 0] = b.color.r;
      colors[i * 3 + 1] = b.color.g;
      colors[i * 3 + 2] = b.color.b;
    }
    return { positions, scales, rotations, colors };
  }, [buildings, count]);

  // Apply colors directly to InstancedMesh on mount
  useFrame(() => {
    if (meshRef.current && !meshRef.current.__colorsApplied) {
      for (let i = 0; i < count; i++) {
        meshRef.current.setColorAt(i, buildings[i].color);
      }
      meshRef.current.instanceColor.needsUpdate = true;
      meshRef.current.__colorsApplied = true;
    }
  });

  // Distance tracking for Culling & LOD
  useFrame((state) => {
    const cam = state.camera.position;
    const dist = Math.hypot(towerX - cam.x, towerZ - cam.z);

    if (dist > 800) {
      if (visible) setVisible(false);
    } else {
      if (!visible) setVisible(true);
      
      const shouldBeBasic = dist > 600;
      if (shouldBeBasic !== useBasic) {
        setUseBasic(shouldBeBasic);
      }
    }
  });

  const material = useBasic 
    ? (isDark ? darkMatBasic : neonMatBasic)
    : (isDark ? darkMatStandard : neonMatStandard);

  return (
    <group visible={visible}>
      {/* 
        InstancedRigidBodies creates one physics collider per instance automatically!
        It syncs position and scale perfectly.
      */}
      <InstancedRigidBodies
        positions={instances.positions}
        rotations={instances.rotations}
        scales={instances.scales}
        colliders="cuboid"
      >
        <instancedMesh
          ref={meshRef}
          args={[boxGeometry, material, count]}
          frustumCulled={false} // Disable screen culling
        />
      </InstancedRigidBodies>
    </group>
  );
}
