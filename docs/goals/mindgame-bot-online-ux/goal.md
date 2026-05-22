# Mindgame Bot And Online UX

## Objective

Make Pitfall Shogi more enjoyable for shogi fans by improving the Bot match into a real trap-reading mind game, improving the design/UI/UX around that experience, and mapping a practical path toward online multiplayer.

## Goal Kind

`open_ended`

## Current Tranche

Discover enough evidence from the current app, the YaneuraOu/USI engine model, and the ShogiGUI + Suisho workflow article to choose the first safe verified implementation slice. The first slice should improve Bot-versus-human fun without pretending a production online service can be finished in one pass. If the slice affects game design or visual UX, stop for owner approval before implementation.

## Reference Notes

- YaneuraOu is a strong USI-compliant shogi engine. Treat it as a reference for engine integration and search concepts, not as a drop-in browser feature unless licensing, binary/runtime, and hosting constraints are resolved.
- The Zenn ShogiGUI + Suisho article highlights practical levers that translate well into game design: finite per-move thinking time, MultiPV candidate lines, engine settings, and the difference between play mode and analysis mode.
- The current app's concern is asymmetric hidden trap information. A fun Bot should not simply know and avoid the player's hidden trap with perfect information.

## Non-Negotiable Constraints

- Follow `AGENTS.md`: before editing Next.js app files, read the relevant docs in `node_modules/next/dist/docs/`.
- Preserve the existing local game architecture under `src/game`, `src/hooks`, `src/components`, and `src/app` unless a small refactor directly serves the slice.
- Do not implement online multiplayer as a fake UI-only promise. Separate local prototype, network architecture, and production hosting/security.
- Respect hidden information: Bot tuning must make trap play feel like yomi, not like the Bot is cheating.
- Keep work reviewable and verified with the project's existing commands.

## Enough For This Tranche

- A Scout receipt maps current Bot/UI/network readiness and identifies ranked improvement candidates.
- A Judge receipt chooses one safe first implementation slice with exact allowed files, verification commands, and stop conditions.
- If approved and safe, the selected Worker slice is implemented and verified.
- A final audit states whether the slice improved the original goal and what remains for online multiplayer.

## Stop Rule

Stop when the tranche audit passes, all safe local work is blocked, or continuing would require owner input, credentials, destructive operations, production service decisions, or unapproved game-design decisions.

Do not stop after discovery or task selection if the owner approves a safe Worker task and implementation is locally verifiable.

## Canonical Board

Machine truth lives at:

`docs/goals/mindgame-bot-online-ux/state.yaml`

If this charter and `state.yaml` disagree, `state.yaml` wins for task status, active task, receipts, verification freshness, and completion truth.

## Run Command

```text
/goal Follow docs/goals/mindgame-bot-online-ux/goal.md through the first safe verified implementation slice. Do not stop after planning unless blocked.
```

## PM Loop

On every `/goal` continuation:

1. Read this charter.
2. Read `state.yaml`.
3. Work only on the active board task.
4. Assign Scout, Judge, Worker, or PM according to the task.
5. Write a compact task receipt.
6. Update the board.
7. If Judge selected a safe Worker task with `allowed_files`, `verify`, and `stop_if`, activate it and continue unless blocked.
8. Finish only with a Judge/PM audit receipt that maps receipts and verification back to the original user outcome.
