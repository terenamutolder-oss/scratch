import type { BlockInstance, Project, Sprite, Stack } from "../types/blocks";

export type ProjectUpdater = (updater: (p: Project) => Project) => void;
export type ProjectGetter = () => Project;

export type ThreadCtx = {
  spriteId: string;
  stackId: string;
  threadId: string;
  signal: AbortSignal;
  runtime: Runtime;
};

const STOP_THIS_SCRIPT = Symbol("stop-this-script");
export const STOP_THIS_SCRIPT_TOKEN = STOP_THIS_SCRIPT;

export class StopThisScript extends Error {
  constructor() {
    super("stop this script");
    this.name = "StopThisScript";
  }
}

export class Runtime {
  setProject: ProjectUpdater;
  getProject: ProjectGetter;
  threads = new Map<
    string,
    { spriteId: string; stackId: string; abort: AbortController }
  >();
  pressedKeys = new Set<string>();
  mouseX = 0;
  mouseY = 0;
  mouseDown = false;
  timerStart = performance.now();
  /** Bumped whenever a thread starts/stops so the UI can re-render running indicators. */
  threadVersion = 0;
  onThreadsChanged: (() => void) | null = null;

  constructor(getProject: ProjectGetter, setProject: ProjectUpdater) {
    this.getProject = getProject;
    this.setProject = setProject;
  }

  get isRunning(): boolean {
    return this.threads.size > 0;
  }

  notifyThreads() {
    this.threadVersion += 1;
    this.onThreadsChanged?.();
  }

  getSprite(id: string): Sprite | undefined {
    return this.getProject().sprites.find((s) => s.id === id);
  }

  updateSprite(id: string, patch: Partial<Sprite>) {
    this.setProject((p) => ({
      ...p,
      sprites: p.sprites.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    }));
  }

  setVariable(name: string, value: string) {
    this.setProject((p) => ({
      ...p,
      variables: p.variables.map((v) =>
        v.name === name ? { ...v, value } : v,
      ),
    }));
  }

  setVariableVisible(name: string, visible: boolean) {
    this.setProject((p) => ({
      ...p,
      variables: p.variables.map((v) =>
        v.name === name ? { ...v, visible } : v,
      ),
    }));
  }

  getVariable(name: string): string {
    return this.getProject().variables.find((v) => v.name === name)?.value ?? "";
  }

  resetTimer() {
    this.timerStart = performance.now();
  }

  getTimer(): number {
    return (performance.now() - this.timerStart) / 1000;
  }

  isKeyPressed(key: string): boolean {
    return this.pressedKeys.has(key);
  }

  setKeyPressed(key: string, pressed: boolean) {
    if (pressed) {
      this.pressedKeys.add(key);
    } else {
      this.pressedKeys.delete(key);
    }
  }

  spawnThread(
    spriteId: string,
    stack: Stack,
    startIndex: number,
    exec: (
      blocks: BlockInstance[],
      from: number,
      ctx: ThreadCtx,
    ) => Promise<void>,
  ): string {
    const ac = new AbortController();
    const threadId = `${spriteId}:${stack.id}:${Math.random()
      .toString(36)
      .slice(2)}`;
    this.threads.set(threadId, {
      spriteId,
      stackId: stack.id,
      abort: ac,
    });
    this.notifyThreads();
    const ctx: ThreadCtx = {
      spriteId,
      stackId: stack.id,
      threadId,
      signal: ac.signal,
      runtime: this,
    };
    exec(stack.blocks, startIndex, ctx)
      .catch((e) => {
        if (e instanceof StopThisScript) {
          return;
        }
        if (e instanceof DOMException && e.name === "AbortError") {
          return;
        }
        console.error("[scratch-web] thread error", e);
      })
      .finally(() => {
        this.threads.delete(threadId);
        this.notifyThreads();
      });
    return threadId;
  }

  abortThread(threadId: string) {
    const t = this.threads.get(threadId);
    if (!t) {
      return;
    }
    t.abort.abort();
    this.threads.delete(threadId);
    this.notifyThreads();
  }

  stopAll() {
    for (const t of this.threads.values()) {
      t.abort.abort();
    }
    this.threads.clear();
    this.notifyThreads();
  }

  broadcast(
    name: string,
    exec: (
      blocks: BlockInstance[],
      from: number,
      ctx: ThreadCtx,
    ) => Promise<void>,
  ) {
    const project = this.getProject();
    for (const sprite of project.sprites) {
      for (const stack of sprite.stacks) {
        const hat = stack.blocks[0];
        if (!hat) continue;
        if (
          hat.defId === "event_when_receive" &&
          hat.fields.msg === name
        ) {
          this.spawnThread(sprite.id, stack, 1, exec);
        }
      }
    }
  }
}

export async function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const t = window.setTimeout(() => resolve(), ms);
    const onAbort = () => {
      window.clearTimeout(t);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

export function yieldFrame(signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const id = requestAnimationFrame(() => resolve());
    signal.addEventListener(
      "abort",
      () => {
        cancelAnimationFrame(id);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

export function animate(
  durationMs: number,
  signal: AbortSignal,
  onFrame: (u: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const t0 = performance.now();
    const onAbort = () => {
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    const step = (now: number) => {
      if (signal.aborted) {
        return;
      }
      const u = durationMs <= 0 ? 1 : Math.min(1, (now - t0) / durationMs);
      onFrame(u);
      if (u < 1) {
        requestAnimationFrame(step);
      } else {
        signal.removeEventListener("abort", onAbort);
        resolve();
      }
    };
    requestAnimationFrame(step);
  });
}
