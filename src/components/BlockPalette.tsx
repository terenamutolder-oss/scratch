import { useMemo, useState } from "react";
import {
  BLOCK_CATALOG,
  CATEGORIES,
  getBlockDef,
  makeBlockInstance,
} from "../catalog/blockCatalog";
import type { BlockCategory, BlockDef, BlockInstance } from "../types/blocks";
import { useProject } from "../state/ProjectContext";
import { writeDragData } from "./dndPayload";
import BlockView from "./BlockView";

export default function BlockPalette() {
  const [active, setActive] = useState<BlockCategory>("motion");
  const project = useProject();

  const variableBlocks = useMemo(() => {
    // The catalog already contains var_get/var_set/etc.; nothing dynamic to do
    // beyond filtering by category, since dropdowns enumerate variables.
    return BLOCK_CATALOG.filter((b) => b.category === "variables");
  }, []);

  const blocksFor = (cat: BlockCategory): BlockDef[] => {
    if (cat === "variables") return variableBlocks;
    return BLOCK_CATALOG.filter((b) => b.category === cat);
  };

  const addToScript = (defId: string) => {
    const def = getBlockDef(defId);
    if (!def) return;
    if (def.shape === "reporter" || def.shape === "boolean") return;
    const sprite = project.selectedSprite;
    const lastStack = sprite.stacks[sprite.stacks.length - 1];
    if (lastStack) {
      project.addBlock(defId, { kind: "stackEnd", stackId: lastStack.id });
    } else {
      project.addBlock(defId, { kind: "newStack" });
    }
  };

  const blocks = blocksFor(active);

  return (
    <div className="palette">
      <div className="palette-tabs">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            type="button"
            className={`palette-tab ${active === cat.id ? "is-active" : ""}`}
            style={{ ["--cat-color" as never]: cat.color }}
            onClick={() => setActive(cat.id)}
          >
            <span className="palette-tab-dot" style={{ background: cat.color }} />
            {cat.label}
          </button>
        ))}
      </div>

      {active === "variables" ? (
        <div className="palette-section">
          <VariablesEditor />
        </div>
      ) : null}
      {active === "events" ? (
        <div className="palette-section">
          <BroadcastsEditor />
        </div>
      ) : null}

      <div className="palette-blocks">
        {blocks.map((def) => {
          const instance = makeBlockInstance(def.id);
          if (!instance) return null;
          return (
            <PaletteEntry
              key={def.id}
              def={def}
              instance={instance}
              onAdd={() => addToScript(def.id)}
            />
          );
        })}
      </div>
    </div>
  );
}

function PaletteEntry({
  def,
  instance,
  onAdd,
}: {
  def: BlockDef;
  instance: BlockInstance;
  onAdd: () => void;
}) {
  return (
    <div
      className="palette-block"
      draggable
      onDragStart={(e) => {
        writeDragData(e.dataTransfer, { source: "palette", defId: def.id });
        e.dataTransfer.effectAllowed = "copy";
      }}
      onDoubleClick={(e) => {
        e.preventDefault();
        onAdd();
      }}
      title="Drag into Scripts, or double-click to add"
    >
      <BlockView block={instance} def={def} mode="palette" />
    </div>
  );
}

function VariablesEditor() {
  const { project, addVariable, deleteVariable } = useProject();
  const [name, setName] = useState("");
  return (
    <div className="mini-editor">
      <form
        className="mini-editor-row"
        onSubmit={(e) => {
          e.preventDefault();
          addVariable(name);
          setName("");
        }}
      >
        <input
          className="mini-editor-input"
          placeholder="New variable name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button className="btn btn-mini" type="submit">
          Make
        </button>
      </form>
      <ul className="mini-editor-list">
        {project.variables.map((v) => (
          <li key={v.id}>
            <span>{v.name}</span>
            <button
              className="btn btn-mini btn-ghost"
              type="button"
              onClick={() => deleteVariable(v.id)}
              title="Delete variable"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function BroadcastsEditor() {
  const { project, addBroadcast, deleteBroadcast } = useProject();
  const [name, setName] = useState("");
  return (
    <div className="mini-editor">
      <form
        className="mini-editor-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (addBroadcast(name)) setName("");
        }}
      >
        <input
          className="mini-editor-input"
          placeholder="New broadcast name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button className="btn btn-mini" type="submit">
          Add
        </button>
      </form>
      <ul className="mini-editor-list">
        {project.broadcasts.map((b) => (
          <li key={b.id}>
            <span>{b.name}</span>
            <button
              className="btn btn-mini btn-ghost"
              type="button"
              onClick={() => deleteBroadcast(b.id)}
              title="Delete broadcast"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
