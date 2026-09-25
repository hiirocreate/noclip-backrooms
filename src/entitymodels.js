// 「何か」たちの3Dモデル。画像ファイルを使わず、なめらかな回転体(旋盤)と頂点の歪みで
// 痩せた人影・猟犬・蜘蛛の体を作る。関節ごとに Group を分けてあり、entities.js から動かす
import * as THREE from 'three';

/* ---------------- 共通 ---------------- */
// 連続した擬似ノイズ(同じ位置なら同じ値。継ぎ目で割れない)
function noise3(x, y, z) {
  return (Math.sin(x * 12.9 + y * 4.1) * Math.sin(y * 7.3 + z * 11.7) + Math.sin(z * 9.1 + x * 5.3) * 0.5) / 1.5;
}

// 旋盤(回転体)：profile = [[半径, y], ...] を y 軸まわりに回す。y は 0 から下(負)へ
function lathe(profile, seg = 10, rows = 0) {
  let pts = profile.map(([r, y]) => new THREE.Vector2(Math.max(0.0015, r), y));
  // 細かい凹凸(肋骨など)を刻めるよう、輪郭をなめらかに補間して行を増やす
  if (rows) pts = new THREE.SplineCurve(pts).getSpacedPoints(rows).map(p => new THREE.Vector2(Math.max(0.0015, p.x), p.y));
  return new THREE.LatheGeometry(pts, seg);
}

// 両端が丸く閉じた、太さの変わる手足
function limbGeo(len, r0, r1, { seg = 9, bulge = 0, bulgeAt = 0.5, steps = 12, flat = 1 } = {}) {
  return ensureGeo(limbGeoRaw(len, r0, r1, { seg, bulge, bulgeAt, steps, flat }));
}
function ensureGeo(g) { ensureColor(g); return g; }
function limbGeoRaw(len, r0, r1, { seg, bulge, bulgeAt, steps, flat }) {
  const prof = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    let r = r0 + (r1 - r0) * t + bulge * Math.exp(-((t - bulgeAt) ** 2) / 0.012);
    const e = Math.min(t, 1 - t) / 0.07;
    if (e < 1) r *= Math.sqrt(Math.max(0, Math.sin(Math.min(1, e) * Math.PI / 2)));
    prof.push([r, -t * len]);
  }
  const g = lathe(prof, seg);
  if (flat !== 1) g.scale(1, 1, flat);
  return g;
}

// 頂点を法線方向にゆがませる(皮膚の凹凸・肋骨・背骨)
// くぼんだ所ほど頂点色を暗くして、影(簡易アンビエントオクルージョン)を焼き込む
function displace(geo, fn, ao = 14) {
  const p = geo.attributes.position;
  geo.computeVertexNormals();
  const n = geo.attributes.normal;
  const col = ensureColor(geo);
  const v = new THREE.Vector3(), nv = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i); nv.fromBufferAttribute(n, i);
    const d = fn(v, nv) || 0;
    if (d) p.setXYZ(i, v.x + nv.x * d, v.y + nv.y * d, v.z + nv.z * d);
    const c = Math.max(0.15, Math.min(1, col.getX(i) + Math.min(0, d) * ao * 1.6 + Math.max(0, d) * ao * 0.15));
    col.setXYZ(i, c, c, c);
  }
  p.needsUpdate = true; col.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

function ensureColor(geo) {
  if (!geo.attributes.color) {
    const n = geo.attributes.position.count;
    geo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  }
  return geo.attributes.color;
}

// 指定した場所を暗くする(眼窩・口の奥など)
function shade(geo, fn) {
  const p = geo.attributes.position, col = ensureColor(geo), v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const k = fn(v);
    if (k) { const c = Math.max(0.05, col.getX(i) * (1 - k)); col.setXYZ(i, c, c, c); }
  }
  col.needsUpdate = true;
  return geo;
}

const skin = (amt = 0.006, f = 1) => (v) => noise3(v.x * 9 * f, v.y * 9 * f, v.z * 9 * f) * amt;

/* ---------------- 皮膚の質感 ---------------- */
const texCache = {};
function skinTexture(kind = 'skin') {
  if (texCache[kind]) return texCache[kind];
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const ctx = c.getContext('2d');
  let s = 91;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  ctx.fillStyle = '#9a9a9a'; ctx.fillRect(0, 0, 256, 256);
  // まだら
  for (let i = 0; i < 70; i++) {
    const x = rnd() * 256, y = rnd() * 256, r = 8 + rnd() * 40;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const v = rnd() < 0.5 ? '40,40,40' : '200,200,200';
    g.addColorStop(0, `rgba(${v},${0.12 + rnd() * 0.15})`); g.addColorStop(1, `rgba(${v},0)`);
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  if (kind === 'skin') {
    // 血管のような細い線
    ctx.strokeStyle = 'rgba(30,30,30,0.35)';
    for (let i = 0; i < 18; i++) {
      ctx.lineWidth = 0.6 + rnd() * 1.2;
      ctx.beginPath(); let x = rnd() * 256, y = rnd() * 256; ctx.moveTo(x, y);
      for (let k = 0; k < 8; k++) { x += (rnd() - 0.5) * 30; y += rnd() * 22; ctx.lineTo(x, y); }
      ctx.stroke();
    }
  } else if (kind === 'hair') {
    // 蜘蛛の短い剛毛
    for (let i = 0; i < 2600; i++) {
      const x = rnd() * 256, y = rnd() * 256, a = -Math.PI / 2 + (rnd() - 0.5) * 0.8, l = 3 + rnd() * 6;
      ctx.strokeStyle = rnd() < 0.5 ? 'rgba(20,20,20,0.5)' : 'rgba(210,200,180,0.25)'; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke();
    }
  } else if (kind === 'cloth') {
    for (let y = 0; y < 256; y += 2) { ctx.fillStyle = `rgba(0,0,0,${0.03 + rnd() * 0.05})`; ctx.fillRect(0, y, 256, 1); }
  }
  // 細かい毛穴
  const img = ctx.getImageData(0, 0, 256, 256), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (rnd() - 0.5) * 26; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  texCache[kind] = t;
  return t;
}

// 皮膚のマテリアル。輪郭にかすかな光(リムライト)を足して、暗がりでも体の形が浮かぶようにする
export function skinMaterial(color, { rim = 0x1c1a18, rimPow = 2.6, kind = 'skin', bump = 0.018, emissive = 0x000000, transparent = false, opacity = 1 } = {}) {
  const tex = skinTexture(kind);
  const m = new THREE.MeshLambertMaterial({ color, map: tex, bumpMap: tex, bumpScale: bump, emissive, transparent, opacity, vertexColors: true });
  const rimCol = new THREE.Color(rim);
  m.userData.rim = rimCol;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.rimColor = { value: rimCol };
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 rimColor;')
      .replace('#include <opaque_fragment>', `outgoingLight += rimColor * pow(1.0 - clamp(abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0), ${rimPow.toFixed(2)});\n#include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => `rim${rimPow}`;
  return m;
}

const boneMaterial = () => new THREE.MeshLambertMaterial({ color: 0xcfc2a4, emissive: 0x1a160e });

/* ---------------- 人型 ---------------- */
// 体型のプリセット(身長 2.7 の座標系。実際の大きさは entities.js で縮める)
export const BODY = {
  // 徘徊者：異様に細長い手足と指
  tall: { key: 'tall', shoulderY: 2.13, shoulderX: 0.2, hipY: 1.13, hipX: 0.075, upper: 0.62, fore: 0.6, hand: 0.11, finger: 0.24, fingerR: 0.011, thigh: 0.56, shin: 0.55, armR: 0.04, legR: 0.058, chest: 0.155, waist: 0.068, hips: 0.1, torsoLen: 1.0, neck: 0.2, headR: 0.15, headLong: 1.4, sockets: true, ribs: 0.016 },
  // ボイラー室の主：肩幅が広く、太い腕の猫背
  bulky: { key: 'bulky', shoulderY: 2.05, shoulderX: 0.34, hipY: 1.05, hipX: 0.13, upper: 0.56, fore: 0.58, hand: 0.16, finger: 0.16, fingerR: 0.022, thigh: 0.52, shin: 0.52, armR: 0.09, legR: 0.1, chest: 0.3, waist: 0.21, hips: 0.19, torsoLen: 1.0, neck: 0.06, headR: 0.16, headLong: 1.1, sockets: true, ribs: 0.004, hunch: 0.6, shoulderK: 1.02, hump: 0.07 },
  // 顔のない住人：ふつうの人の比率
  human: { key: 'human', shoulderY: 2.2, shoulderX: 0.27, hipY: 1.36, hipX: 0.1, upper: 0.48, fore: 0.44, hand: 0.13, finger: 0.1, fingerR: 0.016, thigh: 0.68, shin: 0.64, armR: 0.06, legR: 0.085, chest: 0.2, waist: 0.15, hips: 0.17, torsoLen: 0.9, neck: 0.12, headR: 0.17, headLong: 1.25, sockets: false, ribs: 0, cloth: true },
  // ダラー：なめらかで特徴のない灰色の人影
  smooth: { key: 'smooth', shoulderY: 2.13, shoulderX: 0.23, hipY: 1.13, hipX: 0.085, upper: 0.6, fore: 0.58, hand: 0.11, finger: 0.2, fingerR: 0.012, thigh: 0.56, shin: 0.55, armR: 0.045, legR: 0.065, chest: 0.16, waist: 0.09, hips: 0.12, torsoLen: 1.0, neck: 0.2, headR: 0.15, headLong: 1.35, sockets: false, ribs: 0 },
};

const geoCache = {};
function humanoidGeos(b) {
  if (geoCache[b.key]) return geoCache[b.key];
  const G = {};
  // 胴体(首の付け根 y=0 から股まで)。前後に薄く、肋骨と背骨が浮く
  const L = b.torsoLen;
  G.torso = lathe([
    [0.001, 0.02], [b.chest * 0.5, 0], [b.chest * (b.shoulderK || 1.3), -0.07 * L], [b.chest * 1.12, -0.2 * L], [b.chest * 0.95, -0.4 * L],
    [b.waist, -0.62 * L], [b.hips * 0.88, -0.77 * L], [b.hips, -0.85 * L], [b.hips * 0.72, -0.93 * L], [0.001, -0.97 * L],
  ], 26, 64);
  G.torso.scale(1.25, 1, 0.72);
  const g2 = (x, w) => Math.exp(-(x * x) / (w * w));
  displace(G.torso, (v) => {
    let d = skin(0.004)(v);
    const ax = Math.abs(v.x);
    if (b.ribs) {
      // 肋骨：脇へ向かって下がる弧。溝は暗くなる
      if (v.y < -0.1 * L && v.y > -0.56 * L && v.z > -0.03) d += b.ribs * 1.6 * (Math.sin((v.y + ax * 0.45) * 50) * 0.5 + 0.2) * Math.min(1, ax * 16);
      if (v.z > 0) d += 0.006 * g2(v.x, 0.012) * (v.y < -0.06 * L && v.y > -0.45 * L ? 1 : 0); // 胸骨
      if (v.z > 0) d += 0.014 * g2(v.y + 0.035 * L, 0.02) * Math.min(1, ax * 10);         // 鎖骨
      if (v.z > -0.01) d -= 0.03 * g2(v.y + 0.66 * L, 0.09);                               // 落ちくぼんだ腹
      d += 0.02 * g2(v.y + 0.8 * L, 0.04) * g2(ax - b.hips * 1.05, 0.05) * (v.z > 0 ? 1 : 0.3); // 骨盤の出っぱり
      if (v.z < 0) d += 0.02 * g2(ax - 0.1, 0.05) * g2(v.y + 0.2 * L, 0.1);                  // 肩甲骨
    }
    if (v.z < 0 && ax < 0.03) d += 0.014 * Math.max(0, Math.sin(v.y * 40)); // 背骨
    if (b.hump && v.z < 0) d += b.hump * g2(v.y + 0.18 * L, 0.16) * g2(v.x, 0.2);           // 盛り上がった背中
    return d;
  }, b.ribs ? 34 : 14);
  ensureColor(G.torso);
  G.neck = limbGeo(b.neck + 0.08, b.armR * 0.95, b.armR * 1.15, { seg: 8 });
  // 頭：縦長の頭蓋。眼窩がくぼみ、あごがすぼまる
  const hg = new THREE.SphereGeometry(b.headR, 22, 18);
  const p = hg.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    v.y *= b.headLong;
    const low = Math.max(0, -v.y / (b.headR * b.headLong));
    v.x *= 1 - low * 0.35; v.z *= 1 - low * 0.15;
    if (v.z > 0 && v.y < 0) v.z += low * 0.02; // あご
    if (b.sockets) {
      for (const sx of [-1, 1]) {
        const dx = v.x - sx * b.headR * 0.38, dy = v.y - b.headR * 0.1, dz = v.z - b.headR;
        const dd = Math.sqrt(dx * dx + dy * dy * 0.7 + dz * dz * 0.3);
        v.z -= 0.07 * Math.exp(-(dd * dd) / (b.headR * b.headR * 0.09));
      }
      // 頬骨
      if (v.z > 0) v.x *= 1 + 0.08 * Math.exp(-((v.y + b.headR * 0.12) ** 2) / 0.001);
    }
    p.setXYZ(i, v.x, v.y, v.z);
  }
  hg.computeVertexNormals();
  displace(hg, skin(0.003, 1.5));
  if (b.sockets) {
    const H = b.headR, HL = b.headLong;
    shade(hg, (v) => {
      let k = 0;
      for (const sx of [-1, 1]) { const dx = v.x - sx * H * 0.38, dy = v.y - H * 0.1; if (v.z > 0) k = Math.max(k, Math.exp(-(dx * dx + dy * dy) / (H * H * 0.05)) * 0.9); }
      // 口：細い裂け目 / 頬のくぼみ
      if (v.z > 0) k = Math.max(k, Math.exp(-((v.y + H * HL * 0.48) ** 2) / (H * H * 0.004)) * Math.exp(-(v.x * v.x) / (H * H * 0.12)) * 0.85);
      if (v.z > 0) k = Math.max(k, Math.exp(-((v.y + H * HL * 0.2) ** 2) / (H * H * 0.05)) * Math.exp(-((Math.abs(v.x) - H * 0.55) ** 2) / (H * H * 0.03)) * 0.45);
      return k;
    });
  }
  G.head = hg;
  G.upper = displace(limbGeo(b.upper, b.armR * 1.05, b.armR * 0.8, { bulge: b.armR * 0.25, bulgeAt: 0.15 }), skin(0.003));
  G.fore = displace(limbGeo(b.fore + 0.03, b.armR * 0.85, b.armR * 0.55, { bulge: b.armR * (b.hump ? 0.6 : 0.25), bulgeAt: b.hump ? 0.3 : 0.05 }), skin(0.003));
  G.hand = limbGeo(b.hand, b.armR * 0.6, b.armR * 0.8, { seg: 8, flat: 0.45 });
  G.fing1 = limbGeo(b.finger * 0.55, b.fingerR, b.fingerR * 0.85, { seg: 5, steps: 6, bulge: b.fingerR * 0.3, bulgeAt: 0.95 });
  G.fing2 = limbGeo(b.finger * 0.5, b.fingerR * 0.85, b.fingerR * 0.35, { seg: 5, steps: 6 });
  G.thigh = displace(limbGeo(b.thigh + 0.03, b.legR * 1.15, b.legR * 0.7, { bulge: b.legR * 0.2, bulgeAt: 0.95 }), skin(0.003));
  G.shin = displace(limbGeo(b.shin + 0.02, b.legR * 0.75, b.legR * 0.45, { bulge: b.legR * 0.25, bulgeAt: 0.25 }), skin(0.003));
  G.foot = limbGeo(b.legR * 3.2, b.legR * 0.55, b.legR * 0.4, { seg: 7, flat: 0.5 });
  G.jaw = new THREE.SphereGeometry(b.headR * 0.6, 12, 8, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5);
  G.jaw.scale(1, 0.5, 1.2); ensureColor(G.jaw);
  G.joint = ensureGeo(new THREE.SphereGeometry(1, 10, 8));
  geoCache[b.key] = G;
  return G;
}

/**
 * 人型を組み立てる。返り値の各 Group の rotation を動かしてアニメーションさせる
 * mats: { skin, cloth? }
 */
export function buildHumanoid(b, mats) {
  const G = humanoidGeos(b);
  const group = new THREE.Group();
  const mesh = (geo, mat = mats.skin) => new THREE.Mesh(geo, mat);
  const body = new THREE.Group(); body.position.y = b.hipY; group.add(body);        // 腰(上半身の傾き)
  const spine = new THREE.Group(); body.add(spine);                                   // 腰から上を前後に傾ける
  const chest = new THREE.Group(); chest.position.y = b.shoulderY - b.hipY; spine.add(chest);
  const torso = mesh(G.torso, b.cloth ? mats.cloth : mats.skin);
  torso.scale.y = (b.shoulderY - b.hipY + 0.08) / b.torsoLen;
  torso.position.y = 0.02;
  chest.add(torso);
  const neck = new THREE.Group(); neck.position.set(0, 0.02, 0); chest.add(neck);
  const nm = mesh(G.neck); nm.rotation.x = Math.PI; nm.position.y = -0.04; neck.add(nm);
  const head = new THREE.Group(); head.position.y = b.neck + b.headR * b.headLong * 0.85; neck.add(head);
  const skull = mesh(G.head); head.add(skull);
  const jaw = new THREE.Group(); jaw.position.set(0, -b.headR * b.headLong * 0.55, b.headR * 0.1); head.add(jaw);
  const arms = [], legs = [];
  for (const side of [-1, 1]) {
    // 腕：肩 → 肘 → 手首 → 指
    const shoulder = new THREE.Group(); shoulder.position.set(side * b.shoulderX, -0.08, 0); chest.add(shoulder);
    shoulder.add(mesh(G.upper));
    const elbow = new THREE.Group(); elbow.position.y = -b.upper; shoulder.add(elbow);
    elbow.add(mesh(G.fore));
    const ec = mesh(G.joint); ec.scale.setScalar(b.armR * 0.95); elbow.add(ec);
    const wrist = new THREE.Group(); wrist.position.y = -b.fore; elbow.add(wrist);
    const hand = mesh(G.hand, mats.skin); hand.rotation.y = side * 0.2; wrist.add(hand);
    const fingers = [];
    for (let f = 0; f < 5; f++) {
      const thumb = f === 4;
      const k = new THREE.Group();
      k.position.set(thumb ? side * -0.0 : (f - 1.5) * b.fingerR * 1.9, -b.hand * (thumb ? 0.4 : 1), thumb ? b.fingerR * 2.2 : 0);
      k.rotation.z = thumb ? side * -0.5 : (f - 1.5) * side * 0.06;
      const s = thumb ? 0.6 : f === 1 || f === 2 ? 1 : 0.85;
      const m1 = mesh(G.fing1); m1.scale.set(1, s, 1); k.add(m1);
      const k2 = new THREE.Group(); k2.position.y = -b.finger * 0.55 * s; k.add(k2);
      const m2 = mesh(G.fing2); m2.scale.set(1, s, 1); k2.add(m2);
      wrist.add(k); fingers.push({ k, k2 });
    }
    arms.push({ shoulder, elbow, wrist, fingers });
    // 脚：股関節 → 膝 → 足首
    const hip = new THREE.Group(); hip.position.set(side * b.hipX, 0, 0); body.add(hip);
    hip.add(mesh(G.thigh));
    const knee = new THREE.Group(); knee.position.y = -b.thigh; hip.add(knee);
    knee.add(mesh(G.shin));
    const kc = mesh(G.joint); kc.scale.setScalar(b.legR * 0.85); kc.position.z = b.legR * 0.15; knee.add(kc);
    const ankle = new THREE.Group(); ankle.position.y = -b.shin; knee.add(ankle);
    const foot = mesh(G.foot); foot.rotation.x = -Math.PI / 2; foot.position.set(0, -b.legR * 0.2, -b.legR * 0.6); ankle.add(foot);
    legs.push({ hip, knee, ankle });
  }
  return { group, body, spine, chest, torso, neck, head, skull, jaw, armL: arms[0], armR: arms[1], legL: legs[0], legR: legs[1], geos: G };
}

// 開いた口(下あご)と歯
export function addMouth(rig, b, mats, { teeth = 10, open = 0.3 } = {}) {
  const jawMesh = new THREE.Mesh(rig.geos.jaw, mats.skin);
  rig.jaw.add(jawMesh);
  rig.jaw.rotation.x = open;
  const bm = mats.bone || boneMaterial();
  const tg = new THREE.ConeGeometry(b.headR * 0.045, b.headR * 0.22, 4);
  for (let i = 0; i < teeth; i++) {
    const a = (i / (teeth - 1) - 0.5) * 2.2;
    const up = new THREE.Mesh(tg, bm); up.rotation.x = Math.PI;
    up.position.set(Math.sin(a) * b.headR * 0.5, -b.headR * b.headLong * 0.45, b.headR * 0.15 + Math.cos(a) * b.headR * 0.55);
    rig.head.add(up);
    const lo = new THREE.Mesh(tg, bm);
    lo.position.set(Math.sin(a) * b.headR * 0.45, 0.01, Math.cos(a) * b.headR * 0.5);
    rig.jaw.add(lo);
  }
}

/* ---------------- 猟犬 ---------------- */
const houndGeo = {};
function houndGeos() {
  if (houndGeo.body) return houndGeo;
  // 胴(尻 y=0 → 胸 y=-1.1)。回転させて前後方向にする
  const body = lathe([
    [0.001, 0.02], [0.1, -0.03], [0.16, -0.14], [0.14, -0.3], [0.1, -0.42], [0.12, -0.55], [0.18, -0.7], [0.21, -0.83], [0.17, -0.98], [0.1, -1.07], [0.001, -1.1],
  ], 24, 70);
  body.scale(0.72, 1, 1.15);
  displace(body, (v) => {
    let d = skin(0.006)(v);
    // あばら(脇腹に浮き出る)
    if (v.y < -0.5 && v.y > -0.95 && v.z < 0.08) d += 0.014 * Math.max(0, Math.sin(v.y * 48)) * Math.min(1, Math.abs(v.x) * 10);
    // 背骨のとげ
    if (v.z > 0.1 && Math.abs(v.x) < 0.035) d += 0.03 * Math.max(0, Math.sin(v.y * 32));
    // へこんだ腹
    if (v.z < -0.08 && v.y < -0.35 && v.y > -0.55) d -= 0.02;
    return d;
  });
  houndGeo.body = body;
  houndGeo.neck = displace(limbGeo(0.36, 0.085, 0.06, { seg: 10 }), skin(0.004));
  // 頭蓋：前に長い鼻づら
  const skull = new THREE.SphereGeometry(0.12, 20, 14);
  const p = skull.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    if (v.z > 0) { v.z *= 2.6; const k = v.z / 0.31; v.x *= 1 - k * 0.45; v.y *= 1 - k * 0.4; }
    // 目のくぼみ
    for (const sx of [-1, 1]) { const dx = v.x - sx * 0.07, dy = v.y - 0.04, dz = v.z - 0.06; v.y -= 0.02 * Math.exp(-(dx * dx + dy * dy + dz * dz) / 0.0008); }
    p.setXYZ(i, v.x, v.y, v.z);
  }
  skull.computeVertexNormals();
  houndGeo.skull = displace(skull, skin(0.003, 1.5));
  shade(houndGeo.skull, (v) => { let k = 0; for (const sx of [-1, 1]) { const dx = v.x - sx * 0.07, dy = v.y - 0.035, dz = v.z - 0.06; k = Math.max(k, Math.exp(-(dx * dx + dy * dy + dz * dz) / 0.0012) * 0.9); } return k; });
  const jaw = new THREE.SphereGeometry(0.08, 14, 8, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5);
  jaw.scale(0.9, 0.5, 3.1); jaw.translate(0, 0, 0.12);
  houndGeo.jaw = ensureGeo(jaw);
  houndGeo.upper = displace(limbGeo(0.36, 0.065, 0.04, { bulge: 0.02, bulgeAt: 0.2 }), skin(0.004));
  houndGeo.lower = limbGeo(0.34, 0.035, 0.026, { bulge: 0.012, bulgeAt: 0.05 });
  houndGeo.meta = limbGeo(0.2, 0.028, 0.022);
  houndGeo.paw = limbGeo(0.12, 0.03, 0.02, { seg: 7, flat: 0.6 });
  houndGeo.claw = new THREE.ConeGeometry(0.008, 0.06, 4);
  houndGeo.tail = displace(limbGeo(0.5, 0.03, 0.006, { seg: 6 }), skin(0.003));
  houndGeo.tooth = new THREE.ConeGeometry(0.009, 0.05, 4);
  return houndGeo;
}

export function buildHound(skinMat) {
  const G = houndGeos();
  const bone = boneMaterial();
  const group = new THREE.Group();
  const bodyG = new THREE.Group(); bodyG.position.set(0, 0.74, -0.52); group.add(bodyG);
  const body = new THREE.Mesh(G.body, skinMat); body.rotation.x = -Math.PI / 2; bodyG.add(body);
  // 首と頭
  const neck = new THREE.Group(); neck.position.set(0, 0.06, 1.02); neck.rotation.x = -2.0; bodyG.add(neck);
  const nm = new THREE.Mesh(G.neck, skinMat); neck.add(nm);
  const headG = new THREE.Group(); headG.position.y = -0.34; neck.add(headG);
  const headTilt = new THREE.Group(); headTilt.rotation.x = 2.0 - 0.15; headG.add(headTilt);
  headTilt.add(new THREE.Mesh(G.skull, skinMat));
  const jaw = new THREE.Group(); jaw.position.set(0, -0.05, -0.02); headTilt.add(jaw);
  jaw.add(new THREE.Mesh(G.jaw, skinMat));
  for (let i = 0; i < 9; i++) {
    const zz = 0.06 + i * 0.026, xx = 0.06 * (1 - i / 11);
    for (const sx of [-1, 1]) {
      const up = new THREE.Mesh(G.tooth, bone); up.rotation.x = Math.PI; up.position.set(sx * xx, -0.045, zz + 0.05); headTilt.add(up);
      const lo = new THREE.Mesh(G.tooth, bone); lo.position.set(sx * xx * 0.9, 0.02, zz + 0.04); jaw.add(lo);
    }
  }
  // 脚(前脚：肩・肘・足 / 後脚：股・膝・かかと・足)
  const legs = [];
  const mk = (x, z, hind) => {
    const root = new THREE.Group(); root.position.set(x, hind ? 0.02 : -0.02, z); bodyG.add(root);
    root.add(new THREE.Mesh(G.upper, skinMat));
    const j1 = new THREE.Group(); j1.position.y = -0.36; root.add(j1);
    j1.add(new THREE.Mesh(G.lower, skinMat));
    const j2 = new THREE.Group(); j2.position.y = -0.34; j1.add(j2);
    let j3 = j2;
    if (hind) { j2.add(new THREE.Mesh(G.meta, skinMat)); j3 = new THREE.Group(); j3.position.y = -0.2; j2.add(j3); }
    const paw = new THREE.Mesh(G.paw, skinMat); paw.rotation.x = -Math.PI / 2 - 0.2; j3.add(paw);
    for (let c = 0; c < 3; c++) { const cl = new THREE.Mesh(G.claw, bone); cl.rotation.x = Math.PI / 2 + 0.6; cl.position.set((c - 1) * 0.02, -0.02, 0.12); j3.add(cl); }
    return { root, j1, j2, j3, hind };
  };
  legs.push(mk(-0.1, 0.86, false), mk(0.1, 0.86, false), mk(-0.11, 0.12, true), mk(0.11, 0.12, true));
  const tail = new THREE.Group(); tail.position.set(0, 0.08, 0); tail.rotation.x = 0.8; bodyG.add(tail);
  tail.add(new THREE.Mesh(G.tail, skinMat));
  return { group, bodyG, neck, headG, headTilt, jaw, legs, tail };
}

/* ---------------- 蜘蛛 ---------------- */
const spiderGeo = {};
function spiderGeos() {
  if (spiderGeo.abd) return spiderGeo;
  const abd = new THREE.SphereGeometry(0.42, 30, 24);
  abd.scale(1, 0.78, 1.32);
  displace(abd, (v) => skin(0.008, 0.8)(v) + (v.y > 0.1 ? 0.012 * Math.max(0, Math.sin(v.z * 22)) : 0));
  spiderGeo.abd = abd;
  const ceph = new THREE.SphereGeometry(0.26, 18, 14);
  ceph.scale(1, 0.62, 1.15);
  spiderGeo.ceph = displace(ceph, skin(0.006));
  spiderGeo.femur = displace(limbGeo(0.72, 0.042, 0.03, { seg: 8, bulge: 0.012, bulgeAt: 0.9 }), skin(0.003, 2));
  spiderGeo.tibia = displace(limbGeo(0.86, 0.03, 0.012, { seg: 7, bulge: 0.008, bulgeAt: 0.05 }), skin(0.002, 2));
  spiderGeo.tarsus = limbGeo(0.3, 0.012, 0.004, { seg: 5 });
  spiderGeo.palp = limbGeo(0.22, 0.02, 0.012, { seg: 6 });
  spiderGeo.fang = new THREE.ConeGeometry(0.018, 0.12, 5);
  spiderGeo.eye = new THREE.SphereGeometry(0.022, 8, 6);
  shade(spiderGeo.abd, (v) => (v.y > 0.12 && Math.abs(v.x) < 0.06 ? 0.35 : 0) + (v.y > 0.05 && Math.abs(Math.abs(v.x) - 0.16) < 0.03 && Math.sin(v.z * 14) > 0.3 ? 0.4 : 0)); // 背中の模様
  return spiderGeo;
}

export function buildSpider(mats) {
  const G = spiderGeos();
  const group = new THREE.Group();
  const bodyG = new THREE.Group(); bodyG.position.y = 0.6; group.add(bodyG);
  const abd = new THREE.Mesh(G.abd, mats.abd); abd.position.set(0, 0.06, -0.52); abd.rotation.x = 0.18; bodyG.add(abd);
  const ceph = new THREE.Mesh(G.ceph, mats.skin); ceph.position.set(0, -0.02, 0.08); bodyG.add(ceph);
  // 目(前に2つ大きく、残りは小さく)
  const eyes = [];
  for (const [x, y, z, s] of [[-0.05, 0.1, 0.34, 1.3], [0.05, 0.1, 0.34, 1.3], [-0.11, 0.08, 0.3, 0.9], [0.11, 0.08, 0.3, 0.9], [-0.04, 0.15, 0.3, 0.8], [0.04, 0.15, 0.3, 0.8], [-0.14, 0.12, 0.24, 0.7], [0.14, 0.12, 0.24, 0.7]]) {
    const e = new THREE.Mesh(G.eye, mats.eye); e.position.set(x, y - 0.02, z); e.scale.setScalar(s); bodyG.add(e); eyes.push(e);
  }
  // 牙と触肢
  const fangs = [];
  for (const sx of [-1, 1]) {
    const f = new THREE.Mesh(G.fang, mats.fang); f.position.set(sx * 0.05, -0.1, 0.36); f.rotation.x = Math.PI - 0.3; bodyG.add(f); fangs.push(f);
    const pa = new THREE.Group(); pa.position.set(sx * 0.1, -0.05, 0.32); pa.rotation.set(-1.9, 0, sx * -0.3); bodyG.add(pa);
    pa.add(new THREE.Mesh(G.palp, mats.skin));
  }
  // 8本の脚：付け根 → 膝(高く持ち上がる) → すね → 先
  const legs = [];
  for (let i = 0; i < 8; i++) {
    const side = i < 4 ? -1 : 1, k = i % 4;
    const root = new THREE.Group();
    root.position.set(side * 0.16, -0.02, 0.22 - k * 0.12);
    root.rotation.y = -side * (0.85 - k * 0.5); // 前の脚ほど前を向く
    bodyG.add(root);
    const lift = new THREE.Group(); lift.rotation.z = side * 2.15; root.add(lift); // 斜め上・外側へ
    const fem = new THREE.Mesh(G.femur, mats.leg); lift.add(fem);
    const knee = new THREE.Group(); knee.position.y = -0.72; knee.rotation.z = side * -1.7; lift.add(knee); // 膝から下へ
    knee.add(new THREE.Mesh(G.tibia, mats.leg));
    const tip = new THREE.Group(); tip.position.y = -0.86; tip.rotation.z = side * 0.3; knee.add(tip);
    tip.add(new THREE.Mesh(G.tarsus, mats.leg));
    legs.push({ root, lift, knee, tip, side, base: root.rotation.y });
  }
  return { group, bodyG, abd, ceph, eyes, fangs, legs };
}
