/**
 * graphics.js — Post-processing pipeline
 * Bloom (neon glow), SMAA (anti-aliasing), Fog
 * All tunable from game.config.js or God Panel
 */

import * as THREE from 'three';
import { EffectComposer, RenderPass, EffectPass, BloomEffect, SMAAEffect } from 'postprocessing';
import { SETTINGS } from '../game.config.js';

let composer = null;
let bloomEffect = null;

export function initPostProcessing(renderer, scene, camera) {
  composer = new EffectComposer(renderer);

  // Pass 1: render the scene normally
  composer.addPass(new RenderPass(scene, camera));

  // Bloom — the neon glow effect
  bloomEffect = new BloomEffect({
    luminanceThreshold: SETTINGS.BLOOM_THRESHOLD,
    luminanceSmoothing: 0.03,
    intensity:          SETTINGS.BLOOM_STRENGTH,
    mipmapBlur:         true,
    radius:             SETTINGS.BLOOM_RADIUS
  });

  // SMAA — smooth anti-aliasing (lightweight, no antialias needed on renderer)
  const smaaEffect = new SMAAEffect();

  // Single merged pass = fewer GPU state changes
  composer.addPass(new EffectPass(camera, bloomEffect, smaaEffect));

  console.log('[Graphics] Post-processing ready: Bloom + SMAA');
  return composer;
}

// Called every frame instead of renderer.render()
export function renderFrame(delta) {
  if (composer) composer.render(delta);
}

// Called on window resize
export function resizeComposer(w, h) {
  if (composer) composer.setSize(w, h);
}

// God Panel hot-reload setters
export function setBloomStrength(v) {
  if (bloomEffect) { bloomEffect.intensity = v; SETTINGS.BLOOM_STRENGTH = v; }
}
export function setBloomThreshold(v) {
  if (bloomEffect) { bloomEffect.luminanceThreshold = v; SETTINGS.BLOOM_THRESHOLD = v; }
}
export function setBloomRadius(v) {
  if (bloomEffect) { bloomEffect.mipmapBlurPass.radius = v; SETTINGS.BLOOM_RADIUS = v; }
}

// ─── Scene fog (applied once to scene) ───────────────────────────────────────
export function initFog(scene) {
  if (!SETTINGS.FOG_ENABLED) return;
  scene.fog = new THREE.FogExp2(SETTINGS.FOG_COLOR, SETTINGS.FOG_DENSITY);
  console.log('[Graphics] Fog enabled');
}

export function setFogDensity(v) {
  if (scene?.fog) { scene.fog.density = v; SETTINGS.FOG_DENSITY = v; }
}
