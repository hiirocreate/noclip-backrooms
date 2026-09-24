// LEVEL 7「深海恐怖症」― 階層の半分が黒い水に沈んでいる。水の下には、とても大きな「それ」がいる。
// 水の中では足音が伝わり、「それ」の気配が高まる。乾いた床で息を潜め、最も深い場所の排水口へ潜る
import * as THREE from 'three';
import { LevelLogic } from './base.js';
import { bfs } from '../mapgen.js';

const WATER_Y = 0.5;

function swirlTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(128, 128, 4, 128, 128, 126);
  g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.5, 'rgba(0,0,0,0.75)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = 'rgba(160,200,210,0.35)'; ctx.lineWidth = 3;
  for (let k = 0; k < 4; k++) {
    ctx.beginPath();
    for (let i = 0; i < 80; i++) { const a = i * 0.12 + k * Math.PI / 2, r = 10 + i * 1.4; const x = 128 + Math.cos(a) * r, y = 128 + Math.sin(a) * r; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function shadowTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(128, 64, 4, 128, 64, 120);
  g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.6, 'rgba(0,0,0,0.7)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(128, 64, 126, 50, 0, 0, 7); ctx.fill();
  return new THREE.CanvasTexture(c);
}

class Thalassophobia extends LevelLogic {
  plan(map) {
    super.plan(map);
    const W = map.W, H = map.H, rnd = map.rnd;
    this.water = new Uint8Array(W * H);
    // 最も深い場所 = スタートから最も遠い床
    let drain = map.floorList[0], md = -1;
    for (const p of map.floorList) { const d = map.dist[p.y * W + p.x]; if (d > md) { md = d; drain = p; } }
    this.drain = drain;
    this.used.add(drain.y * W + drain.x);
    // 水たまりの中心(遠い順に間隔をあけて)
    const centers = [{ ...drain, r: 5 }];
    const cand = map.floorList.filter(p => { const d = map.dist[p.y * W + p.x]; return d > md * 0.22 && d < md * 0.85; }).sort(() => rnd() - 0.5);
    for (const p of cand) {
      if (centers.length >= 6) break;
      if (centers.some(c => Math.abs(c.x - p.x) + Math.abs(c.y - p.y) < 8)) continue;
      centers.push({ ...p, r: 3 + Math.floor(rnd() * 3) });
    }
    for (const c of centers) {
      const d = bfs(map.tiles, W, H, c.x, c.y);
      for (const p of map.floorList) { const v = d[p.y * W + p.x]; if (v >= 0 && v <= c.r && map.dist[p.y * W + p.x] >= 4) this.water[p.y * W + p.x] = 1; }
    }
  }

  // 補給品は乾いた床にだけ置く
  pick(opts = {}) {
    const W = this.map.W;
    return super.pick({ ...opts, filter: (p) => !this.water[p.y * W + p.x] && (!opts.filter || opts.filter(p)) });
  }

  build(world) {
    super.build(world);
    const T = world.T, W = this.map.W;
    // 水面(タイルごとの四角をまとめて1枚に。明るさは照明から焼き込む)
    const pos = [], lit = [], uv = [], idx = [];
    const S = 2;
    for (const p of this.map.floorList) {
      if (!this.water[p.y * W + p.x]) continue;
      const base = pos.length / 3;
      for (let j = 0; j <= S; j++) for (let i = 0; i <= S; i++) {
        const x = (p.x + i / S) * T, z = (p.y + j / S) * T;
        pos.push(x, WATER_Y, z); uv.push(x, z);
        const l = world.lightAt3(Math.min(Math.max(x, p.x * T + 0.05), (p.x + 1) * T - 0.05), WATER_Y, Math.min(Math.max(z, p.y * T + 0.05), (p.y + 1) * T - 0.05), 0, 1, 0);
        lit.push(l[0] + l[1] + l[2] + l[3] + this.def.ambient);
      }
      for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) { const a = base + j * (S + 1) + i, b = a + 1, c = a + S + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('lit', new THREE.Float32BufferAttribute(lit, 1));
    geo.setAttribute('wuv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    this.waterMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: true,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { time: { value: 0 }, lampCol: { value: new THREE.Color(...this.def.lamp.color) } }]),
      vertexShader: `
        attribute float lit; attribute vec2 wuv; varying float vLit; varying vec2 vUv;
        #include <fog_pars_vertex>
        void main(){ vLit = lit; vUv = wuv; vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
        }`,
      fragmentShader: `
        uniform float time; uniform vec3 lampCol; varying float vLit; varying vec2 vUv;
        #include <fog_pars_fragment>
        void main(){
          float w = sin(vUv.x * 2.1 + time * 0.7) * sin(vUv.y * 1.7 - time * 0.55) + sin((vUv.x + vUv.y) * 3.3 + time * 1.1) * 0.5;
          float spec = pow(max(0.0, w * 0.5 + 0.5), 6.0);
          vec3 deep = vec3(0.01, 0.03, 0.04);
          vec3 c = deep + lampCol * vLit * (0.05 + spec * 0.35);
          gl_FragColor = vec4(c, 0.9);
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
    });
    const water = new THREE.Mesh(geo, this.waterMat);
    water.renderOrder = 2;
    world.group.add(water);
    // 排水口の渦
    const c = world.tileCenter(this.drain.x, this.drain.y);
    this.swirl = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.2), new THREE.MeshBasicMaterial({ map: swirlTexture(), transparent: true, depthWrite: false }));
    this.swirl.rotation.x = -Math.PI / 2; this.swirl.position.set(c.x, WATER_Y + 0.01, c.z); this.swirl.renderOrder = 3;
    world.group.add(this.swirl);
    this.drainPos = c;
    this.addInteract({ pos: c, radius: 1.4, label: '排水口へ潜る', action: () => this.dive() });
    // 水の下の影
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(7, 3.2), new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, opacity: 0, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2; this.shadow.position.y = WATER_Y - 0.08; this.shadow.renderOrder = 1;
    world.group.add(this.shadow);
    // 乾いた場所は壁際に水位の跡
  }

  items() { return this.supplies({ batteries: 2, waters: 3 }); }

  start(saved) {
    super.start(saved);
    this.meter = 0;
    this.stage = 0;
    this.shAng = Math.random() * 6;
    this.shAlpha = 0;
    this.diving = false;
  }

  inWater(x, z) {
    const [tx, ty] = this.world.toTile(x, z);
    return !!this.water[ty * this.map.W + tx];
  }

  footTheme() { return this.wet ? 'water' : null; }

  dive() {
    const g = this.game;
    if (this.diving) return;
    this.diving = true;
    g.audio.distantEvent({ x: this.drainPos.x, y: 0.3, z: this.drainPos.z }, 'splash');
    this.say('息を止めて、黒い水の底へ――', 2);
    setTimeout(() => this.exit(), 700);
  }

  objective() { return '水の下の「それ」を起こさずに、最も深い場所の排水口へ潜れ'; }
  status() {
    const n = Math.ceil(this.meter / 20);
    if (this.meter > 3) return `水の下の気配 ${'■'.repeat(n)}${'□'.repeat(5 - n)}`;
    return this.wet ? '水の中。「それ」に足音が伝わる' : '';
  }
  tension() { return Math.min(1, this.meter / 90); }
  sanityRate() { return this.wet ? -0.5 : 0.2; }

  update(dt) {
    const g = this.game, p = g.player;
    this.wet = this.inWater(p.pos.x, p.pos.z);
    p.speedMul = this.wet ? (p.running ? 0.72 : 0.58) : 1;
    // 気配：水の中で動くほど高まり、乾いた床では静まる
    const rate = this.wet ? (p.running ? 10 : p.moving ? (p.crouching ? 1.6 : 3.4) : 0.7) : -11;
    this.meter = Math.max(0, Math.min(100, this.meter + rate * dt));
    const stage = this.meter >= 100 ? 3 : this.meter >= 75 ? 2 : this.meter >= 45 ? 1 : 0;
    if (stage > this.stage) {
      if (stage === 1) { g.audio.distantEvent({ x: p.pos.x + 6, y: -4, z: p.pos.z - 4 }, 'groan'); this.say('足元の水が、ゆっくりと揺れた', 2.5); }
      if (stage === 2) { g.audio.distantEvent({ x: p.pos.x, y: -3, z: p.pos.z }, 'groan'); g.audio.heartbeat(1); this.say('何かが、すぐ下を通った。水から上がれ！', 3); }
      if (stage === 3) { g.audio.rise(); g.fx.u.flash.value = 0.5; g.kill('leviathan'); return; }
    }
    this.stage = stage;
    // 影：気配が高まると、水面の下をぐるりと回りはじめる
    this.shAng += dt * (0.25 + this.meter / 200);
    const r = 2.5 + (1 - this.meter / 100) * 7;
    const sx = p.pos.x + Math.cos(this.shAng) * r, sz = p.pos.z + Math.sin(this.shAng) * r;
    this.shadow.position.x = sx; this.shadow.position.z = sz;
    this.shadow.rotation.z = -this.shAng;
    const want = this.meter > 30 && this.inWater(sx, sz) ? Math.min(0.7, (this.meter - 30) / 50) : 0;
    this.shAlpha += (want - this.shAlpha) * Math.min(1, dt * 2);
    this.shadow.material.opacity = this.shAlpha;
    this.waterMat.uniforms.time.value = g.time;
    this.swirl.rotation.z -= dt * 0.8;
  }

  dispose() { this.game.player.speedMul = 1; }

  /* ---------- 音 ---------- */
  ambient(api) {
    const A = api.A;
    // 打ち寄せる水
    const n = A.noise(); const f = A.filter('lowpass', 520, 0.7); const g = A.gain(0.1);
    A.chain(n, f, g, api.out); api.start(n);
    const lfo = A.osc('sine', 0.13); const lg = A.gain(0.07); lfo.connect(lg); lg.connect(g.gain); api.start(lfo);
    const deep = A.noise(true); const df = A.filter('lowpass', 110); const dg = A.gain(0.25); A.chain(deep, df, dg, api.out); api.start(deep);
    api.every(2600, () => { const t = A.t; const o = A.osc('sine', 1300 + Math.random() * 900); const og = A.gain(); A.chain(o, og, api.out); o.frequency.setValueAtTime(o.frequency.value, t); o.frequency.exponentialRampToValueAtTime(600, t + 0.08); A.env(og, t, 0.002, 0.04, 0.15); o.start(t); o.stop(t + 0.2); }, 3000);
  }

  // 深い水の底のドローンと、遠いソナー音
  music(api) {
    const A = api.A, out = api.out;
    const lp = A.filter('lowpass', 600, 0.8); lp.connect(out); api.keep(lp);
    for (const [m, d] of [[33, 0], [40, 6], [45, -5]]) {
      const o = A.osc('sine', A.hz(m)); o.detune.value = d; const g = A.gain(0.05); A.chain(o, g, lp); api.start(o);
      const l = A.osc('sine', 0.05 + Math.random() * 0.05); const lg = A.gain(12); l.connect(lg); lg.connect(o.detune); api.start(l);
    }
    let tension = 0;
    const ping = () => {
      const t = A.t;
      A.note(out, 86, t, 3.5, { type: 'sine', vol: 0.03, attack: 0.003 });
      if (tension > 0.5) A.note(out, 87, t + 0.4, 3, { type: 'sine', vol: 0.02, attack: 0.003 });
      api.after(tension > 0.5 ? 2200 : 7000 + Math.random() * 3000, ping);
    };
    api.after(3000, ping);
    const trem = A.osc('sawtooth', A.hz(28)); const tf = A.filter('lowpass', 140); const tg = A.gain(0); A.chain(trem, tf, tg, out); api.start(trem);
    return { intensity: (v) => { tension = v; tg.gain.setTargetAtTime(v * 0.12, A.t, 0.6); lp.frequency.setTargetAtTime(600 + v * 600, A.t, 0.6); } };
  }
}

export default {
  id: 'level-7', code: 'LEVEL 7', name: '深海恐怖症', en: 'Thalassophobia',
  desc: '部屋の半分が、黒い水に沈んでいる。\n水はどこまでも深く、底が見えない。\n―― 水の中では、足音が「それ」に届く。',
  theme: 'flooded', tile: 3.2, height: 3.4,
  lamp: { color: [0.72, 0.9, 1.0], intensity: 1.05, radius: 7.5 },
  fog: { color: 0x04101a, density: 0.07 }, ambient: 0.03,
  map: {
    cells: [12, 12], braid: 0.6, rooms: 6, roomSize: [2, 4], pillarGrid: 0.5, darkZones: 0, sector: 6,
    lamp: { pattern: 2, density: 0.5, broken: 0.25, flicker: 0.1 },
  },
  space: { decay: 2.6, wet: 0.42, bright: 0.45 },
  events: ['drip', 'splash', 'groan', 'drip'],
  Logic: Thalassophobia,
  notes: [
    '【M.E.G. 探索記録 / Level 7】\n\n階層のあちこちが水没している。水は冷たく、底が見えない。\n水の下には、とても大きな何かがいる。\n\n水の中を歩くと、その振動が「それ」に伝わる。\n走るな。水の中で立ち止まるな。\n乾いた床に上がれば、「それ」はまた眠りにつく。\n\nこの階層を抜けるには、最も深い場所の排水口から潜るしかない。',
    '【防水袋に入ったメモ】\n\n影を見た。\n最初は水面に映った天井の影だと思った。\nでも、それは動いていた。\n僕の周りを、ゆっくり、輪を描くように。\n輪が小さくなる前に、水から上がって。',
  ],
};
