// LEVEL 3「変電所」― 電気の唸りが足音を隠す。変電室でブレーカーを上げ、エレベーターまで引き返す往復脱出。
// 電源を入れた瞬間、この階層のすべてが目を覚ます
import * as THREE from 'three';
import { LevelLogic } from './base.js';
import { farthestFace, wallFaces, DIRS, PROP } from '../mapgen.js';
import { spawnEntity } from '../entities.js';

class ElectricalStation extends LevelLogic {
  plan(map) {
    super.plan(map);
    const rnd = map.rnd, W = map.W;
    // エレベーター：スタート地点の壁
    const s = map.start;
    const d = DIRS.find(([dx, dy]) => map.tiles[(s.y + dy) * W + s.x + dx] === 1);
    this.elevFace = { x: s.x, y: s.y, dx: d[0], dy: d[1] };
    this.used.add(s.y * W + s.x);
    // ブレーカー：最も遠い壁
    this.breakerFace = farthestFace(map, this.used);
    // 機械(大部屋の中。周囲8マスが床のところだけ → 通路は塞がない)
    this.machines = [];
    const ok = (x, y) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (map.tiles[(y + dy) * W + x + dx] !== 0) return false; return true; };
    for (const room of map.rooms) {
      for (let y = room.y + 1; y < room.y + room.h - 1; y++) for (let x = room.x + 1; x < room.x + room.w - 1; x++) {
        if ((x + y) % 2 || rnd() > 0.55 || !ok(x, y)) continue;
        if (Math.abs(x - s.x) + Math.abs(y - s.y) < 4) continue;
        if (this.used.has(y * W + x)) continue;
        map.tiles[y * W + x] = PROP;
        map.props.set(y * W + x, { kind: rnd() < 0.75 ? 'machine' : 'cabinet', opaque: true });
        this.machines.push({ x, y });
      }
    }
    map.floorList = map.floorList.filter(p => map.tiles[p.y * W + p.x] === 0);
    // 黒い液体(神経毒)の水たまり
    this.sludge = [];
    for (let i = 0; i < 10; i++) {
      const p = this.pick({ minDist: 5, avoid: this.sludge });
      if (p) this.sludge.push(p);
    }
  }

  build(world) {
    super.build(world);
    this.elevator = world.addDoor(this.elevFace, { style: 'elevator', w: 1.6, sign: 'エレベーター' });
    const b = this.breakerFace;
    world.addDecal(b, 'breaker', { w: 1.1, h: 1.1, y: 1.4 });
    world.addDecal(b, 'hazard', { w: 0.7, h: 0.52, y: 2.35, along: 0.9 });
    this.breakerPos = world.facePos(b, 0.6);
    this.addInteract({ pos: this.breakerPos, radius: 1.4, label: 'ブレーカーを上げる', enabled: () => !this.state.power, action: () => this.powerOn() });
    this.addInteract({
      pos: this.elevator.pos, radius: 1.5, label: 'エレベーターに乗る',
      action: () => { if (this.state.power) this.exit(); else { this.say('電源が落ちている。ボタンが反応しない', 3); this.game.audio.keyBeep(false); } },
    });
    const T = world.T;
    this.sludgePos = this.sludge.map(p => {
      const x = (p.x + 0.5) * T + (Math.random() - 0.5) * T * 0.3, z = (p.y + 0.5) * T + (Math.random() - 0.5) * T * 0.3;
      world.addFloorDecal(x, z, 'sludge', 1.5, Math.random() * 6);
      return { x, z };
    });
    // 機械の近くに注意書き
    for (const m of this.machines.slice(0, 6)) {
      const f = DIRS.map(([dx, dy]) => ({ x: m.x + dx, y: m.y + dy, dx: -dx, dy: -dy })).find(f => this.map.tiles[f.y * this.map.W + f.x] === 0);
      if (f) world.addDecal(f, 'hazard', { w: 0.6, h: 0.45, y: 1.6 });
    }
    // 壁沿いのケーブル・配管
    world.addPipes(wallFaces(this.map, () => this.map.rnd() < 0.35), { heights: [[world.H - 0.3, 0.06], [world.H - 0.48, 0.045], [world.H - 0.62, 0.035]], color: 0x2a2826, emissive: 0x050404 });
  }

  items() { return this.supplies({ batteries: 4, waters: 3 }); }

  spawn() {
    const g = this.game;
    g.entities.push(spawnEntity(g, 'hound', 18), spawnEntity(g, 'hound', 22), spawnEntity(g, 'wanderer', 20));
  }

  start(saved) {
    super.start(saved);
    const g = this.game, w = this.world;
    this.machineHums = this.machines.map(m => {
      const c = w.tileCenter(m.x, m.y);
      return g.audio.loopAt({ x: c.x, y: 1.2, z: c.z }, (out, nodes) => {
        const A = g.audio;
        const o = A.osc('sawtooth', 50 + Math.random() * 0.6); const f = A.filter('lowpass', 240, 2); const og = A.gain(0.35);
        A.chain(o, f, og, out); nodes.push(o);
        const o2 = A.osc('sine', 100); const g2 = A.gain(0.2); A.chain(o2, g2, out); nodes.push(o2);
      });
    });
    this.sparkT = 8;
    this.whisperT = 0;
    this.applyPower(!!this.state.power, true);
  }

  applyPower(on, silent = false) {
    const w = this.world;
    w.setPower(on ? 1.15 : 0.42);
    this.elevator.setOpen(on);
    this.machineHums.forEach(h => h?.set(on ? 1.4 : 0.5));
  }

  powerOn() {
    const g = this.game;
    this.state.power = true;
    g.audio.breaker();
    this.applyPower(true);
    g.fx.u.flash.value = 0.35;
    setTimeout(() => g.audio.alarm(7), 900);
    this.say('電源が入った。……警報が鳴り響く。エレベーターへ戻れ！', 5);
    // すべてが目を覚ます
    g.entities.push(spawnEntity(g, 'hound', 14), spawnEntity(g, 'wanderer', 16));
    setTimeout(() => { for (const e of g.entities) if (e.type === 'hound') e.hear(this.breakerPos, 999, true); }, 1500);
    g.saveProgress();
  }

  nearMachine(pos, r = 5.5) {
    const T = this.world.T;
    return this.machines.some(m => Math.hypot((m.x + 0.5) * T - pos.x, (m.y + 0.5) * T - pos.z) < r);
  }
  noiseMul(pos) { return this.nearMachine(pos) ? 0.3 : 1; }

  objective() { return this.state.power ? 'エレベーターへ戻れ' : '変電室のブレーカーを探して電源を入れろ'; }
  status() {
    const p = this.game.player.pos;
    if (this.inSludge) return '黒い液体に足を取られている！';
    return this.nearMachine(p) ? '機械音で足音がかき消されている' : '';
  }
  tension() { return this.state.power ? 0.85 : 0.2; }

  sanityRate(p) {
    let r = 0;
    const [tx, ty] = this.world.toTile(p.pos.x, p.pos.z);
    if (this.map.dark[ty * this.map.W + tx]) r -= 0.7; // 不安の吹き溜まり
    if (this.inSludge) r -= 9;
    return r;
  }

  update(dt) {
    const g = this.game, p = g.player, w = this.world;
    // 黒い液体
    this.inSludge = this.sludgePos.some(s => Math.hypot(s.x - p.pos.x, s.z - p.pos.z) < 0.7);
    p.speedMul = this.inSludge ? 0.45 : 1;
    if (this.inSludge && !this.sludgeWarned) { this.sludgeWarned = true; this.say('黒い液体…焼けるように熱い！', 2.5); }
    // 火花：大きな音で「何か」を引きつける(うまく使えば囮になる)
    this.sparkT -= dt;
    if (this.sparkT <= 0 && this.machines.length) {
      this.sparkT = 10 + Math.random() * 12;
      const near = this.machines.filter(m => Math.hypot((m.x + 0.5) * w.T - p.pos.x, (m.y + 0.5) * w.T - p.pos.z) < 30);
      const m = near[Math.floor(Math.random() * near.length)];
      if (m) {
        const c = w.tileCenter(m.x, m.y);
        g.audio.distantEvent({ x: c.x, y: 1.8, z: c.z }, 'spark');
        if (g.canSee(new THREE.Vector3(c.x, 1.5, c.z), 0.5)) g.fx.u.flash.value = Math.max(g.fx.u.flash.value, 0.12);
        g.makeNoise(c, 14, true);
      }
    }
    // 不安の吹き溜まり：囁きが聞こえる
    const [tx, ty] = w.toTile(p.pos.x, p.pos.z);
    if (this.map.dark[ty * this.map.W + tx]) {
      this.whisperT -= dt;
      if (this.whisperT <= 0) {
        this.whisperT = 4 + Math.random() * 4;
        const a = Math.random() * 6.28;
        g.audio.distantEvent({ x: p.pos.x + Math.cos(a) * 2, y: 1.6, z: p.pos.z + Math.sin(a) * 2 }, 'whisper');
      }
    }
  }

  dispose() { this.game.player.speedMul = 1; }

  /* ---------- 音 ---------- */
  ambient(api) {
    const A = api.A;
    // 変圧器の唸り(50Hz系)
    for (const [f, v] of [[50, 0.06], [100, 0.04], [150, 0.02], [250, 0.008]]) {
      const o = A.osc('sine', f); const g = A.gain(v); A.chain(o, g, api.out); api.start(o);
    }
    // コイル鳴き
    const w = A.osc('sine', 7800); const wg = A.gain(0.002); A.chain(w, wg, api.out); api.start(w);
    const n = A.noise(); const nf = A.filter('bandpass', 120, 6); const ng = A.gain(0.2); A.chain(n, nf, ng, api.out); api.start(n);
  }

  // 電気的な刻み。電源投入後はテンポが上がり、サイレンのような音が重なる
  music(api) {
    const A = api.A, out = api.out;
    const seq = [45, 45, 52, 45, 48, 45, 51, 45];
    let i = 0, v = 0.2;
    const f = A.filter('lowpass', 500, 4); f.connect(out); api.keep(f);
    const tick = () => {
      const t = A.t;
      A.note(f, seq[i % 8] + (v > 0.6 && i % 16 >= 8 ? 1 : 0), t, 0.18, { type: 'square', vol: 0.03 + v * 0.02, attack: 0.005 });
      if (v > 0.6 && i % 2 === 0) A.note(f, seq[(i + 3) % 8] + 24, t + 0.07, 0.1, { type: 'square', vol: 0.012, attack: 0.002 });
      i++;
    };
    const loop = () => { tick(); api.after(v > 0.6 ? 140 : 260, loop); };
    loop();
    const pad = A.osc('sawtooth', A.hz(33)); const pf = A.filter('lowpass', 200); const pg = A.gain(0.05); A.chain(pad, pf, pg, out); api.start(pad);
    const siren = A.osc('triangle', 600); const sg = A.gain(0); A.chain(siren, sg, out); api.start(siren);
    const sl = A.osc('sine', 0.25); const slg = A.gain(180); sl.connect(slg); slg.connect(siren.frequency); api.start(sl);
    return { intensity: (x) => { v = x; f.frequency.setTargetAtTime(500 + x * 1500, A.t, 0.4); sg.gain.setTargetAtTime(x > 0.6 ? 0.012 : 0, A.t, 1); } };
  }
}

export default {
  id: 'level-3', code: 'LEVEL 3', name: '変電所', en: 'Electrical Station',
  desc: 'レンガの壁、うなる配電盤、黒い液体の滴る配管。\nこの階層の「何か」は、賢く、群れで狩る。\n―― 電気の唸りだけが、あなたの足音を隠してくれる。',
  theme: 'station', tile: 3.0, height: 3.4,
  lamp: { color: [1.0, 0.86, 0.62], intensity: 1.35, radius: 8.5 },
  fog: { color: 0x0b0806, density: 0.08 }, ambient: 0.03, chaseSpeed: 3.8,
  map: {
    cells: [13, 13], braid: 0.45, rooms: 7, roomSize: [3, 4], pillarChance: 0, darkZones: 2, sector: 6,
    lamp: { pattern: 2, density: 0.5, broken: 0.2, flicker: 0.16 },
  },
  space: { decay: 2.0, wet: 0.3, bright: 0.4 },
  events: ['spark', 'relay', 'clank', 'buzz', 'whisper'],
  Logic: ElectricalStation,
  notes: [
    '【M.E.G. 探索記録 / Level 3】\n\n変電設備が延々と続く。ほとんどは死んでいるが、一部はまだ唸っている。\n機械の近くでは足音がかき消される。移動はなるべく機械沿いに。\n\n床の黒い液体には絶対に触れるな。神経毒だ。\n\n火花が散ると、その音に「何か」が集まる。\n……逆に言えば、囮にもなる。',
    '【焼け焦げた作業指示書】\n\nエレベーターは主電源が落ちているため停止中。\n最奥の変電室でブレーカーを上げること。\n\n※電源投入時は警報が鳴る。\n※電源を入れた者は、速やかにエレベーターへ戻ること。\n※戻れなかった場合の責任は負いかねる。',
  ],
};
