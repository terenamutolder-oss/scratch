# Product Requirements Document (PRD)

**Product:** Scratch Web (browser block-coding playground)
**Version:** 0.3
**Last updated:** 2026-05-15

## Problem

Learners and prototypers want a **zero-install** environment that feels like [Scratch](https://scratch.mit.edu/) — visual blocks, a stage, multiple sprites, instant feedback — without the full installed editor or cloud account.

## Goals

1. **Familiar editing loop:** palette → drag blocks → snap into a stack → green flag → animated sprites on a stage.
2. **Scratch-like depth:** multi-sprite, multi-stack hat-triggered scripts, C-shaped control blocks, reporter and boolean blocks that nest into input slots, project-wide variables, broadcasts.
3. **Local-first:** the whole project persists to `localStorage`; no server required.
4. **Extensible:** new blocks land in one catalog table and one interpreter switch.

## Audience

- **Primary:** students, teachers, and hobbyists experimenting with visual code.
- **Secondary:** developers evaluating or extending a TypeScript block runtime.

## Core user stories

1. As a user, I can keep **many projects** in a personal library and **search** them by name, sprite, or comment text.
2. As a user, I can organize my projects into named **studios** (Scratch-style collections); a project can belong to any number of studios.
3. As a user, I can leave **comments** on my own projects (notes-to-self / changelog), tagged with a display-name author.
4. As a user, I can **add and switch between sprites** and edit each sprite's **own scripts**.
5. As a user, I can **drag blocks** from the palette into scripts and **nest** reporter/boolean blocks into input slots (for example, `move (x position) steps`).
6. As a user, I can build **C-shaped** scripts: `if`, `if/else`, `repeat`, `repeat until`, `forever`.
7. As a user, I can create **variables**, set/change them, drag the variable reporter into any number/string input, and toggle a stage monitor.
8. As a user, I can **broadcast** a message and trigger `when I receive` hats across all sprites.
9. As a user, I can press the **green flag** to trigger every `when 🏁 clicked` hat in parallel, and **stop** to halt every thread.
10. As a user, I can **click a sprite on the stage** to trigger its `when this sprite clicked` hats.
11. As a user, my whole library **auto-saves**; reloading the page restores everything.

## Non-goals (v0.3)

- Sounds, pen, clones, lists, custom blocks (procedures).
- A costume editor (each sprite has a single editable emoji/text costume).
- `.sb3` import/export.
- **Networked collaboration:** the library, studios, and comments live in the user's browser only. Comments use a free-form author display name — no auth, no identity guarantees.
- Cloud saves and accounts.

## Success metrics

- **Time-to-first-animation:** new user can move a sprite on a green-flag click within 2 minutes.
- **Build health:** `npm run build` passes from a clean checkout.
- **Block honesty:** every palette block either works on the stage or is marked as a stub in `docs/SRD.md`.

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| HTML5 drag-and-drop quirks | Provide a double-click-to-append fallback on palette blocks; large drop zones |
| Scope creep (re: actual Scratch) | Keep non-goals explicit; expand only via PRD updates |
| Threading bugs (forever loops, races) | Use AbortControllers + a yield-per-frame discipline on loops |

## Open questions

- Should we add a stage backdrop list (multiple backdrops) before introducing lists / procedures?
- Should variables support **for this sprite only** scope, or stay project-wide for simplicity?
