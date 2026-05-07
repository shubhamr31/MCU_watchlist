const STORAGE_KEY = "mcu-watchlist-progress-v1";
const LEGACY_STORAGE_KEY = "mcu-watchlist-progress-v1";
const SCHEMA_VERSION = 1;

// Guest progress is stored in sessionStorage so it lives only for the
// current browser session. Per-account cloud sync still uses the backend.
const getStorage = () => {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return window.sessionStorage;
  } catch (_error) {
    return null;
  }
};

const getLegacyStorage = () => {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return window.localStorage;
  } catch (_error) {
    return null;
  }
};

export const STATUSES = ["not_started", "watching", "completed"];

export const nextStatus = (status) => {
  const current = STATUSES.indexOf(status);
  if (current === -1 || current === STATUSES.length - 1) {
    return STATUSES[0];
  }
  return STATUSES[current + 1];
};

const parsePayload = (raw) => {
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    if (parsed.schemaVersion !== SCHEMA_VERSION || typeof parsed.progress !== "object") {
      return null;
    }
    return parsed.progress;
  } catch (_error) {
    return null;
  }
};

export const loadProgress = () => {
  const storage = getStorage();
  if (!storage) {
    return {};
  }
  const fromSession = parsePayload(storage.getItem(STORAGE_KEY));
  if (fromSession) {
    return fromSession;
  }
  // One-time migration: pull legacy localStorage progress into the
  // current browser session so existing users don't lose state on first load.
  const legacy = getLegacyStorage();
  if (legacy) {
    const fromLocal = parsePayload(legacy.getItem(LEGACY_STORAGE_KEY));
    if (fromLocal) {
      saveProgress(fromLocal);
      return fromLocal;
    }
  }
  return {};
};

export const saveProgress = (progress) => {
  const storage = getStorage();
  if (!storage) {
    return;
  }
  const payload = {
    schemaVersion: SCHEMA_VERSION,
    progress,
    updatedAt: new Date().toISOString(),
  };
  storage.setItem(STORAGE_KEY, JSON.stringify(payload));
};

