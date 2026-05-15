import { useEffect, useRef, useState } from "react";
import { useAuth } from "../state/AuthContext";

export default function UserMenu() {
  const { currentUser, signOut, updateDisplayName } = useAuth();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setEditing(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  if (!currentUser) return null;

  return (
    <div className="user-menu" ref={wrapperRef}>
      <button
        type="button"
        className="user-menu-trigger"
        onClick={() => setOpen((o) => !o)}
        title="Account"
      >
        <span className="user-menu-avatar" aria-hidden>
          {currentUser.displayName.slice(0, 1).toUpperCase() || "?"}
        </span>
        <span className="user-menu-name">{currentUser.displayName}</span>
        <span aria-hidden>▾</span>
      </button>
      {open ? (
        <div className="user-menu-popover" role="menu">
          <p className="user-menu-row">
            <span className="muted">
              {currentUser.isGuest ? "Using" : "Signed in as"}
            </span>
            <strong>
              {currentUser.isGuest ? currentUser.displayName : `@${currentUser.username}`}
            </strong>
          </p>
          {currentUser.isGuest ? (
            <p className="user-menu-hint">
              Guest mode — no password. Sign out and use Sign up if you want a
              named profile on this browser.
            </p>
          ) : editing ? (
            <form
              className="user-menu-row"
              onSubmit={(e) => {
                e.preventDefault();
                updateDisplayName(draft);
                setEditing(false);
              }}
            >
              <input
                autoFocus
                className="mini-editor-input"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => {
                  updateDisplayName(draft);
                  setEditing(false);
                }}
              />
            </form>
          ) : (
            <button
              type="button"
              className="user-menu-action"
              onClick={() => {
                setDraft(currentUser.displayName);
                setEditing(true);
              }}
            >
              Edit display name
            </button>
          )}
          <button
            type="button"
            className="user-menu-action user-menu-danger"
            onClick={() => {
              setOpen(false);
              signOut();
            }}
          >
            {currentUser.isGuest ? "Leave guest mode" : "Sign out"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
