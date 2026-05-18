/**
 * Player - Professional Basketball Player Entity
 * 
 * Features:
 * - Detailed procedural humanoid mesh with proper NBA proportions
 * - Physics-based movement: acceleration, deceleration, momentum
 * - Camera-relative directional movement
 * - Smooth rotation interpolation with inertia
 * - Realistic animations: idle, run, dribble, shoot, jump
 * - NBA jersey with number and headband
 * - Dynamic shadow blob
 */

class Player {
  constructor(scene, physicsEngine, teamColor = 0xFF6600) {
    this.scene = scene;
    this.physics = physicsEngine;
    this.teamColor = teamColor;

    // ── World position & facing ──────────────────────────────────────────
    this.position = new THREE.Vector3(0, 0, 8);
    this.rotation = 0;           // current facing angle (radians, Y-axis)
    this.targetRotation = 0;     // desired facing angle

    // ── Physics-based velocity ───────────────────────────────────────────
    // velocity is in WORLD SPACE (units/s)
    this.velocity = new THREE.Vector3(0, 0, 0);

    // ── Movement tuning ──────────────────────────────────────────────────
    this.walkSpeed    = 6.0;     // m/s  (world units, SCALE already baked in)
    this.sprintSpeed  = 11.0;    // m/s
    this.accelGround  = 40.0;    // acceleration rate (units/s²)
    this.decelGround  = 30.0;    // deceleration rate when no input
    this.turnSpeed    = 12.0;    // rad/s rotation speed (walk)
    this.turnSpeedSprint = 7.0;  // rad/s rotation speed (sprint)

    // ── Animation state ──────────────────────────────────────────────────
    this.state       = 'idle';
    this._animTime   = 0;
    this._dribblePhase = 0;
    this._shootPhase   = 0;
    this._shootDuration = 0.5;
    this._isJumping    = false;
    this._jumpTime     = 0;
    this._jumpDuration = 0.75;

    // ── Court boundaries (half-court dimensions) ─────────────────────────
    this.bounds = { minX: -6.5, maxX: 6.5, minZ: -12.5, maxZ: 12.5 };

    this._build();
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  MOVEMENT  (called every frame from Game._update)
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Move the player based on raw input vector and camera yaw.
   *
   * @param {Object}  inputVec   - normalised {x, z} from InputManager
   * @param {number}  dt         - frame delta time (seconds)
   * @param {boolean} isSprinting
   * @param {number}  cameraYaw  - camera's current Y-rotation (radians)
   *                               so movement is always camera-relative
   */
  move(inputVec, dt, isSprinting, cameraYaw = 0) {
    const topSpeed = isSprinting ? this.sprintSpeed : this.walkSpeed;
    const hasInput = (Math.abs(inputVec.x) + Math.abs(inputVec.z)) > 0.01;

    // ── 1. Convert input to camera-relative world direction ──────────────
    let worldDirX = 0;
    let worldDirZ = 0;

    if (hasInput) {
      // Rotate input vector by camera yaw so "forward" = camera forward
      const cosY = Math.cos(cameraYaw);
      const sinY = Math.sin(cameraYaw);
      worldDirX = inputVec.x * cosY + inputVec.z * sinY;
      worldDirZ = -inputVec.x * sinY + inputVec.z * cosY;

      // Re-normalise (diagonal input already normalised, but rotation is safe)
      const len = Math.sqrt(worldDirX * worldDirX + worldDirZ * worldDirZ);
      if (len > 0.001) { worldDirX /= len; worldDirZ /= len; }
    }

    // ── 2. Acceleration / deceleration (physics-correct) ─────────────────
    if (hasInput) {
      // Accelerate toward desired velocity
      const desiredVX = worldDirX * topSpeed;
      const desiredVZ = worldDirZ * topSpeed;

      const accel = this.accelGround * dt;
      this.velocity.x += (desiredVX - this.velocity.x) * Math.min(accel / topSpeed, 1.0);
      this.velocity.z += (desiredVZ - this.velocity.z) * Math.min(accel / topSpeed, 1.0);

      // Clamp to top speed
      const speed = Math.sqrt(this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z);
      if (speed > topSpeed) {
        const scale = topSpeed / speed;
        this.velocity.x *= scale;
        this.velocity.z *= scale;
      }

      // ── 3. Rotation: face movement direction ──────────────────────────
      this.targetRotation = Math.atan2(worldDirX, worldDirZ);
      this.state = isSprinting ? 'running' : 'dribbling';

    } else {
      // ── Decelerate smoothly to zero ───────────────────────────────────
      const decel = this.decelGround * dt;
      const speed = Math.sqrt(this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z);

      if (speed > decel) {
        const scale = (speed - decel) / speed;
        this.velocity.x *= scale;
        this.velocity.z *= scale;
      } else {
        this.velocity.x = 0;
        this.velocity.z = 0;
      }

      if (this.state !== 'shooting') this.state = 'idle';
    }

    // ── 4. Smooth rotation interpolation ─────────────────────────────────
    let rotDiff = this.targetRotation - this.rotation;
    // Wrap to [-π, π]
    while (rotDiff >  Math.PI) rotDiff -= Math.PI * 2;
    while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;

    const tSpeed = isSprinting ? this.turnSpeedSprint : this.turnSpeed;
    const maxTurn = tSpeed * dt;
    // Clamp rotation step so we never overshoot
    const turnStep = Math.sign(rotDiff) * Math.min(Math.abs(rotDiff), maxTurn);
    this.rotation += turnStep;

    // ── 5. Integrate position ─────────────────────────────────────────────
    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;

    // ── 6. Clamp to court bounds ──────────────────────────────────────────
    this.position.x = MathUtils.clamp(this.position.x, this.bounds.minX, this.bounds.maxX);
    this.position.z = MathUtils.clamp(this.position.z, this.bounds.minZ, this.bounds.maxZ);

    // Stop velocity if we hit a wall
    if (this.position.x === this.bounds.minX || this.position.x === this.bounds.maxX) {
      this.velocity.x = 0;
    }
    if (this.position.z === this.bounds.minZ || this.position.z === this.bounds.maxZ) {
      this.velocity.z = 0;
    }

    // ── 7. Sync Three.js group ────────────────────────────────────────────
    this.group.position.copy(this.position);
    this.group.rotation.y = this.rotation;
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  SHOOTING
  // ═══════════════════════════════════════════════════════════════════════

  playShotAnimation(duration = 0.5) {
    this.state = 'shooting';
    this._shootPhase   = 0;
    this._shootDuration = duration;
    this._isJumping    = true;
    this._jumpTime     = 0;
    this._jumpDuration = duration * 1.5;
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  PER-FRAME UPDATE (animations)
  // ═══════════════════════════════════════════════════════════════════════

  update(dt, time) {
    this._animTime += dt;

    switch (this.state) {
      case 'idle':      this._animateIdle(dt);     break;
      case 'dribbling':
      case 'running':   this._animateRunning(dt);  break;
      case 'shooting':  this._animateShooting(dt); break;
    }

    if (this._isJumping) this._animateJump(dt);
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  POSITION HELPERS
  // ═══════════════════════════════════════════════════════════════════════

  /** Release point for the shot (top of jump + extended arm) */
  getShootPosition() {
    const worldPos = new THREE.Vector3();
    worldPos.copy(this.position);
    worldPos.y += 2.45;   // ~2.45 m release height (NBA average)
    const fwd = 0.4;
    worldPos.x += Math.sin(this.rotation) * fwd;
    worldPos.z += Math.cos(this.rotation) * fwd;
    return worldPos;
  }

  /** Where the ball rests in the player's hand while dribbling */
  getHoldingPosition() {
    const worldPos = new THREE.Vector3();
    if (this.rightHand) {
      this.rightHand.getWorldPosition(worldPos);
      worldPos.y += 0.03;
      worldPos.x += Math.sin(this.rotation) * 0.12;
      worldPos.z += Math.cos(this.rotation) * 0.12;
    } else {
      worldPos.copy(this.position);
      worldPos.y += 1.2;
    }
    return worldPos;
  }

  getPosition() { return this.position.clone(); }

  // ═══════════════════════════════════════════════════════════════════════
  //  MESH CONSTRUCTION
  // ═══════════════════════════════════════════════════════════════════════

  _build() {
    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.jerseyMat = new THREE.MeshStandardMaterial({ color: this.teamColor, roughness: 0.8, metalness: 0.0 });
    this.skinMat   = new THREE.MeshStandardMaterial({ color: 0xC68642, roughness: 0.9, metalness: 0.0 });
    this.shortsMat = new THREE.MeshStandardMaterial({ color: 0x1A1A2E, roughness: 0.8 });
    this.shoesMat  = new THREE.MeshStandardMaterial({ color: 0xFFFFFF, roughness: 0.6 });
    this.shoeAccentMat = new THREE.MeshStandardMaterial({ color: this.teamColor, roughness: 0.5 });

    this._buildBody();
    this._buildShadow();

    this.group.position.copy(this.position);
  }

  _buildBody() {
    const pg = new THREE.Group();
    this.bodyGroup = pg;
    this.group.add(pg);

    // Torso
    const torsoGeo = new THREE.BoxGeometry(0.52, 0.65, 0.28);
    this.torso = new THREE.Mesh(torsoGeo, this.jerseyMat);
    this.torso.position.y = 1.35;
    this.torso.castShadow = true;
    pg.add(this.torso);

    // Waistband
    const waistGeo = new THREE.BoxGeometry(0.54, 0.06, 0.30);
    const waistMat = new THREE.MeshStandardMaterial({ color: 0xFFFFFF, roughness: 0.7 });
    const waist = new THREE.Mesh(waistGeo, waistMat);
    waist.position.y = 1.08;
    pg.add(waist);

    // Shorts
    const shortsGeo = new THREE.BoxGeometry(0.50, 0.35, 0.27);
    this.shorts = new THREE.Mesh(shortsGeo, this.shortsMat);
    this.shorts.position.y = 0.90;
    this.shorts.castShadow = true;
    pg.add(this.shorts);

    // Neck
    const neckGeo = new THREE.CylinderGeometry(0.10, 0.12, 0.15, 8);
    const neck = new THREE.Mesh(neckGeo, this.skinMat);
    neck.position.y = 1.72;
    pg.add(neck);

    // Head
    const headGeo = new THREE.SphereGeometry(0.18, 16, 16);
    this.head = new THREE.Mesh(headGeo, this.skinMat);
    this.head.position.y = 1.97;
    this.head.castShadow = true;
    pg.add(this.head);

    // Hair
    const hairGeo = new THREE.SphereGeometry(0.185, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.5);
    const hairMat = new THREE.MeshStandardMaterial({ color: 0x1A0A00, roughness: 0.9 });
    const hair = new THREE.Mesh(hairGeo, hairMat);
    hair.position.y = 1.97;
    pg.add(hair);

    // Headband
    const bandGeo = new THREE.TorusGeometry(0.185, 0.022, 8, 24);
    const bandMat = new THREE.MeshStandardMaterial({ color: this.teamColor, roughness: 0.7 });
    const band = new THREE.Mesh(bandGeo, bandMat);
    band.position.y = 1.97;
    band.rotation.x = Math.PI / 2;
    pg.add(band);

    // Upper arms
    const upperArmGeo = new THREE.CylinderGeometry(0.085, 0.075, 0.35, 8);
    this.leftArm = new THREE.Mesh(upperArmGeo, this.jerseyMat);
    this.leftArm.position.set(-0.32, 1.45, 0);
    this.leftArm.rotation.z = Math.PI / 8;
    this.leftArm.castShadow = true;
    pg.add(this.leftArm);

    this.rightArm = new THREE.Mesh(upperArmGeo.clone(), this.jerseyMat);
    this.rightArm.position.set(0.32, 1.45, 0);
    this.rightArm.rotation.z = -Math.PI / 8;
    this.rightArm.castShadow = true;
    pg.add(this.rightArm);

    // Forearms
    const forearmGeo = new THREE.CylinderGeometry(0.07, 0.065, 0.32, 8);
    this.leftForearm = new THREE.Mesh(forearmGeo, this.skinMat);
    this.leftForearm.position.set(-0.42, 1.20, 0);
    this.leftForearm.rotation.z = Math.PI / 6;
    pg.add(this.leftForearm);

    this.rightForearm = new THREE.Mesh(forearmGeo.clone(), this.skinMat);
    this.rightForearm.position.set(0.42, 1.20, 0);
    this.rightForearm.rotation.z = -Math.PI / 6;
    pg.add(this.rightForearm);

    // Hands
    const handGeo = new THREE.SphereGeometry(0.075, 10, 10);
    this.leftHand = new THREE.Mesh(handGeo, this.skinMat);
    this.leftHand.position.set(-0.42, 1.02, 0);
    this.leftHand.castShadow = true;
    pg.add(this.leftHand);

    this.rightHand = new THREE.Mesh(handGeo.clone(), this.skinMat);
    this.rightHand.position.set(0.42, 1.02, 0);
    this.rightHand.castShadow = true;
    pg.add(this.rightHand);

    // Thighs
    const thighGeo = new THREE.CylinderGeometry(0.12, 0.10, 0.42, 10);
    this.leftLeg = new THREE.Mesh(thighGeo, this.shortsMat);
    this.leftLeg.position.set(-0.14, 0.62, 0);
    this.leftLeg.castShadow = true;
    pg.add(this.leftLeg);

    this.rightLeg = new THREE.Mesh(thighGeo.clone(), this.shortsMat);
    this.rightLeg.position.set(0.14, 0.62, 0);
    this.rightLeg.castShadow = true;
    pg.add(this.rightLeg);

    // Calves
    const calfGeo = new THREE.CylinderGeometry(0.09, 0.075, 0.40, 10);
    const calfMat = new THREE.MeshStandardMaterial({ color: 0xDDCCBB, roughness: 0.8 });
    this.leftCalf = new THREE.Mesh(calfGeo, calfMat);
    this.leftCalf.position.set(-0.14, 0.20, 0);
    pg.add(this.leftCalf);

    this.rightCalf = new THREE.Mesh(calfGeo.clone(), calfMat);
    this.rightCalf.position.set(0.14, 0.20, 0);
    pg.add(this.rightCalf);

    // Socks
    const sockGeo = new THREE.CylinderGeometry(0.09, 0.085, 0.12, 10);
    const sockMat = new THREE.MeshStandardMaterial({ color: 0xFFFFFF, roughness: 0.8 });
    const leftSock = new THREE.Mesh(sockGeo, sockMat);
    leftSock.position.set(-0.14, 0.06, 0);
    pg.add(leftSock);
    const rightSock = new THREE.Mesh(sockGeo.clone(), sockMat);
    rightSock.position.set(0.14, 0.06, 0);
    pg.add(rightSock);

    // Shoes
    const shoeGeo = new THREE.BoxGeometry(0.20, 0.10, 0.32);
    this.leftShoe = new THREE.Mesh(shoeGeo, this.shoesMat);
    this.leftShoe.position.set(-0.14, 0.05, 0.04);
    this.leftShoe.castShadow = true;
    pg.add(this.leftShoe);

    this.rightShoe = new THREE.Mesh(shoeGeo.clone(), this.shoesMat);
    this.rightShoe.position.set(0.14, 0.05, 0.04);
    this.rightShoe.castShadow = true;
    pg.add(this.rightShoe);

    // Shoe accent stripes
    const stripeGeo = new THREE.BoxGeometry(0.21, 0.03, 0.10);
    const leftStripe = new THREE.Mesh(stripeGeo, this.shoeAccentMat);
    leftStripe.position.set(-0.14, 0.07, 0.04);
    pg.add(leftStripe);
    const rightStripe = new THREE.Mesh(stripeGeo.clone(), this.shoeAccentMat);
    rightStripe.position.set(0.14, 0.07, 0.04);
    pg.add(rightStripe);

    // Jersey number
    this._addJerseyNumber();

    // Store base positions for animation reference
    this._basePositions = {
      leftArm:   this.leftArm.position.clone(),
      rightArm:  this.rightArm.position.clone(),
      leftLeg:   this.leftLeg.position.clone(),
      rightLeg:  this.rightLeg.position.clone(),
      leftShoe:  this.leftShoe.position.clone(),
      rightShoe: this.rightShoe.position.clone(),
      rightHand: this.rightHand.position.clone()
    };
    this._baseRotations = {
      rightArm:  this.rightArm.rotation.clone(),
      leftArm:   this.leftArm.rotation.clone()
    };
  }

  _addJerseyNumber() {
    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(255,255,255,0)';
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = 'white';
    ctx.font = 'bold 72px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('23', 64, 64);

    const texture = new THREE.CanvasTexture(canvas);
    const numGeo  = new THREE.PlaneGeometry(0.22, 0.22);
    const numMat  = new THREE.MeshBasicMaterial({ map: texture, transparent: true });

    const numFront = new THREE.Mesh(numGeo, numMat);
    numFront.position.set(0, 1.38, 0.145);
    this.bodyGroup.add(numFront);

    const numBack = new THREE.Mesh(numGeo.clone(), numMat.clone());
    numBack.position.set(0, 1.38, -0.145);
    numBack.rotation.y = Math.PI;
    this.bodyGroup.add(numBack);
  }

  _buildShadow() {
    const shadowGeo = new THREE.CircleGeometry(0.4, 16);
    const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3 });
    this.shadow = new THREE.Mesh(shadowGeo, shadowMat);
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.01;
    this.group.add(this.shadow);
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  ANIMATIONS
  // ═══════════════════════════════════════════════════════════════════════

  _animateIdle(dt) {
    const breathe = Math.sin(this._animTime * 1.5) * 0.02;
    if (this.torso) this.torso.scale.y = 1 + breathe;

    if (this.leftArm && this.rightArm) {
      this.leftArm.rotation.z  =  Math.PI / 8 + Math.sin(this._animTime * 0.8) * 0.05;
      this.rightArm.rotation.z = -Math.PI / 8 - Math.sin(this._animTime * 0.8) * 0.05;
    }

    // Idle dribble
    this._dribblePhase += dt * 6;
    if (this.rightHand && this._basePositions) {
      const dribble = Math.abs(Math.sin(this._dribblePhase)) * 0.25;
      this.rightHand.position.y = this._basePositions.rightHand.y - dribble;
    }
    if (this.rightForearm) {
      this.rightForearm.rotation.x = Math.abs(Math.sin(this._dribblePhase)) * 0.3;
    }
  }

  _animateRunning(dt) {
    const currentSpeed = Math.sqrt(this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z);
    const speedRatio   = Math.min(currentSpeed / this.walkSpeed, 1.5);
    const freq         = currentSpeed * 0.45;
    const t            = this._animTime * freq;

    if (this.leftLeg && this.rightLeg) {
      const legSwing = Math.sin(t) * 0.45 * speedRatio;
      this.leftLeg.rotation.x  =  legSwing;
      this.rightLeg.rotation.x = -legSwing;
    }

    if (this.leftCalf && this.rightCalf) {
      this.leftCalf.rotation.x  = Math.max(0,  Math.sin(t + 0.5)) * 0.35;
      this.rightCalf.rotation.x = Math.max(0, -Math.sin(t + 0.5)) * 0.35;
    }

    if (this.leftArm && this.rightArm) {
      const armSwing = Math.sin(t) * 0.35 * speedRatio;
      this.leftArm.rotation.x  = -armSwing;
      this.rightArm.rotation.x =  armSwing;
    }

    if (this.bodyGroup) {
      const bob = Math.abs(Math.sin(t * 2)) * 0.04 * speedRatio;
      this.bodyGroup.position.y = bob;
    }
  }

  _animateShooting(dt) {
    this._shootPhase += dt / this._shootDuration;

    if (this._shootPhase >= 1) {
      // Reset to idle pose
      this.state = 'idle';
      this._shootPhase = 0;
      if (this.rightArm)  { this.rightArm.rotation.x = 0; this.rightArm.rotation.z = -Math.PI / 8; }
      if (this.rightForearm) this.rightForearm.rotation.x = 0;
      if (this.rightHand && this._basePositions) this.rightHand.position.copy(this._basePositions.rightHand);
      if (this.leftArm)   this.leftArm.rotation.x = 0;
      if (this.bodyGroup) this.bodyGroup.rotation.x = 0;
      return;
    }

    const t    = this._shootPhase;
    const ease = Math.sin(t * Math.PI);

    if (this.rightArm) {
      this.rightArm.rotation.x = -Math.PI * 0.75 * ease;
      this.rightArm.rotation.z = -Math.PI / 8 - t * 0.25;
    }
    if (this.rightForearm) this.rightForearm.rotation.x = -Math.PI * 0.45 * ease;
    if (this.rightHand && this._basePositions) {
      this.rightHand.position.y = this._basePositions.rightHand.y + ease * 0.8;
      this.rightHand.position.z = 0.15 + ease * 0.4;
    }
    if (this.leftArm)   this.leftArm.rotation.x = -Math.PI * 0.3 * ease;
    if (this.bodyGroup) this.bodyGroup.rotation.x = -t * 0.25;
  }

  _animateJump(dt) {
    this._jumpTime += dt;
    const t = this._jumpTime / this._jumpDuration;

    if (t >= 1) {
      this._isJumping = false;
      this.group.position.y = 0;
      return;
    }

    // Parabolic jump curve
    this.group.position.y = Math.sin(t * Math.PI) * 0.55;
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  CLEANUP
  // ═══════════════════════════════════════════════════════════════════════

  dispose() {
    this.group.traverse(obj => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
        else obj.material.dispose();
      }
    });
    this.scene.remove(this.group);
  }
}
