import { useEffect, useRef, useState } from "react";
import "./login.css";

/**
 * Sacred Timeline login screen (presentational).
 * All auth logic stays in App.jsx; this component only renders the form and
 * sanitises the two credential fields (6 alphanumeric username, 6 digit PassKey).
 */

const USERNAME_RE = /^[A-Z0-9]{6}$/;
const PASSKEY_RE = /^\d{6}$/;

const cleanUsername = (value) => value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
const cleanPassKey = (value) => value.replace(/\D/g, "").slice(0, 6);

function PathMark() {
  return (
    <svg className="login-mark" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <path d="M32 2 V62" className="login-mark-line" />
      <path d="M32 16 C 14 20, 10 30, 12 34 C 14 42, 22 46, 32 50" className="login-mark-line" />
      <path d="M32 16 C 50 20, 54 30, 52 34 C 50 42, 42 46, 32 50" className="login-mark-line" />
      <circle cx="32" cy="16" r="3" className="login-mark-node" />
      <circle cx="12" cy="34" r="2.5" className="login-mark-node" />
      <circle cx="52" cy="34" r="2.5" className="login-mark-node" />
      <circle cx="32" cy="50" r="3" className="login-mark-node" />
      <circle cx="32" cy="60" r="3" className="login-mark-node login-mark-node--end" />
    </svg>
  );
}

function FieldStatus({ valid, length }) {
  return (
    <span className={`login-count ${valid ? "login-count--ok" : ""}`} aria-hidden="true">
      {valid ? "✓" : `${length}/6`}
    </span>
  );
}

export function LoginScreen({
  mode,
  onModeChange,
  username,
  onUsernameChange,
  passKey,
  onPassKeyChange,
  onSubmit,
  submitting,
  error,
  notice,
  showMagicLink,
  magicLinkEmail,
  onMagicLinkEmailChange,
  onMagicLinkSubmit,
  magicLinkSending,
  magicLinkInfo,
  showGoogle,
  googleReady,
  onGoogle,
  onGuest,
  leaderboard,
}) {
  const [showPassKey, setShowPassKey] = useState(false);
  const usernameRef = useRef(null);
  const isRegister = mode === "register";
  const usernameValid = USERNAME_RE.test(username);
  const passKeyValid = PASSKEY_RE.test(passKey);
  const hasAlternatives = showGoogle || showMagicLink;

  useEffect(() => {
    usernameRef.current?.focus();
  }, []);

  return (
    <div className="login">
      <main className="login-main">
        <header className="login-head">
          <PathMark />
          <p className="login-eyebrow">TVA · Clearance check</p>
          <h1>Sacred Timeline</h1>
          <p className="login-sub">
            {isRegister
              ? "Create an account to track and save your progress."
              : "Sign in to track and save your progress."}
          </p>
        </header>

        <section className="login-card" aria-label={isRegister ? "Create account" : "Sign in"}>
          <div className="login-tabs" role="tablist" aria-label="Sign in or create account">
            <button
              type="button"
              role="tab"
              aria-selected={!isRegister}
              className={!isRegister ? "active" : ""}
              onClick={() => onModeChange("login")}
            >
              Sign in
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={isRegister}
              className={isRegister ? "active" : ""}
              onClick={() => onModeChange("register")}
            >
              Create account
            </button>
          </div>

          <form onSubmit={onSubmit} className="login-form" noValidate>
            <label htmlFor="login-username">
              <span className="login-label-row">
                <span>Username</span>
                <FieldStatus valid={usernameValid} length={username.length} />
              </span>
              <input
                id="login-username"
                ref={usernameRef}
                type="text"
                autoComplete="username"
                autoCapitalize="characters"
                spellCheck={false}
                maxLength={6}
                value={username}
                onChange={(event) => onUsernameChange(cleanUsername(event.target.value))}
                placeholder="A1B2C3"
                aria-describedby="login-username-hint"
              />
              <small id="login-username-hint">6 letters or numbers</small>
            </label>

            <label htmlFor="login-passkey">
              <span className="login-label-row">
                <span>PassKey</span>
                <FieldStatus valid={passKeyValid} length={passKey.length} />
              </span>
              <span className="login-input-wrap">
                <input
                  id="login-passkey"
                  type={showPassKey ? "text" : "password"}
                  autoComplete={isRegister ? "new-password" : "current-password"}
                  inputMode="numeric"
                  maxLength={6}
                  value={passKey}
                  onChange={(event) => onPassKeyChange(cleanPassKey(event.target.value))}
                  placeholder="••••••"
                  aria-describedby="login-passkey-hint"
                />
                <button
                  type="button"
                  className="login-reveal"
                  aria-pressed={showPassKey}
                  aria-label={showPassKey ? "Hide PassKey" : "Show PassKey"}
                  onClick={() => setShowPassKey((prev) => !prev)}
                >
                  {showPassKey ? "Hide" : "Show"}
                </button>
              </span>
              <small id="login-passkey-hint">6 digits</small>
            </label>

            {error ? (
              <p className="login-alert" role="alert">
                {error}
              </p>
            ) : null}
            {notice && !error ? (
              <p className="login-notice" role="status">
                {notice}
              </p>
            ) : null}

            <button type="submit" className="login-primary" disabled={submitting}>
              {submitting
                ? isRegister
                  ? "Creating account…"
                  : "Signing in…"
                : isRegister
                  ? "Create account"
                  : "Sign in"}
            </button>
          </form>

          {hasAlternatives ? (
            <>
              <p className="login-divider">
                <span>or continue with</span>
              </p>

              {showGoogle ? (
                <button
                  type="button"
                  className="login-secondary"
                  onClick={onGoogle}
                  disabled={!googleReady}
                >
                  {googleReady ? "Continue with Google" : "Loading Google Sign-In…"}
                </button>
              ) : null}

              {showMagicLink ? (
                <form onSubmit={onMagicLinkSubmit} className="login-form login-magic" noValidate>
                  <label htmlFor="login-magic-email">
                    <span className="login-label-row">
                      <span>Email magic link</span>
                    </span>
                    <input
                      id="login-magic-email"
                      type="email"
                      autoComplete="email"
                      value={magicLinkEmail}
                      onChange={(event) => onMagicLinkEmailChange(event.target.value)}
                      placeholder="you@example.com"
                    />
                  </label>
                  <button type="submit" className="login-secondary" disabled={magicLinkSending}>
                    {magicLinkSending ? "Sending link…" : "Email me a magic link"}
                  </button>
                  {magicLinkInfo ? (
                    <p className="login-success" role="status">
                      {magicLinkInfo}
                    </p>
                  ) : null}
                </form>
              ) : null}
            </>
          ) : null}

          {onGuest ? (
            <button type="button" className="login-guest" onClick={onGuest}>
              Continue as guest <span aria-hidden="true">→</span>
            </button>
          ) : null}
        </section>

        {leaderboard.length > 0 ? (
          <section className="login-board" aria-label="Top watchers">
            <h2>Top watchers</h2>
            <ol>
              {leaderboard.slice(0, 5).map((entry, index) => (
                <li key={entry.username}>
                  <span className="login-board-rank">#{index + 1}</span>
                  <strong>{entry.username}</strong>
                  <span>{entry.completed} completed</span>
                </li>
              ))}
            </ol>
          </section>
        ) : null}
      </main>
    </div>
  );
}
