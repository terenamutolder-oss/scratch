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
| `src/types/auth.ts` | User + session model + storage keys |
| `src/catalog/blockCatalog.ts` | Block definitions table |
| `src/engine/runtime.ts` | Thread scheduler + RuntimeAPI |
| `src/engine/interpreter.ts` | Block evaluator (statements + reporters) |
| `src/state/AuthContext.tsx` | Local auth (PBKDF2 hashed passwords, session) |
| `src/state/ProjectContext.tsx` | Shared library state + per-user UI state + ownership enforcement |
| `src/components/AuthGate.tsx` | Sign-in / sign-up splash |
| `src/components/UserMenu.tsx` | Header account menu |
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
- **State** flows through `AuthContext` (current user) → `ProjectContext` (the shared library). Every mutation function that changes a project's *structure* (blocks, sprites, variables, broadcasts, name, description, studio membership) early-returns unless `project.ownerId === currentUser.id`. The runtime always works regardless of ownership; for non-owners, runtime mutations write only to an in-memory **preview clone** of the project.
- **Ownership rule of thumb:** if a UI control changes saved data, gate it on `isOwner` (from `useProject()`) — disable it or hide it. If it only triggers runtime behaviour (green flag, click-on-stage, key press), leave it available.
- **Persistence:**
  - **Users:** `scratch-web/users` (record map + username index).
  - **Session:** `scratch-web/session` (active userId).
  - **Shared library:** `scratch-web/shared-library` (all projects + studios across accounts on this browser). Every project carries `ownerId` / `ownerUsername` / `ownerDisplayName`; every studio carries `ownerId` / `ownerUsername`; every comment carries `authorId` / `authorUsername`.
  - **Per-user UI state:** `scratch-web/user-state/<userId>` (`currentProjectId`, `view`).
  - **Migration:** v0.4 `scratch-web/library/<userId>`, v0.3 `scratch-web/library`, and v0.2 `scratch-web/project` are merged into the shared library on first load (tagging the migrating user as creator) and then deleted.
- **Passwords:** PBKDF2-SHA-256, 150 000 iterations, per-user 16-byte salt, 256-bit derived key. Stored as hex. Local-only — see "out of scope" below.

## Before you ship a change

- Run `npm run build` and fix TypeScript errors.
- If you add a block, update **both** the catalog and the interpreter, and add a row to the block semantics table in `docs/SRD.md`.
- If you change scope (new category, threading semantics, persistence), update `docs/PRD.md` and `docs/SRD.md`.

## Out of scope (for now)

- Sounds, pen extension, clones, lists, custom blocks (procedures).
- Costume editor / bitmap painting (one editable text/emoji per sprite).
- `.sb3` import/export.
- **Real authentication.** The "log in / sign up" system is a **local profile system**: usernames + PBKDF2-hashed passwords stored in `localStorage`. Anyone with access to the browser can read or wipe everything via devtools. Do not reuse a real password here.
- **Real authorisation.** The "only the creator can edit / delete" rule is enforced client-side. A user with devtools access can rewrite `ownerId` on any project. The check is for UX, not security.
- Networked collaboration / cloud saves / OAuth / email verification.
