// LEVEL 12「マトリックス」― 机と椅子と、鍵のかかった扉がある白い部屋。その外には白い虚空が広がる。
// 何も襲ってこないが、記憶がぼやけ、虚空にいると正気が削れる。
// 脱出の手順：椅子に座って待つ → 扉を試す → 虚空で「写しの扉」を見つけて入る → 部屋で待つ → もう一度扉を試す
import * as THREE from 'three';
import { LevelLogic } from './base.js';
import { wallFaces, bfs, FLOOR, WALL, PROP } from '../mapgen.js';

const SIT_TIME = 45, WAIT_TIME = 70;

class Matrix extends LevelLogic {
  plan(map) {
    super.plan(map);
    const W = map.W, H = map.H, rnd = map.rnd, t = map.tiles;
    map.lamps = [];
    // 最初の部屋(3×3)。東側だけ虚空へ開いている
    for (let y = 0; y <= 4; y++) for (let x = 0; x <= 4; x++) {
      const edge = x === 0 || y === 0 || x === 4 || y === 4;
      t[y * W + x] = edge ? WALL : FLOOR;
      map.roomTiles[y * W + x] = 0;
    }
    t[2 * W + 4] = FLOOR;
    for (let i = 1; i <= 5; i++) { t[i * W + 5] = FLOOR; t[5 * W + i] = FLOOR; }
    this.room = { x0: 1, y0: 1, x1: 3, y1: 3 };
    // 机と椅子
    this.tableTile = { x: 2, y: 3 }; this.chairTile = { x: 3, y: 3 };
    t[3 * W + 2] = PROP; map.props.set(3 * W + 2, { kind: 'wtable', opaque: false });
    t[3 * W + 3] = PROP; map.props.set(3 * W + 3, { kind: 'wchair', opaque: false });
    // 半分床に沈んだ家具(周りがすべて床の所だけ = つながりは切れない)
    const canPlace = (x, y) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (t[(y + dy) * W + x + dx] !== FLOOR) return false; return true; };
    const kinds = ['wtable', 'wchair', 'wsofa', 'wshelf', 'wsofa', 'wtable'];
    for (let i = 0; i < 60; i++) {
      const x = 2 + Math.floor(rnd() * (W - 4)), y = 2 + Math.floor(rnd() * (H - 4));
      if (x < 7 && y < 7) continue;
      if (!canPlace(x, y)) continue;
      const kind = kinds[Math.floor(rnd() * kinds.length)];
      const k = y * W + x;
      t[k] = PROP;
      const base = { wtable: 0.75, wchair: 0.9, wsofa: 0.8, wshelf: 2.0 }[kind];
      map.props.set(k, { kind, opaque: kind === 'wshelf', h: base * (0.25 + rnd() * 0.6) });
    }
    // つながっていない床は壁にする
    const d = bfs(t, W, H, map.start.x, map.start.y);
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) if (t[y * W + x] === FLOOR && d[y * W + x] < 0) t[y * W + x] = WALL;
    map.dist = d;
    map.floorList = [];
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) if (t[y * W + x] === FLOOR) map.floorList.push({ x, y });
    this.used.add(3 * W + 2); this.used.add(3 * W + 3);
    // 本当の扉(北の壁) / 虚空の中の「写しの扉」
    this.mainFace = { x: 2, y: 1, dx: 0, dy: -1 };
    const faces = wallFaces(map, (p) => d[p.y * W + p.x] > 10 && !(p.x <= 5 && p.y <= 5)).sort(() => rnd() - 0.5);
    this.copies = [];
    for (const f of faces) {
      if (this.copies.length >= 7) break;
      if (this.copies.some(c => Math.abs(c.x - f.x) + Math.abs(c.y - f.y) < 7)) continue;
      this.copies.push(f); this.used.add(f.y * W + f.x);
    }
  }

  // 補給品は虚空側に
  pick(opts = {}) { return super.pick({ ...opts, filter: (p) => !(p.x <= 4 && p.y <= 4) && (!opts.filter || opts.filter(p)) }); }

  build(world) {
    super.build(world);
    world.lampMesh.visible = false;
    this.door = world.addDoor(this.mainFace, { style: 'white', w: 1.1, h: 2.2, frame: 0xdedcd6 });
    this.addInteract({ pos: this.door.pos, radius: 1.4, label: '扉を開けようとする', action: () => this.tryDoor() });
    const chair = world.tileCenter(this.chairTile.x, this.chairTile.y);
    this.seatPos = new THREE.Vector3(chair.x, 0, chair.z - world.T * 0.36);
    this.addInteract({ pos: this.seatPos, radius: 1.5, label: '椅子に座る', enabled: () => !this.game.player.seated, action: () => this.sit() });
    for (const f of this.copies) {
      const d = world.addDoor(f, { style: 'white', w: 1.1, h: 2.2, frame: 0xdedcd6 });
      f.pos = d.pos;
      this.addInteract({ pos: d.pos, radius: 1.3, label: '扉を開ける', action: () => this.enterCopy() });
    }
    this.roomCenter = world.tileCenter(2, 2);
    // 最初の部屋だけは天井がある
    const T = world.T;
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(T * 3, T * 3), new THREE.MeshLambertMaterial({ color: 0xf4f4f2, emissive: 0x6a6a68 }));
    ceil.rotation.x = Math.PI / 2; ceil.position.set(this.roomCenter.x, world.H, this.roomCenter.z);
    world.group.add(ceil);
  }

  items() { return this.supplies({ batteries: 0, waters: 2 }); }

  start(saved) {
    super.start(saved);
    const g = this.game;
    this.state.step ||= 0; // 0:座る 1:扉を試す 2:写しの扉 3:待つ 4:扉が開く
    this.state.waited ||= 0;
    this.sitT = 0;
    this.tickT = 0;
    this.staticT = 18;
    // 白い虚空に陰影をつける光
    this.sun = new THREE.DirectionalLight(0xffffff, 0.9);
    this.sun.position.set(0.4, 1, 0.25);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0xb8b8b4, 0.5);
    g.scene.add(this.sun, this.hemi);
    if (this.state.step >= 4) this.door.setOpen(true);
    // ヒント：写しの扉の向こうからは、かすかな砂嵐の音がする
    this.copySounds = this.copies.map(c => {
      const snd = g.audio.loopAt({ x: c.pos.x, y: 1.2, z: c.pos.z }, (out, nodes) => {
        const A = g.audio;
        const n = A.noise(); const f = A.filter('bandpass', 2600, 0.8); const ng = A.gain(0.35); A.chain(n, f, ng, out); nodes.push(n);
      });
      snd?.set(0.7);
      return snd;
    });
    this.halfSaid = false; this.halfWait = false;
  }

  inRoom(x, z) {
    const [tx, ty] = this.world.toTile(x, z);
    return tx >= 1 && ty >= 1 && tx <= 3 && ty <= 3;
  }

  sit() {
    const g = this.game, p = g.player;
    p.seated = true;
    p.pos.copy(this.seatPos); p.vel?.set(0, 0, 0);
    p.yaw = 0; p.pitch = -0.05; // 扉のほうを向いて座る
    this.sitT = 0;
    g.audio.click();
    this.say(this.state.step === 0 ? '椅子に座った。……しばらく、このままでいよう' : '椅子に座った', 3);
  }

  standUp(msg) {
    const p = this.game.player;
    p.seated = false;
    if (msg) this.say(msg, 2.5);
  }

  tryDoor() {
    const g = this.game, s = this.state;
    if (s.step === 4) { g.audio.unlock(); this.say('扉が、音もなく開いた――', 2); setTimeout(() => this.exit(), 800); return; }
    g.audio.doorRattle(this.door.pos);
    if (s.step === 1) { s.step = 2; this.say('鍵がかかっている。……でも、さっきとは何かが違う気がする', 3.5); }
    else if (s.step === 3) this.say('まだ開かない。……もう少し、この部屋で待つ', 3);
    else this.say('鍵がかかっている', 2);
    g.saveProgress();
  }

  enterCopy() {
    const g = this.game, p = g.player, s = this.state;
    g.flashBlack(1.4);
    g.audio.staticBurst(0.9);
    p.pos.set(this.roomCenter.x, 0, this.roomCenter.z); p.vel?.set(0, 0, 0); p.yaw = 0;
    if (s.step === 2) { s.step = 3; s.waited = 0; }
    setTimeout(() => this.say('……気がつくと、最初の部屋に立っていた', 3), 700);
    g.saveProgress();
  }

  // 記憶がぼやける：正気度が下がると、目的の文字が崩れる
  blur(text) {
    const p = this.game.player;
    const k = Math.max(0, (70 - p.sanity) / 70);
    if (k <= 0) return text;
    const noise = '　。…？ ░▒';
    let out = '';
    for (const ch of text) out += Math.random() < k * 0.45 ? noise[Math.floor(Math.random() * noise.length)] : ch;
    return out;
  }

  objective() {
    const s = this.state.step;
    const t = ['椅子に座って、待て', '扉を開けようとしてみろ', '白い虚空の中で、別の扉を探して入れ', '最初の部屋で、待て', '扉を開けろ'][s] || '';
    return this.blur(t);
  }
  status() {
    const p = this.game.player;
    if (p.seated) return '座っている。時間の感覚がない……';
    if (this.state.step === 2 && this.copies.some(c => Math.hypot(c.pos.x - p.pos.x, c.pos.z - p.pos.z) < 9)) return '近くの扉の向こうから、砂嵐の音がする';
    if (!this.inRoom(p.pos.x, p.pos.z)) return '白い。どこまでも白い';
    return '';
  }
  sanityRate(p) { return this.inRoom(p.pos.x, p.pos.z) ? 0.35 : -0.4; }
  tension() { return 0; }

  update(dt) {
    const g = this.game, p = g.player, s = this.state, inp = g.input;
    // 座っている間は動かない。立ち上がると、待っていた時間は消える
    if (p.seated) {
      p.speedMul = 0;
      if (Math.hypot(inp.move.x, inp.move.y) > 0.4) this.standUp(s.step === 0 ? '立ち上がってしまった' : null);
      else if (s.step === 0) {
        this.sitT += dt;
        if (this.sitT >= SIT_TIME / 2 && !this.halfSaid) { this.halfSaid = true; this.say('……まだだ。立ち上がるな', 3); }
        if (this.sitT >= SIT_TIME) { s.step = 1; g.audio.distantEvent({ x: this.door.pos.x, y: 1.2, z: this.door.pos.z }, 'relay'); this.say('……どのくらい座っていたのだろう。扉のほうで、小さな音がした', 4); g.saveProgress(); }
      }
    } else p.speedMul = 1;
    // 写しの扉を抜けたあと、部屋で待つ
    if (s.step === 3 && this.inRoom(p.pos.x, p.pos.z)) {
      s.waited += dt;
      if (s.waited >= WAIT_TIME / 2 && !this.halfWait) { this.halfWait = true; this.say('時計の音が、少しゆっくりになった気がする。……もう少しだ', 3.5); }
      if (s.waited >= WAIT_TIME) { s.step = 4; this.door.setOpen(true); g.audio.distantEvent({ x: this.door.pos.x, y: 1.2, z: this.door.pos.z }, 'relay'); this.say('カチリ、と扉の向こうで音がした', 3.5); g.saveProgress(); }
    }
    // 部屋の時計の音(虚空から戻る目印)
    this.tickT -= dt;
    if (this.tickT <= 0) { this.tickT = 8; g.audio.distantEvent({ x: this.roomCenter.x, y: 2, z: this.roomCenter.z }, 'tick'); }
    // 記録できない階層：ときどき砂嵐が走る
    this.staticT -= dt;
    if (this.staticT <= 0) {
      this.staticT = 20 + Math.random() * 20;
      g.audio.staticBurst(0.4 + Math.random() * 0.4);
      g.fx.u.insanity.value = Math.max(g.fx.u.insanity.value, 0.6);
      g.fx.u.flash.value = Math.max(g.fx.u.flash.value, 0.15);
    }
  }

  dispose() {
    const g = this.game;
    g.player.seated = false; g.player.speedMul = 1;
    if (this.sun) g.scene.remove(this.sun, this.hemi);
  }

  /* ---------- 音 ---------- */
  ambient(api) {
    const A = api.A;
    // ほとんど無音。高い耳鳴りと、ごく薄い空気の音
    const ring = A.osc('sine', 9200); const rg = A.gain(0.0025); A.chain(ring, rg, api.out); api.start(ring);
    const n = A.noise(); const f = A.filter('highpass', 6000); const g = A.gain(0.006); A.chain(n, f, g, api.out); api.start(n);
    const low = A.noise(true); const lf = A.filter('lowpass', 60); const lg = A.gain(0.05); A.chain(low, lf, lg, api.out); api.start(low);
  }

  // 同じ和音が、少しずつ遅れて繰り返される
  music(api) {
    const A = api.A, out = api.out;
    const ch = [64, 67, 71, 74];
    let i = 0;
    api.every(6400, () => {
      const t = A.t, lag = (i % 5) * 0.07;
      ch.forEach((m, k) => A.note(out, m, t + k * (0.25 + lag), 5, { type: 'sine', vol: 0.018, attack: 0.3 }));
      if (i % 3 === 2) A.note(out, 59, t + 1.2, 6, { type: 'triangle', vol: 0.012, attack: 1 });
      i++;
    });
    return null;
  }
}

export default {
  id: 'level-12', code: 'LEVEL 12', name: 'マトリックス', en: 'Matrix',
  desc: '机と椅子、鍵のかかった扉だけがある白い部屋。\nその外には、どこまでも白い虚空が広がっている。\n―― ここでは、何も記録に残らない。',
  theme: 'white', tile: 3.0, height: 3.2, sky: true, daylight: 1.0, ambientLight: 0.35,
  lamp: { color: [0.95, 0.95, 0.94], intensity: 1, radius: 6 },
  fog: { color: 0xeeeeec, density: 0.055 }, ambient: 0.38,
  map: {
    cells: [11, 11], braid: 1, rooms: 10, roomSize: [3, 5], pillarChance: 0, darkZones: 0, sector: 8,
    lamp: { pattern: 2, density: 0, broken: 0, flicker: 0 },
  },
  space: { decay: 0.4, wet: 0.05, bright: 0.2 },
  events: ['static', 'tick'],
  Logic: Matrix,
  notes: [
    '【机の上のメモ(自分の字に見える)】\n\nこれを読んでいるなら、たぶん私はもう忘れている。\nだから書いておく。この部屋から出る手順。\n\n1. 椅子に座って、立たずに待つ。長く。\n2. 扉を開けようとする。まだ開かない。\n3. 外の白い所で、別の扉を探して入る。\n   入ると、この部屋に戻ってくる。それでいい。\n4. この部屋で、また待つ。\n5. もう一度、扉を開ける。\n\n外にいると、頭がぼやける。\n時計の音がする方が、この部屋だ。',
    '【虚空に落ちていた紙】\n\nカメラを持ってきた。\n全部、砂嵐と色の帯しか映っていなかった。\n\n床に沈みかけた家具が、少しずつ増えている気がする。\n最初からあったのか、私が来てからなのか。\n\n……私は何を探していたんだっけ。',
    '【椅子の裏に貼られた付箋】\n\n座っている間は、何も起きないように感じる。\nでも、途中で立つと最初からやり直しだ。\n\n外の扉は、近づくと砂嵐の音がする。\n白い所で迷ったら、時計の音の方へ戻れ。',
  ],
};
