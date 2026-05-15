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
  const { selectedSprite, isOwner, project, addBlock, moveBlock, deleteStack } =
    useProject();

  const handleEmptyDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isOwner) return;
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
      className={`scripts-shell ${isOwner ? "" : "is-readonly"}`}
      onDragOver={(e) => {
        if (!isOwner) return;
        e.preventDefault();
      }}
      onDrop={handleEmptyDrop}
    >
      {selectedSprite.stacks.length === 0 ? (
        <div className="scripts-empty">
          {isOwner ? (
            <>
              <p>
                <strong>Drop blocks here</strong> to start a script for{" "}
                <strong>{selectedSprite.name}</strong>.
              </p>
              <p className="scripts-empty-hint">
                Or double-click a block in the palette.
              </p>
            </>
          ) : (
            <>
              <p>
                <strong>{selectedSprite.name}</strong> has no scripts yet.
              </p>
              <p className="scripts-empty-hint">
                This project was created by{" "}
                <strong>{project.ownerDisplayName ?? "another user"}</strong>.
                Only the creator can edit it — but you can run it from the
                toolbar.
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="scripts-canvas">
          {selectedSprite.stacks.map((stack) => (
            <StackView
              key={stack.id}
              stack={stack}
              canEdit={isOwner}
              onDeleteStack={() => deleteStack(stack.id)}
            />
          ))}
          {isOwner ? (
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
          ) : null}
        </div>
      )}
    </div>
  );
}

function StackView({
  stack,
  canEdit,
  onDeleteStack,
}: {
  stack: Stack;
  canEdit: boolean;
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
    if (!canEdit) return;
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
      {canEdit ? (
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
      ) : null}
      {canEdit ? <DropStripe onDrop={onDropAt(0)} /> : null}
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
            {canEdit ? <DropStripe onDrop={onDropAt(idx + 1)} /> : null}
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
