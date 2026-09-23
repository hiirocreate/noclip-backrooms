// 拾えるもの：鍵アイテム / 電池 / アーモンド水 / メモ
import * as THREE from 'three';

function keyMesh(kind) {
  const g = new THREE.Group();
  if (kind === 'key') {
    const m = new THREE.MeshLambertMaterial({ color: 0xd8b84a, emissive: 0x5a4210 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.022, 6, 14), m); ring.position.y = 0.13; g.add(ring);
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.2, 0.02), m); g.add(shaft);
    const bit = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, 0.02), m); bit.position.set(0.03, -0.08, 0); g.add(bit);
    const bit2 = bit.clone(); bit2.position.y = -0.03; g.add(bit2);
  } else if (kind === 'fuse') {
    const glass = new THREE.MeshLambertMaterial({ color: 0x9fd8ff, emissive: 0x1a4a6a, transparent: true, opacity: 0.85 });
    const metal = new THREE.MeshLambertMaterial({ color: 0xc0c0c0, emissive: 0x303030 });
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.2, 10), glass); g.add(b);
    for (const y of [0.11, -0.11]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 10), metal); c.position.y = y; g.add(c); }
    g.rotation.z = Math.PI / 2;
  } else {
    const m = new THREE.MeshLambertMaterial({ color: 0xc23a22, emissive: 0x4a0a04 });
    const w = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.022, 6, 16), m); g.add(w);
    for (let i = 0; i < 3; i++) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.02, 0.02), m); s.rotation.z = (i * Math.PI) / 3; g.add(s); }
  }
  return g;
}

function batteryMesh() {
  const g = new THREE.Group();
  const b = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.13, 10), new THREE.MeshLambertMaterial({ color: 0x2a6a3a, emissive: 0x0a2010 }));
  const t = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.03, 10), new THREE.MeshLambertMaterial({ color: 0xd0a030, emissive: 0x302000 }));
  t.position.y = 0.07; g.add(b); g.add(t);
  return g;
}
function waterMesh() {
  const g = new THREE.Group();
  const b = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.24, 10), new THREE.MeshLambertMaterial({ color: 0xf0e8d0, emissive: 0x3a3428, transparent: true, opacity: 0.9 }));
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.05, 0.06, 10), b.material); neck.position.y = 0.15;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.03, 8), new THREE.MeshLambertMaterial({ color: 0x3060c0, emissive: 0x0a1a40 })); cap.position.y = 0.195;
  const label = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.062, 0.08, 10), new THREE.MeshLambertMaterial({ color: 0xb08a50, emissive: 0x2a2010 }));
  g.add(b, neck, cap, label);
  return g;
}
function noteMesh() {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.34), new THREE.MeshLambertMaterial({ color: 0xe8e0c0, emissive: 0x2a2820, side: THREE.DoubleSide }));
  m.rotation.x = -Math.PI / 2;
  const g = new THREE.Group(); g.add(m);
  return g;
}

export class Items {
  constructor(game) {
    this.game = game;
    this.list = [];
    const w = game.world, map = w.map, halo = w.common.halo;
    let itemIndex = 0;
    const add = (p, type, mesh, color, extra = {}) => {
      const id = `${type}-${itemIndex++}`;
      // 自動セーブから再開した場合、既に拾った消耗品や鍵は復活させない。
      if (game.collected?.has(id)) return;
      const c = w.tileCenter(p.x, p.y);
      c.x += (Math.random() - 0.5) * w.T * 0.4; c.z += (Math.random() - 0.5) * w.T * 0.4;
      const g = new THREE.Group();
      g.add(mesh);
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: halo, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.55 }));
      s.scale.setScalar(type === 'key' ? 0.9 : 0.5);
      g.add(s);
      g.position.set(c.x, type === 'note' ? 0.01 : 0.55, c.z);
      if (type === 'note') { s.position.y = 0.05; s.material.opacity = 0.25; }
      game.scene.add(g);
      this.list.push({ id, type, g, mesh, pos: c, alive: true, phase: Math.random() * 6, ...extra });
    };
    const keyColor = { key: 0xffd26a, fuse: 0x7ac8ff, valve: 0xff5a3a }[game.cfg.key.kind];
    for (const p of map.keys) add(p, 'key', keyMesh(game.cfg.key.kind), keyColor);
    for (const p of map.pickups) add(p, p.kind, p.kind === 'battery' ? batteryMesh() : waterMesh(), p.kind === 'battery' ? 0x80ff90 : 0xfff0c0);
    for (const p of map.notes) add(p, 'note', noteMesh(), 0xffffff, { note: p.note });
  }

  update(dt, t) {
    const p = this.game.player.pos;
    for (const it of this.list) {
      if (!it.alive) continue;
      if (it.type !== 'note') {
        it.mesh.rotation.y += dt * 1.2;
        it.g.position.y = 0.55 + Math.sin(t * 2 + it.phase) * 0.06;
      }
      const d = Math.hypot(p.x - it.pos.x, p.z - it.pos.z);
      if (d < 1.0) this.collect(it);
    }
  }

  collect(it) {
    it.alive = false;
    this.game.scene.remove(it.g);
    this.game.onPickup(it);
  }

  dispose() { for (const it of this.list) this.game.scene.remove(it.g); this.list = []; }
}
