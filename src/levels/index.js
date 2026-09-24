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
import level9 from './level9.js';
import level10 from './level10.js';
import level11 from './level11.js';
import level12 from './level12.js';

// 実装済み(この順番で進む)
export const LEVELS = [level0, level1, level2, level3, level4, level5, level6, level7, level8, level9, level10, level11, level12];

// これから追加予定(タイトル画面・到達時の予告に使う)
export const UPCOMING = [
  { id: 'level-13', code: 'LEVEL 13', name: '茹でガエル', en: 'The Boiling Frogs', teaser: 'どこまでも続く、ベージュ色のアパートの廊下。\n何もかもが「ちょうどいい」。\nここに住む人は、いつの間にか部屋から出てこなくなる。' },
  { id: 'level-14', code: 'LEVEL 14', name: '楽園', en: 'Paradise', teaser: '夢で見たような、星空の下の森。\n赤い草と、滝の音。\nここに留まりたいと思ったら、もう手遅れかもしれない。' },
  { id: 'level-15', code: 'LEVEL 15', name: '未来的な廊下', en: 'Futuristic Halls', teaser: '白く光る、未来的な廊下。\n誰が作ったのかは、誰も知らない。' },
];

// 旧版(v1.0)のセーブ番号 → 階層ID
export const LEGACY_IDS = ['level-0', 'level-1', 'level-2'];

export function levelIndex(id) { return LEVELS.findIndex(l => l.id === id); }

export const CREDIT = '本作の舞台設定は、The Backrooms Wiki（backrooms-wiki.wikidot.com）で共同創作されている設定（CC BY-SA 3.0）を参考にした二次創作です。';
