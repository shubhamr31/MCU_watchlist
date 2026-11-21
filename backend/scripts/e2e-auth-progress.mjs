/**
 * End-to-end check of register -> save progress -> relogin -> load progress, plus the
 * session lifecycle (logout, 3-day idle expiry, cleanup, PassKey-change revocation),
 * running the real backend against an in-memory fake of Supabase's REST API.
 * No real keys or network needed:  node scripts/e2e-auth-progress.mjs
 */
import { createHash, randomUUID } from "node:crypto";
import { createMockTables, startMockSupabase } from "./lib/mock-supabase.mjs";

const MOCK_PORT = 4210;
const API_PORT = 4211;
const tables = createMockTables();
await startMockSupabase(MOCK_PORT, tables);

// Pre-seed data for the startup cleanup check: one account with progress and sessions on
// both sides of the 3-day idle window. Seeded before the backend boots on purpose.
const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (days) => new Date(Date.now() - days * DAY_MS).toISOString();
const seedSession = (userId, lastSeenAt) => {
  const token = randomUUID().replaceAll("-", "");
  tables.custom_sessions.push({ token, user_id: userId, created_at: lastSeenAt, last_seen_at: lastSeenAt });
  return token;
};
const staleUser = { id: randomUUID(), username: "STALE1", provider: "credentials", created_at: daysAgo(30) };
tables.custom_users.push(staleUser);
tables.custom_progress.push({ user_id: staleUser.id, progress: { "item-z": "completed" }, updated_at: daysAgo(30) });
const seeded = {
  expired5d: seedSession(staleUser.id, daysAgo(5)),
  expired31h: seedSession(staleUser.id, daysAgo(3.1)),
  valid29h: seedSession(staleUser.id, daysAgo(2.9)),
  valid1d: seedSession(staleUser.id, daysAgo(1)),
};
const staleUserBeforeBoot = JSON.stringify(staleUser);
const staleProgressBeforeBoot = JSON.stringify(tables.custom_progress.find((p) => p.user_id === staleUser.id));

process.env.SUPABASE_URL = `http://localhost:${MOCK_PORT}`;
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
process.env.PORT = String(API_PORT);
await import("../src/server.js");
await new Promise((r) => setTimeout(r, 500));

const api = `http://localhost:${API_PORT}`;
const call = async (method, path, { token, body } = {}) => {
  const res = await fetch(`${api}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch (_e) { /* empty */ }
  return { status: res.status, json };
};

let failures = 0;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? `  (${extra})` : ""}`);
  if (!ok) failures += 1;
};

const progress = { "item-a": "completed", "item-b": "watching", "item-c": "bogus" };

const reg = await call("POST", "/api/auth/register", { body: { username: "ABC123", password: "123456" } });
check("register new user", reg.status === 200 && reg.json?.token, `status ${reg.status}`);

const dup = await call("POST", "/api/auth/register", { body: { username: "ABC123", password: "123456" } });
check("duplicate username rejected (409)", dup.status === 409);

const stored = tables.custom_users.find((u) => u.username === "ABC123");
check("password stored as scrypt hash", String(stored?.password_hash).startsWith("scrypt$"));

const put = await call("PUT", "/api/progress/me", { token: reg.json.token, body: { progress } });
check("save progress", put.status === 200, `status ${put.status}`);

const relogin = await call("POST", "/api/auth/login", { body: { username: "abc123", password: "123456" } });
check("relogin with same credentials (case-insensitive username)", relogin.status === 200 && relogin.json?.token);
check("relogin issues a new token", relogin.json?.token && relogin.json.token !== reg.json.token);

const loaded = await call("GET", "/api/progress/me", { token: relogin.json.token });
check("progress restored after relogin", loaded.json?.progress?.["item-a"] === "completed" && loaded.json?.progress?.["item-b"] === "watching");
check("invalid status filtered out", loaded.json?.progress && !("item-c" in loaded.json.progress));

const bad = await call("POST", "/api/auth/login", { body: { username: "ABC123", password: "654321" } });
check("wrong PassKey rejected (401)", bad.status === 401);

const noToken = await call("GET", "/api/progress/me");
check("progress requires token (401)", noToken.status === 401);

const fakeToken = await call("GET", "/api/auth/me", { token: "deadbeef" });
check("unknown token rejected (401)", fakeToken.status === 401);

const me = await call("GET", "/api/auth/me", { token: relogin.json.token });
check("/api/auth/me returns username", me.json?.username === "ABC123");

// Legacy SHA-256 account: must still log in, then be upgraded to scrypt.
const salt = "legacysalt";
tables.custom_users.push({
  id: randomUUID(), username: "OLDUSR", provider: "credentials", password_salt: salt,
  password_hash: createHash("sha256").update(`${salt}:111111`).digest("hex"),
});
const legacy = await call("POST", "/api/auth/login", { body: { username: "OLDUSR", password: "111111" } });
check("legacy SHA-256 account can still log in", legacy.status === 200);
const upgraded = tables.custom_users.find((u) => u.username === "OLDUSR");
check("legacy hash upgraded to scrypt on login", String(upgraded.password_hash).startsWith("scrypt$"));
const legacyAgain = await call("POST", "/api/auth/login", { body: { username: "OLDUSR", password: "111111" } });
check("login works again after upgrade", legacyAgain.status === 200);

// Separate user must not see another user's progress.
const reg2 = await call("POST", "/api/auth/register", { body: { username: "XYZ789", password: "222222" } });
const other = await call("GET", "/api/progress/me", { token: reg2.json.token });
check("second user starts with empty progress", Object.keys(other.json?.progress || {}).length === 0);

// ---- Session lifecycle -------------------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const meStatus = async (token) => (await call("GET", "/api/auth/me", { token })).status;
const sessionRows = (userId) => tables.custom_sessions.filter((s) => s.user_id === userId);
const rowFor = (token) => tables.custom_sessions.find((s) => s.token === token);
const progressRowOf = (userId) => JSON.stringify(tables.custom_progress.find((p) => p.user_id === userId));

// Startup cleanup: only expired custom_sessions rows go; users and progress are untouched.
check(
  "startup cleanup removes sessions idle > 3 days",
  !rowFor(seeded.expired5d) && !rowFor(seeded.expired31h)
);
check("startup cleanup keeps sessions idle <= 3 days", Boolean(rowFor(seeded.valid29h)) && Boolean(rowFor(seeded.valid1d)));
check(
  "startup cleanup leaves custom_users and custom_progress untouched",
  JSON.stringify(tables.custom_users.find((u) => u.id === staleUser.id)) === staleUserBeforeBoot &&
    progressRowOf(staleUser.id) === staleProgressBeforeBoot
);
check("seeded session idle 2.9 days is still accepted", (await meStatus(seeded.valid29h)) === 200);

// Fresh account with several concurrent sessions.
const lifeReg = await call("POST", "/api/auth/register", { body: { username: "LIFE01", password: "333333" } });
const life = tables.custom_users.find((u) => u.username === "LIFE01");
const lifeProgress = { "item-a": "completed", "item-b": "watching", "item-d": "not_started" };
await call("PUT", "/api/progress/me", { token: lifeReg.json.token, body: { progress: lifeProgress } });
const lifeProgressRow = progressRowOf(life.id);
check("register creates a session row", sessionRows(life.id).length === 1 && Boolean(rowFor(lifeReg.json.token)));

const loginB = await call("POST", "/api/auth/login", { body: { username: "LIFE01", password: "333333" } });
const loginC = await call("POST", "/api/auth/login", { body: { username: "LIFE01", password: "333333" } });
const tokenA = lifeReg.json.token;
const tokenB = loginB.json?.token;
const tokenC = loginC.json?.token;
check("login creates a session row per sign-in (3 concurrent)", sessionRows(life.id).length === 3 && new Set([tokenA, tokenB, tokenC]).size === 3);
check(
  "all concurrent sessions are valid",
  (await meStatus(tokenA)) === 200 && (await meStatus(tokenB)) === 200 && (await meStatus(tokenC)) === 200
);

// No DB write on every request: a recently used session keeps its last_seen_at.
const lastSeenBefore = rowFor(tokenB).last_seen_at;
await meStatus(tokenB);
await sleep(300);
check("recently used session is not re-written on every request", rowFor(tokenB).last_seen_at === lastSeenBefore);

// Logout removes only the session it was called with.
const logoutNoToken = await call("POST", "/api/auth/logout");
check("logout without a token is rejected (401)", logoutNoToken.status === 401);
const logoutB = await call("POST", "/api/auth/logout", { token: tokenB });
check("logout returns { ok: true }", logoutB.status === 200 && logoutB.json?.ok === true);
check("logout deletes only that session row", !rowFor(tokenB) && sessionRows(life.id).length === 2);
check("logged-out token is rejected (401)", (await meStatus(tokenB)) === 401);
check("other sessions still work after a logout", (await meStatus(tokenA)) === 200 && (await meStatus(tokenC)) === 200);
const logoutAgain = await call("POST", "/api/auth/logout", { token: tokenB });
const logoutUnknown = await call("POST", "/api/auth/logout", { token: "unknowntoken" });
check(
  "logout is idempotent for already-removed / unknown tokens (never 500)",
  logoutAgain.status === 200 && logoutUnknown.status === 200 && sessionRows(life.id).length === 2
);
const afterLogout = await call("GET", "/api/progress/me", { token: tokenA });
check(
  "progress unchanged after logout",
  progressRowOf(life.id) === lifeProgressRow && afterLogout.json?.progress?.["item-d"] === "not_started"
);

// Idle expiry (3 days, sliding window).
const otherSessionsBefore = tables.custom_sessions.filter((s) => s.user_id !== life.id).length;
rowFor(tokenC).last_seen_at = daysAgo(4);
const expired = await call("GET", "/api/auth/me", { token: tokenC });
check("session idle 4 days gets 401 Unauthorized.", expired.status === 401 && expired.json?.error === "Unauthorized.");
check("expired session row is lazily deleted", !rowFor(tokenC));
check(
  "expiry only removed that one row",
  sessionRows(life.id).length === 1 && tables.custom_sessions.filter((s) => s.user_id !== life.id).length === otherSessionsBefore
);
const expiredProgress = await call("GET", "/api/progress/me", { token: tokenC });
check("expired session cannot read progress (401)", expiredProgress.status === 401);

rowFor(tokenA).last_seen_at = daysAgo(2);
check("session idle 2 days still works", (await meStatus(tokenA)) === 200);
await sleep(300);
check("using a 2-day-idle session renews last_seen_at", Date.now() - Date.parse(rowFor(tokenA).last_seen_at) < 60 * 1000);
check(
  "progress unchanged after expiry and cleanup",
  progressRowOf(life.id) === lifeProgressRow &&
    progressRowOf(staleUser.id) === staleProgressBeforeBoot &&
    tables.custom_users.some((u) => u.id === life.id)
);

// Legacy hash -> scrypt upgrade at login must not revoke the account's other sessions.
const legacy2Salt = "legacysalt2";
const legacy2 = {
  id: randomUUID(), username: "OLDUS2", provider: "credentials", password_salt: legacy2Salt,
  password_hash: createHash("sha256").update(`${legacy2Salt}:555555`).digest("hex"),
};
tables.custom_users.push(legacy2);
const legacy2Existing = seedSession(legacy2.id, new Date().toISOString());
const legacy2Login = await call("POST", "/api/auth/login", { body: { username: "OLDUS2", password: "555555" } });
check(
  "legacy hash upgrade at login does not revoke existing sessions",
  legacy2Login.status === 200 &&
    String(tables.custom_users.find((u) => u.id === legacy2.id).password_hash).startsWith("scrypt$") &&
    (await meStatus(legacy2Existing)) === 200 &&
    sessionRows(legacy2.id).length === 2
);

// Credential changes. Two more devices are signed in next to tokenA.
const tokenD = seedSession(life.id, new Date().toISOString());
const tokenE = seedSession(life.id, new Date().toISOString());
const wrongCurrent = await call("PUT", "/api/auth/credentials", {
  token: tokenA, body: { currentPassKey: "999999", newPassKey: "444444" },
});
check(
  "wrong current PassKey rejected and revokes nothing",
  wrongCurrent.status === 401 && sessionRows(life.id).length === 3
);

const usernameOnly = await call("PUT", "/api/auth/credentials", {
  token: tokenA, body: { currentPassKey: "333333", newUsername: "LIFE02" },
});
check(
  "username-only change succeeds and reports otherSessionsRevoked: false",
  usernameOnly.status === 200 && usernameOnly.json?.username === "LIFE02" && usernameOnly.json?.otherSessionsRevoked === false
);
check(
  "username-only change revokes nothing",
  sessionRows(life.id).length === 3 && (await meStatus(tokenD)) === 200 && (await meStatus(tokenE)) === 200
);

const samePassKey = await call("PUT", "/api/auth/credentials", {
  token: tokenA, body: { currentPassKey: "333333", newPassKey: "333333" },
});
check(
  "re-entering the same PassKey is not a change (nothing revoked)",
  samePassKey.status === 200 && samePassKey.json?.otherSessionsRevoked === false && sessionRows(life.id).length === 3
);

const passKeyChange = await call("PUT", "/api/auth/credentials", {
  token: tokenA, body: { currentPassKey: "333333", newPassKey: "444444" },
});
check(
  "PassKey change succeeds and reports otherSessionsRevoked: true",
  passKeyChange.status === 200 && passKeyChange.json?.otherSessionsRevoked === true
);
check("PassKey change keeps the current session signed in", (await meStatus(tokenA)) === 200 && Boolean(rowFor(tokenA)));
check(
  "PassKey change signs out every other session of the user",
  (await meStatus(tokenD)) === 401 && (await meStatus(tokenE)) === 401 && sessionRows(life.id).length === 1
);
check(
  "PassKey change does not touch other accounts' sessions",
  (await meStatus(seeded.valid1d)) === 200 && (await meStatus(legacy2Existing)) === 200
);
const newLogin = await call("POST", "/api/auth/login", { body: { username: "LIFE02", password: "444444" } });
const oldLogin = await call("POST", "/api/auth/login", { body: { username: "LIFE02", password: "333333" } });
check("new PassKey logs in, old PassKey is rejected", newLogin.status === 200 && oldLogin.status === 401);
const afterChange = await call("GET", "/api/progress/me", { token: tokenA });
check(
  "progress unchanged after credential changes",
  progressRowOf(life.id) === lifeProgressRow && afterChange.json?.progress?.["item-a"] === "completed"
);

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
