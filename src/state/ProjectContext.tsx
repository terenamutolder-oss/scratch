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
import {
  SIXTEEN_YEARS_MS,
  type Comment,
  type LibraryView,
  type SharedLibrary,
  type StoredProject,
  type Studio,
  type UserState,
} from "../types/library";
import { makeSprite } from "../engine/sprite";
import { Runtime } from "../engine/runtime";
import { runStack } from "../engine/interpreter";
import { isGuestUserId } from "../types/auth";
import {
  migrateLocalLibrary,
  saveSharedLibraryLocal,
  saveUserStateLocal,
  loadUserStateLocal,
} from "../storage/localPersistence";
import {
  deleteProjectCloud,
  deleteStudioCloud,
  fetchUserState,
  importLocalLibraryIfNeeded,
  saveUserStateCloud,
  scheduleLibrarySync,
} from "../storage/cloudPersistence";
import { ensureSeedProject } from "../storage/cloudSeed";

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

/* --------------------------- builders --------------------------- */

function newStoredProject(
  name: string,
  ownerId: string,
  ownerUsername: string,
  ownerDisplayName: string,
): StoredProject {
  const cat = makeSprite("Cat", "🐱");
  return {
    id: randomId(),
    name,
    description: "",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    studioIds: [],
    comments: [],
    likedByUserIds: [],
    sprites: [cat],
    selectedSpriteId: cat.id,
    variables: [],
    broadcasts: [],
    ownerId,
    ownerUsername,
    ownerDisplayName,
  };
}

/* --------------------------- pure helpers --------------------------- */

function withProject(
  lib: SharedLibrary,
  projectId: string,
  fn: (p: StoredProject) => StoredProject,
): SharedLibrary {
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

function cloneProject(p: StoredProject): StoredProject {
  return {
    ...p,
    sprites: p.sprites.map((s) => ({
      ...s,
      stacks: s.stacks.map((st) => ({
        id: st.id,
        blocks: st.blocks.map((b) => cloneBlock(b)),
      })),
    })),
    variables: p.variables.map((v) => ({ ...v })),
    broadcasts: p.broadcasts.map((b) => ({ ...b })),
    comments: p.comments.map((c) => ({ ...c })),
    studioIds: [...p.studioIds],
  };
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

function asView(p: StoredProject): Project {
  return {
    sprites: p.sprites,
    selectedSpriteId: p.selectedSpriteId,
    variables: p.variables,
    broadcasts: p.broadcasts,
  };
}

function mergeView(p: StoredProject, v: Project): StoredProject {
  return {
    ...p,
    sprites: v.sprites,
    selectedSpriteId: v.selectedSpriteId,
    variables: v.variables,
    broadcasts: v.broadcasts,
  };
}

/* --------------------------- context --------------------------- */

export type ProjectContextValue = {
  libraryReady: boolean;
  library: SharedLibrary;
  project: StoredProject;
  selectedSprite: Sprite;
  runtime: Runtime;
  running: boolean;
  threadTick: number;
  view: LibraryView;

  /** Whether the *current* user owns the currently-open project. */
  isOwner: boolean;
  currentUserId: string;

  // view + project lifecycle
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
  canDeleteComment: (projectId: string, commentId: string) => boolean;

  // social (comment / like / subscribe — 16+ gate)
  socialAgeOk: boolean;
  confirmSocialAge: () => void;
  hasLiked: (projectId: string) => boolean;
  likeCount: (projectId: string) => number;
  toggleLike: (projectId: string) => void;
  isSubscribed: (creatorId: string) => boolean;
  isLongtimeSubscriber: (creatorId: string) => boolean;
  toggleSubscribe: (creatorId: string) => void;

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
  username,
  displayName,
  useCloud,
  children,
}: {
  userId: string;
  username: string;
  displayName: string;
  useCloud: boolean;
  children: ReactNode;
}) {
  const initialLocal = useMemo(
    () => {
      const { shared, preferredUserState } = migrateLocalLibrary(
        userId,
        username,
        displayName,
      );
      const fallback: UserState = {
        currentProjectId:
          preferredUserState?.currentProjectId ??
          shared.projectOrder[0] ??
          "",
        view: "editor",
        subscriptions: {},
        socialAgeOk: false,
      };
      const us = loadUserStateLocal(userId, fallback, shared);
      return { shared, userState: us };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [userId],
  );

  const emptyLibrary: SharedLibrary = {
    projects: {},
    projectOrder: [],
    studios: {},
    studioOrder: [],
  };

  const [libraryReady, setLibraryReady] = useState(!useCloud);
  const [library, setLibrary] = useState<SharedLibrary>(
    useCloud ? emptyLibrary : initialLocal.shared,
  );
  const [userState, setUserState] = useState<UserState>(
    useCloud
      ? {
          currentProjectId: "",
          view: "editor",
          subscriptions: {},
          socialAgeOk: false,
        }
      : initialLocal.userState,
  );

  useEffect(() => {
    if (!useCloud || isGuestUserId(userId)) return;
    let cancelled = false;

    (async () => {
      try {
        let shared = await importLocalLibraryIfNeeded(
          userId,
          username,
          displayName,
        );
        if (shared.projectOrder.length === 0) {
          shared = await ensureSeedProject(userId, username, displayName);
        }
        const fallback: UserState = {
          currentProjectId: shared.projectOrder[0] ?? "",
          view: "editor",
          subscriptions: {},
          socialAgeOk: false,
        };
        const cloudState = await fetchUserState(userId);
        const us: UserState = cloudState
          ? {
              currentProjectId:
                cloudState.currentProjectId &&
                shared.projects[cloudState.currentProjectId]
                  ? cloudState.currentProjectId
                  : fallback.currentProjectId,
              view: cloudState.view === "explore" ? "explore" : "editor",
              subscriptions: cloudState.subscriptions ?? {},
              socialAgeOk: cloudState.socialAgeOk ?? false,
            }
          : fallback;
        if (!cancelled) {
          setLibrary(shared);
          setUserState(us);
          setLibraryReady(true);
        }
      } catch (e) {
        console.error(e);
        if (!cancelled) {
          const { shared, preferredUserState } = migrateLocalLibrary(
            userId,
            username,
            displayName,
          );
          const fallback: UserState = {
            currentProjectId:
              preferredUserState?.currentProjectId ??
              shared.projectOrder[0] ??
              "",
            view: "editor",
            subscriptions: {},
            socialAgeOk: false,
          };
          setLibrary(shared);
          setUserState(loadUserStateLocal(userId, fallback, shared));
          setLibraryReady(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [useCloud, userId, username, displayName]);
  /** Local clone used when the active user is NOT the project owner. */
  const [previewProject, setPreviewProject] = useState<StoredProject | null>(
    null,
  );

  useEffect(() => {
    if (!libraryReady) return;
    const p = library.projects[userState.currentProjectId];
    if (p && p.ownerId && p.ownerId !== userId) {
      setPreviewProject(cloneProject(p));
    } else {
      setPreviewProject(null);
    }
  }, [libraryReady, library, userState.currentProjectId, userId]);

  /* --- derived current project --- */

  const fallbackProject = useMemo<StoredProject>(
    () =>
      newStoredProject("(no project)", userId, username, displayName),
    [userId, username, displayName],
  );

  const currentProject: StoredProject =
    previewProject ??
    library.projects[userState.currentProjectId] ??
    library.projects[library.projectOrder[0] ?? ""] ??
    fallbackProject;

  const isOwner =
    !!currentProject.ownerId && currentProject.ownerId === userId;

  /* --- refs for runtime --- */

  const projectViewRef = useRef<Project>(asView(currentProject));
  projectViewRef.current = asView(currentProject);
  const isOwnerRef = useRef(isOwner);
  isOwnerRef.current = isOwner;
  const currentIdRef = useRef(userState.currentProjectId);
  currentIdRef.current = userState.currentProjectId;
  const authorRef = useRef({ userId, username, displayName });
  authorRef.current = { userId, username, displayName };

  /* --- runtime --- */

  const [threadTick, bumpThreads] = useReducer((x: number) => x + 1, 0);

  const runtimeRef = useRef<Runtime | null>(null);
  if (!runtimeRef.current) {
    runtimeRef.current = new Runtime(
      () => projectViewRef.current,
      (updater) => {
        if (isOwnerRef.current) {
          setLibrary((lib) => {
            const cur = lib.projects[currentIdRef.current];
            if (!cur) return lib;
            const next = updater(asView(cur));
            return withProject(lib, cur.id, (p) => mergeView(p, next));
          });
        } else {
          setPreviewProject((prev) => {
            if (!prev) return prev;
            const next = updater(asView(prev));
            return mergeView(prev, next);
          });
        }
      },
    );
    runtimeRef.current.onThreadsChanged = bumpThreads;
  }
  const runtime = runtimeRef.current;

  /* --- persistence --- */

  useEffect(() => {
    if (!libraryReady) return;
    if (useCloud && !isGuestUserId(userId)) {
      scheduleLibrarySync(library);
      return;
    }
    saveSharedLibraryLocal(library);
  }, [library, libraryReady, useCloud, userId]);

  useEffect(() => {
    if (!libraryReady) return;
    if (useCloud && !isGuestUserId(userId)) {
      void saveUserStateCloud(userId, userState);
      return;
    }
    saveUserStateLocal(userId, userState);
  }, [userState, userId, libraryReady, useCloud]);

  /* ---------- view + project lifecycle ---------- */

  const setView = useCallback(
    (view: LibraryView) => {
      if (view !== "editor") runtime.stopAll();
      setUserState((u) => ({ ...u, view }));
    },
    [runtime],
  );

  const openProject = useCallback(
    (id: string) => {
      runtime.stopAll();
      setUserState((u) => ({ ...u, currentProjectId: id, view: "editor" }));
      // Reset preview based on ownership.
      setPreviewProject(() => {
        const p = library.projects[id];
        if (p && p.ownerId && p.ownerId !== userId) return cloneProject(p);
        return null;
      });
    },
    [runtime, library, userId],
  );

  const createProject = useCallback(
    (name?: string): string => {
      const p = newStoredProject(
        name?.trim() || "Untitled project",
        userId,
        username,
        displayName,
      );
      setLibrary((lib) => ({
        ...lib,
        projects: { ...lib.projects, [p.id]: p },
        projectOrder: [p.id, ...lib.projectOrder],
      }));
      setUserState((u) => ({
        ...u,
        currentProjectId: p.id,
        view: "editor",
      }));
      setPreviewProject(null);
      return p.id;
    },
    [userId, username, displayName],
  );

  const renameProject = useCallback(
    (id: string, name: string) => {
      const clean = name.trim();
      if (!clean) return;
      setLibrary((lib) => {
        const p = lib.projects[id];
        if (!p || p.ownerId !== userId) return lib;
        return withProject(lib, id, (cur) => ({ ...cur, name: clean }));
      });
    },
    [userId],
  );

  const updateProjectDescription = useCallback(
    (id: string, description: string) => {
      setLibrary((lib) => {
        const p = lib.projects[id];
        if (!p || p.ownerId !== userId) return lib;
        return withProject(lib, id, (cur) => ({ ...cur, description }));
      });
    },
    [userId],
  );

  const deleteProject = useCallback(
    (id: string) => {
      if (useCloud && !isGuestUserId(userId)) {
        void deleteProjectCloud(id);
      }
      setLibrary((lib) => {
        const p = lib.projects[id];
        if (!p || p.ownerId !== userId) return lib;
        const { [id]: _removed, ...rest } = lib.projects;
        void _removed;
        return {
          ...lib,
          projects: rest,
          projectOrder: lib.projectOrder.filter((pid) => pid !== id),
        };
      });
      // If we deleted the current project, fall back to the first remaining one.
      setUserState((u) => {
        if (u.currentProjectId !== id) return u;
        return u; // updated below via effect
      });
    },
    [userId, useCloud],
  );

  // If currentProjectId no longer points at a real project, move to the first one.
  useEffect(() => {
    if (!library.projects[userState.currentProjectId]) {
      const next = library.projectOrder[0] ?? "";
      if (next !== userState.currentProjectId) {
        setUserState((u) => ({ ...u, currentProjectId: next }));
      }
    }
  }, [library, userState.currentProjectId]);

  const duplicateProject = useCallback(
    (id: string): string => {
      const src = library.projects[id];
      if (!src) return "";
      const copy: StoredProject = {
        ...cloneProject(src),
        id: randomId(),
        name: `${src.name} (copy)`,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        comments: [],
        likedByUserIds: [],
        ownerId: userId,
        ownerUsername: username,
        ownerDisplayName: displayName,
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
    },
    [library, userId, username, displayName],
  );

  /* ---------- studios ---------- */

  const createStudio = useCallback(
    (name: string): string => {
      const clean = name.trim();
      if (!clean) return "";
      const s: Studio = {
        id: randomId(),
        name: clean,
        description: "",
        createdAt: Date.now(),
        ownerId: userId,
        ownerUsername: username,
      };
      setLibrary((lib) => ({
        ...lib,
        studios: { ...lib.studios, [s.id]: s },
        studioOrder: [...lib.studioOrder, s.id],
      }));
      return s.id;
    },
    [userId, username],
  );

  const renameStudio = useCallback(
    (id: string, name: string) => {
      const clean = name.trim();
      if (!clean) return;
      setLibrary((lib) => {
        const s = lib.studios[id];
        if (!s) return lib;
        // Only studio owner (or legacy ones with no owner) can rename.
        if (s.ownerId && s.ownerId !== userId) return lib;
        return {
          ...lib,
          studios: { ...lib.studios, [id]: { ...s, name: clean } },
        };
      });
    },
    [userId],
  );

  const deleteStudio = useCallback(
    (id: string) => {
      if (useCloud && !isGuestUserId(userId)) {
        void deleteStudioCloud(id);
      }
      setLibrary((lib) => {
        const s = lib.studios[id];
        if (!s) return lib;
        if (s.ownerId && s.ownerId !== userId) return lib;
        const { [id]: _removed, ...rest } = lib.studios;
        void _removed;
        return {
          ...lib,
          studios: rest,
          studioOrder: lib.studioOrder.filter((sid) => sid !== id),
          projects: Object.fromEntries(
            Object.entries(lib.projects).map(([pid, p]) => [
              pid,
              { ...p, studioIds: p.studioIds.filter((sx) => sx !== id) },
            ]),
          ),
        };
      });
    },
    [userId, useCloud],
  );

  const toggleStudioMembership = useCallback(
    (projectId: string, studioId: string) => {
      setLibrary((lib) => {
        const p = lib.projects[projectId];
        if (!p) return lib;
        // Only the project owner can change which studios it belongs to.
        if (p.ownerId !== userId) return lib;
        const has = p.studioIds.includes(studioId);
        return withProject(lib, projectId, (cur) => ({
          ...cur,
          studioIds: has
            ? cur.studioIds.filter((s) => s !== studioId)
            : [...cur.studioIds, studioId],
        }));
      });
    },
    [userId],
  );

  /* ---------- comments ---------- */

  const addComment = useCallback(
    (projectId: string, text: string) => {
      const clean = text.trim();
      if (!clean) return;
      const c: Comment = {
        id: randomId(),
        text: clean,
        author: authorRef.current.displayName || "you",
        authorId: authorRef.current.userId,
        authorUsername: authorRef.current.username,
        createdAt: Date.now(),
      };
      setLibrary((lib) =>
        withProject(lib, projectId, (p) => ({
          ...p,
          comments: [...p.comments, c],
        })),
      );
      // If non-owner is currently viewing this project, mirror to preview so UI updates.
      setPreviewProject((prev) =>
        prev && prev.id === projectId
          ? { ...prev, comments: [...prev.comments, c] }
          : prev,
      );
    },
    [],
  );

  const canDeleteComment = useCallback(
    (projectId: string, commentId: string): boolean => {
      const p = library.projects[projectId];
      if (!p) return false;
      const c = p.comments.find((x) => x.id === commentId);
      if (!c) return false;
      if (p.ownerId === userId) return true;
      if (c.authorId && c.authorId === userId) return true;
      return false;
    },
    [library, userId],
  );

  const deleteComment = useCallback(
    (projectId: string, commentId: string) => {
      setLibrary((lib) => {
        const p = lib.projects[projectId];
        if (!p) return lib;
        const c = p.comments.find((x) => x.id === commentId);
        if (!c) return lib;
        const allowed =
          p.ownerId === userId || (c.authorId && c.authorId === userId);
        if (!allowed) return lib;
        return withProject(lib, projectId, (cur) => ({
          ...cur,
          comments: cur.comments.filter((x) => x.id !== commentId),
        }));
      });
      setPreviewProject((prev) =>
        prev && prev.id === projectId
          ? { ...prev, comments: prev.comments.filter((c) => c.id !== commentId) }
          : prev,
      );
    },
    [userId],
  );

  /* ---------- social: like & subscribe ---------- */

  const socialAgeOk = userState.socialAgeOk ?? false;

  const confirmSocialAge = useCallback(() => {
    setUserState((u) => ({ ...u, socialAgeOk: true }));
  }, []);

  const hasLiked = useCallback(
    (projectId: string): boolean => {
      const p = library.projects[projectId];
      if (!p) return false;
      return (p.likedByUserIds ?? []).includes(userId);
    },
    [library, userId],
  );

  const likeCount = useCallback(
    (projectId: string): number => {
      const p = library.projects[projectId];
      return p ? (p.likedByUserIds ?? []).length : 0;
    },
    [library],
  );

  const toggleLike = useCallback(
    (projectId: string) => {
      setLibrary((lib) =>
        withProject(lib, projectId, (p) => {
          const likes = p.likedByUserIds ?? [];
          const on = likes.includes(userId);
          return {
            ...p,
            likedByUserIds: on
              ? likes.filter((id) => id !== userId)
              : [...likes, userId],
          };
        }),
      );
      setPreviewProject((prev) => {
        if (!prev || prev.id !== projectId) return prev;
        const likes = prev.likedByUserIds ?? [];
        const on = likes.includes(userId);
        return {
          ...prev,
          likedByUserIds: on
            ? likes.filter((id) => id !== userId)
            : [...likes, userId],
        };
      });
    },
    [userId],
  );

  const isSubscribed = useCallback(
    (creatorId: string): boolean => {
      if (!creatorId) return false;
      return Boolean(userState.subscriptions?.[creatorId]);
    },
    [userState.subscriptions],
  );

  const isLongtimeSubscriber = useCallback(
    (creatorId: string): boolean => {
      const at = userState.subscriptions?.[creatorId];
      if (!at) return false;
      return Date.now() - at >= SIXTEEN_YEARS_MS;
    },
    [userState.subscriptions],
  );

  const toggleSubscribe = useCallback((creatorId: string) => {
    if (!creatorId) return;
    setUserState((u) => {
      const subs = { ...(u.subscriptions ?? {}) };
      if (subs[creatorId]) {
        delete subs[creatorId];
      } else {
        subs[creatorId] = Date.now();
      }
      return { ...u, subscriptions: subs };
    });
  }, []);

  /* ---------- owner-gated mutation helper ---------- */

  /** Apply `mutator` to the current project iff the active user owns it. */
  const editCurrentProject = useCallback(
    (mutator: (p: StoredProject) => StoredProject) => {
      if (!isOwnerRef.current) return;
      setLibrary((lib) => {
        const cur = lib.projects[currentIdRef.current];
        if (!cur || cur.ownerId !== userId) return lib;
        return withProject(lib, cur.id, mutator);
      });
    },
    [userId],
  );

  /* ---------- sprite ops ---------- */

  const selectSprite = useCallback(
    (id: string) => {
      // Selection is allowed for anyone (it's part of the view).
      if (isOwnerRef.current) {
        editCurrentProject((p) =>
          p.sprites.some((s) => s.id === id) ? { ...p, selectedSpriteId: id } : p,
        );
      } else {
        setPreviewProject((prev) =>
          prev && prev.sprites.some((s) => s.id === id)
            ? { ...prev, selectedSpriteId: id }
            : prev,
        );
      }
    },
    [editCurrentProject],
  );

  const addSprite = useCallback(() => {
    editCurrentProject((p) => {
      const emojis = [
        "🐶", "🦊", "🦄", "🤖", "👻", "🐙", "🐲", "🐸", "🐵", "🐝",
      ];
      const idx = p.sprites.length;
      const emoji = emojis[idx % emojis.length] ?? "✨";
      const sprite = makeSprite(`Sprite ${idx + 1}`, emoji);
      return {
        ...p,
        sprites: [...p.sprites, sprite],
        selectedSpriteId: sprite.id,
      };
    });
  }, [editCurrentProject]);

  const renameSprite = useCallback(
    (id: string, name: string) => {
      editCurrentProject((p) =>
        withSprite(p, id, (s) => ({ ...s, name: name.trim() || s.name })),
      );
    },
    [editCurrentProject],
  );

  const setSpriteCostume = useCallback(
    (id: string, costume: string) => {
      const trimmed = (costume || "").slice(0, 4) || "❓";
      editCurrentProject((p) =>
        withSprite(p, id, (s) => ({ ...s, costume: trimmed })),
      );
    },
    [editCurrentProject],
  );

  const deleteSprite = useCallback(
    (id: string) => {
      editCurrentProject((p) => {
        if (p.sprites.length <= 1) return p;
        const next = p.sprites.filter((s) => s.id !== id);
        const head = next[0];
        const selectedSpriteId =
          p.selectedSpriteId === id
            ? head
              ? head.id
              : ""
            : p.selectedSpriteId;
        return { ...p, sprites: next, selectedSpriteId };
      });
    },
    [editCurrentProject],
  );

  const spriteClicked = useCallback(
    (id: string) => {
      const cp = currentProject;
      const sprite = cp.sprites.find((s) => s.id === id);
      if (!sprite) return;
      for (const stack of sprite.stacks) {
        const hat = stack.blocks[0];
        if (hat?.defId === "event_clicked") {
          runtime.spawnThread(sprite.id, stack, 1, runStack);
        }
      }
    },
    [currentProject, runtime],
  );

  /* ---------- variables / broadcasts ---------- */

  const addVariable = useCallback(
    (name: string) => {
      const clean = name.trim();
      if (!clean) return;
      editCurrentProject((p) => {
        if (p.variables.some((v) => v.name === clean)) return p;
        const v: Variable = {
          id: randomId(),
          name: clean,
          value: "0",
          visible: true,
        };
        return { ...p, variables: [...p.variables, v] };
      });
    },
    [editCurrentProject],
  );

  const deleteVariable = useCallback(
    (id: string) => {
      editCurrentProject((p) => ({
        ...p,
        variables: p.variables.filter((v) => v.id !== id),
      }));
    },
    [editCurrentProject],
  );

  const addBroadcast = useCallback(
    (name: string): string => {
      const clean = name.trim();
      if (!clean) return "";
      editCurrentProject((p) => {
        if (p.broadcasts.some((b) => b.name === clean)) return p;
        const b: Broadcast = { id: randomId(), name: clean };
        return { ...p, broadcasts: [...p.broadcasts, b] };
      });
      return clean;
    },
    [editCurrentProject],
  );

  const deleteBroadcast = useCallback(
    (id: string) => {
      editCurrentProject((p) => ({
        ...p,
        broadcasts: p.broadcasts.filter((b) => b.id !== id),
      }));
    },
    [editCurrentProject],
  );

  /* ---------- block ops ---------- */

  const addBlock = useCallback(
    (defId: string, target: InsertTarget) => {
      const def = getBlockDef(defId);
      if (!def) return;
      if (def.shape === "reporter" || def.shape === "boolean") return;
      const block = makeBlockInstance(defId);
      if (!block) return;
      editCurrentProject((project) => {
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
      });
    },
    [editCurrentProject],
  );

  const insertReporter = useCallback(
    (target: InputRef, defId: string) => {
      const inst = makeBlockInstance(defId);
      if (!inst) return;
      editCurrentProject((p) =>
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
      );
    },
    [editCurrentProject],
  );

  const clearReporter = useCallback(
    (target: InputRef) => {
      editCurrentProject((p) =>
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
      );
    },
    [editCurrentProject],
  );

  const updateInputLiteral = useCallback(
    (target: InputRef, value: string) => {
      editCurrentProject((p) =>
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
      );
    },
    [editCurrentProject],
  );

  const updateField = useCallback(
    (target: FieldRef, value: string) => {
      editCurrentProject((p) =>
        updateStackInProject(p, target.spriteId, target.stackId, (s) => ({
          ...s,
          blocks: mutateBlock(s.blocks, target.path, (b) => ({
            ...b,
            fields: { ...b.fields, [target.fieldKey]: value },
          })),
        })),
      );
    },
    [editCurrentProject],
  );

  const removeBlock = useCallback(
    (target: BlockRef) => {
      editCurrentProject((p) =>
        updateStackInProject(p, target.spriteId, target.stackId, (s) => {
          const next = removeBlockAt(s.blocks, target.path);
          if (next.length === 0) return null;
          return { ...s, blocks: next };
        }),
      );
    },
    [editCurrentProject],
  );

  const moveBlock = useCallback(
    (from: BlockRef, to: InsertTarget) => {
      editCurrentProject((project) => {
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
      });
    },
    [editCurrentProject],
  );

  const deleteStack = useCallback(
    (stackId: string) => {
      editCurrentProject((p) =>
        withSprite(p, p.selectedSpriteId, (s) => ({
          ...s,
          stacks: s.stacks.filter((st) => st.id !== stackId),
        })),
      );
    },
    [editCurrentProject],
  );

  /* ---------- execution ---------- */

  const greenFlag = useCallback(() => {
    const cp = currentProject;
    let spawned = 0;
    for (const sprite of cp.sprites) {
      for (const stack of sprite.stacks) {
        const hat = stack.blocks[0];
        if (hat?.defId === "event_flag") {
          runtime.spawnThread(sprite.id, stack, 1, runStack);
          spawned += 1;
        }
      }
    }
    if (spawned === 0) {
      for (const sprite of cp.sprites) {
        for (const stack of sprite.stacks) {
          const hat = stack.blocks[0];
          const def = hat ? getBlockDef(hat.defId) : undefined;
          if (!def || def.shape !== "hat") {
            runtime.spawnThread(sprite.id, stack, 0, runStack);
          }
        }
      }
    }
  }, [currentProject, runtime]);

  const stopAll = useCallback(() => {
    runtime.stopAll();
  }, [runtime]);

  const keyPressed = useCallback(
    (key: string) => {
      const cp = currentProject;
      for (const sprite of cp.sprites) {
        for (const stack of sprite.stacks) {
          const hat = stack.blocks[0];
          if (hat?.defId === "event_keypress" && hat.fields.key === key) {
            runtime.spawnThread(sprite.id, stack, 1, runStack);
          }
        }
      }
    },
    [currentProject, runtime],
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
      if (userState.view === "editor") keyPressed(k);
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
  }, [runtime, keyPressed, userState.view]);

  const selectedSprite = useMemo(() => {
    const found = currentProject.sprites.find(
      (s) => s.id === currentProject.selectedSpriteId,
    );
    const fallback = currentProject.sprites[0];
    return found ?? fallback ?? makeSprite("Cat", "🐱");
  }, [currentProject]);

  const value = useMemo<ProjectContextValue>(
    () => ({
      libraryReady,
      library,
      project: currentProject,
      selectedSprite,
      runtime,
      running: runtime.isRunning,
      threadTick,
      view: userState.view,
      isOwner,
      currentUserId: userId,

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
      canDeleteComment,
      socialAgeOk,
      confirmSocialAge,
      hasLiked,
      likeCount,
      toggleLike,
      isSubscribed,
      isLongtimeSubscriber,
      toggleSubscribe,
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
      libraryReady,
      library,
      currentProject,
      selectedSprite,
      runtime,
      threadTick,
      userState.view,
      isOwner,
      userId,
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
      canDeleteComment,
      socialAgeOk,
      confirmSocialAge,
      hasLiked,
      likeCount,
      toggleLike,
      isSubscribed,
      isLongtimeSubscriber,
      toggleSubscribe,
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
