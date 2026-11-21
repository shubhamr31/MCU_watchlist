import { useEffect, useState } from "react";
import "./intro.css";

/**
 * Sacred Timeline loading screen.
 * A gold path draws itself, splits into branches, and merges again while
 * TVA-style status lines cycle. Used for the intro and for session checks.
 *
 * Props:
 * - onSkip: when provided the screen can be skipped (click / Enter / Space / Esc).
 * - message: fixed status line (e.g. while checking a saved session). When omitted,
 *   the default lines cycle.
 * - durationMs: length of the progress bar animation (matches the App's intro timer).
 */

const DEFAULT_MESSAGES = [
  "Locating variants",
  "Mapping branches",
  "Pruning loose ends",
  "Aligning the Sacred Timeline",
];

export function IntroLoader({ onSkip, message, durationMs = 2600 }) {
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    if (message) {
      return undefined;
    }
    const step = Math.max(500, Math.floor(durationMs / DEFAULT_MESSAGES.length));
    const timer = window.setInterval(() => {
      setMessageIndex((prev) => Math.min(prev + 1, DEFAULT_MESSAGES.length - 1));
    }, step);
    return () => window.clearInterval(timer);
  }, [message, durationMs]);

  useEffect(() => {
    if (!onSkip) {
      return undefined;
    }
    const onKey = (event) => {
      if (event.key === "Enter" || event.key === " " || event.key === "Escape") {
        onSkip();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onSkip]);

  const status = message || DEFAULT_MESSAGES[messageIndex];

  return (
    <div
      className="intro"
      role="status"
      aria-live="polite"
      aria-label="Loading Sacred Timeline"
      style={{ "--intro-duration": `${durationMs}ms` }}
      onClick={onSkip}
    >
      <div className="intro-inner">
        <svg className="intro-path" viewBox="0 0 300 300" aria-hidden="true" focusable="false">
          <defs>
            {/* userSpaceOnUse: a bounding-box gradient is skipped on the zero-width vertical trunk */}
            <linearGradient id="intro-gold" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="300">
              <stop offset="0" stopColor="#f5d98b" />
              <stop offset="1" stopColor="#e9b84a" />
            </linearGradient>
          </defs>
          {/* trunk */}
          <path className="intro-line intro-line--trunk" d="M150 0 V300" pathLength="1" />
          {/* two branches that split and rejoin */}
          <path
            className="intro-line intro-line--branch intro-line--b1"
            d="M150 70 C 70 90, 50 120, 56 150 C 62 182, 90 206, 150 230"
            pathLength="1"
          />
          <path
            className="intro-line intro-line--branch intro-line--b2"
            d="M150 70 C 230 90, 250 120, 244 150 C 238 182, 210 206, 150 230"
            pathLength="1"
          />
          <circle className="intro-node intro-node--1" cx="150" cy="70" r="6" />
          <circle className="intro-node intro-node--2" cx="56" cy="150" r="5" />
          <circle className="intro-node intro-node--3" cx="244" cy="150" r="5" />
          <circle className="intro-node intro-node--4" cx="150" cy="230" r="6" />
          <circle className="intro-node intro-node--5" cx="150" cy="290" r="6" />
        </svg>

        <p className="intro-eyebrow">Marvel Cinematic Universe</p>
        <h1 className="intro-title">Sacred Timeline</h1>
        <p className="intro-sub">Your path to Doomsday</p>

        <div className="intro-bar" aria-hidden="true">
          <span />
        </div>
        <p className="intro-status">{status}…</p>

        {onSkip ? <p className="intro-skip">Tap anywhere to skip</p> : null}
      </div>
    </div>
  );
}
