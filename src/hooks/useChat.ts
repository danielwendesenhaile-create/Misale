/**
 * useChat
 *
 * Manages a single chat thread:
 *  - Fetches initial messages + partner profile.
 *  - Subscribes to Supabase Realtime on matches_and_chats for UPDATE events
 *    so inbound messages stream in without polling.
 *  - Sends messages via supabase.rpc("append_chat_message") for atomic JSONB
 *    append (no read-then-write race conditions).
 *  - Maintains optimistic "sending" state per message; marks "failed" on error.
 *
 * Deduplication strategy:
 *   Server messages live in `serverMessages` state.
 *   Pending messages live in `pendingMessages` state.
 *   The merged `messages` list (useMemo) filters out pending messages whose
 *   body + sender_id already appear in the confirmed server list.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import type { ChatMessage, MatchedUser, RawMatchRow, RawMessage } from "../types/chat";

// ── Return type ───────────────────────────────────────────────────────────────

interface UseChatReturn {
  /** Merged display list — newest message at index 0 (for inverted FlatList) */
  messages:    ChatMessage[];
  otherUser:   MatchedUser | null;
  myId:        string | null;
  loading:     boolean;
  error:       string | null;
  sendMessage: (body: string) => Promise<void>;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useChat(threadId: string): UseChatReturn {
  const [myId,           setMyId]           = useState<string | null>(null);
  const [otherUser,      setOtherUser]      = useState<MatchedUser | null>(null);
  const [serverMessages, setServerMessages] = useState<RawMessage[]>([]);
  const [pendingMessages, setPendingMessages] = useState<ChatMessage[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState<string | null>(null);

  const myIdRef    = useRef<string | null>(null);
  const mountedRef = useRef(true);

  // ── Derived display list ──────────────────────────────────────────────────

  const messages = useMemo((): ChatMessage[] => {
    // Newest server message at index 0 after reversing the oldest-first DB array
    const confirmed: ChatMessage[] = [...serverMessages]
      .reverse()
      .map((m, i) => ({
        local_id:  `sv_${i}_${m.sent_at}`,
        sender_id: m.sender_id,
        body:      m.body,
        sent_at:   m.sent_at,
        status:    "sent" as const,
      }));

    // Keep pending messages that are NOT yet reflected in the server list.
    // Body + sender deduplication is acceptable for 1:1 MVP chat.
    const inFlight = pendingMessages.filter((p) => {
      if (p.status === "failed") return true;
      if (p.status === "sent")   return false;
      return !serverMessages.some(
        (s) => s.body === p.body && s.sender_id === p.sender_id,
      );
    });

    return [...inFlight, ...confirmed];
  }, [serverMessages, pendingMessages]);

  // ── Initial fetch ─────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    if (!mountedRef.current) return;
    setLoading(true);
    setError(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const uid = session?.user?.id;
      if (!uid) throw new Error("Not authenticated");

      myIdRef.current = uid;
      if (mountedRef.current) setMyId(uid);

      const { data, error: dbErr } = await supabase
        .from("matches_and_chats")
        .select(
          `id, user_id_1, user_id_2, messages,
           user1:users!user_id_1(id, display_name, profile_photos, is_verified),
           user2:users!user_id_2(id, display_name, profile_photos, is_verified)`,
        )
        .eq("id", threadId)
        .single();

      if (dbErr) throw dbErr;
      if (!data) throw new Error("Thread not found");

      const row = data as unknown as RawMatchRow;

      if (mountedRef.current) {
        setOtherUser(row.user_id_1 === uid ? row.user2 : row.user1);
        setServerMessages(Array.isArray(row.messages) ? row.messages : []);
      }
    } catch (err: unknown) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : "Failed to load chat.");
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [threadId]);

  useEffect(() => {
    void load();
  }, [load]);

  // ── Realtime subscription ─────────────────────────────────────────────────

  useEffect(() => {
    const channel = supabase
      .channel(`chat_thread:${threadId}`)
      .on(
        "postgres_changes",
        {
          event:  "UPDATE",
          schema: "public",
          table:  "matches_and_chats",
          filter: `id=eq.${threadId}`,
        },
        (payload) => {
          if (!mountedRef.current) return;
          const updated =
            (payload.new as { messages?: RawMessage[] }).messages ?? [];
          setServerMessages(updated);
          // pendingMessages whose body+sender appear in `updated` will be
          // naturally filtered out by the useMemo above on next render
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [threadId]);

  // ── Mount / unmount ───────────────────────────────────────────────────────

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // ── Send message ──────────────────────────────────────────────────────────

  const sendMessage = useCallback(
    async (body: string) => {
      const trimmed = body.trim();
      const uid     = myIdRef.current;
      if (!trimmed || !uid) return;

      // Unique id for optimistic tracking
      const localId  = `pending_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const optimistic: ChatMessage = {
        local_id:  localId,
        sender_id: uid,
        body:      trimmed,
        sent_at:   new Date().toISOString(),
        status:    "sending",
      };

      if (mountedRef.current) {
        setPendingMessages((prev) => [optimistic, ...prev]);
      }

      try {
        const { data: newMsg, error: rpcErr } = await supabase.rpc(
          "append_chat_message",
          {
            p_thread_id: threadId,
            p_sender_id: uid,
            p_body:      trimmed,
          },
        );

        if (rpcErr) throw rpcErr;

        if (mountedRef.current) {
          // Add server-confirmed message to the server list immediately —
          // Realtime will also fire and set the full array, which is fine.
          setServerMessages((prev) => [...prev, newMsg as RawMessage]);
          // Remove from pending (useMemo dedup also handles this, but being
          // explicit avoids a stale "sending" indicator flash)
          setPendingMessages((prev) =>
            prev.filter((m) => m.local_id !== localId),
          );
        }
      } catch {
        if (mountedRef.current) {
          setPendingMessages((prev) =>
            prev.map((m) =>
              m.local_id === localId ? { ...m, status: "failed" } : m,
            ),
          );
        }
      }
    },
    [threadId],
  );

  return { messages, otherUser, myId, loading, error, sendMessage };
}
