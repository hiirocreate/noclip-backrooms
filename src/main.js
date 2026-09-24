// NOCLIP ― 裏側の階層 ― メイン
import * as THREE from 'three';
import { LEVELS, UPCOMING, LEGACY_IDS, levelIndex, CREDIT } from './levels/index.js';
import { generateMap } from './mapgen.js';
import { World } from './world.js';
import { Player } from './player.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { PostFX } from './postfx.js';
import { Items } from './items.js';
import { Wanderer } from './entities.js';
import { APP_VERSION } from './config.js';
import { checkForUpdate, openExternal, isNative, compareVersion } from './update.js';
import { App } from '@capacitor/app';

const $ = (id) => document.getElementById(id);
const SAVE_KEY = 'noclip_save_v1';
const SET_KEY = 'noclip_settings_v1';
const RELEASE_NOTES = import.meta.glob('../release-notes/*.md', { query: '?raw', import: 'default', eager: true });

function load(key, def) {
  try { const v = JSON.parse(localStorage.getItem(key)); return v ? { ...def, ...v } : { ...def }; } catch (e) { return { ...def }; }
}
function store(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* noop */ } }

const DEATH = {
  wanderer: ['見つかった', '振り返ると、あの長い腕がすぐそこにあった。'],
  smiler: ['見つかった', '笑顔は、ずっとあなたを見ていた。'],
  hound: ['見つかった', '音を立てすぎた。'],
  duller: ['見つかった', '灰色の人影は、壁の中からあなたを見ていた。'],
  sanity: ['正気を失った', '蛍光灯の音が、頭の中を埋め尽くした。'],
};

// セーブデータ(v2)。旧版(階層番号)のセーブも引き継ぐ
function migrateSave(s) {
  if (s.v === 2) return { seeds: {}, reached: [], ...s };
  const out = { v: 2, levelId: 'level-0', seeds: {}, hasSave: !!s.hasSave, progress: null, reached: [], lastVersion: s.lastVersion };
  if (typeof s.level === 'number') { out.levelId = LEGACY_IDS[s.level] || 'level-0'; if (s.level > 0) out.hasSave = true; }
  return out;
}

class Game {
  constructor() {
    const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    this.settings = load(SET_KEY, { sens: 1, quality: isTouch ? 0.75 : 1, ambientVolume: 0.8, musicVolume: 0.3, invert: false, shake: true });
    this.save = migrateSave(load(SAVE_KEY, {}));
    store(SAVE_KEY, this.save);

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
    this.audio.setAmbientVolume(this.settings.ambientVolume);
    this.audio.setMusicVolume(this.settings.musicVolume);
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
    this.showWhatsNew();
    this.checkUpdate();
  }

  /* ================= UI ================= */
  show(id) {
    for (const s of document.querySelectorAll('.screen')) s.classList.add('hidden');
    if (id) $(id).classList.remove('hidden');
  }

  bindUI() {
    const click = (id, fn) => $(id).addEventListener('click', (e) => { e.stopPropagation(); this.audio.init(); fn(); });
    this.updateContinueButton();
    $('version').textContent = `v${APP_VERSION}`;
    $('credit').textContent = CREDIT;
    click('btn-new', () => { this.save = { v: 2, levelId: LEVELS[0].id, seeds: {}, hasSave: false, reached: this.save.reached || [] }; store(SAVE_KEY, this.save); this.startLevel(LEVELS[0].id); });
    click('btn-continue', () => { if (levelIndex(this.save.levelId) >= 0) this.startLevel(this.save.levelId); else this.showComingSoon(); });
    click('btn-settings', () => { this.settingsBack = 'screen-title'; this.openSettings(); });
    click('btn-howto', () => this.show('screen-howto'));
    for (const b of document.querySelectorAll('.back')) b.addEventListener('click', () => this.show(this.settingsBack && b.closest('#screen-settings') ? this.settingsBack : 'screen-title'));
    click('btn-resume', () => this.resume());
    click('btn-pause-settings', () => { this.settingsBack = 'screen-pause'; this.openSettings(); });
    click('btn-quit', () => this.toTitle());
    click('btn-pause', () => this.pause());
    click('btn-retry', () => this.startLevel(this.def.id, true));
    click('btn-dead-quit', () => this.toTitle());
    click('btn-soon-quit', () => this.toTitle());
    click('btn-note-close', () => {
      this.show(null);
      this.state = 'play';
      this.input.reset();
      // メモを開く間だけ入力を止める。ここで戻し忘れると F/Q/C/Esc/P が以後無効になる
      this.input.enabled = true;
      this.clock.getDelta();
      this.lockPointer();
    });
    click('btn-update-open', () => { if (this.update) openExternal(this.update.apk || this.update.url); });
    click('btn-update-later', () => $('update-banner').classList.add('hidden'));
    click('btn-news-close', () => this.show('screen-title'));

    // テンキー
    const disp = $('keypad-display');
    for (const b of document.querySelectorAll('#keypad-keys button')) {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        const k = b.dataset.k;
        if (k === 'C') this.keypadCode = '';
        else if (k === 'OK') { this.submitKeypad(); return; }
        else if (this.keypadCode.length < 4) this.keypadCode += k;
        this.audio.keyBeep();
        disp.textContent = this.keypadCode.padEnd(4, '_');
      });
    }
    click('btn-keypad-close', () => this.closeKeypad());
    addEventListener('keydown', (e) => {
      if (this.state !== 'keypad') return;
      if (/^Digit\d$/.test(e.code) || /^Numpad\d$/.test(e.code)) { const d = e.code.slice(-1); if (this.keypadCode.length < 4) { this.keypadCode += d; this.audio.keyBeep(); disp.textContent = this.keypadCode.padEnd(4, '_'); } }
      else if (e.code === 'Backspace') { this.keypadCode = this.keypadCode.slice(0, -1); disp.textContent = this.keypadCode.padEnd(4, '_'); }
      else if (e.code === 'Enter' || e.code === 'NumpadEnter') this.submitKeypad();
      else if (e.code === 'Escape') this.closeKeypad();
    });

    const s = this.settings;
    const sens = $('set-sens'), q = $('set-quality'), ambient = $('set-ambient-volume'), music = $('set-music-volume'), inv = $('set-invert'), sh = $('set-shake');
    sens.value = s.sens; q.value = String(s.quality); ambient.value = s.ambientVolume; music.value = s.musicVolume; inv.checked = s.invert; sh.checked = s.shake;
    const apply = () => {
      s.sens = +sens.value; s.quality = +q.value; s.ambientVolume = +ambient.value; s.musicVolume = +music.value; s.invert = inv.checked; s.shake = sh.checked;
      this.audio.setAmbientVolume(s.ambientVolume); this.audio.setMusicVolume(s.musicVolume); this.resize(); store(SET_KEY, s);
      this.fx.u.grain.value = s.shake ? 1 : 0.3;
    };
    [sens, q, ambient, music, inv, sh].forEach(el => el.addEventListener('input', apply));
    [q, inv, sh].forEach(el => el.addEventListener('change', apply));
    this.fx.u.grain.value = s.shake ? 1 : 0.3;
  }

  openSettings() { this.show('screen-settings'); }

  updateContinueButton() {
    const b = $('btn-continue');
    const idx = levelIndex(this.save.levelId);
    if (!this.save.hasSave) { b.disabled = true; b.textContent = 'つづきから'; return; }
    b.disabled = false;
    if (idx >= 0) b.textContent = `つづきから (${LEVELS[idx].code})`;
    else { const up = UPCOMING.find(u => u.id === this.save.levelId); b.textContent = `つづきから (${up?.code || '次の階層'} は準備中)`; }
  }

  resize() {
    const r = Math.min(devicePixelRatio || 1, 2) * this.settings.quality;
    this.renderer.setPixelRatio(r);
    this.renderer.setSize(innerWidth, innerHeight);
    this.fx.setPixelRatio(r);
    this.fx.setSize(innerWidth, innerHeight);
    this.camera.aspect = innerWidth / innerHeight;
    if (this.state !== 'dying') this.camera.fov = this.baseFov();
    this.camera.updateProjectionMatrix();
    document.body.classList.toggle('portrait', innerHeight > innerWidth);
  }

  // 縦画面でも視野が狭くなりすぎないよう、横方向の視野角を確保する
  baseFov() {
    const aspect = innerWidth / innerHeight;
    if (aspect >= 1) return 72;
    const v = 2 * Math.atan(Math.tan((64 / 2) * Math.PI / 180) / aspect) * 180 / Math.PI;
    return Math.min(100, Math.max(72, v));
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

  showNote(text) {
    this.audio.paper();
    $('note-text').innerHTML = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>');
    this.state = 'note'; this.input.enabled = false;
    if (document.pointerLockElement) document.exitPointerLock();
    this.show('screen-note');
  }

  // 一瞬まっ暗にする(虚無の部屋など)
  flashBlack(sec = 1.5) {
    const f = $('fade');
    f.style.transition = 'opacity .05s'; f.classList.add('on');
    setTimeout(() => { f.style.transition = 'opacity 1.2s'; f.classList.remove('on'); setTimeout(() => { f.style.transition = ''; }, 1300); }, sec * 1000);
  }

  // カメラから見えているか(dot: 視線の中心からの許容度)
  canSee(pos, dot = 0.5) {
    const cam = this.camera;
    const dir = cam.getWorldDirection(this._cv || (this._cv = new THREE.Vector3()));
    const v = (this._cv2 || (this._cv2 = new THREE.Vector3())).set(pos.x - cam.position.x, pos.y - cam.position.y, pos.z - cam.position.z).normalize();
    if (v.dot(dir) < dot) return false;
    return this.world.los(cam.position.x, cam.position.z, pos.x, pos.z);
  }

  /* ---------- テンキー ---------- */
  openKeypad(cb) {
    this.keypadCb = cb; this.keypadCode = '';
    $('keypad-display').textContent = '____';
    this.state = 'keypad'; this.input.enabled = false;
    if (document.pointerLockElement) document.exitPointerLock();
    this.show('screen-keypad');
  }
  submitKeypad() {
    const code = this.keypadCode, cb = this.keypadCb;
    this.closeKeypad();
    cb?.(code);
  }
  closeKeypad() {
    if (this.state !== 'keypad') return;
    this.show(null); this.state = 'play'; this.input.reset(); this.input.enabled = true; this.clock.getDelta(); this.lockPointer();
  }

  /* ---------- 更新のお知らせ ---------- */
  async checkUpdate() {
    const u = await checkForUpdate();
    if (!u) return;
    this.update = u;
    $('update-version').textContent = `v${u.version}`;
    $('update-notes').textContent = u.notes.replace(/[#*`>]/g, '').trim().slice(0, 600);
    $('update-banner').classList.remove('hidden');
  }

  // アップデート後、初めて起動したときに更新内容を見せる
  showWhatsNew() {
    const last = this.save.lastVersion;
    this.save.lastVersion = APP_VERSION; store(SAVE_KEY, this.save);
    if (!last || compareVersion(last, APP_VERSION) >= 0) return;
    const key = Object.keys(RELEASE_NOTES).find(k => k.endsWith(`/${APP_VERSION}.md`));
    if (!key) return;
    $('news-title').textContent = `v${APP_VERSION} の更新内容`;
    $('news-text').textContent = RELEASE_NOTES[key].replace(/[#*`>]/g, '').trim();
    this.show('screen-news');
  }

  /* ================= 進行 ================= */
  async startLevel(id, retry = false) {
    this.audio.init();
    const token = this._loadToken = (this._loadToken || 0) + 1;
    this.cleanupLevel();
    const def = this.def = this.cfg = LEVELS[levelIndex(id)];
    this.state = 'loading';
    this.input.enabled = false;
    if (this.input.isTouch && document.documentElement.requestFullscreen && !document.fullscreenElement && !isNative()) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
    $('intro-level').textContent = def.code;
    $('intro-name').textContent = `${def.name}`;
    $('intro-en').textContent = def.en;
    $('intro-desc').innerHTML = def.desc.replace(/\n/g, '<br>');
    this.show('screen-intro');
    $('hud').classList.add('hidden'); $('touch').classList.add('hidden');
    await new Promise(r => setTimeout(r, 60));
    if (token !== this._loadToken) return;

    if (!this.save.seeds[id] || !retry) this.save.seeds[id] = (Math.random() * 1e9) | 0;
    const resume = !retry && this.save.progress?.levelId === id ? this.save.progress : null;
    this.save.levelId = id; this.save.hasSave = true;
    if (!resume) this.save.progress = null;
    store(SAVE_KEY, this.save);
    const t0 = performance.now();

    // マップ → レベルの配置 → 3D → アイテム・敵
    const map = generateMap(def.map, this.save.seeds[id]);
    const logic = this.logic = new def.Logic(this, def);
    logic.plan(map);
    this.world = new World(this.scene, def, map);
    logic.build(this.world);
    this.scene.fog = new THREE.FogExp2(def.fog.color, def.fog.density);
    this.scene.background = new THREE.Color(def.fog.color);
    this.ambientLight.color.set(def.fog.color).lerp(new THREE.Color(0xffffff), 0.5);
    this.ambientLight.intensity = def.theme === 'lobby' || def.theme === 'office' ? 0.25 : 0.15;

    const st = this.world.tileCenter(map.start.x, map.start.y);
    let yaw = 0;
    for (const [dx, dy, a] of [[1, 0, -Math.PI / 2], [0, 1, Math.PI], [-1, 0, Math.PI / 2], [0, -1, 0]]) {
      if (!this.world.solid(map.start.x + dx, map.start.y + dy)) { yaw = a; break; }
    }
    this.player.spawn(st.x, st.z, yaw);
    this.player.speedMul = 1;
    if (resume) {
      this.player.sanity = resume.sanity;
      this.player.stamina = resume.stamina;
      this.player.battery = resume.battery;
      this.player.waters = resume.waters;
    }
    this.camera.fov = this.baseFov();
    this.camera.rotation.z = 0;
    this.camera.updateProjectionMatrix();
    $('scare').classList.remove('sanity');
    if (levelIndex(id) === 0 && !retry && !resume) { this.player.battery = 100; this.player.waters = 1; }
    this.player.flashlight = false; $('btn-light').classList.remove('on');
    this.collected = new Set(resume?.collected || []);
    this.items = new Items(this, logic.items());
    this.updatePlayerField(true);
    logic.spawn();
    this.nextEvent = 10 + Math.random() * 10;
    this.nextHalluc = 15;
    this.hbTimer = 0;
    this.audio.setSpace(def.space);
    this.audio.startAmbient((api) => logic.ambient(api));
    this.audio.startMusic((api) => logic.music(api));
    logic.start(resume?.state ? { ...resume.state } : null);
    // シェーダを事前コンパイル
    this.player.update(0.016, this.input);
    this.renderer.compile(this.scene, this.camera);
    const wait = Math.max(0, 3200 - (performance.now() - t0));
    await new Promise(r => setTimeout(r, wait));
    if (token !== this._loadToken) return;

    this.show(null);
    $('hud').classList.remove('hidden');
    if (this.input.isTouch) $('touch').classList.remove('hidden');
    $('level-name').textContent = `${def.code} — ${def.name}`;
    this.input.reset();
    this.input.enabled = true;
    this.state = 'play';
    this.saveTimer = 0;
    this.saveProgress();
    this.clock.getDelta();
    this.lockPointer();
    if (levelIndex(id) === 0 && !resume) setTimeout(() => this.say(this.input.isTouch ? '足元のメモを拾ってみよう' : 'クリックで視点操作 / 足元のメモを拾ってみよう', 5), 800);
  }

  cleanupLevel() {
    this.logic?.dispose(); this.logic = null;
    for (const e of this.entities) e.dispose();
    for (const f of this.fakes) f.ent.dispose();
    this.entities = []; this.fakes = []; this.chasers.clear(); this.fear = 0;
    this.items?.dispose(); this.items = null;
    this.world?.dispose(); this.world = null;
    this.audio.stopAmbient?.();
    this.audio.stopMusic?.();
    this.interact = null;
  }

  toTitle() {
    this.cleanupLevel();
    this.state = 'menu';
    this.input.enabled = false;
    if (document.pointerLockElement) document.exitPointerLock();
    $('hud').classList.add('hidden'); $('touch').classList.add('hidden');
    this.updateContinueButton();
    this.show('screen-title');
  }

  pause() {
    if (this.state !== 'play') return;
    this.state = 'paused'; this.input.enabled = false;
    this.audio.suspend();
    this.saveProgress();
    this.show('screen-pause');
  }
  resume() {
    this.show(null); this.state = 'play'; this.input.enabled = true; this.input.reset();
    this.audio.resume(); this.clock.getDelta(); this.lockPointer();
  }

  saveProgress() {
    if (!this.def || !this.player || !this.save.hasSave || !this.logic) return;
    const p = this.player;
    this.save.progress = {
      levelId: this.def.id,
      collected: [...(this.collected || [])],
      state: this.logic.state,
      sanity: p.sanity, stamina: p.stamina, battery: p.battery, waters: p.waters,
    };
    store(SAVE_KEY, this.save);
  }

  onPickup(it) {
    const p = this.player;
    if (it.id && it.type !== 'note') this.collected.add(it.id);
    if (this.logic.onPickup(it)) { this.saveProgress(); return; }
    if (it.type === 'battery') {
      p.battery = Math.min(100, p.battery + 50); this.audio.pickup(); this.say('電池を拾った');
    } else if (it.type === 'water') {
      p.waters++; this.audio.pickup(); this.say('アーモンド水を拾った');
    } else if (it.type === 'note') {
      this.showNote(this.def.notes[it.note]);
    }
    this.saveProgress();
  }

  drink() {
    const p = this.player;
    if (p.waters <= 0) { this.say('アーモンド水を持っていない'); return; }
    if (p.sanity > 95) { this.say('今は必要ない'); return; }
    p.waters--; p.sanity = Math.min(100, p.sanity + 45); this.audio.drink(); this.say('アーモンド水を飲んだ。少し落ち着いた'); this.saveProgress();
  }

  // 物音(raw=true はプレイヤー以外の音：機械音の遮蔽を受けない)
  makeNoise(pos, radius, raw = false) {
    const r = raw ? radius : radius * (this.logic?.noiseMul(pos) ?? 1);
    for (const e of this.entities) e.hear?.(pos, r);
  }

  onChaseStart(e) {
    if (!this.chasers.size && (!this._lastStinger || this.time - this._lastStinger > 8)) { this.audio.stinger(); this._lastStinger = this.time; }
    this.chasers.add(e);
  }
  onChaseEnd(e) { this.chasers.delete(e); }

  kill(cause) {
    if (this.state !== 'play') return;
    this.state = 'dying'; this.input.enabled = false;
    this.audio.scare();
    const killer = this.entities.find(e => e.type === cause && e.distToPlayer() < 3) || this.entities.find(e => e.type === cause);
    this.dyingT = 0; this.killer = cause === 'sanity' ? null : killer;
    this.deathStart = this.camera.position.clone();
    this.deathFov = this.camera.fov;
    if (cause === 'sanity') {
      this.audio.sanityCollapse();
      $('scare').classList.remove('sanity');
      void $('scare').offsetWidth;
      $('scare').classList.add('sanity');
    }
    if (document.pointerLockElement) document.exitPointerLock();
    const [t, d] = DEATH[cause] || DEATH.wanderer;
    $('dead-title').textContent = t; $('dead-desc').textContent = d;
  }

  // 階層クリア → 次の階層へ(未実装なら「次回アップデート」画面)
  completeLevel({ transition = 'fade' } = {}) {
    if (this.state !== 'play') return;
    this.state = 'transition'; this.input.enabled = false;
    const f = $('fade');
    if (transition === 'noclip') { this.fx.u.flash.value = 1; f.style.background = '#fff'; }
    f.classList.add('on');
    if (transition !== 'noclip') this.audio.unlock();
    const idx = levelIndex(this.def.id);
    const reached = new Set(this.save.reached || []); reached.add(this.def.id);
    this.save.reached = [...reached];
    setTimeout(() => {
      f.classList.remove('on'); f.style.background = '';
      const next = LEVELS[idx + 1];
      if (next) {
        this.save.levelId = next.id; this.save.progress = null; store(SAVE_KEY, this.save);
        this.startLevel(next.id);
      } else {
        // 最新の階層をクリア。次の階層IDを記録しておけば、アップデートで追加された時にそのまま続きから遊べる
        const up = UPCOMING[0];
        this.save.levelId = up?.id || 'level-next'; this.save.progress = null; this.save.hasSave = true; store(SAVE_KEY, this.save);
        this.cleanupLevel();
        $('hud').classList.add('hidden'); $('touch').classList.add('hidden');
        if (document.pointerLockElement) document.exitPointerLock();
        this.state = 'menu';
        this.showComingSoon();
      }
    }, 1400);
  }

  showComingSoon() {
    const up = UPCOMING[0];
    $('soon-level').textContent = up ? up.code : '???';
    $('soon-name').textContent = up ? `${up.name}（${up.en}）` : '';
    $('soon-desc').innerHTML = (up?.teaser || '').replace(/\n/g, '<br>');
    $('soon-list').innerHTML = UPCOMING.slice(1).map(u => `<li>${u.code}　${u.name}</li>`).join('');
    this.show('screen-soon');
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
    const p = this.player, w = this.world, def = this.def;
    // 遠くの物音(階層ごとに種類が違う)
    this.nextEvent -= dt * (p.sanity < 40 ? 2 : 1);
    if (this.nextEvent <= 0) {
      this.nextEvent = 8 + Math.random() * 14;
      const a = Math.random() * Math.PI * 2, r = 8 + Math.random() * 12;
      const pos = { x: p.pos.x + Math.cos(a) * r, y: 1.5, z: p.pos.z + Math.sin(a) * r };
      const kinds = def.events || ['knock'];
      this.audio.distantEvent(pos, kinds[Math.floor(Math.random() * kinds.length)]);
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

  // 近くの「調べられるもの」
  updateInteract() {
    const p = this.player;
    const dir = this.camera.getWorldDirection(new THREE.Vector3());
    let best = null, bd = 1e9;
    for (const it of this.logic.interactables) {
      if (it.enabled && !it.enabled()) continue;
      const dx = it.pos.x - p.pos.x, dz = it.pos.z - p.pos.z, d = Math.hypot(dx, dz);
      if (d > (it.radius || 1.4)) continue;
      if (d > 0.4 && (dx * dir.x + dz * dir.z) / d < 0.2) continue;
      if (d < bd) { bd = d; best = it; }
    }
    this.interact = best;
    const hint = $('interact-hint');
    if (best) { hint.textContent = `${this.input.isTouch ? '' : '[E] '}${best.label}`; hint.classList.add('show'); }
    else hint.classList.remove('show');
    $('btn-use').classList.toggle('hidden', !best);
  }

  /* ================= ループ ================= */
  frame() {
    const dt = Math.min(0.05, this.clock.getDelta());
    this.time += dt;
    const u = this.fx.u;
    u.time.value = this.time;

    if (this.state === 'play') this.update(dt);
    else if (this.state === 'dying') this.updateDying(dt);

    if (this.world) this.fx.render(dt);
    else { this.renderer.setClearColor(0x000000); this.renderer.clear(); }
  }

  update(dt) {
    const inp = this.input, p = this.player, w = this.world, logic = this.logic;
    inp.update();
    if (inp.consume('pause')) { this.pause(); return; }
    if (inp.consume('light')) p.toggleLight();
    if (inp.consume('drink')) this.drink();
    if (inp.consume('use') && this.interact) { this.interact.action(); if (this.state !== 'play') return; }

    p.update(dt, inp);
    if (this.state !== 'play') return;
    this.updatePlayerField();
    for (const e of [...this.entities]) e.update(dt, this.time);
    if (this.state !== 'play') return;
    this.items.update(dt, this.time);
    logic.update(dt);
    if (this.state !== 'play') return;
    w.update(dt, p.pos, this.time);
    this.randomEvents(dt);
    this.updateInteract();
    this.saveTimer = (this.saveTimer || 0) + dt;
    if (this.saveTimer > 5) { this.saveTimer = 0; this.saveProgress(); }

    // 恐怖度
    let fear = 0;
    for (const e of this.entities) {
      const d = e.distToPlayer();
      if (d > 16) continue;
      const active = this.chasers.has(e);
      const vis = w.los(p.pos.x, p.pos.z, e.pos.x, e.pos.z);
      if (e.type === 'smiler' && !active && e.alpha < 0.3) continue;
      const f = (1 - d / 16) * (active ? 1 : vis ? 0.55 : 0.2);
      fear = Math.max(fear, f);
    }
    this.fear += (fear - this.fear) * Math.min(1, dt * 3);

    // 音
    this.audio.updateListener(this.camera);
    this.audio.setHum(w.lightAt(p.pos.x, p.pos.z) * 0.8 * Math.min(1, w.power));
    this.audio.setIntensity(Math.min(1, Math.max(logic.tension(), this.fear * 1.2)));
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
      // 正気喪失：視界が潰れながら倒れ込む
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
      this.audio.stopMusic();
    }
  }

  updateHUD() {
    this._hudT = (this._hudT || 0) + 1;
    if (this._hudT % 6) return;
    const p = this.player;
    const set = (id, v) => { const el = $(id); el.style.width = Math.max(0, v) + '%'; el.classList.toggle('low', v < 20); };
    set('bar-sanity', p.sanity); set('bar-stamina', p.stamina); set('bar-battery', p.battery);
    $('water-count').textContent = p.waters;
    $('objective').textContent = this.logic.objective();
    $('status').textContent = this.logic.status();
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
    else if (g.state === 'keypad') g.closeKeypad();
    else if (g.state === 'menu' && !document.getElementById('screen-title').classList.contains('hidden')) App.exitApp();
    else if (g.state === 'menu') g.show('screen-title');
  });
  App.addListener('pause', () => { const g = window.game; if (g.state === 'play') g.pause(); });
} catch (e) { /* ブラウザでは無視 */ }
