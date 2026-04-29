import { useEffect, useMemo, useRef, useState } from "react";
import { buildScheduleSeed } from "./data/normalizeSchedule";
import { loadProgress, nextStatus, saveProgress } from "./utils/progressStore";
import { QUIZ_BANKS } from "./data/quizQuestions";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "film", label: "Films only" },
  { id: "show", label: "Shows only" },
];
const HERO_FILTERS = [
  "All heroes",
  "Iron Man",
  "Captain America",
  "Thor",
  "Hulk",
  "Spider-Man",
  "Doctor Strange",
  "Black Panther",
  "Ant-Man",
  "Guardians",
  "Daredevil",
  "Punisher",
  "Loki",
  "Wanda",
  "Hawkeye",
  "Moon Knight",
  "Ms. Marvel",
  "Shang-Chi",
  "Fantastic Four",
  "Deadpool",
];

const statusLabel = {
  not_started: "Not started",
  watching: "Watching",
  completed: "Completed",
};

const statusClass = {
  not_started: "status-neutral",
  watching: "status-watching",
  completed: "status-completed",
};

const parseDurationToMinutes = (duration) => {
  const hoursMatch = duration.match(/(\d+)h/);
  const minsMatch = duration.match(/(\d+)m/);
  const hours = hoursMatch ? Number(hoursMatch[1]) : 0;
  const mins = minsMatch ? Number(minsMatch[1]) : 0;
  return hours * 60 + mins;
};

const formatMinutes = (minutes) => {
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hrs === 0) {
    return `${mins}m`;
  }
  return `${hrs}h ${mins.toString().padStart(2, "0")}m`;
};

const normalizeFilmTitle = (title) => title.replace(/^Rewatch:\s*/i, "").trim();
const normalizeShowTitle = (title) =>
  title
    .replace(/\s*S\d+\s*Ep\d+$/i, "")
    .replace(/\s*Ep\d+$/i, "")
    .trim();
const slugify = (value) =>
  value
    .toLowerCase()
    .replace(/^rewatch:\s*/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
const getLocalPosterUrl = (title) => `/posters/${slugify(title)}.jpg`;
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";
const getWatchNowUrl = (title, type) => {
  const normalized = type === "film" ? normalizeFilmTitle(title) : normalizeShowTitle(title);
  const slug = slugify(normalized);
  return type === "film"
    ? `https://www.justwatch.com/in/movie/${slug}`
    : `https://www.justwatch.com/in/tv-show/${slug}`;
};
const RELEASE_DATES = {
  films: {
    "Iron Man": "May 2, 2008",
    "Iron Man 2": "May 7, 2010",
    Thor: "May 6, 2011",
    "Captain America: The First Avenger": "Jul 22, 2011",
    Avengers: "May 4, 2012",
    "Iron Man 3": "May 3, 2013",
    "Thor: The Dark World": "Nov 8, 2013",
    "Captain America: The Winter Soldier": "Apr 4, 2014",
    "Avengers: Age of Ultron": "May 1, 2015",
    "Captain America: Civil War": "May 6, 2016",
    "Doctor Strange": "Nov 4, 2016",
    "Spider-Man: Homecoming": "Jul 7, 2017",
    "Avengers: Infinity War": "Apr 27, 2018",
    "Avengers: Endgame": "Apr 26, 2019",
    "Spider-Man: Far From Home": "Jul 2, 2019",
    "Spider-Man: No Way Home": "Dec 17, 2021",
    "Guardians of the Galaxy": "Aug 1, 2014",
    "Guardians of the Galaxy Vol. 2": "May 5, 2017",
    "Thor: Ragnarok": "Nov 3, 2017",
    "Black Panther": "Feb 16, 2018",
    "Ant-Man and the Wasp": "Jul 6, 2018",
    "Shang-Chi and the Legend of the Ten Rings": "Sep 3, 2021",
    Eternals: "Nov 5, 2021",
    "Doctor Strange in the Multiverse of Madness": "May 6, 2022",
    "Thor: Love and Thunder": "Jul 8, 2022",
    "Black Panther: Wakanda Forever": "Nov 11, 2022",
    "Ant-Man and the Wasp: Quantumania": "Feb 17, 2023",
    "Guardians of the Galaxy Vol. 3": "May 5, 2023",
    "The Marvels": "Nov 10, 2023",
    "Deadpool & Wolverine": "Jul 26, 2024",
    "Captain America: Brave New World": "Feb 14, 2025",
    "Thunderbolts*": "May 2, 2025",
    "Fantastic Four: First Steps": "Jul 25, 2025",
  },
  shows: {
    WandaVision: "Jan 15, 2021",
    Daredevil: "Apr 10, 2015",
    "Daredevil: Born Again": "Mar 4, 2025",
    Punisher: "Nov 17, 2017",
    "She-Hulk": "Aug 18, 2022",
    "Jessica Jones": "Nov 20, 2015",
    "Luke Cage": "Sep 30, 2016",
    "Iron Fist": "Mar 17, 2017",
    "The Defenders": "Aug 18, 2017",
    Loki: "Jun 9, 2021",
    "What If…?": "Aug 11, 2021",
    Hawkeye: "Nov 24, 2021",
    "Moon Knight": "Mar 30, 2022",
    "Ms. Marvel": "Jun 8, 2022",
    "Secret Invasion": "Jun 21, 2023",
  },
};
const getReleaseDateLabel = (item) => {
  if (item.type === "film") {
    return RELEASE_DATES.films[normalizeFilmTitle(item.title)] || "TBA";
  }
  const normalizedShow = normalizeShowTitle(item.title);
  return RELEASE_DATES.shows[normalizedShow] || "TBA";
};
const getHeroesForTitle = (title) => {
  const t = title.toLowerCase();
  const heroes = [];
  if (t.includes("iron man")) heroes.push("Iron Man");
  if (t.includes("captain america")) heroes.push("Captain America");
  if (t.includes("thor")) heroes.push("Thor");
  if (t.includes("hulk") || t.includes("she-hulk") || t.includes("avengers")) heroes.push("Hulk");
  if (t.includes("spider-man")) heroes.push("Spider-Man");
  if (t.includes("doctor strange")) heroes.push("Doctor Strange");
  if (t.includes("black panther")) heroes.push("Black Panther");
  if (t.includes("ant-man")) heroes.push("Ant-Man");
  if (t.includes("guardians")) heroes.push("Guardians");
  if (t.includes("daredevil") || t.includes("defenders")) heroes.push("Daredevil");
  if (t.includes("punisher")) heroes.push("Punisher");
  if (t.includes("loki")) heroes.push("Loki");
  if (t.includes("wandavision")) heroes.push("Wanda");
  if (t.includes("hawkeye")) heroes.push("Hawkeye");
  if (t.includes("moon knight")) heroes.push("Moon Knight");
  if (t.includes("ms. marvel") || t.includes("the marvels")) heroes.push("Ms. Marvel");
  if (t.includes("shang-chi")) heroes.push("Shang-Chi");
  if (t.includes("fantastic four")) heroes.push("Fantastic Four");
  if (t.includes("deadpool")) heroes.push("Deadpool");
  if (t.includes("avengers")) heroes.push("Iron Man", "Captain America", "Thor", "Hulk");
  if (heroes.length === 0) heroes.push("All heroes");
  return Array.from(new Set(heroes));
};
const shuffle = (arr) => {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};
const QUIZ_MODES = [
  { id: "mcuOnly", label: "MCU only" },
  { id: "comicsMixed", label: "Comics + MCU mixed" },
  { id: "hardcoreLore", label: "Hardcore lore" },
];
const QUIZ_WIDGET_STORAGE_KEY = "mcu_quiz_widget_position";
const QUIZ_WIDGET_SIZE = 58;

const seed = buildScheduleSeed();

export function App() {
  const [showIntroLoader, setShowIntroLoader] = useState(true);
  const [isMobileView, setIsMobileView] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return window.matchMedia("(max-width: 640px)").matches;
  });
  const [arcFilter, setArcFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [heroFilter, setHeroFilter] = useState("All heroes");
  const [query, setQuery] = useState("");
  const [expandedArcs, setExpandedArcs] = useState({});
  const [expandedWeeks, setExpandedWeeks] = useState({});
  const [progress, setProgress] = useState(() => loadProgress());
  const [posterMap, setPosterMap] = useState({});
  const [quizOpen, setQuizOpen] = useState(false);
  const [isDraggingWidget, setIsDraggingWidget] = useState(false);
  const [viewportSize, setViewportSize] = useState(() => {
    if (typeof window === "undefined") {
      return { width: 1280, height: 720 };
    }
    return { width: window.innerWidth, height: window.innerHeight };
  });
  const [quizWidgetPosition, setQuizWidgetPosition] = useState(() => {
    if (typeof window === "undefined") {
      return { x: 24, y: 24 };
    }
    try {
      const raw = window.localStorage.getItem(QUIZ_WIDGET_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (typeof parsed.x === "number" && typeof parsed.y === "number") {
          return parsed;
        }
      }
    } catch (_error) {
      // Ignore malformed saved position and fallback to default.
    }
    return {
      x: window.innerWidth - QUIZ_WIDGET_SIZE - 24,
      y: window.innerHeight - QUIZ_WIDGET_SIZE - 24,
    };
  });
  const dragStateRef = useRef({
    pointerId: null,
    startPointerX: 0,
    startPointerY: 0,
    startX: 0,
    startY: 0,
    moved: false,
  });
  const [quizMode, setQuizMode] = useState("mcuOnly");
  const activeQuizBank = QUIZ_BANKS[quizMode];
  const [quizQuestionIndex, setQuizQuestionIndex] = useState(
    () => Math.floor(Math.random() * activeQuizBank.length)
  );
  const [quizOptions, setQuizOptions] = useState([]);
  const [quizSelected, setQuizSelected] = useState("");
  const [quizResult, setQuizResult] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setShowIntroLoader(false);
    }, 1800);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }
    const mq = window.matchMedia("(max-width: 640px)");
    const onChange = (event) => {
      setIsMobileView(event.matches);
      if (event.matches) setQuizOpen(false);
    };
    setIsMobileView(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }
    const onResize = () => {
      setViewportSize({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const maxX = Math.max(8, viewportSize.width - QUIZ_WIDGET_SIZE - 8);
    const maxY = Math.max(8, viewportSize.height - QUIZ_WIDGET_SIZE - 8);
    setQuizWidgetPosition((prev) => ({
      x: Math.min(Math.max(8, prev.x), maxX),
      y: Math.min(Math.max(8, prev.y), maxY),
    }));
  }, [viewportSize]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(QUIZ_WIDGET_STORAGE_KEY, JSON.stringify(quizWidgetPosition));
    }
  }, [quizWidgetPosition]);

  const visibleArcs = useMemo(() => {
    if (arcFilter === "all") {
      return seed.arcs;
    }
    return seed.arcs.filter((arc) => arc.id === arcFilter);
  }, [arcFilter]);

  const filteredArcs = useMemo(() => {
    const q = query.trim().toLowerCase();
    return visibleArcs
      .map((arc) => {
        const weeks = arc.weeks
          .map((week) => ({
            ...week,
            items: week.items.filter((item) => {
              const typeOk = typeFilter === "all" ? true : item.type === typeFilter;
              const queryOk = q ? item.title.toLowerCase().includes(q) : true;
              const heroOk =
                heroFilter === "All heroes"
                  ? true
                  : getHeroesForTitle(item.title).includes(heroFilter);
              return typeOk && queryOk && heroOk;
            }),
          }))
          .filter((week) => week.items.length > 0);
        return { ...arc, weeks };
      })
      .filter((arc) => arc.weeks.length > 0);
  }, [visibleArcs, typeFilter, heroFilter, query]);

  const allVisibleItems = useMemo(
    () => filteredArcs.flatMap((arc) => arc.weeks.flatMap((week) => week.items)),
    [filteredArcs]
  );

  const visiblePosterKeys = useMemo(() => {
    const unique = new Set();
    allVisibleItems.forEach((item) => {
      const normalizedTitle =
        item.type === "film" ? normalizeFilmTitle(item.title) : normalizeShowTitle(item.title);
      unique.add(`${item.type}::${normalizedTitle}`);
    });
    return Array.from(unique);
  }, [allVisibleItems]);

  useEffect(() => {
    const missing = visiblePosterKeys.filter((key) => !(key in posterMap));
    if (missing.length === 0) {
      return;
    }

    const fetchPoster = async (key) => {
      const [type, title] = key.split("::");
      try {
        const url = `${API_BASE_URL}/api/poster?title=${encodeURIComponent(title)}&type=${encodeURIComponent(
          type
        )}`;
        const response = await fetch(url);
        if (!response.ok) {
          return [key, null];
        }
        const data = await response.json();
        return [key, data.posterUrl || null];
      } catch (_error) {
        return [key, null];
      }
    };

    Promise.all(missing.map(fetchPoster)).then((entries) => {
      setPosterMap((prev) => {
        const next = { ...prev };
        entries.forEach(([key, url]) => {
          next[key] = url;
        });
        return next;
      });
    });
  }, [visiblePosterKeys, posterMap]);

  const stats = useMemo(() => {
    const total = allVisibleItems.length;
    const completed = allVisibleItems.filter((item) => progress[item.id] === "completed").length;
    const watching = allVisibleItems.filter((item) => progress[item.id] === "watching").length;
    return {
      total,
      completed,
      watching,
      remaining: Math.max(total - completed, 0),
      percent: total ? Math.round((completed / total) * 100) : 0,
    };
  }, [allVisibleItems, progress]);

  const watchtime = useMemo(() => {
    const allItems = seed.arcs.flatMap((arc) => arc.weeks.flatMap((week) => week.items));
    const totalMinutes = allItems.reduce((sum, item) => sum + parseDurationToMinutes(item.duration), 0);
    const watchedMinutes = allItems.reduce((sum, item) => {
      if (progress[item.id] === "completed") {
        return sum + parseDurationToMinutes(item.duration);
      }
      return sum;
    }, 0);
    return {
      total: formatMinutes(totalMinutes),
      watched: formatMinutes(watchedMinutes),
      remaining: formatMinutes(Math.max(totalMinutes - watchedMinutes, 0)),
    };
  }, [progress]);

  const updateItemStatus = (itemId) => {
    const next = nextStatus(progress[itemId] || "not_started");
    const nextProgress = { ...progress, [itemId]: next };
    setProgress(nextProgress);
    saveProgress(nextProgress);
  };

  const toggleWeek = (weekId) => {
    setExpandedWeeks((prev) => ({ ...prev, [weekId]: !prev[weekId] }));
  };

  const toggleArc = (arcId) => {
    setExpandedArcs((prev) => ({ ...prev, [arcId]: !prev[arcId] }));
  };

  const resetProgress = () => {
    setProgress({});
    saveProgress({});
  };

  const activeQuiz = activeQuizBank[quizQuestionIndex];
  useEffect(() => {
    setQuizOptions(shuffle(activeQuiz.options));
  }, [activeQuiz]);

  useEffect(() => {
    const nextIndex = Math.floor(Math.random() * activeQuizBank.length);
    setQuizQuestionIndex(nextIndex);
    setQuizSelected("");
    setQuizResult("");
  }, [quizMode, activeQuizBank]);

  const nextQuiz = () => {
    const nextIndex = Math.floor(Math.random() * activeQuizBank.length);
    setQuizQuestionIndex(nextIndex);
    setQuizSelected("");
    setQuizResult("");
  };

  const submitQuiz = (option) => {
    if (quizSelected) {
      return;
    }
    setQuizSelected(option);
    setQuizResult(option === activeQuiz.answer ? "Correct!" : `Wrong. Answer: ${activeQuiz.answer}`);
  };

  const getClampedWidgetPosition = (x, y) => {
    const maxX = Math.max(8, viewportSize.width - QUIZ_WIDGET_SIZE - 8);
    const maxY = Math.max(8, viewportSize.height - QUIZ_WIDGET_SIZE - 8);
    return {
      x: Math.min(Math.max(8, x), maxX),
      y: Math.min(Math.max(8, y), maxY),
    };
  };

  const snapWidgetToEdge = (position) => {
    const maxX = Math.max(8, viewportSize.width - QUIZ_WIDGET_SIZE - 8);
    const leftEdgeX = 8;
    const rightEdgeX = maxX;
    const midpoint = viewportSize.width / 2;
    const centerX = position.x + QUIZ_WIDGET_SIZE / 2;
    return {
      x: centerX < midpoint ? leftEdgeX : rightEdgeX,
      y: position.y,
    };
  };

  const startWidgetDrag = (event) => {
    setIsDraggingWidget(true);
    dragStateRef.current = {
      pointerId: event.pointerId,
      startPointerX: event.clientX,
      startPointerY: event.clientY,
      startX: quizWidgetPosition.x,
      startY: quizWidgetPosition.y,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onWidgetPointerMove = (event) => {
    const state = dragStateRef.current;
    if (state.pointerId !== event.pointerId) {
      return;
    }
    const deltaX = event.clientX - state.startPointerX;
    const deltaY = event.clientY - state.startPointerY;
    if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
      state.moved = true;
    }
    const next = getClampedWidgetPosition(state.startX + deltaX, state.startY + deltaY);
    setQuizWidgetPosition(next);
  };

  const endWidgetDrag = (event) => {
    const state = dragStateRef.current;
    if (state.pointerId !== event.pointerId) {
      return;
    }
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch (_error) {
      // Ignore capture release errors.
    }
    if (!state.moved) {
      setQuizOpen((prev) => !prev);
    } else {
      setQuizWidgetPosition((prev) => snapWidgetToEdge(prev));
    }
    setIsDraggingWidget(false);
    dragStateRef.current = {
      pointerId: null,
      startPointerX: 0,
      startPointerY: 0,
      startX: 0,
      startY: 0,
      moved: false,
    };
  };

  const quizPopupStyle = useMemo(() => {
    const popupWidth = isMobileView ? Math.min(viewportSize.width - 20, 340) : 340;
    const popupHeight = Math.min(viewportSize.height - 24, 480);
    let left = quizWidgetPosition.x + QUIZ_WIDGET_SIZE + 10;
    if (left + popupWidth > viewportSize.width - 8) {
      left = quizWidgetPosition.x - popupWidth - 10;
    }
    if (left < 8) {
      left = 8;
    }

    let top = quizWidgetPosition.y - 8;
    if (top + popupHeight > viewportSize.height - 8) {
      top = viewportSize.height - popupHeight - 8;
    }
    if (top < 8) {
      top = 8;
    }

    return {
      left: `${left}px`,
      top: `${top}px`,
      width: `${popupWidth}px`,
      maxHeight: `${popupHeight}px`,
    };
  }, [isMobileView, quizWidgetPosition, viewportSize]);

  if (showIntroLoader) {
    return (
      <div className="marvel-loader" role="status" aria-live="polite" aria-label="Loading MCU Watchlist">
        <div className="marvel-loader-frame">
          <p className="marvel-loader-tag">EARTH-616 Initializing</p>
          <h1 className="marvel-loader-title">INFINITY BOOTSEQUENCE</h1>
          <div className="marvel-loader-bar">
            <span />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-layout">
      <main className="container">
      <header className="header hero">
        <div>
          <h1>MCU WATCHLIST</h1>
          <p>No login required. Progress saved in your browser.</p>
        </div>
        <div className="header-actions">
          <button onClick={resetProgress}>Reset Progress</button>
        </div>
      </header>

      <section className="controls">
        <div className="tabs">
          <button className={arcFilter === "all" ? "active" : ""} onClick={() => setArcFilter("all")}>
            All Arcs
          </button>
          {seed.arcs.map((arc) => (
            <button
              key={arc.id}
              className={arcFilter === arc.id ? "active" : ""}
              onClick={() => setArcFilter(arc.id)}
            >
              {arc.emoji} {arc.name}
            </button>
          ))}
        </div>

        <div className="filters">
          {FILTERS.map((filter) => (
            <button
              key={filter.id}
              className={typeFilter === filter.id ? "active" : ""}
              onClick={() => setTypeFilter(filter.id)}
            >
              {filter.label}
            </button>
          ))}
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title..."
          />
          <select value={heroFilter} onChange={(e) => setHeroFilter(e.target.value)}>
            {HERO_FILTERS.map((hero) => (
              <option key={hero} value={hero}>
                {hero}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="watchtime">
        <h3>Overall Watchtime</h3>
        <p>
          Watched: <strong>{watchtime.watched}</strong> / Total: <strong>{watchtime.total}</strong> / Remaining:{" "}
          <strong>{watchtime.remaining}</strong>
        </p>
      </section>

      <section className="stats">
        <article>
          <h3>Completed</h3>
          <p>{stats.completed}</p>
        </article>
        <article>
          <h3>Watching</h3>
          <p>{stats.watching}</p>
        </article>
        <article>
          <h3>Remaining</h3>
          <p>{stats.remaining}</p>
        </article>
        <article>
          <h3>Progress</h3>
          <p>{stats.percent}%</p>
        </article>
      </section>

      <section className="list">
        {filteredArcs.map((arc) => (
          <article key={arc.id} className="arc">
            <button className="arc-header" onClick={() => toggleArc(arc.id)}>
              <h2>
                {arc.emoji} {arc.name}
              </h2>
              <span>{(expandedArcs[arc.id] ?? !isMobileView) ? "Hide" : "Show"}</span>
            </button>
            {(expandedArcs[arc.id] ?? !isMobileView) && (
              <>
                <p className="arc-note">{arc.note}</p>
                {arc.weeks.map((week) => {
                  const isOpen = expandedWeeks[week.id] ?? !isMobileView;
                  const completedCount = week.items.filter(
                    (item) => progress[item.id] === "completed"
                  ).length;
                  return (
                    <div key={week.id} className="week">
                      <button className="week-header" onClick={() => toggleWeek(week.id)}>
                        <span>
                          {week.label} ({week.dates})
                        </span>
                        <span>
                          {completedCount}/{week.items.length} completed
                        </span>
                      </button>
                      {isOpen && (
                        <div className="week-list">
                          {week.items.map((item) => {
                            const status = progress[item.id] || "not_started";
                            const posterTitle =
                              item.type === "film"
                                ? normalizeFilmTitle(item.title)
                                : normalizeShowTitle(item.title);
                            const posterKey = `${item.type}::${posterTitle}`;
                            const apiPosterUrl = posterMap[posterKey];
                            const posterUrl = apiPosterUrl || getLocalPosterUrl(posterTitle);
                            return (
                              <button
                                key={item.id}
                                className="item-row item-card"
                                onClick={() => updateItemStatus(item.id)}
                              >
                                <div>
                                  <strong>
                                    {posterUrl ? (
                                      <img
                                        src={posterUrl}
                                        alt={`${posterTitle} poster`}
                                        className="movie-poster"
                                        loading="lazy"
                                        onError={(event) => {
                                          event.currentTarget.src = "/posters/fallback.svg";
                                        }}
                                      />
                                    ) : (
                                      <span className="tv-icon" aria-hidden="true">
                                        📺
                                      </span>
                                    )}
                                    {item.title}
                                  </strong>
                                  <p>
                                    {item.plannedDate} · {item.duration} · {item.type}
                                  </p>
                                  <p>Release: {getReleaseDateLabel(item)}</p>
                                  <p className="watch-links">
                                    <a
                                      href={getWatchNowUrl(item.title, item.type)}
                                      target="_blank"
                                      rel="noreferrer"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      Watch Now <span aria-hidden="true">↗</span>
                                    </a>
                                  </p>
                                </div>
                                <span className={`status-pill ${statusClass[status]}`}>
                                  {statusLabel[status]}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </>
            )}
          </article>
        ))}
      </section>
      </main>

      <button
        className={`quiz-widget-launcher ${isDraggingWidget ? "dragging" : ""}`}
        style={{ left: `${quizWidgetPosition.x}px`, top: `${quizWidgetPosition.y}px` }}
        onPointerDown={startWidgetDrag}
        onPointerMove={onWidgetPointerMove}
        onPointerUp={endWidgetDrag}
        onPointerCancel={endWidgetDrag}
        aria-label={quizOpen ? "Close quiz widget" : "Open quiz widget"}
        type="button"
      >
        <span>Quiz</span>
      </button>

      <section
        className={`quiz-widget-popup ${quizOpen ? "open" : ""}`}
        style={quizPopupStyle}
        aria-hidden={!quizOpen}
      >
          <div className="quiz-panel-header">
            <h3>Marvel Quiz</h3>
            <button className="quiz-toggle" onClick={() => setQuizOpen(false)}>
              Close
            </button>
          </div>
          <p className="quiz-subtitle">Interesting facts quiz · 500 questions per mode</p>
          <select className="quiz-mode-select" value={quizMode} onChange={(e) => setQuizMode(e.target.value)}>
            {QUIZ_MODES.map((mode) => (
              <option key={mode.id} value={mode.id}>
                {mode.label}
              </option>
            ))}
          </select>
          <div className="quiz-card">
            <p className="quiz-question">{activeQuiz.question}</p>
            <div className="quiz-options">
              {quizOptions.map((option) => (
                <button
                  key={option}
                  className={`quiz-option ${
                    quizSelected
                      ? option === activeQuiz.answer
                        ? "quiz-correct"
                        : quizSelected === option
                          ? "quiz-wrong"
                          : ""
                      : ""
                  }`}
                  onClick={() => submitQuiz(option)}
                  disabled={Boolean(quizSelected)}
                >
                  {option}
                </button>
              ))}
            </div>
            {quizResult ? <p className="quiz-result">{quizResult}</p> : null}
            <button className="quiz-next" onClick={nextQuiz}>
              Next Question
            </button>
          </div>
      </section>
    </div>
  );
}

