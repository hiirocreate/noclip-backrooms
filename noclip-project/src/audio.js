// 音声ファイルを使わず、WebAudioで効果音・環境音を合成する
export class Audio {
  constructor() { this.ctx = null; this.volume = 0.8; }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain(); this.master.gain.value = this.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12; comp.ratio.value = 4;
    this.master.connect(comp); comp.connect(ctx.destination);
    // ホワイトノイズ
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // ブラウンノイズ
    this.brownBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const b = this.brownBuf.getChannelData(0); let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; b[i] = last * 3.5; }
    this.ambient = [];
  }

  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }
  suspend() { this.ctx && this.ctx.suspend(); }
  resume() { this.ctx && this.ctx.resume(); }
  get t() { return this.ctx.currentTime; }

  noise(brown = false) {
    const s = this.ctx.createBufferSource();
    s.buffer = brown ? this.brownBuf : this.noiseBuf; s.loop = true;
    s.loopStart = Math.random(); // 位相をずらす
    return s;
  }
  gain(v = 0) { const g = this.ctx.createGain(); g.gain.value = v; return g; }
  filter(type, f, q = 1) { const b = this.ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; }
  osc(type, f) { const o = this.ctx.createOscillator(); o.type = type; o.frequency.value = f; return o; }
  panner() {
    const p = this.ctx.createPanner();
    p.panningModel = 'HRTF'; p.distanceModel = 'inverse';
    p.refDistance = 1.5; p.maxDistance = 60; p.rolloffFactor = 1.4;
    return p;
  }
  chain(...nodes) { for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]); return nodes[nodes.length - 1]; }

  /* ---------- 環境音 ---------- */
  stopAmbient() {
    for (const n of this.ambient || []) { try { n.stop ? n.stop() : n.disconnect(); } catch (e) { /* noop */ } }
    this.ambient = [];
    this.humGain = null;
  }

  startAmbient(theme) {
    if (!this.ctx) return;
    this.stopAmbient();
    const A = this.ambient;
    const out = this.gain(1); out.connect(this.master); A.push(out);
    // 蛍光灯の唸り(照明の近さで音量変化)
    this.humGain = this.gain(0);
    const humF = this.filter('lowpass', theme === 'pipes' ? 300 : 900, 2);
    this.chain(humF, this.humGain, out);
    for (const [f, type, v] of [[60, 'sawtooth', 0.05], [120, 'square', 0.02], [180.5, 'sawtooth', 0.015]]) {
      const o = this.osc(type, f); const g = this.gain(v); o.connect(g); g.connect(humF); o.start(); A.push(o);
    }
    const buzz = this.noise(); const bf = this.filter('bandpass', 3200, 6); const bg = this.gain(0.012);
    this.chain(buzz, bf, bg, this.humGain); buzz.start(); A.push(buzz);

    // 低いうなり(ドローン)
    const drone = this.noise(true);
    const df = this.filter('lowpass', theme === 'pipes' ? 140 : 90, 1);
    const dg = this.gain(theme === 'pipes' ? 0.5 : theme === 'parking' ? 0.3 : 0.18);
    this.chain(drone, df, dg, out); drone.start(); A.push(drone);
    const lfo = this.osc('sine', 0.07); const lg = this.gain(0.1); lfo.connect(lg); lg.connect(dg.gain); lfo.start(); A.push(lfo);
    if (theme !== 'lobby') {
      const o = this.osc('sine', theme === 'pipes' ? 43 : 37); const g = this.gain(0.06);
      o.connect(g); g.connect(out); o.start(); A.push(o);
    }
  }

  setHum(level) {
    if (!this.humGain) return;
    this.humGain.gain.setTargetAtTime(Math.min(1.4, level), this.t, 0.15);
  }

  /* ---------- 効果音 ---------- */
  env(g, t, a, peak, dec) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
  }
  oneShot(src, dur) { src.start(this.t); src.stop(this.t + dur); }

  footstep(theme, loud = 1) {
    if (!this.ctx) return;
    const t = this.t;
    const n = this.noise();
    const g = this.gain();
    let f;
    if (theme === 'lobby') f = this.filter('lowpass', 420 + Math.random() * 100, 0.7);
    else if (theme === 'parking') f = this.filter('bandpass', 1300 + Math.random() * 400, 0.9);
    else f = this.filter('bandpass', 700 + Math.random() * 200, 3);
    this.chain(n, f, g, this.master);
    this.env(g, t, 0.005, 0.35 * loud, theme === 'lobby' ? 0.12 : 0.09);
    this.oneShot(n, 0.3);
    if (theme === 'pipes') {
      const o = this.osc('triangle', 220 + Math.random() * 60); const og = this.gain();
      this.chain(o, og, this.master); this.env(og, t, 0.002, 0.05 * loud, 0.25); this.oneShot(o, 0.4);
    }
  }

  pickup() {
    if (!this.ctx) return;
    [660, 880, 1320].forEach((f, i) => {
      const o = this.osc('sine', f); const g = this.gain();
      this.chain(o, g, this.master);
      const t = this.t + i * 0.09;
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.12, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
      o.start(t); o.stop(t + 0.7);
    });
  }

  keyPickup() {
    if (!this.ctx) return;
    // 不協和な和音
    [220, 233, 330, 466].forEach((f, i) => {
      const o = this.osc('sawtooth', f); const fl = this.filter('lowpass', 1200); const g = this.gain();
      this.chain(o, fl, g, this.master);
      const t = this.t + i * 0.03;
      this.env(g, t, 0.02, 0.05, 1.8); o.start(t); o.stop(t + 2);
    });
  }

  paper() {
    if (!this.ctx) return;
    const n = this.noise(); const f = this.filter('highpass', 2500); const g = this.gain();
    this.chain(n, f, g, this.master);
    const t = this.t;
    g.gain.setValueAtTime(0, t);
    for (let i = 0; i < 6; i++) g.gain.linearRampToValueAtTime(Math.random() * 0.15, t + i * 0.04);
    g.gain.linearRampToValueAtTime(0, t + 0.3);
    this.oneShot(n, 0.35);
  }

  click() {
    if (!this.ctx) return;
    const o = this.osc('square', 1800); const g = this.gain();
    this.chain(o, g, this.master); this.env(g, this.t, 0.001, 0.06, 0.03); this.oneShot(o, 0.06);
  }

  drink() {
    if (!this.ctx) return;
    for (let i = 0; i < 4; i++) {
      const o = this.osc('sine', 300); const g = this.gain();
      this.chain(o, g, this.master);
      const t = this.t + i * 0.18;
      o.frequency.setValueAtTime(250, t); o.frequency.exponentialRampToValueAtTime(600, t + 0.08);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.08, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      o.start(t); o.stop(t + 0.15);
    }
  }

  heartbeat(intensity) {
    if (!this.ctx || intensity <= 0) return;
    const t = this.t;
    [0, 0.22].forEach((off, i) => {
      const o = this.osc('sine', 55); const g = this.gain();
      this.chain(o, g, this.master);
      o.frequency.setValueAtTime(70, t + off); o.frequency.exponentialRampToValueAtTime(40, t + off + 0.15);
      this.env(g, t + off, 0.01, (i ? 0.25 : 0.4) * intensity, 0.18);
      o.start(t + off); o.stop(t + off + 0.3);
    });
  }

  stinger() {
    if (!this.ctx) return;
    const t = this.t;
    [110, 116.5, 155.6, 164.8, 233].forEach(f => {
      const o = this.osc('sawtooth', f); const fl = this.filter('lowpass', 2000); const g = this.gain();
      this.chain(o, fl, g, this.master);
      fl.frequency.setValueAtTime(300, t); fl.frequency.exponentialRampToValueAtTime(3000, t + 0.4);
      this.env(g, t, 0.05, 0.06, 1.6); o.start(t); o.stop(t + 1.8);
    });
    const n = this.noise(); const nf = this.filter('bandpass', 400, 2); const ng = this.gain();
    this.chain(n, nf, ng, this.master); this.env(ng, t, 0.02, 0.4, 0.8); this.oneShot(n, 1);
  }

  scare() {
    if (!this.ctx) return;
    const t = this.t;
    const ws = this.ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; curve[i] = Math.tanh(x * 6); }
    ws.curve = curve;
    const g = this.gain(); this.chain(ws, g, this.master);
    this.env(g, t, 0.005, 0.9, 1.6);
    for (const f of [900, 1310, 1780, 470]) {
      const o = this.osc('sawtooth', f);
      o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 0.35, t + 1.5);
      const og = this.gain(0.25); this.chain(o, og, ws); o.start(t); o.stop(t + 1.7);
    }
    const n = this.noise(); const ng = this.gain(0.6); this.chain(n, ng, ws); this.oneShot(n, 1.6);
  }

  unlock() {
    if (!this.ctx) return;
    const t = this.t;
    const o = this.osc('square', 80); const f = this.filter('lowpass', 400); const g = this.gain();
    this.chain(o, f, g, this.master); this.env(g, t, 0.01, 0.3, 0.6); this.oneShot(o, 0.7);
    [523, 784].forEach((fr, i) => {
      const s = this.osc('sine', fr); const sg = this.gain(); this.chain(s, sg, this.master);
      this.env(sg, t + 0.4 + i * 0.15, 0.01, 0.12, 0.8); s.start(t + 0.4 + i * 0.15); s.stop(t + 1.5 + i * 0.15);
    });
  }

  powerDown() {
    if (!this.ctx) return;
    const t = this.t;
    const o = this.osc('sawtooth', 120); const f = this.filter('lowpass', 600); const g = this.gain();
    this.chain(o, f, g, this.master);
    o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(20, t + 1.2);
    this.env(g, t, 0.01, 0.25, 1.2); this.oneShot(o, 1.3);
    const n = this.noise(); const ng = this.gain(); const nf = this.filter('lowpass', 200);
    this.chain(n, nf, ng, this.master); this.env(ng, t, 0.005, 0.8, 0.4); this.oneShot(n, 0.5);
  }

  // 3D定位つき単発音
  at(pos, build, dur = 2) {
    if (!this.ctx) return;
    const p = this.panner();
    p.positionX.value = pos.x; p.positionY.value = pos.y ?? 1.5; p.positionZ.value = pos.z;
    p.connect(this.master);
    build(p, this.t);
    setTimeout(() => p.disconnect(), dur * 1000 + 200);
  }

  distantEvent(pos, kind) {
    this.at(pos, (out, t) => {
      if (kind === 'knock') {
        for (let i = 0; i < 3; i++) {
          const n = this.noise(); const f = this.filter('lowpass', 300); const g = this.gain();
          this.chain(n, f, g, out); this.env(g, t + i * 0.28, 0.003, 1.2, 0.12); n.start(t + i * 0.28); n.stop(t + i * 0.28 + 0.2);
        }
      } else if (kind === 'steps') {
        for (let i = 0; i < 5; i++) {
          const n = this.noise(); const f = this.filter('lowpass', 500); const g = this.gain();
          this.chain(n, f, g, out); const tt = t + i * 0.55; this.env(g, tt, 0.005, 0.8, 0.12); n.start(tt); n.stop(tt + 0.2);
        }
      } else if (kind === 'whisper') {
        const n = this.noise(); const f = this.filter('bandpass', 2400, 4); const g = this.gain();
        this.chain(n, f, g, out);
        g.gain.setValueAtTime(0, t);
        for (let i = 0; i < 12; i++) g.gain.linearRampToValueAtTime(Math.random() * 0.6, t + i * 0.12);
        g.gain.linearRampToValueAtTime(0, t + 1.6);
        f.frequency.setValueAtTime(1800, t); f.frequency.linearRampToValueAtTime(3200, t + 1.6);
        this.oneShot(n, 1.7);
      } else if (kind === 'steam') {
        const n = this.noise(); const f = this.filter('highpass', 1500); const g = this.gain();
        this.chain(n, f, g, out); this.env(g, t, 0.05, 0.9, 1.5); this.oneShot(n, 1.7);
      } else if (kind === 'clank') {
        const o = this.osc('triangle', 180); const o2 = this.osc('square', 263); const g = this.gain();
        o.connect(g); o2.connect(g); g.connect(out); this.env(g, t, 0.002, 0.5, 1.2);
        o.start(t); o2.start(t); o.stop(t + 1.3); o2.stop(t + 1.3);
      } else if (kind === 'drip') {
        const o = this.osc('sine', 1400); const g = this.gain(); this.chain(o, g, out);
        o.frequency.setValueAtTime(1800, t); o.frequency.exponentialRampToValueAtTime(700, t + 0.08);
        this.env(g, t, 0.002, 0.5, 0.15); this.oneShot(o, 0.2);
      }
    }, 3);
  }

  /* ---------- エンティティの持続音 ---------- */
  entityVoice(type) {
    if (!this.ctx) return null;
    const p = this.panner();
    const g = this.gain(0); p.connect(g); g.connect(this.master);
    const nodes = [];
    if (type === 'wanderer') {
      for (const f of [41, 43.5, 82.7]) {
        const o = this.osc('sawtooth', f); const fl = this.filter('lowpass', 260, 3); const og = this.gain(0.35);
        this.chain(o, fl, og, p); o.start(); nodes.push(o);
      }
      const n = this.noise(true); const ng = this.gain(0.6); this.chain(n, ng, p); n.start(); nodes.push(n);
    } else if (type === 'smiler') {
      const o = this.osc('sine', 1760); const o2 = this.osc('sine', 1766); const og = this.gain(0.07);
      o.connect(og); o2.connect(og); og.connect(p); o.start(); o2.start(); nodes.push(o, o2);
      const n = this.noise(); const f = this.filter('bandpass', 5000, 8); const ng = this.gain(0.1); this.chain(n, f, ng, p); n.start(); nodes.push(n);
    } else if (type === 'hound') {
      const n = this.noise(); const f = this.filter('bandpass', 700, 1.5); const ng = this.gain(0.8);
      this.chain(n, f, ng, p); n.start(); nodes.push(n);
      const lfo = this.osc('sine', 2.4); const lg = this.gain(0.8); lfo.connect(lg); lg.connect(ng.gain); lfo.start(); nodes.push(lfo);
      const o = this.osc('sawtooth', 65); const of = this.filter('lowpass', 200); const og = this.gain(0.3);
      this.chain(o, of, og, p); o.start(); nodes.push(o);
    }
    return {
      set: (pos, level) => {
        p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z;
        g.gain.setTargetAtTime(level, this.t, 0.2);
      },
      step: (pos, loud = 1) => {
        const n = this.noise(); const f = this.filter('lowpass', type === 'hound' ? 900 : 260); const sg = this.gain();
        const sp = this.panner(); sp.positionX.value = pos.x; sp.positionY.value = 0.2; sp.positionZ.value = pos.z;
        this.chain(n, f, sg, sp, this.master); this.env(sg, this.t, 0.004, 1.3 * loud, 0.14); this.oneShot(n, 0.25);
        setTimeout(() => sp.disconnect(), 500);
      },
      stop: () => { nodes.forEach(n => { try { n.stop(); } catch (e) { /* noop */ } }); g.disconnect(); },
    };
  }

  updateListener(cam) {
    if (!this.ctx) return;
    const L = this.ctx.listener;
    const p = cam.position;
    const f = cam.getWorldDirection(this._v || (this._v = cam.position.clone()));
    if (L.positionX) {
      L.positionX.value = p.x; L.positionY.value = p.y; L.positionZ.value = p.z;
      L.forwardX.value = f.x; L.forwardY.value = f.y; L.forwardZ.value = f.z;
      L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
    } else {
      L.setPosition(p.x, p.y, p.z); L.setOrientation(f.x, f.y, f.z, 0, 1, 0);
    }
  }
}
