import { useMemo, useState } from "react";
import { useProject } from "../state/ProjectContext";
import type { StoredProject, Studio } from "../types/library";

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function countBlocks(p: StoredProject): number {
  let n = 0;
  const walk = (blocks: Array<{ body?: unknown[]; body2?: unknown[] }>) => {
    for (const b of blocks) {
      n += 1;
      if (Array.isArray(b.body)) walk(b.body as typeof blocks);
      if (Array.isArray(b.body2)) walk(b.body2 as typeof blocks);
    }
  };
  for (const s of p.sprites) {
    for (const st of s.stacks) walk(st.blocks);
  }
  return n;
}

export default function Library() {
  const {
    library,
    currentUserId,
    createProject,
    openProject,
    renameProject,
    deleteProject,
    duplicateProject,
    createStudio,
    renameStudio,
    deleteStudio,
    toggleStudioMembership,
    setView,
  } = useProject();

  const currentProjectId = useProject().project.id;

  const [search, setSearch] = useState("");
  const [studioFilter, setStudioFilter] = useState<string | null>(null);
  const [ownerFilter, setOwnerFilter] = useState<"all" | "mine">("all");
  const [renamingProjectId, setRenamingProjectId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const projects = useMemo(() => {
    const list = library.projectOrder
      .map((id) => library.projects[id])
      .filter((p): p is StoredProject => Boolean(p));
    const q = search.trim().toLowerCase();
    return list
      .filter((p) => ownerFilter === "all" || p.ownerId === currentUserId)
      .filter((p) => !studioFilter || p.studioIds.includes(studioFilter))
      .filter((p) => {
        if (!q) return true;
        if (p.name.toLowerCase().includes(q)) return true;
        if (p.description.toLowerCase().includes(q)) return true;
        if (p.sprites.some((s) => s.name.toLowerCase().includes(q))) return true;
        if (p.comments.some((c) => c.text.toLowerCase().includes(q))) return true;
        if (p.ownerDisplayName?.toLowerCase().includes(q)) return true;
        if (p.ownerUsername?.toLowerCase().includes(q)) return true;
        return false;
      });
  }, [library, search, studioFilter, ownerFilter, currentUserId]);

  const studios = useMemo(
    () =>
      library.studioOrder
        .map((id) => library.studios[id])
        .filter((s): s is Studio => Boolean(s)),
    [library],
  );

  return (
    <div className="library">
      <aside className="library-sidebar">
        <h3 className="panel-subtitle">Browse</h3>
        <ul className="studio-list">
          <li>
            <button
              type="button"
              className={`studio-pill ${ownerFilter === "all" && studioFilter === null ? "is-active" : ""}`}
              onClick={() => {
                setOwnerFilter("all");
                setStudioFilter(null);
              }}
            >
              All projects ({library.projectOrder.length})
            </button>
          </li>
          <li>
            <button
              type="button"
              className={`studio-pill ${ownerFilter === "mine" ? "is-active" : ""}`}
              onClick={() => {
                setOwnerFilter("mine");
                setStudioFilter(null);
              }}
            >
              My projects (
              {
                Object.values(library.projects).filter(
                  (p) => p.ownerId === currentUserId,
                ).length
              }
              )
            </button>
          </li>
        </ul>

        <h3 className="panel-subtitle">Studios</h3>
        <ul className="studio-list">
          {studios.map((s) => {
            const count = Object.values(library.projects).filter((p) =>
              p.studioIds.includes(s.id),
            ).length;
            const canEditStudio = !s.ownerId || s.ownerId === currentUserId;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  className={`studio-pill ${
                    studioFilter === s.id ? "is-active" : ""
                  }`}
                  onClick={() => setStudioFilter(s.id)}
                  title={`Filter by ${s.name}${
                    s.ownerUsername ? ` (by @${s.ownerUsername})` : ""
                  }`}
                >
                  {s.name} <span className="muted">({count})</span>
                </button>
                <span className="studio-actions">
                  <button
                    type="button"
                    className="btn btn-mini btn-ghost"
                    title={
                      canEditStudio
                        ? "Rename studio"
                        : "Only the studio creator can rename"
                    }
                    disabled={!canEditStudio}
                    onClick={(e) => {
                      e.stopPropagation();
                      const name = prompt("Rename studio", s.name);
                      if (name) renameStudio(s.id, name);
                    }}
                  >
                    rename
                  </button>
                  <button
                    type="button"
                    className="btn btn-mini btn-ghost"
                    title={
                      canEditStudio
                        ? "Delete studio"
                        : "Only the studio creator can delete"
                    }
                    disabled={!canEditStudio}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (
                        confirm(
                          `Delete the studio "${s.name}"? Projects stay; only this collection is removed.`,
                        )
                      ) {
                        deleteStudio(s.id);
                        if (studioFilter === s.id) setStudioFilter(null);
                      }
                    }}
                  >
                    ×
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
        <form
          className="mini-editor-row"
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            const name = String(data.get("studio") || "").trim();
            if (!name) return;
            const id = createStudio(name);
            if (id) setStudioFilter(id);
            (e.currentTarget as HTMLFormElement).reset();
          }}
        >
          <input
            name="studio"
            placeholder="New studio name"
            className="mini-editor-input"
          />
          <button type="submit" className="btn btn-mini">
            + Studio
          </button>
        </form>
      </aside>

      <section className="library-main">
        <div className="library-toolbar">
          <input
            type="search"
            className="library-search"
            placeholder="Search projects, sprites, comments, creators…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button
            type="button"
            className="btn btn-flag"
            onClick={() => createProject("Untitled project")}
            title="Create a new empty project"
          >
            + New project
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setView("editor")}
            title="Back to editor"
          >
            Open editor
          </button>
        </div>

        {projects.length === 0 ? (
          <div className="library-empty">
            <p>No projects match this view.</p>
            <button
              type="button"
              className="btn btn-flag"
              onClick={() => createProject("Untitled project")}
            >
              + New project
            </button>
          </div>
        ) : (
          <ul className="project-grid">
            {projects.map((p) => {
              const blockCount = countBlocks(p);
              const firstSprite = p.sprites[0];
              const isCurrent = currentProjectId === p.id;
              const isMine = p.ownerId === currentUserId;
              return (
                <li
                  key={p.id}
                  className={`project-card ${isCurrent ? "is-current" : ""} ${
                    isMine ? "" : "is-foreign"
                  }`}
                >
                  <button
                    type="button"
                    className="project-card-thumb"
                    onClick={() => openProject(p.id)}
                    title="Open project"
                  >
                    <span className="project-card-emoji">
                      {firstSprite?.costume ?? "🧩"}
                    </span>
                    <span className="project-card-meta">
                      <span>
                        {p.sprites.length} sprite
                        {p.sprites.length === 1 ? "" : "s"}
                      </span>
                      <span>·</span>
                      <span>
                        {blockCount} block{blockCount === 1 ? "" : "s"}
                      </span>
                    </span>
                  </button>

                  <div className="project-card-body">
                    {renamingProjectId === p.id ? (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          renameProject(p.id, renameValue);
                          setRenamingProjectId(null);
                        }}
                      >
                        <input
                          autoFocus
                          className="mini-editor-input"
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onBlur={() => {
                            renameProject(p.id, renameValue);
                            setRenamingProjectId(null);
                          }}
                        />
                      </form>
                    ) : (
                      <button
                        type="button"
                        className="project-card-name"
                        onDoubleClick={() => {
                          if (!isMine) return;
                          setRenamingProjectId(p.id);
                          setRenameValue(p.name);
                        }}
                        onClick={() => openProject(p.id)}
                        title={
                          isMine
                            ? "Open. Double-click to rename."
                            : `By ${p.ownerDisplayName ?? "—"} — open to view/run`
                        }
                      >
                        {p.name}
                      </button>
                    )}
                    <p className="project-card-date">
                      <span
                        className={`owner-badge ${isMine ? "owner-badge--mine" : ""}`}
                        title={
                          isMine
                            ? "You created this project"
                            : `Created by ${p.ownerDisplayName ?? "—"}${
                                p.ownerUsername ? ` (@${p.ownerUsername})` : ""
                              }`
                        }
                      >
                        {isMine
                          ? "you"
                          : `by ${p.ownerDisplayName ?? "—"}`}
                      </span>
                      <span className="muted"> · Updated {fmtDate(p.updatedAt)}</span>
                      <span className="muted">
                        {" · "}
                        {p.comments.length} comment
                        {p.comments.length === 1 ? "" : "s"}
                      </span>
                    </p>
                    <div className="project-card-studios">
                      {studios.map((s) => {
                        const inStudio = p.studioIds.includes(s.id);
                        return (
                          <button
                            key={s.id}
                            type="button"
                            className={`studio-chip ${inStudio ? "is-on" : ""}`}
                            disabled={!isMine}
                            onClick={() => toggleStudioMembership(p.id, s.id)}
                            title={
                              isMine
                                ? inStudio
                                  ? `Remove from "${s.name}"`
                                  : `Add to "${s.name}"`
                                : "Only the project creator can change studios"
                            }
                          >
                            {s.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="project-card-actions">
                    <button
                      type="button"
                      className="btn btn-mini"
                      onClick={() => openProject(p.id)}
                    >
                      Open
                    </button>
                    <button
                      type="button"
                      className="btn btn-mini btn-ghost"
                      onClick={() => duplicateProject(p.id)}
                      title="Duplicate (the copy will be yours)"
                    >
                      duplicate
                    </button>
                    <button
                      type="button"
                      className="btn btn-mini btn-ghost"
                      disabled={!isMine}
                      onClick={() => {
                        if (
                          confirm(
                            `Delete "${p.name}"? This can't be undone.`,
                          )
                        ) {
                          deleteProject(p.id);
                        }
                      }}
                      title={
                        isMine
                          ? "Delete"
                          : "Only the creator can delete this project"
                      }
                    >
                      delete
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
