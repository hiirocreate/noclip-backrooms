// キーボード/マウス と タッチ操作
export class Input {
  constructor(canvas, settings) {
    this.canvas = canvas;
    this.settings = settings;
    this.keys = {};
    this.move = { x: 0, y: 0 };   // 左右, 前後(前が+)
    this.look = { x: 0, y: 0 };   // このフレームの視点移動量
    this.run = false; this.crouch = false;
    this.actions = new Set();     // 'light','drink','pause','crouch'
    this.enabled = false;
    this.isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    this.bindKeyboard();
    this.bindTouch();
  }

  consume(a) { if (this.actions.has(a)) { this.actions.delete(a); return true; } return false; }

  bindKeyboard() {
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys[e.code] = true;
      if (!this.enabled) return;
      if (e.code === 'KeyF') this.actions.add('light');
      if (e.code === 'KeyQ') this.actions.add('drink');
      if (e.code === 'KeyC' || e.code === 'ControlLeft') this.crouch = !this.crouch;
      if (e.code === 'Escape' || e.code === 'KeyP') this.actions.add('pause');
    });
    addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    addEventListener('blur', () => { this.keys = {}; });

    this.canvas.addEventListener('click', () => {
      if (this.enabled && !this.isTouch && document.pointerLockElement !== this.canvas) this.canvas.requestPointerLock?.();
    });
    document.addEventListener('pointerlockchange', () => {
      if (!document.pointerLockElement && this.enabled && !this.isTouch) this.actions.add('pause');
    });
    addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== this.canvas) return;
      const s = 0.0022 * this.settings.sens;
      this.look.x += e.movementX * s;
      this.look.y += e.movementY * s * (this.settings.invert ? -1 : 1);
    });
  }

  bindTouch() {
    const zone = document.getElementById('stick-zone');
    const base = document.getElementById('stick-base');
    const knob = document.getElementById('stick-knob');
    const lookZone = document.getElementById('look-zone');
    const R = 50;
    let stickId = null, sx = 0, sy = 0;
    const defaultPos = () => { base.style.left = '60px'; base.style.top = ''; base.style.bottom = '50px'; };

    zone.addEventListener('pointerdown', (e) => {
      if (stickId !== null) return;
      stickId = e.pointerId; zone.setPointerCapture(e.pointerId);
      sx = e.clientX; sy = e.clientY;
      base.style.left = (sx - 60) + 'px'; base.style.top = (sy - 60) + 'px'; base.style.bottom = '';
      base.classList.add('active');
      e.preventDefault();
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== stickId) return;
      let dx = e.clientX - sx, dy = e.clientY - sy;
      const d = Math.hypot(dx, dy);
      if (d > R) { dx *= R / d; dy *= R / d; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      this.touchMove = { x: dx / R, y: -dy / R };
      // スティックを大きく倒すと自動で走る(設定で「走る」ボタン併用可)
      this.stickRun = d > R * 1.6;
    });
    const endStick = (e) => {
      if (e.pointerId !== stickId) return;
      stickId = null; this.touchMove = null; this.stickRun = false;
      knob.style.transform = ''; base.classList.remove('active'); defaultPos();
    };
    zone.addEventListener('pointerup', endStick);
    zone.addEventListener('pointercancel', endStick);

    let lookId = null, lx = 0, ly = 0;
    lookZone.addEventListener('pointerdown', (e) => {
      if (lookId !== null) return;
      lookId = e.pointerId; lookZone.setPointerCapture(e.pointerId);
      lx = e.clientX; ly = e.clientY; e.preventDefault();
    });
    lookZone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== lookId) return;
      const s = 0.0055 * this.settings.sens;
      this.look.x += (e.clientX - lx) * s;
      this.look.y += (e.clientY - ly) * s * (this.settings.invert ? -1 : 1);
      lx = e.clientX; ly = e.clientY;
    });
    const endLook = (e) => { if (e.pointerId === lookId) lookId = null; };
    lookZone.addEventListener('pointerup', endLook);
    lookZone.addEventListener('pointercancel', endLook);

    const runBtn = document.getElementById('btn-run');
    const hold = (el, on, off) => {
      el.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); on(); });
      el.addEventListener('pointerup', (e) => { e.preventDefault(); off(); });
      el.addEventListener('pointercancel', off);
      el.addEventListener('pointerleave', off);
    };
    hold(runBtn, () => { this.touchRun = true; runBtn.classList.add('on'); }, () => { this.touchRun = false; runBtn.classList.remove('on'); });
    const tap = (id, fn) => document.getElementById(id).addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); fn(); });
    tap('btn-light', () => this.actions.add('light'));
    tap('btn-drink', () => this.actions.add('drink'));
    tap('btn-crouch', () => { this.crouch = !this.crouch; document.getElementById('btn-crouch').classList.toggle('on', this.crouch); });
  }

  update() {
    const k = this.keys;
    let x = 0, y = 0;
    if (k.KeyW || k.ArrowUp) y += 1;
    if (k.KeyS || k.ArrowDown) y -= 1;
    if (k.KeyA || k.ArrowLeft) x -= 1;
    if (k.KeyD || k.ArrowRight) x += 1;
    if (this.touchMove) { x += this.touchMove.x; y += this.touchMove.y; }
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    this.move.x = x; this.move.y = y;
    this.run = !!(k.ShiftLeft || k.ShiftRight || this.touchRun || this.stickRun);
  }

  takeLook() { const l = { ...this.look }; this.look.x = 0; this.look.y = 0; return l; }

  reset() {
    this.keys = {}; this.actions.clear(); this.look.x = this.look.y = 0;
    this.touchMove = null; this.touchRun = false; this.crouch = false;
    document.getElementById('btn-crouch')?.classList.remove('on');
  }
}
