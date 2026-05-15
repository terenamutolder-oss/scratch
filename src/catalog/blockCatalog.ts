import type {
  BlockDef,
  BlockInstance,
  DropdownSource,
  InputValue,
  LabelPart,
  SlotType,
} from "../types/blocks";

const COLORS = {
  motion: "#4c97ff",
  looks: "#9966ff",
  events: "#ffbf00",
  control: "#ffab19",
  sensing: "#5cb1d6",
  operators: "#59c059",
  variables: "#ff8c1a",
} as const;

const t = (text: string): LabelPart => ({ kind: "text", text });
const num = (key: string, def = "10"): LabelPart => ({
  kind: "input",
  key,
  slotType: "number",
  default: def,
});
const str = (key: string, def = ""): LabelPart => ({
  kind: "input",
  key,
  slotType: "string",
  default: def,
});
const bool = (key: string): LabelPart => ({
  kind: "input",
  key,
  slotType: "boolean",
  default: "false",
});
const dd = (
  key: string,
  source: DropdownSource,
  defaultValue?: string,
): LabelPart => ({ kind: "dropdown", key, source, default: defaultValue });

const KEY_ITEMS = [
  { value: "space", label: "space" },
  { value: "ArrowUp", label: "up arrow" },
  { value: "ArrowDown", label: "down arrow" },
  { value: "ArrowLeft", label: "left arrow" },
  { value: "ArrowRight", label: "right arrow" },
  { value: "Enter", label: "enter" },
  ..."abcdefghijklmnopqrstuvwxyz0123456789".split("").map((k) => ({
    value: k,
    label: k,
  })),
];

export const BLOCK_CATALOG: BlockDef[] = [
  // Motion
  {
    id: "motion_move",
    category: "motion",
    shape: "stack",
    color: COLORS.motion,
    parts: [t("move"), num("steps", "10"), t("steps")],
  },
  {
    id: "motion_turn_right",
    category: "motion",
    shape: "stack",
    color: COLORS.motion,
    parts: [t("turn ↻"), num("deg", "15"), t("degrees")],
  },
  {
    id: "motion_turn_left",
    category: "motion",
    shape: "stack",
    color: COLORS.motion,
    parts: [t("turn ↺"), num("deg", "15"), t("degrees")],
  },
  {
    id: "motion_goto_xy",
    category: "motion",
    shape: "stack",
    color: COLORS.motion,
    parts: [t("go to x"), num("x", "0"), t("y"), num("y", "0")],
  },
  {
    id: "motion_glide_xy",
    category: "motion",
    shape: "stack",
    color: COLORS.motion,
    parts: [
      t("glide"),
      num("secs", "1"),
      t("secs to x"),
      num("x", "0"),
      t("y"),
      num("y", "0"),
    ],
  },
  {
    id: "motion_setx",
    category: "motion",
    shape: "stack",
    color: COLORS.motion,
    parts: [t("set x to"), num("x", "0")],
  },
  {
    id: "motion_sety",
    category: "motion",
    shape: "stack",
    color: COLORS.motion,
    parts: [t("set y to"), num("y", "0")],
  },
  {
    id: "motion_changex",
    category: "motion",
    shape: "stack",
    color: COLORS.motion,
    parts: [t("change x by"), num("dx", "10")],
  },
  {
    id: "motion_changey",
    category: "motion",
    shape: "stack",
    color: COLORS.motion,
    parts: [t("change y by"), num("dy", "10")],
  },
  {
    id: "motion_point_dir",
    category: "motion",
    shape: "stack",
    color: COLORS.motion,
    parts: [t("point in direction"), num("dir", "90")],
  },
  {
    id: "motion_bounce",
    category: "motion",
    shape: "stack",
    color: COLORS.motion,
    parts: [t("if on edge, bounce")],
  },
  {
    id: "motion_xpos",
    category: "motion",
    shape: "reporter",
    color: COLORS.motion,
    parts: [t("x position")],
  },
  {
    id: "motion_ypos",
    category: "motion",
    shape: "reporter",
    color: COLORS.motion,
    parts: [t("y position")],
  },
  {
    id: "motion_direction",
    category: "motion",
    shape: "reporter",
    color: COLORS.motion,
    parts: [t("direction")],
  },

  // Looks
  {
    id: "looks_say",
    category: "looks",
    shape: "stack",
    color: COLORS.looks,
    parts: [t("say"), str("text", "Hello!")],
  },
  {
    id: "looks_say_for",
    category: "looks",
    shape: "stack",
    color: COLORS.looks,
    parts: [
      t("say"),
      str("text", "Hello!"),
      t("for"),
      num("secs", "2"),
      t("seconds"),
    ],
  },
  {
    id: "looks_think",
    category: "looks",
    shape: "stack",
    color: COLORS.looks,
    parts: [t("think"), str("text", "Hmm...")],
  },
  {
    id: "looks_think_for",
    category: "looks",
    shape: "stack",
    color: COLORS.looks,
    parts: [
      t("think"),
      str("text", "Hmm..."),
      t("for"),
      num("secs", "2"),
      t("seconds"),
    ],
  },
  {
    id: "looks_show",
    category: "looks",
    shape: "stack",
    color: COLORS.looks,
    parts: [t("show")],
  },
  {
    id: "looks_hide",
    category: "looks",
    shape: "stack",
    color: COLORS.looks,
    parts: [t("hide")],
  },
  {
    id: "looks_set_size",
    category: "looks",
    shape: "stack",
    color: COLORS.looks,
    parts: [t("set size to"), num("size", "100"), t("%")],
  },
  {
    id: "looks_change_size",
    category: "looks",
    shape: "stack",
    color: COLORS.looks,
    parts: [t("change size by"), num("dsize", "10")],
  },
  {
    id: "looks_size",
    category: "looks",
    shape: "reporter",
    color: COLORS.looks,
    parts: [t("size")],
  },

  // Events
  {
    id: "event_flag",
    category: "events",
    shape: "hat",
    color: COLORS.events,
    parts: [t("when 🏁 clicked")],
  },
  {
    id: "event_keypress",
    category: "events",
    shape: "hat",
    color: COLORS.events,
    parts: [
      t("when"),
      dd("key", { kind: "keys" }, "space"),
      t("key pressed"),
    ],
  },
  {
    id: "event_clicked",
    category: "events",
    shape: "hat",
    color: COLORS.events,
    parts: [t("when this sprite clicked")],
  },
  {
    id: "event_broadcast",
    category: "events",
    shape: "stack",
    color: COLORS.events,
    parts: [t("broadcast"), dd("msg", { kind: "broadcasts" })],
  },
  {
    id: "event_when_receive",
    category: "events",
    shape: "hat",
    color: COLORS.events,
    parts: [t("when I receive"), dd("msg", { kind: "broadcasts" })],
  },

  // Control
  {
    id: "control_wait",
    category: "control",
    shape: "stack",
    color: COLORS.control,
    parts: [t("wait"), num("secs", "1"), t("seconds")],
  },
  {
    id: "control_repeat",
    category: "control",
    shape: "c",
    color: COLORS.control,
    arms: 1,
    parts: [t("repeat"), num("times", "10")],
  },
  {
    id: "control_forever",
    category: "control",
    shape: "c",
    color: COLORS.control,
    arms: 1,
    parts: [t("forever")],
  },
  {
    id: "control_if",
    category: "control",
    shape: "c",
    color: COLORS.control,
    arms: 1,
    parts: [t("if"), bool("cond"), t("then")],
  },
  {
    id: "control_if_else",
    category: "control",
    shape: "e",
    color: COLORS.control,
    arms: 2,
    parts: [t("if"), bool("cond"), t("then")],
  },
  {
    id: "control_repeat_until",
    category: "control",
    shape: "c",
    color: COLORS.control,
    arms: 1,
    parts: [t("repeat until"), bool("cond")],
  },
  {
    id: "control_wait_until",
    category: "control",
    shape: "stack",
    color: COLORS.control,
    parts: [t("wait until"), bool("cond")],
  },
  {
    id: "control_stop",
    category: "control",
    shape: "cap",
    color: COLORS.control,
    parts: [t("stop"), dd("what", { kind: "stopMode" }, "all")],
  },

  // Sensing
  {
    id: "sensing_mouse_x",
    category: "sensing",
    shape: "reporter",
    color: COLORS.sensing,
    parts: [t("mouse x")],
  },
  {
    id: "sensing_mouse_y",
    category: "sensing",
    shape: "reporter",
    color: COLORS.sensing,
    parts: [t("mouse y")],
  },
  {
    id: "sensing_mouse_down",
    category: "sensing",
    shape: "boolean",
    color: COLORS.sensing,
    parts: [t("mouse down?")],
  },
  {
    id: "sensing_key_pressed",
    category: "sensing",
    shape: "boolean",
    color: COLORS.sensing,
    parts: [
      t("key"),
      dd("key", { kind: "keys" }, "space"),
      t("pressed?"),
    ],
  },
  {
    id: "sensing_timer",
    category: "sensing",
    shape: "reporter",
    color: COLORS.sensing,
    parts: [t("timer")],
  },
  {
    id: "sensing_reset_timer",
    category: "sensing",
    shape: "stack",
    color: COLORS.sensing,
    parts: [t("reset timer")],
  },

  // Operators
  {
    id: "op_add",
    category: "operators",
    shape: "reporter",
    color: COLORS.operators,
    parts: [num("a", "0"), t("+"), num("b", "0")],
  },
  {
    id: "op_sub",
    category: "operators",
    shape: "reporter",
    color: COLORS.operators,
    parts: [num("a", "0"), t("−"), num("b", "0")],
  },
  {
    id: "op_mul",
    category: "operators",
    shape: "reporter",
    color: COLORS.operators,
    parts: [num("a", "0"), t("×"), num("b", "0")],
  },
  {
    id: "op_div",
    category: "operators",
    shape: "reporter",
    color: COLORS.operators,
    parts: [num("a", "0"), t("÷"), num("b", "1")],
  },
  {
    id: "op_mod",
    category: "operators",
    shape: "reporter",
    color: COLORS.operators,
    parts: [num("a", "0"), t("mod"), num("b", "1")],
  },
  {
    id: "op_random",
    category: "operators",
    shape: "reporter",
    color: COLORS.operators,
    parts: [t("pick random"), num("a", "1"), t("to"), num("b", "10")],
  },
  {
    id: "op_lt",
    category: "operators",
    shape: "boolean",
    color: COLORS.operators,
    parts: [num("a", "0"), t("<"), num("b", "50")],
  },
  {
    id: "op_eq",
    category: "operators",
    shape: "boolean",
    color: COLORS.operators,
    parts: [str("a", ""), t("="), str("b", "")],
  },
  {
    id: "op_gt",
    category: "operators",
    shape: "boolean",
    color: COLORS.operators,
    parts: [num("a", "50"), t(">"), num("b", "0")],
  },
  {
    id: "op_and",
    category: "operators",
    shape: "boolean",
    color: COLORS.operators,
    parts: [bool("a"), t("and"), bool("b")],
  },
  {
    id: "op_or",
    category: "operators",
    shape: "boolean",
    color: COLORS.operators,
    parts: [bool("a"), t("or"), bool("b")],
  },
  {
    id: "op_not",
    category: "operators",
    shape: "boolean",
    color: COLORS.operators,
    parts: [t("not"), bool("a")],
  },
  {
    id: "op_join",
    category: "operators",
    shape: "reporter",
    color: COLORS.operators,
    parts: [t("join"), str("a", "hello "), str("b", "world")],
  },
  {
    id: "op_length",
    category: "operators",
    shape: "reporter",
    color: COLORS.operators,
    parts: [t("length of"), str("a", "hello")],
  },
  {
    id: "op_round",
    category: "operators",
    shape: "reporter",
    color: COLORS.operators,
    parts: [t("round"), num("a", "0")],
  },
  {
    id: "op_abs",
    category: "operators",
    shape: "reporter",
    color: COLORS.operators,
    parts: [t("abs"), num("a", "0")],
  },

  // Variables
  {
    id: "var_get",
    category: "variables",
    shape: "reporter",
    color: COLORS.variables,
    parts: [dd("name", { kind: "variables" })],
  },
  {
    id: "var_set",
    category: "variables",
    shape: "stack",
    color: COLORS.variables,
    parts: [
      t("set"),
      dd("name", { kind: "variables" }),
      t("to"),
      str("value", "0"),
    ],
  },
  {
    id: "var_change",
    category: "variables",
    shape: "stack",
    color: COLORS.variables,
    parts: [
      t("change"),
      dd("name", { kind: "variables" }),
      t("by"),
      num("value", "1"),
    ],
  },
  {
    id: "var_show",
    category: "variables",
    shape: "stack",
    color: COLORS.variables,
    parts: [t("show variable"), dd("name", { kind: "variables" })],
  },
  {
    id: "var_hide",
    category: "variables",
    shape: "stack",
    color: COLORS.variables,
    parts: [t("hide variable"), dd("name", { kind: "variables" })],
  },
];

const byId = new Map(BLOCK_CATALOG.map((b) => [b.id, b]));

export function getBlockDef(id: string): BlockDef | undefined {
  return byId.get(id);
}

export function getInputDefault(def: BlockDef, key: string): string {
  for (const p of def.parts) {
    if (p.kind === "input" && p.key === key) {
      return p.default;
    }
  }
  return "";
}

export function getInputSlotType(def: BlockDef, key: string): SlotType {
  for (const p of def.parts) {
    if (p.kind === "input" && p.key === key) {
      return p.slotType;
    }
  }
  return "string";
}

export function defaultInputs(def: BlockDef): Record<string, InputValue> {
  const out: Record<string, InputValue> = {};
  for (const p of def.parts) {
    if (p.kind === "input") {
      out[p.key] = { kind: "literal", value: p.default };
    }
  }
  return out;
}

export function defaultFields(def: BlockDef): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of def.parts) {
    if (p.kind === "dropdown") {
      out[p.key] = p.default ?? "";
    }
  }
  return out;
}

export function randomId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `id-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

export function makeBlockInstance(defId: string): BlockInstance | null {
  const def = getBlockDef(defId);
  if (!def) {
    return null;
  }
  const instance: BlockInstance = {
    id: randomId(),
    defId,
    inputs: defaultInputs(def),
    fields: defaultFields(def),
  };
  if (def.shape === "c") {
    instance.body = [];
  } else if (def.shape === "e") {
    instance.body = [];
    instance.body2 = [];
  }
  return instance;
}

export const CATEGORIES: ReadonlyArray<{
  id: import("../types/blocks").BlockCategory;
  label: string;
  color: string;
}> = [
  { id: "motion", label: "Motion", color: COLORS.motion },
  { id: "looks", label: "Looks", color: COLORS.looks },
  { id: "events", label: "Events", color: COLORS.events },
  { id: "control", label: "Control", color: COLORS.control },
  { id: "sensing", label: "Sensing", color: COLORS.sensing },
  { id: "operators", label: "Operators", color: COLORS.operators },
  { id: "variables", label: "Variables", color: COLORS.variables },
];

export { COLORS, KEY_ITEMS };
