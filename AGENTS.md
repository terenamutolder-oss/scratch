# AGENTS.md — instructions for humans & coding agents

Single source of truth for how to work on this repo. Product intent lives in `docs/` (PRD, SRD). Implementation lives in code and comments where non-obvious.

## Priorities

1. **Match Scratch affordances** where feasible: categories, block shapes (hat / stack / c / cap / reporter / boolean), palette → workspace, multi-stack hat-triggered execution, green flag / stop.
2. **Keep the block runtime honest** — every block in the palette must either work or be documented as a stub in `docs/SRD.md`.
3. **Document** non-trivial behavior changes in `docs/` (update PRD/SRD when the product meaning changes).

## Project layout

| Path | Purpose |
|------|---------|
| `AGENTS.md` | Agent/human workflow, conventions, guardrails |
| `docs/PRD.md` | Product requirements (what we’re building and why) |
| `docs/SRD.md` | Software requirements (behaviors, block semantics, threading) |
| `docs/README.md` | Index of documentation |
| `src/types/blocks.ts` | Block model (definitions + instances) |
| `src/types/library.ts` | Library model: projects, studios, comments |
| `src/catalog/blockCatalog.ts` | Block definitions table |
| `src/engine/runtime.ts` | Thread scheduler + RuntimeAPI |
| `src/engine/interpreter.ts` | Block evaluator (statements + reporters) |
| `src/state/ProjectContext.tsx` | Library state (all projects, current project, view) |
| `src/components/Library.tsx` | Explore view: grid + search + studios |
| `src/components/CommentsPanel.tsx` | Per-project comments inside the editor |
| `src/components/` | UI: palette, block view, scripts canvas, stage, sprite tray |

## Commands

- **Dev server:** `npm run dev`
- **Production build:** `npm run build`
- **Preview build:** `npm run preview`

## Conventions

- **TypeScript + React**, strict mode on (`noUncheckedIndexedAccess`, `noUnusedLocals`).
- **Block shapes** are explicit on the `BlockDef` (`hat | stack | c | e | cap | reporter | boolean`).
- **Inputs** are pre-filled with their declared literal default when a block instance is created.
- **Interpreter** is async; threads cooperate via `await`. Use the AbortSignal-aware helpers in `src/engine/runtime.ts`.
- **State** flows through `ProjectContext`; the runtime mutates the *current* project via an updater plumbed through the library.
- **Persistence:** the whole library (every project, studios, comments, view) auto-saves to `localStorage` under `scratch-web/library`. The legacy `scratch-web/project` key is migrated on first load.

## Before you ship a change

- Run `npm run build` and fix TypeScript errors.
- If you add a block, update **both** the catalog and the interpreter, and add a row to the block semantics table in `docs/SRD.md`.
- If you change scope (new category, threading semantics, persistence), update `docs/PRD.md` and `docs/SRD.md`.

## Out of scope (for now)

- Sounds, pen extension, clones, lists, custom blocks (procedures).
- Costume editor / bitmap painting (one editable text/emoji per sprite).
- `.sb3` import/export.
- **Real** multi-user collaboration: comments are local-only (no server, no auth). Authors are a free-form display name stored in the library.
- Cloud saves and accounts.
