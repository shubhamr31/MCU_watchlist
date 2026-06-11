const STORAGE_KEY = "mcu-watchlist-progress-v1";
const LEGACY_STORAGE_KEY = "mcu-watchlist-progress-v1";
const SCHEMA_VERSION = 1;

// Guest and signed-out progress persists in localStorage on this device.
const getStorage = () => {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return window.localStorage;
  } catch (_error) {
    return null;
  }
};

const getLegacySessionStorage = () => {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return window.sessionStorage;
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

const STATUS_RANK = {
  not_started: 0,
  watching: 1,
  completed: 2,
};

export const mergeProgress = (local, remote) => {
  const merged = { ...(remote || {}) };
  Object.entries(local || {}).forEach(([itemId, status]) => {
    if (!STATUSES.includes(status)) {
      return;
    }
    const remoteStatus = merged[itemId] || "not_started";
    if ((STATUS_RANK[status] ?? 0) > (STATUS_RANK[remoteStatus] ?? 0)) {
      merged[itemId] = status;
    }
  });
  return merged;
};

export const loadProgress = () => {
  const storage = getStorage();
  if (!storage) {
    return {};
  }
  const fromLocal = parsePayload(storage.getItem(STORAGE_KEY));
  if (fromLocal) {
    return fromLocal;
  }
  // One-time migration from older sessionStorage-only builds.
  const legacySession = getLegacySessionStorage();
  if (legacySession) {
    const fromSession = parsePayload(legacySession.getItem(LEGACY_STORAGE_KEY));
    if (fromSession) {
      saveProgress(fromSession);
      return fromSession;
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

