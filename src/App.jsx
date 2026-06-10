import React, { Suspense, useState, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import { KeyboardControls, Stats } from '@react-three/drei';
import { SETTINGS } from '../game.config.js';
import { GTAWorld } from './components/GTAWorld';
import { Player } from './components/Player';
import { NetworkManager } from './components/NetworkManager';

import { UIOverlay } from './components/UIOverlay';

export default function App() {
  const [world, setWorld] = useState('sim'); // 'sandbox', 'lab', 'sim'
  const playerRef = useRef();

  return (
    <>
      <UIOverlay />

      <KeyboardControls
        map={[
          { name: 'forward', keys: ['ArrowUp', 'w', 'W'] },
          { name: 'backward', keys: ['ArrowDown', 's', 'S'] },
          { name: 'left', keys: ['ArrowLeft', 'a', 'A'] },
          { name: 'right', keys: ['ArrowRight', 'd', 'D'] },
          { name: 'jump', keys: ['Space'] },
          { name: 'sprint', keys: ['Shift'] },
        ]}
      >
        <Canvas dpr={1} camera={{ position: [0, 10, 0], fov: 75, near: 0.1, far: 2000 }}>
          <color attach="background" args={['#0a0a1a']} />
          <ambientLight intensity={SETTINGS.AMBIENT_INTENSITY} />
          <directionalLight position={[500, 500, -500]} intensity={SETTINGS.SUN_INTENSITY} />
          
          <Suspense fallback={null}>
            <Physics gravity={[0, SETTINGS.GRAVITY, 0]}>
              <GTAWorld />
              <Player ref={playerRef} />
              <NetworkManager localPlayerBodyRef={playerRef} />
            </Physics>
          </Suspense>

          <Stats />
        </Canvas>
      </KeyboardControls>
    </>
  );
}
