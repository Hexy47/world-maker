/**
 * graphics.js — Optimized Post-processing pipeline
 * Bloom runs at HALF resolution to save GPU.
 * All expensive effects are optional and off by default.
 */

import * as THREE from 'three';
import { EffectComposer, RenderPass, EffectPass, BloomEffect } from 'postprocessing';
import { SETTINGS } from '../game.config.js';

let composer = null;
let bloomEffect = null;
let sceneRef = null;
let cameraRef = null;
let rendererRef = null;

export function initPostProcessing(renderer, scene, camera) {
  sceneRef = scene;
  cameraRef = camera;
  rendererRef = renderer;

  // ── Renderer caps — most important perf settings ──────────────────────────
  renderer.setPixelRatio(1);              // NEVER allow > 1 on a game
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;  // only update shadows when things move
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  composer = new EffectComposer(renderer, {
    frameBufferType: THREE.HalfFloatType, // saves GPU memory vs full float
    multisampling: 0                      // no MSAA inside composer (SMAA handles AA)
  });

  // Pass 1: render scene
  composer.addPass(new RenderPass(scene, camera));

  // Bloom — QUARTER resolution to save GPU (biggest perf win for bloom)
  bloomEffect = new BloomEffect({
    luminanceThreshold: SETTINGS.BLOOM_THRESHOLD,
    luminanceSmoothing: 0.05,
    intensity:          SETTINGS.BLOOM_STRENGTH,
    mipmapBlur:         true,
    levels:             6,
    // Render bloom at 0.25x resolution — insane GPU savings, slightly fuzzier glow
    resolutionScale:    0.25
  });

  // Removed SMAA entirely because it crushes weak Windows PCs. 
  // Native MSAA or no AA is better for pure FPS.

  composer.addPass(new EffectPass(camera, bloomEffect));

  console.log('[Graphics] Post-processing initialized but currently BYPASSED for max FPS');
  return composer;
}

export function renderFrame() {
  // BYPASS COMPOSER: Render raw scene for massive FPS boost
  if (rendererRef && sceneRef && cameraRef) {
    rendererRef.render(sceneRef, cameraRef);
  }
}

export function resizeComposer(w, h) {
  if (composer) composer.setSize(w, h);
}

// ── God Panel hot-reload setters ─────────────────────────────────────────────
export function setBloomStrength(v) {
  if (bloomEffect) { bloomEffect.intensity = v; SETTINGS.BLOOM_STRENGTH = v; }
}
export function setBloomThreshold(v) {
  if (bloomEffect) { bloomEffect.luminanceThreshold = v; SETTINGS.BLOOM_THRESHOLD = v; }
}
export function setBloomRadius(v) {
  SETTINGS.BLOOM_RADIUS = v;
}

// ── Fog ───────────────────────────────────────────────────────────────────────
export function initFog(scene) {
  if (!SETTINGS.FOG_ENABLED) return;
  scene.fog = new THREE.FogExp2(SETTINGS.FOG_COLOR, SETTINGS.FOG_DENSITY);
}

export function setFogDensity(v) {
  if (sceneRef?.fog) { sceneRef.fog.density = v; SETTINGS.FOG_DENSITY = v; }
}
