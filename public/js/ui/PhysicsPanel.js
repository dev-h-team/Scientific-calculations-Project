/**
 * PhysicsPanel - Professional Physics Control Panel
 *
 * A collapsible side panel that exposes all physics parameters to the user
 * in real-time. Changes take effect immediately on the PhysicsEngine.
 *
 * Sections:
 *   • Environment   — gravity, time scale
 *   • Ball          — mass, radius
 *   • Aerodynamics  — air density, drag coefficient, Magnus effect
 *   • Surfaces      — restitution + friction for floor/rim/backboard
 *   • Shot Control  — launch speed (m/s), elevation angle, free-shot button
 *   • Live Readout  — ball speed (m/s), bounce count, height
 */

class PhysicsPanel {
  constructor(physicsEngine, ballPhysics, game) {
    this.physics   = physicsEngine;
    this.ballPhys  = ballPhysics;
    this.game      = game;

    // ── Default values for everything ──────────────────────────────────────
    this.defaults = {
      GRAVITY:               9.81,
      TIME_SCALE:            1.0,
      AIR_DENSITY:           1.225,
      DRAG_COEFFICIENT:      0.47,
      BALL_MASS:             0.623,
      RESTITUTION_FLOOR:     0.72,
      RESTITUTION_RIM:       0.55,
      RESTITUTION_BACKBOARD: 0.65,
      FRICTION_FLOOR:        0.6,
      FRICTION_RIM:          0.3,
      MAGNUS_SCALE:          1.0,
      shotSpeed:             10.0,
      shotAngle:             48,
      spinX:                 -8,
      spinY:                 0
    };

    // ── Current shot control values ────────────────────────────────────────────
    this.shotSpeed    = this.defaults.shotSpeed;
    this.shotAngle    = this.defaults.shotAngle;
    this.spinX        = this.defaults.spinX;
    this.spinY        = this.defaults.spinY;
    this._visible     = true;
    this._updateTimer = 0;

    this._build();
    this._attachListeners();
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  BUILD UI
  // ═══════════════════════════════════════════════════════════════════════

  _build() {
    // ── Outer panel ───────────────────────────────────────────────────────
    this.panel = document.createElement('div');
    this.panel.id = 'physics-panel';
    document.body.appendChild(this.panel);

    // ── Toggle button ─────────────────────────────────────────────────────
    this.toggleBtn = document.createElement('button');
    this.toggleBtn.id = 'physics-toggle';
    this.toggleBtn.innerHTML = '⚙ Physics';
    this.toggleBtn.title = 'Toggle Physics Control Panel';
    document.body.appendChild(this.toggleBtn);

    // ── Panel content ─────────────────────────────────────────────────────
    this.panel.innerHTML = `
      <div class="pp-header">
        <span class="pp-title">⚗ Physics Engine</span>
        <span class="pp-subtitle">Real-time Control</span>
      </div>
      
      <div id="pp-warning-box" class="pp-warning-box"></div>

      <!-- ENVIRONMENT -->
      <div class="pp-section">
        <div class="pp-section-title">🌍 Environment</div>

        <div class="pp-row">
          <label>Gravity <span class="pp-unit">m/s²</span></label>
          <div class="pp-control">
            <input type="range" id="pp-gravity" min="-50" max="50" step="0.1" value="9.81">
            <input type="number" id="pp-gravity-n" min="-50" max="50" step="0.1" value="9.81" class="pp-num">
          </div>
        </div>

        <div class="pp-row">
          <label>Time Scale <span class="pp-unit">×</span></label>
          <div class="pp-control">
            <input type="range" id="pp-timescale" min="-5.0" max="10.0" step="0.05" value="1.0">
            <input type="number" id="pp-timescale-n" min="-5.0" max="10.0" step="0.05" value="1.0" class="pp-num">
          </div>
        </div>
      </div>

      <!-- AERODYNAMICS -->
      <div class="pp-section">
        <div class="pp-section-title">💨 Aerodynamics</div>

        <div class="pp-row">
          <label>Air Density <span class="pp-unit">kg/m³</span></label>
          <div class="pp-control">
            <input type="range" id="pp-airdensity" min="-10" max="10" step="0.025" value="1.225">
            <input type="number" id="pp-airdensity-n" min="-10" max="10" step="0.025" value="1.225" class="pp-num">
          </div>
        </div>

        <div class="pp-row">
          <label>Drag Coeff <span class="pp-unit">Cd</span></label>
          <div class="pp-control">
            <input type="range" id="pp-drag" min="-5" max="10" step="0.01" value="0.47">
            <input type="number" id="pp-drag-n" min="-5" max="10" step="0.01" value="0.47" class="pp-num">
          </div>
        </div>

        <div class="pp-row">
          <label>Magnus Effect <span class="pp-unit">×</span></label>
          <div class="pp-control">
            <input type="range" id="pp-magnus" min="-10" max="10" step="0.1" value="1.0">
            <input type="number" id="pp-magnus-n" min="-10" max="10" step="0.1" value="1.0" class="pp-num">
          </div>
        </div>
      </div>

      <!-- BALL -->
      <div class="pp-section">
        <div class="pp-section-title">🏀 Ball Properties</div>

        <div class="pp-row">
          <label>Ball Mass <span class="pp-unit">kg</span></label>
          <div class="pp-control">
            <input type="range" id="pp-mass" min="-10" max="50" step="0.05" value="0.623">
            <input type="number" id="pp-mass-n" min="-10" max="50" step="0.05" value="0.623" class="pp-num">
          </div>
        </div>
      </div>

      <!-- SURFACES -->
      <div class="pp-section">
        <div class="pp-section-title">🏟 Surface Coefficients</div>

        <div class="pp-subsection-label">Restitution (Bounciness)</div>

        <div class="pp-row">
          <label>Floor <span class="pp-unit">e</span></label>
          <div class="pp-control">
            <input type="range" id="pp-rest-floor" min="-5" max="5" step="0.01" value="0.72">
            <input type="number" id="pp-rest-floor-n" min="-5" max="5" step="0.01" value="0.72" class="pp-num">
          </div>
        </div>

        <div class="pp-row">
          <label>Rim <span class="pp-unit">e</span></label>
          <div class="pp-control">
            <input type="range" id="pp-rest-rim" min="-5" max="5" step="0.01" value="0.55">
            <input type="number" id="pp-rest-rim-n" min="-5" max="5" step="0.01" value="0.55" class="pp-num">
          </div>
        </div>

        <div class="pp-row">
          <label>Backboard <span class="pp-unit">e</span></label>
          <div class="pp-control">
            <input type="range" id="pp-rest-bb" min="-5" max="5" step="0.01" value="0.65">
            <input type="number" id="pp-rest-bb-n" min="-5" max="5" step="0.01" value="0.65" class="pp-num">
          </div>
        </div>

        <div class="pp-subsection-label">Friction</div>

        <div class="pp-row">
          <label>Floor <span class="pp-unit">μ</span></label>
          <div class="pp-control">
            <input type="range" id="pp-fric-floor" min="-5" max="5" step="0.01" value="0.6">
            <input type="number" id="pp-fric-floor-n" min="-5" max="5" step="0.01" value="0.6" class="pp-num">
          </div>
        </div>

        <div class="pp-row">
          <label>Rim <span class="pp-unit">μ</span></label>
          <div class="pp-control">
            <input type="range" id="pp-fric-rim" min="-5" max="5" step="0.01" value="0.3">
            <input type="number" id="pp-fric-rim-n" min="-5" max="5" step="0.01" value="0.3" class="pp-num">
          </div>
        </div>
      </div>

      <!-- SHOT CONTROL -->
      <div class="pp-section">
        <div class="pp-section-title">🎯 Shot Control</div>

        <div class="pp-row">
          <label>Launch Speed <span class="pp-unit">m/s</span></label>
          <div class="pp-control">
            <input type="range" id="pp-shotspeed" min="-50" max="100" step="0.5" value="10">
            <input type="number" id="pp-shotspeed-n" min="-50" max="100" step="0.5" value="10" class="pp-num">
          </div>
        </div>

        <div class="pp-row">
          <label>Angle <span class="pp-unit">°</span></label>
          <div class="pp-control">
            <input type="range" id="pp-angle" min="-180" max="180" step="1" value="48">
            <input type="number" id="pp-angle-n" min="-180" max="180" step="1" value="48" class="pp-num">
          </div>
        </div>

        <div class="pp-fire-row">
          <button id="pp-fire" class="pp-fire-btn">⚡ FIRE SHOT</button>
          <button id="pp-reset-ball" class="pp-reset-btn">↺ Reset Ball (R)</button>
        </div>
      </div>

      <!-- SPIN CONTROL -->
      <div class="pp-section">
        <div class="pp-section-title">🌀 Spin Control</div>
        <div class="pp-spin-viz" id="pp-spin-viz" title="Spin direction visualizer">
          <div class="pp-spin-ball" id="pp-spin-ball">
            <div class="pp-spin-arrow" id="pp-spin-arrow">↑</div>
          </div>
          <div class="pp-spin-label" id="pp-spin-label">No Spin</div>
        </div>

        <div class="pp-row">
          <label>Backspin <span class="pp-unit">+</span> / Topspin <span class="pp-unit">−</span></label>
        </div>
        <div class="pp-row">
          <div class="pp-control" style="flex:1">
            <span class="pp-spin-tag">TOP</span>
            <input type="range" id="pp-spin-x" min="-100" max="100" step="0.5" value="-8">
            <span class="pp-spin-tag">BACK</span>
            <input type="number" id="pp-spin-x-n" min="-100" max="100" step="0.5" value="-8" class="pp-num">
          </div>
        </div>

        <div class="pp-row" style="margin-top:4px">
          <label>Sidespin <span class="pp-unit">L/R</span></label>
        </div>
        <div class="pp-row">
          <div class="pp-control" style="flex:1">
            <span class="pp-spin-tag">L</span>
            <input type="range" id="pp-spin-y" min="-100" max="100" step="0.5" value="0">
            <span class="pp-spin-tag">R</span>
            <input type="number" id="pp-spin-y-n" min="-100" max="100" step="0.5" value="0" class="pp-num">
          </div>
        </div>

        <div class="pp-spin-presets">
          <button class="pp-preset-btn" data-sx="-10" data-sy="0"  title="Standard backspin">↩ Back</button>
          <button class="pp-preset-btn" data-sx="10"  data-sy="0"  title="Topspin (hook)">↪ Top</button>
          <button class="pp-preset-btn" data-sx="0"   data-sy="-12" title="Left sidespin">← Left</button>
          <button class="pp-preset-btn" data-sx="0"   data-sy="12"  title="Right sidespin">→ Right</button>
          <button class="pp-preset-btn" data-sx="0"   data-sy="0"  title="No spin">⊘ None</button>
        </div>
      </div>

      <!-- LIVE READOUT -->
      <div class="pp-section pp-readout">
        <div class="pp-section-title">📊 Live Telemetry</div>
        <div class="pp-telemetry-grid">
          <div class="pp-tel-item">
            <span class="pp-tel-label">Speed</span>
            <span class="pp-tel-value" id="pp-tel-speed">0.00 m/s</span>
          </div>
          <div class="pp-tel-item">
            <span class="pp-tel-label">Height</span>
            <span class="pp-tel-value" id="pp-tel-height">0.00 m</span>
          </div>
          <div class="pp-tel-item">
            <span class="pp-tel-label">Bounces</span>
            <span class="pp-tel-value" id="pp-tel-bounces">0</span>
          </div>
          <div class="pp-tel-item">
            <span class="pp-tel-label">Vx</span>
            <span class="pp-tel-value" id="pp-tel-vx">0.00</span>
          </div>
          <div class="pp-tel-item">
            <span class="pp-tel-label">Vy</span>
            <span class="pp-tel-value" id="pp-tel-vy">0.00</span>
          </div>
          <div class="pp-tel-item">
            <span class="pp-tel-label">Vz</span>
            <span class="pp-tel-value" id="pp-tel-vz">0.00</span>
          </div>
        </div>

        <div class="pp-collision-log" id="pp-collision-log">
          <div class="pp-col-header">Collision Log</div>
          <div id="pp-col-entries"></div>
        </div>
      </div>

      <!-- RESET DEFAULTS -->
      <div class="pp-section pp-footer">
        <button id="pp-defaults" class="pp-defaults-btn">↺ Reset Defaults</button>
      </div>
    `;
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  LISTENERS
  // ═══════════════════════════════════════════════════════════════════════

  _attachListeners() {
    // Toggle panel visibility
    this.toggleBtn.addEventListener('click', () => this._toggle());

    // Helper: build individual reset button
    const buildResetBtn = (numEl, defaultVal, applyFn) => {
      const btn = document.createElement('button');
      btn.className = 'pp-reset-single';
      btn.innerHTML = '↺';
      btn.title = 'Reset this value';
      btn.style.display = 'none';
      btn.onclick = () => applyFn(defaultVal);
      numEl.parentNode.appendChild(btn);
      return btn;
    };

    // Helper: bind a slider + number pair to a physics param
    const bind = (sliderId, numberId, paramName, convert) => {
      const slider = document.getElementById(sliderId);
      const num    = document.getElementById(numberId);
      if (!slider || !num) return;

      const apply = (val) => {
        const v = parseFloat(val);
        if (isNaN(v)) return;
        slider.value = v;
        num.value    = v;
        const converted = convert ? convert(v) : v;
        this.physics.setParam(paramName, converted);
        this._validateValues();
      };
      
      buildResetBtn(num, this.defaults[paramName], apply);

      slider.addEventListener('input',  () => apply(slider.value));
      num.addEventListener('change',    () => apply(num.value));
      num.addEventListener('input',     () => apply(num.value));
    };

    // ── Environment ───────────────────────────────────────────────────────
    bind('pp-gravity',   'pp-gravity-n',   'GRAVITY',          null);
    bind('pp-timescale', 'pp-timescale-n', 'TIME_SCALE',       null);

    // ── Aerodynamics ──────────────────────────────────────────────────────
    bind('pp-airdensity', 'pp-airdensity-n', 'AIR_DENSITY',      null);
    bind('pp-drag',       'pp-drag-n',       'DRAG_COEFFICIENT',  null);
    bind('pp-magnus',     'pp-magnus-n',     'MAGNUS_SCALE',      null);

    // ── Ball ──────────────────────────────────────────────────────────────
    bind('pp-mass', 'pp-mass-n', 'BALL_MASS', null);

    // ── Surfaces ─────────────────────────────────────────────────────────
    bind('pp-rest-floor', 'pp-rest-floor-n', 'RESTITUTION_FLOOR',     null);
    bind('pp-rest-rim',   'pp-rest-rim-n',   'RESTITUTION_RIM',       null);
    bind('pp-rest-bb',    'pp-rest-bb-n',    'RESTITUTION_BACKBOARD', null);
    bind('pp-fric-floor', 'pp-fric-floor-n', 'FRICTION_FLOOR',        null);
    bind('pp-fric-rim',   'pp-fric-rim-n',   'FRICTION_RIM',          null);

    // ── Shot control ─────────────────────────────────────────────────────
    const bindShot = (sliderId, numberId, prop) => {
      const slider = document.getElementById(sliderId);
      const num    = document.getElementById(numberId);
      if (!slider || !num) return;
      const apply = (val) => {
        const v = parseFloat(val);
        if (!isNaN(v)) { slider.value = v; num.value = v; this[prop] = v; this._validateValues(); }
      };
      buildResetBtn(num, this.defaults[prop], apply);
      slider.addEventListener('input',  () => apply(slider.value));
      num.addEventListener('change',    () => apply(num.value));
      num.addEventListener('input',     () => apply(num.value));
    };

    bindShot('pp-shotspeed', 'pp-shotspeed-n', 'shotSpeed');
    bindShot('pp-angle',     'pp-angle-n',     'shotAngle');

    // ── Spin control ──────────────────────────────────────────────────────
    const bindSpin = (sliderId, numberId, prop) => {
      const slider = document.getElementById(sliderId);
      const num    = document.getElementById(numberId);
      if (!slider || !num) return;
      const apply = (val) => {
        const v = parseFloat(val);
        if (!isNaN(v)) { slider.value = v; num.value = v; this[prop] = v; this._updateSpinViz(); this._validateValues(); }
      };
      buildResetBtn(num, this.defaults[prop], apply);
      slider.addEventListener('input',  () => apply(slider.value));
      num.addEventListener('change',    () => apply(num.value));
      num.addEventListener('input',     () => apply(num.value));
    };
    bindSpin('pp-spin-x', 'pp-spin-x-n', 'spinX');
    bindSpin('pp-spin-y', 'pp-spin-y-n', 'spinY');

    document.querySelectorAll('.pp-preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const sx = parseFloat(btn.dataset.sx ?? 0);
        const sy = parseFloat(btn.dataset.sy ?? 0);
        this.spinX = sx; this.spinY = sy;
        const upd = (sid, nid, v) => { const s=document.getElementById(sid); if(s)s.value=v; const n=document.getElementById(nid); if(n)n.value=v; };
        upd('pp-spin-x','pp-spin-x-n',sx);
        upd('pp-spin-y','pp-spin-y-n',sy);
        this._updateSpinViz();
      });
    });
    this._updateSpinViz();

    // ── Fire button ───────────────────────────────────────────────────────
    document.getElementById('pp-fire')?.addEventListener('click', () => {
      this.game._fireFreeSshot(this.shotSpeed, this.shotAngle, this.spinX, this.spinY);
    });

    // ── Reset ball button ─────────────────────────────────────────────────
    document.getElementById('pp-reset-ball')?.addEventListener('click', () => {
      this.game._resetBallToPlayer();
    });

    // ── Reset defaults ────────────────────────────────────────────────────
    document.getElementById('pp-defaults')?.addEventListener('click', () => {
      this._resetDefaults();
    });

    // Run initial validation to color any default overrides
    this._validateValues();
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  VALIDATION & WARNINGS
  // ═══════════════════════════════════════════════════════════════════════

  _validateValues() {
    const sliderMap = {
      GRAVITY:               ['pp-gravity',    'pp-gravity-n'],
      TIME_SCALE:            ['pp-timescale',  'pp-timescale-n'],
      AIR_DENSITY:           ['pp-airdensity', 'pp-airdensity-n'],
      DRAG_COEFFICIENT:      ['pp-drag',       'pp-drag-n'],
      BALL_MASS:             ['pp-mass',       'pp-mass-n'],
      RESTITUTION_FLOOR:     ['pp-rest-floor', 'pp-rest-floor-n'],
      RESTITUTION_RIM:       ['pp-rest-rim',   'pp-rest-rim-n'],
      RESTITUTION_BACKBOARD: ['pp-rest-bb',    'pp-rest-bb-n'],
      FRICTION_FLOOR:        ['pp-fric-floor', 'pp-fric-floor-n'],
      FRICTION_RIM:          ['pp-fric-rim',   'pp-fric-rim-n'],
      MAGNUS_SCALE:          ['pp-magnus',     'pp-magnus-n'],
      shotSpeed:             ['pp-shotspeed',  'pp-shotspeed-n'],
      shotAngle:             ['pp-angle',      'pp-angle-n'],
      spinX:                 ['pp-spin-x',     'pp-spin-x-n'],
      spinY:                 ['pp-spin-y',     'pp-spin-y-n'],
    };

    let warnings = [];
    
    for (const [param, defVal] of Object.entries(this.defaults)) {
      const isPhysics = this.physics[param] !== undefined;
      const currentVal = isPhysics ? this.physics[param] : this[param];
      
      const ids = sliderMap[param];
      if (!ids) continue;
      
      const sl = document.getElementById(ids[0]);
      const nm = document.getElementById(ids[1]);
      if (!sl || !nm) continue;
      
      const resetBtn = sl.parentNode.querySelector('.pp-reset-single');

      // Reset classes
      sl.classList.remove('pp-modified', 'pp-scifi');
      nm.classList.remove('pp-modified', 'pp-scifi');
      
      let isSciFi = false;
      
      // Define sci-fi conditions
      if (param === 'TIME_SCALE' && currentVal < 0) { isSciFi = true; warnings.push("⚠️ Negative Time: Physics will rewind."); }
      else if (param === 'TIME_SCALE' && currentVal > 5) { isSciFi = true; warnings.push("⚠️ High Time Scale: Simulation may jitter."); }
      if (param === 'DRAG_COEFFICIENT' && currentVal < 0) { isSciFi = true; warnings.push("⚠️ Negative Drag: Ball will accelerate infinitely."); }
      if (param === 'AIR_DENSITY' && currentVal < 0) { isSciFi = true; warnings.push("⚠️ Negative Air Density: Creates vacuum thrust."); }
      if (param === 'BALL_MASS' && currentVal <= 0) { isSciFi = true; warnings.push("⚠️ Zero/Negative Mass: Generates infinite acceleration."); }
      if (param.startsWith('RESTITUTION') && currentVal < 0) { isSciFi = true; warnings.push("⚠️ Negative Restitution: Ball will stick and slide."); }
      else if (param.startsWith('RESTITUTION') && currentVal > 1) { isSciFi = true; warnings.push("⚠️ High Restitution: Ball generates energy on bounce."); }
      if (param.startsWith('FRICTION') && currentVal < 0) { isSciFi = true; warnings.push("⚠️ Negative Friction: Generates horizontal speed on contact."); }
      if (param === 'GRAVITY' && currentVal < 0) { isSciFi = true; warnings.push("⚠️ Negative Gravity: Objects will fall upwards."); }

      let isModified = Math.abs(currentVal - defVal) > 0.001;

      if (isSciFi) {
        sl.classList.add('pp-scifi');
        nm.classList.add('pp-scifi');
      } else if (isModified) {
        sl.classList.add('pp-modified');
        nm.classList.add('pp-modified');
      }
      
      if (resetBtn) {
        resetBtn.style.display = isModified ? 'inline-block' : 'none';
      }
    }
    
    const wBox = document.getElementById('pp-warning-box');
    if (wBox) {
      if (warnings.length > 0) {
        wBox.innerHTML = warnings.join('<br/>');
        wBox.classList.add('active');
      } else {
        wBox.classList.remove('active');
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  TOGGLE
  // ═══════════════════════════════════════════════════════════════════════

  _toggle() {
    this._visible = !this._visible;
    this.panel.classList.toggle('pp-hidden', !this._visible);
    this.toggleBtn.classList.toggle('pp-active', this._visible);
    this.toggleBtn.innerHTML = this._visible ? '✕ Physics' : '⚙ Physics';
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  SPIN VISUALIZER
  // ═══════════════════════════════════════════════════════════════════════

  _updateSpinViz() {
    const sx = this.spinX;   // backspin(−)/topspin(+) axis
    const sy = this.spinY;   // sidespin L(−)/R(+) axis
    const total = Math.sqrt(sx * sx + sy * sy);

    const arrow = document.getElementById('pp-spin-arrow');
    const label = document.getElementById('pp-spin-label');
    const ball  = document.getElementById('pp-spin-ball');

    if (!arrow || !label) return;

    if (total < 0.5) {
      arrow.textContent = '⊙';
      if (label) label.textContent = 'No Spin';
      if (ball)  ball.style.boxShadow = 'none';
      return;
    }

    // Angle: sx drives vertical (up/down), sy drives horizontal (left/right)
    // Arrow rotation in CSS degrees:
    //   backspin (sx<0) → arrow points up (0°)
    //   topspin  (sx>0) → arrow points down (180°)
    //   sidespin (sy>0) → arrow points right (90°)
    const angleDeg = Math.atan2(sy, -sx) * (180 / Math.PI);
    arrow.style.display    = 'inline-block';
    arrow.style.transform  = `rotate(${angleDeg}deg)`;
    arrow.textContent      = '↑';

    // Color: warm=backspin, cool=topspin, purple=sidespin
    let color, labelText;
    const absX = Math.abs(sx), absY = Math.abs(sy);
    if (absY > absX * 1.5) {
      color = sy > 0 ? '#AA88FF' : '#88AAFF';
      labelText = sy > 0 ? `Right Spin  ${sy.toFixed(1)} r/s` : `Left Spin  ${Math.abs(sy).toFixed(1)} r/s`;
    } else if (sx < 0) {
      color = '#FF8844';
      labelText = `Backspin  ${Math.abs(sx).toFixed(1)} r/s`;
    } else {
      color = '#44DDAA';
      labelText = `Topspin  ${sx.toFixed(1)} r/s`;
    }

    if (label) label.textContent = labelText;
    if (ball)  ball.style.boxShadow = `0 0 10px ${color}88, inset 0 0 8px ${color}44`;
    arrow.style.color = color;
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  RESET DEFAULTS
  // ═══════════════════════════════════════════════════════════════════════

  _resetDefaults() {
    const sliderMap = {
      GRAVITY:               ['pp-gravity',    'pp-gravity-n'],
      TIME_SCALE:            ['pp-timescale',  'pp-timescale-n'],
      AIR_DENSITY:           ['pp-airdensity', 'pp-airdensity-n'],
      DRAG_COEFFICIENT:      ['pp-drag',       'pp-drag-n'],
      BALL_MASS:             ['pp-mass',       'pp-mass-n'],
      RESTITUTION_FLOOR:     ['pp-rest-floor', 'pp-rest-floor-n'],
      RESTITUTION_RIM:       ['pp-rest-rim',   'pp-rest-rim-n'],
      RESTITUTION_BACKBOARD: ['pp-rest-bb',    'pp-rest-bb-n'],
      FRICTION_FLOOR:        ['pp-fric-floor', 'pp-fric-floor-n'],
      FRICTION_RIM:          ['pp-fric-rim',   'pp-fric-rim-n'],
      MAGNUS_SCALE:          ['pp-magnus',     'pp-magnus-n'],
    };

    for (const [param, ids] of Object.entries(sliderMap)) {
      const val = this.defaults[param];
      this.physics.setParam(param, val);
      const sl = document.getElementById(ids[0]);
      const nm = document.getElementById(ids[1]);
      if (sl) sl.value = val;
      if (nm) nm.value = val;
    }

    this.shotSpeed = this.defaults.shotSpeed;
    this.shotAngle = this.defaults.shotAngle;
    this.spinX     = this.defaults.spinX;
    this.spinY     = this.defaults.spinY;
    const ss = document.getElementById('pp-shotspeed');
    const sn = document.getElementById('pp-shotspeed-n');
    const as = document.getElementById('pp-angle');
    const an = document.getElementById('pp-angle-n');
    if (ss) ss.value = 10; if (sn) sn.value = 10;
    if (as) as.value = 48; if (an) an.value = 48;
    const sxEl = document.getElementById('pp-spin-x');   if (sxEl)  sxEl.value = -8;
    const sxn  = document.getElementById('pp-spin-x-n'); if (sxn)   sxn.value  = -8;
    const syEl = document.getElementById('pp-spin-y');   if (syEl)  syEl.value = 0;
    const syn  = document.getElementById('pp-spin-y-n'); if (syn)   syn.value  = 0;
    this._updateSpinViz();
    this._validateValues();
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  PER-FRAME TELEMETRY UPDATE
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Called from Game._update() every frame.
   * Updates live telemetry display.
   * @param {Object} ballBody  - ball physics body
   * @param {number} bounces   - BallPhysics.bounceCount
   */
  update(dt, ballBody, bounces) {
    if (!this._visible) return;

    this._updateTimer += dt;
    if (this._updateTimer < 0.05) return;  // update at ~20 Hz to avoid flicker
    this._updateTimer = 0;

    const SCALE = this.physics.SCALE;
    const vx = ballBody.velocity.x / SCALE;
    const vy = ballBody.velocity.y / SCALE;
    const vz = ballBody.velocity.z / SCALE;
    const speed  = Math.sqrt(vx * vx + vy * vy + vz * vz);
    const height = Math.max(0, (ballBody.position.y / SCALE));

    const fmt = (n) => n.toFixed(2);

    const set = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
    set('pp-tel-speed',   `${fmt(speed)} m/s`);
    set('pp-tel-height',  `${fmt(height)} m`);
    set('pp-tel-bounces', bounces.toString());
    set('pp-tel-vx',      fmt(vx));
    set('pp-tel-vy',      fmt(vy));
    set('pp-tel-vz',      fmt(vz));
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  COLLISION LOG
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Add a collision event to the on-screen log.
   * @param {'floor'|'rim'|'backboard'} type
   * @param {number} speed - impact speed in m/s
   */
  logCollision(type, speed) {
    const container = document.getElementById('pp-col-entries');
    if (!container) return;

    const icons   = { floor: '🟢', rim: '🔴', backboard: '🔵' };
    const labels  = { floor: 'Floor', rim: 'Rim', backboard: 'Board' };
    const icon    = icons[type]  || '⚪';
    const label   = labels[type] || type;
    const fmt     = speed.toFixed(2);

    const entry = document.createElement('div');
    entry.className = 'pp-col-entry pp-col-new';
    entry.innerHTML = `${icon} <b>${label}</b> — ${fmt} m/s`;
    container.prepend(entry);

    // Keep only the last 6 entries
    while (container.children.length > 6) {
      container.removeChild(container.lastChild);
    }

    // Fade in animation
    requestAnimationFrame(() => entry.classList.remove('pp-col-new'));
  }
}
