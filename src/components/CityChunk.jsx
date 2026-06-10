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

  const [physicsActive, setPhysicsActive] = useState(false);
  const visibleRef = useRef(true);
  const useBasicRef = useRef(false);

  // Compute exact center in World Coordinates
  const towerX = chunkData.cx * CHUNK_SIZE - CITY_EXTENT + CHUNK_SIZE / 2;
  const towerZ = chunkData.cz * CHUNK_SIZE - CITY_EXTENT + CHUNK_SIZE / 2;

  // Extract arrays for InstancedRigidBodies
  const instances = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const scales = new Float32Array(count * 3);
    const rotations = new Float32Array(count * 4); // quaternions
    
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
    }
    return { positions, scales, rotations };
  }, [buildings, count]);

  // Apply colors directly to InstancedMesh on mount and set Bounding Sphere
  useFrame(() => {
    if (meshRef.current && !meshRef.current.__colorsApplied) {
      for (let i = 0; i < count; i++) {
        meshRef.current.setColorAt(i, buildings[i].color);
      }
      meshRef.current.instanceColor.needsUpdate = true;
      
      // The Data Tower acts as the center of the chunk's spatial occlusion
      // We give it a massive 600m radius sphere. 
      // If this massive sphere leaves your screen (e.g. it's completely behind you), it is culled!
      meshRef.current.geometry.computeBoundingSphere();
      // FIX CULLING BUG: Set the bounding sphere center to the chunk's actual center (towerX, 0, towerZ)
      meshRef.current.boundingSphere = new THREE.Sphere(new THREE.Vector3(towerX, 0, towerZ), 600);
      
      meshRef.current.__colorsApplied = true;
    }
  });

  // Distance tracking for Culling & LOD & Physics (direct DOM/Three.js manipulation to avoid state updates)
  useFrame((state) => {
    if (!meshRef.current) return;

    const cam = state.camera.position;
    const dist = Math.hypot(towerX - cam.x, towerZ - cam.z);

    // 1. Frustum visibility culling based on distance
    const isVisible = dist <= 800;
    if (isVisible !== visibleRef.current) {
      visibleRef.current = isVisible;
      meshRef.current.visible = isVisible;
    }

    if (isVisible) {
      // 2. Material LOD (Basic vs Standard)
      const shouldBeBasic = dist > 300;
      if (shouldBeBasic !== useBasicRef.current) {
        useBasicRef.current = shouldBeBasic;
        meshRef.current.material = shouldBeBasic 
          ? (isDark ? darkMatBasic : neonMatBasic)
          : (isDark ? darkMatStandard : neonMatStandard);
      }

      // 3. Dynamic physics mounting (load <250m, unload >300m to avoid flickering)
      if (dist < 250) {
        if (!physicsActive) setPhysicsActive(true);
      } else if (dist > 300) {
        if (physicsActive) setPhysicsActive(false);
      }
    } else {
      if (physicsActive) setPhysicsActive(false);
    }
  });

  return (
    <group>
      {/* The visual mesh remains mounted. We control its visibility directly via meshRef.current.visible */}
      <instancedMesh
        ref={meshRef}
        args={[boxGeometry, isDark ? darkMatStandard : neonMatStandard, count]}
        frustumCulled={true}
      />
      
      {/* Physics colliders are only loaded when within 250m */}
      {physicsActive && (
        <InstancedRigidBodies
          positions={instances.positions}
          rotations={instances.rotations}
          scales={instances.scales}
          colliders="cuboid"
          type="fixed"
        >
          <instancedMesh args={[boxGeometry, null, count]} visible={false} />
        </InstancedRigidBodies>
      )}
    </group>
  );
}
