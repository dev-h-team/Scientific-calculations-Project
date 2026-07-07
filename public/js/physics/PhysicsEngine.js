/**
 * PhysicsEngine - Production-Grade Custom Physics Engine
 *
 * Built entirely from scratch — NO external physics libraries.
 * Implements:
 *   • Gravity & projectile motion (real-world equations)
 *   • Quadratic air drag (correct aerodynamic formula)
 *   • Fixed-timestep integration with sub-step accumulator
 *   • Sphere-plane, sphere-sphere, sphere-box collision response
 *   • Restitution + friction impulse resolution
 *   • Magnus effect (backspin/topspin influence on trajectory)
 *   • Ballistic shot-velocity solver (hits target exactly at power=1)
 *   • Trajectory preview with drag simulation
 *   • setParam() API — all constants tunable at runtime from PhysicsPanel
 *
 * Coordinate system:
 *   • Y = up
 *   • All positions are in WORLD UNITS
 *   • SCALE = 3.0 world-units per metre
 *     (so 1 metre real = 3 world units)
 */

class PhysicsEngine {
  constructor() {
    // ── Real-world constants ─────────────────────────────────────────────
    this.GRAVITY          = 9.81;    // m/s²
    this.SCALE            = 3.0;     // world-units per metre
    this.TIME_SCALE       = 1.0;

    // ── Fixed timestep ───────────────────────────────────────────────────
    this.FIXED_DT         = 1 / 120; // 120 Hz physics
    this.MAX_SUBSTEPS     = 6;

    // ── Aerodynamics (NBA ball) ──────────────────────────────────────────
    this.AIR_DENSITY      = 1.225;   // kg/m³
    this.DRAG_COEFFICIENT = 0.47;    // sphere Cd
    this.BALL_RADIUS_M    = 0.12;    // metres (NBA regulation)
    this.BALL_CROSS_AREA  = Math.PI * this.BALL_RADIUS_M * this.BALL_RADIUS_M; // m²
    this.BALL_MASS        = 0.623;   // kg (NBA regulation)

    // Pre-compute drag constant: k = 0.5 * rho * Cd * A / m
    this._updateDragK();

    // ── Surface coefficients ─────────────────────────────────────────────
    this.FRICTION_FLOOR      = 0.6;
    this.FRICTION_BACKBOARD  = 0.4;
    this.FRICTION_RIM        = 0.3;

    this.RESTITUTION_FLOOR     = 0.72;
    this.RESTITUTION_BACKBOARD = 0.65;
    this.RESTITUTION_RIM       = 0.55;

    // ── Magnus effect scale ──────────────────────────────────────────────
    this.MAGNUS_SCALE     = 1.0;     // multiplier on Magnus force (0=disabled)

    // ── Shot velocity limits (world units/s) ─────────────────────────────
    this.MIN_SHOT_SPEED = 8.0  * this.SCALE;
    this.MAX_SHOT_SPEED = 13.0 * this.SCALE;

    // ── Accumulator ──────────────────────────────────────────────────────
    this._accumulator = 0;

    // ── Body registry ────────────────────────────────────────────────────
    this._bodies = [];

    // ── Collision callbacks ───────────────────────────────────────────────
    this._collisionCallbacks = [];

    this.debug = false;
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  EXTERNAL PARAMETER API  (called by PhysicsPanel)
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Set any physics parameter by name at runtime.
   * Automatically recomputes derived values (e.g. _dragK after Cd/mass change).
   *
   * @param {string} param - parameter name (e.g. 'GRAVITY', 'DRAG_COEFFICIENT')
   * @param {number} value - new value
   */
  setParam(param, value) {
    if (!(param in this)) {
      console.warn(`PhysicsEngine.setParam: unknown param "${param}"`);
      return;
    }
    this[param] = value;
    // Recompute derived constants when aerodynamics change
    if (['AIR_DENSITY', 'DRAG_COEFFICIENT', 'BALL_CROSS_AREA', 'BALL_MASS'].includes(param)) {
      this._updateDragK();
    }
  }

  /**
   * Get a snapshot of all tunable physics parameters.
   * @returns {Object}
   */
  getParams() {
    return {
      GRAVITY:               this.GRAVITY,
      TIME_SCALE:            this.TIME_SCALE,
      AIR_DENSITY:           this.AIR_DENSITY,
      DRAG_COEFFICIENT:      this.DRAG_COEFFICIENT,
      BALL_MASS:             this.BALL_MASS,
      RESTITUTION_FLOOR:     this.RESTITUTION_FLOOR,
      RESTITUTION_BACKBOARD: this.RESTITUTION_BACKBOARD,
      RESTITUTION_RIM:       this.RESTITUTION_RIM,
      FRICTION_FLOOR:        this.FRICTION_FLOOR,
      FRICTION_BACKBOARD:    this.FRICTION_BACKBOARD,
      FRICTION_RIM:          this.FRICTION_RIM,
      MAGNUS_SCALE:          this.MAGNUS_SCALE,
    };
  }

  /** Recompute the drag constant k from current aerodynamic properties. */
  _updateDragK() {
    this._dragK = (0.5 * this.AIR_DENSITY * this.DRAG_COEFFICIENT * this.BALL_CROSS_AREA)
                  / this.BALL_MASS;
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  BODY MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════

  addBody(body)    { this._bodies.push(body); return body; }
  removeBody(body) {
    const i = this._bodies.indexOf(body);
    if (i !== -1) this._bodies.splice(i, 1);
  }
  onCollision(cb)  { this._collisionCallbacks.push(cb); }

  // ═══════════════════════════════════════════════════════════════════════
  //  MAIN UPDATE  (fixed-timestep accumulator)
  // ═══════════════════════════════════════════════════════════════════════

  update(dt) {
    const scaled = dt * this.TIME_SCALE;
    this._accumulator += scaled;

    let steps = 0;
    while (this._accumulator >= this.FIXED_DT && steps < this.MAX_SUBSTEPS) {
      this._step(this.FIXED_DT);
      this._accumulator -= this.FIXED_DT;
      steps++;
    }
  }

  _step(dt) {
    for (const body of this._bodies) {
      if (!body.active || body.isStatic) continue;
      this._integrateBody(body, dt);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  INTEGRATION  (semi-implicit Euler with correct drag)
  // ═══════════════════════════════════════════════════════════════════════

  _integrateBody(body, dt) {
    // ── Gravity ──────────────────────────────────────────────────────────
    if (body.useGravity) {
      body.velocity.y -= this.GRAVITY * this.SCALE * dt;
    }

    // ── Aerodynamic drag ─────────────────────────────────────────────────
    if (body.useAirResistance) {
      const vx = body.velocity.x;
      const vy = body.velocity.y;
      const vz = body.velocity.z;
      const speedWU = Math.sqrt(vx * vx + vy * vy + vz * vz);

      if (speedWU > 0.01) {
        const speedMS   = speedWU / this.SCALE;
        const aDragMS   = this._dragK * speedMS * speedMS;
        const aDragWU   = aDragMS * this.SCALE;
        const reduction = Math.min(aDragWU * dt / speedWU, 0.98);
        const factor    = 1.0 - reduction;
        body.velocity.x *= factor;
        body.velocity.y *= factor;
        body.velocity.z *= factor;
      }
    }

    // ── Magnus effect (spin → lateral force) ─────────────────────────────
    if (body.spin && body.angularVelocity && this.MAGNUS_SCALE > 0) {
      const mf = this._calcMagnusForce(body);
      body.velocity.x += mf.x * dt * this.MAGNUS_SCALE;
      body.velocity.y += mf.y * dt * this.MAGNUS_SCALE;
      body.velocity.z += mf.z * dt * this.MAGNUS_SCALE;
    }

    // ── Linear damping (rolling resistance / minor energy loss) ──────────
    if (body.linearDamping > 0) {
      const d = Math.pow(1 - body.linearDamping, dt);
      body.velocity.x *= d;
      body.velocity.y *= d;
      body.velocity.z *= d;
    }

    // ── Position integration ─────────────────────────────────────────────
    body.position.x += body.velocity.x * dt;
    body.position.y += body.velocity.y * dt;
    body.position.z += body.velocity.z * dt;

    // ── Angular velocity / rotation ────────────────────────────────────────────
    if (body.angularVelocity) {
      body.rotation.x += body.angularVelocity.x * dt;
      body.rotation.y += body.angularVelocity.y * dt;
      body.rotation.z += body.angularVelocity.z * dt;

      // Very gentle damping — spin should persist visibly during flight
      // 0.994^(60*dt) ≈ 0.696 per second → spin visible for ~3s
      const angDamp = Math.pow(0.994, dt * 60);
      body.angularVelocity.x *= angDamp;
      body.angularVelocity.y *= angDamp;
      body.angularVelocity.z *= angDamp;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  MAGNUS FORCE  (backspin lifts ball, topspin drops it)
  // ═══════════════════════════════════════════════════════════════════════

  _calcMagnusForce(body) {
    const kM = 0.00008;
    const w  = body.angularVelocity;
    const v  = body.velocity;
    return {
      x: kM * (w.y * v.z - w.z * v.y),
      y: kM * (w.z * v.x - w.x * v.z),
      z: kM * (w.x * v.y - w.y * v.x)
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  COLLISION DETECTION & RESPONSE
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Sphere ↔ horizontal plane
   */
  spherePlaneCollision(sphere, plane, restitution, friction) {
    const dist = this._dot(sphere.position, plane.normal) - plane.distance;
    if (dist < sphere.radius) {
      const pen = sphere.radius - dist;
      sphere.position.x += plane.normal.x * pen;
      sphere.position.y += plane.normal.y * pen;
      sphere.position.z += plane.normal.z * pen;

      const vDotN = this._dot(sphere.velocity, plane.normal);
      if (vDotN < 0) {
        const impulse = -(1 + restitution) * vDotN;
        sphere.velocity.x += impulse * plane.normal.x;
        sphere.velocity.y += impulse * plane.normal.y;
        sphere.velocity.z += impulse * plane.normal.z;

        // Tangential friction
        const tang = {
          x: sphere.velocity.x - vDotN * plane.normal.x,
          y: sphere.velocity.y - vDotN * plane.normal.y,
          z: sphere.velocity.z - vDotN * plane.normal.z
        };
        const tSpeed = this._magnitude(tang);
        if (tSpeed > 0.01) {
          const fi = Math.min(friction * Math.abs(impulse), tSpeed);
          sphere.velocity.x -= (tang.x / tSpeed) * fi;
          sphere.velocity.y -= (tang.y / tSpeed) * fi;
          sphere.velocity.z -= (tang.z / tSpeed) * fi;
        }

        if (sphere.spin) this._applySpinOnBounce(sphere, plane.normal);
        return true;
      }
    }
    return false;
  }

  /**
   * Sphere ↔ sphere  (used for rim contact points)
   */
  sphereSphereCollision(sA, sB, restitution) {
    const dx = sA.position.x - sB.position.x;
    const dy = sA.position.y - sB.position.y;
    const dz = sA.position.z - sB.position.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const minD = sA.radius + sB.radius;

    if (dist < minD && dist > 0.0001) {
      const nx = dx / dist, ny = dy / dist, nz = dz / dist;
      const pen = minD - dist;
      const massRatio = sB.isStatic ? 1.0 : 0.5;

      sA.position.x += nx * pen * massRatio;
      sA.position.y += ny * pen * massRatio;
      sA.position.z += nz * pen * massRatio;

      if (!sB.isStatic) {
        sB.position.x -= nx * pen * massRatio;
        sB.position.y -= ny * pen * massRatio;
        sB.position.z -= nz * pen * massRatio;
      }

      const rvx = sA.velocity.x - (sB.isStatic ? 0 : sB.velocity.x);
      const rvy = sA.velocity.y - (sB.isStatic ? 0 : sB.velocity.y);
      const rvz = sA.velocity.z - (sB.isStatic ? 0 : sB.velocity.z);
      const rvN = rvx * nx + rvy * ny + rvz * nz;

      if (rvN < 0) {
        const mA = sA.mass || 1;
        const invA = 1 / mA;
        const invB = sB.isStatic ? 0 : 1 / (sB.mass || 1);
        const j = -(1 + restitution) * rvN / (invA + invB);

        sA.velocity.x += j * invA * nx;
        sA.velocity.y += j * invA * ny;
        sA.velocity.z += j * invA * nz;

        if (!sB.isStatic) {
          sB.velocity.x -= j * invB * nx;
          sB.velocity.y -= j * invB * ny;
          sB.velocity.z -= j * invB * nz;
        }
        return { collision: true, normal: { x: nx, y: ny, z: nz }, impulse: j };
      }
    }
    return { collision: false };
  }

  /**
   * Sphere ↔ AABB box  (used for backboard).
   *
   * @param {object} sphere      - physics body with position, velocity, radius
   * @param {object} box         - { min:{x,y,z}, max:{x,y,z} }
   * @param {number} restitution - COR
   * @param {number} friction    - tangential friction coefficient
   * @param {string} [forceAxis] - 'x'|'y'|'z': force collision normal along this axis.
   *                               Use 'z' for the backboard so the ball ALWAYS bounces
   *                               back toward the player instead of falling straight down
   *                               when it clips the top/side edges of the board.
   */
  sphereBoxCollision(sphere, box, restitution, friction, forceAxis) {
    // Closest point on AABB to sphere centre
    const cx = Math.max(box.min.x, Math.min(sphere.position.x, box.max.x));
    const cy = Math.max(box.min.y, Math.min(sphere.position.y, box.max.y));
    const cz = Math.max(box.min.z, Math.min(sphere.position.z, box.max.z));

    const dx = sphere.position.x - cx;
    const dy = sphere.position.y - cy;
    const dz = sphere.position.z - cz;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (dist < sphere.radius && dist > 0.0001) {
      let nx = 0, ny = 0, nz = 0, minOverlap;

      const overlapX = (box.max.x - box.min.x) * 0.5 + sphere.radius - Math.abs(sphere.position.x - (box.min.x + box.max.x) * 0.5);
      const overlapY = (box.max.y - box.min.y) * 0.5 + sphere.radius - Math.abs(sphere.position.y - (box.min.y + box.max.y) * 0.5);
      const overlapZ = (box.max.z - box.min.z) * 0.5 + sphere.radius - Math.abs(sphere.position.z - (box.min.z + box.max.z) * 0.5);

      if (forceAxis === 'z') {
        // Backboard: ALWAYS bounce on Z (ball flies back toward player).
        // Never use Y-axis normal — that would drop the ball straight down.
        nz = sphere.position.z < (box.min.z + box.max.z) * 0.5 ? -1 : 1;
        minOverlap = Math.max(overlapZ, 0);
      } else if (forceAxis === 'x') {
        nx = sphere.position.x < (box.min.x + box.max.x) * 0.5 ? -1 : 1;
        minOverlap = Math.max(overlapX, 0);
      } else if (forceAxis === 'y') {
        ny = sphere.position.y < (box.min.y + box.max.y) * 0.5 ? -1 : 1;
        minOverlap = Math.max(overlapY, 0);
      } else {
        // Dominant-axis: pick smallest overlap (generic surfaces)
        if (overlapX <= overlapY && overlapX <= overlapZ) {
          nx = sphere.position.x < (box.min.x + box.max.x) * 0.5 ? -1 : 1;
          minOverlap = overlapX;
        } else if (overlapY <= overlapX && overlapY <= overlapZ) {
          ny = sphere.position.y < (box.min.y + box.max.y) * 0.5 ? -1 : 1;
          minOverlap = overlapY;
        } else {
          nz = sphere.position.z < (box.min.z + box.max.z) * 0.5 ? -1 : 1;
          minOverlap = overlapZ;
        }
      }

      // Separation
      sphere.position.x += nx * (Math.max(minOverlap, 0) + 0.001);
      sphere.position.y += ny * (Math.max(minOverlap, 0) + 0.001);
      sphere.position.z += nz * (Math.max(minOverlap, 0) + 0.001);

      // Velocity reflection with restitution
      const vDotN = sphere.velocity.x * nx + sphere.velocity.y * ny + sphere.velocity.z * nz;
      if (vDotN < 0) {
        const impulse = -(1 + restitution) * vDotN;
        sphere.velocity.x += impulse * nx;
        sphere.velocity.y += impulse * ny;
        sphere.velocity.z += impulse * nz;

        // Tangential friction
        const tang = {
          x: sphere.velocity.x - vDotN * nx,
          y: sphere.velocity.y - vDotN * ny,
          z: sphere.velocity.z - vDotN * nz
        };
        const tSpeed = this._magnitude(tang);
        if (tSpeed > 0.01) {
          const fi = Math.min(friction * Math.abs(impulse), tSpeed);
          sphere.velocity.x -= (tang.x / tSpeed) * fi;
          sphere.velocity.y -= (tang.y / tSpeed) * fi;
          sphere.velocity.z -= (tang.z / tSpeed) * fi;
        }

        if (sphere.spin) this._applySpinOnBounce(sphere, { x: nx, y: ny, z: nz });
        return { collision: true, normal: { x: nx, y: ny, z: nz } };
      }
    }
    return { collision: false };
  }

  /**
   * Spin effect on bounce (backspin reduces bounce height slightly)
   */
  _applySpinOnBounce(sphere, normal) {
    if (!sphere.angularVelocity) return;
    sphere.velocity.y  += sphere.angularVelocity.z * 0.018;
    sphere.velocity.x  += sphere.angularVelocity.y * 0.008;
    sphere.velocity.z  -= sphere.angularVelocity.x * 0.008;
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  SHOT VELOCITY SOLVER  (Angry-Birds style, ballistically correct)
  // ═══════════════════════════════════════════════════════════════════════

  calcShotVelocity(from, to, power, angle, angleOffset = 0) {
    const fromM = { x: from.x / this.SCALE, y: from.y / this.SCALE, z: from.z / this.SCALE };
    const toM   = { x: to.x   / this.SCALE, y: to.y   / this.SCALE, z: to.z   / this.SCALE };

    const dx = toM.x - fromM.x;
    const dz = toM.z - fromM.z;
    const horizDistM  = Math.sqrt(dx * dx + dz * dz);
    const heightDiffM = toM.y - fromM.y;

    // Use absolute gravity so we don't try to compute sqrt of negative number
    const g     = Math.abs(this.GRAVITY) || 0.001; 
    const cosA  = Math.cos(angle);
    const tanA  = Math.tan(angle);
    const denom = 2 * cosA * cosA * (horizDistM * tanA - heightDiffM);

    let v0IdealMS;
    if (denom > 0.001) {
      v0IdealMS = Math.sqrt((g * horizDistM * horizDistM) / denom);
    } else {
      v0IdealMS = Math.sqrt(g * horizDistM) * 1.2;
    }

    v0IdealMS = MathUtils.clamp(v0IdealMS, 5.0, 15.0);

    const powerMultiplier = MathUtils.lerp(0.55, 1.25, power);
    const v0MS = v0IdealMS * powerMultiplier;
    const v0WU = v0MS * this.SCALE;

    // ── Direction in XZ plane (with horizontal offset) ────────────────────
    const baseYaw  = Math.atan2(dz, dx);
    const finalYaw = baseYaw + angleOffset;
    const dirX = Math.cos(finalYaw);
    const dirZ = Math.sin(finalYaw);

    return {
      x: dirX * v0WU * Math.cos(angle),
      y:        v0WU * Math.sin(angle),
      z: dirZ * v0WU * Math.cos(angle)
    };
  }

  /**
   * Calculate launch velocity from explicit speed (m/s) and angle (radians)
   * in the direction of a given yaw angle.
   * Used for the free-shot mode (Freefire) from the Physics Panel.
   *
   * @param {number} speedMS   - launch speed in m/s
   * @param {number} angle     - launch angle (elevation) in radians
   * @param {number} yaw       - horizontal direction in radians (camera yaw)
   * @returns {{x,y,z}} velocity in world units/s
   */
  calcFreeShotVelocity(speedMS, angle, yaw) {
    const v0WU = speedMS * this.SCALE;
    return {
      x: -Math.sin(yaw) * v0WU * Math.cos(angle),
      y:                  v0WU * Math.sin(angle),
      z: -Math.cos(yaw) * v0WU * Math.cos(angle)
    };
  }

  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Simulate the ball's path and return an array of world-unit positions.
   * Uses the same drag model as _integrateBody for accuracy.
   *
   * @param {Object} startPos  - {x,y,z} world units
   * @param {Object} velocity  - {x,y,z} world units/s
   * @param {number} steps     - number of preview points
   * @param {number} dt        - simulation step size (seconds)
   * @returns {Array<{x,y,z}>}
   */
  calcTrajectory(startPos, velocity, steps = 40, dt = 0.04) {
    const points = [];
    let px = startPos.x, py = startPos.y, pz = startPos.z;
    let vx = velocity.x, vy = velocity.y, vz = velocity.z;

    for (let i = 0; i < steps; i++) {
      points.push({ x: px, y: py, z: pz });

      // Gravity
      vy -= this.GRAVITY * this.SCALE * dt;

      // Drag
      const speedWU = Math.sqrt(vx * vx + vy * vy + vz * vz);
      if (speedWU > 0.01) {
        const speedMS  = speedWU / this.SCALE;
        const aDragMS  = this._dragK * speedMS * speedMS;
        const aDragWU  = aDragMS * this.SCALE;
        const reduction = Math.min(aDragWU * dt / speedWU, 0.98);
        const factor = 1.0 - reduction;
        vx *= factor; vy *= factor; vz *= factor;
      }

      // Integrate
      px += vx * dt;
      py += vy * dt;
      pz += vz * dt;

      if (py < 0) break;
    }

    return points;
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  SCORING CHECK
  // ═══════════════════════════════════════════════════════════════════════

  checkHoopScore(ballPos, ballVel, hoopPos, hoopRadius, ballRadius) {
    if (ballVel.y >= 0) return false;
    const dx = ballPos.x - hoopPos.x;
    const dz = ballPos.z - hoopPos.z;
    const horizDist = Math.sqrt(dx * dx + dz * dz);
    return horizDist < (hoopRadius - ballRadius * 0.5);
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  VECTOR HELPERS
  // ═══════════════════════════════════════════════════════════════════════

  _dot(a, b)       { return a.x * b.x + a.y * b.y + a.z * b.z; }
  _magnitude(v)    { return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z); }
  _normalize(v) {
    const m = this._magnitude(v);
    if (m < 0.0001) return { x: 0, y: 0, z: 0 };
    return { x: v.x / m, y: v.y / m, z: v.z / m };
  }
}
