// 階層の一覧。アップデートで階層を増やすときは、ファイルを追加してここに並べるだけ
import level0 from './level0.js';
import level1 from './level1.js';
import level2 from './level2.js';
import level3 from './level3.js';
import level4 from './level4.js';
import level5 from './level5.js';
import level6 from './level6.js';
import level7 from './level7.js';
import level8 from './level8.js';

// 実装済み(この順番で進む)
export const LEVELS = [level0, level1, level2, level3, level4, level5, level6, level7, level8];

// これから追加予定(タイトル画面・到達時の予告に使う)
export const UPCOMING = [
  { id: 'level-9', code: 'LEVEL 9', name: '郊外', en: 'The Suburbs', teaser: '誰もいない夜の住宅街。\n家々の窓には灯りがともっているのに、\n扉を叩いても、誰も出てこない。' },
  { id: 'level-10', code: 'LEVEL 10', name: '豊作', en: 'Bumper Crop', teaser: 'どこまでも続く麦畑と、曇った空。\n静かすぎる畑の中で、何かが麦を揺らしている。' },
  { id: 'level-11', code: 'LEVEL 11', name: '終わりのない都市', en: 'The Endless City', teaser: '人の気配のない、果てしない都市。\nここは、比較的安全な場所だと言われている。' },
];

// 旧版(v1.0)のセーブ番号 → 階層ID
export const LEGACY_IDS = ['level-0', 'level-1', 'level-2'];

export function levelIndex(id) { return LEVELS.findIndex(l => l.id === id); }

export const CREDIT = '本作の舞台設定は、The Backrooms Wiki（backrooms-wiki.wikidot.com）で共同創作されている設定（CC BY-SA 3.0）を参考にした二次創作です。';
