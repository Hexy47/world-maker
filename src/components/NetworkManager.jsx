import React, { useEffect, useState, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { io } from 'socket.io-client';
import * as THREE from 'three';

let socket;

export function NetworkManager({ localPlayerBodyRef }) {
  const [players, setPlayers] = useState({});
  const lastEmitRef = useRef(0);

  useEffect(() => {
    socket = io();
    
    socket.on('init', (data) => {
      // We don't need to do anything special here in React yet
    });

    socket.on('currentPlayers', (serverPlayers) => {
      setPlayers(prev => {
        const next = { ...prev };
        for (let id in serverPlayers) {
          if (id !== socket.id) next[id] = serverPlayers[id];
        }
        return next;
      });
    });

    socket.on('newPlayer', (playerInfo) => {
      setPlayers(prev => ({ ...prev, [playerInfo.playerId]: playerInfo }));
    });

    socket.on('playerDisconnected', (playerId) => {
      setPlayers(prev => {
        const next = { ...prev };
        delete next[playerId];
        return next;
      });
    });

    socket.on('playerMoved', (playerInfo) => {
      setPlayers(prev => {
        if (!prev[playerInfo.playerId]) return prev;
        return {
          ...prev,
          [playerInfo.playerId]: {
            ...prev[playerInfo.playerId],
            position: playerInfo.position,
            rotation: playerInfo.rotation
          }
        };
      });
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // Broadcast our local player's position
  useFrame((state, delta) => {
    if (!socket || !localPlayerBodyRef?.current) return;
    
    const time = state.clock.elapsedTime * 1000;
    // Throttle network emits to ~15Hz to save bandwidth
    if (time - lastEmitRef.current > 66) {
      const pos = localPlayerBodyRef.current.translation();
      const rot = state.camera.rotation;
      socket.emit('move', { position: pos, rotation: rot });
      lastEmitRef.current = time;
    }
  });

  return (
    <group>
      {Object.values(players).map(p => (
        <RemotePlayer key={p.playerId} playerInfo={p} />
      ))}
    </group>
  );
}

function RemotePlayer({ playerInfo }) {
  const meshRef = useRef();

  useFrame((state, delta) => {
    if (!meshRef.current || !playerInfo.position) return;
    
    // Smooth interpolation for remote players
    const targetPos = new THREE.Vector3(playerInfo.position.x, playerInfo.position.y - 1, playerInfo.position.z);
    meshRef.current.position.lerp(targetPos, 0.2);
    
    if (playerInfo.rotation) {
      meshRef.current.rotation.y = playerInfo.rotation._y;
    }
  });

  return (
    <group ref={meshRef}>
      {/* Player Body */}
      <mesh position={[0, 1, 0]}>
        <cylinderGeometry args={[0.5, 0.5, 2]} />
        <meshStandardMaterial color={playerInfo.isGod ? 0xff00ff : 0x0088ff} />
      </mesh>
      
      {/* Visor */}
      <mesh position={[0, 1.5, 0.4]}>
        <boxGeometry args={[0.6, 0.3, 0.3]} />
        <meshStandardMaterial color={0x000000} />
      </mesh>
    </group>
  );
}
