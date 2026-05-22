# Playable Pitfall Shogi

## Goal

Continue the interrupted implementation plan and turn the existing Pitfall Shogi logic and components into a playable local Next.js app.

## Classification

recovery

## Constraints

- Follow the project AGENTS.md note: read relevant Next.js docs from `node_modules/next/dist/docs/` before editing Next.js app files.
- Preserve the existing game-domain structure under `src/game`, `src/hooks`, and `src/components`.
- Keep the first tranche small and verifiable.

## Current Tranche

Advance the playable app with the user-requested experience and rules-hardening set: Bot levels, post-game trap history review, stronger PvP pass-device privacy, richer log/trap feedback, and targeted promotion/hand-piece safety guards.

## Enough For This Tranche

- PvBot exposes Easy / Normal / Hard levels and passes the level into bot move and pitfall selection.
- Completed games show a trap history review derived from the game log.
- PvP pass-device screen clearly protects private trap/log information and previews the next step.
- Log and trap-hit entries have stronger visual treatment.
- Reducer has defensive guards for invalid moves/drops so hand counts and ownership cannot be corrupted by stale UI actions.
- `npm run test:static`, `npm run lint`, and `npm run build` have fresh results recorded in `state.yaml`.
