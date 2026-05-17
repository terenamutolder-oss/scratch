import { useRef, useState } from "react";
import { useAuth } from "../state/AuthContext";
import { useProject } from "../state/ProjectContext";

function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export default function ProjectSocialBar() {
  const {
    project,
    currentUserId,
    isOwner,
    canCommentAndLike,
    socialAgeOk,
    confirmSocialAge,
    hasLiked,
    likeCount,
    toggleLike,
    isSubscribed,
    isLongtimeSubscriber,
    toggleSubscribe,
  } = useProject();
  const { currentUser } = useAuth();

  const [agePrompt, setAgePrompt] = useState(false);
  const pendingActionRef = useRef<(() => void) | null>(null);

  const creatorId = project.ownerId ?? "";
  const creatorLabel =
    project.ownerDisplayName ??
    (project.ownerUsername ? `@${project.ownerUsername}` : "Creator");
  const likes = likeCount(project.id);
  const liked = hasLiked(project.id);
  const subscribed = creatorId ? isSubscribed(creatorId) : false;
  const longtime = creatorId ? isLongtimeSubscriber(creatorId) : false;
  const canSubscribe = Boolean(creatorId) && creatorId !== currentUserId;

  const requireAge = (action: () => void) => {
    if (socialAgeOk) {
      action();
      return;
    }
    pendingActionRef.current = action;
    setAgePrompt(true);
  };

  const confirmAge = () => {
    confirmSocialAge();
    setAgePrompt(false);
    pendingActionRef.current?.();
    pendingActionRef.current = null;
  };

  const scrollToComments = () => {
    document.getElementById("comments-section")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
    const input = document.querySelector<HTMLTextAreaElement>(
      "#comments-section .comment-input",
    );
    input?.focus();
  };

  return (
    <section className="project-social" aria-label="Project engagement">
      <div className="project-social-creator">
        <span className="project-social-avatar" aria-hidden>
          {(creatorLabel.slice(0, 1) || "?").toUpperCase()}
        </span>
        <div className="project-social-meta">
          <strong className="project-social-name">{creatorLabel}</strong>
          {project.ownerUsername && project.ownerDisplayName ? (
            <span className="muted"> @{project.ownerUsername}</span>
          ) : null}
          <p className="project-social-title">{project.name}</p>
        </div>
      </div>

      <div className="project-social-actions">
        {canCommentAndLike ? (
          <button
            type="button"
            className={`social-btn social-btn--like ${liked ? "is-on" : ""}`}
            onClick={() => requireAge(() => toggleLike(project.id))}
            title={liked ? "Unlike" : "Like this project"}
          >
            <span aria-hidden>{liked ? "👍" : "👍🏻"}</span>
            <span>{fmtCount(likes)}</span>
            <span className="social-btn-label">Like</span>
          </button>
        ) : (
          <span
            className="social-btn social-btn--like social-btn--readonly"
            title="Sign in to like this project"
          >
            <span aria-hidden>👍</span>
            <span>{fmtCount(likes)}</span>
            <span className="social-btn-label">Like</span>
          </span>
        )}

        {canSubscribe ? (
          <button
            type="button"
            className={`social-btn social-btn--subscribe ${subscribed ? "is-on" : ""}`}
            onClick={() => requireAge(() => toggleSubscribe(creatorId))}
            title={
              longtime
                ? "Subscribed for 16+ years on this browser"
                : subscribed
                  ? "Unsubscribe"
                  : `Subscribe to ${creatorLabel}`
            }
          >
            <span aria-hidden>{subscribed ? "🔔" : "🔕"}</span>
            <span className="social-btn-label">
              {longtime
                ? "Subscribed · 16+ years"
                : subscribed
                  ? "Subscribed"
                  : "Subscribe"}
            </span>
          </button>
        ) : isOwner ? (
          <span className="social-btn social-btn--muted" title="This is your project">
            <span aria-hidden>✨</span>
            <span className="social-btn-label">Your project</span>
          </span>
        ) : null}

        {canCommentAndLike ? (
          <button
            type="button"
            className="social-btn social-btn--comment"
            onClick={() => requireAge(scrollToComments)}
            title="Jump to comments"
          >
            <span aria-hidden>💬</span>
            <span>{fmtCount(project.comments.length)}</span>
            <span className="social-btn-label">Comment</span>
          </button>
        ) : (
          <span
            className="social-btn social-btn--comment social-btn--readonly"
            title="Sign in to comment on this project"
          >
            <span aria-hidden>💬</span>
            <span>{fmtCount(project.comments.length)}</span>
            <span className="social-btn-label">Comment</span>
          </span>
        )}
      </div>

      {agePrompt && !socialAgeOk ? (
        <div className="project-social-age">
          <p>
            Comment, like, and subscribe are for viewers <strong>16 and older</strong>.
          </p>
          <div className="project-social-age-actions">
            <button
              type="button"
              className="btn btn-mini btn-flag"
              onClick={confirmAge}
            >
              I&apos;m 16 or older
            </button>
            <button
              type="button"
              className="btn btn-mini btn-ghost"
              onClick={() => {
                setAgePrompt(false);
                pendingActionRef.current = null;
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {!canCommentAndLike ? (
        <p className="project-social-visitor-hint">
          {currentUser?.isGuest
            ? "Guest mode: sign up to comment and like on any project. You can still run projects and subscribe to creators."
            : null}
        </p>
      ) : null}

      <p className="project-social-footnote">
        {canCommentAndLike ? (
          <>
            Comment and like on any project below the stage. Subscribe to creators
            here too. <strong>16+ only</strong> — stay subscribed for{" "}
            <strong>16 years</strong> to unlock the longtime badge.
          </>
        ) : (
          <>
            Subscribe below the stage. <strong>16+ only</strong> — longtime badge
            after <strong>16 years</strong>.
          </>
        )}
      </p>
    </section>
  );
}
