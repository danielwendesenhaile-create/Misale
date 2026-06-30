/**
 * useDailyDrop
 *
 * 1. Calls generate-daily-drop edge function to ensure today's grid exists.
 * 2. Queries daily_drops (joined with user profiles) to get the full deck.
 * 3. Exposes recordAction() which calls record-drop-action and returns
 *    a MatchResult when a mutual like is detected.
 */

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type {
  ActionResult,
  DropCard,
  MatchResult,
  RawDropRow,
  RecordActionPayload,
} from "../types/discovery";

// ── Hook ──────────────────────────────────────────────────────────────────────

interface UseDailyDropReturn {
  cards: DropCard[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  recordAction: (
    card: DropCard,
    action: "like" | "pass",
  ) => Promise<MatchResult | null>;
}

export function useDailyDrop(): UseDailyDropReturn {
  const [cards,   setCards]   = useState<DropCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  // ── Fetch ───────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) throw new Error("Not authenticated");

      // 1. Ensure today's drop grid is generated
      const { error: fnErr } = await supabase.functions.invoke(
        "generate-daily-drop",
        { method: "POST" },
      );
      // A 409-equivalent ("existing") is fine; only hard errors matter
      if (fnErr && !fnErr.message?.includes("existing")) {
        throw fnErr;
      }

      // 2. Fetch the daily_drops rows joined with candidate user profiles.
      //    We only fetch cards not yet actioned (action_taken IS NULL).
      const today = new Date().toISOString().split("T")[0];
      const { data, error: dbErr } = await supabase
        .from("daily_drops")
        .select(
          `
          id,
          grid_position,
          candidate:candidate_id (
            id, display_name, date_of_birth, age, gender, bio,
            profile_photos, languages, religion, strict_religious_alignment,
            ethnicity, location_tier, country, city, is_verified
          )
        `,
        )
        .eq("user_id", session.user.id)
        .eq("drop_date", today)
        .is("action_taken", null)
        .order("grid_position");

      if (dbErr) throw dbErr;

      // Remap rows, filtering out any with a missing candidate join
      const deck: DropCard[] = ((data ?? []) as unknown as RawDropRow[])
        .filter((row) => row.candidate !== null)
        .map((row) => ({
          dropId:       row.id,
          gridPosition: row.grid_position,
          candidate:    row.candidate!,
        }));

      setCards(deck);
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load your daily drops.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // ── Record action ───────────────────────────────────────────────────────────

  const recordAction = useCallback(
    async (
      card: DropCard,
      action: "like" | "pass",
    ): Promise<MatchResult | null> => {
      const payload: RecordActionPayload = {
        drop_id:        card.dropId,
        target_user_id: card.candidate.id,
        action,
      };

      const { data, error: invokeErr } = await supabase.functions.invoke<ActionResult>(
        "record-drop-action",
        { method: "POST", body: payload },
      );

      if (invokeErr) {
        console.warn("[useDailyDrop] record-drop-action error:", invokeErr.message);
        return null;
      }

      if (data?.matched && data.chat_thread_id) {
        return {
          chat_thread_id: data.chat_thread_id,
          processed_at:   data.processed_at,
        };
      }

      return null;
    },
    [],
  );

  return { cards, loading, error, reload: load, recordAction };
}
