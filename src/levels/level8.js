// LEVEL 8「洞窟」― 光る菌類だけが頼りの、暗い岩の迷路。巣には大きな蜘蛛が潜む。
// 蜘蛛は目ではなく「糸の震え」で獲物を知る。巣に触れず、走らず、地上へ続くロープを探す
import * as THREE from 'three';
import { LevelLogic } from './base.js';
import { farthestFace, bfs, DIRS } from '../mapgen.js';
import { getDecal } from '../textures.js';
import { Spider } from '../entities.js';

const FUNGUS = [0.25, 0.95, 0.72];

class CaveSystem extends LevelLogic {
  plan(map) {
    super.plan(map);
    const W = map.W, H = map.H, rnd = map.rnd;
    map.lamps = [];
    // 落ちてきた縦穴(スタート)にだけ、かすかな光
    map.lamps.push({ x: map.start.x, y: map.start.y, state: 'on', circuit: 0, color: [0.6, 0.66, 0.75], intensity: 0.8, radius: 5.5 });
    // 出口：地上へ続くロープ(上から光が差している)
    this.exitFace = farthestFace(map, this.used);
    const ex = this.exitFace;
    map.lamps.push({ x: ex.x, y: ex.y, state: 'on', circuit: 0, color: [0.85, 0.92, 1.0], intensity: 1.5, radius: 7 });
    // 光る菌類(行き止まり・広間に点々と)
    const deadEnds = map.floorList.filter(p => DIRS.filter(([dx, dy]) => map.tiles[(p.y + dy) * W + p.x + dx] === 0).length === 1);
    const pool = [...deadEnds, ...map.floorList.filter(p => map.roomTiles[p.y * W + p.x])].sort(() => rnd() - 0.5);
    this.fungus = [];
    for (const p of pool) {
      if (this.fungus.length >= 16) break;
      if (this.fungus.some(f => Math.abs(f.x - p.x) + Math.abs(f.y - p.y) < 5)) continue;
      this.fungus.push(p);
      map.lamps.push({ x: p.x, y: p.y, state: 'on', circuit: 0, color: FUNGUS, intensity: 0.75, radius: 4.8 });
    }
    // 蜘蛛の巣(3か所)
    const md = Math.max(...map.floorList.map(p => map.dist[p.y * W + p.x]));
    this.nests = [];
    const nc = map.floorList.filter(p => { const d = map.dist[p.y * W + p.x]; return d > 7 && d < md - 3; }).sort(() => rnd() - 0.5);
    for (const p of nc) {
      if (this.nests.length >= 3) break;
      if (this.nests.some(n => Math.abs(n.x - p.x) + Math.abs(n.y - p.y) < 9)) continue;
      if (Math.abs(ex.x - p.x) + Math.abs(ex.y - p.y) < 5) continue;
      this.nests.push(p);
      this.used.add(p.y * W + p.x);
    }
    // 糸(巣の周りに多く、ほかにも少し)
    this.webs = [];
    const addWeb = (p) => {
      const k = p.y * W + p.x;
      if (this.used.has(k) || map.dist[k] < 4 || (p.x === ex.x && p.y === ex.y)) return false;
      if (this.webs.some(w => w.x === p.x && w.y === p.y)) return false;
      this.webs.push({ x: p.x, y: p.y, id: this.webs.length }); return true;
    };
    for (const n of this.nests) {
      const d = bfs(map.tiles, W, H, n.x, n.y);
      const ring = map.floorList.filter(p => { const v = d[p.y * W + p.x]; return v >= 2 && v <= 6; }).sort(() => rnd() - 0.5);
      let c = 0; for (const p of ring) { if (c >= 5) break; if (addWeb(p)) c++; }
    }
    const extra = map.floorList.filter(p => !map.roomTiles[p.y * W + p.x]).sort(() => rnd() - 0.5);
    let c = 0; for (const p of extra) { if (c >= 5) break; if (this.webs.every(w => Math.abs(w.x - p.x) + Math.abs(w.y - p.y) > 4) && addWeb(p)) c++; }
    for (const w of this.webs) this.used.add(w.y * W + w.x);
  }

  build(world) {
    super.build(world);
    const T = world.T, H = world.H, W = this.map.W;
    // ロープ
    const ex = this.exitFace;
    world.addDecal(ex, 'rope', { w: 0.22, h: H, y: H / 2, off: 0.25 });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, H, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0x9ab0c8, transparent: true, opacity: 0.035, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    const bp = world.facePos(ex, 0.6); beam.position.set(bp.x, H / 2, bp.z); world.group.add(beam);
    this.addInteract({ pos: world.facePos(ex, 0.7), radius: 1.4, label: 'ロープを登る', action: () => { this.say('ロープを掴み、上の光へ向かって登っていく……', 2); this.exit(); } });
    world.lampMesh.visible = false; // 天井の照明器具はない(光っているのは菌類)
    // 光る菌類(床の小さな光)
    const fMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(...FUNGUS).multiplyScalar(1.6), fog: false });
    const fGeo = new THREE.SphereGeometry(0.06, 6, 5);
    for (const f of this.fungus) {
      const c = world.tileCenter(f.x, f.y);
      for (let i = 0; i < 7; i++) {
        const m = new THREE.Mesh(fGeo, fMat);
        m.position.set(c.x + (Math.random() - 0.5) * T * 0.8, Math.random() * 0.25, c.z + (Math.random() - 0.5) * T * 0.8);
        m.scale.setScalar(0.5 + Math.random());
        world.group.add(m);
      }
    }
    // 巣
    for (const n of this.nests) {
      const c = world.tileCenter(n.x, n.y);
      world.addFloorDecal(c.x, c.z, 'web', T * 1.1, Math.random() * 6);
    }
    // 糸：床と、通路をふさぐように張られた膜(明かりを当てないと見えない)
    const webTex = getDecal('web');
    for (const w of this.webs) {
      const c = world.tileCenter(w.x, w.y);
      w.floor = world.addFloorDecal(c.x, c.z, webTex, T * 0.9, Math.random() * 6);
      const openX = this.map.tiles[w.y * W + w.x + 1] === 0 || this.map.tiles[w.y * W + w.x - 1] === 0;
      const mat = new THREE.MeshLambertMaterial({ map: webTex, transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: 0.9 });
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(T * 0.98, H * 0.95), mat);
      plane.position.set(c.x, H * 0.48, c.z);
      if (openX) plane.rotation.y = Math.PI / 2;
      world.group.add(plane);
      w.plane = plane;
      w.pos = c;
    }
  }

  items() { return this.supplies({ batteries: 4, waters: 2 }); }

  spawn() {
    const g = this.game;
    this.spiders = this.nests.map(n => new Spider(g, this.world.tileCenter(n.x, n.y)));
    g.entities.push(...this.spiders);
  }

  start(saved) {
    super.start(saved);
    const g = this.game;
    g.ambientLight.intensity = 0.04;
    this.state.broken ||= [];
    for (const id of this.state.broken) { const w = this.webs[id]; if (w) this.breakWeb(w, true); }
    this.stuck = 0;
    this.skitters = this.nests.map(n => {
      const c = this.world.tileCenter(n.x, n.y);
      return g.audio.loopAt({ x: c.x, y: 1.5, z: c.z }, (out, nodes) => {
        const A = g.audio;
        const nz = A.noise(); const f = A.filter('bandpass', 5200, 5); const ng = A.gain(0.35); A.chain(nz, f, ng, out); nodes.push(nz);
        const l = A.osc('square', 17); const lg = A.gain(0.35); l.connect(lg); lg.connect(ng.gain); nodes.push(l);
      });
    });
    this.skitters.forEach(s => s?.set(0.5));
  }

  breakWeb(w, silent = false) {
    w.broken = true;
    w.plane.visible = false;
    w.floor.material.opacity = 0.25;
    if (!silent && !this.state.broken.includes(w.id)) this.state.broken.push(w.id);
  }

  webAhead() {
    const p = this.game.player.pos;
    return this.webs.some(w => !w.broken && Math.hypot(w.pos.x - p.x, w.pos.z - p.z) < 5 && this.game.canSee(new THREE.Vector3(w.pos.x, 1.2, w.pos.z), 0.7));
  }

  objective() { return '地上へ続くロープを探せ（蜘蛛の巣に触れるな・走るな）'; }
  status() {
    if (this.stuck > 0) return '糸に絡まっている！';
    if (this.game.player.flashlight && this.webAhead()) return '前方に蜘蛛の巣がある';
    return '';
  }
  sanityRate() { return 0.3; }
  tension() { return this.spiders?.some(s => s.state === 'hunt' || s.state === 'chase') ? 0.9 : 0.15; }

  update(dt) {
    const g = this.game, p = g.player, w = this.world;
    const [tx, ty] = w.toTile(p.pos.x, p.pos.z);
    const web = this.webs.find(k => !k.broken && k.x === tx && k.y === ty && Math.hypot(k.pos.x - p.pos.x, k.pos.z - p.pos.z) < w.T * 0.45);
    if (web) {
      this.breakWeb(web);
      this.stuck = 1.8;
      g.audio.webStretch();
      this.say('蜘蛛の巣に絡まった！ 糸が震えている……', 3);
      for (const s of this.spiders) s.hear(p.pos, 30);
      g.saveProgress();
    }
    if (this.stuck > 0) this.stuck -= dt;
    p.speedMul = this.stuck > 0 ? 0.12 : 1;
  }

  dispose() { this.game.player.speedMul = 1; }

  /* ---------- 音 ---------- */
  ambient(api) {
    const A = api.A;
    // 洞窟を抜ける風
    const n = A.noise(true); const f = A.filter('lowpass', 260, 1); const g = A.gain(0.3); A.chain(n, f, g, api.out); api.start(n);
    const lfo = A.osc('sine', 0.08); const lg = A.gain(0.2); lfo.connect(lg); lg.connect(g.gain); api.start(lfo);
    const wh = A.noise(); const wf = A.filter('bandpass', 1150, 24); const wg = A.gain(0.05); A.chain(wh, wf, wg, api.out); api.start(wh);
    const wl = A.osc('sine', 0.05); const wlg = A.gain(0.04); wl.connect(wlg); wlg.connect(wg.gain); api.start(wl);
    api.every(3200, () => {
      const t = A.t; const o = A.osc('sine', 1600 + Math.random() * 800); const og = A.gain(); A.chain(o, og, api.out);
      o.frequency.setValueAtTime(o.frequency.value, t); o.frequency.exponentialRampToValueAtTime(700, t + 0.07); A.env(og, t, 0.002, 0.05, 0.2); o.start(t); o.stop(t + 0.25);
    }, 3500);
  }

  // 地の底の鼓動と、擦れる弦
  music(api) {
    const A = api.A, out = api.out;
    let tension = 0;
    const beat = () => {
      const t = A.t;
      const o = A.osc('sine', 60); const g = A.gain(); A.chain(o, g, out);
      o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(34, t + 0.35);
      A.env(g, t, 0.005, 0.22, 0.45); o.start(t); o.stop(t + 0.5);
      api.after(tension > 0.5 ? 520 : 2300, beat);
    };
    api.after(1500, beat);
    const bow = A.osc('sawtooth', A.hz(31)); const bf = A.filter('lowpass', 280, 3); const bg = A.gain(0.03); A.chain(bow, bf, bg, out); api.start(bow);
    const bl = A.osc('sine', 0.09); const blg = A.gain(0.025); bl.connect(blg); blg.connect(bg.gain); api.start(bl);
    const hi = []; for (const m of [79, 80, 86]) { const o = A.osc('sawtooth', A.hz(m)); const f = A.filter('lowpass', 1800); const g = A.gain(0); A.chain(o, f, g, out); api.start(o); hi.push(g); const tr = A.osc('sine', 7 + Math.random() * 3); const tg = A.gain(0.004); tr.connect(tg); tg.connect(g.gain); api.start(tr); }
    return { intensity: (v) => { tension = v; hi.forEach(g => g.gain.setTargetAtTime(v > 0.5 ? 0.006 : 0, A.t, 0.4)); bf.frequency.setTargetAtTime(280 + v * 500, A.t, 0.5); } };
  }
}

export default {
  id: 'level-8', code: 'LEVEL 8', name: '洞窟', en: 'Cave System',
  desc: '湿った岩の迷路。光る菌類だけが、かすかに道を照らす。\n奥には、とても大きな蜘蛛が巣を張っている。\n―― 糸に触れれば、その震えはすぐに伝わる。',
  theme: 'cave', tile: 3.0, height: 3.0,
  lamp: { color: [0.6, 0.66, 0.75], intensity: 0.9, radius: 6 },
  fog: { color: 0x0a0806, density: 0.085 }, ambient: 0.015, chaseSpeed: 3.6,
  map: {
    cells: [13, 13], braid: 0.3, rooms: 5, roomSize: [2, 3], pillarChance: 0.14, darkZones: 0, sector: 6,
    lamp: { pattern: 2, density: 0, broken: 0, flicker: 0 },
  },
  space: { decay: 2.3, wet: 0.36, bright: 0.35 },
  events: ['drip', 'rockfall', 'skitter', 'drip'],
  Logic: CaveSystem,
  notes: [
    '【M.E.G. 探索記録 / Level 8】\n\n天然の洞窟が複雑に入り組んだ階層。とても危険。\n奥には巨大な蜘蛛の巣がいくつもある。\n\n蜘蛛は目がほとんど見えない。糸の震えで獲物を知る。\n通路に張られた糸は、ライトを当てないと見えない。\n糸に触れるな。走るな（地面の振動も糸に伝わる）。\n\n天井から光が差している場所には、地上へ続くロープがある。',
    '【岩に挟まっていた手帳の切れ端】\n\n電池を惜しむな。\n暗いまま進んだ仲間は、糸に気づかず、そのまま――\n\n光る苔の近くは少しだけ明るい。\nでも、苔の近くに巣があることも多い。',
  ],
};
