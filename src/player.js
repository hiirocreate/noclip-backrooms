// プレイヤー(一人称カメラ・移動・懐中電灯・ステータス)
import * as THREE from 'three';

export class Player {
  constructor(game, camera) {
    this.game = game;
    this.cam = camera;
    this.pos = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;
    this.radius = 0.3;
    this.eye = 1.62; this.eyeCur = 1.62;
    this.stamina = 100; this.sanity = 100; this.battery = 100;
    this.flashlight = false; this.waters = 0;
    this.bob = 0; this.stepDist = 0; this.moving = false; this.crouching = false;
    this.exhausted = false;
    this.vel = new THREE.Vector3();

    // 懐中電灯
    this.light = new THREE.SpotLight(0xfff2d8, 0, 26, 0.5, 0.6, 1.2);
    this.light.position.set(0.18, -0.15, 0.05);
    this.lightTarget = new THREE.Object3D();
    this.lightTarget.position.set(0, 0, -5);
    camera.add(this.light); camera.add(this.lightTarget);
    this.light.target = this.lightTarget;
    // 手元のほのかな光(真っ暗で何も見えないのを防ぐ)
    this.glow = new THREE.PointLight(0xfff2d8, 0, 4, 2);
    camera.add(this.glow);
  }

  spawn(x, z, yaw) {
    this.pos.set(x, 0, z); this.yaw = yaw; this.pitch = 0;
    this.stamina = 100; this.sanity = 100; this.battery = Math.max(this.battery, 60);
    this.vel.set(0, 0, 0);
  }

  toggleLight() {
    if (!this.flashlight && this.battery <= 0) { this.game.say('電池が切れている'); return; }
    this.flashlight = !this.flashlight;
    this.game.audio.click();
    document.getElementById('btn-light')?.classList.toggle('on', this.flashlight);
  }

  update(dt, input) {
    const g = this.game;
    const look = input.takeLook();
    this.yaw -= look.x; this.pitch -= look.y;
    this.pitch = Math.max(-1.35, Math.min(1.35, this.pitch));

    this.crouching = input.crouch;
    const wantRun = input.run && !this.crouching && input.move.y > 0.1 && !this.exhausted;
    const base = (this.crouching ? 1.3 : wantRun ? 5.0 : 2.6) * (this.speedMul ?? 1);
    const mx = input.move.x, my = input.move.y;
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    // 前方 = (-sin, -cos)
    const tx = (-sin * my + cos * mx) * base, tz = (-cos * my - sin * mx) * base;
    const acc = Math.min(1, dt * 10);
    this.vel.x += (tx - this.vel.x) * acc; this.vel.z += (tz - this.vel.z) * acc;
    const prev = this.pos.clone();
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    g.world.collide(this.pos, this.radius);
    g.world.collide(this.pos, this.radius);
    const moved = Math.hypot(this.pos.x - prev.x, this.pos.z - prev.z);
    const speed = moved / Math.max(dt, 1e-4);
    this.moving = speed > 0.3;
    this.running = wantRun && this.moving;

    // スタミナ
    if (this.running) { this.stamina -= dt * 13; if (this.stamina <= 0) { this.stamina = 0; this.exhausted = true; g.say('息が切れた…'); } }
    else this.stamina = Math.min(100, this.stamina + dt * (this.moving ? 9 : 15));
    if (this.exhausted && this.stamina > 35) this.exhausted = false;

    // 足音 & 物音
    this.stepDist += moved;
    const stride = this.running ? 1.7 : this.crouching ? 0.9 : 1.25;
    if (this.stepDist > stride) {
      this.stepDist = 0;
      const loud = this.running ? 1 : this.crouching ? 0.25 : 0.55;
      g.audio.footstep(g.cfg.theme, loud);
      g.makeNoise(this.pos, this.running ? 15 : this.crouching ? 1.2 : 5);
    }

    // 懐中電灯
    if (this.flashlight) {
      this.battery -= dt * 0.55;
      if (this.battery <= 0) { this.battery = 0; this.flashlight = false; g.say('ライトが消えた'); document.getElementById('btn-light')?.classList.remove('on'); }
    }
    let li = 0;
    if (this.flashlight) {
      li = 24;
      if (this.battery < 15) li *= 0.4 + 0.6 * (Math.random() > 0.08 ? 1 : 0.1); // 電池切れ間際はチラつく
      if (g.fear > 0.6 && Math.random() < 0.08) li *= 0.2;
    }
    this.light.intensity = li;
    this.glow.intensity = this.flashlight ? 0.8 : 0.25;

    // 正気度
    const lightHere = g.world.lightAt(this.pos.x, this.pos.z);
    let dS = 0;
    if (lightHere < 0.18) dS -= this.flashlight ? 0.35 : 1.1;
    else if (lightHere > 0.45) dS += 0.25;
    dS -= g.fear * 3.2;
    dS += g.logic?.sanityRate(this) || 0;
    this.sanity = Math.max(0, Math.min(100, this.sanity + dS * dt));
    if (this.sanity <= 0) g.kill('sanity');

    // カメラ
    const targetEye = this.crouching ? 0.95 : 1.62;
    this.eyeCur += (targetEye - this.eyeCur) * Math.min(1, dt * 8);
    if (this.moving) this.bob += dt * (this.running ? 13 : this.crouching ? 6 : 8.5);
    const bobAmp = this.moving ? (this.running ? 0.06 : 0.03) : 0;
    const shake = g.settings.shake ? g.fear * 0.012 : 0;
    this.cam.position.set(
      this.pos.x + (Math.random() - 0.5) * shake,
      this.eyeCur + Math.sin(this.bob) * bobAmp + (Math.random() - 0.5) * shake,
      this.pos.z,
    );
    this.cam.rotation.set(this.pitch, this.yaw, Math.sin(this.bob * 0.5) * bobAmp * 0.25, 'YXZ');
  }
}
