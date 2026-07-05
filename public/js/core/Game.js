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
 * Key improvements over the original:
 *   1. Player.move() now receives cameraYaw for camera-relative movement
 *   2. InputManager.update(dt) called FIRST every frame so Space-bar
 *      power is current before the HUD reads it
 *   3. Ball launch position is set correctly from player.getShootPosition()
 *   4. Trajectory preview uses the new ballistic solver
 *   5. Shot cooldown reset also resets ball to player hand
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
    this.hud          = null;
    this.notifications = null;

    // ── Game loop ─────────────────────────────────────────────────────────
    this._lastTime    = 0;
    this._running     = false;
    this._frameId     = null;

    // ── Shot state ────────────────────────────────────────────────────────
    this._canShoot       = true;
    this._shotCooldown   = 0;
    this._SHOT_COOLDOWN  = 1.5;   // seconds between shots
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
      window.gameLogger.info('Renderer initialized');

      this._updateLoading(20, 'Setting up camera...');
      this.camera = new CameraController(this.renderer);
      window.gameLogger.info('Camera initialized');

      this._updateLoading(30, 'Initializing input...');
      this.input = new InputManager();
      window.gameLogger.info('Input initialized');

      this._updateLoading(35, 'Setting up audio...');
      this.audio = new AudioManager();
      window.gameLogger.info('Audio initialized');

      this._updateLoading(40, 'Building physics engine...');
      this.physics     = new PhysicsEngine();
      this.ballPhysics = new BallPhysics(this.physics);
      this.collision   = new CollisionSystem(this.physics);
      window.gameLogger.info('Physics systems initialized');

      this._updateLoading(50, 'Building court...');
      this.court = new Court(this.renderer.scene);
      window.gameLogger.info('Court built');

      this._updateLoading(60, 'Building hoops...');
      this._buildHoops();
      window.gameLogger.info('Hoops built');

      this._updateLoading(70, 'Creating ball...');
      this.ball = new Ball(this.renderer.scene, this.physics, this.ballPhysics);
      window.gameLogger.info('Ball created');

      this._updateLoading(80, 'Creating player...');
      this.player = new Player(this.renderer.scene, this.physics, 0xFF6600);
      window.gameLogger.info('Player created');

      this._updateLoading(85, 'Setting up particles...');
      this.particles = new ParticleSystem(this.renderer.scene);
      window.gameLogger.info('Particles initialized');

      this._updateLoading(90, 'Initializing UI...');
      this.hud           = new HUD();
      this.notifications = new Notifications();
      this.state         = new GameState();
      window.gameLogger.info('UI and State initialized');

      this._updateLoading(95, 'Connecting systems...');
      this._connectSystems();
      this._setupMenuHandlers();
      window.gameLogger.info('Systems connected');

      this._updateLoading(100, 'Ready!');
      window.gameLogger.info('Initialization complete, showing menu');
      this._startGameLoop(); // Start the physics and rendering in the background
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
    });

    this.collision.on('rimHit', (data) => {
      this.audio.playRimHit(0.8);
      this.particles.rimSparks(data.position);
      this._activeHoop.flashRim();
      this.state.recordRimHit();
    });

    this.collision.on('backboardHit', () => {
      this.audio.playBackboardHit();
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
      this.input.requestPointerLock(document.body);
    });

    document.getElementById('btn-practice')?.addEventListener('click', () => {
      this.audio.playClick();
      this._hideMenu();
      this.state.startGame(true);
      this.hud.show();
      this._resetBallToPlayer();
      this._startGameLoop();
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
    if (code === 'KeyR') this._resetBallToPlayer();

    if (code === 'KeyC') {
      this.camera.cycleMode();
      // The camera itself shows its own HUD indicator now via _showModeIndicator()
    }

    if (code === 'Escape' && this.state.isActive()) {
      this._togglePause();
    }

    if (code === 'KeyM') {
      this.audio.setEnabled(!this.audio._enabled);
    }
  }

  /**
   * Fire a shot.
   * Called when the player releases Space / mouse button.
   */
  _onShotRelease(payload) {
    if (!this.state.isActive()) return;
    if (!this._canShoot)        return;
    if (this.ball.inFlight)     return;

    const power       = MathUtils.clamp(payload.power || 0.5, 0.05, 1.0);
    const angleOffset = payload.angleOffset || 0;

    // ── Target & launch positions ─────────────────────────────────────────
    const hoopPos  = this._activeHoop.getHoopWorldPosition();
    const shootPos = this.player.getShootPosition();

    // ── Apply shot physics ────────────────────────────────────────────────
    // Set inFlight true BEFORE moving the ball to prevent hand-pinning logic from overwriting it
    this.ball.inFlight = true;

    // ── Teleport ball body to release point ───────────────────────────────
    this.ball.body.position.x = shootPos.x;
    this.ball.body.position.y = shootPos.y;
    this.ball.body.position.z = shootPos.z;
    // Zero out any residual velocity from hand-pinning
    this.ball.body.velocity.x = 0;
    this.ball.body.velocity.y = 0;
    this.ball.body.velocity.z = 0;

    this.ball.shoot(
      { x: hoopPos.x, y: hoopPos.y, z: hoopPos.z },
      power,
      angleOffset
    );

    // ── Player animation ──────────────────────────────────────────────────
    this.player.playShotAnimation(0.4);

    // ── Shot cooldown ─────────────────────────────────────────────────────
    this._canShoot     = false;
    this._shotCooldown = this._SHOT_COOLDOWN;

    // ── Stats ─────────────────────────────────────────────────────────────
    this.state.stats.shots++;
    this.hud.updateStats(this.state.stats.shots, this.state.stats.made);
    this.hud.hidePowerMeter();

    // ── Camera cinematic ──────────────────────────────────────────────────
    // Only play cinematic if NOT in first-person mode
    if (power > 0.35 && this.camera.currentMode !== this.camera.MODES.FIRST_PERSON) {
      this.camera.playShotCinematic();
    }

    // ── Record for 3-pointer check ────────────────────────────────────────
    const playerPos = this.player.getPosition();
    this._lastShotDist  = MathUtils.dist2D(
      { x: playerPos.x, z: playerPos.z },
      { x: hoopPos.x,   z: hoopPos.z   }
    );
    this._lastShotPower = power;
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

    setTimeout(() => {
      if (!this.ball.inFlight) this._resetBallToPlayer();
    }, 2000);
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
      // Use performance.now() to avoid timestamp mismatches between rAF and performance.now
      const now = performance.now();
      let dt = (now - this._lastTime) / 1000;
      
      // Prevent negative dt and cap dt to 50ms to prevent spiral-of-death on tab resume
      if (dt < 0) dt = 0;
      if (dt > 0.05) dt = 0.05;
      
      this._lastTime = now;
      const time = now / 1000;

      this._update(dt, time);
      this._render(time);
    } catch (error) {
      window.gameLogger.error("Game Loop Error:", error);
      // Don't stop the loop, but maybe slow it down or skip this frame
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

    // ── 1. Update input FIRST so shotPower is current this frame ──────────
    this.input.update(dt);

    // ── 2. Game state (timers) ────────────────────────────────────────────
    this.state.update(dt);
    this.hud.updateClock(this.state.gameTime, this.state.period);
    this.hud.updateShotClock(this.state.shotClock);

    // ── 3. Camera mouse look & arrow keys ────────────────────────────────────────────────
    if (this.input.mouse.deltaX !== 0 || this.input.mouse.deltaY !== 0) {
      this.camera.setMouseDelta(this.input.mouse.deltaX, this.input.mouse.deltaY);
    }
    const camArrows = this.input.getCameraMoveVector();
    if (camArrows.x !== 0 || camArrows.y !== 0) {
      // Arrow keys act like mouse delta, scaling with dt to run independently of framerate
      this.camera.setMouseDelta(camArrows.x * 1200 * dt, -camArrows.y * 1200 * dt);
    }
    
    // ── 3.5. Shooter Mode (Hold RMB) & Zoom ───────────────────────────────
    const isRmbDown = this.input.isMouseButtonDown(2);
    if (isRmbDown && !this._wasAiming) {
      this._wasAiming = true;
      this._preAimMode = this.camera.currentMode;
      // Switch to First Person (Shooter Mode) if not already in it
      if (this.camera.currentMode !== this.camera.MODES.FIRST_PERSON) {
         this.camera.setMode(this.camera.MODES.FIRST_PERSON);
      }
    } else if (!isRmbDown && this._wasAiming) {
      this._wasAiming = false;
      // Revert to previous camera mode
      if (this._preAimMode !== null) {
         this.camera.setMode(this._preAimMode);
      }
    }

    if (this.input.mouse.scrollDelta !== 0) {
      this.camera.addZoom(this.input.mouse.scrollDelta);
    }

    // ── 4. Camera update (Early update to get correct rotation for movement) ──
    const playerPosForCam = this.player ? this.player.getPosition() : null;
    const ballPosForCam   = this.ball ? this.ball.getPosition() : null;
    if (this.camera) {
      // NOTE: We update it later now to prevent jitter.
    }

    // ── 5. Player movement (camera-relative) ─────────────────────────────
    const moveVec     = this.input.getMoveVector();
    const isSprinting = this.input.isSprinting();
    // Use getYaw() - the authoritative yaw from CameraController.
    // This works for BOTH follow and first-person modes without corruption.
    const cameraYaw   = this.camera.getYaw();
    this.player.move(moveVec, dt, isSprinting, cameraYaw);
    
    // In first-person mode: force player facing to match camera yaw instantly
    // so the player always runs in the direction the camera faces.
    if (this.camera.currentMode === this.camera.MODES.FIRST_PERSON) {
      const hasInput = (Math.abs(moveVec.x) + Math.abs(moveVec.z)) > 0.01;
      if (hasInput) {
        // Player rotation follows camera yaw directly for authentic FPS feel
        this.player.rotation = cameraYaw + Math.atan2(moveVec.x, moveVec.z);
        this.player.targetRotation = this.player.rotation;
      }
    }

    // ── 6. Shot charging UI & trajectory preview ──────────────────────────
    if (this.input.shotCharging && !this.ball.inFlight && this._canShoot) {
      // Show power meter (shotPower already updated by input.update)
      this.hud.showPowerMeter(this.input.shotPower);

      // Force player to face the active hoop while charging
      const hoopPos  = this._activeHoop.getHoopWorldPosition();
      const playerPos = this.player.getPosition();
      this.player.targetRotation = Math.atan2(
        hoopPos.x - playerPos.x,
        hoopPos.z - playerPos.z
      );

      // Trajectory preview dots
      if (this.input.shotPower > 0.05) {
        const shootPos = this.player.getShootPosition();
        const points   = this.ballPhysics.calcTrajectoryPreview(
          { x: shootPos.x, y: shootPos.y, z: shootPos.z },
          { x: hoopPos.x,  y: hoopPos.y,  z: hoopPos.z  },
          this.input.shotPower,
          this.input.dragAngle || 0
        );
        this.ball.showTrajectoryPreview(true, points);
      }

      // Audio feedback (tick every 10% increment)
      const prevPower = this.input.shotPower - dt * (1 / this.input.MAX_CHARGE_TIME);
      if (Math.floor(this.input.shotPower * 10) !== Math.floor(prevPower * 10)) {
        this.audio.playShotCharge(this.input.shotPower);
      }

    } else if (!this.input.shotCharging) {
      this.ball.showTrajectoryPreview(false);
      if (!this.ball.inFlight) {
        this.hud.hidePowerMeter();
      }
    }

    // ── 6. Shot cooldown ──────────────────────────────────────────────────
    if (!this._canShoot) {
      this._shotCooldown -= dt;
      if (this._shotCooldown <= 0) {
        this._canShoot = true;
        if (!this.ball.inFlight) this._resetBallToPlayer();
      }
    }

    // ── 7. Physics step ───────────────────────────────────────────────────
    this.physics.update(dt);

    // ── 8. Collision checks ───────────────────────────────────────────────
    const floorY     = 0;
    const ballRadius = this.ball.radius;

    // Floor
    if (this.ball.body.position.y - ballRadius <= floorY + 0.01) {
      this.collision._checkFloor(this.ball.body, ballRadius);
    }

    // Court boundaries
    this.collision._checkBoundaries(this.ball.body, ballRadius);

    // Hoops (backboard, rim, scoring)
    for (const hoop of this.hoops) {
      const cd = hoop.collisionData;

      if (cd.backboard) {
        this.collision._checkBackboard(this.ball.body, cd.backboard, ballRadius);
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
    // Pin ball to player's hand when not in flight
    if (!this.ball.inFlight) {
      const holdPos = this.player.getHoldingPosition();
      this.ball.body.position.x = holdPos.x;
      this.ball.body.position.y = holdPos.y;
      this.ball.body.position.z = holdPos.z;
      // Zero velocity so physics doesn't drift it away
      this.ball.body.velocity.x = 0;
      this.ball.body.velocity.y = 0;
      this.ball.body.velocity.z = 0;
    }

    this.ball.update(dt, time);
    this.player.update(dt, time);
    this.hoops.forEach(h => h.update(dt, time));
    this.court.update(time);
    this.particles.update(dt);

    // ── 10. Camera update ─────────────────────────────────────────────────────
    if (this.camera) {
      const pPosCam = this.player ? this.player.getPosition() : null;
      const bPosCam = this.ball ? this.ball.getPosition() : null;
      this.camera.update(dt, pPosCam, bPosCam, this.ball ? this.ball.inFlight : false);
    }

    // ── 11. AI opponent ───────────────────────────────────────────────────
    if (!this.state.isPractice) this._updateAI(dt);

    // ── 12. Active hoop selection ─────────────────────────────────────────
    this._updateActiveHoop();

    // ── 13. Clear per-frame input flags ───────────────────────────────────
    this.input.clearFrameState();
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  HELPERS
  // ═══════════════════════════════════════════════════════════════════════

  _updateActiveHoop() {
    const z = this.player.getPosition().z;
    // Shoot at the hoop on the opposite side of the court
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
