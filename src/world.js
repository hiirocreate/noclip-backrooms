// マップ → 3Dメッシュ構築、焼き込みライティング(照明回路つき)、当たり判定、壁の貼り物・扉・小物
import * as THREE from 'three';
import { FLOOR, WALL, PILLAR, PROP, DIRS, bfs } from './mapgen.js';
import { getTextures, getCommon, getDecal, getDoorTexture } from './textures.js';

// 小物(PROPタイル)の種類
export const PROP_KINDS = {
  desk: { h: 0.76, inset: 0.18, tex: 'desk', opaque: false },
  crate: { h: 0.9, inset: 0.55, tex: 'crate', opaque: false },
  machine: { h: 2.3, inset: 0.12, tex: 'machine', opaque: true },
  cabinet: { h: 1.9, inset: 0.2, tex: 'machine', opaque: true },
  cooler: { h: 1.25, inset: 0.9, tex: 'cooler', opaque: false },
};

export class World {
  constructor(scene, def, map) {
    this.scene = scene;
    this.def = def;
    this.map = map;
    this.T = def.tile;
    this.H = def.height;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.tex = getTextures(def.theme);
    this.common = getCommon();
    this.lampColor = new THREE.Color(...def.lamp.color);
    this.circuit = new THREE.Vector4(1, 1, 1, 1);
    this.uniforms = { circuit: { value: this.circuit }, lampCol: { value: this.lampColor }, specialScale: { value: 1 } };
    this.dyn = new Set();
    this.decals = [];
    this.colliders = []; // 円の当たり判定(動かせる小物用) {x,z,r}
    this.bakedLamps = map.lamps.filter(l => l.state === 'on');
    this.flickerLamps = map.lamps.filter(l => l.state === 'flicker');
    this.dirty = true;
    this.buildLightGrid();
    this.buildGeometry();
    this.buildLamps();
    this.buildProps();
  }

  /* ---------- 座標変換・判定 ---------- */
  tileCenter(tx, ty) { return new THREE.Vector3((tx + 0.5) * this.T, 0, (ty + 0.5) * this.T); }
  toTile(x, z) { return [Math.floor(x / this.T), Math.floor(z / this.T)]; }
  tileAt(tx, ty) {
    const { W, H, tiles } = this.map;
    if (tx < 0 || ty < 0 || tx >= W || ty >= H) return WALL;
    return tiles[ty * W + tx];
  }
  solid(tx, ty) { return this.tileAt(tx, ty) !== FLOOR || this.dyn.has(ty * this.map.W + tx); }
  opaque(tx, ty) {
    const t = this.tileAt(tx, ty);
    if (t === WALL || t === PILLAR) return true;
    const i = ty * this.map.W + tx;
    if (this.dyn.has(i)) return true;
    if (t === PROP) return !!this.map.props.get(i)?.opaque;
    return false;
  }

  // 視線(両端のタイルは判定しない)
  los(x0, z0, x1, z1) {
    const T = this.T;
    let tx = Math.floor(x0 / T), ty = Math.floor(z0 / T);
    const ex = Math.floor(x1 / T), ey = Math.floor(z1 / T);
    const dx = x1 - x0, dz = z1 - z0;
    const sx = dx > 0 ? 1 : -1, sy = dz > 0 ? 1 : -1;
    const tdx = dx !== 0 ? Math.abs(T / dx) : Infinity;
    const tdy = dz !== 0 ? Math.abs(T / dz) : Infinity;
    let tmx = dx !== 0 ? ((sx > 0 ? (tx + 1) * T : tx * T) - x0) / dx : Infinity;
    let tmy = dz !== 0 ? ((sy > 0 ? (ty + 1) * T : ty * T) - z0) / dz : Infinity;
    const n = Math.abs(ex - tx) + Math.abs(ey - ty);
    for (let i = 0; i < n - 1; i++) {
      if (tmx < tmy) { tmx += tdx; tx += sx; } else { tmy += tdy; ty += sy; }
      if (this.opaque(tx, ty)) return false;
    }
    return true;
  }

  /* ---------- 焼き込みライト ---------- */
  lampPos(l) { return new THREE.Vector3((l.x + 0.5) * this.T, this.H - 0.05, (l.y + 0.5) * this.T); }

  // 戻り値: [回路0,回路1,回路2,回路3, 特殊R,G,B]
  lightAt3(x, y, z, nx, ny, nz) {
    const out = [0, 0, 0, 0, 0, 0, 0];
    const baseR = this.def.lamp.radius, baseI = this.def.lamp.intensity;
    for (const l of this.bakedLamps) {
      const R = l.radius || baseR, I = l.intensity || baseI;
      const lx = (l.x + 0.5) * this.T, lz = (l.y + 0.5) * this.T, ly = this.H - 0.05;
      const dx = lx - x, dy = ly - y, dz = lz - z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d >= R) continue;
      if (!this.los(lx, lz, x + nx * 0.05, z + nz * 0.05)) continue;
      const f = Math.pow(1 - d / R, 2);
      const cos = Math.max(0, (dx * nx + dy * ny + dz * nz) / (d + 1e-4));
      const down = Math.max(0.15, dy / (d + 1e-4));
      const v = I * f * (0.3 + 0.7 * cos) * (0.35 + 0.65 * down);
      if (l.color) { out[4] += v * l.color[0]; out[5] += v * l.color[1]; out[6] += v * l.color[2]; }
      else out[l.circuit || 0] += v;
    }
    return out;
  }

  buildLightGrid() {
    const { W, H } = this.map;
    this.lightGrid = new Float32Array(W * H * 5);
    for (let ty = 0; ty < H; ty++) for (let tx = 0; tx < W; tx++) {
      if (this.tileAt(tx, ty) === WALL || this.tileAt(tx, ty) === PILLAR) continue;
      const x = (tx + 0.5) * this.T, z = (ty + 0.5) * this.T;
      const l = this.lightAt3(x, 1.2, z, 0, 1, 0);
      const o = (ty * W + tx) * 5;
      for (let k = 0; k < 4; k++) this.lightGrid[o + k] = l[k];
      this.lightGrid[o + 4] = (l[4] + l[5] + l[6]) / 3;
    }
  }

  // ゲームプレイ用：その地点の明るさ
  lightAt(x, z) {
    const [tx, ty] = this.toTile(x, z);
    if (tx < 0 || ty < 0 || tx >= this.map.W || ty >= this.map.H) return 0;
    const o = (ty * this.map.W + tx) * 5, g = this.lightGrid, c = this.circuit;
    let v = g[o] * c.x + g[o + 1] * c.y + g[o + 2] * c.z + g[o + 3] * c.w + g[o + 4] * this.uniforms.specialScale.value;
    for (const p of this.flickerPool || []) {
      if (!p.userData.active) continue;
      const d = Math.hypot(p.position.x - x, p.position.z - z);
      if (d < 7) v += (p.intensity / 12) * (1 - d / 7);
    }
    return v;
  }
  isLitSpecial(x, z) {
    const [tx, ty] = this.toTile(x, z);
    return this.lightGrid[(ty * this.map.W + tx) * 5 + 4] || 0;
  }

  /* ---------- 回路の明るさ ---------- */
  setCircuit(i, v) { const k = 'xyzw'[i]; if (this.circuit[k] !== v) { this.circuit[k] = v; this.dirty = true; } }
  setPower(v) { for (let i = 0; i < 4; i++) this.setCircuit(i, v); }
  get power() { const c = this.circuit; return (c.x + c.y + c.z + c.w) / 4; }

  /* ---------- マテリアル ---------- */
  makeMaterial(map, { bump = 0.02, transparent = false } = {}) {
    const m = new THREE.MeshLambertMaterial({ map, bumpMap: bump ? map : null, bumpScale: bump, transparent });
    const u = this.uniforms;
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, u);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec4 bake4;\nattribute vec3 bakeC;\nvarying vec4 vB4;\nvarying vec3 vBC;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvB4 = bake4; vBC = bakeC;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec4 vB4;\nvarying vec3 vBC;\nuniform vec4 circuit;\nuniform vec3 lampCol;\nuniform float specialScale;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * (lampCol * dot(vB4, circuit) + vBC * specialScale);');
    };
    return m;
  }

  bakePush(b, x, y, z, nx, ny, nz, mul = 1) {
    const l = this.lightAt3(x, y, z, nx, ny, nz);
    const a = this.def.ambient;
    b.b4.push(l[0] * mul + a, l[1] * mul, l[2] * mul, l[3] * mul);
    b.bc.push(l[4] * mul, l[5] * mul, l[6] * mul);
  }

  buildGeometry() {
    const T = this.T, Hh = this.H, { W, H } = this.map;
    const builders = { floor: newB(), ceil: newB(), wall: newB(), pillar: newB() };
    const S = 2;
    const fScale = this.def.floorScale || 2.4;
    const wScale = 2.0;
    const walk = (tx, ty) => { const t = this.tileAt(tx, ty); return t === FLOOR || t === PROP; };

    for (let ty = 0; ty < H; ty++) for (let tx = 0; tx < W; tx++) {
      if (!walk(tx, ty)) continue;
      const x0 = tx * T, z0 = ty * T;
      for (const [b, y, ny] of [[builders.floor, 0, 1], [builders.ceil, Hh, -1]]) {
        const base = b.pos.length / 3;
        for (let j = 0; j <= S; j++) for (let i = 0; i <= S; i++) {
          const x = x0 + (i / S) * T, z = z0 + (j / S) * T;
          b.pos.push(x, y, z); b.nrm.push(0, ny, 0); b.uv.push(x / fScale, z / fScale);
          const sx = x0 + (0.02 + 0.96 * i / S) * T, sz = z0 + (0.02 + 0.96 * j / S) * T;
          this.bakePush(b, sx, y, sz, 0, ny, 0, ny > 0 ? 1 : 0.55);
        }
        for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
          const a = base + j * (S + 1) + i, bb = a + 1, c = a + S + 1, d = c + 1;
          if (ny > 0) b.idx.push(a, c, bb, bb, c, d); else b.idx.push(a, bb, c, bb, d, c);
        }
      }
      for (const [dx, dy] of DIRS) {
        const nt = this.tileAt(tx + dx, ty + dy);
        if (nt !== WALL && nt !== PILLAR) continue;
        const b = nt === PILLAR ? builders.pillar : builders.wall;
        this.pushWallFace(b, tx, ty, dx, dy, wScale);
      }
    }
    const mats = {
      floor: this.makeMaterial(this.tex.floor, { bump: 0.03 }),
      ceil: this.makeMaterial(this.tex.ceil, { bump: 0.01 }),
      wall: this.makeMaterial(this.tex.wall, { bump: 0.025 }),
      pillar: this.makeMaterial(this.tex.pillar, { bump: 0.025 }),
    };
    for (const k in builders) {
      const g = toGeom(builders[k]);
      if (!g) continue;
      const mesh = new THREE.Mesh(g, mats[k]);
      mesh.matrixAutoUpdate = false;
      this.group.add(mesh);
    }
    this.materials = mats;
  }

  // タイル(tx,ty)から見た (dx,dy) 方向の壁面を1枚追加
  pushWallFace(b, tx, ty, dx, dy, wScale = 2, inset = 0) {
    const T = this.T, Hh = this.H, S = 2, VS = 2;
    const nx = -dx, nz = -dy;
    const cx = (tx + 0.5) * T + dx * (T / 2 - inset), cz = (ty + 0.5) * T + dy * (T / 2 - inset);
    const rx = nz, rz = -nx;
    const ax = cx - rx * T / 2, az = cz - rz * T / 2, bx = cx + rx * T / 2, bz = cz + rz * T / 2;
    const base = b.pos.length / 3;
    for (let j = 0; j <= VS; j++) for (let i = 0; i <= S; i++) {
      const t = i / S, y = (j / VS) * Hh;
      const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      b.pos.push(x, y, z); b.nrm.push(nx, 0, nz);
      const along = Math.abs(rx) > 0.5 ? x : z;
      b.uv.push((along * Math.sign(rx + rz)) / wScale, y / Hh);
      const tt = 0.03 + 0.94 * t;
      this.bakePush(b, ax + (bx - ax) * tt + nx * 0.05, Math.min(y, Hh - 0.1), az + (bz - az) * tt + nz * 0.05, nx, 0, nz);
    }
    for (let j = 0; j < VS; j++) for (let i = 0; i < S; i++) {
      const a = base + j * (S + 1) + i, bb = a + 1, c = a + S + 1, d = c + 1;
      b.idx.push(a, bb, c, bb, d, c);
    }
  }

  // 箱(小物・組み替わる壁)をビルダーに追加。6面すべてテクスチャ全体を貼る
  pushBox(b, cx, cz, w, h, d, y0 = 0) {
    const faces = [
      [[1, 0, 0], [0, 0, -1]], [[-1, 0, 0], [0, 0, 1]], [[0, 0, 1], [1, 0, 0]], [[0, 0, -1], [-1, 0, 0]], [[0, 1, 0], [1, 0, 0]],
    ];
    const half = [w / 2, h / 2, d / 2];
    const cy = y0 + h / 2;
    for (const [n, r] of faces) {
      const up = n[1] ? [0, 0, -1] : [0, 1, 0];
      const base = b.pos.length / 3;
      const ext = (v) => Math.abs(v[0]) * half[0] + Math.abs(v[1]) * half[1] + Math.abs(v[2]) * half[2];
      const en = ext(n), er = ext(r), eu = ext(up);
      for (const [su, sv] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const x = cx + n[0] * en + r[0] * er * su + up[0] * eu * sv;
        const y = cy + n[1] * en + r[1] * er * su + up[1] * eu * sv;
        const z = cz + n[2] * en + r[2] * er * su + up[2] * eu * sv;
        b.pos.push(x, y, z); b.nrm.push(n[0], n[1], n[2]);
        b.uv.push((su + 1) / 2, (sv + 1) / 2);
        this.bakePush(b, x + n[0] * 0.06, Math.min(y, this.H - 0.1), z + n[2] * 0.06, n[0], n[1], n[2]);
      }
      b.idx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    }
  }

  buildProps() {
    const byKind = {};
    for (const [i, p] of this.map.props) {
      const k = PROP_KINDS[p.kind]; if (!k) continue;
      const tx = i % this.map.W, ty = (i / this.map.W) | 0;
      const c = this.tileCenter(tx, ty);
      const s = k.size || this.T - k.inset * 2;
      (byKind[p.kind] ||= newB());
      this.pushBox(byKind[p.kind], c.x, c.z, p.w || s, p.h || k.h, p.d || s);
    }
    for (const kind in byKind) {
      const mat = this.makeMaterial(getDecal(PROP_KINDS[kind].tex), { bump: 0 });
      this.group.add(new THREE.Mesh(toGeom(byKind[kind]), mat));
    }
  }

  buildLamps() {
    const theme = this.def.theme;
    let geo;
    if (theme === 'lobby' || theme === 'office') geo = new THREE.BoxGeometry(0.62, 0.04, 1.22);
    else if (theme === 'parking' || theme === 'station') geo = new THREE.BoxGeometry(0.16, 0.1, 1.7);
    else geo = new THREE.SphereGeometry(0.16, 10, 8);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
    const lamps = this.map.lamps;
    this.lampMesh = new THREE.InstancedMesh(geo, mat, Math.max(1, lamps.length));
    const m = new THREE.Matrix4();
    this.lampOn = new THREE.Color().copy(this.lampColor).multiplyScalar(2.2);
    this.lampOff = new THREE.Color(0.08, 0.08, 0.07);
    lamps.forEach((l, i) => {
      const p = this.lampPos(l);
      p.y = this.H - (theme === 'pipes' ? 0.25 : 0.02);
      m.makeTranslation(p.x, p.y, p.z);
      this.lampMesh.setMatrixAt(i, m);
      this.lampMesh.setColorAt(i, this.lampOff);
      l.index = i;
    });
    this.lampMesh.count = lamps.length;
    this.lampMesh.instanceMatrix.needsUpdate = true;
    this.group.add(this.lampMesh);
    this.flickerPool = [];
    for (let i = 0; i < 2; i++) {
      const pl = new THREE.PointLight(this.lampColor, 0, this.def.lamp.radius * 1.1, 1.6);
      pl.userData.active = false;
      this.group.add(pl);
      this.flickerPool.push(pl);
    }
  }

  lampColorFor(l, on = true) {
    if (l.state === 'off' || !on) return this.lampOff;
    if (l.color) return new THREE.Color(l.color[0] * 2, l.color[1] * 2, l.color[2] * 2).multiplyScalar(this.uniforms.specialScale.value);
    const s = this.circuit['xyzw'[l.circuit || 0]];
    return new THREE.Color().copy(this.lampOn).multiplyScalar(Math.max(0.03, s));
  }

  /* ---------- 壁の貼り物・扉 ---------- */
  facePos(f, off = 0.02) {
    const c = this.tileCenter(f.x, f.y);
    return new THREE.Vector3(c.x + f.dx * (this.T / 2 - off), 0, c.z + f.dy * (this.T / 2 - off));
  }
  // 平面に「その場所の明るさ」を与える(停電にも追従)
  litMaterial(tex, { transparent = true, sample, basic = false } = {}) {
    const mat = basic
      ? new THREE.MeshBasicMaterial({ map: tex, transparent, depthWrite: !transparent })
      : new THREE.MeshLambertMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, transparent, depthWrite: !transparent, polygonOffset: true, polygonOffsetFactor: -2 });
    if (!basic && sample) {
      const l = this.lightAt3(sample.x, 1.3, sample.z, sample.nx || 0, 0.5, sample.nz || 0);
      this.decals.push({ mat, l });
    }
    return mat;
  }

  addDecal(face, tex, { w = 1, h = 1, y = 1.4, along = 0, flip = false, basic = false, off = 0.015 } = {}) {
    const p = this.facePos(face, off);
    const rx = -face.dy, rz = face.dx; // 壁に沿った方向
    p.x += rx * along; p.z += rz * along;
    const mat = this.litMaterial(typeof tex === 'string' ? getDecal(tex) : tex, { sample: { x: p.x - face.dx * 0.3, z: p.z - face.dy * 0.3, nx: -face.dx, nz: -face.dy }, basic });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    mesh.position.set(p.x, y, p.z);
    mesh.lookAt(p.x - face.dx, y, p.z - face.dy);
    if (flip) mesh.rotateZ(Math.PI);
    this.group.add(mesh);
    this.dirty = true;
    return mesh;
  }

  addFloorDecal(x, z, tex, size = 1.2, rot = 0) {
    const mat = this.litMaterial(typeof tex === 'string' ? getDecal(tex) : tex, { sample: { x, z, nx: 0, nz: 0 } });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
    mesh.rotation.x = -Math.PI / 2; mesh.rotation.z = rot;
    mesh.position.set(x, 0.012, z);
    this.group.add(mesh);
    this.dirty = true;
    return mesh;
  }

  addDoor(face, { style = 'metal', w = 1.3, h = Math.min(2.3, this.H - 0.3), sign = null } = {}) {
    const p = this.facePos(face, 0.03);
    const normal = new THREE.Vector3(-face.dx, 0, -face.dy);
    const g = new THREE.Group();
    const mat = this.litMaterial(getDoorTexture(style), { transparent: false, sample: { x: p.x + normal.x * 0.4, z: p.z + normal.z * 0.4, nx: normal.x, nz: normal.z } });
    const door = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    door.position.y = h / 2;
    g.add(door);
    const frameMat = new THREE.MeshLambertMaterial({ color: 0x2a261e, emissive: 0x0a0906 });
    for (const [fw, fh, x, y] of [[0.12, h + 0.12, -w / 2 - 0.06, h / 2], [0.12, h + 0.12, w / 2 + 0.06, h / 2], [w + 0.24, 0.12, 0, h + 0.06]]) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(fw, fh, 0.1), frameMat);
      f.position.set(x, y, 0.03); g.add(f);
    }
    let signMesh = null;
    if (sign) {
      this._signs ||= {};
      signMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.225), new THREE.MeshBasicMaterial({ map: this.common.signLocked(sign), fog: false }));
      signMesh.position.set(0, h + 0.32, 0.04);
      g.add(signMesh);
    }
    g.position.copy(p);
    g.lookAt(p.clone().add(normal));
    this.group.add(g);
    this.dirty = true;
    return {
      group: g, face, normal, mat, style,
      pos: p.clone().addScaledVector(normal, 0.7),
      setOpen: (open) => { if (signMesh) signMesh.material.map = open ? this.common.signOpen(sign) : this.common.signLocked(sign); },
    };
  }

  // 壁沿いの配管(装飾)
  addPipes(faces, { heights = null, color = 0x6a5446, emissive = 0x1a0804 } = {}) {
    const T = this.T;
    const hs = heights || [[this.H - 0.35, 0.11], [this.H - 0.62, 0.07], [0.35, 0.09]];
    const geo = new THREE.CylinderGeometry(1, 1, T + 0.02, 8, 1, true);
    const mat = new THREE.MeshLambertMaterial({ color, emissive });
    const inst = new THREE.InstancedMesh(geo, mat, Math.max(1, faces.length * hs.length));
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    let i = 0;
    for (const f of faces) {
      const cx = (f.x + 0.5) * T + f.dx * (T / 2 - 0.16), cz = (f.y + 0.5) * T + f.dy * (T / 2 - 0.16);
      const horiz = f.dy !== 0;
      for (const [y, r] of hs) {
        q.setFromEuler(new THREE.Euler(horiz ? 0 : Math.PI / 2, 0, horiz ? Math.PI / 2 : 0));
        s.set(r, 1, r); p.set(cx, y, cz);
        m.compose(p, q, s); inst.setMatrixAt(i++, m);
      }
    }
    inst.count = i;
    inst.instanceMatrix.needsUpdate = true;
    this.group.add(inst);
    return inst;
  }

  // 組み替わる壁(見ていない間に現れたり消えたりする)
  addShiftWall(tx, ty) {
    const b = newB();
    const T = this.T;
    for (const [dx, dy] of DIRS) {
      if (this.tileAt(tx - dx, ty - dy) !== FLOOR) continue;
      // 隣の床タイルから見た面 = このタイルの外側の面
      this.pushWallFace(b, tx - dx, ty - dy, dx, dy, 2, 0);
    }
    const mesh = new THREE.Mesh(toGeom(b), this.materials.wall);
    mesh.visible = false;
    this.group.add(mesh);
    const idx = ty * this.map.W + tx;
    return {
      tx, ty, mesh, closed: false,
      set: (closed) => { mesh.visible = closed; if (closed) this.dyn.add(idx); else this.dyn.delete(idx); },
      center: new THREE.Vector3((tx + 0.5) * T, 1.5, (ty + 0.5) * T),
    };
  }

  // ノークリップできる「ちらつく壁」
  addGlitchWall(face) {
    const p = this.facePos(face, 0.01);
    const tex = this.tex.wall;
    const l = this.lightAt3(p.x - face.dx * 0.3, 1.5, p.z - face.dy * 0.3, -face.dx, 0, -face.dy);
    const light = this.lampColor.clone().multiplyScalar(Math.max(0.35, l[0] + l[1] + l[2] + l[3] + this.def.ambient));
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: tex }, time: { value: 0 }, amount: { value: 0.3 }, light: { value: light } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `
        uniform sampler2D map; uniform float time, amount; uniform vec3 light; varying vec2 vUv;
        float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
        void main(){
          vec2 uv = vUv * vec2(${(this.T / 2).toFixed(2)}, 1.0);
          float band = floor(vUv.y * 24.0 + time * 3.0);
          float j = (h(vec2(band, floor(time * 14.0))) - 0.5) * 0.12 * amount;
          uv.x += j;
          vec3 c = texture2D(map, uv).rgb;
          c.r = texture2D(map, uv + vec2(0.01 * amount, 0.0)).r;
          c.b = texture2D(map, uv - vec2(0.01 * amount, 0.0)).b;
          float flick = step(0.5 + 0.45 * (1.0 - amount), h(vec2(floor(time * 9.0), 1.0)));
          c *= light * (1.0 - flick * 0.7 * amount);
          c += (h(vUv * 300.0 + time) - 0.5) * 0.04 * amount;
          gl_FragColor = vec4(pow(c, vec3(1.0)), 1.0);
          #include <colorspace_fragment>
        }`,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(this.T, this.H), mat);
    mesh.position.set(p.x, this.H / 2, p.z);
    mesh.lookAt(p.x - face.dx, this.H / 2, p.z - face.dy);
    this.group.add(mesh);
    return { mesh, mat, face, pos: p };
  }

  /* ---------- 当たり判定 ---------- */
  collide(pos, r) {
    const T = this.T;
    const [tx, ty] = this.toTile(pos.x, pos.z);
    for (let j = ty - 1; j <= ty + 1; j++) for (let i = tx - 1; i <= tx + 1; i++) {
      if (!this.solid(i, j)) continue;
      let minX = i * T, maxX = minX + T, minZ = j * T, maxZ = minZ + T;
      const pr = this.tileAt(i, j) === PROP ? this.map.props.get(j * this.map.W + i) : null;
      if (pr) { const k = PROP_KINDS[pr.kind] || {}; const ins = Math.max(0, (k.size ? (T - k.size) / 2 : k.inset || 0) - 0.05); minX += ins; maxX -= ins; minZ += ins; maxZ -= ins; }
      const cx = Math.max(minX, Math.min(pos.x, maxX)), cz = Math.max(minZ, Math.min(pos.z, maxZ));
      const dx = pos.x - cx, dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        if (d2 === 0) { pos.x += r; continue; }
        const d = Math.sqrt(d2);
        pos.x += (dx / d) * (r - d); pos.z += (dz / d) * (r - d);
      }
    }
    for (const c of this.colliders) {
      const dx = pos.x - c.x, dz = pos.z - c.z, d = Math.hypot(dx, dz), R = c.r + r;
      if (d < R && d > 1e-4) { pos.x = c.x + dx / d * R; pos.z = c.z + dz / d * R; }
    }
  }

  // 動かせる小物(補給箱・給水器など)
  addBoxProp(x, z, { size = 0.9, h = 0.9, tex = 'crate', r = null } = {}) {
    const mat = this.litMaterial(getDecal(tex), { transparent: false, sample: { x, z } });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(size, h, size), mat);
    mesh.position.set(x, h / 2, z);
    this.group.add(mesh);
    const col = { x, z, r: r ?? size * 0.6 };
    this.colliders.push(col);
    this.dirty = true;
    const deco = this.decals[this.decals.length - 1];
    return {
      mesh, col,
      moveTo: (nx, nz) => {
        mesh.position.x = col.x = nx; mesh.position.z = col.z = nz;
        deco.l = this.lightAt3(nx, 1.3, nz, 0, 0.5, 0); this.dirty = true;
      },
      remove: () => { this.group.remove(mesh); this.colliders.splice(this.colliders.indexOf(col), 1); },
    };
  }

  distanceField(tx, ty) {
    const W = this.map.W;
    return bfs(this.map.tiles, W, this.map.H, tx, ty, this.dyn.size ? (n) => this.dyn.has(n) : null);
  }

  /* ---------- 毎フレーム ---------- */
  update(dt, playerPos, time) {
    let dirtyColors = false;
    const near = this.flickerLamps
      .map(l => ({ l, d: Math.hypot((l.x + 0.5) * this.T - playerPos.x, (l.y + 0.5) * this.T - playerPos.z) }))
      .sort((a, b) => a.d - b.d);
    for (const l of this.flickerLamps) {
      const seed = l.x * 13.1 + l.y * 7.7;
      const n = Math.sin(time * 23 + seed) * Math.sin(time * 7.3 + seed * 2) + Math.sin(time * 1.3 + seed);
      const s = this.circuit['xyzw'[l.circuit || 0]];
      const on = n > -0.3 && s > 0.3 ? 1 : 0;
      if (l.on !== on) { l.on = on; this.lampMesh.setColorAt(l.index, on ? this.lampOn : this.lampOff); dirtyColors = true; }
    }
    this.flickerPool.forEach((pl, i) => {
      const e = near[i];
      if (!e || e.d > 22) { pl.userData.active = false; pl.intensity = 0; return; }
      pl.userData.active = true;
      pl.position.copy(this.lampPos(e.l)); pl.position.y -= 0.3;
      pl.intensity = e.l.on ? 12 * this.def.lamp.intensity : 0;
    });
    if (this.dirty) {
      this.dirty = false;
      for (const l of this.map.lamps) if (l.state !== 'flicker') this.lampMesh.setColorAt(l.index, this.lampColorFor(l));
      dirtyColors = true;
      const c = this.circuit, sp = this.uniforms.specialScale.value, a = this.def.ambient;
      for (const d of this.decals) {
        const v = d.l[0] * c.x + d.l[1] * c.y + d.l[2] * c.z + d.l[3] * c.w + a;
        d.mat.emissive.setRGB(this.lampColor.r * v + d.l[4] * sp, this.lampColor.g * v + d.l[5] * sp, this.lampColor.b * v + d.l[6] * sp);
      }
    }
    if (dirtyColors && this.lampMesh.instanceColor) this.lampMesh.instanceColor.needsUpdate = true;
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose());
    });
  }
}

function newB() { return { pos: [], nrm: [], uv: [], b4: [], bc: [], idx: [] }; }
function toGeom(b) {
  if (!b.pos.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
  g.setAttribute('bake4', new THREE.Float32BufferAttribute(b.b4, 4));
  g.setAttribute('bakeC', new THREE.Float32BufferAttribute(b.bc, 3));
  g.setIndex(b.idx);
  g.computeBoundingSphere();
  return g;
}
