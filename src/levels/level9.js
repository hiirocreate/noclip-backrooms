// LEVEL 9「郊外」― 真夜中の終わらない住宅街。家に電気はなく、街灯もほとんど点いていない。
// ときどき霧が出て、その中から「潰れたもの」が現れる。霧の間は鍵の開いた家に隠れてやり過ごす。
// 窓の中の人影(近所の見張り)の前で明かりを浴びると、窓を叩いて猟犬を呼ぶ。標識をたどり、家並みの外れ(麦畑)へ
import * as THREE from 'three';
import { LevelLogic } from './base.js';
import { farthestFace, wallFaces, DIRS } from '../mapgen.js';
import { spawnEntity, Mangled } from '../entities.js';

const NIGHT_FOG = 0x05070b, MIST = 0x2e3238;

class Suburbs extends LevelLogic {
  plan(map) {
    super.plan(map);
    const rnd = map.rnd, W = map.W;
    // 出口：家並みが途切れる場所(スタートから最も遠い柵)
    this.exitFace = farthestFace(map, this.used);
    // 家の玄関(半分ほどは鍵が開いている)
    const faces = wallFaces(map).sort(() => rnd() - 0.5);
    const ex = this.exitFace;
    this.houses = [];
    for (const f of faces) {
      if (this.houses.length >= 16) break;
      const k = f.y * W + f.x;
      if (this.used.has(k) || map.dist[k] < 2) continue;
      if (Math.abs(ex.x - f.x) + Math.abs(ex.y - f.y) < 3) continue;
      if (this.houses.some(h => Math.abs(h.x - f.x) + Math.abs(h.y - f.y) < 4)) continue;
      const open = this.houses.length < 3 || rnd() < 0.55; // スタートの近くにも隠れられる家がある
      this.houses.push({ ...f, open, id: this.houses.length });
      this.used.add(k);
    }
    // 見張りの窓(玄関と重ならない壁面)
    this.watchers = [];
    for (const f of faces) {
      if (this.watchers.length >= 12) break;
      const k = f.y * W + f.x;
      if (this.used.has(k) || map.dist[k] < 5) continue;
      if (this.watchers.some(h => Math.abs(h.x - f.x) + Math.abs(h.y - f.y) < 5)) continue;
      this.watchers.push({ ...f, cd: 0 });
      this.used.add(k);
    }
  }

  build(world) {
    super.build(world);
    const map = this.map, W = map.W, ex = this.exitFace;
    // 出口：壊れた柵の向こうの麦畑
    world.addDecal(ex, 'wheatview', { w: world.T * 0.96, h: world.H * 0.8, y: world.H * 0.4, off: 0.02 });
    this.exitPos = world.facePos(ex, 0.8);
    this.addInteract({ pos: this.exitPos, radius: 1.8, label: '柵を越えて畑へ踏み出す', action: () => { this.say('アスファルトが途切れ、足元が柔らかい土に変わった……', 2.5); this.exit(); } });
    // 玄関
    for (const h of this.houses) {
      h.door = world.addDoor(h, { style: 'house', w: 1.1, h: 2.2, frame: 0x8a867a });
      // ヒント：鍵の開いている家には、玄関マットが敷いてある
      if (h.open) { const m = world.facePos(h, 0.55); world.addFloorDecal(m.x, m.z, 'doormat', 1.0, h.dx ? Math.PI / 2 : 0); }
      this.addInteract({ pos: h.door.pos, radius: 1.3, label: '家に入って身を隠す', action: () => this.enterHouse(h) });
    }
    // 見張りの窓
    for (const v of this.watchers) {
      v.mesh = world.addDecal(v, 'watcher', { w: 1.05, h: 1.05, y: 1.75 });
      v.pos = world.facePos(v, 0.02); v.pos.y = 1.75;
      v.normal = new THREE.Vector3(-v.dx, 0, -v.dy);
    }
    // 標識「郊外の外れ →」：出口へ近づく方向を指す
    const field = world.distanceField(ex.x, ex.y);
    this.exitField = field;
    for (const p of map.floorList) {
      const k = p.y * W + p.x, d = field[k];
      if (d <= 1) continue;
      const open = DIRS.filter(([dx, dy]) => map.tiles[(p.y + dy) * W + p.x + dx] === 0);
      if (open.length < 3 || map.rnd() > 0.5) continue;
      const next = open.find(([dx, dy]) => field[(p.y + dy) * W + p.x + dx] === d - 1);
      if (!next) continue;
      const wall = DIRS.find(([dx, dy]) => map.tiles[(p.y + dy) * W + p.x + dx] === 1 && dx * next[0] + dy * next[1] === 0);
      if (!wall) continue;
      const face = { x: p.x, y: p.y, dx: wall[0], dy: wall[1] };
      if (this.used.has(k) && (this.houses.some(h => h.x === p.x && h.y === p.y && h.dx === face.dx && h.dy === face.dy) || this.watchers.some(h => h.x === p.x && h.y === p.y && h.dx === face.dx && h.dy === face.dy))) continue;
      const right = [-face.dy, face.dx];
      world.addDecal(face, right[0] * next[0] + right[1] * next[1] < 0 ? 'roadsignL' : 'roadsignR', { w: 1.3, h: 0.65, y: 2.9 });
    }
  }

  items() { return this.supplies({ batteries: 3, waters: 2 }); }

  spawn() {
    const g = this.game;
    g.entities.push(spawnEntity(g, 'hound', 22), spawnEntity(g, 'hound', 28));
  }

  start(saved) {
    super.start(saved);
    const g = this.game;
    this.state.searched ||= [];
    this.phase = 'clear';
    this.phaseT = 45; // 最初の霧は早めに来る
    this.fogK = 0;
    this.mangled = [];
    // 出口の向こうで風に揺れる麦
    const e = this.exitPos;
    this.wheatSound = g.audio.loopAt({ x: e.x, y: 1.2, z: e.z }, (out, nodes) => {
      const A = g.audio;
      const n = A.noise(); const f = A.filter('bandpass', 2800, 0.9); const ng = A.gain(0.3); A.chain(n, f, ng, out); nodes.push(n);
      const lfo = A.osc('sine', 0.23); const lg = A.gain(0.25); lfo.connect(lg); lg.connect(ng.gain); nodes.push(lfo);
    });
    this.wheatSound?.set(1.2);
  }

  enterHouse(h) {
    const g = this.game, p = g.player;
    if (!h.open) {
      g.audio.doorRattle(h.door.pos);
      g.makeNoise(h.door.pos, 14);
      this.say('鍵がかかっている……ノブの音が、静かな通りに響いた', 3);
      return;
    }
    g.flashBlack(2.6);
    g.audio.click();
    // 家の中でやり過ごす：霧は晴れ、追ってきたものは諦める
    const wasFog = this.phase === 'fog' || this.phase === 'rising';
    if (wasFog) this.endFog(true);
    for (const e of g.entities) if (e.type === 'hound' && e.state === 'hunt') { e.setState('sniff'); g.onChaseEnd(e); }
    p.sanity = Math.min(100, p.sanity + 15);
    let msg = wasFog ? '暗い居間で、霧が晴れるのを待った……' : '家具は新品のようなのに、どこにも電気が来ていない……';
    if (!this.state.searched.includes(h.id)) {
      this.state.searched.push(h.id);
      const r = (h.id * 7 + 3) % 4;
      if (r === 0 || r === 2) { p.waters++; g.audio.pickup(); msg += '\n台所にアーモンド水が残っていた'; }
      else if (r === 1) { p.battery = Math.min(100, p.battery + 45); g.audio.pickup(); msg += '\n引き出しに電池が入っていた'; }
    }
    setTimeout(() => this.say(msg.replace('\n', ' '), 4), 900);
    g.saveProgress();
  }

  startFog() {
    const g = this.game;
    this.phase = 'rising'; this.phaseT = 7;
    this.say('霧が出てきた……鍵の開いている家を探せ', 4);
    g.audio.distantEvent({ x: g.player.pos.x, y: 3, z: g.player.pos.z }, 'wind');
  }

  spawnMangled() {
    const g = this.game, w = this.world, p = g.player;
    for (let t = 0; t < 40; t++) {
      const q = this.map.floorList[Math.floor(Math.random() * this.map.floorList.length)];
      const c = w.tileCenter(q.x, q.y);
      const d = Math.hypot(c.x - p.pos.x, c.z - p.pos.z);
      if (d < 12 || d > 26 || g.canSee(new THREE.Vector3(c.x, 1.5, c.z), 0.3)) continue;
      const m = new Mangled(g, c);
      g.entities.push(m); this.mangled.push(m);
      return;
    }
  }

  endFog(quick = false) {
    const g = this.game;
    this.phase = 'clearing'; this.phaseT = quick ? 0.1 : 6;
    for (const m of this.mangled) { m.fading = true; m.setState('wander'); g.onChaseEnd(m); }
    if (!quick) this.say('霧が晴れていく', 2.5);
  }

  objective() {
    if (this.phase === 'fog' || this.phase === 'rising') return '霧の中から何かが来る。鍵の開いた家に隠れろ';
    return '「郊外の外れ」の標識をたどり、家並みの外へ出ろ';
  }
  status() {
    if (this.watchWarn > 0) return this.game.player.flashlight ? '窓の中の人影が、こちらを見ている。ライトを消せ' : '窓の中の人影が、こちらを見ている';
    if ((this.phase === 'fog' || this.phase === 'rising') && this.nearMat()) return '足元に玄関マットがある。この家は開いているかもしれない';
    const p = this.game.player.pos, w = this.world;
    const [tx, ty] = w.toTile(p.x, p.z);
    const d = this.exitField?.[ty * this.map.W + tx] ?? 99;
    if (d >= 0 && d < 6) return '風に揺れる麦の音がする';
    return '';
  }
  nearMat() {
    const p = this.game.player.pos;
    return this.houses.some(h => h.open && Math.hypot(h.door.pos.x - p.x, h.door.pos.z - p.z) < 4);
  }
  tension() { return this.phase === 'fog' ? 0.9 : this.phase === 'rising' ? 0.6 : 0.1; }
  sanityRate() { return this.phase === 'fog' ? -0.45 : -0.08; }

  update(dt) {
    const g = this.game, p = g.player, w = this.world;
    // 霧の周期
    this.phaseT -= dt;
    // ヒント：霧が出る少し前に、虫の声が止む
    if (this.phase === 'clear' && this.phaseT < 10 && !this.preWarned) { this.preWarned = true; this.say('……虫の声が止んだ', 3); }
    if (this.phase === 'clear' && this.phaseT <= 0) { this.preWarned = false; this.startFog(); }
    else if (this.phase === 'rising' && this.phaseT <= 0) {
      this.phase = 'fog'; this.phaseT = 32;
      for (let i = 0; i < 3; i++) this.spawnMangled();
    } else if (this.phase === 'fog' && this.phaseT <= 0) this.endFog();
    else if (this.phase === 'clearing' && this.phaseT <= 0) { this.phase = 'clear'; this.phaseT = 70 + Math.random() * 35; }
    const want = this.phase === 'fog' ? 1 : this.phase === 'rising' ? 1 - Math.max(0, this.phaseT) / 7 : 0;
    this.fogK += (want - this.fogK) * Math.min(1, dt * (want > this.fogK ? 0.6 : 0.8));
    const col = new THREE.Color(NIGHT_FOG).lerp(new THREE.Color(MIST), this.fogK);
    g.scene.fog.color.copy(col); g.scene.background.copy(col);
    g.scene.fog.density = this.def.fog.density + this.fogK * 0.1;
    // 霧の中で新しく現れる(見えない所に)
    if (this.phase === 'fog' && this.mangled.filter(m => !m.fading).length < 3 && Math.random() < dt * 0.2) this.spawnMangled();
    for (const m of this.mangled) if (m.gone) { m.dispose(); g.entities.splice(g.entities.indexOf(m), 1); g.onChaseEnd(m); }
    this.mangled = this.mangled.filter(m => !m.gone);
    this.cricket?.gain.setTargetAtTime(this.preWarned ? 0 : 0.03 * (1 - this.fogK), g.audio.t, 0.5);

    // 近所の見張り：明かりを浴びて窓の前に立つと、窓を叩いて猟犬を呼ぶ
    const lit = p.flashlight || w.lightAt(p.pos.x, p.pos.z) > 0.3;
    this.watchWarn = Math.max(0, (this.watchWarn || 0) - dt);
    for (const v of this.watchers) {
      v.cd -= dt;
      const dx = p.pos.x - v.pos.x, dz = p.pos.z - v.pos.z, d = Math.hypot(dx, dz);
      if (d > 7 || (dx * v.normal.x + dz * v.normal.z) / d < 0.35) { v.seen = 0; continue; }
      if (!w.los(v.pos.x + v.normal.x * 0.3, v.pos.z + v.normal.z * 0.3, p.pos.x, p.pos.z)) { v.seen = 0; continue; }
      this.watchWarn = 0.5;
      v.seen = lit ? (v.seen || 0) + dt : 0;
      if (v.seen > 0.8 && v.cd <= 0) {
        v.cd = 18; v.seen = 0;
        g.audio.distantEvent({ x: v.pos.x, y: 1.8, z: v.pos.z }, 'knock');
        g.makeNoise(p.pos, 30, true);
        this.say('窓の中の人影が、ガラスを叩いた！', 3);
      }
    }
  }

  dispose() {
    const g = this.game;
    if (g.scene.fog) { g.scene.fog.color.set(this.def.fog.color); }
  }

  /* ---------- 音 ---------- */
  ambient(api) {
    const A = api.A;
    // 夜風と、霧が出ると止む虫の声
    const n = A.noise(true); const f = A.filter('lowpass', 320, 0.7); const g = A.gain(0.14); A.chain(n, f, g, api.out); api.start(n);
    const lfo = A.osc('sine', 0.07); const lg = A.gain(0.08); lfo.connect(lg); lg.connect(g.gain); api.start(lfo);
    const cg = A.gain(0.03); cg.connect(api.out); api.keep(cg); this.cricket = cg;
    for (const fr of [4300, 4650]) {
      const o = A.osc('sine', fr); const og = A.gain(0.5); A.chain(o, og, cg); api.start(o);
      const am = A.osc('square', 14 + Math.random() * 4); const ag = A.gain(0.5); am.connect(ag); ag.connect(og.gain); api.start(am);
      const am2 = A.osc('sine', 0.6 + Math.random() * 0.4); const ag2 = A.gain(0.5); am2.connect(ag2); ag2.connect(og.gain); api.start(am2);
    }
    // 雨どいから落ちる雫
    api.every(2300, () => { const t = A.t; const o = A.osc('sine', 1500 + Math.random() * 600); const og = A.gain(); A.chain(o, og, api.out); o.frequency.setValueAtTime(o.frequency.value, t); o.frequency.exponentialRampToValueAtTime(700, t + 0.08); A.env(og, t, 0.002, 0.05, 0.15); o.start(t); o.stop(t + 0.2); }, 3000);
  }

  // 少しずれたオルゴール。霧が出ると、低い弦が重なる
  music(api) {
    const A = api.A, out = api.out;
    const tune = [72, 76, 79, 76, 74, 71, 72, null, 69, 72, 76, 74, 71, 67, 69, null];
    let i = 0, tension = 0;
    const box = () => {
      const m = tune[i % tune.length]; i++;
      if (m) {
        const t = A.t;
        A.note(out, m + (tension > 0.5 ? -0.4 : 0), t, 2.2, { type: 'sine', vol: 0.028, attack: 0.003, fm: 3.2 });
        A.note(out, m + 12, t, 1.2, { type: 'sine', vol: 0.008, attack: 0.003 });
      }
      api.after(tension > 0.5 ? 620 + Math.random() * 300 : 520, box);
    };
    api.after(2000, box);
    const strings = A.gain(0); strings.connect(out); api.keep(strings);
    for (const m of [40, 47, 51.5]) {
      const o = A.osc('sawtooth', A.hz(m)); const f = A.filter('lowpass', 500, 1); const og = A.gain(0.02); A.chain(o, f, og, strings); api.start(o);
      const v = A.osc('sine', 4.5); const vg = A.gain(3); v.connect(vg); vg.connect(o.detune); api.start(v);
    }
    return { intensity: (v) => { tension = v; strings.gain.setTargetAtTime(v > 0.4 ? v : 0, A.t, 1.2); } };
  }
}

export default {
  id: 'level-9', code: 'LEVEL 9', name: '郊外', en: 'The Suburbs',
  desc: '真夜中のまま終わらない住宅街。\n家々に電気は来ておらず、街灯もほとんど消えている。\n―― 霧が出たら、どこかの家に入れ。',
  theme: 'suburb', tile: 4.0, height: 4.6, sky: true, lampPoles: true, lampY: 4.2,
  lamp: { color: [1.0, 0.7, 0.38], intensity: 1.35, radius: 10 },
  fog: { color: NIGHT_FOG, density: 0.065 }, ambient: 0.02, chaseSpeed: 3.7,
  map: {
    cells: [12, 12], braid: 0.55, rooms: 4, roomSize: [2, 3], pillarChance: 0, darkZones: 0, sector: 8,
    lamp: { pattern: 2, density: 0.4, broken: 0.55, flicker: 0.15 },
  },
  space: { decay: 1.6, wet: 0.2, bright: 0.35 },
  events: ['bark', 'wind', 'steps', 'drip', 'car'],
  Logic: Suburbs,
  notes: [
    '【M.E.G. 探索記録 / Level 9】\n\n真夜中のまま、朝が来ない住宅街。\n家具の揃った家が並んでいるが、どの家にも電気は来ていない。\n\n■ 霧が出てきたら\nすぐに鍵の開いている家へ入れ。\n霧の中からは「潰れたもの」が現れる。家の中までは入ってこない。\n\n■ 窓の中の人影に注意\n「近所の見張り」と呼ばれている。\nその窓の前で、街灯やライトの光を浴びて立ち止まるな。\nガラスを叩いて、猟犬たちに知らせる。\n\n■ 「郊外の外れ」の標識に従え\n家並みが途切れた先は、麦畑だ。',
    '【玄関に挟まっていた手紙】\n\nお隣さんへ\n\nうちの窓から、あなたが夜中に通りを歩くのが見えます。\nいつも同じ時間。いつも同じ方向。\n\nあなたは、どこへ帰るのですか。\nこの町の外に、何かあるのですか。\n\n霧の夜は、うちに入ってもいいですよ。\n鍵は開けておきます。',
    '【電柱に貼られた紙】\n\n霧の前には、虫が鳴きやむ。\nそれが合図だ。\n\n玄関マットが敷いてある家は、鍵が開いている。\nマットのない家のノブは回すな。音で気づかれる。\n\n見張りの窓の前を通るときは、ライトを消して、\n街灯の光の外を歩け。',
  ],
};
