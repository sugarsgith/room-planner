# 部屋プランナー

自分の部屋を実寸（cm）で再現し、家具の配置と収納の検討を続けるための個人用ツールです。2D の平面図と 3D を切り替えられ、どちらも同じ配置データを編集します。部屋の内装を一般向けに提案するサービスではありません。

## 使い方

ブラウザだけで動きます。配置はブラウザ内（localStorage）に保存されます。

- **2D / 3D** … 上のボタンで切り替えます。2D はホイールで拡大、空白のドラッグで移動、家具のドラッグで移動です。緑の丸をドラッグすると 90° 単位で回転し、クリックすると右へ 90° 回ります。
- **数値** … 右のパネルはセンチメートルです。位置は家具の中心。Enter か入力欄の外で確定し、その操作は元に戻す 1 回分になります。
- **矢印キー** … 選択中の家具を 1 cm 動かします。Shift で 10 cm。押し続けても履歴は 1 回です。
- **重なり** … 回転を考慮した足跡が重なる、部屋の矩形からはみ出す、天井を超える、のいずれかで赤く警告します。接触だけ（すき間 0）は警告しません。
- **壁** … 3D の「壁を表示」「壁を半透明」。初期状態は半透明です。壁の厚みは室内寸法の外側にあります。
- **元に戻す** … ボタン、または Ctrl/⌘+Z。やり直すは Ctrl/⌘+Shift+Z と Ctrl+Y。
- **書き出し / 読み込み** … JSON ファイルです。不正なファイルは読み込まず、今の配置もディスク上の保存も変えません。

平面図の下辺が手前（Z = 0）、上辺が奥です。右が +X です。

初期の部屋は幅 270 cm、奥行き 360 cm、天井 240 cm（約 6 畳）です。シングルベッド、デスク、2人掛けソファ、丸テーブルが入っています。数値も家具もあとから変更できます。

### 保存データが壊れていたとき

読み込みに失敗しても、保存済みの文字列は上書きしません。初期レイアウトを画面に出すだけで、自動保存は止まります。

- **生データを書き出す** … 壊れた文字列をそのままダウンロードします（バックアップキー `room-planner.project.v1.backup` にも写します）。
- **この内容で保存を再開** … 今画面にある内容で保存を上書きすることを、明示的に選んだときだけ実行します。

## 開発

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # Vitest
npm run build    # 型チェックと本番ビルド
npm run preview  # dist を配信
npm run e2e      # 要: build 済みと Playwright Chromium
```

Node.js 22 を想定しています。外部の有料 API は使いません。

## デプロイ

`vite` の `base` は `./` です。サブパス（GitHub Pages）でも、ドメイン直下（Cloudflare Pages）でも同じ `dist` を置けます。

GitHub Pages 用のワークフローは `.github/workflows/pages.yml` です。`main` への push でテスト、ビルド、`actions/deploy-pages` による公開を行います。

**初回だけ、リポジトリの Settings → Pages → Build and deployment → Source を GitHub Actions にしてください。** この設定はワークフローファイルだけでは有効になりません。公開 URL は `https://sugarsgith.github.io/room-planner/` です。

Cloudflare Pages では、ビルドコマンド `npm run build`、出力ディレクトリ `dist`、Node 22 を指定します。環境変数やトークンは不要です。

## データ形式

localStorage のキーは `room-planner.project.v1` です。書き出す JSON も同じ形です。長さはメートル、`schemaVersion` は `1` です。

```json
{
  "schemaVersion": 1,
  "app": "room-planner",
  "room": {
    "id": "room-main",
    "name": "自分の部屋",
    "width": 2.7,
    "depth": 3.6,
    "ceilingHeight": 2.4,
    "outline": [
      { "x": 0, "z": 0 },
      { "x": 2.7, "z": 0 },
      { "x": 2.7, "z": 3.6 },
      { "x": 0, "z": 3.6 }
    ],
    "openings": []
  },
  "layouts": [
    {
      "id": "layout-default",
      "name": "現在の配置",
      "furniture": []
    }
  ],
  "activeLayoutId": "layout-default"
}
```

家具は `shape` が `box`（幅・奥行き・高さ）または `cylinder`（直径は `width`、`depth` は同じ値、高さ）です。`x` / `z` は中心、`rotation` は上から見て時計回りの度です。

読み込み時は版・必須項目・数値（正の有限数、許容範囲）・未知の形状を検査します。失敗した内容は適用しません。多角形の部屋、開口、複数レイアウトをファイルに含めることはできますが、編集 UI は長方形の一部屋とアクティブな配置だけです。幅または奥行きを画面から変えると、外形は原点基準の長方形に戻ります。詳細は `AGENTS.md` と `docs/future-extensions.md` を見てください。
