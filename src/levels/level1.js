// LEVEL 1「居住区画」― 補給箱と停電。停電中は光に群がる「笑顔」が現れる。緑の非常灯の下だけが安全
import * as THREE from 'three';
import { LevelLogic } from './base.js';
import { farthestFace, wallFaces, DIRS } from '../mapgen.js';
import { Smiler } from '../entities.js';

const SHELTER_COLOR = [0.25, 1.0, 0.45];

class Habitable extends LevelLogic {
  plan(map) {
    super.plan(map);
    const rnd = map.rnd, W = map.W;
    // 出口：M.E.G. の無線が示す「保守通路」への扉(=Level 2)
    this.exitFace = farthestFace(map, this.used);
    this.exitDist = null;
    // 避難所：廊下の行き止まりや細い通路に緑の非常灯
    const corridor = map.floorList.filter(p => !map.roomTiles[p.y * W + p.x]);
    const deadEnds = corridor.filter(p => DIRS.filter(([dx, dy]) => map.tiles[(p.y + dy) * W + p.x + dx] === 0).length === 1);
    const pool = (deadEnds.length >= 6 ? deadEnds : corridor).sort(() => rnd() - 0.5);
    this.shelters = [];
    for (const p of pool) {
      if (this.shelters.length >= 7) break;
      if (Math.abs(p.x - map.start.x) + Math.abs(p.y - map.start.y) < 3) continue;
      if (this.shelters.some(s => Math.abs(s.x - p.x) + Math.abs(s.y - p.y) < 7)) continue;
      this.shelters.push(p);
      map.lamps = map.lamps.filter(l => !(l.x === p.x && l.y === p.y));
      map.lamps.push({ x: p.x, y: p.y, state: 'on', circuit: 0, color: SHELTER_COLOR, intensity: 1.2, radius: 5.5 });
      this.used.add(p.y * W + p.x);
    }
    // スタート地点も避難所にしておく
    this.shelters.push({ x: map.start.x, y: map.start.y });
    map.lamps.push({ x: map.start.x, y: map.start.y, state: 'on', circuit: 0, color: SHELTER_COLOR, intensity: 1.0, radius: 5 });
  }

  build(world) {
    super.build(world);
    const T = world.T;
    // 出口の扉と、そこへ近づくほど増える配管(工業的になっていく)
    this.door = world.addDoor(this.exitFace, { style: 'metal', sign: '保守通路' });
    this.door.setOpen(true);
    const ef = this.exitFace;
    this.exitField = world.distanceField(ef.x, ef.y);
    const W = this.map.W;
    const pipeFaces = wallFaces(this.map, (p) => { const d = this.exitField[p.y * W + p.x]; return d >= 0 && d < 12 && this.map.rnd() < 1 - d / 13; });
    world.addPipes(pipeFaces, { color: 0x5a554c, emissive: 0x0a0a08 });
    this.maxDist = Math.max(...this.map.floorList.map(p => this.exitField[p.y * W + p.x]));
    // 避難所の目印
    for (const s of this.shelters) {
      const face = DIRS.map(([dx, dy]) => ({ x: s.x, y: s.y, dx, dy })).find(f => this.map.tiles[(f.y + f.dy) * W + f.x + f.dx] === 1);
      if (face) { world.addDecal(face, 'exitGreen', { w: 0.9, h: 0.34, y: 2.6, basic: true }); world.addDecal(face, 'meg', { w: 1.2, h: 0.6, y: 1.4 }); }
    }
    // 補給箱(見ていない間に消えて、別の場所に現れる)
    this.crates = [];
    this.crateSerial = 0;
  }

  items() { return this.supplies({ batteries: 1, waters: 1 }); }

  start(saved) {
    super.start(saved);
    const g = this.game;
    this.phase = 'normal';
    this.phaseT = 32; // 最初の停電は早めに来る
    this.hunters = [];
    for (let i = 0; i < 7; i++) this.spawnCrate();
    this.radio = g.audio.radio();
  }

  spawnCrate(avoidView = false) {
    const g = this.game, w = this.world, m = this.map;
    for (let t = 0; t < 40; t++) {
      const p = m.floorList[Math.floor(Math.random() * m.floorList.length)];
      if (!m.roomTiles[p.y * m.W + p.x] || this.used.has(p.y * m.W + p.x)) continue;
      const c = w.tileCenter(p.x, p.y);
      c.x += (Math.random() - 0.5) * w.T * 0.5; c.z += (Math.random() - 0.5) * w.T * 0.5;
      const pp = g.player.pos;
      if (Math.hypot(c.x - pp.x, c.z - pp.z) < 6) continue;
      if (avoidView && g.canSee(new THREE.Vector3(c.x, 0.5, c.z), 0.3)) continue;
      if (this.crates.some(k => Math.hypot(k.x - c.x, k.z - c.z) < 5)) continue;
      const box = w.addBoxProp(c.x, c.z, { size: 0.9, h: 0.9, tex: 'crate' });
      const type = Math.random() < 0.55 ? 'battery' : 'water';
      const item = g.items.add({ id: `crate-${this.crateSerial++}`, type, x: p.x, y: p.y, wx: c.x, wz: c.z, y0: 1.15 });
      this.crates.push({ box, item, x: c.x, z: c.z, unseen: 0 });
      return;
    }
  }

  isSafe(x, z) {
    const T = this.world.T;
    return this.shelters.some(s => Math.hypot((s.x + 0.5) * T - x, (s.y + 0.5) * T - z) < T * 1.1);
  }

  objective() {
    if (this.phase === 'dark' || this.phase === 'warning') return '緑の灯りの下へ避難しろ。ライトは消せ';
    return 'M.E.G. の無線を頼りに「保守通路」を探せ';
  }
  status() {
    const bars = Math.round((this.strength || 0) * 5);
    return `無線 ${'■'.repeat(bars)}${'□'.repeat(5 - bars)}`;
  }
  tension() { return this.phase === 'dark' ? 1 : this.phase === 'warning' ? 0.6 : 0; }

  sanityRate(p) {
    if (this.isSafe(p.pos.x, p.pos.z)) return 0.6;
    return this.phase === 'dark' ? -0.6 : 0;
  }

  update(dt) {
    const g = this.game, p = g.player, w = this.world, T = w.T;
    // 無線の強さ = 出口までの道のり
    const [tx, ty] = w.toTile(p.pos.x, p.pos.z);
    const dd = this.exitField[ty * this.map.W + tx];
    this.strength = dd >= 0 ? Math.max(0, 1 - dd / this.maxDist) ** 1.5 : 0;
    this.radio?.set(this.strength, this.phase !== 'dark');

    // 出口
    if (Math.hypot(p.pos.x - this.door.pos.x, p.pos.z - this.door.pos.z) < 1.2) { this.exit(); return; }

    // 停電サイクル
    this.phaseT -= dt;
    if (this.phase === 'normal' && this.phaseT <= 0) {
      this.phase = 'warning'; this.phaseT = 4.5;
      this.say('照明が不安定だ…緑の灯り(避難所)へ急げ', 4);
      g.audio.distantEvent({ x: p.pos.x, y: 3, z: p.pos.z }, 'buzz');
    } else if (this.phase === 'warning') {
      w.setPower(Math.random() < 0.35 ? 0.15 : 1);
      if (this.phaseT <= 0) {
        this.phase = 'dark'; this.phaseT = 22;
        w.setPower(0.03); g.audio.powerDown();
        for (let i = 0; i < 4; i++) this.spawnHunter();
      }
    } else if (this.phase === 'dark') {
      w.setPower(0.03);
      if (this.phaseT <= 0) { this.phase = 'restore'; this.phaseT = 1.6; }
    } else if (this.phase === 'restore') {
      w.setPower(Math.random() < 0.5 ? 1 : 0.1);
      for (const h of this.hunters) if (h.state !== 'fade') h.setState('fade');
      if (this.phaseT <= 0) { this.phase = 'normal'; this.phaseT = 65 + Math.random() * 35; w.setPower(1); this.say('明かりが戻った', 2); }
    }
    for (const h of this.hunters) if (h.gone || (h.state === 'fade' && h.stateTime > 1.2)) { h.dispose(); g.entities.splice(g.entities.indexOf(h), 1); h.gone = true; }
    this.hunters = this.hunters.filter(h => !h.gone);

    // 補給箱：見ていない間に消えて、別の場所へ
    for (const c of this.crates) {
      const seen = g.canSee(new THREE.Vector3(c.x, 0.5, c.z), 0.3) && Math.hypot(c.x - p.pos.x, c.z - p.pos.z) < 30;
      c.unseen = seen ? 0 : c.unseen + dt;
      const empty = !c.item?.alive;
      if (c.unseen > (empty ? 12 : 60) && Math.hypot(c.x - p.pos.x, c.z - p.pos.z) > 10) {
        c.box.remove(); if (c.item?.alive) g.items.remove(c.item);
        c.dead = true;
      }
    }
    const before = this.crates.length;
    this.crates = this.crates.filter(c => !c.dead);
    for (let i = this.crates.length; i < before; i++) this.spawnCrate(true);
  }

  spawnHunter() {
    const g = this.game, w = this.world, p = g.player;
    for (let t = 0; t < 30; t++) {
      const q = this.map.floorList[Math.floor(Math.random() * this.map.floorList.length)];
      const c = w.tileCenter(q.x, q.y);
      const d = Math.hypot(c.x - p.pos.x, c.z - p.pos.z);
      if (d < 10 || d > 24 || this.isSafe(c.x, c.z)) continue;
      const s = new Smiler(g, c, { hunter: true });
      g.entities.push(s); this.hunters.push(s);
      return;
    }
  }

  dispose() { this.radio?.stop(); }

  /* ---------- 音 ---------- */
  ambient(api) {
    const A = api.A;
    A.fluoHum(api, 60, 0.8);
    // 広い空間を抜ける風
    const n = A.noise(); const f = A.filter('bandpass', 400, 0.6); const g = A.gain(0.08);
    A.chain(n, f, g, api.out); api.start(n);
    const lfo = A.osc('sine', 0.05); const lg = A.gain(250); lfo.connect(lg); lg.connect(f.frequency); api.start(lfo);
    // 遠くの機械のうなり
    const r = A.noise(true); const rf = A.filter('lowpass', 70); const rg = A.gain(0.3);
    A.chain(r, rf, rg, api.out); api.start(r);
  }

  // 低いうなりと鐘のような2音。停電中は不協和なトレモロが重なる
  music(api) {
    const A = api.A, out = api.out;
    const drone = A.osc('sine', A.hz(33)); const dg = A.gain(0.07); A.chain(drone, dg, out); api.start(drone);
    const d2 = A.osc('triangle', A.hz(40)); const d2g = A.gain(0.02); A.chain(d2, d2g, out); api.start(d2);
    const motif = [[69, 76], [69, 74], [67, 72], [69, 65]];
    let i = 0;
    api.every(7800, () => { const t = A.t; motif[i % 4].forEach((m, k) => A.note(out, m, t + k * 1.1, 4.5, { type: 'sine', vol: 0.03, attack: 0.01, fm: 1.4 })); i++; }, 1500);
    // 緊張レイヤー
    const tense = A.gain(0); tense.connect(out); api.keep(tense);
    for (const m of [57, 58, 63.5, 70]) {
      const o = A.osc('sawtooth', A.hz(m)); const f = A.filter('lowpass', 1400, 2); const og = A.gain(0.018);
      A.chain(o, f, og, tense); api.start(o);
      const tr = A.osc('sine', 7 + Math.random() * 2); const tg = A.gain(0.015); tr.connect(tg); tg.connect(og.gain); api.start(tr);
    }
    const pulse = A.osc('sine', 45); const pg = A.gain(0); A.chain(pulse, pg, tense); api.start(pulse);
    const pl = A.osc('square', 1.6); const plg = A.gain(0.25); pl.connect(plg); plg.connect(pg.gain); api.start(pl);
    return { intensity: (v) => { tense.gain.setTargetAtTime(v, A.t, 0.6); dg.gain.setTargetAtTime(0.07 * (1 - v * 0.5), A.t, 0.6); } };
  }
}

export default {
  id: 'level-1', code: 'LEVEL 1', name: '居住区画', en: 'Habitable Zone',
  desc: 'コンクリートの倉庫。霧と、どこからか現れる補給箱。\nここは唯一「人が住める」階層だという。\n―― ただし、明かりが消えるまでは。',
  theme: 'parking', tile: 4.0, height: 4.2,
  lamp: { color: [0.82, 0.9, 1.0], intensity: 1.35, radius: 11 },
  fog: { color: 0x07090a, density: 0.06 }, ambient: 0.025,
  map: {
    cells: [12, 12], braid: 0.7, rooms: 9, roomSize: [3, 6], pillarChance: 0.15, pillarGrid: 0.5, darkZones: 1, sector: 8,
    lamp: { pattern: 2, density: 0.45, broken: 0.18, flicker: 0.12 },
  },
  space: { decay: 3.2, wet: 0.42, bright: 0.45 },
  events: ['drip', 'drip', 'steps', 'knock', 'clank'],
  Logic: Habitable,
  notes: [
    '【M.E.G. 配布ビラ】\n\nようこそ、居住区画へ。\nここでは木箱に食料・アーモンド水・電池が補給されることがある。\n箱は見ていない間に消える。見つけたら中身はすぐ取れ。\n\n■ 照明がちらつき始めたら\n緑の非常灯のある通路へ避難し、明かりが戻るまで待て。\n暗闇では「笑顔」が狩りをする。\nあれは光に引き寄せられる。ライトは必ず消すこと。',
    '【無線の書き起こし】\n\n「……こちら M.E.G. 。この周波数を聞いている者へ。\n保守通路への扉は、信号が最も強くなる方角にある。\n近づくほど、壁に配管が増えていく。\n扉の先は配管だらけの通路だ。……幸運を」',
  ],
};
