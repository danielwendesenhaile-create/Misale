/**
 * VerificationDashboard — admin-only identity review queue.
 *
 * Security model:
 *   Role is read from auth.getUser() → app_metadata.role.
 *   Non-admin/moderator users see a permission-denied screen immediately.
 *   All data fetches and mutations call SECURITY DEFINER Postgres RPCs
 *   (get_verification_queue, process_verification) which enforce the same
 *   role check at the DB layer — the client check is UX only, never the
 *   sole security gate.
 *
 * Note on the admin-verify-user edge function:
 *   That function requires the Supabase service role key as its Bearer token.
 *   The service role key MUST NOT be bundled into the mobile app. The
 *   process_verification() Postgres RPC performs identical logic and is
 *   callable via supabase.rpc() using the admin user's JWT.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Image,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { supabase } from "../../lib/supabase";
import type {
  AdminAppMetadata,
  AdminRole,
  PendingVerification,
  ProcessVerificationResult,
  VerificationDecision,
} from "../../types/admin";

// ── Role helpers ──────────────────────────────────────────────────────────────

const ALLOWED_ROLES: AdminRole[] = ["admin", "moderator"];

function isAdminRole(role: string | null | undefined): role is AdminRole {
  return role != null && ALLOWED_ROLES.includes(role as AdminRole);
}

// ── Skeleton loader ───────────────────────────────────────────────────────────

function SkeletonBlock({
  width,
  height,
  radius = 8,
  style,
}: {
  width: number | `${number}%`;
  height: number;
  radius?: number;
  style?: object;
}) {
  const opacity = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue:         0.7,
          duration:        750,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue:         0.35,
          duration:        750,
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius:    radius,
          backgroundColor: "#2E2B28",
          opacity,
        },
        style,
      ]}
    />
  );
}

function SkeletonCard() {
  return (
    <View style={skelStyles.card}>
      {/* Image pair */}
      <View style={skelStyles.imageRow}>
        <SkeletonBlock width="48%" height={160} radius={12} />
        <SkeletonBlock width="48%" height={160} radius={12} />
      </View>
      {/* Meta */}
      <View style={skelStyles.meta}>
        <SkeletonBlock width={140} height={18} radius={6} />
        <SkeletonBlock width={200} height={14} radius={6} style={{ marginTop: 8 }} />
        <View style={skelStyles.badgeRow}>
          <SkeletonBlock width={72} height={26} radius={13} />
          <SkeletonBlock width={88} height={26} radius={13} />
          <SkeletonBlock width={64} height={26} radius={13} />
        </View>
      </View>
      {/* Buttons */}
      <View style={skelStyles.actions}>
        <SkeletonBlock width="48%" height={48} radius={12} />
        <SkeletonBlock width="48%" height={48} radius={12} />
      </View>
    </View>
  );
}

const skelStyles = StyleSheet.create({
  card: {
    backgroundColor:   "#1A1917",
    borderRadius:      20,
    marginHorizontal:  16,
    marginBottom:      16,
    padding:           16,
    gap:               14,
  },
  imageRow: {
    flexDirection:  "row",
    justifyContent: "space-between",
  },
  meta: {
    gap: 0,
  },
  badgeRow: {
    flexDirection: "row",
    gap:           8,
    marginTop:     12,
  },
  actions: {
    flexDirection:  "row",
    justifyContent: "space-between",
    gap:            10,
  },
});

// ── Badge ─────────────────────────────────────────────────────────────────────

function MetaBadge({
  icon,
  label,
  color = "#4A4744",
}: {
  icon:   string;
  label:  string;
  color?: string;
}) {
  if (!label) return null;
  return (
    <View style={[badgeStyles.badge, { borderColor: color + "44" }]}>
      <Text style={badgeStyles.icon}>{icon}</Text>
      <Text style={[badgeStyles.label, { color }]}>{label}</Text>
    </View>
  );
}

const badgeStyles = StyleSheet.create({
  badge: {
    flexDirection:     "row",
    alignItems:        "center",
    gap:               5,
    borderRadius:      20,
    paddingHorizontal: 10,
    paddingVertical:   5,
    borderWidth:       1,
    backgroundColor:   "rgba(255,255,255,0.04)",
  },
  icon:  { fontSize: 11, lineHeight: 14 },
  label: { fontSize: 11, fontWeight: "600" },
});

// ── Photo comparison panel ────────────────────────────────────────────────────

function PhotoPanel({
  label,
  uri,
}: {
  label: string;
  uri:   string | null;
}) {
  return (
    <View style={photoStyles.wrap}>
      <Text style={photoStyles.label}>{label}</Text>
      {uri ? (
        <Image source={{ uri }} style={photoStyles.image} resizeMode="cover" />
      ) : (
        <View style={[photoStyles.image, photoStyles.placeholder]}>
          <Text style={photoStyles.placeholderIcon}>📷</Text>
          <Text style={photoStyles.placeholderText}>No photo</Text>
        </View>
      )}
    </View>
  );
}

const photoStyles = StyleSheet.create({
  wrap: {
    flex:  1,
    gap:   6,
  },
  label: {
    fontSize:      10,
    fontWeight:    "700",
    color:         "#7A7066",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  image: {
    width:        "100%",
    aspectRatio:  0.9,
    borderRadius: 12,
    backgroundColor: "#242220",
  },
  placeholder: {
    alignItems:     "center",
    justifyContent: "center",
    gap:            6,
  },
  placeholderIcon: { fontSize: 28 },
  placeholderText: { fontSize: 11, color: "#4A4744" },
});

// ── Verification card ─────────────────────────────────────────────────────────

interface CardState {
  processingDecision: VerificationDecision | null;
  error:              string | null;
  done:               boolean;
}

function VerificationCard({
  item,
  onDecision,
}: {
  item:       PendingVerification;
  onDecision: (id: string, decision: VerificationDecision) => void;
}) {
  const [state, setState] = useState<CardState>({
    processingDecision: null,
    error:              null,
    done:               false,
  });

  const name        = item.display_name ?? item.full_name;
  const profilePhoto = item.profile_photos[0] ?? null;
  const submitted   = new Date(item.submitted_at).toLocaleDateString([], {
    month: "short",
    day:   "numeric",
    year:  "numeric",
  });

  const locationLabel =
    item.location_tier === "Local_Ethiopia"
      ? item.city ?? "Ethiopia"
      : item.country ?? "Diaspora";

  const handlePress = useCallback(
    async (decision: VerificationDecision) => {
      setState({ processingDecision: decision, error: null, done: false });

      const { data, error: rpcErr } = await supabase.rpc(
        "process_verification",
        {
          p_target_user_id: item.user_id,
          p_status:         decision,
          p_admin_notes:    null,
          p_reviewed_by:    "admin_app",
        },
      );

      if (rpcErr || !(data as ProcessVerificationResult | null)?.success) {
        setState({
          processingDecision: null,
          error:              rpcErr?.message ?? "Action failed. Try again.",
          done:               false,
        });
        return;
      }

      // Signal the parent to remove this card
      setState({ processingDecision: null, error: null, done: true });
      onDecision(item.verification_id, decision);
    },
    [item, onDecision],
  );

  if (state.done) return null;

  const isProcessing = state.processingDecision !== null;

  return (
    <View style={cardStyles.card}>
      {/* ── Submitted timestamp ──────────────────────────────────────── */}
      <Text style={cardStyles.timestamp}>Submitted {submitted}</Text>

      {/* ── Side-by-side photo comparison ────────────────────────────── */}
      <View style={cardStyles.photoRow}>
        <PhotoPanel label="Live selfie" uri={item.selfie_url} />
        <View style={cardStyles.photoGap} />
        <PhotoPanel label="Profile photo" uri={profilePhoto} />
      </View>

      {/* ── Identity metadata ─────────────────────────────────────────── */}
      <View style={cardStyles.meta}>
        <Text style={cardStyles.name} numberOfLines={1}>
          {name}
        </Text>
        <Text style={cardStyles.subName} numberOfLines={1}>
          {item.full_name}
        </Text>
        <View style={cardStyles.badgeRow}>
          <MetaBadge icon="🎂" label={`${item.age} yrs`} color="#D4A843" />
          {item.religion && item.religion !== "None" && (
            <MetaBadge icon="✝" label={item.religion} color="#A09585" />
          )}
          <MetaBadge
            icon={item.location_tier === "Local_Ethiopia" ? "🇪🇹" : "🌍"}
            label={locationLabel}
            color="#7A9BA0"
          />
        </View>
      </View>

      {/* ── Error ────────────────────────────────────────────────────── */}
      {state.error && (
        <View style={cardStyles.errorRow}>
          <Text style={cardStyles.errorText}>⚠ {state.error}</Text>
        </View>
      )}

      {/* ── Action buttons ────────────────────────────────────────────── */}
      <View style={cardStyles.actions}>
        {/* Reject */}
        <Pressable
          style={({ pressed }) => [
            cardStyles.btn,
            cardStyles.rejectBtn,
            (isProcessing || pressed) && cardStyles.btnPressed,
          ]}
          onPress={() => void handlePress("rejected")}
          disabled={isProcessing}
        >
          {state.processingDecision === "rejected" ? (
            <ActivityIndicator size="small" color="#E05A5A" />
          ) : (
            <>
              <Text style={[cardStyles.btnIcon, cardStyles.rejectIcon]}>✕</Text>
              <Text style={[cardStyles.btnLabel, cardStyles.rejectLabel]}>
                Reject
              </Text>
            </>
          )}
        </Pressable>

        {/* Approve */}
        <Pressable
          style={({ pressed }) => [
            cardStyles.btn,
            cardStyles.approveBtn,
            (isProcessing || pressed) && cardStyles.btnPressed,
          ]}
          onPress={() => void handlePress("approved")}
          disabled={isProcessing}
        >
          {state.processingDecision === "approved" ? (
            <ActivityIndicator size="small" color="#0D0C0B" />
          ) : (
            <>
              <Text style={[cardStyles.btnIcon, cardStyles.approveIcon]}>✓</Text>
              <Text style={[cardStyles.btnLabel, cardStyles.approveLabel]}>
                Approve Profile
              </Text>
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const cardStyles = StyleSheet.create({
  card: {
    backgroundColor:   "#1A1917",
    borderRadius:      20,
    marginHorizontal:  16,
    marginBottom:      16,
    padding:           16,
    gap:               14,

    shadowColor:   "#000",
    shadowOffset:  { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius:  10,
    elevation:     6,
  },

  timestamp: {
    fontSize:   11,
    fontWeight: "600",
    color:      "#4A4744",
    letterSpacing: 0.5,
  },

  photoRow: {
    flexDirection: "row",
    alignItems:    "stretch",
  },
  photoGap: {
    width: 10,
  },

  meta: {
    gap: 4,
  },
  name: {
    fontSize:    18,
    fontWeight:  "700",
    color:       "#F5F0E8",
    lineHeight:  24,
    includeFontPadding: false,
  },
  subName: {
    fontSize:   13,
    color:      "#7A7066",
    lineHeight: 18,
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap:      "wrap",
    gap:           8,
    marginTop:     6,
  },

  errorRow: {
    backgroundColor: "rgba(224,90,90,0.12)",
    borderRadius:    10,
    paddingHorizontal: 12,
    paddingVertical:   8,
    borderWidth:     1,
    borderColor:     "rgba(224,90,90,0.3)",
  },
  errorText: {
    fontSize:   13,
    color:      "#E05A5A",
    lineHeight: 18,
  },

  actions: {
    flexDirection: "row",
    gap:           10,
  },
  btn: {
    flex:            1,
    height:          50,
    borderRadius:    14,
    flexDirection:   "row",
    alignItems:      "center",
    justifyContent:  "center",
    gap:             6,
  },
  btnPressed: {
    opacity: 0.7,
  },

  rejectBtn: {
    backgroundColor: "transparent",
    borderWidth:     1.5,
    borderColor:     "#E05A5A",
  },
  rejectIcon:  { color: "#E05A5A" },
  rejectLabel: { color: "#E05A5A" },

  approveBtn: {
    backgroundColor: "#3A7D44",
    shadowColor:     "#3A7D44",
    shadowOffset:    { width: 0, height: 2 },
    shadowOpacity:   0.4,
    shadowRadius:    6,
    elevation:       4,
  },
  approveIcon:  { color: "#E8F5EA", fontSize: 16 },
  approveLabel: { color: "#E8F5EA" },

  btnIcon: {
    fontSize:   15,
    fontWeight: "700",
    lineHeight: 18,
  },
  btnLabel: {
    fontSize:   14,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
});

// ── Permission denied screen ──────────────────────────────────────────────────

function PermissionDenied() {
  return (
    <SafeAreaView style={denyStyles.fill}>
      <View style={denyStyles.content}>
        <View style={denyStyles.iconWrap}>
          <Text style={denyStyles.icon}>🔒</Text>
        </View>
        <Text style={denyStyles.headline}>Access Restricted</Text>
        <Text style={denyStyles.sub}>
          This dashboard is only accessible to administrators and moderators.
          {"\n\n"}
          Contact your system administrator if you believe you should have access.
        </Text>
        <View style={denyStyles.badge}>
          <Text style={denyStyles.badgeText}>ምሳሌ Admin Portal</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const denyStyles = StyleSheet.create({
  fill: {
    flex:            1,
    backgroundColor: "#0D0C0B",
  },
  content: {
    flex:            1,
    alignItems:      "center",
    justifyContent:  "center",
    paddingHorizontal: 40,
    gap:             16,
  },
  iconWrap: {
    width:           80,
    height:          80,
    borderRadius:    40,
    backgroundColor: "#1A1917",
    alignItems:      "center",
    justifyContent:  "center",
    marginBottom:    8,
  },
  icon:     { fontSize: 36 },
  headline: { fontSize: 22, fontWeight: "800", color: "#F5F0E8", textAlign: "center" },
  sub: {
    fontSize:   14,
    color:      "#7A7066",
    textAlign:  "center",
    lineHeight: 22,
  },
  badge: {
    marginTop:         16,
    paddingVertical:   8,
    paddingHorizontal: 20,
    borderRadius:      20,
    borderWidth:       1,
    borderColor:       "#2E2B28",
  },
  badgeText: {
    fontSize:      12,
    color:         "#C9933A",
    fontWeight:    "700",
    letterSpacing: 1.5,
  },
});

// ── Main screen ───────────────────────────────────────────────────────────────

interface VerificationDashboardProps {
  onBack?: () => void;
}

export function VerificationDashboard({ onBack }: VerificationDashboardProps) {
  // ── Auth / role check ─────────────────────────────────────────────────────

  const [role,        setRole]        = useState<string | null | undefined>(undefined);
  const [queue,       setQueue]       = useState<PendingVerification[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const mountedRef = useRef(true);

  // ── Fetch queue ───────────────────────────────────────────────────────────

  const fetchQueue = useCallback(async () => {
    if (!mountedRef.current) return;
    setLoading(true);
    setError(null);

    try {
      const { data, error: rpcErr } = await supabase.rpc(
        "get_verification_queue",
      );

      if (rpcErr) throw rpcErr;

      if (mountedRef.current) {
        setQueue((data ?? []) as PendingVerification[]);
        setLastRefresh(new Date());
      }
    } catch (err: unknown) {
      if (mountedRef.current) {
        setError(
          err instanceof Error ? err.message : "Failed to load verification queue.",
        );
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  // ── Mount: check role then fetch ──────────────────────────────────────────

  useEffect(() => {
    mountedRef.current = true;

    const init = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const appMeta = (user?.app_metadata ?? {}) as AdminAppMetadata;
      const userRole = appMeta.role;

      if (!mountedRef.current) return;
      setRole(userRole ?? null);

      if (isAdminRole(userRole)) {
        await fetchQueue();
      } else {
        if (mountedRef.current) setLoading(false);
      }
    };

    void init();

    return () => {
      mountedRef.current = false;
    };
  }, [fetchQueue]);

  // ── Decision callback — optimistic remove ─────────────────────────────────

  const handleDecision = useCallback(
    (_verificationId: string, _decision: VerificationDecision) => {
      setQueue((prev) =>
        prev.filter((item) => item.verification_id !== _verificationId),
      );
    },
    [],
  );

  // ── Render: still resolving role ──────────────────────────────────────────

  if (role === undefined) {
    return (
      <SafeAreaView style={styles.fill}>
        <View style={styles.centred}>
          <ActivityIndicator size="large" color="#C9933A" />
        </View>
      </SafeAreaView>
    );
  }

  // ── Render: permission denied ─────────────────────────────────────────────

  if (!isAdminRole(role)) {
    return <PermissionDenied />;
  }

  // ── Render: dashboard ─────────────────────────────────────────────────────

  const refreshLabel = lastRefresh
    ? `Updated ${lastRefresh.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
    : "";

  return (
    <SafeAreaView style={styles.fill}>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          {onBack && (
            <Pressable
              style={({ pressed }) => [styles.backBtn, pressed && styles.backPressed]}
              onPress={onBack}
              hitSlop={12}
            >
              <Text style={styles.backIcon}>‹</Text>
            </Pressable>
          )}
          <View>
            <Text style={styles.wordmark}>ምሳሌ</Text>
            <Text style={styles.headerSub}>Admin Portal</Text>
          </View>
        </View>

        <View style={styles.headerRight}>
          {/* Role chip */}
          <View style={styles.roleChip}>
            <Text style={styles.roleText}>{role.toUpperCase()}</Text>
          </View>

          {/* Refresh */}
          <Pressable
            style={({ pressed }) => [styles.refreshBtn, pressed && { opacity: 0.6 }]}
            onPress={() => void fetchQueue()}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#C9933A" />
            ) : (
              <Text style={styles.refreshIcon}>↻</Text>
            )}
          </Pressable>
        </View>
      </View>

      {/* ── Queue stats ──────────────────────────────────────────────────── */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{loading ? "—" : queue.length}</Text>
          <Text style={styles.statLabel}>Pending</Text>
        </View>
        <Text style={styles.refreshLabel}>{refreshLabel}</Text>
      </View>

      {/* ── Section title ─────────────────────────────────────────────────── */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Verification Queue</Text>
        <Text style={styles.sectionSub}>
          Review selfie vs profile photo — approve or reject
        </Text>
      </View>

      {/* ── Loading skeletons ────────────────────────────────────────────── */}
      {loading && !error && (
        <View style={styles.skeletonList}>
          <SkeletonCard />
          <SkeletonCard />
        </View>
      )}

      {/* ── Error state ──────────────────────────────────────────────────── */}
      {!loading && error && (
        <View style={styles.centred}>
          <Text style={styles.errorIcon}>⚠️</Text>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable
            style={({ pressed }) => [styles.retryBtn, pressed && { opacity: 0.7 }]}
            onPress={() => void fetchQueue()}
          >
            <Text style={styles.retryText}>Try Again</Text>
          </Pressable>
        </View>
      )}

      {/* ── Empty queue ──────────────────────────────────────────────────── */}
      {!loading && !error && queue.length === 0 && (
        <View style={styles.centred}>
          <Text style={styles.emptyIcon}>✅</Text>
          <Text style={styles.emptyHeadline}>Queue Clear</Text>
          <Text style={styles.emptySub}>
            All verification submissions have been reviewed.{"\n"}
            Check back later or pull to refresh.
          </Text>
        </View>
      )}

      {/* ── Queue list ───────────────────────────────────────────────────── */}
      {!loading && !error && queue.length > 0 && (
        <FlatList
          data={queue}
          keyExtractor={(item) => item.verification_id}
          renderItem={({ item }) => (
            <VerificationCard item={item} onDecision={handleDecision} />
          )}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          // FlatList perf
          removeClippedSubviews
          maxToRenderPerBatch={5}
          windowSize={5}
        />
      )}
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  fill: {
    flex:            1,
    backgroundColor: "#0D0C0B",
  },
  centred: {
    flex:            1,
    alignItems:      "center",
    justifyContent:  "center",
    gap:             14,
    paddingHorizontal: 32,
  },

  // ── Header ───────────────────────────────────────────────────────────

  header: {
    flexDirection:     "row",
    alignItems:        "center",
    justifyContent:    "space-between",
    paddingHorizontal: 20,
    paddingTop:        14,
    paddingBottom:     12,
    borderBottomWidth: 1,
    borderBottomColor: "#1A1917",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems:    "center",
    gap:           12,
  },
  backBtn: {
    width:          32,
    height:         32,
    alignItems:     "center",
    justifyContent: "center",
  },
  backPressed: { opacity: 0.6 },
  backIcon: {
    fontSize:   26,
    color:      "#F5F0E8",
    lineHeight: 30,
    fontWeight: "300",
  },
  wordmark: {
    fontSize:      20,
    fontWeight:    "800",
    color:         "#C9933A",
    letterSpacing: 1.5,
    lineHeight:    24,
  },
  headerSub: {
    fontSize:      9,
    fontWeight:    "700",
    color:         "#4A4744",
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  headerRight: {
    flexDirection: "row",
    alignItems:    "center",
    gap:           10,
  },
  roleChip: {
    paddingVertical:   4,
    paddingHorizontal: 10,
    borderRadius:      10,
    backgroundColor:   "rgba(201,147,58,0.18)",
    borderWidth:       1,
    borderColor:       "rgba(201,147,58,0.4)",
  },
  roleText: {
    fontSize:      9,
    fontWeight:    "800",
    color:         "#C9933A",
    letterSpacing: 1.2,
  },
  refreshBtn: {
    width:          36,
    height:         36,
    alignItems:     "center",
    justifyContent: "center",
  },
  refreshIcon: {
    fontSize:   22,
    color:      "#C9933A",
    lineHeight: 26,
  },

  // ── Stats row ────────────────────────────────────────────────────────

  statsRow: {
    flexDirection:     "row",
    alignItems:        "center",
    justifyContent:    "space-between",
    paddingHorizontal: 20,
    paddingVertical:   12,
    borderBottomWidth: 1,
    borderBottomColor: "#1A1917",
  },
  statCard: {
    flexDirection: "row",
    alignItems:    "baseline",
    gap:           6,
  },
  statNumber: {
    fontSize:   24,
    fontWeight: "800",
    color:      "#F5F0E8",
    lineHeight: 28,
  },
  statLabel: {
    fontSize:   13,
    color:      "#7A7066",
    fontWeight: "500",
  },
  refreshLabel: {
    fontSize:   11,
    color:      "#4A4744",
    fontWeight: "500",
  },

  // ── Section header ───────────────────────────────────────────────────

  sectionHeader: {
    paddingHorizontal: 20,
    paddingTop:        16,
    paddingBottom:     12,
    gap:               3,
  },
  sectionTitle: {
    fontSize:   16,
    fontWeight: "700",
    color:      "#F5F0E8",
  },
  sectionSub: {
    fontSize:   12,
    color:      "#7A7066",
    lineHeight: 17,
  },

  // ── Skeleton ─────────────────────────────────────────────────────────

  skeletonList: {
    paddingTop: 4,
  },

  // ── Error state ──────────────────────────────────────────────────────

  errorIcon:  { fontSize: 36 },
  errorText: {
    fontSize:   14,
    color:      "#7A7066",
    textAlign:  "center",
    lineHeight: 21,
  },
  retryBtn: {
    paddingVertical:   10,
    paddingHorizontal: 24,
    borderRadius:      12,
    borderWidth:       1.5,
    borderColor:       "#C9933A",
  },
  retryText: {
    fontSize:   14,
    fontWeight: "600",
    color:      "#C9933A",
  },

  // ── Empty state ──────────────────────────────────────────────────────

  emptyIcon: { fontSize: 44 },
  emptyHeadline: {
    fontSize:   18,
    fontWeight: "700",
    color:      "#F5F0E8",
    textAlign:  "center",
  },
  emptySub: {
    fontSize:   13,
    color:      "#7A7066",
    textAlign:  "center",
    lineHeight: 20,
  },

  // ── List ─────────────────────────────────────────────────────────────

  listContent: {
    paddingTop:    4,
    paddingBottom: 32,
  },
});
