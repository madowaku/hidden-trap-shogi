# Online Room Presence & Match Stats

## Goal

オンライン実験の次段として、匿名のまま部屋の状況と対局中の読み合い結果が分かるUXを足す。

## Tranche

Complete a reviewable implementation slice covering:

- Onlineの再戦ボタンをGame Over後に表示し、両者の再戦要求で同じRoom内の新局を開始する
- 接続切れ/再接続中を大きめの警告として表示する
- 相手待ち状態を盤面/サイドバーで強調する
- RoomStateに部屋内presenceを持たせ、players 0-2とspectatorsをUIに表示する
- 対局内だけの罠統計を表示する
  - trapsSet
  - trapsTriggeredByMe
  - trapsITriggered
  - trapHitRate
- 永続DB保存、ユーザー登録、ランキングは入れない

## Constraints

- Hidden pitfall state must not leak through wire payloads.
- Core shogi reducer rules are out of scope except reset/rematch orchestration.
- Spectator support may be preparatory, but live spectators must not gain hidden trap information.
- Tests-first.
- Use existing reducer/room flow where possible.
