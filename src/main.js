// NOCLIP ― 裏側の階層 ― メイン
import * as THREE from 'three';
import { LEVELS, ENDING_TEXT } from './levels.js';
import { generateMap } from './mapgen.js';
import { World } from './world.js';
import { Player } from './player.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { PostFX } from './postfx.js';
import { Items } from './items.js';
import { spawnEntity, Wanderer } from './entities.js';
import { App } from '@capacitor/app';

const $ = (id) => document.getElementById(id);
const SAVE_KEY = 'noclip_save_v1';
const SET_KEY = 'noclip_settings_v1';

function load(key, def) {
  try { const v = JSON.parse(localStorage.getItem(key)); return v ? { ...def, ...v } : { ...def }; } catch (e) { return { ...def }; }
}
function store(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* noop */ } }

const DEATH = {
  wanderer: ['見つかった', '振り返ると、あの長い腕がすぐそこにあった。'],
  smiler: ['見つかった', '笑顔は、ずっとあなたを見ていた。'],
  hound: ['見つかった', '音を立てすぎた。'],
  sanity: ['正気を失った', '蛍光灯の音が、頭の中を埋め尽くした。'],
};

class Game {
  constructor() {
    const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    this.settings = load(SET_KEY, { sens: 1, quality: isTouch ? 0.75 : 1, volume: 0.8, invert: false, shake: true });
    this.save = load(SAVE_KEY, { level: 0, seeds: {} });

    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    $('game').appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 80);
    this.scene.add(this.camera);
    this.fx = new PostFX(this.renderer, this.scene, this.camera);
    this.audio = new Audio();
    this.audio.setVolume(this.settings.volume);
    this.input = new Input(this.renderer.domElement, this.settings);
    this.player = new Player(this, this.camera);
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.12);
    this.scene.add(this.ambientLight);

    this.state = 'menu';
    this.entities = []; this.fakes = [];
    this.clock = new THREE.Clock();
    this.time = 0;
    this.fear = 0; this.chasers = new Set();

    this.resize();
    addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.state === 'play') this.pause(); });
    this.bindUI();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  /* ================= UI ================= */
  show(id) {
    for (const s of document.querySelectorAll('.screen')) s.classList.add('hidden');
    if (id) $(id).classList.remove('hidden');
  }

  bindUI() {
    const click = (id, fn) => $(id).addEventListener('click', (e) => { e.stopPropagation(); this.audio.init(); fn(); });
    $('btn-continue').disabled = !(this.save.level > 0);
    $('btn-continue').textContent = this.save.level > 0 ? `つづきから (${LEVELS[this.save.level].code})` : 'つづきから';
    click('btn-new', () => { this.save = { level: 0, seeds: {} }; store(SAVE_KEY, this.save); this.startLevel(0); });
    click('btn-continue', () => this.startLevel(this.save.level));
    click('btn-settings', () => { this.settingsBack = 'screen-title'; this.openSettings(); });
    click('btn-howto', () => this.show('screen-howto'));
    for (const b of document.querySelectorAll('.back')) b.addEventListener('click', () => this.show(this.settingsBack && b.closest('#screen-settings') ? this.settingsBack : 'screen-title'));
    click('btn-resume', () => this.resume());
    click('btn-pause-settings', () => { this.settingsBack = 'screen-pause'; this.openSettings(); });
    click('btn-quit', () => this.toTitle());
    click('btn-pause', () => this.pause());
    click('btn-retry', () => this.startLevel(this.levelIndex, true));
    click('btn-dead-quit', () => this.toTitle());
    click('btn-ending-quit', () => this.toTitle());
    click('btn-note-close', () => {
      this.show(null);
      this.state = 'play';
      this.input.reset();
      // メモを開く間だけ入力を止める。ここで戻し忘れると F/Q/C/Esc/P が
      // 以後無効になる（WASD とマウスは別の経路のため症状が分かりにくい）。
      this.input.enabled = true;
      this.clock.getDelta();
      this.lockPointer();
    });

    const s = this.settings;
    const sens = $('set-sens'), q = $('set-quality'), vol = $('set-volume'), inv = $('set-invert'), sh = $('set-shake');
    sens.value = s.sens; q.value = String(s.quality); vol.value = s.volume; inv.checked = s.invert; sh.checked = s.shake;
    const apply = () => {
      s.sens = +sens.value; s.quality = +q.value; s.volume = +vol.value; s.invert = inv.checked; s.shake = sh.checked;
      this.audio.setVolume(s.volume); this.resize(); store(SET_KEY, s);
      this.fx.u.grain.value = s.shake ? 1 : 0.3;
    };
    [sens, q, vol, inv, sh].forEach(el => el.addEventListener('input', apply));
    [q, inv, sh].forEach(el => el.addEventListener('change', apply));
    this.fx.u.grain.value = s.shake ? 1 : 0.3;
  }

  openSettings() { this.show('screen-settings'); }

  resize() {
    const r = Math.min(devicePixelRatio || 1, 2) * this.settings.quality;
    this.renderer.setPixelRatio(r);
    this.renderer.setSize(innerWidth, innerHeight);
    this.fx.setPixelRatio(r);
    this.fx.setSize(innerWidth, innerHeight);
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
  }

  lockPointer() {
    if (!this.input.isTouch) this.renderer.domElement.requestPointerLock?.();
  }

  say(text, dur = 3) {
    const m = $('message');
    m.textContent = text; m.classList.add('show');
    clearTimeout(this._sayT);
    this._sayT = setTimeout(() => m.classList.remove('show'), dur * 1000);
  }

  /* ================= 進行 ================= */
  async startLevel(i, retry = false) {
    this.audio.init();
    const token = this._loadToken = (this._loadToken || 0) + 1;
    this.cleanupLevel();
    this.levelIndex = i;
    const cfg = this.cfg = LEVELS[i];
    this.state = 'loading';
    this.input.enabled = false;
    // 画面を全画面に(対応環境のみ)
    if (this.input.isTouch && document.documentElement.requestFullscreen && !document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      screen.orientation?.lock?.('landscape').catch(() => {});
    }
    $('intro-level').textContent = cfg.code;
    $('intro-name').textContent = cfg.name;
    $('intro-desc').innerHTML = cfg.desc.replace(/\n/g, '<br>');
    this.show('screen-intro');
    $('hud').classList.add('hidden'); $('touch').classList.add('hidden');
    await new Promise(r => setTimeout(r, 60));
    if (token !== this._loadToken) return;

    if (!this.save.seeds[i] || !retry) this.save.seeds[i] = (Math.random() * 1e9) | 0;
    this.save.level = i; store(SAVE_KEY, this.save);
    const t0 = performance.now();
    const map = generateMap(cfg, this.save.seeds[i]);
    this.world = new World(this.scene, cfg, map);
    this.scene.fog = new THREE.FogExp2(cfg.fog.color, cfg.fog.density);
    this.scene.background = new THREE.Color(cfg.fog.color);
    this.ambientLight.color.set(cfg.fog.color).lerp(new THREE.Color(0xffffff), 0.5);
    this.ambientLight.intensity = cfg.theme === 'lobby' ? 0.25 : 0.15;

    const st = this.world.tileCenter(map.start.x, map.start.y);
    let yaw = 0;
    for (const [dx, dy, a] of [[1, 0, -Math.PI / 2], [0, 1, Math.PI], [-1, 0, Math.PI / 2], [0, -1, 0]]) {
      if (!this.world.solid(map.start.x + dx, map.start.y + dy)) { yaw = a; break; }
    }
    this.player.spawn(st.x, st.z, yaw);
    this.camera.fov = 72;
    this.camera.rotation.z = 0;
    this.camera.updateProjectionMatrix();
    $('scare').classList.remove('sanity');
    if (i === 0 && !retry) { this.player.battery = 100; this.player.waters = 1; }
    this.player.flashlight = false; $('btn-light').classList.remove('on');
    this.keysGot = 0;
    this.items = new Items(this);
    this.updatePlayerField(true);
    for (const e of cfg.entities) for (let k = 0; k < e.count; k++) this.entities.push(spawnEntity(this, e.type, 16));
    this.escalated = new Set();
    this.nextEvent = 10 + Math.random() * 10;
    this.nextBlackout = 50 + Math.random() * 50;
    this.nextHalluc = 15;
    this.hbTimer = 0;
    this.audio.startAmbient(cfg.theme);
    // シェーダを事前コンパイル
    this.player.update(0.016, this.input);
    this.renderer.compile(this.scene, this.camera);
    const wait = Math.max(0, 2800 - (performance.now() - t0));
    await new Promise(r => setTimeout(r, wait));
    if (token !== this._loadToken) return;

    this.show(null);
    $('hud').classList.remove('hidden');
    if (this.input.isTouch) $('touch').classList.remove('hidden');
    $('level-name').textContent = `${cfg.code} — ${cfg.name}`;
    this.updateObjective();
    this.input.reset();
    this.input.enabled = true;
    this.state = 'play';
    this.clock.getDelta();
    this.lockPointer();
    if (i === 0) setTimeout(() => this.say(this.input.isTouch ? '足元のメモを拾ってみよう' : 'クリックで視点操作 / 足元のメモを拾ってみよう', 5), 800);
  }

  cleanupLevel() {
    for (const e of this.entities) e.dispose();
    for (const f of this.fakes) f.ent.dispose();
    this.entities = []; this.fakes = []; this.chasers.clear(); this.fear = 0;
    this.items?.dispose(); this.items = null;
    this.world?.dispose(); this.world = null;
    this.audio.stopAmbient?.();
  }

  toTitle() {
    this.cleanupLevel();
    this.state = 'menu';
    this.input.enabled = false;
    if (document.pointerLockElement) document.exitPointerLock();
    $('hud').classList.add('hidden'); $('touch').classList.add('hidden');
    $('btn-continue').disabled = !(this.save.level > 0);
    $('btn-continue').textContent = this.save.level > 0 ? `つづきから (${LEVELS[this.save.level].code})` : 'つづきから';
    this.show('screen-title');
  }

  pause() {
    if (this.state !== 'play') return;
    this.state = 'paused'; this.input.enabled = false;
    this.audio.suspend();
    this.show('screen-pause');
  }
  resume() {
    this.show(null); this.state = 'play'; this.input.enabled = true; this.input.reset();
    this.audio.resume(); this.clock.getDelta(); this.lockPointer();
  }

  updateObjective() { $('objective').textContent = this.cfg.objective(this.keysGot, this.cfg.key.count); }

  onPickup(it) {
    const p = this.player;
    if (it.type === 'key') {
      this.keysGot++;
      this.audio.keyPickup();
      this.updateObjective();
      const m = this.cfg.key.count;
      if (this.keysGot >= m) {
        this.world.unlockDoor(); this.audio.unlock();
        this.say(`${this.cfg.exitName}が開いた音がした`, 4);
      } else this.say(`${this.cfg.key.name}を手に入れた (${this.keysGot}/${m})`);
      for (const e of this.cfg.escalate || []) {
        if (this.keysGot >= e.at && !this.escalated.has(e.at)) {
          this.escalated.add(e.at);
          this.entities.push(spawnEntity(this, e.type, 18));
          setTimeout(() => this.state === 'play' && this.say('……何かが増えた気がする', 3), 2500);
        }
      }
    } else if (it.type === 'battery') {
      p.battery = Math.min(100, p.battery + 50); this.audio.pickup(); this.say('電池を拾った');
    } else if (it.type === 'water') {
      p.waters++; this.audio.pickup(); this.say('アーモンド水を拾った');
    } else if (it.type === 'note') {
      this.audio.paper();
      $('note-text').innerHTML = this.cfg.notes[it.note].replace(/\n/g, '<br>');
      this.state = 'note'; this.input.enabled = false;
      if (document.pointerLockElement) document.exitPointerLock();
      this.show('screen-note');
    }
  }

  drink() {
    const p = this.player;
    if (p.waters <= 0) { this.say('アーモンド水を持っていない'); return; }
    if (p.sanity > 95) { this.say('今は必要ない'); return; }
    p.waters--; p.sanity = Math.min(100, p.sanity + 45); this.audio.drink(); this.say('アーモンド水を飲んだ。少し落ち着いた');
  }

  makeNoise(pos, radius) { for (const e of this.entities) e.hear?.(pos, radius); }

  onChaseStart(e) {
    if (!this.chasers.size && (!this._lastStinger || this.time - this._lastStinger > 8)) { this.audio.stinger(); this._lastStinger = this.time; }
    this.chasers.add(e);
  }
  onChaseEnd(e) { this.chasers.delete(e); }

  kill(cause) {
    if (this.state !== 'play') return;
    this.state = 'dying'; this.input.enabled = false;
    this.audio.scare();
    const killer = this.entities.find(e => e.type === cause);
    this.dyingT = 0; this.killer = cause === 'sanity' ? null : killer;
    this.deathStart = this.camera.position.clone();
    this.deathFov = this.camera.fov;
    if (cause === 'sanity') {
      this.audio.sanityCollapse();
      $('scare').classList.remove('sanity');
      // アニメーションを毎回最初から再生する。
      void $('scare').offsetWidth;
      $('scare').classList.add('sanity');
    }
    if (document.pointerLockElement) document.exitPointerLock();
    const [t, d] = DEATH[cause];
    $('dead-title').textContent = t; $('dead-desc').textContent = d;
  }

  nextLevel() {
    this.state = 'transition'; this.input.enabled = false;
    $('fade').classList.add('on');
    this.audio.unlock();
    setTimeout(() => {
      $('fade').classList.remove('on');
      if (this.levelIndex + 1 >= LEVELS.length) {
        this.cleanupLevel();
        this.save = { level: 0, seeds: {}, cleared: true }; store(SAVE_KEY, this.save);
        $('hud').classList.add('hidden'); $('touch').classList.add('hidden');
        if (document.pointerLockElement) document.exitPointerLock();
        $('ending-text').innerHTML = ENDING_TEXT.replace(/\n/g, '<br>');
        this.state = 'menu';
        this.show('screen-ending');
      } else {
        this.startLevel(this.levelIndex + 1);
      }
    }, 1200);
  }

  updatePlayerField(force = false) {
    const [tx, ty] = this.world.toTile(this.player.pos.x, this.player.pos.z);
    if (force || tx !== this._pft?.[0] || ty !== this._pft?.[1]) {
      this.playerField = this.world.distanceField(tx, ty);
      this._pft = [tx, ty];
    }
  }

  /* ================= イベント ================= */
  randomEvents(dt) {
    const p = this.player, w = this.world, cfg = this.cfg;
    // 遠くの物音
    this.nextEvent -= dt * (p.sanity < 40 ? 2 : 1);
    if (this.nextEvent <= 0) {
      this.nextEvent = 8 + Math.random() * 14;
      const a = Math.random() * Math.PI * 2, r = 8 + Math.random() * 12;
      const pos = { x: p.pos.x + Math.cos(a) * r, y: 1.5, z: p.pos.z + Math.sin(a) * r };
      const kinds = cfg.theme === 'lobby' ? ['knock', 'steps', 'whisper'] : cfg.theme === 'parking' ? ['drip', 'drip', 'steps', 'knock', 'whisper'] : ['steam', 'clank', 'clank', 'whisper'];
      this.audio.distantEvent(pos, kinds[Math.floor(Math.random() * kinds.length)]);
    }
    // 停電
    if (cfg.theme !== 'pipes') {
      this.nextBlackout -= dt;
      if (this.nextBlackout <= 0 && !this.blackoutT) {
        this.blackoutT = 5 + Math.random() * 5; this.audio.powerDown();
        this.say('……停電？', 2.5);
      }
      if (this.blackoutT) {
        this.blackoutT -= dt;
        w.blackout = Math.min(1, w.blackout + dt * 4);
        if (this.blackoutT <= 0) { this.blackoutT = 0; this.nextBlackout = 70 + Math.random() * 70; }
      } else if (w.blackout > 0) {
        w.blackout = Math.min(1, Math.max(0, w.blackout - dt * (Math.random() < 0.6 ? 3 : -2)));
      }
    }
    // 幻覚(正気度が低い時)
    this.nextHalluc -= dt;
    if (p.sanity < 35 && this.nextHalluc <= 0) {
      this.nextHalluc = 10 + Math.random() * 12;
      const dir = new THREE.Vector3(); this.camera.getWorldDirection(dir);
      for (let tries = 0; tries < 10; tries++) {
        const ang = Math.atan2(dir.x, dir.z) + (Math.random() - 0.5) * 1.2;
        const r = 7 + Math.random() * 6;
        const x = p.pos.x + Math.sin(ang) * r, z = p.pos.z + Math.cos(ang) * r;
        const [tx, ty] = w.toTile(x, z);
        if (w.solid(tx, ty) || !w.los(p.pos.x, p.pos.z, x, z)) continue;
        const ent = new Wanderer(this, new THREE.Vector3(x, 0, z));
        ent.voice?.stop(); ent.voice = null;
        ent.heading = Math.atan2(p.pos.x - x, p.pos.z - z);
        ent.mesh.position.set(x, 0, z); ent.mesh.rotation.y = ent.heading;
        this.fakes.push({ ent, life: 1.2 + Math.random() });
        this.audio.distantEvent({ x, y: 1.5, z }, 'whisper');
        break;
      }
    }
    for (const f of this.fakes) {
      f.life -= dt;
      f.ent.eyes.material.opacity = Math.random() < 0.3 ? 0 : 0.8;
      if (f.life <= 0) f.ent.dispose();
    }
    this.fakes = this.fakes.filter(f => f.life > 0);
  }

  /* ================= ループ ================= */
  frame() {
    const dt = Math.min(0.05, this.clock.getDelta());
    this.time += dt;
    const u = this.fx.u;
    u.time.value = this.time;

    if (this.state === 'play') this.update(dt);
    else if (this.state === 'dying') this.updateDying(dt);

    if (this.world) {
      this.fx.render(dt);
    } else {
      this.renderer.setClearColor(0x000000); this.renderer.clear();
    }
  }

  update(dt) {
    const inp = this.input, p = this.player, w = this.world;
    inp.update();
    if (inp.consume('pause')) { this.pause(); return; }
    if (inp.consume('light')) p.toggleLight();
    if (inp.consume('drink')) this.drink();

    p.update(dt, inp);
    if (this.state !== 'play') return;
    this.updatePlayerField();
    for (const e of this.entities) e.update(dt, this.time);
    if (this.state !== 'play') return;
    this.items.update(dt, this.time);
    w.update(dt, p.pos, this.time);
    this.randomEvents(dt);

    // 恐怖度
    let fear = 0;
    for (const e of this.entities) {
      const d = e.distToPlayer();
      if (d > 16) continue;
      const active = this.chasers.has(e);
      const vis = w.los(p.pos.x, p.pos.z, e.pos.x, e.pos.z);
      if (e.type === 'smiler' && !active && e.alpha < 0.3) continue;
      let f = (1 - d / 16) * (active ? 1 : vis ? 0.55 : 0.2);
      fear = Math.max(fear, f);
    }
    this.fear += (fear - this.fear) * Math.min(1, dt * 3);

    // 出口
    const door = w.door;
    const dd = Math.hypot(p.pos.x - door.pos.x, p.pos.z - door.pos.z);
    if (dd < 1.3) {
      if (this.keysGot >= this.cfg.key.count) { this.nextLevel(); return; }
      if (!this._doorMsg) { this.say(`${this.cfg.exitName}は閉ざされている。${this.cfg.key.name}が足りない`); this._doorMsg = true; }
    } else this._doorMsg = false;

    // 音
    this.audio.updateListener(this.camera);
    this.audio.setHum(w.lightAt(p.pos.x, p.pos.z) * 0.8 * (1 - w.blackout));
    this.hbTimer -= dt;
    const hb = Math.max(this.fear, (40 - p.sanity) / 40);
    if (hb > 0.15 && this.hbTimer <= 0) { this.audio.heartbeat(hb); this.hbTimer = 1.1 - hb * 0.6; }

    // 画面効果
    const u = this.fx.u;
    u.fear.value = this.fear;
    u.insanity.value = Math.max(0, 1 - p.sanity / 60);
    u.flash.value = Math.max(0, u.flash.value - dt * 2);

    this.updateHUD();
  }

  updateDying(dt) {
    this.dyingT += dt;
    const u = this.fx.u;
    const k = this.killer;
    if (k && k.mesh) {
      // 目の前に迫る
      const dir = new THREE.Vector3(); this.camera.getWorldDirection(dir); dir.y = 0; dir.normalize();
      const dist = k.type === 'smiler' ? 0.7 : k.type === 'hound' ? 1.75 : 0.75;
      const x = this.camera.position.x + dir.x * dist, z = this.camera.position.z + dir.z * dist;
      if (k.type === 'smiler') { k.mesh.position.set(x, this.camera.position.y, z); k.mesh.material.opacity = 1; k.mesh.scale.set(1.6, 1.6, 1); }
      else {
        k.mesh.position.set(x, k.type === 'hound' ? this.camera.position.y - 0.8 : this.camera.position.y - 2.35 * k.mesh.scale.y, z);
        k.mesh.rotation.y = Math.atan2(-dir.x, -dir.z);
      }
    }
    if (this.killer === null) {
      // 正気喪失は敵に襲われるのとは異なり、視界が潰れながら倒れ込む。
      const t = Math.min(1, this.dyingT / 1.3);
      const fall = t * t * (3 - 2 * t);
      this.camera.position.copy(this.deathStart);
      this.camera.position.y -= 1.05 * fall;
      this.camera.position.x += Math.sin(this.dyingT * 38) * 0.025 * (1 - t);
      this.camera.position.z += Math.cos(this.dyingT * 29) * 0.025 * (1 - t);
      this.camera.rotation.z = -1.15 * fall + Math.sin(this.dyingT * 25) * 0.08 * (1 - t);
      this.camera.fov = this.deathFov + (42 - this.deathFov) * fall;
      this.camera.updateProjectionMatrix();
      u.insanity.value = 1;
      u.flash.value = this.dyingT < 0.12 || (this.dyingT > 0.42 && this.dyingT < 0.5) ? 0.9 : Math.max(0, 0.2 - this.dyingT * 0.1);
    } else {
      this.camera.position.x += (Math.random() - 0.5) * 0.04;
      this.camera.position.y += (Math.random() - 0.5) * 0.04;
      u.flash.value = this.dyingT < 0.06 ? 0.7 : Math.max(0, 0.25 - this.dyingT * 1.2);
    }
    u.fear.value = 1;
    this.player.light.intensity = 30;
    if (this.dyingT > 1.3 && this.state === 'dying') {
      this.state = 'dead';
      $('hud').classList.add('hidden'); $('touch').classList.add('hidden');
      this.show('screen-dead');
      this.audio.stopAmbient();
    }
  }

  updateHUD() {
    this._hudT = (this._hudT || 0) + 1;
    if (this._hudT % 6) return;
    const p = this.player;
    const set = (id, v) => { const el = $(id); el.style.width = Math.max(0, v) + '%'; el.classList.toggle('low', v < 20); };
    set('bar-sanity', p.sanity); set('bar-stamina', p.stamina); set('bar-battery', p.battery);
    $('water-count').textContent = p.waters;
  }
}

window.game = new Game();

// Android の戻るボタン：プレイ中は一時停止、タイトルではアプリ終了
try {
  App.addListener('backButton', () => {
    const g = window.game;
    if (g.state === 'play') g.pause();
    else if (g.state === 'paused') g.resume();
    else if (g.state === 'note') document.getElementById('btn-note-close').click();
    else if (g.state === 'menu' && !document.getElementById('screen-title').classList.contains('hidden')) App.exitApp();
    else if (g.state === 'menu') g.show('screen-title');
  });
  App.addListener('pause', () => { const g = window.game; if (g.state === 'play') g.pause(); });
} catch (e) { /* ブラウザでは無視 */ }
