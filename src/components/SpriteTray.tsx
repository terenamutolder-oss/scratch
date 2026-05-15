import { useState } from "react";
import { useProject } from "../state/ProjectContext";

export default function SpriteTray() {
  const {
    project,
    selectedSprite,
    addSprite,
    selectSprite,
    renameSprite,
    setSpriteCostume,
    deleteSprite,
  } = useProject();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  return (
    <div className="sprite-tray">
      <div className="sprite-tray-header">
        <h2 className="panel-title">Sprites</h2>
        <button
          type="button"
          className="btn btn-mini"
          onClick={addSprite}
          title="Add a sprite"
        >
          + Sprite
        </button>
      </div>

      <ul className="sprite-list">
        {project.sprites.map((s) => (
          <li
            key={s.id}
            className={`sprite-card ${
              s.id === selectedSprite.id ? "is-selected" : ""
            }`}
            onClick={() => selectSprite(s.id)}
          >
            <div className="sprite-card-emoji" aria-hidden>
              {s.costume}
            </div>
            {editingId === s.id ? (
              <form
                className="sprite-card-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  renameSprite(s.id, editingName);
                  setEditingId(null);
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <input
                  autoFocus
                  className="sprite-card-name-input"
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onBlur={() => {
                    renameSprite(s.id, editingName);
                    setEditingId(null);
                  }}
                />
              </form>
            ) : (
              <button
                type="button"
                className="sprite-card-name"
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  setEditingId(s.id);
                  setEditingName(s.name);
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  selectSprite(s.id);
                }}
                title="Double-click to rename"
              >
                {s.name}
              </button>
            )}
            {project.sprites.length > 1 ? (
              <button
                type="button"
                className="btn btn-mini btn-ghost sprite-card-delete"
                onClick={(e) => {
                  e.stopPropagation();
                  deleteSprite(s.id);
                }}
                title="Delete sprite"
              >
                ×
              </button>
            ) : null}
          </li>
        ))}
      </ul>

      <div className="sprite-props">
        <h3 className="panel-subtitle">Costume</h3>
        <div className="sprite-props-row">
          <input
            className="sprite-costume-input"
            value={selectedSprite.costume}
            maxLength={4}
            onChange={(e) =>
              setSpriteCostume(selectedSprite.id, e.target.value)
            }
            title="Emoji or up to 4 characters"
          />
          <div className="sprite-costume-preview" aria-hidden>
            {selectedSprite.costume}
          </div>
        </div>
        <p className="hint">Position: x={Math.round(selectedSprite.x)}, y={Math.round(selectedSprite.y)} · dir={Math.round(selectedSprite.direction)}° · size={Math.round(selectedSprite.size)}%</p>
      </div>
    </div>
  );
}
