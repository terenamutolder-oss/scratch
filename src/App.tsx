import AuthGate from "./components/AuthGate";
import BlockPalette from "./components/BlockPalette";
import CommentsPanel from "./components/CommentsPanel";
import Library from "./components/Library";
import ScriptsCanvas from "./components/ScriptsCanvas";
import SpriteTray from "./components/SpriteTray";
import StageView from "./components/StageView";
import Toolbar from "./components/Toolbar";
import UserMenu from "./components/UserMenu";
import { useAuth } from "./state/AuthContext";
import { ProjectProvider, useProject } from "./state/ProjectContext";

export default function App() {
  const { ready, currentUser } = useAuth();

  if (!ready) return null;

  if (!currentUser) {
    return <AuthGate />;
  }

  return (
    <ProjectProvider
      key={currentUser.id}
      userId={currentUser.id}
      username={currentUser.username}
      displayName={currentUser.displayName}
    >
      <EditorShell />
    </ProjectProvider>
  );
}

function EditorShell() {
  const { view, isOwner, project } = useProject();
  const readOnlyEditor = view === "editor" && !isOwner;

  return (
    <div className={`app-root ${readOnlyEditor ? "app-root--readonly" : ""}`}>
      <header className="app-header">
        <div className="brand">
          <span className="brand-logo" aria-hidden>
            🧩
          </span>
          <div>
            <h1>Scratch Web</h1>
            <p className="brand-tag">Block coding in the browser — v0.5</p>
          </div>
        </div>
        <Toolbar />
        <UserMenu />
      </header>

      {view === "explore" ? (
        <main className="app-main app-main--library">
          <Library />
        </main>
      ) : (
        <main className="app-main">
          {readOnlyEditor ? null : (
            <aside className="palette-panel">
              <h2 className="panel-title">Blocks</h2>
              <BlockPalette />
            </aside>
          )}

          <section className="scripts-panel">
            <h2 className="panel-title">
              Scripts
              {readOnlyEditor ? (
                <span className="panel-readonly-tag" title={`Created by ${project.ownerDisplayName ?? "another user"}`}>
                  read-only
                </span>
              ) : null}
            </h2>
            <ScriptsCanvas />
          </section>

          <section className="right-panel">
            <StageView />
            <SpriteTray />
            <CommentsPanel />
          </section>
        </main>
      )}

      <footer className="app-footer">
        <span>
          Agent instructions: <code>AGENTS.md</code> · Product docs:{" "}
          <code>docs/</code> · Library shared across this browser.
        </span>
      </footer>
    </div>
  );
}
