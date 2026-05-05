import express from "express";
import cors from "cors";
import { createHash, randomBytes } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { OAuth2Client } from "google-auth-library";
import { PROGRESS_SCHEMA, V2_COLLAB_SHAPES } from "../../shared/contracts.js";

const app = express();
const PORT = process.env.PORT || 4000;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "../data");
const STORE_FILE = process.env.STORE_FILE || path.join(DATA_DIR, "store.json");
const USERNAME_PATTERN = /^[a-zA-Z0-9]{6}$/;
const PASSKEY_PATTERN = /^\d{6}$/;
const ADMIN_USERNAMES = new Set(["loki69"]);
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;

const DEFAULT_STORE = {
  users: [],
  sessions: {},
  progressByUser: {},
};

let store = { ...DEFAULT_STORE };

const hashPassword = (password, salt) =>
  createHash("sha256")
    .update(`${salt}:${password}`)
    .digest("hex");

const safeUsername = (value) => String(value || "").trim();
const safePassword = (value) => String(value || "");
const isAdminUsername = (username) => ADMIN_USERNAMES.has(String(username || "").toLowerCase());
const hasCredentialPassword = (user) => Boolean(user?.salt && user?.passwordHash);

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

const saveStore = async () => {
  await mkdir(path.dirname(STORE_FILE), { recursive: true });
  await writeFile(STORE_FILE, JSON.stringify(store, null, 2), "utf8");
};

const loadStore = async () => {
  try {
    const raw = await readFile(STORE_FILE, "utf8");
    const parsed = JSON.parse(raw);
    store = {
      users: Array.isArray(parsed.users) ? parsed.users : [],
      sessions: parsed.sessions && typeof parsed.sessions === "object" ? parsed.sessions : {},
      progressByUser:
        parsed.progressByUser && typeof parsed.progressByUser === "object" ? parsed.progressByUser : {},
    };
  } catch (_error) {
    store = { ...DEFAULT_STORE };
    await saveStore();
  }
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
  if (store.users.some((user) => user.username.toLowerCase() === username.toLowerCase())) {
    return res.status(409).json({ error: "Username is already taken." });
  }

  const salt = randomBytes(16).toString("hex");
  const passwordHash = hashPassword(password, salt);
  store.users.push({
    username,
    salt,
    passwordHash,
    createdAt: new Date().toISOString(),
  });
  store.progressByUser[username] = {};

  const token = randomBytes(32).toString("hex");
  store.sessions[token] = username;
  await saveStore();

  return res.json({ token, username });
});

app.post("/api/auth/login", async (req, res) => {
  const username = safeUsername(req.body?.username);
  const password = safePassword(req.body?.password);
  if (!USERNAME_PATTERN.test(username) || !PASSKEY_PATTERN.test(password)) {
    return res.status(401).json({ error: "Invalid username or PassKey." });
  }
  const user = store.users.find((entry) => entry.username.toLowerCase() === username.toLowerCase());
  if (!user) {
    return res.status(401).json({ error: "Invalid username or PassKey." });
  }
  const incomingHash = hashPassword(password, user.salt);
  if (incomingHash !== user.passwordHash) {
    return res.status(401).json({ error: "Invalid username or PassKey." });
  }
  const token = randomBytes(32).toString("hex");
  store.sessions[token] = user.username;
  await saveStore();
  return res.json({ token, username: user.username });
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

    let user = store.users.find((entry) => entry.googleSub === googleSub);
    if (!user) {
      const baseUsername = displayName.replace(/[^a-zA-Z0-9]/g, "").slice(0, 18) || "Avenger";
      let username = baseUsername;
      let suffix = 1;
      while (store.users.some((entry) => entry.username.toLowerCase() === username.toLowerCase())) {
        suffix += 1;
        username = `${baseUsername}${suffix}`;
      }
      user = {
        username,
        googleSub,
        email,
        provider: "google",
        createdAt: new Date().toISOString(),
      };
      store.users.push(user);
      store.progressByUser[username] = {};
    } else if (user.email !== email) {
      user.email = email;
    }

    const token = randomBytes(32).toString("hex");
    store.sessions[token] = user.username;
    await saveStore();

    return res.json({ token, username: user.username });
  } catch (_error) {
    return res.status(401).json({ error: "Google token verification failed." });
  }
});

const requireAuth = (req, res, next) => {
  const token = parseBearerToken(req.headers.authorization);
  const username = store.sessions[token];
  if (!username) {
    return res.status(401).json({ error: "Unauthorized." });
  }
  req.auth = { username, token };
  return next();
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

app.get("/api/progress/me", requireAuth, (req, res) => {
  const progress = store.progressByUser[req.auth.username] || {};
  res.json({ progress });
});

app.put("/api/progress/me", requireAuth, async (req, res) => {
  const incomingProgress = sanitizeProgress(req.body?.progress);
  store.progressByUser[req.auth.username] = incomingProgress;
  await saveStore();
  res.json({ ok: true, updatedAt: new Date().toISOString() });
});

app.put("/api/auth/credentials", requireAuth, async (req, res) => {
  const currentPassKey = safePassword(req.body?.currentPassKey);
  const newUsernameInput = safeUsername(req.body?.newUsername);
  const newPassKeyInput = safePassword(req.body?.newPassKey);
  const username = req.auth.username;
  const user = store.users.find((entry) => entry.username.toLowerCase() === username.toLowerCase());
  if (!user) {
    return res.status(404).json({ error: "User not found." });
  }
  if (!hasCredentialPassword(user)) {
    return res.status(400).json({ error: "Credential changes are only available for username/PassKey accounts." });
  }
  const incomingHash = hashPassword(currentPassKey, user.salt);
  if (incomingHash !== user.passwordHash) {
    return res.status(401).json({ error: "Current PassKey is incorrect." });
  }

  const hasNewUsername = newUsernameInput.length > 0;
  const hasNewPassKey = newPassKeyInput.length > 0;
  if (!hasNewUsername && !hasNewPassKey) {
    return res.status(400).json({ error: "Provide a new username, a new PassKey, or both." });
  }

  if (hasNewUsername) {
    if (!USERNAME_PATTERN.test(newUsernameInput)) {
      return res.status(400).json({ error: "New username must be exactly 6 alphanumeric characters." });
    }
    const usernameTaken = store.users.some(
      (entry) => entry.username.toLowerCase() === newUsernameInput.toLowerCase() && entry !== user
    );
    if (usernameTaken) {
      return res.status(409).json({ error: "Username is already taken." });
    }
  }

  if (hasNewPassKey && !PASSKEY_PATTERN.test(newPassKeyInput)) {
    return res.status(400).json({ error: "New PassKey must be exactly 6 digits." });
  }

  const nextUsername = hasNewUsername ? newUsernameInput : user.username;
  if (hasNewUsername && nextUsername !== user.username) {
    const existingProgress = store.progressByUser[user.username] || {};
    store.progressByUser[nextUsername] = existingProgress;
    delete store.progressByUser[user.username];
    user.username = nextUsername;
    Object.keys(store.sessions).forEach((token) => {
      if (store.sessions[token] === username) {
        store.sessions[token] = nextUsername;
      }
    });
  }

  if (hasNewPassKey) {
    const nextSalt = randomBytes(16).toString("hex");
    user.salt = nextSalt;
    user.passwordHash = hashPassword(newPassKeyInput, nextSalt);
  }

  await saveStore();
  return res.json({ ok: true, username: nextUsername });
});

app.get("/api/leaderboard", (_req, res) => {
  const rows = Object.entries(store.progressByUser).map(([username, progress]) => {
    const values = Object.values(progress || {});
    const completed = values.filter((status) => status === "completed").length;
    const watching = values.filter((status) => status === "watching").length;
    return {
      username,
      completed,
      watching,
      score: completed * 100 + watching * 10,
    };
  });
  rows.sort((a, b) => b.score - a.score || b.completed - a.completed || a.username.localeCompare(b.username));
  res.json({ leaderboard: rows.slice(0, 25) });
});

app.get("/api/admin/users", requireAuth, requireAdmin, (_req, res) => {
  const users = store.users
    .map((user) => ({
      username: user.username,
      createdAt: user.createdAt || null,
      provider: user.provider || "credentials",
      isAdmin: isAdminUsername(user.username),
    }))
    .sort((a, b) => a.username.localeCompare(b.username));
  res.json({ users });
});

app.post("/api/admin/users", requireAuth, requireAdmin, async (req, res) => {
  const username = safeUsername(req.body?.username);
  const passKey = safePassword(req.body?.passKey);
  if (!USERNAME_PATTERN.test(username)) {
    return res.status(400).json({ error: "Username must be exactly 6 alphanumeric characters." });
  }
  if (!PASSKEY_PATTERN.test(passKey)) {
    return res.status(400).json({ error: "PassKey must be exactly 6 digits." });
  }
  if (store.users.some((user) => user.username.toLowerCase() === username.toLowerCase())) {
    return res.status(409).json({ error: "Username is already taken." });
  }

  const salt = randomBytes(16).toString("hex");
  const passwordHash = hashPassword(passKey, salt);
  store.users.push({
    username,
    salt,
    passwordHash,
    createdAt: new Date().toISOString(),
  });
  store.progressByUser[username] = {};
  await saveStore();
  return res.json({ ok: true, username });
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

loadStore().then(() => {
  app.listen(PORT, () => {
    console.log(`MCU backend listening on http://localhost:${PORT}`);
  });
});

