import { useEffect, useMemo, useRef, useState } from "react";
import { buildScheduleSeed } from "./data/normalizeSchedule";
import { loadProgress, nextStatus, saveProgress } from "./utils/progressStore";
import {
  supabase,
  isSupabaseConfigured,
  fetchWatchlistProgress,
  upsertWatchlistProgress,
} from "./lib/supabaseClient";
import { QUIZ_BANKS } from "./data/quizQuestions";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "film", label: "Films only" },
  { id: "show", label: "Shows only" },
];
const SPIDERMAN_SUPPORT_TITLES = [
  "WandaVision",
  "Daredevil",
  "Daredevil: Born Again",
  "Punisher",
  "She-Hulk",
  "Jessica Jones",
  "Luke Cage",
  "Iron Fist",
  "The Defenders",
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
    "Guardians of the Galaxy": "Aug 1, 2014",
    "Avengers: Age of Ultron": "May 1, 2015",
    "Ant-Man": "Jul 17, 2015",
    "Captain America: Civil War": "May 6, 2016",
    "Doctor Strange": "Nov 4, 2016",
    "Spider-Man: Homecoming": "Jul 7, 2017",
    "Guardians of the Galaxy Vol. 2": "May 5, 2017",
    "Thor: Ragnarok": "Nov 3, 2017",
    "Black Panther": "Feb 16, 2018",
    "Avengers: Infinity War": "Apr 27, 2018",
    "Ant-Man and the Wasp": "Jul 6, 2018",
    "Captain Marvel": "Mar 8, 2019",
    "Avengers: Endgame": "Apr 26, 2019",
    "Spider-Man: Far From Home": "Jul 2, 2019",
    "Spider-Man: No Way Home": "Dec 17, 2021",
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
const isSpiderSupportItem = (item) => {
  if (item.essentialBnd) {
    return true;
  }
  const normalized = item.type === "film" ? normalizeFilmTitle(item.title) : normalizeShowTitle(item.title);
  return SPIDERMAN_SUPPORT_TITLES.some((baseTitle) => normalized.includes(baseTitle));
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
const AUTH_TOKEN_STORAGE_KEY = "mcu_watchlist_auth_token_v1";
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";
// TEMP: set to true to disable login gate for tonight.
const TEMP_DISABLE_LOGIN_GATE = true;

const seed = buildScheduleSeed();

export function App() {
  const [showIntroLoader, setShowIntroLoader] = useState(true);
  const [isMobileView, setIsMobileView] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return window.matchMedia("(max-width: 640px)").matches;
  });
  const [typeFilter, setTypeFilter] = useState("all");
  const [spiderSupportFilter, setSpiderSupportFilter] = useState("all");
  const [heroFilter, setHeroFilter] = useState("All heroes");
  const [query, setQuery] = useState("");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [expandedArcs, setExpandedArcs] = useState({});
  const [expandedWeeks, setExpandedWeeks] = useState({});
  const [progress, setProgress] = useState({});
  const [authToken, setAuthToken] = useState(() =>
    typeof window === "undefined" ? "" : window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) || ""
  );
  const [authChecking, setAuthChecking] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }
    if (window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)) {
      return true;
    }
    if (!TEMP_DISABLE_LOGIN_GATE && isSupabaseConfigured) {
      return true;
    }
    return false;
  });
  const [currentUser, setCurrentUser] = useState(TEMP_DISABLE_LOGIN_GATE ? "Guest" : "");
  const [authError, setAuthError] = useState("");
  const [googleReady, setGoogleReady] = useState(false);
  const [supabaseUser, setSupabaseUser] = useState(null);
  const [magicLinkEmail, setMagicLinkEmail] = useState("");
  const [magicLinkSending, setMagicLinkSending] = useState(false);
  const [magicLinkInfo, setMagicLinkInfo] = useState("");
  const [leaderboard, setLeaderboard] = useState([]);
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

  const authHeaders = useMemo(
    () => (authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    [authToken]
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setShowIntroLoader(false);
    }, 1800);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!authToken) {
      setAuthChecking(false);
      if (!supabaseUser) {
        if (isSupabaseConfigured) {
          return;
        }
        setCurrentUser(TEMP_DISABLE_LOGIN_GATE ? "Guest" : "");
        setProgress(TEMP_DISABLE_LOGIN_GATE ? loadProgress() : {});
      }
      return;
    }
    const hydrateUser = async () => {
      setAuthChecking(true);
      try {
        const profileResponse = await fetch(`${API_BASE_URL}/api/auth/me`, {
          headers: authHeaders,
        });
        if (!profileResponse.ok) {
          throw new Error("Session expired");
        }
        const profile = await profileResponse.json();
        setCurrentUser(profile.username || "");

        const progressResponse = await fetch(`${API_BASE_URL}/api/progress/me`, {
          headers: authHeaders,
        });
        if (!progressResponse.ok) {
          throw new Error("Unable to load progress");
        }
        const payload = await progressResponse.json();
        setProgress(payload.progress || {});
      } catch (_error) {
        setAuthToken("");
        if (typeof window !== "undefined") {
          window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
        }
      } finally {
        setAuthChecking(false);
      }
    };
    hydrateUser();
  }, [authHeaders, authToken, supabaseUser, isSupabaseConfigured]);

  useEffect(() => {
    if (!supabase) {
      return undefined;
    }
    const applySession = async (session) => {
      const user = session?.user ?? null;
      setSupabaseUser(user);
      if (user) {
        if (typeof window !== "undefined") {
          window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
        }
        setAuthToken("");
        setAuthError("");
        setMagicLinkInfo("");
        const email = user.email || "";
        setCurrentUser(email.split("@")[0] || "Fan");
        try {
          const remote = await fetchWatchlistProgress(supabase, user.id);
          if (remote && Object.keys(remote).length > 0) {
            setProgress(remote);
          } else {
            const local = loadProgress();
            setProgress(local);
            if (Object.keys(local).length > 0) {
              await upsertWatchlistProgress(supabase, user.id, local);
            }
          }
        } catch (_error) {
          setAuthError("Could not load cloud progress. Check the Supabase table and RLS policies.");
          setProgress(loadProgress());
        }
        setAuthChecking(false);
        return;
      }
      setAuthChecking(false);
      const hasBackendToken =
        typeof window !== "undefined" && Boolean(window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY));
      if (!hasBackendToken) {
        setCurrentUser(TEMP_DISABLE_LOGIN_GATE ? "Guest" : "");
        setProgress(TEMP_DISABLE_LOGIN_GATE ? loadProgress() : {});
      }
    };

    let cancelled = false;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!cancelled) {
        applySession(session);
      }
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      applySession(session);
    });
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/leaderboard`);
        if (!response.ok) {
          return;
        }
        const payload = await response.json();
        setLeaderboard(payload.leaderboard || []);
      } catch (_error) {
        // Ignore transient leaderboard failures.
      }
    };
    fetchLeaderboard();
    const timer = window.setInterval(fetchLeaderboard, 30000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (currentUser || typeof window === "undefined") {
      return undefined;
    }
    if (!GOOGLE_CLIENT_ID) {
      if (!isSupabaseConfigured) {
        setAuthError("Add VITE_GOOGLE_CLIENT_ID or Supabase keys (VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY).");
      }
      return undefined;
    }

    const existingScript = document.querySelector('script[data-google-identity="true"]');
    const initGoogle = () => {
      if (!window.google?.accounts?.id) {
        return;
      }
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: async (response) => {
          const idToken = response.credential;
          if (!idToken) {
            setAuthError("Google Sign-In failed. Try again.");
            return;
          }
          try {
            const loginResponse = await fetch(`${API_BASE_URL}/api/auth/google`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ idToken }),
            });
            const payload = await loginResponse.json();
            if (!loginResponse.ok) {
              setAuthError(payload.error || "Google authentication failed.");
              return;
            }
            setAuthError("");
            setAuthToken(payload.token || "");
            setCurrentUser(payload.username || "");
            window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, payload.token || "");
            if (supabase) {
              await supabase.auth.signOut();
            }
          } catch (_error) {
            setAuthError("Unable to reach server. Try again.");
          }
        },
      });
      setGoogleReady(true);
    };

    if (existingScript) {
      initGoogle();
      return undefined;
    }
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.dataset.googleIdentity = "true";
    script.onload = initGoogle;
    script.onerror = () => setAuthError("Unable to load Google Sign-In.");
    document.head.appendChild(script);
    return undefined;
  }, [currentUser, supabaseUser]);

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

  const filteredArcs = useMemo(() => {
    const q = query.trim().toLowerCase();
    return seed.arcs
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
              const bndOk =
                spiderSupportFilter === "all" ? true : isSpiderSupportItem(item);
              return typeOk && queryOk && heroOk && bndOk;
            }),
          }))
          .filter((week) => week.items.length > 0);
        return { ...arc, weeks };
      })
      .filter((arc) => arc.weeks.length > 0);
  }, [typeFilter, heroFilter, query, spiderSupportFilter]);

  const allVisibleItems = useMemo(
    () => filteredArcs.flatMap((arc) => arc.weeks.flatMap((week) => week.items)),
    [filteredArcs]
  );
  const allItemsOrdered = useMemo(
    () => seed.arcs.flatMap((arc) => arc.weeks.flatMap((week) => week.items)),
    []
  );
  const computedScheduleDates = useMemo(() => {
    const map = {};
    const hasRange = Boolean(customStartDate && customEndDate);
    if (!hasRange) {
      allItemsOrdered.forEach((item) => {
        map[item.id] = item.plannedDate;
      });
      return map;
    }

    const [startY, startM, startD] = customStartDate.split("-").map(Number);
    const [endY, endM, endD] = customEndDate.split("-").map(Number);
    const start = new Date(startY, (startM || 1) - 1, startD || 1);
    const end = new Date(endY, (endM || 1) - 1, endD || 1);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
      allItemsOrdered.forEach((item) => {
        map[item.id] = item.plannedDate;
      });
      return map;
    }

    const arcItems = seed.arcs.map((arc) => arc.weeks.flatMap((week) => week.items));
    const totalItems = arcItems.reduce((sum, items) => sum + items.length, 0);
    const totalDays = Math.max(Math.round((end - start) / 86400000), 0);
    let processedItems = 0;
    arcItems.forEach((items, arcIndex) => {
      const arcCount = items.length;
      const arcStartOffset =
        totalItems <= 0 ? 0 : Math.round((processedItems / totalItems) * totalDays);
      processedItems += arcCount;
      const arcEndOffset =
        arcIndex === arcItems.length - 1
          ? totalDays
          : totalItems <= 0
            ? 0
            : Math.round((processedItems / totalItems) * totalDays);
      const arcSpanDays = Math.max(arcEndOffset - arcStartOffset, 0);

      items.forEach((item, index) => {
        const offsetInArc =
          arcCount <= 1 ? 0 : Math.round((index / (arcCount - 1)) * arcSpanDays);
        const scheduled = new Date(start);
        scheduled.setDate(start.getDate() + arcStartOffset + offsetInArc);
        map[item.id] = scheduled.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        });
      });
    });
    return map;
  }, [allItemsOrdered, customEndDate, customStartDate]);

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

  const persistProgress = async (nextProgress) => {
    setProgress(nextProgress);
    if (supabaseUser && supabase) {
      try {
        await upsertWatchlistProgress(supabase, supabaseUser.id, nextProgress);
      } catch (_error) {
        // Keep optimistic UI; next update retries cloud sync.
      }
      return;
    }
    if (!authToken) {
      saveProgress(nextProgress);
      return;
    }
    try {
      await fetch(`${API_BASE_URL}/api/progress/me`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
        body: JSON.stringify({ progress: nextProgress }),
      });
    } catch (_error) {
      // Keep optimistic UI state even if network call fails.
    }
  };

  const triggerGoogleLogin = () => {
    if (!window.google?.accounts?.id) {
      setAuthError("Google Sign-In is not ready yet.");
      return;
    }
    setAuthError("");
    window.google.accounts.id.prompt();
  };

  const sendMagicLink = async (event) => {
    event?.preventDefault?.();
    if (!supabase) {
      setAuthError("Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
      return;
    }
    const email = magicLinkEmail.trim();
    if (!email) {
      setAuthError("Enter your email address.");
      return;
    }
    setMagicLinkSending(true);
    setAuthError("");
    setMagicLinkInfo("");
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}${window.location.pathname || "/"}`,
        },
      });
      if (error) {
        setAuthError(error.message);
      } else {
        setMagicLinkInfo("Check your email for the sign-in link, then return here.");
      }
    } catch (_error) {
      setAuthError("Could not send magic link. Try again.");
    } finally {
      setMagicLinkSending(false);
    }
  };

  const logout = async () => {
    if (supabase) {
      await supabase.auth.signOut();
    }
    setAuthToken("");
    setSupabaseUser(null);
    setCurrentUser(TEMP_DISABLE_LOGIN_GATE ? "Guest" : "");
    setProgress(TEMP_DISABLE_LOGIN_GATE ? loadProgress() : {});
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
    }
  };

  const updateItemStatus = (itemId) => {
    const next = nextStatus(progress[itemId] || "not_started");
    const nextProgress = { ...progress, [itemId]: next };
    persistProgress(nextProgress);
  };

  const toggleWeek = (weekId) => {
    setExpandedWeeks((prev) => ({ ...prev, [weekId]: !prev[weekId] }));
  };

  const toggleArc = (arcId) => {
    setExpandedArcs((prev) => ({ ...prev, [arcId]: !prev[arcId] }));
  };

  const resetProgress = () => {
    persistProgress({});
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

  if (!currentUser && !TEMP_DISABLE_LOGIN_GATE) {
    if (authChecking) {
      return (
        <div className="app-layout">
          <main className="container auth-container">
            <section className="auth-card">
              <h1>MCU WATCHLIST</h1>
              <p>Restoring your session...</p>
            </section>
          </main>
        </div>
      );
    }
    return (
      <div className="app-layout">
        <main className="container auth-container">
          <section className="auth-card">
            <h1>MCU WATCHLIST</h1>
            <p>
              Sign in to sync progress. Use a free email magic link (Supabase) or Google for leaderboard sync on this
              server.
            </p>
            {isSupabaseConfigured ? (
              <form onSubmit={sendMagicLink} className="auth-magic-form">
                <label htmlFor="magic-link-email-auth">
                  Email (magic link)
                  <input
                    id="magic-link-email-auth"
                    type="email"
                    autoComplete="email"
                    value={magicLinkEmail}
                    onChange={(e) => setMagicLinkEmail(e.target.value)}
                    placeholder="you@example.com"
                  />
                </label>
                <button type="submit" disabled={magicLinkSending}>
                  {magicLinkSending ? "Sending link…" : "Email me a magic link"}
                </button>
              </form>
            ) : null}
            {magicLinkInfo ? <p className="auth-success">{magicLinkInfo}</p> : null}
            {authError ? <p className="auth-error">{authError}</p> : null}
            {GOOGLE_CLIENT_ID ? (
              <>
                <p className="auth-divider">or</p>
                <button type="button" onClick={triggerGoogleLogin} disabled={!googleReady}>
                  {googleReady ? "Continue with Google" : "Loading Google Sign-In…"}
                </button>
              </>
            ) : null}
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="app-layout">
      <main className="container">
      <header className="header hero">
        <div>
          <h1>MCU WATCHLIST</h1>
          <p>
            Signed in as @{currentUser}.
            {supabaseUser
              ? " Progress is saved to your account (email)."
              : authToken
                ? " Progress syncs to leaderboard."
                : TEMP_DISABLE_LOGIN_GATE
                  ? " Progress on this device only."
                  : ""}
          </p>
          {TEMP_DISABLE_LOGIN_GATE && currentUser === "Guest" && isSupabaseConfigured ? (
            <div className="header-magic-wrap">
              <p className="header-magic-hint">Optional: save progress with a free email magic link.</p>
              <form onSubmit={sendMagicLink} className="header-magic-form">
                <input
                  type="email"
                  autoComplete="email"
                  value={magicLinkEmail}
                  onChange={(e) => setMagicLinkEmail(e.target.value)}
                  placeholder="you@example.com"
                />
                <button type="submit" disabled={magicLinkSending}>
                  {magicLinkSending ? "Sending…" : "Magic link"}
                </button>
              </form>
              {magicLinkInfo ? <p className="auth-success">{magicLinkInfo}</p> : null}
              {authError ? <p className="auth-error">{authError}</p> : null}
            </div>
          ) : null}
        </div>
        <div className="header-actions">
          <button onClick={resetProgress}>Reset Progress</button>
          <button onClick={logout}>Logout</button>
        </div>
      </header>

      <section className="controls">
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
          <button
            type="button"
            className={spiderSupportFilter === "spider-support" ? "active" : ""}
            onClick={() =>
              setSpiderSupportFilter((prev) => (prev === "spider-support" ? "all" : "spider-support"))
            }
            title="Show only Spider-Man supporting movies and shows"
          >
            🕷 Spider-Man support only
          </button>
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
        <div className="date-range-controls">
          <label>
            Start Date
            <input
              type="date"
              value={customStartDate}
              onChange={(e) => setCustomStartDate(e.target.value)}
            />
          </label>
          <label>
            End Date
            <input
              type="date"
              value={customEndDate}
              min={customStartDate || undefined}
              onChange={(e) => setCustomEndDate(e.target.value)}
            />
          </label>
          <button onClick={() => {
            setCustomStartDate("");
            setCustomEndDate("");
          }}>
            Use Original Dates
          </button>
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

      <section className="leaderboard">
        <h3>Leaderboard</h3>
        <div className="leaderboard-list">
          {leaderboard.slice(0, 8).map((entry, index) => (
            <article
              key={entry.username}
              className={entry.username === currentUser ? "leaderboard-item current-user" : "leaderboard-item"}
            >
              <span>#{index + 1}</span>
              <strong>{entry.username}</strong>
              <span>{entry.completed} completed</span>
            </article>
          ))}
        </div>
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
                {arc.weeks.map((week, weekIdx) => {
                  const prevTimelineName = weekIdx > 0 ? arc.weeks[weekIdx - 1].timelineName : null;
                  const timelineChanged =
                    Boolean(week.timelineName) && week.timelineName !== prevTimelineName;
                  const mergedEndgameSaga =
                    typeof arc.name === "string" && arc.name.toLowerCase().includes("mcu rewatch");
                  const showTimelineBanner = timelineChanged && !mergedEndgameSaga;
                  const isOpen = expandedWeeks[week.id] ?? !isMobileView;
                  const completedCount = week.items.filter(
                    (item) => progress[item.id] === "completed"
                  ).length;
                  return (
                    <div key={week.id}>
                      {showTimelineBanner ? (
                        <div className="timeline-banner" role="region" aria-label={week.timelineName}>
                          <h3 className="timeline-banner-title">{week.timelineName}</h3>
                          {week.timelineNote ? (
                            <p className="timeline-banner-note">{week.timelineNote}</p>
                          ) : null}
                        </div>
                      ) : null}
                    <div className="week">
                      <button className="week-header" onClick={() => toggleWeek(week.id)}>
                        <span>
                          {mergedEndgameSaga && timelineChanged ? (
                            <span className="week-timeline-chip">{week.timelineName} · </span>
                          ) : null}
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
                                <div className="item-main">
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
                                    {isSpiderSupportItem(item) ? (
                                      <span className="spider-mark" title="Spider-Man support pick" aria-hidden="true">
                                        <svg className="spider-mark-svg" viewBox="0 0 24 24" width="18" height="18" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                                          <circle cx="12" cy="12" r="10" fill="#e50914" opacity="0.25" />
                                          <path d="M12 3v4M12 17v4M5 5l2.5 2.5M16.5 16.5L19 19M3 12h4M17 12h4M5 19l2.5-2.5M16.5 7.5L19 5" stroke="#e50914" strokeWidth="1.6" strokeLinecap="round" />
                                          <circle cx="12" cy="12" r="2.2" fill="#e50914" />
                                        </svg>
                                      </span>
                                    ) : null}
                                  </strong>
                                  <p>{item.duration} · {item.type}</p>
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
                                <span className="item-date">{computedScheduleDates[item.id] || item.plannedDate}</span>
                                <span className={`status-pill ${statusClass[status]}`}>
                                  {statusLabel[status]}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
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

