import {
  AUTH_STORAGE_KEY,
  LEGACY_LIBRARY_KEY,
  SESSION_STORAGE_KEY,
  SHARED_LIBRARY_KEY,
  legacyUserLibraryKey,
  userStateKey,
  type Session,
  type UsersStore,
} from "../types/auth";
import type {
  LegacyLibrary,
  SharedLibrary,
  StoredProject,
  Studio,
  UserState,
} from "../types/library";
import type { Project } from "../types/blocks";
import { randomId } from "../catalog/blockCatalog";
import { makeSprite } from "../engine/sprite";

const LEGACY_FLAT_PROJECT_KEY = "scratch-web/project";

export function loadUsersStore(): UsersStore {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return { users: {}, byUsername: {} };
    const parsed = JSON.parse(raw) as UsersStore;
    return {
      users: parsed.users ?? {},
      byUsername: parsed.byUsername ?? {},
    };
  } catch {
    return { users: {}, byUsername: {} };
  }
}

export function saveUsersStore(store: UsersStore) {
  try {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* ignore */
  }
}

export function loadLocalSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Session;
    if (!parsed.userId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveLocalSession(session: Session | null) {
  try {
    if (session) {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    } else {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    }
  } catch {
    /* ignore */
  }
}

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

export function loadSharedLibraryLocal(): SharedLibrary {
  try {
    const raw = localStorage.getItem(SHARED_LIBRARY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as SharedLibrary;
      if (parsed.projects && parsed.projectOrder) {
        return {
          projects: parsed.projects,
          projectOrder: parsed.projectOrder,
          studios: parsed.studios ?? {},
          studioOrder: parsed.studioOrder ?? [],
        };
      }
    }
  } catch {
    /* ignore */
  }
  return { projects: {}, projectOrder: [], studios: {}, studioOrder: [] };
}

export function saveSharedLibraryLocal(library: SharedLibrary) {
  try {
    localStorage.setItem(SHARED_LIBRARY_KEY, JSON.stringify(library));
  } catch {
    /* ignore */
  }
}

function mergeLegacyLibrary(
  shared: SharedLibrary,
  lib: LegacyLibrary,
  userId: string,
  username: string,
  displayName: string,
): SharedLibrary {
  const tagProject = (p: StoredProject): StoredProject => ({
    ...p,
    ownerId: p.ownerId ?? userId,
    ownerUsername: p.ownerUsername ?? username,
    ownerDisplayName: p.ownerDisplayName ?? displayName,
    comments: (p.comments ?? []).map((c) => ({
      ...c,
      authorId: c.authorId ?? userId,
      authorUsername: c.authorUsername ?? username,
    })),
  });
  const tagStudio = (s: Studio): Studio => ({
    ...s,
    ownerId: s.ownerId ?? userId,
    ownerUsername: s.ownerUsername ?? username,
  });
  const projects = { ...shared.projects };
  const projectOrder = [...shared.projectOrder];
  for (const id of lib.projectOrder) {
    const p = lib.projects[id];
    if (p && !projects[id]) {
      projects[id] = tagProject(p);
      projectOrder.push(id);
    }
  }
  const studios = { ...shared.studios };
  const studioOrder = [...shared.studioOrder];
  for (const sid of lib.studioOrder) {
    const s = lib.studios[sid];
    if (s && !studios[sid]) {
      studios[sid] = tagStudio(s);
      studioOrder.push(sid);
    }
  }
  return { projects, projectOrder, studios, studioOrder };
}

/** Merge legacy localStorage keys into the shared library (guest or pre-cloud). */
export function migrateLocalLibrary(
  userId: string,
  username: string,
  displayName: string,
): { shared: SharedLibrary; preferredUserState: UserState | null } {
  let shared = loadSharedLibraryLocal();
  let preferredUserState: UserState | null = null;

  try {
    const k = legacyUserLibraryKey(userId);
    const raw = localStorage.getItem(k);
    if (raw) {
      const lib = JSON.parse(raw) as LegacyLibrary;
      if (lib.projects && lib.projectOrder) {
        shared = mergeLegacyLibrary(shared, lib, userId, username, displayName);
        preferredUserState = {
          currentProjectId: lib.currentProjectId,
          view: lib.view ?? "editor",
        };
      }
      localStorage.removeItem(k);
    }
  } catch {
    /* ignore */
  }

  try {
    const raw = localStorage.getItem(LEGACY_LIBRARY_KEY);
    if (raw) {
      const lib = JSON.parse(raw) as LegacyLibrary;
      if (lib.projects && lib.projectOrder) {
        shared = mergeLegacyLibrary(shared, lib, userId, username, displayName);
        if (!preferredUserState) {
          preferredUserState = {
            currentProjectId: lib.currentProjectId,
            view: lib.view ?? "editor",
          };
        }
      }
      localStorage.removeItem(LEGACY_LIBRARY_KEY);
    }
  } catch {
    /* ignore */
  }

  try {
    const raw = localStorage.getItem(LEGACY_FLAT_PROJECT_KEY);
    if (raw) {
      const legacy = JSON.parse(raw) as Project;
      const wrapped: StoredProject = {
        ...newStoredProject(
          "Imported project",
          userId,
          username,
          displayName,
        ),
        sprites: legacy.sprites,
        selectedSpriteId: legacy.selectedSpriteId,
        variables: legacy.variables,
        broadcasts: legacy.broadcasts,
      };
      shared = {
        ...shared,
        projects: { ...shared.projects, [wrapped.id]: wrapped },
        projectOrder: [wrapped.id, ...shared.projectOrder],
      };
      if (!preferredUserState) {
        preferredUserState = { currentProjectId: wrapped.id, view: "editor" };
      }
      localStorage.removeItem(LEGACY_FLAT_PROJECT_KEY);
    }
  } catch {
    /* ignore */
  }

  if (shared.projectOrder.length === 0) {
    const seed = newStoredProject(
      "My first project",
      userId,
      username,
      displayName,
    );
    shared = {
      ...shared,
      projects: { ...shared.projects, [seed.id]: seed },
      projectOrder: [seed.id, ...shared.projectOrder],
    };
    if (!preferredUserState) {
      preferredUserState = { currentProjectId: seed.id, view: "editor" };
    }
  }

  return { shared, preferredUserState };
}

export function loadUserStateLocal(
  userId: string,
  fallback: UserState,
  shared: SharedLibrary,
): UserState {
  try {
    const raw = localStorage.getItem(userStateKey(userId));
    if (raw) {
      const parsed = JSON.parse(raw) as UserState;
      const currentProjectId =
        parsed.currentProjectId && shared.projects[parsed.currentProjectId]
          ? parsed.currentProjectId
          : fallback.currentProjectId;
      return {
        currentProjectId,
        view: parsed.view === "explore" ? "explore" : "editor",
        subscriptions: parsed.subscriptions ?? {},
        socialAgeOk: parsed.socialAgeOk ?? false,
      };
    }
  } catch {
    /* ignore */
  }
  return fallback;
}

export function saveUserStateLocal(userId: string, state: UserState) {
  try {
    localStorage.setItem(userStateKey(userId), JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

/** Snapshot of browser-local data to upload after first cloud sign-in. */
export function readLocalLibrarySnapshot(): SharedLibrary {
  return loadSharedLibraryLocal();
}

export function clearLocalLibraryAfterCloudImport() {
  try {
    localStorage.removeItem(SHARED_LIBRARY_KEY);
    localStorage.removeItem(LEGACY_LIBRARY_KEY);
    localStorage.removeItem(LEGACY_FLAT_PROJECT_KEY);
  } catch {
    /* ignore */
  }
}
