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

/* ---------------- Level 3 : 変電所(レンガ) ---------------- */
function stationWall() {
  const [c, ctx] = canvas(256, 512);
  ctx.fillStyle = '#3a2620'; ctx.fillRect(0, 0, 256, 512);
  const bh = 22, bw = 64;
  for (let row = 0; row * bh < 512; row++) {
    const off = row % 2 ? bw / 2 : 0;
    for (let x = -bw; x < 256 + bw; x += bw) {
      const r = 110 + rnd() * 40, g = 55 + rnd() * 20, b = 40 + rnd() * 15;
      ctx.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`;
      ctx.fillRect(x + off + 2, row * bh + 2, bw - 4, bh - 4);
    }
  }
  noise(ctx, 256, 512, 30);
  // すす汚れ・黒い液の垂れ
  for (let i = 0; i < 10; i++) {
    const x = rnd() * 256, g = ctx.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0, 'rgba(5,5,5,0.7)'); g.addColorStop(1, 'rgba(5,5,5,0)');
    ctx.fillStyle = g; ctx.fillRect(x, 0, 2 + rnd() * 6, 150 + rnd() * 300);
  }
  const g2 = ctx.createLinearGradient(0, 512, 0, 400);
  g2.addColorStop(0, 'rgba(0,0,0,0.6)'); g2.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g2; ctx.fillRect(0, 400, 256, 112);
  return c;
}
function stationFloor() {
  const [c, ctx] = canvas(256, 256);
  concrete(ctx, 256, 256, '#3a3a38', 30);
  ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, 254, 254);
  for (let i = 0; i < 5; i++) wrapBlotch(ctx, 256, 256, rnd() * 256, rnd() * 256, 15 + rnd() * 35, 'rgba(0,0,0,A)', 0.5);
  return c;
}
function stationCeiling() {
  const [c, ctx] = canvas(256, 256);
  concrete(ctx, 256, 256, '#2a2826', 18);
  // ケーブルの束
  for (let i = 0; i < 6; i++) {
    ctx.strokeStyle = ['#111', '#2a1a10', '#1a1a2a'][i % 3]; ctx.lineWidth = 3 + rnd() * 4;
    ctx.beginPath(); const y = rnd() * 256; ctx.moveTo(0, y);
    ctx.bezierCurveTo(80, y + 20 - rnd() * 40, 170, y + 20 - rnd() * 40, 256, y); ctx.stroke();
  }
  return c;
}

/* ---------------- Level 4 : オフィス ---------------- */
function officeWall() {
  const [c, ctx] = canvas(256, 512);
  ctx.fillStyle = '#bdb6a3'; ctx.fillRect(0, 0, 256, 512);
  noise(ctx, 256, 512, 8);
  for (let i = 0; i < 4; i++) wrapBlotch(ctx, 256, 512, rnd() * 256, rnd() * 400, 30 + rnd() * 50, 'rgba(120,110,90,A)', 0.12);
  ctx.fillStyle = '#5e5a52'; ctx.fillRect(0, 488, 256, 24);
  ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(0, 488, 256, 2);
  // コンセント
  ctx.fillStyle = '#d8d2c0'; ctx.fillRect(180, 440, 22, 30);
  ctx.fillStyle = '#333'; ctx.fillRect(186, 448, 3, 7); ctx.fillRect(193, 448, 3, 7);
  return c;
}
function officeFloor() {
  const [c, ctx] = canvas(256, 256);
  for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
    ctx.fillStyle = (x + y) % 2 ? '#4a5058' : '#454a52'; ctx.fillRect(x * 128, y * 128, 128, 128);
  }
  noise(ctx, 256, 256, 30);
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, 128, 128); ctx.strokeRect(128, 128, 128, 128);
  for (let i = 0; i < 3; i++) wrapBlotch(ctx, 256, 256, rnd() * 256, rnd() * 256, 20 + rnd() * 30, 'rgba(20,20,25,A)', 0.25);
  return c;
}
function officeCeiling() {
  const [c, ctx] = canvas(256, 256);
  ctx.fillStyle = '#dcd8cc'; ctx.fillRect(0, 0, 256, 256);
  noise(ctx, 256, 256, 10);
  for (let i = 0; i < 1800; i++) { ctx.fillStyle = 'rgba(60,60,50,0.3)'; ctx.fillRect(rnd() * 256, rnd() * 256, 1, 1); }
  ctx.fillStyle = '#9d998c';
  for (let i = 0; i <= 256; i += 128) { ctx.fillRect(i - 2, 0, 4, 256); ctx.fillRect(0, i - 2, 256, 4); }
  wrapBlotch(ctx, 256, 256, rnd() * 256, rnd() * 256, 25, 'rgba(150,120,60,A)', 0.3);
  return c;
}

/* ---------------- Level 5 : ホテル ---------------- */
function hotelWall() {
  const [c, ctx] = canvas(256, 512);
  ctx.fillStyle = '#5a1f1c'; ctx.fillRect(0, 0, 256, 512);
  // ダマスク柄
  ctx.fillStyle = 'rgba(190,140,70,0.16)';
  for (let y = 0; y < 360; y += 64) for (let x = 0; x < 256; x += 64) {
    const ox = (y / 64) % 2 ? 32 : 0;
    ctx.save(); ctx.translate(x + ox, y + 32);
    ctx.beginPath(); ctx.moveTo(0, -24); ctx.bezierCurveTo(16, -10, 16, 10, 0, 24); ctx.bezierCurveTo(-16, 10, -16, -10, 0, -24); ctx.fill();
    ctx.fillRect(-1, -30, 2, 60);
    ctx.restore();
  }
  noise(ctx, 256, 512, 14);
  // 腰壁(木)
  ctx.fillStyle = '#3a2416'; ctx.fillRect(0, 360, 256, 152);
  ctx.fillStyle = '#6e4a2a'; ctx.fillRect(0, 356, 256, 8);
  ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 3;
  for (let x = 8; x < 256; x += 128) ctx.strokeRect(x, 378, 112, 112);
  ctx.fillStyle = '#1e140c'; ctx.fillRect(0, 500, 256, 12);
  for (let i = 0; i < 4; i++) wrapBlotch(ctx, 256, 512, rnd() * 256, rnd() * 340, 25 + rnd() * 40, 'rgba(20,5,3,A)', 0.25);
  return c;
}
function hotelFloor() {
  const [c, ctx] = canvas(256, 256);
  ctx.fillStyle = '#4a1414'; ctx.fillRect(0, 0, 256, 256);
  // 絨毯の模様
  ctx.strokeStyle = 'rgba(200,150,60,0.35)'; ctx.lineWidth = 3;
  for (let y = 0; y < 256; y += 64) for (let x = 0; x < 256; x += 64) {
    ctx.beginPath(); ctx.moveTo(x + 32, y + 8); ctx.lineTo(x + 56, y + 32); ctx.lineTo(x + 32, y + 56); ctx.lineTo(x + 8, y + 32); ctx.closePath(); ctx.stroke();
    ctx.fillStyle = 'rgba(20,40,30,0.5)'; ctx.fillRect(x + 28, y + 28, 8, 8);
  }
  noise(ctx, 256, 256, 40);
  for (let i = 0; i < 1800; i++) { ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(rnd() * 256, rnd() * 256, 1, 2); }
  for (let i = 0; i < 4; i++) wrapBlotch(ctx, 256, 256, rnd() * 256, rnd() * 256, 20 + rnd() * 40, 'rgba(15,5,3,A)', 0.4);
  return c;
}
function hotelCeiling() {
  const [c, ctx] = canvas(256, 256);
  ctx.fillStyle = '#c9b89a'; ctx.fillRect(0, 0, 256, 256);
  noise(ctx, 256, 256, 12);
  ctx.strokeStyle = 'rgba(120,95,60,0.5)'; ctx.lineWidth = 4;
  ctx.strokeRect(16, 16, 224, 224); ctx.strokeRect(40, 40, 176, 176);
  for (let i = 0; i < 3; i++) wrapBlotch(ctx, 256, 256, rnd() * 256, rnd() * 256, 20 + rnd() * 30, 'rgba(110,80,40,A)', 0.3);
  return c;
}

/* ---------------- Level 6 : 消灯 ---------------- */
function darkWall() {
  const [c, ctx] = canvas(256, 512);
  concrete(ctx, 256, 512, '#2c2c2a', 22);
  for (let i = 0; i < 6; i++) crack(ctx, rnd() * 256, rnd() * 512, 14 + rnd() * 20, 'rgba(0,0,0,0.6)');
  // 手探りの跡(手形)
  for (let i = 0; i < 3; i++) {
    const x = 30 + rnd() * 190, y = 200 + rnd() * 120;
    ctx.fillStyle = 'rgba(10,10,10,0.45)';
    ctx.beginPath(); ctx.ellipse(x, y, 11, 14, 0, 0, 7); ctx.fill();
    for (let f = 0; f < 5; f++) { ctx.beginPath(); ctx.ellipse(x - 12 + f * 6, y - 18 - (f === 2 ? 4 : 0), 2.5, 8, (f - 2) * 0.15, 0, 7); ctx.fill(); }
  }
  return c;
}
function darkFloor() { const [c, ctx] = canvas(256, 256); concrete(ctx, 256, 256, '#232322', 24); return c; }
function darkCeiling() { const [c, ctx] = canvas(256, 256); concrete(ctx, 256, 256, '#1c1c1b', 16); return c; }

/* ---------------- Level 7 : 浸水したタイル張り ---------------- */
function tiles(ctx, w, h, size, base, grout) {
  ctx.fillStyle = grout; ctx.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += size) for (let x = 0; x < w; x += size) {
    const v = (rnd() - 0.5) * 16;
    ctx.fillStyle = base(v); ctx.fillRect(x + 2, y + 2, size - 4, size - 4);
  }
}
function floodWall() {
  const [c, ctx] = canvas(256, 512);
  tiles(ctx, 256, 512, 32, (v) => `rgb(${150 + v | 0},${172 + v | 0},${168 + v | 0})`, '#4a5654');
  noise(ctx, 256, 512, 16);
  // 水位の跡と藻
  const g = ctx.createLinearGradient(0, 512, 0, 300);
  g.addColorStop(0, 'rgba(20,50,40,0.85)'); g.addColorStop(0.45, 'rgba(30,70,55,0.5)'); g.addColorStop(1, 'rgba(30,70,55,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 300, 256, 212);
  ctx.fillStyle = 'rgba(30,40,30,0.55)'; ctx.fillRect(0, 380, 256, 4);
  for (let i = 0; i < 10; i++) {
    const x = rnd() * 256, gg = ctx.createLinearGradient(0, 0, 0, 380);
    gg.addColorStop(0, 'rgba(60,40,20,0.35)'); gg.addColorStop(1, 'rgba(60,40,20,0)');
    ctx.fillStyle = gg; ctx.fillRect(x, 0, 2 + rnd() * 5, 120 + rnd() * 260);
  }
  return c;
}
function floodFloor() {
  const [c, ctx] = canvas(256, 256);
  tiles(ctx, 256, 256, 32, (v) => `rgb(${60 + v | 0},${80 + v | 0},${78 + v | 0})`, '#1e2826');
  noise(ctx, 256, 256, 20);
  for (let i = 0; i < 5; i++) wrapBlotch(ctx, 256, 256, rnd() * 256, rnd() * 256, 20 + rnd() * 40, 'rgba(10,30,20,A)', 0.5);
  return c;
}
function floodCeiling() {
  const [c, ctx] = canvas(256, 256);
  concrete(ctx, 256, 256, '#3c4442', 16);
  for (let i = 0; i < 5; i++) wrapBlotch(ctx, 256, 256, rnd() * 256, rnd() * 256, 20 + rnd() * 40, 'rgba(40,60,50,A)', 0.4);
  return c;
}

/* ---------------- Level 8 : 洞窟 ---------------- */
function rock(ctx, w, h, base) {
  ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 60; i++) wrapBlotch(ctx, w, h, rnd() * w, rnd() * h, 10 + rnd() * 50, rnd() < 0.5 ? 'rgba(0,0,0,A)' : 'rgba(255,240,220,A)', 0.1 + rnd() * 0.12);
  noise(ctx, w, h, 36);
  for (let i = 0; i < 10; i++) crack(ctx, rnd() * w, rnd() * h, 10 + rnd() * 25, 'rgba(10,8,6,0.7)');
}
function caveWall() {
  const [c, ctx] = canvas(256, 512);
  rock(ctx, 256, 512, '#4a4036');
  // 地層
  for (let y = 40; y < 512; y += 50 + rnd() * 40) {
    ctx.strokeStyle = 'rgba(20,14,10,0.35)'; ctx.lineWidth = 2 + rnd() * 4;
    ctx.beginPath(); ctx.moveTo(0, y);
    for (let x = 0; x <= 256; x += 32) ctx.lineTo(x, y + Math.sin(x * 0.05 + y) * 6);
    ctx.stroke();
  }
  // 湿った光沢
  for (let i = 0; i < 6; i++) {
    const x = rnd() * 256, g = ctx.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0, 'rgba(160,170,170,0.12)'); g.addColorStop(1, 'rgba(160,170,170,0)');
    ctx.fillStyle = g; ctx.fillRect(x, 0, 3 + rnd() * 6, 300 + rnd() * 200);
  }
  return c;
}
function caveFloor() {
  const [c, ctx] = canvas(256, 256);
  rock(ctx, 256, 256, '#3a332c');
  for (let i = 0; i < 260; i++) { ctx.fillStyle = `rgba(${90 + rnd() * 60 | 0},${80 + rnd() * 50 | 0},${70 + rnd() * 40 | 0},0.6)`; ctx.beginPath(); ctx.arc(rnd() * 256, rnd() * 256, 1 + rnd() * 3, 0, 7); ctx.fill(); }
  return c;
}
function caveCeiling() { const [c, ctx] = canvas(256, 256); rock(ctx, 256, 256, '#2e2822'); return c; }

/* ---------------- Level 9 : 郊外(真夜中の住宅街) ---------------- */
function suburbWall() {
  const [c, ctx] = canvas(256, 512);
  // 下見板張りの外壁
  ctx.fillStyle = '#3c434a'; ctx.fillRect(0, 0, 256, 512);
  for (let y = 0; y < 512; y += 16) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0, y + 13, 256, 3);
    ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fillRect(0, y, 256, 2);
  }
  noise(ctx, 256, 512, 14);
  // 窓(1階・2階)。どの家にも電気は来ていない
  for (const [y, h] of [[70, 110], [300, 120]]) {
    ctx.fillStyle = '#e6e2d6'; ctx.fillRect(66, y - 8, 124, h + 16);
    ctx.fillStyle = '#07090c'; ctx.fillRect(74, y, 108, h);
    ctx.fillStyle = 'rgba(120,140,160,0.10)'; ctx.fillRect(80, y + 6, 30, h - 12);
    ctx.fillStyle = '#e6e2d6'; ctx.fillRect(126, y, 4, h); ctx.fillRect(74, y + h / 2 - 2, 108, 4);
    ctx.fillStyle = '#23292e'; ctx.fillRect(60, y + h + 8, 136, 8);
  }
  // 雨どいと土台
  ctx.fillStyle = '#1c2024'; ctx.fillRect(0, 0, 256, 10); ctx.fillRect(246, 0, 6, 512);
  ctx.fillStyle = '#4a4640'; ctx.fillRect(0, 470, 256, 42);
  noise(ctx, 256, 512, 8);
  for (let i = 0; i < 6; i++) {
    const x = rnd() * 256, g = ctx.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0, 'rgba(10,12,14,0.5)'); g.addColorStop(1, 'rgba(10,12,14,0)');
    ctx.fillStyle = g; ctx.fillRect(x, 10, 2 + rnd() * 4, 150 + rnd() * 250);
  }
  return c;
}
function suburbFloor() {
  const [c, ctx] = canvas(256, 256);
  // 雨に濡れたアスファルトと落ち葉
  ctx.fillStyle = '#23252a'; ctx.fillRect(0, 0, 256, 256);
  noise(ctx, 256, 256, 34);
  for (let i = 0; i < 700; i++) { ctx.fillStyle = `rgba(${140 + rnd() * 60 | 0},${140 + rnd() * 60 | 0},${150 + rnd() * 60 | 0},0.18)`; ctx.fillRect(rnd() * 256, rnd() * 256, 1, 1); }
  for (let i = 0; i < 6; i++) wrapBlotch(ctx, 256, 256, rnd() * 256, rnd() * 256, 20 + rnd() * 40, 'rgba(120,140,160,A)', 0.12);
  for (let i = 0; i < 40; i++) {
    const x = rnd() * 256, y = rnd() * 256, a = rnd() * 6.3;
    ctx.fillStyle = ['rgba(120,60,20,0.8)', 'rgba(90,70,25,0.8)', 'rgba(60,40,20,0.8)'][i % 3];
    ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.beginPath(); ctx.ellipse(0, 0, 5 + rnd() * 4, 2.5 + rnd() * 2, 0, 0, 7); ctx.fill(); ctx.restore();
  }
  return c;
}
function barkWall() {
  const [c, ctx] = canvas(256, 512);
  ctx.fillStyle = '#2e2620'; ctx.fillRect(0, 0, 256, 512);
  for (let i = 0; i < 90; i++) {
    const x = rnd() * 256; ctx.strokeStyle = `rgba(${rnd() < 0.5 ? '10,8,6' : '80,70,60'},0.5)`; ctx.lineWidth = 1 + rnd() * 3;
    ctx.beginPath(); ctx.moveTo(x, 0); for (let y = 0; y <= 512; y += 32) ctx.lineTo(x + Math.sin(y * 0.03 + i) * 4, y); ctx.stroke();
  }
  noise(ctx, 256, 512, 20);
  return c;
}

/* ---------------- Level 10 : 豊作(麦畑と木立) ---------------- */
function hedgeWall() {
  const [c, ctx] = canvas(256, 512);
  ctx.fillStyle = '#1d2a17'; ctx.fillRect(0, 0, 256, 512);
  for (let i = 0; i < 900; i++) {
    const x = rnd() * 256, y = rnd() * 512;
    const v = rnd();
    ctx.fillStyle = `rgba(${40 + v * 50 | 0},${60 + v * 60 | 0},${30 + v * 30 | 0},${0.5 + rnd() * 0.4})`;
    ctx.beginPath(); ctx.ellipse(x, y, 4 + rnd() * 6, 2 + rnd() * 4, rnd() * 3, 0, 7); ctx.fill();
  }
  // 幹
  for (let i = 0; i < 3; i++) { const x = 30 + rnd() * 200; ctx.fillStyle = 'rgba(30,22,16,0.8)'; ctx.fillRect(x, 330 + rnd() * 60, 10 + rnd() * 8, 200); }
  const g = ctx.createLinearGradient(0, 512, 0, 300);
  g.addColorStop(0, 'rgba(5,8,4,0.8)'); g.addColorStop(1, 'rgba(5,8,4,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 300, 256, 212);
  noise(ctx, 256, 512, 14);
  return c;
}
function dirtFloor() {
  const [c, ctx] = canvas(256, 256);
  ctx.fillStyle = '#4a3b2a'; ctx.fillRect(0, 0, 256, 256);
  noise(ctx, 256, 256, 40);
  for (let i = 0; i < 8; i++) wrapBlotch(ctx, 256, 256, rnd() * 256, rnd() * 256, 20 + rnd() * 40, rnd() < 0.5 ? 'rgba(30,22,14,A)' : 'rgba(110,90,60,A)', 0.25);
  for (let i = 0; i < 160; i++) { ctx.fillStyle = `rgba(${120 + rnd() * 60 | 0},${100 + rnd() * 50 | 0},${70 + rnd() * 40 | 0},0.6)`; ctx.fillRect(rnd() * 256, rnd() * 256, 1 + rnd() * 2, 1 + rnd() * 2); }
  return c;
}

/* ---------------- Level 11 : 終わりのない都市 ---------------- */
function cityWall() {
  const [c, ctx] = canvas(256, 1024);
  ctx.fillStyle = '#5d5e5c'; ctx.fillRect(0, 0, 256, 1024);
  noise(ctx, 256, 1024, 14);
  // 上の階の窓(ところどころ灯りがついている)
  for (let y = 24; y < 780; y += 108) {
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(0, y + 92, 256, 4);
    for (let x = 18; x < 256; x += 118) {
      const lit = rnd() < 0.3;
      ctx.fillStyle = lit ? `rgb(${210 + rnd() * 40 | 0},${180 + rnd() * 30 | 0},${110 + rnd() * 30 | 0})` : '#14171b';
      ctx.fillRect(x, y, 100, 76);
      if (!lit) { ctx.fillStyle = 'rgba(140,160,180,0.12)'; ctx.fillRect(x + 6, y + 4, 26, 68); }
      ctx.fillStyle = '#3a3b3a'; ctx.fillRect(x + 48, y, 4, 76);
    }
  }
  // 1階：シャッターの降りた店
  ctx.fillStyle = '#2c2e30'; ctx.fillRect(0, 800, 256, 224);
  for (let y = 812; y < 1010; y += 8) { ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(10, y, 236, 2); }
  ctx.fillStyle = '#1a1b1c'; ctx.fillRect(0, 780, 256, 24);
  noise(ctx, 256, 1024, 8);
  return c;
}
function cityFloor() {
  const [c, ctx] = canvas(256, 256);
  ctx.fillStyle = '#3a3b3d'; ctx.fillRect(0, 0, 256, 256);
  noise(ctx, 256, 256, 22);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 2;
  for (let i = 0; i <= 256; i += 64) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 256); ctx.moveTo(0, i); ctx.lineTo(256, i); ctx.stroke(); }
  for (let i = 0; i < 5; i++) wrapBlotch(ctx, 256, 256, rnd() * 256, rnd() * 256, 15 + rnd() * 30, 'rgba(10,10,10,A)', 0.3);
  return c;
}

/* ---------------- Level 12 : マトリックス(白い虚空) ---------------- */
function whiteWall() {
  const [c, ctx] = canvas(256, 512);
  ctx.fillStyle = '#f2f2ef'; ctx.fillRect(0, 0, 256, 512);
  noise(ctx, 256, 512, 5);
  ctx.fillStyle = 'rgba(0,0,0,0.05)'; ctx.fillRect(0, 0, 2, 512); ctx.fillRect(0, 500, 256, 12);
  return c;
}
function whiteFloor() {
  const [c, ctx] = canvas(256, 256);
  ctx.fillStyle = '#ecece8'; ctx.fillRect(0, 0, 256, 256);
  noise(ctx, 256, 256, 6);
  ctx.fillStyle = 'rgba(0,0,0,0.035)'; ctx.fillRect(0, 0, 256, 2); ctx.fillRect(0, 0, 2, 256);
  return c;
}

/* ---------------- 共通 ---------------- */
function doorTex(style) {
  const [c, ctx] = canvas(256, 512);
  if (style === 'wood') {
    ctx.fillStyle = '#6e5a3c'; ctx.fillRect(0, 0, 256, 512);
    noise(ctx, 256, 512, 20);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 4;
    ctx.strokeRect(30, 30, 196, 200); ctx.strokeRect(30, 270, 196, 210);
    ctx.fillStyle = '#c9b56a'; ctx.beginPath(); ctx.arc(210, 270, 10, 0, 7); ctx.fill();
  } else if (style === 'hotel') {
    ctx.fillStyle = '#4a2c18'; ctx.fillRect(0, 0, 256, 512);
    noise(ctx, 256, 512, 18);
    for (let x = 0; x < 256; x += 3) { ctx.fillStyle = `rgba(20,10,5,${0.05 + rnd() * 0.1})`; ctx.fillRect(x, 0, 1, 512); }
    ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 5;
    ctx.strokeRect(28, 28, 200, 190); ctx.strokeRect(28, 250, 200, 230);
    ctx.fillStyle = '#c9a24a'; ctx.beginPath(); ctx.arc(212, 280, 10, 0, 7); ctx.fill();
    ctx.fillStyle = '#8a6a2a'; ctx.fillRect(206, 292, 12, 20);
  } else if (style === 'elevator') {
    ctx.fillStyle = '#8b8e90'; ctx.fillRect(0, 0, 256, 512);
    noise(ctx, 256, 512, 16);
    ctx.fillStyle = '#222'; ctx.fillRect(126, 0, 4, 512);
    for (let y = 0; y < 512; y += 6) { ctx.fillStyle = 'rgba(255,255,255,0.03)'; ctx.fillRect(0, y, 256, 1); }
  } else if (style === 'fire') {
    ctx.fillStyle = '#5b6066'; ctx.fillRect(0, 0, 256, 512);
    noise(ctx, 256, 512, 14);
    ctx.fillStyle = '#2a2e33'; ctx.fillRect(40, 250, 176, 14);
    ctx.fillStyle = '#c8c8c0'; ctx.fillRect(56, 60, 144, 90);
    ctx.fillStyle = '#1a6a3a'; ctx.font = 'bold 34px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('非常階段', 128, 118);
  } else if (style === 'house') {
    ctx.fillStyle = '#d8d4c8'; ctx.fillRect(0, 0, 256, 512);
    noise(ctx, 256, 512, 10);
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 5;
    ctx.strokeRect(34, 190, 188, 130); ctx.strokeRect(34, 340, 188, 140);
    ctx.fillStyle = '#0a0c0e'; ctx.fillRect(56, 36, 144, 130);
    ctx.fillStyle = '#d8d4c8'; ctx.fillRect(124, 36, 8, 130);
    ctx.fillStyle = '#b09a5a'; ctx.beginPath(); ctx.arc(208, 300, 10, 0, 7); ctx.fill();
    for (let i = 0; i < 4; i++) wrapBlotch(ctx, 256, 512, rnd() * 256, 380 + rnd() * 130, 30, 'rgba(40,40,35,A)', 0.25);
  } else if (style === 'white') {
    ctx.fillStyle = '#f4f4f2'; ctx.fillRect(0, 0, 256, 512);
    noise(ctx, 256, 512, 4);
    ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 4; ctx.strokeRect(14, 14, 228, 484);
    ctx.fillStyle = '#b8b8b2'; ctx.beginPath(); ctx.arc(212, 270, 9, 0, 7); ctx.fill();
  } else if (style === 'megbase') {
    ctx.fillStyle = '#39424c'; ctx.fillRect(0, 0, 256, 512);
    noise(ctx, 256, 512, 16);
    ctx.strokeStyle = '#1c2228'; ctx.lineWidth = 10; ctx.strokeRect(10, 10, 236, 492);
    ctx.fillStyle = '#2878c8'; ctx.font = 'bold 44px monospace'; ctx.textAlign = 'center'; ctx.fillText('M.E.G.', 128, 110);
    ctx.font = 'bold 26px sans-serif'; ctx.fillText('BASE BETA', 128, 150);
    ctx.fillStyle = '#9aa0a6'; ctx.fillRect(196, 260, 30, 12);
  } else if (style === 'metal') {
    ctx.fillStyle = '#55524c'; ctx.fillRect(0, 0, 256, 512);
    noise(ctx, 256, 512, 26, false);
    ctx.strokeStyle = '#2a2622'; ctx.lineWidth = 8; ctx.strokeRect(10, 10, 236, 492);
    ctx.fillStyle = '#111'; ctx.fillRect(80, 70, 96, 110); // 小窓(向こうは真っ黒)
    ctx.strokeStyle = '#777'; ctx.lineWidth = 4; ctx.strokeRect(80, 70, 96, 110);
    ctx.fillStyle = '#9a8f78'; ctx.fillRect(196, 250, 30, 12);
    for (let i = 0; i < 5; i++) wrapBlotch(ctx, 256, 512, rnd() * 256, rnd() * 512, 30, 'rgba(120,55,15,A)', 0.3);
  } else {
    ctx.fillStyle = '#4e4a44'; ctx.fillRect(0, 0, 256, 512);
    noise(ctx, 256, 512, 24, false);
    ctx.strokeStyle = '#2a2622'; ctx.lineWidth = 10; ctx.strokeRect(12, 12, 232, 488);
    ctx.strokeStyle = '#8a7b62'; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.arc(128, 256, 60, 0, 7); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(68, 256); ctx.lineTo(188, 256); ctx.moveTo(128, 196); ctx.lineTo(128, 316); ctx.stroke();
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
  // 暗がりに浮かぶ笑顔：ぼんやり光る目と、不ぞろいな歯の並んだ大きすぎる口
  const [c, ctx] = canvas(512, 512);
  ctx.clearRect(0, 0, 512, 512);
  const glow = (x, y, r, a) => { const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `rgba(255,255,245,${a})`); g.addColorStop(1, 'rgba(255,255,245,0)'); ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); };
  // 目：わずかに非対称なアーモンド形。中心が一番明るい
  for (const [x, y, rot] of [[165, 178, -0.12], [350, 172, 0.1]]) {
    glow(x, y, 42, 0.28);
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
    ctx.shadowColor = '#fff'; ctx.shadowBlur = 24; ctx.fillStyle = 'rgba(255,255,248,0.95)';
    ctx.beginPath(); ctx.moveTo(-32, 2); ctx.quadraticCurveTo(-2, -22, 32, -2); ctx.quadraticCurveTo(2, 16, -32, 2); ctx.fill();
    ctx.shadowBlur = 0; ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.beginPath(); ctx.ellipse(3, 0, 3, 7, 0, 0, 7); ctx.fill();
    ctx.restore();
  }
  // 口：頬の端まで裂けた弧
  glow(256, 345, 120, 0.1);
  ctx.save();
  ctx.shadowColor = '#fff'; ctx.shadowBlur = 12;
  ctx.fillStyle = 'rgba(255,255,245,0.92)';
  ctx.beginPath(); ctx.moveTo(50, 262); ctx.bezierCurveTo(130, 420, 382, 420, 468, 256);
  ctx.bezierCurveTo(380, 360, 132, 362, 50, 262); ctx.fill();
  ctx.restore();
  // 歯と歯の隙間(黒い線)。一本ずつ長さと傾きが違う
  ctx.fillStyle = 'rgba(0,0,0,0.9)';
  let s = 7; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const mouth = (t) => { const u = 1 - t; return [u * u * u * 50 + 3 * u * u * t * 130 + 3 * u * t * t * 382 + t * t * t * 468, u * u * u * 262 + 3 * u * u * t * 390 + 3 * u * t * t * 390 + t * t * t * 256]; };
  for (let i = 1; i < 22; i++) {
    const t = i / 22 + (rnd() - 0.5) * 0.012;
    const [x, y] = mouth(t);
    const h = 26 + rnd() * 22 + Math.sin(t * Math.PI) * 26;
    ctx.save(); ctx.translate(x, y); ctx.rotate((t - 0.5) * 0.9 + (rnd() - 0.5) * 0.12);
    ctx.fillRect(-1.6, -h * 0.95, 3.2, h);
    ctx.restore();
  }
  // 上下の歯列の境目
  ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineWidth = 3.5;
  ctx.beginPath();
  for (let i = 0; i <= 40; i++) { const t = i / 40; const [x, y] = mouth(t); const yy = y - 6 - Math.sin(t * Math.PI) * 16; i ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy); }
  ctx.stroke();
  return c;
}

function eyesTex() {
  const [c, ctx] = canvas(128, 64);
  ctx.fillStyle = '#fff'; ctx.shadowColor = '#fff'; ctx.shadowBlur = 10;
  for (const x of [44, 84]) { ctx.beginPath(); ctx.arc(x, 32, 5, 0, 7); ctx.fill(); }
  return c;
}

/* ---------- 壁の貼り物・小物 ---------- */
function chalk(ctx, draw, color = 'rgba(235,235,225,0.85)') {
  ctx.save(); ctx.strokeStyle = color; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (let k = 0; k < 3; k++) { ctx.lineWidth = 7 - k * 2; ctx.globalAlpha = 0.35 + k * 0.25; ctx.translate((rnd() - 0.5) * 2, (rnd() - 0.5) * 2); draw(); }
  ctx.restore();
}
function roadSign(left) {
  const [c, ctx] = canvas(256, 128);
  ctx.fillStyle = '#e8e8e0'; ctx.fillRect(0, 0, 256, 128);
  ctx.fillStyle = '#1e5a36'; ctx.fillRect(5, 5, 246, 118);
  ctx.fillStyle = '#f2f2ea'; ctx.font = 'bold 34px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('郊外の外れ', left ? 148 : 108, 44);
  ctx.font = 'bold 20px sans-serif'; ctx.fillText('OUTSKIRTS', left ? 148 : 108, 86);
  ctx.beginPath();
  if (left) { ctx.moveTo(14, 64); ctx.lineTo(50, 30); ctx.lineTo(50, 50); ctx.lineTo(62, 50); ctx.lineTo(62, 78); ctx.lineTo(50, 78); ctx.lineTo(50, 98); }
  else { ctx.moveTo(242, 64); ctx.lineTo(206, 30); ctx.lineTo(206, 50); ctx.lineTo(194, 50); ctx.lineTo(194, 78); ctx.lineTo(206, 78); ctx.lineTo(206, 98); }
  ctx.fill();
  noise(ctx, 256, 128, 10);
  return c;
}

const DECALS = {
  arrow: () => { const [c, ctx] = canvas(256, 128); chalk(ctx, () => { ctx.beginPath(); ctx.moveTo(20, 64); ctx.lineTo(220, 64); ctx.moveTo(170, 24); ctx.lineTo(225, 64); ctx.lineTo(170, 104); ctx.stroke(); }); return c; },
  megArrow: () => { const [c, ctx] = canvas(256, 128); chalk(ctx, () => { ctx.beginPath(); ctx.moveTo(20, 64); ctx.lineTo(220, 64); ctx.moveTo(170, 24); ctx.lineTo(225, 64); ctx.lineTo(170, 104); ctx.stroke(); }, 'rgba(70,150,235,0.9)'); return c; },
  cross: () => {
    const [c, ctx] = canvas(256, 256);
    chalk(ctx, () => { ctx.beginPath(); ctx.moveTo(50, 40); ctx.lineTo(206, 180); ctx.moveTo(206, 40); ctx.lineTo(50, 180); ctx.stroke(); }, 'rgba(230,80,60,0.85)');
    ctx.fillStyle = 'rgba(235,230,220,0.85)'; ctx.font = 'bold 40px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('開けるな', 128, 238);
    return c;
  },
  engrave: () => {
    const [c, ctx] = canvas(256, 256);
    ctx.font = 'bold 170px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillText('Ⅲ', 131, 133);
    ctx.fillStyle = 'rgba(0,0,0,0.85)'; ctx.fillText('Ⅲ', 128, 128);
    return c;
  },
  exitGreen: () => {
    const [c, ctx] = canvas(256, 96);
    ctx.fillStyle = '#0f7a3a'; ctx.fillRect(0, 0, 256, 96);
    ctx.fillStyle = '#e8fff0'; ctx.fillRect(10, 10, 76, 76);
    ctx.fillStyle = '#0f7a3a';
    ctx.beginPath(); ctx.arc(52, 26, 7, 0, 7); ctx.fill();
    ctx.lineWidth = 7; ctx.strokeStyle = '#0f7a3a'; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(48, 36); ctx.lineTo(42, 58); ctx.lineTo(28, 76); ctx.moveTo(42, 58); ctx.lineTo(58, 72); ctx.moveTo(46, 42); ctx.lineTo(64, 50); ctx.moveTo(46, 42); ctx.lineTo(30, 50); ctx.stroke();
    ctx.fillStyle = '#e8fff0'; ctx.font = 'bold 40px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('避難所', 170, 50);
    return c;
  },
  meg: () => {
    const [c, ctx] = canvas(256, 128);
    ctx.fillStyle = 'rgba(40,120,200,0.8)'; ctx.font = 'bold 56px monospace'; ctx.textAlign = 'center'; ctx.fillText('M.E.G.', 128, 60);
    ctx.font = 'bold 22px sans-serif'; ctx.fillText('主要探索者グループ', 128, 100);
    return c;
  },
  window: () => {
    const [c, ctx] = canvas(256, 256);
    ctx.fillStyle = '#6a665c'; ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = '#050505'; ctx.fillRect(14, 14, 228, 228);
    ctx.fillStyle = '#6a665c'; ctx.fillRect(124, 14, 8, 228); ctx.fillRect(14, 124, 228, 8);
    return c;
  },
  crate: () => {
    const [c, ctx] = canvas(128, 128);
    ctx.fillStyle = '#8a6a40'; ctx.fillRect(0, 0, 128, 128); noise(ctx, 128, 128, 30);
    ctx.strokeStyle = '#4a3620'; ctx.lineWidth = 8; ctx.strokeRect(4, 4, 120, 120);
    ctx.beginPath(); ctx.moveTo(8, 8); ctx.lineTo(120, 120); ctx.stroke();
    ctx.fillStyle = 'rgba(20,20,20,0.6)'; ctx.font = 'bold 18px monospace'; ctx.fillText('SUPPLY', 30, 70);
    return c;
  },
  desk: () => {
    const [c, ctx] = canvas(128, 128);
    ctx.fillStyle = '#8c8578'; ctx.fillRect(0, 0, 128, 128); noise(ctx, 128, 128, 12);
    ctx.fillStyle = '#5a5650'; ctx.fillRect(0, 0, 128, 8);
    return c;
  },
  machine: () => {
    const [c, ctx] = canvas(256, 256);
    ctx.fillStyle = '#4a5048'; ctx.fillRect(0, 0, 256, 256); noise(ctx, 256, 256, 20);
    ctx.fillStyle = '#1a1a1a'; for (let y = 30; y < 120; y += 12) ctx.fillRect(30, y, 196, 5);
    ctx.fillStyle = '#c8a82a'; ctx.fillRect(0, 216, 256, 40);
    ctx.fillStyle = '#111'; for (let x = -40; x < 300; x += 40) { ctx.beginPath(); ctx.moveTo(x, 256); ctx.lineTo(x + 20, 256); ctx.lineTo(x + 60, 216); ctx.lineTo(x + 40, 216); ctx.fill(); }
    for (const x of [70, 128, 186]) { ctx.fillStyle = '#ddd'; ctx.beginPath(); ctx.arc(x, 165, 18, 0, 7); ctx.fill(); ctx.strokeStyle = '#a00'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x, 165); ctx.lineTo(x + 12, 155); ctx.stroke(); }
    return c;
  },
  cooler: () => {
    const [c, ctx] = canvas(128, 256);
    ctx.fillStyle = '#e8e6e0'; ctx.fillRect(0, 0, 128, 256); noise(ctx, 128, 256, 8);
    ctx.fillStyle = 'rgba(120,170,220,0.85)'; ctx.fillRect(24, 4, 80, 90);
    ctx.fillStyle = '#b8c4c8'; ctx.fillRect(40, 130, 48, 20);
    ctx.fillStyle = '#333'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('アーモンド水', 64, 190);
    return c;
  },
  breaker: () => {
    const [c, ctx] = canvas(256, 256);
    ctx.fillStyle = '#6a6e70'; ctx.fillRect(0, 0, 256, 256); noise(ctx, 256, 256, 14);
    ctx.fillStyle = '#c82a1a'; ctx.fillRect(20, 20, 216, 40);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 26px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('主電源 ブレーカー', 128, 50);
    for (let i = 0; i < 4; i++) { ctx.fillStyle = '#222'; ctx.fillRect(40 + i * 48, 90, 30, 120); ctx.fillStyle = '#ddd'; ctx.fillRect(44 + i * 48, 170, 22, 30); }
    return c;
  },
  keypad: () => {
    const [c, ctx] = canvas(128, 192);
    ctx.fillStyle = '#2a2c30'; ctx.fillRect(0, 0, 128, 192);
    ctx.fillStyle = '#0a2a14'; ctx.fillRect(14, 12, 100, 30);
    ctx.fillStyle = '#9a9a96';
    for (let r = 0; r < 4; r++) for (let k = 0; k < 3; k++) ctx.fillRect(18 + k * 32, 54 + r * 33, 26, 26);
    return c;
  },
  hazard: () => {
    const [c, ctx] = canvas(256, 192);
    ctx.fillStyle = '#e0c02a'; ctx.fillRect(0, 0, 256, 192);
    ctx.fillStyle = '#111'; ctx.beginPath(); ctx.moveTo(128, 18); ctx.lineTo(200, 130); ctx.lineTo(56, 130); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#e0c02a'; ctx.beginPath(); ctx.moveTo(135, 50); ctx.lineTo(112, 95); ctx.lineTo(130, 95); ctx.lineTo(118, 122); ctx.lineTo(150, 80); ctx.lineTo(132, 80); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#111'; ctx.font = 'bold 36px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('高電圧 危険', 128, 176);
    return c;
  },
  sludge: () => {
    const [c, ctx] = canvas(128, 128);
    const g = ctx.createRadialGradient(64, 64, 10, 64, 64, 62);
    g.addColorStop(0, 'rgba(5,5,8,0.98)'); g.addColorStop(0.75, 'rgba(8,8,12,0.9)'); g.addColorStop(1, 'rgba(8,8,12,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(64, 64, 62, 50, 0.3, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(120,120,160,0.25)'; ctx.beginPath(); ctx.ellipse(50, 50, 16, 6, 0.4, 0, 7); ctx.fill();
    return c;
  },
  web: () => {
    const [c, ctx] = canvas(256, 256);
    ctx.strokeStyle = 'rgba(235,235,230,0.7)'; ctx.lineWidth = 1.4;
    const cx = 128 + (rnd() - 0.5) * 30, cy = 128 + (rnd() - 0.5) * 30, spokes = 11;
    const ang = [...Array(spokes)].map((_, i) => (i / spokes) * Math.PI * 2 + (rnd() - 0.5) * 0.3);
    for (const a of ang) { ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * 180, cy + Math.sin(a) * 180); ctx.stroke(); }
    for (let r = 12; r < 130; r += 9 + rnd() * 5) {
      ctx.beginPath();
      ang.forEach((a, i) => { const rr = r * (0.9 + rnd() * 0.2); const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
      ctx.closePath(); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(230,230,225,0.25)'; for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(cx + (rnd() - 0.5) * 120, cy + (rnd() - 0.5) * 120, 3 + rnd() * 6, 0, 7); ctx.fill(); }
    return c;
  },
  puddle: () => {
    const [c, ctx] = canvas(128, 128);
    const g = ctx.createRadialGradient(64, 64, 6, 64, 64, 62);
    g.addColorStop(0, 'rgba(40,60,70,0.85)'); g.addColorStop(0.7, 'rgba(30,45,55,0.6)'); g.addColorStop(1, 'rgba(30,45,55,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(64, 64, 62, 44, rnd(), 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(200,220,230,0.18)'; ctx.beginPath(); ctx.ellipse(48, 52, 18, 5, 0.3, 0, 7); ctx.fill();
    return c;
  },
  seep: () => {
    const [c, ctx] = canvas(128, 256);
    for (let i = 0; i < 14; i++) {
      const x = 10 + rnd() * 108, g = ctx.createLinearGradient(0, 0, 0, 256);
      g.addColorStop(0, 'rgba(20,35,40,0)'); g.addColorStop(0.3, 'rgba(20,35,40,0.6)'); g.addColorStop(1, 'rgba(20,35,40,0.9)');
      ctx.fillStyle = g; ctx.fillRect(x, 40 + rnd() * 80, 2 + rnd() * 5, 256);
    }
    return c;
  },
  rope: () => {
    const [c, ctx] = canvas(64, 512);
    ctx.fillStyle = '#8a7148'; ctx.fillRect(24, 0, 16, 512);
    ctx.strokeStyle = 'rgba(40,28,14,0.8)'; ctx.lineWidth = 2;
    for (let y = 0; y < 512; y += 10) { ctx.beginPath(); ctx.moveTo(24, y); ctx.lineTo(40, y + 8); ctx.stroke(); }
    for (let y = 60; y < 512; y += 90) { ctx.fillStyle = '#6a5436'; ctx.beginPath(); ctx.ellipse(32, y, 13, 9, 0, 0, 7); ctx.fill(); }
    return c;
  },
  bell: () => {
    const [c, ctx] = canvas(128, 128);
    ctx.fillStyle = '#3a2416'; ctx.fillRect(0, 88, 128, 40);
    ctx.fillStyle = '#d8b050'; ctx.beginPath(); ctx.arc(64, 84, 34, Math.PI, 0); ctx.fill(); ctx.fillRect(28, 82, 72, 8);
    ctx.fillStyle = '#f0d890'; ctx.beginPath(); ctx.arc(64, 46, 6, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.ellipse(50, 66, 6, 12, -0.4, 0, 7); ctx.fill();
    return c;
  },
  roadsignR: () => roadSign(false),
  roadsignL: () => roadSign(true),
  watcher: () => {
    // 窓の奥に立つ人影(近所の見張り)
    const [c, ctx] = canvas(128, 128);
    ctx.fillStyle = '#e6e2d6'; ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = '#05070a'; ctx.fillRect(8, 8, 112, 112);
    ctx.fillStyle = 'rgba(70,74,82,0.9)';
    ctx.beginPath(); ctx.ellipse(64, 46, 13, 16, 0, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.moveTo(40, 120); ctx.quadraticCurveTo(44, 64, 64, 62); ctx.quadraticCurveTo(84, 64, 88, 120); ctx.fill();
    ctx.fillStyle = '#e6e2d6'; ctx.fillRect(62, 8, 4, 112);
    return c;
  },
  wheatview: () => {
    // 壊れた柵の向こうに広がる麦畑
    const [c, ctx] = canvas(256, 256);
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, '#0b0e14'); g.addColorStop(0.45, '#1a1d22'); g.addColorStop(0.5, '#4a4230'); g.addColorStop(1, '#2a2418');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 900; i++) { const x = rnd() * 256, y = 120 + rnd() * 136; ctx.strokeStyle = `rgba(${150 + rnd() * 60 | 0},${130 + rnd() * 50 | 0},${70 + rnd() * 30 | 0},0.5)`; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (rnd() - 0.5) * 4, y - 6 - rnd() * 10); ctx.stroke(); }
    ctx.fillStyle = '#3a2e22';
    for (const x of [10, 100, 190]) { ctx.fillRect(x, 150, 10, 106); }
    ctx.save(); ctx.translate(20, 190); ctx.rotate(0.35); ctx.fillRect(0, 0, 90, 8); ctx.restore();
    ctx.fillRect(110, 185, 90, 8);
    return c;
  },
  tracks: () => {
    // 轍(タイヤの跡)
    const [c, ctx] = canvas(128, 128);
    for (const x of [30, 90]) {
      ctx.fillStyle = 'rgba(30,22,14,0.55)'; ctx.fillRect(x - 9, 0, 18, 128);
      ctx.fillStyle = 'rgba(15,10,6,0.5)'; for (let y = 0; y < 128; y += 8) ctx.fillRect(x - 8, y, 16, 3);
    }
    return c;
  },
  soil: () => {
    const [c, ctx] = canvas(128, 128);
    const g = ctx.createRadialGradient(64, 64, 6, 64, 64, 62);
    g.addColorStop(0, 'rgba(20,14,8,0.95)'); g.addColorStop(0.7, 'rgba(35,24,14,0.8)'); g.addColorStop(1, 'rgba(35,24,14,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(64, 64, 62, 54, 0.2, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(150,90,80,0.55)'; ctx.lineWidth = 2;
    for (let i = 0; i < 9; i++) { ctx.beginPath(); const x = 30 + rnd() * 68, y = 30 + rnd() * 68; ctx.moveTo(x, y); ctx.quadraticCurveTo(x + (rnd() - 0.5) * 20, y + (rnd() - 0.5) * 20, x + (rnd() - 0.5) * 24, y + (rnd() - 0.5) * 24); ctx.stroke(); }
    return c;
  },
  cityview: () => {
    // 木立の切れ目から見える、遠くの街の灯り
    const [c, ctx] = canvas(256, 256);
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, '#6f757a'); g.addColorStop(0.55, '#8d9092'); g.addColorStop(0.56, '#3a3c3e'); g.addColorStop(1, '#2a2b2c');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256);
    for (let x = 0; x < 256; x += 14 + rnd() * 10) { const h = 30 + rnd() * 70; ctx.fillStyle = `rgba(60,64,70,${0.5 + rnd() * 0.3})`; ctx.fillRect(x, 142 - h, 12 + rnd() * 10, h); }
    ctx.fillStyle = '#555'; ctx.beginPath(); ctx.moveTo(96, 256); ctx.lineTo(118, 144); ctx.lineTo(138, 144); ctx.lineTo(160, 256); ctx.fill();
    ctx.fillStyle = '#ddd'; for (let y = 150; y < 256; y += 18) ctx.fillRect(126, y, 4, 8 + (y - 150) / 10);
    // 木立の切れ目(縁は葉に覆われている)
    for (let i = 0; i < 500; i++) {
      const edge = rnd() < 0.5 ? (rnd() < 0.5 ? rnd() * 40 : 216 + rnd() * 40) : null;
      const x = edge ?? rnd() * 256, y = edge === null ? rnd() * 50 : rnd() * 256;
      const v = rnd();
      ctx.fillStyle = `rgba(${40 + v * 50 | 0},${60 + v * 60 | 0},${30 + v * 30 | 0},0.85)`;
      ctx.beginPath(); ctx.ellipse(x, y, 4 + rnd() * 6, 2 + rnd() * 4, rnd() * 3, 0, 7); ctx.fill();
    }
    return c;
  },
  shopWindow: () => {
    // 1階のガラス窓(内側は暗い)
    const [c, ctx] = canvas(256, 192);
    ctx.fillStyle = '#9a9c98'; ctx.fillRect(0, 0, 256, 192);
    ctx.fillStyle = '#0b0e12'; ctx.fillRect(10, 10, 236, 172);
    const g = ctx.createLinearGradient(0, 0, 256, 192);
    g.addColorStop(0, 'rgba(160,180,200,0.18)'); g.addColorStop(0.4, 'rgba(160,180,200,0.02)'); g.addColorStop(0.6, 'rgba(160,180,200,0.12)'); g.addColorStop(1, 'rgba(160,180,200,0)');
    ctx.fillStyle = g; ctx.fillRect(10, 10, 236, 172);
    ctx.fillStyle = '#9a9c98'; ctx.fillRect(124, 10, 8, 172);
    return c;
  },
  barn: () => {
    const [c, ctx] = canvas(256, 256);
    ctx.fillStyle = '#6a2a1e'; ctx.fillRect(0, 0, 256, 256);
    for (let x = 0; x < 256; x += 21) { ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x, 0, 3, 256); ctx.fillStyle = `rgba(${120 + rnd() * 40 | 0},50,30,0.25)`; ctx.fillRect(x + 4, 0, 14, 256); }
    noise(ctx, 256, 256, 26);
    ctx.strokeStyle = '#d8d0c0'; ctx.lineWidth = 7; ctx.strokeRect(60, 70, 136, 186);
    ctx.beginPath(); ctx.moveTo(60, 70); ctx.lineTo(196, 256); ctx.moveTo(196, 70); ctx.lineTo(60, 256); ctx.stroke();
    ctx.fillStyle = '#2a1a12'; ctx.fillRect(0, 0, 256, 12);
    return c;
  },
  wfurn: () => {
    const [c, ctx] = canvas(128, 128);
    ctx.fillStyle = '#e8e6e0'; ctx.fillRect(0, 0, 128, 128); noise(ctx, 128, 128, 6);
    ctx.strokeStyle = 'rgba(0,0,0,0.10)'; ctx.lineWidth = 4; ctx.strokeRect(2, 2, 124, 124);
    for (let i = 0; i < 3; i++) crack(ctx, rnd() * 128, rnd() * 128, 6 + rnd() * 8, 'rgba(90,90,85,0.35)');
    return c;
  },
  doormat: () => {
    // 鍵の開いている家の玄関マット
    const [c, ctx] = canvas(256, 128);
    ctx.fillStyle = '#5a3a22'; ctx.fillRect(8, 8, 240, 112);
    for (let i = 0; i < 1400; i++) { ctx.fillStyle = rnd() < 0.5 ? 'rgba(30,18,10,0.4)' : 'rgba(140,100,60,0.3)'; ctx.fillRect(8 + rnd() * 240, 8 + rnd() * 112, 1, 2); }
    ctx.strokeStyle = '#2e1d10'; ctx.lineWidth = 6; ctx.strokeRect(14, 14, 228, 100);
    ctx.fillStyle = 'rgba(225,205,160,0.85)'; ctx.font = 'bold 40px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('WELCOME', 128, 66);
    return c;
  },
  paper: () => {
    const [c, ctx] = canvas(64, 64);
    ctx.fillStyle = '#e8e0c0'; ctx.fillRect(4, 4, 56, 56);
    ctx.fillStyle = 'rgba(40,40,40,0.6)'; for (let y = 14; y < 56; y += 7) ctx.fillRect(10, y, 40 - rnd() * 14, 2);
    return c;
  },
};

// ホワイトボードや掲示物(文字入り)
export function boardTexture(lines, { bg = '#f2f2ee', fg = '#1a2a6a', title = '', w = 512, h = 320 } = {}) {
  const [c, ctx] = canvas(w, h);
  ctx.fillStyle = '#888'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = bg; ctx.fillRect(10, 10, w - 20, h - 20);
  ctx.fillStyle = 'rgba(0,0,0,0.05)'; for (let i = 0; i < 6; i++) ctx.fillRect(rnd() * w, rnd() * h, 80, 30);
  let y = 50;
  if (title) { ctx.fillStyle = '#a01a1a'; ctx.font = 'bold 34px sans-serif'; ctx.fillText(title, 30, y); y += 48; }
  ctx.fillStyle = fg; ctx.font = '28px sans-serif';
  for (const l of lines) { ctx.save(); ctx.translate(30, y); ctx.rotate((rnd() - 0.5) * 0.03); ctx.fillText(l, 0, 0); ctx.restore(); y += 40; }
  return toTex(c, { repeat: false });
}

const decalCache = {};
export function getDecal(name) {
  if (!decalCache[name]) decalCache[name] = toTex(DECALS[name](), { repeat: false });
  return decalCache[name];
}

const cache = {};
export function getTextures(theme) {
  if (cache[theme]) return cache[theme];
  rnd = mulberry32(theme.length * 999 + 7);
  let t;
  if (theme === 'lobby') t = { wall: lobbyWall(), floor: lobbyFloor(), ceil: lobbyCeiling(), pillar: lobbyWall() };
  else if (theme === 'parking') t = { wall: parkingWall(), floor: parkingFloor(), ceil: parkingCeiling(), pillar: parkingPillar() };
  else if (theme === 'station') t = { wall: stationWall(), floor: stationFloor(), ceil: stationCeiling(), pillar: stationWall() };
  else if (theme === 'office') t = { wall: officeWall(), floor: officeFloor(), ceil: officeCeiling(), pillar: officeWall() };
  else if (theme === 'hotel') t = { wall: hotelWall(), floor: hotelFloor(), ceil: hotelCeiling(), pillar: hotelWall() };
  else if (theme === 'dark') t = { wall: darkWall(), floor: darkFloor(), ceil: darkCeiling(), pillar: darkWall() };
  else if (theme === 'flooded') t = { wall: floodWall(), floor: floodFloor(), ceil: floodCeiling(), pillar: floodWall() };
  else if (theme === 'cave') t = { wall: caveWall(), floor: caveFloor(), ceil: caveCeiling(), pillar: caveWall() };
  else if (theme === 'suburb') t = { wall: suburbWall(), floor: suburbFloor(), ceil: darkCeiling(), pillar: barkWall() };
  else if (theme === 'field') t = { wall: hedgeWall(), floor: dirtFloor(), ceil: darkCeiling(), pillar: hedgeWall() };
  else if (theme === 'city') t = { wall: cityWall(), floor: cityFloor(), ceil: darkCeiling(), pillar: cityWall() };
  else if (theme === 'white') t = { wall: whiteWall(), floor: whiteFloor(), ceil: whiteFloor(), pillar: whiteWall() };
  else t = { wall: pipesWall(), floor: pipesFloor(), ceil: pipesCeiling(), pillar: pipesWall() };
  const out = {};
  for (const k in t) out[k] = toTex(t[k]);
  cache[theme] = out;
  return out;
}

const doorCache = {};
export function getDoorTexture(style) {
  if (!doorCache[style]) doorCache[style] = toTex(doorTex(style), { repeat: false });
  return doorCache[style];
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

// 客室番号のプレート
export function plateTexture(text, { bg = '#2a1a0e', fg = '#d8b458', w = 256, h = 96 } = {}) {
  const [c, ctx] = canvas(w, h);
  ctx.fillStyle = fg; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = bg; ctx.fillRect(6, 6, w - 12, h - 12);
  ctx.fillStyle = fg; ctx.font = `bold ${h * 0.6 | 0}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2 + 3);
  return toTex(c, { repeat: false });
}
