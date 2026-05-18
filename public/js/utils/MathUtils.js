/**
 * MathUtils - Professional Math Utilities for Basketball 3D Pro
 *
 * Provides:
 *   • Physics helpers (projectile, friction, restitution)
 *   • Interpolation (lerp, smoothStep, easeInOut)
 *   • Vector operations (normalize, dot, reflect, cross)
 *   • Basketball-specific constants (NBA regulation)
 *   • Random utilities
 *
 * NOTE: Object.freeze() is applied at the end so this object is
 * immutable at runtime — all constants are safe to read from anywhere.
 */

const MathUtils = {
  // ── Mathematical constants ─────────────────────────────────────────────
  PI:          Math.PI,
  TWO_PI:      Math.PI * 2,
  HALF_PI:     Math.PI / 2,
  DEG_TO_RAD:  Math.PI / 180,
  RAD_TO_DEG:  180 / Math.PI,

  // ── Physics constants ──────────────────────────────────────────────────
  GRAVITY:     9.81,     // m/s²

  // ── NBA regulation constants ───────────────────────────────────────────
  BALL_MASS:         0.623,    // kg
  BALL_RADIUS:       0.12,     // m
  HOOP_HEIGHT:       3.05,     // m (10 ft)
  HOOP_RADIUS:       0.2286,   // m (9 in)
  FREE_THROW_DIST:   4.572,    // m (15 ft)
  THREE_POINT_DIST:  7.24,     // m (23 ft 9 in, NBA arc)

  // ── Restitution coefficients ───────────────────────────────────────────
  RESTITUTION_FLOOR:     0.72,
  RESTITUTION_BACKBOARD: 0.65,
  RESTITUTION_RIM:       0.55,

  // ═══════════════════════════════════════════════════════════════════════
  //  BASIC MATH
  // ═══════════════════════════════════════════════════════════════════════

  clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  },

  lerp(a, b, t) {
    return a + (b - a) * t;
  },

  smoothStep(a, b, t) {
    t = this.clamp((t - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  },

  easeInOut(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  },

  easeOut(t) {
    return 1 - Math.pow(1 - t, 3);
  },

  easeIn(t) {
    return t * t * t;
  },

  toRad(degrees) {
    return degrees * this.DEG_TO_RAD;
  },

  toDeg(radians) {
    return radians * this.RAD_TO_DEG;
  },

  map(value, inMin, inMax, outMin, outMax) {
    const t = (value - inMin) / (inMax - inMin);
    return outMin + (outMax - outMin) * t;
  },

  oscillate(time, frequency, amplitude) {
    return Math.sin(time * frequency) * amplitude;
  },

  // ═══════════════════════════════════════════════════════════════════════
  //  PROJECTILE PHYSICS
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Closed-form ballistic launch speed.
   * v0 = sqrt( g * R² / (2 * cos²θ * (R·tanθ − Δh)) )
   *
   * @param {number} horizDist  - horizontal distance to target (m)
   * @param {number} heightDiff - target height − launch height (m)
   * @param {number} angle      - launch angle (radians)
   * @returns {number} launch speed (m/s)
   */
  calcLaunchVelocity(horizDist, heightDiff, angle) {
    const g    = this.GRAVITY;
    const cosA = Math.cos(angle);
    const tanA = Math.tan(angle);
    const denom = 2 * cosA * cosA * (horizDist * tanA - heightDiff);
    if (denom <= 0.001) return 8.1;   // fallback
    return Math.sqrt((g * horizDist * horizDist) / denom);
  },

  /**
   * Optimal launch angle for a given distance.
   * Research: 45–55° is optimal; steeper for close shots.
   *
   * @param {number} distM      - horizontal distance (m)
   * @param {number} heightDiff - height difference (m), unused but kept for API compat
   * @returns {number} angle (radians)
   */
  calcOptimalAngle(distM, heightDiff = 0) {
    const d   = this.clamp(distM, 1.0, 15.0);
    const deg = this.lerp(54, 46, (d - 1.0) / 14.0);
    return this.toRad(deg);
  },

  /**
   * Maximum height of a projectile.
   * H = y0 + (v0·sinθ)² / (2g)
   */
  calcMaxHeight(launchHeight, v0, angle) {
    const vy = v0 * Math.sin(angle);
    return launchHeight + (vy * vy) / (2 * this.GRAVITY);
  },

  /**
   * Time of flight to reach a target height.
   * Solves: y = y0 + vy·t − ½g·t²
   */
  calcTimeOfFlight(launchHeight, targetHeight, v0, angle) {
    const vy  = v0 * Math.sin(angle);
    const dy  = targetHeight - launchHeight;
    const a   = -0.5 * this.GRAVITY;
    const b   = vy;
    const c   = -dy;
    const disc = b * b - 4 * a * c;
    if (disc < 0) return 1.0;
    const t1 = (-b + Math.sqrt(disc)) / (2 * a);
    const t2 = (-b - Math.sqrt(disc)) / (2 * a);
    const times = [t1, t2].filter(t => t > 0);
    return times.length > 0 ? Math.max(...times) : 1.0;
  },

  /**
   * Recommended backspin angular velocity.
   * NBA players apply ~3–5 rev/s of backspin.
   * @param {number} v0 - launch speed (m/s)
   * @returns {number} angular velocity (rad/s, negative = backspin)
   */
  calcBackspin(v0) {
    return -(v0 * 0.75);
  },

  // ═══════════════════════════════════════════════════════════════════════
  //  FRICTION
  // ═══════════════════════════════════════════════════════════════════════

  applyFriction(velocity, friction, dt) {
    const sign      = velocity > 0 ? 1 : -1;
    const reduction = friction * dt;
    if (Math.abs(velocity) <= reduction) return 0;
    return velocity - sign * reduction;
  },

  // ═══════════════════════════════════════════════════════════════════════
  //  VECTOR OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════

  dist3D(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  },

  dist2D(a, b) {
    const dx = b.x - a.x, dz = b.z - a.z;
    return Math.sqrt(dx * dx + dz * dz);
  },

  normalize3D(v) {
    const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
    if (len < 0.00001) return { x: 0, y: 0, z: 0 };
    return { x: v.x / len, y: v.y / len, z: v.z / len };
  },

  dot3D(a, b) {
    return a.x * b.x + a.y * b.y + a.z * b.z;
  },

  cross3D(a, b) {
    return {
      x: a.y * b.z - a.z * b.y,
      y: a.z * b.x - a.x * b.z,
      z: a.x * b.y - a.y * b.x
    };
  },

  reflect3D(v, n) {
    const dot = this.dot3D(v, n);
    return {
      x: v.x - 2 * dot * n.x,
      y: v.y - 2 * dot * n.y,
      z: v.z - 2 * dot * n.z
    };
  },

  magnitude3D(v) {
    return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  },

  // ═══════════════════════════════════════════════════════════════════════
  //  RANDOM
  // ═══════════════════════════════════════════════════════════════════════

  randFloat(min, max) {
    return min + Math.random() * (max - min);
  },

  randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  },

  // ═══════════════════════════════════════════════════════════════════════
  //  BASKETBALL HELPERS
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Is a shot from this distance worth 3 points?
   * @param {number} distM - distance in metres (or world units if SCALE applied)
   */
  isThreePointer(distM) {
    return distM >= this.THREE_POINT_DIST;
  },

  /**
   * Shot difficulty factor [0, 1] — 1 = hardest.
   */
  calcDifficulty(distM, angleRad) {
    const distFactor  = this.clamp(distM / 12, 0, 1);
    const angleFactor = Math.abs(Math.cos(angleRad));
    return distFactor * 0.7 + angleFactor * 0.3;
  },

  /**
   * Wrap an angle to [-π, π].
   */
  wrapAngle(angle) {
    while (angle >  Math.PI) angle -= Math.PI * 2;
    while (angle < -Math.PI) angle += Math.PI * 2;
    return angle;
  }
};

Object.freeze(MathUtils);
