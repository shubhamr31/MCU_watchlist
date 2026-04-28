const STORAGE_KEY = "mcu-watchlist-progress-v1";
const SCHEMA_VERSION = 1;

export const STATUSES = ["not_started", "watching", "completed"];

export const nextStatus = (status) => {
  const current = STATUSES.indexOf(status);
  if (current === -1 || current === STATUSES.length - 1) {
    return STATUSES[0];
  }
  return STATUSES[current + 1];
};

export const loadProgress = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw);
    if (parsed.schemaVersion !== SCHEMA_VERSION || typeof parsed.progress !== "object") {
      return {};
    }
    return parsed.progress;
  } catch (_error) {
    return {};
  }
};

export const saveProgress = (progress) => {
  const payload = {
    schemaVersion: SCHEMA_VERSION,
    progress,
    updatedAt: new Date().toISOString(),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
};

