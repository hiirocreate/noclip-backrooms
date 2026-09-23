// 「何か」たち：徘徊者 / 笑顔 / 猟犬
import * as THREE from 'three';
import { FLOOR } from './mapgen.js';

const DIR8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const tmp = new THREE.Vector3();

class Entity {
  constructor(game, type, pos) {
    this.game = game; this.world = game.world; this.type = type;
    this.pos = pos.clone(); this.vel = new THREE.Vector3();
    this.state = 'wander'; this.stateTime = 0;
    this.target = null; this.field = null; this.fieldTarget = null;
    this.radius = 0.35; this.heading = Math.random() * Math.PI * 2;
    this.stepTimer = 0;
    this.voice = game.audio.entityVoice(type);
  }

  tile() { return this.world.toTile(this.pos.x, this.pos.z); }

  setTarget(x, z) {
    const [tx, ty] = this.world.toTile(x, z);
    if (this.fieldTarget && this.fieldTarget[0] === tx && this.fieldTarget[1] === ty) { this.target.set(x, 0, z); return; }
    this.field = this.world.distanceField(tx, ty);
    this.fieldTarget = [tx, ty];
    this.target = new THREE.Vector3(x, 0, z);
  }

  randomTarget(minD = 5, maxD = 18) {
    const list = this.world.map.floorList;
    const [ex, ey] = this.tile();
    for (let i = 0; i < 40; i++) {
      const p = list[Math.floor(Math.random() * list.length)];
      const d = Math.abs(p.x - ex) + Math.abs(p.y - ey);
      if (d >= minD && d <= maxD) { const c = this.world.tileCenter(p.x, p.y); this.setTarget(c.x, c.z); return; }
    }
    const p = list[Math.floor(Math.random() * list.length)];
    const c = this.world.tileCenter(p.x, p.y); this.setTarget(c.x, c.z);
  }

  // 距離場を下って移動。到着したら true
  followField(field, goal, speed, dt) {
    const w = this.world, W = w.map.W;
    const [tx, ty] = this.tile();
    const cur = field[ty * W + tx];
    let dest;
    if (cur <= 0 || w.los(this.pos.x, this.pos.z, goal.x, goal.z) && this.pos.distanceTo(tmp.set(goal.x, this.pos.y, goal.z)) < w.T * 2.5) {
      dest = goal;
    } else {
      let best = cur, bx = tx, by = ty;
      for (const [dx, dy] of DIR8) {
        const nx = tx + dx, ny = ty + dy;
        if (w.solid(nx, ny)) continue;
        if (dx && dy && (w.solid(tx + dx, ty) || w.solid(tx, ty + dy))) continue;
        const v = field[ny * W + nx];
        const cost = v + (dx && dy ? 0.4 : 0);
        if (v >= 0 && cost < best) { best = cost; bx = nx; by = ny; }
      }
      dest = w.tileCenter(bx, by);
    }
    const dx = dest.x - this.pos.x, dz = dest.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.15 && dest === goal) return true;
    const want = Math.atan2(dx, dz);
    let diff = want - this.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.heading += diff * Math.min(1, dt * 8);
    const step = Math.min(d, speed * dt);
    this.pos.x += (dx / (d || 1)) * step; this.pos.z += (dz / (d || 1)) * step;
    w.collide(this.pos, this.radius);
    return false;
  }

  distToPlayer() { const p = this.game.player.pos; return Math.hypot(p.x - this.pos.x, p.z - this.pos.z); }

  footsteps(dt, speed, interval) {
    if (speed < 0.1) return;
    this.stepTimer -= dt * speed;
    if (this.stepTimer <= 0) {
      this.stepTimer = interval;
      const d = this.distToPlayer();
      if (d < 26) this.voice?.step(this.pos, Math.min(1.2, 0.3 + speed / 4));
    }
  }

  setState(s) { this.state = s; this.stateTime = 0; }
  dispose() { this.game.scene.remove(this.mesh); this.voice?.stop(); }
}

/* ============ 徘徊者 : 背の高い黒い人影 ============ */
export class Wanderer extends Entity {
  constructor(game, pos) {
    super(game, 'wanderer', pos);
    const lv = game.cfg;
    this.walkSpeed = 1.3; this.chaseSpeed = lv.chaseSpeed || 3.8;
    const h = Math.min(lv.height - 0.15, 2.7);
    const s = h / 2.7;
    const mat = new THREE.MeshBasicMaterial({ color: 0x050403 });
    const g = new THREE.Group();
    const part = (geo, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m; };
    this.torso = part(new THREE.CylinderGeometry(0.2, 0.09, 1.1, 7), 0, 1.65, 0);
    this.head = part(new THREE.SphereGeometry(0.15, 8, 8), 0, 2.36, 0.03);
    this.head.scale.set(0.9, 1.4, 1);
    part(new THREE.CylinderGeometry(0.05, 0.04, 0.2, 5), 0, 2.2, 0);
    this.armL = new THREE.Group(); this.armR = new THREE.Group();
    for (const [arm, x] of [[this.armL, -0.24], [this.armR, 0.24]]) {
      arm.position.set(x, 2.12, 0);
      const a = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.025, 1.5, 5), mat); a.position.y = -0.75; arm.add(a);
      // 長い指
      for (let i = 0; i < 3; i++) { const f = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.004, 0.28, 3), mat); f.position.set((i - 1) * 0.025, -1.6, 0); arm.add(f); }
      g.add(arm);
    }
    this.legL = new THREE.Group(); this.legR = new THREE.Group();
    for (const [leg, x] of [[this.legL, -0.08], [this.legR, 0.08]]) {
      leg.position.set(x, 1.12, 0);
      const l = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.03, 1.12, 5), mat); l.position.y = -0.56; leg.add(l);
      g.add(leg);
    }
    // かすかに光る目
    const eyes = new THREE.Sprite(new THREE.SpriteMaterial({ map: game.world.common.eyes, color: 0xffeecc, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true, opacity: 0.55 }));
    eyes.scale.set(0.34, 0.17, 1); eyes.position.set(0, 2.4, 0.14);
    g.add(eyes); this.eyes = eyes;
    g.scale.setScalar(s);
    this.mesh = g;
    game.scene.add(g);
    this.lostTimer = 0;
    this.randomTarget();
  }

  canSee() {
    const g = this.game, p = g.player;
    const d = this.distToPlayer();
    const light = g.world.lightAt(p.pos.x, p.pos.z);
    let range = 7 + 14 * Math.min(1, light) + (p.flashlight ? 9 : 0);
    if (p.crouching) range *= 0.65;
    if (d > range) return false;
    if (d > 4.5) {
      const ang = Math.atan2(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
      let diff = Math.abs(ang - this.heading) % (Math.PI * 2); if (diff > Math.PI) diff = Math.PI * 2 - diff;
      if (diff > 1.25) return false;
    }
    return g.world.los(this.pos.x, this.pos.z, p.pos.x, p.pos.z);
  }

  hear(pos, radius) {
    if (this.state === 'chase') return;
    const d = Math.hypot(pos.x - this.pos.x, pos.z - this.pos.z);
    if (d < radius) { this.setState('investigate'); this.setTarget(pos.x, pos.z); }
  }

  update(dt, t) {
    this.stateTime += dt;
    const g = this.game, p = g.player;
    const sees = this.canSee();
    let speed = 0;
    if (sees && this.state !== 'chase') { this.setState('chase'); g.onChaseStart(this); }
    switch (this.state) {
      case 'wander':
        speed = this.walkSpeed;
        if (this.followField(this.field, this.target, speed, dt) || this.stateTime > 25) { this.setState('pause'); }
        break;
      case 'pause':
        if (this.stateTime > 1.5 + Math.random() * 2) { this.setState('wander'); this.randomTarget(); }
        this.heading += Math.sin(t * 0.8) * dt * 0.8;
        break;
      case 'investigate':
        speed = 2.3;
        if (this.followField(this.field, this.target, speed, dt) || this.stateTime > 15) this.setState('pause');
        break;
      case 'chase': {
        speed = this.chaseSpeed * (this.stateTime < 0.6 ? 0.3 : 1);
        if (sees) { this.lostTimer = 0; this.lastSeen = p.pos.clone(); } else this.lostTimer += dt;
        this.followField(g.playerField, p.pos, speed, dt);
        if (this.lostTimer > 3.5) {
          this.setState('search'); this.setTarget(this.lastSeen.x, this.lastSeen.z);
          g.onChaseEnd(this);
        }
        break;
      }
      case 'search':
        speed = 2.6;
        if (this.followField(this.field, this.target, speed, dt) || this.stateTime > 10) this.setState('pause');
        break;
    }
    if (this.distToPlayer() < 0.85) g.kill('wanderer');

    // アニメーション
    const m = this.mesh; m.position.set(this.pos.x, 0, this.pos.z); m.rotation.y = this.heading;
    const cyc = t * (speed > 3 ? 9 : 4.5);
    const sw = Math.min(1, speed / 2);
    this.legL.rotation.x = Math.sin(cyc) * 0.5 * sw; this.legR.rotation.x = -Math.sin(cyc) * 0.5 * sw;
    this.armL.rotation.x = -Math.sin(cyc) * 0.35 * sw + (this.state === 'chase' ? -0.6 : 0);
    this.armR.rotation.x = Math.sin(cyc) * 0.35 * sw + (this.state === 'chase' ? -0.6 : 0);
    this.armL.rotation.z = -0.05; this.armR.rotation.z = 0.05;
    this.torso.rotation.z = Math.sin(t * 1.3) * 0.05;
    // 首が不自然にかくつく
    if (Math.random() < dt * 2) this.headTwitch = (Math.random() - 0.5) * 1.2;
    this.head.rotation.z += ((this.headTwitch || 0) - this.head.rotation.z) * Math.min(1, dt * 20);
    this.eyes.material.opacity = this.state === 'chase' ? 0.95 : 0.4;
    this.footsteps(dt, speed, 1.4);
    const d = this.distToPlayer();
    this.voice?.set(tmp.set(this.pos.x, 2, this.pos.z), d < 30 ? (this.state === 'chase' ? 0.9 : 0.35) : 0);
  }
}

/* ============ 笑顔 : 暗がりに浮かぶ顔 ============ */
export class Smiler extends Entity {
  // hunter: 停電中だけ現れ、光に引き寄せられる(Level 1)
  constructor(game, pos, { hunter = false } = {}) {
    super(game, 'smiler', pos);
    this.hunter = hunter;
    const mat = new THREE.SpriteMaterial({ map: game.world.common.smiler, color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true, opacity: 0.9 });
    this.mesh = new THREE.Sprite(mat);
    this.mesh.scale.set(1.1, 1.1, 1);
    game.scene.add(this.mesh);
    this.home = pos.clone(); this.lit = 0; this.state = 'idle'; this.alpha = 0;
    this.drift = new THREE.Vector3();
  }

  isDark(x, z) {
    const [tx, ty] = this.world.toTile(x, z);
    return this.world.map.dark[ty * this.world.map.W + tx] || this.world.lightAt(x, z) < 0.12;
  }

  relocate() {
    if (this.hunter) { this.gone = true; return; }
    const list = this.world.map.floorList.filter(p => this.world.map.dark[p.y * this.world.map.W + p.x]);
    const pp = this.game.player.pos;
    for (let i = 0; i < 30 && list.length; i++) {
      const p = list[Math.floor(Math.random() * list.length)];
      const c = this.world.tileCenter(p.x, p.y);
      if (Math.hypot(c.x - pp.x, c.z - pp.z) > 12) { this.pos.copy(c); this.home.copy(c); return; }
    }
  }

  update(dt, t) {
    this.stateTime += dt;
    const g = this.game, p = g.player;
    const d = this.distToPlayer();
    const dark = this.isDark(this.pos.x, this.pos.z) || g.world.power < 0.5;
    const safe = (x, z) => g.logic?.isSafe?.(x, z);
    // 懐中電灯に照らされているか
    let inBeam = false;
    if (p.flashlight && d < 16) {
      tmp.set(this.pos.x - p.cam.position.x, 1.6 - p.cam.position.y, this.pos.z - p.cam.position.z).normalize();
      const dir = p.cam.getWorldDirection(new THREE.Vector3());
      if (tmp.dot(dir) > 0.93 && g.world.los(p.pos.x, p.pos.z, this.pos.x, this.pos.z)) inBeam = true;
    }
    if (this.state === 'idle' && this.hunter) {
      this.lit = inBeam ? this.lit + dt : Math.max(0, this.lit - dt * 0.5);
      // 光に引き寄せられる。避難所(緑の非常灯)の中には入れない
      const playerSafe = safe(p.pos.x, p.pos.z);
      let speed = playerSafe ? 0 : p.flashlight && d < 30 ? 2.4 : d < 14 ? 0.7 : 0.3;
      if (speed) {
        const ox = this.pos.x, oz = this.pos.z;
        this.followField(g.playerField, p.pos, speed, dt);
        if (safe(this.pos.x, this.pos.z)) { this.pos.x = ox; this.pos.z = oz; }
      }
      if (!playerSafe && (this.lit > 0.4 || d < 2.0)) { this.setState('charge'); g.onChaseStart(this); }
    } else if (this.state === 'idle') {
      this.lit = inBeam ? this.lit + dt : Math.max(0, this.lit - dt * 0.5);
      // ゆっくり漂う
      this.drift.set(Math.sin(t * 0.3 + this.home.x), 0, Math.cos(t * 0.23 + this.home.z)).multiplyScalar(0.6);
      const tx = this.home.x + this.drift.x, tz = this.home.z + this.drift.z;
      this.pos.x += (tx - this.pos.x) * dt; this.pos.z += (tz - this.pos.z) * dt;
      // 光を消して近くにいると、少しずつ寄ってくる
      if (!p.flashlight && d < 9 && dark && g.world.los(this.pos.x, this.pos.z, p.pos.x, p.pos.z)) {
        const nx = this.pos.x + (p.pos.x - this.pos.x) / d * 0.5 * dt, nz = this.pos.z + (p.pos.z - this.pos.z) / d * 0.5 * dt;
        if (this.isDark(nx, nz)) { this.pos.x = nx; this.pos.z = nz; this.home.x = nx; this.home.z = nz; }
      }
      if (this.lit > 0.45 || d < 2.2) { this.setState('charge'); g.onChaseStart(this); }
    } else if (this.state === 'charge') {
      const speed = this.stateTime < 0.35 ? 0 : 7.2;
      const ox = this.pos.x, oz = this.pos.z;
      if (speed) this.followField(g.playerField, p.pos, speed, dt);
      if (safe(this.pos.x, this.pos.z)) { this.pos.x = ox; this.pos.z = oz; this.setState('fade'); g.onChaseEnd(this); }
      if (d < 0.9) g.kill('smiler');
      if (this.stateTime > 4.5) { this.setState('fade'); g.onChaseEnd(this); }
    } else if (this.state === 'fade') {
      if (this.stateTime > 1.2) { this.relocate(); this.setState('idle'); this.lit = 0; }
    }
    // 見た目：暗いところでだけ見える
    const want = this.state === 'fade' ? 0 : this.state === 'charge' ? 1 : (dark ? 0.85 : 0.05);
    this.alpha += (want - this.alpha) * Math.min(1, dt * 3);
    const jitter = this.state === 'charge' ? 0.04 : 0.01;
    this.mesh.position.set(this.pos.x + (Math.random() - 0.5) * jitter, 1.55 + Math.sin(t * 1.7) * 0.05, this.pos.z + (Math.random() - 0.5) * jitter);
    this.mesh.material.opacity = this.alpha * (0.85 + Math.random() * 0.15);
    const sc = this.state === 'charge' ? 1.35 : 1.05;
    this.mesh.scale.set(sc, sc, 1);
    this.voice?.set(tmp.set(this.pos.x, 1.6, this.pos.z), d < 14 ? this.alpha * (this.state === 'charge' ? 1.4 : 0.6) : 0);
  }
}

/* ============ 猟犬 : 盲目、音に反応 ============ */
export class Hound extends Entity {
  constructor(game, pos) {
    super(game, 'hound', pos);
    const mat = new THREE.MeshLambertMaterial({ color: 0x1a0f0c, emissive: 0x0a0302 });
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 1.2, 7), mat);
    body.rotation.x = Math.PI / 2; body.position.y = 0.72; g.add(body);
    // 肋骨
    for (let i = 0; i < 5; i++) {
      const r = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.025, 4, 10, Math.PI), mat);
      r.position.set(0, 0.72, -0.3 + i * 0.13); r.rotation.z = Math.PI; g.add(r);
    }
    this.headG = new THREE.Group(); this.headG.position.set(0, 0.85, 0.72);
    const skull = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.5, 6), mat); skull.rotation.x = Math.PI / 2; skull.position.z = 0.15; this.headG.add(skull);
    this.jaw = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.42, 5), mat);
    this.jaw.rotation.x = Math.PI / 2; this.jaw.position.set(0, -0.1, 0.13); this.headG.add(this.jaw);
    // 牙
    const toothMat = new THREE.MeshBasicMaterial({ color: 0xcfc4a8 });
    for (let i = 0; i < 7; i++) {
      const a = (i / 6 - 0.5) * 1.6;
      const up = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.09, 4), toothMat);
      up.position.set(Math.sin(a) * 0.1, -0.05, 0.12 + Math.cos(a) * 0.12); up.rotation.x = Math.PI; this.headG.add(up);
      const lo = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.07, 4), toothMat);
      lo.position.set(Math.sin(a) * 0.07, 0.05, 0.08 + Math.cos(a) * 0.1); this.jaw.add(lo);
    }
    g.add(this.headG);
    this.legs = [];
    for (const [x, z] of [[-0.18, 0.4], [0.18, 0.4], [-0.18, -0.4], [0.18, -0.4]]) {
      const lg = new THREE.Group(); lg.position.set(x, 0.72, z);
      const l = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.025, 0.78, 5), mat); l.position.y = -0.36; lg.add(l);
      g.add(lg); this.legs.push(lg);
    }
    this.mesh = g; game.scene.add(g);
    this.walkSpeed = 1.6; this.huntSpeed = 5.4;
    this.randomTarget();
  }

  hear(pos, radius, relay = false) {
    const d = Math.hypot(pos.x - this.pos.x, pos.z - this.pos.z);
    if (relay || d < radius * 1.5) {
      const wasHunting = this.state === 'hunt';
      if (!wasHunting) { this.game.onChaseStart(this); }
      this.setState('hunt'); this.setTarget(pos.x, pos.z);
      // 遠吠えで仲間に知らせる(群れで狩る)
      if (!relay && !wasHunting) {
        this.game.audio.howl?.(this.pos);
        for (const e of this.game.entities) if (e !== this && e.type === 'hound' && e.distToPlayer() < 45) e.hear(pos, radius, true);
      }
    }
  }

  update(dt, t) {
    this.stateTime += dt;
    const g = this.game, p = g.player;
    let speed = 0;
    const d = this.distToPlayer();
    // 至近距離で動いていれば気づく
    if (d < 2.4 && p.moving && !p.crouching && this.state !== 'hunt') this.hear(p.pos, 5);
    switch (this.state) {
      case 'wander':
        speed = this.walkSpeed;
        if (this.followField(this.field, this.target, speed, dt) || this.stateTime > 20) this.setState('sniff');
        break;
      case 'sniff':
        this.heading += Math.sin(t * 3) * dt * 2;
        if (this.stateTime > 2.5) { this.setState('wander'); this.randomTarget(); }
        break;
      case 'hunt':
        speed = this.huntSpeed;
        if (this.followField(this.field, this.target, speed, dt)) { this.setState('sniff'); g.onChaseEnd(this); }
        if (this.stateTime > 12) { this.setState('sniff'); g.onChaseEnd(this); }
        break;
    }
    if (d < 0.95) g.kill('hound');

    const m = this.mesh; m.position.set(this.pos.x, 0, this.pos.z); m.rotation.y = this.heading;
    const cyc = t * (speed > 3 ? 16 : 6);
    this.legs.forEach((l, i) => { l.rotation.x = Math.sin(cyc + (i % 2 ? Math.PI : 0) + (i > 1 ? 0.8 : 0)) * 0.6 * Math.min(1, speed / 2); });
    this.jaw.rotation.x = Math.PI / 2 + 0.25 + Math.sin(t * 9) * 0.15;
    this.headG.rotation.y = this.state === 'sniff' ? Math.sin(t * 6) * 0.5 : 0;
    this.footsteps(dt, speed, 0.9);
    this.voice?.set(tmp.set(this.pos.x, 0.8, this.pos.z), d < 25 ? (this.state === 'hunt' ? 1 : 0.4) : 0);
  }
}

/* ============ ダラー : 壁をすり抜ける灰色の人影 ============ */
export class Duller extends Wanderer {
  constructor(game, pos) {
    super(game, pos);
    this.type = 'duller';
    this.voice?.stop(); this.voice = game.audio.entityVoice('duller');
    this.walkSpeed = 0.8; this.chaseSpeed = 1.9;
    const mat = new THREE.MeshBasicMaterial({ color: 0x9a9a94, transparent: true, opacity: 0.55, depthWrite: false });
    this.mesh.traverse(o => { if (o.isMesh) o.material = mat; });
    this.eyes.visible = false;
  }
  randomTarget() {
    const T = this.world.T, W = this.world.map.W, H = this.world.map.H;
    this.target = new THREE.Vector3((1 + Math.random() * (W - 2)) * T, 0, (1 + Math.random() * (H - 2)) * T);
  }
  // 壁を無視してまっすぐ進む
  followField(field, goal, speed, dt) {
    const dx = goal.x - this.pos.x, dz = goal.z - this.pos.z, d = Math.hypot(dx, dz);
    if (d < 0.2) return true;
    this.heading = Math.atan2(dx, dz);
    const st = Math.min(d, speed * dt);
    this.pos.x += dx / d * st; this.pos.z += dz / d * st;
    return false;
  }
  canSee() {
    const p = this.game.player; const d = this.distToPlayer();
    if (d > (p.flashlight ? 14 : 9) * (p.crouching ? 0.6 : 1)) return false;
    return this.world.los(this.pos.x, this.pos.z, p.pos.x, p.pos.z);
  }
  setTarget(x, z) { this.target = new THREE.Vector3(x, 0, z); }
}

export function spawnEntity(game, type, avoidDist = 14) {
  const w = game.world;
  const field = game.playerField;
  const cand = w.map.floorList.filter(p => {
    const v = field[p.y * w.map.W + p.x];
    if (v < 0 || v * w.T < avoidDist * 1.0) return false;
    if (type === 'smiler' && w.map.dark.some?.(Boolean) && !w.map.dark[p.y * w.map.W + p.x]) return false;
    return true;
  });
  const list = cand.length ? cand : w.map.floorList;
  const p = list[Math.floor(Math.random() * list.length)];
  const pos = w.tileCenter(p.x, p.y);
  if (type === 'wanderer') return new Wanderer(game, pos);
  if (type === 'smiler') return new Smiler(game, pos);
  if (type === 'duller') return new Duller(game, pos);
  return new Hound(game, pos);
}

export { FLOOR };
