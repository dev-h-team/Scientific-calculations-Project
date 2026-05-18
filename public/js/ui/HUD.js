/**
 * HUD - Heads-Up Display Manager
 *
 * Manages all in-game UI elements:
 *   • Score display with animation
 *   • Game clock (with red flash under 10 s)
 *   • Shot clock (with urgent state under 5 s)
 *   • Power meter  ← FIXED: updates every frame in real-time
 *   • Shooting statistics
 *   • Crosshair charging animation
 *
 * Power meter fix:
 *   showPowerMeter(power) is called every frame from Game._update()
 *   while input.shotCharging === true.  The bar width and colour
 *   update immediately, giving real-time feedback for both Space Bar
 *   hold and mouse drag.
 */

class HUD {
  constructor() {
    this.homeScore      = document.getElementById('home-score');
    this.awayScore      = document.getElementById('away-score');
    this.timeDisplay    = document.getElementById('time-display');
    this.periodDisplay  = document.getElementById('period-display');
    this.shotClock      = document.getElementById('shot-clock');
    this.powerBar       = document.getElementById('power-bar');
    this.powerValue     = document.getElementById('power-value');
    this.powerContainer = document.getElementById('power-container');
    this.statShots      = document.getElementById('stat-shots');
    this.statMade       = document.getElementById('stat-made');
    this.statPct        = document.getElementById('stat-pct');

    this._powerVisible  = false;
    this._lastPower     = -1;   // track last rendered power to skip redundant DOM writes
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  SCORE
  // ═══════════════════════════════════════════════════════════════════════

  updateScore(home, away) {
    if (this.homeScore) {
      this.homeScore.textContent = home;
      this._animateElement(this.homeScore, 'score-up');
    }
    if (this.awayScore) {
      this.awayScore.textContent = away;
    }
  }

  _animateElement(el, cls, duration = 500) {
    el.classList.add(cls);
    setTimeout(() => el.classList.remove(cls), duration);
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  CLOCK
  // ═══════════════════════════════════════════════════════════════════════

  updateClock(seconds, period) {
    if (this.timeDisplay) {
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      this.timeDisplay.textContent =
        `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

      if (seconds <= 10) {
        this.timeDisplay.style.color     = '#FF3366';
        this.timeDisplay.style.animation = 'pulse-red 0.5s ease infinite';
      } else {
        this.timeDisplay.style.color     = '';
        this.timeDisplay.style.animation = '';
      }
    }

    if (this.periodDisplay && period) {
      const names = ['Q1', 'Q2', 'Q3', 'Q4', 'OT'];
      this.periodDisplay.textContent = names[Math.min(period - 1, 4)] || 'Q1';
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  SHOT CLOCK
  // ═══════════════════════════════════════════════════════════════════════

  updateShotClock(seconds) {
    if (!this.shotClock) return;
    this.shotClock.textContent = Math.ceil(seconds);
    if (seconds <= 5) {
      this.shotClock.classList.add('urgent');
    } else {
      this.shotClock.classList.remove('urgent');
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  POWER METER  (called every frame while charging)
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Show and update the power meter.
   *
   * This is called every frame from Game._update() while
   * input.shotCharging === true, so the bar responds in real-time
   * to both Space Bar hold duration and mouse drag distance.
   *
   * @param {number} power - 0–1 current shot power
   */
  showPowerMeter(power) {
    if (!this.powerContainer) return;

    // Make visible on first call
    if (!this._powerVisible) {
      this.powerContainer.classList.add('visible');
      this._powerVisible = true;
    }

    // Skip DOM write if power hasn't changed by more than 0.5%
    const pct = Math.round(power * 100);
    if (pct === this._lastPower) return;
    this._lastPower = pct;

    if (this.powerBar) {
      this.powerBar.style.width = `${pct}%`;

      // Colour zones:
      //   0–39%  → blue   (weak / short)
      //   40–59% → green  (moderate)
      //   60–79% → gold   (good)
      //   80–100%→ red    (strong / long)
      if (pct < 40) {
        this.powerBar.style.background = 'linear-gradient(90deg, #0055FF, #0088FF)';
      } else if (pct < 60) {
        this.powerBar.style.background = 'linear-gradient(90deg, #00BB55, #00FF88)';
      } else if (pct < 80) {
        this.powerBar.style.background = 'linear-gradient(90deg, #CC9900, #FFD700)';
      } else {
        this.powerBar.style.background = 'linear-gradient(90deg, #CC0033, #FF3366)';
      }
    }

    if (this.powerValue) {
      this.powerValue.textContent = `${pct}%`;
    }

    // Crosshair charging animation
    const crosshair = document.getElementById('crosshair');
    if (crosshair) {
      crosshair.classList.add('charging');
      // Scale crosshair with power
      const scale = 1.0 + power * 0.5;
      crosshair.style.transform = `translate(-50%, -50%) scale(${scale})`;
    }
  }

  hidePowerMeter() {
    if (this.powerContainer) {
      this.powerContainer.classList.remove('visible');
      this._powerVisible = false;
      this._lastPower    = -1;
    }

    const crosshair = document.getElementById('crosshair');
    if (crosshair) {
      crosshair.classList.remove('charging');
      crosshair.style.transform = 'translate(-50%, -50%) scale(1)';
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  STATISTICS
  // ═══════════════════════════════════════════════════════════════════════

  updateStats(shots, made) {
    if (this.statShots) this.statShots.textContent = shots;
    if (this.statMade)  this.statMade.textContent  = made;
    if (this.statPct) {
      const pct = shots > 0 ? Math.round((made / shots) * 100) : 0;
      this.statPct.textContent = `${pct}%`;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  VISIBILITY
  // ═══════════════════════════════════════════════════════════════════════

  show() {
    document.getElementById('game-hud')?.classList.remove('hidden');
  }

  hide() {
    document.getElementById('game-hud')?.classList.add('hidden');
    this.hidePowerMeter();
  }
}
