import { useMemo, useState } from "react";
import "./timeline.css";

/**
 * "Sacred Timeline" view: a single glowing path through every film and series.
 * - Films become one node each.
 * - Consecutive episodes of the same show + season collapse into one node
 *   (expand it to see / toggle individual episodes).
 * - Item ids are untouched, so progress, cloud sync and watch parties keep working.
 */

const STATUS_LABEL = {
  not_started: "Not started",
  watching: "Watching",
  completed: "Completed",
};

const parseMinutes = (duration = "") => {
  const h = duration.match(/(\d+)h/);
  const m = duration.match(/(\d+)m/);
  return (h ? Number(h[1]) : 0) * 60 + (m ? Number(m[1]) : 0);
};

const formatMinutes = (minutes) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${String(m).padStart(2, "0")}m`;
};

const SEASON_RE = /\sS(\d+)\s*Ep\d+$/i;
const EPISODE_RE = /Ep(\d+)$/i;

const episodeNumber = (title, fallback) => {
  const match = title.match(EPISODE_RE);
  return match ? Number(match[1]) : fallback;
};

const groupStatus = (items, progress) => {
  const done = items.filter((item) => progress[item.id] === "completed").length;
  const active = items.filter((item) => progress[item.id] === "watching").length;
  if (done === items.length) return "completed";
  if (done > 0 || active > 0) return "watching";
  return "not_started";
};

/** Turn one arc's weeks into an ordered list of saga markers + film/show nodes. */
const buildArcNodes = (arc, helpers) => {
  const nodes = [];
  let lastSaga = null;
  let current = null;

  arc.weeks.forEach((week) => {
    if (week.timelineName && week.timelineName !== lastSaga) {
      lastSaga = week.timelineName;
      current = null;
      nodes.push({
        kind: "saga",
        key: `saga-${arc.id}-${week.timelineName}`,
        name: week.timelineName,
        note: week.timelineNote,
      });
    }

    week.items.forEach((item) => {
      if (item.type === "film") {
        current = null;
        nodes.push({
          kind: "film",
          key: item.id,
          title: helpers.normalizeTitle(item),
          items: [item],
        });
        return;
      }

      const showTitle = helpers.normalizeTitle(item);
      const seasonMatch = item.title.match(SEASON_RE);
      const season = seasonMatch ? Number(seasonMatch[1]) : null;
      const groupKey = `${showTitle}::${season ?? 0}`;

      if (current && current.groupKey === groupKey) {
        current.items.push(item);
      } else {
        current = {
          kind: "show",
          key: item.id,
          groupKey,
          title: showTitle,
          season,
          items: [item],
        };
        nodes.push(current);
      }
    });
  });

  return nodes;
};

const daysUntil = (iso) => {
  if (!iso) return null;
  const target = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  return Math.ceil((target.getTime() - Date.now()) / 86400000);
};

function StatusPill({ status }) {
  return <span className={`tl-pill tl-pill--${status}`}>{STATUS_LABEL[status]}</span>;
}

function Poster({ url, alt }) {
  return (
    <img
      className="tl-poster"
      src={url}
      alt={alt}
      loading="lazy"
      onError={(event) => {
        event.currentTarget.onerror = null;
        event.currentTarget.src = "/posters/fallback.svg";
      }}
    />
  );
}

function FilmNode({ node, side, progress, helpers, onCycleItem, isSignedIn }) {
  const item = node.items[0];
  const status = progress[item.id] || "not_started";
  return (
    <div className="tl-node" data-side={side}>
      <span className={`tl-dot tl-dot--${status}`} aria-hidden="true" />
      <article className={`tl-card tl-card--film tl-card--${status}`}>
        <Poster url={helpers.getPosterUrl(item)} alt={`${node.title} poster`} />
        <div className="tl-card-body">
          <p className="tl-kicker">
            Film · {helpers.getDateLabel(item)}
            {helpers.isSpiderSupport(item) ? <span className="tl-spider" title="Spider-Man support pick"> 🕷</span> : null}
          </p>
          <h3 className="tl-title">{item.title}</h3>
          <p className="tl-meta">
            {item.duration} · Released {helpers.getReleaseLabel(item)}
          </p>
          <div className="tl-actions">
            <button
              type="button"
              className={`tl-status-btn tl-status-btn--${status}`}
              onClick={() => onCycleItem(item.id)}
              title={isSignedIn ? "Click to change status" : "Sign in to track your progress"}
            >
              <StatusPill status={status} />
            </button>
            <a
              className="tl-link"
              href={helpers.getWatchUrl(item)}
              target="_blank"
              rel="noreferrer"
            >
              Watch now ↗
            </a>
          </div>
        </div>
      </article>
    </div>
  );
}

function ShowNode({ node, side, progress, helpers, onCycleItem, onBulkSet, isSignedIn }) {
  // Episodes are visible by default so every series reads like Daredevil S1.
  const [open, setOpen] = useState(true);
  const { items } = node;
  const first = items[0];
  const last = items[items.length - 1];
  const status = groupStatus(items, progress);
  const done = items.filter((item) => progress[item.id] === "completed").length;
  const percent = Math.round((done / items.length) * 100);
  const minutes = items.reduce((sum, item) => sum + parseMinutes(item.duration), 0);
  const firstDate = helpers.getDateLabel(first);
  const lastDate = helpers.getDateLabel(last);
  const dateRange = firstDate === lastDate ? firstDate : `${firstDate} → ${lastDate}`;
  const seasonLabel = node.season ? `Season ${node.season}` : "Series";

  return (
    <div className="tl-node" data-side={side}>
      <span className={`tl-dot tl-dot--${status}`} aria-hidden="true" />
      <article className={`tl-card tl-card--show tl-card--${status}`}>
        <Poster url={helpers.getPosterUrl(first)} alt={`${node.title} poster`} />
        <div className="tl-card-body">
          <p className="tl-kicker">
            {seasonLabel} · {items.length} ep · {formatMinutes(minutes)}
          </p>
          <h3 className="tl-title">{node.title}</h3>
          <p className="tl-meta">
            {dateRange} · Released {helpers.getReleaseLabel(first)}
          </p>

          <div
            className="tl-progress"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={items.length}
            aria-valuenow={done}
            aria-label={`${node.title} ${seasonLabel} progress`}
          >
            <span style={{ width: `${percent}%` }} />
          </div>
          <p className="tl-meta tl-meta--small">
            {done}/{items.length} watched · <StatusPill status={status} />
          </p>

          <div className="tl-actions">
            <button
              type="button"
              className="tl-btn"
              aria-expanded={open}
              onClick={() => setOpen((prev) => !prev)}
            >
              {open ? "Hide episodes" : "Show episodes"}
            </button>
            <button
              type="button"
              className="tl-btn"
              onClick={() =>
                onBulkSet(
                  items.map((item) => item.id),
                  done === items.length ? "not_started" : "completed"
                )
              }
              title={isSignedIn ? undefined : "Sign in to track your progress"}
            >
              {done === items.length ? "Reset season" : "Mark all watched"}
            </button>
            <a
              className="tl-link"
              href={helpers.getWatchUrl(first)}
              target="_blank"
              rel="noreferrer"
            >
              Watch now ↗
            </a>
          </div>

          {open ? (
            <ol className="tl-episodes">
              {items.map((item, index) => {
                const epStatus = progress[item.id] || "not_started";
                const number = episodeNumber(item.title, index + 1);
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      className={`tl-ep tl-ep--${epStatus}`}
                      onClick={() => onCycleItem(item.id)}
                      title={`${item.title} · ${item.duration} · ${STATUS_LABEL[epStatus]}`}
                      aria-label={`${item.title}, ${STATUS_LABEL[epStatus]}`}
                    >
                      {number}
                    </button>
                  </li>
                );
              })}
            </ol>
          ) : null}
        </div>
      </article>
    </div>
  );
}

function ArcTimeline({ arc, isLastArc, progress, helpers, onCycleItem, onBulkSet, isSignedIn }) {
  const nodes = useMemo(() => buildArcNodes(arc, helpers), [arc, helpers]);
  const allItems = useMemo(() => nodes.flatMap((node) => node.items || []), [nodes]);
  const done = allItems.filter((item) => progress[item.id] === "completed").length;
  const films = nodes.filter((node) => node.kind === "film").length;
  const shows = nodes.filter((node) => node.kind === "show").length;
  const remainingDays = isLastArc ? daysUntil(arc.iso) : null;

  // Alternate sides only for playable nodes so saga markers stay centred.
  let sideIndex = 0;

  return (
    <section className="tl-arc" aria-label={arc.name}>
      <header className="tl-arc-header">
        <p className="tl-arc-kicker">{arc.emoji} Chapter</p>
        <h2>{arc.name}</h2>
        <p className="tl-arc-meta">
          {films} films · {shows} series seasons · {done}/{allItems.length} watched
          {arc.deadline ? ` · Deadline ${arc.deadline}` : ""}
        </p>
      </header>

      <div className="tl-track">
        {nodes.map((node) => {
          if (node.kind === "saga") {
            return (
              <div className="tl-saga" key={node.key}>
                <span className="tl-saga-label">{node.name}</span>
                {node.note ? <p>{node.note}</p> : null}
              </div>
            );
          }
          const side = sideIndex % 2 === 0 ? "left" : "right";
          sideIndex += 1;
          const common = { side, progress, helpers, onCycleItem, isSignedIn };
          return node.kind === "film" ? (
            <FilmNode key={node.key} node={node} {...common} />
          ) : (
            <ShowNode key={node.key} node={node} onBulkSet={onBulkSet} {...common} />
          );
        })}

        {isLastArc && arc.deadline ? (
          <div className="tl-finale">
            <span className="tl-finale-eyebrow">The path ends</span>
            <strong>Avengers: Doomsday</strong>
            <span>
              {arc.deadline}
              {remainingDays !== null
                ? remainingDays > 0
                  ? ` · ${remainingDays} day${remainingDays === 1 ? "" : "s"} to go`
                  : " · Now in theatres"
                : ""}
            </span>
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function TimelineView({
  arcs,
  progress,
  helpers,
  onCycleItem,
  onBulkSet,
  isSignedIn,
}) {
  if (!arcs.length) {
    return (
      <section className="tl-empty">
        <p>No titles match your filters. The timeline is quiet... for now.</p>
      </section>
    );
  }

  return (
    <div className="tl">
      {arcs.map((arc, index) => (
        <ArcTimeline
          key={arc.id}
          arc={arc}
          isLastArc={index === arcs.length - 1}
          progress={progress}
          helpers={helpers}
          onCycleItem={onCycleItem}
          onBulkSet={onBulkSet}
          isSignedIn={isSignedIn}
        />
      ))}
    </div>
  );
}
