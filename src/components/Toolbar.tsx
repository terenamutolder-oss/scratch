import { useState } from "react";
import { useProject } from "../state/ProjectContext";

export default function Toolbar() {
  const {
    library,
    project,
    running,
    greenFlag,
    stopAll,
    setView,
    renameProject,
  } = useProject();

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(project.name);

  const totalStacks = project.sprites.reduce(
    (n, s) => n + s.stacks.length,
    0,
  );
  const totalProjects = library.projectOrder.length;

  return (
    <div className="toolbar">
      <button
        type="button"
        className={`btn btn-ghost ${library.view === "explore" ? "is-active" : ""}`}
        onClick={() =>
          setView(library.view === "explore" ? "editor" : "explore")
        }
        title="Browse all projects and studios"
      >
        🗂 {library.view === "explore" ? "Editor" : "Explore"} ({totalProjects})
      </button>

      {editingName ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            renameProject(project.id, nameDraft);
            setEditingName(false);
          }}
        >
          <input
            autoFocus
            className="toolbar-name-input"
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={() => {
              renameProject(project.id, nameDraft);
              setEditingName(false);
            }}
          />
        </form>
      ) : (
        <button
          type="button"
          className="toolbar-name"
          title="Click to rename project"
          onClick={() => {
            setNameDraft(project.name);
            setEditingName(true);
          }}
        >
          {project.name}
        </button>
      )}

      <button
        type="button"
        className="btn btn-flag"
        onClick={greenFlag}
        disabled={totalStacks === 0}
        title="Run all scripts triggered by the green flag"
      >
        🏁 Run
      </button>
      <button
        type="button"
        className="btn btn-stop"
        onClick={stopAll}
        disabled={!running}
        title="Stop all running scripts"
      >
        ⏹ Stop
      </button>

      <span className="toolbar-status">
        {running ? "running" : `${totalStacks} script${totalStacks === 1 ? "" : "s"}`}
      </span>
    </div>
  );
}
