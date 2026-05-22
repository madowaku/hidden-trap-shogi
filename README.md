# Pitfall Shogi

落とし穴を仕掛けて、相手の「おいしい手」を失敗させるローカル対局アプリです。

本作は公式将棋ルールの厳密実装ではなく、落とし穴ルールを中心にしたカジュアルな変則将棋です。

This is a casual shogi variant, not a strict implementation of official shogi rules.

## Getting Started

Run the development server:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Manual Test Checklist

- [ ] PvBot Easy/Normal/Hardが起動する
- [ ] 罠を踏むと手が失敗する
- [ ] 不発罠が公開される
- [ ] Game Over後に罠履歴が出る
- [ ] PvP Pass Deviceでログ/罠情報が隠れる
- [ ] 不正な打ち込みがreducerで拒否される

## Online Experimental 2ブラウザ手動テスト

Online Experimentalは検証用です。Next.jsクライアントはlocal reducerを進めず、Workerから受け取ったGameViewだけで盤面を更新することを確認します。

前提:

- Workerをローカルで起動する: `npm run worker:dev`
- Next.jsクライアントをWorker URL付きで起動する: `NEXT_PUBLIC_ROOM_WS_URL=ws://127.0.0.1:8787 npm run dev`
- ブラウザAとブラウザBで同じdev URLを開く

手順:

- [ ] A/BともOnline Experimentalで同じRoom IDを入力してConnectする
- [ ] A/BともroomJoinedを受け取り、revision / ackClientSeq / sentSeq / receivedが表示される
- [ ] Aが罠を設置し、Bにもrevision付きGameView更新が届く
- [ ] Bの画面で相手未公開罠がUIに表示されないこと、raw pitfall leakが`no`であることを確認する
- [ ] 手番外の操作、または古いclientSeq相当の操作でinvalidCommandの理由が表示される
- [ ] 駒移動を盤面クリックから送信し、受信したGameViewでだけ盤面が進むことを確認する
- [ ] 持ち駒がある局面で打ちを送信できることを確認する
- [ ] 成り/不成が必要な移動では、選択ボタンを押した後にだけmakeMoveが送信されることを確認する
- [ ] 片方をReconnectし、join後のclientSeq/revision表示で同期し直せることを確認する
- [ ] Resignで両ブラウザにgameOver系eventが届く

Online mode Known Issues:

- 実験中です。マッチメイク、認証、永続保存、自動復帰は未実装です。
- itch.io公開版ではWorker WebSocket URL未設定の場合、Online Experimentalはdisabledになります。
- 複数タブや同時入力はinvalidCommandになりやすいです。debug panelの理由表示で確認してください。

## Botの非公開情報ポリシー

Botは、プレイヤーが現在設置している未公開の罠位置を直接参照しない。

Botが判断に使うのは、盤面、持ち駒、合法手、公開済みログ、過去に公開・発動した罠傾向、戦術的な危険度のみ。

Botは「罠っぽいマス」を推測できるが、「実際の未公開罠」を知ってはならない。

Bot難易度は主に罠警戒・欲張り・過去罠学習を変えるもので、深い将棋探索ではありません。

## Bot hidden information policy

Bot does not read the player's currently hidden trap position.

Bot decisions are based on:

- board state
- hands
- legal moves
- public log/history
- revealed or triggered trap patterns
- tactical danger estimation

Bot may suspect likely trap squares, but it must not directly inspect unrevealed opponent trap state.

Bot difficulty affects trap suspicion and tactical greed, not deep shogi search.

## Verification

```bash
npm run test:static
npm run lint
npm run build
npm run export
```

## itch.io Build

Next static export is configured with `output: "export"` in `next.config.ts`. In Next 14+ the old `next export` command is removed, so both `npm run build` and `npm run export` call `next build` and write the static site to `out/`.

```bash
npm install
npm run test:static
npm run lint
npm run build
npm run export
```

- `npm run export` を実行
- `out/` ディレクトリをzip化する
- itch.io に「HTML5 game」としてアップロード
- viewport/embed size: `960 x 900` 推奨
- Enable fullscreen をオン、Mobile is not recommended をチェック

## itch.io Page Materials

### Short Description

JP: 毎ターンこっそり罠を仕掛け、相手の「取れそうな手」を失敗させる変則将棋です。

EN: A compact shogi variant where every turn starts with a hidden trap, and tempting moves may fail.

### Controls

- Click a board square to choose a trap, then confirm it.
- Click one of your pieces or hand pieces, then click a legal destination.
- In PvP, pass the device when the private handoff screen appears.
- Use Help/Rules for the three-step rule summary.

### Screenshots

- `docs/itch/screenshots/title.png`: title and mode selection
- `docs/itch/screenshots/gameplay.png`: active board with trap setup
- `docs/itch/screenshots/rules.png`: Help/Rules and Known Issues surfaces

### Known Limitations

- Mobile play is not recommended.
- Online Experimental is available only as a local/experimental Worker room test; production matchmaking is not available.
- This is a casual shogi variant, not a strict implementation of official shogi rules.
- The feedback URL is currently a placeholder mailto link and should be replaced before broad public release.

### Feedback Request

JP: 初見でルールが伝わったか、罠を読む楽しさがあったか、迷った画面があれば教えてください。

EN: Please tell us whether the rules were clear on first play, whether the trap mind game felt fun, and where you got confused.

## Public Page Checklist

- [ ] Short Description is copied to the itch.io page.
- [ ] Controls are copied to the itch.io page.
- [ ] Three screenshots are uploaded.
- [ ] Known Limitations are visible.
- [ ] Feedback Request is visible.
- [ ] Embed size is set to `960 x 900`.
- [ ] Mobile is marked not recommended.

## Notes

App version shown in-game: `v0.1.0`.
