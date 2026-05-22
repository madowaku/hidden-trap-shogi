# Sound Effects v0

## Objective

Add short UI-triggered sound effects to Hidden Trap Shogi without changing game logic.

## Goal Kind

`specific`

## Current Tranche

Implement Sound Effects v0 for local and online play: sound settings, localStorage persistence, UI controls in Settings, event-driven playback for the requested game events, static tests, and the requested verification commands.

## Non-Negotiable Constraints

- Do not put sound behavior in reducers or room/server logic.
- Detect state and log changes in the UI layer.
- Do not replay the same sound repeatedly for the same unchanged state or log entry.
- Respect browser autoplay limits by requiring user activation before playback.
- Sound OFF must prevent playback.
- Keep Online and Local flows supported.

## Stop Rule

Stop when the tranche audit passes, all safe local work is blocked, or continuing would require owner input, credentials, destructive operations, or strategy the board cannot decide.

Do not stop after planning, discovery, or task selection if a safe Worker task can be activated.

## Canonical Board

Machine truth lives at:

`docs/goals/sound-effects-v0/state.yaml`

If this charter and `state.yaml` disagree, `state.yaml` wins for task status, active task, receipts, verification freshness, and completion truth.

## Run Command

```text
/goal Follow docs/goals/sound-effects-v0/goal.md through the first safe verified implementation slice. Do not stop after planning unless blocked.
```

## PM Loop

On every `/goal` continuation:

1. Read this charter.
2. Read `state.yaml`.
3. Work only on the active board task.
4. Assign Scout, Judge, Worker, or PM according to the task.
5. Write a compact task receipt.
6. Update the board.
7. Finish only with a Judge/PM audit receipt that maps receipts and verification back to the original user outcome.
