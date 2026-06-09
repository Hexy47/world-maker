/**
 * Time.js — Fixed Time Step Engine Loop
 * 
 * In AAA engines, Physics and Rendering do not run at the same speed.
 * Rendering runs as fast as the monitor allows (FPS).
 * Physics MUST run at a constant speed (e.g., 60 times a second).
 * 
 * If the game lags and FPS drops to 10, the physics engine will run 6 times
 * in a single frame to catch up. This guarantees NO TELEPORTING and no clipping.
 */

export class TimeSystem {
  constructor() {
    this.lastTime = performance.now();
    this.accumulator = 0;
    
    // The physics simulation will ALWAYS step forward by exactly 1/60th of a second.
    this.fixedDelta = 1 / 60; 
    
    // Maximum time we will allow the game to process in a single frame.
    // If the browser tab is frozen for 5 seconds, we don't want to run 300 physics steps
    // when we return, which would crash the game. This caps it.
    this.maxFrameTime = 0.25; 
  }

  /**
   * Called every requestAnimationFrame
   * @param {function} updatePhysics - Callback that steps the physics engine and player logic
   * @param {function} updateRender - Callback that updates graphics and renders the scene
   */
  tick(updatePhysics, updateRender) {
    const currentTime = performance.now();
    let frameTime = (currentTime - this.lastTime) / 1000; // convert ms to seconds
    this.lastTime = currentTime;

    // Prevent "Spiral of Death" if tab was inactive
    if (frameTime > this.maxFrameTime) {
      frameTime = this.maxFrameTime;
    }

    this.accumulator += frameTime;

    // Run physics steps until we've caught up with real time
    while (this.accumulator >= this.fixedDelta) {
      updatePhysics(this.fixedDelta);
      this.accumulator -= this.fixedDelta;
    }

    // Alpha is the percentage of time between physics steps.
    // E.g., if we are halfway to the next physics step, alpha = 0.5.
    // We use this to interpolate the camera position perfectly smoothly.
    const alpha = this.accumulator / this.fixedDelta;

    // Render the frame
    updateRender(alpha);
  }
}

// Export a singleton instance
export const Time = new TimeSystem();
