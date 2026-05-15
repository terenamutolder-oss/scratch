import type { BlockInstance, InputValue } from "../types/blocks";
import { clampStage, STAGE_MAX_X, STAGE_MAX_Y } from "./sprite";
import {
  animate,
  StopThisScript,
  ThreadCtx,
  wait,
  yieldFrame,
} from "./runtime";

const MOVE_DURATION_MS = 320;
const TURN_DURATION_MS = 200;
const SAY_DEFAULT_MS = 1200;

function toNum(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "boolean") return v ? 1 : 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function toStr(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "boolean") return v ? "true" : "false";
  return String(v);
}

function toBool(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") {
    if (v === "" || v === "0" || v.toLowerCase() === "false") return false;
    return true;
  }
  return false;
}

async function evalInput(
  input: InputValue | undefined,
  ctx: ThreadCtx,
): Promise<unknown> {
  if (!input) return "";
  if (input.kind === "literal") return input.value;
  return await evalReporter(input.block, ctx);
}

async function evalReporter(
  block: BlockInstance,
  ctx: ThreadCtx,
): Promise<unknown> {
  const r = ctx.runtime;
  switch (block.defId) {
    case "motion_xpos":
      return r.getSprite(ctx.spriteId)?.x ?? 0;
    case "motion_ypos":
      return r.getSprite(ctx.spriteId)?.y ?? 0;
    case "motion_direction":
      return r.getSprite(ctx.spriteId)?.direction ?? 90;
    case "looks_size":
      return r.getSprite(ctx.spriteId)?.size ?? 100;
    case "sensing_mouse_x":
      return r.mouseX;
    case "sensing_mouse_y":
      return r.mouseY;
    case "sensing_mouse_down":
      return r.mouseDown;
    case "sensing_key_pressed":
      return r.isKeyPressed(block.fields.key ?? "space");
    case "sensing_timer":
      return r.getTimer();
    case "op_add":
      return toNum(await evalInput(block.inputs.a, ctx)) +
        toNum(await evalInput(block.inputs.b, ctx));
    case "op_sub":
      return toNum(await evalInput(block.inputs.a, ctx)) -
        toNum(await evalInput(block.inputs.b, ctx));
    case "op_mul":
      return toNum(await evalInput(block.inputs.a, ctx)) *
        toNum(await evalInput(block.inputs.b, ctx));
    case "op_div": {
      const b = toNum(await evalInput(block.inputs.b, ctx));
      if (b === 0) return 0;
      return toNum(await evalInput(block.inputs.a, ctx)) / b;
    }
    case "op_mod": {
      const b = toNum(await evalInput(block.inputs.b, ctx));
      if (b === 0) return 0;
      const a = toNum(await evalInput(block.inputs.a, ctx));
      return ((a % b) + b) % b;
    }
    case "op_random": {
      const a = toNum(await evalInput(block.inputs.a, ctx));
      const b = toNum(await evalInput(block.inputs.b, ctx));
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
      const bothInt = Number.isInteger(a) && Number.isInteger(b);
      if (bothInt) {
        return Math.floor(Math.random() * (hi - lo + 1)) + lo;
      }
      return Math.random() * (hi - lo) + lo;
    }
    case "op_lt":
      return toNum(await evalInput(block.inputs.a, ctx)) <
        toNum(await evalInput(block.inputs.b, ctx));
    case "op_gt":
      return toNum(await evalInput(block.inputs.a, ctx)) >
        toNum(await evalInput(block.inputs.b, ctx));
    case "op_eq": {
      const a = await evalInput(block.inputs.a, ctx);
      const b = await evalInput(block.inputs.b, ctx);
      const na = Number(a);
      const nb = Number(b);
      if (Number.isFinite(na) && Number.isFinite(nb)) {
        return na === nb;
      }
      return toStr(a) === toStr(b);
    }
    case "op_and":
      return (
        toBool(await evalInput(block.inputs.a, ctx)) &&
        toBool(await evalInput(block.inputs.b, ctx))
      );
    case "op_or":
      return (
        toBool(await evalInput(block.inputs.a, ctx)) ||
        toBool(await evalInput(block.inputs.b, ctx))
      );
    case "op_not":
      return !toBool(await evalInput(block.inputs.a, ctx));
    case "op_join":
      return (
        toStr(await evalInput(block.inputs.a, ctx)) +
        toStr(await evalInput(block.inputs.b, ctx))
      );
    case "op_length":
      return toStr(await evalInput(block.inputs.a, ctx)).length;
    case "op_round":
      return Math.round(toNum(await evalInput(block.inputs.a, ctx)));
    case "op_abs":
      return Math.abs(toNum(await evalInput(block.inputs.a, ctx)));
    case "var_get":
      return r.getVariable(block.fields.name ?? "");
    default:
      return "";
  }
}

async function execBody(
  body: BlockInstance[] | undefined,
  ctx: ThreadCtx,
): Promise<void> {
  if (!body) return;
  for (const child of body) {
    if (ctx.signal.aborted) throw new DOMException("Aborted", "AbortError");
    await execBlock(child, ctx);
  }
}

async function execBlock(
  block: BlockInstance,
  ctx: ThreadCtx,
): Promise<void> {
  if (ctx.signal.aborted) throw new DOMException("Aborted", "AbortError");
  const r = ctx.runtime;

  switch (block.defId) {
    case "event_flag":
    case "event_keypress":
    case "event_clicked":
    case "event_when_receive":
      return;

    case "motion_move": {
      const steps = toNum(await evalInput(block.inputs.steps, ctx));
      const sprite = r.getSprite(ctx.spriteId);
      if (!sprite) return;
      const dir = sprite.direction;
      const rad = (dir * Math.PI) / 180;
      const dx = Math.sin(rad) * steps;
      const dy = Math.cos(rad) * steps;
      const target = clampStage(sprite.x + dx, sprite.y + dy);
      const fromX = sprite.x;
      const fromY = sprite.y;
      await animate(MOVE_DURATION_MS, ctx.signal, (u) => {
        r.updateSprite(ctx.spriteId, {
          x: fromX + (target.x - fromX) * u,
          y: fromY + (target.y - fromY) * u,
        });
      });
      r.updateSprite(ctx.spriteId, target);
      return;
    }

    case "motion_turn_right":
    case "motion_turn_left": {
      const deg = toNum(await evalInput(block.inputs.deg, ctx));
      const signed = block.defId === "motion_turn_right" ? deg : -deg;
      const sprite = r.getSprite(ctx.spriteId);
      if (!sprite) return;
      const from = sprite.direction;
      const to = from + signed;
      await animate(TURN_DURATION_MS, ctx.signal, (u) => {
        r.updateSprite(ctx.spriteId, { direction: from + (to - from) * u });
      });
      r.updateSprite(ctx.spriteId, { direction: to });
      return;
    }

    case "motion_goto_xy": {
      const x = toNum(await evalInput(block.inputs.x, ctx));
      const y = toNum(await evalInput(block.inputs.y, ctx));
      r.updateSprite(ctx.spriteId, clampStage(x, y));
      return;
    }

    case "motion_glide_xy": {
      const secs = Math.max(
        0,
        toNum(await evalInput(block.inputs.secs, ctx)),
      );
      const targetX = toNum(await evalInput(block.inputs.x, ctx));
      const targetY = toNum(await evalInput(block.inputs.y, ctx));
      const sprite = r.getSprite(ctx.spriteId);
      if (!sprite) return;
      const fromX = sprite.x;
      const fromY = sprite.y;
      const target = clampStage(targetX, targetY);
      await animate(secs * 1000, ctx.signal, (u) => {
        r.updateSprite(ctx.spriteId, {
          x: fromX + (target.x - fromX) * u,
          y: fromY + (target.y - fromY) * u,
        });
      });
      r.updateSprite(ctx.spriteId, target);
      return;
    }

    case "motion_setx": {
      const x = toNum(await evalInput(block.inputs.x, ctx));
      const sprite = r.getSprite(ctx.spriteId);
      if (!sprite) return;
      r.updateSprite(ctx.spriteId, clampStage(x, sprite.y));
      return;
    }
    case "motion_sety": {
      const y = toNum(await evalInput(block.inputs.y, ctx));
      const sprite = r.getSprite(ctx.spriteId);
      if (!sprite) return;
      r.updateSprite(ctx.spriteId, clampStage(sprite.x, y));
      return;
    }
    case "motion_changex": {
      const dx = toNum(await evalInput(block.inputs.dx, ctx));
      const sprite = r.getSprite(ctx.spriteId);
      if (!sprite) return;
      r.updateSprite(ctx.spriteId, clampStage(sprite.x + dx, sprite.y));
      return;
    }
    case "motion_changey": {
      const dy = toNum(await evalInput(block.inputs.dy, ctx));
      const sprite = r.getSprite(ctx.spriteId);
      if (!sprite) return;
      r.updateSprite(ctx.spriteId, clampStage(sprite.x, sprite.y + dy));
      return;
    }
    case "motion_point_dir": {
      const dir = toNum(await evalInput(block.inputs.dir, ctx));
      r.updateSprite(ctx.spriteId, { direction: dir });
      return;
    }
    case "motion_bounce": {
      const sprite = r.getSprite(ctx.spriteId);
      if (!sprite) return;
      let dir = sprite.direction;
      const margin = 20;
      let { x, y } = sprite;
      let bounced = false;
      if (x > STAGE_MAX_X - margin || x < -STAGE_MAX_X + margin) {
        dir = 180 - dir;
        bounced = true;
      }
      if (y > STAGE_MAX_Y - margin || y < -STAGE_MAX_Y + margin) {
        dir = -dir;
        bounced = true;
      }
      if (bounced) {
        const clamped = clampStage(x, y);
        x = clamped.x;
        y = clamped.y;
        r.updateSprite(ctx.spriteId, { direction: dir, x, y });
      }
      return;
    }

    case "looks_say": {
      const text = toStr(await evalInput(block.inputs.text, ctx));
      r.updateSprite(ctx.spriteId, { sayText: text, sayKind: "say" });
      return;
    }
    case "looks_think": {
      const text = toStr(await evalInput(block.inputs.text, ctx));
      r.updateSprite(ctx.spriteId, { sayText: text, sayKind: "think" });
      return;
    }
    case "looks_say_for":
    case "looks_think_for": {
      const text = toStr(await evalInput(block.inputs.text, ctx));
      const kind = block.defId === "looks_say_for" ? "say" : "think";
      const secs = Math.max(
        0,
        toNum(await evalInput(block.inputs.secs, ctx)),
      );
      r.updateSprite(ctx.spriteId, { sayText: text, sayKind: kind });
      try {
        await wait(secs > 0 ? secs * 1000 : SAY_DEFAULT_MS, ctx.signal);
      } finally {
        r.updateSprite(ctx.spriteId, { sayText: null });
      }
      return;
    }
    case "looks_show":
      r.updateSprite(ctx.spriteId, { visible: true });
      return;
    case "looks_hide":
      r.updateSprite(ctx.spriteId, { visible: false });
      return;
    case "looks_set_size": {
      const size = Math.max(
        5,
        toNum(await evalInput(block.inputs.size, ctx)),
      );
      r.updateSprite(ctx.spriteId, { size });
      return;
    }
    case "looks_change_size": {
      const dsize = toNum(await evalInput(block.inputs.dsize, ctx));
      const sprite = r.getSprite(ctx.spriteId);
      if (!sprite) return;
      r.updateSprite(ctx.spriteId, {
        size: Math.max(5, sprite.size + dsize),
      });
      return;
    }

    case "event_broadcast": {
      const name = block.fields.msg ?? "";
      if (name) {
        ctx.runtime.broadcast(name, runStack);
      }
      return;
    }

    case "control_wait": {
      const secs = Math.max(
        0,
        toNum(await evalInput(block.inputs.secs, ctx)),
      );
      await wait(secs * 1000, ctx.signal);
      return;
    }
    case "control_repeat": {
      const times = Math.floor(
        toNum(await evalInput(block.inputs.times, ctx)),
      );
      for (let i = 0; i < times; i++) {
        if (ctx.signal.aborted) throw new DOMException("Aborted", "AbortError");
        await execBody(block.body, ctx);
        await yieldFrame(ctx.signal);
      }
      return;
    }
    case "control_forever": {
      while (true) {
        if (ctx.signal.aborted) throw new DOMException("Aborted", "AbortError");
        await execBody(block.body, ctx);
        await yieldFrame(ctx.signal);
      }
    }
    case "control_if": {
      const cond = toBool(await evalInput(block.inputs.cond, ctx));
      if (cond) {
        await execBody(block.body, ctx);
      }
      return;
    }
    case "control_if_else": {
      const cond = toBool(await evalInput(block.inputs.cond, ctx));
      await execBody(cond ? block.body : block.body2, ctx);
      return;
    }
    case "control_repeat_until": {
      while (true) {
        if (ctx.signal.aborted) throw new DOMException("Aborted", "AbortError");
        const cond = toBool(await evalInput(block.inputs.cond, ctx));
        if (cond) return;
        await execBody(block.body, ctx);
        await yieldFrame(ctx.signal);
      }
    }
    case "control_wait_until": {
      while (true) {
        if (ctx.signal.aborted) throw new DOMException("Aborted", "AbortError");
        const cond = toBool(await evalInput(block.inputs.cond, ctx));
        if (cond) return;
        await yieldFrame(ctx.signal);
      }
    }
    case "control_stop": {
      const what = block.fields.what ?? "all";
      if (what === "all") {
        r.stopAll();
        throw new DOMException("Aborted", "AbortError");
      }
      throw new StopThisScript();
    }

    case "sensing_reset_timer":
      r.resetTimer();
      return;

    case "var_set": {
      const name = block.fields.name ?? "";
      if (!name) return;
      const val = toStr(await evalInput(block.inputs.value, ctx));
      r.setVariable(name, val);
      return;
    }
    case "var_change": {
      const name = block.fields.name ?? "";
      if (!name) return;
      const cur = toNum(r.getVariable(name));
      const dv = toNum(await evalInput(block.inputs.value, ctx));
      r.setVariable(name, String(cur + dv));
      return;
    }
    case "var_show": {
      const name = block.fields.name ?? "";
      if (name) r.setVariableVisible(name, true);
      return;
    }
    case "var_hide": {
      const name = block.fields.name ?? "";
      if (name) r.setVariableVisible(name, false);
      return;
    }

    default:
      return;
  }
}

export async function runStack(
  blocks: BlockInstance[],
  from: number,
  ctx: ThreadCtx,
): Promise<void> {
  for (let i = from; i < blocks.length; i++) {
    if (ctx.signal.aborted) throw new DOMException("Aborted", "AbortError");
    const b = blocks[i];
    if (!b) continue;
    await execBlock(b, ctx);
  }
}
