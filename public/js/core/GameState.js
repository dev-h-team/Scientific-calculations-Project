/**
 * GameState - Game State Machine
 * 
 * Manages all game states and transitions:
 * - LOADING → MENU → PLAYING → PAUSED → GAME_OVER
 * 
 * Tracks:
 * - Score (home/away)
 * - Game clock
 * - Shot clock
 * - Statistics
 * - Period
 */

class GameState {
  constructor() {
    // States
    this.STATES = {
      LOADING: 'LOADING',
      MENU: 'MENU',
      PLAYING: 'PLAYING',
      PAUSED: 'PAUSED',
      GAME_OVER: 'GAME_OVER',
      PRACTICE: 'PRACTICE'
    };
    
    this.current = this.STATES.LOADING;
    
    // Score
    this.homeScore = 0;
    this.awayScore = 0;
    
    // Time
    this.PERIOD_DURATION = 120; // 2 minutes per period (shortened for fun)
    this.SHOT_CLOCK_DURATION = 24;
    this.gameTime = this.PERIOD_DURATION;
    this.shotClock = this.SHOT_CLOCK_DURATION;
    this.period = 1;
    this.MAX_PERIODS = 4;
    this.isPractice = false;
    
    // Statistics
    this.stats = {
      shots: 0,
      made: 0,
      threePointers: 0,
      freeThrows: 0,
      swishes: 0,
      rimHits: 0,
      longestStreak: 0,
      currentStreak: 0
    };
    
    // Callbacks
    this._callbacks = {};
    
    // Timer
    this._lastTime = 0;
    this._clockRunning = false;
  }

  /**
   * Transition to a new state
   */
  setState(newState) {
    const prev = this.current;
    this.current = newState;
    this._emit('stateChange', { from: prev, to: newState });
  }

  /**
   * Start a new game
   */
  startGame(isPractice = false) {
    this.isPractice = isPractice;
    this.homeScore = 0;
    this.awayScore = 0;
    this.gameTime = this.PERIOD_DURATION;
    this.shotClock = this.SHOT_CLOCK_DURATION;
    this.period = 1;
    this.stats = {
      shots: 0, made: 0, threePointers: 0,
      freeThrows: 0, swishes: 0, rimHits: 0,
      longestStreak: 0, currentStreak: 0
    };
    this._clockRunning = !isPractice;
    this.setState(isPractice ? this.STATES.PRACTICE : this.STATES.PLAYING);
  }

  /**
   * Pause/resume
   */
  togglePause() {
    if (this.current === this.STATES.PLAYING || this.current === this.STATES.PRACTICE) {
      this._clockRunning = false;
      this.setState(this.STATES.PAUSED);
    } else if (this.current === this.STATES.PAUSED) {
      this._clockRunning = !this.isPractice;
      this.setState(this.isPractice ? this.STATES.PRACTICE : this.STATES.PLAYING);
    }
  }

  /**
   * Record a score
   */
  recordScore(points, isThreePointer = false) {
    this.homeScore += points;
    this.stats.made++;
    // NOTE: stats.shots is incremented in Game._onShotRelease to avoid double-count
    this.stats.currentStreak++;
    
    if (isThreePointer) this.stats.threePointers++;
    
    if (this.stats.currentStreak > this.stats.longestStreak) {
      this.stats.longestStreak = this.stats.currentStreak;
    }
    
    // Reset shot clock
    this.shotClock = this.SHOT_CLOCK_DURATION;
    
    this._emit('score', { points, isThreePointer, homeScore: this.homeScore });
  }

  /**
   * Record a miss
   */
  recordMiss() {
    this.stats.shots++;
    this.stats.currentStreak = 0;
    this._emit('miss', {});
  }

  /**
   * Record swish
   */
  recordSwish() {
    this.stats.swishes++;
  }

  /**
   * Record rim hit
   */
  recordRimHit() {
    this.stats.rimHits++;
  }

  /**
   * Update game timers
   */
  update(dt) {
    if (!this._clockRunning) return;
    if (this.current !== this.STATES.PLAYING) return;
    
    // Update game clock
    this.gameTime -= dt;
    this.shotClock -= dt;
    
    // Shot clock violation
    if (this.shotClock <= 0) {
      this.shotClock = this.SHOT_CLOCK_DURATION;
      this._emit('shotClockViolation', {});
    }
    
    // Period end
    if (this.gameTime <= 0) {
      this.gameTime = 0;
      this._emit('periodEnd', { period: this.period });
      
      if (this.period >= this.MAX_PERIODS) {
        this._clockRunning = false;
        this.setState(this.STATES.GAME_OVER);
        this._emit('gameOver', {
          homeScore: this.homeScore,
          awayScore: this.awayScore,
          stats: this.stats
        });
      } else {
        this.period++;
        this.gameTime = this.PERIOD_DURATION;
        this.shotClock = this.SHOT_CLOCK_DURATION;
        this._emit('periodStart', { period: this.period });
      }
    }
  }

  /**
   * Get shooting percentage
   */
  getShootingPct() {
    if (this.stats.shots === 0) return 0;
    return Math.round((this.stats.made / this.stats.shots) * 100);
  }

  /**
   * Check if game is active
   */
  isActive() {
    return this.current === this.STATES.PLAYING || 
           this.current === this.STATES.PRACTICE;
  }

  // ---- Event system ----

  on(event, callback) {
    if (!this._callbacks[event]) this._callbacks[event] = [];
    this._callbacks[event].push(callback);
  }

  _emit(event, data) {
    if (this._callbacks[event]) {
      this._callbacks[event].forEach(cb => cb(data));
    }
  }
}
