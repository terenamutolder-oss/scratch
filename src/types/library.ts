import type { Broadcast, Sprite, Variable } from "./blocks";

export type Comment = {
  id: string;
  text: string;
  /** Display name captured at post time. Required for back-compat. */
  author: string;
  /** Author userId, set on posts made after v0.5. May be absent on legacy data. */
  authorId?: string;
  authorUsername?: string;
  createdAt: number;
};

export type Studio = {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  /** Creator userId. Optional only for back-compat with v0.3 data. */
  ownerId?: string;
  ownerUsername?: string;
};

export type StoredProject = {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  updatedAt: number;
  studioIds: string[];
  comments: Comment[];
  /** userIds who liked this project (local browser). */
  likedByUserIds?: string[];
  sprites: Sprite[];
  selectedSpriteId: string;
  variables: Variable[];
  broadcasts: Broadcast[];
  /** Creator userId. Optional only for back-compat with v0.3/0.4 data. */
  ownerId?: string;
  ownerUsername?: string;
  ownerDisplayName?: string;
};

export type LibraryView = "editor" | "explore";

/** Shared library: all projects and studios visible to every account on this browser. */
export type SharedLibrary = {
  projects: Record<string, StoredProject>;
  projectOrder: string[];
  studios: Record<string, Studio>;
  studioOrder: string[];
};

/** Per-user UI state (which project is open, which view). */
export type UserState = {
  currentProjectId: string;
  view: LibraryView;
  /** creator userId → subscription start timestamp (ms). */
  subscriptions?: Record<string, number>;
  /** User confirmed they are 16+ before using comment / like / subscribe. */
  socialAgeOk?: boolean;
};

/** 16 calendar years in ms (for longtime-subscriber badge). */
export const SIXTEEN_YEARS_MS =
  16 * 365.2425 * 24 * 60 * 60 * 1000;

/** Legacy single-user library shape (used during migration). */
export type LegacyLibrary = {
  projects: Record<string, StoredProject>;
  projectOrder: string[];
  studios: Record<string, Studio>;
  studioOrder: string[];
  currentProjectId: string;
  view: LibraryView;
  authorName?: string;
};
