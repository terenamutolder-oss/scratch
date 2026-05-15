import type { BlockPath } from "../state/ProjectContext";

export const DND_TYPE = "application/x-scratch-web";

export type DragPayload =
  | { source: "palette"; defId: string }
  | { source: "script"; spriteId: string; stackId: string; path: BlockPath };

const KEYS = [DND_TYPE, "text/plain"] as const;

export function writeDragData(dt: DataTransfer, payload: DragPayload): void {
  const raw = JSON.stringify(payload);
  for (const k of KEYS) dt.setData(k, raw);
}

export function readDragPayload(dt: DataTransfer): DragPayload | null {
  for (const k of KEYS) {
    const raw = dt.getData(k);
    if (!raw) continue;
    try {
      return JSON.parse(raw) as DragPayload;
    } catch {
      /* try next */
    }
  }
  return null;
}
