export type BlockCategory =
  | "motion"
  | "looks"
  | "events"
  | "control"
  | "sensing"
  | "operators"
  | "variables";

export type BlockShape =
  | "hat"
  | "stack"
  | "c"
  | "e"
  | "cap"
  | "reporter"
  | "boolean";

export type SlotType = "number" | "string" | "boolean";

export type DropdownSource =
  | { kind: "static"; items: ReadonlyArray<{ value: string; label: string }> }
  | { kind: "variables" }
  | { kind: "broadcasts" }
  | { kind: "keys" }
  | { kind: "stopMode" };

export type LabelPart =
  | { kind: "text"; text: string }
  | { kind: "input"; key: string; slotType: SlotType; default: string }
  | { kind: "dropdown"; key: string; source: DropdownSource; default?: string };

export type BlockDef = {
  id: string;
  category: BlockCategory;
  shape: BlockShape;
  color: string;
  parts: LabelPart[];
  /** Number of inner script bodies for C/E shapes. */
  arms?: 1 | 2;
};

export type InputValue =
  | { kind: "literal"; value: string }
  | { kind: "block"; block: BlockInstance };

export type BlockInstance = {
  id: string;
  defId: string;
  inputs: Record<string, InputValue>;
  fields: Record<string, string>;
  body?: BlockInstance[];
  body2?: BlockInstance[];
};

export type Stack = {
  id: string;
  blocks: BlockInstance[];
};

export type Sprite = {
  id: string;
  name: string;
  costume: string;
  x: number;
  y: number;
  direction: number;
  size: number;
  visible: boolean;
  sayText: string | null;
  sayKind: "say" | "think";
  stacks: Stack[];
};

export type Variable = {
  id: string;
  name: string;
  value: string;
  visible: boolean;
};

export type Broadcast = {
  id: string;
  name: string;
};

export type Project = {
  sprites: Sprite[];
  selectedSpriteId: string;
  variables: Variable[];
  broadcasts: Broadcast[];
};
