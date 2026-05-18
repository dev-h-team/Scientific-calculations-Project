/**
 * AudioManager - Web Audio API Sound System
 * 
 * Generates all game sounds procedurally using Web Audio API.
 * No external audio files required.
 * 
 * Sounds:
 * - Ball bounce (varies by speed)
 * - Swish (net sound)
 * - Rim hit (metallic clang)
 * - Backboard hit
 * - Crowd cheer
 * - Buzzer
 * - Shot charge
 * - UI clicks
 */

class AudioManager {
  constructor() {
    this._context = null;
    this._masterGain = null;
    this._enabled = true;
    this._volume = 0.7;
    
    this._init();
  }

  _init() {
    try {
      this._context = new (window.AudioContext || window.webkitAudioContext)();
      this._masterGain = this._context.createGain();
      this._masterGain.gain.value = this._volume;
      this._masterGain.connect(this._context.destination);
    } catch (e) {
      console.warn('AudioManager: Web Audio API not available');
      this._enabled = false;
    }
  }

  _resume() {
    if (this._context && this._context.state === 'suspended') {
      this._context.resume();
    }
  }

  /**
   * Play ball bounce sound
   * Pitch varies with impact speed
   */
  playBounce(speed = 1.0) {
    if (!this._enabled) return;
    this._resume();
    
    const ctx = this._context;
    const now = ctx.currentTime;
    
    // Oscillator for thud
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    
    filter.type = 'lowpass';
    filter.frequency.value = 200 + speed * 100;
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(80 + speed * 20, now);
    osc.frequency.exponentialRampToValueAtTime(30, now + 0.15);
    
    gain.gain.setValueAtTime(0.4 * Math.min(speed / 5, 1), now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this._masterGain);
    
    osc.start(now);
    osc.stop(now + 0.2);
    
    // Add noise component
    this._playNoise(0.1 * Math.min(speed / 8, 1), 0.1, 300);
  }

  /**
   * Play swish sound (ball through net)
   */
  playSwish() {
    if (!this._enabled) return;
    this._resume();
    
    const ctx = this._context;
    const now = ctx.currentTime;
    
    // Whoosh sound
    this._playNoise(0.15, 0.4, 2000, 'bandpass');
    
    // Net rustle - multiple filtered noise bursts
    for (let i = 0; i < 3; i++) {
      setTimeout(() => {
        this._playNoise(0.08, 0.15, 1500 + i * 200, 'bandpass');
      }, i * 60);
    }
  }

  /**
   * Play rim hit sound (metallic clang)
   */
  playRimHit(intensity = 1.0) {
    if (!this._enabled) return;
    this._resume();
    
    const ctx = this._context;
    const now = ctx.currentTime;
    
    // Metallic clang
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc1.type = 'square';
    osc1.frequency.setValueAtTime(800, now);
    osc1.frequency.exponentialRampToValueAtTime(200, now + 0.3);
    
    osc2.type = 'sawtooth';
    osc2.frequency.setValueAtTime(1200, now);
    osc2.frequency.exponentialRampToValueAtTime(400, now + 0.2);
    
    gain.gain.setValueAtTime(0.3 * intensity, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    
    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this._masterGain);
    
    osc1.start(now);
    osc1.stop(now + 0.4);
    osc2.start(now);
    osc2.stop(now + 0.3);
  }

  /**
   * Play backboard hit sound
   */
  playBackboardHit() {
    if (!this._enabled) return;
    this._resume();
    
    const ctx = this._context;
    const now = ctx.currentTime;
    
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    
    filter.type = 'bandpass';
    filter.frequency.value = 400;
    filter.Q.value = 2;
    
    osc.type = 'square';
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.exponentialRampToValueAtTime(100, now + 0.25);
    
    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this._masterGain);
    
    osc.start(now);
    osc.stop(now + 0.3);
  }

  /**
   * Play crowd cheer (for scoring)
   */
  playCrowdCheer(intensity = 1.0) {
    if (!this._enabled) return;
    this._resume();
    
    // Layered noise for crowd sound
    for (let i = 0; i < 3; i++) {
      setTimeout(() => {
        this._playNoise(0.12 * intensity, 0.8, 800 + i * 200, 'bandpass');
      }, i * 100);
    }
    
    // Cheer rise
    const ctx = this._context;
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.15 * intensity, now + 0.3);
    gain.gain.linearRampToValueAtTime(0, now + 1.5);
    
    const noise = this._createNoiseSource();
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1000;
    filter.Q.value = 0.5;
    
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this._masterGain);
    
    noise.start(now);
    noise.stop(now + 1.5);
  }

  /**
   * Play buzzer sound (end of period)
   */
  playBuzzer() {
    if (!this._enabled) return;
    this._resume();
    
    const ctx = this._context;
    const now = ctx.currentTime;
    
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'square';
    osc.frequency.value = 440;
    
    gain.gain.setValueAtTime(0.5, now);
    gain.gain.setValueAtTime(0.5, now + 0.8);
    gain.gain.linearRampToValueAtTime(0, now + 1.0);
    
    osc.connect(gain);
    gain.connect(this._masterGain);
    
    osc.start(now);
    osc.stop(now + 1.0);
  }

  /**
   * Play shot charge sound (rising tone while charging)
   */
  playShotCharge(power) {
    if (!this._enabled) return;
    this._resume();
    
    const ctx = this._context;
    const now = ctx.currentTime;
    
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.value = 200 + power * 400;
    
    gain.gain.setValueAtTime(0.05, now);
    gain.gain.linearRampToValueAtTime(0, now + 0.05);
    
    osc.connect(gain);
    gain.connect(this._masterGain);
    
    osc.start(now);
    osc.stop(now + 0.05);
  }

  /**
   * Play UI click
   */
  playClick() {
    if (!this._enabled) return;
    this._resume();
    
    const ctx = this._context;
    const now = ctx.currentTime;
    
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.value = 800;
    
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    
    osc.connect(gain);
    gain.connect(this._masterGain);
    
    osc.start(now);
    osc.stop(now + 0.05);
  }

  /**
   * Play score notification sound
   */
  playScore(points = 2) {
    if (!this._enabled) return;
    this._resume();
    
    const ctx = this._context;
    const now = ctx.currentTime;
    
    const notes = points === 3 
      ? [523, 659, 784, 1047]  // C5, E5, G5, C6 - triumphant
      : [523, 659, 784];        // C5, E5, G5
    
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t = now + i * 0.12;
      
      osc.type = 'sine';
      osc.frequency.value = freq;
      
      gain.gain.setValueAtTime(0.25, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      
      osc.connect(gain);
      gain.connect(this._masterGain);
      
      osc.start(t);
      osc.stop(t + 0.2);
    });
  }

  // ---- Helpers ----

  _playNoise(volume, duration, frequency, filterType = 'lowpass') {
    const ctx = this._context;
    const now = ctx.currentTime;
    
    const noise = this._createNoiseSource();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    
    filter.type = filterType;
    filter.frequency.value = frequency;
    
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this._masterGain);
    
    noise.start(now);
    noise.stop(now + duration);
  }

  _createNoiseSource() {
    const ctx = this._context;
    const bufferSize = ctx.sampleRate * 0.5;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    return source;
  }

  setVolume(vol) {
    this._volume = MathUtils.clamp(vol, 0, 1);
    if (this._masterGain) {
      this._masterGain.gain.value = this._volume;
    }
  }

  setEnabled(enabled) {
    this._enabled = enabled;
    if (!enabled && this._masterGain) {
      this._masterGain.gain.value = 0;
    } else if (enabled && this._masterGain) {
      this._masterGain.gain.value = this._volume;
    }
  }
}
