// レベル(階層)ごとのロジックの土台。新しい階層はこれを継承して src/levels/ に追加する
import { pickTile } from '../mapgen.js';

export class LevelLogic {
  constructor(game, def) {
    this.game = game;
    this.def = def;
    this.world = null;
    this.map = null;
    this.state = {};         // セーブされる進行状況
    this.interactables = [];
    this.used = new Set();   // 物を置いたタイル
  }

  /* ---- ライフサイクル(main.js から呼ばれる) ---- */
  plan(map) { this.map = map; }          // World 生成前：タイル・小物・出口を決める(乱数は map.rnd)
  build(world) { this.world = world; }   // World 生成後：扉・貼り紙などの見た目
  items() { return []; }                  // 拾えるもの [{id,type,x,y,...}]
  spawn() {}                              // 「何か」を出す
  start(saved) { if (saved) Object.assign(this.state, saved); }
  update(dt) {}
  dispose() {}

  /* ---- HUD ---- */
  objective() { return ''; }
  status() { return ''; }

  /* ---- ゲームへの影響 ---- */
  sanityRate(player) { return 0; }        // 正気度の増減(毎秒)
  noiseMul(pos) { return 1; }             // プレイヤーの物音の大きさ倍率
  isSafe(x, z) { return false; }          // 「何か」が入れない場所か
  tension() { return 0; }                 // BGM の緊張度(0〜1)
  onPickup(it) { return false; }          // true を返すと既定処理をしない

  /* ---- 音(各レベルで上書き) ---- */
  ambient(api) {}
  music(api) { return null; }

  /* ---- 便利関数 ---- */
  say(text, dur) { this.game.say(text, dur); }
  exit() { this.game.completeLevel(); }
  addInteract(obj) { this.interactables.push(obj); return obj; }
  pick(opts) { return pickTile(this.map, this.used, opts); }

  // 電池・アーモンド水・メモを散らす(IDはシードから決まるので再開しても同じ)
  supplies({ batteries = 2, waters = 2, notes = this.def.notes.length, firstNoteNearStart = true } = {}) {
    const out = [];
    const m = this.map;
    for (let i = 0; i < batteries; i++) { const p = this.pick({ minDist: 4, avoid: out }); if (p) out.push({ id: `battery-${i}`, type: 'battery', ...p }); }
    for (let i = 0; i < waters; i++) { const p = this.pick({ minDist: 5, avoid: out }); if (p) out.push({ id: `water-${i}`, type: 'water', ...p }); }
    for (let i = 0; i < notes; i++) {
      let p = null;
      if (i === 0 && firstNoteNearStart) {
        for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
          const x = m.start.x + dx, y = m.start.y + dy;
          if (m.tiles[y * m.W + x] === 0 && !this.used.has(y * m.W + x)) { p = { x, y }; this.used.add(y * m.W + x); break; }
        }
      }
      p ||= this.pick({ minDist: 8, avoid: out });
      if (p) out.push({ id: `note-${i}`, type: 'note', note: i, ...p });
    }
    return out;
  }
}
