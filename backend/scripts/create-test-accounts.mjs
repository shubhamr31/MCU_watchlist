/**
 * Creates 3 test accounts with different progress each, then logs back in and
 * verifies the saved progress.
 *
 *   node scripts/create-test-accounts.mjs                 -> runs against a temporary in-memory fake DB
 *   API_BASE_URL=https://your-api node scripts/create-test-accounts.mjs   -> runs against a real backend
 *
 * Against a real backend, the accounts are real and persist in your database.
 */
import { startMockSupabase } from "./lib/mock-supabase.mjs";

let api = (process.env.API_BASE_URL || "").replace(/\/$/, "");
const usingMock = !api;

if (usingMock) {
  const MOCK_PORT = 4220;
  const API_PORT = 4221;
  await startMockSupabase(MOCK_PORT);
  process.env.SUPABASE_URL = `http://localhost:${MOCK_PORT}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  process.env.PORT = String(API_PORT);
  await import("../src/server.js");
  await new Promise((r) => setTimeout(r, 500));
  api = `http://localhost:${API_PORT}`;
}

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

const suffix = Math.random().toString(36).slice(2, 4).toUpperCase();
const accounts = [
  { username: `TST${suffix}1`, password: "111111", progress: { "arc-1-item-1": "completed", "arc-1-item-2": "completed", "arc-1-item-3": "completed" } },
  { username: `TST${suffix}2`, password: "222222", progress: { "arc-1-item-1": "watching", "arc-1-item-4": "completed" } },
  { username: `TST${suffix}3`, password: "333333", progress: { "arc-2-item-1": "watching" } },
];

let failures = 0;
const rows = [];
for (const acct of accounts) {
  const reg = await call("POST", "/api/auth/register", { body: { username: acct.username, password: acct.password } });
  const saved = reg.json?.token
    ? await call("PUT", "/api/progress/me", { token: reg.json.token, body: { progress: acct.progress } })
    : { status: 0 };
  const login = await call("POST", "/api/auth/login", { body: { username: acct.username, password: acct.password } });
  const loaded = login.json?.token ? await call("GET", "/api/progress/me", { token: login.json.token }) : { json: null };
  const got = loaded.json?.progress || {};
  const ok =
    reg.status === 200 && saved.status === 200 && login.status === 200 &&
    JSON.stringify(Object.entries(got).sort()) === JSON.stringify(Object.entries(acct.progress).sort());
  if (!ok) failures += 1;
  const completed = Object.values(got).filter((s) => s === "completed").length;
  const watching = Object.values(got).filter((s) => s === "watching").length;
  rows.push({ username: acct.username, passkey: acct.password, register: reg.status, save: saved.status, relogin: login.status, completed, watching, restored: ok ? "PASS" : "FAIL" });
}

console.log(usingMock ? "Target: temporary in-memory fake DB (accounts vanish when this script exits)\n" : `Target: ${api} (real accounts)\n`);
console.table(rows);
console.log(failures === 0 ? "ALL 3 ACCOUNTS PASSED" : `${failures} ACCOUNT(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
