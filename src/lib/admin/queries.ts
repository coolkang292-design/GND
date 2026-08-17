import "server-only";

import { getActiveChallengeRanking } from "@/lib/challenge";
import { getLevelProgress } from "@/lib/domain/progression";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type {
  AdminProfileRow,
  ProfileRow,
  SessionRow,
  SessionStatus,
} from "@/lib/domain/analytics";
import {
  CHALLENGE_PEEK_UNLOCKED_TYPE,
  ENGAGEMENT_NOTIFICATION_TYPES,
  type CrewLinkPair,
  type EngagementNotificationRow,
} from "@/lib/domain/analytics-engagement";
import type {
  ProgramEnrollmentRow,
  ProgramEnrollmentStatus,
  ProgramSessionRow,
} from "@/lib/domain/analytics-program";

export interface AdminDataset {
  authUsers: ProfileRow[];
  profiles: AdminProfileRow[];
  sessions: SessionRow[];
  totalXpByUser: Map<string, number>;
  /**
   * 크루 참여율의 원천은 **crew_links**다 — 0039부터 "크루" = 상호 수락 연결이고
   * 크루 지표는 챌린지 참가자 수와 별개로 계산한다.
   */
  crewLinkUserIds: string[];
  /** 확산 패널이 쓰는 연결 쌍 원본. crewLinkUserIds는 여기서 파생된다 */
  crewLinkPairs: CrewLinkPair[];
  /**
   * 초대 코드를 가진 프로필 수. **profiles를 두 번 읽지 않으려고 여기서 낸다** —
   * 확산 패널만을 위해 같은 테이블을 다시 조회할 이유가 없다.
   */
  inviteCodeCount: number;
}

/**
 * 대시보드가 쓰는 원본 행을 한 번에 읽는다. **requireAdmin() 통과 뒤에만 호출할 것.**
 * 집계는 하지 않는다 — 계산은 domain/analytics.ts 순수 함수의 몫이다.
 *
 * 한계 1: auth.users는 1000명까지만 읽는다(단일 페이지). 현재 실계정 4명.
 *         1000명을 넘으면 page 순회가 필요하다.
 * 한계 2: 완료 세션이 약 5,000건을 넘으면 전 행 조회 + TS 집계가 느려진다.
 *         그때는 SQL 집계(RPC 또는 뷰)로 옮긴다(설계 §5).
 */
export async function fetchAdminDataset(): Promise<AdminDataset> {
  const db = getSupabaseAdminClient();

  const [sessionsRes, profilesRes, progressRes, linksRes, authRes] =
    await Promise.all([
      db
        .from("workout_sessions")
        .select("user_id,status,started_at,completed_at")
        .is("deleted_at", null),
      // invite_code는 화면에 내보내지 않고 **발급 여부만** 센다(아래 참조)
      db.from("profiles").select("id,nickname,avatar_url,created_at,invite_code"),
      db.from("user_progress").select("user_id,total_xp"),
      // 0039부터 "크루" = crew_links(상호 수락).
      db.from("crew_links").select("user_a,user_b"),
      db.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    ]);

  for (const [name, res] of [
    ["workout_sessions", sessionsRes],
    ["profiles", profilesRes],
    ["user_progress", progressRes],
    ["crew_links", linksRes],
  ] as const) {
    if (res.error) throw new Error(`${name} 조회 실패: ${res.error.message}`);
  }
  if (authRes.error) {
    throw new Error(`auth.users 조회 실패: ${authRes.error.message}`);
  }

  return {
    // 가입 퍼널 최상단은 profiles가 아니라 auth 기준이다(설계 §4.5)
    authUsers: authRes.data.users.map((u) => ({
      userId: u.id,
      createdAt: new Date(u.created_at),
    })),
    profiles: (profilesRes.data ?? []).map((p) => ({
      userId: p.id as string,
      nickname: p.nickname as string,
      avatarUrl: (p.avatar_url as string | null) ?? null,
      createdAt: new Date(p.created_at as string),
    })),
    sessions: (sessionsRes.data ?? []).map((r) => ({
      userId: r.user_id as string,
      status: r.status as SessionStatus,
      startedAt: r.started_at ? new Date(r.started_at as string) : null,
      completedAt: r.completed_at ? new Date(r.completed_at as string) : null,
    })),
    totalXpByUser: new Map(
      (progressRes.data ?? []).map((r) => [
        r.user_id as string,
        r.total_xp as number,
      ]),
    ),
    // 연결의 양쪽 끝을 모두 "크루 보유자"로 센다
    crewLinkUserIds: (linksRes.data ?? []).flatMap((r) => [
      r.user_a as string,
      r.user_b as string,
    ]),
    crewLinkPairs: (linksRes.data ?? []).map((r) => ({
      userA: r.user_a as string,
      userB: r.user_b as string,
    })),
    // 코드 문자열은 들고 가지 않는다 — 게이트가 유일한 방어선이라 페이로드에
    // 남의 초대 코드를 실을 이유가 없다. 필요한 건 "몇 명이 가졌나"뿐이다.
    inviteCodeCount: (profilesRes.data ?? []).filter((p) => p.invite_code)
      .length,
  };
}

export interface ProgramDataset {
  enrollments: ProgramEnrollmentRow[];
  programSessions: ProgramSessionRow[];
}

/**
 * 공식 6주 프로그램 등록과 그 회차. **requireAdmin() 통과 뒤에만 호출할 것.**
 *
 * ⚠️ **기간으로 자르지 않는다.** 6주짜리를 7일 창으로 보면 완주가 0일 수밖에 없다.
 * 기간 처리는 `buildProgramMetrics`가 신규 등록 하나에만 적용한다.
 *
 * ⚠️ 컬럼명 주의: 제목은 `title`이 아니라 **`title_snapshot`**이다(등록 당시 이름을
 * 남긴다). 회차 쪽은 0067에서 붙은 `program_enrollment_id`다.
 */
export async function fetchProgramDataset(): Promise<ProgramDataset> {
  const db = getSupabaseAdminClient();

  const [enrollRes, sessionRes] = await Promise.all([
    db
      .from("program_enrollments")
      .select(
        "id,user_id,program_key,title_snapshot,status,created_at,completed_at,cancelled_at",
      ),
    db
      .from("workout_sessions")
      .select("program_enrollment_id,completed_at")
      .not("program_enrollment_id", "is", null)
      .is("deleted_at", null),
  ]);

  // 조용히 빈 배열로 떨어뜨리지 않는다 — 조회가 깨진 화면은 "0건"이라고 거짓말한다
  for (const [name, res] of [
    ["program_enrollments", enrollRes],
    ["workout_sessions(program)", sessionRes],
  ] as const) {
    if (res.error) throw new Error(`${name} 조회 실패: ${res.error.message}`);
  }

  return {
    enrollments: (enrollRes.data ?? []).map((r) => ({
      id: r.id as string,
      userId: r.user_id as string,
      programKey: r.program_key as string,
      title: r.title_snapshot as string,
      status: r.status as ProgramEnrollmentStatus,
      createdAt: new Date(r.created_at as string),
      // 끝난 시각은 완주면 completed_at, 포기면 cancelled_at이다
      endedAt: r.completed_at
        ? new Date(r.completed_at as string)
        : r.cancelled_at
          ? new Date(r.cancelled_at as string)
          : null,
    })),
    programSessions: (sessionRes.data ?? []).map((r) => ({
      enrollmentId: r.program_enrollment_id as string,
      completedAt: r.completed_at ? new Date(r.completed_at as string) : null,
    })),
  };
}

export interface EngagementDataset {
  notifications: EngagementNotificationRow[];
  /** 꾸준왕 열람권을 실제로 쓴 횟수 (2026-08-17 실측 **0행**) */
  recordViewCount: number;
  /** 챌린지 열람창에서 대상을 고른 횟수 */
  challengePickCount: number;
  /** 챌린지 열람창이 열린 횟수 — 위 notifications에서 파생한다 */
  challengeUnlockedCount: number;
}

/**
 * 알림 · 열람권 참여 원본. **requireAdmin() 통과 뒤에만 호출할 것.**
 *
 * 알림은 **유형을 서버에서 좁힌다**(`ENGAGEMENT_NOTIFICATION_TYPES`). 찌르기·응원까지
 * 든 537행(2026-08-17 실측) 전부를 끌어올 이유가 없다.
 *
 * 열람권 쪽은 개수만 있으면 되므로 `head:true` 카운트 질의를 쓴다 — 행을 받아서
 * 세면 record_views가 늘어날수록 페이로드만 커진다.
 */
export async function fetchEngagementDataset(): Promise<EngagementDataset> {
  const db = getSupabaseAdminClient();

  const [notifyRes, viewRes, pickRes] = await Promise.all([
    db
      .from("notifications")
      .select("user_id,type,created_at,read_at")
      .in("type", [...ENGAGEMENT_NOTIFICATION_TYPES]),
    db.from("record_views").select("id", { count: "exact", head: true }),
    db
      .from("challenge_peek_picks")
      .select("viewer_id", { count: "exact", head: true }),
  ]);

  for (const [name, res] of [
    ["notifications", notifyRes],
    ["record_views", viewRes],
    ["challenge_peek_picks", pickRes],
  ] as const) {
    if (res.error) throw new Error(`${name} 조회 실패: ${res.error.message}`);
  }

  const notifications: EngagementNotificationRow[] = (
    notifyRes.data ?? []
  ).map((r) => ({
    userId: r.user_id as string,
    type: r.type as string,
    createdAt: new Date(r.created_at as string),
    readAt: r.read_at ? new Date(r.read_at as string) : null,
  }));

  return {
    notifications,
    recordViewCount: viewRes.count ?? 0,
    challengePickCount: pickRes.count ?? 0,
    // 이미 받아 온 행에서 센다. "창이 열렸다"는 곧 이 알림이 나갔다는 뜻이라
    // 연속 5일 판정을 서버에서 다시 재현할 필요가 없다.
    challengeUnlockedCount: notifications.filter(
      (n) => n.type === CHALLENGE_PEEK_UNLOCKED_TYPE,
    ).length,
  };
}

export interface AdminChallenge {
  id: string;
  name: string;
  daysLeft: number;
  memberCount: number;
  achievementPct: number | null;
}

/**
 * 진행 중 챌린지. 달성률은 챌린지 화면이 쓰는 getActiveChallengeRanking()을
 * 그대로 재사용한다 — 같은 챌린지가 두 화면에서 다른 달성률로 보이면 안 된다.
 */
export async function fetchActiveChallenges(
  now: Date,
): Promise<AdminChallenge[]> {
  const db = getSupabaseAdminClient();

  const { data, error } = await db
    .from("challenges")
    .select("id,name,end_date")
    .eq("status", "active");
  if (error) throw new Error(`challenges 조회 실패: ${error.message}`);

  // 관리자 챌린지 인원은 실제 joined/dropped 참가자만 센다.
  const { data: participants, error: participantError } = await db
    .from("challenge_participants")
    .select("challenge_id,status")
    .in("status", ["joined", "dropped"]);
  if (participantError) {
    throw new Error(
      `challenge_participants 조회 실패: ${participantError.message}`,
    );
  }

  const memberCount = new Map<string, number>();
  for (const participant of participants ?? []) {
    const challengeId = participant.challenge_id as string;
    memberCount.set(challengeId, (memberCount.get(challengeId) ?? 0) + 1);
  }

  return Promise.all(
    (data ?? []).map(async (c) => {
      // ChallengeRanking = { name, list: RankedParticipant[] }
      // RankedParticipant.achievement는 0~100 스케일이다.
      // challenge.ts는 기본이 브라우저 클라이언트라 서버에선 동작하지 않는다.
      // service_role 클라이언트를 주입해 **챌린지 화면과 같은 계산**을 그대로 쓴다.
      // 0044: 인자가 그룹이 아니라 챌린지다. 크루당 챌린지가 여러 개일 수 있어
      // 그룹으로는 대상이 정해지지 않는다. 여기는 이미 챌린지 행을 순회 중이라
      // 그 id를 그대로 넘기면 된다 — 각 챌린지가 자기 랭킹을 갖는다.
      const ranking = await getActiveChallengeRanking(c.id as string, db);
      const list = ranking?.list ?? [];
      const pct =
        list.length === 0
          ? null
          : Math.round(
              list.reduce((sum, r) => sum + r.achievement, 0) / list.length,
            );
      const end = new Date(`${c.end_date as string}T23:59:59+09:00`);
      return {
        id: c.id as string,
        name: c.name as string,
        daysLeft: Math.max(
          0,
          Math.ceil((end.getTime() - now.getTime()) / 86_400_000),
        ),
        memberCount: memberCount.get(c.id as string) ?? 0,
        achievementPct: pct,
      };
    }),
  );
}

export interface GrowthDataset {
  stageDistribution: { stageName: string; count: number }[];
  xpByReason: { reason: string; label: string; total: number }[];
  pointsIssued: number;
  walletBalance: number;
  badgeCounts: { badgeKey: string; rarity: string; earned: number }[];
}

/** xp_transactions.reason은 영문 enum이라 화면용 한글 라벨을 붙인다 */
const XP_REASON_LABELS: Record<string, string> = {
  workout_completed: "운동 완료",
  workout_photo: "인증 사진",
  weekly_goal: "주간 목표",
  historical_backfill: "소급 지급",
  workout_reversal: "취소 회수",
  admin_adjustment: "수동 정정",
  level_compensation: "레벨 보정",
};

export async function fetchGrowthDataset(
  totalXpByUser: Map<string, number>,
): Promise<GrowthDataset> {
  const db = getSupabaseAdminClient();

  const [xpRes, pointRes, walletRes, badgeRes, defRes] = await Promise.all([
    db.from("xp_transactions").select("reason,amount"),
    db.from("point_transactions").select("amount,transaction_type"),
    db.from("user_wallet").select("balance"),
    db.from("user_badges").select("badge_key"),
    db.from("badge_definitions").select("badge_key,rarity"),
  ]);

  for (const [name, res] of [
    ["xp_transactions", xpRes],
    ["point_transactions", pointRes],
    ["user_wallet", walletRes],
    ["user_badges", badgeRes],
    ["badge_definitions", defRes],
  ] as const) {
    if (res.error) throw new Error(`${name} 조회 실패: ${res.error.message}`);
  }

  // 단계 분포는 캐시된 current_stage가 아니라 total_xp에서 다시 계산한다 —
  // 내 정보 화면과 같은 getLevelProgress()를 써야 숫자가 안 어긋난다.
  const stageCount = new Map<string, number>();
  for (const xp of totalXpByUser.values()) {
    const name = getLevelProgress(xp).stageName;
    stageCount.set(name, (stageCount.get(name) ?? 0) + 1);
  }

  const xpByReason = new Map<string, number>();
  for (const r of xpRes.data ?? []) {
    const key = (r.reason as string) ?? "기타";
    xpByReason.set(key, (xpByReason.get(key) ?? 0) + (r.amount as number));
  }

  const rarityOf = new Map(
    (defRes.data ?? []).map((d) => [d.badge_key as string, d.rarity as string]),
  );
  const earned = new Map<string, number>();
  for (const b of badgeRes.data ?? []) {
    const key = b.badge_key as string;
    earned.set(key, (earned.get(key) ?? 0) + 1);
  }

  return {
    stageDistribution: [...stageCount]
      .map(([stageName, count]) => ({ stageName, count }))
      .sort((a, b) => b.count - a.count),
    xpByReason: [...xpByReason]
      .map(([reason, total]) => ({
        reason,
        label: XP_REASON_LABELS[reason] ?? reason,
        total,
      }))
      .sort((a, b) => b.total - a.total),
    pointsIssued: (pointRes.data ?? [])
      .filter((p) => p.transaction_type === "earn")
      .reduce((sum, p) => sum + (p.amount as number), 0),
    walletBalance: (walletRes.data ?? []).reduce(
      (sum, w) => sum + (w.balance as number),
      0,
    ),
    badgeCounts: [...rarityOf].map(([badgeKey, rarity]) => ({
      badgeKey,
      rarity,
      earned: earned.get(badgeKey) ?? 0,
    })),
  };
}
