/**
 * Read-only: lists registered users (username, provider, created_at).
 * Never selects password hashes or salts. Reads backend/.env.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const envPath = join(dirname(fileURLToPath(import.meta.url)), "..", ".env");
try {
  readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .forEach((line) => {
      const t = line.trim();
      const eq = t.indexOf("=");
      if (!t || t.startsWith("#") || eq === -1) return;
      const k = t.slice(0, eq).trim();
      if (!process.env[k]) process.env[k] = t.slice(eq + 1).trim();
    });
} catch (_e) {
  // ignore
}

const url = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
if (!url || !key || /YOUR_PROJECT|your_service_role_key/i.test(url + key)) {
  console.error("backend/.env still has placeholder Supabase values. Fill in SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY and save the file.");
  process.exit(2);
}

const response = await fetch(
  `${url}/rest/v1/custom_users?select=username,provider,created_at&order=created_at.desc`,
  { headers: { apikey: key, Authorization: `Bearer ${key}` } }
);
if (!response.ok) {
  console.error(`Query failed: ${response.status} ${await response.text()}`);
  process.exit(1);
}
const users = await response.json();
console.log(`Total users: ${users.length}`);
console.table(users);
