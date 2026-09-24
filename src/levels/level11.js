// LEVEL 11「終わりのない都市」― 夜でも灯りの消えない、果てしない都市。比較的安全な階層。
// 顔のない住人が歩き、見ていない間に街並み(広告)が変わる。M.E.G. 基地ベータで話を聞き、
// 「窓のふりをした何か」を見つけて飛び込む(ノークリップ)と、次の階層へ抜けられる
import * as THREE from 'three';
import { LevelLogic } from './base.js';
import { wallFaces, DIRS } from '../mapgen.js';
import { boardTexture } from '../textures.js';
import { spawnEntity } from '../entities.js';

const ADS = [
  { title: '新発売', lines: ['アーモンド水', 'いつもの味を、いつまでも。'] },
  { title: 'ようこそ', lines: ['終わりのない都市へ', 'ここには、すべてがあります。'] },
  { title: '入居者募集', lines: ['駅から徒歩 ∞ 分', '家具・電気・水道つき'] },
  { title: 'お知らせ', lines: ['この広告は', 'あなたが見ていない間に', '変わります'] },
  { title: '求人', lines: ['清掃スタッフ', '勤務地：すべての通り'] },
  { title: '本日のニュース', lines: ['晴れ。', '明日も、晴れ。'] },
  { title: '探しています', lines: ['この顔を見た方は', '(顔の部分は空白)'] },
  { title: 'セール', lines: ['全品 0 円', '持ち帰れるなら'] },
];

class EndlessCity extends LevelLogic {
  plan(map) {
    super.plan(map);
    const rnd = map.rnd, W = map.W;
    const faces = wallFaces(map).sort(() => rnd() - 0.5);
    const maxD = Math.max(...map.floorList.map(p => map.dist[p.y * W + p.x]));
    const take = (lo, hi) => {
      const i = faces.findIndex(f => { const k = f.y * W + f.x, d = map.dist[k]; return d >= maxD * lo && d <= maxD * hi && !this.used.has(k); });
      if (i < 0) return null;
      const f = faces.splice(i, 1)[0]; this.used.add(f.y * W + f.x); return f;
    };
    // M.E.G. 基地ベータ(道のりの半分ほど) / 窓の実体(遠く)
    this.baseFace = take(0.35, 0.6) || take(0.2, 0.9);
    this.entityFace = take(0.78, 1) || take(0.5, 1);
    // ふつうの窓(1階)
    this.windows = [{ ...this.entityFace, real: true }];
    while (this.windows.length < 18) { const f = take(0.08, 1); if (!f) break; this.windows.push({ ...f, real: false }); }
    this.windows.sort(() => rnd() - 0.5);
    // 見ていない間に変わる広告
    this.boards = [];
    for (let i = 0; i < 8; i++) { const f = take(0.05, 1); if (f) this.boards.push({ face: f, ad: i % ADS.length }); }
  }

  build(world) {
    super.build(world);
    const map = this.map, W = map.W;
    // 基地の扉
    this.base = world.addDoor(this.baseFace, { style: 'megbase', w: 1.3, h: 2.3 });
    world.addDecal(this.baseFace, 'meg', { w: 1.4, h: 0.7, y: 3.1, along: 0 });
    this.addInteract({ pos: this.base.pos, radius: 1.4, label: 'M.E.G. 基地の扉を叩く', action: () => this.visitBase() });
    // M.E.G. の青いチョークの矢印(基地への道)
    const field = world.distanceField(this.baseFace.x, this.baseFace.y);
    for (const p of map.floorList) {
      const k = p.y * W + p.x, d = field[k];
      if (d <= 1 || d > 40) continue;
      const open = DIRS.filter(([dx, dy]) => map.tiles[(p.y + dy) * W + p.x + dx] === 0);
      if (open.length < 3 || map.rnd() > 0.5) continue;
      const next = open.find(([dx, dy]) => field[(p.y + dy) * W + p.x + dx] === d - 1);
      if (!next) continue;
      const wall = DIRS.find(([dx, dy]) => map.tiles[(p.y + dy) * W + p.x + dx] === 1 && dx * next[0] + dy * next[1] === 0);
      if (!wall) continue;
      const face = { x: p.x, y: p.y, dx: wall[0], dy: wall[1] };
      const right = [-face.dy, face.dx];
      world.addDecal(face, 'megArrow', { w: 0.9, h: 0.45, y: 1.1, flip: right[0] * next[0] + right[1] * next[1] < 0 });
    }
    // 窓
    for (const v of this.windows) {
      v.mesh = world.addDecal(v, 'shopWindow', { w: 2.3, h: 1.7, y: 1.55 });
      v.pos = world.facePos(v, 0.05); v.pos.y = 1.55;
      const inward = new THREE.Vector3(-v.dx, 0, -v.dy);
      v.normal = inward;
      this.addInteract({ pos: v.pos.clone().addScaledVector(inward, 0.6), radius: 1.5, label: '窓ガラスに触れる', action: () => this.touchWindow(v) });
      if (v.real) {
        // 視界の端でだけ見える目
        const eyes = new THREE.Sprite(new THREE.SpriteMaterial({ map: world.common.eyes, color: 0xdfe8ff, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true, opacity: 0 }));
        eyes.position.copy(v.pos).addScaledVector(inward, 0.04); eyes.position.y = 1.75;
        eyes.scale.set(1.7, 0.85, 1); eyes.renderOrder = 5;
        world.group.add(eyes);
        v.eyes = eyes;
        this.entity = v;
      }
    }
    // 広告
    this.adTex = ADS.map((a, i) => boardTexture(a.lines, { title: a.title, bg: i % 2 ? '#f4efe0' : '#e0ecf4', fg: '#20242a' }));
    for (const b of this.boards) {
      b.mesh = world.addDecal(b.face, this.adTex[b.ad], { w: 3.2, h: 2.0, y: 4.6 });
      b.pos = world.facePos(b.face, 0.05); b.pos.y = 4.6;
      b.unseen = 0; b.seen = false; b.changed = false;
    }
  }

  items() { return this.supplies({ batteries: 1, waters: 2 }); }

  spawn() {
    const g = this.game;
    for (let i = 0; i < 7; i++) g.entities.push(spawnEntity(g, 'faceling', 8 + i * 2));
    // 「Level 11 効果」で、ここの猟犬はあまり攻撃的でない
    const h = spawnEntity(g, 'hound', 34); h.huntSpeed = 3.3; h.walkSpeed = 1.2;
    g.entities.push(h);
  }

  start(saved) {
    super.start(saved);
    this.state.visited ||= false;
    // ヒント：本物の「窓」の近くでは、ガラスの向こうからかすかな息づかいが聞こえる
    const v = this.entity;
    if (v) {
      const g = this.game;
      this.breath = g.audio.loopAt({ x: v.pos.x, y: 1.6, z: v.pos.z }, (out, nodes) => {
        const A = g.audio;
        const n = A.noise(true); const f = A.filter('lowpass', 420, 1.5); const ng = A.gain(0.6); A.chain(n, f, ng, out); nodes.push(n);
        const lfo = A.osc('sine', 0.22); const lg = A.gain(0.55); lfo.connect(lg); lg.connect(ng.gain); nodes.push(lfo);
      });
      this.breath?.set(0.9);
    }
    this.eyeA = 0;
    this.adNoticed = false;
  }

  visitBase() {
    const g = this.game, p = g.player;
    g.audio.distantEvent({ x: this.base.pos.x, y: 1.3, z: this.base.pos.z }, 'knock');
    if (this.state.visited) { this.say('扉の小窓の向こうで、誰かが手を振った。「窓を探せ」', 3); return; }
    this.state.visited = true;
    p.waters += 1; p.battery = 100; p.sanity = Math.min(100, p.sanity + 30);
    g.audio.unlock();
    g.showNote('【M.E.G. 基地ベータ ― 扉越しの会話】\n\n「生きてここまで来たのか。よくやった。\n水と電池を持っていけ。\n\nこの先へ行きたいなら、\n『窓』を探すといい。\n\nこの街には、窓のふりをした何かがいる。\nまっすぐ見れば、ただの1階のガラス窓だ。\nだが、視界の端で見ると……こっちを見ている。\n\nそいつを見つけたら、ガラスに触れて、\n向こう側へ飛び込め。\n戻ってこられる保証はないがな。\n\n顔のない住人には近づきすぎるな。\n害はないが、見られると、頭がおかしくなる」');
    g.saveProgress();
  }

  touchWindow(v) {
    const g = this.game, p = g.player;
    if (!v.real) {
      g.audio.click();
      p.sanity = Math.max(1, p.sanity - 2);
      this.say('冷たいガラスだ。向こうの暗がりには、何もいない', 2.5);
      return;
    }
    g.audio.noclip();
    this.say('ガラスが、水面のように波打った――', 2);
    setTimeout(() => this.game.completeLevel({ transition: 'noclip' }), 700);
  }

  objective() {
    return this.state.visited ? '視界の端でだけ、こちらを見ている「窓」を探せ' : 'M.E.G. の矢印をたどり、基地ベータを探せ';
  }
  status() {
    if (this.stared > 0.5) return '顔のない顔が、こちらを見ている';
    const v = this.entity, p = this.game.player.pos;
    if (v && this.state.visited && Math.hypot(v.pos.x - p.x, v.pos.z - p.z) < 14) return 'どこかの窓から、視線と息づかいを感じる';
    return '';
  }
  sanityRate() { return this.stared > 0 ? -1.3 : 0.1; }
  tension() { return this.stared > 0 ? 0.5 : 0; }

  update(dt) {
    const g = this.game, p = g.player, cam = g.camera, w = this.world;
    // 顔のない住人に見つめられている
    let st = 0;
    for (const e of g.entities) if (e.type === 'faceling' && e.staring && e.distToPlayer() < 7) st = Math.max(st, 1);
    this.stared = st ? (this.stared || 0) + dt : 0;
    // 窓の実体：まっすぐ見ると普通の窓、視界の端では目がある
    const v = this.entity;
    if (v) {
      const dir = cam.getWorldDirection(new THREE.Vector3());
      const to = new THREE.Vector3(v.pos.x - cam.position.x, v.pos.y - cam.position.y, v.pos.z - cam.position.z);
      const d = to.length(); to.normalize();
      const dot = to.dot(dir);
      const facing = (-to.x * v.normal.x - to.z * v.normal.z) > 0.2;
      const vis = d < 22 && facing && dot > 0.35 && w.los(p.pos.x, p.pos.z, v.pos.x + v.normal.x * 0.4, v.pos.z + v.normal.z * 0.4);
      const want = vis && dot < 0.9 ? 1 : 0;
      this.eyeA += (want - this.eyeA) * Math.min(1, dt * (want ? 2 : 10));
      v.eyes.material.opacity = this.eyeA * (0.85 + Math.random() * 0.15);
      if (this.eyeA > 0.6 && !this.state.eyeHint && d < 16) { this.state.eyeHint = true; this.say('……今、視界の端で何かが見えた気がする', 3); }
    }
    // 広告：見ていない間に変わる
    for (const b of this.boards) {
      const seen = b.pos.distanceTo(cam.position) < 28 && g.canSee(b.pos, 0.5);
      if (seen) {
        if (b.changed && !this.adNoticed) { this.adNoticed = true; this.say('さっきと広告が変わっている……', 3); }
        b.unseen = 0; b.seen = true; b.changed = false;
      } else if (b.seen) {
        b.unseen += dt;
        if (b.unseen > 7) {
          b.ad = (b.ad + 1 + Math.floor(Math.random() * (ADS.length - 1))) % ADS.length;
          b.mesh.material.map = this.adTex[b.ad]; b.mesh.material.emissiveMap = this.adTex[b.ad]; b.mesh.material.needsUpdate = true;
          b.unseen = 0; b.seen = false; b.changed = true;
        }
      }
    }
  }

  /* ---------- 音 ---------- */
  ambient(api) {
    const A = api.A;
    // 都市のうなり(どこかで回り続ける空調と、遠くの車の流れ)
    const n = A.noise(true); const f = A.filter('lowpass', 180, 0.8); const g = A.gain(0.28); A.chain(n, f, g, api.out); api.start(n);
    const hum = A.osc('sawtooth', 50); const hf = A.filter('lowpass', 160, 2); const hg = A.gain(0.02); A.chain(hum, hf, hg, api.out); api.start(hum);
    const tr = A.noise(); const tf = A.filter('bandpass', 900, 0.5); const tg = A.gain(0.025); A.chain(tr, tf, tg, api.out); api.start(tr);
    const lfo = A.osc('sine', 0.06); const lg = A.gain(0.02); lfo.connect(lg); lg.connect(tg.gain); api.start(lfo);
    A.fluoHum(api, 60, 0.35);
  }

  // エレクトリックピアノのような、人のいない夜の和音
  music(api) {
    const A = api.A, out = api.out;
    const prog = [[53, 57, 60, 64], [50, 57, 60, 65], [55, 59, 62, 65], [52, 55, 59, 64]];
    let i = 0, tension = 0;
    api.every(5200, () => {
      const t = A.t, ch = prog[i % 4];
      ch.forEach((m, k) => A.note(out, m + (tension > 0.3 && k === 1 ? 1 : 0), t + k * 0.12, 4.5, { type: 'sine', vol: 0.02, attack: 0.005, fm: 0.8 }));
      if (i % 2) A.note(out, ch[3] + 12, t + 1.6, 3, { type: 'sine', vol: 0.012, attack: 0.005, fm: 1.5 });
      i++;
    }, 400);
    const bass = A.osc('sine', A.hz(29)); const bg = A.gain(0.05); A.chain(bass, bg, out); api.start(bass);
    return { intensity: (v) => { tension = v; bg.gain.setTargetAtTime(0.05 + v * 0.05, A.t, 0.6); } };
  }
}

export default {
  id: 'level-11', code: 'LEVEL 11', name: '終わりのない都市', en: 'The Endless City',
  desc: '人の気配のない、果てしない都市。\n夜でも灯りは消えず、広告は誰にも見られずに変わり続ける。\n―― ここは、比較的安全な場所だと言われている。',
  theme: 'city', tile: 4.0, height: 10.0, sky: true, lampPoles: true, lampY: 5.2, daylight: 0.22, ambientLight: 0.3,
  lamp: { color: [0.95, 0.88, 0.75], intensity: 1.5, radius: 11 },
  fog: { color: 0x10131a, density: 0.042 }, ambient: 0.07, chaseSpeed: 3.4,
  map: {
    cells: [12, 12], braid: 0.75, rooms: 6, roomSize: [2, 3], pillarChance: 0, darkZones: 0, sector: 8,
    lamp: { pattern: 2, density: 0.7, broken: 0.1, flicker: 0.06 },
  },
  space: { decay: 2.4, wet: 0.3, bright: 0.55 },
  events: ['car', 'horn', 'crowd', 'car', 'steps'],
  Logic: EndlessCity,
  notes: [
    '【M.E.G. 配布パンフレット / Level 11】\n\nようこそ、終わりのない都市へ。\nここはフロントルームズの中でも、とても安全な階層です。\n電気・水道は動いており、物資もどこからか補充されます。\n\n■ 「Level 11 効果」\nこの階層では、敵対的な存在の攻撃性が弱まります。\nただし、油断はしないでください。\n\n■ 顔のない住人\n害はありません。ただ、近くで物音を立てると立ち止まり、\nこちらを見つめてきます。長く見られないようにしましょう。\n\n■ 基地ベータ\n壁の青いチョークの矢印をたどると着きます。',
    '【路上に落ちていたメモ】\n\n昨日と同じ道を歩いたはずなのに、\n看板の文字が違っていた。\n車の位置も、ポスターも、全部。\n\n変わらないのは、1階の窓だけだ。\n\n……いや、ひとつだけ。\n目の端で、こっちを見ている窓があった。',
    '【M.E.G. 基地ベータ前の掲示板】\n\n「窓」を探している者へ。\n\nあれは、まっすぐ見ると正体を隠す。\n窓の前を横切りながら、目の端で見ろ。\n\n近くまで行くと、ガラスの向こうから\n息をするような音が聞こえる。\nふつうの窓は、音を立てない。',
  ],
};
