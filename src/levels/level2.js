// LEVEL 2「配管の夢」― 扉と印。ほとんどの扉は開かないか、向こうが「虚無」。
// 先人のチョークの印と、壁の刻印「Ⅲ」を頼りに本物の扉を探す。直列配線の照明は区画ごと落ちる
import * as THREE from 'three';
import { LevelLogic } from './base.js';
import { wallFaces, DIRS } from '../mapgen.js';
import { Smiler, spawnEntity } from '../entities.js';

class PipeDreams extends LevelLogic {
  plan(map) {
    super.plan(map);
    const rnd = map.rnd, W = map.W;
    const faces = wallFaces(map).sort(() => rnd() - 0.5);
    const maxD = Math.max(...map.floorList.map(p => map.dist[p.y * W + p.x]));
    // 本物の扉：遠い場所の壁
    this.exitFace = faces.find(f => map.dist[f.y * W + f.x] > maxD * 0.75);
    this.used.add(this.exitFace.y * W + this.exitFace.x);
    // ほかの扉(鍵がかかっている / 虚無)
    this.doors = [];
    for (const f of faces) {
      if (this.doors.length >= 18) break;
      const k = f.y * W + f.x;
      if (this.used.has(k) || map.dist[k] < 3) continue;
      if (this.doors.some(d => Math.abs(d.x - f.x) + Math.abs(d.y - f.y) < 4)) continue;
      if (Math.abs(this.exitFace.x - f.x) + Math.abs(this.exitFace.y - f.y) < 3) continue;
      const kind = rnd() < 0.6 ? 'locked' : 'void';
      this.doors.push({ ...f, kind, marked: kind === 'void' && rnd() < 0.55 });
      this.used.add(k);
    }
  }

  build(world) {
    super.build(world);
    const map = this.map, W = map.W;
    world.addPipes(wallFaces(map, () => map.rnd() < 0.6));
    // 本物の扉と刻印
    const ex = this.exitFace;
    this.exitDoor = world.addDoor(ex, { style: 'metal', w: 1.1, h: 2.1 });
    world.addDecal(ex, 'engrave', { w: 0.55, h: 0.55, y: 1.45, along: 0.95 });
    // その他の扉
    for (const d of this.doors) {
      d.obj = world.addDoor(d, { style: 'metal', w: 1.1, h: 2.1 });
      if (d.marked) world.addDecal(d, 'cross', { w: 0.8, h: 0.8, y: 1.3, along: 0, off: 0.07 });
      this.addInteract({
        pos: d.obj.pos, radius: 1.3, label: '扉を開ける',
        enabled: () => !d.tried,
        action: () => this.tryDoor(d),
      });
    }
    this.addInteract({ pos: this.exitDoor.pos, radius: 1.3, label: '扉を開ける', action: () => this.exit() });
    // 先人のチョークの矢印：出口までの道の分かれ道に
    const field = world.distanceField(ex.x, ex.y);
    this.exitField = field;
    let arrows = 0;
    for (const p of map.floorList) {
      const k = p.y * W + p.x, d = field[k];
      if (d <= 1) continue;
      const open = DIRS.filter(([dx, dy]) => map.tiles[(p.y + dy) * W + p.x + dx] === 0);
      if (open.length < 3 || map.rnd() > 0.55) continue;
      // 出口に近づく方向
      const next = open.find(([dx, dy]) => field[(p.y + dy) * W + p.x + dx] === d - 1);
      if (!next) continue;
      // その方向と平行な壁面に描く
      const wall = DIRS.find(([dx, dy]) => map.tiles[(p.y + dy) * W + p.x + dx] === 1 && dx * next[0] + dy * next[1] === 0);
      if (!wall) continue;
      const face = { x: p.x, y: p.y, dx: wall[0], dy: wall[1] };
      const right = [-face.dy, face.dx];
      const flip = right[0] * next[0] + right[1] * next[1] < 0;
      world.addDecal(face, 'arrow', { w: 0.9, h: 0.45, y: 1.2, flip });
      arrows++;
    }
    this.arrows = arrows;
  }

  items() { return this.supplies({ batteries: 3, waters: 3 }); }

  spawn() {
    const g = this.game;
    for (let i = 0; i < 2; i++) g.entities.push(spawnEntity(g, 'hound', 18));
  }

  start(saved) {
    super.start(saved);
    for (const d of this.doors) if ((this.state.tried || []).includes(`${d.x},${d.y},${d.dx},${d.dy}`)) d.tried = true;
    this.popT = 25 + Math.random() * 20;
    this.darkCircuit = -1;
    this.lurker = null;
  }

  tryDoor(d) {
    const g = this.game;
    d.tried = true;
    (this.state.tried ||= []).push(`${d.x},${d.y},${d.dx},${d.dy}`);
    if (d.kind === 'locked') {
      g.audio.doorRattle(d.obj.pos);
      g.makeNoise(d.obj.pos, 16);
      this.say('鍵がかかっている……大きな音を立ててしまった', 3);
    } else {
      g.audio.voidRoom();
      g.flashBlack(1.6);
      g.player.sanity = Math.max(1, g.player.sanity - 22);
      this.say('扉の向こうには、何もなかった。光も、音も。', 4);
    }
    g.saveProgress();
  }

  objective() { return '壁に「Ⅲ」と刻まれた扉を探せ'; }
  status() { return this.darkCircuit >= 0 ? 'この区画の照明が落ちている' : ''; }
  tension() { return this.darkCircuit >= 0 ? 0.6 : 0; }

  update(dt) {
    const g = this.game, w = this.world, p = g.player;
    // 直列配線：電球がひとつ弾けると、その区画がまとめて消える
    this.popT -= dt;
    if (this.darkCircuit < 0 && this.popT <= 0) {
      const lamps = this.map.lamps.filter(l => l.state === 'on' && !l.color && Math.hypot((l.x + 0.5) * w.T - p.pos.x, (l.y + 0.5) * w.T - p.pos.z) < 25);
      const l = lamps[Math.floor(Math.random() * lamps.length)];
      if (l) {
        this.darkCircuit = l.circuit; this.darkT = 18 + Math.random() * 12;
        g.audio.distantEvent({ x: (l.x + 0.5) * w.T, y: w.H, z: (l.y + 0.5) * w.T }, 'pop');
        w.setCircuit(l.circuit, 0.04);
        // 暗がりに「笑顔」
        const cand = this.map.floorList.filter(q => {
          const c = (Math.floor(q.x / 5) + Math.floor(q.y / 5) * 3) % 4;
          const d = Math.hypot((q.x + 0.5) * w.T - p.pos.x, (q.y + 0.5) * w.T - p.pos.z);
          return c === l.circuit && d > 9 && d < 30;
        });
        if (cand.length) {
          const q = cand[Math.floor(Math.random() * cand.length)];
          this.lurker = new Smiler(g, w.tileCenter(q.x, q.y));
          g.entities.push(this.lurker);
        }
      } else this.popT = 10;
    }
    if (this.darkCircuit >= 0) {
      this.darkT -= dt;
      if (this.darkT <= 0) {
        w.setCircuit(this.darkCircuit, 1); this.darkCircuit = -1; this.popT = 30 + Math.random() * 25;
        if (this.lurker) { this.lurker.dispose(); g.entities.splice(g.entities.indexOf(this.lurker), 1); g.onChaseEnd(this.lurker); this.lurker = null; }
      }
    }
  }

  /* ---------- 音 ---------- */
  ambient(api) {
    const A = api.A;
    A.fluoHum(api, 60, 0.5);
    // 配管のうなりと、管の中を流れる水
    const r = A.noise(true); const rf = A.filter('lowpass', 120); const rg = A.gain(0.45);
    A.chain(r, rf, rg, api.out); api.start(r);
    const w = A.noise(); const wf = A.filter('bandpass', 650, 3); const wg = A.gain(0.05);
    A.chain(w, wf, wg, api.out); api.start(w);
    const lfo = A.osc('sine', 0.13); const lg = A.gain(200); lfo.connect(lg); lg.connect(wf.frequency); api.start(lfo);
    const hum = A.osc('sine', 43); const hg = A.gain(0.05); A.chain(hum, hg, api.out); api.start(hum);
    // 金属の熱膨張のきしみ
    api.every(6000, () => {
      const t = A.t; const o = A.osc('triangle', 300 + Math.random() * 500); const g = A.gain(); const f = A.filter('bandpass', 900, 12);
      A.chain(o, f, g, api.out); o.frequency.exponentialRampToValueAtTime(120 + Math.random() * 80, t + 0.8);
      A.env(g, t, 0.05, 0.05, 0.9); A.oneShot(o, 1);
    }, 6000);
  }

  // 遠くで打ちつける機械の拍と、金属の残響音
  music(api) {
    const A = api.A, out = api.out;
    const drone = A.osc('sawtooth', A.hz(26)); const df = A.filter('lowpass', 110); const dg = A.gain(0.08);
    A.chain(drone, df, dg, out); api.start(drone);
    const ping = [62, 65, 67, 69, 72, 74];
    let beat = 0, fast = 0;
    api.every(900, () => {
      const t = A.t;
      // ドン…(遠くのプレス機)
      const n = A.noise(true); const f = A.filter('lowpass', 160); const g = A.gain(); A.chain(n, f, g, out);
      A.env(g, t, 0.005, beat % 4 === 0 ? 0.7 : 0.35, 0.35); A.oneShot(n, 0.45);
      if (fast > 0.3) { const h = A.noise(); const hf = A.filter('highpass', 5000); const hg = A.gain(); A.chain(h, hf, hg, out); A.env(hg, t + 0.45, 0.001, 0.08 * fast, 0.05); h.start(t + 0.45); h.stop(t + 0.5); }
      if (Math.random() < 0.35) {
        const m = ping[Math.floor(Math.random() * ping.length)];
        const o = A.noise(); const bf = A.filter('bandpass', A.hz(m), 60); const bg = A.gain(); A.chain(o, bf, bg, out);
        A.env(bg, t, 0.002, 1.4, 2.2); A.oneShot(o, 2.3);
      }
      beat++;
    });
    return { intensity: (v) => { fast = v; df.frequency.setTargetAtTime(110 + v * 300, A.t, 0.5); } };
  }
}

export default {
  id: 'level-2', code: 'LEVEL 2', name: '配管の夢', en: 'Pipe Dreams',
  desc: 'どこまでも続く保守用トンネル。壁を埋める配管と、無数の扉。\n開く扉は、ほとんどない。\n―― 先人の残した印だけが、道しるべになる。',
  theme: 'pipes', tile: 2.6, height: 2.8, floorScale: 1.6,
  lamp: { color: [1.0, 0.62, 0.36], intensity: 1.3, radius: 7.5 },
  fog: { color: 0x120806, density: 0.085 }, ambient: 0.03, chaseSpeed: 3.9,
  map: {
    cells: [14, 14], braid: 0.32, rooms: 3, roomSize: [2, 3], pillarChance: 0.05, darkZones: 1, sector: 5,
    lamp: { pattern: 2, density: 0.5, broken: 0.15, flicker: 0.12 },
  },
  space: { decay: 1.7, wet: 0.35, bright: 0.75 },
  events: ['steam', 'clank', 'clank', 'drip', 'whisper'],
  Logic: PipeDreams,
  notes: [
    '【油で汚れたメモ】\n\nここの扉は、ほとんど開かない。\n鍵のかかった扉を揺らすと、音が響く。\n音を聞きつけて「猟犬」が来る。あいつらは目が見えないが、耳がいい。\n\n開いたとしても安心するな。\n扉の向こうが、真っ暗な「何もない部屋」のことがある。\n入った者は、少しおかしくなって帰ってくる。',
    '【壁に貼られた紙】\n\n次の階層へ続く扉の横には、壁に「Ⅲ」と刻まれている。\n\n先に通った連中が、分かれ道にチョークで矢印を残している。\n「✕」の付いた扉は、誰かが開けて後悔した扉だ。\n\n※照明は直列配線。一つ切れると、その区画はまとめて消える。',
  ],
};
