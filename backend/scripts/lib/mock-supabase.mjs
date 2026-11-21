/**
 * Minimal in-memory fake of the Supabase REST API (PostgREST) covering the
 * queries the backend makes against custom_users / custom_sessions / custom_progress.
 * For local tests only. Data lives in memory and disappears when the process exits.
 */
import http from "node:http";
import { randomUUID } from "node:crypto";

export const createMockTables = () => ({ custom_users: [], custom_sessions: [], custom_progress: [] });

const OPERATORS = ["eq", "neq", "lt", "lte", "gt", "gte"];

// Unsupported operators fail loudly: silently ignoring one would make a filtered
// DELETE/PATCH hit every row.
const parseFilters = (params) => {
  const filters = [];
  params.forEach((value, key) => {
    if (["select", "order", "limit", "on_conflict"].includes(key)) return;
    const op = value.slice(0, value.indexOf("."));
    if (!OPERATORS.includes(op)) throw new Error(`mock: unsupported filter ${key}=${value}`);
    filters.push([key, op, value.slice(op.length + 1)]);
  });
  return filters;
};

// Compares as timestamps when both sides parse as dates (e.g. last_seen_at), otherwise as strings.
const compare = (actual, expected) => {
  const a = Date.parse(actual);
  const b = Date.parse(expected);
  if (Number.isFinite(a) && Number.isFinite(b)) return a - b;
  return String(actual) < String(expected) ? -1 : String(actual) > String(expected) ? 1 : 0;
};
const matches = (row, filters) =>
  filters.every(([k, op, v]) => {
    if (op === "eq") return String(row[k]) === v;
    if (op === "neq") return String(row[k]) !== v;
    if (row[k] === null || row[k] === undefined) return false;
    const diff = compare(row[k], v);
    if (op === "lt") return diff < 0;
    if (op === "lte") return diff <= 0;
    if (op === "gt") return diff > 0;
    return diff >= 0;
  });

export const startMockSupabase = async (port, tables = createMockTables()) => {
  const withEmbeds = (table, row) => {
    if (table === "custom_sessions") {
      const user = tables.custom_users.find((u) => u.id === row.user_id);
      return { ...row, custom_users: user ? { id: user.id, username: user.username, provider: user.provider } : null };
    }
    return row;
  };

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);
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
      let filters;
      try {
        filters = parseFilters(url.searchParams);
      } catch (error) {
        return send(400, { message: error.message });
      }
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
        const updated = rows.filter((r) => matches(r, filters));
        updated.forEach((r) => Object.assign(r, patch));
        if (!prefer.includes("return=representation")) return send(204);
        if (wantsObject) return updated.length ? send(200, updated[0]) : send(406, { message: "no rows" });
        return send(200, updated);
      }
      if (req.method === "DELETE") {
        for (let i = rows.length - 1; i >= 0; i -= 1) if (matches(rows[i], filters)) rows.splice(i, 1);
        return send(204);
      }
      return send(405, {});
    });
  });
  await new Promise((resolve) => server.listen(port, resolve));
  return { tables, server };
};
