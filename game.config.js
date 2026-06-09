// ============================================================
//  WORLD MAKER — game.config.js
//  ✅ THIS IS THE ONLY FILE YOU NEED TO CHANGE FOR SETTINGS!
//  Every value here is also editable live in-game via the
//  God Panel (P key) — no code, no restart needed.
// ============================================================

export const SETTINGS = {

  // ──────────────────────────────────────
  // 🌍 WORLD
  // ──────────────────────────────────────
  SKY_COLOR:              0x050510,   // background/sky color
  GROUND_COLOR:           0x111118,   // floor/ground color
  GROUND_SIZE:            2000,       // how big the ground plane is
  STAR_COUNT:             5000,       // number of stars in the sky
  FOG_ENABLED:            true,       // set to false to remove fog
  FOG_DENSITY:            0.008,      // how thick the fog is (higher = thicker)
  FOG_COLOR:              0x050510,   // fog color (usually matches sky)

  // ──────────────────────────────────────
  // 🏃 PLAYER MOVEMENT
  // ──────────────────────────────────────
  PLAYER_SPEED:           8,          // walk speed in m/s (real units now)
  PLAYER_SPRINT_MULT:     1.8,        // hold Shift to multiply speed by this
  EYE_HEIGHT:             1.7,        // camera height in meters
  SENSITIVITY:            0.002,      // mouse look sensitivity

  // ──────────────────────────────────────
  // ⚙️ PHYSICS (Rapier real-world units: meters, seconds)
  // ──────────────────────────────────────
  GRAVITY:                -20,        // world gravity (negative = down, Earth = -9.81)
  JUMP_FORCE:             9,          // upward impulse when jumping (higher = bigger jump)
  PLAYER_MASS:            80,         // player mass in kg (affects how physics push you)
  PLAYER_FRICTION:        0.5,        // ground friction (0 = ice, 1 = sticky)
  PLAYER_RESTITUTION:     0.0,        // bounciness (0 = no bounce, 1 = super bounce)
  BLOCK_MASS:             50,         // mass of placed blocks in kg
  BLOCK_FRICTION:         0.8,        // friction of placed blocks
  BLOCK_RESTITUTION:      0.1,        // bounciness of placed blocks
  TERMINAL_VELOCITY:      -50,        // max fall speed (clamps gravity so you don't fly off)

  // ──────────────────────────────────────
  // 👥 OTHER PLAYERS
  // ──────────────────────────────────────
  OTHER_PLAYER_COLOR:     0xff3333,   // color of other player shapes
  OTHER_PLAYER_HEIGHT:    1.8,        // how tall other player shapes are

  // ──────────────────────────────────────
  // 🧱 BLOCKS (placed by God Mode)
  // ──────────────────────────────────────
  BLOCK_SIZE:             2,          // block size in meters
  BLOCK_COLOR:            0x445566,   // default color of placed blocks
  BLOCK_DYNAMIC:          false,      // true = blocks fall and roll, false = static

  // ──────────────────────────────────────
  // 💡 LIGHTING & GRAPHICS
  // ──────────────────────────────────────
  AMBIENT_INTENSITY:      0.3,        // overall ambient light brightness
  SUN_INTENSITY:          1.0,        // directional light brightness
  BLOOM_STRENGTH:         1.5,        // neon glow intensity (0 = off, 3 = very strong)
  BLOOM_THRESHOLD:        0.15,       // how bright something must be to bloom
  BLOOM_RADIUS:           0.4,        // how far the glow spreads
  SHADOW_QUALITY:         1024,       // shadow map size (512=fast, 2048=sharp)

  // ──────────────────────────────────────
  // 🚗 VEHICLES (GTA world)
  // ──────────────────────────────────────
  CAR_SPEED:              20,         // car max speed in m/s
  CAR_TURN_SPEED:         2.0,        // how fast cars turn
  CAR_FRICTION:           0.9,        // tire grip
  CAR_MASS:               1200,       // car mass in kg

}
