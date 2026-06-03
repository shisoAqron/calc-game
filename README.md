# けいさんゲーム 🧮💣

小学生むけの計算練習アプリです。スマホでタップして遊べます。

- [ゲームページ](https://shisoaqron.github.io/calc-game/)

## 特徴

- **スマホ最適化** … 画面のキーパッドをタップして答えを入力
- **ゲーム性** … 爆弾の導火線（制限時間）が燃え尽きる前に答える
- **正解／不正解の演出** … せいかいは紙吹雪＋👍、不正解は爆発💥
- **サウンド** … 選択は「コリッ」、正解は「ピンポーン♪」、不正解は爆発音。Web Audio API でその場で合成しており、音声ファイルの読み込みは不要
- **ミュート切り替え** … トップのスタートボタン左のボタンでオン/オフ
- **問題種別** … たしざん・ひきざん・かけざん・わりざん・ミックス
- **むずかしさ** … かんたん／ふつう／むずかしい（数のはんいと制限時間が変化）
- **サーバ不要** … 静的ファイルのみ。GitHub Pages でそのまま公開できます

## 構成

```
index.html   画面（トップ / ゲーム / リザルト）
styles.css   見た目・アニメーション
app.js       ゲームロジック
```

ビルド不要・依存パッケージなしの素の HTML/CSS/JS です。

## ローカルで動かす

ファイルを開くだけでも動きますが、フォント読み込みのため簡易サーバ推奨：

```bash
python3 -m http.server 8000
# → http://localhost:8000 を開く
```

## GitHub Pages で公開する

このリポジトリには `.github/workflows/deploy.yml` を同梱しています。

1. GitHub にリポジトリを push
2. リポジトリの **Settings → Pages → Build and deployment** で
   **Source** を **GitHub Actions** に設定
3. `main` ブランチへ push すると自動でデプロイされます

> ブランチから直接公開する場合は Source を「Deploy from a branch」にして
> `main` / `(root)` を選んでも動きます（`.nojekyll` 同梱済み）。

## アイコン・リンクプレビュー（OGP）

- **ファビコン**（タブのアイコン）は爆弾の絵文字 💣（インラインSVG）
- **apple-touch-icon.png** … スマホのホーム画面に追加したときの爆弾アイコン
- **og-image.png**（1200×630）… Discord / LINE / X などにURLを貼ったときの展開画像
- OGP のメタタグは `index.html` の `<head>` 内に記載

> リンクプレビューの絶対URLは `https://shisoaqron.github.io/calc-game/` で設定済みです。
> 公開URLを変える場合は `index.html` の `og:url` / `og:image` / `twitter:image` を合わせて変更してください。
> LINE などはキャッシュが強いので、URL変更後は各サービスのデバッガ（例: Facebook Sharing Debugger）で再取得すると確実です。

## 調整できるところ（`app.js` 冒頭）

- `QUESTIONS_PER_GAME` … 1ゲームの問題数（初期値 10）
- `DIFFICULTY` … むずかしさごとの数のはんい・制限時間
- スコア計算は `onCorrect()` 内（基本点＋残り時間ボーナス＋れんぞくボーナス）

## 今後の拡張アイデア

- 効果音・BGM の追加
- イラスト素材（爆弾・キャラクター）を画像に差し替え
- 答えを3択から選ぶモード（仕様の代替案）
- ハイスコアの保存（localStorage）
