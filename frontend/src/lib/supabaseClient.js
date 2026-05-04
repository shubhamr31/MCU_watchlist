import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL || "";
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase = isSupabaseConfigured ? createClient(url, anonKey) : null;

export const WATCHLIST_PROGRESS_TABLE = "watchlist_progress";

export async function fetchWatchlistProgress(client, userId) {
  const { data, error } = await client
    .from(WATCHLIST_PROGRESS_TABLE)
    .select("progress")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    throw error;
  }
  if (data?.progress && typeof data.progress === "object") {
    return data.progress;
  }
  return null;
}

export async function upsertWatchlistProgress(client, userId, progress) {
  const { error } = await client.from(WATCHLIST_PROGRESS_TABLE).upsert(
    {
      user_id: userId,
      progress,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );
  if (error) {
    throw error;
  }
}
