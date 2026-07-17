import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  activeSessionIds,
  type SocialEvent,
} from "@/lib/domain/social";
import { currentStreak, workoutDayKeys } from "@/lib/domain/streak";
import { DEFAULT_TIMEZONE, dayKey, dayRange } from "@/lib/domain/time";
import { summarizeVolume, type VolumeSummary } from "@/lib/domain/volume";
import type { ExerciseType } from "@/lib/types";

// ── 공통 타입 ────────────────────────────────────────────────

export type ReactionType = "fire" | "clap" | "like";
export type CheerType = "fire" | "power" | "clap" | "finish" | "custom";

export type NotificationRow = {
  id: string;
  user_id: string;
  actor_id: string | null;
  type:
    | "workout_started"
    | "cheer_received"
    | "poke"
    | "reaction_received"
    | "rank_change"
    | "record_viewed"
    | "morning_briefing"
    | "challenge_started"
    | "challenge_ended";
  reference_id: string | null;
  title: string;
  body: string | null;
  read_at: string | null;
  created_at: string;
};

/** RPC가 raise하는 코드 문자열 → 클라이언트 분기용 (§스펙 결정 2·5) */
export type SocialErrorCode =
  | "cheer_limit"
  | "cheer_cooldown"
  | "own_session"
  | "not_active"
  | "session_not_found"
  | "poke_cooldown"
  | "self_poke"
  | "not_crew"
  | "pokes_disabled";

const SOCIAL_ERROR_CODES: SocialErrorCode[] = [
  "cheer_limit",
  "cheer_cooldown",
  "own_session",
  "not_active",
  "session_not_found",
  "poke_cooldown",
  "self_poke",
  "not_crew",
  "pokes_disabled",
];

export class SocialError extends Error {
  code: SocialErrorCode | null;
  constructor(message: string, code: SocialErrorCode | null) {
    super(message);
    this.code = code;
  }
}

function toSocialError(error: { message?: string }): SocialError {
  const message = error.message ?? "unknown";
  const code = SOCIAL_ERROR_CODES.find((c) => message.includes(c)) ?? null;
  return new SocialError(message, code);
}

// ── 그룹 피드 (§9: 크루 공개 completed 최신순) ────────────────

export type FeedItem = {
  sessionId: string;
  userId: string;
  nickname: string;
  avatarUrl: string | null;
  title: string | null;
  completedAt: Date;
  durationMinutes: number;
  exerciseNames: string[];
  volume: VolumeSummary;
  photoUrl: string | null;
  streak: number;
  reactions: Record<ReactionType, number>;
  myReactions: Set<ReactionType>;
};

export const FEED_PAGE_SIZE = 20;

type FeedSessionRow = {
  id: string;
  user_id: string;
  title: string | null;
  completed_at: string;
  duration_minutes: number | null;
  workout_exercises:
    | {
        exercise_name: string;
        exercise_type: ExerciseType;
        sort_order: number;
        workout_sets:
          | {
              weight_kg: number | null;
              reps: number | null;
              duration_seconds: number | null;
              distance_meters: number | null;
              is_completed: boolean;
            }[]
          | null;
      }[]
    | null;
  workout_images: { image_path: string }[] | null;
};

/**
 * 크루 공개 완료 세션 피드 한 페이지.
 * `before`(ISO)보다 이전 completed_at만 — 페이지네이션 커서.
 * 스트릭은 내가 볼 수 있는 세션(본인 전체 + 크루 공개) 기준 근사치.
 */
export async function getGroupFeed(
  groupId: string,
  myUserId: string,
  before?: string,
): Promise<FeedItem[]> {
  const supabase = getSupabaseBrowserClient();

  let query = supabase
    .from("workout_sessions")
    .select(
      "id, user_id, title, completed_at, duration_minutes, workout_exercises(exercise_name, exercise_type, sort_order, workout_sets(weight_kg, reps, duration_seconds, distance_meters, is_completed)), workout_images(image_path)",
    )
    .eq("group_id", groupId)
    .eq("status", "completed")
    .eq("visibility", "group")
    .is("deleted_at", null)
    .not("completed_at", "is", null)
    .order("completed_at", { ascending: false })
    .limit(FEED_PAGE_SIZE);
  if (before) query = query.lt("completed_at", before);

  const { data, error } = await query;
  if (error) throw error;
  const rows = (data ?? []) as FeedSessionRow[];
  if (rows.length === 0) return [];

  const sessionIds = rows.map((r) => r.id);
  const userIds = [...new Set(rows.map((r) => r.user_id))];

  const [profiles, reactions, streaks, photoUrls] = await Promise.all([
    fetchProfiles(userIds),
    fetchReactions(sessionIds),
    fetchStreaks(userIds),
    signFirstImages(rows),
  ]);

  return rows.map((r) => {
    const sets = (r.workout_exercises ?? []).flatMap((ex) =>
      (ex.workout_sets ?? []).map((s) => ({
        exerciseType: ex.exercise_type,
        isCompleted: s.is_completed,
        weightKg: Number(s.weight_kg ?? 0),
        reps: s.reps ?? 0,
        distanceMeters: Number(s.distance_meters ?? 0),
        durationSeconds: s.duration_seconds ?? 0,
      })),
    );
    const profile = profiles.get(r.user_id);
    const reaction = reactions.get(r.id);
    return {
      sessionId: r.id,
      userId: r.user_id,
      nickname: profile?.nickname ?? "크루원",
      avatarUrl: profile?.avatar_url ?? null,
      title: r.title,
      completedAt: new Date(r.completed_at),
      durationMinutes: r.duration_minutes ?? 0,
      exerciseNames: [...(r.workout_exercises ?? [])]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((e) => e.exercise_name),
      volume: summarizeVolume(sets),
      photoUrl: photoUrls.get(r.id) ?? null,
      streak: streaks.get(r.user_id) ?? 0,
      reactions: reaction?.counts ?? { fire: 0, clap: 0, like: 0 },
      myReactions: reaction?.mine.get(myUserId) ?? new Set<ReactionType>(),
    };
  });
}

async function fetchProfiles(
  userIds: string[],
): Promise<Map<string, { nickname: string; avatar_url: string | null }>> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, nickname, avatar_url")
    .in("id", userIds);
  if (error) throw error;
  return new Map((data ?? []).map((p) => [p.id, p]));
}

type ReactionAggregate = {
  counts: Record<ReactionType, number>;
  mine: Map<string, Set<ReactionType>>;
};

async function fetchReactions(
  sessionIds: string[],
): Promise<Map<string, ReactionAggregate>> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("reactions")
    .select("session_id, user_id, reaction_type")
    .in("session_id", sessionIds);
  if (error) throw error;

  const map = new Map<string, ReactionAggregate>();
  for (const r of data ?? []) {
    let agg = map.get(r.session_id);
    if (!agg) {
      agg = { counts: { fire: 0, clap: 0, like: 0 }, mine: new Map() };
      map.set(r.session_id, agg);
    }
    const type = r.reaction_type as ReactionType;
    agg.counts[type] += 1;
    let mine = agg.mine.get(r.user_id);
    if (!mine) {
      mine = new Set<ReactionType>();
      agg.mine.set(r.user_id, mine);
    }
    mine.add(type);
  }
  return map;
}

/** 피드 등장 유저들의 현재 스트릭 — 보이는 완료 세션 기준 */
async function fetchStreaks(userIds: string[]): Promise<Map<string, number>> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("workout_sessions")
    .select("user_id, completed_at")
    .in("user_id", userIds)
    .eq("status", "completed")
    .is("deleted_at", null)
    .not("completed_at", "is", null);
  if (error) throw error;

  const byUser = new Map<string, Date[]>();
  for (const row of data ?? []) {
    const list = byUser.get(row.user_id) ?? [];
    list.push(new Date(row.completed_at as string));
    byUser.set(row.user_id, list);
  }
  const today = dayKey(new Date(), DEFAULT_TIMEZONE);
  const result = new Map<string, number>();
  for (const [userId, instants] of byUser) {
    result.set(
      userId,
      currentStreak(workoutDayKeys(instants, DEFAULT_TIMEZONE), today),
    );
  }
  return result;
}

/** 세션별 첫 인증사진 서명 URL (1h) — 사진 없는 세션은 제외 */
async function signFirstImages(
  rows: FeedSessionRow[],
): Promise<Map<string, string>> {
  const supabase = getSupabaseBrowserClient();
  const withImage = rows
    .map((r) => ({ id: r.id, path: r.workout_images?.[0]?.image_path }))
    .filter((r): r is { id: string; path: string } => !!r.path);
  if (withImage.length === 0) return new Map();

  const { data, error } = await supabase.storage
    .from("workout-images")
    .createSignedUrls(
      withImage.map((r) => r.path),
      3600,
    );
  if (error || !data) return new Map();

  const map = new Map<string, string>();
  withImage.forEach((r, i) => {
    const signed = data[i];
    if (signed?.signedUrl && !signed.error) map.set(r.id, signed.signedUrl);
  });
  return map;
}

// ── 이모지 반응 (§9: 토글·중복방지·낙관적 UI는 컴포넌트 책임) ──

export async function toggleReaction(
  sessionId: string,
  userId: string,
  type: ReactionType,
  on: boolean,
): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  if (on) {
    const { error } = await supabase.from("reactions").insert({
      session_id: sessionId,
      user_id: userId,
      reaction_type: type,
    });
    // 23505 = 이미 있음(다른 기기에서 누름) — 토글 목표 상태와 같으므로 무시
    if (error && error.code !== "23505") throw error;
  } else {
    const { error } = await supabase
      .from("reactions")
      .delete()
      .eq("session_id", sessionId)
      .eq("user_id", userId)
      .eq("reaction_type", type);
    if (error) throw error;
  }
}

// ── 진행 중 카드 (§스펙 결정 4: workout_events 원천) ──────────

export type ActiveCrewSession = {
  sessionId: string;
  userId: string;
  nickname: string;
  avatarUrl: string | null;
  startedAt: Date;
};

/** 크루원들의 진행 중 세션 (본인 포함 — 표시 제외는 UI 책임) */
export async function getActiveCrewSessions(
  groupId: string,
): Promise<ActiveCrewSession[]> {
  const supabase = getSupabaseBrowserClient();

  const { data: members, error: mErr } = await supabase
    .from("group_members")
    .select("user_id")
    .eq("group_id", groupId);
  if (mErr) throw mErr;
  const memberIds = (members ?? []).map((m) => m.user_id);
  if (memberIds.length === 0) return [];

  // 최근 24h 이벤트만 — 진행 중 판정(6h 컷)은 도메인 함수가 한다
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: events, error: eErr } = await supabase
    .from("workout_events")
    .select("session_id, user_id, event_type, created_at")
    .in("user_id", memberIds)
    .gte("created_at", since);
  if (eErr) throw eErr;

  const rows = (events ?? []) as (SocialEvent & { user_id: string })[];
  const activeIds = activeSessionIds(rows);
  if (activeIds.length === 0) return [];

  const ownerBySession = new Map<string, { userId: string; startedAt: Date }>();
  for (const e of rows) {
    if (e.event_type === "workout_started") {
      ownerBySession.set(e.session_id, {
        userId: e.user_id,
        startedAt: new Date(e.created_at),
      });
    }
  }
  const profiles = await fetchProfiles([
    ...new Set(
      activeIds
        .map((id) => ownerBySession.get(id)?.userId)
        .filter((v): v is string => !!v),
    ),
  ]);

  return activeIds.flatMap((sessionId) => {
    const owner = ownerBySession.get(sessionId);
    if (!owner) return [];
    const profile = profiles.get(owner.userId);
    return [
      {
        sessionId,
        userId: owner.userId,
        nickname: profile?.nickname ?? "크루원",
        avatarUrl: profile?.avatar_url ?? null,
        startedAt: owner.startedAt,
      },
    ];
  });
}

/** 오늘(KST) 완료 운동이 있는 유저 id — 찌르기 버튼 노출 판단용 */
export async function getTodaysWorkoutUserIds(
  userIds: string[],
): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const supabase = getSupabaseBrowserClient();
  const { start, end } = dayRange(new Date(), DEFAULT_TIMEZONE);
  const { data, error } = await supabase
    .from("workout_sessions")
    .select("user_id")
    .in("user_id", userIds)
    .eq("status", "completed")
    .is("deleted_at", null)
    .gte("completed_at", start.toISOString())
    .lt("completed_at", end.toISOString());
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.user_id));
}

// ── 응원·찌르기 RPC ──────────────────────────────────────────

export async function sendCheer(
  sessionId: string,
  type: CheerType,
  message?: string,
): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.rpc("send_cheer", {
    p_session_id: sessionId,
    p_cheer_type: type,
    p_message: message ?? null,
  });
  if (error) throw toSocialError(error);
}

export async function pokeUser(targetId: string): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.rpc("poke_user", {
    p_target_id: targetId,
  });
  if (error) throw toSocialError(error);
}

// ── 알림함 (§9: durable 저장, 🔔 + 뱃지) ─────────────────────

export async function getNotifications(limit = 30): Promise<NotificationRow[]> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as NotificationRow[];
}

export async function getUnreadNotificationCount(): Promise<number> {
  const supabase = getSupabaseBrowserClient();
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);
  if (error) throw error;
  return count ?? 0;
}

export async function markAllNotificationsRead(): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null);
  if (error) throw error;
}

/**
 * 내 알림 INSERT 실시간 구독 (§스펙 결정 3: notifications 단일 구독).
 * 반환값 호출 시 구독 해제.
 */
export function subscribeNotifications(
  userId: string,
  onInsert: (n: NotificationRow) => void,
): () => void {
  const supabase = getSupabaseBrowserClient();
  // 같은 토픽명은 기존 채널 인스턴스를 재사용해 "subscribe 후 .on() 불가"
  // 에러가 난다 (배너·벨 동시 구독) — 구독마다 유니크한 토픽을 쓴다.
  const channel = supabase
    .channel(`notifications:${userId}:${Math.random().toString(36).slice(2)}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${userId}`,
      },
      (payload) => onInsert(payload.new as NotificationRow),
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}
