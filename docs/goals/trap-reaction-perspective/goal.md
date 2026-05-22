# Trap Reaction Perspective

## Goal

罠発動時の演出をviewer視点で分け、落とし穴将棋の「やられた悔しさ」と「読んだ快感」を別々に伝える。

## Tranche

Implement a reviewable slice covering:

- `player_trapped`: viewer自身の手が罠で失敗した時の赤紫・失敗演出
- `opponent_trapped`: viewerの罠で相手の手を封じた時の金紫・成功演出
- 新規くのうさ画像をUI向けに調整して使用
- 不発罠では命中リアクションを出さない
- GameViewの秘密情報ポリシーは維持

## Constraints

- ゲームロジックは変更しない。
- 表示分岐は公開済みのlog/GameView情報だけで判断する。
- Online/PvBot/PvPでviewerの意味を崩さない。
- Tests-firstで進める。
