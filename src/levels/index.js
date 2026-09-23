// 階層の一覧。アップデートで階層を増やすときは、ファイルを追加してここに並べるだけ
import level0 from './level0.js';
import level1 from './level1.js';
import level2 from './level2.js';
import level3 from './level3.js';
import level4 from './level4.js';

// 実装済み(この順番で進む)
export const LEVELS = [level0, level1, level2, level3, level4];

// これから追加予定(タイトル画面・到達時の予告に使う)
export const UPCOMING = [
  { id: 'level-5', code: 'LEVEL 5', name: '恐怖のホテル', en: 'Terror Hotel', teaser: '古びたホテルの廊下とボイラー室。\n客室の扉の向こうから、ノックが返ってくる。' },
  { id: 'level-6', code: 'LEVEL 6', name: '消灯', en: 'Lights Out', teaser: '光がまったく存在しない階層。\n頼れるのは、音と手探りだけ。' },
  { id: 'level-7', code: 'LEVEL 7', name: '深海恐怖症', en: 'Thalassophobia', teaser: '部屋の半分が、黒い水に沈んでいる。' },
];

// 旧版(v1.0)のセーブ番号 → 階層ID
export const LEGACY_IDS = ['level-0', 'level-1', 'level-2'];

export function levelIndex(id) { return LEVELS.findIndex(l => l.id === id); }

export const CREDIT = '本作の舞台設定は、The Backrooms Wiki（backrooms-wiki.wikidot.com）で共同創作されている設定（CC BY-SA 3.0）を参考にした二次創作です。';
