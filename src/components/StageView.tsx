import { useEffect, useRef } from "react";
import { useProject } from "../state/ProjectContext";
import {
  STAGE_H,
  STAGE_W,
  toScreen,
} from "../engine/sprite";
import type { Sprite } from "../types/blocks";

export default function StageView() {
  const { project, running, spriteClicked, setMouse, setMouseDown } = useProject();
  const stageRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onMove = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      const sx = ((e.clientX - rect.left) / rect.width) * STAGE_W;
      const sy = ((e.clientY - rect.top) / rect.height) * STAGE_H;
      // Convert to Scratch coords
      const x = sx - STAGE_W / 2;
      const y = STAGE_H / 2 - sy;
      setMouse(x, y);
    };
    const onDown = () => setMouseDown(true);
    const onUp = () => setMouseDown(false);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
    };
  }, [setMouse, setMouseDown]);

  return (
    <div className="stage-frame">
      <div
        ref={stageRef}
        className={`stage ${running ? "stage--running" : ""}`}
        style={{ width: STAGE_W, height: STAGE_H }}
        tabIndex={0}
        aria-label="Project stage"
      >
        <Monitors />
        {project.sprites.map((sprite) => (
          <SpriteOnStage
            key={sprite.id}
            sprite={sprite}
            onClick={() => spriteClicked(sprite.id)}
          />
        ))}
      </div>
    </div>
  );
}

function SpriteOnStage({
  sprite,
  onClick,
}: {
  sprite: Sprite;
  onClick: () => void;
}) {
  if (!sprite.visible) return null;
  const { sx, sy } = toScreen(sprite.x, sprite.y);
  // direction: 90 = right (default). Visually rotate the costume so that 90 = no rotation.
  const rotation = sprite.direction - 90;
  const scale = sprite.size / 100;
  return (
    <>
      {sprite.sayText ? (
        <div
          className={`bubble bubble--${sprite.sayKind}`}
          style={{ left: sx, top: sy - 56 * scale }}
        >
          {sprite.sayText}
        </div>
      ) : null}
      <button
        type="button"
        className="sprite-on-stage"
        style={{
          left: sx,
          top: sy,
          transform: `translate(-50%, -50%) scale(${scale}) rotate(${rotation}deg)`,
        }}
        onClick={onClick}
        aria-label={sprite.name}
      >
        <span className="sprite-emoji" aria-hidden>
          {sprite.costume}
        </span>
      </button>
    </>
  );
}

function Monitors() {
  const { project } = useProject();
  const visible = project.variables.filter((v) => v.visible);
  if (visible.length === 0) return null;
  return (
    <ul className="monitors">
      {visible.map((v) => (
        <li key={v.id} className="monitor">
          <span className="monitor-name">{v.name}</span>
          <span className="monitor-value">{v.value}</span>
        </li>
      ))}
    </ul>
  );
}
