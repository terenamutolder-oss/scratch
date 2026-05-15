import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  AUTH_STORAGE_KEY,
  SESSION_STORAGE_KEY,
  type Session,
  type User,
  type UsersStore,
} from "../types/auth";
import { randomId } from "../catalog/blockCatalog";

/* --------------------------- password hashing --------------------------- */

const ITERATIONS = 150_000;
const HASH_BITS = 256;

function bytesToHex(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) {
    s += bytes[i]!.toString(16).padStart(2, "0");
  }
  return s;
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.length % 2 === 0 ? hex : `0${hex}`;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/** Timing-conservative hex string comparison (best-effort in JS). */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function deriveHash(
  password: string,
  saltBytes: Uint8Array,
  iterations: number,
): Promise<string> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: saltBytes, iterations, hash: "SHA-256" },
    keyMaterial,
    HASH_BITS,
  );
  return bytesToHex(new Uint8Array(bits));
}

async function hashNewPassword(
  password: string,
): Promise<{ saltHex: string; hashHex: string; iterations: number }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hashHex = await deriveHash(password, salt, ITERATIONS);
  return { saltHex: bytesToHex(salt), hashHex, iterations: ITERATIONS };
}

async function verifyPassword(
  password: string,
  user: User,
): Promise<boolean> {
  const candidate = await deriveHash(
    password,
    hexToBytes(user.passwordSalt),
    user.iterations,
  );
  return constantTimeEqual(candidate, user.passwordHash);
}

/* --------------------------- store helpers --------------------------- */

function loadUsers(): UsersStore {
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

function saveUsers(store: UsersStore) {
  try {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* ignore */
  }
}

function loadSession(): Session | null {
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

function saveSession(session: Session | null) {
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

function canonicalUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

function validateUsername(u: string): string | null {
  if (u.length < 2) return "Username must be at least 2 characters.";
  if (u.length > 24) return "Username must be at most 24 characters.";
  if (!/^[a-z0-9._-]+$/.test(u)) {
    return "Use only letters, numbers, dots, dashes, or underscores.";
  }
  return null;
}

function validatePassword(p: string): string | null {
  if (p.length < 6) return "Password must be at least 6 characters.";
  if (p.length > 200) return "Password must be at most 200 characters.";
  return null;
}

/* --------------------------- context --------------------------- */

export type AuthResult = { ok: true } | { ok: false; error: string };

export type AuthContextValue = {
  ready: boolean;
  currentUser: User | null;
  userCount: number;
  signUp: (input: {
    username: string;
    displayName: string;
    password: string;
  }) => Promise<AuthResult>;
  signIn: (input: { username: string; password: string }) => Promise<AuthResult>;
  signOut: () => void;
  updateDisplayName: (name: string) => void;
};

const Ctx = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [users, setUsers] = useState<UsersStore>(() => loadUsers());
  const [session, setSession] = useState<Session | null>(() => loadSession());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
  }, []);

  useEffect(() => {
    saveUsers(users);
  }, [users]);

  useEffect(() => {
    saveSession(session);
  }, [session]);

  const currentUser = useMemo<User | null>(() => {
    if (!session) return null;
    return users.users[session.userId] ?? null;
  }, [session, users]);

  // If session points at a missing user (e.g., user deleted in another tab), drop it.
  useEffect(() => {
    if (session && !users.users[session.userId]) {
      setSession(null);
    }
  }, [session, users]);

  const signUp = useCallback<AuthContextValue["signUp"]>(
    async ({ username, displayName, password }) => {
      const u = canonicalUsername(username);
      const nameError = validateUsername(u);
      if (nameError) return { ok: false, error: nameError };
      const pwError = validatePassword(password);
      if (pwError) return { ok: false, error: pwError };

      if (users.byUsername[u]) {
        return { ok: false, error: "Username is taken." };
      }

      const { saltHex, hashHex, iterations } = await hashNewPassword(password);
      const newUser: User = {
        id: randomId(),
        username: u,
        displayName: displayName.trim() || u,
        passwordSalt: saltHex,
        passwordHash: hashHex,
        iterations,
        createdAt: Date.now(),
        lastLoginAt: Date.now(),
      };

      setUsers((prev) => ({
        users: { ...prev.users, [newUser.id]: newUser },
        byUsername: { ...prev.byUsername, [u]: newUser.id },
      }));
      setSession({ userId: newUser.id, startedAt: Date.now() });
      return { ok: true };
    },
    [users],
  );

  const signIn = useCallback<AuthContextValue["signIn"]>(
    async ({ username, password }) => {
      const u = canonicalUsername(username);
      const userId = users.byUsername[u];
      if (!userId) return { ok: false, error: "No account with that username." };
      const user = users.users[userId];
      if (!user) return { ok: false, error: "No account with that username." };

      const ok = await verifyPassword(password, user);
      if (!ok) return { ok: false, error: "Wrong password." };

      setUsers((prev) => ({
        ...prev,
        users: {
          ...prev.users,
          [user.id]: { ...user, lastLoginAt: Date.now() },
        },
      }));
      setSession({ userId: user.id, startedAt: Date.now() });
      return { ok: true };
    },
    [users],
  );

  const signOut = useCallback(() => {
    setSession(null);
  }, []);

  const updateDisplayName = useCallback(
    (name: string) => {
      const clean = name.trim().slice(0, 40);
      if (!clean || !currentUser) return;
      setUsers((prev) => {
        const u = prev.users[currentUser.id];
        if (!u) return prev;
        return {
          ...prev,
          users: { ...prev.users, [u.id]: { ...u, displayName: clean } },
        };
      });
    },
    [currentUser],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      ready,
      currentUser,
      userCount: Object.keys(users.users).length,
      signUp,
      signIn,
      signOut,
      updateDisplayName,
    }),
    [ready, currentUser, users, signUp, signIn, signOut, updateDisplayName],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("AuthProvider missing");
  return v;
}
