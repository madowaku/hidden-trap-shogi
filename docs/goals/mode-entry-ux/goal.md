# Mode Entry UX

## Goal

初心者が「どのモードで遊んでいるか」「誰が操作できるか」「Botレベルはいつ関係するか」を迷わないように、モード選択とOnline待機/エラー状態のUI/UXを整理する。

## Tranche

Complete a reviewable implementation slice covering:

- PvP/PvBotをON/OFFボタンではなく明確なモード選択として表示する
- BotレベルはPvBot選択時だけ表示する
- OnlineでGameViewがない時にローカル盤面へフォールバックしない
- Online参加者/手番/待機状態を初心者向けに表示する
- 既存ゲームロジックとGameView秘密情報ポリシーは維持する

## Constraints

- Core reducer behavior is out of scope.
- Do not expose hidden pitfall state.
- Keep the first screen as a playable setup surface, not a marketing landing page.
- Use local Next.js 16 docs before editing app UI.
- Tests-first.
