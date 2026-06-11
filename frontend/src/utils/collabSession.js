const ACTIVE_SESSION_STORAGE_KEY = "mcu_collab_session_v1";

export const loadActiveCollabSession = () => {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(ACTIVE_SESSION_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (!parsed?.sessionId || !parsed?.joinCode) {
      return null;
    }
    return {
      sessionId: String(parsed.sessionId),
      joinCode: String(parsed.joinCode),
      name: String(parsed.name || "MCU Watch Party"),
    };
  } catch (_error) {
    return null;
  }
};

export const saveActiveCollabSession = (session) => {
  if (typeof window === "undefined") {
    return;
  }
  if (!session) {
    window.localStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(
    ACTIVE_SESSION_STORAGE_KEY,
    JSON.stringify({
      sessionId: session.sessionId,
      joinCode: session.joinCode,
      name: session.name || "MCU Watch Party",
    })
  );
};

const parseError = async (response) => {
  try {
    const payload = await response.json();
    return payload.error || "Request failed.";
  } catch (_error) {
    return "Request failed.";
  }
};

export const createWatchParty = async (apiBaseUrl, authHeaders, { name, progress } = {}) => {
  const response = await fetch(`${apiBaseUrl}/api/session`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders,
    },
    body: JSON.stringify({ name, progress }),
  });
  if (!response.ok) {
    throw new Error(await parseError(response));
  }
  return response.json();
};

export const joinWatchParty = async (apiBaseUrl, authHeaders, { joinCode, progress } = {}) => {
  const response = await fetch(`${apiBaseUrl}/api/session/join`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders,
    },
    body: JSON.stringify({ joinCode, progress }),
  });
  if (!response.ok) {
    throw new Error(await parseError(response));
  }
  return response.json();
};

export const fetchWatchPartyProgress = async (apiBaseUrl, authHeaders, sessionId) => {
  const response = await fetch(`${apiBaseUrl}/api/session/${sessionId}/progress`, {
    headers: authHeaders,
  });
  if (!response.ok) {
    throw new Error(await parseError(response));
  }
  return response.json();
};

export const updateWatchPartyItem = async (apiBaseUrl, authHeaders, sessionId, itemId, status) => {
  const response = await fetch(`${apiBaseUrl}/api/session/${sessionId}/progress/${encodeURIComponent(itemId)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders,
    },
    body: JSON.stringify({ status }),
  });
  if (!response.ok) {
    throw new Error(await parseError(response));
  }
  return response.json();
};

export const replaceWatchPartyProgress = async (apiBaseUrl, authHeaders, sessionId, progress) => {
  const response = await fetch(`${apiBaseUrl}/api/session/${sessionId}/progress`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders,
    },
    body: JSON.stringify({ progress }),
  });
  if (!response.ok) {
    throw new Error(await parseError(response));
  }
  return response.json();
};

export const leaveWatchParty = async (apiBaseUrl, authHeaders, sessionId) => {
  const response = await fetch(`${apiBaseUrl}/api/session/${sessionId}/leave`, {
    method: "POST",
    headers: authHeaders,
  });
  if (!response.ok) {
    throw new Error(await parseError(response));
  }
  return response.json();
};

export const fetchMyWatchParties = async (apiBaseUrl, authHeaders) => {
  const response = await fetch(`${apiBaseUrl}/api/session/mine`, {
    headers: authHeaders,
  });
  if (!response.ok) {
    throw new Error(await parseError(response));
  }
  const payload = await response.json();
  return payload.sessions || [];
};

export const fetchWatchPartyMembers = async (apiBaseUrl, authHeaders, sessionId) => {
  const response = await fetch(`${apiBaseUrl}/api/session/${sessionId}/members`, {
    headers: authHeaders,
  });
  if (!response.ok) {
    throw new Error(await parseError(response));
  }
  const payload = await response.json();
  return payload.members || [];
};

export const buildWatchPartyShareUrl = (joinCode) => {
  if (typeof window === "undefined") {
    return "";
  }
  const url = new URL(window.location.href);
  url.searchParams.set("join", joinCode);
  return url.toString();
};
