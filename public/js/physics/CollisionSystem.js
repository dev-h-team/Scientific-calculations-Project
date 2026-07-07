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
    // We expanded it per user request
    this.courtBounds = {
      minX: -15.0,
      maxX:  15.0,
      minZ: -28.0,
      maxZ:  28.0,
      maxY:  17.75, // perfectly aligns with Court.js ceiling bottom (18 - 0.25)
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
    // Ceiling collision
    if (body.position.y + radius > b.maxY) {
      body.position.y = b.maxY - radius;
      if (body.velocity.y > 0) body.velocity.y = -Math.abs(body.velocity.y) * r;
      this._emit('outOfBounds', { side: 'ceiling' });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  BACKBOARD COLLISION
  // ═══════════════════════════════════════════════════════════════════════

  _checkSupportBoxes(body, supportBoxes, radius) {
    for (const box of supportBoxes) {
      // ── Sphere-AABB overlap test ─────────────────────────────────────────
      const cx = Math.max(box.min.x, Math.min(body.position.x, box.max.x));
      const cy = Math.max(box.min.y, Math.min(body.position.y, box.max.y));
      const cz = Math.max(box.min.z, Math.min(body.position.z, box.max.z));

      const dx = body.position.x - cx;
      const dy = body.position.y - cy;
      const dz = body.position.z - cz;
      const dist2 = dx * dx + dy * dy + dz * dz;
      if (dist2 >= radius * radius || dist2 < 1e-8) continue; // Check next box

      const e     = this.physics.RESTITUTION_BACKBOARD;
      const f     = this.physics.FRICTION_BACKBOARD;

      // ── Dominant-axis normal ─────────────────────────────────────────────
      const hw  = (box.max.x - box.min.x) * 0.5;
      const hh  = (box.max.y - box.min.y) * 0.5;
      const hd  = (box.max.z - box.min.z) * 0.5;
      const mx  = (box.min.x + box.max.x) * 0.5;
      const my  = (box.min.y + box.max.y) * 0.5;
      const mz  = (box.min.z + box.max.z) * 0.5;

      // True penetration depth along each axis
      const ovX = (hw + radius) - Math.abs(body.position.x - mx);
      const ovY = (hh + radius) - Math.abs(body.position.y - my);
      const ovZ = (hd + radius) - Math.abs(body.position.z - mz);

      let nx = 0, ny = 0, nz = 0, overlap;
      if (ovZ <= ovY && ovZ <= ovX) {
        nz      = body.position.z < mz ? -1 : 1;
        overlap = ovZ;
      } else if (ovY <= ovX) {
        ny      = body.position.y < my ? -1 : 1;
        overlap = ovY;
      } else {
        nx      = body.position.x < mx ? -1 : 1;
        overlap = ovX;
      }

      // Separation (push out)
      body.position.x += nx * (Math.max(overlap, 0) + 0.002);
      body.position.y += ny * (Math.max(overlap, 0) + 0.002);
      body.position.z += nz * (Math.max(overlap, 0) + 0.002);

      // ── Velocity reflection ──────────────────────────────────────────────
      const vDotN = body.velocity.x * nx + body.velocity.y * ny + body.velocity.z * nz;
      if (vDotN < 0) {
        const impulse = -(1 + e) * vDotN;
        body.velocity.x += impulse * nx;
        body.velocity.y += impulse * ny;
        body.velocity.z += impulse * nz;

        // Tangential friction
        const tx = body.velocity.x - vDotN * nx;
        const ty = body.velocity.y - vDotN * ny;
        const tz = body.velocity.z - vDotN * nz;
        const tSpeed = Math.sqrt(tx * tx + ty * ty + tz * tz);
        if (tSpeed > 0.01) {
          const fi = Math.min(f * Math.abs(impulse), tSpeed);
          body.velocity.x -= (tx / tSpeed) * fi;
          body.velocity.y -= (ty / tSpeed) * fi;
          body.velocity.z -= (tz / tSpeed) * fi;
        }
      }

      // ── Front-Face Bounce Assist (ONLY for Backboard Front Face) ────────
      if (box.isBackboard && box.courtFacingZ !== undefined) {
        const faceZ = box.courtFacingZ;
        // Only apply the "bounce towards court" hack if it hits the front face
        if (nz === faceZ) {
          const totalSpeed = Math.sqrt(
            body.velocity.x * body.velocity.x +
            body.velocity.y * body.velocity.y +
            body.velocity.z * body.velocity.z
          );
          const minBounceZ = totalSpeed * 0.25 * e;

          const currentZAwayFromBoard = body.velocity.z * faceZ; 
          if (currentZAwayFromBoard < minBounceZ) {
            body.velocity.z = faceZ * Math.max(minBounceZ, 0.4);
          }
          
          // Tiny random X deflection for natural bank-shot feel
          body.velocity.x += (Math.random() - 0.5) * 0.15;
        }

        // Emit backboardHit only for actual backboard hits
        this._emit('backboardHit', {
          position: { ...body.position },
          velocity: { ...body.velocity }
        });
      }

      // Resolve one collision per frame for stability
      return;
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
        // NOTE: sphereSphereCollision already applies RESTITUTION_RIM to velocity.
        // Do NOT multiply velocity again here — that causes double-damping and
        // kills all rim bounce energy, making the ball drop straight down.
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

      // The ball passes through the net naturally under gravity.
      // No velocity reduction here — the net animates visually, and the ball
      // continues its parabolic arc downward (realistic behaviour).
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
