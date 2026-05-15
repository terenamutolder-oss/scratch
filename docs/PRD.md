# Product Requirements Document (PRD)

**Product:** Scratch Web (browser block-coding playground)
**Version:** 0.5
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

1. As a new user, I can **sign up** with a username + password on this browser; existing accounts can **sign in**.
2. As any signed-in user, I can browse **all projects** stored on this browser, organised into studios, and **search** them by name, creator, sprite, or comment text.
3. As the **creator of a project**, I can edit it: drag/delete blocks, add or remove sprites, change variables, rename, and delete it.
4. As **any other signed-in user**, I can **open, run, comment on, and duplicate** somebody else's project, but I **cannot** edit its scripts, sprites, variables, or delete it. The editor opens in a clearly marked read-only state.
5. As a user, I can **duplicate** any project — the copy belongs to me and is fully editable.
6. As a user, I can organize my own projects into named **studios**; only the **studio's creator** can rename or delete that studio.
7. As a user, I can leave **comments** on any project. Anyone can post; I can delete my own comments, and the project creator can delete any comment on their project.
8. As a user, I can **add and switch between sprites** and edit each sprite's **own scripts** (on projects I own).
9. As a user, I can **drag blocks** from the palette into scripts and **nest** reporter/boolean blocks into input slots.
10. As a user, I can build **C-shaped** scripts: `if`, `if/else`, `repeat`, `repeat until`, `forever`.
11. As a user, I can create **variables**, set/change them, drag the variable reporter into any number/string input, and toggle a stage monitor.
12. As a user, I can **broadcast** a message and trigger `when I receive` hats across all sprites.
13. As a user, I can press the **green flag** to trigger every `when 🏁 clicked` hat in parallel, and **stop** to halt every thread.
14. As a user, I can **click a sprite on the stage** to trigger its `when this sprite clicked` hats.
15. As a user, the **shared library auto-saves** to this browser; reloading the page keeps me signed in and restores everything.
16. As a user, I can **sign out** and have another user **sign in** on the same browser; both accounts see the same shared library, but each can only edit projects they themselves created.

## Non-goals (v0.5)

- Sounds, pen, clones, lists, custom blocks (procedures).
- A costume editor (each sprite has a single editable emoji/text costume).
- `.sb3` import/export.
- **Real authentication.** The "log in / sign up" system is a **local profile system**: usernames and PBKDF2-hashed passwords stored in this browser's `localStorage`. Anyone with access to the browser can read or wipe everything via devtools. Do not reuse a real password here.
- **Real authorisation.** Ownership is enforced **client-side only**; a sufficiently motivated user can edit `localStorage` to grant themselves ownership of anything. The check exists to keep accounts from accidentally stepping on each other on a shared device, not as a security boundary.
- Networked collaboration / cloud saves / OAuth / email verification / password reset.

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
