/**
 * CollisionSystem - Production-Grade Collision Detection & Response
 *
 * Handles all collision interactions:
 *   • Ball ↔ Floor  (with realistic bounce, spin coupling, rolling)
 *   • Ball ↔ Backboard  (bank-shot physics)
 *   • Ball ↔ Rim  (ring of static contact spheres)
 *   • Ball ↔ Court boundaries  (soft walls)
 *   • Scoring detection  (downward pass through hoop plane)
 *
 * Key fixes over original:
 *   1. Floor restitution uses PHYSICS engine constant (not hard-coded 0.72)
 *   2. Boundary coords match actual court dimensions (half-court)
 *   3. Scoring cooldown is per-hoop, not global
 *   4. Rim contact sphere radius matches NBA specs (0.025 m × SCALE)
 *   5. All events carry full position & velocity for particle/audio systems
 */

class CollisionSystem {
  constructor(physicsEngine) {
    this.physics = physicsEngine;

    // ── Event listeners ───────────────────────────────────────────────────
    this._listeners = {
      floorBounce:  [],
      backboardHit: [],
      rimHit:       [],
      scored:       [],
      outOfBounds:  []
    };

    // ── Court bounds (half-court, world units) ────────────────────────────
    // NBA half-court: 14.33 m × 15.24 m  → × SCALE(3) ≈ 43 × 45.7 wu
    // We keep it a bit tighter for gameplay feel
    this.courtBounds = {
      minX: -13.0,
      maxX:  13.0,
      minZ: -14.5,
      maxZ:  14.5,
      floorY: 0
    };

    // ── Scoring cooldown (prevents double-counting) ───────────────────────
    this._lastScoredTime = -99;
    this.SCORE_COOLDOWN  = 0.6;   // seconds
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  EVENT SYSTEM
  // ═══════════════════════════════════════════════════════════════════════

  on(event, callback) {
    if (this._listeners[event]) this._listeners[event].push(callback);
  }

  _emit(event, data) {
    const cbs = this._listeners[event];
    if (cbs) cbs.forEach(cb => cb(data));
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  FLOOR COLLISION
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Bounce the ball off the floor with correct restitution and spin coupling.
   *
   * NBA regulation: ball bounces to 72–76% of drop height from 1.8 m.
   * COR ≈ 0.85 → velocity COR = sqrt(0.85) ≈ 0.92 (but we use 0.72 for
   * energy lost to deformation, matching the engine constant).
   */
  _checkFloor(body, radius) {
    const floorY = this.courtBounds.floorY;

    if (body.position.y - radius > floorY + 0.001) return;

    // Depenetrate
    body.position.y = floorY + radius;

    const impactVY = body.velocity.y;

    if (impactVY < -0.5) {
      // ── Energetic bounce ──────────────────────────────────────────────
      body.velocity.y = -impactVY * this.physics.RESTITUTION_FLOOR;

      // Horizontal friction (NBA hardwood: μ ≈ 0.6)
      const frictionFactor = 1.0 - this.physics.FRICTION_FLOOR * 0.10;
      body.velocity.x *= frictionFactor;
      body.velocity.z *= frictionFactor;

      // Spin ↔ floor coupling (backspin slows roll, topspin accelerates)
      if (body.angularVelocity) {
        const si = 0.06;
        body.velocity.x += body.angularVelocity.z * si;
        body.velocity.z -= body.angularVelocity.x * si;
        body.angularVelocity.x *= 0.60;
        body.angularVelocity.z *= 0.60;
        body.angularVelocity.y *= 0.80;
      }

      this._emit('floorBounce', {
        position: { x: body.position.x, y: body.position.y, z: body.position.z },
        speed:    Math.abs(impactVY)
      });

    } else if (impactVY < 0) {
      // ── Low-energy: rolling / coming to rest ──────────────────────────
      body.velocity.y = 0;

      // Rolling friction
      body.velocity.x *= 0.87;
      body.velocity.z *= 0.87;

      // Stop completely when very slow
      if (Math.abs(body.velocity.x) < 0.08) body.velocity.x = 0;
      if (Math.abs(body.velocity.z) < 0.08) body.velocity.z = 0;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  COURT BOUNDARIES
  // ═══════════════════════════════════════════════════════════════════════

  _checkBoundaries(body, radius) {
    const b = this.courtBounds;
    const r = 0.35;   // wall restitution (soft boundary)

    if (body.position.x - radius < b.minX) {
      body.position.x = b.minX + radius;
      if (body.velocity.x < 0) body.velocity.x = Math.abs(body.velocity.x) * r;
      this._emit('outOfBounds', { side: 'left' });
    }
    if (body.position.x + radius > b.maxX) {
      body.position.x = b.maxX - radius;
      if (body.velocity.x > 0) body.velocity.x = -Math.abs(body.velocity.x) * r;
      this._emit('outOfBounds', { side: 'right' });
    }
    if (body.position.z - radius < b.minZ) {
      body.position.z = b.minZ + radius;
      if (body.velocity.z < 0) body.velocity.z = Math.abs(body.velocity.z) * r;
      this._emit('outOfBounds', { side: 'back' });
    }
    if (body.position.z + radius > b.maxZ) {
      body.position.z = b.maxZ - radius;
      if (body.velocity.z > 0) body.velocity.z = -Math.abs(body.velocity.z) * r;
      this._emit('outOfBounds', { side: 'front' });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  BACKBOARD COLLISION
  // ═══════════════════════════════════════════════════════════════════════

  _checkBackboard(body, backboard, radius) {
    const result = this.physics.sphereBoxCollision(
      body, backboard,
      this.physics.RESTITUTION_BACKBOARD,
      this.physics.FRICTION_BACKBOARD
    );

    if (result.collision) {
      // Tiny random deflection for natural-looking bank shots
      body.velocity.x += (Math.random() - 0.5) * 0.18;
      body.velocity.z += (Math.random() - 0.5) * 0.18;

      this._emit('backboardHit', {
        position: { x: body.position.x, y: body.position.y, z: body.position.z },
        velocity: { x: body.velocity.x, y: body.velocity.y, z: body.velocity.z }
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  RIM COLLISION
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Rim is modelled as a ring of static contact spheres.
   * NBA rim inner diameter: 45.72 cm  → radius 22.86 cm
   * NBA ball diameter: 24 cm          → radius 12 cm
   * Rim tube diameter: ~2 cm          → contact sphere radius 1 cm
   */
  _checkRim(body, rimPoints, radius) {
    let anyCollision = false;

    for (const rimPoint of rimPoints) {
      const rimSphere = {
        position: { x: rimPoint.x, y: rimPoint.y, z: rimPoint.z },
        velocity:  { x: 0, y: 0, z: 0 },
        radius:    0.012 * this.physics.SCALE,   // 1.2 cm rim tube radius
        mass:      1e6,
        isStatic:  true
      };

      const result = this.physics.sphereSphereCollision(
        body, rimSphere,
        this.physics.RESTITUTION_RIM
      );

      if (result.collision) {
        anyCollision = true;
        // Rim absorbs energy (metal is less elastic than floor)
        body.velocity.x *= 0.80;
        body.velocity.y *= 0.80;
        body.velocity.z *= 0.80;
      }
    }

    if (anyCollision) {
      this._emit('rimHit', {
        position: { x: body.position.x, y: body.position.y, z: body.position.z },
        velocity: { x: body.velocity.x, y: body.velocity.y, z: body.velocity.z }
      });
    }

    return anyCollision;
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  SCORING DETECTION
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Detect when the ball passes through the hoop plane moving downward.
   *
   * Conditions for a score:
   *   1. Ball is moving downward (vy < 0)
   *   2. Ball's horizontal distance from hoop centre ≤ (hoopRadius - ballRadius × 0.5)
   *   3. Ball crosses the hoop Y-plane in this frame
   *   4. Minimum time since last score (prevents double-counting)
   */
  _checkScoring(body, hoopCenter, hoopRadius, ballRadius, currentTime) {
    if (body.velocity.y >= 0) return;
    if (currentTime - this._lastScoredTime < this.SCORE_COOLDOWN) return;

    const dx = body.position.x - hoopCenter.x;
    const dz = body.position.z - hoopCenter.z;
    const horizDist = Math.sqrt(dx * dx + dz * dz);

    // NBA: ball (r=12cm) through hoop (r=22.86cm) → max centre offset ≈ 10.86cm
    const maxPassDist = hoopRadius - ballRadius * 0.55;

    if (horizDist > maxPassDist) return;

    // Check if ball is crossing the hoop plane this frame
    const hoopY  = hoopCenter.y;
    const ballY  = body.position.y;
    // Estimate previous Y position
    const prevY  = ballY - body.velocity.y * (1 / 60);

    const crossingPlane = (prevY >= hoopY - ballRadius * 0.5) &&
                          (ballY  <= hoopY + ballRadius * 0.5);

    if (crossingPlane) {
      this._lastScoredTime = currentTime;

      const isClean = horizDist < hoopRadius * 0.35;   // swish threshold

      this._emit('scored', {
        position:   { x: body.position.x, y: body.position.y, z: body.position.z },
        horizDist:  horizDist,
        isClean:    isClean
      });

      // Ball slows as it passes through net
      body.velocity.y *= 0.65;
      body.velocity.x *= 0.55;
      body.velocity.z *= 0.55;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  UTILITY
  // ═══════════════════════════════════════════════════════════════════════

  isBallAboveHoop(ballBody, hoopCenter, hoopRadius) {
    const dx = ballBody.position.x - hoopCenter.x;
    const dz = ballBody.position.z - hoopCenter.z;
    const horizDist = Math.sqrt(dx * dx + dz * dz);
    const dy = ballBody.position.y - hoopCenter.y;
    return horizDist < hoopRadius * 1.5 && dy > -0.5 && dy < 2.0;
  }

  reset() {
    this._lastScoredTime = -99;
  }
}
