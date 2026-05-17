import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import { getFirestoreDb } from "../lib/firebase";
import type { SharedLibrary, StoredProject, Studio, UserState } from "../types/library";
import {
  clearLocalLibraryAfterCloudImport,
  readLocalLibrarySnapshot,
} from "./localPersistence";

const IMPORT_FLAG = "scratch-web/cloud-imported";

export type CloudUserProfile = {
  username: string;
  displayName: string;
  createdAt: number;
  lastLoginAt: number;
};

export async function fetchUserProfile(
  uid: string,
): Promise<CloudUserProfile | null> {
  const snap = await getDoc(doc(getFirestoreDb(), "users", uid));
  if (!snap.exists()) return null;
  return snap.data() as CloudUserProfile;
}

export async function isUsernameAvailable(username: string): Promise<boolean> {
  const snap = await getDoc(doc(getFirestoreDb(), "usernames", username));
  return !snap.exists();
}

export async function claimUsername(
  uid: string,
  username: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const nameRef = doc(getFirestoreDb(), "usernames", username);
  const existing = await getDoc(nameRef);
  if (existing.exists()) {
    return { ok: false, error: "Username is taken." };
  }
  await setDoc(nameRef, { uid });
  return { ok: true };
}

export async function createUserProfile(
  uid: string,
  profile: CloudUserProfile,
): Promise<void> {
  await setDoc(doc(getFirestoreDb(), "users", uid), profile);
}

export async function updateUserProfile(
  uid: string,
  patch: Partial<CloudUserProfile>,
): Promise<void> {
  await setDoc(doc(getFirestoreDb(), "users", uid), patch, { merge: true });
}

export async function fetchSharedLibrary(): Promise<SharedLibrary> {
  const db = getFirestoreDb();
  const [projectsSnap, studiosSnap] = await Promise.all([
    getDocs(collection(db, "projects")),
    getDocs(collection(db, "studios")),
  ]);

  const projects: Record<string, StoredProject> = {};
  const projectRows: { id: string; updatedAt: number }[] = [];
  for (const d of projectsSnap.docs) {
    const data = d.data() as StoredProject;
    const id = data.id || d.id;
    projects[id] = { ...data, id };
    projectRows.push({ id, updatedAt: data.updatedAt ?? 0 });
  }
  projectRows.sort((a, b) => b.updatedAt - a.updatedAt);
  const projectOrder = projectRows.map((r) => r.id);

  const studios: Record<string, Studio> = {};
  const studioRows: { id: string; createdAt: number }[] = [];
  for (const d of studiosSnap.docs) {
    const data = d.data() as Studio;
    const id = data.id || d.id;
    studios[id] = { ...data, id };
    studioRows.push({ id, createdAt: data.createdAt ?? 0 });
  }
  studioRows.sort((a, b) => a.createdAt - b.createdAt);
  const studioOrder = studioRows.map((r) => r.id);

  return { projects, projectOrder, studios, studioOrder };
}

export async function fetchUserState(uid: string): Promise<UserState | null> {
  const snap = await getDoc(doc(getFirestoreDb(), "userState", uid));
  if (!snap.exists()) return null;
  return snap.data() as UserState;
}

export async function saveUserStateCloud(uid: string, state: UserState) {
  await setDoc(doc(getFirestoreDb(), "userState", uid), state);
}

let syncTimer: ReturnType<typeof setTimeout> | null = null;
let pendingLibrary: SharedLibrary | null = null;

export function scheduleLibrarySync(library: SharedLibrary) {
  pendingLibrary = library;
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    const lib = pendingLibrary;
    pendingLibrary = null;
    syncTimer = null;
    if (lib) void syncSharedLibrary(lib);
  }, 800);
}

export async function syncSharedLibrary(library: SharedLibrary): Promise<void> {
  const db = getFirestoreDb();
  const writes: Array<{ col: "projects" | "studios"; id: string; data: object }> =
    [];

  for (const id of library.projectOrder) {
    const p = library.projects[id];
    if (p) writes.push({ col: "projects", id: p.id, data: { ...p, id: p.id } });
  }
  for (const id of library.studioOrder) {
    const s = library.studios[id];
    if (s) writes.push({ col: "studios", id: s.id, data: { ...s, id: s.id } });
  }

  const CHUNK = 400;
  for (let i = 0; i < writes.length; i += CHUNK) {
    const batch = writeBatch(db);
    for (const w of writes.slice(i, i + CHUNK)) {
      batch.set(doc(db, w.col, w.id), w.data);
    }
    await batch.commit();
  }
}

export async function deleteProjectCloud(projectId: string) {
  await deleteDoc(doc(getFirestoreDb(), "projects", projectId));
}

export async function deleteStudioCloud(studioId: string) {
  await deleteDoc(doc(getFirestoreDb(), "studios", studioId));
}

/** Upload browser-local library once, then clear local keys. */
export async function importLocalLibraryIfNeeded(
  uid: string,
  username: string,
  displayName: string,
): Promise<SharedLibrary> {
  const flagKey = `${IMPORT_FLAG}/${uid}`;
  if (localStorage.getItem(flagKey)) {
    return fetchSharedLibrary();
  }

  const local = readLocalLibrarySnapshot();
  const hasLocal =
    local.projectOrder.length > 0 || Object.keys(local.projects).length > 0;

  let cloud = await fetchSharedLibrary();
  const cloudEmpty =
    cloud.projectOrder.length === 0 &&
    Object.keys(cloud.projects).length === 0;

  if (hasLocal && cloudEmpty) {
    const tagged: SharedLibrary = {
      projects: {},
      projectOrder: [...local.projectOrder],
      studios: {},
      studioOrder: [...local.studioOrder],
    };
    for (const id of local.projectOrder) {
      const p = local.projects[id];
      if (!p) continue;
      tagged.projects[id] = {
        ...p,
        ownerId: p.ownerId ?? uid,
        ownerUsername: p.ownerUsername ?? username,
        ownerDisplayName: p.ownerDisplayName ?? displayName,
      };
    }
    for (const id of local.studioOrder) {
      const s = local.studios[id];
      if (!s) continue;
      tagged.studios[id] = {
        ...s,
        ownerId: s.ownerId ?? uid,
        ownerUsername: s.ownerUsername ?? username,
      };
    }
    await syncSharedLibrary(tagged);
    clearLocalLibraryAfterCloudImport();
    cloud = tagged;
  }

  localStorage.setItem(flagKey, "1");
  return cloud;
}
