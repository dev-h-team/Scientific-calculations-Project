/**
 * CameraController - Professional Camera System
 *
 * Camera modes:
 *   0 FOLLOW    - Third-person follow behind player (default)
 *   1 BROADCAST - Side-view TV broadcast
 *   2 FREE      - Auto-orbiting overview
 *   3 BALL      - Tracks ball during flight
 *
 * Key improvement:
 *   • _yaw property tracks the horizontal camera angle in FOLLOW mode.
 *     Game.js reads camera.camera.rotation.y which is set from _yaw,
 *     so player movement is always camera-relative.
 *   • Mouse drag rotates _yaw (horizontal) and _pitch (vertical).
 *   • Shake uses a separate offset so it never corrupts the base position.
 */

class CameraController {
  constructor(renderer) {
    this.renderer = renderer;

    this.MODES = { FIRST_PERSON: 0, FOLLOW: 1, BROADCAST: 2, FREE: 3, BALL: 4 };
    this.currentMode = this.MODES.FIRST_PERSON;

    // ── Three.js camera ───────────────────────────────────────────────────
    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      250
    );

    // ── Camera state ──────────────────────────────────────────────────────
    this.position = new THREE.Vector3(0, 8, 14);
    this.target   = new THREE.Vector3(0, 2, 0);
    this.lerpSpeed = 5.0;

    // ── Mouse look (FOLLOW mode) ──────────────────────────────────────────
    // _yaw   = horizontal angle around Y axis (radians)
    // _pitch = vertical tilt (radians, clamped)
    this._yaw   = 0;
    this._pitch = 0.45;   // slight downward tilt by default

    this._targetYaw   = 0;
    this._targetPitch = 0.45;

    // Distance from player in FOLLOW mode
    this._followDist   = 9.0;
    this._followHeight = 4.5;

    // ── Shake ─────────────────────────────────────────────────────────────
    this._shakeIntensity = 0;
    this._shakeDecay     = 6;
    this._shakeOffset    = new THREE.Vector3();

    // ── Orbit (FREE mode) ─────────────────────────────────────────────────
    this._orbitTheta  = 0;
    this._orbitPhi    = Math.PI / 4;
    this._orbitRadius = 20;
    this._orbitTarget = new THREE.Vector3(0, 2, 0);

    // ── Broadcast ─────────────────────────────────────────────────────────
    this._broadcastPositions = [
      new THREE.Vector3(0,  6, 18),
      new THREE.Vector3(18, 5,  0),
      new THREE.Vector3(-18, 5, 0)
    ];
    this._broadcastIndex = 0;

    // ── FOV animation ─────────────────────────────────────────────────────
    this._targetFOV  = 60;
    this._currentFOV = 60;

    renderer.onResize((w, h) => {
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    });

    this.camera.position.copy(this.position);
    this.camera.lookAt(this.target);
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  MAIN UPDATE
  // ═══════════════════════════════════════════════════════════════════════

  update(dt, playerPos, ballPos, ballInFlight) {
    // Smooth mouse look
    this._yaw   += (this._targetYaw   - this._yaw)   * Math.min(dt * 8, 1);
    this._pitch += (this._targetPitch - this._pitch) * Math.min(dt * 8, 1);

    // Smooth FOV
    this._currentFOV += (this._targetFOV - this._currentFOV) * Math.min(dt * 4, 1);
    this.camera.fov = this._currentFOV;
    this.camera.updateProjectionMatrix();

    switch (this.currentMode) {
      case this.MODES.FIRST_PERSON:
        this._updateFirstPersonCamera(dt, playerPos, ballPos, ballInFlight);
        break;
      case this.MODES.FOLLOW:
        this._updateFollowCamera(dt, playerPos, ballPos, ballInFlight);
        break;
      case this.MODES.BROADCAST:
        this._updateBroadcastCamera(dt, playerPos, ballPos);
        break;
      case this.MODES.FREE:
        this._updateFreeCamera(dt);
        break;
      case this.MODES.BALL:
        this._updateBallCamera(dt, ballPos, playerPos);
        break;
    }

    this._updateShake(dt);
    this.camera.position.add(this._shakeOffset);

    // ── Constrain camera within court boundaries ─────────────────────────
    // Court is roughly X:[-7.5, 7.5], Z:[-14, 14], Y:[0, 12]
    // We add a small margin to prevent clipping through walls
    const margin = 0.5;
    this.camera.position.x = MathUtils.clamp(this.camera.position.x, -7.5 + margin, 7.5 - margin);
    this.camera.position.z = MathUtils.clamp(this.camera.position.z, -14.0 + margin, 14.0 - margin);
    this.camera.position.y = MathUtils.clamp(this.camera.position.y, 0.5, 12.0);
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  FOLLOW CAMERA
  // ═══════════════════════════════════════════════════════════════════════

    _updateFirstPersonCamera(dt, playerPos, ballPos, ballInFlight) {
    if (!playerPos) {
      // Fallback if playerPos is missing to prevent black screen
      this.camera.position.set(0, 5, 10);
      this.camera.lookAt(0, 2, 0);
      if (window.gameLogger) window.gameLogger.warn('FirstPersonCamera: playerPos is missing, using fallback');
      return;
    }
    
    try {
      // First person: camera is at player's head height
      const headPos = new THREE.Vector3(playerPos.x, playerPos.y + 1.75, playerPos.z);
      
      // Calculate look direction from yaw and pitch
      const lookDir = new THREE.Vector3(
        -Math.sin(this._yaw) * Math.cos(this._pitch),
        Math.sin(this._pitch),
        -Math.cos(this._yaw) * Math.cos(this._pitch)
      );
      
      const lookTarget = headPos.clone().add(lookDir);
      
      // Check for NaN to prevent camera corruption
      if (isNaN(headPos.x) || isNaN(lookTarget.x)) {
          throw new Error('Camera position or target contains NaN');
      }

      // Faster interpolation for first person to feel responsive
      this.camera.position.lerp(headPos, Math.min(dt * 25, 1));
      this.target.lerp(lookTarget, Math.min(dt * 25, 1));
      this.camera.lookAt(this.target);
      
      // Expose yaw for movement
      this.camera.rotation.y = -this._yaw;
    } catch (e) {
      if (window.gameLogger) window.gameLogger.error('FirstPersonCamera Update Error:', e);
    }
  }

  _updateFollowCamera(dt, playerPos, ballPos, ballInFlight) {
    if (!playerPos) return;

    // Compute desired camera position based on yaw and pitch
    const cosYaw   = Math.cos(this._yaw);
    const sinYaw   = Math.sin(this._yaw);
    const cosPitch = Math.cos(this._pitch);
    const sinPitch = Math.sin(this._pitch);

    const dist = this._followDist;
    const offsetX = sinYaw * cosPitch * dist;
    const offsetY = sinPitch * dist + this._followHeight;
    const offsetZ = cosYaw * cosPitch * dist;

    const desiredPos = new THREE.Vector3(
      playerPos.x + offsetX,
      playerPos.y + offsetY,
      playerPos.z + offsetZ
    );

    // Look target: ball during flight, player head otherwise
    const lookTarget = (ballInFlight && ballPos)
      ? new THREE.Vector3(ballPos.x, ballPos.y, ballPos.z)
      : new THREE.Vector3(playerPos.x, playerPos.y + 1.8, playerPos.z);

    // Smooth interpolation
    this.camera.position.lerp(desiredPos, Math.min(dt * this.lerpSpeed, 1));
    this.target.lerp(lookTarget, Math.min(dt * this.lerpSpeed * 1.4, 1));
    this.camera.lookAt(this.target);

    // ── Expose yaw as camera.rotation.y for player movement ──────────────
    // We set it explicitly so Game.js can read camera.camera.rotation.y
    this.camera.rotation.y = -this._yaw;
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  BROADCAST CAMERA
  // ═══════════════════════════════════════════════════════════════════════

  _updateBroadcastCamera(dt, playerPos, ballPos) {
    const bp = this._broadcastPositions[this._broadcastIndex];
    this.camera.position.lerp(bp, Math.min(dt * 2.5, 1));

    const center = new THREE.Vector3(0, 2, 0);
    if (ballPos) center.lerp(new THREE.Vector3(ballPos.x, ballPos.y, ballPos.z), 0.35);
    this.target.lerp(center, Math.min(dt * 3, 1));
    this.camera.lookAt(this.target);
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  FREE / ORBIT CAMERA
  // ═══════════════════════════════════════════════════════════════════════

  _updateFreeCamera(dt) {
    const x = this._orbitRadius * Math.sin(this._orbitPhi) * Math.sin(this._orbitTheta);
    const y = this._orbitRadius * Math.cos(this._orbitPhi);
    const z = this._orbitRadius * Math.sin(this._orbitPhi) * Math.cos(this._orbitTheta);

    const tp = new THREE.Vector3(
      this._orbitTarget.x + x,
      this._orbitTarget.y + y,
      this._orbitTarget.z + z
    );

    this.camera.position.lerp(tp, Math.min(dt * 3, 1));
    this.target.lerp(this._orbitTarget, Math.min(dt * 3, 1));
    this.camera.lookAt(this.target);

    this._orbitTheta += dt * 0.18;
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  BALL CAMERA
  // ═══════════════════════════════════════════════════════════════════════

  _updateBallCamera(dt, ballPos, playerPos) {
    if (!ballPos) {
      this._updateFollowCamera(dt, playerPos, null, false);
      return;
    }

    const offset = new THREE.Vector3(2.5, 1.5, 3.5);
    const tp = new THREE.Vector3(
      ballPos.x + offset.x,
      ballPos.y + offset.y,
      ballPos.z + offset.z
    );

    this.camera.position.lerp(tp, Math.min(dt * 9, 1));
    this.target.lerp(new THREE.Vector3(ballPos.x, ballPos.y, ballPos.z), Math.min(dt * 9, 1));
    this.camera.lookAt(this.target);

    this._targetFOV = 72;
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  SHAKE
  // ═══════════════════════════════════════════════════════════════════════

  shake(intensity = 0.3) {
    this._shakeIntensity = Math.max(this._shakeIntensity, intensity);
  }

  _updateShake(dt) {
    if (this._shakeIntensity > 0.001) {
      this._shakeOffset.set(
        (Math.random() - 0.5) * this._shakeIntensity,
        (Math.random() - 0.5) * this._shakeIntensity,
        (Math.random() - 0.5) * this._shakeIntensity
      );
      this._shakeIntensity -= this._shakeDecay * dt * this._shakeIntensity;
    } else {
      this._shakeIntensity = 0;
      this._shakeOffset.set(0, 0, 0);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  MOUSE INPUT
  // ═══════════════════════════════════════════════════════════════════════

  setMouseDelta(dx, dy) {
    this._targetYaw   += dx * 0.0028;
    this._targetPitch  = MathUtils.clamp(this._targetPitch + dy * 0.0018, 0.05, 1.1);
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  MODE MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════

  cycleMode() {
    this.currentMode = (this.currentMode + 1) % Object.keys(this.MODES).length;
    this._targetFOV  = 60;

    if (this.currentMode === this.MODES.BROADCAST) {
      this._broadcastIndex = (this._broadcastIndex + 1) % this._broadcastPositions.length;
    }

    return this.currentMode;
  }

  setMode(mode) {
    this.currentMode = mode;
    this._targetFOV  = 60;
  }

  playShotCinematic(ballPos, hoopPos) {
    const prevMode = this.currentMode;
    this.setMode(this.MODES.BALL);
    this._targetFOV = 68;
    setTimeout(() => {
      this.setMode(prevMode);
      this._targetFOV = 60;
    }, 2200);
  }

  orbit(deltaTheta, deltaPhi) {
    this._orbitTheta += deltaTheta;
    this._orbitPhi    = MathUtils.clamp(this._orbitPhi + deltaPhi, 0.1, Math.PI * 0.45);
  }

  getModeNames() {
    return ['FIRST_PERSON', 'FOLLOW', 'BROADCAST', 'FREE', 'BALL'];
  }
}
