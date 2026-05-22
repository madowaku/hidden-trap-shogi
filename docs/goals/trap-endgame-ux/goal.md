# Trap And Endgame UX

## Goal

Gemini review feedbackを受けて、落とし穴将棋MVPの停滞防止と終局UXを改善する。

## Tranche

Complete a reviewable implementation slice covering:

- 同一プレイヤーの前回罠と同じマスへの連続設置禁止
- Casual ON時の不発罠公開エフェクト
- Local / Online の投了UI確認
- 簡易王手アラート
- Help / Known Issues の詰み未実装説明

## Constraints

- 未公開の相手罠情報をGameViewやOnline payloadに漏らさない。
- Online Room / Workerは既存のroom reducer pathを通す。
- Next.js 16のローカルdocsを確認してからUIコードを編集する。
- Tests-firstで進める。
