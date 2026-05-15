import { Fragment, type CSSProperties } from "react";
import { getBlockDef } from "../catalog/blockCatalog";
import type {
  BlockDef,
  BlockInstance,
  DropdownSource,
  InputValue,
  LabelPart,
  SlotType,
} from "../types/blocks";
import {
  type BlockPath,
  type InsertTarget,
  useProject,
} from "../state/ProjectContext";
import { readDragPayload, writeDragData } from "./dndPayload";
import { KEY_ITEMS } from "../catalog/blockCatalog";

type Mode = "palette" | "script";

type Props = {
  block: BlockInstance;
  def: BlockDef;
  mode: Mode;
  /** Required for script mode. Identifies the block's container. */
  spriteId?: string;
  stackId?: string;
  path?: BlockPath;
};

const shapeClass = (def: BlockDef) => `block block--${def.shape} cat-${def.category}`;

function styleFor(def: BlockDef): CSSProperties {
  return {
    background: def.color,
  };
}

function compatibleSlot(slot: SlotType, fromDef: BlockDef): boolean {
  if (fromDef.shape === "boolean") return slot === "boolean";
  if (fromDef.shape === "reporter") return slot !== "boolean";
  return false;
}

export default function BlockView(props: Props) {
  const { def, mode } = props;
  return (
    <div className={shapeClass(def)} style={styleFor(def)} data-shape={def.shape}>
      <Header {...props} />
      {(def.shape === "c" || def.shape === "e") && mode === "script" ? (
        <BodySection {...props} branch="body" />
      ) : null}
      {def.shape === "e" && mode === "script" ? (
        <>
          <div className="block-c-mid" />
          <BodySection {...props} branch="body2" />
        </>
      ) : null}
      {(def.shape === "c" || def.shape === "e") ? (
        <div className="block-c-foot" />
      ) : null}
    </div>
  );
}

function Header(props: Props) {
  const { block, def, mode } = props;
  return (
    <div className="block-header">
      {def.parts.map((part, idx) => (
        <Fragment key={idx}>
          <Part part={part} block={block} mode={mode} parent={props} />
        </Fragment>
      ))}
      {mode === "script" ? <ScriptControls {...props} /> : null}
    </div>
  );
}

function Part({
  part,
  block,
  mode,
  parent,
}: {
  part: LabelPart;
  block: BlockInstance;
  mode: Mode;
  parent: Props;
}) {
  if (part.kind === "text") {
    return <span className="block-text">{part.text}</span>;
  }
  if (part.kind === "dropdown") {
    return (
      <FieldControl
        block={block}
        mode={mode}
        parent={parent}
        keyName={part.key}
        source={part.source}
        defaultValue={part.default ?? ""}
      />
    );
  }
  return (
    <InputSlot
      block={block}
      mode={mode}
      parent={parent}
      keyName={part.key}
      slotType={part.slotType}
      defaultValue={part.default}
    />
  );
}

function FieldControl({
  block,
  mode,
  parent,
  keyName,
  source,
  defaultValue,
}: {
  block: BlockInstance;
  mode: Mode;
  parent: Props;
  keyName: string;
  source: DropdownSource;
  defaultValue: string;
}) {
  const project = useProject();
  const items = useDropdownItems(source);
  const current = block.fields[keyName] ?? defaultValue;
  const readOnly = !project.isOwner;

  if (mode === "palette" || readOnly) {
    const label =
      items.find((i) => i.value === current)?.label ?? (current || items[0]?.label || "—");
    return <span className="block-field-static">{label}</span>;
  }

  return (
    <select
      className="block-field-select"
      value={current}
      draggable={false}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onChange={(e) =>
        project.updateField(
          {
            spriteId: parent.spriteId ?? "",
            stackId: parent.stackId ?? "",
            path: parent.path ?? [],
            fieldKey: keyName,
          },
          e.target.value,
        )
      }
    >
      {items.length === 0 ? <option value="">(none)</option> : null}
      {items.map((it) => (
        <option key={it.value} value={it.value}>
          {it.label}
        </option>
      ))}
    </select>
  );
}

function useDropdownItems(
  source: DropdownSource,
): Array<{ value: string; label: string }> {
  const { project } = useProject();
  if (source.kind === "static") return [...source.items];
  if (source.kind === "variables")
    return project.variables.map((v) => ({ value: v.name, label: v.name }));
  if (source.kind === "broadcasts")
    return project.broadcasts.map((b) => ({ value: b.name, label: b.name }));
  if (source.kind === "keys") return [...KEY_ITEMS];
  if (source.kind === "stopMode")
    return [
      { value: "all", label: "all" },
      { value: "this script", label: "this script" },
    ];
  return [];
}

function InputSlot({
  block,
  mode,
  parent,
  keyName,
  slotType,
  defaultValue,
}: {
  block: BlockInstance;
  mode: Mode;
  parent: Props;
  keyName: string;
  slotType: SlotType;
  defaultValue: string;
}) {
  const project = useProject();
  const readOnly = !project.isOwner;
  const value: InputValue =
    block.inputs[keyName] ?? { kind: "literal", value: defaultValue };

  const handleDropOnSlot = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (mode !== "script" || readOnly) return;
    const payload = readDragPayload(e.dataTransfer);
    if (!payload || payload.source !== "palette") return;
    const fromDef = getBlockDef(payload.defId);
    if (!fromDef) return;
    if (!compatibleSlot(slotType, fromDef)) return;
    project.insertReporter(
      {
        spriteId: parent.spriteId ?? "",
        stackId: parent.stackId ?? "",
        path: parent.path ?? [],
        inputKey: keyName,
      },
      payload.defId,
    );
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (mode !== "script" || readOnly) return;
    const payload = readDragPayload(e.dataTransfer);
    if (!payload || payload.source !== "palette") return;
    const fromDef = getBlockDef(payload.defId);
    if (!fromDef || !compatibleSlot(slotType, fromDef)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
  };

  if (value.kind === "block") {
    const nestedDef = getBlockDef(value.block.defId);
    return (
      <span
        className={`slot slot--${slotType} slot--filled`}
        onDragOver={handleDragOver}
        onDrop={handleDropOnSlot}
      >
        {nestedDef ? (
          <BlockView
            block={value.block}
            def={nestedDef}
            mode={mode}
            spriteId={parent.spriteId}
            stackId={parent.stackId}
            path={parent.path}
          />
        ) : (
          <span className="slot-empty">?</span>
        )}
        {mode === "script" && !readOnly ? (
          <button
            type="button"
            className="slot-clear"
            title="Remove inner block"
            draggable={false}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              project.clearReporter({
                spriteId: parent.spriteId ?? "",
                stackId: parent.stackId ?? "",
                path: parent.path ?? [],
                inputKey: keyName,
              });
            }}
          >
            ×
          </button>
        ) : null}
      </span>
    );
  }

  if (slotType === "boolean") {
    return (
      <span
        className="slot slot--boolean slot--empty"
        onDragOver={handleDragOver}
        onDrop={handleDropOnSlot}
      />
    );
  }

  if (mode === "palette" || readOnly) {
    return (
      <span className={`slot slot--${slotType} slot--literal`}>
        <span className="slot-value">{value.value || defaultValue}</span>
      </span>
    );
  }

  return (
    <span
      className={`slot slot--${slotType} slot--literal`}
      onDragOver={handleDragOver}
      onDrop={handleDropOnSlot}
    >
      <input
        className="slot-input"
        type={slotType === "number" ? "number" : "text"}
        value={value.value}
        draggable={false}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onChange={(e) =>
          project.updateInputLiteral(
            {
              spriteId: parent.spriteId ?? "",
              stackId: parent.stackId ?? "",
              path: parent.path ?? [],
              inputKey: keyName,
            },
            e.target.value,
          )
        }
      />
    </span>
  );
}

function ScriptControls(props: Props) {
  const { spriteId, stackId, path, def } = props;
  const project = useProject();
  if (!spriteId || !stackId || !path) return null;
  if (!project.isOwner) return null;

  const allowDragHandle = def.shape !== "reporter" && def.shape !== "boolean";

  return (
    <span className="block-controls">
      {allowDragHandle ? (
        <span
          className="block-drag-handle"
          title="Drag to move"
          draggable
          onDragStart={(e) => {
            writeDragData(e.dataTransfer, {
              source: "script",
              spriteId,
              stackId,
              path,
            });
            e.dataTransfer.effectAllowed = "move";
            e.stopPropagation();
          }}
        >
          ⠿
        </span>
      ) : null}
      <button
        type="button"
        className="block-remove"
        draggable={false}
        title="Remove"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          project.removeBlock({ spriteId, stackId, path });
        }}
      >
        ×
      </button>
    </span>
  );
}

function BodySection({
  block,
  spriteId,
  stackId,
  path,
  branch,
}: Props & { branch: "body" | "body2" }) {
  const project = useProject();
  const body = (branch === "body" ? block.body : block.body2) ?? [];
  const canEdit = project.isOwner;

  if (!spriteId || !stackId || !path) return null;

  const target = (index: number): InsertTarget => ({
    kind: "body",
    stackId,
    parentPath: path,
    branch,
    index,
  });

  const onDropAt = (index: number) => (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!canEdit) return;
    const payload = readDragPayload(e.dataTransfer);
    if (!payload) return;
    if (payload.source === "palette") {
      const def = getBlockDef(payload.defId);
      if (!def) return;
      if (def.shape === "reporter" || def.shape === "boolean") return;
      project.addBlock(payload.defId, target(index));
    } else {
      project.moveBlock(
        { spriteId: payload.spriteId, stackId: payload.stackId, path: payload.path },
        target(index),
      );
    }
  };

  return (
    <div className="block-body">
      {canEdit ? <BodyDropStripe onDrop={onDropAt(0)} /> : null}
      {body.map((child, idx) => {
        const def = getBlockDef(child.defId);
        if (!def) return null;
        const childPath = [...path, branch, idx] as BlockPath;
        return (
          <Fragment key={child.id}>
            <BlockView
              block={child}
              def={def}
              mode="script"
              spriteId={spriteId}
              stackId={stackId}
              path={childPath}
            />
            {canEdit ? <BodyDropStripe onDrop={onDropAt(idx + 1)} /> : null}
          </Fragment>
        );
      })}
    </div>
  );
}

function BodyDropStripe({
  onDrop,
}: {
  onDrop: (e: React.DragEvent) => void;
}) {
  return (
    <div
      className="drop-stripe drop-stripe--body"
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onDrop={onDrop}
    />
  );
}
