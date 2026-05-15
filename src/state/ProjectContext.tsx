import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  defaultInputs,
  getBlockDef,
  makeBlockInstance,
  randomId,
} from "../catalog/blockCatalog";
import type {
  BlockInstance,
  Broadcast,
  InputValue,
  Project,
  Sprite,
  Stack,
  Variable,
} from "../types/blocks";
import type {
  Comment,
  Library,
  LibraryView,
  StoredProject,
  Studio,
} from "../types/library";
import { makeSprite } from "../engine/sprite";
import { Runtime } from "../engine/runtime";
import { runStack } from "../engine/interpreter";
import {
  LEGACY_LIBRARY_KEY,
  libraryStorageKey,
} from "../types/auth";

const LEGACY_FLAT_PROJECT_KEY = "scratch-web/project";

/* --------------------------- path types --------------------------- */

export type BlockPath = ReadonlyArray<number | "body" | "body2">;

export type InsertTarget =
  | { kind: "newStack" }
  | { kind: "stackEnd"; stackId: string }
  | { kind: "stackAt"; stackId: string; index: number }
  | {
      kind: "body";
      stackId: string;
      parentPath: BlockPath;
      branch: "body" | "body2";
      index: number;
    };

export type BlockRef = {
  spriteId: string;
  stackId: string;
  path: BlockPath;
};

export type InputRef = BlockRef & { inputKey: string };
export type FieldRef = BlockRef & { fieldKey: string };

/* --------------------------- defaults / migration --------------------------- */

function newStoredProject(name = "Untitled"): StoredProject {
  const cat = makeSprite("Cat", "🐱");
  return {
    id: randomId(),
    name,
    description: "",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    studioIds: [],
    comments: [],
    sprites: [cat],
    selectedSpriteId: cat.id,
    variables: [],
    broadcasts: [],
  };
}

function defaultLibrary(): Library {
  const p = newStoredProject("My first project");
  return {
    projects: { [p.id]: p },
    projectOrder: [p.id],
    studios: {},
    studioOrder: [],
    currentProjectId: p.id,
    view: "editor",
    authorName: "you",
  };
}

function tryParseLibrary(raw: string): Library | null {
  try {
    const parsed = JSON.parse(raw) as Library;
    if (!parsed.projects || !parsed.projectOrder || !parsed.currentProjectId) {
      return null;
    }
    return {
      projects: parsed.projects,
      projectOrder: parsed.projectOrder,
      studios: parsed.studios ?? {},
      studioOrder: parsed.studioOrder ?? [],
      currentProjectId: parsed.currentProjectId,
      view: parsed.view ?? "editor",
      authorName: parsed.authorName ?? "you",
    };
  } catch {
    return null;
  }
}

/**
 * Load this user's library, migrating from legacy keys on first run.
 *
 * Order:
 *   1. Per-user library at `scratch-web/library/<userId>` — use directly.
 *   2. Legacy multi-project library at `scratch-web/library` — claim for this
 *      user and delete the legacy key.
 *   3. Legacy single-project payload at `scratch-web/project` — wrap into a
 *      one-project library and delete the legacy key.
 *   4. Default empty library.
 */
function loadLibrary(userId: string): Library {
  const key = libraryStorageKey(userId);
  const raw = localStorage.getItem(key);
  if (raw) {
    const parsed = tryParseLibrary(raw);
    if (parsed) return parsed;
  }
  try {
    const legacyLib = localStorage.getItem(LEGACY_LIBRARY_KEY);
    if (legacyLib) {
      const parsed = tryParseLibrary(legacyLib);
      if (parsed) {
        try {
          localStorage.removeItem(LEGACY_LIBRARY_KEY);
        } catch {
          /* ignore */
        }
        return parsed;
      }
    }
    const legacyFlat = localStorage.getItem(LEGACY_FLAT_PROJECT_KEY);
    if (legacyFlat) {
      const legacyProject = JSON.parse(legacyFlat) as Project;
      const wrapped: StoredProject = {
        ...newStoredProject("Imported project"),
        sprites: legacyProject.sprites,
        selectedSpriteId: legacyProject.selectedSpriteId,
        variables: legacyProject.variables,
        broadcasts: legacyProject.broadcasts,
      };
      try {
        localStorage.removeItem(LEGACY_FLAT_PROJECT_KEY);
      } catch {
        /* ignore */
      }
      return {
        projects: { [wrapped.id]: wrapped },
        projectOrder: [wrapped.id],
        studios: {},
        studioOrder: [],
        currentProjectId: wrapped.id,
        view: "editor",
        authorName: "you",
      };
    }
  } catch {
    /* ignore */
  }
  return defaultLibrary();
}

/* --------------------------- pure tree helpers --------------------------- */

function withProject(
  lib: Library,
  projectId: string,
  fn: (p: StoredProject) => StoredProject,
): Library {
  const cur = lib.projects[projectId];
  if (!cur) return lib;
  const next = fn(cur);
  return {
    ...lib,
    projects: {
      ...lib.projects,
      [projectId]: { ...next, updatedAt: Date.now() },
    },
  };
}

function withCurrent(
  lib: Library,
  fn: (p: StoredProject) => StoredProject,
): Library {
  return withProject(lib, lib.currentProjectId, fn);
}

function withSprite(
  project: StoredProject,
  spriteId: string,
  fn: (sprite: Sprite) => Sprite,
): StoredProject {
  return {
    ...project,
    sprites: project.sprites.map((s) => (s.id === spriteId ? fn(s) : s)),
  };
}

function updateStackInProject(
  project: StoredProject,
  spriteId: string,
  stackId: string,
  fn: (stack: Stack) => Stack | null,
): StoredProject {
  return withSprite(project, spriteId, (sprite) => ({
    ...sprite,
    stacks: sprite.stacks
      .map((s) => (s.id === stackId ? fn(s) : s))
      .filter((s): s is Stack => s !== null),
  }));
}

function cloneBlock(b: BlockInstance, newIds = false): BlockInstance {
  const out: BlockInstance = {
    id: newIds ? randomId() : b.id,
    defId: b.defId,
    inputs: {},
    fields: { ...b.fields },
  };
  for (const [k, v] of Object.entries(b.inputs)) {
    out.inputs[k] =
      v.kind === "literal"
        ? { kind: "literal", value: v.value }
        : { kind: "block", block: cloneBlock(v.block, newIds) };
  }
  if (b.body) out.body = b.body.map((c) => cloneBlock(c, newIds));
  if (b.body2) out.body2 = b.body2.map((c) => cloneBlock(c, newIds));
  return out;
}

function mutateBlock(
  blocks: BlockInstance[],
  path: BlockPath,
  fn: (b: BlockInstance) => BlockInstance,
): BlockInstance[] {
  if (path.length === 0) return blocks;
  const head = path[0];
  if (typeof head !== "number") return blocks;
  return blocks.map((b, i) => {
    if (i !== head) return b;
    if (path.length === 1) return fn(b);
    const branch = path[1];
    const rest = path.slice(2);
    if (branch === "body") {
      return { ...b, body: mutateBlock(b.body ?? [], rest, fn) };
    }
    if (branch === "body2") {
      return { ...b, body2: mutateBlock(b.body2 ?? [], rest, fn) };
    }
    return b;
  });
}

function readBlock(
  blocks: BlockInstance[],
  path: BlockPath,
): BlockInstance | null {
  if (path.length === 0) return null;
  const head = path[0];
  if (typeof head !== "number") return null;
  const b = blocks[head];
  if (!b) return null;
  if (path.length === 1) return b;
  const branch = path[1];
  const rest = path.slice(2);
  if (branch === "body") return readBlock(b.body ?? [], rest);
  if (branch === "body2") return readBlock(b.body2 ?? [], rest);
  return null;
}

function removeBlockAt(
  blocks: BlockInstance[],
  path: BlockPath,
): BlockInstance[] {
  if (path.length === 0) return blocks;
  const head = path[0];
  if (typeof head !== "number") return blocks;
  if (path.length === 1) {
    const next = [...blocks];
    next.splice(head, 1);
    return next;
  }
  const branch = path[1];
  const rest = path.slice(2);
  return blocks.map((b, i) => {
    if (i !== head) return b;
    if (branch === "body") {
      return { ...b, body: removeBlockAt(b.body ?? [], rest) };
    }
    if (branch === "body2") {
      return { ...b, body2: removeBlockAt(b.body2 ?? [], rest) };
    }
    return b;
  });
}

function insertIntoBody(
  blocks: BlockInstance[],
  parentPath: BlockPath,
  branch: "body" | "body2",
  index: number,
  block: BlockInstance,
): BlockInstance[] {
  return mutateBlock(blocks, parentPath, (b) => {
    const body = (branch === "body" ? b.body : b.body2) ?? [];
    const next = [...body];
    const i = Math.max(0, Math.min(next.length, index));
    next.splice(i, 0, block);
    return branch === "body"
      ? { ...b, body: next }
      : { ...b, body2: next };
  });
}

function insertIntoStack(
  stack: Stack,
  index: number,
  block: BlockInstance,
): Stack {
  const next = [...stack.blocks];
  const i = Math.max(0, Math.min(next.length, index));
  next.splice(i, 0, block);
  return { ...stack, blocks: next };
}

/* --------------------------- context --------------------------- */

export type ProjectContextValue = {
  library: Library;
  project: StoredProject;
  selectedSprite: Sprite;
  runtime: Runtime;
  running: boolean;
  threadTick: number;
  view: LibraryView;

  // view + library
  setView: (view: LibraryView) => void;
  createProject: (name?: string) => string;
  openProject: (id: string) => void;
  renameProject: (id: string, name: string) => void;
  updateProjectDescription: (id: string, description: string) => void;
  deleteProject: (id: string) => void;
  duplicateProject: (id: string) => string;

  // studios
  createStudio: (name: string) => string;
  renameStudio: (id: string, name: string) => void;
  deleteStudio: (id: string) => void;
  toggleStudioMembership: (projectId: string, studioId: string) => void;

  // comments
  addComment: (projectId: string, text: string) => void;
  deleteComment: (projectId: string, commentId: string) => void;

  // sprites
  addSprite: () => void;
  selectSprite: (id: string) => void;
  renameSprite: (id: string, name: string) => void;
  setSpriteCostume: (id: string, costume: string) => void;
  deleteSprite: (id: string) => void;
  spriteClicked: (id: string) => void;

  // variables / broadcasts
  addVariable: (name: string) => void;
  deleteVariable: (id: string) => void;
  addBroadcast: (name: string) => string;
  deleteBroadcast: (id: string) => void;

  // blocks
  addBlock: (defId: string, target: InsertTarget) => void;
  insertReporter: (target: InputRef, defId: string) => void;
  clearReporter: (target: InputRef) => void;
  updateInputLiteral: (target: InputRef, value: string) => void;
  updateField: (target: FieldRef, value: string) => void;
  removeBlock: (target: BlockRef) => void;
  moveBlock: (from: BlockRef, to: InsertTarget) => void;
  deleteStack: (stackId: string) => void;

  // execution
  greenFlag: () => void;
  stopAll: () => void;
  keyPressed: (key: string) => void;
  setMouse: (x: number, y: number) => void;
  setMouseDown: (down: boolean) => void;
};

const Ctx = createContext<ProjectContextValue | null>(null);

export function ProjectProvider({
  userId,
  authorName,
  children,
}: {
  userId: string;
  authorName: string;
  children: ReactNode;
}) {
  const [library, setLibrary] = useState<Library>(() => loadLibrary(userId));
  const libraryRef = useRef(library);
  libraryRef.current = library;

  // Pre-computed `Project` view for the runtime (the runtime only knows the
  // narrower runtime-state fields).
  const projectViewRef = useRef<Project>({
    sprites: [],
    selectedSpriteId: "",
    variables: [],
    broadcasts: [],
  });

  // Keep the runtime-facing view in sync with the active project.
  const currentProject = useMemo(
    () =>
      library.projects[library.currentProjectId] ??
      library.projects[library.projectOrder[0] ?? ""] ??
      newStoredProject("Recovery"),
    [library],
  );
  projectViewRef.current = {
    sprites: currentProject.sprites,
    selectedSpriteId: currentProject.selectedSpriteId,
    variables: currentProject.variables,
    broadcasts: currentProject.broadcasts,
  };

  const [threadTick, bumpThreads] = useReducer((x: number) => x + 1, 0);

  const runtimeRef = useRef<Runtime | null>(null);
  if (!runtimeRef.current) {
    runtimeRef.current = new Runtime(
      () => projectViewRef.current,
      (updater) => {
        setLibrary((lib) => {
          const cur = lib.projects[lib.currentProjectId];
          if (!cur) return lib;
          const view: Project = {
            sprites: cur.sprites,
            selectedSpriteId: cur.selectedSpriteId,
            variables: cur.variables,
            broadcasts: cur.broadcasts,
          };
          const updated = updater(view);
          return withProject(lib, cur.id, (p) => ({
            ...p,
            sprites: updated.sprites,
            selectedSpriteId: updated.selectedSpriteId,
            variables: updated.variables,
            broadcasts: updated.broadcasts,
          }));
        });
      },
    );
    runtimeRef.current.onThreadsChanged = bumpThreads;
  }
  const runtime = runtimeRef.current;

  useEffect(() => {
    try {
      localStorage.setItem(libraryStorageKey(userId), JSON.stringify(library));
    } catch {
      /* quota — ignore */
    }
  }, [library, userId]);

  /* ------------- view + library ops ------------- */

  const setView = useCallback(
    (view: LibraryView) => {
      // Stop any threads when leaving the editor.
      if (view !== "editor") runtime.stopAll();
      setLibrary((lib) => ({ ...lib, view }));
    },
    [runtime],
  );

  const createProject = useCallback((name?: string): string => {
    const p = newStoredProject(name?.trim() || "Untitled project");
    setLibrary((lib) => ({
      ...lib,
      projects: { ...lib.projects, [p.id]: p },
      projectOrder: [p.id, ...lib.projectOrder],
      currentProjectId: p.id,
      view: "editor",
    }));
    return p.id;
  }, []);

  const openProject = useCallback(
    (id: string) => {
      runtime.stopAll();
      setLibrary((lib) =>
        lib.projects[id]
          ? { ...lib, currentProjectId: id, view: "editor" }
          : lib,
      );
    },
    [runtime],
  );

  const renameProject = useCallback((id: string, name: string) => {
    const clean = name.trim();
    if (!clean) return;
    setLibrary((lib) =>
      withProject(lib, id, (p) => ({ ...p, name: clean })),
    );
  }, []);

  const updateProjectDescription = useCallback((id: string, description: string) => {
    setLibrary((lib) =>
      withProject(lib, id, (p) => ({ ...p, description })),
    );
  }, []);

  const deleteProject = useCallback(
    (id: string) => {
      runtime.stopAll();
      setLibrary((lib) => {
        if (!lib.projects[id]) return lib;
        const order = lib.projectOrder.filter((pid) => pid !== id);
        const { [id]: _removed, ...rest } = lib.projects;
        void _removed;
        let nextProjects = rest;
        let nextOrder = order;
        // Always keep at least one project.
        if (nextOrder.length === 0) {
          const p = newStoredProject("Untitled project");
          nextProjects = { [p.id]: p };
          nextOrder = [p.id];
        }
        const currentProjectId =
          lib.currentProjectId === id
            ? nextOrder[0] ?? ""
            : lib.currentProjectId;
        return {
          ...lib,
          projects: nextProjects,
          projectOrder: nextOrder,
          currentProjectId,
        };
      });
    },
    [runtime],
  );

  const duplicateProject = useCallback((id: string): string => {
    const src = libraryRef.current.projects[id];
    if (!src) return "";
    const copy: StoredProject = {
      ...src,
      id: randomId(),
      name: `${src.name} (copy)`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      comments: [],
      // Deep clone block trees so block IDs don't collide.
      sprites: src.sprites.map((s) => ({
        ...s,
        stacks: s.stacks.map((st) => ({
          id: randomId(),
          blocks: st.blocks.map((b) => cloneBlock(b, true)),
        })),
      })),
    };
    setLibrary((lib) => ({
      ...lib,
      projects: { ...lib.projects, [copy.id]: copy },
      projectOrder: [copy.id, ...lib.projectOrder],
    }));
    return copy.id;
  }, []);

  /* ------------- studios ------------- */

  const createStudio = useCallback((name: string): string => {
    const clean = name.trim();
    if (!clean) return "";
    const s: Studio = {
      id: randomId(),
      name: clean,
      description: "",
      createdAt: Date.now(),
    };
    setLibrary((lib) => ({
      ...lib,
      studios: { ...lib.studios, [s.id]: s },
      studioOrder: [...lib.studioOrder, s.id],
    }));
    return s.id;
  }, []);

  const renameStudio = useCallback((id: string, name: string) => {
    const clean = name.trim();
    if (!clean) return;
    setLibrary((lib) => {
      const s = lib.studios[id];
      if (!s) return lib;
      return {
        ...lib,
        studios: { ...lib.studios, [id]: { ...s, name: clean } },
      };
    });
  }, []);

  const deleteStudio = useCallback((id: string) => {
    setLibrary((lib) => {
      const { [id]: _removed, ...rest } = lib.studios;
      void _removed;
      return {
        ...lib,
        studios: rest,
        studioOrder: lib.studioOrder.filter((sid) => sid !== id),
        projects: Object.fromEntries(
          Object.entries(lib.projects).map(([pid, p]) => [
            pid,
            { ...p, studioIds: p.studioIds.filter((s) => s !== id) },
          ]),
        ),
      };
    });
  }, []);

  const toggleStudioMembership = useCallback(
    (projectId: string, studioId: string) => {
      setLibrary((lib) =>
        withProject(lib, projectId, (p) => {
          const has = p.studioIds.includes(studioId);
          return {
            ...p,
            studioIds: has
              ? p.studioIds.filter((s) => s !== studioId)
              : [...p.studioIds, studioId],
          };
        }),
      );
    },
    [],
  );

  /* ------------- comments ------------- */

  const authorRef = useRef(authorName);
  authorRef.current = authorName;

  const addComment = useCallback(
    (projectId: string, text: string) => {
      const clean = text.trim();
      if (!clean) return;
      const c: Comment = {
        id: randomId(),
        text: clean,
        author: authorRef.current || "you",
        createdAt: Date.now(),
      };
      setLibrary((lib) =>
        withProject(lib, projectId, (p) => ({
          ...p,
          comments: [...p.comments, c],
        })),
      );
    },
    [],
  );

  const deleteComment = useCallback(
    (projectId: string, commentId: string) => {
      setLibrary((lib) =>
        withProject(lib, projectId, (p) => ({
          ...p,
          comments: p.comments.filter((c) => c.id !== commentId),
        })),
      );
    },
    [],
  );

  /* ------------- sprite ops (operate on current project) ------------- */

  const selectSprite = useCallback((id: string) => {
    setLibrary((lib) =>
      withCurrent(lib, (p) =>
        p.sprites.some((s) => s.id === id) ? { ...p, selectedSpriteId: id } : p,
      ),
    );
  }, []);

  const addSprite = useCallback(() => {
    setLibrary((lib) =>
      withCurrent(lib, (p) => {
        const emojis = [
          "🐶",
          "🦊",
          "🦄",
          "🤖",
          "👻",
          "🐙",
          "🐲",
          "🐸",
          "🐵",
          "🐝",
        ];
        const idx = p.sprites.length;
        const emoji = emojis[idx % emojis.length] ?? "✨";
        const sprite = makeSprite(`Sprite ${idx + 1}`, emoji);
        return {
          ...p,
          sprites: [...p.sprites, sprite],
          selectedSpriteId: sprite.id,
        };
      }),
    );
  }, []);

  const renameSprite = useCallback((id: string, name: string) => {
    setLibrary((lib) =>
      withCurrent(lib, (p) =>
        withSprite(p, id, (s) => ({ ...s, name: name.trim() || s.name })),
      ),
    );
  }, []);

  const setSpriteCostume = useCallback((id: string, costume: string) => {
    const trimmed = (costume || "").slice(0, 4) || "❓";
    setLibrary((lib) =>
      withCurrent(lib, (p) =>
        withSprite(p, id, (s) => ({ ...s, costume: trimmed })),
      ),
    );
  }, []);

  const deleteSprite = useCallback((id: string) => {
    setLibrary((lib) =>
      withCurrent(lib, (p) => {
        if (p.sprites.length <= 1) return p;
        const next = p.sprites.filter((s) => s.id !== id);
        const head = next[0];
        const selectedSpriteId =
          p.selectedSpriteId === id ? (head ? head.id : "") : p.selectedSpriteId;
        return { ...p, sprites: next, selectedSpriteId };
      }),
    );
  }, []);

  const spriteClicked = useCallback(
    (id: string) => {
      const cur =
        libraryRef.current.projects[libraryRef.current.currentProjectId];
      if (!cur) return;
      const sprite = cur.sprites.find((s) => s.id === id);
      if (!sprite) return;
      for (const stack of sprite.stacks) {
        const hat = stack.blocks[0];
        if (hat?.defId === "event_clicked") {
          runtime.spawnThread(sprite.id, stack, 1, runStack);
        }
      }
    },
    [runtime],
  );

  /* ------------- variables / broadcasts ------------- */

  const addVariable = useCallback((name: string) => {
    const clean = name.trim();
    if (!clean) return;
    setLibrary((lib) =>
      withCurrent(lib, (p) => {
        if (p.variables.some((v) => v.name === clean)) return p;
        const v: Variable = {
          id: randomId(),
          name: clean,
          value: "0",
          visible: true,
        };
        return { ...p, variables: [...p.variables, v] };
      }),
    );
  }, []);

  const deleteVariable = useCallback((id: string) => {
    setLibrary((lib) =>
      withCurrent(lib, (p) => ({
        ...p,
        variables: p.variables.filter((v) => v.id !== id),
      })),
    );
  }, []);

  const addBroadcast = useCallback((name: string): string => {
    const clean = name.trim();
    if (!clean) return "";
    setLibrary((lib) =>
      withCurrent(lib, (p) => {
        if (p.broadcasts.some((b) => b.name === clean)) return p;
        const b: Broadcast = { id: randomId(), name: clean };
        return { ...p, broadcasts: [...p.broadcasts, b] };
      }),
    );
    return clean;
  }, []);

  const deleteBroadcast = useCallback((id: string) => {
    setLibrary((lib) =>
      withCurrent(lib, (p) => ({
        ...p,
        broadcasts: p.broadcasts.filter((b) => b.id !== id),
      })),
    );
  }, []);

  /* ------------- block ops ------------- */

  const addBlock = useCallback((defId: string, target: InsertTarget) => {
    const def = getBlockDef(defId);
    if (!def) return;
    if (def.shape === "reporter" || def.shape === "boolean") return;
    const block = makeBlockInstance(defId);
    if (!block) return;

    setLibrary((lib) =>
      withCurrent(lib, (project) => {
        const spriteId = project.selectedSpriteId;
        if (!project.sprites.some((s) => s.id === spriteId)) return project;

        if (target.kind === "newStack") {
          const stack: Stack = { id: randomId(), blocks: [block] };
          return withSprite(project, spriteId, (s) => ({
            ...s,
            stacks: [...s.stacks, stack],
          }));
        }

        if (target.kind === "stackEnd") {
          return updateStackInProject(project, spriteId, target.stackId, (s) =>
            insertIntoStack(s, s.blocks.length, block),
          );
        }
        if (target.kind === "stackAt") {
          return updateStackInProject(project, spriteId, target.stackId, (s) =>
            insertIntoStack(s, target.index, block),
          );
        }
        return updateStackInProject(project, spriteId, target.stackId, (s) => ({
          ...s,
          blocks: insertIntoBody(
            s.blocks,
            target.parentPath,
            target.branch,
            target.index,
            block,
          ),
        }));
      }),
    );
  }, []);

  const insertReporter = useCallback((target: InputRef, defId: string) => {
    const inst = makeBlockInstance(defId);
    if (!inst) return;
    setLibrary((lib) =>
      withCurrent(lib, (p) =>
        updateStackInProject(p, target.spriteId, target.stackId, (s) => ({
          ...s,
          blocks: mutateBlock(s.blocks, target.path, (b) => ({
            ...b,
            inputs: {
              ...b.inputs,
              [target.inputKey]: { kind: "block", block: inst },
            },
          })),
        })),
      ),
    );
  }, []);

  const clearReporter = useCallback((target: InputRef) => {
    setLibrary((lib) =>
      withCurrent(lib, (p) =>
        updateStackInProject(p, target.spriteId, target.stackId, (s) => ({
          ...s,
          blocks: mutateBlock(s.blocks, target.path, (b) => {
            const def = getBlockDef(b.defId);
            const fallback = def
              ? defaultInputs(def)[target.inputKey]
              : undefined;
            const next: InputValue =
              fallback && fallback.kind === "literal"
                ? fallback
                : { kind: "literal", value: "" };
            return {
              ...b,
              inputs: { ...b.inputs, [target.inputKey]: next },
            };
          }),
        })),
      ),
    );
  }, []);

  const updateInputLiteral = useCallback(
    (target: InputRef, value: string) => {
      setLibrary((lib) =>
        withCurrent(lib, (p) =>
          updateStackInProject(p, target.spriteId, target.stackId, (s) => ({
            ...s,
            blocks: mutateBlock(s.blocks, target.path, (b) => ({
              ...b,
              inputs: {
                ...b.inputs,
                [target.inputKey]: { kind: "literal", value },
              },
            })),
          })),
        ),
      );
    },
    [],
  );

  const updateField = useCallback((target: FieldRef, value: string) => {
    setLibrary((lib) =>
      withCurrent(lib, (p) =>
        updateStackInProject(p, target.spriteId, target.stackId, (s) => ({
          ...s,
          blocks: mutateBlock(s.blocks, target.path, (b) => ({
            ...b,
            fields: { ...b.fields, [target.fieldKey]: value },
          })),
        })),
      ),
    );
  }, []);

  const removeBlock = useCallback((target: BlockRef) => {
    setLibrary((lib) =>
      withCurrent(lib, (p) =>
        updateStackInProject(p, target.spriteId, target.stackId, (s) => {
          const next = removeBlockAt(s.blocks, target.path);
          if (next.length === 0) return null;
          return { ...s, blocks: next };
        }),
      ),
    );
  }, []);

  const moveBlock = useCallback((from: BlockRef, to: InsertTarget) => {
    setLibrary((lib) =>
      withCurrent(lib, (project) => {
        const sprite = project.sprites.find((s) => s.id === from.spriteId);
        if (!sprite) return project;
        const fromStack = sprite.stacks.find((s) => s.id === from.stackId);
        if (!fromStack) return project;
        const sourceBlock = readBlock(fromStack.blocks, from.path);
        if (!sourceBlock) return project;
        const clone = cloneBlock(sourceBlock);

        let next = updateStackInProject(
          project,
          from.spriteId,
          from.stackId,
          (s) => {
            const cleaned = removeBlockAt(s.blocks, from.path);
            if (cleaned.length === 0) return null;
            return { ...s, blocks: cleaned };
          },
        );

        const spriteId = next.sprites.find((s) => s.id === from.spriteId)
          ? from.spriteId
          : next.selectedSpriteId;

        if (to.kind === "newStack") {
          return withSprite(next, spriteId, (s) => ({
            ...s,
            stacks: [...s.stacks, { id: randomId(), blocks: [clone] }],
          }));
        }

        if (to.kind === "stackEnd" || to.kind === "stackAt") {
          const hasStack = next.sprites
            .find((s) => s.id === spriteId)
            ?.stacks.some((s) => s.id === to.stackId);
          if (!hasStack) {
            return withSprite(next, spriteId, (s) => ({
              ...s,
              stacks: [...s.stacks, { id: to.stackId, blocks: [clone] }],
            }));
          }
          return updateStackInProject(next, spriteId, to.stackId, (s) =>
            insertIntoStack(
              s,
              to.kind === "stackEnd" ? s.blocks.length : to.index,
              clone,
            ),
          );
        }

        return updateStackInProject(next, spriteId, to.stackId, (s) => ({
          ...s,
          blocks: insertIntoBody(
            s.blocks,
            to.parentPath,
            to.branch,
            to.index,
            clone,
          ),
        }));
      }),
    );
  }, []);

  const deleteStack = useCallback((stackId: string) => {
    setLibrary((lib) =>
      withCurrent(lib, (p) =>
        withSprite(p, p.selectedSpriteId, (s) => ({
          ...s,
          stacks: s.stacks.filter((st) => st.id !== stackId),
        })),
      ),
    );
  }, []);

  /* ------------- execution ------------- */

  const greenFlag = useCallback(() => {
    const cur =
      libraryRef.current.projects[libraryRef.current.currentProjectId];
    if (!cur) return;
    let spawned = 0;
    for (const sprite of cur.sprites) {
      for (const stack of sprite.stacks) {
        const hat = stack.blocks[0];
        if (hat?.defId === "event_flag") {
          runtime.spawnThread(sprite.id, stack, 1, runStack);
          spawned += 1;
        }
      }
    }
    if (spawned === 0) {
      for (const sprite of cur.sprites) {
        for (const stack of sprite.stacks) {
          const hat = stack.blocks[0];
          const def = hat ? getBlockDef(hat.defId) : undefined;
          if (!def || def.shape !== "hat") {
            runtime.spawnThread(sprite.id, stack, 0, runStack);
          }
        }
      }
    }
  }, [runtime]);

  const stopAll = useCallback(() => {
    runtime.stopAll();
  }, [runtime]);

  const keyPressed = useCallback(
    (key: string) => {
      const cur =
        libraryRef.current.projects[libraryRef.current.currentProjectId];
      if (!cur) return;
      for (const sprite of cur.sprites) {
        for (const stack of sprite.stacks) {
          const hat = stack.blocks[0];
          if (hat?.defId === "event_keypress" && hat.fields.key === key) {
            runtime.spawnThread(sprite.id, stack, 1, runStack);
          }
        }
      }
    },
    [runtime],
  );

  const setMouse = useCallback(
    (x: number, y: number) => {
      runtime.mouseX = x;
      runtime.mouseY = y;
    },
    [runtime],
  );

  const setMouseDown = useCallback(
    (down: boolean) => {
      runtime.mouseDown = down;
    },
    [runtime],
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const k = normalizeKey(e);
      if (!k) return;
      runtime.setKeyPressed(k, true);
      if (libraryRef.current.view === "editor") keyPressed(k);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const k = normalizeKey(e);
      if (!k) return;
      runtime.setKeyPressed(k, false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [runtime, keyPressed]);

  const selectedSprite = useMemo(() => {
    const found = currentProject.sprites.find(
      (s) => s.id === currentProject.selectedSpriteId,
    );
    const fallback = currentProject.sprites[0];
    return found ?? fallback ?? makeSprite("Cat", "🐱");
  }, [currentProject]);

  const value = useMemo<ProjectContextValue>(
    () => ({
      library,
      project: currentProject,
      selectedSprite,
      runtime,
      running: runtime.isRunning,
      threadTick,
      view: library.view,

      setView,
      createProject,
      openProject,
      renameProject,
      updateProjectDescription,
      deleteProject,
      duplicateProject,

      createStudio,
      renameStudio,
      deleteStudio,
      toggleStudioMembership,

      addComment,
      deleteComment,

      addSprite,
      selectSprite,
      renameSprite,
      setSpriteCostume,
      deleteSprite,
      spriteClicked,

      addVariable,
      deleteVariable,
      addBroadcast,
      deleteBroadcast,

      addBlock,
      insertReporter,
      clearReporter,
      updateInputLiteral,
      updateField,
      removeBlock,
      moveBlock,
      deleteStack,

      greenFlag,
      stopAll,
      keyPressed,
      setMouse,
      setMouseDown,
    }),
    [
      library,
      currentProject,
      selectedSprite,
      runtime,
      threadTick,
      setView,
      createProject,
      openProject,
      renameProject,
      updateProjectDescription,
      deleteProject,
      duplicateProject,
      createStudio,
      renameStudio,
      deleteStudio,
      toggleStudioMembership,
      addComment,
      deleteComment,
      addSprite,
      selectSprite,
      renameSprite,
      setSpriteCostume,
      deleteSprite,
      spriteClicked,
      addVariable,
      deleteVariable,
      addBroadcast,
      deleteBroadcast,
      addBlock,
      insertReporter,
      clearReporter,
      updateInputLiteral,
      updateField,
      removeBlock,
      moveBlock,
      deleteStack,
      greenFlag,
      stopAll,
      keyPressed,
      setMouse,
      setMouseDown,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useProject(): ProjectContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("ProjectProvider missing");
  return v;
}

function normalizeKey(e: KeyboardEvent): string | null {
  if (e.key === " ") return "space";
  if (e.key.length === 1) return e.key.toLowerCase();
  return e.key;
}
