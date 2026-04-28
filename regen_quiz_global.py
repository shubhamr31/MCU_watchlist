# -*- coding: utf-8 -*-
from pathlib import Path
import re, json, random, urllib.request, urllib.parse

random.seed()
API_KEY = "675afbab"
root = Path(r"C:\Users\sra26\Desktop\mcu-watchlist-v1")
raw_path = root / "frontend" / "src" / "data" / "rawArcs.js"
out_path = root / "frontend" / "src" / "data" / "quizQuestions.js"

raw = raw_path.read_text(encoding="utf-8")

# Parse rows
row_matches = list(re.finditer(r"\{d:'([^']+)',t:'([^']+)',dur:'([^']+)',film:(true|false)(?:,moved:true)?(?:,isNew:true)?\}", raw))
arc_markers = [(m.start(), m.group(1)) for m in re.finditer(r"name:'([^']+)'", raw)]


def arc_for_pos(pos):
    current = "Unknown Arc"
    for p, n in arc_markers:
        if p <= pos:
            current = n
        else:
            break
    return current


def clean_movie(t):
    return re.sub(r"^Rewatch:\s*", "", t, flags=re.I).strip()


def clean_show(t):
    t = re.sub(r"\s*S\d+\s*Ep\d+$", "", t, flags=re.I)
    t = re.sub(r"\s*Ep\d+$", "", t, flags=re.I)
    return t.strip()

entities = {}
for m in row_matches:
    d, t, dur, film = m.groups()
    pos = m.start()
    arc = arc_for_pos(pos)
    typ = "film" if film == "true" else "show"
    title = clean_movie(t) if typ == "film" else clean_show(t)
    e = entities.setdefault(title, {
        "title": title,
        "type": typ,
        "arcs": set(),
        "dates": [],
        "durations": [],
        "entryCount": 0,
        "year": "Unknown",
        "released": "Unknown",
        "genre": "Unknown",
        "director": "Unknown",
        "actors": "Unknown",
        "plot": "Unknown",
        "imdbRating": "Unknown",
        "imdbVotes": "Unknown",
        "runtime": "Unknown",
        "language": "Unknown",
        "country": "Unknown",
        "awards": "Unknown",
        "imdbID": "Unknown",
    })
    e["arcs"].add(arc)
    e["dates"].append(d)
    e["durations"].append(dur)
    e["entryCount"] += 1

all_titles = list(entities.keys())
if not all_titles:
    raise SystemExit("No titles parsed")

# Fetch OMDb metadata (global database)
for title, e in entities.items():
    params = {
        "apikey": API_KEY,
        "t": title,
        "type": "movie" if e["type"] == "film" else "series",
        "plot": "short",
        "r": "json",
    }
    url = "https://www.omdbapi.com/?" + urllib.parse.urlencode(params)
    try:
        with urllib.request.urlopen(url, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        if data.get("Response") == "True":
            for k in ["Year", "Released", "Genre", "Director", "Actors", "Plot", "imdbRating", "imdbVotes", "Runtime", "Language", "Country", "Awards", "imdbID"]:
                v = data.get(k)
                if v and v != "N/A":
                    key = k[0].lower() + k[1:] if k[0].islower() else k
            e["year"] = data.get("Year", e["year"]) if data.get("Year") != "N/A" else e["year"]
            e["released"] = data.get("Released", e["released"]) if data.get("Released") != "N/A" else e["released"]
            e["genre"] = data.get("Genre", e["genre"]) if data.get("Genre") != "N/A" else e["genre"]
            e["director"] = data.get("Director", e["director"]) if data.get("Director") != "N/A" else e["director"]
            e["actors"] = data.get("Actors", e["actors"]) if data.get("Actors") != "N/A" else e["actors"]
            e["plot"] = data.get("Plot", e["plot"]) if data.get("Plot") != "N/A" else e["plot"]
            e["imdbRating"] = data.get("imdbRating", e["imdbRating"]) if data.get("imdbRating") != "N/A" else e["imdbRating"]
            e["imdbVotes"] = data.get("imdbVotes", e["imdbVotes"]) if data.get("imdbVotes") != "N/A" else e["imdbVotes"]
            e["runtime"] = data.get("Runtime", e["runtime"]) if data.get("Runtime") != "N/A" else e["runtime"]
            e["language"] = data.get("Language", e["language"]) if data.get("Language") != "N/A" else e["language"]
            e["country"] = data.get("Country", e["country"]) if data.get("Country") != "N/A" else e["country"]
            e["awards"] = data.get("Awards", e["awards"]) if data.get("Awards") != "N/A" else e["awards"]
            e["imdbID"] = data.get("imdbID", e["imdbID"]) if data.get("imdbID") != "N/A" else e["imdbID"]
    except Exception:
        pass

movies = [t for t,v in entities.items() if v["type"] == "film"]
shows = [t for t,v in entities.items() if v["type"] == "show"]
arcs = sorted({a for v in entities.values() for a in v["arcs"]})

def uniq_pool(field, fallback):
    vals = sorted({v[field] for v in entities.values() if v[field] != "Unknown"})
    return vals if len(vals) >= 4 else fallback

years = uniq_pool("year", ["2008", "2012", "2018", "2023", "2025"])
genres = uniq_pool("genre", ["Action", "Adventure", "Sci-Fi", "Drama", "Comedy"])
ratings = uniq_pool("imdbRating", ["6.8", "7.2", "7.8", "8.1", "8.4"])
runtimes = uniq_pool("runtime", ["45 min", "60 min", "126 min", "149 min", "181 min"])
languages = uniq_pool("language", ["English", "English, Spanish", "English, Hindi", "English, Russian"])
countries = uniq_pool("country", ["USA", "USA, UK", "USA, Canada", "USA, Australia"])


def options(correct, pool):
    pool = [p for p in pool if p and p != "Unknown"]
    if correct not in pool:
        pool = [correct] + pool
    uniq = [p for p in dict.fromkeys(pool) if p != correct]
    random.shuffle(uniq)
    opts = [correct] + uniq[:3]
    if len(opts) < 4:
        return None
    random.shuffle(opts)
    return opts if len(set(opts)) == 4 else None

qs = []

def add(q, opts, ans):
    if not opts or len(opts) != 4 or len(set(opts)) != 4:
        return
    qs.append({"question": q, "options": opts, "answer": ans})

# AI-style diverse templates
for title, e in entities.items():
    add(f"In this Marvel watch plan, what type is '{title}'?", options("Movie" if e["type"]=="film" else "Show", ["Movie", "Show", "Special", "Documentary"]), "Movie" if e["type"]=="film" else "Show")
    add(f"Which release year best matches '{title}' according to global database metadata?", options(e["year"], years), e["year"])
    add(f"What is the primary genre listed for '{title}'?", options(e["genre"], genres), e["genre"])
    add(f"What IMDb rating is associated with '{title}'?", options(e["imdbRating"], ratings), e["imdbRating"])
    add(f"What runtime is listed for '{title}'?", options(e["runtime"], runtimes), e["runtime"])
    add(f"'{title}' is planned under which arc?", options(sorted(e["arcs"])[0], arcs), sorted(e["arcs"])[0])
    add(f"Which country is listed for '{title}'?", options(e["country"], countries), e["country"])
    add(f"Which language set is listed for '{title}'?", options(e["language"], languages), e["language"])

# Comparison questions
for _ in range(260):
    t = random.choice(all_titles)
    e = entities[t]
    if random.random() < 0.33 and len(movies) >= 4 and len(shows) >= 3:
        correct = random.choice(movies)
        opts = [correct] + random.sample(shows, 3)
        random.shuffle(opts)
        add("Pick the option that is a movie in this MCU plan.", opts, correct)
    elif random.random() < 0.66 and len(shows) >= 4 and len(movies) >= 3:
        correct = random.choice(shows)
        opts = [correct] + random.sample(movies, 3)
        random.shuffle(opts)
        add("Pick the option that is a show in this MCU plan.", opts, correct)
    else:
        # year->title
        same_year_titles = [x for x,v in entities.items() if v["year"] == e["year"]]
        correct = random.choice(same_year_titles) if same_year_titles else t
        add(f"Which title has release year '{e['year']}' in metadata?", options(correct, all_titles), correct)

# IMDb ID questions for variety
for t, e in list(entities.items())[:60]:
    if e["imdbID"] != "Unknown":
        add(f"Which title maps to IMDb ID '{e['imdbID']}'?", options(t, all_titles), t)

# Deduplicate
unique = []
seen = set()
for q in qs:
    key = (q["question"], tuple(q["options"]), q["answer"])
    if key in seen:
        continue
    seen.add(key)
    unique.append(q)

# Ensure 500 exact
while len(unique) < 500:
    t = random.choice(all_titles)
    e = entities[t]
    ans = "Movie" if e["type"] == "film" else "Show"
    opts = options(ans, ["Movie", "Show", "Special", "Animation"])
    q = {"question": f"Quick classification: '{t}' is a...", "options": opts, "answer": ans}
    if opts and (q["question"], tuple(q["options"]), q["answer"]) not in seen:
        seen.add((q["question"], tuple(q["options"]), q["answer"]))
        unique.append(q)

random.shuffle(unique)
final = unique[:500]
out_path.write_text("export const QUIZ_QUESTIONS = " + json.dumps(final, ensure_ascii=False, indent=2) + ";\n", encoding="utf-8")
print(f"generated={len(final)} titles={len(all_titles)} movies={len(movies)} shows={len(shows)}")
