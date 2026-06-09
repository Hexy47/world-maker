/**
 * Input.js — Centralized Input System
 * 
 * Instead of having event listeners scattered throughout the code,
 * this system captures all raw input and exposes clean, queryable actions.
 * 
 * Example: Input.isActionPressed('jump')
 */

class InputSystem {
  constructor() {
    this.keys = {};
    this.mouseButtons = {};
    this.mouseDelta = { x: 0, y: 0 };
    
    // Binding mappings (Key -> Action)
    this.bindings = {
      'KeyW': 'move_forward',
      'KeyS': 'move_backward',
      'KeyA': 'move_left',
      'KeyD': 'move_right',
      'Space': 'jump',
      'ShiftLeft': 'sprint'
    };

    this._initListeners();
  }

  _initListeners() {
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });

    window.addEventListener('mousedown', (e) => {
      this.mouseButtons[e.button] = true;
    });

    window.addEventListener('mouseup', (e) => {
      this.mouseButtons[e.button] = false;
    });

    window.addEventListener('mousemove', (e) => {
      // Only track delta if the pointer is locked (game is focused)
      if (document.pointerLockElement) {
        this.mouseDelta.x += e.movementX;
        this.mouseDelta.y += e.movementY;
      }
    });
  }

  /**
   * Check if a specific action is currently held down
   */
  isActionPressed(actionName) {
    // Find which key code maps to this action
    for (const [code, action] of Object.entries(this.bindings)) {
      if (action === actionName && this.keys[code]) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get the accumulated mouse movement for this physics frame.
   * MUST be called exactly once per frame, as it resets the delta.
   */
  consumeMouseDelta() {
    const delta = { x: this.mouseDelta.x, y: this.mouseDelta.y };
    this.mouseDelta.x = 0;
    this.mouseDelta.y = 0;
    return delta;
  }
}

export const Input = new InputSystem();
