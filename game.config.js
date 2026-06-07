// ============================================================
//  WORLD MAKER — game.config.js
//  ✅ THIS IS THE ONLY FILE YOU EVER NEED THE AI TO CHANGE!
//  Just tell the launcher AI what you want to change and it
//  will find the right setting here by name.
// ============================================================

export const SETTINGS = {

  // ──────────────────────────────────────
  // 🌍 WORLD
  // ──────────────────────────────────────
  SKY_COLOR:          0x87CEEB,   // background/sky color
  GROUND_COLOR:       0x3B5E2B,   // floor/ground color
  GROUND_SIZE:        2000,       // how big the ground plane is
  STAR_COUNT:         5000,       // number of stars in the sky
  FOG_ENABLED:        true,      // set to true to add fog/haze

  // ──────────────────────────────────────
  // 🏃 PLAYER
  // ──────────────────────────────────────
  PLAYER_SPEED:       400,        // walk speed  (higher = faster)
  JUMP_HEIGHT:        350,        // jump power  (higher = bigger jump)
  GRAVITY:            980,        // gravity     (higher = heavier)
  EYE_HEIGHT:         2,          // how high the camera sits

  // ──────────────────────────────────────
  // 👥 OTHER PLAYERS
  // ──────────────────────────────────────
  OTHER_PLAYER_COLOR: 0xff0000,   // color of other players in the world
  OTHER_PLAYER_HEIGHT: 2,         // how tall other player shapes are

  // ──────────────────────────────────────
  // 🧱 BLOCKS (placed by God Mode)
  // ──────────────────────────────────────
  BLOCK_COLOR:        0x888888,   // default color of placed blocks

  // ──────────────────────────────────────
  // 💡 LIGHTING
  // ──────────────────────────────────────
  AMBIENT_INTENSITY:  0.5,        // overall ambient light brightness
  SUN_INTENSITY:      1.2,        // directional sunlight brightness

}
