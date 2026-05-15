import { useState } from "react";
import { useAuth } from "../state/AuthContext";

type Mode = "signin" | "signup";

export default function AuthGate() {
  const { userCount, signIn, signUp } = useAuth();
  const initialMode: Mode = userCount === 0 ? "signup" : "signin";
  const [mode, setMode] = useState<Mode>(initialMode);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (mode === "signup" && password !== confirm) {
      setError("Passwords don't match.");
      return;
    }

    setBusy(true);
    try {
      const res =
        mode === "signin"
          ? await signIn({ username, password })
          : await signUp({ username, displayName, password });
      if (!res.ok) setError(res.error);
    } catch (e) {
      console.error(e);
      setError("Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const showSwitch = userCount > 0 || mode === "signin";

  return (
    <div className="auth-shell">
      <header className="auth-header">
        <span className="brand-logo" aria-hidden>
          🧩
        </span>
        <div>
          <h1>Scratch Web</h1>
          <p className="brand-tag">
            {mode === "signup"
              ? userCount === 0
                ? "Create the first account on this browser."
                : "Create a new local account."
              : "Sign in to your local account."}
          </p>
        </div>
      </header>

      <form className="auth-card" onSubmit={submit}>
        <label className="auth-field">
          <span>Username</span>
          <input
            autoFocus
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="lowercase letters, numbers, . _ -"
            required
          />
        </label>

        {mode === "signup" ? (
          <label className="auth-field">
            <span>Display name</span>
            <input
              autoComplete="nickname"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Shown on comments and the toolbar"
            />
          </label>
        ) : null}

        <label className="auth-field">
          <span>Password</span>
          <input
            type="password"
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 6 characters"
            required
          />
        </label>

        {mode === "signup" ? (
          <label className="auth-field">
            <span>Confirm password</span>
            <input
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
          </label>
        ) : null}

        {error ? <p className="auth-error">{error}</p> : null}

        <button
          type="submit"
          className="btn btn-flag auth-submit"
          disabled={busy}
        >
          {busy
            ? "Working…"
            : mode === "signup"
            ? "Create account"
            : "Sign in"}
        </button>

        {showSwitch ? (
          <button
            type="button"
            className="auth-link"
            onClick={() => {
              setError(null);
              setMode((m) => (m === "signin" ? "signup" : "signin"));
            }}
          >
            {mode === "signin"
              ? "No account yet? Sign up"
              : "Have an account? Sign in"}
          </button>
        ) : null}

        <p className="auth-disclaimer">
          <strong>Local accounts only.</strong> Usernames and PBKDF2-hashed
          passwords are stored in this browser. Clearing site data deletes
          accounts and projects. This is not a real authentication system —
          don't reuse a sensitive password here.
        </p>
      </form>
    </div>
  );
}
