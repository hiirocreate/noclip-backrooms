// LEVEL 0「ロビー」― 孤独と方向感覚の喪失。敵はいない。出口は「ちらつく壁」をすり抜けること(ノークリップ)
import * as THREE from 'three';
import { LevelLogic } from './base.js';
import { farthestFace } from '../mapgen.js';
import { Wanderer } from '../entities.js';

class Lobby extends LevelLogic {
  plan(map) {
    super.plan(map);
    const rnd = map.rnd;
    // 出口：スタートから最も遠い壁の一枚が「ちらつく壁」
    this.exitFace = farthestFace(map, this.used);
    // 赤い部屋：ひとつの大部屋だけ照明が赤い(抜け出せない気がする場所)
    const big = map.rooms.filter(r => r.w * r.h >= 15 && Math.abs(r.x - map.start.x) + Math.abs(r.y - map.start.y) > 8);
    const red = big[Math.floor(rnd() * big.length)];
    if (red) for (const l of map.lamps) {
      if (l.x >= red.x && l.x < red.x + red.w && l.y >= red.y && l.y < red.y + red.h) { l.color = [1.0, 0.1, 0.06]; l.intensity = 1.3; if (l.state === 'off') l.state = 'on'; }
    }
    // 組み替わる壁(見ていない間に閉じたり開いたりする)
    const ex = this.exitFace;
    this.shiftTiles = map.braid
      .filter(b => Math.abs(b.x - map.start.x) + Math.abs(b.y - map.start.y) > 3 && Math.abs(b.x - ex.x) + Math.abs(b.y - ex.y) > 2)
      .sort(() => rnd() - 0.5).slice(0, 28);
  }

  build(world) {
    super.build(world);
    this.glitch = world.addGlitchWall(this.exitFace);
    this.shifts = this.shiftTiles.map(t => world.addShiftWall(t.x, t.y));
    // 最初は半分ほど閉じておく
    for (const s of this.shifts) if (this.map.rnd() < 0.45) s.set(true);
    this.shiftTimer = 0;
    this.figureTimer = 30;
  }

  items() { return this.supplies({ batteries: 2, waters: 2 }); }

  start(saved) {
    super.start(saved);
    const g = this.game, p = this.glitch.pos;
    // ちらつく壁から漏れる、歪んだ唸り
    this.glitchSound = g.audio.loopAt({ x: p.x, y: 1.5, z: p.z }, (out, nodes) => {
      const A = g.audio;
      const o = A.osc('square', 58); const ws = A.ctx.createWaveShaper();
      const curve = new Float32Array(256); for (let i = 0; i < 256; i++) curve[i] = Math.round(((i / 128) - 1) * 3) / 3;
      ws.curve = curve;
      const f = A.filter('bandpass', 700, 1.2); const og = A.gain(0.25);
      A.chain(o, ws, f, og, out); nodes.push(o);
      const lfo = A.osc('sine', 7); const lg = A.gain(30); lfo.connect(lg); lg.connect(o.frequency); nodes.push(lfo);
      const n = A.noise(); const nf = A.filter('highpass', 3000); const ng = A.gain(0.15); A.chain(n, nf, ng, out); nodes.push(n);
    });
    this.glitchSound?.set(1.2);
  }

  objective() {
    return this.state.hint ? '歪んで聞こえる壁を探し、すり抜けろ' : 'ここから出る方法を探せ';
  }
  status() {
    const d = this.glitchDist ?? 99;
    if (d < 6) return '壁の向こうから何かが漏れている…';
    if (d < 14) return '蛍光灯の音が、どこかおかしい';
    return '';
  }

  // 孤立の効果：いるだけで少しずつ正気が削られる
  sanityRate() { return -0.08; }

  onPickup(it) {
    if (it.type === 'note' && it.note === 1) this.state.hint = true;
    return false;
  }

  update(dt) {
    const g = this.game, p = g.player, w = this.world;
    const f = this.exitFace;
    const fp = this.glitch.pos;
    const d = Math.hypot(p.pos.x - fp.x, p.pos.z - fp.z);
    this.glitchDist = d;
    this.glitch.mat.uniforms.time.value = g.time;
    this.glitch.mat.uniforms.amount.value = Math.min(1, 0.25 + Math.max(0, 1 - d / 10) * 0.9);
    // すり抜け判定：ちらつく壁に向かって歩き込む
    if (d < 0.95) {
      const dir = new THREE.Vector3(); g.camera.getWorldDirection(dir);
      if (dir.x * f.dx + dir.z * f.dy > 0.4 && g.input.move.y > 0.2) {
        g.audio.noclip();
        g.completeLevel({ transition: 'noclip' });
        return;
      }
    }

    // 周辺視の組み替え：見ていない壁が現れたり消えたりする
    this.shiftTimer -= dt;
    if (this.shiftTimer <= 0) {
      this.shiftTimer = 1.2;
      const s = this.shifts[Math.floor(Math.random() * this.shifts.length)];
      if (s && s.center.distanceTo(new THREE.Vector3(p.pos.x, 1.5, p.pos.z)) > 7 && !g.canSee(s.center, 0.35)) {
        const want = !s.mesh.visible;
        const [ptx, pty] = w.toTile(p.pos.x, p.pos.z);
        s.set(want);
        // 出口への道が塞がったら元に戻す
        if (want) {
          const field = w.distanceField(ptx, pty);
          if (field[f.y * this.map.W + f.x] < 0) s.set(false);
        }
        if (want !== s.mesh.visible) { /* 戻された */ } else g.updatePlayerField(true);
      }
    }

    // 暗い人影(見ようとすると消える)
    this.figureTimer -= dt;
    if (this.figureTimer <= 0 && !this.figure) {
      this.figureTimer = 35 + Math.random() * 35;
      const dir = new THREE.Vector3(); g.camera.getWorldDirection(dir);
      for (let tries = 0; tries < 12; tries++) {
        const ang = Math.atan2(dir.x, dir.z) + (Math.random() - 0.5) * 1.4;
        const r = 12 + Math.random() * 10;
        const x = p.pos.x + Math.sin(ang) * r, z = p.pos.z + Math.cos(ang) * r;
        const [tx, ty] = w.toTile(x, z);
        if (w.solid(tx, ty) || !w.los(p.pos.x, p.pos.z, x, z)) continue;
        const ent = new Wanderer(g, new THREE.Vector3(x, 0, z));
        ent.voice?.stop(); ent.voice = null;
        ent.mesh.position.set(x, 0, z); ent.mesh.rotation.y = Math.atan2(p.pos.x - x, p.pos.z - z);
        ent.eyes.material.opacity = 0.15;
        this.figure = { ent, life: 5 };
        break;
      }
    }
    if (this.figure) {
      const fg = this.figure; fg.life -= dt;
      const pos = fg.ent.mesh.position;
      const seen = g.canSee(new THREE.Vector3(pos.x, 1.6, pos.z), 0.97);
      const near = Math.hypot(pos.x - p.pos.x, pos.z - p.pos.z) < 9;
      if (seen && !fg.seen) { fg.seen = true; fg.life = Math.min(fg.life, 0.35); g.audio.distantEvent({ x: pos.x, y: 1.5, z: pos.z }, 'whisper'); }
      if (fg.life <= 0 || near) { fg.ent.dispose(); this.figure = null; }
    }
  }

  dispose() { this.figure?.ent.dispose(); }

  /* ---------- 音 ---------- */
  ambient(api) {
    const A = api.A;
    A.fluoHum(api, 60, 1.3);
    // 湿った部屋の空気
    const n = A.noise(true); const f = A.filter('lowpass', 180); const g = A.gain(0.12);
    A.chain(n, f, g, api.out); api.start(n);
    // 蛍光灯の音がふっと途切れる(静寂が一番怖い)
    api.every(45000, () => {
      const t = A.t;
      A.humMute.gain.setValueAtTime(1, t); A.humMute.gain.linearRampToValueAtTime(0, t + 0.05);
      A.humMute.gain.setValueAtTime(0, t + 2.6); A.humMute.gain.linearRampToValueAtTime(1, t + 2.7);
    }, 30000);
  }

  // 壁越しに聞こえる、ゆがんだ有線放送のような BGM
  music(api) {
    const A = api.A;
    const lp = A.filter('lowpass', 650, 0.6); lp.connect(api.out); api.keep(lp);
    const wob = A.osc('sine', 0.33); const wg = A.gain(22); wob.connect(wg); api.start(wob);
    const chords = [[60, 64, 67, 71], [57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 65]];
    let i = 0;
    api.every(5600, () => {
      if (Math.random() < 0.3) { i++; return; } // ときどき途切れる
      const t = A.t;
      for (const m of chords[i % 4]) A.note(lp, m, t + Math.random() * 0.05, 5.2, { type: 'triangle', vol: 0.035, attack: 0.8, cutoff: 900, mod: wg });
      A.note(lp, chords[i % 4][0] - 24, t, 5.4, { type: 'sine', vol: 0.05, attack: 1 });
      i++;
    }, 600);
    return { intensity: (v) => lp.frequency.setTargetAtTime(650 - v * 380, A.t, 0.8) };
  }
}

export default {
  id: 'level-0', code: 'LEVEL 0', name: 'ロビー', en: 'The Lobby',
  desc: '湿ったカーペットの匂い。蛍光灯の唸り。\n同じ部屋が、どこまでも続いている。\n―― 見ていない間に、部屋は組み変わる。',
  theme: 'lobby', tile: 3.2, height: 3.0,
  lamp: { color: [1.0, 0.96, 0.78], intensity: 1.05, radius: 8.5 },
  fog: { color: 0x1d1a0c, density: 0.07 }, ambient: 0.035,
  map: {
    cells: [12, 12], braid: 0.6, rooms: 8, roomSize: [2, 5], pillarChance: 0.08, pillarGrid: 0.35, darkZones: 1, sector: 6,
    lamp: { pattern: 2, density: 0.62, broken: 0.1, flicker: 0.07 },
  },
  space: { decay: 1.1, wet: 0.22, bright: 0.35 },
  events: ['knock', 'steps', 'whisper', 'buzz'],
  Logic: Lobby,
  notes: [
    '【走り書きのメモ】\n\nここに来て何日たったのか、もう分からない。\n時計は止まっている。腹も減らない。\n蛍光灯の音だけが、ずっと耳の奥で鳴っている。\n\nさっき通った廊下に戻ったら、壁になっていた。\nこの場所は、見ていないところで形を変える。',
    '【黄ばんだ紙】\n\n出口は扉じゃない。\n\n壁の中に、ときどき「ちらつく」場所がある。\n近づくと蛍光灯の音が歪んで聞こえる。\nそこへ向かって、そのまま歩け。\n\n――抜けた先は「居住区」と呼ばれている。\nここよりは、まだマシらしい。',
  ],
};
