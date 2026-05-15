export type User = {
  id: string;
  /** Lowercased canonical username (login handle). */
  username: string;
  /** Display name shown in the UI; editable later. */
  displayName: string;
  /** Hex-encoded PBKDF2 salt. */
  passwordSalt: string;
  /** Hex-encoded PBKDF2 hash. */
  passwordHash: string;
  /** PBKDF2 iteration count used for this account. */
  iterations: number;
  createdAt: number;
  lastLoginAt: number;
};

export type UsersStore = {
  /** userId → user record. */
  users: Record<string, User>;
  /** lowercased username → userId. */
  byUsername: Record<string, string>;
};

export type Session = {
  userId: string;
  startedAt: number;
};

export const AUTH_STORAGE_KEY = "scratch-web/users";
export const SESSION_STORAGE_KEY = "scratch-web/session";

/** localStorage key for the shared library (every project, every studio). */
export const SHARED_LIBRARY_KEY = "scratch-web/shared-library";

/** Per-user UI state (currentProjectId + view). */
export function userStateKey(userId: string): string {
  return `scratch-web/user-state/${userId}`;
}

/** Legacy: per-user library key from v0.4 (one library per signed-in user). */
export function legacyUserLibraryKey(userId: string): string {
  return `scratch-web/library/${userId}`;
}

/** Legacy: pre-account single library key (v0.3). */
export const LEGACY_LIBRARY_KEY = "scratch-web/library";
