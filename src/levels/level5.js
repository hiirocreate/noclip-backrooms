// LEVEL 5「恐怖のホテル」― 古いホテルの廊下。灯りの漏れる客室は「使用中」。開けてはいけない。
// ノックには応えず、空室で補給しながら、主が徘徊するボイラー室へ降りる
import * as THREE from 'three';
import { LevelLogic } from './base.js';
import { farthestFace, wallFaces, DIRS } from '../mapgen.js';
import { plateTexture } from '../textures.js';
import { Beast } from '../entities.js';

const EMPTY_ROOM = [
  '空室だ。ベッドは整えられている……誰のために？',
  '空室だ。鏡には、何も映っていない',
  '空室だ。チェックアウトの時刻が、壁一面に書かれている',
  '空室だ。テーブルに冷めた紅茶が置いてある',
];

class TerrorHotel extends LevelLogic {
  plan(map) {
    super.plan(map);
    const rnd = map.rnd, W = map.W;
    // ボイラー室(出口)：いちばん奥
    this.exitFace = farthestFace(map, this.used);
    // フロントの呼び鈴：スタート地点の壁
    const s = map.start;
    const d = DIRS.find(([dx, dy]) => map.tiles[(s.y + dy) * W + s.x + dx] === 1);
    this.deskFace = d ? { x: s.x, y: s.y, dx: d[0], dy: d[1] } : null;
    if (this.deskFace) this.used.add(s.y * W + s.x);
    // 客室の扉(廊下の壁)
    const ex = this.exitFace;
    this.rooms = [];
    const faces = wallFaces(map, (p) => !map.roomTiles[p.y * W + p.x]).sort(() => rnd() - 0.5);
    for (const f of faces) {
      if (this.rooms.length >= 28) break;
      const k = f.y * W + f.x;
      if (this.used.has(k) || map.dist[k] < 3) continue;
      if (Math.abs(ex.x - f.x) + Math.abs(ex.y - f.y) < 3) continue;
      if (this.rooms.some(r => Math.abs(r.x - f.x) + Math.abs(r.y - f.y) < 3)) continue;
      const lit = rnd() < 0.4;
      const item = !lit && rnd() < 0.5 ? (rnd() < 0.6 ? 'water' : 'battery') : null;
      this.rooms.push({ ...f, lit, item, no: 0 });
      this.used.add(k);
    }
    // 部屋番号(フロントから遠いほど大きい)
    this.rooms.sort((a, b) => map.dist[a.y * W + a.x] - map.dist[b.y * W + b.x]);
    this.rooms.forEach((r, i) => { r.no = 100 * (1 + Math.floor(i / 7)) + 1 + (i % 7) * 2 + Math.floor(rnd() * 2); r.id = i; });
  }

  build(world) {
    super.build(world);
    const g = this.game;
    // ボイラー室の扉
    this.boiler = world.addDoor(this.exitFace, { style: 'metal', w: 1.2, sign: 'ボイラー室' });
    world.addDecal(this.exitFace, 'hazard', { w: 0.5, h: 0.38, y: 1.5, along: 0.95 });
    this.addInteract({ pos: this.boiler.pos, radius: 1.4, label: 'ボイラー室へ降りる', action: () => { this.say('熱気の中へ、階段を降りていく……', 2); this.exit(); } });
    // フロント
    if (this.deskFace) {
      world.addDecal(this.deskFace, 'bell', { w: 0.45, h: 0.45, y: 1.1 });
      world.addDecal(this.deskFace, plateTexture('FRONT DESK', { w: 384, h: 96 }), { w: 1.1, h: 0.28, y: 2.2 });
      this.addInteract({ pos: world.facePos(this.deskFace, 0.7), radius: 1.3, label: '呼び鈴を鳴らす', action: () => this.ringBell() });
    }
    // 客室
    this.glows = [];
    for (const r of this.rooms) {
      r.door = world.addDoor(r, { style: 'hotel', w: 1.0, h: 2.2 });
      world.addDecal(r, plateTexture(String(r.no)), { w: 0.3, h: 0.11, y: 1.75, off: 0.05 });
      if (r.lit) this.addLightUnder(r);
      this.addInteract({ pos: r.door.pos, radius: 1.3, label: `${r.no}号室のドアを開ける`, enabled: () => !r.opened, action: () => this.openRoom(r) });
    }
  }

  // 扉の下から漏れる灯り
  addLightUnder(r) {
    const w = this.world;
    const p = w.facePos(r, 0.05);
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 0.035), new THREE.MeshBasicMaterial({ color: 0xffb055, fog: false }));
    strip.position.set(p.x, 0.02, p.z);
    strip.lookAt(p.x - r.dx, 0.02, p.z - r.dy);
    w.group.add(strip);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.8), new THREE.MeshBasicMaterial({ map: w.common.halo, color: 0xff9a3a, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.rotation.x = -Math.PI / 2; glow.rotation.z = r.dx ? Math.PI / 2 : 0;
    const q = w.facePos(r, 0.4);
    glow.position.set(q.x, 0.015, q.z);
    w.group.add(glow);
    r.strip = strip; r.glow = glow;
    this.glows.push(r);
  }

  items() { return this.supplies({ batteries: 1, waters: 1 }); }

  spawn() {
    const g = this.game, w = this.world, f = this.exitFace;
    // ボイラー室の主は、扉の近くを縄張りにしている
    const home = w.tileCenter(f.x, f.y);
    const field = w.distanceField(f.x, f.y);
    const near = this.map.floorList.filter(p => { const v = field[p.y * this.map.W + p.x]; return v >= 3 && v <= 6; });
    const p = near.length ? near[Math.floor(Math.random() * near.length)] : { x: f.x, y: f.y };
    g.entities.push(new Beast(g, w.tileCenter(p.x, p.y), { home, range: 8 }));
    this.exitField = field;
  }

  start(saved) {
    super.start(saved);
    this.state.opened ||= [];
    for (const id of this.state.opened) { const r = this.rooms[id]; if (r) this.markOpened(r); }
    this.knockT = 8;
    this.warnedKnock = false;
  }

  ringBell() {
    const g = this.game;
    g.audio.bell();
    g.makeNoise(g.player.pos, 8, true);
    setTimeout(() => {
      if (!this.world) return;
      const b = this.boiler.pos;
      g.audio.distantEvent({ x: b.x, y: 1.5, z: b.z }, 'bell');
      this.say('……どこか遠くで、同じベルが鳴り返した', 3);
    }, 2200);
  }

  markOpened(r) {
    r.opened = true;
    // 開いた扉の向こうは暗い
    const w = this.world, mat = r.door.mat;
    const i = w.decals.findIndex(d => d.mat === mat);
    if (i >= 0) w.decals.splice(i, 1);
    mat.map = null; mat.emissiveMap = null;
    mat.color.set(r.lit ? 0x1a0805 : 0x040302); mat.emissive.set(r.lit ? 0x2a0c04 : 0x000000);
    mat.needsUpdate = true;
    if (r.strip) r.strip.visible = false;
    if (r.glow) r.glow.material.opacity = r.lit ? 0.2 : 0;
  }

  openRoom(r) {
    const g = this.game, p = g.player;
    this.state.opened.push(r.id);
    this.markOpened(r);
    if (r.lit) {
      // 使用中の部屋。中の「誰か」がこちらを振り向く
      g.audio.stinger();
      g.audio.doorRattle(r.door.pos);
      g.flashBlack(0.5);
      p.sanity = Math.max(1, p.sanity - 30);
      const eyes = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.world.common.eyes, color: 0xffd0a0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true }));
      const q = this.world.facePos(r, -0.3);
      eyes.position.set(q.x, 1.65, q.z); eyes.scale.set(0.4, 0.2, 1);
      this.world.group.add(eyes);
      setTimeout(() => { eyes.visible = false; }, 1400);
      this.say('……使用中の部屋だった。中の「誰か」が、こちらを振り向いた', 3.5);
      g.makeNoise(r.door.pos, 26, true);
    } else if (r.item === 'water') {
      p.waters++; g.audio.pickup(); this.say('空室。枕元にアーモンド水が置いてあった');
    } else if (r.item === 'battery') {
      p.battery = Math.min(100, p.battery + 40); g.audio.pickup(); this.say('空室。引き出しに電池が入っていた');
    } else {
      g.audio.click();
      this.say(EMPTY_ROOM[r.id % EMPTY_ROOM.length], 3);
    }
    g.saveProgress();
  }

  objective() { return 'ボイラー室を探せ（灯りの漏れる部屋は開けるな）'; }
  status() {
    const p = this.game.player.pos, w = this.world;
    const [tx, ty] = w.toTile(p.x, p.z);
    const d = this.exitField?.[ty * this.map.W + tx] ?? 99;
    if (d >= 0 && d < 8) return 'ボイラーの熱気が漂ってくる';
    return '';
  }
  tension() {
    const p = this.game.player.pos, w = this.world;
    const [tx, ty] = w.toTile(p.x, p.z);
    const d = this.exitField?.[ty * this.map.W + tx] ?? 99;
    return d >= 0 && d < 10 ? 0.5 : 0;
  }
  // どこにいても、誰かに見られている気がする
  sanityRate() { return -0.15; }

  update(dt) {
    const g = this.game, p = g.player;
    // 使用中の部屋からのノック
    this.knockT -= dt;
    if (this.knockT <= 0) {
      this.knockT = 9 + Math.random() * 8;
      const cand = this.rooms.filter(r => r.lit && !r.opened && r.door.pos.distanceTo(p.pos) < 16);
      const r = cand[Math.floor(Math.random() * cand.length)];
      if (r) {
        g.audio.distantEvent({ x: r.door.pos.x, y: 1.3, z: r.door.pos.z }, 'knock');
        if (r.door.pos.distanceTo(p.pos) < 2.6) {
          p.sanity = Math.max(1, p.sanity - 6);
          if (!this.warnedKnock) { this.warnedKnock = true; this.say('ノックに応えてはいけない', 3); }
        }
      }
    }
    // 漏れる灯りがゆらぐ(中で誰かが動いている)
    for (const r of this.glows) if (!r.opened) r.glow.material.opacity = 0.38 + Math.sin(g.time * 2 + r.id) * 0.06 + (Math.random() < 0.01 ? -0.3 : 0);
  }

  /* ---------- 音 ---------- */
  ambient(api) {
    const A = api.A;
    // 部屋鳴り
    const n = A.noise(true); const f = A.filter('lowpass', 180); const g = A.gain(0.18);
    A.chain(n, f, g, api.out); api.start(n);
    const hum = A.osc('sine', 55); const hg = A.gain(0.02); A.chain(hum, hg, api.out); api.start(hum);
    // 古い暖房管のカチカチ音
    api.every(1700, () => {
      const t = A.t; const k = A.noise(); const kf = A.filter('bandpass', 2600, 5); const kg = A.gain();
      A.chain(k, kf, kg, api.out); A.env(kg, t, 0.001, 0.12, 0.03); k.start(t); k.stop(t + 0.05);
    }, 1400);
  }

  // どこからか聞こえる、蓄音機のワルツ(3拍子)
  music(api) {
    const A = api.A, out = api.out;
    const lp = A.filter('lowpass', 2200, 0.6); const hp = A.filter('highpass', 180); A.chain(lp, hp, out); api.keep(lp, hp);
    const warble = A.osc('sine', 0.55); const wg = A.gain(18); warble.connect(wg); api.start(warble);
    // レコードのノイズ
    const crackle = A.noise(); const cf = A.filter('highpass', 3000); const cg = A.gain(0.004); A.chain(crackle, cf, cg, out); api.start(crackle);
    api.every(120, () => {
      if (Math.random() > 0.3) return;
      const t = A.t; const k = A.noise(); const kg = A.gain(); A.chain(k, kg, out); A.env(kg, t, 0.001, 0.02 + Math.random() * 0.03, 0.01); k.start(t); k.stop(t + 0.02);
    });
    const bars = [[45, [57, 60, 64]], [50, [57, 62, 65]], [52, [56, 59, 62, 64]], [45, [57, 60, 64]], [41, [57, 60, 65]], [50, [57, 62, 65]], [52, [56, 59, 64]], [45, [57, 60, 64]]];
    const melody = [76, 74, 72, 71, 72, 69, 68, 69];
    let bar = 0, beat = 0, tension = 0;
    const tick = () => {
      const t = A.t, [bass, chord] = bars[bar % bars.length];
      const vol = 1 - tension * 0.4;
      if (beat === 0) {
        A.note(lp, bass, t, 0.9, { type: 'triangle', vol: 0.05 * vol, attack: 0.01, mod: wg });
        if (Math.random() < 0.7) A.note(lp, melody[bar % melody.length] + (tension > 0.4 ? 1 : 0), t, 1.6, { type: 'sine', vol: 0.02 * vol, attack: 0.03, fm: 0.4, mod: wg });
      } else {
        chord.forEach((m, k) => A.note(lp, m + (tension > 0.6 && k === 0 ? 1 : 0), t + k * 0.01, 0.45, { type: 'sine', vol: 0.012 * vol, attack: 0.01, mod: wg }));
      }
      beat = (beat + 1) % 3; if (beat === 0) bar++;
      api.after(620 + tension * 380, tick);
    };
    tick();
    return { intensity: (v) => { tension = v; lp.frequency.setTargetAtTime(2200 - v * 1500, A.t, 0.5); wg.gain.setTargetAtTime(18 + v * 50, A.t, 0.5); } };
  }
}

export default {
  id: 'level-5', code: 'LEVEL 5', name: '恐怖のホテル', en: 'Terror Hotel',
  desc: '古びたホテルの廊下が、どこまでも続いている。\n扉の下から灯りが漏れている部屋は「使用中」だ。\n―― ノックには、応えてはいけない。',
  theme: 'hotel', tile: 3.0, height: 3.1,
  lamp: { color: [1.0, 0.76, 0.5], intensity: 1.15, radius: 7.5 },
  fog: { color: 0x120806, density: 0.06 }, ambient: 0.04, chaseSpeed: 3.5,
  map: {
    cells: [13, 13], braid: 0.35, rooms: 4, roomSize: [2, 3], pillarGrid: 0.6, darkZones: 0, sector: 6,
    lamp: { pattern: 2, density: 0.65, broken: 0.15, flicker: 0.08 },
  },
  space: { decay: 0.9, wet: 0.16, bright: 0.3 },
  events: ['knock', 'party', 'clock', 'steps', 'bell'],
  Logic: TerrorHotel,
  notes: [
    '【M.E.G. 探索記録 / Level 5】\n\n1920年代風のホテル。廊下と客室が延々と続く。\n一部の客室の扉の下から灯りが漏れている。\nその部屋は「使用中」だ。絶対に開けるな。\n灯りの漏れていない空室には、補給品が残っていることがある。\n\nボイラー室には「主」がいる。\n近くでは身を低くして、静かに通り抜けること。',
    '【ご宿泊のお客様へ（色あせた案内状）】\n\n一、灯りの点いているお部屋は、ほかのお客様がご使用中です。\n　　お静かに願います。\n一、ノックには、お応えにならないでください。\n一、ボイラー室より下の階へは、お客様の責任でお進みください。\n\n　　　　　　　　　　　　　　　　支配人',
  ],
};
