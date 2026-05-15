import type { Broadcast, Sprite, Variable } from "./blocks";

export type Comment = {
  id: string;
  text: string;
  author: string;
  createdAt: number;
};

export type Studio = {
  id: string;
  name: string;
  description: string;
  createdAt: number;
};

export type StoredProject = {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  updatedAt: number;
  studioIds: string[];
  comments: Comment[];
  sprites: Sprite[];
  selectedSpriteId: string;
  variables: Variable[];
  broadcasts: Broadcast[];
};

export type LibraryView = "editor" | "explore";

export type Library = {
  projects: Record<string, StoredProject>;
  projectOrder: string[];
  studios: Record<string, Studio>;
  studioOrder: string[];
  currentProjectId: string;
  view: LibraryView;
  /** Display name used as the author of new comments. */
  authorName: string;
};
