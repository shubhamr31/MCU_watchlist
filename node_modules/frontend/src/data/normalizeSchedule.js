import { RAW_ARCS } from "./rawArcs";

const slugify = (value) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export const buildScheduleSeed = () => {
  const arcs = RAW_ARCS.map((arc, arcIndex) => {
    const arcId = `arc-${arcIndex + 1}-${slugify(arc.name)}`;
    const weeks = arc.weeks.map((week, weekIndex) => {
      const weekId = `${arcId}-week-${weekIndex + 1}`;
      const items = week.rows.map((row, rowIndex) => {
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
        };
      });

      return {
        id: weekId,
        label: week.label,
        dates: week.dates,
        duration: week.dur,
        items,
      };
    });

    return {
      id: arcId,
      name: arc.name,
      emoji: arc.emoji,
      deadline: arc.deadline,
      iso: arc.iso,
      hrs: arc.hrs,
      note: arc.note,
      weeks,
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    arcs,
  };
};

