// ============================================================
// SFX — procedurally generated audio via WebAudio.
// Zero asset files = zero downloads = instant load on any connection.
// (Drop real .mp3 files in /assets and swap these out anytime.)
// ============================================================
export const Sfx = {
  ctx: null,
  muted: false,

  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      // Browsers require a user gesture before audio — resume on first interaction
      const resume = () => { this.ctx.resume(); window.removeEventListener('pointerdown', resume); };
      window.addEventListener('pointerdown', resume);
    } catch {
      this.ctx = null;   // audio unsupported — game continues silently
    }
  },

  toggleMute() { this.muted = !this.muted; return this.muted; },

  /** Play a named effect. All synthesized: whooshes, blips, rumbles. */
  play(name) {
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    switch (name) {
      case 'bloom':   this._sweep(120, 600, 0.5, 'sawtooth', 0.25); break;  // rising whoosh
      case 'pickup':  this._blip(880, 0.08, 0.15); break;
      case 'crystal': this._blip(660, 0.1, 0.2); this._blip(990, 0.1, 0.2, 0.08); break;
      case 'hit':     this._sweep(300, 80, 0.25, 'square', 0.2); break;
      case 'death':   this._sweep(440, 40, 0.8, 'sawtooth', 0.3); break;
      default: break;
    }
  },

  _blip(freq, dur, vol, delay = 0) {
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + dur);
  },

  _sweep(from, to, dur, type, vol) {
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(to, 1), t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + dur);
  },
};
