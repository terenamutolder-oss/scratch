import AuthGate from "./components/AuthGate";
import BlockPalette from "./components/BlockPalette";
import CommentsPanel from "./components/CommentsPanel";
import Library from "./components/Library";
import ScriptsCanvas from "./components/ScriptsCanvas";
import SpriteTray from "./components/SpriteTray";
import StageView from "./components/StageView";
import Toolbar from "./components/Toolbar";
import UserMenu from "./components/UserMenu";
import CloudStatusBanner from "./components/CloudStatusBanner";
import { isGuestUserId } from "./types/auth";
import { useAuth } from "./state/AuthContext";
import { ProjectProvider, useProject } from "./state/ProjectContext";

export default function App() {
  const { ready, currentUser, usesCloud } = useAuth();

  if (!ready) {
    return (
      <div className="auth-shell">
        <p className="brand-tag">Loading Scratch Web…</p>
      </div>
    );
  }

  if (!currentUser) {
    return <AuthGate />;
  }

  const useCloud =
    usesCloud && !currentUser.isGuest && !isGuestUserId(currentUser.id);

  return (
    <ProjectProvider
      key={currentUser.id}
      userId={currentUser.id}
      username={currentUser.username}
      displayName={currentUser.displayName}
      useCloud={useCloud}
    >
      <EditorShell usesCloud={useCloud} />
    </ProjectProvider>
  );
}

function EditorShell({ usesCloud }: { usesCloud: boolean }) {
  const { libraryReady, view, isOwner, project } = useProject();
  const readOnlyEditor = view === "editor" && !isOwner;

  if (!libraryReady) {
    return (
      <div className="auth-shell">
        <p className="brand-tag">Loading your projects from the cloud…</p>
      </div>
    );
  }

  return (
    <div className={`app-root ${readOnlyEditor ? "app-root--readonly" : ""}`}>
      <CloudStatusBanner cloudSyncActive={usesCloud} />
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
                <span
                  className="panel-readonly-tag"
                  title={`Created by ${project.ownerDisplayName ?? "another user"}`}
                >
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
          <code>docs/</code>
          {usesCloud
            ? " · Projects saved to Google Cloud Firestore."
            : " · Library shared across this browser."}
        </span>
      </footer>
    </div>
  );
}
