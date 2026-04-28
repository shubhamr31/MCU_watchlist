import express from "express";
import cors from "cors";
import { PROGRESS_SCHEMA, V2_COLLAB_SHAPES } from "../../shared/contracts.js";

const app = express();
const PORT = process.env.PORT || 4000;

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

app.listen(PORT, () => {
  console.log(`MCU backend listening on http://localhost:${PORT}`);
});

