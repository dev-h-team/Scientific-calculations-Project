/**
 * InputManager - Professional Keyboard, Mouse & Touch Input Handler
 *
 * Shot charging system (Angry-Birds style):
 *
 *   SPACE BAR:
 *     • Hold down → power builds from 0 to 1 over MAX_CHARGE_TIME seconds
 *     • Release   → fires shot with accumulated power
 *     • Power is updated every frame in update(dt) so the HUD meter
 *       responds in real-time while the key is held.
 *
 *   MOUSE LEFT-CLICK / RIGHT-CLICK:
 *     • Press & drag downward/backward → power from drag distance
 *     • Horizontal drag → horizontal angle offset (aim left/right)
 *     • Release → fires shot
 *
 *   TOUCH:
 *     • Same as mouse drag
 *
 * Movement:
 *   WASD / Arrow keys → normalised XZ input vector
 *   Shift             → sprint
 */

class InputManager {
  constructor() {
    // ── Key state ─────────────────────────────────────────────────────────
    this.keys             = {};
    this.keysJustPressed  = {};
    this.keysJustReleased = {};

    // ── Mouse state ───────────────────────────────────────────────────────
    this.mouse = {
      x: 0, y: 0,
      deltaX: 0, deltaY: 0,
      buttons: [false, false, false],
      buttonsJustPressed:  [false, false, false],
      buttonsJustReleased: [false, false, false],
      locked: false
    };

    // ── Touch state ───────────────────────────────────────────────────────
    this.touch = { active: false, x: 0, y: 0, startX: 0, startY: 0 };

    // ── Shot charge state ─────────────────────────────────────────────────
    this.shotCharging    = false;
    this.shotSource      = null;      // 'Space' | 'Mouse0' | 'Mouse2' | 'Touch'
    this.shotChargeStart = 0;         // performance.now() at charge start
    this.shotPower       = 0;         // 0–1, updated every frame
    this.dragAngle       = 0;         // horizontal aim offset (radians)
    this.isDragging      = false;
    this.dragStartX      = 0;
    this.dragStartY      = 0;

    // ── Timing constants ──────────────────────────────────────────────────
    this.MAX_CHARGE_TIME = 1.8;       // seconds for Space to reach full power
    this.MAX_DRAG_PX     = Math.min(window.innerHeight * 0.4, 380); // pixels

    // ── Callbacks ─────────────────────────────────────────────────────────
    this._callbacks = {};

    this._setupListeners();
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  EVENT LISTENERS
  // ═══════════════════════════════════════════════════════════════════════

  _setupListeners() {
    // ── Keyboard ──────────────────────────────────────────────────────────
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
        // Only start a new charge if Space wasn't already held
        if (!this.keys['Space']) {
          this._startShotCharge('Space');
        }
      }

      if (!this.keys[e.code]) {
        this.keysJustPressed[e.code] = true;
      }
      this.keys[e.code] = true;
      this._emit('keydown', e.code);
    });

    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
        if (this.shotCharging && this.shotSource === 'Space') {
          this._releaseShotCharge();
        }
      }

      this.keys[e.code] = false;
      this.keysJustReleased[e.code] = true;
      this._emit('keyup', e.code);
    });

    // ── Mouse movement ────────────────────────────────────────────────────
    window.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement) {
        this.mouse.deltaX += e.movementX;
        this.mouse.deltaY += e.movementY;
        this.mouse.locked = true;
      } else {
        this.mouse.x      = (e.clientX / window.innerWidth)  *  2 - 1;
        this.mouse.y      = (e.clientY / window.innerHeight)  * -2 + 1;
        this.mouse.deltaX += e.movementX || 0;
        this.mouse.deltaY += e.movementY || 0;
        this.mouse.locked = false;
      }

      // Update drag power/angle while mouse-charging
      if (this.shotCharging && this.isDragging) {
        this._updateDrag(e.clientX, e.clientY);
      }
    });

    // ── Mouse buttons ─────────────────────────────────────────────────────
    window.addEventListener('mousedown', (e) => {
      this.mouse.buttons[e.button]           = true;
      this.mouse.buttonsJustPressed[e.button] = true;

      if (e.button === 0 || e.button === 2) {
        this._startShotCharge('Mouse' + e.button, e.clientX, e.clientY);
      }
      this._emit('mousedown', e.button);
    });

    window.addEventListener('mouseup', (e) => {
      this.mouse.buttons[e.button]            = false;
      this.mouse.buttonsJustReleased[e.button] = true;

      if ((e.button === 0 || e.button === 2) &&
          this.shotCharging &&
          this.shotSource === 'Mouse' + e.button) {
        this._releaseShotCharge();
      }
      this._emit('mouseup', e.button);
    });

    // ── Pointer lock ──────────────────────────────────────────────────────
    document.addEventListener('pointerlockchange', () => {
      this.mouse.locked = !!document.pointerLockElement;
    });

    // ── Touch ─────────────────────────────────────────────────────────────
    window.addEventListener('touchstart', (e) => {
      const t = e.touches[0];
      this.touch.active = true;
      this.touch.startX = t.clientX;
      this.touch.startY = t.clientY;
      this.touch.x      = t.clientX;
      this.touch.y      = t.clientY;
      this._startShotCharge('Touch', t.clientX, t.clientY);
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
      const t = e.touches[0];
      this.mouse.deltaX = t.clientX - this.touch.x;
      this.mouse.deltaY = t.clientY - this.touch.y;
      this.touch.x      = t.clientX;
      this.touch.y      = t.clientY;

      if (this.shotCharging && this.shotSource === 'Touch') {
        this._updateDrag(t.clientX, t.clientY);
      }
    }, { passive: true });

    window.addEventListener('touchend', () => {
      this.touch.active = false;
      if (this.shotCharging && this.shotSource === 'Touch') {
        this._releaseShotCharge();
      }
    });

    // Prevent context menu from right-click shooting
    window.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  SHOT CHARGE LOGIC
  // ═══════════════════════════════════════════════════════════════════════

  _startShotCharge(source, x = 0, y = 0) {
    if (this.shotCharging) return;

    this.shotCharging    = true;
    this.shotSource      = source;
    this.shotChargeStart = performance.now();
    this.shotPower       = 0;
    this.dragAngle       = 0;
    this.dragStartX      = x;
    this.dragStartY      = y;
    this.isDragging      = (source !== 'Space' && !this.mouse.locked);

    this._emit('shotChargeStart');
  }

  /**
   * Update drag-based power and angle (mouse / touch).
   * Pulling DOWN = more power (like pulling back a slingshot).
   * Pulling LEFT/RIGHT = horizontal aim offset.
   */
  _updateDrag(x, y) {
    if (!this.shotCharging || !this.isDragging) return;

    const dx = x - this.dragStartX;
    const dy = y - this.dragStartY;   // positive = dragged down (toward player)

    // Power from total drag distance (primarily downward)
    const pullDist = Math.sqrt(dx * dx + dy * dy);
    this.shotPower = MathUtils.clamp(pullDist / this.MAX_DRAG_PX, 0.05, 1.0);

    // Horizontal angle offset: drag left → aim slightly right, and vice versa
    // Capped at ±25°
    const maxAngle = MathUtils.toRad(25);
    this.dragAngle = MathUtils.clamp(
      (dx / this.MAX_DRAG_PX) * maxAngle * 2,
      -maxAngle, maxAngle
    );
  }

  /**
   * Release the shot charge and fire the 'shotRelease' event.
   */
  _releaseShotCharge() {
    if (!this.shotCharging) return;

    // For Space or Locked Mouse: compute power from hold duration (not drag)
    if (!this.isDragging) {
      const elapsed = (performance.now() - this.shotChargeStart) / 1000;
      // Linear ramp: 0 → 1 over MAX_CHARGE_TIME
      // Minimum of 0.15 so a quick tap still fires a weak shot
      this.shotPower = MathUtils.clamp(elapsed / this.MAX_CHARGE_TIME, 0.15, 1.0);
      this.dragAngle = 0;
    }

    const payload = {
      power:       this.shotPower,
      angleOffset: this.dragAngle
    };

    // Clear charge state BEFORE emitting so re-entrant calls are safe
    this.shotCharging = false;
    this.shotSource   = null;
    this.isDragging   = false;
    this.dragAngle    = 0;

    this._emit('shotRelease', payload);
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  PER-FRAME UPDATE  (must be called from Game._update every frame)
  // ═══════════════════════════════════════════════════════════════════════

  update(dt) {
    // ── Space bar OR locked mouse: update power in real-time so HUD meter responds ────────
    if (this.shotCharging && (!this.isDragging)) {
      const elapsed = (performance.now() - this.shotChargeStart) / 1000;
      this.shotPower = MathUtils.clamp(elapsed / this.MAX_CHARGE_TIME, 0, 1.0);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  FRAME STATE CLEAR  (call AFTER processing input each frame)
  // ═══════════════════════════════════════════════════════════════════════

  clearFrameState() {
    this.keysJustPressed  = {};
    this.keysJustReleased = {};
    this.mouse.buttonsJustPressed  = [false, false, false];
    this.mouse.buttonsJustReleased = [false, false, false];
    this.mouse.deltaX = 0;
    this.mouse.deltaY = 0;
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  QUERY HELPERS
  // ═══════════════════════════════════════════════════════════════════════

  isKeyDown(code)              { return !!this.keys[code]; }
  isKeyJustPressed(code)       { return !!this.keysJustPressed[code]; }
  isKeyJustReleased(code)      { return !!this.keysJustReleased[code]; }
  isMouseButtonDown(btn = 0)   { return !!this.mouse.buttons[btn]; }
  isMouseButtonJustReleased(btn = 0) { return !!this.mouse.buttonsJustReleased[btn]; }

  /**
   * Returns a normalised {x, z} movement vector from WASD / arrow keys.
   * Diagonal movement is pre-normalised to prevent speed boost.
   */
  getMoveVector() {
    let x = 0, z = 0;

    if (this.isKeyDown('KeyW')) z -= 1;
    if (this.isKeyDown('KeyS')) z += 1;
    if (this.isKeyDown('KeyA')) x -= 1;
    if (this.isKeyDown('KeyD')) x += 1;

    // Normalise diagonal
    if (x !== 0 && z !== 0) {
      x *= 0.7071;
      z *= 0.7071;
    }

    return { x, z };
  }

  /**
   * Returns a vector from the arrow keys for camera movement.
   */
  getCameraMoveVector() {
    let x = 0, y = 0;

    if (this.isKeyDown('ArrowUp'))    y += 1;
    if (this.isKeyDown('ArrowDown'))  y -= 1;
    if (this.isKeyDown('ArrowLeft'))  x -= 1;
    if (this.isKeyDown('ArrowRight')) x += 1;

    return { x, y };
  }

  isSprinting() {
    return this.isKeyDown('ShiftLeft') || this.isKeyDown('ShiftRight');
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  CALLBACK SYSTEM
  // ═══════════════════════════════════════════════════════════════════════

  on(event, callback) {
    if (!this._callbacks[event]) this._callbacks[event] = [];
    this._callbacks[event].push(callback);
  }

  _emit(event, data) {
    const cbs = this._callbacks[event];
    if (cbs) cbs.forEach(cb => cb(data));
  }

  requestPointerLock(element) {
    if (element && element.requestPointerLock) element.requestPointerLock();
  }

  dispose() {
    // In a full implementation, store and remove all event listeners here.
    // Omitted for brevity as the game uses a single long-lived InputManager.
  }
}
