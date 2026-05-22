---
name: ai-creole-builder
description: Create and maintain AI Creole, a compact shared work language for human-to-AI and AI-to-AI handoff. Use when the user asks about AI Creole, AIクレオール, compact prompts, handoff prompts, Codex prompts, local LLM prompts, project glossaries, shared AI dictionaries, AI-to-AI instructions, prompt protocols, AI_CREOLE.md, AGENTS.md prompt rules, or converting vague requests into structured prompts for another AI. Do not use for ordinary coding help unless prompt handoff, dictionary, glossary, or protocol work is needed.
---

# AI Creole Builder

## Purpose

Build small, living AI Creole protocols for projects. Treat AI Creole as a compact, structured, low-ambiguity work protocol, not a universal rigid language.

Prefer a stable universal core, while letting each project grow its own local dialect.

## Operating Model

- GitHub repo: canonical source of the shared AI Creole dictionary.
- Local `.md` files: project-specific field dialects.
- Google Drive doc: ChatGPT-readable entrance and summary.
- Codex: builder/updater of local `.md` files and GitHub dictionary.
- Local LLM: reader/reviewer of local `.md` files.
- ChatGPT: reads the Google Drive summary and/or GitHub source when asked.

If a GitHub dictionary repo exists, do not treat the Google Drive doc as canonical.

## Three Layers

### 1. CORE

Use these tags as the stable universal core across projects:

```text
ROLE:
MODE:
TASK:
GOAL:
STATE:
CONTEXT:
INPUT:
TARGET:
DO:
KEEP:
NO:
OUT:
CHECK:
RISK:
NEXT:
```

Meanings:

- `ROLE`: target agent or responsibility
- `MODE`: reusable working style
- `TASK`: work to perform
- `GOAL`: desired end state
- `STATE`: current known state
- `CONTEXT`: background
- `INPUT`: supplied material
- `TARGET`: files, scenes, objects, docs, or areas to touch
- `DO`: required actions
- `KEEP`: things to preserve
- `NO`: forbidden actions
- `OUT`: expected output format
- `CHECK`: verification items
- `RISK`: likely failure points
- `NEXT`: next action

Keep CORE stable. Do not silently redefine existing core tags.

### 2. MODES

Use modes as reusable aliases for work style.

Default modes:

```text
MODE: codex_patch
- inspect existing files first
- make minimal diff
- avoid broad refactor
- report changed files
- include checks or test commands when possible

MODE: local_review
- review only
- short output
- OK/FIX format
- max 5 bullets unless asked
- flag risks clearly
- no large rewrites

MODE: unity_safe
- beginner friendly
- exact file paths
- hierarchy/object names
- Inspector steps
- compile-risk notes
- MVP first
- no large refactor

MODE: web_safe
- no secret exposure
- minimal diff
- preserve existing auth/data flow
- report changed files and checks

MODE: game_idea
- extract playable core
- identify MVP
- avoid scope creep
- keep weird worldbuilding if useful
- output next concrete steps
```

Let MODE evolve per project when repeated patterns appear.

### 3. PROJECT TERMS

Use project-local glossary terms for names, concepts, and shorthand that matter inside one project.

Example:

```text
TERM:
Lira = guide fairy character in SylphNote
FirstMeet = first meeting scene with Lira
seed = submitted idea unit
spark = brainstorm note
quick = short concept generation
full = playable prototype generation
```

Do not invent too many terms. Prefer adding terms only when they reduce ambiguity in real handoffs.

## Repository Strategy

Prefer a GitHub repo such as `ai-creole-dictionary` as the canonical dictionary source.

Suggested canonical files:

- `README.md`
- `AI_CREOLE_CORE.md`
- `MODES.md`
- `AGENT_ROLES.md`
- `TEMPLATES/codex-prompt.md`
- `TEMPLATES/local-review.md`
- `PROJECTS/sylphnote.md`
- `PROJECTS/neon-brainstorm.md`
- `PROJECTS/little-lights-protocol.md`

Each project may also have:

- `AI_CREOLE.md`
- `AGENTS.md`

Prefer local `AI_CREOLE.md` for project-specific terms. Prefer the canonical dictionary repo for reusable CORE, MODE, or TEMPLATE entries.

## Workflow

When a repository does not have `AI_CREOLE.md`:

- Propose creating a minimal `AI_CREOLE.md`.
- Include `CORE`, `MODES`, `TERMS`, and `EXAMPLES` sections.
- Keep it small.
- Do not invent many project terms.

When a repository has `AI_CREOLE.md`:

- Read it before creating AI Creole prompts.
- Follow local MODE and TERM definitions.
- If a repeated pattern appears, suggest adding it to `AI_CREOLE.md`.

When asked to update the dictionary:

- Update the smallest relevant file.
- Prefer local `AI_CREOLE.md` for project-specific terms.
- Prefer the canonical dictionary repo for reusable CORE, MODE, or TEMPLATE entries.
- Show changed files.
- Explain the update briefly.
- Do not silently redefine existing terms.

## Prompt Rules

- Be compact but not vague.
- Preserve hard constraints.
- Prefer labels over long prose.
- Do not hide uncertainty.
- Do not force one global glossary.
- Let each project grow its own local dialect.
- Keep CORE stable.
- Let MODE and TERM evolve per project.
- For Codex tasks, include exact file paths when known.
- For implementation tasks, prefer small diffs.
- For local LLM tasks, prefer short check/review/classify outputs.
- For ChatGPT tasks, allow more context and ideation if needed.
- Avoid unnecessary ceremony.
- If context is missing but the task can proceed safely, make reasonable assumptions and state them.
- Ask questions only when missing information would likely cause harmful or wasteful work.

## Default Prompt Format

```text
ROLE:
MODE:

TASK:
GOAL:
STATE:
TARGET:
DO:
KEEP:
NO:
OUT:
CHECK:
RISK:
NEXT:
```

## AI_CREOLE.md Template

When asked to create `AI_CREOLE.md`, use this template:

````markdown
# AI_CREOLE.md

## Purpose

Compact shared work language for this project.
Used for human-to-AI and AI-to-AI handoff.

## Core Tags

ROLE = target agent or responsibility
MODE = reusable working style
TASK = work to perform
GOAL = desired end state
STATE = current known state
CONTEXT = background
INPUT = supplied material
TARGET = files, scenes, objects, docs, or areas to touch
DO = required actions
KEEP = things to preserve
NO = forbidden actions
OUT = expected output format
CHECK = verification items
RISK = likely failure points
NEXT = next action

## Modes

### MODE: codex_patch
- inspect existing files first
- make minimal diff
- avoid broad refactor
- report changed files
- include checks

### MODE: local_review
- review only
- short output
- OK/FIX format
- max 5 bullets unless asked

## Terms

Add project-specific terms here.

## Prompt Examples

```text
ROLE: Codex
MODE: codex_patch

TASK:
GOAL:
STATE:
TARGET:
DO:
KEEP:
NO:
OUT:
CHECK:
RISK:
NEXT:
```
````

## Google Drive Summary Draft

When asked to create a Google Drive summary draft, output this structure:

```markdown
# AIクレオール 最新サマリー

## 正本

GitHub:
[canonical dictionary repo URL]

## 基本思想

AIクレオールは、人間と複数AIが同じ作業ラインに立つための、短くて壊れにくい共通作業語。

## Core

TASK / GOAL / STATE / TARGET / DO / KEEP / NO / OUT / CHECK / RISK / NEXT

## Common Modes

* codex_patch
* local_review
* unity_safe
* web_safe
* game_idea

## 運用

* 正本はGitHub
* プロジェクト方言は各repoのAI_CREOLE.md
* ChatGPTはこのDocと必要に応じてGitHubを参照
* Codexは必要に応じて辞書を更新してpushする
* Local LLMはローカル.mdを読む
```
