import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { DEFAULT_TIMEZONE, dayKey } from "@/lib/domain/time";
import {
  plannedDaysForPeriod,
  rankParticipants,
  scoreParticipant,
  type GoalType,
  type ParticipantInput,
  type RankedParticipant,
} from "@/lib/domain/goal-score";
import { inclusiveDays } from "@/lib/domain/challenge-time";
import type { Challenge, Profile, UserGoal } from "@/lib/types";

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
  tabata_count: { label: "인터벌 운동 횟수", unit: "회", defaultTarget: 12, category: "bodyweight" },
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

/**
 * 내 목표들이 덮는 운동 분류 (2026-08-04).
 *
 * 신고 0783ca35: 목표가 맨몸·유산소뿐인 사용자가 웨이트 스쿼트를 100회 기록했다.
 * 앱은 아무 말도 하지 않았고, 챌린지 맨몸 %는 내내 0이었다. 고르는 순간에
 * "이건 안 잡힌다"고 말해 주려면 먼저 무엇이 잡히는지를 알아야 한다.
 */
export function goalCategories(
  goals: readonly { goal_type: GoalType }[],
): Set<GoalCategory> {
  return new Set(goals.map((g) => GOAL_TYPE_META[g.goal_type].category));
}

/**
 * 이 종목을 해서 챌린지 실적이 오르는가.
 *
 * `GoalCategory`와 `ExerciseType`은 같은 세 값("weight"·"cardio"·"bodyweight")이라
 * 그대로 맞춰 본다 — `foldPeriodStats`가 실제로 `exerciseType`으로 갈라 담는다.
 *
 * **목표를 모를 때는 true.** 챌린지가 없거나 아직 못 불러온 상태에서 "도움이
 * 안 된다"고 하면 멀쩡한 운동을 말리는 셈이다. 확실할 때만 경고한다.
 */
export function countsTowardChallenge(
  exerciseType: GoalCategory,
  categories: ReadonlySet<GoalCategory> | null,
): boolean {
  if (categories === null || categories.size === 0) return true;
  return categories.has(exerciseType);
}

/** 안내 문구에 쓸 분류 이름 — "맨몸 · 유산소" */
export const CATEGORY_LABEL: Record<GoalCategory, string> = {
  weight: "웨이트",
  cardio: "유산소",
  bodyweight: "맨몸",
};

export function categoriesLabel(
  categories: ReadonlySet<GoalCategory>,
): string {
  // 표시 순서를 고정한다 — Set 순회 순서(삽입 순)에 맡기면 사람마다 다르게 보인다
  return (["weight", "bodyweight", "cardio"] as const)
    .filter((c) => categories.has(c))
    .map((c) => CATEGORY_LABEL[c])
    .join(" · ");
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

export type ChallengeParticipantProfile = Pick<
  Profile,
  "id" | "nickname" | "avatar_url"
>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

/** 프로필 RPC 응답을 검사하고 화면에 필요한 세 필드만 남긴다. */
export function normalizeChallengeParticipantProfiles(
  data: unknown,
): ChallengeParticipantProfile[] {
  if (!Array.isArray(data)) {
    throw new Error("invalid_challenge_participant_profiles");
  }

  return data.map((row: unknown) => {
    if (
      !isPlainObject(row) ||
      typeof row.id !== "string" ||
      typeof row.nickname !== "string" ||
      (row.avatar_url !== null && typeof row.avatar_url !== "string")
    ) {
      throw new Error("invalid_challenge_participant_profiles");
    }
    return {
      id: row.id,
      nickname: row.nickname,
      avatar_url: row.avatar_url,
    };
  });
}

/** 챌린지 안에서 랭킹에 필요한 최소 프로필만 가져온다. */
export async function getChallengeParticipantProfiles(
  challengeId: string,
  client?: SupabaseClient,
): Promise<ChallengeParticipantProfile[]> {
  const supabase = client ?? getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("get_challenge_participant_profiles", {
    p_challenge_id: challengeId,
  });
  if (error) throw error;
  return normalizeChallengeParticipantProfiles(data);
}

// createChallenge(직접 insert)는 0044에서 지웠다. challenge_participants에 host
// 행을 만들지 않아, 그 경로로 만든 챌린지는 getMyChallenges()에 안 잡히는
// "안 보이는 챌린지"가 된다. 생성은 createChallengeRoom RPC 하나뿐이다.

/** 챌린지의 전체 참가자 목표 (RLS: 참가자만) */
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

/**
 * 지금 **진행 중인** 챌린지에서 내가 정한 주 운동일 수. 없으면 `null`.
 *
 * 2026-08-08 사용자 결정 — *"주간 운동표는 챌린지에서 세팅하는 걸로 하자."*
 * 그래서 홈·캘린더의 주간 기준은 `profiles.weekly_goal`이 아니라 여기서 온다.
 *
 * ⚠️ **`null`을 숫자로 뭉개지 마라.** `?? 3`이나 `?? 5`를 붙이는 순간
 * 문제가 그대로 돌아온다 — 챌린지가 없는 사람에게 **아무도 정하지 않은 분모**로
 * 달성률을 매기게 된다. 그게 이 작업의 원인이다. 화면이 `null`을 받아
 * "목표 없음"을 그리게 둬라.
 *
 * ⚠️ `active`만 본다. `setup`은 아직 시작 안 한 것이고(목표를 고치는 중일 수
 * 있다), `ended`는 지난 기준이다. 둘 다 이번 주를 재는 잣대가 아니다.
 *
 * 진행 중 챌린지가 여럿이면 **가장 큰 값**을 쓴다. 여러 챌린지에 걸쳐 있는
 * 사람에게 낮은 쪽을 들이대면 이미 넘긴 목표가 100%로 굳어 화면이 심심해진다.
 */
export async function getMyWeeklyGoalDays(
  userId: string,
  client?: SupabaseClient,
): Promise<number | null> {
  const supabase = client ?? getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("user_goals")
    .select("planned_days, challenges!inner(status)")
    .eq("user_id", userId)
    .eq("challenges.status", "active");
  if (error) throw error;

  const days = (data ?? [])
    .map((r) => (r as { planned_days: number }).planned_days)
    .filter((d) => Number.isFinite(d) && d > 0);
  return days.length > 0 ? Math.max(...days) : null;
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

/** 이 챌린지에 동의한 참가자 id 집합 (setup 현황·시작 게이트용) */
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

/** 수락 — joined 전환. 다른 참가자와의 연결은 이 챌린지 안에서만 유지된다. */
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
 * 초대 링크로 참가. 방장 승인 없이 바로 joined가 된다.
 * 참가자 닉네임과 운동 기록은 챌린지 전용 RPC로 필요한 범위만 읽는다.
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

export type NewcomerJoinResult = {
  challengeId: string;
  challengeName: string;
  /** 1이면 방장과 친구가 됐다. 0이면 챌린지 참가만 됐다(방장을 못 찾은 예외 경로). */
  crewLinked: number;
  hostNickname?: string;
};

/**
 * **신규 가입자**가 챌린지 링크로 참가 — 참가 + 방장과 친구 연결 (0063).
 *
 * 사용자 질문 (2026-08-08): "GND 처음 조인하는 사람이라면 챌린지 초대한 사람과
 * 친구도 되고 챌린지도 추가 되게 설계해야 하는 거 아닌가."
 *
 * ⚠️⚠️ **이 함수는 신입 전용이다.** 서버가 `crew_links` 0건 + `challenge_participants`
 * 0건을 검사하고, 아니면 `not_newcomer`를 던진다. 호출부는 그때 반드시
 * `joinChallengeWithCode`로 폴백해야 한다 — 폴백을 빼면 기존 사용자가 링크로
 * 참가할 수 없게 된다.
 *
 * ⚠️ 가드를 우회하려 하지 마라. 링크 참가자 **전원**을 친구로 묶는 것이 `D5`였고,
 * 2026-07-31에 사용자가 신고해서(다른 챌린지 멤버가 크루 목록에 섞였다) `0051`이
 * 지웠다. 신입만·방장만이라는 조건이 그 사고를 막는 유일한 장치다.
 * 설계 §3.6 / `supabase/migrations/0063_newcomer_challenge_crew_link.sql` 헤더.
 */
export async function joinChallengeAsNewcomer(
  code: string,
): Promise<NewcomerJoinResult> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("join_challenge_as_newcomer", {
    p_code: code,
  });
  if (error) throw error;
  return data as NewcomerJoinResult;
}

/** 서버가 "신입이 아니다"라고 답했는가 — `joinChallengeWithCode` 폴백 조건 */
export function isNotNewcomer(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.includes("not_newcomer");
}

/**
 * 챌린지 참가 실패 → 사람 말 + 되돌릴 수 있는가 (2026-08-08).
 *
 * ⚠️⚠️ **오류를 `catch {}`로 버리지 마라.** 온보딩이 서버 오류 셋을
 * `초대 링크를 다시 확인해 주세요` 한 줄로 뭉개고 있었다. 실측한 실패는 이랬다:
 *
 *   취소된 챌린지의 코드 → invalid_status:cancelled
 *   없는 코드           → invalid_invite_code
 *   시작한 챌린지       → invalid_status:active
 *
 * 셋 다 "링크를 다시 확인해 주세요"로 나오니, **링크가 멀쩡한데 링크를 의심하게**
 * 된다. 사용자가 실제로 그렇게 시간을 썼다(2026-08-08). `/auth/callback`이 오류를
 * 삼켰던 것과 같은 부류다 — 같은 날 그걸 고쳐 놓고 옆 파일에서 반복하고 있었다.
 *
 * `recoverable`은 **보관해 둔 코드를 살려둘 가치가 있는가**다. 코드가 없거나
 * 챌린지가 이미 시작·취소됐으면 다시 시도해도 영원히 같은 결과라, 남겨두면
 * 그 브라우저의 **다음 가입까지** 오염된다(실제로 그렇게 반복 실패했다).
 */
export function challengeJoinError(e: unknown): {
  message: string;
  recoverable: boolean;
} {
  const msg = e instanceof Error ? e.message : String(e);

  if (msg.includes("invalid_invite_code")) {
    return {
      message: "초대 링크가 만료됐거나 잘못됐어요. 초대한 분께 다시 받아 주세요.",
      recoverable: false,
    };
  }
  if (msg.includes("invalid_status:active")) {
    return {
      message:
        "이 챌린지는 이미 시작해서 참가가 닫혔어요. 중간에 합류하면 점수가 공정하지 않아서예요.",
      recoverable: false,
    };
  }
  if (msg.includes("invalid_status:ended")) {
    return { message: "이미 끝난 챌린지예요.", recoverable: false };
  }
  if (msg.includes("invalid_status:cancelled")) {
    return { message: "취소된 챌린지예요.", recoverable: false };
  }
  if (msg.includes("already_joined")) {
    // 되돌릴 수 있는 게 아니라 **이미 된 것**이다. 코드를 남길 이유가 없다.
    return { message: "이미 참가한 챌린지예요.", recoverable: false };
  }
  // 여기까지 오면 원인을 모른다 — 네트워크·RLS·미지의 서버 오류.
  // 그때는 코드를 살려둔다. 다시 시도하면 될 수도 있다.
  return { message: `챌린지에 참가하지 못했어요 (${msg})`, recoverable: true };
}

// ── 온보딩 → 챌린지 화면으로 넘기는 일회성 안내 ──────────────────
//
// 온보딩이 참가·친구 연결을 **둘 다** 끝낸 뒤 /challenge로 보내므로, 그 화면에는
// 아무 말도 남지 않는다(옛 흐름은 조용히 이동했다). 두 가지가 동시에 일어났으니
// 둘 다 말해야 한다.
//
// ⚠️ 쿼리스트링에 닉네임을 담지 않는다. 주소창·기록에 남고 새로고침마다 다시 뜬다.
const ONBOARDING_NOTICE_KEY = "gnd-onboarding-notice";

export function saveOnboardingNotice(message: string): void {
  sessionStorage.setItem(ONBOARDING_NOTICE_KEY, message);
}

/** 한 번만 꺼내진다 — 읽는 즉시 지운다 */
export function takeOnboardingNotice(): string | null {
  const v = sessionStorage.getItem(ONBOARDING_NOTICE_KEY);
  if (v !== null) sessionStorage.removeItem(ONBOARDING_NOTICE_KEY);
  return v;
}

// ── 초대 링크로 처음 온 사람을 위한 코드 보관 ────────────────────
//
// 링크(/challenge?join=CODE)로 처음 오면 프로필이 없어 OnboardingGate가
// 온보딩으로 보내 버리고, 그 순간 주소의 코드가 사라진다. 그러면 닉네임을
// 정하고 돌아와도 챌린지에 못 들어간다 — 링크가 **기존 사용자에게만** 동작한다.
//
// 그래서 챌린지 화면이 코드를 보는 즉시 보관하고, 온보딩이 닉네임을 받은 뒤
// 그걸 꺼내 참가시킨다. 그룹 초대(savePendingInvite)와 같은 방식이고 키만 다르다.
const PENDING_CHALLENGE_KEY = "gnd-pending-challenge-invite";

export function savePendingChallengeInvite(code: string): void {
  localStorage.setItem(PENDING_CHALLENGE_KEY, code);
}

export function peekPendingChallengeInvite(): string | null {
  return localStorage.getItem(PENDING_CHALLENGE_KEY);
}

export function clearPendingChallengeInvite(): void {
  localStorage.removeItem(PENDING_CHALLENGE_KEY);
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

/**
 * 방금 끝낸 로컬 draft → 집계 입력 (2026-08-06).
 *
 * `lib/workout.ts`의 `LocalExercise`를 그대로 받으면 challenge.ts가 화면 쪽
 * 모듈에 의존하게 되므로, **필요한 모양만** 구조적으로 받는다.
 */
export type FinishedDraftExercise = {
  name: string;
  bodyPart: string | null;
  exerciseType: "weight" | "bodyweight" | "cardio";
  sets: readonly {
    weightKg: number;
    reps: number;
    /** draft는 km·분으로 들고 있다 — 여기서 m·초로 바꾼다 */
    distanceKm: number;
    durationMin: number;
    done: boolean;
  }[];
};

/**
 * 완료 화면의 "이번 운동이 챌린지에 얼마나 쌓였나"를 계산하기 위한 변환.
 *
 * ⚠️ **`tabataMinutes`를 반드시 실어야 한다.** 신고 a2ffb44a(2026-08-05):
 * 화면이 `tabataMinutes: null`을 박아 넣는 바람에, `tabata_count` 목표를 둔
 * 사람이 타바타를 하고도 완료 화면에서 "이번 운동은 챌린지 성과에 안
 * 잡혔어요"를 봤다. 서버 집계(`challenge_period_sessions`)는 분수를 제대로
 * 넘기므로 챌린지 화면에는 잡혔고, **두 화면이 서로 다른 말을 했다.**
 *
 * 화면 안에 있던 변환을 여기로 옮긴 이유가 그거다 — 집계 규칙 옆에 두어야
 * 단위 테스트가 잡는다.
 */
export function toPeriodSessionRow(input: {
  userId: string;
  completedAtMs: number;
  exercises: readonly FinishedDraftExercise[];
  /** 타바타 세션이면 코스 분수 (4|8|16), 일반 운동이면 null */
  tabataMinutes: number | null;
}): PeriodSessionRow {
  return {
    userId: input.userId,
    completedAt: new Date(input.completedAtMs).toISOString(),
    tabataMinutes: input.tabataMinutes,
    exercises: input.exercises.map((ex) => ({
      exerciseType: ex.exerciseType,
      exerciseName: ex.name,
      bodyPart: ex.bodyPart,
      sets: ex.sets.map((s) => ({
        weightKg: s.weightKg,
        reps: s.reps,
        distanceMeters: s.distanceKm * 1000,
        durationSeconds: s.durationMin * 60,
        isCompleted: s.done,
      })),
    })),
  };
}

type ChallengePeriodSessionRpcRow = {
  user_id: string;
  completed_at: string;
  tabata_minutes: number | null;
  workout_exercises:
    | {
        exercise_type: "weight" | "bodyweight" | "cardio";
        exercise_name: string;
        body_part: string | null;
        workout_sets:
          | {
              weight_kg: number | null;
              reps: number | null;
              distance_meters: number | null;
              duration_seconds: number | null;
              is_completed: boolean;
            }[]
          | null;
      }[]
    | null;
};

/** 챌린지 세션 RPC의 snake_case 응답을 점수 계산용 모양으로 바꾼다. */
export function normalizeChallengePeriodSessions(
  data: unknown,
): PeriodSessionRow[] {
  if (!Array.isArray(data)) {
    throw new Error("invalid_challenge_period_sessions");
  }

  return data.map((row: unknown) => {
    if (
      !isPlainObject(row) ||
      typeof row.user_id !== "string" ||
      typeof row.completed_at !== "string" ||
      !isNullableNumber(row.tabata_minutes) ||
      (row.workout_exercises !== null && !Array.isArray(row.workout_exercises))
    ) {
      throw new Error("invalid_challenge_period_sessions");
    }

    for (const exercise of row.workout_exercises ?? []) {
      if (
        !isPlainObject(exercise) ||
        (exercise.exercise_type !== "weight" &&
          exercise.exercise_type !== "bodyweight" &&
          exercise.exercise_type !== "cardio") ||
        typeof exercise.exercise_name !== "string" ||
        (exercise.body_part !== null && typeof exercise.body_part !== "string") ||
        (exercise.workout_sets !== null && !Array.isArray(exercise.workout_sets))
      ) {
        throw new Error("invalid_challenge_period_sessions");
      }

      for (const set of exercise.workout_sets ?? []) {
        if (
          !isPlainObject(set) ||
          !isNullableNumber(set.weight_kg) ||
          !isNullableNumber(set.reps) ||
          !isNullableNumber(set.distance_meters) ||
          !isNullableNumber(set.duration_seconds) ||
          typeof set.is_completed !== "boolean"
        ) {
          throw new Error("invalid_challenge_period_sessions");
        }
      }
    }

    const validRow = row as unknown as ChallengePeriodSessionRpcRow;
    return {
      userId: validRow.user_id,
      completedAt: validRow.completed_at,
      tabataMinutes: validRow.tabata_minutes,
      exercises: (validRow.workout_exercises ?? []).map((exercise) => ({
        exerciseType: exercise.exercise_type,
        exerciseName: exercise.exercise_name,
        bodyPart: exercise.body_part,
        sets: (exercise.workout_sets ?? []).map((set) => ({
          weightKg: set.weight_kg,
          reps: set.reps,
          distanceMeters: set.distance_meters,
          durationSeconds: set.duration_seconds,
          isCompleted: set.is_completed,
        })),
      })),
    };
  });
}

/** 챌린지 참가자들의 기간 내 완료 세션을 제한된 RPC로 가져온다. */
export async function getChallengePeriodSessions(
  challengeId: string,
  client?: SupabaseClient,
): Promise<PeriodSessionRow[]> {
  const supabase = client ?? getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("get_challenge_period_sessions", {
    p_challenge_id: challengeId,
  });
  if (error) throw error;
  return normalizeChallengePeriodSessions(data);
}

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

/** 이번 운동이 목표 하나에 얼마나 보탰는지 */
export type GoalContribution = {
  type: GoalType;
  /** "맨몸 횟수" 같은 표시 이름 (+조건) */
  label: string;
  /** 이번 세션이 더한 양 */
  delta: number;
  unit: string;
  target: number;
};

/** 소수 첫째 자리까지, .0은 떼고 */
function trimNumber(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * 방금 끝낸 운동이 내 챌린지 목표에 얼마나 보탰는지 (2026-08-04, 사용자 요청).
 *
 * "맨몸 목표에 +40회 쌓였어요"를 완료 화면에서 보여주기 위한 것이다. 운동이
 * 끝난 그 자리에서 챌린지와 연결해 주면, 무엇이 잡히고 무엇이 안 잡히는지가
 * 숫자로 보인다 — 신고 0783ca35는 100회를 쌓고 나서야 안 잡힌 걸 알았다.
 *
 * ⚠️ 집계 규칙을 새로 쓰지 않는다. `foldPeriodStats`에 **이 세션 하나만** 넣고
 *    같은 함수로 접는다. 두 벌로 만들면 반드시 갈라진다 — 타바타 분수가
 *    맨몸 시간에 들어가는 것 같은 예외가 여기에만 빠지는 식이다.
 *
 * **0인 목표도 빼지 않고 그대로 돌려준다.** 화면이 "쌓였어요"와 "안 잡혔어요"를
 * 갈라 쓰려면 둘 다 알아야 한다. 처음에는 여기서 걸렀는데, 그러면 기여가 없는
 * 운동에서 카드가 통째로 사라져 **아무 말도 안 하게 된다** — 원래 버그(왜 내
 * 숫자가 안 오르는지 알 수 없다)와 같은 실패다. 2026-08-04 개발 서버 확인에서
 * 사용자가 잡았다(맨몸 3종목·웨이트 2종목 둘 다 카드가 안 떴다).
 *
 * `*_days`는 하루 최소 종목 수를 채웠을 때만 1일로 잡힌다 — 웨이트 2종목을 한
 * 날은 qualifier가 3이면 0일이다.
 */
export function sessionGoalContribution(input: {
  session: PeriodSessionRow;
  goals: readonly {
    goal_type: GoalType;
    target_value: number | string;
    qualifier?: number | null;
  }[];
  timeZone: string;
}): GoalContribution[] {
  const day = dayKey(new Date(input.session.completedAt), input.timeZone);
  const stats =
    foldPeriodStats([input.session], day, day, input.timeZone).get(
      input.session.userId,
    ) ?? EMPTY_STATS;

  return input.goals.map((g) => ({
    type: g.goal_type,
    label: goalLabel(g.goal_type, g.qualifier),
    delta: trimNumber(actualForGoal(stats, g.goal_type, g.qualifier)),
    unit: GOAL_TYPE_META[g.goal_type].unit,
    target: Number(g.target_value),
  }));
}

/**
 * 참가자별 기간 실적 집계.
 *
 * 전용 RPC가 이 챌린지의 joined/dropped 참가자 완료 세션만 돌려준다.
 * 사진 인증 필수 여부와 넉넉한 UTC 기간창도 서버에서 챌린지 설정대로 적용한다.
 * 실제 날짜 범위와 점수 계산은 아래 foldPeriodStats 한 곳에서 최종 판정한다.
 */
export async function getPeriodStatsByUser(
  challengeId: string,
  startDate: string,
  endDate: string,
  timeZone: string,
  client?: SupabaseClient,
): Promise<Map<string, PeriodStats>> {
  const rows = await getChallengePeriodSessions(challengeId, client);
  return foldPeriodStats(rows, startDate, endDate, timeZone);
}

// ── 진행 중 챌린지 랭킹 스냅샷 (꾸준왕 성과 시트용) ────────────────

export type ChallengeRanking = { name: string; list: RankedParticipant[] };

/**
 * 한 사람의 채점 입력 조립 — 목표 × 실적 → `ParticipantInput`.
 *
 * ⚠️⚠️ **이 매핑을 화면에서 다시 짜지 마라** (2026-08-13에 뽑았다). 같은 코드가
 * `getActiveChallengeRanking`과 `challenge/page.tsx`에 **두 벌** 있었고, 홈 챌린지
 * 카드가 세 번째를 만들 뻔했다. 특히 `plannedDaysForPeriod(planned_days ?? 5, …)`의
 * 기본값 5는 세 곳이 각자 적고 있어서, 한 곳만 고치면 **같은 사람의 참여율이 화면마다
 * 달라진다.**
 */
export function buildParticipantInput(input: {
  userId: string;
  /** 그 사람의 목표만 (`user_id`로 이미 걸러진 것) */
  goals: UserGoal[];
  stats: PeriodStats;
  /** 챌린지 전체 기간 일수 — `inclusiveDays(start, end)` */
  periodDays: number;
}): ParticipantInput {
  const { userId, goals, stats, periodDays } = input;
  return {
    userId,
    goals: goals.map((g) => ({
      type: g.goal_type,
      target: Number(g.target_value),
      actual: actualForGoal(stats, g.goal_type, g.qualifier),
    })),
    workoutDays: stats.workoutDays,
    plannedDays: plannedDaysForPeriod(goals[0]?.planned_days ?? 5, periodDays),
    allGoalsCompletedAtMs: null,
  };
}

/** 홈 챌린지 카드가 쓰는 내 점수 요약 (2026-08-13) */
export type MyChallengeScore = {
  achievement: number;
  participation: number;
  overall: number;
  /** 내가 건 목표 수. 0이면 아직 KPI를 안 세웠다는 뜻이다 */
  goalCount: number;
};

/**
 * 진행 중 챌린지에서 **내** 점수만 (2026-08-13, 홈 카드용).
 *
 * ⚠️ 챌린지 탭과 **같은 함수**(`buildParticipantInput` → `scoreParticipant`)를 지난다.
 * 홈이 따로 계산하면 같은 챌린지가 홈에서 40%, 탭에서 38%로 보인다 — 이 저장소가
 * 반복해서 당한 종류의 사고다.
 *
 * ⚠️ 조회 2건이 든다(목표 + 기간 세션). 홈에서는 **다른 조회를 막지 않는 별도
 * effect**로 부르고, 도착 전에는 카드가 이름·D-day만 그린다.
 */
export async function getMyChallengeScore(input: {
  userId: string;
  challengeId: string;
  startDate: string;
  endDate: string;
  timeZone: string;
}): Promise<MyChallengeScore> {
  const [goals, statsByUser] = await Promise.all([
    getChallengeGoals(input.challengeId),
    getPeriodStatsByUser(
      input.challengeId,
      input.startDate,
      input.endDate,
      input.timeZone,
    ),
  ]);
  const myGoals = goals.filter((g) => g.user_id === input.userId);
  const scored = scoreParticipant(
    buildParticipantInput({
      userId: input.userId,
      goals: myGoals,
      stats: statsByUser.get(input.userId) ?? EMPTY_STATS,
      periodDays: inclusiveDays(input.startDate, input.endDate),
    }),
  );
  return { ...scored, goalCount: myGoals.length };
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
    ch.id,
    ch.start_date,
    ch.end_date,
    DEFAULT_TIMEZONE,
    client,
  );
  const days = inclusiveDays(ch.start_date, ch.end_date);

  const list = rankParticipants(
    userIds.map((uid) =>
      buildParticipantInput({
        userId: uid,
        goals: goals.filter((g) => g.user_id === uid),
        stats: stats.get(uid) ?? EMPTY_STATS,
        periodDays: days,
      }),
    ),
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

/**
 * 이 챌린지에서 열람권을 **마지막으로 쓴 날** (KST `YYYY-MM-DD`). 없으면 `null`.
 *
 * "쓴 날" = 대상을 고른 날이다. 카드를 열어 잠금 화면을 본 것은 사용이 아니다 —
 * 아무것도 못 봤으니까. 소비 지점은 `pick_challenge_peek` 하나뿐이고, 그 결과가
 * `challenge_peek_picks`에 그대로 남아 있다 (2026-08-09).
 *
 * ⚠️ 잠금 상태에서도 부른다. `challenge_peek_picks`는 RLS상 **본인 행만** 보이므로
 * (`0040`의 `challenge_peek_picks_own_select`) 남의 정보가 새지 않는다.
 */
export async function getLastPeekUseDay(
  challengeId: string,
): Promise<string | null> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("challenge_peek_picks")
    .select("pick_date")
    .eq("challenge_id", challengeId)
    .order("pick_date", { ascending: false })
    .limit(1);
  if (error) throw error;
  const row = (data ?? [])[0] as { pick_date: string } | undefined;
  return row?.pick_date ?? null;
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

// ── 공개 챌린지 모집 (0085) ──────────────────────────────────

/** `challenges.recruit_note`의 CHECK가 150자다 (0087) */
export const RECRUIT_NOTE_MAX_LENGTH = 150;

export type DiscoverableChallenge = {
  id: string;
  name: string;
  /**
   * 모집글 (0087). 이름만으로는 "누가 어떤 사람을 찾는지"를 알 수 없어서
   * 모르는 사람이 참여를 결정할 근거가 없다.
   */
  recruitNote: string | null;
  /** 모집 사진 (0087). `avatars` 버킷의 공개 URL 또는 null */
  recruitImageUrl: string | null;
  startDate: string; // YYYY-MM-DD
  endDate: string;
  /**
   * 인증사진 필수인가.
   *
   * ⚠️ **"항상 true"라고 가정하지 마라.** `create_challenge_room`이
   *    `SECURITY DEFINER`라 `challenges_insert_member`의 `photo_required = true`
   *    검사를 지나가고, `p_photo_required boolean`으로 false를 저장할 수 있다.
   *    지금 운영 값이 전부 true인 것은 그렇게 만들어 왔을 뿐이다.
   */
  photoRequired: boolean;
  /** `status='joined'`인 사람만 센다 — invited·dropped를 세면 숫자가 부푼다 */
  participantCount: number;
  hostId: string;
  hostNickname: string;
  hostAvatarUrl: string | null;
  /** 내가 이미 참가 중인가 — 버튼이 `참여하기`/`참가 중 · 보기`로 갈린다 */
  alreadyJoined: boolean;
};

/**
 * 피드에 띄울 공개 모집 챌린지 (0085).
 *
 * `challenges_select_member` 정책이 "참가자 OR 그룹원"이라 **비참가자는 목록을
 * 볼 수 없다.** 그래서 정의자 RPC가 `discoverable = true` + `status='setup'`인
 * 것만, 최소값만 돌려준다 — `invite_code`·`group_id`·목표·랭킹·참가자 명단은
 * 나오지 않는다.
 *
 * ⚠️ 실패해도 던지지 않는다. 모집 카드는 **부가 정보**라, 못 불러왔다고 피드
 *    전체가 안 뜨면 손해가 더 크다(진행 중 카드와 같은 규약).
 */
export async function getDiscoverableChallenges(): Promise<
  DiscoverableChallenge[]
> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("list_discoverable_challenges");
  if (error) return [];
  return (
    (data ?? []) as {
      id: string;
      name: string;
      recruit_note: string | null;
      recruit_image_url: string | null;
      start_date: string;
      end_date: string;
      photo_required: boolean;
      participant_count: number;
      host_id: string;
      host_nickname: string;
      host_avatar_url: string | null;
      already_joined: boolean;
    }[]
  ).map((r) => ({
    id: r.id,
    name: r.name,
    recruitNote: r.recruit_note,
    recruitImageUrl: r.recruit_image_url,
    startDate: r.start_date,
    endDate: r.end_date,
    photoRequired: r.photo_required,
    participantCount: r.participant_count,
    hostId: r.host_id,
    hostNickname: r.host_nickname,
    hostAvatarUrl: r.host_avatar_url,
    alreadyJoined: r.already_joined,
  }));
}

/**
 * 공개 모집 챌린지에 참가 (0085).
 *
 * ⚠️ `join_challenge_with_code`를 재사용하지 않는 이유 — 그러려면 카드에
 *    `invite_code`를 실어야 하는데, 그러면 **방장이 모집을 끈 뒤에도 그 코드로
 *    계속 들어온다.** 공개는 껐다 켤 수 있어야 한다.
 *
 * 서버가 `challenges` 행을 `FOR UPDATE`로 잠그고 `discoverable`·`status`를
 * 다시 본다 — 참가와 시작이 겹쳐도 중도 합류가 안 생긴다.
 *
 * ⚠️ 참가해도 **크루가 되지 않는다.** GND의 "챌린지 관계 ≠ 크루 관계" 원칙이다.
 */
export async function joinDiscoverableChallenge(
  challengeId: string,
): Promise<{ challengeId: string; challengeName: string }> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("join_discoverable_challenge", {
    p_challenge_id: challengeId,
  });
  if (error) throw error;
  return data as { challengeId: string; challengeName: string };
}

/**
 * setup 단계에서 나가기 (0085).
 *
 * ⚠️ **공개 참가의 되돌리기 버튼이다.** 초대 링크는 누가 일부러 보내 준 것이라
 *    잘못 눌릴 일이 드물었지만, 공개 모집은 "발견 → 참여하기"라 오조작이
 *    필연이다. 나갈 문 없는 참가 버튼은 만들면 안 된다.
 *
 * 방장은 나갈 수 없다(`host_cannot_leave`) — 방을 접으려면 `cancelChallenge`다.
 */
export async function leaveSetupChallenge(challengeId: string): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.rpc("leave_setup_challenge", {
    p_challenge_id: challengeId,
  });
  if (error) throw error;
}

/**
 * 피드 모집 켜기/끄기 (0085).
 *
 * RPC가 아닌 직접 UPDATE인 이유 — `challenges_update_creator` 정책이
 * `created_by = auth.uid()`로 방장의 UPDATE를 이미 연다. 컬럼 하나를 더 바꾼다고
 * 권한이 넓어지지 않는다(방장은 이미 `name`·`start_date`도 바꿀 수 있다).
 *
 * ⚠️ 0행이어도 PostgREST는 오류를 주지 않는다. `.select()`로 바뀐 행을 받아
 *    확인한다 — 2026-08-30에 캡션 저장이 정확히 이 함정으로 조용히 실패했다.
 */
/**
 * 모집글 저장 (0087).
 *
 * ⚠️ 0086과 **같은 함정**을 조심한다 — RLS 정책(`challenges_update_creator`)이
 *    있어도 컬럼 GRANT가 없으면 `42501`로 죽는다. 0087이
 *    `grant update (recruit_note)`를 준다.
 *
 * ⚠️ 0행이어도 PostgREST는 오류를 주지 않는다. `.select()`로 확인한다.
 */
export async function setChallengeRecruitNote(
  challengeId: string,
  note: string | null,
): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const trimmed = (note ?? "").trim();
  const { data, error } = await supabase
    .from("challenges")
    .update({ recruit_note: trimmed.length === 0 ? null : trimmed })
    .eq("id", challengeId)
    .select("id");
  if (error) throw error;
  if (!data || data.length === 0) throw new Error("recruit_note_not_saved");
}

/**
 * 모집 사진 저장 (0087). 업로드는 `uploadRecruitPhoto`가 먼저 끝나 있어야 한다.
 *
 * ⚠️ 0086과 같은 함정 — 컬럼 GRANT가 없으면 `42501`이다. 0087이 준다.
 */
export async function setChallengeRecruitImage(
  challengeId: string,
  imageUrl: string | null,
): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("challenges")
    .update({ recruit_image_url: imageUrl })
    .eq("id", challengeId)
    .select("id");
  if (error) throw error;
  if (!data || data.length === 0) throw new Error("recruit_image_not_saved");
}

export async function setChallengeDiscoverable(
  challengeId: string,
  discoverable: boolean,
): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("challenges")
    .update({ discoverable })
    .eq("id", challengeId)
    .select("id");
  if (error) {
    // 0089: 방장 1인당 동시에 열 수 있는 공개 모집은 1건이다
    // (challenges_one_open_recruit_per_host 부분 유니크 인덱스).
    // 23505를 그대로 흘리면 화면에 "duplicate key value violates unique
    // constraint"가 뜬다 — 사용자가 무엇을 해야 하는지 알 수 없는 문구다.
    if (error.code === "23505") throw new Error("recruit_already_open");
    throw error;
  }
  // ⚠️ .select("id")를 빼지 마라. PostgREST가 return=minimal로 보내서
  //    한 줄도 안 바뀌어도 error가 null이다 — 화면은 "저장했어요"라 말하고
  //    DB는 그대로다 (0085에서 완료 세션 136개가 이렇게 조용히 실패했다).
  if (!data || data.length === 0) throw new Error("discoverable_not_saved");
}
