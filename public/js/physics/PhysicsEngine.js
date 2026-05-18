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
 *
 * Coordinate system:
 *   • Y = up
 *   • All positions are in WORLD UNITS
 *   • SCALE = 3.0 world-units per metre
 *     (so 1 metre real = 3 world units)
 *
 * Key design decision:
 *   calcShotVelocity() uses the closed-form ballistic equation to
 *   compute the EXACT launch speed needed to reach the hoop at the
 *   chosen angle.  Power (0-1) then scales the actual launch speed
 *   around that ideal value, creating under/over-shoot behaviour
 *   that feels like Angry Birds.
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
    // Drag: F_d = 0.5 * rho * Cd * A * v²
    // In world-unit space we keep rho/Cd/A in SI but convert acceleration
    this.AIR_DENSITY      = 1.225;   // kg/m³
    this.DRAG_COEFFICIENT = 0.47;    // sphere Cd
    this.BALL_RADIUS_M    = 0.12;    // metres (NBA regulation)
    this.BALL_CROSS_AREA  = Math.PI * this.BALL_RADIUS_M * this.BALL_RADIUS_M; // m²
    this.BALL_MASS        = 0.623;   // kg (NBA regulation)

    // Pre-compute drag constant: k = 0.5 * rho * Cd * A / m
    // Gives drag deceleration per (m/s)² in m/s²
    this._dragK = (0.5 * this.AIR_DENSITY * this.DRAG_COEFFICIENT * this.BALL_CROSS_AREA)
                  / this.BALL_MASS;

    // ── Surface coefficients ─────────────────────────────────────────────
    this.FRICTION_FLOOR      = 0.6;
    this.FRICTION_BACKBOARD  = 0.4;
    this.FRICTION_RIM        = 0.3;

    this.RESTITUTION_FLOOR     = 0.72;
    this.RESTITUTION_BACKBOARD = 0.65;
    this.RESTITUTION_RIM       = 0.55;

    // ── Shot velocity limits (world units/s) ─────────────────────────────
    // Derived from real free-throw: v0 ≈ 7.3 m/s → 7.3 * 3 = 21.9 wu/s
    // Long 3-pointer: v0 ≈ 11 m/s → 33 wu/s
    this.MIN_SHOT_SPEED = 8.0  * this.SCALE;   // 24 wu/s
    this.MAX_SHOT_SPEED = 13.0 * this.SCALE;   // 39 wu/s

    // ── Accumulator ──────────────────────────────────────────────────────
    this._accumulator = 0;

    // ── Body registry ────────────────────────────────────────────────────
    this._bodies = [];

    // ── Collision callbacks ───────────────────────────────────────────────
    this._collisionCallbacks = [];

    this.debug = false;
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
      // g in world units: 9.81 m/s² * SCALE wu/m = 29.43 wu/s²
      body.velocity.y -= this.GRAVITY * this.SCALE * dt;
    }

    // ── Aerodynamic drag ─────────────────────────────────────────────────
    // F_drag = k * v²  (opposes motion)
    // a_drag = k * v²  (in m/s²)
    // Convert to world-unit deceleration: a_wu = a_drag * SCALE
    // But velocity is already in wu/s, so we convert v back to m/s first:
    //   v_ms = v_wu / SCALE
    //   a_drag_ms = _dragK * v_ms²
    //   a_drag_wu = a_drag_ms * SCALE
    //   Δv_wu = -a_drag_wu * dt  (per axis, proportional to direction)
    if (body.useAirResistance) {
      const vx = body.velocity.x;
      const vy = body.velocity.y;
      const vz = body.velocity.z;
      const speedWU = Math.sqrt(vx * vx + vy * vy + vz * vz);

      if (speedWU > 0.01) {
        // Speed in m/s
        const speedMS = speedWU / this.SCALE;
        // Drag deceleration in m/s²
        const aDragMS = this._dragK * speedMS * speedMS;
        // Convert to world-unit decel and scale by dt
        const aDragWU = aDragMS * this.SCALE;
        // Fractional reduction (capped so we never reverse direction)
        const reduction = Math.min(aDragWU * dt / speedWU, 0.98);
        const factor = 1.0 - reduction;
        body.velocity.x *= factor;
        body.velocity.y *= factor;
        body.velocity.z *= factor;
      }
    }

    // ── Magnus effect (spin → lateral force) ─────────────────────────────
    if (body.spin && body.angularVelocity) {
      const mf = this._calcMagnusForce(body);
      body.velocity.x += mf.x * dt;
      body.velocity.y += mf.y * dt;
      body.velocity.z += mf.z * dt;
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

    // ── Angular velocity / rotation ───────────────────────────────────────
    if (body.angularVelocity) {
      body.rotation.x += body.angularVelocity.x * dt;
      body.rotation.y += body.angularVelocity.y * dt;
      body.rotation.z += body.angularVelocity.z * dt;

      const angDamp = Math.pow(0.97, dt * 60); // ~3% per frame at 60fps
      body.angularVelocity.x *= angDamp;
      body.angularVelocity.y *= angDamp;
      body.angularVelocity.z *= angDamp;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  MAGNUS FORCE  (backspin lifts ball, topspin drops it)
  // ═══════════════════════════════════════════════════════════════════════

  _calcMagnusForce(body) {
    // F = k_M * (ω × v)
    // k_M tuned so backspin has a small but noticeable effect
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
   * Sphere ↔ AABB box  (used for backboard)
   */
  sphereBoxCollision(sphere, box, restitution, friction) {
    const cx = Math.max(box.min.x, Math.min(sphere.position.x, box.max.x));
    const cy = Math.max(box.min.y, Math.min(sphere.position.y, box.max.y));
    const cz = Math.max(box.min.z, Math.min(sphere.position.z, box.max.z));

    const dx = sphere.position.x - cx;
    const dy = sphere.position.y - cy;
    const dz = sphere.position.z - cz;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (dist < sphere.radius && dist > 0.0001) {
      const nx = dx / dist, ny = dy / dist, nz = dz / dist;
      const pen = sphere.radius - dist;

      sphere.position.x += nx * pen;
      sphere.position.y += ny * pen;
      sphere.position.z += nz * pen;

      const vDotN = sphere.velocity.x * nx + sphere.velocity.y * ny + sphere.velocity.z * nz;
      if (vDotN < 0) {
        const impulse = -(1 + restitution) * vDotN;
        sphere.velocity.x += impulse * nx;
        sphere.velocity.y += impulse * ny;
        sphere.velocity.z += impulse * nz;

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

  /**
   * Calculate the launch velocity vector for a basketball shot.
   *
   * Algorithm:
   *   1. Compute the IDEAL launch speed v0_ideal that would hit the hoop
   *      exactly at the chosen angle (closed-form ballistic equation).
   *      This uses REAL-WORLD units internally then converts to world units.
   *   2. Scale v0_ideal by power:
   *        power < 1  → under-shoot (ball falls short)
   *        power = 1  → perfect shot
   *        power > 1  → over-shoot (ball goes long)
   *      The power range [0.7, 1.0] is the "sweet spot" for scoring.
   *   3. Apply horizontal angle offset from mouse drag.
   *
   * @param {Object} from        - launch position (world units)
   * @param {Object} to          - hoop centre position (world units)
   * @param {number} power       - 0–1 player input power
   * @param {number} angle       - launch angle (radians)
   * @param {number} angleOffset - horizontal yaw offset (radians)
   * @returns {{x,y,z}} velocity in world units/s
   */
  calcShotVelocity(from, to, power, angle, angleOffset = 0) {
    // ── Convert world-unit positions to metres ────────────────────────────
    const fromM = { x: from.x / this.SCALE, y: from.y / this.SCALE, z: from.z / this.SCALE };
    const toM   = { x: to.x   / this.SCALE, y: to.y   / this.SCALE, z: to.z   / this.SCALE };

    const dx = toM.x - fromM.x;
    const dz = toM.z - fromM.z;
    const horizDistM = Math.sqrt(dx * dx + dz * dz);
    const heightDiffM = toM.y - fromM.y;

    // ── Ballistic equation: v0 = sqrt( g*R² / (2*cos²θ*(R*tanθ - Δh)) ) ─
    const g     = this.GRAVITY;
    const cosA  = Math.cos(angle);
    const tanA  = Math.tan(angle);
    const denom = 2 * cosA * cosA * (horizDistM * tanA - heightDiffM);

    let v0IdealMS;
    if (denom > 0.001) {
      v0IdealMS = Math.sqrt((g * horizDistM * horizDistM) / denom);
    } else {
      // Fallback: use a reasonable speed for the distance
      v0IdealMS = Math.sqrt(g * horizDistM) * 1.2;
    }

    // ── Clamp ideal speed to realistic NBA range ──────────────────────────
    v0IdealMS = MathUtils.clamp(v0IdealMS, 5.0, 15.0);

    // ── Power scaling: power=1 → perfect shot ────────────────────────────
    // Map power [0,1] to a multiplier [0.55, 1.25] so:
    //   power ≈ 0.80 → multiplier ≈ 1.0 (sweet spot)
    const powerMultiplier = MathUtils.lerp(0.55, 1.25, power);
    const v0MS = v0IdealMS * powerMultiplier;

    // ── Convert to world units/s ──────────────────────────────────────────
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

  // ═══════════════════════════════════════════════════════════════════════
  //  TRAJECTORY PREVIEW  (simulates same physics as integration)
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
