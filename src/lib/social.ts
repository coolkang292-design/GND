import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  activeSessionIds,
  firstWorkoutImagePath,
  type SocialEvent,
  type WorkoutImageRelation,
} from "@/lib/domain/social";
import { pointsAwardedFrom } from "@/lib/domain/cheer-points";
import { currentStreak, workoutDayKeys } from "@/lib/domain/streak";
import { DEFAULT_TIMEZONE, dayKey, dayRange } from "@/lib/domain/time";
import { weekWorkoutDays } from "@/lib/domain/viewing-pass";
import { getActiveChallengeRanking } from "@/lib/challenge";
import { summarizeVolume, type VolumeSummary } from "@/lib/domain/volume";
import {
  EMPTY_SESSION_THREAD,
  foldSessionThread,
  type SessionCheerRow,
  type SessionCheerType,
  type SessionThread,
} from "@/lib/domain/session-comments";
import type { BreakdownExercise } from "@/components/workout/set-breakdown";
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
    | "challenge_ended"
    | "record_beaten" // 0018
    | "badge_earned" // 0020
    | "level_up" // 0029
    | "app_update" // 0034 — 배포·업데이트 소식
    | "crew_request" // 0038 — 크루 요청 도착
    | "crew_accepted" // 0038 — 상대가 내 요청을 수락
    | "challenge_invite" // 0042 — 챌린지 방 초대 (0044부터 발송·라우팅)
    | "bug_reported" // 0052 — 관리자에게: 새 버그 신고 도착
    | "bug_fixed" // 0052 — 신고자에게: 신고한 게 고쳐졌다
    | "challenge_peek_unlocked" // 0054 — 5일 연속으로 열린 2시간 열람창
    | "challenge_starting_soon" // 0077 — 시작 전날 예고
    | "challenge_dropped" // 0077 — 목표 미설정으로 이번 회차에서 빠짐
    | "workout_suggestion" // 0078 — 계획 없는 날 운동 제안
    | "comment_received" // 0082 — 내 운동(또는 내가 댓글 단 운동)에 새 댓글
    | "challenge_cancelled" // 0088 — 방장이 챌린지를 취소했다
    | "challenge_joined"; // 0088 — 공개 모집에 새 참가자 (방장에게만)
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
  | "poke_requires_workout" // 0028 — 오늘 운동한 사람만 찌를 수 있다
  | "self_poke"
  | "not_crew"
  | "pokes_disabled"
  | "not_eligible"
  | "pass_expired"
  | "pass_used"
  | "self_view"
  | "self_request" // 0038 — 자기 자신에게 요청
  | "already_crew" // 0038 — 이미 크루
  | "request_exists" // 0038 — 진행 중 요청이 이미 있음(거절 후 7일 쿨다운 포함)
  | "target_not_found" // 0038 — 그 닉네임의 사람이 없음
  | "not_addressee" // 0038 — 내가 받은 요청이 아님
  | "not_pending" // 0038 — 이미 처리된 요청
  | "not_requester" // 0038 — 내가 보낸 요청이 아님
  | "comment_empty" // 0082 — 빈 댓글
  | "comment_too_long" // 0082 — 200자 초과
  | "comment_cooldown" // 0082 — 10초 안에 또 달았다
  | "comment_not_found" // 0084 — 없거나 고칠 수 없는 댓글
  | "not_author" // 0084 — 내가 쓴 댓글이 아니다
  | "self_block" // 0089 — 자기 자신을 차단
  | "blocked_by_me" // 0089 — 내가 차단한 상대에게 크루 요청
  | "self_report" // 0089 — 자기 자신을 신고
  | "invalid_reason" // 0089 — 목록에 없는 신고 사유
  | "note_too_long"; // 0089 — 신고 설명 500자 초과

// ⚠️ 0089에는 코드가 **하나 더 있는데 일부러 여기 없다**: 상대가 나를 차단한
//    경우 서버는 `request_exists`를 던진다. 차단당했다는 사실이 드러나면 다른
//    계정으로 우회하라는 신호가 되기 때문이다(0038이 거절을 숨긴 것과 같은 결).
//    새 코드를 만들어 화면에 다른 문구를 띄우면 그 은폐가 통째로 무너진다.

const SOCIAL_ERROR_CODES: SocialErrorCode[] = [
  "cheer_limit",
  "cheer_cooldown",
  "own_session",
  "not_active",
  "session_not_found",
  "poke_cooldown",
  "poke_requires_workout",
  "self_poke",
  "not_crew",
  "pokes_disabled",
  "not_eligible",
  "pass_expired",
  "pass_used",
  "self_view",
  // 0038 — 이 배열이 런타임 매칭의 원천이다. 유니온만 고치면 타입은 통과하는데
  // 코드가 null로 떨어져 화면엔 "알 수 없는 오류"만 뜬다.
  // not_crew는 위에 이미 있어 다시 넣지 않는다(remove_crew 실패 코드로 재사용).
  "self_request",
  "already_crew",
  "request_exists",
  "target_not_found",
  "not_addressee",
  "not_pending",
  "not_requester",
  // 0082 — ⚠️ 위 주석의 함정이 여기도 그대로 적용된다. 유니온만 늘리면
  // 타입은 통과하는데 코드가 null로 떨어져 화면엔 "알 수 없는 오류"만 뜬다.
  "comment_empty",
  "comment_too_long",
  "comment_cooldown",
  // 0084 — 같은 함정. 배열에 안 넣으면 코드가 null로 떨어진다.
  "comment_not_found",
  "not_author",
  // 0089 — 세 번째로 같은 함정. 유니온만 늘리면 타입은 통과하는데 코드가
  // null로 떨어져 차단·신고 실패가 전부 "알 수 없는 오류"가 된다.
  "self_block",
  "blocked_by_me",
  "self_report",
  "invalid_reason",
  "note_too_long",
];

export class SocialError extends Error {
  code: SocialErrorCode | null;
  constructor(message: string, code: SocialErrorCode | null) {
    super(message);
    this.code = code;
  }
}

/** RPC 에러 → SocialError. SOCIAL_ERROR_CODES 배열이 유일한 매칭 원천이다. */
export function toSocialError(error: { message?: string }): SocialError {
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
  recordNote: string | null; // 🏅 기록 갱신 문구 (0018)
  tabataMinutes: number | null; // 🔥 타바타 코스 분수 (0019)
  /** 종목·세트 상세 (2026-08-04) — 이미 받아 오던 행을 버리지 않고 남긴 것 */
  breakdown: BreakdownExercise[];
  reactions: Record<ReactionType, number>;
  myReactions: Set<ReactionType>;
  /**
   * 댓글 + 말 없는 응원 집계 (0082).
   *
   * `cheers` 한 질의를 접은 것이다 — 카드마다 따로 부르지 않는다. 스레드를
   * 펼칠 때도 새 조회가 없다(피드가 이미 손에 쥐고 있다). 새 댓글을 달았을
   * 때만 그 세션 것을 다시 읽는다.
   */
  thread: SessionThread;
  /**
   * 좋아요를 누른 사람 (0084) — 누른 순서.
   *
   * 새 질의가 없다. `fetchReactions`가 이미 `user_id`별로 모아 두던 것을
   * 버리지 않고 꺼낸 것뿐이다.
   */
  likers: string[];
  /**
   * 댓글 작성자 **와 좋아요 누른 사람**의 프로필 — 스레드·명단이 닉네임과
   * 아바타를 그릴 재료 (0083 → 0084).
   */
  people: Map<string, { nickname: string; avatarUrl: string | null }>;
};

export const FEED_PAGE_SIZE = 20;

type FeedSessionRow = {
  id: string;
  user_id: string;
  title: string | null;
  completed_at: string;
  duration_minutes: number | null;
  record_note?: string | null; // 0018 적용 전에는 컬럼이 없을 수 있음
  tabata_minutes?: number | null; // 0019

  workout_exercises: FeedExerciseRow[] | null;
  workout_images: WorkoutImageRelation;
};

/**
 * 피드가 이미 받아 오는 종목·세트 행 (2026-08-04에 `measure`·`set_number` 추가).
 *
 * ⚠️ 둘 다 없으면 상세가 틀리게 그려진다. `measure`가 없으면 맨몸 **시간형**이
 * `0회`로 나오고, `set_number`가 없으면 세트 순서가 DB 결과 순서에 좌우된다.
 * 같은 질의에 컬럼만 더한 것이라 왕복은 늘지 않는다.
 */
export type FeedExerciseRow = {
  exercise_name: string;
  exercise_type: ExerciseType;
  measure?: "reps" | "time" | null;
  sort_order: number;
  workout_sets:
    | {
        set_number?: number;
        weight_kg: number | null;
        reps: number | null;
        duration_seconds: number | null;
        distance_meters: number | null;
        is_completed: boolean;
      }[]
    | null;
};

/**
 * 피드 행 → 상세 표시 모양. 순수 함수라 조회 없이 접기만 한다.
 *
 * 전에는 이 세트들을 `summarizeVolume` 재료로만 쓰고 **버렸다.** 피드 상세는
 * 새 질의가 아니라 이미 손에 있던 것을 그리는 일이다.
 */
export function toFeedBreakdown(
  rows: FeedExerciseRow[] | null,
): BreakdownExercise[] {
  return [...(rows ?? [])]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((exercise) => ({
      name: exercise.exercise_name,
      exerciseType: exercise.exercise_type,
      measure: exercise.measure ?? null,
      sets: [...(exercise.workout_sets ?? [])]
        .sort((a, b) => (a.set_number ?? 0) - (b.set_number ?? 0))
        .map((set) => ({
          weightKg: Number(set.weight_kg ?? 0),
          reps: set.reps ?? 0,
          distanceKm: Number(set.distance_meters ?? 0) / 1000,
          durationMin: Math.round((set.duration_seconds ?? 0) / 60),
          // 표기는 초를 본다 (2026-08-28) — 분만 넘기면 매달리기가 `0분`이 된다
          durationSec: set.duration_seconds ?? 0,
          done: set.is_completed,
        })),
    }));
}

/**
 * 크루 공개 완료 세션 피드 한 페이지.
 * `before`(ISO)보다 이전 completed_at만 — 페이지네이션 커서.
 * 스트릭은 내가 볼 수 있는 세션(본인 전체 + 크루 공개) 기준 근사치.
 * `photoOnly`: true면 인증사진이 있는 세션만 (workout_images!inner).
 */
/**
 * 내 크루의 user_id 목록 (본인 제외).
 *
 * crew_links는 0038에서 authenticated에 select만 열려 있고 정책이 "내가 낀 행"으로
 * 좁히므로, 필터 없이 읽어도 내 연결만 온다. get_my_crew() RPC를 쓰지 않는 이유는
 * 두 가지다 — 여기서는 id만 필요한데 그 RPC는 profiles·user_progress까지 조인하고,
 * crew-link.ts가 social.ts의 toSocialError를 쓰고 있어 서로 import하면 순환이 된다.
 */
async function fetchCrewIds(myUserId: string): Promise<string[]> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("crew_links")
    .select("user_a, user_b");
  if (error) throw error;
  return ((data ?? []) as { user_a: string; user_b: string }[]).map((l) =>
    l.user_a === myUserId ? l.user_b : l.user_a,
  );
}

export async function getCrewFeed(
  myUserId: string,
  before?: string,
  photoOnly = false,
  /**
   * 이 세션 하나만 (2026-08-30). 알림에서 `/feed?session=<id>`로 들어올 때
   * 그 게시물이 첫 페이지 20건 밖에 있을 수 있어서, **같은 질의에 id 조건만
   * 더해** 집어 온다. 별도 조회 경로를 만들면 가시성 조건(완료·공개·미삭제·크루)이
   * 두 곳으로 갈라지고, 갈라지면 언젠가 한쪽만 고쳐진다.
   */
  onlySessionId?: string,
): Promise<FeedItem[]> {
  const supabase = getSupabaseBrowserClient();
  // RLS가 이미 크루 기준이지만 클라 쿼리도 좁혀야 FEED_PAGE_SIZE가 정확하다.
  const visibleIds = [myUserId, ...(await fetchCrewIds(myUserId))];

  // photoOnly: workout_images!inner = 인증사진 있는 세션만 (세션당 1장
  // unique(0005)라 join 중복 없음). 정렬·커서는 전체 피드와 동일.
  const imagesEmbed = photoOnly
    ? "workout_images!inner(image_path)"
    : "workout_images(image_path)";

  let query = supabase
    .from("workout_sessions")
    .select(
      `id, user_id, title, completed_at, duration_minutes, record_note, tabata_minutes, workout_exercises(exercise_name, exercise_type, measure, sort_order, workout_sets(set_number, weight_kg, reps, duration_seconds, distance_meters, is_completed)), ${imagesEmbed}`,
    )
    .in("user_id", visibleIds)
    .eq("status", "completed")
    .eq("visibility", "group")
    .is("deleted_at", null)
    .not("completed_at", "is", null)
    .order("completed_at", { ascending: false })
    .limit(FEED_PAGE_SIZE);
  if (before) query = query.lt("completed_at", before);
  if (onlySessionId) query = query.eq("id", onlySessionId);

  const { data, error } = await query;
  if (error) throw error;
  const rows = (data ?? []) as FeedSessionRow[];
  if (rows.length === 0) return [];

  const sessionIds = rows.map((r) => r.id);
  const userIds = [...new Set(rows.map((r) => r.user_id))];

  const [profiles, reactions, streaks, photoUrls, threads] = await Promise.all([
    fetchProfiles(userIds),
    fetchReactions(sessionIds),
    fetchStreaks(userIds),
    signFirstImages(rows),
    fetchSessionThreads(sessionIds),
  ]);

  // 댓글 작성자가 이 페이지의 게시물 주인이 아닐 수 있다. 모자란 사람만 한 번 더
  // 부른다 — 대개 0명이라 왕복이 안 는다.
  //
  // ⚠️ `fetchProfiles`(테이블 직접 select)가 **아니다.** `profiles_select_own_or_crew`는
  //    "내 크루 / 같은 그룹"까지만 열려서, 글 주인의 크루이지만 나와는 아닌 사람의
  //    이름이 안 온다 — 화면에 **누가 한 말인지 모르는 댓글**이 남는다.
  //    0083의 RPC가 `session_crew_shared`(댓글 읽기와 **같은 판정**)로 문을 열고
  //    **닉네임·아바타만** 돌려준다. 테이블 정책을 넓히면 `invite_code`·유입 데이터까지
  //    딸려 나가므로 그 길을 안 썼다.
  const actorIds = new Set<string>();
  for (const t of threads.values()) {
    for (const c of t.comments) {
      actorIds.add(c.senderId);
      for (const reply of c.replies) actorIds.add(reply.senderId);
    }
  }
  for (const agg of reactions.values()) {
    for (const id of agg.mine.keys()) actorIds.add(id);
  }
  if ([...actorIds].some((id) => !profiles.has(id))) {
    for (const [id, p] of await fetchActorProfiles(sessionIds)) {
      if (!profiles.has(id)) profiles.set(id, p);
    }
  }
  const people = new Map(
    [...profiles].map(([id, p]) => [
      id,
      { nickname: p.nickname, avatarUrl: p.avatar_url },
    ]),
  );

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
      recordNote: r.record_note ?? null,
      tabataMinutes: r.tabata_minutes ?? null,
      breakdown: toFeedBreakdown(r.workout_exercises),
      reactions: reaction?.counts ?? { fire: 0, clap: 0, like: 0 },
      myReactions: reaction?.mine.get(myUserId) ?? new Set<ReactionType>(),
      thread: threads.get(r.id) ?? EMPTY_SESSION_THREAD,
      likers: [...(reaction?.mine.keys() ?? [])],
      people,
    };
  });
}

// ── 게시물 스레드: 댓글 + 응원 (0082) ────────────────────────

/**
 * 한 페이지치 세션의 `cheers` 행을 한 번에 읽어 세션별로 접는다.
 *
 * 읽기에 RPC를 쓰지 않는 이유 — `cheers_select_related` 정책이
 * `session_crew_shared(session_id)`를 이미 허용한다. 즉 **크루원은 그 세션의
 * 응원·댓글을 이미 다 읽을 수 있고**, 정책이 크루 밖을 알아서 자른다.
 * 정의자 RPC를 새로 놓으면 같은 판정이 두 곳으로 갈라진다.
 */
const THREAD_FETCH_CAP = 500;

async function fetchSessionThreads(
  sessionIds: string[],
): Promise<Map<string, SessionThread>> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("cheers")
    .select("id, session_id, sender_id, cheer_type, message, created_at, parent_id, edited_at")
    .in("session_id", sessionIds)
    .order("created_at", { ascending: true })
    // ⚠️ 한 페이지(세션 20건)의 응원·댓글 합계 상한이다. 크루가 한 자릿수인
    //    이 앱에서는 닿을 일이 없다(응원은 보낸 사람당 3개 상한). 닿으면
    //    **오래된 쪽부터 남고 최신 댓글이 잘린다** — 그때는 세션별 상한을
    //    주는 RPC로 바꿔야지, 이 숫자만 올리지 마라.
    .limit(THREAD_FETCH_CAP);
  if (error) throw error;

  const bySession = new Map<string, SessionCheerRow[]>();
  for (const row of data ?? []) {
    const r = row as {
      id: string;
      session_id: string;
      sender_id: string;
      cheer_type: string;
      message: string | null;
      created_at: string;
      parent_id: string | null;
      edited_at: string | null;
    };
    const list = bySession.get(r.session_id) ?? [];
    list.push({
      id: r.id,
      sessionId: r.session_id,
      senderId: r.sender_id,
      cheerType: r.cheer_type as SessionCheerType,
      message: r.message,
      createdAt: new Date(r.created_at),
      parentId: r.parent_id,
      editedAt: r.edited_at ? new Date(r.edited_at) : null,
    });
    bySession.set(r.session_id, list);
  }

  return new Map(
    [...bySession].map(([id, rows]) => [id, foldSessionThread(rows)]),
  );
}

/**
 * 댓글을 남기거나 **좋아요를 누른** 사람의 닉네임·아바타 (0083 → 0084).
 *
 * `profiles`를 직접 읽지 않는 이유 — `profiles_select_own_or_crew`는 "내 크루 /
 * 같은 그룹"까지만 열려서, **글 주인의 크루이지만 나와는 아닌** 사람의 이름이
 * 안 온다. 그러면 댓글 내용은 보이는데 작성자가 "크루원"으로 뜬다.
 *
 * RPC는 `session_crew_shared` — **댓글 읽기 정책과 같은 판정** — 으로 문을 열고
 * 세 칸만 돌려준다. 실패해도 던지지 않는다: 이름이 없으면 화면이 "크루원"으로
 * 떨어질 뿐이고, 그게 피드 전체가 안 뜨는 것보다 낫다.
 */
async function fetchActorProfiles(
  sessionIds: string[],
): Promise<Map<string, { nickname: string; avatar_url: string | null }>> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("get_session_actor_profiles", {
    p_session_ids: sessionIds,
  });
  if (error) return new Map();
  return new Map(
    ((data ?? []) as {
      id: string;
      nickname: string;
      avatar_url: string | null;
    }[]).map((p) => [p.id, { nickname: p.nickname, avatar_url: p.avatar_url }]),
  );
}

/** 세션 하나의 스레드 — 댓글을 달거나 지운 뒤 그 카드만 갱신할 때 쓴다 */
export async function getSessionThread(
  sessionId: string,
): Promise<SessionThread> {
  const threads = await fetchSessionThreads([sessionId]);
  return threads.get(sessionId) ?? EMPTY_SESSION_THREAD;
}

/**
 * 댓글 달기 (0082).
 *
 * `send_cheer`와 **테이블은 같고 정책만 다르다** — 완료된 세션에, 본인 글에도,
 * 횟수 제한 없이, 200자까지. 포인트는 주지 않는다(도배가 이득이 되면 안 된다).
 * 알림은 **세션 주인 + 앞선 댓글 작성자 전원**에게 서버가 팬아웃한다.
 */
export async function postSessionComment(
  sessionId: string,
  body: string,
  /** 답글이면 부모 댓글 id (0084). 서버가 2단계로 눕힌다 */
  parentId?: string | null,
): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.rpc("post_session_comment", {
    p_session_id: sessionId,
    p_body: body,
    p_parent_id: parentId ?? null,
  });
  if (error) throw toSocialError(error);
}

/**
 * 내 댓글 고치기 (0084).
 *
 * 직접 UPDATE가 아니라 RPC인 이유 — `cheers`에는 UPDATE 정책이 아예 없고,
 * 열면 **RLS가 컬럼을 못 가려서** `session_id`·`parent_id`·`cheer_type`까지
 * 바꿀 수 있게 된다(남의 스레드로 댓글을 옮기거나 응원을 댓글로 둔갑시키는 길).
 * 정의자 함수는 `message`와 `edited_at`만 건드린다.
 */
export async function editMyComment(
  commentId: string,
  body: string,
): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.rpc("edit_session_comment", {
    p_comment_id: commentId,
    p_body: body,
  });
  if (error) throw toSocialError(error);
}

/**
 * 내 댓글 지우기. RPC가 아니라 직접 delete인 이유 — `cheers_delete_own`
 * 정책(0011:145)이 `sender_id = auth.uid()`로 이미 본인 것만 연다.
 */
export async function deleteMyComment(commentId: string): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.from("cheers").delete().eq("id", commentId);
  if (error) throw toSocialError(error);
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
    .map((r) => ({ id: r.id, path: firstWorkoutImagePath(r.workout_images) }))
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
  myUserId: string,
): Promise<ActiveCrewSession[]> {
  const supabase = getSupabaseBrowserClient();

  // 0039: 그룹 멤버 → 크루 연결. 본인을 포함하는 이유는 위 주석 그대로다.
  const memberIds = [myUserId, ...(await fetchCrewIds(myUserId))];
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

/**
 * 응원 보내기. 반환값의 pointsAwarded는 **서버가 실제로 지급한 액수**다(0041).
 * 클라이언트가 "오늘 이 사람에게 응원했었나"를 로컬로 추측하면 다른 기기·다른
 * 탭에서 0P인데 +10P로 표시된다.
 */
export async function sendCheer(
  sessionId: string,
  type: CheerType,
  message?: string,
): Promise<{ pointsAwarded: number }> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("send_cheer", {
    p_session_id: sessionId,
    p_cheer_type: type,
    p_message: message ?? null,
  });
  if (error) throw toSocialError(error);
  return { pointsAwarded: pointsAwardedFrom(data) };
}

export async function pokeUser(targetId: string): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.rpc("poke_user", {
    p_target_id: targetId,
  });
  if (error) throw toSocialError(error);
}

/**
 * 내가 최근 24시간 안에 찌른 상대 id (0053).
 *
 * 화면이 "✅ 찌름"을 앱 재시작 뒤에도 유지하려면 서버에 물어봐야 한다.
 * `notifications`는 받는 사람만 읽을 수 있어(0011:153) 직접 조회가 안 되므로
 * 정의자 RPC를 쓴다.
 *
 * 실패해도 화면을 멈추지 않는다 — 빈 목록이면 버튼이 활성으로 보일 뿐이고,
 * 눌러도 서버가 `poke_cooldown`으로 막는다. 크루 카드가 통째로 안 뜨는 것보다
 * 그 편이 낫다.
 */
export async function getMyRecentPokeTargets(): Promise<Set<string>> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("get_my_recent_pokes");
  if (error) return new Set();
  return new Set((data ?? []) as string[]);
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

// ── 꾸준왕 열람권 (0012 view_record) ─────────────────────────

export async function viewRecord(targetId: string): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.rpc("view_record", {
    p_target_id: targetId,
  });
  if (error) throw toSocialError(error);
}

/** 내 열람 기록 viewed_at 목록(최신순) — 열람권 사용 여부 판정용 */
export async function getMyRecordViewAts(userId: string): Promise<Date[]> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("record_views")
    .select("viewed_at")
    .eq("viewer_id", userId)
    .order("viewed_at", { ascending: false })
    .limit(10);
  if (error) throw error;
  return (data ?? []).map((r) => new Date(r.viewed_at as string));
}

export type CrewPerformance = {
  weekDays: number; // 대상의 이번 주 운동일
  streak: number;
  challenge: { name: string; rate: number; rank: number; total: number } | null;
};

/**
 * 열람 성공 후 대상 성과 계산 — 크루 공개 완료 세션 + 챌린지 랭킹
 *
 * 0044: 두 번째 인자가 groupId가 아니라 challengeId다. 크루당 챌린지가 여러
 * 개일 수 있어 그룹으로는 어느 랭킹인지 정해지지 않는다. 호출부가 대표 챌린지를
 * 골라 넘긴다(`pickPrimaryRow`) — 화면과 같은 규칙이어야 숫자가 안 갈라진다.
 */
export async function getCrewPerformance(
  targetId: string,
  challengeId: string,
): Promise<CrewPerformance> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("workout_sessions")
    .select("completed_at")
    .eq("user_id", targetId)
    .eq("status", "completed")
    .is("deleted_at", null)
    .not("completed_at", "is", null);
  if (error) throw error;

  const instants = (data ?? []).map((r) => new Date(r.completed_at as string));
  const now = new Date();
  const { days } = weekWorkoutDays(instants, now, DEFAULT_TIMEZONE);
  const streak = currentStreak(
    workoutDayKeys(instants, DEFAULT_TIMEZONE),
    dayKey(now, DEFAULT_TIMEZONE),
  );

  const ranking = await getActiveChallengeRanking(challengeId);
  const mine = ranking?.list.find((r) => r.userId === targetId) ?? null;
  return {
    weekDays: days.length,
    streak,
    challenge:
      ranking && mine
        ? {
            name: ranking.name,
            rate: Math.round(mine.achievement),
            rank: mine.rank,
            total: ranking.list.length,
          }
        : null,
  };
}
