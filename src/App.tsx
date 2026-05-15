import BlockPalette from "./components/BlockPalette";
import CommentsPanel from "./components/CommentsPanel";
import Library from "./components/Library";
import ScriptsCanvas from "./components/ScriptsCanvas";
import SpriteTray from "./components/SpriteTray";
import StageView from "./components/StageView";
import Toolbar from "./components/Toolbar";
import { useProject } from "./state/ProjectContext";

export default function App() {
  const { view } = useProject();

  return (
    <div className="app-root">
      <header className="app-header">
        <div className="brand">
          <span className="brand-logo" aria-hidden>
            🧩
          </span>
          <div>
            <h1>Scratch Web</h1>
            <p className="brand-tag">Block coding in the browser — v0.3</p>
          </div>
        </div>
        <Toolbar />
      </header>

      {view === "explore" ? (
        <main className="app-main app-main--library">
          <Library />
        </main>
      ) : (
        <main className="app-main">
          <aside className="palette-panel">
            <h2 className="panel-title">Blocks</h2>
            <BlockPalette />
          </aside>

          <section className="scripts-panel">
            <h2 className="panel-title">Scripts</h2>
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
          <code>docs/</code> · Projects auto-save to your browser.
        </span>
      </footer>
    </div>
  );
}
