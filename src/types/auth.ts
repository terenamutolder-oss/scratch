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

/** localStorage key holding the library for a given user. */
export function libraryStorageKey(userId: string): string {
  return `scratch-web/library/${userId}`;
}

/** Legacy single-library key, used for one-time migration on first signup. */
export const LEGACY_LIBRARY_KEY = "scratch-web/library";
