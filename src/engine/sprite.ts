import type { Sprite } from "../types/blocks";
import { randomId } from "../catalog/blockCatalog";

export const STAGE_W = 480;
export const STAGE_H = 360;
export const STAGE_MIN_X = -STAGE_W / 2;
export const STAGE_MAX_X = STAGE_W / 2;
export const STAGE_MIN_Y = -STAGE_H / 2;
export const STAGE_MAX_Y = STAGE_H / 2;

export const DEFAULT_COSTUMES = ["🐱", "🐶", "🦊", "🦄", "🤖", "👻", "🐙", "🐲"];

export function makeSprite(name?: string, costume?: string): Sprite {
  return {
    id: randomId(),
    name: name ?? "Sprite",
    costume: costume ?? "🐱",
    x: 0,
    y: 0,
    direction: 90,
    size: 100,
    visible: true,
    sayText: null,
    sayKind: "say",
    stacks: [],
  };
}

/** Stage (Scratch coords with y-up) → screen pixels (y-down). */
export function toScreen(x: number, y: number): { sx: number; sy: number } {
  return { sx: STAGE_W / 2 + x, sy: STAGE_H / 2 - y };
}

export function clampStage(x: number, y: number): { x: number; y: number } {
  return {
    x: Math.min(STAGE_MAX_X, Math.max(STAGE_MIN_X, x)),
    y: Math.min(STAGE_MAX_Y, Math.max(STAGE_MIN_Y, y)),
  };
}
