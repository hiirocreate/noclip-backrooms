// 音声ファイルを使わず、WebAudioで効果音・環境音を合成する
export class Audio {
  constructor() { this.ctx = null; this.volume = 1; this.ambientVolume = 0.8; this.musicVolume = 0.3; }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    // out(最終) ← master(効果音) + 残響 / ambientBus(環境音) / musicBus(BGM)
    this.out = ctx.createGain(); this.out.gain.value = this.volume;
    this.master = ctx.createGain();
    this.ambientBus = ctx.createGain(); this.ambientBus.gain.value = this.ambientVolume;
    this.musicBus = ctx.createGain(); this.musicBus.gain.value = this.musicVolume;
    this.verb = ctx.createConvolver();
    this.verbSend = ctx.createGain(); this.verbSend.gain.value = 0.3;
    this.verbWet = ctx.createGain(); this.verbWet.gain.value = 1;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12; comp.ratio.value = 4;
    this.master.connect(this.out);
    this.master.connect(this.verbSend); this.verbSend.connect(this.verb); this.verb.connect(this.verbWet); this.verbWet.connect(this.out);
    this.ambientBus.connect(this.master);
    this.musicBus.connect(this.out);
    this.musicSend = ctx.createGain(); this.musicSend.gain.value = 0.25; this.musicBus.connect(this.musicSend); this.musicSend.connect(this.verb);
    this.out.connect(comp); comp.connect(ctx.destination);
    this.setSpace({ decay: 1.2, wet: 0.2 });
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

  setVolume(v) { this.volume = v; if (this.out) this.out.gain.value = v; }
  setAmbientVolume(v) { this.ambientVolume = v; if (this.ambientBus) this.ambientBus.gain.setTargetAtTime(v, this.t, 0.04); }
  setMusicVolume(v) { this.musicVolume = v; if (this.musicBus) this.musicBus.gain.setTargetAtTime(v, this.t, 0.04); }
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

  /* ---------- 空間の残響 ---------- */
  // decay: 残響の長さ(秒) / wet: 残響の量 / bright: 高域の残り具合(0〜1)
  setSpace({ decay = 1.5, wet = 0.25, bright = 0.5 } = {}) {
    if (!this.ctx) return;
    const rate = this.ctx.sampleRate, len = Math.floor(rate * decay);
    const buf = this.ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch); let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / len;
        const n = Math.random() * 2 - 1;
        lp += (n - lp) * (0.08 + bright * 0.9 * (1 - t));
        d[i] = lp * Math.pow(1 - t, 3) * (i < rate * 0.004 ? i / (rate * 0.004) : 1);
      }
    }
    this.verb.buffer = buf;
    this.verbSend.gain.setTargetAtTime(wet, this.t, 0.1);
  }

  /* ---------- 環境音・BGM(レベル側の builder で組み立てる) ---------- */
  api(list, timers, out) {
    const A = this;
    return {
      A, out,
      keep: (...nodes) => { list.push(...nodes); return nodes[0]; },
      start: (...nodes) => { for (const n of nodes) { n.start?.(); list.push(n); } return nodes[0]; },
      every: (ms, fn, jitter = 0) => {
        const loop = () => { const id = setTimeout(() => { if (A.ctx?.state === 'running') fn(); loop(); }, ms + Math.random() * jitter); timers.push(id); };
        loop();
      },
      after: (ms, fn) => timers.push(setTimeout(fn, ms)),
    };
  }

  stopAmbient() {
    for (const n of this.ambient || []) { try { n.stop ? n.stop() : n.disconnect(); } catch (e) { /* noop */ } }
    for (const id of this.ambTimers || []) clearTimeout(id);
    this.ambient = []; this.ambTimers = [];
    this.humGain = null;
  }

  stopMusic() {
    for (const n of this.music || []) { try { n.stop ? n.stop() : n.disconnect(); } catch (e) { /* noop */ } }
    for (const id of this.musTimers || []) clearTimeout(id);
    this.music = []; this.musTimers = []; this.musicCtl = null;
  }

  startAmbient(builder) {
    if (!this.ctx) return;
    this.stopAmbient();
    const out = this.gain(1); out.connect(this.ambientBus); this.ambient.push(out);
    this.humGain = this.gain(0); this.humMute = this.gain(1);
    this.humGain.connect(this.humMute); this.humMute.connect(out); this.ambient.push(this.humGain, this.humMute);
    builder?.(this.api(this.ambient, this.ambTimers, out));
  }

  // builder は { intensity(v) } を返せる(緊張度で BGM が変わる)
  startMusic(builder) {
    if (!this.ctx) return;
    this.stopMusic();
    const out = this.gain(0); out.connect(this.musicBus); this.music.push(out);
    out.gain.setTargetAtTime(1, this.t, 1.5); // フェードイン
    this.musicCtl = builder?.(this.api(this.music, this.musTimers, out)) || null;
  }
  setIntensity(v) { this.musicCtl?.intensity?.(v); }

  // 蛍光灯の唸り(照明の近さで音量が変わる)
  fluoHum(api, base = 60, amt = 1) {
    const humF = this.filter('lowpass', 900, 2);
    humF.connect(this.humGain); api.keep(humF);
    for (const [f, type, v] of [[base, 'sawtooth', 0.05], [base * 2, 'square', 0.02], [base * 3 + 0.5, 'sawtooth', 0.015]]) {
      const o = this.osc(type, f); const g = this.gain(v * amt); o.connect(g); g.connect(humF); api.start(o);
    }
    const buzz = this.noise(); const bf = this.filter('bandpass', 3200, 6); const bg = this.gain(0.012 * amt);
    this.chain(buzz, bf, bg, this.humGain); api.start(buzz);
  }

  setHum(level) {
    if (!this.humGain) return;
    this.humGain.gain.setTargetAtTime(Math.min(1.4, level), this.t, 0.15);
  }

  // 音程(半音)→周波数
  hz(midi) { return 440 * Math.pow(2, (midi - 69) / 12); }

  // 柔らかい単音(BGM用)
  note(out, midi, t, dur, { type = 'sine', vol = 0.05, attack = 0.02, cutoff = 2000, detune = 0, fm = 0, mod = null } = {}) {
    const o = this.osc(type, this.hz(midi)); o.detune.value = detune; if (mod) mod.connect(o.detune);
    const f = this.filter('lowpass', cutoff, 0.7); const g = this.gain();
    this.chain(o, f, g, out);
    if (fm) { const m = this.osc('sine', this.hz(midi) * 2); const mg = this.gain(this.hz(midi) * fm); m.connect(mg); mg.connect(o.frequency); m.start(t); m.stop(t + dur + 0.1); mg.gain.exponentialRampToValueAtTime(1, t + dur); }
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t); o.stop(t + dur + 0.1);
  }

  // 位置のある持続音(機械の唸り、ちらつく壁、無線など)
  loopAt(pos, build) {
    if (!this.ctx) return null;
    const p = this.panner(); p.refDistance = 2; p.rolloffFactor = 1.6;
    p.positionX.value = pos.x; p.positionY.value = pos.y ?? 1.2; p.positionZ.value = pos.z;
    const g = this.gain(0); p.connect(g); g.connect(this.ambientBus);
    const nodes = []; build(p, nodes);
    for (const n of nodes) n.start?.();
    const ctl = {
      set: (v) => g.gain.setTargetAtTime(v, this.t, 0.1),
      move: (q) => { p.positionX.value = q.x; p.positionZ.value = q.z; },
      stop: () => { nodes.forEach(n => { try { n.stop ? n.stop() : n.disconnect(); } catch (e) { /* noop */ } }); g.disconnect(); },
    };
    (this.ambient ||= []).push({ stop: ctl.stop });
    return ctl;
  }

  // 無線の雑音(非位置)。strength 0〜1 で声(信号音)がはっきりする
  radio() {
    if (!this.ctx) return null;
    const out = this.gain(0); out.connect(this.master);
    const n = this.noise(); const bf = this.filter('bandpass', 1800, 0.8); const ng = this.gain(0.25);
    this.chain(n, bf, ng, out); n.start();
    const tone = this.osc('sine', 880); const tg = this.gain(0); this.chain(tone, tg, out); tone.start();
    let str = 0, on = false;
    const id = setInterval(() => {
      if (!this.ctx || this.ctx.state !== 'running') return;
      // モールス風の信号(近いほど明瞭)
      const t = this.t;
      const pat = [1, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0];
      pat.forEach((b, i) => { tg.gain.setValueAtTime(b ? 0.05 * str : 0, t + i * 0.09); });
      tg.gain.setValueAtTime(0, t + pat.length * 0.09);
    }, 2200);
    const ctl = {
      set: (s, active = true) => {
        str = s; on = active;
        out.gain.setTargetAtTime(active ? 0.25 : 0, this.t, 0.2);
        ng.gain.setTargetAtTime(0.35 * (1 - s * 0.7), this.t, 0.2);
      },
      stop: () => { clearInterval(id); try { n.stop(); tone.stop(); } catch (e) { /* noop */ } out.disconnect(); },
    };
    (this.ambient ||= []).push({ stop: ctl.stop });
    return ctl;
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
    if (theme === 'water') { this.splash(loud); return; }
    if (theme === 'lobby' || theme === 'hotel') f = this.filter('lowpass', theme === 'hotel' ? 320 + Math.random() * 80 : 420 + Math.random() * 100, 0.7);
    else if (theme === 'cave') f = this.filter('bandpass', 1800 + Math.random() * 900, 1.2);
    else if (theme === 'parking') f = this.filter('bandpass', 1300 + Math.random() * 400, 0.9);
    else f = this.filter('bandpass', 700 + Math.random() * 200, 3);
    this.chain(n, f, g, this.master);
    this.env(g, t, 0.005, 0.35 * loud, theme === 'lobby' || theme === 'hotel' ? 0.12 : 0.09);
    if (theme === 'cave') { // 砂利のじゃり音
      for (let i = 0; i < 3; i++) { const n2 = this.noise(); const f2 = this.filter('highpass', 3000); const g2 = this.gain(); this.chain(n2, f2, g2, this.master); const tt = t + 0.01 + Math.random() * 0.06; this.env(g2, tt, 0.001, 0.12 * loud, 0.03); n2.start(tt); n2.stop(tt + 0.05); }
    }
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

  // 正気度が尽きた時だけ鳴る、内耳の耳鳴りと低い脈動。
  sanityCollapse() {
    if (!this.ctx) return;
    const t = this.t;
    const n = this.noise(); const nf = this.filter('bandpass', 2400, 7); const ng = this.gain();
    this.chain(n, nf, ng, this.master);
    nf.frequency.setValueAtTime(900, t);
    nf.frequency.exponentialRampToValueAtTime(4200, t + 0.75);
    this.env(ng, t, 0.01, 0.28, 1.25);
    this.oneShot(n, 1.35);
    const o = this.osc('sine', 36); const og = this.gain();
    this.chain(o, og, this.master);
    o.frequency.setValueAtTime(58, t); o.frequency.exponentialRampToValueAtTime(24, t + 1.15);
    this.env(og, t, 0.015, 0.52, 1.2);
    this.oneShot(o, 1.3);
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

  howl(pos) {
    this.at({ x: pos.x, y: 1, z: pos.z }, (out, t) => {
      const o = this.osc('sawtooth', 220); const f = this.filter('bandpass', 700, 3); const g = this.gain();
      this.chain(o, f, g, out);
      o.frequency.setValueAtTime(180, t); o.frequency.linearRampToValueAtTime(420, t + 0.6); o.frequency.linearRampToValueAtTime(260, t + 1.6);
      this.env(g, t, 0.15, 0.8, 1.6); this.oneShot(o, 1.9);
    }, 2.5);
  }

  doorRattle(pos) {
    this.at({ x: pos.x, y: 1.1, z: pos.z }, (out, t) => {
      for (let i = 0; i < 5; i++) {
        const n = this.noise(); const f = this.filter('bandpass', 900 + Math.random() * 600, 4); const g = this.gain();
        this.chain(n, f, g, out); const tt = t + i * 0.09; this.env(g, tt, 0.002, 1.1, 0.07); n.start(tt); n.stop(tt + 0.1);
        const o = this.osc('square', 140 + Math.random() * 40); const og = this.gain(); this.chain(o, og, out); this.env(og, tt, 0.002, 0.15, 0.1); o.start(tt); o.stop(tt + 0.12);
      }
    }, 1.2);
  }

  voidRoom() {
    if (!this.ctx) return;
    // 一瞬すべての音が消え、耳鳴りだけが残る
    const t = this.t;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setValueAtTime(this.volume, t); this.out.gain.linearRampToValueAtTime(0.02, t + 0.05);
    this.out.gain.setValueAtTime(0.02, t + 1.6); this.out.gain.linearRampToValueAtTime(this.volume, t + 2.4);
    const o = this.osc('sine', 7800); const g = this.gain(); o.connect(g); g.connect(this.ctx.destination);
    this.env(g, t, 0.3, 0.02, 1.8); this.oneShot(o, 2.2);
  }

  breaker() {
    if (!this.ctx) return;
    const t = this.t;
    const n = this.noise(); const f = this.filter('lowpass', 1200); const g = this.gain();
    this.chain(n, f, g, this.master); this.env(g, t, 0.002, 1.2, 0.15); this.oneShot(n, 0.2);
    const o = this.osc('sawtooth', 30); const of = this.filter('lowpass', 300); const og = this.gain();
    this.chain(o, of, og, this.master);
    o.frequency.setValueAtTime(30, t + 0.3); o.frequency.exponentialRampToValueAtTime(100, t + 2.5);
    og.gain.setValueAtTime(0.0001, t + 0.3); og.gain.linearRampToValueAtTime(0.35, t + 2); og.gain.exponentialRampToValueAtTime(0.0001, t + 3.5);
    o.start(t + 0.3); o.stop(t + 3.6);
  }

  alarm(sec = 6) {
    if (!this.ctx) return;
    const t = this.t;
    const o = this.osc('square', 600); const f = this.filter('lowpass', 1800); const g = this.gain(0.07);
    this.chain(o, f, g, this.master);
    for (let i = 0; i < sec * 2; i++) { o.frequency.setValueAtTime(i % 2 ? 450 : 620, t + i * 0.5); }
    g.gain.setValueAtTime(0.07, t + sec - 0.3); g.gain.linearRampToValueAtTime(0, t + sec);
    o.start(t); o.stop(t + sec);
  }

  keyBeep(ok = null) {
    if (!this.ctx) return;
    const t = this.t;
    if (ok === null) { const o = this.osc('square', 1400); const g = this.gain(); this.chain(o, g, this.master); this.env(g, t, 0.002, 0.05, 0.06); this.oneShot(o, 0.1); return; }
    const seq = ok ? [880, 1320] : [220, 180];
    seq.forEach((fr, i) => { const o = this.osc(ok ? 'sine' : 'square', fr); const g = this.gain(); this.chain(o, g, this.master); const tt = t + i * 0.15; this.env(g, tt, 0.005, ok ? 0.12 : 0.1, 0.25); o.start(tt); o.stop(tt + 0.3); });
  }

  noclip() {
    if (!this.ctx) return;
    const t = this.t;
    const n = this.noise(); const f = this.filter('bandpass', 400, 1); const g = this.gain();
    this.chain(n, f, g, this.master);
    f.frequency.setValueAtTime(200, t); f.frequency.exponentialRampToValueAtTime(6000, t + 1);
    this.env(g, t, 0.05, 0.6, 1.2); this.oneShot(n, 1.3);
    const o = this.osc('sawtooth', 60); const og = this.gain(); this.chain(o, og, this.master);
    o.frequency.setValueAtTime(60, t); o.frequency.exponentialRampToValueAtTime(900, t + 1);
    this.env(og, t, 0.05, 0.15, 1); this.oneShot(o, 1.1);
  }


  // 水の中を歩く音
  splash(loud = 1) {
    if (!this.ctx) return;
    const t = this.t;
    const n = this.noise(); const f = this.filter('bandpass', 600 + Math.random() * 400, 0.8); const g = this.gain();
    this.chain(n, f, g, this.master);
    f.frequency.setValueAtTime(1400, t); f.frequency.exponentialRampToValueAtTime(350, t + 0.35);
    this.env(g, t, 0.02, 0.45 * loud, 0.35); this.oneShot(n, 0.45);
    for (let i = 0; i < 3; i++) {
      const o = this.osc('sine', 500 + Math.random() * 700); const og = this.gain(); this.chain(o, og, this.master);
      const tt = t + 0.05 + Math.random() * 0.2; o.frequency.setValueAtTime(o.frequency.value, tt); o.frequency.exponentialRampToValueAtTime(o.frequency.value * 1.8, tt + 0.05);
      this.env(og, tt, 0.002, 0.04 * loud, 0.06); o.start(tt); o.stop(tt + 0.1);
    }
  }

  // 手を叩く(残響つき)
  clap() {
    if (!this.ctx) return;
    const t = this.t;
    for (let i = 0; i < 2; i++) {
      const n = this.noise(); const f = this.filter('bandpass', 1400, 0.9); const g = this.gain();
      this.chain(n, f, g, this.master); const tt = t + i * 0.012; this.env(g, tt, 0.001, 1.2, 0.06); n.start(tt); n.stop(tt + 0.1);
    }
    // 反響(遅れて返ってくる)
    [0.18, 0.37, 0.61].forEach((d, i) => {
      const n = this.noise(); const f = this.filter('bandpass', 1100 - i * 250, 1.2); const g = this.gain();
      this.chain(n, f, g, this.master); this.env(g, t + d, 0.002, 0.35 / (i + 1), 0.12); n.start(t + d); n.stop(t + d + 0.2);
    });
  }

  // 蜘蛛の巣に絡まる
  webStretch() {
    if (!this.ctx) return;
    const t = this.t;
    const n = this.noise(); const f = this.filter('bandpass', 3500, 6); const g = this.gain();
    this.chain(n, f, g, this.master);
    f.frequency.setValueAtTime(5000, t); f.frequency.exponentialRampToValueAtTime(1800, t + 0.6);
    this.env(g, t, 0.02, 0.35, 0.6); this.oneShot(n, 0.7);
    const o = this.osc('triangle', 90); const og = this.gain(); this.chain(o, og, this.master);
    o.frequency.setValueAtTime(90, t); o.frequency.linearRampToValueAtTime(140, t + 0.5);
    this.env(og, t, 0.05, 0.12, 0.6); this.oneShot(o, 0.7);
  }

  // 水の下から「それ」が上がってくる
  rise() {
    if (!this.ctx) return;
    const t = this.t;
    const n = this.noise(true); const f = this.filter('lowpass', 300); const g = this.gain();
    this.chain(n, f, g, this.master); f.frequency.setValueAtTime(120, t); f.frequency.exponentialRampToValueAtTime(2200, t + 0.8);
    this.env(g, t, 0.3, 2.2, 1.2); this.oneShot(n, 1.6);
    const o = this.osc('sawtooth', 28); const of = this.filter('lowpass', 180); const og = this.gain();
    this.chain(o, of, og, this.master); this.env(og, t, 0.2, 0.6, 1.5); this.oneShot(o, 1.8);
  }

  // フロントの呼び鈴
  bell(pos) {
    const b = (out, t) => {
      for (const [fr, v] of [[2093, 0.12], [2637, 0.06], [4186, 0.03]]) {
        const o = this.osc('sine', fr); const g = this.gain(); this.chain(o, g, out); this.env(g, t, 0.002, v * 4, 1.8); o.start(t); o.stop(t + 2);
      }
    };
    if (pos) this.at(pos, b, 2.2); else if (this.ctx) b(this.master, this.t);
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
      } else if (kind === 'phone') {
        for (let r = 0; r < 3; r++) for (let i = 0; i < 16; i++) {
          const tt = t + r * 3 + i * 0.06; const o = this.osc('sine', i % 2 ? 1100 : 900); const g = this.gain(); this.chain(o, g, out);
          g.gain.setValueAtTime(0.25, tt); g.gain.setValueAtTime(0, tt + 0.05); o.start(tt); o.stop(tt + 0.06);
        }
      } else if (kind === 'spark') {
        for (let i = 0; i < 8; i++) {
          const n = this.noise(); const f = this.filter('highpass', 2500); const g = this.gain(); this.chain(n, f, g, out);
          const tt = t + Math.random() * 0.6; this.env(g, tt, 0.001, 0.9, 0.04); n.start(tt); n.stop(tt + 0.06);
        }
        const o = this.osc('sawtooth', 100); const og = this.gain(); this.chain(o, og, out); this.env(og, t, 0.01, 0.2, 0.5); this.oneShot(o, 0.6);
      } else if (kind === 'relay') {
        for (let i = 0; i < 2; i++) { const n = this.noise(); const f = this.filter('bandpass', 3000, 3); const g = this.gain(); this.chain(n, f, g, out); const tt = t + i * 0.12; this.env(g, tt, 0.001, 1, 0.02); n.start(tt); n.stop(tt + 0.04); }
      } else if (kind === 'copier') {
        const n = this.noise(); const f = this.filter('bandpass', 500, 2); const g = this.gain(); this.chain(n, f, g, out);
        g.gain.setValueAtTime(0, t); for (let i = 0; i < 6; i++) { g.gain.linearRampToValueAtTime(0.5, t + i * 0.45 + 0.1); g.gain.linearRampToValueAtTime(0.1, t + i * 0.45 + 0.4); }
        g.gain.linearRampToValueAtTime(0, t + 2.8); this.oneShot(n, 2.9);
      } else if (kind === 'typing') {
        for (let i = 0; i < 18; i++) { const n = this.noise(); const f = this.filter('bandpass', 2500 + Math.random() * 1500, 5); const g = this.gain(); this.chain(n, f, g, out); const tt = t + i * (0.08 + Math.random() * 0.1); this.env(g, tt, 0.001, 0.7, 0.03); n.start(tt); n.stop(tt + 0.05); }
      } else if (kind === 'buzz') {
        const n = this.noise(); const f = this.filter('bandpass', 120, 8); const g = this.gain(); this.chain(n, f, g, out); this.env(g, t, 0.1, 0.8, 1.5); this.oneShot(n, 1.7);
      } else if (kind === 'pop') {
        const n = this.noise(); const f = this.filter('highpass', 800); const g = this.gain(); this.chain(n, f, g, out); this.env(g, t, 0.001, 1.2, 0.08); this.oneShot(n, 0.12);
        const o = this.osc('sine', 3000); const og = this.gain(); this.chain(o, og, out); this.env(og, t, 0.001, 0.1, 0.3); this.oneShot(o, 0.35);
      } else if (kind === 'clock') {
        for (let i = 0; i < 6; i++) { const tt = t + i * 0.5; const o = this.osc('square', i % 2 ? 1900 : 1600); const f = this.filter('bandpass', 2500, 4); const g = this.gain(); this.chain(o, f, g, out); this.env(g, tt, 0.001, 0.25, 0.03); o.start(tt); o.stop(tt + 0.05); }
      } else if (kind === 'party') {
        // 遠くの宴会のざわめきと、グラスの触れ合う音
        const n = this.noise(); const f = this.filter('bandpass', 700, 1.5); const g = this.gain(); this.chain(n, f, g, out);
        g.gain.setValueAtTime(0, t); for (let i = 0; i < 16; i++) g.gain.linearRampToValueAtTime(0.25 + Math.random() * 0.35, t + i * 0.2); g.gain.linearRampToValueAtTime(0, t + 3.4); this.oneShot(n, 3.5);
        for (let i = 0; i < 3; i++) { const o = this.osc('sine', 2600 + Math.random() * 900); const og = this.gain(); this.chain(o, og, out); const tt = t + 0.4 + Math.random() * 2.4; this.env(og, tt, 0.002, 0.08, 0.5); o.start(tt); o.stop(tt + 0.6); }
      } else if (kind === 'bell') {
        for (const [fr, v] of [[2093, 0.5], [2637, 0.25]]) { const o = this.osc('sine', fr); const g = this.gain(); this.chain(o, g, out); this.env(g, t, 0.002, v, 1.8); o.start(t); o.stop(t + 2); }
      } else if (kind === 'splash') {
        const n = this.noise(); const f = this.filter('bandpass', 500, 0.7); const g = this.gain(); this.chain(n, f, g, out);
        f.frequency.setValueAtTime(1500, t); f.frequency.exponentialRampToValueAtTime(250, t + 0.8); this.env(g, t, 0.02, 1.0, 0.9); this.oneShot(n, 1);
      } else if (kind === 'groan') {
        // 深いところからの低いうなり
        const o = this.osc('sawtooth', 38); const f = this.filter('lowpass', 160, 3); const g = this.gain(); this.chain(o, f, g, out);
        o.frequency.setValueAtTime(34, t); o.frequency.linearRampToValueAtTime(52, t + 1.6); o.frequency.linearRampToValueAtTime(30, t + 3.2);
        this.env(g, t, 0.8, 1.2, 2.4); this.oneShot(o, 3.4);
      } else if (kind === 'rockfall') {
        for (let i = 0; i < 10; i++) { const n = this.noise(); const f = this.filter('lowpass', 500 + Math.random() * 1500); const g = this.gain(); this.chain(n, f, g, out); const tt = t + i * 0.07 + Math.random() * 0.1; this.env(g, tt, 0.002, 0.9 - i * 0.07, 0.12); n.start(tt); n.stop(tt + 0.2); }
      } else if (kind === 'skitter') {
        for (let i = 0; i < 24; i++) { const n = this.noise(); const f = this.filter('bandpass', 4200 + Math.random() * 1800, 6); const g = this.gain(); this.chain(n, f, g, out); const tt = t + i * 0.035 + Math.random() * 0.02; this.env(g, tt, 0.001, 0.5, 0.015); n.start(tt); n.stop(tt + 0.03); }
      } else if (kind === 'thump') {
        const o = this.osc('sine', 60); const g = this.gain(); this.chain(o, g, out);
        o.frequency.setValueAtTime(80, t); o.frequency.exponentialRampToValueAtTime(35, t + 0.3); this.env(g, t, 0.005, 1.2, 0.4); this.oneShot(o, 0.5);
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
    } else if (type === 'duller') {
      const n = this.noise(); const f = this.filter('bandpass', 350, 2); const ng = this.gain(0.5);
      this.chain(n, f, ng, p); n.start(); nodes.push(n);
      const lfo = this.osc('sine', 0.3); const lg = this.gain(0.4); lfo.connect(lg); lg.connect(ng.gain); lfo.start(); nodes.push(lfo);
    } else if (type === 'beast') {
      // 重い呼吸
      const n = this.noise(true); const f = this.filter('lowpass', 380, 2); const ng = this.gain(0.9);
      this.chain(n, f, ng, p); n.start(); nodes.push(n);
      const lfo = this.osc('sine', 0.35); const lg = this.gain(0.8); lfo.connect(lg); lg.connect(ng.gain); lfo.start(); nodes.push(lfo);
      const o = this.osc('sawtooth', 36); const of = this.filter('lowpass', 140, 4); const og = this.gain(0.4); this.chain(o, of, og, p); o.start(); nodes.push(o);
    } else if (type === 'spider') {
      const n = this.noise(); const f = this.filter('bandpass', 4800, 5); const ng = this.gain(0.25);
      this.chain(n, f, ng, p); n.start(); nodes.push(n);
      const lfo = this.osc('square', 13); const lg = this.gain(0.25); lfo.connect(lg); lg.connect(ng.gain); lfo.start(); nodes.push(lfo);
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
        const n = this.noise(); const f = this.filter('lowpass', type === 'hound' ? 900 : type === 'spider' ? 3000 : type === 'beast' ? 160 : 260); const sg = this.gain();
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
