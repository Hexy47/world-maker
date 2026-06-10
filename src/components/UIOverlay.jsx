import React, { useState, useEffect } from 'react';

export function UIOverlay() {
  const [isPaused, setIsPaused] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showShift, setShowShift] = useState(false);
  const [fps, setFps] = useState(0);

  // FPS Tracker
  useEffect(() => {
    let frameCount = 0;
    let lastTime = performance.now();
    let animFrame;

    const tick = () => {
      const now = performance.now();
      frameCount++;
      if (now - lastTime >= 1000) {
        setFps(frameCount);
        frameCount = 0;
        lastTime = now;
      }
      animFrame = requestAnimationFrame(tick);
    };
    animFrame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animFrame);
  }, []);

  // Listen for pointer lock changes to handle Pause menu
  useEffect(() => {
    const handlePointerLock = () => {
      if (!document.pointerLockElement) {
        setIsPaused(true);
      } else {
        setIsPaused(false);
        setShowSettings(false);
        setShowShift(false);
      }
    };
    document.addEventListener('pointerlockchange', handlePointerLock);
    return () => document.removeEventListener('pointerlockchange', handlePointerLock);
  }, []);

  // Listen for 'Q' to open God Menu
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'q' || e.key === 'Q') {
        if (document.pointerLockElement) {
          document.exitPointerLock();
        }
        setShowShift(prev => !prev);
        setIsPaused(false);
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, []);

  const lockPointer = () => {
    try {
      const promise = document.body.requestPointerLock({
        unadjustedMovement: true,
      });
      if (promise && promise.catch) {
        promise.catch(() => document.body.requestPointerLock());
      }
    } catch (err) {
      document.body.requestPointerLock();
    }
  };

  return (
    <div id="ui-layer" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 10 }}>
      
      {/* Crosshair */}
      <div style={{
        position: 'absolute', top: '50%', left: '50%', width: '10px', height: '10px',
        backgroundColor: 'rgba(0, 255, 0, 0.8)', borderRadius: '50%',
        transform: 'translate(-50%, -50%)'
      }}></div>

      {/* FPS Counter */}
      <div style={{
        position: 'absolute', top: '10px', right: '10px', color: '#00ff00',
        fontFamily: 'monospace', fontSize: '16px', background: 'rgba(0,0,0,0.5)', padding: '5px'
      }}>
        FPS: {fps}
      </div>

      {/* Pause Menu */}
      {isPaused && !showSettings && !showShift && (
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          background: 'rgba(0,0,0,0.8)', padding: '40px', borderRadius: '10px', textAlign: 'center',
          pointerEvents: 'auto', color: 'white'
        }}>
          <h1>PAUSED</h1>
          <button style={btnStyle} onClick={lockPointer}>Resume Game</button>
          <button style={btnStyle} onClick={() => setShowSettings(true)}>Settings</button>
          <button style={{...btnStyle, background: '#ff4444'}}>Leave Game</button>
        </div>
      )}

      {/* Settings Menu */}
      {showSettings && (
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          background: 'rgba(0,0,0,0.8)', padding: '40px', borderRadius: '10px', textAlign: 'center',
          pointerEvents: 'auto', color: 'white'
        }}>
          <h2>Settings</h2>
          <button style={btnStyle} onClick={() => setShowSettings(false)}>Back</button>
        </div>
      )}

      {/* God Menu */}
      {showShift && (
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          background: 'rgba(0,0,0,0.9)', padding: '40px', borderRadius: '10px', textAlign: 'center',
          pointerEvents: 'auto', color: 'white', border: '2px solid gold'
        }}>
          <h1 style={{ color: 'gold' }}>God Menu: World Shift</h1>
          <p>Administrative privileges active.</p>
          <button style={shiftBtnStyle}>Load The Sandbox</button>
          <button style={shiftBtnStyle}>Load The Lab</button>
          <button style={shiftBtnStyle}>Load The Sim (GTA City)</button>
          <button style={btnStyle} onClick={() => { setShowShift(false); lockPointer(); }}>Close Panel (Q)</button>
        </div>
      )}

    </div>
  );
}

const btnStyle = {
  display: 'block', width: '200px', margin: '10px auto', padding: '15px',
  background: '#444', color: 'white', border: 'none', borderRadius: '5px',
  cursor: 'pointer', fontSize: '18px', textTransform: 'uppercase'
};

const shiftBtnStyle = {
  ...btnStyle,
  background: 'linear-gradient(45deg, #1a1a1a, #333)',
  border: '1px solid gold'
};
