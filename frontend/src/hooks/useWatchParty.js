import { useCallback, useEffect, useRef, useState } from "react";
import { loadProgress } from "../utils/progressStore";
import {
  buildWatchPartyShareUrl,
  createWatchParty,
  fetchMyWatchParties,
  fetchWatchPartyMembers,
  fetchWatchPartyProgress,
  joinWatchParty,
  leaveWatchParty,
  loadActiveCollabSession,
  saveActiveCollabSession,
} from "../utils/collabSession";

const JOIN_CODE_PATTERN = /^[A-Z0-9]{6}$/;

const readUrlJoinCode = () => {
  if (typeof window === "undefined") {
    return "";
  }
  return new URLSearchParams(window.location.search).get("join")?.toUpperCase() || "";
};

const clearUrlJoinCode = () => {
  if (typeof window === "undefined") {
    return;
  }
  const url = new URL(window.location.href);
  url.searchParams.delete("join");
  window.history.replaceState({}, "", url.toString());
};

export const useWatchParty = ({ apiBaseUrl, authHeaders, authToken, onSyncProgress, getProgressForImport }) => {
  const canUseWatchParty = Boolean(authToken);
  const [showPanel, setShowPanel] = useState(false);
  const [activeSession, setActiveSession] = useState(() => loadActiveCollabSession());
  const [progressMeta, setProgressMeta] = useState({});
  const [partyMembers, setPartyMembers] = useState([]);
  const [myParties, setMyParties] = useState([]);
  const [joinCodeInput, setJoinCodeInput] = useState(readUrlJoinCode);
  const [partyNameInput, setPartyNameInput] = useState("MCU Watch Party");
  const [importOnJoin, setImportOnJoin] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const autoJoinAttempted = useRef(false);

  const hydrateSession = useCallback(
    async (session) => {
      const payload = await fetchWatchPartyProgress(apiBaseUrl, authHeaders, session.sessionId);
      const nextSession = {
        sessionId: payload.sessionId || session.sessionId,
        joinCode: payload.joinCode || session.joinCode,
        name: payload.name || session.name,
      };
      setActiveSession(nextSession);
      saveActiveCollabSession(nextSession);
      setProgressMeta(payload.meta || {});
      onSyncProgress(payload.progress || {}, payload.meta || {});
      return nextSession;
    },
    [apiBaseUrl, authHeaders, onSyncProgress]
  );

  const refreshMembers = useCallback(
    async (sessionId) => {
      if (!sessionId || !authToken) {
        setPartyMembers([]);
        return;
      }
      try {
        const members = await fetchWatchPartyMembers(apiBaseUrl, authHeaders, sessionId);
        setPartyMembers(members);
      } catch (_err) {
        setPartyMembers([]);
      }
    },
    [apiBaseUrl, authHeaders, authToken]
  );

  const refreshMyParties = useCallback(async () => {
    if (!authToken) {
      setMyParties([]);
      return;
    }
    try {
      const sessions = await fetchMyWatchParties(apiBaseUrl, authHeaders);
      setMyParties(sessions);
    } catch (_err) {
      setMyParties([]);
    }
  }, [apiBaseUrl, authHeaders, authToken]);

  const refreshActiveProgress = useCallback(async () => {
    if (!activeSession?.sessionId || !authToken) {
      return;
    }
    try {
      const payload = await fetchWatchPartyProgress(apiBaseUrl, authHeaders, activeSession.sessionId);
      setProgressMeta(payload.meta || {});
      onSyncProgress(payload.progress || {}, payload.meta || {});
    } catch (_err) {
      // Keep optimistic UI on transient failures.
    }
  }, [activeSession, apiBaseUrl, authHeaders, authToken, onSyncProgress]);

  useEffect(() => {
    if (!authToken) {
      setActiveSession(null);
      setProgressMeta({});
      setPartyMembers([]);
      setMyParties([]);
      saveActiveCollabSession(null);
      autoJoinAttempted.current = false;
      return;
    }

    const boot = async () => {
      const stored = loadActiveCollabSession();
      if (stored) {
        try {
          await hydrateSession(stored);
          await refreshMembers(stored.sessionId);
        } catch (_err) {
          saveActiveCollabSession(null);
          setActiveSession(null);
        }
      }
      await refreshMyParties();
    };
    boot();
  }, [authToken, hydrateSession, refreshMembers, refreshMyParties]);

  useEffect(() => {
    if (!activeSession?.sessionId) {
      return undefined;
    }
    refreshMembers(activeSession.sessionId);
    const timer = window.setInterval(refreshActiveProgress, 10000);
    return () => window.clearInterval(timer);
  }, [activeSession?.sessionId, refreshActiveProgress, refreshMembers]);

  useEffect(() => {
    if (showPanel && authToken) {
      refreshMyParties();
    }
  }, [showPanel, authToken, refreshMyParties]);

  const resolveImportProgress = useCallback(() => {
    if (!importOnJoin) {
      return undefined;
    }
    const local = loadProgress();
    if (Object.keys(local).length > 0) {
      return local;
    }
    const current = getProgressForImport?.();
    if (current && Object.keys(current).length > 0) {
      return current;
    }
    return undefined;
  }, [importOnJoin, getProgressForImport]);

  const activateSession = useCallback(
    async (session, successMessage) => {
      await hydrateSession(session);
      await refreshMembers(session.sessionId);
      await refreshMyParties();
      setShowPanel(true);
      if (successMessage) {
        setMessage(successMessage);
      }
      clearUrlJoinCode();
    },
    [hydrateSession, refreshMembers, refreshMyParties]
  );

  const createParty = useCallback(
    async (event) => {
      event?.preventDefault?.();
      if (!canUseWatchParty) {
        setError("Sign in to create a watch party.");
        return;
      }
      setSubmitting(true);
      setError("");
      setMessage("");
      try {
        const payload = await createWatchParty(apiBaseUrl, authHeaders, {
          name: partyNameInput,
          progress: resolveImportProgress(),
        });
        await activateSession(
          {
            sessionId: payload.sessionId,
            joinCode: payload.joinCode,
            name: payload.name,
          },
          `Watch party created. Share code ${payload.joinCode}.`
        );
      } catch (err) {
        setError(err.message || "Could not create watch party.");
      } finally {
        setSubmitting(false);
      }
    },
    [activateSession, apiBaseUrl, authHeaders, canUseWatchParty, partyNameInput, resolveImportProgress]
  );

  const joinParty = useCallback(
    async (event, codeOverride) => {
      event?.preventDefault?.();
      if (!canUseWatchParty) {
        setError("Sign in to join a watch party.");
        return false;
      }
      const joinCode = (codeOverride || joinCodeInput).trim().toUpperCase();
      if (!JOIN_CODE_PATTERN.test(joinCode)) {
        setError("Join code must be exactly 6 letters or numbers.");
        return false;
      }
      setSubmitting(true);
      setError("");
      setMessage("");
      try {
        const payload = await joinWatchParty(apiBaseUrl, authHeaders, {
          joinCode,
          progress: resolveImportProgress(),
        });
        await activateSession(
          {
            sessionId: payload.sessionId,
            joinCode: payload.joinCode,
            name: payload.name,
          },
          `Joined "${payload.name}".`
        );
        return true;
      } catch (err) {
        setError(err.message || "Could not join watch party.");
        return false;
      } finally {
        setSubmitting(false);
      }
    },
    [activateSession, apiBaseUrl, authHeaders, canUseWatchParty, joinCodeInput, resolveImportProgress]
  );

  const switchParty = useCallback(
    async (session) => {
      if (!session?.sessionId) {
        return;
      }
      setSubmitting(true);
      setError("");
      setMessage("");
      try {
        await activateSession(session, `Switched to "${session.name}".`);
      } catch (err) {
        setError(err.message || "Could not open watch party.");
      } finally {
        setSubmitting(false);
      }
    },
    [activateSession]
  );

  const leaveParty = useCallback(async () => {
    if (!activeSession?.sessionId || !authToken) {
      return null;
    }
    setSubmitting(true);
    setError("");
    setMessage("");
    try {
      await leaveWatchParty(apiBaseUrl, authHeaders, activeSession.sessionId);
      saveActiveCollabSession(null);
      setActiveSession(null);
      setProgressMeta({});
      setPartyMembers([]);
      await refreshMyParties();

      const response = await fetch(`${apiBaseUrl}/api/progress/me`, { headers: authHeaders });
      let personalProgress = {};
      if (response.ok) {
        const payload = await response.json();
        personalProgress = payload.progress || {};
      }
      setMessage("Left watch party. Showing your personal progress.");
      return personalProgress;
    } catch (err) {
      setError(err.message || "Could not leave watch party.");
      return null;
    } finally {
      setSubmitting(false);
    }
  }, [activeSession, apiBaseUrl, authHeaders, authToken, refreshMyParties]);

  const copyShareLink = useCallback(async () => {
    if (!activeSession?.joinCode) {
      return;
    }
    const shareUrl = buildWatchPartyShareUrl(activeSession.joinCode);
    try {
      await navigator.clipboard.writeText(shareUrl);
      setMessage("Share link copied.");
    } catch (_err) {
      setMessage(shareUrl);
    }
  }, [activeSession?.joinCode]);

  useEffect(() => {
    const urlCode = readUrlJoinCode();
    if (!urlCode || !authToken || activeSession || autoJoinAttempted.current) {
      return;
    }
    if (!JOIN_CODE_PATTERN.test(urlCode)) {
      return;
    }
    autoJoinAttempted.current = true;
    setJoinCodeInput(urlCode);
    setShowPanel(true);
    joinParty(undefined, urlCode);
  }, [authToken, activeSession, joinParty]);

  const urlJoinCode = readUrlJoinCode();
  const pendingUrlJoin = Boolean(urlJoinCode) && !authToken && JOIN_CODE_PATTERN.test(urlJoinCode);

  return {
    canUseWatchParty,
    isActive: Boolean(activeSession),
    activeSession,
    showPanel,
    setShowPanel,
    progressMeta,
    partyMembers,
    myParties,
    joinCodeInput,
    setJoinCodeInput,
    partyNameInput,
    setPartyNameInput,
    importOnJoin,
    setImportOnJoin,
    message,
    error,
    submitting,
    pendingUrlJoin,
    urlJoinCode,
    createParty,
    joinParty,
    switchParty,
    leaveParty,
    copyShareLink,
    refreshActiveProgress,
  };
};
