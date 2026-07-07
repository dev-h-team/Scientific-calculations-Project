/**
 * CameraController - Professional Basketball Camera System
 * =========================================================
 *
 * Five camera modes, each with distinct purpose and behavior:
 *
 *  FIRST_PERSON (0)
 *    - Eye-level FPS view at player head height
 *    - Full quaternion rotation (no Euler / lookAt corruption)
 *    - Mouse: look left/right/up/down
 *    - Crosshair shown in HUD
 *    - FOV: 90 (wide, immersive)
 *
 *  FOLLOW (1)  ← DEFAULT
 *    - Third-person camera orbiting behind the player
 *    - Follows player with smooth lag
 *    - Auto-tracks the ball when in flight
 *    - Mouse: orbit around player
 *    - FOV: 72
 *
 *  BROADCAST (2)
 *    - Fixed TV-style side angle, slowly pans to track the ball/player
 *    - Three preset positions that cycle each time mode is entered
 *    - No mouse interaction
 *    - FOV: 55 (zoomed in for cinematic look)
 *
 *  FREE (3)
 *    - Auto-orbiting top-down overview of the full court
 *    - Slowly rotates by itself
 *    - Mouse drag can orbit faster
 *    - FOV: 65
 *
 *  BALL (4)
 *    - Locks on and chases the ball tightly during flight
 *    - Falls back to FOLLOW when ball lands
 *    - Dynamic FOV zoom based on ball speed
 *
 * API (used by Game.js):
 *   camera.update(dt, playerPos, ballPos, ballInFlight)
 *   camera.getYaw()           → authoritative horizontal angle for player movement
 *   camera.setMouseDelta(dx, dy)
 *   camera.addZoom(scrollDelta)
 *   camera.shake(intensity)
 *   camera.cycleMode()        → returns new mode index
 *   camera.setMode(modeIndex)
 *   camera.getCurrentModeName() → e.g. "FOLLOW"
 *   camera.playShotCinematic(ballPos, hoopPos)
 */

class CameraController {
  constructor(renderer) {
    this.renderer = renderer;

    // ── Mode registry ─────────────────────────────────────────────────────
    // Keep as an object so the keys act as display names too.
    this.MODES = {
      FIRST_PERSON : 0,
      FOLLOW       : 1,
      BROADCAST    : 2,
      FREE         : 3,
      BALL         : 4,
    };

    // ── Mode metadata (display name, FOV, description) ────────────────────
    this._modeInfo = [
      { name: 'FIRST PERSON', icon: '👁️',  fov: 90,  desc: 'Eye-level view'         },
      { name: 'FOLLOW',       icon: '🎥',  fov: 72,  desc: 'Third-person follow'     },
      { name: 'BROADCAST',    icon: '📺',  fov: 80,  desc: 'Full court side view'     },
      { name: 'FREE',         icon: '🦅',  fov: 65,  desc: 'Auto-orbit overview'     },
      { name: 'BALL CAM',     icon: '🏀',  fov: 75,  desc: 'Locked on the ball'      },
    ];

    this.currentMode = this.MODES.FOLLOW;

    // ── Three.js camera ───────────────────────────────────────────────────
    this.camera = new THREE.PerspectiveCamera(
      72,
      window.innerWidth / window.innerHeight,
      0.05,
      500
    );

    // ── Shared state ──────────────────────────────────────────────────────
    this.target    = new THREE.Vector3(0, 2, 0);
    this.lerpSpeed = 6.0;

    // ── Mouse look angles (shared across modes) ───────────────────────────
    //   _yaw   = horizontal rotation around WORLD Y (0 = camera looks -Z)
    //   _pitch = vertical tilt, clamped per mode
    this._yaw         = Math.PI; // Start facing south toward hoop
    this._pitch       = 0.15;
    this._targetYaw   = Math.PI;
    this._targetPitch = 0.15;

    // ── FOV animation ─────────────────────────────────────────────────────
    this._targetFOV  = 72;
    this._currentFOV = 72;

    // ── FOLLOW mode ───────────────────────────────────────────────────────
    this._followDist       = 5.5;
    this._followHeight     = 2.0;
    this._followLerpFactor = 3.5; // multiplier on lerpSpeed

    // ── BROADCAST mode — single fixed side view ───────────────────────────────
    // Camera sits on the X-SIDE of the court (not the end) so BOTH hoops are
    // visible simultaneously along the court length (Z axis).
    // Court width (X): ±15 wu, hoops on Z axis ≈ ±24.
    // At X=17 with FOV=80° (vertical), horizontal reach ≈ ±27 wu in Z → covers both hoops.
    this._broadcastPos    = new THREE.Vector3(17, 6, 0);
    this._broadcastLookAt = new THREE.Vector3(0, 4, 0);

    // ── FREE / orbit mode ─────────────────────────────────────────────────
    this._orbitTheta  = 0;
    this._orbitPhi    = Math.PI / 3.5;
    this._orbitRadius = 18;   // reduced so FREE stays inside arena (was 26)
    this._orbitTarget = new THREE.Vector3(0, 2, 0);
    this._orbitSpeed  = 0.12; // rad/s auto-rotate

    // ── BALL mode ─────────────────────────────────────────────────────────
    this._ballLerpFactor = 10;
    this._preBallMode    = this.MODES.FOLLOW; // mode to restore after cinematic

    // ── FIRST_PERSON mode ─────────────────────────────────────────────────
    this._fpEyeHeight   = 1.72;  // metres above player.position.y
    this._fpNoseOffset  = 0.18;  // push forward to not see own head
    this._fpPitchMin    = -1.4;
    this._fpPitchMax    =  1.4;

    // ── Reusable quaternion objects (avoid per-frame GC) ──────────────────
    this._yawQ    = new THREE.Quaternion();
    this._pitchQ  = new THREE.Quaternion();
    this._WORLD_Y = new THREE.Vector3(0, 1, 0);
    this._LOCAL_X = new THREE.Vector3(1, 0, 0);

    // ── Camera shake ──────────────────────────────────────────────────────
    this._shakeIntensity = 0;
    this._shakeDecay     = 7;
    this._shakeOffset    = new THREE.Vector3();

    // ── HUD indicator ─────────────────────────────────────────────────────
    this._hudEl = null;
    this._hudTimeout = null;
    this._createModeHUD();

    // ── Respond to window resize ──────────────────────────────────────────
    renderer.onResize((w, h) => {
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    });

    // Boot position
    this.camera.position.set(0, 8, 16);
    this.camera.lookAt(0, 2, 0);
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  PUBLIC API
  // ═══════════════════════════════════════════════════════════════════════

  /** Returns the raw horizontal yaw angle (radians) for camera-relative player movement. */
  getYaw() {
    return this._yaw;
  }

  /** Returns a display string like "FOLLOW" for the current mode. */
  getCurrentModeName() {
    return this._modeInfo[this.currentMode]?.name ?? 'UNKNOWN';
  }

  /** Returns full info object { name, icon, fov, desc } for current mode. */
  getCurrentModeInfo() {
    return this._modeInfo[this.currentMode];
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  MAIN UPDATE  (called once per frame from Game._update)
  // ═══════════════════════════════════════════════════════════════════════

  update(dt, playerPos, ballPos, ballInFlight) {
    // ── Smooth mouse look angles ──────────────────────────────────────────
    const lookSmooth = Math.min(dt * 18, 1);
    this._yaw   += (this._targetYaw   - this._yaw)   * lookSmooth;
    this._pitch += (this._targetPitch - this._pitch) * lookSmooth;

    // ── Smooth FOV ────────────────────────────────────────────────────────
    this._currentFOV += (this._targetFOV - this._currentFOV) * Math.min(dt * 5, 1);
    this.camera.fov = this._currentFOV;
    this.camera.updateProjectionMatrix();

    // ── Dispatch to mode handler ──────────────────────────────────────────
    switch (this.currentMode) {
      case this.MODES.FIRST_PERSON:
        this._updateFirstPerson(dt, playerPos);
        break;
      case this.MODES.FOLLOW:
        this._updateFollow(dt, playerPos, ballPos, ballInFlight);
        break;
      case this.MODES.BROADCAST:
        this._updateBroadcast(dt, playerPos, ballPos);
        break;
      case this.MODES.FREE:
        this._updateFree(dt);
        break;
      case this.MODES.BALL:
        this._updateBall(dt, ballPos, playerPos, ballInFlight);
        break;
    }

    // ── Apply shake on top of whatever mode computed ──────────────────────
    this._updateShake(dt);
    this.camera.position.add(this._shakeOffset);

    // ── Universal arena clamp (ALL modes) ───────────────────────────────────
    // Based on Court.js exact geometry:
    //   Walls X: ±(width/2 + 4) = ±19  → clamp camera 1wu inside = ±18
    //   Walls Z: ±(length/2+4) = ±32   → clamp camera 1wu inside = ±31
    //   Ceiling Y: 18                  → clamp camera 1wu below  = 17
    //   Floor  Y: 0                    → clamp camera above ground = 0.8
    this.camera.position.x = MathUtils.clamp(this.camera.position.x, -18, 18);
    this.camera.position.z = MathUtils.clamp(this.camera.position.z, -31, 31);
    this.camera.position.y = MathUtils.clamp(this.camera.position.y, 0.8, 17);
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  MODE 0 — FIRST PERSON  (quaternion, no lookAt)
  // ═══════════════════════════════════════════════════════════════════════

  _updateFirstPerson(dt, playerPos) {
    if (!playerPos) {
      // Safe fallback
      this.camera.position.set(0, 6, 12);
      this.camera.lookAt(0, 2, 0);
      return;
    }

    // Eye position: player origin + eye height + nose push-forward
    const fwdX = -Math.sin(this._yaw);
    const fwdZ = -Math.cos(this._yaw);

    this.camera.position.set(
      playerPos.x + fwdX * this._fpNoseOffset,
      playerPos.y + this._fpEyeHeight,
      playerPos.z + fwdZ * this._fpNoseOffset
    );

    // Quaternion rotation: yaw (world Y) → pitch (local X)
    // This is the canonical FPS approach — never corrupts camera.rotation.y.
    this._yawQ.setFromAxisAngle(this._WORLD_Y, -this._yaw);
    this._pitchQ.setFromAxisAngle(this._LOCAL_X, this._pitch);
    this.camera.quaternion.copy(this._yawQ).multiply(this._pitchQ);
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  MODE 1 — FOLLOW (third-person orbit)
  // ═══════════════════════════════════════════════════════════════════════

  _updateFollow(dt, playerPos, ballPos, ballInFlight) {
    if (!playerPos) return;

    const cosYaw   = Math.cos(this._yaw);
    const sinYaw   = Math.sin(this._yaw);
    const cosPitch = Math.cos(this._pitch);
    const sinPitch = Math.sin(this._pitch);

    // Desired position: behind the player along the yaw axis
    const dist   = this._followDist;
    const desired = new THREE.Vector3(
      playerPos.x + sinYaw * cosPitch * dist,
      playerPos.y + Math.max(sinPitch * dist, 0) + this._followHeight,
      playerPos.z + cosYaw * cosPitch * dist
    );

    // Clamp desired BEFORE lerping so the camera never tries to reach
    // a position outside the arena walls — avoids the "frozen on wall" bug
    desired.x = MathUtils.clamp(desired.x, -18, 18);
    desired.z = MathUtils.clamp(desired.z, -31, 31);
    desired.y = MathUtils.clamp(desired.y, 0.8, 17);

    // Look target: ball during flight, ahead of player otherwise
    let lookTarget;
    if (ballInFlight && ballPos) {
      lookTarget = new THREE.Vector3(ballPos.x, ballPos.y, ballPos.z);
    } else {
      lookTarget = new THREE.Vector3(
        playerPos.x - sinYaw * 8,
        playerPos.y + 1.4 + Math.sin(this._pitch) * 4,
        playerPos.z - cosYaw * 8
      );
    }

    const lerpT = Math.min(dt * this.lerpSpeed * this._followLerpFactor, 1);
    this.camera.position.lerp(desired, lerpT);
    this.target.lerp(lookTarget, lerpT);
    this.camera.lookAt(this.target);
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  MODE 2 — BROADCAST (fixed full-court side view)
  // ═══════════════════════════════════════════════════════════════════════

  _updateBroadcast(dt) {
    // Fully static — camera never moves, never tracks ball or player.
    // Lerp once to the preset position so switching from other modes is smooth.
    this.camera.position.lerp(this._broadcastPos, Math.min(dt * 2.0, 1));
    this.target.lerp(this._broadcastLookAt, Math.min(dt * 2.0, 1));
    this.camera.lookAt(this.target);
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  MODE 3 — FREE (auto-orbit overview)
  // ═══════════════════════════════════════════════════════════════════════

  _updateFree(dt) {
    // No auto-rotation — orbit is driven ONLY by mouse/look input.
    // _yaw  (mouse left/right) → horizontal orbit angle (theta)
    // _pitch (mouse up/down)   → vertical elevation angle (phi)
    this._orbitTheta = this._yaw;

    const phi = MathUtils.clamp(
      Math.PI / 4 + this._pitch * 0.5,
      0.08,
      Math.PI * 0.44
    );

    const x = this._orbitRadius * Math.sin(phi) * Math.sin(this._orbitTheta);
    const y = this._orbitRadius * Math.cos(phi);
    const z = this._orbitRadius * Math.sin(phi) * Math.cos(this._orbitTheta);

    const desired = new THREE.Vector3(
      this._orbitTarget.x + x,
      this._orbitTarget.y + y,
      this._orbitTarget.z + z
    );

    this.camera.position.lerp(desired, Math.min(dt * 2.5, 1));
    this.target.lerp(this._orbitTarget, Math.min(dt * 2.5, 1));
    this.camera.lookAt(this.target);
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  MODE 4 — BALL CAM (chase the ball)
  // ═══════════════════════════════════════════════════════════════════════

  _updateBall(dt, ballPos, playerPos, ballInFlight) {
    // If ball isn't flying, fall back to FOLLOW so we're not stuck staring at the floor
    if (!ballInFlight || !ballPos) {
      this._updateFollow(dt, playerPos, ballPos, false);
      return;
    }

    // Offset: trail BEHIND the ball along its velocity direction
    // Camera positions itself opposite to ball's XZ motion, slightly above
    const bv = this._ballVel || { x: 0, y: 0, z: 1 };
    const horizSpeed = Math.sqrt(bv.x * bv.x + bv.z * bv.z) + 0.001;
    const trailX =  (bv.x / horizSpeed) * 4.5;
    const trailZ =  (bv.z / horizSpeed) * 4.5;

    const desired = new THREE.Vector3(
      ballPos.x + trailX,
      Math.max(ballPos.y + 2.5, 2),    // never go below floor
      ballPos.z + trailZ
    );

    const lerpT = Math.min(dt * this._ballLerpFactor, 1);
    this.camera.position.lerp(desired, lerpT);
    this.target.lerp(new THREE.Vector3(ballPos.x, ballPos.y, ballPos.z), lerpT);
    this.camera.lookAt(this.target);

    // Widen FOV a little to show speed
    this._targetFOV = 80;
  }

  /** Call from Game each frame before update() to give Ball velocity to camera */
  setBallVelocity(vel) {
    this._ballVel = vel;
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  CAMERA SHAKE
  // ═══════════════════════════════════════════════════════════════════════

  shake(intensity = 0.3) {
    this._shakeIntensity = Math.max(this._shakeIntensity, intensity);
  }

  _updateShake(dt) {
    if (this._shakeIntensity > 0.001) {
      this._shakeOffset.set(
        (Math.random() - 0.5) * this._shakeIntensity,
        (Math.random() - 0.5) * this._shakeIntensity * 0.5,
        (Math.random() - 0.5) * this._shakeIntensity
      );
      this._shakeIntensity -= this._shakeDecay * dt * this._shakeIntensity;
    } else {
      this._shakeIntensity = 0;
      this._shakeOffset.set(0, 0, 0);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  MOUSE / SCROLL INPUT
  // ═══════════════════════════════════════════════════════════════════════

  setMouseDelta(dx, dy) {
    const isFirstPerson = (this.currentMode === this.MODES.FIRST_PERSON);
    const sens = isFirstPerson ? 0.0018 : 0.0024;

    this._targetYaw += dx * sens;

    const pitchMin = isFirstPerson ? this._fpPitchMin : -0.85;
    const pitchMax = isFirstPerson ? this._fpPitchMax :  1.1;
    this._targetPitch = MathUtils.clamp(this._targetPitch + dy * sens * 0.85, pitchMin, pitchMax);
  }

  addZoom(scrollDelta) {
    const dir = scrollDelta > 0 ? 1 : -1;
    if (this.currentMode === this.MODES.FOLLOW) {
      // Zoom by changing follow distance
      this._followDist = MathUtils.clamp(this._followDist + dir * 0.5, 2.5, 14);
    } else {
      // Zoom by changing FOV
      this._targetFOV = MathUtils.clamp(this._targetFOV + dir * 5, 25, 110);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  MODE MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════

  cycleMode() {
    const total = Object.keys(this.MODES).length;
    const next  = (this.currentMode + 1) % total;
    this.setMode(next);
    return this.currentMode;
  }

  setMode(modeIndex) {
    if (modeIndex < 0 || modeIndex >= Object.keys(this.MODES).length) return;
    
    this.currentMode = modeIndex;
    const info = this._modeInfo[modeIndex];

    // Apply the mode's canonical FOV
    this._targetFOV = info.fov;

    // Mode-specific setup
    // (BROADCAST no longer cycles slots — it has a single fixed side-view position)
    if (modeIndex === this.MODES.FREE) {
      this._orbitTheta = this._yaw; // sync orbit start angle with current yaw
    }

    // Show mode indicator in HUD
    this._showModeIndicator();
  }

  // Cinematic shot mode: temporarily switches to BALL, then restores previous mode
  playShotCinematic() {
    if (this.currentMode === this.MODES.BALL) return;
    this._preBallMode = this.currentMode;
    this.setMode(this.MODES.BALL);
    setTimeout(() => {
      this.setMode(this._preBallMode);
    }, 2400);
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  ORBIT HELPERS (called from Game._onKeyDown for FREE mode)
  // ═══════════════════════════════════════════════════════════════════════

  orbit(deltaTheta, deltaPhi) {
    this._orbitTheta += deltaTheta;
    this._orbitPhi    = MathUtils.clamp(this._orbitPhi + deltaPhi, 0.08, Math.PI * 0.44);
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  LEGACY COMPATIBILITY
  // ═══════════════════════════════════════════════════════════════════════

  /** @deprecated Use getCurrentModeName() */
  getModeNames() {
    return this._modeInfo.map(m => m.name);
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  HUD MODE INDICATOR
  // ═══════════════════════════════════════════════════════════════════════

  _createModeHUD() {
    // Create an overlay element to show the current camera mode
    const el = document.createElement('div');
    el.id = 'camera-mode-indicator';
    el.style.cssText = `
      position: fixed;
      top: 14px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0,0,0,0.65);
      color: #fff;
      font-family: 'Segoe UI', sans-serif;
      font-size: 13px;
      font-weight: 600;
      letter-spacing: 2px;
      padding: 6px 18px 6px 14px;
      border-radius: 20px;
      border: 1px solid rgba(255,255,255,0.15);
      display: flex;
      align-items: center;
      gap: 8px;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.3s ease;
      z-index: 9999;
      white-space: nowrap;
    `;
    el.innerHTML = `<span id="cam-icon">🎥</span><span id="cam-label">FOLLOW</span>`;
    document.body.appendChild(el);
    this._hudEl = el;
  }

  _showModeIndicator() {
    if (!this._hudEl) return;
    const info = this._modeInfo[this.currentMode];

    // Update content
    const iconEl  = document.getElementById('cam-icon');
    const labelEl = document.getElementById('cam-label');
    if (iconEl)  iconEl.textContent  = info.icon;
    if (labelEl) labelEl.textContent = info.name;

    // Flash in then fade out
    clearTimeout(this._hudTimeout);
    this._hudEl.style.opacity = '1';
    this._hudTimeout = setTimeout(() => {
      if (this._hudEl) this._hudEl.style.opacity = '0';
    }, 2200);
  }
}
