// LEVEL 4「放棄されたオフィス」― 比較的安全な階層。敵はほとんどいないが、窓の外を見てはいけない。
// ホワイトボードや掲示物の手がかりから、非常階段の暗証番号を割り出す謎解き
import * as THREE from 'three';
import { LevelLogic } from './base.js';
import { farthestFace, wallFaces, DIRS, PROP, bfs } from '../mapgen.js';
import { boardTexture } from '../textures.js';
import { spawnEntity } from '../entities.js';

const MEETINGS = ['営業定例', '新人研修', '品質会議', '予算会議', '部長面談', '安全講習'];

class AbandonedOffice extends LevelLogic {
  plan(map) {
    super.plan(map);
    const rnd = map.rnd, W = map.W, H = map.H;
    // 非常階段(出口)
    this.exitFace = farthestFace(map, this.used);
    // 暗証番号 = 「今週」の役員会議の開始時刻
    const hh = 10 + Math.floor(rnd() * 7), mm = [0, 15, 30, 45][Math.floor(rnd() * 4)];
    const hh2 = hh <= 12 ? hh + 3 : hh - 3, mm2 = (mm + 30) % 60;
    this.code = `${String(hh).padStart(2, '0')}${String(mm).padStart(2, '0')}`;
    this.fake = `${String(hh2).padStart(2, '0')}${String(mm2).padStart(2, '0')}`;
    this.hhmm = `${hh}:${String(mm).padStart(2, '0')}`;
    this.hhmm2 = `${hh2}:${String(mm2).padStart(2, '0')}`;
    // 机の島(部屋の中。1つ置くたびに通路が切れていないか確かめる)
    const s = map.start;
    const exitTile = { x: this.exitFace.x, y: this.exitFace.y };
    for (const room of map.rooms) {
      for (let y = room.y + 1; y < room.y + room.h - 1; y++) for (let x = room.x; x < room.x + room.w; x++) {
        if ((y - room.y) % 3 === 0 || (x - room.x) % 4 === 3) continue;
        const k = y * W + x;
        if (map.tiles[k] !== 0 || this.used.has(k) || Math.abs(x - s.x) + Math.abs(y - s.y) < 3) continue;
        map.tiles[k] = PROP;
        const d = bfs(map.tiles, W, H, s.x, s.y);
        if (d[exitTile.y * W + exitTile.x] < 0 || map.floorList.some(p => map.tiles[p.y * W + p.x] === 0 && d[p.y * W + p.x] < 0)) { map.tiles[k] = 0; continue; }
        map.props.set(k, { kind: 'desk', opaque: false });
      }
    }
    map.floorList = map.floorList.filter(p => map.tiles[p.y * W + p.x] === 0);
    map.dist = bfs(map.tiles, W, H, s.x, s.y);
    // 掲示物：正しい予約表 / 先週の予約表(ひっかけ) / 無関係な掲示
    const faces = wallFaces(map).filter(f => !this.used.has(f.y * W + f.x)).sort(() => rnd() - 0.5);
    const takeFace = (minDist, maxDist = 1e9) => {
      const i = faces.findIndex(f => { const d = map.dist[f.y * W + f.x]; return d >= minDist && d <= maxDist && !this.used.has(f.y * W + f.x); });
      if (i < 0) return faces.pop();
      const f = faces.splice(i, 1)[0]; this.used.add(f.y * W + f.x); return f;
    };
    this.boards = [
      { face: takeFace(14), kind: 'thisweek' },
      { face: takeFace(6), kind: 'lastweek' },
      { face: takeFace(4), kind: 'extension' },
      { face: takeFace(8), kind: 'goal' },
    ];
    this.stickyFace = takeFace(1, 3);
    // 給水器(アーモンド水)
    this.coolers = [takeFace(5), takeFace(10), takeFace(16)].filter(Boolean);
    // 窓：外周の壁。ほとんどは黒く塗りつぶされているが、いくつかは……
    const outer = wallFaces(map, (p, dx, dy) => { const x = p.x + dx, y = p.y + dy; return x === 0 || y === 0 || x === W - 1 || y === H - 1; })
      .filter(f => !this.used.has(f.y * W + f.x)).sort(() => rnd() - 0.5);
    this.windows = outer.slice(0, 16).map((f, i) => ({ face: f, open: i < 3 }));
  }

  build(world) {
    super.build(world);
    this.door = world.addDoor(this.exitFace, { style: 'fire', w: 1.2, sign: '非常階段' });
    world.addDecal(this.exitFace, 'keypad', { w: 0.3, h: 0.45, y: 1.3, along: 0.95 });
    this.addInteract({ pos: this.door.pos, radius: 1.4, label: 'テンキーに番号を入力する', action: () => this.openKeypad() });

    const boardText = {
      thisweek: { title: '【今週】会議室B 予約表', lines: [`月　9:30　${MEETINGS[0]}`, `火 11:00　${MEETINGS[1]}`, `水 ${this.hhmm.padStart(5, ' ')}　役員会議`, `木 14:00　${MEETINGS[2]}`, `金 16:30　${MEETINGS[3]}`] },
      lastweek: { title: '【先週】会議室B 予約表', lines: [`月 10:00　${MEETINGS[4]}`, `水 ${this.hhmm2.padStart(5, ' ')}　役員会議`, `木 13:30　${MEETINGS[5]}`, '※今週分は会議室Bに掲示'] },
      extension: { title: '内線番号表', lines: ['総務　　2210', '経理　　2375', '営業一課 2481', '警備室　0000(不通)'] },
      goal: { title: '今月の目標', lines: ['受注件数　3,480件', '残業ゼロ運動', '「ここから出る」', '「ここから出る」「ここから出る」'] },
    };
    this.boardMeshes = [];
    for (const b of this.boards) {
      if (!b.face) continue;
      const t = boardText[b.kind];
      world.addDecal(b.face, boardTexture(t.lines, { title: t.title }), { w: 1.6, h: 1.0, y: 1.5 });
      const pos = world.facePos(b.face, 0.7);
      this.addInteract({ pos, radius: 1.5, label: '掲示を読む', action: () => this.game.showNote(`${t.title}\n\n${t.lines.join('\n')}`) });
    }
    if (this.stickyFace) {
      const text = ['非常階段の暗証番号は', '「今週の役員会議」の', '開始時刻(4桁)に', 'しておきました。', '　　　　― 総務部'];
      world.addDecal(this.stickyFace, boardTexture(text, { bg: '#f4e27a', fg: '#222', w: 320, h: 300 }), { w: 0.5, h: 0.47, y: 1.45 });
      this.addInteract({ pos: world.facePos(this.stickyFace, 0.7), radius: 1.4, label: '付箋を読む', action: () => { this.state.readSticky = true; this.game.showNote(`【黄色い付箋】\n\n${text.join('\n')}`); } });
    }
    for (const f of this.coolers) {
      const p = world.facePos(f, 0.35);
      world.addBoxProp(p.x, p.z, { size: 0.42, h: 1.25, tex: 'cooler', r: 0.3 });
      const c = { uses: 2 };
      this.addInteract({
        pos: world.facePos(f, 0.9), radius: 1.3, label: 'アーモンド水を汲む', enabled: () => c.uses > 0,
        action: () => { c.uses--; this.game.player.waters++; this.game.audio.drink(); this.say('給水器からアーモンド水を汲んだ'); this.game.saveProgress(); },
      });
    }
    // 窓
    this.voidWindows = [];
    for (const wdw of this.windows) {
      world.addDecal(wdw.face, 'window', { w: 1.6, h: 1.4, y: 1.55 });
      if (wdw.open) {
        const m = this.voidPane(wdw.face);
        this.voidWindows.push({ mesh: m, pos: world.facePos(wdw.face, 0.02) });
      }
    }
  }

  // 塗りつぶされていない窓：外には、どこまでも同じオフィスが白く続いている
  voidPane(face) {
    const w = this.world;
    const p = w.facePos(face, 0.035);
    const mat = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `
        uniform float time; varying vec2 vUv;
        void main(){
          vec2 uv = vUv - 0.5;
          float depth = 1.0 / max(0.04, abs(uv.y) * 2.2);
          float rows = fract(depth * 0.35 + time * 0.03);
          float cols = fract(uv.x * depth * 0.8);
          float grid = step(0.92, rows) + step(0.95, cols) * 0.6;
          vec3 c = mix(vec3(0.92, 0.9, 0.84), vec3(0.55, 0.53, 0.5), grid);
          c *= 0.55 + 0.45 * smoothstep(0.0, 0.5, abs(uv.y));
          float flick = 0.9 + 0.1 * sin(time * 40.0);
          gl_FragColor = vec4(c * flick * 1.4, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.62), mat);
    const rx = -face.dy, rz = face.dx;
    for (const [ax, ay] of [[-0.39, 0.34], [0.39, 0.34], [-0.39, -0.34], [0.39, -0.34]]) {
      const q = mesh.clone(); q.position.set(p.x + rx * ax, 1.55 + ay, p.z + rz * ax); q.lookAt(q.position.x - face.dx, q.position.y, q.position.z - face.dy);
      w.group.add(q);
    }
    return mat;
  }

  items() { return this.supplies({ batteries: 2, waters: 1 }); }

  spawn() { this.game.entities.push(spawnEntity(this.game, 'duller', 20)); }

  start(saved) {
    super.start(saved);
    this.windowT = 0;
    this.phoneT = 20;
  }

  openKeypad() {
    const g = this.game;
    g.openKeypad((code) => {
      if (code === this.code) {
        g.audio.keyBeep(true); this.door.setOpen(true);
        this.say('カチリ、と鍵が外れた', 2);
        setTimeout(() => this.exit(), 900);
      } else {
        g.audio.keyBeep(false);
        this.state.wrong = (this.state.wrong || 0) + 1;
        this.say(code === this.fake ? '……違う。それは先週の番号だ' : '番号が違う', 3);
        // 間違えるたびに、どこかで電話が鳴る
        const p = g.player.pos;
        g.audio.distantEvent({ x: p.x + 8, y: 1, z: p.z - 6 }, 'phone');
        g.makeNoise(this.door.pos, 20);
      }
    });
  }

  objective() {
    return this.state.readSticky ? '「今週の役員会議」の時刻を探し、非常階段の暗証番号を入力しろ' : '非常階段から次の階層へ進め';
  }
  status() { return this.lookingOut ? '窓の外を見るな' : ''; }

  sanityRate(p) { return this.lookingOut ? -14 : 0.15; }
  tension() { return this.lookingOut ? 0.9 : 0; }

  update(dt) {
    const g = this.game, p = g.player;
    this.lookingOut = false;
    for (const v of this.voidWindows) {
      v.mesh.uniforms.time.value = g.time;
      const d = Math.hypot(v.pos.x - p.pos.x, v.pos.z - p.pos.z);
      if (d < 9 && g.canSee(new THREE.Vector3(v.pos.x, 1.55, v.pos.z), 0.93)) this.lookingOut = true;
    }
    if (this.lookingOut) {
      this.windowT += dt;
      if (this.windowT > 0.25 && !this.warned) { this.warned = true; this.say('窓の外を見るな。目を逸らせ', 3); }
      g.fx.u.flash.value = Math.max(g.fx.u.flash.value, Math.min(0.25, this.windowT * 0.1));
    } else this.windowT = 0;
  }

  /* ---------- 音 ---------- */
  ambient(api) {
    const A = api.A;
    A.fluoHum(api, 60, 0.45);
    // 空調の風の音
    const n = A.noise(); const f = A.filter('lowpass', 1800, 0.5); const g = A.gain(0.05);
    A.chain(n, f, g, api.out); api.start(n);
    const n2 = A.noise(true); const f2 = A.filter('lowpass', 140); const g2 = A.gain(0.1);
    A.chain(n2, f2, g2, api.out); api.start(n2);
  }

  // 誰もいないオフィスに流れ続ける、ゆがんだラウンジ音楽
  music(api) {
    const A = api.A, out = api.out;
    const warble = A.osc('sine', 0.4); const wg = A.gain(14); warble.connect(wg); api.start(warble);
    const prog = [[62, 65, 69, 72, 76], [55, 59, 62, 65, 69], [60, 64, 67, 71, 74], [57, 61, 64, 67, 70]];
    const bass = [38, 43, 36, 45];
    let i = 0, tension = 0;
    const lp = A.filter('lowpass', 2400, 0.5); lp.connect(out); api.keep(lp);
    api.every(3600, () => {
      const t = A.t, ch = prog[i % 4];
      if (Math.random() < 0.12) { i++; return; } // テープが一瞬飛ぶ
      ch.forEach((m, k) => A.note(lp, m, t + k * 0.03, 3.3, { type: 'sine', vol: 0.022, attack: 0.01, fm: 0.9, mod: wg }));
      A.note(lp, bass[i % 4], t, 3.2, { type: 'triangle', vol: 0.05, attack: 0.02 });
      // ブラシのようなリズム
      for (let b = 0; b < 4; b++) {
        const h = A.noise(); const hf = A.filter('bandpass', 6000, 1); const hg = A.gain(); A.chain(h, hf, hg, lp);
        A.env(hg, t + b * 0.9, 0.01, 0.02, 0.4); h.start(t + b * 0.9); h.stop(t + b * 0.9 + 0.5);
      }
      if (tension > 0.3) A.note(lp, ch[0] + 1, t + 0.5, 3, { type: 'sawtooth', vol: 0.012 * tension, attack: 1, cutoff: 900 });
      i++;
    });
    return { intensity: (v) => { tension = v; lp.frequency.setTargetAtTime(2400 - v * 1600, A.t, 0.5); } };
  }
}

export default {
  id: 'level-4', code: 'LEVEL 4', name: '放棄されたオフィス', en: 'Abandoned Office',
  desc: '誰もいないオフィス。給水器にはアーモンド水が残っている。\n比較的安全な階層だと言われている。\n―― ただし、窓の外を見てはいけない。',
  theme: 'office', tile: 3.4, height: 2.9,
  lamp: { color: [0.95, 0.98, 1.0], intensity: 1.15, radius: 8.5 },
  fog: { color: 0x14161a, density: 0.055 }, ambient: 0.05,
  map: {
    cells: [11, 11], braid: 0.8, rooms: 10, roomSize: [2, 4], pillarChance: 0, darkZones: 0, sector: 6,
    lamp: { pattern: 2, density: 0.75, broken: 0.08, flicker: 0.06 },
  },
  space: { decay: 0.9, wet: 0.16, bright: 0.55 },
  events: ['phone', 'copier', 'typing', 'steps', 'knock'],
  Logic: AbandonedOffice,
  notes: [
    '【M.E.G. 探索記録 / Level 4】\n\n放棄されたオフィス。比較的安全。\n給水器・自販機からアーモンド水が手に入る。補給はここで済ませること。\n\n窓のほとんどは黒く塗りつぶされている。\n塗られていない窓があっても、絶対に外を覗くな。\n覗いた者は、しばらく口がきけなくなった。\n\n壁をすり抜ける灰色の人影を見たら、静かに離れろ。',
    '【総務部からのお知らせ(破れている)】\n\n非常階段の扉には暗証番号錠を設置しました。\n番号は会議室の予定表と連動させています。\n……\n予定表は毎週貼り替えます。古いものと間違えないように。',
  ],
};
