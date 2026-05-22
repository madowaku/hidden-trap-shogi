# Online Architecture Prep

## Objective

Prepare Pitfall Shogi for online multiplayer by making hidden information explicit in local types and tests before adding any WebSocket or production networking.

## Goal Kind

`specific`

## Current Tranche

Add a player-specific view boundary around the existing `GameState`: design and implement `getPlayerView(state, viewer)`, verify that a viewer never receives the opponent's unpublished active trap, and move Bot-facing decisions closer to the same visible-information model where safe. Do not implement WebSocket networking in this tranche.

## Non-Negotiable Constraints

- Hidden trap information must not be sent to a viewer who is not allowed to know it.
- Online architecture must follow the same principle as the Bot fix: unpublished information is not merely ignored; it is absent from the receiving view.
- Preserve the existing local reducer and game-domain structure unless a small type extraction directly supports the view boundary.
- Do not add networking, credentials, hosting config, or server processes in the first slice.
- Keep the slice verifiable with static tests and existing project commands.

## Enough For This Tranche

- `getPlayerView(state, viewer)` or an equivalent named function exists in the game domain.
- The returned view includes board, hands, public log/history, phase/turn data, and only traps visible to that viewer.
- Tests prove that opponent unpublished traps are absent, while own traps and Casual revealed/triggered log information remain available.
- A follow-up note or board receipt records how this view becomes the payload for future server-authoritative online rooms.

## Stop Rule

Stop when the tranche audit passes, all safe local work is blocked, or continuing would require WebSocket implementation, hosting decisions, credentials, or product decisions beyond the local hidden-information boundary.

Do not stop after planning if a safe Worker task with exact allowed files and verification commands exists.

## Canonical Board

Machine truth lives at:

`docs/goals/online-architecture-prep/state.yaml`

If this charter and `state.yaml` disagree, `state.yaml` wins for task status, active task, receipts, verification freshness, and completion truth.

## Run Command

```text
/goal Follow docs/goals/online-architecture-prep/goal.md through the first safe verified implementation slice. Do not stop after planning unless blocked.
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
