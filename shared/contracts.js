export const PROGRESS_SCHEMA = {
  version: 1,
  statuses: ["not_started", "watching", "completed"],
};

export const V2_COLLAB_SHAPES = {
  watchlist: {
    id: "string",
    name: "string",
    createdAt: "iso-datetime",
  },
  watchItemProgress: {
    itemId: "string",
    status: "not_started|watching|completed",
    updatedAt: "iso-datetime",
    updatedBy: "optional-display-name",
  },
  shareSession: {
    sessionId: "string",
    watchlistId: "string",
    joinCode: "string",
    createdAt: "iso-datetime",
  },
};

