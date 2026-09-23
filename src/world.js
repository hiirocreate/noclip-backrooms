// マップ → 3Dメッシュ構築、焼き込みライティング、当たり判定
import * as THREE from 'three';
import { FLOOR, WALL, PILLAR, bfs } from './mapgen.js';
import { getTextures, getCommon } from './textures.js';

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export class World {
  constructor(scene, cfg, map) {
    this.scene = scene;
    this.cfg = cfg;
    this.map = map;
    this.T = cfg.tile;
    this.H = cfg.height;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.bake = { value: 1 };
    this.tex = getTextures(cfg.theme);
    this.common = getCommon();
    this.lampColor = new THREE.Color(...cfg.lamp.color);
    this.bakedLamps = map.lamps.filter(l => l.state === 'on');
    this.flickerLamps = map.lamps.filter(l => l.state === 'flicker');
    this.buildLightGrid();
    this.buildGeometry();
    this.buildLamps();
    this.buildDoor();
    if (cfg.theme === 'pipes') this.buildPipes();
    this.flickerTime = 0;
    this.blackout = 0; // 0..1
  }

  /* ---------- 座標変換 ---------- */
  tileCenter(tx, ty) { return new THREE.Vector3((tx + 0.5) * this.T, 0, (ty + 0.5) * this.T); }
  toTile(x, z) { return [Math.floor(x / this.T), Math.floor(z / this.T)]; }
  tileAt(tx, ty) {
    const { W, H, tiles } = this.map;
    if (tx < 0 || ty < 0 || tx >= W || ty >= H) return WALL;
    return tiles[ty * W + tx];
  }
  solid(tx, ty) { return this.tileAt(tx, ty) !== FLOOR; }

  /* ---------- 視線判定 (2Dグリッド DDA) ---------- */
  los(x0, z0, x1, z1) {
    const T = this.T;
    let tx = Math.floor(x0 / T), ty = Math.floor(z0 / T);
    const ex = Math.floor(x1 / T), ey = Math.floor(z1 / T);
    if (this.solid(tx, ty)) return false;
    const dx = x1 - x0, dz = z1 - z0;
    const sx = dx > 0 ? 1 : -1, sy = dz > 0 ? 1 : -1;
    const tdx = dx !== 0 ? Math.abs(T / dx) : Infinity;
    const tdy = dz !== 0 ? Math.abs(T / dz) : Infinity;
    let tmx = dx !== 0 ? ((sx > 0 ? (tx + 1) * T : tx * T) - x0) / dx : Infinity;
    let tmy = dz !== 0 ? ((sy > 0 ? (ty + 1) * T : ty * T) - z0) / dz : Infinity;
    const n = Math.abs(ex - tx) + Math.abs(ey - ty);
    for (let i = 0; i < n; i++) {
      if (tmx < tmy) { tmx += tdx; tx += sx; } else { tmy += tdy; ty += sy; }
      if (this.solid(tx, ty)) return false;
    }
    return true;
  }

  /* ---------- 焼き込みライト ---------- */
  lampPos(l) { return new THREE.Vector3((l.x + 0.5) * this.T, this.H - 0.05, (l.y + 0.5) * this.T); }

  lightAt3(x, y, z, nx, ny, nz, lamps = this.bakedLamps) {
    const R = this.cfg.lamp.radius, I = this.cfg.lamp.intensity;
    let s = 0;
    for (const l of lamps) {
      const lx = (l.x + 0.5) * this.T, lz = (l.y + 0.5) * this.T, ly = this.H - 0.05;
      const dx = lx - x, dy = ly - y, dz = lz - z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d >= R) continue;
      if (!this.los(lx, lz, x + nx * 0.05, z + nz * 0.05)) continue;
      const f = Math.pow(1 - d / R, 2);
      const cos = Math.max(0, (dx * nx + dy * ny + dz * nz) / (d + 1e-4));
      // 下向き照明: 真下ほど明るい
      const down = Math.max(0.15, dy / (d + 1e-4));
      s += I * f * (0.3 + 0.7 * cos) * (0.35 + 0.65 * down);
    }
    return s;
  }

  buildLightGrid() {
    const { W, H } = this.map;
    this.lightGrid = new Float32Array(W * H);
    for (let ty = 0; ty < H; ty++) for (let tx = 0; tx < W; tx++) {
      if (this.solid(tx, ty)) continue;
      const x = (tx + 0.5) * this.T, z = (ty + 0.5) * this.T;
      this.lightGrid[ty * W + tx] = this.lightAt3(x, 1.2, z, 0, 1, 0);
    }
  }

  // ゲームプレイ用：その地点の明るさ(0〜) ※停電・点滅を反映
  lightAt(x, z) {
    const [tx, ty] = this.toTile(x, z);
    const base = this.lightGrid[ty * this.map.W + tx] || 0;
    let f = 0;
    for (const p of this.flickerPool || []) {
      if (!p.userData.active) continue;
      const d = Math.hypot(p.position.x - x, p.position.z - z);
      if (d < 7) f += (p.intensity / 12) * (1 - d / 7);
    }
    return base * (1 - this.blackout) + f;
  }

  /* ---------- メッシュ ---------- */
  makeMaterial(map, { bump = 0.02, repeat = null } = {}) {
    const m = new THREE.MeshLambertMaterial({ map, bumpMap: map, bumpScale: bump });
    const bake = this.bake;
    m.onBeforeCompile = (sh) => {
      sh.uniforms.bakeScale = bake;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec3 bake;\nvarying vec3 vBake;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBake = bake;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vBake;\nuniform float bakeScale;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vBake * bakeScale;');
    };
    return m;
  }

  buildGeometry() {
    const T = this.T, Hh = this.H, { W, H } = this.map;
    const amb = this.cfg.ambient;
    const col = this.lampColor;
    const builders = { floor: newB(), ceil: newB(), wall: newB(), pillar: newB() };
    const S = 2; // 分割数
    const fScale = this.cfg.theme === 'pipes' ? 1.6 : 2.4;
    const wScale = 2.0;

    const bakeVal = (x, y, z, nx, ny, nz, mul = 1) => {
      const l = this.lightAt3(x, y, z, nx, ny, nz) * mul + amb;
      return [l * col.r, l * col.g, l * col.b];
    };

    for (let ty = 0; ty < H; ty++) for (let tx = 0; tx < W; tx++) {
      if (this.solid(tx, ty)) continue;
      const x0 = tx * T, z0 = ty * T;
      // 床・天井
      for (const [b, y, ny] of [[builders.floor, 0, 1], [builders.ceil, Hh, -1]]) {
        const base = b.pos.length / 3;
        for (let j = 0; j <= S; j++) for (let i = 0; i <= S; i++) {
          const x = x0 + (i / S) * T, z = z0 + (j / S) * T;
          b.pos.push(x, y, z); b.nrm.push(0, ny, 0); b.uv.push(x / fScale, z / fScale);
          // サンプル位置を少し内側へ(壁際の遮蔽誤判定を防ぐ)
          const sx = x0 + (0.02 + 0.96 * i / S) * T, sz = z0 + (0.02 + 0.96 * j / S) * T;
          b.bake.push(...bakeVal(sx, y, sz, 0, ny, 0, ny > 0 ? 1 : 0.55));
        }
        for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
          const a = base + j * (S + 1) + i, bb = a + 1, c = a + S + 1, d = c + 1;
          if (ny > 0) b.idx.push(a, c, bb, bb, c, d); else b.idx.push(a, bb, c, bb, d, c);
        }
      }
      // 壁
      for (const [dx, dy] of DIRS) {
        const nt = this.tileAt(tx + dx, ty + dy);
        if (nt === FLOOR) continue;
        const b = nt === PILLAR ? builders.pillar : builders.wall;
        // 面の位置: タイル境界、法線はこのタイル側(-dx,-dy)
        const nx = -dx, nz = -dy;
        let ax, az, bx, bz; // 左端→右端(内側から見て)
        const cx = x0 + T / 2 + dx * T / 2, cz = z0 + T / 2 + dy * T / 2;
        // 右方向ベクトル = (nz, -nx) を回した向き
        const rx = nz, rz = -nx;
        ax = cx - rx * T / 2; az = cz - rz * T / 2; bx = cx + rx * T / 2; bz = cz + rz * T / 2;
        const base = b.pos.length / 3;
        const VS = 2;
        for (let j = 0; j <= VS; j++) for (let i = 0; i <= S; i++) {
          const t = i / S, y = (j / VS) * Hh;
          const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
          b.pos.push(x, y, z); b.nrm.push(nx, 0, nz);
          const along = Math.abs(rx) > 0.5 ? x : z;
          b.uv.push((along * Math.sign(rx + rz)) / wScale, y / Hh);
          const tt = 0.03 + 0.94 * t;
          const sx = ax + (bx - ax) * tt + nx * 0.05, sz = az + (bz - az) * tt + nz * 0.05;
          b.bake.push(...bakeVal(sx, Math.min(y, Hh - 0.1), sz, nx, 0, nz));
        }
        for (let j = 0; j < VS; j++) for (let i = 0; i < S; i++) {
          const a = base + j * (S + 1) + i, bb = a + 1, c = a + S + 1, d = c + 1;
          b.idx.push(a, bb, c, bb, d, c);
        }
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

  buildLamps() {
    const theme = this.cfg.theme;
    let geo;
    if (theme === 'lobby') geo = new THREE.BoxGeometry(0.62, 0.04, 1.22);
    else if (theme === 'parking') geo = new THREE.BoxGeometry(0.16, 0.1, 1.7);
    else geo = new THREE.SphereGeometry(0.16, 10, 8);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
    const lamps = this.map.lamps;
    this.lampMesh = new THREE.InstancedMesh(geo, mat, lamps.length);
    const m = new THREE.Matrix4();
    this.lampOn = new THREE.Color().copy(this.lampColor).multiplyScalar(2.2);
    this.lampOff = new THREE.Color(0.08, 0.08, 0.07);
    lamps.forEach((l, i) => {
      const p = this.lampPos(l);
      p.y = this.H - (theme === 'pipes' ? 0.25 : 0.02);
      m.makeTranslation(p.x, p.y, p.z);
      this.lampMesh.setMatrixAt(i, m);
      this.lampMesh.setColorAt(i, l.state === 'off' ? this.lampOff : this.lampOn);
      l.index = i;
    });
    this.lampMesh.instanceMatrix.needsUpdate = true;
    this.group.add(this.lampMesh);

    // 点滅灯用の実ライト(近い順に割り当て)
    this.flickerPool = [];
    for (let i = 0; i < 2; i++) {
      const pl = new THREE.PointLight(this.lampColor, 0, this.cfg.lamp.radius * 1.1, 1.6);
      pl.userData.active = false;
      this.group.add(pl);
      this.flickerPool.push(pl);
    }
  }

  buildDoor() {
    const e = this.map.exit;
    const T = this.T;
    const c = this.tileCenter(e.x, e.y);
    // 壁面上の位置
    const face = new THREE.Vector3(c.x + e.dx * T / 2, 0, c.z + e.dy * T / 2);
    const normal = new THREE.Vector3(-e.dx, 0, -e.dy);
    const dw = this.cfg.theme === 'parking' ? 2.2 : 1.3, dh = Math.min(2.3, this.H - 0.3);
    const g = new THREE.Group();
    const doorMat = new THREE.MeshLambertMaterial({ map: this.tex.door, emissive: 0x000000 });
    const door = new THREE.Mesh(new THREE.PlaneGeometry(dw, dh), doorMat);
    door.position.y = dh / 2;
    door.position.z = 0.03;
    g.add(door);
    const frameMat = new THREE.MeshLambertMaterial({ color: 0x2a261e });
    for (const [w, h, x, y] of [[0.12, dh + 0.12, -dw / 2 - 0.06, dh / 2], [0.12, dh + 0.12, dw / 2 + 0.06, dh / 2], [dw + 0.24, 0.12, 0, dh + 0.06]]) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.12), frameMat);
      f.position.set(x, y, 0.04); g.add(f);
    }
    const signW = 0.9;
    this.signLocked = new THREE.MeshBasicMaterial({ map: this.common.signLocked(this.cfg.exitName), fog: false });
    this.signOpen = new THREE.MeshBasicMaterial({ map: this.common.signOpen(this.cfg.exitName), fog: false });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(signW, signW / 4), this.signLocked);
    sign.position.set(0, dh + 0.35, 0.05);
    g.add(sign);
    g.position.copy(face);
    g.lookAt(face.clone().add(normal));
    this.group.add(g);
    this.door = { group: g, sign, mat: doorMat, pos: face.clone().addScaledVector(normal, 0.6), normal };
    // 扉の赤いランプ光
    this.doorLight = new THREE.PointLight(0xff2a1a, 1.2, 6, 1.5);
    this.doorLight.position.copy(face).addScaledVector(normal, 0.4);
    this.doorLight.position.y = dh + 0.3;
    this.group.add(this.doorLight);
  }

  unlockDoor() {
    this.door.sign.material = this.signOpen;
    this.doorLight.color.set(0x2aff6a);
    this.doorLight.intensity = 2.2;
    this.door.mat.emissive.set(0x0c1a10);
  }

  buildPipes() {
    // 壁沿いの配管(装飾)
    const T = this.T, { W, H } = this.map;
    const segs = [];
    for (let ty = 0; ty < H; ty++) for (let tx = 0; tx < W; tx++) {
      if (this.solid(tx, ty)) continue;
      for (const [dx, dy] of DIRS) {
        if (this.tileAt(tx + dx, ty + dy) !== WALL) continue;
        const cx = (tx + 0.5) * T + dx * (T / 2 - 0.16), cz = (ty + 0.5) * T + dy * (T / 2 - 0.16);
        segs.push({ cx, cz, horiz: dy !== 0 });
      }
    }
    const heights = [[this.H - 0.35, 0.11], [this.H - 0.62, 0.07], [0.35, 0.09]];
    const geo = new THREE.CylinderGeometry(1, 1, T + 0.02, 8, 1, true);
    const mat = new THREE.MeshLambertMaterial({ color: 0x6a5446, emissive: 0x1a0804 });
    const count = segs.length * heights.length;
    const inst = new THREE.InstancedMesh(geo, mat, count);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    let i = 0;
    for (const sg of segs) for (const [y, r] of heights) {
      q.setFromEuler(new THREE.Euler(sg.horiz ? 0 : Math.PI / 2, 0, sg.horiz ? Math.PI / 2 : 0));
      s.set(r, 1, r); p.set(sg.cx, y, sg.cz);
      m.compose(p, q, s); inst.setMatrixAt(i++, m);
    }
    inst.instanceMatrix.needsUpdate = true;
    this.group.add(inst);
  }

  /* ---------- 当たり判定 ---------- */
  collide(pos, r) {
    const T = this.T;
    const [tx, ty] = this.toTile(pos.x, pos.z);
    for (let j = ty - 1; j <= ty + 1; j++) for (let i = tx - 1; i <= tx + 1; i++) {
      if (!this.solid(i, j)) continue;
      const minX = i * T, maxX = minX + T, minZ = j * T, maxZ = minZ + T;
      const cx = Math.max(minX, Math.min(pos.x, maxX)), cz = Math.max(minZ, Math.min(pos.z, maxZ));
      const dx = pos.x - cx, dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        const d = Math.sqrt(d2) || 0.0001;
        if (d2 === 0) { pos.x += r; continue; }
        pos.x += (dx / d) * (r - d); pos.z += (dz / d) * (r - d);
      }
    }
  }

  distanceField(tx, ty) { return bfs(this.map.tiles, this.map.W, this.map.H, tx, ty); }

  /* ---------- 毎フレーム ---------- */
  update(dt, playerPos, time) {
    // 点滅灯
    this.flickerTime += dt;
    const near = this.flickerLamps
      .map(l => ({ l, d: Math.hypot((l.x + 0.5) * this.T - playerPos.x, (l.y + 0.5) * this.T - playerPos.z) }))
      .sort((a, b) => a.d - b.d);
    let dirty = false;
    for (const l of this.flickerLamps) {
      const seed = l.x * 13.1 + l.y * 7.7;
      const n = Math.sin(time * 23 + seed) * Math.sin(time * 7.3 + seed * 2) + Math.sin(time * 1.3 + seed);
      const on = (n > -0.3 ? 1 : 0) * (1 - this.blackout);
      if (l.on !== on) { l.on = on; this.lampMesh.setColorAt(l.index, on ? this.lampOn : this.lampOff); dirty = true; }
    }
    this.flickerPool.forEach((pl, i) => {
      const e = near[i];
      // ※visibleを切り替えるとシェーダ再コンパイルが走るので intensity で制御
      if (!e || e.d > 22) { pl.userData.active = false; pl.intensity = 0; return; }
      pl.userData.active = true;
      pl.position.copy(this.lampPos(e.l)); pl.position.y -= 0.3;
      pl.intensity = e.l.on ? 12 * this.cfg.lamp.intensity : 0;
    });
    // 停電演出
    if (this._lastBlack !== this.blackout) {
      this.bake.value = 1 - this.blackout * 0.93;
      const c = new THREE.Color().copy(this.lampOn).lerp(this.lampOff, this.blackout);
      for (const l of this.map.lamps) if (l.state === 'on') this.lampMesh.setColorAt(l.index, c);
      this._lastBlack = this.blackout; dirty = true;
    }
    if (dirty) this.lampMesh.instanceColor.needsUpdate = true;
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose());
    });
  }
}

function newB() { return { pos: [], nrm: [], uv: [], bake: [], idx: [] }; }
function toGeom(b) {
  if (!b.pos.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
  g.setAttribute('bake', new THREE.Float32BufferAttribute(b.bake, 3));
  g.setIndex(b.idx);
  g.computeBoundingSphere();
  return g;
}
