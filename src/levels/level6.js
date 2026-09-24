// LEVEL 6「消灯」― 光がまったく存在しない階層。ライトは点かない。
// 手を叩いた反響で一瞬だけ周りを「見て」、水の音を頼りに出口を探す。ただし音は、闇の中の何かにも届く
import * as THREE from 'three';
import { LevelLogic } from './base.js';
import { farthestFace } from '../mapgen.js';
import { spawnEntity } from '../entities.js';

class LightsOut extends LevelLogic {
  plan(map) {
    super.plan(map);
    map.lamps = []; // 灯りはひとつもない
    this.exitFace = farthestFace(map, this.used);
  }

  build(world) {
    super.build(world);
    const ex = this.exitFace, W = this.map.W, T = world.T;
    this.door = world.addDoor(ex, { style: 'metal', w: 1.1, h: 2.1 });
    world.addDecal(ex, 'seep', { w: 1.3, h: 2.2, y: 1.2, off: 0.06 });
    this.addInteract({
      pos: this.door.pos, radius: 1.4, label: 'ドアを開ける',
      action: () => { this.say('隙間から、冷たい水が流れ込んでくる……', 2); this.exit(); },
    });
    // 出口に近づくほど床が濡れている
    this.exitField = world.distanceField(ex.x, ex.y);
    for (const p of this.map.floorList) {
      const d = this.exitField[p.y * W + p.x];
      if (d < 0 || d > 9 || this.map.rnd() > 1 - d / 11) continue;
      world.addFloorDecal((p.x + 0.5) * T + (this.map.rnd() - 0.5) * T * 0.4, (p.y + 0.5) * T + (this.map.rnd() - 0.5) * T * 0.4, 'puddle', 1.2 + this.map.rnd() * 1.2, this.map.rnd() * 6);
    }
  }

  items() { return this.supplies({ batteries: 2, waters: 3 }); }

  spawn() {
    const g = this.game;
    g.entities.push(spawnEntity(g, 'hound', 20), spawnEntity(g, 'hound', 26));
  }

  start(saved) {
    super.start(saved);
    const g = this.game;
    g.ambientLight.intensity = 0;
    // 反響(手を叩いた瞬間だけ周りが浮かび上がる)
    this.echo = new THREE.PointLight(0xa6c4ff, 0, 17, 1.25);
    g.scene.add(this.echo);
    this.clapCD = 0;
    this.dripT = 1;
    this.fakeT = 12;
    this.state.claps ||= 0;
    // 出口の向こうを流れる水
    const d = this.door.pos;
    this.flow = g.audio.loopAt({ x: d.x, y: 0.4, z: d.z }, (out, nodes) => {
      const A = g.audio;
      const n = A.noise(); const f = A.filter('bandpass', 700, 0.6); const ng = A.gain(0.5); A.chain(n, f, ng, out); nodes.push(n);
      const n2 = A.noise(true); const f2 = A.filter('lowpass', 260); const g2 = A.gain(0.6); A.chain(n2, f2, g2, out); nodes.push(n2);
    });
    this.flow?.set(1.3);
    setTimeout(() => this.say(g.input.isTouch ? '「手を叩く」ボタンで、反響から周りの様子が分かる' : '[F] で手を叩くと、反響で周りの様子が分かる', 5), 1500);
  }

  lightLabel() { return '手を叩く'; }

  // ライトの代わりに手を叩く
  lightAction() {
    const g = this.game;
    if (this.clapCD > 0) return true;
    this.clapCD = 0.9;
    this.state.claps++;
    g.audio.clap();
    this.echo.intensity = 55;
    g.makeNoise(g.player.pos, 12, true);
    return true;
  }

  objective() { return '水の音を頼りに出口を探せ'; }
  status() {
    const p = this.game.player.pos, w = this.world;
    const [tx, ty] = w.toTile(p.x, p.z);
    const d = this.exitField[ty * this.map.W + tx];
    if (d >= 0 && d < 5) return '足元が濡れている。水の音がすぐ近くだ';
    if (d >= 0 && d < 10) return '水の音が近づいてきた';
    return '';
  }
  sanityRate() { return 0.75; } // 暗闇による減少(プレイヤー側)を少し和らげる
  tension() { return 0.1; }

  update(dt) {
    const g = this.game, p = g.player, cam = g.camera;
    // ライトは点かない
    if (p.flashlight) { p.flashlight = false; document.getElementById('btn-light')?.classList.remove('on'); }
    p.glow.intensity = 0.04;
    this.clapCD -= dt;
    this.echo.position.copy(cam.position);
    this.echo.intensity *= Math.exp(-dt * 2.4);
    // 水滴の音(出口の方向)
    this.dripT -= dt;
    if (this.dripT <= 0) {
      this.dripT = 0.7 + Math.random() * 0.7;
      const d = this.door.pos;
      if (d.distanceTo(p.pos) < 45) g.audio.distantEvent({ x: d.x + (Math.random() - 0.5), y: 1.8, z: d.z + (Math.random() - 0.5) }, 'drip');
    }
    // 正気が減ると、ありもしない方向から水の音が聞こえる
    this.fakeT -= dt;
    if (p.sanity < 50 && this.fakeT <= 0) {
      this.fakeT = 5 + Math.random() * 6;
      const a = Math.random() * Math.PI * 2;
      for (let i = 0; i < 4; i++) g.audio.distantEvent({ x: p.pos.x + Math.cos(a) * 14, y: 1.8, z: p.pos.z + Math.sin(a) * 14 }, 'drip');
    }
  }

  dispose() {
    const g = this.game;
    if (this.echo) g.scene.remove(this.echo);
    const b = document.getElementById('btn-light'); if (b) b.textContent = 'ライト';
  }

  /* ---------- 音 ---------- */
  ambient(api) {
    const A = api.A;
    // ほぼ無音。自分の耳鳴りと、遠い低音だけ
    const n = A.noise(true); const f = A.filter('lowpass', 90); const g = A.gain(0.12); A.chain(n, f, g, api.out); api.start(n);
    const ring = A.osc('sine', 6200); const rg = A.gain(0.0015); A.chain(ring, rg, api.out); api.start(ring);
  }

  // 間遠に落ちてくる、ピアノのような音
  music(api) {
    const A = api.A, out = api.out;
    const scale = [45, 48, 50, 52, 55, 57, 60, 62, 64];
    let tension = 0;
    const play = () => {
      const t = A.t;
      const m = scale[Math.floor(Math.random() * scale.length)] + (Math.random() < 0.3 ? 12 : 0);
      A.note(out, m, t, 6, { type: 'sine', vol: 0.03, attack: 0.005, fm: 0.25 });
      if (tension > 0.3) A.note(out, m + 1, t + 0.02, 5, { type: 'sine', vol: 0.02 * tension, attack: 0.005 });
      api.after(tension > 0.3 ? 1800 + Math.random() * 1500 : 4500 + Math.random() * 5000, play);
    };
    api.after(2500, play);
    const drone = A.osc('sine', A.hz(26)); const dg = A.gain(0); A.chain(drone, dg, out); api.start(drone);
    return { intensity: (v) => { tension = v; dg.gain.setTargetAtTime(v * 0.08, A.t, 0.8); } };
  }
}

export default {
  id: 'level-6', code: 'LEVEL 6', name: '消灯', en: 'Lights Out',
  desc: '光がまったく存在しない階層。\n持ち込んだ明かりは、なぜか点かない。\n―― 頼れるのは、音と手探りだけ。',
  theme: 'dark', tile: 3.0, height: 3.0,
  lamp: { color: [1, 1, 1], intensity: 1, radius: 6 },
  fog: { color: 0x000000, density: 0.1 }, ambient: 0.0, chaseSpeed: 3.6,
  map: {
    cells: [12, 12], braid: 0.4, rooms: 4, roomSize: [2, 3], pillarChance: 0.12, darkZones: 0, sector: 6,
    lamp: { pattern: 2, density: 0, broken: 0, flicker: 0 },
  },
  space: { decay: 3.2, wet: 0.5, bright: 0.3 },
  events: ['thump', 'whisper', 'steps', 'drip'],
  Logic: LightsOut,
  notes: [
    '【M.E.G. 探索記録 / Level 6（手探りで書いた文字）】\n\nここには光がない。\nライトも、マッチも、点けたはずなのに何も照らさない。\n\n手を叩け。反響が、壁の位置を教えてくれる。\nただし、闇の中の何かも、その音を聞いている。\n叩いたら、すぐにその場を離れろ。\n\n水の音がする方へ進め。出口は濡れている。',
    '【壁に刻まれた文字】\n\nみえない\nみえない\nでも　あいつらも　みえてない\nおとを　たてるな\nみずの　おとの　ほうへ',
  ],
};
