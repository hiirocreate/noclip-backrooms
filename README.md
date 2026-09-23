# NOCLIP ― 裏側の階層 ―

バックルーム系の一人称3Dホラーゲームです（Three.js + Capacitor で Android APK 化）。
画像・音声ファイルは使っておらず、テクスチャはCanvas、効果音はWebAudioで生成しています。

## ステージ構成

| 階層 | 舞台 | 集めるもの | 出口 | 「何か」 |
|---|---|---|---|---|
| LEVEL 0 ロビー | 黄色い壁紙と湿ったカーペット | 鍵 ×3 | 非常口 | 徘徊者（目で探す・音にも反応） |
| LEVEL 1 居住区画 | コンクリートの駐車場風 | ヒューズ ×4 | エレベーター | 徘徊者 ＋ 笑顔（光を当てると突進） |
| LEVEL 2 配管の迷宮 | 錆びた配管の狭い通路 | バルブハンドル ×5 | 圧力扉 | 猟犬（盲目・足音に反応）＋ 徘徊者 |

- マップは毎回ランダム生成（やり直し時は同じマップ）
- 正気度・スタミナ・懐中電灯の電池、アーモンド水で正気度回復
- 停電イベント、遠くの物音、正気度低下時の幻覚
- 進行状況は自動セーブ（「つづきから」）

## 操作

- **スマホ**：左側ドラッグ＝移動（大きく倒すとダッシュ）、右側ドラッグ＝視点、ボタン＝走る／ライト／飲む／しゃがむ
- **PC**：WASD移動、マウス視点（クリックで操作開始）、Shift走る、C しゃがむ、F ライト、Q 飲む、Esc 一時停止

## APKの作り方（GitHub Actions）

1. このフォルダ一式を GitHub リポジトリの `main` ブランチに置く
   （`node_modules/` `dist/` `android/` は不要。`.gitignore` 済み）
2. push すると `.github/workflows/build-apk.yml` が自動で動く
   （Actions タブ →「Build APK」→「Run workflow」で手動実行も可）
3. 完了後、実行結果ページ下部の **Artifacts → NOCLIP-apk** をダウンロード
4. zip内の `app-debug.apk` をスマホに入れてインストール
   （「提供元不明のアプリ」の許可が必要です）

※ `android/` フォルダはワークフロー内で毎回生成します。全画面化・横画面固定・アイコンは `android-overrides/` の内容で上書きしています。

## Web版の公開（GitHub Pages）

1. このフォルダ一式を GitHub リポジトリの `main` ブランチへ push します。
2. GitHub の **Settings → Pages → Build and deployment** で、Source を **GitHub Actions** に設定します。
3. push 後に Actions の **Deploy Web Game to GitHub Pages** が完了すると、
   `https://<GitHubユーザー名>.github.io/<リポジトリ名>/` でプレイできます。

再公開は `main` への push ごとに自動で行われます。Actions タブから手動実行することも可能です。

## PCで動作確認する場合

```bash
npm install
npm run dev        # http://localhost:5173 をブラウザで開く
npm run build      # dist/ に出力
```

## ファイル構成

```
index.html                  画面(HUD・メニュー・タッチ操作)
src/main.js                 ゲーム進行・ループ・イベント
src/levels.js               各階層の設定・メモの文章・エンディング
src/mapgen.js               迷路生成
src/world.js                3D構築・焼き込みライティング・当たり判定
src/entities.js             徘徊者／笑顔／猟犬のAI
src/player.js               一人称移動・懐中電灯・正気度
src/items.js                アイテム
src/audio.js                効果音・環境音の合成
src/postfx.js               ノイズ・色収差などの画面効果
src/input.js                キーボード・マウス・タッチ
src/textures.js             壁紙などの質感生成
android-overrides/          Android用の上書きファイル(全画面・アイコン)
.github/workflows/build-apk.yml  APKビルド
```

## 調整のヒント

- 難易度：`src/entities.js` の `chaseSpeed`（追跡速度）、`src/levels.js` の `entities` / `escalate`
- 明るさ：`src/levels.js` の `lamp.density` / `lamp.intensity` / `fog.density`
- 階層の追加：`LEVELS` 配列に要素を追加（`theme` は lobby / parking / pipes）
