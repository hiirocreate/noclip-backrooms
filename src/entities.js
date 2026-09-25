// 「何か」たち：徘徊者 / 笑顔 / 猟犬
import * as THREE from 'three';
import { FLOOR } from './mapgen.js';
import { BODY, buildHumanoid, addMouth, addHair, hairMaterial, buildHound, buildSpider, skinMaterial } from './entitymodels.js';

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
  dispose() {
    this.game.scene.remove(this.mesh); this.voice?.stop();
    // 形状は同じ種類で使い回すので、マテリアルだけ解放する
    const seen = new Set();
    this.mesh?.traverse?.(o => { if (o.material && !seen.has(o.material)) { seen.add(o.material); o.material.dispose(); } });
  }
}

/* ============ 徘徊者 : 背の高い黒い人影 ============ */
export class Wanderer extends Entity {
  constructor(game, pos, { body = BODY.tall, mats = null, hair = body === BODY.tall } = {}) {
    super(game, 'wanderer', pos);
    const lv = game.cfg;
    this.walkSpeed = 1.3; this.chaseSpeed = lv.chaseSpeed || 3.8;
    const h = Math.min(lv.height - 0.15, 2.7);
    const s = h / 2.7;
    // 痩せこけた長身の人影。濡れて黒ずんだ皮膚、顔を覆う長い黒髪、裂けた口
    this.mats = mats || { skin: skinMaterial(0x5e5049, { rim: 0x2a2522, wet: 0.6 }) };
    const rig = this.rig = buildHumanoid(body, this.mats);
    this.bodyType = body;
    this.baseLean = body.hunch || 0.3;
    this.headBase = body === BODY.tall ? 0.32 : 0;   // 首が常に傾いている
    if (hair) {
      this.mats.hair = this.mats.hair || hairMaterial();
      addHair(rig, body, this.mats.hair, { seed: Math.floor(Math.random() * 1000) });
    }
    if (body === BODY.tall && !rig.mouthCav) addMouth(rig, body, this.mats, { teeth: 14, open: 0.05 });
    this.torso = rig.chest; this.head = rig.head;
    this.armL = rig.armL.shoulder; this.armR = rig.armR.shoulder;
    this.legL = rig.legL.hip; this.legR = rig.legR.hip;
    // 眼窩の奥でかすかに光る目
    const eyes = new THREE.Sprite(new THREE.SpriteMaterial({ map: game.world.common.eyes, color: 0xffeecc, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true, opacity: 0.55 }));
    eyes.scale.set(body.headR * 2.4, body.headR * 1.2, 1); eyes.position.set(0, body.headR * 0.12, body.headR * 0.93);
    rig.head.add(eyes); this.eyes = eyes;
    const g = rig.group;
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

  // 捕まえた瞬間：両腕を顔の横へ伸ばし、口を限界まで開く
  deathPose(T) {
    const r = this.rig;
    const q = Math.min(1, T / 0.22), n = () => (Math.random() - 0.5);
    r.body.position.y = this.bodyType.hipY; r.body.rotation.z = n() * 0.05;
    r.spine.rotation.set(0.15 * q, 0, 0); r.chest.rotation.z = 0;
    r.neck.rotation.set(-0.15, 0, 0);
    r.head.rotation.set(-0.25 + n() * 0.12, n() * 0.1, (this.headBase || 0) * 0.6 + n() * 0.15);
    for (const [arm, sd] of [[r.armL, -1], [r.armR, 1]]) {
      arm.shoulder.rotation.set(-1.45 * q + n() * 0.06, 0, sd * (0.55 * q));
      arm.elbow.rotation.x = -0.5 * q; arm.wrist.rotation.x = 0.4;
      arm.fingers.forEach((f) => { const c = -0.5 + n() * 0.5; f.k.rotation.x = c; f.k2.rotation.x = c * 1.5; });
    }
    if (r.mouthCav) { r.jaw.rotation.x = 0.2 + q * 0.95 + n() * 0.08; r.mouthCav.scale.y = 0.4 + r.jaw.rotation.x * 0.75; }
    // 前髪が割れて、顔が見える
    if (r.hair) r.hair.forEach((h, i) => { h.visible = i !== 0; h.rotation.x = -0.3 * q; h.rotation.z = (i === 1 ? -0.25 : i === 2 ? 0.25 : 0) * q; });
    if (this.eyes) { this.eyes.visible = this.type !== 'duller' && this.type !== 'faceling'; this.eyes.material.opacity = 1; }
  }

  animate(dt, t, speed, reach) {
    animateHumanoid(this, dt, t, speed, reach);
    this.eyes.material.opacity = reach ? 0.95 : 0.4;
    const r = this.rig;
    if (r.mouthCav && !this.pose) r.jaw.rotation.x = reach ? 0.25 + Math.abs(Math.sin(t * 6)) * 0.3 : 0.05 + Math.max(0, Math.sin(t * 0.9 + this.pos.x)) * 0.12;
    this.pose?.(t);
    if (r.mouthCav) r.mouthCav.scale.y = 0.35 + r.jaw.rotation.x * 0.75;
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
    if (this.distToPlayer() < 0.85) g.kill(this.type);

    // アニメーション
    const m = this.mesh; m.position.set(this.pos.x, 0, this.pos.z); m.rotation.y = this.heading;
    this.animate(dt, t, speed, this.state === 'chase');
    this.footsteps(dt, speed, 1.4);
    const d = this.distToPlayer();
    this.voice?.set(tmp.set(this.pos.x, 2, this.pos.z), d < 30 ? (this.state === 'chase' ? 0.9 : 0.35) : 0);
  }
}

/* ---- 人型の動き(徘徊者・ダラー・主・潰れたもの・住人で共通) ----
 * なめらかに動くとマネキンのように見えるので、わざと「かくつき」を入れる：
 * 数フレーム止まってから一気に動く / 首が急に折れる / 体が痙攣する */
function animateHumanoid(e, dt, t, speed, reach) {
  const r = e.rig;
  const calm = e.type === 'faceling' || e.type === 'duller';
  if (!calm) {
    // コマ落とし：たまに一瞬だけ静止して、次のフレームで追いつく
    if (e.freeze > 0) { e.freeze -= dt; e.animT = (e.animT ?? t); return; }
    if (Math.random() < dt * (reach ? 2.2 : 0.9)) e.freeze = 0.06 + Math.random() * (reach ? 0.1 : 0.22);
  }
  e.animT = t;
  const cyc = t * (speed > 3 ? 8.5 : 4.2) + e.pos.x;
  const sw = Math.min(1, speed / 2);
  const s1 = Math.sin(cyc);
  // 痙攣(ビクッと体が跳ねる)
  if (!calm && Math.random() < dt * (reach ? 1.5 : 0.35)) e.spasm = 1;
  e.spasm = Math.max(0, (e.spasm || 0) - dt * 5);
  const sp = e.spasm * e.spasm;
  // 脚：膝を曲げたまま、引きずるように歩く
  const drag = calm ? 0 : 0.18;
  r.legL.hip.rotation.x = s1 * 0.5 * sw - drag * 0.6; r.legR.hip.rotation.x = -s1 * 0.5 * sw - drag * 0.6;
  r.legL.knee.rotation.x = Math.max(0, Math.sin(cyc - 1.2)) * 0.9 * sw + 0.05 + drag;
  r.legR.knee.rotation.x = Math.max(0, Math.sin(cyc + Math.PI - 1.2)) * 0.9 * sw + 0.05 + drag * 1.4;
  r.legL.ankle.rotation.x = -r.legL.knee.rotation.x * 0.4; r.legR.ankle.rotation.x = -r.legR.knee.rotation.x * 0.4;
  r.legR.hip.rotation.z = calm ? 0 : 0.06; // 片脚が外に開いている
  // 上半身：前かがみ・左右非対称・揺れ・呼吸
  r.body.position.y = e.bodyType.hipY + Math.abs(Math.cos(cyc)) * 0.03 * sw - drag * 0.08;
  r.body.rotation.z = Math.sin(t * 1.3) * 0.04 + (calm ? 0 : 0.07) + sp * 0.15;
  r.spine.rotation.x = e.baseLean + (reach ? 0.35 + Math.sin(t * 7) * 0.05 : 0) + Math.sin(t * 1.7) * 0.02 - sp * 0.35;
  r.spine.rotation.y = calm ? 0 : Math.sin(t * 0.6 + e.pos.z) * 0.12;
  r.chest.rotation.z = calm ? 0 : -0.1; // 片方の肩が落ちている
  r.chest.scale.set(1 + Math.sin(t * 1.7) * 0.012, 1, 1 + Math.sin(t * 1.7) * 0.02);
  r.neck.rotation.x = (calm ? 0.2 : 0.35) + (reach ? -0.45 : 0) + sp * 0.5;
  // 腕：だらりと垂れて遅れて揺れる / 追うときは前へ突き出して掻く
  for (const [arm, sd] of [[r.armL, -1], [r.armR, 1]]) {
    const ph = sd < 0 ? s1 : -s1;
    const claw = reach ? Math.sin(t * 9 + sd * 1.7) : 0;
    arm.shoulder.rotation.x = -ph * 0.3 * sw + (reach ? -1.35 + claw * 0.25 : 0) + (sd < 0 ? 0.05 : -0.04);
    arm.shoulder.rotation.z = sd * (reach ? 0.18 : 0.05) + (calm ? 0 : sd < 0 ? -0.05 : 0.02) + sp * sd * 0.35;
    arm.elbow.rotation.x = reach ? -0.35 - Math.max(0, claw) * 0.5 : -0.08 - Math.max(0, ph) * 0.25 * sw;
    arm.wrist.rotation.x = reach ? 0.35 : 0.15;
    // 長い指が別々に、不規則に動く
    arm.fingers.forEach((f, i) => {
      const n = Math.sin(t * (reach ? 11 : 2.3) + i * 1.9 + sd * 3) * Math.sin(t * 0.7 + i);
      const curl = reach ? 0.1 + Math.max(0, claw) * 0.9 + n * 0.3 : 0.2 + n * 0.35;
      f.k.rotation.x = -curl; f.k2.rotation.x = -curl * 1.4 - (calm ? 0 : 0.2);
    });
  }
  // 首：傾いたまま。ときどき急にカクッと折れる / 小刻みに震える
  if (Math.random() < dt * (reach ? 3 : 1.2)) e.headTwitch = (Math.random() - 0.5) * (calm ? 0.6 : 1.6);
  if (!calm && Math.random() < dt * 0.4) e.shudder = 0.5 + Math.random() * 0.6;
  e.shudder = Math.max(0, (e.shudder || 0) - dt);
  const target = (e.headBase || 0) + (e.headTwitch || 0) * 0.5;
  r.head.rotation.z += (target - r.head.rotation.z) * Math.min(1, dt * 35);
  r.head.rotation.x = (e.shudder > 0 ? Math.sin(t * 70) * 0.09 : 0) + sp * -0.4;
  r.head.rotation.y = e.shudder > 0 ? Math.sin(t * 53) * 0.12 : Math.sin(t * 0.5 + e.pos.x) * 0.1;
  // 髪が遅れて揺れる
  if (r.hair) r.hair.forEach((h, i) => {
    h.rotation.x = -r.neck.rotation.x * 0.35 - r.spine.rotation.x * 0.3 + Math.sin(t * 2.1 + i) * 0.03 + Math.sin(cyc * 2) * 0.05 * sw;
    h.rotation.z = -r.head.rotation.z * 0.6 + Math.sin(t * 1.7 + i * 2) * 0.03;
  });
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
    // あばらの浮いた、毛のない猟犬
    const rig = this.rig = buildHound(skinMaterial(0x3c2b25, { rim: 0x3a2419, wet: 0.35, bump: 0.04 }));
    this.headG = rig.headG; this.jaw = rig.jaw; this.legs = rig.legs;
    this.mesh = rig.group; game.scene.add(rig.group);
    this.walkSpeed = 1.6; this.huntSpeed = 5.4;
    this.randomTarget();
  }

  deathPose(T) {
    const r = this.rig, q = Math.min(1, T / 0.22), n = () => (Math.random() - 0.5);
    r.neck.rotation.x = -2.0 + 0.9 * q;
    r.headTilt.rotation.set(2.0 - 0.15 - 0.9 * q + n() * 0.15, n() * 0.15, n() * 0.3);
    this.jaw.rotation.x = 0.2 + q * 0.75 + n() * 0.1;
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
    const r = this.rig;
    const cyc = t * (speed > 3 ? 14 : 6) + this.pos.z;
    const sw = Math.min(1, speed / 2);
    r.legs.forEach((l, i) => {
      const ph = cyc + (i % 2 ? Math.PI : 0) + (l.hind ? 0.9 : 0);
      const s1 = Math.sin(ph), lift = Math.max(0, Math.sin(ph + 1.2));
      if (!l.hind) {
        l.root.rotation.x = s1 * 0.55 * sw;
        l.j1.rotation.x = lift * 0.9 * sw;
        l.j2.rotation.x = -lift * 0.5 * sw;
      } else {
        l.root.rotation.x = -0.5 + s1 * 0.5 * sw;
        l.j1.rotation.x = 1.2 + lift * 0.45 * sw;
        l.j2.rotation.x = -0.7 - lift * 0.4 * sw;
      }
    });
    r.bodyG.position.y = 0.74 + Math.sin(cyc * 2) * 0.025 * sw - (this.state === 'sniff' ? 0.06 : 0);
    r.bodyG.rotation.x = Math.sin(cyc * 2 + 0.5) * 0.03 * sw;
    r.bodyG.scale.y = 1 + Math.sin(t * (this.state === 'hunt' ? 9 : 2.2)) * 0.02; // 荒い呼吸
    r.tail.rotation.z = Math.sin(t * 2.3) * 0.2;
    this.jaw.rotation.x = 0.12 + Math.abs(Math.sin(t * (this.state === 'hunt' ? 11 : 3))) * (this.state === 'hunt' ? 0.4 : 0.12);
    // 頭が不規則にビクッと振れる
    if (Math.random() < dt * (this.state === 'hunt' ? 3 : 1)) this.headJerk = (Math.random() - 0.5) * 1.1;
    this.headJerk = (this.headJerk || 0) * Math.max(0, 1 - dt * 6);
    this.headG.rotation.y = (this.state === 'sniff' ? Math.sin(t * 6) * 0.5 : Math.sin(t * 0.9) * 0.08) + this.headJerk;
    this.rig.headTilt.rotation.z = this.headJerk * 0.6;
    r.neck.rotation.x = -2.0 + (this.state === 'sniff' ? 0.45 : this.state === 'hunt' ? 0.2 : 0);
    this.footsteps(dt, speed, 0.9);
    this.voice?.set(tmp.set(this.pos.x, 0.8, this.pos.z), d < 25 ? (this.state === 'hunt' ? 1 : 0.4) : 0);
  }
}

/* ============ ダラー : 壁をすり抜ける灰色の人影 ============ */
export class Duller extends Wanderer {
  constructor(game, pos) {
    // なめらかで顔のない、半透明の灰色の人影
    const skin = skinMaterial(0xa2a29c, { rim: 0x6a6a66, rimPow: 1.8, bump: 0.004, transparent: true, opacity: 0.5 });
    skin.depthWrite = false;
    super(game, pos, { body: BODY.smooth, mats: { skin } });
    this.type = 'duller';
    this.voice?.stop(); this.voice = game.audio.entityVoice('duller');
    this.walkSpeed = 0.8; this.chaseSpeed = 1.9;
    this.eyes.visible = false;
    this.baseLean = 0.04;
  }
  pose(t) {
    // 輪郭がゆらぐ
    this.mats.skin.opacity = 0.42 + Math.sin(t * 2.1 + this.pos.x) * 0.08;
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


/* ============ ボイラー室の主 : 大きく、ゆっくり歩き、見つけると追ってくる(Level 5) ============ */
export class Beast extends Wanderer {
  constructor(game, pos, { home = null, range = 10 } = {}) {
    // 肩の盛り上がった巨体。猫背で、裂けた口に歯が並ぶ
    const mats = { skin: skinMaterial(0x5a3a30, { rim: 0x1e0c06, emissive: 0x030100, wet: 0.3, bump: 0.05 }) };
    super(game, pos, { body: BODY.bulky, mats });
    this.type = 'beast';
    this.voice?.stop(); this.voice = game.audio.entityVoice('beast');
    this.walkSpeed = 0.95; this.chaseSpeed = 3.5;
    this.home = home ? home.clone() : pos.clone(); this.range = range;
    addMouth(this.rig, BODY.bulky, mats, { teeth: 16, open: 0.35 });
    this.eyes.material.color.set(0xff6a3a);
    this.randomTarget();
  }
  pose(t) {
    this.rig.jaw.rotation.x = 0.3 + Math.abs(Math.sin(t * (this.state === 'chase' ? 7 : 1.2))) * 0.25;
  }
  // 縄張り(ボイラー室の周り)から離れない
  randomTarget() {
    if (!this.home) return super.randomTarget();
    const list = this.world.map.floorList, T = this.world.T;
    for (let i = 0; i < 40; i++) {
      const p = list[Math.floor(Math.random() * list.length)];
      const c = this.world.tileCenter(p.x, p.y);
      if (Math.hypot(c.x - this.home.x, c.z - this.home.z) < this.range * T) { this.setTarget(c.x, c.z); return; }
    }
    this.setTarget(this.home.x, this.home.z);
  }
  footsteps(dt, speed) { super.footsteps(dt, speed, 1.9); }
}

/* ============ 洞窟の蜘蛛 : 巣で待ち、糸の震えに向かって走る(Level 8) ============ */
export class Spider extends Entity {
  constructor(game, pos) {
    super(game, 'spider', pos);
    const skin = skinMaterial(0x17110d, { rim: 0x33271c, kind: 'hair', bump: 0.03, wet: 0.2 });
    const abd = skinMaterial(0x1c140f, { rim: 0x3a2c20, kind: 'hair', bump: 0.035, wet: 0.7 });
    const eye = new THREE.MeshBasicMaterial({ color: 0xff2a1a, fog: false });
    const fang = new THREE.MeshLambertMaterial({ color: 0x0a0806, emissive: 0x050302 });
    const rig = this.rig = buildSpider({ skin, abd, leg: skin, eye, fang });
    this.eyeMat = eye;
    this.legs = rig.legs;
    const g = rig.group;
    this.mesh = g; game.scene.add(g);
    this.home = pos.clone();
    this.state = 'wait';
    this.huntSpeed = 5.6; this.chaseSpeed = 4.3;
  }

  deathPose(T) {
    const r = this.rig, q = Math.min(1, T / 0.22);
    r.bodyG.rotation.x = -0.28 * q;
    r.fangs.forEach((f, i) => { f.rotation.z = (i ? 1 : -1) * (0.6 + Math.random() * 0.2); });
    this.eyeMat.color.setRGB(1, 0.55, 0.4);
    r.eyes.forEach(e => e.scale.setScalar(1.4 + Math.random() * 0.2));
    this.legs.forEach((l, i) => { if (i % 4 < 2) { l.lift.rotation.z = l.side * (2.5 + Math.random() * 0.1); l.knee.rotation.z = l.side * -1.2; } });
  }

  // 糸の震え・大きな物音に反応(歩く足音程度では気づかない)
  hear(pos, radius) {
    if (radius < 12 || this.state === 'chase') return;
    const d = Math.hypot(pos.x - this.pos.x, pos.z - this.pos.z);
    if (d < radius * 1.5) { if (this.state !== 'hunt') this.game.onChaseStart(this); this.setState('hunt'); this.setTarget(pos.x, pos.z); }
  }

  update(dt, t) {
    this.stateTime += dt;
    const g = this.game, p = g.player, w = this.world;
    const d = this.distToPlayer();
    let speed = 0;
    // 至近距離なら気づく
    if (this.state !== 'chase' && d < (p.crouching ? 2.2 : 3.6) && w.los(this.pos.x, this.pos.z, p.pos.x, p.pos.z)) {
      if (this.state !== 'hunt') g.onChaseStart(this);
      this.setState('chase');
    }
    switch (this.state) {
      case 'wait':
        this.heading += Math.sin(t * 0.7 + this.home.x) * dt * 0.4;
        break;
      case 'hunt':
        speed = this.huntSpeed;
        if (this.followField(this.field, this.target, speed, dt) || this.stateTime > 10) { this.setState('return'); this.setTarget(this.home.x, this.home.z); g.onChaseEnd(this); }
        break;
      case 'chase':
        speed = this.chaseSpeed;
        this.followField(g.playerField, p.pos, speed, dt);
        if (this.stateTime > 7 || d > 16) { this.setState('return'); this.setTarget(this.home.x, this.home.z); g.onChaseEnd(this); }
        break;
      case 'return':
        speed = 1.6;
        if (this.followField(this.field, this.target, speed, dt)) this.setState('wait');
        break;
    }
    if (d < 0.95) g.kill('spider');
    const m = this.mesh; m.position.set(this.pos.x, 0, this.pos.z); m.rotation.y = this.heading;
    const cyc = t * (speed > 3 ? 20 : 8);
    const amt = speed ? 0.32 : 0.03;
    this.legs.forEach((l, i) => {
      // 対角の脚が交互に動く
      const ph = cyc + ((i % 4) % 2 ? Math.PI : 0) + (i >= 4 ? Math.PI : 0);
      l.root.rotation.y = l.base + Math.sin(ph) * amt;
      l.lift.rotation.z = l.side * (2.15 + Math.max(0, Math.sin(ph + 1.3)) * amt * 0.8);
      l.knee.rotation.z = l.side * (-1.7 - Math.max(0, Math.sin(ph + 1.3)) * amt * 0.5);
    });
    const r = this.rig;
    r.bodyG.position.y = 0.6 + Math.sin(cyc * 2) * 0.02 * (speed ? 1 : 0.3);
    r.abd.rotation.x = 0.18 + Math.sin(t * 1.4) * 0.04;
    r.abd.scale.setScalar(1 + Math.sin(t * 1.4) * 0.015);
    r.fangs.forEach((f, i) => { f.rotation.z = (i ? 1 : -1) * (this.state === 'wait' ? 0.05 : 0.25 + Math.sin(t * 14) * 0.15); });
    this.eyeMat.color.setRGB(1, this.state === 'wait' ? 0.25 : 0.1, 0.08);
    this.footsteps(dt, speed, 0.5);
    this.voice?.set(tmp.set(this.pos.x, 0.6, this.pos.z), d < 20 ? (this.state === 'wait' ? 0.25 : 1) : 0);
  }
}

/* ============ 潰れたもの : 霧の中から現れる、人の形を失った何か(Level 9) ============ */
export class Mangled extends Wanderer {
  constructor(game, pos) {
    const mats = { skin: skinMaterial(0x2c1d1a, { rim: 0x4a3530, transparent: true, opacity: 0, wet: 0.9 }) };
    mats.bone = new THREE.MeshLambertMaterial({ color: 0xcfc2a4, emissive: 0x1a160e, transparent: true, opacity: 0 });
    mats.hair = hairMaterial({ transparent: true, opacity: 0 });
    mats.mouth = new THREE.MeshBasicMaterial({ color: 0x030101, transparent: true, opacity: 0 });
    super(game, pos, { body: BODY.tall, mats });
    this.type = 'mangled';
    this.voice?.stop(); this.voice = game.audio.entityVoice('mangled');
    this.walkSpeed = 1.1; this.chaseSpeed = game.cfg.chaseSpeed || 3.7;
    this.rig.jaw.rotation.x = 0.7;
    this.eyes.material.color.set(0xd8e0ff);
    this.baseLean = 0.55;
    this.alpha = 0; this.fading = false;
  }
  // ねじれて潰れた体：首は横に折れ、片腕は逆に曲がっている
  pose(t) {
    const r = this.rig;
    r.spine.rotation.z = 0.35; r.spine.rotation.y = 0.4;
    r.neck.rotation.z = 1.15 + Math.sin(t * 7 + this.pos.x) * 0.12;
    r.neck.rotation.x = -0.3;
    r.armR.elbow.rotation.x = 1.4; r.armR.shoulder.rotation.z = 0.5;
    r.armL.shoulder.rotation.z = -0.8;
    r.jaw.rotation.x = 0.6 + Math.abs(Math.sin(t * 5)) * 0.3;
    r.legL.knee.rotation.x += 0.35;
  }
  deathPose(T) {
    super.deathPose(T);
    this.alpha = 1;
    for (const k of ['skin', 'bone', 'hair', 'mouth']) this.mats[k].opacity = 1;
    this.mats.skin.depthWrite = true;
  }
  // 霧の中にしか姿を保てない
  update(dt, t) {
    super.update(dt, t);
    const want = this.fading ? 0 : 1;
    this.alpha += (want - this.alpha) * Math.min(1, dt * 1.5);
    this.mats.skin.opacity = this.alpha; this.mats.bone.opacity = this.alpha; this.mats.hair.opacity = this.alpha; this.mats.mouth.opacity = this.alpha;
    this.mats.skin.depthWrite = this.alpha > 0.95;
    this.eyes.material.opacity *= this.alpha;
    if (this.fading && this.alpha < 0.03) this.gone = true;
  }
}

/* ============ 顔のない住人 : 都市を歩いているだけ。目が合うと、顔のない顔でこちらを見る(Level 11) ============ */
export class Faceling extends Wanderer {
  constructor(game, pos) {
    // ふつうの人の体つき。灰色の服を着ていて、顔のあるべき所には何もない
    const mats = { skin: skinMaterial(0x8e8276, { rim: 0x2a2622, bump: 0.008 }), cloth: skinMaterial(0x3b3e44, { rim: 0x22252a, kind: 'cloth', bump: 0.01 }) };
    super(game, pos, { body: BODY.human, mats });
    // 手足も服の色に(手と頭だけ肌)
    this.rig.group.traverse(o => { if (o.isMesh && o.geometry !== this.rig.geos.head && o.geometry !== this.rig.geos.hand && o.geometry !== this.rig.geos.fing1 && o.geometry !== this.rig.geos.fing2 && o.geometry !== this.rig.geos.neck) o.material = mats.cloth; });
    this.type = 'faceling';
    this.harmless = true;
    this.voice?.stop(); this.voice = game.audio.entityVoice('faceling');
    this.walkSpeed = 1.05;
    this.eyes.visible = false;
    this.mesh.scale.setScalar(0.66);
    this.baseLean = 0.02;
  }
  canSee() { return false; }
  hear() {}
  update(dt, t) {
    this.stateTime += dt;
    const g = this.game, p = g.player;
    const d = this.distToPlayer();
    let speed = 0;
    // 近くで物音を立てると、立ち止まってこちらを向く
    if (this.state !== 'stare' && d < (p.running ? 7 : 2.6) && g.world.los(this.pos.x, this.pos.z, p.pos.x, p.pos.z)) this.setState('stare');
    switch (this.state) {
      case 'stare': {
        const want = Math.atan2(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
        let diff = want - this.heading; while (diff > Math.PI) diff -= Math.PI * 2; while (diff < -Math.PI) diff += Math.PI * 2;
        this.heading += diff * Math.min(1, dt * 3);
        if (this.stateTime > 3 && d > 3.5) { this.setState('wander'); this.randomTarget(); }
        break;
      }
      case 'pause':
        if (this.stateTime > 2 + Math.random() * 2) { this.setState('wander'); this.randomTarget(); }
        break;
      default:
        speed = this.walkSpeed;
        if (!this.field || this.followField(this.field, this.target, speed, dt) || this.stateTime > 30) this.setState('pause');
    }
    this.staring = this.state === 'stare';
    const m = this.mesh; m.position.set(this.pos.x, 0, this.pos.z); m.rotation.y = this.heading;
    animateHumanoid(this, dt, t, speed, false);
    this.headTwitch = 0;
    this.rig.head.rotation.z = this.staring ? Math.sin(t * 1.3) * 0.15 : 0;
    this.rig.neck.rotation.x = this.staring ? -0.1 : 0.05;
    this.rig.armL.fingers.concat(this.rig.armR.fingers).forEach(f => { f.k.rotation.x = -0.35; f.k2.rotation.x = -0.4; });
    this.footsteps(dt, speed, 1.2);
    this.voice?.set(tmp.set(this.pos.x, 1.6, this.pos.z), d < 12 ? (this.staring ? 0.5 : 0.15) : 0);
  }
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
  if (type === 'beast') return new Beast(game, pos);
  if (type === 'spider') return new Spider(game, pos);
  if (type === 'mangled') return new Mangled(game, pos);
  if (type === 'faceling') return new Faceling(game, pos);
  return new Hound(game, pos);
}

export { FLOOR };
