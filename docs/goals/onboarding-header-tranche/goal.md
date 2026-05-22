# Onboarding And Header Cleanup Tranche

## Objective

Improve the itch.io first-player path so a new player understands the first turn flow: place a trap, move a piece, then read the opponent's desired move. Reduce in-match header clutter so the board and current phase stay primary.

## Goal Kind

`specific`

## Current Tranche

Implement the requested first-turn tutorial, in-match header cleanup, expectation-management copy, Online disabled reason, and Hard bot copy adjustment. Verify with static tests, TypeScript, lint, build, and itch packaging.

## Non-Negotiable Constraints

- Follow the repository AGENTS.md: read relevant Next.js docs before code changes.
- Preserve title-screen controls while folding nonessential in-match controls into Settings or an overflow.
- Keep PvBot, PvP, and Online flows operable after the header change.
- Keep the itch embed target of 960 x 900 in mind and avoid growing the in-match chrome.
- Do not revert unrelated user or prior generated changes.

## Stop Rule

Stop when the tranche audit passes, all safe local work is blocked, or continuing would require owner input, credentials, destructive operations, or strategy the board cannot decide.

Do not stop after planning, discovery, or task selection while a safe implementation task can be activated.

## Canonical Board

Machine truth lives at:

`docs/goals/onboarding-header-tranche/state.yaml`

If this charter and `state.yaml` disagree, `state.yaml` wins for task status, active task, receipts, verification freshness, and completion truth.

## Run Command

```text
/goal Follow docs/goals/onboarding-header-tranche/goal.md through the first safe verified implementation slice. Do not stop after planning unless blocked.
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
