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
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  type User as FirebaseUser,
} from "firebase/auth";
import {
  GUEST_USER_ID,
  isGuestUserId,
  type Session,
  type User,
  type UsersStore,
} from "../types/auth";
import { randomId } from "../catalog/blockCatalog";
import {
  getFirebaseAuth,
  isFirebaseConfigured,
  usernameToAuthEmail,
} from "../lib/firebase";
import {
  loadLocalSession,
  loadUsersStore,
  saveLocalSession,
  saveUsersStore,
} from "../storage/localPersistence";
import {
  claimUsername,
  createUserProfile,
  fetchUserProfile,
  isUsernameAvailable,
  updateUserProfile,
} from "../storage/cloudPersistence";

/* --------------------------- password hashing (local-only) --------------------------- */

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

function syntheticGuestUser(): User {
  return {
    id: GUEST_USER_ID,
    username: "guest",
    displayName: "Guest",
    passwordSalt: "",
    passwordHash: "",
    iterations: 0,
    createdAt: 0,
    lastLoginAt: 0,
    isGuest: true,
  };
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

function profileToUser(uid: string, profile: {
  username: string;
  displayName: string;
  createdAt: number;
  lastLoginAt: number;
}): User {
  return {
    id: uid,
    username: profile.username,
    displayName: profile.displayName,
    passwordSalt: "",
    passwordHash: "",
    iterations: 0,
    createdAt: profile.createdAt,
    lastLoginAt: profile.lastLoginAt,
  };
}

function firebaseAuthErrorMessage(code: string): string {
  switch (code) {
    case "auth/email-already-in-use":
      return "Username is taken.";
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Wrong username or password.";
    case "auth/too-many-requests":
      return "Too many attempts. Wait a moment and try again.";
    default:
      return "Authentication failed. Try again.";
  }
}

/* --------------------------- context --------------------------- */

export type AuthResult = { ok: true } | { ok: false; error: string };

export type AuthContextValue = {
  ready: boolean;
  currentUser: User | null;
  userCount: number;
  /** True when Firebase + Firestore are configured (cloud persistence). */
  usesCloud: boolean;
  continueAsGuest: () => void;
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
  const usesCloud = isFirebaseConfigured();

  const [users, setUsers] = useState<UsersStore>(() =>
    usesCloud ? { users: {}, byUsername: {} } : loadUsersStore(),
  );
  const [session, setSession] = useState<Session | null>(() =>
    usesCloud ? null : loadLocalSession(),
  );
  const [cloudUser, setCloudUser] = useState<User | null>(null);
  const [ready, setReady] = useState(!usesCloud);

  useEffect(() => {
    if (!usesCloud) {
      saveUsersStore(users);
    }
  }, [users, usesCloud]);

  useEffect(() => {
    if (!usesCloud) {
      saveLocalSession(session);
    }
  }, [session, usesCloud]);

  useEffect(() => {
    if (!usesCloud) return;

    const auth = getFirebaseAuth();
    const unsub = onAuthStateChanged(auth, async (fbUser: FirebaseUser | null) => {
      if (!fbUser) {
        setCloudUser(null);
        setReady(true);
        return;
      }
      try {
        const profile = await fetchUserProfile(fbUser.uid);
        if (profile) {
          setCloudUser(profileToUser(fbUser.uid, profile));
        } else {
          setCloudUser(null);
        }
      } catch (e) {
        console.error(e);
        setCloudUser(null);
      }
      setReady(true);
    });
    return () => unsub();
  }, [usesCloud]);

  const currentUser = useMemo<User | null>(() => {
    if (usesCloud) {
      if (session && isGuestUserId(session.userId)) return syntheticGuestUser();
      return cloudUser;
    }
    if (!session) return null;
    if (isGuestUserId(session.userId)) return syntheticGuestUser();
    return users.users[session.userId] ?? null;
  }, [usesCloud, session, cloudUser, users]);

  useEffect(() => {
    if (
      !usesCloud &&
      session &&
      !isGuestUserId(session.userId) &&
      !users.users[session.userId]
    ) {
      setSession(null);
    }
  }, [session, users, usesCloud]);

  const continueAsGuest = useCallback(() => {
    setSession({ userId: GUEST_USER_ID, startedAt: Date.now() });
  }, []);

  const signUpCloud = useCallback<AuthContextValue["signUp"]>(
    async ({ username, displayName, password }) => {
      const u = canonicalUsername(username);
      const nameError = validateUsername(u);
      if (nameError) return { ok: false, error: nameError };
      const pwError = validatePassword(password);
      if (pwError) return { ok: false, error: pwError };

      if (!(await isUsernameAvailable(u))) {
        return { ok: false, error: "Username is taken." };
      }

      try {
        const cred = await createUserWithEmailAndPassword(
          getFirebaseAuth(),
          usernameToAuthEmail(u),
          password,
        );
        const now = Date.now();
        const profile = {
          username: u,
          displayName: displayName.trim() || u,
          createdAt: now,
          lastLoginAt: now,
        };
        const nameRes = await claimUsername(cred.user.uid, u);
        if (!nameRes.ok) {
          return { ok: false, error: nameRes.error };
        }
        await createUserProfile(cred.user.uid, profile);
        setCloudUser(profileToUser(cred.user.uid, profile));
        setSession(null);
        return { ok: true };
      } catch (e) {
        const code =
          e && typeof e === "object" && "code" in e
            ? String((e as { code: string }).code)
            : "";
        return { ok: false, error: firebaseAuthErrorMessage(code) };
      }
    },
    [],
  );

  const signUpLocal = useCallback<AuthContextValue["signUp"]>(
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

  const signInCloud = useCallback<AuthContextValue["signIn"]>(
    async ({ username, password }) => {
      const u = canonicalUsername(username);
      try {
        const cred = await signInWithEmailAndPassword(
          getFirebaseAuth(),
          usernameToAuthEmail(u),
          password,
        );
        const profile = await fetchUserProfile(cred.user.uid);
        if (!profile) {
          return { ok: false, error: "Account profile missing. Contact support." };
        }
        await updateUserProfile(cred.user.uid, { lastLoginAt: Date.now() });
        setCloudUser(
          profileToUser(cred.user.uid, {
            ...profile,
            lastLoginAt: Date.now(),
          }),
        );
        setSession(null);
        return { ok: true };
      } catch (e) {
        const code =
          e && typeof e === "object" && "code" in e
            ? String((e as { code: string }).code)
            : "";
        return { ok: false, error: firebaseAuthErrorMessage(code) };
      }
    },
    [],
  );

  const signInLocal = useCallback<AuthContextValue["signIn"]>(
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
    if (usesCloud) {
      void firebaseSignOut(getFirebaseAuth());
    }
    setSession(null);
    setCloudUser(null);
  }, [usesCloud]);

  const updateDisplayName = useCallback(
    (name: string) => {
      const clean = name.trim().slice(0, 40);
      if (!clean || !currentUser || currentUser.isGuest) return;

      if (usesCloud) {
        void updateUserProfile(currentUser.id, { displayName: clean });
        setCloudUser((prev) =>
          prev ? { ...prev, displayName: clean } : prev,
        );
        return;
      }

      setUsers((prev) => {
        const u = prev.users[currentUser.id];
        if (!u) return prev;
        return {
          ...prev,
          users: { ...prev.users, [u.id]: { ...u, displayName: clean } },
        };
      });
    },
    [currentUser, usesCloud],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      ready,
      currentUser,
      userCount: Object.keys(users.users).length,
      usesCloud,
      continueAsGuest,
      signUp: usesCloud ? signUpCloud : signUpLocal,
      signIn: usesCloud ? signInCloud : signInLocal,
      signOut,
      updateDisplayName,
    }),
    [
      ready,
      currentUser,
      users,
      usesCloud,
      continueAsGuest,
      signUpCloud,
      signUpLocal,
      signInCloud,
      signInLocal,
      signOut,
      updateDisplayName,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("AuthProvider missing");
  return v;
}
