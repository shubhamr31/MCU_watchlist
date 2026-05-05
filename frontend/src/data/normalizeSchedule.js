import { RAW_ARCS } from "./rawArcs";

const slugify = (value) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const mapWeekRowsToItems = (week, weekId, arcId) =>
  week.rows.map((row, rowIndex) => {
    const itemId = `${weekId}-item-${rowIndex + 1}-${slugify(row.t)}`;
    return {
      id: itemId,
      title: row.t,
      type: row.film ? "film" : "show",
      arcId,
      weekId,
      plannedDate: row.d,
      duration: row.dur,
      moved: !!row.moved,
      isNew: !!row.isNew,
      essentialBnd: !!row.bnd,
      timelineName: week.timelineName || null,
    };
  });

export const buildScheduleSeed = () => {
  let globalWeekNumber = 1;
  const arcs = RAW_ARCS.map((arc, arcIndex) => {
    const arcId = `arc-${arcIndex + 1}-${slugify(arc.name)}`;

    let weeks = [];

    if (Array.isArray(arc.timelines) && arc.timelines.length > 0) {
      arc.timelines.forEach((timeline) => {
        const timelineSlug = slugify(timeline.name);
        timeline.weeks.forEach((week, weekIndex) => {
          const weekId = `${arcId}-${timelineSlug}-week-${weekIndex + 1}`;
          weeks.push({
            id: weekId,
            label: week.label,
            dates: week.dates,
            duration: week.dur,
            timelineName: timeline.name,
            timelineNote: timeline.note || "",
            items: mapWeekRowsToItems(week, weekId, arcId),
          });
        });
      });
    } else {
      weeks = arc.weeks.map((week, weekIndex) => {
        const weekId = `${arcId}-week-${weekIndex + 1}`;
        return {
          id: weekId,
          label: week.label,
          dates: week.dates,
          duration: week.dur,
          timelineName: null,
          timelineNote: "",
          items: mapWeekRowsToItems(week, weekId, arcId),
        };
      });
    }

    const normalizedWeeks = weeks.map((week) => ({
      ...week,
      // Keep week numbering consistent across both arcs (global sequence).
      label: `Week ${globalWeekNumber++}`,
    }));

    return {
      id: arcId,
      name: arc.name,
      emoji: arc.emoji,
      deadline: arc.deadline,
      iso: arc.iso,
      hrs: arc.hrs,
      note: arc.note,
      weeks: normalizedWeeks,
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    arcs,
  };
};
