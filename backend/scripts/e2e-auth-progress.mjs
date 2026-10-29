/**
 * End-to-end check of register -> save progress -> relogin -> load progress,
 * running the real backend against an in-memory fake of Supabase's REST API.
 * No real keys or network needed:  node scripts/e2e-auth-progress.mjs
 */
import http from "node:http";
import { createHash, randomUUID } from "node:crypto";

const MOCK_PORT = 4210;
const API_PORT = 4211;
const tables = { custom_users: [], custom_sessions: [], custom_progress: [] };

const parseFilters = (params) => {
  const filters = [];
  params.forEach((value, key) => {
    if (["select", "order", "limit", "on_conflict"].includes(key)) return;
    if (value.startsWith("eq.")) filters.push([key, value.slice(3)]);
  });
  return filters;
};
const matches = (row, filters) => filters.every(([k, v]) => String(row[k]) === v);
const withEmbeds = (table, row) => {
  if (table === "custom_sessions") {
    const user = tables.custom_users.find((u) => u.id === row.user_id);
    return { ...row, custom_users: user ? { id: user.id, username: user.username, provider: user.provider } : null };
  }
  return row;
};

const mock = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${MOCK_PORT}`);
  const table = url.pathname.replace("/rest/v1/", "");
  const rows = tables[table];
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const send = (status, payload) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(payload === undefined ? "" : JSON.stringify(payload));
    };
    if (!rows) return send(404, { message: "no such table" });
    const filters = parseFilters(url.searchParams);
    const wantsObject = String(req.headers.accept || "").includes("pgrst.object");
    const prefer = String(req.headers.prefer || "");
    if (req.method === "GET") {
      const found = rows.filter((r) => matches(r, filters)).map((r) => withEmbeds(table, r));
      if (wantsObject) return found.length ? send(200, found[0]) : send(406, { message: "no rows" });
      return send(200, found);
    }
    if (req.method === "POST") {
      const incoming = [].concat(JSON.parse(body || "[]"));
      const onConflict = url.searchParams.get("on_conflict");
      const out = incoming.map((item) => {
        if (onConflict) {
          const cols = onConflict.split(",");
          const existing = rows.find((r) => cols.every((c) => r[c] === item[c]));
          if (existing) return Object.assign(existing, item);
        }
        const row = { id: randomUUID(), created_at: new Date().toISOString(), provider: "credentials", ...item };
        rows.push(row);
        return row;
      });
      if (!prefer.includes("return=representation")) return send(201);
      return send(201, wantsObject ? out[0] : out);
    }
    if (req.method === "PATCH") {
      const patch = JSON.parse(body || "{}");
      rows.filter((r) => matches(r, filters)).forEach((r) => Object.assign(r, patch));
      return send(204);
    }
    if (req.method === "DELETE") {
      for (let i = rows.length - 1; i >= 0; i -= 1) if (matches(rows[i], filters)) rows.splice(i, 1);
      return send(204);
    }
    return send(405, {});
  });
});
await new Promise((r) => mock.listen(MOCK_PORT, r));

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

const stored = tables.custom_users[0];
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

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
