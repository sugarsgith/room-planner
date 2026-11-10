# AGENTS.md

自分の部屋を実寸で並べるためのローカルアプリです。内装の一般サービスではありません。UI の文言は日本語、長さの内部単位はメートルです。

## レイアウト

- `src/domain/` … 単位、幾何、スキーマ検証、初期データ、localStorage。React に依存しない。
- `src/state/store.ts` … Zustand の単一ストア。文書・選択・undo/redo・表示モード。
- `src/components/` … 2D（SVG）と 3D（React Three Fiber）。両方とも同じ `project` を読む。
- `docs/future-extensions.md` … 未実装の拡張と、それを載せるフィールド。

2D と 3D で別々の家具リストを持たないこと。表示だけを分け、数値はストアの家具を更新する。

## 座標系

内部単位はメートル。画面の長さはすべてセンチメートルで、0.1 cm 格子に丸める。`cmToM` / `mToCm` 以外で換算しない。

- 原点は床の手前左。室内の X=0, Z=0, Y=0。
- +X は幅方向（2D では右）。
- +Y は上。床は Y=0。家具のメッシュ中心は Y = 高さ/2。
- +Z は奥行き（部屋の奥）。2D では画面の上。手前（Z=0）は平面図の下辺。
- 家具の `x`, `z` は足跡の中心。Y は保存しない。
- `rotation` は度。上から見て時計回り。0 のとき幅は +X、奥行きは +Z。
- ローカル点 `(lx, lz)` の世界オフセットは  
  `x = lx·cosθ − lz·sinθ`、`z = lx·sinθ + lz·cosθ`（θ は時計回り）。
- Three.js の `rotation.y` は **−θ（ラジアン）**。正の Y 回転は上から見て反時計回りなので、符号を逆にする。SVG の `rotate` は Y が下向きだと向きが反転するため、2D は `footprintCorners` の頂点を直接描く。
- 3D カメラは手前（Z が負の側）から +Z を見る。そのままだと画面右が −X になるので、投影行列の X 成分だけ符号を反転し、平面図と同じく画面右を +X にする（`MatchPlanCamera`）。この反転を外すと左右が逆になる。

壁の厚みは外形の外側に出す。室内の幅・奥行きは `room.width` / `room.depth` と一致する。壁を内側に食い込ませない。

## データ

`schemaVersion` は 2。形は `src/domain/types.ts`。1 は `validateProject` が 2 に移行する。0 や 3 や文字列の版は拒否し、保存データは触らない。

- `room.outline` … 上から見て反時計回りの XZ 多角形。外接矩形は `[0, width] × [0, depth]`。出っ張りを足しても outline は変えない。
- `room.fixtures` … 柱・備え付け収納・梁。配置は `src/domain/fixtures.ts`。
- `room.openings` … 窓・ドア。UI は未実装。読み込み時には検証する。
- `layouts[]` と `activeLayoutId` … 配置。UI はアクティブな 1 件だけを編集し、残りは保存時に残す。
- `furniture.shape` … `"box"` または `"cylinder"`。円柱は `width === depth`（直径）。`elevation` は底の高さ（省略は 0）。
- 未知の shape / opening type / fixture type / schemaVersion は拒否する。未知の追加フィールドは通過させ、更新時はオブジェクトのスプレッドで残す。

自動保存は約 400 ms 待つ。待ちのあいだは「未保存の変更あり」。`保存` はすぐ書く。localStorage が失敗したら「保存できませんでした」で、壊れた既存データは上書きしない。

検証と日本語のエラー文は `src/domain/schema.ts`。範囲外・0 以下・NaN・無限大は適用しない。

## 履歴と保存

- ドラッグ、数値入力、色の変更は `beginGesture` / `endGesture` で **1 操作 1 履歴**。マウス移動のたびに積まない。
- プレビュー中は localStorage に書かない。確定、undo/redo、明示的な「保存を再開」でのみ書く。
- キーは `room-planner.project.v1`。壊れたデータは別キー `room-planner.project.v1.backup` に写すだけで、元のキーは上書きしない。
- `persistAllowed === false` のあいだは自動保存しない。ユーザーが「この内容で保存を再開」を押したときだけ再開する。
- 空のストレージに初期データを書くのは、キーが無いときだけ。

## 重なりとはみ出し

- 矩形は分離軸、円は中心からの距離。接触は重なりではない。許容は 0.01 cm（`OVERLAP_EPSILON_M`）。
- はみ出しは室内矩形 `[0, width] × [0, depth]` に足跡が収まるか。多角形の内外判定は未実装（`docs/future-extensions.md`）。
- 高さが天井を超える場合も警告する。警告は編集を止めない。

## やってはいけないこと

- 有料 API や生成 AI を足さない。
- 内部単位をセンチメートルに変えない。画面だけ cm。
- 壊れた localStorage を初期データで潰さない。
- 幅・奥行きの編集は外形を原点基準の長方形に戻す。この挙動をドキュメントなしに変えない。
- 回転の符号を「直す」ときに 2D と 3D の片方だけ変えない。テストの 90° 足跡を先に更新し、両方の見た目を合わせる。

## 確認

```bash
npm test
npm run build
npm run e2e   # 先に build。Playwright の Chromium が必要
```
