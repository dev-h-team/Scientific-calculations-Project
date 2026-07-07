/**
 * Game - Main Game Controller
 *
 * Orchestrates all game systems:
 *   • Initialises all modules
 *   • Runs the main game loop at fixed physics + variable render rate
 *   • Handles input → physics → rendering pipeline
 *   • Manages game state transitions
 *   • Connects all event systems
 *
 * Key improvements:
 *   1. Player.move() receives cameraYaw for camera-relative movement
 *   2. InputManager.update(dt) called FIRST every frame
 *   3. Ball launch position set from player.getShootPosition()
 *   4. Trajectory preview uses the new ballistic solver
 *   5. Ball stays in physics after landing — only R resets it
 *   6. Camera defaults to BROADCAST (side view) for collision monitoring
 *   7. PhysicsPanel provides full runtime control over all physics constants
 *   8. Free-shot mode: fire at explicit speed+angle in camera direction
 */

class Game {
  constructor() {
    // ── Core systems ──────────────────────────────────────────────────────
    this.renderer     = null;
    this.camera       = null;
    this.input        = null;
    this.audio        = null;
    this.state        = null;

    // ── Physics ───────────────────────────────────────────────────────────
    this.physics      = null;
    this.ballPhysics  = null;
    this.collision    = null;

    // ── Entities ──────────────────────────────────────────────────────────
    this.court        = null;
    this.hoops        = [];
    this.ball         = null;
    this.player       = null;
    this.particles    = null;

    // ── UI ────────────────────────────────────────────────────────────────
    this.hud           = null;
    this.notifications = null;
    this.state         = null;
    this.physicsPanel  = null;

    // ── Game loop ─────────────────────────────────────────────────────────
    this._lastTime    = 0;
    this._running     = false;
    this._frameId     = null;

    // ── Shot state ────────────────────────────────────────────────────────
    this._canShoot       = true;
    this._shotCooldown   = 0;
    this._SHOT_COOLDOWN  = 1.5;
    this._activeHoop     = null;
    this._lastShotDist   = 0;
    this._lastShotPower  = 0;

    // ── AI ────────────────────────────────────────────────────────────────
    this._aiTimer        = 0;
    this._aiShotInterval = 8;

    // ── Shooter Aim Mode ──────────────────────────────────────────────────
    this._wasAiming      = false;
    this._preAimMode     = null;

    this._init();
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  INITIALISATION
  // ═══════════════════════════════════════════════════════════════════════

  async _init() {
    try {
      window.gameLogger.info('Game initialization started');

      this._updateLoading(10, 'Creating renderer...');
      const container = document.getElementById('canvas-container');
      if (!container) throw new Error('Canvas container not found!');
      this.renderer = new Renderer(container);

      this._updateLoading(20, 'Setting up camera...');
      this.camera = new CameraController(this.renderer);

      this._updateLoading(30, 'Initializing input...');
      this.input = new InputManager();

      this._updateLoading(35, 'Setting up audio...');
      this.audio = new AudioManager();

      this._updateLoading(40, 'Building physics engine...');
      this.physics     = new PhysicsEngine();
      this.ballPhysics = new BallPhysics(this.physics);
      this.collision   = new CollisionSystem(this.physics);

      this._updateLoading(50, 'Building court...');
      this.court = new Court(this.renderer.scene);

      this._updateLoading(60, 'Building hoops...');
      this._buildHoops();

      this._updateLoading(70, 'Creating ball...');
      this.ball = new Ball(this.renderer.scene, this.physics, this.ballPhysics);

      this._updateLoading(80, 'Creating player...');
      this.player = new Player(this.renderer.scene, this.physics, 0xFF6600);

      this._updateLoading(85, 'Setting up particles...');
      this.particles = new ParticleSystem(this.renderer.scene);

      this._updateLoading(90, 'Initializing UI...');
      this.hud           = new HUD();
      this.notifications = new Notifications();
      this.state         = new GameState();

      this._updateLoading(95, 'Connecting systems...');
      this._connectSystems();
      this._setupMenuHandlers();

      // ── Physics Panel (last, after all systems ready) ──────────────────
      this.physicsPanel = new PhysicsPanel(this.physics, this.ballPhysics, this);

      this._updateLoading(100, 'Ready!');
      this._startGameLoop();
      setTimeout(() => this._showMenu(), 800);
    } catch (err) {
      window.gameLogger.error('CRITICAL INITIALIZATION ERROR:', err);
      document.getElementById('loading-text').textContent = 'ERROR: ' + err.message;
      document.getElementById('loading-text').style.color = '#ff4444';
    }
  }

  _buildHoops() {
    const leftHoop = new Hoop(
      this.renderer.scene,
      new THREE.Vector3(0, 0, -12.4),
      0
    );
    this.hoops.push(leftHoop);

    const rightHoop = new Hoop(
      this.renderer.scene,
      new THREE.Vector3(0, 0, 12.4),
      Math.PI
    );
    this.hoops.push(rightHoop);

    this._activeHoop = this.hoops[0];
  }

  _connectSystems() {
    // ── Collision events ──────────────────────────────────────────────────
    this.collision.on('floorBounce', (data) => {
      this.audio.playBounce(data.speed * 0.5);
      this.particles.bounceDust(data.position, data.speed);
      const speedMS = data.speed / this.physics.SCALE;
      this.ball?.flashCollision('floor', speedMS);  // only flashes on hard impacts
      this.physicsPanel?.logCollision('floor', speedMS);
    });

    this.collision.on('rimHit', (data) => {
      this.audio.playRimHit(0.8);
      this.particles.rimSparks(data.position);
      this._activeHoop.flashRim();
      this.state.recordRimHit();
      const speedMS = data.speed / this.physics.SCALE;
      this.ball?.flashCollision('rim', speedMS);
      this.physicsPanel?.logCollision('rim', speedMS);
    });

    this.collision.on('backboardHit', (data) => {
      this.audio.playBackboardHit();
      const speedMS = (data?.speed || 0) / this.physics.SCALE;
      this.ball?.flashCollision('backboard', speedMS);
      this.physicsPanel?.logCollision('backboard', speedMS);
    });

    this.collision.on('scored', (data) => {
      this._onScore(data);
    });

    // ── Input events ──────────────────────────────────────────────────────
    this.input.on('shotRelease', (payload) => {
      this._onShotRelease(payload);
    });

    this.input.on('keydown', (code) => {
      this._onKeyDown(code);
    });

    // ── Game state events ─────────────────────────────────────────────────
    this.state.on('score', () => {
      this.hud.updateScore(this.state.homeScore, this.state.awayScore);
    });

    this.state.on('periodEnd', (data) => {
      this.audio.playBuzzer();
      this.notifications.showPeriodChange(data.period + 1);
    });

    this.state.on('gameOver', (data) => {
      this._showGameOver(data);
    });

    this.state.on('shotClockViolation', () => {
      this.notifications.show('SHOT CLOCK!', 'miss', 2000);
      this._resetBallToPlayer();
    });
  }

  _setupMenuHandlers() {
    document.getElementById('btn-play')?.addEventListener('click', () => {
      this.audio.playClick();
      this._hideMenu();
      this.state.startGame(false);
      this.hud.show();
      this._resetBallToPlayer();
      this._startGameLoop();
      // Default to BROADCAST (side view) for best collision visibility
      this.camera.setMode(this.camera.MODES.BROADCAST);
      this.input.requestPointerLock(document.body);
    });

    document.getElementById('btn-practice')?.addEventListener('click', () => {
      this.audio.playClick();
      this._hideMenu();
      this.state.startGame(true);
      this.hud.show();
      this._resetBallToPlayer();
      this._startGameLoop();
      // Default to BROADCAST side view in practice mode
      this.camera.setMode(this.camera.MODES.BROADCAST);
      this.input.requestPointerLock(document.body);
    });

    document.getElementById('btn-controls')?.addEventListener('click', () => {
      this.audio.playClick();
      document.getElementById('main-menu').classList.add('hidden');
      document.getElementById('controls-screen').classList.remove('hidden');
    });

    document.getElementById('btn-back')?.addEventListener('click', () => {
      this.audio.playClick();
      document.getElementById('controls-screen').classList.add('hidden');
      document.getElementById('main-menu').classList.remove('hidden');
    });

    document.getElementById('btn-pause')?.addEventListener('click', () => {
      this._togglePause();
    });

    document.getElementById('btn-resume')?.addEventListener('click', () => {
      this.audio.playClick();
      this._togglePause();
    });

    document.getElementById('btn-restart')?.addEventListener('click', () => {
      this.audio.playClick();
      this._restartGame();
    });

    document.getElementById('btn-main-menu')?.addEventListener('click', () => {
      this.audio.playClick();
      this._returnToMenu();
    });

    document.getElementById('btn-play-again')?.addEventListener('click', () => {
      this.audio.playClick();
      this._restartGame();
    });

    document.getElementById('btn-menu-final')?.addEventListener('click', () => {
      this.audio.playClick();
      this._returnToMenu();
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  INPUT HANDLERS
  // ═══════════════════════════════════════════════════════════════════════

  _onKeyDown(code) {
    // R resets ball to player — the ONLY way to get it back
    if (code === 'KeyR') this._resetBallToPlayer();

    if (code === 'KeyC') {
      this.camera.cycleMode();
    }

    if (code === 'Escape' && this.state.isActive()) {
      this._togglePause();
    }

    if (code === 'KeyM') {
      this.audio.setEnabled(!this.audio._enabled);
    }
  }

  /**
   * Fire a hoop-targeted shot (standard gameplay).
   * Called when the player releases Space / mouse button.
   */
  _onShotRelease(payload) {
    if (!this.state.isActive()) return;
    if (!this._canShoot)        return;
    // Allow re-shooting even if ball is still bouncing (physicsActive)
    // But NOT if it's still in primary flight
    if (this.ball.inFlight)     return;

    const power       = MathUtils.clamp(payload.power || 0.5, 0.05, 1.0);
    const angleOffset = payload.angleOffset || 0;

    const hoopPos  = this._activeHoop.getHoopWorldPosition();
    const shootPos = this.player.getShootPosition();
    const playerPos = this.player.getPosition();

    // Allow throwing in any direction! 
    // Calculate a virtual target at the same distance as the hoop, but in the direction the player is facing.
    const distToHoop = Math.hypot(hoopPos.x - playerPos.x, hoopPos.z - playerPos.z);
    const targetPos = {
      x: playerPos.x + Math.sin(this.player.rotation) * distToHoop,
      y: hoopPos.y,
      z: playerPos.z + Math.cos(this.player.rotation) * distToHoop
    };

    // Set inFlight before moving ball to prevent hand-pin overwrite
    this.ball.inFlight      = true;
    this.ball.physicsActive = true;
    this.ball.isHeld        = false;  // ball leaves player's hand

    this.ball.body.position.x = shootPos.x;
    this.ball.body.position.y = shootPos.y;
    this.ball.body.position.z = shootPos.z;
    this.ball.body.velocity.x = 0;
    this.ball.body.velocity.y = 0;
    this.ball.body.velocity.z = 0;

    this.ball.shoot(
      { x: targetPos.x, y: targetPos.y, z: targetPos.z },
      power,
      angleOffset
    );

    this.player.playShotAnimation(0.4);

    this._canShoot     = false;
    this._shotCooldown = this._SHOT_COOLDOWN;

    this.state.stats.shots++;
    this.hud.updateStats(this.state.stats.shots, this.state.stats.made);
    this.hud.hidePowerMeter();

    // Cinematic shot cam — ONLY triggers from FOLLOW mode.
    // BROADCAST, FREE, FIRST_PERSON and BALL CAM all remain static/unchanged
    // after a shot; they never auto-switch to ball tracking.
    if (power > 0.35 && this.camera.currentMode === this.camera.MODES.FOLLOW) {
      this.camera.playShotCinematic();
    }

    // playerPos is already defined above
    this._lastShotDist  = MathUtils.dist2D(
      { x: playerPos.x, z: playerPos.z },
      { x: hoopPos.x,   z: hoopPos.z   }
    );
    this._lastShotPower = power;
  }

  /**
   * Fire a free shot (Physics Panel mode) — explicit speed + angle + direction + spin.
   * @param {number} speedMS  - launch speed in m/s
   * @param {number} angleDeg - elevation angle in degrees
   * @param {number} [spinX=0]  - backspin(-) / topspin(+)  in rad/s
   * @param {number} [spinY=0]  - sidespin L(-) / R(+)       in rad/s
   */
  _fireFreeSshot(speedMS, angleDeg, spinX = 0, spinY = 0) {
    // Release ball from hand
    this.ball.isHeld        = false;
    this.ball.inFlight      = true;
    this.ball.physicsActive = true;
    // Place ball at player shoot position
    const shootPos = this.player.getShootPosition();
    this.ball.body.position.x = shootPos.x;
    this.ball.body.position.y = shootPos.y;
    this.ball.body.position.z = shootPos.z;
    this.ball.body.velocity.x = 0;
    this.ball.body.velocity.y = 0;
    this.ball.body.velocity.z = 0;

    // Fire in the direction the camera is facing
    const yaw = this.camera.getYaw();
    this.ball.shootFree(speedMS, angleDeg, yaw);

    // Apply spin: angularVelocity in world units
    // spinX = backspin/topspin (rotation around camera-right axis)
    // spinY = sidespin (rotation around world Y axis)
    if (this.ball.body.angularVelocity) {
      // Rotate spinX into the camera's local X axis (perpendicular to look direction)
      const camRight_X =  Math.cos(yaw);  // right vector X component
      const camRight_Z = -Math.sin(yaw);  // right vector Z component
      this.ball.body.angularVelocity.x = spinX * camRight_Z + 0;
      this.ball.body.angularVelocity.y = spinY;
      this.ball.body.angularVelocity.z = spinX * camRight_X;
    }

    this._canShoot     = false;
    this._shotCooldown = this._SHOT_COOLDOWN;

    if (this.state.isActive()) {
      this.state.stats.shots++;
      this.hud.updateStats(this.state.stats.shots, this.state.stats.made);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  SCORING
  // ═══════════════════════════════════════════════════════════════════════

  _onScore(data) {
    const isThree = MathUtils.isThreePointer(this._lastShotDist || 0);
    const points  = isThree ? 3 : 2;
    const isSwish = data.isClean;

    this.state.recordScore(points, isThree);
    if (isSwish) this.state.recordSwish();

    const hoopPos = this._activeHoop.getHoopWorldPosition();
    this.particles.celebrateScore({ x: hoopPos.x, y: hoopPos.y, z: hoopPos.z }, isThree);
    this._activeHoop.animateNet();
    this.renderer.flashRimLight(hoopPos);
    this.camera.shake(0.2);
    this.audio.playScore(points);
    setTimeout(() => this.audio.playCrowdCheer(isThree ? 1.5 : 1.0), 200);
    this.ball.celebrateScore();

    if (isSwish) {
      this.notifications.showScore(points, true);
    } else if (isThree) {
      this.notifications.showThreePointer();
      setTimeout(() => this.notifications.showScore(points, false), 500);
    } else {
      this.notifications.showScore(points, false);
    }

    this.hud.updateScore(this.state.homeScore, this.state.awayScore);
    this.hud.updateStats(this.state.stats.shots, this.state.stats.made);

    // After score: ball falls through the net and bounces — no auto-reset
    // Player presses R to retrieve it
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  BALL RESET
  // ═══════════════════════════════════════════════════════════════════════

  _resetBallToPlayer() {
    const playerPos = this.player.getPosition();
    this.ball.reset({
      x: playerPos.x + 0.5,
      y: playerPos.y + 1.2,
      z: playerPos.z
    });
    this.ball.isHeld   = true;   // ball is now in player's hand
    this._canShoot     = true;
    this._shotCooldown = 0;
    this.hud.hidePowerMeter();
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  MENU / PAUSE / GAME-OVER
  // ═══════════════════════════════════════════════════════════════════════

  _togglePause() {
    this.state.togglePause();
    const pm = document.getElementById('pause-menu');
    if (this.state.current === this.state.STATES.PAUSED) {
      pm?.classList.remove('hidden');
    } else {
      pm?.classList.add('hidden');
    }
  }

  _restartGame() {
    document.getElementById('pause-menu')?.classList.add('hidden');
    document.getElementById('game-over')?.classList.add('hidden');
    this.particles.clear();
    this.state.startGame(this.state.isPractice);
    this.player.position.set(0, 0, 8);
    this.player.velocity.set(0, 0, 0);
    this._resetBallToPlayer();
    this.hud.updateScore(0, 0);
    this.hud.updateStats(0, 0);
    this.notifications.clear();
  }

  _returnToMenu() {
    document.getElementById('pause-menu')?.classList.add('hidden');
    document.getElementById('game-over')?.classList.add('hidden');
    this.hud.hide();
    this._showMenu();
    this.state.setState(this.state.STATES.MENU);
    this.particles.clear();
  }

  _showGameOver(data) {
    const gameOver = document.getElementById('game-over');
    if (!gameOver) return;

    document.getElementById('final-home').textContent = data.homeScore;
    document.getElementById('final-away').textContent = data.awayScore;

    const winner = data.homeScore > data.awayScore ? 'YOU WIN! 🏆' :
                   data.homeScore < data.awayScore ? 'YOU LOSE'    : 'TIE GAME';
    document.getElementById('gameover-title').textContent = winner;

    const statsEl = document.getElementById('final-stats');
    if (statsEl) {
      statsEl.innerHTML =
        `Shots: ${data.stats.shots} | Made: ${data.stats.made} | ${this.state.getShootingPct()}%<br>` +
        `3-Pointers: ${data.stats.threePointers} | Swishes: ${data.stats.swishes}<br>` +
        `Best Streak: ${data.stats.longestStreak}`;
    }

    gameOver.classList.remove('hidden');
    this.hud.hide();
  }

  _showMenu() {
    const ls = document.getElementById('loading-screen');
    if (ls) ls.classList.add('fade-out');
    setTimeout(() => {
      if (ls) ls.style.display = 'none';
      document.getElementById('main-menu')?.classList.remove('hidden');
    }, 800);
  }

  _hideMenu() {
    document.getElementById('main-menu')?.classList.add('hidden');
  }

  _updateLoading(progress, text) {
    const bar  = document.getElementById('loading-bar');
    const textEl = document.getElementById('loading-text');
    if (bar)    bar.style.width    = `${progress}%`;
    if (textEl) textEl.textContent = text;
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  MAIN GAME LOOP
  // ═══════════════════════════════════════════════════════════════════════

  _startGameLoop() {
    if (this._running) return;
    this._running  = true;
    this._lastTime = performance.now();
    this._loop(this._lastTime);
  }

  _loop(timestamp) {
    this._frameId = requestAnimationFrame((t) => this._loop(t));

    try {
      const now = performance.now();
      let dt = (now - this._lastTime) / 1000;

      if (dt < 0) dt = 0;
      if (dt > 0.05) dt = 0.05;

      this._lastTime = now;
      const time = now / 1000;

      this._update(dt, time);
      this._render(time);
    } catch (error) {
      window.gameLogger.error('Game Loop Error:', error);
    }
  }

  _update(dt, time) {
    // Always update lights and scene even in menu
    this.renderer.updateLights(time);

    if (!this.state.isActive() && this.state.current !== this.state.STATES.PAUSED) {
      const playerPos = this.player ? this.player.getPosition() : null;
      this.camera.update(dt, playerPos, null, false);
      this.court.update(time);
      this.hoops.forEach(h => h.update(dt, time));
      return;
    }

    if (this.state.current === this.state.STATES.PAUSED) return;

    // ── 1. Update input FIRST so shotPower is current this frame ─────────
    this.input.update(dt);

    // ── 2. Game state (timers) ────────────────────────────────────────────
    this.state.update(dt);
    this.hud.updateClock(this.state.gameTime, this.state.period);
    this.hud.updateShotClock(this.state.shotClock);

    // ── 3. Camera mouse look & arrow keys ────────────────────────────────
    if (this.input.mouse.deltaX !== 0 || this.input.mouse.deltaY !== 0) {
      this.camera.setMouseDelta(this.input.mouse.deltaX, this.input.mouse.deltaY);
    }
    const camArrows = this.input.getCameraMoveVector();
    if (camArrows.x !== 0 || camArrows.y !== 0) {
      this.camera.setMouseDelta(camArrows.x * 1200 * dt, -camArrows.y * 1200 * dt);
    }

    // ── 3.5. Shooter Mode (Hold RMB) & Zoom ─────────────────────────────
    const isRmbDown = this.input.isMouseButtonDown(2);
    if (isRmbDown && !this._wasAiming) {
      this._wasAiming = true;
      this._preAimMode = this.camera.currentMode;
      if (this.camera.currentMode !== this.camera.MODES.FIRST_PERSON) {
        this.camera.setMode(this.camera.MODES.FIRST_PERSON);
      }
    } else if (!isRmbDown && this._wasAiming) {
      this._wasAiming = false;
      if (this._preAimMode !== null) {
        this.camera.setMode(this._preAimMode);
      }
    }

    if (this.input.mouse.scrollDelta !== 0) {
      this.camera.addZoom(this.input.mouse.scrollDelta);
    }

    // ── 5. Player movement (camera-relative) ─────────────────────────────
    const moveVec     = this.input.getMoveVector();
    const isSprinting = this.input.isSprinting();
    const cameraYaw   = this.camera.getYaw();
    this.player.move(moveVec, dt, isSprinting, cameraYaw);

    if (this.camera.currentMode === this.camera.MODES.FIRST_PERSON) {
      // Always lock player rotation to camera yaw in 1st person to prevent head clipping.
      // Offset by PI because Player.js defines 0 rotation as facing +Z (Backwards), whereas camera yaw 0 is -Z (Forward).
      this.player.rotation = cameraYaw + Math.PI;
      this.player.targetRotation = cameraYaw + Math.PI;
    }

    // ── 6. Shot charging UI & trajectory preview ──────────────────────────
    if (this.input.shotCharging && !this.ball.inFlight && this._canShoot) {
      const hoopPos  = this._activeHoop.getHoopWorldPosition();
      const playerPos = this.player.getPosition();

      // Initialise auto-aim when starting to charge in Broadcast mode
      if (!this._wasCharging) {
        this._wasCharging = true;
        if (this.camera.currentMode === this.camera.MODES.BROADCAST) {
          const angleToHoop = Math.atan2(hoopPos.x - playerPos.x, hoopPos.z - playerPos.z);
          this.camera._yaw = angleToHoop - Math.PI;
          this.camera._targetYaw = this.camera._yaw;
        }
      }

      // Tie player rotation to mouse-controlled yaw while charging in Broadcast mode
      if (this.camera.currentMode === this.camera.MODES.BROADCAST) {
        this.player.rotation = this.camera._yaw + Math.PI;
        this.player.targetRotation = this.player.rotation;
      }

      this.hud.showPowerMeter(this.input.shotPower);

      if (this.input.shotPower > 0.05) {
        // Calculate virtual target in the direction the player is currently facing
        const distToHoop = Math.hypot(hoopPos.x - playerPos.x, hoopPos.z - playerPos.z);
        const targetPos = {
          x: playerPos.x + Math.sin(this.player.rotation) * distToHoop,
          y: hoopPos.y,
          z: playerPos.z + Math.cos(this.player.rotation) * distToHoop
        };

        const shootPos = this.player.getShootPosition();
        const points   = this.ballPhysics.calcTrajectoryPreview(
          { x: shootPos.x, y: shootPos.y, z: shootPos.z },
          { x: targetPos.x, y: targetPos.y, z: targetPos.z },
          this.input.shotPower,
          this.input.dragAngle || 0
        );
        this.ball.showTrajectoryPreview(true, points);
      }

      const prevPower = this.input.shotPower - dt * (1 / this.input.MAX_CHARGE_TIME);
      if (Math.floor(this.input.shotPower * 10) !== Math.floor(prevPower * 10)) {
        this.audio.playShotCharge(this.input.shotPower);
      }

    } else if (!this.input.shotCharging) {
      this._wasCharging = false;
      this.ball.showTrajectoryPreview(false);
      if (!this.ball.inFlight) {
        this.hud.hidePowerMeter();
      }
    }

    // ── 6. Shot cooldown ──────────────────────────────────────────────────
    if (!this._canShoot) {
      this._shotCooldown -= dt;
      if (this._shotCooldown <= 0) {
        this._canShoot     = true;
        this._shotCooldown = 0;
        // Do NOT auto-reset the ball — player must press R
      }
    }

    // ── 7. Physics step ───────────────────────────────────────────────────
    this.physics.update(dt);

    // ── 8. Collision checks ───────────────────────────────────────────────
    const floorY     = 0;
    const ballRadius = this.ball.radius;

    // Floor — check whenever ball is physicsActive OR in flight
    if ((this.ball.inFlight || this.ball.physicsActive) &&
        this.ball.body.position.y - ballRadius <= floorY + 0.01) {
      this.collision._checkFloor(this.ball.body, ballRadius);
    }

    // Court boundaries
    this.collision._checkBoundaries(this.ball.body, ballRadius);

    // Hoops (backboard, rim, scoring)
    for (const hoop of this.hoops) {
      const cd = hoop.collisionData;

      if (cd.supportBoxes && cd.supportBoxes.length > 0) {
        this.collision._checkSupportBoxes(this.ball.body, cd.supportBoxes, ballRadius);
      }

      if (cd.rimPoints && cd.rimPoints.length > 0) {
        this.collision._checkRim(this.ball.body, cd.rimPoints, ballRadius);
      }

      if (cd.hoopCenter && this.ball.inFlight) {
        this.collision._checkScoring(
          this.ball.body,
          cd.hoopCenter,
          cd.hoopRadius,
          ballRadius,
          performance.now() / 1000
        );
      }
    }

    // ── 9. Entity updates ─────────────────────────────────────────────────
    // Pin ball to player's hand ONLY when the ball is flagged as held
    // (i.e. the player called _resetBallToPlayer and got it back).
    // After a shot the ball stays wherever it lands — player presses R to retrieve.
    if (this.ball.isHeld) {
      const holdPos = this.player.getHoldingPosition();
      this.ball.body.position.x = holdPos.x;
      this.ball.body.position.y = holdPos.y;
      this.ball.body.position.z = holdPos.z;
      this.ball.body.velocity.x = 0;
      this.ball.body.velocity.y = 0;
      this.ball.body.velocity.z = 0;
    }

    this.ball.update(dt, time);
    this.player.update(dt, time);
    this.hoops.forEach(h => h.update(dt, time));
    this.court.update(time);
    this.particles.update(dt);

    // ── 10. Camera update ─────────────────────────────────────────────────
    if (this.camera) {
      const pPosCam = this.player ? this.player.getPosition() : null;
      const bPosCam = this.ball ? this.ball.getPosition() : null;
      // Give ball velocity to camera so BALL CAM trails behind actual motion
      if (this.ball?.body?.velocity) {
        this.camera.setBallVelocity(this.ball.body.velocity);
      }
      this.camera.update(dt, pPosCam, bPosCam, this.ball ? this.ball.inFlight : false);
    }

    // ── 11. Physics Panel telemetry ───────────────────────────────────────
    if (this.physicsPanel && this.ball) {
      this.physicsPanel.update(dt, this.ball.body, this.ballPhysics.bounceCount);
    }

    // ── 12. AI opponent ───────────────────────────────────────────────────
    if (!this.state.isPractice) this._updateAI(dt);

    // ── 13. Active hoop selection ─────────────────────────────────────────
    this._updateActiveHoop();

    // ── 14. Clear per-frame input flags ───────────────────────────────────
    this.input.clearFrameState();
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  HELPERS
  // ═══════════════════════════════════════════════════════════════════════

  _updateActiveHoop() {
    const z = this.player.getPosition().z;
    this._activeHoop = z >= 0 ? this.hoops[0] : this.hoops[1];
  }

  _updateAI(dt) {
    this._aiTimer += dt;
    if (this._aiTimer >= this._aiShotInterval) {
      this._aiTimer        = 0;
      this._aiShotInterval = 6 + Math.random() * 8;

      if (Math.random() < 0.4) {
        this.state.awayScore += Math.random() > 0.7 ? 3 : 2;
        this.hud.updateScore(this.state.homeScore, this.state.awayScore);
        this.notifications.show('OPPONENT SCORES', 'miss', 1500);
      }
    }
  }

  _render(time) {
    if (this.renderer && this.camera && this.camera.camera) {
      this.renderer.render(this.renderer.scene, this.camera.camera);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  CLEANUP
  // ═══════════════════════════════════════════════════════════════════════

  dispose() {
    this._running = false;
    if (this._frameId) cancelAnimationFrame(this._frameId);
    this.court?.dispose();
    this.hoops.forEach(h => h.dispose());
    this.ball?.dispose();
    this.player?.dispose();
    this.particles?.clear();
    this.renderer?.dispose();
    this.input?.dispose();
  }
}

// ── Bootstrap ────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  window.game = new Game();
});
