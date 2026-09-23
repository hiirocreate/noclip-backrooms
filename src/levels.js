// 各階層(ステージ)の設定
export const LEVELS = [
  {
    id: 0,
    code: 'LEVEL 0',
    name: 'ロビー',
    desc: '湿ったカーペットの匂い。蛍光灯の唸り。\n同じ部屋が、どこまでも続いている。',
    cells: [11, 11],        // 迷路セル数 (タイル数は 2n+1)
    tile: 3.2,              // 1タイルの大きさ(m)
    height: 3.0,            // 天井高
    braid: 0.55,            // 行き止まりを減らしてループを作る割合
    rooms: 7,               // 大部屋の数
    roomSize: [2, 5],
    pillarChance: 0.12,
    lamp: { density: 0.62, broken: 0.1, flicker: 0.07, color: [1.0, 0.96, 0.78], intensity: 1.05, radius: 8.5, pattern: 2 },
    darkZones: 1,           // 真っ暗な区画の数
    ambient: 0.035,
    fog: { color: 0x1d1a0c, density: 0.075 },
    theme: 'lobby',
    key: { name: '鍵', count: 3, kind: 'key' },
    objective: (n, m) => n < m ? `鍵を探せ (${n}/${m})` : '非常口へ向かえ',
    exitName: '非常口',
    entities: [{ type: 'wanderer', count: 1 }],
    escalate: [{ at: 2, type: 'wanderer' }], // 鍵を2つ取ると追加
    batteries: 3, waters: 3,
    notes: [
      '【走り書きのメモ】\n\nここに来て何日たったのか、もう分からない。\n時計は止まっている。腹も減らない。\nただ、蛍光灯の音だけがずっと耳の奥で鳴っている。\n\n壁の向こうで、誰かが歩く音がした。\n声をかけようとして、やめた。\nあれは人の歩き方じゃなかった。',
      '【黄ばんだ紙】\n\n出口はある。\n鍵を三つ集めると「非常口」が開くらしい。\n\n走るな。あいつは音で気づく。\n見つかったら角を何度も曲がれ。\n目が合わなくなれば、あいつは諦める。……たぶん。',
    ],
  },
  {
    id: 1,
    code: 'LEVEL 1',
    name: '居住区画',
    desc: 'コンクリートと水たまり。まばらな照明。\n暗がりには、決して光を向けてはならない。',
    cells: [12, 12],
    tile: 4.0,
    height: 4.2,
    braid: 0.7,
    rooms: 9,
    roomSize: [3, 6],
    pillarChance: 0.22,
    lamp: { density: 0.42, broken: 0.22, flicker: 0.14, color: [0.82, 0.9, 1.0], intensity: 1.35, radius: 11, pattern: 2 },
    darkZones: 4,
    ambient: 0.02,
    fog: { color: 0x07090a, density: 0.07 },
    theme: 'parking',
    key: { name: 'ヒューズ', count: 4, kind: 'fuse' },
    objective: (n, m) => n < m ? `ヒューズを集めろ (${n}/${m})` : 'エレベーターへ向かえ',
    exitName: 'エレベーター',
    entities: [{ type: 'wanderer', count: 2 }, { type: 'smiler', count: 4 }],
    escalate: [{ at: 3, type: 'wanderer' }],
    batteries: 5, waters: 3,
    notes: [
      '【作業員の日誌】\n\n照明の点検、Bブロック異常なし。\nCブロックは電源が死んでいる。\n\n暗がりに白い歯が浮いていた。\n懐中電灯を向けた瞬間、あれは笑ったまま\nこちらに突っ込んできた。\n\n絶対に光を当てるな。\nライトを消して、ゆっくり離れろ。',
      '【手書きの地図の裏】\n\nエレベーターは生きている。\n動かすにはヒューズが4本いる。\n\n上に行けば帰れると誰かが言っていた。\n上に行った奴は、誰も戻ってこなかった。\n\n戻ってこないってことは、帰れたってことだろう？',
    ],
  },
  {
    id: 2,
    code: 'LEVEL 2',
    name: '配管の迷宮',
    desc: '熱と錆と、終わらない配管。\n何かが、あなたの足音に耳を澄ませている。',
    cells: [14, 14],
    tile: 2.6,
    height: 2.8,
    braid: 0.3,
    rooms: 4,
    roomSize: [2, 3],
    pillarChance: 0.05,
    lamp: { density: 0.42, broken: 0.18, flicker: 0.14, color: [1.0, 0.45, 0.26], intensity: 1.3, radius: 7.5, pattern: 2 },
    darkZones: 2,
    ambient: 0.03,
    fog: { color: 0x120604, density: 0.09 },
    theme: 'pipes',
    key: { name: 'バルブハンドル', count: 5, kind: 'valve' },
    objective: (n, m) => n < m ? `バルブハンドルを集めろ (${n}/${m})` : '圧力扉へ向かえ',
    exitName: '圧力扉',
    entities: [{ type: 'hound', count: 2 }, { type: 'wanderer', count: 1 }],
    escalate: [{ at: 3, type: 'hound' }],
    batteries: 5, waters: 4,
    notes: [
      '【油で汚れたメモ】\n\nここの奴は目が見えない。\nそのかわり、耳がいい。\n\n走れば必ず来る。\nしゃがんで歩けば、すぐ横を通り過ぎていく。\n息を止めても意味はない。音を立てるな。',
      '【壁に貼られた紙】\n\n圧力扉 / 開放手順\n1. バルブハンドルを5本取り付ける\n2. 扉を押す\n3. 振り返らない\n\n※扉の向こうについて、当施設は一切の責任を負いません',
    ],
  },
];

export const ENDING_TEXT = `圧力扉の向こうには、見慣れた廊下があった。
自分の家の、玄関だった。

靴を脱いで、居間に入る。
テレビがついている。家族の笑い声がする。

――でも、天井から聞こえるのは
あの蛍光灯の唸りだった。

<b>あなたはまだ、戻れていない。</b>

― Thank you for playing ―`;
