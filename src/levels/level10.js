// LEVEL 10「豊作」― 曇り空の下、どこまでも続く麦畑。木立の列が畑を区切っている。
// 敵はいないと言われているが、土の下には虫の群れがいて、地面の振動に集まってくる。
// 踏み固められた道の上なら安全。轍(タイヤの跡)が続く道をたどると、都市へ出る
import * as THREE from 'three';
import { LevelLogic } from './base.js';
import { farthestFace, bfs, DIRS, PROP } from '../mapgen.js';

function wheatTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 256;
  const ctx = c.getContext('2d');
  for (let i = 0; i < 26; i++) {
    const x = 6 + Math.random() * 116, lean = (Math.random() - 0.5) * 16, top = 20 + Math.random() * 40;
    const col = `rgb(${165 + Math.random() * 50 | 0},${140 + Math.random() * 40 | 0},${70 + Math.random() * 30 | 0})`;
    ctx.strokeStyle = col; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x, 256); ctx.quadraticCurveTo(x + lean * 0.3, 140, x + lean, top + 30); ctx.stroke();
    // 穂
    ctx.fillStyle = col;
    for (let k = 0; k < 7; k++) { ctx.beginPath(); ctx.ellipse(x + lean + (k % 2 ? 2.5 : -2.5), top + k * 4.5, 2.2, 4, k % 2 ? 0.4 : -0.4, 0, 7); ctx.fill(); }
    ctx.strokeStyle = 'rgba(230,210,150,0.8)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x + lean, top); ctx.lineTo(x + lean + (Math.random() - 0.5) * 6, top - 14); ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// 土の下の群れ(姿はない。麦の揺れと音だけ)
class Swarm {
  constructor(game, level, pos) {
    this.game = game; this.level = level; this.type = 'worms'; this.harmless = true;
    this.pos = pos.clone(); this.target = pos.clone();
    this.state = 'drift'; this.stateTime = 0; this.cd = 0;
    this.sound = game.audio.loopAt({ x: pos.x, y: 0.2, z: pos.z }, (out, nodes) => {
      const A = game.audio;
      const n = A.noise(); const f = A.filter('bandpass', 3000, 1.1); const ng = A.gain(0.5); A.chain(n, f, ng, out); nodes.push(n);
      const lfo = A.osc('sine', 5); const lg = A.gain(0.35); lfo.connect(lg); lg.connect(ng.gain); nodes.push(lfo);
      const low = A.noise(true); const lf = A.filter('lowpass', 120); const lgn = A.gain(0.7); A.chain(low, lf, lgn, out); nodes.push(low);
    });
  }
  distToPlayer() { const p = this.game.player.pos; return Math.hypot(p.x - this.pos.x, p.z - this.pos.z); }
  // 地面の振動
  hear(pos, radius) {
    if (this.cd > 0 || radius < 4) return;
    const d = Math.hypot(pos.x - this.pos.x, pos.z - this.pos.z);
    if (d < radius * 1.8) {
      if (this.state !== 'seek') this.level.onSeek(this);
      this.state = 'seek'; this.stateTime = 0; this.target.set(pos.x, 0, pos.z);
    }
  }
  setState(s) { this.state = s; this.stateTime = 0; }
  update(dt) {
    const g = this.game, p = g.player, L = this.level;
    this.stateTime += dt; this.cd -= dt;
    if (this.state === 'drift' && (this.stateTime > 6 || this.pos.distanceTo(this.target) < 1)) {
      const q = L.randomWheat(); if (q) this.target.copy(q); this.stateTime = 0;
    }
    if (this.state === 'seek' && this.stateTime > 14) this.setState('drift');
    const speed = this.state === 'seek' ? 2.25 : 0.5;
    const dx = this.target.x - this.pos.x, dz = this.target.z - this.pos.z, d = Math.hypot(dx, dz);
    if (d > 0.1) { const st = Math.min(d, speed * dt); this.pos.x += dx / d * st; this.pos.z += dz / d * st; }
    // 追いつかれた。麦の中(やわらかい土)にいると、地面から這い出してくる
    if (this.state === 'seek' && this.cd <= 0 && this.distToPlayer() < 1.3 && L.inWheat(p.pos.x, p.pos.z)) L.attack(this);
    const near = this.distToPlayer();
    this.sound?.move(this.pos);
    this.sound?.set(near < 26 ? (this.state === 'seek' ? 1.3 : 0.5) : 0);
  }
  dispose() { this.sound?.stop(); }
}

class BumperCrop extends LevelLogic {
  plan(map) {
    super.plan(map);
    const rnd = map.rnd, W = map.W, H = map.H;
    map.lamps = [];
    this.exitFace = farthestFace(map, this.used);
    const ex = this.exitFace;
    // 轍のある本道：スタートから出口まで
    const field = bfs(map.tiles, W, H, ex.x, ex.y);
    this.road = new Uint8Array(W * H);
    this.tracks = [];
    let cx = map.start.x, cy = map.start.y;
    for (let guard = 0; guard < 2000; guard++) {
      const k = cy * W + cx;
      this.road[k] = 2;
      const d = field[k]; if (d <= 0) break;
      const nx = DIRS.find(([dx, dy]) => field[(cy + dy) * W + cx + dx] === d - 1);
      if (!nx) break;
      this.tracks.push({ x: cx, y: cy, dx: nx[0], dy: nx[1] });
      cx += nx[0]; cy += nx[1];
    }
    this.road[ex.y * W + ex.x] = 2;
    // 轍のない脇道(行き止まり)。先には納屋や池がある
    const main = map.floorList.filter(p => this.road[p.y * W + p.x] === 2);
    this.ends = [];
    for (let b = 0; b < 8; b++) {
      let p = main[Math.floor(rnd() * main.length)];
      let x = p.x, y = p.y, len = 0;
      for (let s = 0; s < 14; s++) {
        const opts = DIRS.filter(([dx, dy]) => map.tiles[(y + dy) * W + x + dx] === 0 && !this.road[(y + dy) * W + x + dx]);
        if (!opts.length) break;
        const [dx, dy] = opts[Math.floor(rnd() * opts.length)];
        x += dx; y += dy; this.road[y * W + x] = 1; len++;
      }
      if (len >= 4) this.ends.push({ x, y });
    }
    // スタートの周りは踏み固められている
    for (let y = map.start.y - 1; y <= map.start.y + 1; y++) for (let x = map.start.x - 1; x <= map.start.x + 1; x++) if (map.tiles[y * W + x] === 0) this.road[y * W + x] ||= 1;
    // 麦 = 道以外の床
    this.wheat = new Uint8Array(W * H);
    for (const p of map.floorList) if (!this.road[p.y * W + p.x]) this.wheat[p.y * W + p.x] = 1;
    // 納屋(脇道の行き止まりのそば)と池
    this.barns = []; this.ponds = [];
    this.ends.forEach((e, i) => {
      if (i % 2 === 0) {
        // 行き止まりに隣接する麦のタイルを納屋にする(つながりが切れないか確かめる)
        for (const [dx, dy] of DIRS) {
          const x = e.x + dx, y = e.y + dy, k = y * W + x;
          if (map.tiles[k] !== 0 || this.road[k]) continue;
          map.tiles[k] = PROP;
          const d = bfs(map.tiles, W, H, map.start.x, map.start.y);
          if (d[ex.y * W + ex.x] < 0 || map.floorList.some(q => map.tiles[q.y * W + q.x] === 0 && d[q.y * W + q.x] < 0)) { map.tiles[k] = 0; continue; }
          map.props.set(k, { kind: 'barn', opaque: true });
          this.wheat[k] = 0;
          this.barns.push({ x: e.x, y: e.y, dx, dy, id: this.barns.length });
          this.used.add(e.y * W + e.x);
          break;
        }
      } else { this.ponds.push({ ...e, id: this.ponds.length }); this.used.add(e.y * W + e.x); }
    });
    map.floorList = map.floorList.filter(p => map.tiles[p.y * W + p.x] === 0);
    map.dist = bfs(map.tiles, W, H, map.start.x, map.start.y);
    // 掘り返された土(虫の巣)
    this.soil = [];
    const wheatList = map.floorList.filter(p => this.wheat[p.y * W + p.x] && map.dist[p.y * W + p.x] > 5);
    for (let i = 0; i < 10 && wheatList.length; i++) this.soil.push(wheatList[Math.floor(rnd() * wheatList.length)]);
  }

  // 補給品は道の上に置く(麦の中では見つからない)
  pick(opts = {}) {
    const W = this.map.W;
    return super.pick({ ...opts, filter: (p) => this.road[p.y * W + p.x] && (!opts.filter || opts.filter(p)) });
  }

  build(world) {
    super.build(world);
    const T = world.T, W = this.map.W, map = this.map;
    world.lampMesh.visible = false;
    // 出口：木立の切れ目から見える、舗装道路と遠くの街
    const ex = this.exitFace;
    world.addDecal(ex, 'cityview', { w: T * 0.96, h: world.H * 0.8, y: world.H * 0.4, off: 0.02 });
    this.exitPos = world.facePos(ex, 0.8);
    this.addInteract({ pos: this.exitPos, radius: 1.8, label: '舗装道路へ出る', action: () => { this.say('轍の道が、アスファルトに変わった。遠くにビルの影が見える……', 3); this.exit(); } });
    // 轍
    for (const t of this.tracks) {
      const c = world.tileCenter(t.x, t.y);
      world.addFloorDecal(c.x + t.dx * T * 0.25, c.z + t.dy * T * 0.25, 'tracks', T * 0.95, t.dx ? Math.PI / 2 : 0);
    }
    // 掘り返された土
    for (const s of this.soil) { const c = world.tileCenter(s.x, s.y); world.addFloorDecal(c.x, c.z, 'soil', T * 0.8, Math.random() * 6); }
    // 納屋
    for (const b of this.barns) {
      const f = { x: b.x, y: b.y, dx: b.dx, dy: b.dy };
      const pos = world.facePos(f, 0.9);
      this.addInteract({ pos, radius: 1.5, label: '納屋を調べる', enabled: () => !this.state.barns?.includes(b.id), action: () => this.searchBarn(b) });
    }
    // 池(土が水を弾くので、低い所に水が溜まる)
    for (const p of this.ponds) {
      const c = world.tileCenter(p.x, p.y);
      world.addFloorDecal(c.x, c.z, 'puddle', T * 1.1, Math.random() * 6);
      this.addInteract({ pos: c, radius: 1.5, label: '溜まった水を飲む', action: () => this.drinkPond() });
    }
    // 麦
    this.buildWheat(world);
  }

  buildWheat(world) {
    const T = world.T, W = this.map.W;
    const pos = [], uv = [], sway = [], idx = [];
    const quad = (x, z, a, w, h) => {
      const base = pos.length / 3;
      const c = Math.cos(a) * w / 2, s = Math.sin(a) * w / 2;
      for (const [px, pz, u, v] of [[x - c, z - s, 0, 0], [x + c, z + s, 1, 0], [x - c, z - s, 0, 1], [x + c, z + s, 1, 1]]) {
        pos.push(px, v * h, pz); uv.push(u, v); sway.push(v);
      }
      idx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    };
    for (const p of this.map.floorList) {
      if (!this.wheat[p.y * W + p.x]) continue;
      for (let i = 0; i < 4; i++) {
        const x = (p.x + 0.2 + Math.random() * 0.6) * T, z = (p.y + 0.2 + Math.random() * 0.6) * T;
        const h = 1.75 + Math.random() * 0.35, a = Math.random() * Math.PI;
        quad(x, z, a, 1.5, h); quad(x, z, a + Math.PI / 2, 1.5, h);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute('sway', new THREE.Float32BufferAttribute(sway, 1));
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    this.wheatMat = new THREE.ShaderMaterial({
      side: THREE.DoubleSide, fog: true,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { map: { value: wheatTexture() }, time: { value: 0 }, light: { value: 0.85 }, wave: { value: new THREE.Vector4(0, 0, 0, 0) } }]),
      vertexShader: `
        attribute float sway; uniform float time; uniform vec4 wave; varying vec2 vUv; varying float vH;
        #include <fog_pars_vertex>
        void main(){
          vUv = uv; vH = sway;
          vec3 p = position;
          float w = sin(time * 1.3 + p.x * 0.35 + p.z * 0.2) * 0.18 + sin(time * 2.7 + p.x * 0.9) * 0.05;
          float d = distance(p.xz, wave.xy);
          float k = wave.w * smoothstep(wave.z, 0.0, d);
          w += sin(time * 13.0 + p.x * 3.0 + p.z * 2.0) * 0.28 * k;
          p.x += w * sway * sway; p.z += w * 0.6 * sway * sway;
          vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: `
        uniform sampler2D map; uniform float light; varying vec2 vUv; varying float vH;
        #include <fog_pars_fragment>
        void main(){
          vec4 c = texture2D(map, vUv);
          if (c.a < 0.45) discard;
          gl_FragColor = vec4(c.rgb * light * (0.45 + 0.55 * vH), 1.0);
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
    });
    this.wheatMat.uniforms.map.value.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(geo, this.wheatMat);
    world.group.add(mesh);
  }

  items() { return this.supplies({ batteries: 1, waters: 1 }); }

  spawn() {
    const g = this.game, w = this.world;
    // 群れは2つ。スタートから離れた、掘り返された土の近くから
    this.swarms = [];
    const far = this.soil.filter(s => this.map.dist[s.y * this.map.W + s.x] > 8);
    for (let i = 0; i < 2; i++) {
      const s = far[i % Math.max(1, far.length)] || this.map.floorList[this.map.floorList.length - 1];
      const sw = new Swarm(g, this, w.tileCenter(s.x, s.y));
      this.swarms.push(sw); g.entities.push(sw);
    }
  }

  start(saved) {
    super.start(saved);
    this.state.barns ||= [];
    this.rain = 0; this.raining = false; this.rainT = 50;
    this.stuck = 0;
    this.thunderT = 8;
    // 曇り空の柔らかい光
    this.sky = new THREE.HemisphereLight(0xc8ccd0, 0x4a3c2a, 0.55);
    this.sun = new THREE.DirectionalLight(0xe8e4dc, 0.35); this.sun.position.set(-0.3, 1, 0.5);
    this.game.scene.add(this.sky, this.sun);
  }

  randomWheat() {
    const m = this.map, W = m.W;
    for (let i = 0; i < 20; i++) {
      const p = m.floorList[Math.floor(Math.random() * m.floorList.length)];
      if (this.wheat[p.y * W + p.x]) return this.world.tileCenter(p.x, p.y);
    }
    return null;
  }
  tileOf(x, z) { const [tx, ty] = this.world.toTile(x, z); return ty * this.map.W + tx; }
  inWheat(x, z) { return !!this.wheat[this.tileOf(x, z)]; }
  onRoad(x, z) { return !!this.road[this.tileOf(x, z)]; }

  attack(sw) {
    const g = this.game, p = g.player;
    sw.cd = 16; sw.setState('drift');
    const q = this.randomWheat(); if (q) sw.target.copy(q);
    g.audio.stinger();
    g.audio.distantEvent({ x: p.pos.x, y: 0.2, z: p.pos.z }, 'rustle');
    g.fx.u.flash.value = 0.35;
    this.stuck = 2.2;
    if (p.sanity <= 34) { g.kill('worms'); return; }
    p.sanity = Math.max(1, p.sanity - 34);
    this.say('足元の土から、無数の何かが這い出してきた！ 道へ逃げろ！', 3.5);
  }

  searchBarn(b) {
    const g = this.game, p = g.player;
    this.state.barns.push(b.id);
    g.audio.doorRattle(this.world.facePos(b, 0.5));
    if (b.id % 2 === 0) { p.waters++; g.audio.pickup(); this.say('古い木材と釘の間に、アーモンド水が1本あった'); }
    else { p.battery = Math.min(100, p.battery + 50); g.audio.pickup(); this.say('工具箱の中に電池が入っていた'); }
    g.saveProgress();
  }

  drinkPond() {
    const g = this.game, p = g.player;
    if (p.sanity > 95) { this.say('今は喉が渇いていない'); return; }
    p.sanity = Math.min(100, p.sanity + 18); g.audio.drink();
    this.say('土の味がする水だった。少し落ち着いた', 2.5);
  }

  footTheme() { return this.inWheat(this.game.player.pos.x, this.game.player.pos.z) ? 'wheat' : null; }
  // 雨の音が振動をかき消す / 麦の中は足音(振動)が大きい
  noiseMul(pos) {
    let m = this.inWheat(pos.x, pos.z) ? 1.6 : this.onRoad(pos.x, pos.z) ? 0.6 : 1;
    if (this.raining) m *= 0.45;
    const [tx, ty] = this.world.toTile(pos.x, pos.z);
    if (this.soil.some(s => s.x === tx && s.y === ty)) m *= 3;
    return m;
  }

  objective() { return '轍(タイヤの跡)が続く道をたどれ。麦の中は静かに歩け'; }
  // ヒント：群れが動き出すと、その上のカラスが一斉に飛び立つ
  onSeek(sw) {
    const g = this.game;
    if (sw.distToPlayer() > 28 || g.time - (this.lastCrow || -99) < 18) return;
    this.lastCrow = g.time;
    g.audio.distantEvent({ x: sw.pos.x, y: 4, z: sw.pos.z }, 'crow');
    this.say('カラスが一斉に飛び立った……地面の下で、何かが動き出した', 3.5);
  }
  status() {
    const p = this.game.player.pos;
    if (this.stuck > 0) return '何かが足に絡みついている！';
    const near = Math.min(...(this.swarms || []).map(s => s.distToPlayer()));
    if (near < 9 && this.inWheat(p.x, p.z)) return '麦がざわめいている……足元の土が動いた';
    const [tx, ty] = this.world.toTile(p.x, p.z);
    if (this.soil.some(s => Math.abs(s.x - tx) + Math.abs(s.y - ty) <= 1)) return '近くに黒く掘り返された土がある。踏むな';
    if (this.road[ty * this.map.W + tx] === 1 && !(Math.abs(tx - this.map.start.x) <= 1 && Math.abs(ty - this.map.start.y) <= 1)) return 'この道には轍がない。行き止まりかもしれない';
    if (this.raining) return '雨が足音をかき消している';
    if (!this.onRoad(p.x, p.z)) return '麦の中。方向が分からなくなる';
    return '';
  }
  tension() {
    const near = Math.min(...(this.swarms || []).map(s => s.state === 'seek' ? s.distToPlayer() : 99));
    return near < 20 ? Math.min(1, (20 - near) / 14) : 0;
  }
  sanityRate(p) { return this.inWheat(p.pos.x, p.pos.z) ? -0.3 : this.onRoad(p.pos.x, p.pos.z) ? 0.12 : 0; }

  update(dt) {
    const g = this.game, p = g.player;
    const wheat = this.inWheat(p.pos.x, p.pos.z);
    if (this.stuck > 0) this.stuck -= dt;
    p.speedMul = this.stuck > 0 ? 0.15 : wheat ? 0.72 : 1;
    // 雨
    this.rainT -= dt;
    if (this.rainT <= 0) {
      this.raining = !this.raining;
      this.rainT = this.raining ? 28 + Math.random() * 12 : 55 + Math.random() * 30;
      this.say(this.raining ? '雨が降り出した' : '雨が上がった', 2);
    }
    this.rain += ((this.raining ? 1 : 0) - this.rain) * Math.min(1, dt * 0.5);
    g.scene.fog.density = this.def.fog.density + this.rain * 0.03;
    this.world.daylight = 1 - this.rain * 0.3;
    this.rainGain?.gain.setTargetAtTime(this.rain * 0.35, g.audio.t, 0.3);
    this.wheatMat.uniforms.light.value = 0.85 - this.rain * 0.25;
    if (this.raining) { this.thunderT -= dt; if (this.thunderT <= 0) { this.thunderT = 9 + Math.random() * 12; g.audio.distantEvent({ x: p.pos.x + 30, y: 20, z: p.pos.z - 20 }, 'thunder'); } }
    // 麦の揺れ(群れのいる所が強く揺れる)
    this.wheatMat.uniforms.time.value = g.time;
    let best = null, bd = 1e9;
    for (const s of this.swarms) { const d = s.distToPlayer(); if (d < bd) { bd = d; best = s; } }
    if (best) this.wheatMat.uniforms.wave.value.set(best.pos.x, best.pos.z, 4.5, best.state === 'seek' ? 1 : 0.45);
  }

  dispose() { this.game.player.speedMul = 1; if (this.sky) this.game.scene.remove(this.sky, this.sun); }

  /* ---------- 音 ---------- */
  ambient(api) {
    const A = api.A;
    // 畑を渡る風
    const n = A.noise(); const f = A.filter('bandpass', 700, 0.5); const g = A.gain(0.06); A.chain(n, f, g, api.out); api.start(n);
    const lfo = A.osc('sine', 0.09); const lg = A.gain(0.05); lfo.connect(lg); lg.connect(g.gain); api.start(lfo);
    const lf2 = A.osc('sine', 0.05); const lf2g = A.gain(400); lf2.connect(lf2g); lf2g.connect(f.frequency); api.start(lf2);
    const hi = A.noise(); const hf = A.filter('bandpass', 4200, 1.5); const hg = A.gain(0.02); A.chain(hi, hf, hg, api.out); api.start(hi);
    // 雨
    const r = A.noise(); const rf = A.filter('highpass', 1200); const rg = A.gain(0); A.chain(r, rf, rg, api.out); api.start(r);
    const r2 = A.noise(true); const r2f = A.filter('lowpass', 500); A.chain(r2, r2f, rg); api.start(r2);
    this.rainGain = rg;
  }

  // 穏やかすぎる、長い和音
  music(api) {
    const A = api.A, out = api.out;
    const chords = [[50, 57, 62, 66], [48, 55, 60, 64], [45, 52, 57, 60], [47, 54, 59, 62]];
    let i = 0, tension = 0;
    api.every(9000, () => {
      const t = A.t;
      chords[i % 4].forEach((m, k) => A.note(out, m + (tension > 0.5 && k === 3 ? 1 : 0), t + k * 0.08, 10, { type: 'triangle', vol: 0.016, attack: 2.5, cutoff: 900 }));
      i++;
    });
    const hum = A.gain(0); hum.connect(out); api.keep(hum);
    const o = A.osc('sawtooth', A.hz(38)); const of = A.filter('lowpass', 150, 6); A.chain(o, of, hum); api.start(o);
    const lfo = A.osc('sine', 6); const lg = A.gain(60); lfo.connect(lg); lg.connect(of.frequency); api.start(lfo);
    return { intensity: (v) => { tension = v; hum.gain.setTargetAtTime(v * 0.1, A.t, 0.5); } };
  }
}

export default {
  id: 'level-10', code: 'LEVEL 10', name: '豊作', en: 'Bumper Crop',
  desc: '曇り空の下、どこまでも続く麦畑。\n比較的安全な階層だと言われている。\n―― 土の下にいるものを、起こさなければ。',
  theme: 'field', tile: 3.2, height: 5.0, sky: true, daylight: 0.6, ambientLight: 0.55,
  lamp: { color: [0.86, 0.88, 0.9], intensity: 1, radius: 6 },
  fog: { color: 0x7d8286, density: 0.034 }, ambient: 0.62, chaseSpeed: 3.6,
  floorScale: 3.2,
  map: {
    cells: [13, 13], braid: 0.45, rooms: 8, roomSize: [2, 4], pillarChance: 0, darkZones: 0, sector: 8,
    lamp: { pattern: 2, density: 0, broken: 0, flicker: 0 },
  },
  space: { decay: 0.8, wet: 0.08, bright: 0.6 },
  events: ['crow', 'wind', 'rustle', 'crow'],
  Logic: BumperCrop,
  notes: [
    '【M.E.G. 探索記録 / Level 10】\n\n危険度は低い。空はずっと曇っていて、時間の感覚がなくなる。\n納屋には木材や釘、ときどき物資が残っている。\n溜まった水は飲める(土の味がする)。\n\n■ 土の下に注意\n一メートルほどの深さに、虫の群れが棲んでいる。\n地面の振動に集まってくる。麦の中では静かに歩け。\n掘り返された黒い土は踏むな。\n踏み固められた道の上には、出てこない。\n\n■ 轍のある道をたどれ\n長く歩き続けると、都市に出る。',
    '【納屋の柱に彫られた文字】\n\n雨の日は 虫が 聞こえない\n晴れたら 道から 出るな\n\n轍は 誰も乗っていない車の跡だ\nでも 必ず どこかへ 続いている',
    '【道端の杭に結ばれた布切れ】\n\nカラスが飛び立ったら、群れが動いた合図だ。\nすぐに道へ戻れ。麦の中ではしゃがんで歩け。\n\n轍のない道は、納屋か水たまりで行き止まりになる。\n寄り道は、物資が欲しいときだけにしろ。',
  ],
};
