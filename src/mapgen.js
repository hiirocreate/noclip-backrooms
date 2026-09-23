// 迷路(タイルマップ)の生成と、レベル側で使う配置ヘルパー
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// タイル種別
export const FLOOR = 0, WALL = 1, PILLAR = 2, PROP = 3;
export const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/**
 * m: レベル定義の map パラメータ
 *  cells[w,h], braid, rooms, roomSize[min,max], pillarChance, pillarGrid(大部屋を柱の格子にする割合),
 *  darkZones, lamp{pattern,density,broken,flicker}, sector(照明回路の区画サイズ)
 */
export function generateMap(m, seed) {
  const rnd = mulberry32(seed);
  const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const [cw, ch] = m.cells;
  const W = cw * 2 + 1, H = ch * 2 + 1;
  const tiles = new Uint8Array(W * H).fill(WALL);
  const idx = (x, y) => y * W + x;
  const inside = (x, y) => x > 0 && y > 0 && x < W - 1 && y < H - 1;

  // 1) 穴掘り法で「完全迷路」を作る(どの2点も必ずつながる)
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

  // 2) ループ化。ここで開けた壁は「閉じても連結が切れない」ので、組み替わる壁に使える
  const braidOpen = [];
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    if (tiles[idx(x, y)] !== WALL) continue;
    const horiz = x % 2 === 0 && y % 2 === 1;
    const vert = x % 2 === 1 && y % 2 === 0;
    if ((horiz || vert) && rnd() < m.braid * 0.5) { tiles[idx(x, y)] = FLOOR; braidOpen.push({ x, y }); }
  }

  // 3) 大部屋
  const roomTiles = new Uint8Array(W * H);
  const rooms = [];
  for (let r = 0; r < (m.rooms || 0); r++) {
    const rw = ri(m.roomSize[0], m.roomSize[1]) * 2 - 1;
    const rh = ri(m.roomSize[0], m.roomSize[1]) * 2 - 1;
    const rx = 1 + ri(0, Math.max(0, W - 2 - rw));
    const ry = 1 + ri(0, Math.max(0, H - 2 - rh));
    const room = { x: rx, y: ry, w: Math.min(rw, W - 1 - rx), h: Math.min(rh, H - 1 - ry), grid: rnd() < (m.pillarGrid || 0) };
    rooms.push(room);
    for (let y = room.y; y < room.y + room.h; y++) for (let x = room.x; x < room.x + room.w; x++) {
      tiles[idx(x, y)] = FLOOR; roomTiles[idx(x, y)] = rooms.length;
    }
  }
  // 部屋を開けたことで braidOpen の一部は部屋の一部になる → 組み替え対象から外す
  const braid = braidOpen.filter(b => !roomTiles[idx(b.x, b.y)]);

  // 4) 柱(8近傍がすべて床の所だけ置くので連結性は保たれる)
  const canPillar = (x, y) => {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (tiles[idx(x + dx, y + dy)] !== FLOOR) return false;
    return true;
  };
  for (const room of rooms) {
    for (let y = room.y + 1; y < room.y + room.h - 1; y++) for (let x = room.x + 1; x < room.x + room.w - 1; x++) {
      if (x < 2 || y < 2 || x > W - 3 || y > H - 3) continue;
      const want = room.grid ? ((x - room.x) % 2 === 1 && (y - room.y) % 2 === 1) : rnd() < (m.pillarChance || 0);
      if (want && canPillar(x, y)) tiles[idx(x, y)] = PILLAR;
    }
  }

  const start = { x: 1, y: 1 };
  const dist = bfs(tiles, W, H, start.x, start.y);

  const floorList = [];
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) if (tiles[idx(x, y)] === FLOOR) floorList.push({ x, y });

  // 5) 暗闇区画
  const dark = new Uint8Array(W * H);
  for (let z = 0; z < (m.darkZones || 0); z++) {
    let c = null;
    for (let t = 0; t < 60; t++) {
      const p = floorList[Math.floor(rnd() * floorList.length)];
      if (dist[idx(p.x, p.y)] > 10) { c = p; break; }
    }
    if (!c) continue;
    const rad = ri(3, 5);
    for (let y = c.y - rad; y <= c.y + rad; y++) for (let x = c.x - rad; x <= c.x + rad; x++)
      if (inside(x, y)) dark[idx(x, y)] = 1;
  }

  // 6) 照明(回路 = 区画ごとにまとめて点いたり消えたりする)
  const lamps = [];
  const L = m.lamp;
  const sector = m.sector || 6;
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    if (tiles[idx(x, y)] !== FLOOR || dark[idx(x, y)]) continue;
    if (x % L.pattern !== 1 || y % L.pattern !== 1) continue;
    const nearStart = Math.abs(x - start.x) + Math.abs(y - start.y) < 3;
    if (!nearStart && rnd() > L.density) continue;
    let state = 'on';
    const r = rnd();
    if (!nearStart) { if (r < L.broken) state = 'off'; else if (r < L.broken + L.flicker) state = 'flicker'; }
    const circuit = (Math.floor(x / sector) + Math.floor(y / sector) * 3) % 4;
    lamps.push({ x, y, state, circuit });
  }

  return { W, H, tiles, dist, start, dark, lamps, floorList, rooms, roomTiles, braid, rnd, seed, props: new Map() };
}

export function bfs(tiles, W, H, sx, sy, blocked) {
  const dist = new Int32Array(W * H).fill(-1);
  const q = new Int32Array(W * H);
  let h = 0, t = 0;
  dist[sy * W + sx] = 0; q[t++] = sy * W + sx;
  while (h < t) {
    const c = q[h++]; const cx = c % W, cy = (c / W) | 0;
    for (const [dx, dy] of DIRS) {
      const n = (cy + dy) * W + cx + dx;
      if (tiles[n] === FLOOR && dist[n] < 0 && !(blocked && blocked(n))) { dist[n] = dist[c] + 1; q[t++] = n; }
    }
  }
  return dist;
}

/* ---------- 配置ヘルパー(レベル側から使う) ---------- */
export function tileIdx(map, x, y) { return y * map.W + x; }

// 床タイルから見て壁(WALL)に面している面の一覧
export function wallFaces(map, filter) {
  const out = [];
  const { W, tiles } = map;
  for (const p of map.floorList) {
    if (tiles[p.y * W + p.x] !== FLOOR) continue;
    for (const [dx, dy] of DIRS) {
      if (tiles[(p.y + dy) * W + p.x + dx] === WALL && (!filter || filter(p, dx, dy))) out.push({ x: p.x, y: p.y, dx, dy });
    }
  }
  return out;
}

// 既に使った場所から離れた床タイルを選ぶ
export function pickTile(map, used, { minDist = 0, maxDist = 1e9, avoid = [], spread = 4, filter } = {}) {
  const { rnd, dist, W } = map;
  let best = null, bestScore = -1;
  for (let t = 0; t < 90; t++) {
    const p = map.floorList[Math.floor(rnd() * map.floorList.length)];
    const k = p.y * W + p.x;
    if (used.has(k) || map.tiles[k] !== FLOOR) continue;
    const d = dist[k];
    if (d < minDist || d > maxDist) continue;
    if (filter && !filter(p)) continue;
    let md = 30;
    for (const a of avoid) md = Math.min(md, Math.abs(a.x - p.x) + Math.abs(a.y - p.y));
    const score = Math.min(md, spread * 4) + rnd() * spread;
    if (score > bestScore) { bestScore = score; best = p; }
  }
  if (best) used.add(best.y * W + best.x);
  return best;
}

// スタートから最も遠い壁面(出口用)
export function farthestFace(map, used, filter) {
  let best = null, bd = -1;
  for (const f of wallFaces(map, filter)) {
    const k = f.y * map.W + f.x;
    const d = map.dist[k];
    if (d > bd && !used.has(k)) { bd = d; best = f; }
  }
  if (best) used.add(best.y * map.W + best.x);
  return best;
}
