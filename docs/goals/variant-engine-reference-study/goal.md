# Variant Engine Reference Study

## Objective

Use YaneuraOu's historical variant-engine work and Haitaka Variants' move-generator architecture as design references for Pitfall Shogi's next rules/search tranche, without directly importing engine code.

## Goal Kind

`specific`

## Current Tranche

Read the external references and the current Pitfall Shogi engine boundaries, then produce the first safe verified design slice: a repo-grounded recommendation for legal-move/perft-style test hardening, rule profile separation, and a future SearchEngine interface that preserves hidden-trap privacy.

This tranche is design-first. It may create or update docs/goals notes and, only after Judge selection, implement a small local test/design artifact if it is clearly bounded and does not require adopting Rust, WASM, GPL code, or external engine integration.

## Non-Negotiable Constraints

- Do not directly copy or port YaneuraOu code.
- Treat YaneuraOu primarily as a design and evaluation-function reference because its licensing and engine scope are not aligned with the current browser-first app.
- Treat Haitaka Variants as a reference for architecture, legal move generation, perft discipline, WASM boundaries, and MIT-compatible implementation ideas.
- Keep Pitfall Shogi's hidden-information model and TrapBelief layer independent from perfect-information shogi search.
- Do not add Rust, WASM, NNUE, external engine binaries, or new build toolchains in this tranche.
- Prefer TypeScript tests and design notes that strengthen the existing reducer, legal move generation, view, room, and bot boundaries.

## Reference Inputs

- YaneuraOu historical subprojects: https://github.com/yaneurao/YaneuraOu/wiki/%E9%81%8E%E5%8E%BB%E3%81%AE%E3%82%B5%E3%83%96%E3%83%AD%E3%82%B8%E3%82%A7%E3%82%AF%E3%83%88
- YaneuraOu repository: https://github.com/yaneurao/YaneuraOu
- Haitaka Variants repository: https://github.com/na2hiro/haitaka-variants
- Haitaka Variants license: https://github.com/na2hiro/haitaka-variants/blob/main/LICENSE

## Stop Rule

Stop when the tranche audit passes, all safe local work is blocked, or continuing would require owner input, credentials, destructive operations, licensing decisions, or strategy the board cannot decide.

Do not stop after planning, discovery, or Judge selection if a safe Worker task can be activated.

## Canonical Board

Machine truth lives at:

`docs/goals/variant-engine-reference-study/state.yaml`

If this charter and `state.yaml` disagree, `state.yaml` wins for task status, active task, receipts, verification freshness, and completion truth.

## Run Command

```text
/goal Follow docs/goals/variant-engine-reference-study/goal.md through the first safe verified implementation slice. Do not stop after planning unless blocked.
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
