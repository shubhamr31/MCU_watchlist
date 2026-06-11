import express from "express";
import cors from "cors";
import { createHash, randomBytes } from "crypto";
import { OAuth2Client } from "google-auth-library";
import { createClient } from "@supabase/supabase-js";
import { PROGRESS_SCHEMA, V2_COLLAB_SHAPES } from "../../shared/contracts.js";

const app = express();
const PORT = process.env.PORT || 4000;
const USERNAME_PATTERN = /^[a-zA-Z0-9]{6}$/;
const PASSKEY_PATTERN = /^\d{6}$/;
const ADMIN_USERNAMES = new Set(["loki69"]);
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
    : null;

const hashPassword = (password, salt) =>
  createHash("sha256")
    .update(`${salt}:${password}`)
    .digest("hex");

const safeUsername = (value) => String(value || "").trim().toUpperCase();
const safePassword = (value) => String(value || "");
const isAdminUsername = (username) => ADMIN_USERNAMES.has(String(username || "").toLowerCase());
const hasCredentialPassword = (user) => Boolean(user?.password_salt && user?.password_hash);

const parseBearerToken = (authHeader) => {
  if (!authHeader) {
    return "";
  }
  const [scheme, token] = authHeader.split(" ");
  if (scheme?.toLowerCase() !== "bearer") {
    return "";
  }
  return token || "";
};

const sanitizeProgress = (progress) => {
  if (!progress || typeof progress !== "object") {
    return {};
  }
  const allowed = new Set(PROGRESS_SCHEMA.statuses);
  const output = {};
  Object.entries(progress).forEach(([itemId, status]) => {
    if (typeof itemId !== "string" || !allowed.has(status)) {
      return;
    }
    output[itemId] = status;
  });
  return output;
};

const JOIN_CODE_PATTERN = /^[A-Z0-9]{6}$/;

const generateJoinCode = () => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
};

const generateUniqueJoinCode = async () => {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const joinCode = generateJoinCode();
    const { data, error } = await supabase
      .from("collab_sessions")
      .select("id")
      .eq("join_code", joinCode)
      .maybeSingle();
    if (error) {
      throw error;
    }
    if (!data) {
      return joinCode;
    }
  }
};

const readCollabSession = async (sessionId) => {
  const { data, error } = await supabase
    .from("collab_sessions")
    .select("id,name,join_code,created_by,created_at,updated_at")
    .eq("id", sessionId)
    .maybeSingle();
  if (error) {
    throw error;
  }
  return data;
};

const readCollabSessionByJoinCode = async (joinCode) => {
  const { data, error } = await supabase
    .from("collab_sessions")
    .select("id,name,join_code,created_by,created_at,updated_at")
    .eq("join_code", joinCode)
    .maybeSingle();
  if (error) {
    throw error;
  }
  return data;
};

const isCollabMember = async (sessionId, userId) => {
  const { data, error } = await supabase
    .from("collab_members")
    .select("session_id")
    .eq("session_id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    throw error;
  }
  return Boolean(data);
};

const addCollabMember = async (sessionId, userId) => {
  const { error } = await supabase.from("collab_members").upsert(
    {
      session_id: sessionId,
      user_id: userId,
      joined_at: new Date().toISOString(),
    },
    { onConflict: "session_id,user_id" }
  );
  if (error) {
    throw error;
  }
};

const bulkUpsertCollabProgress = async (sessionId, progress, userId) => {
  const sanitized = sanitizeProgress(progress);
  const entries = Object.entries(sanitized);
  if (entries.length === 0) {
    return;
  }
  const now = new Date().toISOString();
  const rows = entries.map(([itemId, status]) => ({
    session_id: sessionId,
    item_id: itemId,
    status,
    updated_at: now,
    updated_by: userId,
  }));
  const { error } = await supabase.from("collab_item_progress").upsert(rows, {
    onConflict: "session_id,item_id",
  });
  if (error) {
    throw error;
  }
  await supabase.from("collab_sessions").update({ updated_at: now }).eq("id", sessionId);
};

const readCollabProgress = async (sessionId) => {
  const { data, error } = await supabase
    .from("collab_item_progress")
    .select("item_id,status,updated_at,updated_by,custom_users(username)")
    .eq("session_id", sessionId);
  if (error) {
    throw error;
  }
  const progress = {};
  const meta = {};
  (data || []).forEach((row) => {
    progress[row.item_id] = row.status;
    meta[row.item_id] = {
      updatedAt: row.updated_at,
      updatedBy: row.custom_users?.username || null,
    };
  });
  return { progress, meta };
};

const requireCollabMember = async (req, res, next) => {
  try {
    const sessionId = String(req.params.id || "");
    if (!sessionId) {
      return res.status(400).json({ error: "Session id is required." });
    }
    const session = await readCollabSession(sessionId);
    if (!session) {
      return res.status(404).json({ error: "Watch party not found." });
    }
    const member = await isCollabMember(sessionId, req.auth.userId);
    if (!member) {
      return res.status(403).json({ error: "You are not a member of this watch party." });
    }
    req.collabSession = session;
    return next();
  } catch (_error) {
    return res.status(500).json({ error: "Unable to verify watch party membership." });
  }
};

const ensureSupabaseConfigured = () => {
  if (!supabase) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }
};

const findUserByUsername = async (username) => {
  const { data, error } = await supabase
    .from("custom_users")
    .select("*")
    .eq("username", username)
    .maybeSingle();
  if (error) {
    throw error;
  }
  return data;
};

const createSession = async (userId) => {
  const token = randomBytes(32).toString("hex");
  const { error } = await supabase.from("custom_sessions").insert({
    token,
    user_id: userId,
    last_seen_at: new Date().toISOString(),
  });
  if (error) {
    throw error;
  }
  return token;
};

const readSessionUser = async (token) => {
  const { data, error } = await supabase
    .from("custom_sessions")
    .select("token,user_id,custom_users(id,username,provider)")
    .eq("token", token)
    .maybeSingle();
  if (error) {
    throw error;
  }
  if (!data?.custom_users) {
    return null;
  }
  return {
    token: data.token,
    userId: data.user_id,
    user: data.custom_users,
  };
};

const touchSession = async (token) => {
  await supabase
    .from("custom_sessions")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("token", token);
};

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "mcu-watchlist-backend" });
});

app.get("/api/schema", (_req, res) => {
  res.json({
    progressSchema: PROGRESS_SCHEMA,
    futureCollaborationShapes: V2_COLLAB_SHAPES,
  });
});

app.post("/api/auth/register", async (req, res) => {
  try {
    const username = safeUsername(req.body?.username);
    const password = safePassword(req.body?.password);
    if (!USERNAME_PATTERN.test(username)) {
      return res.status(400).json({
        error: "Username must be exactly 6 alphanumeric characters.",
      });
    }
    if (!PASSKEY_PATTERN.test(password)) {
      return res.status(400).json({ error: "PassKey must be exactly 6 digits." });
    }
    const existing = await findUserByUsername(username);
    if (existing) {
      return res.status(409).json({ error: "Username is already taken." });
    }

    const salt = randomBytes(16).toString("hex");
    const passwordHash = hashPassword(password, salt);
    const { data: createdUser, error: createError } = await supabase
      .from("custom_users")
      .insert({
        username,
        password_salt: salt,
        password_hash: passwordHash,
        provider: "credentials",
      })
      .select("id,username")
      .single();
    if (createError) {
      throw createError;
    }

    const { error: progressError } = await supabase.from("custom_progress").upsert(
      {
        user_id: createdUser.id,
        progress: {},
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
    if (progressError) {
      throw progressError;
    }

    const token = await createSession(createdUser.id);
    return res.json({ token, username: createdUser.username });
  } catch (_error) {
    return res.status(500).json({ error: "Could not create account right now." });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const username = safeUsername(req.body?.username);
    const password = safePassword(req.body?.password);
    if (!USERNAME_PATTERN.test(username) || !PASSKEY_PATTERN.test(password)) {
      return res.status(401).json({ error: "Invalid username or PassKey." });
    }
    const user = await findUserByUsername(username);
    if (!user || !hasCredentialPassword(user)) {
      return res.status(401).json({ error: "Invalid username or PassKey." });
    }
    const incomingHash = hashPassword(password, user.password_salt);
    if (incomingHash !== user.password_hash) {
      return res.status(401).json({ error: "Invalid username or PassKey." });
    }
    const token = await createSession(user.id);
    return res.json({ token, username: user.username });
  } catch (_error) {
    return res.status(500).json({ error: "Could not sign in right now." });
  }
});

app.post("/api/auth/google", async (req, res) => {
  if (!googleClient || !GOOGLE_CLIENT_ID) {
    return res.status(503).json({ error: "Google auth is not configured on server." });
  }
  const idToken = String(req.body?.idToken || "");
  if (!idToken) {
    return res.status(400).json({ error: "idToken is required." });
  }

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const googleSub = String(payload?.sub || "");
    const email = String(payload?.email || "");
    const emailVerified = Boolean(payload?.email_verified);
    const displayName = String(payload?.name || email.split("@")[0] || "").trim();
    if (!googleSub || !email || !emailVerified) {
      return res.status(401).json({ error: "Invalid Google identity." });
    }

    const { data: existingBySub, error: bySubError } = await supabase
      .from("custom_users")
      .select("*")
      .eq("google_sub", googleSub)
      .maybeSingle();
    if (bySubError) {
      throw bySubError;
    }

    let user = existingBySub;
    if (!user) {
      const baseUsername = displayName.replace(/[^a-zA-Z0-9]/g, "").slice(0, 18) || "Avenger";
      let username = baseUsername;
      let suffix = 1;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data: conflict, error: conflictError } = await supabase
          .from("custom_users")
          .select("id")
          .eq("username", username)
          .maybeSingle();
        if (conflictError) {
          throw conflictError;
        }
        if (!conflict) {
          break;
        }
        suffix += 1;
        username = `${baseUsername}${suffix}`;
      }
      const { data: insertedUser, error: insertError } = await supabase
        .from("custom_users")
        .insert({
          username,
          google_sub: googleSub,
          email,
          provider: "google",
        })
        .select("*")
        .single();
      if (insertError) {
        throw insertError;
      }
      user = insertedUser;
      const { error: progressError } = await supabase.from("custom_progress").upsert(
        {
          user_id: user.id,
          progress: {},
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );
      if (progressError) {
        throw progressError;
      }
    } else if (user.email !== email) {
      const { error: updateError } = await supabase.from("custom_users").update({ email }).eq("id", user.id);
      if (updateError) {
        throw updateError;
      }
    }

    const token = await createSession(user.id);
    return res.json({ token, username: user.username });
  } catch (_error) {
    return res.status(401).json({ error: "Google token verification failed." });
  }
});

const requireAuth = async (req, res, next) => {
  try {
    const token = parseBearerToken(req.headers.authorization);
    if (!token) {
      return res.status(401).json({ error: "Unauthorized." });
    }
    const session = await readSessionUser(token);
    if (!session) {
      return res.status(401).json({ error: "Unauthorized." });
    }
    touchSession(token);
    req.auth = {
      token,
      userId: session.userId,
      username: session.user.username,
      provider: session.user.provider || "credentials",
    };
    return next();
  } catch (_error) {
    return res.status(401).json({ error: "Unauthorized." });
  }
};

const requireAdmin = (req, res, next) => {
  if (!isAdminUsername(req.auth?.username)) {
    return res.status(403).json({ error: "Admin access required." });
  }
  return next();
};

app.get("/api/auth/me", requireAuth, (req, res) => {
  res.json({ username: req.auth.username, isAdmin: isAdminUsername(req.auth.username) });
});

app.get("/api/progress/me", requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("custom_progress")
      .select("progress")
      .eq("user_id", req.auth.userId)
      .maybeSingle();
    if (error) {
      throw error;
    }
    res.json({ progress: data?.progress || {} });
  } catch (_error) {
    res.status(500).json({ error: "Unable to load progress." });
  }
});

app.put("/api/progress/me", requireAuth, async (req, res) => {
  try {
    const incomingProgress = sanitizeProgress(req.body?.progress);
    const { error } = await supabase.from("custom_progress").upsert(
      {
        user_id: req.auth.userId,
        progress: incomingProgress,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
    if (error) {
      throw error;
    }
    res.json({ ok: true, updatedAt: new Date().toISOString() });
  } catch (_error) {
    res.status(500).json({ error: "Unable to save progress." });
  }
});

app.put("/api/auth/credentials", requireAuth, async (req, res) => {
  try {
    const currentPassKey = safePassword(req.body?.currentPassKey);
    const newUsernameInput = safeUsername(req.body?.newUsername);
    const newPassKeyInput = safePassword(req.body?.newPassKey);
    const { data: user, error: userError } = await supabase
      .from("custom_users")
      .select("*")
      .eq("id", req.auth.userId)
      .maybeSingle();
    if (userError) {
      throw userError;
    }
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }
    if (!hasCredentialPassword(user)) {
      return res.status(400).json({ error: "Credential changes are only available for username/PassKey accounts." });
    }

    const incomingHash = hashPassword(currentPassKey, user.password_salt);
    if (incomingHash !== user.password_hash) {
      return res.status(401).json({ error: "Current PassKey is incorrect." });
    }

    const hasNewUsername = newUsernameInput.length > 0;
    const hasNewPassKey = newPassKeyInput.length > 0;
    if (!hasNewUsername && !hasNewPassKey) {
      return res.status(400).json({ error: "Provide a new username, a new PassKey, or both." });
    }

    const updates = {};
    if (hasNewUsername) {
      if (!USERNAME_PATTERN.test(newUsernameInput)) {
        return res.status(400).json({ error: "New username must be exactly 6 alphanumeric characters." });
      }
      const existing = await findUserByUsername(newUsernameInput);
      if (existing && existing.id !== user.id) {
        return res.status(409).json({ error: "Username is already taken." });
      }
      updates.username = newUsernameInput;
    }
    if (hasNewPassKey) {
      if (!PASSKEY_PATTERN.test(newPassKeyInput)) {
        return res.status(400).json({ error: "New PassKey must be exactly 6 digits." });
      }
      const nextSalt = randomBytes(16).toString("hex");
      updates.password_salt = nextSalt;
      updates.password_hash = hashPassword(newPassKeyInput, nextSalt);
    }

    const { data: updatedUser, error: updateError } = await supabase
      .from("custom_users")
      .update(updates)
      .eq("id", user.id)
      .select("username")
      .single();
    if (updateError) {
      throw updateError;
    }
    return res.json({ ok: true, username: updatedUser.username });
  } catch (_error) {
    return res.status(500).json({ error: "Could not update credentials right now." });
  }
});

app.get("/api/leaderboard", async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from("custom_progress")
      .select("progress,custom_users!inner(username)");
    if (error) {
      throw error;
    }
    const rows = (data || []).map((entry) => {
      const values = Object.values(entry.progress || {});
      const completed = values.filter((status) => status === "completed").length;
      const watching = values.filter((status) => status === "watching").length;
      return {
        username: entry.custom_users.username,
        completed,
        watching,
        score: completed * 100 + watching * 10,
      };
    });
    rows.sort((a, b) => b.score - a.score || b.completed - a.completed || a.username.localeCompare(b.username));
    res.json({ leaderboard: rows.slice(0, 25) });
  } catch (_error) {
    res.status(500).json({ leaderboard: [] });
  }
});

app.get("/api/admin/users", requireAuth, requireAdmin, async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from("custom_users")
      .select("username,provider,created_at")
      .order("username", { ascending: true });
    if (error) {
      throw error;
    }
    const users = (data || []).map((user) => ({
      username: user.username,
      createdAt: user.created_at || null,
      provider: user.provider || "credentials",
      isAdmin: isAdminUsername(user.username),
    }));
    res.json({ users });
  } catch (_error) {
    res.status(500).json({ error: "Could not load admin users." });
  }
});

app.post("/api/admin/users", requireAuth, requireAdmin, async (req, res) => {
  try {
    const username = safeUsername(req.body?.username);
    const passKey = safePassword(req.body?.passKey);
    if (!USERNAME_PATTERN.test(username)) {
      return res.status(400).json({ error: "Username must be exactly 6 alphanumeric characters." });
    }
    if (!PASSKEY_PATTERN.test(passKey)) {
      return res.status(400).json({ error: "PassKey must be exactly 6 digits." });
    }
    const existing = await findUserByUsername(username);
    if (existing) {
      return res.status(409).json({ error: "Username is already taken." });
    }

    const salt = randomBytes(16).toString("hex");
    const passwordHash = hashPassword(passKey, salt);
    const { data: createdUser, error: createError } = await supabase
      .from("custom_users")
      .insert({
        username,
        password_salt: salt,
        password_hash: passwordHash,
        provider: "credentials",
      })
      .select("id,username")
      .single();
    if (createError) {
      throw createError;
    }

    const { error: progressError } = await supabase.from("custom_progress").upsert(
      {
        user_id: createdUser.id,
        progress: {},
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
    if (progressError) {
      throw progressError;
    }
    return res.json({ ok: true, username: createdUser.username });
  } catch (_error) {
    return res.status(500).json({ error: "Could not create user." });
  }
});

app.post("/api/session", requireAuth, async (req, res) => {
  try {
    const name = String(req.body?.name || "MCU Watch Party").trim().slice(0, 80) || "MCU Watch Party";
    const joinCode = await generateUniqueJoinCode();
    const { data: session, error } = await supabase
      .from("collab_sessions")
      .insert({
        name,
        join_code: joinCode,
        created_by: req.auth.userId,
      })
      .select("id,name,join_code,created_at")
      .single();
    if (error) {
      throw error;
    }
    await addCollabMember(session.id, req.auth.userId);
    const importProgress = sanitizeProgress(req.body?.progress);
    if (Object.keys(importProgress).length > 0) {
      await bulkUpsertCollabProgress(session.id, importProgress, req.auth.userId);
    }
    return res.json({
      sessionId: session.id,
      joinCode: session.join_code,
      name: session.name,
      createdAt: session.created_at,
    });
  } catch (_error) {
    return res.status(500).json({ error: "Could not create watch party." });
  }
});

app.get("/api/session/mine", requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("collab_members")
      .select("joined_at,collab_sessions(id,name,join_code,created_at,updated_at)")
      .eq("user_id", req.auth.userId)
      .order("joined_at", { ascending: false });
    if (error) {
      throw error;
    }
    const sessions = (data || [])
      .map((entry) => entry.collab_sessions)
      .filter(Boolean)
      .map((session) => ({
        sessionId: session.id,
        joinCode: session.join_code,
        name: session.name,
        createdAt: session.created_at,
        updatedAt: session.updated_at,
      }));
    return res.json({ sessions });
  } catch (_error) {
    return res.status(500).json({ error: "Could not load watch parties." });
  }
});

app.post("/api/session/join", requireAuth, async (req, res) => {
  try {
    const joinCode = String(req.body?.joinCode || "").trim().toUpperCase();
    if (!JOIN_CODE_PATTERN.test(joinCode)) {
      return res.status(400).json({ error: "Join code must be exactly 6 letters or numbers." });
    }
    const session = await readCollabSessionByJoinCode(joinCode);
    if (!session) {
      return res.status(404).json({ error: "Watch party not found. Check the join code." });
    }
    await addCollabMember(session.id, req.auth.userId);
    const importProgress = sanitizeProgress(req.body?.progress);
    if (Object.keys(importProgress).length > 0) {
      await bulkUpsertCollabProgress(session.id, importProgress, req.auth.userId);
    }
    return res.json({
      sessionId: session.id,
      joinCode: session.join_code,
      name: session.name,
      createdAt: session.created_at,
    });
  } catch (_error) {
    return res.status(500).json({ error: "Could not join watch party." });
  }
});

app.post("/api/session/:id/join", requireAuth, async (req, res) => {
  try {
    const sessionId = String(req.params.id || "");
    const joinCode = String(req.body?.joinCode || "").trim().toUpperCase();
    if (!JOIN_CODE_PATTERN.test(joinCode)) {
      return res.status(400).json({ error: "Join code must be exactly 6 letters or numbers." });
    }
    const session = await readCollabSession(sessionId);
    if (!session) {
      return res.status(404).json({ error: "Watch party not found." });
    }
    if (session.join_code !== joinCode) {
      return res.status(403).json({ error: "Join code does not match this watch party." });
    }
    await addCollabMember(session.id, req.auth.userId);
    const importProgress = sanitizeProgress(req.body?.progress);
    if (Object.keys(importProgress).length > 0) {
      await bulkUpsertCollabProgress(session.id, importProgress, req.auth.userId);
    }
    return res.json({
      sessionId: session.id,
      joinCode: session.join_code,
      name: session.name,
      createdAt: session.created_at,
    });
  } catch (_error) {
    return res.status(500).json({ error: "Could not join watch party." });
  }
});

app.get("/api/session/:id/progress", requireAuth, requireCollabMember, async (req, res) => {
  try {
    const payload = await readCollabProgress(req.collabSession.id);
    return res.json({
      sessionId: req.collabSession.id,
      name: req.collabSession.name,
      joinCode: req.collabSession.join_code,
      ...payload,
    });
  } catch (_error) {
    return res.status(500).json({ error: "Unable to load watch party progress." });
  }
});

app.put("/api/session/:id/progress", requireAuth, requireCollabMember, async (req, res) => {
  try {
    const sessionId = req.collabSession.id;
    const incomingProgress = sanitizeProgress(req.body?.progress);
    const { error: deleteError } = await supabase
      .from("collab_item_progress")
      .delete()
      .eq("session_id", sessionId);
    if (deleteError) {
      throw deleteError;
    }
    await bulkUpsertCollabProgress(sessionId, incomingProgress, req.auth.userId);
    return res.json({ ok: true, updatedAt: new Date().toISOString() });
  } catch (_error) {
    return res.status(500).json({ error: "Unable to save watch party progress." });
  }
});

app.patch("/api/session/:id/progress/:itemId", requireAuth, requireCollabMember, async (req, res) => {
  try {
    const itemId = String(req.params.itemId || "");
    const status = String(req.body?.status || "");
    const allowed = new Set(PROGRESS_SCHEMA.statuses);
    if (!itemId || !allowed.has(status)) {
      return res.status(400).json({ error: "Valid itemId and status are required." });
    }
    const now = new Date().toISOString();
    const { error } = await supabase.from("collab_item_progress").upsert(
      {
        session_id: req.collabSession.id,
        item_id: itemId,
        status,
        updated_at: now,
        updated_by: req.auth.userId,
      },
      { onConflict: "session_id,item_id" }
    );
    if (error) {
      throw error;
    }
    await supabase.from("collab_sessions").update({ updated_at: now }).eq("id", req.collabSession.id);
    return res.json({
      ok: true,
      itemId,
      status,
      updatedAt: now,
      updatedBy: req.auth.username,
    });
  } catch (_error) {
    return res.status(500).json({ error: "Unable to update watch party item." });
  }
});

app.get("/api/session/:id/members", requireAuth, requireCollabMember, async (req, res) => {
  try {
    const sessionId = req.collabSession.id;
    const { data: members, error: membersError } = await supabase
      .from("collab_members")
      .select("joined_at,custom_users(id,username)")
      .eq("session_id", sessionId)
      .order("joined_at", { ascending: true });
    if (membersError) {
      throw membersError;
    }
    const { data: progressRows, error: progressError } = await supabase
      .from("collab_item_progress")
      .select("updated_by,status")
      .eq("session_id", sessionId);
    if (progressError) {
      throw progressError;
    }
    const contributionCounts = {};
    const completedCounts = {};
    (progressRows || []).forEach((row) => {
      if (!row.updated_by) {
        return;
      }
      contributionCounts[row.updated_by] = (contributionCounts[row.updated_by] || 0) + 1;
      if (row.status === "completed") {
        completedCounts[row.updated_by] = (completedCounts[row.updated_by] || 0) + 1;
      }
    });
    const memberList = (members || [])
      .map((entry) => {
        const userId = entry.custom_users?.id;
        const username = entry.custom_users?.username;
        if (!userId || !username) {
          return null;
        }
        return {
          username,
          joinedAt: entry.joined_at,
          updates: contributionCounts[userId] || 0,
          completedMarked: completedCounts[userId] || 0,
        };
      })
      .filter(Boolean)
      .sort(
        (a, b) =>
          b.completedMarked - a.completedMarked ||
          b.updates - a.updates ||
          a.username.localeCompare(b.username)
      );
    return res.json({ members: memberList });
  } catch (_error) {
    return res.status(500).json({ error: "Could not load watch party members." });
  }
});

app.post("/api/session/:id/leave", requireAuth, async (req, res) => {
  try {
    const sessionId = String(req.params.id || "");
    const { error } = await supabase
      .from("collab_members")
      .delete()
      .eq("session_id", sessionId)
      .eq("user_id", req.auth.userId);
    if (error) {
      throw error;
    }
    return res.json({ ok: true });
  } catch (_error) {
    return res.status(500).json({ error: "Could not leave watch party." });
  }
});

app.get("/api/poster", async (req, res) => {
  const apiKey = process.env.OMDB_API_KEY;
  const title = String(req.query.title || "").trim();
  const type = String(req.query.type || "").trim();
  if (!title) {
    return res.status(400).json({ error: "title query param is required" });
  }
  if (!apiKey) {
    return res.status(503).json({ error: "OMDB_API_KEY is not configured" });
  }

  try {
    const params = new URLSearchParams({
      apikey: apiKey,
      t: title,
      plot: "short",
      r: "json",
    });
    if (type === "film") {
      params.set("type", "movie");
    } else if (type === "show") {
      params.set("type", "series");
    }

    const url = `https://www.omdbapi.com/?${params.toString()}`;
    const response = await fetch(url);
    if (!response.ok) {
      return res.status(502).json({ error: "Poster provider request failed" });
    }
    const data = await response.json();
    if (data.Response === "False") {
      return res.status(404).json({ error: data.Error || "Poster not found" });
    }

    return res.json({
      title: data.Title || title,
      imdbId: data.imdbID || null,
      posterUrl: data.Poster && data.Poster !== "N/A" ? data.Poster : null,
      type: data.Type || null,
      year: data.Year || null,
    });
  } catch (_error) {
    return res.status(500).json({ error: "Unexpected poster lookup error" });
  }
});

try {
  ensureSupabaseConfigured();
  app.listen(PORT, () => {
    console.log(`MCU backend listening on http://localhost:${PORT}`);
  });
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

