/**
 * Ball - NBA Basketball Entity
 *
 * Features:
 *   • Procedural canvas texture (orange + black seams + pebble normal map)
 *   • Physics body managed by BallPhysics
 *   • Realistic rotation: mesh rotates based on angularVelocity from physics
 *   • Motion trail (fading orange line during flight)
 *   • Trajectory preview dots (shown while charging shot)
 *   • Dynamic shadow blob (scales with height)
 *   • Glow on score, flash on collision
 *
 * Key distinction:
 *   inFlight       = ball was shot and is still in primary ballistic flight
 *                    (used for scoring detection & trajectory lock-on).
 *   physicsActive  = ball is still moving / bouncing (not yet at rest).
 *   Ball stays physically simulated after landing until R is pressed.
 */

class Ball {
  constructor(scene, physicsEngine, ballPhysics) {
    this.scene       = scene;
    this.physics     = physicsEngine;
    this.ballPhysics = ballPhysics;

    // ── Dimensions (world units) ──────────────────────────────────────────
    // NBA ball radius: 0.12 m × SCALE(3) = 0.36 wu
    this.radius = ballPhysics.radius * physicsEngine.SCALE;   // 0.36 wu

    // ── Physics body ──────────────────────────────────────────────────────
    this.body = ballPhysics.createBody({ x: 0, y: 1.2, z: 8 });
    physicsEngine.addBody(this.body);

    // ── State ─────────────────────────────────────────────────────────────
    this.inFlight      = false;  // ball is in primary shot flight (scoring window)
    this.physicsActive = false;  // ball is still bouncing/rolling (not pinned)
    this.isHeld        = true;   // ball is in player's hand (pinned to hold position)
    this.hasScored     = false;

    // ── Collision flash ───────────────────────────────────────────────────
    this._flashTimer = 0;
    this._flashType  = null;   // 'floor' | 'rim' | 'backboard'

    // ── Trail ─────────────────────────────────────────────────────────────
    this._trailPoints    = [];
    this._maxTrailPoints = 28;

    // ── Trajectory preview ────────────────────────────────────────────────
    this._trajectoryDots   = [];
    this._TRAJECTORY_DOTS  = 30;
    this._showTrajectory   = false;

    this._build();
    this._buildTrail();
    this._buildTrajectoryPreview();
    this._buildShadowBlob();

    // ── Quaternion rotation accumulator ──────────────────────────────────
    // We accumulate rotations via quaternion multiplication to avoid
    // Euler gimbal lock and get physically correct spin axes.
    this._rotQ    = new THREE.Quaternion(); // current accumulated rotation
    this._tmpQ    = new THREE.Quaternion(); // scratch quaternion
    this._rotAxis = new THREE.Vector3();    // scratch axis
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  MESH CONSTRUCTION
  // ═══════════════════════════════════════════════════════════════════════

  _build() {
    const geo = new THREE.SphereGeometry(this.radius, 32, 32);
    const mat = new THREE.MeshStandardMaterial({
      map:              this._createBasketballTexture(),
      normalMap:        this._createNormalMap(),
      normalScale:      new THREE.Vector2(0.6, 0.6),
      roughness:        0.72,
      metalness:        0.0,
      envMapIntensity:  0.4
    });

    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.castShadow    = true;
    this.mesh.receiveShadow = false;
    this.scene.add(this.mesh);

    this.mesh.position.set(
      this.body.position.x,
      this.body.position.y,
      this.body.position.z
    );
  }

  _createBasketballTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 512;
    const ctx = canvas.getContext('2d');

    // Base orange gradient
    const grad = ctx.createRadialGradient(256, 200, 40, 256, 256, 290);
    grad.addColorStop(0,   '#FF7722');
    grad.addColorStop(0.5, '#E85500');
    grad.addColorStop(1,   '#CC4400');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 512);

    // Pebble texture (subtle dots)
    for (let i = 0; i < 2200; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      const r = 0.8 + Math.random() * 1.8;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${Math.random() > 0.5 ? 170 : 245},${Math.random() > 0.5 ? 55 : 90},0,0.14)`;
      ctx.fill();
    }

    // Main seams (thick black)
    ctx.strokeStyle = '#0D0D0D';
    ctx.lineWidth   = 7;
    ctx.lineCap     = 'round';

    // Horizontal seam
    ctx.beginPath();
    ctx.moveTo(0, 256);
    ctx.bezierCurveTo(100, 218, 412, 294, 512, 256);
    ctx.stroke();

    // Vertical seam
    ctx.beginPath();
    ctx.moveTo(256, 0);
    ctx.bezierCurveTo(218, 100, 294, 412, 256, 512);
    ctx.stroke();

    // Side arcs
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#1A1A1A';

    ctx.beginPath();
    ctx.moveTo(0, 90);
    ctx.bezierCurveTo(75, 190, 75, 322, 0, 422);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(512, 90);
    ctx.bezierCurveTo(437, 190, 437, 322, 512, 422);
    ctx.stroke();

    // Seam highlight
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth   = 2;
    ctx.beginPath();
    ctx.moveTo(0, 253);
    ctx.bezierCurveTo(100, 215, 412, 291, 512, 253);
    ctx.stroke();

    return new THREE.CanvasTexture(canvas);
  }

  _createNormalMap() {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 256;
    const ctx = canvas.getContext('2d');

    // Flat normal base
    ctx.fillStyle = '#8080FF';
    ctx.fillRect(0, 0, 256, 256);

    // Pebble bumps
    for (let i = 0; i < 600; i++) {
      const x = Math.random() * 256;
      const y = Math.random() * 256;
      const r = 2 + Math.random() * 3;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0,   'rgba(95, 95, 195, 0.65)');
      g.addColorStop(1,   'rgba(128, 128, 255, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    return new THREE.CanvasTexture(canvas);
  }

  _buildTrail() {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(this._maxTrailPoints * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));

    const mat = new THREE.LineBasicMaterial({
      color:       0xFF8800,
      transparent: true,
      opacity:     0.45,
      linewidth:   2
    });

    this.trail         = new THREE.Line(geo, mat);
    this.trail.visible = false;
    this.scene.add(this.trail);
  }

  _buildTrajectoryPreview() {
    for (let i = 0; i < this._TRAJECTORY_DOTS; i++) {
      const geo = new THREE.SphereGeometry(0.045, 8, 8);
      const mat = new THREE.MeshBasicMaterial({
        color:       0xFFFFFF,
        transparent: true,
        opacity:     0.65 * (1 - i / this._TRAJECTORY_DOTS)
      });
      const dot     = new THREE.Mesh(geo, mat);
      dot.visible   = false;
      this.scene.add(dot);
      this._trajectoryDots.push(dot);
    }
  }

  _buildShadowBlob() {
    const geo = new THREE.CircleGeometry(this.radius * 1.15, 18);
    const mat = new THREE.MeshBasicMaterial({
      color:       0x000000,
      transparent: true,
      opacity:     0.38
    });
    this.shadowBlob          = new THREE.Mesh(geo, mat);
    this.shadowBlob.rotation.x = -Math.PI / 2;
    this.shadowBlob.position.y = 0.006;
    this.scene.add(this.shadowBlob);
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  SHOOTING  (core entry point — hoop-targeted shot)
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Launch the ball toward targetPosition.
   * inFlight and physicsActive are both set to true.
   */
  shoot(targetPosition, power, angleOffset = 0) {
    const from = {
      x: this.body.position.x,
      y: this.body.position.y,
      z: this.body.position.z
    };

    this.inFlight      = true;
    this.physicsActive = true;
    this.hasScored     = false;
    this.body.active   = true;  // reactivate frozen body when shooting

    // Apply ballistic impulse via BallPhysics
    this.ballPhysics.applyShot(this.body, from, targetPosition, power, angleOffset, true);

    // Show trail
    this.trail.visible = true;
    this._trailPoints  = [];

    // Hide trajectory preview
    this.showTrajectoryPreview(false);
  }

  /**
   * Launch the ball using explicit speed + angle in camera direction.
   * Used by Physics Panel free-shot mode.
   *
   * @param {number} speedMS  - launch speed in m/s
   * @param {number} angleDeg - launch elevation in degrees
   * @param {number} yaw      - horizontal direction (camera yaw, radians)
   */
  shootFree(speedMS, angleDeg, yaw) {
    this.inFlight      = true;
    this.physicsActive = true;
    this.hasScored     = false;

    const vel = this.physics.calcFreeShotVelocity(speedMS, MathUtils.toRad(angleDeg), yaw);
    this.body.velocity.x = vel.x;
    this.body.velocity.y = vel.y;
    this.body.velocity.z = vel.z;

    // Add backspin proportional to launch speed
    const speed         = Math.sqrt(vel.x * vel.x + vel.y * vel.y + vel.z * vel.z);
    const backspinRate  = speed * 0.12;
    const dirX          =  Math.sin(yaw);
    const dirZ          =  Math.cos(yaw);
    this.body.angularVelocity.x = -dirZ * backspinRate;
    this.body.angularVelocity.z =  dirX * backspinRate;
    this.body.angularVelocity.y = 0;

    this.body.active   = true;
    this.trail.visible = true;
    this._trailPoints  = [];
    this.showTrajectoryPreview(false);
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  RESET  (only called on R key press)
  // ═══════════════════════════════════════════════════════════════════════

  reset(position) {
    this.body.position.x = position.x;
    this.body.position.y = position.y;
    this.body.position.z = position.z;
    this.body.velocity.x = 0;
    this.body.velocity.y = 0;
    this.body.velocity.z = 0;
    if (this.body.angularVelocity) {
      this.body.angularVelocity.x = 0;
      this.body.angularVelocity.y = 0;
      this.body.angularVelocity.z = 0;
    }
    this.body.rotation = { x: 0, y: 0, z: 0 };
    this.body.active    = true;   // reactivate physics so shooting works again
    this.inFlight       = false;
    this.physicsActive  = false;
    this.isHeld         = true;   // ball is in player's hand
    this.hasScored      = false;
    this._flashTimer    = 0;

    // Reset quaternion spin accumulator so ball starts stationary-looking
    this._rotQ.identity();
    this.mesh.quaternion.identity();

    this.trail.visible = false;
    this._trailPoints  = [];
    this.showTrajectoryPreview(false);

    // Clear emissive glow
    if (this.mesh.material) {
      this.mesh.material.emissiveIntensity = 0;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  COLLISION FLASH
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Briefly flash the ball material when it hits a surface.
   * Only fires on strong impacts (speed > threshold) to avoid constant flicker.
   * @param {'floor'|'rim'|'backboard'} type
   * @param {number} [impactSpeed] - impact speed in m/s (optional, for threshold)
   */
  flashCollision(type, impactSpeed = 99) {
    // Floor bounces are common — only flash for hard floor impacts
    if (type === 'floor' && impactSpeed < 3.0) return;
    // Rim and backboard: only flash for meaningful impacts
    if (impactSpeed < 1.5) return;

    this._flashType  = type;
    this._flashTimer = 0.12;  // shorter flash

    const colors = { floor: 0xFFDD88, rim: 0xFF5500, backboard: 0x88AAFF };
    if (this.mesh.material) {
      this.mesh.material.emissive          = new THREE.Color(colors[type] || 0xFFFFFF);
      this.mesh.material.emissiveIntensity = 0.45;  // subtle — not blinding
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  TRAJECTORY PREVIEW
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Show or hide the trajectory preview dots.
   *
   * @param {boolean}        show   - whether to show
   * @param {Array<{x,y,z}>} points - world-unit positions from BallPhysics.calcTrajectoryPreview
   */
  showTrajectoryPreview(show, points) {
    this._showTrajectory = show;

    if (show && points && points.length > 0) {
      const total = this._TRAJECTORY_DOTS;
      const step  = Math.max(1, Math.floor(points.length / total));

      this._trajectoryDots.forEach((dot, i) => {
        const idx = Math.min(i * step, points.length - 1);
        const pt  = points[idx];
        if (pt && pt.y >= 0) {
          dot.position.set(pt.x, pt.y, pt.z);
          dot.visible          = true;
          dot.material.opacity = 0.70 * (1 - i / total);
        } else {
          dot.visible = false;
        }
      });
    } else {
      this._trajectoryDots.forEach(d => (d.visible = false));
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  PER-FRAME UPDATE
  // ═══════════════════════════════════════════════════════════════════════

  update(dt, time) {
    // ── Sync mesh with physics body ───────────────────────────────────────
    this.mesh.position.set(
      this.body.position.x,
      this.body.position.y,
      this.body.position.z
    );

    // ── Realistic ball rotation (quaternion accumulator) ─────────────────
    // Two sources of rotation are combined every frame:
    //   1. angularVelocity from physics (spin set at launch — backspin etc.)
    //   2. Rolling-derived rotation from linear velocity (seam rolls on floor)
    {
      const av = this.body.angularVelocity;
      const vx = this.body.velocity.x;
      const vy = this.body.velocity.y;
      const vz = this.body.velocity.z;

      // Source 1: Physics angular velocity (spin)
      // angularVelocity is in rad/s (world). Scale up so it's visible.
      const AV_SCALE = this.physics.SCALE;   // 3.0 — compensates for WU/m ratio
      let wx = av ? av.x * AV_SCALE : 0;
      let wy = av ? av.y * AV_SCALE : 0;
      let wz = av ? av.z * AV_SCALE : 0;

      // Source 2: Rolling from linear velocity (contributes when ball moves)
      // Rolling: ω_roll = v_horiz / r  along the axis perp to motion
      const horizSpeed = Math.sqrt(vx * vx + vz * vz);
      if (horizSpeed > 0.05) {
        const rollRate = horizSpeed / this.radius;  // rad/s
        // Axis perpendicular to motion direction in XZ plane
        const ax = vz / horizSpeed;
        const az = -vx / horizSpeed;
        wx += ax * rollRate;
        wz += az * rollRate;
      }

      // Apply combined rotation if there's any spin
      const angSpeed = Math.sqrt(wx * wx + wy * wy + wz * wz);
      if (angSpeed > 0.001 && (this.physicsActive || this.inFlight || this.ballPhysics.isRolling)) {
        this._rotAxis.set(wx / angSpeed, wy / angSpeed, wz / angSpeed);
        this._tmpQ.setFromAxisAngle(this._rotAxis, angSpeed * dt);
        this._rotQ.premultiply(this._tmpQ);
        this.mesh.quaternion.copy(this._rotQ);
      }
    }

    // ── Trail (only during primary flight) ───────────────────────────────
    if (this.inFlight) {
      this._updateTrail();
    }

    // ── Shadow blob ───────────────────────────────────────────────────────
    this._updateShadowBlob();

    // ── Collision flash fade-out ──────────────────────────────────────────
    if (this._flashTimer > 0) {
      this._flashTimer -= dt;
      const intensity = Math.max(0, (this._flashTimer / 0.12)) * 0.45;
      if (this.mesh.material) {
        this.mesh.material.emissiveIntensity = intensity;
      }
      if (this._flashTimer <= 0) {
        this._flashTimer = 0;
        if (this.mesh.material && !this.hasScored) {
          this.mesh.material.emissiveIntensity = 0;
        }
      }
    }

    // ── Auto-land detection ───────────────────────────────────────────────
    // inFlight ends when ball reaches near-rest; physicsActive stays true.
    // physicsActive ends only when truly stationary OR reset() called.
    if (this.inFlight && this.ballPhysics.isAtRest(this.body, 0.5)) {
      this.inFlight      = false;
      this.trail.visible = false;
      // physicsActive remains true → ball keeps bouncing freely
    }

    if (this.physicsActive && !this.inFlight) {
      if (this.ballPhysics.isAtRest(this.body, 0.15)) {
        this.physicsActive  = false;
        // Freeze the physics body so gravity cannot pull the ball through
        // the floor after it comes to rest. It will stay exactly where it
        // landed until the player presses R (→ reset() reactivates it).
        this.body.active    = false;
        this.body.velocity.x = 0;
        this.body.velocity.y = 0;
        this.body.velocity.z = 0;
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  TRAIL
  // ═══════════════════════════════════════════════════════════════════════

  _updateTrail() {
    // Prepend current position
    this._trailPoints.unshift({
      x: this.body.position.x,
      y: this.body.position.y,
      z: this.body.position.z
    });

    if (this._trailPoints.length > this._maxTrailPoints) {
      this._trailPoints.pop();
    }

    const pos = this.trail.geometry.attributes.position.array;
    const len = this._trailPoints.length;

    for (let i = 0; i < len; i++) {
      pos[i * 3]     = this._trailPoints[i].x;
      pos[i * 3 + 1] = this._trailPoints[i].y;
      pos[i * 3 + 2] = this._trailPoints[i].z;
    }

    // Collapse remaining points to last known position
    if (len > 0) {
      const last = this._trailPoints[len - 1];
      for (let i = len; i < this._maxTrailPoints; i++) {
        pos[i * 3]     = last.x;
        pos[i * 3 + 1] = last.y;
        pos[i * 3 + 2] = last.z;
      }
    }

    this.trail.geometry.attributes.position.needsUpdate = true;
    this.trail.geometry.setDrawRange(0, len);
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  SHADOW BLOB
  // ═══════════════════════════════════════════════════════════════════════

  _updateShadowBlob() {
    const height  = Math.max(0, this.body.position.y - this.radius);
    const scale   = Math.max(0.08, 1.0 - height * 0.07);
    const opacity = Math.max(0.04, 0.38 - height * 0.025);

    this.shadowBlob.position.x = this.body.position.x;
    this.shadowBlob.position.z = this.body.position.z;
    this.shadowBlob.scale.set(scale, scale, scale);
    this.shadowBlob.material.opacity = opacity;
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  SCORE CELEBRATION
  // ═══════════════════════════════════════════════════════════════════════

  celebrateScore() {
    this.hasScored = true;
    if (this.mesh.material) {
      this.mesh.material.emissive          = new THREE.Color(0xFF6600);
      this.mesh.material.emissiveIntensity = 0.6;
      let t = 0;
      const fade = setInterval(() => {
        t += 0.05;
        if (this.mesh.material) {
          this.mesh.material.emissiveIntensity = Math.max(0, 0.6 - t);
        }
        if (t >= 0.6) clearInterval(fade);
      }, 50);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  HELPERS
  // ═══════════════════════════════════════════════════════════════════════

  getPosition() {
    return {
      x: this.body.position.x,
      y: this.body.position.y,
      z: this.body.position.z
    };
  }

  dispose() {
    this.physics.removeBody(this.body);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.scene.remove(this.mesh);
    this.scene.remove(this.trail);
    this.scene.remove(this.shadowBlob);
    this._trajectoryDots.forEach(d => {
      d.geometry.dispose();
      d.material.dispose();
      this.scene.remove(d);
    });
  }
}
