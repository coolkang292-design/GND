import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { DEFAULT_TIMEZONE, dayKey } from "@/lib/domain/time";
import {
  plannedDaysForPeriod,
  rankParticipants,
  type GoalType,
  type RankedParticipant,
} from "@/lib/domain/goal-score";
import type { Challenge, UserGoal, WorkoutSet } from "@/lib/types";

// ── 목표 유형 메타 (§5) ──────────────────────────────────────────

export type GoalCategory = "weight" | "cardio" | "bodyweight";

export const GOAL_TYPE_META: Record<
  GoalType,
  { label: string; unit: string; defaultTarget: number; category: GoalCategory }
> = {
  weight_reps: { label: "웨이트 횟수", unit: "회", defaultTarget: 300, category: "weight" },
  weight_days: { label: "웨이트 운동일", unit: "일", defaultTarget: 12, category: "weight" },
  cardio_distance: { label: "유산소 거리", unit: "km", defaultTarget: 20, category: "cardio" },
  cardio_time: { label: "유산소 시간", unit: "분", defaultTarget: 600, category: "cardio" },
  bodyweight_reps: { label: "맨몸 횟수", unit: "회", defaultTarget: 300, category: "bodyweight" },
  bodyweight_time: { label: "맨몸 시간", unit: "분", defaultTarget: 100, category: "bodyweight" },
  bodyweight_days: { label: "맨몸 운동일", unit: "일", defaultTarget: 12, category: "bodyweight" },
  tabata_count: { label: "타바타 횟수", unit: "회", defaultTarget: 12, category: "bodyweight" },
  volume: { label: "웨이트 총볼륨", unit: "kg", defaultTarget: 5000, category: "weight" }, // 레거시
};

export type GoalDraft = {
  type: GoalType;
  target: number;
  /** *_days: 하루 최소 종목 수 (기본 3) */
  qualifier?: number | null;
};

/** 목표 표시 라벨 (+조건) */
export function goalLabel(type: GoalType, qualifier?: number | null): string {
  const base = GOAL_TYPE_META[type].label;
  if (type === "weight_days") return `${base}(하루 ${qualifier ?? 1}종목+)`;
  if (type === "bodyweight_days") return `${base}(하루 ${qualifier ?? 1}종목+)`;
  return base;
}

// ── challenges CRUD ──────────────────────────────────────────────

/** 크루의 살아있는(취소 아닌) 최신 챌린지 */
export async function getCurrentChallenge(
  groupId: string,
  client?: SupabaseClient,
): Promise<Challenge | null> {
  const supabase = client ?? getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("challenges")
    .select("*")
    .eq("group_id", groupId)
    .neq("status", "cancelled")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** 내가 참가자로 들어가 있는 챌린지 + 내 역할·참가 상태 */
export type MyChallenge = Challenge & {
  myRole: "host" | "member";
  myStatus: "invited" | "joined" | "dropped";
};

/**
 * 내 챌린지 전부 (cancelled 제외).
 *
 * 0044부터 명단의 원천은 group_members가 아니라 challenge_participants다.
 * 그룹이 아니라 참가 사실로 묶이므로, 여러 크루에 걸친 챌린지도 한 목록에 온다.
 *
 * invited(아직 수락 안 함)도 포함한다 — 화면이 "초대받았어요"를 보여줘야 한다.
 * dropped는 목표 0개로 명단에서 빠진 사람이다. 결과를 볼 수는 있어야 하므로
 * 역시 포함하고, 구분은 myStatus로 화면이 한다.
 *
 * ⚠ `user_id` 필터가 반드시 있어야 한다. challenge_participants의 RLS
 * (`0042:77`)는 `is_challenge_participant(challenge_id, auth.uid())`라, 내가 낀
 * 챌린지의 **모든 참가자 행**을 읽게 해 준다(명단 조회에 필요해서 그렇다).
 * 필터 없이 쓰면 참가자 3명짜리 챌린지 하나가 **같은 챌린지 3개**로 보이고,
 * myRole·myStatus에 남의 값이 들어온다. 2026-07-31에 실제로 그렇게 배포됐다.
 */
export async function getMyChallenges(
  userId: string,
  client?: SupabaseClient,
): Promise<MyChallenge[]> {
  const supabase = client ?? getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("challenge_participants")
    .select("role, status, challenges!inner(*)")
    .eq("user_id", userId)
    .neq("challenges.status", "cancelled");
  if (error) throw error;

  type Row = {
    role: "host" | "member";
    status: "invited" | "joined" | "dropped";
    challenges: Challenge;
  };
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    ...r.challenges,
    myRole: r.role,
    myStatus: r.status,
  }));
}

/** 챌린지의 참가자 명단 (0044부터 랭킹·집계의 원천) */
export async function getChallengeParticipants(
  challengeId: string,
  client?: SupabaseClient,
): Promise<{ user_id: string; role: "host" | "member"; status: string }[]> {
  const supabase = client ?? getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("challenge_participants")
    .select("user_id, role, status")
    .eq("challenge_id", challengeId);
  if (error) throw error;
  return data ?? [];
}

// createChallenge(직접 insert)는 0044에서 지웠다. challenge_participants에 host
// 행을 만들지 않아, 그 경로로 만든 챌린지는 getMyChallenges()에 안 잡히는
// "안 보이는 챌린지"가 된다. 생성은 createChallengeRoom RPC 하나뿐이다.

/** 챌린지의 전체 참가자 목표 (RLS: 크루원만) */
export async function getChallengeGoals(
  challengeId: string,
  client?: SupabaseClient,
): Promise<UserGoal[]> {
  const supabase = client ?? getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("user_goals")
    .select("*")
    .eq("challenge_id", challengeId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** 내 KPI 저장 — setup 단계에서만 (RLS 강제). 기존 행 교체. */
export async function saveMyGoals(input: {
  userId: string;
  challengeId: string;
  groupId: string;
  goals: GoalDraft[];
  plannedDays: number;
}): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { error: delError } = await supabase
    .from("user_goals")
    .delete()
    .eq("challenge_id", input.challengeId)
    .eq("user_id", input.userId);
  if (delError) throw delError;

  const { error } = await supabase.from("user_goals").insert(
    input.goals.map((g) => ({
      user_id: input.userId,
      challenge_id: input.challengeId,
      group_id: input.groupId,
      goal_type: g.type,
      target_value: g.target,
      unit: GOAL_TYPE_META[g.type].unit,
      planned_days: input.plannedDays,
      qualifier:
        g.type === "weight_days" || g.type === "bodyweight_days"
          ? (g.qualifier ?? 3)
          : null,
    })),
  );
  if (error) throw error;
}

/** 지난 챌린지 KPI 불러오기 (§5 loadPrevKPI) — 직전 챌린지의 내 목표 */
export async function getMyPreviousGoals(
  userId: string,
  groupId: string,
  excludeChallengeId: string | null,
): Promise<UserGoal[]> {
  const supabase = getSupabaseBrowserClient();
  let query = supabase
    .from("user_goals")
    .select("*")
    .eq("user_id", userId)
    .eq("group_id", groupId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (excludeChallengeId) {
    query = query.neq("challenge_id", excludeChallengeId);
  }
  const { data, error } = await query;
  if (error) throw error;
  const rows = data ?? [];
  if (rows.length === 0) return [];
  // 가장 최근 챌린지 한 건의 목표 묶음만
  const latestChallengeId = rows[0].challenge_id;
  return rows.filter((r) => r.challenge_id === latestChallengeId);
}

// ── 상태전이 RPC (§15) ───────────────────────────────────────────

export async function startChallenge(challengeId: string): Promise<Challenge> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("start_challenge", {
    p_challenge_id: challengeId,
  });
  if (error) throw error;
  return data as Challenge;
}

export async function cancelChallenge(
  challengeId: string,
): Promise<Challenge> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("cancel_challenge", {
    p_challenge_id: challengeId,
  });
  if (error) throw error;
  return data as Challenge;
}

/** 챌린지 목표에 동의(1회 기록). setup·전원 목표 세팅 완료 상태에서만. */
export async function approveChallengeGoals(challengeId: string): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.rpc("approve_challenge_goals", {
    p_challenge_id: challengeId,
  });
  if (error) throw error;
}

/** 내 동의 철회 */
export async function unapproveChallengeGoals(
  challengeId: string,
): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.rpc("unapprove_challenge_goals", {
    p_challenge_id: challengeId,
  });
  if (error) throw error;
}

/** 이 챌린지에 동의한 크루원 id 집합 (setup 현황·시작 게이트용) */
export async function getChallengeApprovals(
  challengeId: string,
): Promise<Set<string>> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("challenge_goal_approvals")
    .select("approver_id")
    .eq("challenge_id", challengeId);
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.approver_id as string));
}

/** 종료일 지난 active 챌린지를 ended로 확정 (결과는 저장 않고 계산) */
export async function finalizeChallenge(
  challengeId: string,
): Promise<Challenge> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("finalize_challenge", {
    p_challenge_id: challengeId,
  });
  if (error) throw error;
  return data as Challenge;
}

// ── 챌린지 방 RPC (0042) — 0044부터 화면이 실제로 부른다 ──────────

/**
 * 챌린지 방 생성. 방장이 host로 자동 참가한다.
 *
 * 직접 insert가 아니라 이 RPC를 써야 challenge_participants에 host 행이 생긴다.
 * 직접 insert로 만들면 참가자 행이 없어 **본인이 만든 챌린지가
 * getMyChallenges()에 안 나온다.**
 */
export async function createChallengeRoom(input: {
  name: string;
  startDate: string;
  endDate: string;
  photoRequired?: boolean;
}): Promise<Challenge> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("create_challenge_room", {
    p_name: input.name.trim(),
    p_start_date: input.startDate,
    p_end_date: input.endDate,
    p_photo_required: input.photoRequired ?? true,
  });
  if (error) throw error;
  return data as Challenge;
}

/** 초대 — host만, setup 단계만 (서버가 강제한다) */
export async function inviteToChallenge(
  challengeId: string,
  targetId: string,
): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.rpc("invite_to_challenge", {
    p_challenge_id: challengeId,
    p_target_id: targetId,
  });
  if (error) throw error;
}

/** 수락 — joined 전환 + 기존 참가자 전원과 crew_links (설계 D5 완전 연결) */
export async function acceptChallengeInvite(challengeId: string): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.rpc("accept_challenge_invite", {
    p_challenge_id: challengeId,
  });
  if (error) throw error;
}

/**
 * 초대 링크용 코드 발급 (host · setup만). 멱등 — 이미 있으면 그대로 돌려준다.
 *
 * 다시 누를 때마다 코드가 바뀌면 먼저 보낸 링크가 죽으므로 서버가 멱등이다.
 */
export async function issueChallengeInviteCode(challengeId: string): Promise<string> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("issue_challenge_invite_code", {
    p_challenge_id: challengeId,
  });
  if (error) throw error;
  return data as string;
}

/**
 * 초대 링크로 참가. 방장 승인 없이 바로 joined가 되고, 기존 참가자 전원과
 * crew_links가 맺어진다(설계 D5) — 랭킹판에서 서로 닉네임이 보이려면 필요하다.
 */
export async function joinChallengeWithCode(
  code: string,
): Promise<{ challengeId: string; challengeName: string; crewLinked: number }> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("join_challenge_with_code", {
    p_code: code,
  });
  if (error) throw error;
  const r = data as { challengeId: string; challengeName: string; crewLinked: number };
  return r;
}

/** 거절 — 참가 행을 지운다. 지우므로 읽기 권한도 함께 사라진다 */
export async function declineChallengeInvite(challengeId: string): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.rpc("decline_challenge_invite", {
    p_challenge_id: challengeId,
  });
  if (error) throw error;
}

// ── 기간 실적 집계 (§7 실적 = 완료 세션에서 계산) ────────────────

export type PeriodStats = {
  workoutDays: number; // 아무 운동이든 한 날 수 (참여율용)
  /** 기간 내 운동일 dayKey 오름차순 - 챌린지 레벨 계산 재료 */
  workoutDayKeys: string[];
  weightReps: number;
  volumeKg: number; // 레거시 표시용
  cardioDistanceKm: number;
  cardioTimeMin: number;
  bodyweightReps: number;
  bodyweightTimeMin: number;
  /** 기간 내 타바타 표식 세션 수 — tabata_count 판정 (0019) */
  tabataCount: number;
  /**
   * 날짜별 웨이트 완료 **종목** 수 — weight_days 판정.
   *
   * 2026-07-30까지는 부위 수였다. 하체를 집중적으로 하는 사람이 종목을
   * 아무리 늘려도 부위가 안 늘어나서, 5종목·13세트를 한 날이 qualifier=4에
   * 걸려 0일로 집계됐다. bodyweight_days가 이미 종목 수로 세므로 두 유형의
   * 규칙도 이제 일치한다.
   */
  weightKindsByDay: Record<string, number>;
  /** 날짜별 맨몸 완료 종목 수 — bodyweight_days 판정 */
  bodyweightKindsByDay: Record<string, number>;
};

export const EMPTY_STATS: PeriodStats = {
  workoutDays: 0,
  workoutDayKeys: [],
  weightReps: 0,
  volumeKg: 0,
  cardioDistanceKm: 0,
  cardioTimeMin: 0,
  bodyweightReps: 0,
  bodyweightTimeMin: 0,
  tabataCount: 0,
  weightKindsByDay: {},
  bodyweightKindsByDay: {},
};

/** foldPeriodStats 입력 — DB 조회를 정규화한 순수 표현 */
export type PeriodSessionRow = {
  userId: string;
  completedAt: string;
  /** 타바타 코스 분수 (0019) — 일반 세션은 생략/null */
  tabataMinutes?: number | null;
  exercises: {
    exerciseType: "weight" | "bodyweight" | "cardio";
    exerciseName: string;
    bodyPart: string | null;
    sets: {
      weightKg: number | null;
      reps: number | null;
      distanceMeters: number | null;
      durationSeconds: number | null;
      isCompleted: boolean;
    }[];
  }[];
};

/** 정규화 행 → 유저별 기간 실적 (순수·TDD 대상) */
export function foldPeriodStats(
  rows: PeriodSessionRow[],
  startDate: string,
  endDate: string,
  timeZone: string,
): Map<string, PeriodStats> {
  type Acc = PeriodStats & {
    days: Set<string>;
    weightKinds: Map<string, Set<string>>;
    bodyweightKinds: Map<string, Set<string>>;
  };
  const byUser = new Map<string, Acc>();

  for (const row of rows) {
    const key = dayKey(new Date(row.completedAt), timeZone);
    if (key < startDate || key > endDate) continue;

    const entry: Acc = byUser.get(row.userId) ?? {
      ...EMPTY_STATS,
      weightKindsByDay: {},
      bodyweightKindsByDay: {},
      days: new Set<string>(),
      weightKinds: new Map<string, Set<string>>(),
      bodyweightKinds: new Map<string, Set<string>>(),
    };
    entry.days.add(key);
    if (row.tabataMinutes) {
      entry.tabataCount += 1;
      // 타바타 세트는 reps=0·durationSeconds=null로 저장되고 분수는 여기에만
      // 있다. 이 줄이 없으면 타바타를 아무리 해도 bodyweight_time 목표가
      // 영구히 0이다 (2026-07-30 수정).
      entry.bodyweightTimeMin += row.tabataMinutes;
    }

    for (const ex of row.exercises) {
      let hasCompleted = false;
      for (const s of ex.sets) {
        if (!s.isCompleted) continue;
        hasCompleted = true;
        if (ex.exerciseType === "weight") {
          entry.volumeKg += Number(s.weightKg ?? 0) * (s.reps ?? 0);
          entry.weightReps += s.reps ?? 0;
        } else if (ex.exerciseType === "bodyweight") {
          entry.bodyweightReps += s.reps ?? 0;
          entry.bodyweightTimeMin += (s.durationSeconds ?? 0) / 60;
        } else {
          entry.cardioDistanceKm += Number(s.distanceMeters ?? 0) / 1000;
          entry.cardioTimeMin += (s.durationSeconds ?? 0) / 60;
        }
      }
      if (!hasCompleted) continue;
      if (ex.exerciseType === "weight") {
        // 부위(bodyPart)가 아니라 종목명으로 센다 — 2026-07-30 수정.
        // 바로 아래 bodyweight 쪽과 같은 기준이다.
        const kinds = entry.weightKinds.get(key) ?? new Set<string>();
        kinds.add(ex.exerciseName);
        entry.weightKinds.set(key, kinds);
      } else if (ex.exerciseType === "bodyweight") {
        const kinds = entry.bodyweightKinds.get(key) ?? new Set<string>();
        kinds.add(ex.exerciseName);
        entry.bodyweightKinds.set(key, kinds);
      }
    }
    byUser.set(row.userId, entry);
  }

  const result = new Map<string, PeriodStats>();
  for (const [userId, e] of byUser) {
    const weightKindsByDay: Record<string, number> = {};
    for (const [day, kinds] of e.weightKinds) weightKindsByDay[day] = kinds.size;
    const bodyweightKindsByDay: Record<string, number> = {};
    for (const [day, kinds] of e.bodyweightKinds) bodyweightKindsByDay[day] = kinds.size;
    result.set(userId, {
      workoutDays: e.days.size,
      workoutDayKeys: [...e.days].sort(),
      weightReps: e.weightReps,
      volumeKg: e.volumeKg,
      cardioDistanceKm: e.cardioDistanceKm,
      cardioTimeMin: e.cardioTimeMin,
      bodyweightReps: e.bodyweightReps,
      bodyweightTimeMin: e.bodyweightTimeMin,
      tabataCount: e.tabataCount,
      weightKindsByDay,
      bodyweightKindsByDay,
    });
  }
  return result;
}

/** 목표 유형별 실적 값 (*_days는 qualifier=하루 최소 종목 수 조건) */
export function actualForGoal(
  stats: PeriodStats,
  type: GoalType,
  qualifier?: number | null,
): number {
  const daysAtLeast = (byDay: Record<string, number>) => {
    const min = qualifier ?? 1;
    return Object.values(byDay).filter((n) => n >= min).length;
  };
  switch (type) {
    case "weight_reps":
      return stats.weightReps;
    case "weight_days":
      return daysAtLeast(stats.weightKindsByDay);
    case "cardio_distance":
      return stats.cardioDistanceKm;
    case "cardio_time":
      return stats.cardioTimeMin;
    case "bodyweight_reps":
      return stats.bodyweightReps;
    case "bodyweight_time":
      return stats.bodyweightTimeMin;
    case "bodyweight_days":
      return daysAtLeast(stats.bodyweightKindsByDay);
    case "tabata_count":
      return stats.tabataCount;
    case "volume":
      return stats.volumeKg;
  }
}

/**
 * 참가자별 기간 실적 집계.
 *
 * RLS가 읽게 해주는 세션(내 전부 + 크루 공개 완료분)만 반영된다 —
 * private 세션은 본인 점수에만 잡힌다(진행 중엔 내 것만 쓰므로 문제 없음).
 *
 * 0044부터 명단이 group_members가 아니라 challenge_participants다. 참가자
 * 전원과 crew_links가 맺어지는 것은 0042의 accept_challenge_invite가 보장한다
 * (설계 D5의 완전 연결) — 그래서 크루 공개 세션을 서로 읽을 수 있다.
 */
export async function getPeriodStatsByUser(
  userIds: string[],
  startDate: string,
  endDate: string,
  timeZone: string,
  photoRequired = false,
  client?: SupabaseClient,
): Promise<Map<string, PeriodStats>> {
  const supabase = client ?? getSupabaseBrowserClient();
  // 참가자가 0명이면 조회할 것이 없다. .in("user_id", [])는 PostgREST에서
  // 빈 IN 절이 되어 문법 오류를 낼 수 있으므로 여기서 끊는다.
  if (userIds.length === 0) return new Map();

  const fromIso = new Date(`${startDate}T00:00:00Z`);
  fromIso.setUTCDate(fromIso.getUTCDate() - 1);
  const toIso = new Date(`${endDate}T00:00:00Z`);
  toIso.setUTCDate(toIso.getUTCDate() + 2);

  // 세션당 사진은 1장이므로 inner join으로 집계 행이 중복되지 않는다.
  const select =
    "user_id, completed_at, tabata_minutes, workout_exercises(exercise_type, exercise_name, body_part, workout_sets(weight_kg, reps, distance_meters, duration_seconds, is_completed))" +
    (photoRequired ? ", workout_images!inner(image_path)" : "");

  const { data, error } = await supabase
    .from("workout_sessions")
    .select(select)
    // 0044: group_id 필터 → 참가자 user_id 필터.
    // 두 방식이 같은 세션 집합을 낸다는 것을 전환 전에 실측했다
    // (scripts/challenge-aggregation-parity.mjs). 그래야 진행 중 챌린지의
    // 점수가 안 흔들린다.
    .in("user_id", userIds)
    .eq("status", "completed")
    .is("deleted_at", null)
    .gte("completed_at", fromIso.toISOString())
    .lt("completed_at", toIso.toISOString());
  if (error) throw error;

  type DbRow = {
    user_id: string;
    completed_at: string;
    tabata_minutes: number | null;
    workout_exercises:
      | {
          exercise_type: "weight" | "bodyweight" | "cardio";
          exercise_name: string;
          body_part: string | null;
          workout_sets:
            | Pick<
                WorkoutSet,
                "weight_kg" | "reps" | "distance_meters" | "duration_seconds" | "is_completed"
              >[]
            | null;
        }[]
      | null;
  };

  // 조건부 select 문자열은 Supabase의 정적 문자열 파서가 해석할 수 없어
  // 런타임 응답을 위에서 정의한 실제 행 모양으로 명시한다.
  const rows: PeriodSessionRow[] = ((data ?? []) as unknown as DbRow[]).map((r) => ({
    userId: r.user_id,
    completedAt: r.completed_at,
    tabataMinutes: r.tabata_minutes,
    exercises: (r.workout_exercises ?? []).map((ex) => ({
      exerciseType: ex.exercise_type,
      exerciseName: ex.exercise_name,
      bodyPart: ex.body_part,
      sets: (ex.workout_sets ?? []).map((s) => ({
        weightKg: s.weight_kg,
        reps: s.reps,
        distanceMeters: s.distance_meters,
        durationSeconds: s.duration_seconds,
        isCompleted: s.is_completed,
      })),
    })),
  }));

  return foldPeriodStats(rows, startDate, endDate, timeZone);
}

// ── 진행 중 챌린지 랭킹 스냅샷 (꾸준왕 성과 시트용) ────────────────

export type ChallengeRanking = { name: string; list: RankedParticipant[] };

function periodDaysCount(startDate: string, endDate: string): number {
  const toUtc = (v: string) => {
    const [y, m, d] = v.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUtc(endDate) - toUtc(startDate)) / 86_400_000) + 1;
}

/**
 * 챌린지 하나의 현재 순위 — active가 아니면 null
 *
 * 0044부터 인자가 groupId가 아니라 challengeId다. 크루당 챌린지가 여러 개일 수
 * 있으므로 "그 크루의 챌린지"로는 대상이 정해지지 않는다.
 *
 * 명단의 원천도 목표가 아니라 참가자다. user_goals INSERT는 같은 그룹이면
 * 참가자가 아니어도 통과하므로(0006:81), 목표에서 명단을 뽑으면 참가하지 않은
 * 사람이 랭킹에 올라온다.
 *
 * `client`는 서버(관리자 대시보드)에서 service_role 클라이언트를 넣기 위한 것이다.
 * 생략하면 지금까지처럼 브라우저 클라이언트를 쓴다.
 * 달성률 계산을 서버용으로 복제하지 않으려고 주입 방식을 택했다(두 벌이 되면 갈라진다).
 */
export async function getActiveChallengeRanking(
  challengeId: string,
  client?: SupabaseClient,
): Promise<ChallengeRanking | null> {
  const supabase = client ?? getSupabaseBrowserClient();
  const { data: ch, error } = await supabase
    .from("challenges")
    .select("*")
    .eq("id", challengeId)
    .maybeSingle();
  if (error) throw error;
  if (!ch || ch.status !== "active") return null;

  const [goals, participants] = await Promise.all([
    getChallengeGoals(ch.id, client),
    getChallengeParticipants(ch.id, client),
  ]);
  // invited는 아직 참가자가 아니다. dropped는 목표 0개로 빠진 사람이라 어차피
  // 목표가 없어 점수가 0이지만, 명단에 남겨 결과 화면에서 사라지지 않게 한다.
  const userIds = participants
    .filter((p) => p.status !== "invited")
    .map((p) => p.user_id);

  const stats = await getPeriodStatsByUser(
    userIds,
    ch.start_date,
    ch.end_date,
    DEFAULT_TIMEZONE,
    ch.photo_required,
    client,
  );
  const days = periodDaysCount(ch.start_date, ch.end_date);

  const list = rankParticipants(
    userIds.map((uid) => {
      const userGoals = goals.filter((g) => g.user_id === uid);
      const s = stats.get(uid) ?? EMPTY_STATS;
      return {
        userId: uid,
        goals: userGoals.map((g) => ({
          type: g.goal_type,
          target: Number(g.target_value),
          actual: actualForGoal(s, g.goal_type, g.qualifier),
        })),
        workoutDays: s.workoutDays,
        plannedDays: plannedDaysForPeriod(userGoals[0]?.planned_days ?? 5, days),
        allGoalsCompletedAtMs: null,
      };
    }),
  );
  return { name: ch.name, list };
}

// ── 성과 열람 지정 (0040) ─────────────────────────────────────
// 열람 창은 KST 하루에 하나라 선택도 하루 하나다. 이미 고른 게 있으면 RPC가
// 그걸 그대로 돌려주므로, 두 번째 호출은 실패가 아니라 조회가 된다.

/** 오늘 이 챌린지에서 내가 고른 열람 대상 — 아직 안 골랐으면 null */
export async function getTodaysPeekTarget(
  challengeId: string,
): Promise<string | null> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("challenge_peek_picks")
    .select("target_id, pick_date")
    .eq("challenge_id", challengeId)
    .order("pick_date", { ascending: false })
    .limit(1);
  if (error) throw error;
  const row = (data ?? [])[0] as
    | { target_id: string; pick_date: string }
    | undefined;
  if (!row) return null;
  // 어제 창의 선택이 오늘로 새지 않게 KST 날짜를 다시 확인한다.
  const todayKst = new Date(Date.now() + 9 * 3_600_000)
    .toISOString()
    .slice(0, 10);
  return row.pick_date === todayKst ? row.target_id : null;
}

/** 열람 대상 지정 — 이미 고른 사람이 있으면 그 사람이 그대로 돌아온다 */
export async function pickPeekTarget(
  challengeId: string,
  targetId: string,
): Promise<{ targetId: string; locked: boolean }> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("pick_challenge_peek", {
    p_challenge_id: challengeId,
    p_target_id: targetId,
  });
  if (error) throw error;
  const row = data as { targetId: string; locked: boolean };
  return { targetId: row.targetId, locked: row.locked };
}
