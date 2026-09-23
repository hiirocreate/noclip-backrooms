// 画像ファイルを使わず、Canvasで質感を生成する
import * as THREE from 'three';
import { mulberry32 } from './mapgen.js';

let rnd = mulberry32(1234);

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function toTex(c, { repeat = true, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

function noise(ctx, w, h, amount, mono = true) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rnd() - 0.5) * amount;
    d[i] += n; d[i + 1] += mono ? n : (rnd() - 0.5) * amount; d[i + 2] += mono ? n : (rnd() - 0.5) * amount;
  }
  ctx.putImageData(img, 0, 0);
}

function blotch(ctx, x, y, r, color, alpha) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color.replace('A', alpha));
  g.addColorStop(1, color.replace('A', 0));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
}

// 左右/上下がつながるよう、はみ出した分を反対側にも描く
function wrapBlotch(ctx, w, h, x, y, r, color, alpha) {
  for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) {
    if (x + ox + r < 0 || x + ox - r > w || y + oy + r < 0 || y + oy - r > h) continue;
    blotch(ctx, x + ox, y + oy, r, color, alpha);
  }
}

function crack(ctx, x, y, len, color) {
  ctx.strokeStyle = color; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x, y);
  let a = rnd() * Math.PI * 2;
  for (let i = 0; i < len; i++) {
    a += (rnd() - 0.5) * 0.9;
    x += Math.cos(a) * 4; y += Math.sin(a) * 4;
    ctx.lineTo(x, y);
  }
  ctx.stroke();
}

/* ---------------- Level 0 : ロビー ---------------- */
function lobbyWall() {
  const [c, ctx] = canvas(256, 512);
  ctx.fillStyle = '#b9a452'; ctx.fillRect(0, 0, 256, 512);
  // 縦ストライプ
  for (let x = 0; x < 256; x += 32) {
    ctx.fillStyle = 'rgba(255,240,170,0.10)'; ctx.fillRect(x, 0, 14, 512);
    ctx.fillStyle = 'rgba(90,70,10,0.10)'; ctx.fillRect(x + 14, 0, 2, 512);
  }
  // 小さな菱形模様
  ctx.fillStyle = 'rgba(120,95,25,0.18)';
  for (let y = 12; y < 512; y += 24) for (let x = 7; x < 256; x += 32) {
    ctx.beginPath(); ctx.moveTo(x, y - 4); ctx.lineTo(x + 3, y); ctx.lineTo(x, y + 4); ctx.lineTo(x - 3, y); ctx.fill();
  }
  noise(ctx, 256, 512, 18);
  // 下部の水染み
  const g = ctx.createLinearGradient(0, 512, 0, 380);
  g.addColorStop(0, 'rgba(70,50,10,0.55)'); g.addColorStop(1, 'rgba(70,50,10,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 380, 256, 132);
  for (let i = 0; i < 6; i++) wrapBlotch(ctx, 256, 512, rnd() * 256, 440 + rnd() * 70, 20 + rnd() * 40, 'rgba(80,60,15,A)', 0.35);
  for (let i = 0; i < 3; i++) wrapBlotch(ctx, 256, 512, rnd() * 256, rnd() * 300, 10 + rnd() * 25, 'rgba(110,90,30,A)', 0.2);
  // 幅木
  ctx.fillStyle = '#6b5a2a'; ctx.fillRect(0, 496, 256, 16);
  ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(0, 496, 256, 2);
  return c;
}
function lobbyFloor() {
  const [c, ctx] = canvas(256, 256);
  ctx.fillStyle = '#8a7a3e'; ctx.fillRect(0, 0, 256, 256);
  noise(ctx, 256, 256, 55);
  // 毛羽
  for (let i = 0; i < 2500; i++) {
    ctx.fillStyle = rnd() < 0.5 ? 'rgba(60,50,20,0.25)' : 'rgba(200,180,110,0.15)';
    ctx.fillRect(rnd() * 256, rnd() * 256, 1, 2);
  }
  for (let i = 0; i < 5; i++) wrapBlotch(ctx, 256, 256, rnd() * 256, rnd() * 256, 25 + rnd() * 50, 'rgba(50,40,15,A)', 0.4);
  return c;
}
function lobbyCeiling() {
  const [c, ctx] = canvas(256, 256);
  ctx.fillStyle = '#cfc7a2'; ctx.fillRect(0, 0, 256, 256);
  noise(ctx, 256, 256, 14);
  for (let i = 0; i < 1500; i++) { ctx.fillStyle = 'rgba(90,80,50,0.25)'; ctx.fillRect(rnd() * 256, rnd() * 256, 1, 1); }
  ctx.fillStyle = '#8f8a70';
  for (let i = 0; i <= 256; i += 128) { ctx.fillRect(i - 2, 0, 4, 256); ctx.fillRect(0, i - 2, 256, 4); }
  for (let i = 0; i < 3; i++) wrapBlotch(ctx, 256, 256, rnd() * 256, rnd() * 256, 15 + rnd() * 30, 'rgba(140,110,40,A)', 0.35);
  return c;
}

/* ---------------- Level 1 : 居住区画 ---------------- */
function concrete(ctx, w, h, base, amt) {
  ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
  noise(ctx, w, h, amt);
  for (let i = 0; i < 12; i++) wrapBlotch(ctx, w, h, rnd() * w, rnd() * h, 20 + rnd() * 60, 'rgba(0,0,0,A)', 0.12);
  for (let i = 0; i < 8; i++) wrapBlotch(ctx, w, h, rnd() * w, rnd() * h, 20 + rnd() * 50, 'rgba(255,255,255,A)', 0.05);
  for (let i = 0; i < 300; i++) { ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 2, 1 + rnd() * 2); }
}
function parkingWall() {
  const [c, ctx] = canvas(256, 512);
  concrete(ctx, 256, 512, '#77776f', 26);
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  for (let y = 128; y < 512; y += 128) ctx.fillRect(0, y, 256, 2);
  for (let i = 0; i < 4; i++) crack(ctx, rnd() * 256, rnd() * 400, 12 + rnd() * 20, 'rgba(20,20,20,0.5)');
  // 下部の黄黒ストライプ
  ctx.save(); ctx.beginPath(); ctx.rect(0, 470, 256, 36); ctx.clip();
  ctx.fillStyle = '#b89a2a'; ctx.fillRect(0, 470, 256, 36);
  ctx.fillStyle = '#1b1b18';
  for (let x = -40; x < 300; x += 32) { ctx.beginPath(); ctx.moveTo(x, 506); ctx.lineTo(x + 16, 506); ctx.lineTo(x + 52, 470); ctx.lineTo(x + 36, 470); ctx.fill(); }
  ctx.restore();
  noise(ctx, 256, 512, 10);
  // 水の垂れ跡
  for (let i = 0; i < 5; i++) {
    const x = rnd() * 256; const g = ctx.createLinearGradient(0, 0, 0, 300);
    g.addColorStop(0, 'rgba(20,25,25,0.4)'); g.addColorStop(1, 'rgba(20,25,25,0)');
    ctx.fillStyle = g; ctx.fillRect(x, 0, 3 + rnd() * 8, 200 + rnd() * 200);
  }
  return c;
}
function parkingFloor() {
  const [c, ctx] = canvas(256, 256);
  concrete(ctx, 256, 256, '#4c4c48', 30);
  for (let i = 0; i < 4; i++) wrapBlotch(ctx, 256, 256, rnd() * 256, rnd() * 256, 20 + rnd() * 30, 'rgba(10,10,15,A)', 0.45);
  for (let i = 0; i < 3; i++) crack(ctx, rnd() * 256, rnd() * 256, 20, 'rgba(15,15,15,0.6)');
  return c;
}
function parkingCeiling() {
  const [c, ctx] = canvas(256, 256);
  concrete(ctx, 256, 256, '#56564f', 20);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(0, 0, 256, 6); ctx.fillRect(0, 128, 256, 6);
  return c;
}
function parkingPillar() {
  const [c, ctx] = canvas(256, 512);
  concrete(ctx, 256, 512, '#85857c', 22);
  ctx.save(); ctx.beginPath(); ctx.rect(0, 400, 256, 112); ctx.clip();
  ctx.fillStyle = '#c4a32a'; ctx.fillRect(0, 400, 256, 112);
  ctx.fillStyle = '#1c1c18';
  for (let x = -120; x < 300; x += 48) { ctx.beginPath(); ctx.moveTo(x, 512); ctx.lineTo(x + 24, 512); ctx.lineTo(x + 136, 400); ctx.lineTo(x + 112, 400); ctx.fill(); }
  ctx.restore();
  noise(ctx, 256, 512, 12);
  ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.font = 'bold 64px monospace'; ctx.textAlign = 'center';
  ctx.fillText(['B', 'C', 'D', 'F'][Math.floor(rnd() * 4)] + (1 + Math.floor(rnd() * 9)), 128, 200);
  return c;
}

/* ---------------- Level 2 : 配管 ---------------- */
function pipesWall() {
  const [c, ctx] = canvas(256, 512);
  ctx.fillStyle = '#3e3129'; ctx.fillRect(0, 0, 256, 512);
  noise(ctx, 256, 512, 30, false);
  // パネル
  for (let y = 0; y < 512; y += 128) for (let x = 0; x < 256; x += 128) {
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 3; ctx.strokeRect(x + 2, y + 2, 124, 124);
    ctx.strokeStyle = 'rgba(255,200,160,0.08)'; ctx.lineWidth = 1; ctx.strokeRect(x + 5, y + 5, 118, 118);
    ctx.fillStyle = 'rgba(20,10,5,0.8)';
    for (const [rx, ry] of [[10, 10], [118, 10], [10, 118], [118, 118]]) { ctx.beginPath(); ctx.arc(x + rx, y + ry, 3, 0, 7); ctx.fill(); }
  }
  // 錆の垂れ
  for (let i = 0; i < 14; i++) {
    const x = rnd() * 256, y = rnd() * 512;
    const g = ctx.createLinearGradient(0, y, 0, y + 150);
    g.addColorStop(0, 'rgba(140,60,20,0.55)'); g.addColorStop(1, 'rgba(140,60,20,0)');
    ctx.fillStyle = g; ctx.fillRect(x, y, 2 + rnd() * 10, 150);
  }
  for (let i = 0; i < 8; i++) wrapBlotch(ctx, 256, 512, rnd() * 256, rnd() * 512, 20 + rnd() * 40, 'rgba(120,50,15,A)', 0.3);
  return c;
}
function pipesFloor() {
  const [c, ctx] = canvas(256, 256);
  ctx.fillStyle = '#1a1411'; ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = '#4a3e36';
  for (let i = 0; i < 256; i += 16) { ctx.fillRect(i, 0, 5, 256); ctx.fillRect(0, i, 256, 5); }
  noise(ctx, 256, 256, 28, false);
  for (let i = 0; i < 6; i++) wrapBlotch(ctx, 256, 256, rnd() * 256, rnd() * 256, 20 + rnd() * 40, 'rgba(110,45,10,A)', 0.35);
  return c;
}
function pipesCeiling() {
  const [c, ctx] = canvas(256, 256);
  ctx.fillStyle = '#231b17'; ctx.fillRect(0, 0, 256, 256);
  noise(ctx, 256, 256, 20);
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  for (let i = 0; i < 256; i += 64) ctx.fillRect(i, 0, 6, 256);
  return c;
}

/* ---------------- 共通 ---------------- */
function doorTex(theme) {
  const [c, ctx] = canvas(256, 512);
  if (theme === 'lobby') {
    ctx.fillStyle = '#6e5a3c'; ctx.fillRect(0, 0, 256, 512);
    noise(ctx, 256, 512, 20);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 4;
    ctx.strokeRect(30, 30, 196, 200); ctx.strokeRect(30, 270, 196, 210);
    ctx.fillStyle = '#c9b56a'; ctx.beginPath(); ctx.arc(210, 270, 10, 0, 7); ctx.fill();
  } else if (theme === 'parking') {
    ctx.fillStyle = '#8b8e90'; ctx.fillRect(0, 0, 256, 512);
    noise(ctx, 256, 512, 16);
    ctx.fillStyle = '#222'; ctx.fillRect(126, 0, 4, 512);
    for (let y = 0; y < 512; y += 6) { ctx.fillStyle = 'rgba(255,255,255,0.03)'; ctx.fillRect(0, y, 256, 1); }
  } else {
    ctx.fillStyle = '#4e4a44'; ctx.fillRect(0, 0, 256, 512);
    noise(ctx, 256, 512, 24, false);
    ctx.strokeStyle = '#2a2622'; ctx.lineWidth = 10; ctx.strokeRect(12, 12, 232, 488);
    ctx.strokeStyle = '#8a7b62'; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.arc(128, 256, 60, 0, 7); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(68, 256); ctx.lineTo(188, 256); ctx.moveTo(128, 196); ctx.lineTo(128, 316); ctx.stroke();
    for (let i = 0; i < 6; i++) wrapBlotch(ctx, 256, 512, rnd() * 256, rnd() * 512, 30, 'rgba(130,55,15,A)', 0.35);
  }
  return c;
}

function signTex(text, color) {
  const [c, ctx] = canvas(256, 64);
  ctx.fillStyle = '#0a0a0a'; ctx.fillRect(0, 0, 256, 64);
  ctx.fillStyle = color; ctx.font = 'bold 40px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 34);
  return c;
}

function haloTex() {
  const [c, ctx] = canvas(64, 64);
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  return c;
}

function smilerTex() {
  const [c, ctx] = canvas(256, 256);
  ctx.clearRect(0, 0, 256, 256);
  ctx.fillStyle = '#fff';
  ctx.shadowColor = '#fff'; ctx.shadowBlur = 16;
  // 目
  for (const x of [80, 176]) { ctx.beginPath(); ctx.ellipse(x, 90, 14, 20, 0, 0, 7); ctx.fill(); }
  // 口(大きな笑み)
  ctx.beginPath();
  ctx.moveTo(30, 140); ctx.quadraticCurveTo(128, 250, 226, 140); ctx.quadraticCurveTo(128, 200, 30, 140); ctx.fill();
  ctx.shadowBlur = 0; ctx.fillStyle = '#000';
  for (let i = 0; i < 13; i++) { const x = 44 + i * 13.5; const y = 150 + Math.sin((i / 12) * Math.PI) * 28; ctx.fillRect(x, y - 6, 2, 16); }
  ctx.fillRect(40, 157 + 0, 176, 2);
  return c;
}

function eyesTex() {
  const [c, ctx] = canvas(128, 64);
  ctx.fillStyle = '#fff'; ctx.shadowColor = '#fff'; ctx.shadowBlur = 10;
  for (const x of [44, 84]) { ctx.beginPath(); ctx.arc(x, 32, 5, 0, 7); ctx.fill(); }
  return c;
}

const cache = {};
export function getTextures(theme) {
  if (cache[theme]) return cache[theme];
  rnd = mulberry32(theme.length * 999 + 7);
  let t;
  if (theme === 'lobby') t = { wall: lobbyWall(), floor: lobbyFloor(), ceil: lobbyCeiling(), pillar: lobbyWall() };
  else if (theme === 'parking') t = { wall: parkingWall(), floor: parkingFloor(), ceil: parkingCeiling(), pillar: parkingPillar() };
  else t = { wall: pipesWall(), floor: pipesFloor(), ceil: pipesCeiling(), pillar: pipesWall() };
  const out = {};
  for (const k in t) out[k] = toTex(t[k]);
  out.door = toTex(doorTex(theme), { repeat: false });
  cache[theme] = out;
  return out;
}

const common = {};
export function getCommon() {
  if (common.halo) return common;
  common.halo = toTex(haloTex(), { repeat: false });
  common.smiler = toTex(smilerTex(), { repeat: false });
  common.eyes = toTex(eyesTex(), { repeat: false });
  common.signLocked = (txt) => toTex(signTex(txt, '#ff3a2a'), { repeat: false });
  common.signOpen = (txt) => toTex(signTex(txt, '#3aff7a'), { repeat: false });
  return common;
}
