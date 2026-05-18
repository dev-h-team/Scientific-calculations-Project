/**
 * BallPhysics - Specialized Basketball Physics Controller
 *
 * Responsibilities:
 *   • Create and own the ball's physics body
 *   • Apply shot impulse (Angry-Birds style: power + angle)
 *   • Apply free-throw impulse (precision shot)
 *   • Handle floor bounce, backboard, rim collisions
 *   • Calculate trajectory preview points
 *   • Track spin, bounce count, rolling state
 *
 * Shot model (Angry-Birds style):
 *   - Player holds down Space / mouse → power builds from 0 → 1
 *   - On release, PhysicsEngine.calcShotVelocity() solves the
 *     ballistic equation for the EXACT speed needed to reach the hoop,
 *     then scales it by the power multiplier.
 *   - Power ≈ 0.80 is the "sweet spot" that scores reliably.
 *   - Under/over-power misses short or long, just like Angry Birds.
 */

class BallPhysics {
  constructor(physicsEngine) {
    this.physics = physicsEngine;

    // ── NBA regulation ball properties ───────────────────────────────────
    this.mass         = 0.623;   // kg
    this.radius       = 0.12;    // metres  (matches BALL_RADIUS_M in engine)
    this.circumference = 0.749;  // metres

    // ── Spin state ────────────────────────────────────────────────────────
    this.spinX = 0;
    this.spinY = 0;
    this.spinZ = 0;

    // ── Bounce / rolling tracking ─────────────────────────────────────────
    this.bounceCount    = 0;
    this.lastBounceTime = 0;
    this.isRolling      = false;

    // ── Trajectory preview cache ──────────────────────────────────────────
    this.trajectoryPoints = [];
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  BODY FACTORY
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Create a physics body for the basketball.
   * The body is in WORLD UNITS (metres × SCALE).
   */
  createBody(position) {
    return {
      position:        { x: position.x, y: position.y, z: position.z },
      prevPosition:    { x: position.x, y: position.y, z: position.z },
      velocity:        { x: 0, y: 0, z: 0 },
      rotation:        { x: 0, y: 0, z: 0 },
      angularVelocity: { x: 0, y: 0, z: 0 },
      mass:            this.mass,
      radius:          this.radius * this.physics.SCALE, // world-unit radius
      useGravity:      true,
      useAirResistance: true,
      active:          true,
      isStatic:        false,
      linearDamping:   0.004,   // tiny rolling / air energy loss
      spin:            true,
      interpolate:     null
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  SHOT APPLICATION  (main throw entry point)
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Apply a shot impulse to the ball body.
   *
   * @param {Object} body         - ball physics body
   * @param {Object} from         - launch position (world units)
   * @param {Object} to           - hoop centre (world units)
   * @param {number} power        - 0–1 player input
   * @param {number} angleOffset  - horizontal yaw offset in radians (from drag)
   * @param {boolean} addBackspin - apply NBA-style backspin
   */
  applyShot(body, from, to, power, angleOffset = 0, addBackspin = true) {
    // ── Choose launch angle based on distance ─────────────────────────────
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const horizDistWU = Math.sqrt(dx * dx + dz * dz);
    const horizDistM  = horizDistWU / this.physics.SCALE;

    const angle = this._calcLaunchAngle(horizDistM);

    // ── Solve ballistic velocity ──────────────────────────────────────────
    const vel = this.physics.calcShotVelocity(from, to, power, angle, angleOffset);

    body.velocity.x = vel.x;
    body.velocity.y = vel.y;
    body.velocity.z = vel.z;

    // ── Backspin ──────────────────────────────────────────────────────────
    if (addBackspin) {
      const speed  = Math.sqrt(vel.x * vel.x + vel.y * vel.y + vel.z * vel.z);
      const dirX   = dx / horizDistWU;
      const dirZ   = dz / horizDistWU;

      // Backspin: angular velocity perpendicular to shot direction
      // Negative = backspin (ball spins backward relative to flight)
      const backspinRate = speed * 0.12;
      body.angularVelocity.x = -dirZ * backspinRate;
      body.angularVelocity.z =  dirX * backspinRate;
      body.angularVelocity.y = 0;
    }

    body.active = true;
    this.bounceCount = 0;
    this.isRolling   = false;
  }

  /**
   * Apply a free-throw shot (precision, from free-throw line ≈ 4.57 m).
   * Uses 51° launch angle as per biomechanics research.
   */
  applyFreeThrow(body, from, to, power) {
    const angle = MathUtils.toRad(51);
    const vel   = this.physics.calcShotVelocity(from, to, power, angle);

    body.velocity.x = vel.x;
    body.velocity.y = vel.y;
    body.velocity.z = vel.z;

    const speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y + vel.z * vel.z);
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist > 0.001) {
      const backspinRate = speed * 0.16;
      body.angularVelocity.x = -(dz / dist) * backspinRate;
      body.angularVelocity.z =  (dx / dist) * backspinRate;
    }

    body.active = true;
    this.bounceCount = 0;
    this.isRolling   = false;
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  COLLISION HANDLERS
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Handle floor bounce.
   * NBA regulation: ball bounces to 72–76% of drop height (COR ≈ 0.85).
   */
  handleFloorBounce(body, floorY) {
    const worldRadius = body.radius;
    if (body.position.y - worldRadius > floorY) return false;

    body.position.y = floorY + worldRadius;

    const impactSpeed = Math.abs(body.velocity.y);

    if (impactSpeed > 1.5) {
      // Energetic bounce
      body.velocity.y = impactSpeed * this.physics.RESTITUTION_FLOOR;

      // Floor friction on horizontal velocity
      const frictionFactor = 1 - this.physics.FRICTION_FLOOR * 0.08;
      body.velocity.x *= frictionFactor;
      body.velocity.z *= frictionFactor;

      // Spin-floor coupling
      if (body.angularVelocity) {
        body.velocity.x += body.angularVelocity.z * 0.04;
        body.velocity.z -= body.angularVelocity.x * 0.04;
        body.angularVelocity.x *= 0.65;
        body.angularVelocity.z *= 0.65;
      }

      this.bounceCount++;
      this.isRolling = false;
      return true;

    } else {
      // Low-energy: transition to rolling
      body.velocity.y = 0;

      // Rolling friction
      const rollFriction = 0.88;
      body.velocity.x *= rollFriction;
      body.velocity.z *= rollFriction;

      const horizSpeed = Math.sqrt(body.velocity.x * body.velocity.x + body.velocity.z * body.velocity.z);
      if (horizSpeed < 0.3) {
        body.velocity.x = 0;
        body.velocity.z = 0;
        this.isRolling = false;
      } else {
        this.isRolling = true;
      }
      return false;
    }
  }

  /**
   * Handle backboard collision.
   */
  handleBackboardCollision(body, backboardBox) {
    const result = this.physics.sphereBoxCollision(
      body, backboardBox,
      this.physics.RESTITUTION_BACKBOARD,
      this.physics.FRICTION_BACKBOARD
    );

    if (result.collision) {
      // Small random deflection for realism
      body.velocity.x += MathUtils.randFloat(-0.25, 0.25);
      body.velocity.z += MathUtils.randFloat(-0.25, 0.25);
      return true;
    }
    return false;
  }

  /**
   * Handle rim collision.
   * The rim is approximated as a ring of static spheres.
   */
  handleRimCollision(body, rimPoints) {
    let collided = false;

    for (const rimPoint of rimPoints) {
      const rimSphere = {
        position: rimPoint,
        velocity:  { x: 0, y: 0, z: 0 },
        radius:    0.025 * this.physics.SCALE,
        mass:      10000,
        isStatic:  true
      };

      const result = this.physics.sphereSphereCollision(
        body, rimSphere,
        this.physics.RESTITUTION_RIM
      );

      if (result.collision) {
        collided = true;
        // Rim absorbs extra energy
        body.velocity.x *= 0.82;
        body.velocity.y *= 0.82;
        body.velocity.z *= 0.82;
      }
    }

    return collided;
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  TRAJECTORY PREVIEW
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Calculate trajectory preview dots for the HUD indicator.
   * Uses the same physics as the actual shot for accuracy.
   *
   * @param {Object} from         - launch position (world units)
   * @param {Object} to           - hoop centre (world units)
   * @param {number} power        - 0–1
   * @param {number} angleOffset  - horizontal yaw offset (radians)
   * @param {number} steps        - number of preview dots
   * @returns {Array<{x,y,z}>}
   */
  calcTrajectoryPreview(from, to, power, angleOffset = 0, steps = 40) {
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const horizDistM = Math.sqrt(dx * dx + dz * dz) / this.physics.SCALE;
    const angle = this._calcLaunchAngle(horizDistM);

    const vel = this.physics.calcShotVelocity(from, to, power, angle, angleOffset);
    return this.physics.calcTrajectory(from, vel, steps, 0.04);
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  HELPERS
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Choose optimal launch angle based on horizontal distance.
   * Research shows 45–55° is optimal; closer shots benefit from steeper angles.
   *
   * @param {number} distM - horizontal distance in metres
   * @returns {number} angle in radians
   */
  _calcLaunchAngle(distM) {
    // Clamp distance to avoid extreme angles
    const d = MathUtils.clamp(distM, 1.0, 15.0);
    // Interpolate: close shots 54°, mid-range 50°, long shots 46°
    const deg = MathUtils.lerp(54, 46, (d - 1.0) / 14.0);
    return MathUtils.toRad(deg);
  }

  /** Current ball speed (world units/s) */
  getSpeed(body) {
    const v = body.velocity;
    return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  }

  /**
   * True when the ball has effectively stopped.
   * @param {Object} body
   * @param {number} threshold - speed threshold (wu/s)
   */
  isAtRest(body, threshold = 0.4) {
    return this.getSpeed(body) < threshold &&
           body.position.y <= (this.physics.SCALE * 0.5 + body.radius + 0.05);
  }
}
