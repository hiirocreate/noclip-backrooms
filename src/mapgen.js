// 迷路(タイルマップ)の生成
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const FLOOR = 0, WALL = 1, PILLAR = 2;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export function generateMap(cfg, seed) {
  const rnd = mulberry32(seed);
  const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const [cw, ch] = cfg.cells;
  const W = cw * 2 + 1, H = ch * 2 + 1;
  const tiles = new Uint8Array(W * H).fill(WALL);
  const idx = (x, y) => y * W + x;
  const inside = (x, y) => x > 0 && y > 0 && x < W - 1 && y < H - 1;

  // 1) 穴掘り法で迷路
  const visited = new Uint8Array(cw * ch);
  const stack = [[0, 0]];
  visited[0] = 1;
  tiles[idx(1, 1)] = FLOOR;
  while (stack.length) {
    const [cx, cy] = stack[stack.length - 1];
    const opts = [];
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx, ny = cy + dy;
      if (nx >= 0 && ny >= 0 && nx < cw && ny < ch && !visited[ny * cw + nx]) opts.push([nx, ny, dx, dy]);
    }
    if (!opts.length) { stack.pop(); continue; }
    const [nx, ny, dx, dy] = opts[Math.floor(rnd() * opts.length)];
    visited[ny * cw + nx] = 1;
    tiles[idx(cx * 2 + 1 + dx, cy * 2 + 1 + dy)] = FLOOR;
    tiles[idx(nx * 2 + 1, ny * 2 + 1)] = FLOOR;
    stack.push([nx, ny]);
  }

  // 2) ループ化(壁を抜く)
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      if (tiles[idx(x, y)] !== WALL) continue;
      const horiz = x % 2 === 0 && y % 2 === 1;
      const vert = x % 2 === 1 && y % 2 === 0;
      if ((horiz || vert) && rnd() < cfg.braid * 0.5) tiles[idx(x, y)] = FLOOR;
    }
  }

  // 3) 大部屋
  const roomTiles = new Uint8Array(W * H);
  for (let r = 0; r < cfg.rooms; r++) {
    const rw = ri(cfg.roomSize[0], cfg.roomSize[1]) * 2 - 1;
    const rh = ri(cfg.roomSize[0], cfg.roomSize[1]) * 2 - 1;
    const rx = 1 + ri(0, Math.max(0, W - 2 - rw));
    const ry = 1 + ri(0, Math.max(0, H - 2 - rh));
    for (let y = ry; y < Math.min(H - 1, ry + rh); y++)
      for (let x = rx; x < Math.min(W - 1, rx + rw); x++) { tiles[idx(x, y)] = FLOOR; roomTiles[idx(x, y)] = 1; }
  }

  // 4) 柱(8近傍がすべて床の所だけ → 連結性は保たれる)
  for (let y = 2; y < H - 2; y++) {
    for (let x = 2; x < W - 2; x++) {
      if (!roomTiles[idx(x, y)] || rnd() > cfg.pillarChance) continue;
      let ok = true;
      for (let dy = -1; dy <= 1 && ok; dy++) for (let dx = -1; dx <= 1; dx++) if (tiles[idx(x + dx, y + dy)] !== FLOOR) { ok = false; break; }
      if (ok) tiles[idx(x, y)] = PILLAR;
    }
  }

  const start = { x: 1, y: 1 };
  const dist = bfs(tiles, W, H, start.x, start.y);

  // 5) 出口：スタートから最も遠い、壁に面した床
  let exit = null, best = -1;
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const d = dist[idx(x, y)];
    if (d < 0 || d <= best) continue;
    for (const [dx, dy] of DIRS) {
      if (tiles[idx(x + dx, y + dy)] === WALL) { best = d; exit = { x, y, dx, dy }; break; }
    }
  }

  // 6) 暗闇区画
  const dark = new Uint8Array(W * H);
  const floorList = [];
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) if (tiles[idx(x, y)] === FLOOR) floorList.push({ x, y });
  for (let z = 0; z < cfg.darkZones; z++) {
    let c = null;
    for (let t = 0; t < 60; t++) {
      const p = floorList[Math.floor(rnd() * floorList.length)];
      if (dist[idx(p.x, p.y)] > 10 && Math.abs(p.x - exit.x) + Math.abs(p.y - exit.y) > 5) { c = p; break; }
    }
    if (!c) continue;
    const rad = ri(3, 5);
    for (let y = c.y - rad; y <= c.y + rad; y++) for (let x = c.x - rad; x <= c.x + rad; x++)
      if (inside(x, y)) dark[idx(x, y)] = 1;
  }

  // 7) 照明
  const lamps = [];
  const L = cfg.lamp;
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    if (tiles[idx(x, y)] !== FLOOR || dark[idx(x, y)]) continue;
    if (x % L.pattern !== 1 || y % L.pattern !== 1) continue;
    const nearStart = Math.abs(x - start.x) + Math.abs(y - start.y) < 3;
    if (!nearStart && rnd() > L.density) continue;
    let state = 'on';
    const r = rnd();
    if (!nearStart) { if (r < L.broken) state = 'off'; else if (r < L.broken + L.flicker) state = 'flicker'; }
    lamps.push({ x, y, state });
  }
  // 出口の真上は必ず点灯
  if (!lamps.some(l => l.x === exit.x && l.y === exit.y)) lamps.push({ x: exit.x, y: exit.y, state: 'on' });

  // 8) アイテム配置
  const used = new Set([idx(start.x, start.y), idx(exit.x, exit.y)]);
  const pick = (minDist, avoid, preferDark = false) => {
    let bestP = null, bestScore = -1;
    for (let t = 0; t < 80; t++) {
      const p = floorList[Math.floor(rnd() * floorList.length)];
      const k = idx(p.x, p.y);
      if (used.has(k) || dist[k] < minDist) continue;
      let md = 999;
      for (const a of avoid) md = Math.min(md, Math.abs(a.x - p.x) + Math.abs(a.y - p.y));
      let score = Math.min(md, 30) + rnd() * 4 + (preferDark && dark[k] ? 8 : 0);
      if (score > bestScore) { bestScore = score; bestP = p; }
    }
    if (bestP) used.add(idx(bestP.x, bestP.y));
    return bestP;
  };
  const keys = [];
  for (let i = 0; i < cfg.key.count; i++) {
    const p = pick(8, [...keys, exit, start], i === cfg.key.count - 1 && cfg.darkZones > 0);
    if (p) keys.push(p);
  }
  const pickups = [];
  for (let i = 0; i < cfg.batteries; i++) { const p = pick(3, pickups.concat(keys)); if (p) pickups.push({ ...p, kind: 'battery' }); }
  for (let i = 0; i < cfg.waters; i++) { const p = pick(4, pickups.concat(keys)); if (p) pickups.push({ ...p, kind: 'water' }); }
  const notes = [];
  cfg.notes.forEach((_, i) => {
    const p = pick(i === 0 ? 2 : 10, notes.concat(keys));
    if (p) notes.push({ ...p, note: i });
  });
  // 最初のメモはスタート付近に
  if (notes[0]) {
    for (const [dx, dy] of DIRS) {
      const x = start.x + dx, y = start.y + dy;
      if (tiles[idx(x, y)] === FLOOR) { used.delete(idx(notes[0].x, notes[0].y)); notes[0].x = x; notes[0].y = y; break; }
    }
  }

  return { W, H, tiles, dist, start, exit, dark, lamps, keys, pickups, notes, floorList, roomTiles };
}

export function bfs(tiles, W, H, sx, sy) {
  const dist = new Int32Array(W * H).fill(-1);
  const q = new Int32Array(W * H);
  let h = 0, t = 0;
  dist[sy * W + sx] = 0; q[t++] = sy * W + sx;
  while (h < t) {
    const c = q[h++]; const cx = c % W, cy = (c / W) | 0;
    for (const [dx, dy] of DIRS) {
      const n = (cy + dy) * W + cx + dx;
      if (tiles[n] === FLOOR && dist[n] < 0) { dist[n] = dist[c] + 1; q[t++] = n; }
    }
  }
  return dist;
}
