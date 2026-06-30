/**
 * useMatches
 *
 * Fetches all "matched" threads for the current user with embedded
 * partner profile info, then subscribes to Supabase Realtime so the
 * list refreshes automatically when a new match arrives or an existing
 * thread receives a message.
 *
 * Because user_id_1 and user_id_2 are separate columns (canonical pair
 * ordering), two separate Realtime listeners are registered on the same
 * channel — one for each column.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import type { MatchListItem, RawMatchRow } from "../types/chat";

// ── Hook ──────────────────────────────────────────────────────────────────────

interface UseMatchesReturn {
  matches: MatchListItem[];
  myId:    string | null;
  loading: boolean;
  error:   string | null;
  reload:  () => void;
}

export function useMatches(): UseMatchesReturn {
  const [matches, setMatches] = useState<MatchListItem[]>([]);
  const [myId,    setMyId]    = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const myIdRef    = useRef<string | null>(null);
  const mountedRef = useRef(true);

  // ── Fetch ───────────────────────────────────────────────────────────────────

  const fetchMatches = useCallback(async (uid: string) => {
    if (!mountedRef.current) return;
    setLoading(true);
    setError(null);

    try {
      const { data, error: dbErr } = await supabase
        .from("matches_and_chats")
        .select(
          `id, user_id_1, user_id_2, match_status, matched_at,
           last_message_at, messages, updated_at,
           user1:users!user_id_1(id, display_name, profile_photos, is_verified),
           user2:users!user_id_2(id, display_name, profile_photos, is_verified)`,
        )
        .eq("match_status", "matched")
        .or(`user_id_1.eq.${uid},user_id_2.eq.${uid}`)
        .order("last_message_at", { ascending: false, nullsFirst: false });

      if (dbErr) throw dbErr;

      const rows = (data ?? []) as unknown as RawMatchRow[];

      const items: MatchListItem[] = rows.map((row) => {
        const isUser1   = row.user_id_1 === uid;
        const otherUser = isUser1 ? row.user2 : row.user1;
        const msgs      = Array.isArray(row.messages) ? row.messages : [];
        const lastMsg   = msgs.length > 0 ? msgs[msgs.length - 1]! : null;

        return {
          threadId:      row.id,
          otherUser,
          lastMessage:   lastMsg,
          lastMessageAt: row.last_message_at,
          matchedAt:     row.matched_at ?? row.updated_at,
          isNewMatch:    msgs.length === 0,
          hasUnread:     Boolean(lastMsg && lastMsg.sender_id !== uid),
        };
      });

      if (mountedRef.current) setMatches(items);
    } catch (err: unknown) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : "Failed to load matches.");
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  // ── Realtime subscription ───────────────────────────────────────────────────

  const subscribe = useCallback(
    (uid: string) => {
      channelRef.current?.unsubscribe();

      const handler = () => void fetchMatches(uid);

      channelRef.current = supabase
        .channel(`matches_list:${uid}`)
        // Cover matches where current user is user_id_1
        .on(
          "postgres_changes",
          {
            event:  "*",
            schema: "public",
            table:  "matches_and_chats",
            filter: `user_id_1=eq.${uid}`,
          },
          handler,
        )
        // Cover matches where current user is user_id_2
        .on(
          "postgres_changes",
          {
            event:  "*",
            schema: "public",
            table:  "matches_and_chats",
            filter: `user_id_2=eq.${uid}`,
          },
          handler,
        )
        .subscribe();
    },
    [fetchMatches],
  );

  // ── Mount ───────────────────────────────────────────────────────────────────

  useEffect(() => {
    mountedRef.current = true;

    supabase.auth.getSession().then(({ data: { session } }) => {
      const uid = session?.user?.id;
      if (!uid || !mountedRef.current) return;

      myIdRef.current = uid;
      setMyId(uid);
      void fetchMatches(uid);
      subscribe(uid);
    });

    return () => {
      mountedRef.current = false;
      channelRef.current?.unsubscribe();
    };
  }, [fetchMatches, subscribe]);

  return {
    matches,
    myId,
    loading,
    error,
    reload: () => {
      if (myIdRef.current) void fetchMatches(myIdRef.current);
    },
  };
}
