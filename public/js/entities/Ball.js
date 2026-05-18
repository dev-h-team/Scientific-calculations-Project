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
 *   • Glow on score
 *
 * Key fix: Ball.shoot() sets inFlight = true and lets the physics engine
 * move the ball naturally.  There is NO teleportation or lerp — the ball
 * follows the ballistic trajectory computed by PhysicsEngine.calcShotVelocity().
 */

class Ball {
  constructor(scene, physicsEngine, ballPhysics) {
    this.scene       = scene;
    this.physics     = physicsEngine;
    this.ballPhysics = ballPhysics;

    // ── Dimensions (world units) ──────────────────────────────────────────
    // NBA ball radius: 0.12 m × SCALE(3) = 0.36 wu
    // Rim radius is 0.2286m × SCALE(3) = 0.6858 wu
    // This ratio (0.36 / 0.68) is correct for NBA.
    this.radius = ballPhysics.radius * physicsEngine.SCALE;   // 0.36 wu

    // ── Physics body ──────────────────────────────────────────────────────
    this.body = ballPhysics.createBody({ x: 0, y: 1.2, z: 8 });
    physicsEngine.addBody(this.body);

    // ── State ─────────────────────────────────────────────────────────────
    this.inFlight  = false;
    this.hasScored = false;

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
  //  SHOOTING  (core entry point)
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Launch the ball toward targetPosition.
   *
   * The ball's physics body is already at the correct release point
   * (set by Game._update before calling this).
   * We simply apply the impulse and set inFlight = true.
   * The physics engine then moves the ball naturally every frame.
   *
   * @param {Object} targetPosition - hoop centre in world units
   * @param {number} power          - 0–1 player input
   * @param {number} angleOffset    - horizontal yaw offset (radians)
   */
  shoot(targetPosition, power, angleOffset = 0) {
    const from = {
      x: this.body.position.x,
      y: this.body.position.y,
      z: this.body.position.z
    };

    this.inFlight  = true;
    this.hasScored = false;

    // Apply ballistic impulse via BallPhysics
    this.ballPhysics.applyShot(this.body, from, targetPosition, power, angleOffset, true);

    // Show trail
    this.trail.visible = true;
    this._trailPoints  = [];

    // Hide trajectory preview
    this.showTrajectoryPreview(false);
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  RESET
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
    this.inFlight  = false;
    this.hasScored = false;

    this.trail.visible = false;
    this._trailPoints  = [];
    this.showTrajectoryPreview(false);
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

    // ── Rotation from angular velocity ────────────────────────────────────
    if (this.inFlight || this.ballPhysics.isRolling) {
      if (this.body.angularVelocity) {
        this.mesh.rotation.x += this.body.angularVelocity.x * dt;
        this.mesh.rotation.y += this.body.angularVelocity.y * dt;
        this.mesh.rotation.z += this.body.angularVelocity.z * dt;
      } else {
        // Fallback: derive rotation from velocity direction
        const speed = this.ballPhysics.getSpeed(this.body);
        if (speed > 0.5) {
          const rotRate = speed / this.radius;
          this.mesh.rotation.x += this.body.velocity.z * rotRate * dt * 0.5;
          this.mesh.rotation.z -= this.body.velocity.x * rotRate * dt * 0.5;
        }
      }
    }

    // ── Trail ─────────────────────────────────────────────────────────────
    if (this.inFlight) {
      this._updateTrail();
    }

    // ── Shadow blob ───────────────────────────────────────────────────────
    this._updateShadowBlob();

    // ── Auto-land detection ───────────────────────────────────────────────
    if (this.inFlight && this.ballPhysics.isAtRest(this.body, 0.5)) {
      this.inFlight      = false;
      this.trail.visible = false;
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
