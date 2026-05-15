# Software Requirements Document (SRD)

**System:** Scratch Web
**Version:** 0.5
**Last updated:** 2026-05-15

## System overview

Single-page **Vite + React + TypeScript** app. Client-only; persistence via `localStorage`.

### Major subsystems

1. **Block catalog** (`src/catalog/blockCatalog.ts`) — declarative `BlockDef[]`: id, category, shape, color, label parts (text / input / dropdown), optional `arms` (1 for C-blocks, 2 for if/else).
2. **Block instance tree** (`src/types/blocks.ts`) — `BlockInstance` with `inputs` (literal or nested block), `fields` (dropdown selections), and optional `body` / `body2` for C/E blocks.
3. **Runtime** (`src/engine/runtime.ts`) — schedules cooperative async **threads**, one per hat invocation, with shared mutable state surfaced via `setProject`. Tracks pressed keys, mouse, timer.
4. **Interpreter** (`src/engine/interpreter.ts`) — recursive evaluator. `execBlock` for statements, `evalInput` / `evalBlock` for reporters.
5. **Auth state** (`src/state/AuthContext.tsx`) — local accounts with PBKDF2-hashed passwords and a persistent session.
6. **Library state** (`src/state/ProjectContext.tsx`) — the **shared library** (all projects, all studios, all comments) auto-saves to `scratch-web/shared-library`. Each user's UI state (which project is open, editor vs. explore) saves separately to `scratch-web/user-state/<userId>`. Older keys (`scratch-web/library/<userId>` from v0.4, `scratch-web/library` from v0.3, `scratch-web/project` from v0.2) are migrated into the shared library on first load and then deleted, tagging migrated projects/studios/comments with the migrating user as their owner/author.

## Coordinate system

- Stage is **480 × 360** pixels with origin at the **center**.
- Scratch convention: **x grows right**, **y grows up**. The renderer converts to screen pixels.
- **Direction**: degrees, `0` = up, `90` = right, `180` = down, `-90` = left.

## Functional requirements

### FR-1 Palette

- Blocks grouped by 7 **categories** with Scratch-like colors: Motion, Looks, Events, Control, Sensing, Operators, Variables.
- Palette blocks are **draggable** with the appropriate shape (stack / hat / c / cap / reporter / boolean).
- **Double-click** a palette block to append it to the selected sprite's current stack (or create a new stack if empty).

### FR-2 Script workspace

- Shows the **selected sprite's stacks**. Each stack is a vertical column of blocks starting with an optional hat.
- New stacks are created by dropping a **hat block** onto the empty area.
- Stack blocks can be **dragged within a stack** to reorder, or **deleted** with the × control.
- **Input slots** accept either a literal string/number/boolean OR a nested **reporter / boolean** block of a compatible type.
- **C-block bodies** are themselves drop zones (lists of stack blocks).

### FR-3 Execution (threading)

- **Green flag** spawns a thread for every `event_flag` hat across all sprites; existing threads keep running.
- **Stop** aborts every thread.
- Click a sprite on the stage spawns threads for that sprite's `event_clicked` hats.
- Pressing a key (focused stage) spawns threads for matching `event_keypress` hats.
- `event_broadcast` spawns threads for every matching `event_when_receive` hat (any sprite).
- `control_stop` cap supports `all` and `this script`.

### FR-4 Stage

- Renders all visible sprites; each sprite has `x`, `y`, `direction`, `size`, `visible`, optional `sayText`, and an emoji costume.
- Variable **monitors** show as a list in the top-left when their variable is `visible`.

### FR-5 Sprites

- A **sprite tray** lists every sprite. Users can **add**, **rename**, **delete**, and **select** a sprite. Selection determines which scripts are edited and which costume the costume editor shows.

### FR-6 Variables & broadcasts

- Users can **create variables** (name + initial value, project-wide).
- The **variable reporter** is dynamically present in the Variables palette for every project variable.
- Users can **create broadcast messages**, used by `broadcast` and `when I receive` blocks.

### FR-7 Library, Explore & Search

- A single **shared library** holds every project on this browser. Each project has `name`, `description`, `createdAt`, `updatedAt`, `studioIds`, `comments`, and **owner fields** (`ownerId`, `ownerUsername`, `ownerDisplayName`).
- The **Explore** view shows a grid of project cards (thumbnail emoji, sprite & block counts, last-updated date, studio chips, comment count, **creator badge**).
- The sidebar offers an "All projects" / "My projects" filter; the **search box** filters by name, description, sprite name, comment text, **owner display name**, and **owner username** (case-insensitive substring).
- Per-card actions: **Open** (anyone), **duplicate** (anyone — the copy is owned by the duplicator), **delete** (creator only), **rename** via double-click (creator only).

### FR-8 Studios

- Anyone can **create** a studio; the creator is stamped as the studio's `ownerId`.
- Only the studio's creator can **rename** or **delete** it. Other users see those buttons disabled.
- A project can be added to / removed from any studio via a chip on its card — but only by the **project's creator** (it's their project's metadata).
- Deleting a studio does **not** delete its projects.

### FR-9 Comments

- Each project has a list of **comments** (`id`, `text`, `author`, `authorId?`, `authorUsername?`, `createdAt`).
- **Anyone signed in** can post a comment on any project; new comments capture `authorId` and `authorUsername` from the current session.
- A comment can be **deleted by its author** or by the **owner of the project it lives on**. Legacy comments (no `authorId`) can only be deleted by the project owner.
- The comment count surfaces in Explore.

### FR-10 Persistence

- The **shared library** auto-saves to `scratch-web/shared-library` on every change.
- Each user's UI state (`currentProjectId`, `view`) auto-saves to `scratch-web/user-state/<userId>`.
- On first load, the provider migrates legacy keys into the shared library and then deletes them:
  - `scratch-web/library/<userId>` (v0.4 per-user libraries) → merged, tagging projects/studios/comments with that user as creator.
  - `scratch-web/library` (v0.3 single library) → merged, tagging with the currently-signed-in user.
  - `scratch-web/project` (v0.2 flat project) → wrapped into a `StoredProject` owned by the current user.
- Each project's `updatedAt` is bumped on every change to its content (including comments by other users).

### FR-11 Local accounts (sign up / sign in)

- The first time the app loads with no users, an empty **Sign-up form** is shown.
- Subsequent sessions show a **Sign-in form** with a link to switch to sign-up.
- Username rules: 2–24 chars, `[a-z0-9._-]`, lowercased canonically (display is case-preserving on the username field, the canonical form is stored).
- Password rules: 6–200 chars, hashed with **PBKDF2-SHA-256, 150 000 iterations, 16-byte salt, 256-bit key**; salt + hash + iteration count stored per user.
- Sign-in compares hashes with a constant-time comparator.
- **Session** is persisted to `scratch-web/session`; refresh keeps the user signed in.
- Users can edit their **display name** at any time; existing projects/comments keep the snapshot captured at create/post time.
- **Sign out** clears the session but keeps the shared library and the user record for next sign-in.

> Limitations: there is **no server**. Anyone with access to the browser can read or wipe accounts and libraries via devtools. The system protects against casual cross-account access on a shared browser; it is not a security boundary.

### FR-12 Ownership & access control

- Every `StoredProject` carries `ownerId` (the userId of the creator), set at create-time. Migrated projects without an owner are stamped during migration (see FR-10).
- The active user is the **owner** of the open project iff `project.ownerId === currentUser.id`. Otherwise the editor renders in **read-only mode**:
  - The block palette is hidden.
  - Block ×, drag handles, dropdowns, and literal inputs are non-interactive (statics).
  - Drop zones on `ScriptsCanvas` and inside C-block bodies short-circuit on drop.
  - Sprite tray hides `+ Sprite`, `×`, and the costume input; double-click rename is a no-op.
  - The script-area empty state shows the creator's name.
  - A "🔒 read-only · by …" badge is shown in the toolbar, and the project name is non-editable.
- The runtime is **always** allowed for everyone: green flag, stop, key/mouse events, and `when this sprite clicked` work regardless of ownership.
- All mutation operations on `ProjectContext` early-return when `currentUser.id !== ownerId`, including: `addBlock`, `removeBlock`, `moveBlock`, `insertReporter`, `clearReporter`, `updateInputLiteral`, `updateField`, `deleteStack`, `addSprite`, `renameSprite`, `setSpriteCostume`, `deleteSprite`, `addVariable`, `deleteVariable`, `addBroadcast`, `deleteBroadcast`, `renameProject`, `updateProjectDescription`, `deleteProject`, `toggleStudioMembership`.
- For non-owners, **runtime mutations** (sprite x/y/direction/size/visible/sayText, variable values during play) are written to a **local preview copy** held only in React state; they do **not** persist to the shared library. Switching projects, signing out, or refreshing discards the preview state.
- Studios: `renameStudio` / `deleteStudio` early-return unless the active user is the studio's `ownerId`. Legacy studios without an `ownerId` are treated as ownerless and editable by anyone.
- Comments: `deleteComment` early-returns unless the active user is the comment's `authorId` or the project's `ownerId`.

## Block semantics

### Motion (blue)

| `defId` | Shape | Effect |
|---------|-------|--------|
| `motion_move` | stack | Move `steps` along current direction (animated). |
| `motion_turn_right` | stack | Add `deg` to direction (animated). |
| `motion_turn_left` | stack | Subtract `deg` from direction (animated). |
| `motion_goto_xy` | stack | Snap to `(x, y)`. |
| `motion_glide_xy` | stack | Glide to `(x, y)` over `secs` seconds. |
| `motion_setx` / `motion_sety` | stack | Set absolute coordinate. |
| `motion_changex` / `motion_changey` | stack | Add to coordinate. |
| `motion_point_dir` | stack | Set direction. |
| `motion_bounce` | stack | If past a stage edge, flip direction and clamp. |
| `motion_xpos` / `motion_ypos` / `motion_direction` | reporter | Current sprite state. |

### Looks (purple)

| `defId` | Shape | Effect |
|---------|-------|--------|
| `looks_say` | stack | Show speech bubble (persists). |
| `looks_say_for` | stack | Show speech bubble for `secs` seconds, then clear. |
| `looks_think` | stack | Like `say`, styled as a thought bubble. |
| `looks_show` / `looks_hide` | stack | Toggle visibility. |
| `looks_set_size` / `looks_change_size` | stack | Set / add to sprite size (%). |
| `looks_size` | reporter | Current size. |

### Events (yellow)

| `defId` | Shape | Effect |
|---------|-------|--------|
| `event_flag` | hat | Triggered by green flag. |
| `event_keypress` | hat | Triggered when the chosen key is pressed (stage focused). |
| `event_clicked` | hat | Triggered when the sprite is clicked. |
| `event_broadcast` | stack | Send message to all sprites (no-wait). |
| `event_when_receive` | hat | Triggered by matching broadcast. |

### Control (orange)

| `defId` | Shape | Effect |
|---------|-------|--------|
| `control_wait` | stack | Pause `secs` seconds. |
| `control_repeat` | c | Run body `times` times, yielding each iteration. |
| `control_forever` | c | Run body until the thread is aborted. |
| `control_if` | c | Run body if `cond` is truthy. |
| `control_if_else` | e | Two-armed if/else. |
| `control_repeat_until` | c | Run body until `cond` becomes truthy. |
| `control_wait_until` | stack | Yield until `cond` becomes truthy. |
| `control_stop` | cap | Stop `all` or `this script`. |

### Sensing (teal)

| `defId` | Shape | Effect |
|---------|-------|--------|
| `sensing_mouse_x` / `sensing_mouse_y` | reporter | Pointer in stage coords. |
| `sensing_mouse_down` | boolean | True while primary mouse button is down on the stage. |
| `sensing_key_pressed` | boolean | True while the chosen key is pressed. |
| `sensing_timer` | reporter | Seconds since project start / last reset. |
| `sensing_reset_timer` | stack | Reset the timer. |

### Operators (green)

| `defId` | Shape | Effect |
|---------|-------|--------|
| `op_add` / `op_sub` / `op_mul` / `op_div` / `op_mod` | reporter | Standard arithmetic. |
| `op_random` | reporter | Random number between `a` and `b` (inclusive when both integers). |
| `op_lt` / `op_eq` / `op_gt` | boolean | Numeric / string comparisons. |
| `op_and` / `op_or` / `op_not` | boolean | Boolean logic. |
| `op_join` | reporter | String concatenation. |
| `op_length` | reporter | String length. |
| `op_round` / `op_abs` | reporter | Math helpers. |

### Variables (orange-red)

| `defId` | Shape | Effect |
|---------|-------|--------|
| `var_get` | reporter | Read the chosen variable. |
| `var_set` | stack | Set variable to a value. |
| `var_change` | stack | Add a number to a variable. |
| `var_show` / `var_hide` | stack | Toggle the on-stage monitor. |

## Data models (TypeScript)

```ts
type BlockShape = "hat" | "stack" | "c" | "e" | "cap" | "reporter" | "boolean";
type SlotType = "number" | "string" | "boolean";

type LabelPart =
  | { kind: "text"; text: string }
  | { kind: "input"; key: string; slotType: SlotType; default: string }
  | { kind: "dropdown"; key: string; source: DropdownSource; default?: string };

type BlockDef = {
  id: string; category: BlockCategory; shape: BlockShape; color: string;
  parts: LabelPart[]; arms?: 1 | 2;
};

type InputValue = { kind: "literal"; value: string } | { kind: "block"; block: BlockInstance };

type BlockInstance = {
  id: string; defId: string;
  inputs: Record<string, InputValue>;
  fields: Record<string, string>;
  body?: BlockInstance[]; body2?: BlockInstance[];
};

type Stack = { id: string; blocks: BlockInstance[] };

type Sprite = {
  id: string; name: string; costume: string;
  x: number; y: number; direction: number; size: number; visible: boolean;
  sayText: string | null;
  stacks: Stack[];
};

type Variable = { id: string; name: string; value: string; visible: boolean };
type Broadcast = { id: string; name: string };

type Comment = {
  id: string; text: string; author: string;
  authorId?: string; authorUsername?: string;     // present on v0.5+
  createdAt: number;
};
type Studio = {
  id: string; name: string; description: string; createdAt: number;
  ownerId?: string; ownerUsername?: string;        // present on v0.5+
};

type StoredProject = {
  id: string; name: string; description: string;
  createdAt: number; updatedAt: number;
  studioIds: string[];
  comments: Comment[];
  sprites: Sprite[];
  selectedSpriteId: string;
  variables: Variable[];
  broadcasts: Broadcast[];
  ownerId?: string;                                // present on v0.5+
  ownerUsername?: string;
  ownerDisplayName?: string;
};

type SharedLibrary = {
  projects: Record<string, StoredProject>;
  projectOrder: string[];
  studios: Record<string, Studio>;
  studioOrder: string[];
};

type UserState = {
  currentProjectId: string;
  view: "editor" | "explore";
};

type User = {
  id: string;
  username: string;          // canonical (lowercased) login handle
  displayName: string;       // human-readable, editable
  passwordSalt: string;      // hex, 16 bytes
  passwordHash: string;      // hex, 32 bytes (PBKDF2-SHA-256)
  iterations: number;        // 150_000 today
  createdAt: number;
  lastLoginAt: number;
};

type Session = { userId: string; startedAt: number };
```

## Non-functional

- **NFR-1:** App shell loads without console errors in current evergreen browsers.
- **NFR-2:** No network calls at runtime (fonts may load from Google Fonts via `index.html`).
- **NFR-3:** Loops yield at least once per iteration so the UI stays responsive.

## Future work (not implemented)

- Sounds, pen, clones, lists, custom blocks (procedures), multiple costumes/backdrops, `.sb3` import/export.
