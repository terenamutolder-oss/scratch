# Scratch Web

A browser-based, Scratch-style block-coding playground built with **Vite + React + TypeScript**.

It is local-first: every project, studio, and comment lives in your browser's `localStorage`. No backend, no accounts.

## Features

- **Local accounts** (sign-up / sign-in) — usernames + PBKDF2-hashed passwords stored in this browser. Not a real auth system; see *Caveats* below.
- **Editor** with 7 block categories (Motion, Looks, Events, Control, Sensing, Operators, Variables) and all block shapes (hat / stack / C / E / cap / reporter / boolean).
- **Multi-sprite**: add, rename, select, delete sprites; each sprite has its own scripts.
- **Multi-stack threading**: hat-triggered scripts run in parallel (green flag, sprite click, key press, broadcast).
- **Nested reporter/boolean blocks** drag into input slots.
- **Variables** with on-stage monitors.
- **Library / Explore** view: search projects, organize them into **studios**.
- **Comments** on each project, authored under a free-form display name.
- **Auto-save** of the entire library to `localStorage`.

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
- Networked collaboration.

## Caveats: the local-only login system

The sign-up / sign-in flow is a **local profile system**. It exists so multiple people on the same browser can keep separate libraries, and so comments have a real author. Concretely:

- Accounts and libraries live in `localStorage` on this browser. They are not synced anywhere.
- Passwords are hashed with **PBKDF2-SHA-256** (150 000 iterations, per-user 16-byte salt) before storage. Compared with a constant-time comparator on sign-in.
- Anyone with access to the browser can still inspect or clear `localStorage` via devtools — so the system protects against casual cross-account access, **not** against a determined attacker.

**Do not reuse a real password.** If you want real auth, the next step is to put a backend in front of `AuthContext` (`POST /signup`, `POST /signin`, JWT/cookie sessions, password reset, etc.). The shape of `AuthContextValue` was designed so that swap is mostly an `AuthContext` rewrite, no UI changes needed.

## License

[MIT](./LICENSE)
