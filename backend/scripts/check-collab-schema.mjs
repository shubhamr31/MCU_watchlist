/**
 * Verifies Supabase collab tables via REST (no extra deps).
 * Loads backend/.env — does not print secrets.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const envPath = join(here, "..", ".env");

const loadEnv = () => {
  try {
    const raw = readFileSync(envPath, "utf8");
    raw.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        return;
      }
      const eq = trimmed.indexOf("=");
      if (eq === -1) {
        return;
      }
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim();
      if (!process.env[key]) {
        process.env[key] = value;
      }
    });
  } catch (_err) {
    // ignore
  }
};

loadEnv();

const url = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!url || !key) {
  console.error("MISSING_ENV: Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in backend/.env");
  process.exit(2);
}

const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
};

const probeTable = async (table) => {
  const response = await fetch(`${url}/rest/v1/${table}?select=id&limit=1`, { headers });
  if (response.ok) {
    return { ok: true };
  }
  let message = response.statusText;
  try {
    const body = await response.json();
    message = body.message || body.error || message;
  } catch (_err) {
    // ignore
  }
  return { ok: false, status: response.status, message };
};

const tables = ["collab_sessions", "collab_members", "collab_item_progress", "custom_users"];

const main = async () => {
  const results = {};
  for (const table of tables) {
    results[table] = await probeTable(table);
  }
  console.log(JSON.stringify(results, null, 2));
  const collabReady =
    results.collab_sessions?.ok && results.collab_members?.ok && results.collab_item_progress?.ok;
  process.exit(collabReady ? 0 : 1);
};

main();
