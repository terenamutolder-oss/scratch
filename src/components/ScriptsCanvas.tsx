import { Fragment } from "react";
import { getBlockDef } from "../catalog/blockCatalog";
import type { Stack } from "../types/blocks";
import {
  type BlockPath,
  type InsertTarget,
  useProject,
} from "../state/ProjectContext";
import { readDragPayload } from "./dndPayload";
import BlockView from "./BlockView";

export default function ScriptsCanvas() {
  const { selectedSprite, addBlock, moveBlock, deleteStack } = useProject();

  const handleEmptyDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const payload = readDragPayload(e.dataTransfer);
    if (!payload) return;
    if (payload.source === "palette") {
      const def = getBlockDef(payload.defId);
      if (!def) return;
      if (def.shape === "reporter" || def.shape === "boolean") return;
      addBlock(payload.defId, { kind: "newStack" });
    } else {
      moveBlock(
        {
          spriteId: payload.spriteId,
          stackId: payload.stackId,
          path: payload.path,
        },
        { kind: "newStack" },
      );
    }
  };

  return (
    <div
      className="scripts-shell"
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleEmptyDrop}
    >
      {selectedSprite.stacks.length === 0 ? (
        <div className="scripts-empty">
          <p>
            <strong>Drop blocks here</strong> to start a script for{" "}
            <strong>{selectedSprite.name}</strong>.
          </p>
          <p className="scripts-empty-hint">
            Or double-click a block in the palette.
          </p>
        </div>
      ) : (
        <div className="scripts-canvas">
          {selectedSprite.stacks.map((stack) => (
            <StackView
              key={stack.id}
              stack={stack}
              onDeleteStack={() => deleteStack(stack.id)}
            />
          ))}
          <div
            className="scripts-canvas-newstack"
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onDrop={handleEmptyDrop}
          >
            <span>Drop a hat or stack block here to start another script</span>
          </div>
        </div>
      )}
    </div>
  );
}

function StackView({
  stack,
  onDeleteStack,
}: {
  stack: Stack;
  onDeleteStack: () => void;
}) {
  const { selectedSprite, addBlock, moveBlock } = useProject();

  const target = (index: number): InsertTarget => ({
    kind: "stackAt",
    stackId: stack.id,
    index,
  });

  const onDropAt = (index: number) => (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const payload = readDragPayload(e.dataTransfer);
    if (!payload) return;
    if (payload.source === "palette") {
      const def = getBlockDef(payload.defId);
      if (!def) return;
      if (def.shape === "reporter" || def.shape === "boolean") return;
      addBlock(payload.defId, target(index));
    } else {
      moveBlock(
        {
          spriteId: payload.spriteId,
          stackId: payload.stackId,
          path: payload.path,
        },
        target(index),
      );
    }
  };

  return (
    <div className="stack">
      <div className="stack-toolbar">
        <button
          type="button"
          className="btn btn-mini btn-ghost"
          title="Delete this entire script"
          onClick={onDeleteStack}
        >
          delete script
        </button>
      </div>
      <DropStripe onDrop={onDropAt(0)} />
      {stack.blocks.map((block, idx) => {
        const def = getBlockDef(block.defId);
        if (!def) return null;
        const path: BlockPath = [idx];
        return (
          <Fragment key={block.id}>
            <BlockView
              block={block}
              def={def}
              mode="script"
              spriteId={selectedSprite.id}
              stackId={stack.id}
              path={path}
            />
            <DropStripe onDrop={onDropAt(idx + 1)} />
          </Fragment>
        );
      })}
    </div>
  );
}

function DropStripe({ onDrop }: { onDrop: (e: React.DragEvent) => void }) {
  return (
    <div
      className="drop-stripe"
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onDrop={onDrop}
    />
  );
}
