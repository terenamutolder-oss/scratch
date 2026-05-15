# Scratch Web

A browser-based, Scratch-style block-coding playground built with **Vite + React + TypeScript**.

It is local-first: every project, studio, and comment lives in your browser's `localStorage`. No backend, no accounts.

## Features

- **Local accounts** (sign-up / sign-in) — usernames + PBKDF2-hashed passwords stored in this browser. **Guest mode:** open the editor immediately with "Continue without an account". Not a real auth system; see *Caveats* below.
- **Shared library + per-project ownership**: every account on this browser sees the same set of projects, but **only the creator can edit or delete** their own project. Everyone else can open it, run it, comment on it, and duplicate it (the copy becomes theirs).
- **Editor** with 7 block categories (Motion, Looks, Events, Control, Sensing, Operators, Variables) and all block shapes (hat / stack / C / E / cap / reporter / boolean).
- **Multi-sprite**: add, rename, select, delete sprites; each sprite has its own scripts.
- **Multi-stack threading**: hat-triggered scripts run in parallel (green flag, sprite click, key press, broadcast).
- **Nested reporter/boolean blocks** drag into input slots.
- **Variables** with on-stage monitors.
- **Library / Explore** view with `All` / `My projects` filters, owner badges, and per-project / per-comment delete permissions.
- **Studios**: anyone can create one; only the creator can rename/delete it. Project creators control which studios their projects belong to.
- **Comments**: anyone can post; you can delete your own, and project owners can delete any comment on their project.
- **Auto-save** of the entire shared library to `localStorage`, plus per-user UI state (which project is open).

## Stack

- [Vite 6](https://vitejs.dev/)
- React 19 + TypeScript (strict)
- Pure CSS

## Getting started

```bash
npm install
npm run dev     # dev server at http://localhost:5173/
npm run build   # type-check + production build
npm run preview # preview the production build
```

## Repo layout

| Path | Purpose |
|------|---------|
| `AGENTS.md` | Workflow + guardrails for humans & coding agents |
| `docs/PRD.md` · `docs/SRD.md` | Product / software requirements |
| `src/catalog/blockCatalog.ts` | All block definitions |
| `src/engine/runtime.ts` · `src/engine/interpreter.ts` | Threading + evaluator |
| `src/state/ProjectContext.tsx` | Library state (projects, studios, comments) |
| `src/components/` | UI: palette, scripts canvas, stage, sprite tray, library, comments |

## Out of scope (today)

- Sounds, pen, clones, lists, custom blocks (procedures).
- Multi-costume animation per sprite (one editable emoji/text glyph).
- `.sb3` import/export.
- **Real authentication** (see below).
- **Real authorisation.** The "only the creator can edit" rule is enforced client-side. Someone editing `localStorage` directly can grant themselves ownership of any project. The check exists to keep accounts from accidentally stepping on each other, not as a security boundary.
- Networked collaboration.

## Caveats: the local-only login system

The sign-up / sign-in flow is a **local profile system**. It exists so multiple people on the same browser can keep separate libraries, and so comments have a real author. Concretely:

- Accounts and libraries live in `localStorage` on this browser. They are not synced anywhere.
- Passwords are hashed with **PBKDF2-SHA-256** (150 000 iterations, per-user 16-byte salt) before storage. Compared with a constant-time comparator on sign-in.
- Anyone with access to the browser can still inspect or clear `localStorage` via devtools — so the system protects against casual cross-account access, **not** against a determined attacker.

**Do not reuse a real password.** If you want real auth, the next step is to put a backend in front of `AuthContext` (`POST /signup`, `POST /signin`, JWT/cookie sessions, password reset, etc.). The shape of `AuthContextValue` was designed so that swap is mostly an `AuthContext` rewrite, no UI changes needed.

## License

[MIT](./LICENSE)
