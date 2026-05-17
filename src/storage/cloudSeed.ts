import { randomId } from "../catalog/blockCatalog";
import { makeSprite } from "../engine/sprite";
import type { SharedLibrary, StoredProject } from "../types/library";
import { migrateLocalLibrary } from "./localPersistence";
import { fetchSharedLibrary, syncSharedLibrary } from "./cloudPersistence";

export async function ensureSeedProject(
  uid: string,
  username: string,
  displayName: string,
): Promise<SharedLibrary> {
  let lib = await fetchSharedLibrary();
  if (lib.projectOrder.length > 0) return lib;

  const { shared } = migrateLocalLibrary(uid, username, displayName);
  if (shared.projectOrder.length > 0) {
    await syncSharedLibrary(shared);
    return shared;
  }

  const cat = makeSprite("Cat", "🐱");
  const seed: StoredProject = {
    id: randomId(),
    name: "My first project",
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
    ownerId: uid,
    ownerUsername: username,
    ownerDisplayName: displayName,
  };
  lib = {
    projects: { [seed.id]: seed },
    projectOrder: [seed.id],
    studios: {},
    studioOrder: [],
  };
  await syncSharedLibrary(lib);
  return lib;
}
