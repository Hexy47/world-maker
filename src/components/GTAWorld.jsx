import React, { useMemo } from 'react';
import { generateCityData } from '../utils/worldGenerator';
import { CityChunk } from './CityChunk';
import { DataTower } from './DataTower';
import { RigidBody } from '@react-three/rapier';

const CHUNK_SIZE = 400;
const CITY_EXTENT = 1200;

export function GTAWorld() {
  // Generate the massive world data once on mount
  const cityData = useMemo(() => generateCityData(), []);
  const chunkKeys = Object.keys(cityData);

  return (
    <group>
      {/* Massive City Floor with Physics */}
      <RigidBody type="fixed" colliders="cuboid" position={[0, -0.5, 0]}>
        <mesh>
          <boxGeometry args={[4000, 1, 4000]} />
          <meshStandardMaterial color={0x111111} roughness={0.9} />
        </mesh>
      </RigidBody>

      {/* Render all chunks */}
      {chunkKeys.map(key => {
        const chunk = cityData[key];
        // Only spawn DataTower in roughly 1/3 of the chunks using a deterministic modulo check
        const shouldSpawnTower = (Math.abs(chunk.cx + chunk.cz * 3) % 3) === 0;

        return (
          <group key={key}>
            <CityChunk chunkData={chunk} isDark={true} />
            <CityChunk chunkData={chunk} isDark={false} />
            
            {shouldSpawnTower && (
              <DataTower 
                position={[
                  chunk.cx * CHUNK_SIZE - CITY_EXTENT + CHUNK_SIZE / 2, 
                  0, 
                  chunk.cz * CHUNK_SIZE - CITY_EXTENT + CHUNK_SIZE / 2
                ]} 
              />
            )}
          </group>
        );
      })}
    </group>
  );
}
