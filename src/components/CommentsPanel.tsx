import { useState } from "react";
import { useProject } from "../state/ProjectContext";
import { useAuth } from "../state/AuthContext";

function fmtTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function CommentsPanel() {
  const { project, addComment, deleteComment } = useProject();
  const { currentUser } = useAuth();
  const [text, setText] = useState("");

  return (
    <section className="comments-panel">
      <h2 className="panel-title">Comments</h2>
      <p className="hint">
        Posting as <strong>{currentUser?.displayName ?? "you"}</strong>
        {currentUser ? <> (@{currentUser.username})</> : null}
      </p>

      <form
        className="comment-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          addComment(project.id, text);
          setText("");
        }}
      >
        <textarea
          className="comment-input"
          placeholder={`Leave a note on "${project.name}"…`}
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button type="submit" className="btn btn-mini">
          Post
        </button>
      </form>

      <ul className="comment-list">
        {project.comments.length === 0 ? (
          <li className="comment-empty">No comments yet.</li>
        ) : (
          [...project.comments]
            .sort((a, b) => b.createdAt - a.createdAt)
            .map((c) => (
              <li key={c.id} className="comment-item">
                <div className="comment-head">
                  <span className="comment-author">{c.author || "you"}</span>
                  <span className="comment-time">{fmtTime(c.createdAt)}</span>
                  <button
                    type="button"
                    className="comment-delete"
                    title="Delete comment"
                    onClick={() => deleteComment(project.id, c.id)}
                  >
                    ×
                  </button>
                </div>
                <p className="comment-text">{c.text}</p>
              </li>
            ))
        )}
      </ul>
    </section>
  );
}
