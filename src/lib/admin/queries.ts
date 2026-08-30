import "server-only";

import { getActiveChallengeRanking } from "@/lib/challenge";
import { getLevelProgress } from "@/lib/domain/progression";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type {
  AdminProfileRow,
  SessionRow,
  SessionStatus,
} from "@/lib/domain/analytics";
import {
  parseExcludedIds,
  testAccountReason,
  testUserIds,
  type TestAccountReason,
} from "@/lib/domain/analytics-accounts";
import {
  CHALLENGE_PEEK_UNLOCKED_TYPE,
  ENGAGEMENT_NOTIFICATION_TYPES,
  type CrewLinkPair,
  type EngagementNotificationRow,
} from "@/lib/domain/analytics-engagement";
import type {
  AcquisitionProfileRow,
  CrewLinkOriginRow,
} from "@/lib/domain/analytics-acquisition";
import type {
  ProgramEnrollmentRow,
  ProgramEnrollmentStatus,
  ProgramSessionRow,
} from "@/lib/domain/analytics-program";

export interface ExcludedAccount {
  nickname: string;
  reason: TestAccountReason;
}

export interface AdminDataset {
  profiles: AdminProfileRow[];
  sessions: SessionRow[];
  totalXpByUser: Map<string, number>;
  /**
   * 크루 참여율의 원천은 **crew_links**다 — 0039부터 "크루" = 상호 수락 연결이고
   * 크루 지표는 챌린지 참가자 수와 별개로 계산한다.
   */
  crewLinkUserIds: string[];
  /**
   * 확산 패널이 쓰는 연결 쌍 원본. crewLinkUserIds는 여기서 파생된다.
   * 0079부터 출처(`origin`)와 먼저 연 쪽(`initiatedBy`)이 함께 온다.
   */
  crewLinkPairs: (CrewLinkPair & CrewLinkOriginRow)[];
  /** 0079: 유입 채널·초대자 집계용 프로필 행 */
  acquisitionProfiles: AcquisitionProfileRow[];
  /**
   * 초대 코드를 가진 프로필 수. **profiles를 두 번 읽지 않으려고 여기서 낸다** —
   * 확산 패널만을 위해 같은 테이블을 다시 조회할 이유가 없다.
   */
  inviteCodeCount: number;
  /**
   * 집계에서 뺀 테스트 계정. **화면이 무엇을 뺐는지 말해야 한다** — 안 그러면
   * 대시보드 숫자와 DB 숫자가 조용히 갈려 다음 사람이 집계를 의심한다.
   */
  excludedTestAccounts: ExcludedAccount[];
  /** 프로필을 만들지 않은 익명 auth 계정 수 — 퍼널에서 뺀 만큼 */
  anonymousWithoutProfile: number;
  /** 프로그램·참여 조회가 같은 기준으로 거를 수 있게 넘긴다 */
  testUserIds: string[];
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
      // 0079: 유입 출처는 채널 판정에 쓰는 두 개(source·referrer)만 읽는다 —
      // medium·campaign·landing은 아직 화면이 없어 페이로드만 키운다.
      db
        .from("profiles")
        .select(
          "id,nickname,avatar_url,created_at,invite_code,invited_by,acquisition_source,acquisition_referrer",
        ),
      db.from("user_progress").select("user_id,total_xp"),
      // 0039부터 "크루" = crew_links(상호 수락). 0079부터 출처·방향이 붙는다.
      db.from("crew_links").select("user_a,user_b,origin,initiated_by"),
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

  /*
    ── 테스트 계정 제외 (2026-08-17 사용자 지시) ────────────────────────────
    운영 Supabase 하나로 개발까지 해서 픽스처 계정의 기록이 실사용자 통계에
    섞인다. **DB는 건드리지 않고** 집계에서만 뺀다 — 판정 규칙과 이유는
    `domain/analytics-accounts.ts` 참조.

    한 곳에서만 거른다. 패널마다 따로 거르면 기준이 조용히 갈린다.
  */
  const emailById = new Map(
    authRes.data.users.map((u) => [u.id, u.email ?? null]),
  );
  const rawProfiles = profilesRes.data ?? [];
  const excludedIds = parseExcludedIds(process.env.ANALYTICS_EXCLUDED_USER_IDS);
  const identities = rawProfiles.map((p) => ({
    userId: p.id as string,
    nickname: p.nickname as string,
    email: emailById.get(p.id as string) ?? null,
  }));
  const testIds = testUserIds(identities, excludedIds);
  const isTest = (userId: string) => testIds.has(userId);

  const profileIds = new Set(rawProfiles.map((p) => p.id as string));
  const keptLinks = (linksRes.data ?? []).filter(
    // 한쪽 끝이라도 테스트 계정이면 그 연결은 실사용자 사이의 연결이 아니다
    (r) => !isTest(r.user_a as string) && !isTest(r.user_b as string),
  );

  return {
    profiles: rawProfiles
      .filter((p) => !isTest(p.id as string))
      .map((p) => ({
        userId: p.id as string,
        nickname: p.nickname as string,
        avatarUrl: (p.avatar_url as string | null) ?? null,
        createdAt: new Date(p.created_at as string),
      })),
    sessions: (sessionsRes.data ?? [])
      .filter((r) => !isTest(r.user_id as string))
      .map((r) => ({
        userId: r.user_id as string,
        status: r.status as SessionStatus,
        startedAt: r.started_at ? new Date(r.started_at as string) : null,
        completedAt: r.completed_at ? new Date(r.completed_at as string) : null,
      })),
    totalXpByUser: new Map(
      (progressRes.data ?? [])
        .filter((r) => !isTest(r.user_id as string))
        .map((r) => [r.user_id as string, r.total_xp as number]),
    ),
    // 연결의 양쪽 끝을 모두 "크루 보유자"로 센다
    crewLinkUserIds: keptLinks.flatMap((r) => [
      r.user_a as string,
      r.user_b as string,
    ]),
    crewLinkPairs: keptLinks.map((r) => ({
      userA: r.user_a as string,
      userB: r.user_b as string,
      // 0079. 초대자가 테스트 계정이면 지운다 — 실사용자 확산 표에 픽스처 닉네임이
      // 뜨면 안 된다. 연결 자체는 양쪽이 실사용자라 남긴다.
      origin: (r.origin as string | null) ?? null,
      initiatedBy: isTest((r.initiated_by as string) ?? "")
        ? null
        : ((r.initiated_by as string | null) ?? null),
    })),
    acquisitionProfiles: rawProfiles
      .filter((p) => !isTest(p.id as string))
      .map((p) => ({
        userId: p.id as string,
        nickname: p.nickname as string,
        invitedBy: isTest((p.invited_by as string) ?? "")
          ? null
          : ((p.invited_by as string | null) ?? null),
        source: (p.acquisition_source as string | null) ?? null,
        referrer: (p.acquisition_referrer as string | null) ?? null,
      })),
    // 코드 문자열은 들고 가지 않는다 — 게이트가 유일한 방어선이라 페이로드에
    // 남의 초대 코드를 실을 이유가 없다. 필요한 건 "몇 명이 가졌나"뿐이다.
    inviteCodeCount: rawProfiles.filter(
      (p) => p.invite_code && !isTest(p.id as string),
    ).length,
    excludedTestAccounts: identities
      .filter((a) => testIds.has(a.userId))
      .map((a) => ({
        nickname: a.nickname ?? "(닉네임 없음)",
        reason: testAccountReason(a, excludedIds)!,
      })),
    // 익명 인증이라 브라우저를 새로 열 때마다 auth 계정이 하나씩 생긴다.
    // 프로필을 만들지 않은 계정은 대부분 그 흔적이라 퍼널에서 뺀다.
    anonymousWithoutProfile: authRes.data.users.filter(
      (u) => !profileIds.has(u.id),
    ).length,
    testUserIds: [...testIds],
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
export async function fetchProgramDataset(
  /** `fetchAdminDataset()`이 정한 테스트 계정 — 같은 기준으로 거른다 */
  testIds: ReadonlySet<string>,
): Promise<ProgramDataset> {
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

  const enrollments = (enrollRes.data ?? [])
    .filter((r) => !testIds.has(r.user_id as string))
    .map((r) => ({
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
    }));

  // 회차는 등록을 통해서만 사람에 닿는다 — 남은 등록에 걸린 것만 들고 간다
  const keptIds = new Set(enrollments.map((e) => e.id));
  return {
    enrollments,
    programSessions: (sessionRes.data ?? [])
      .filter((r) => keptIds.has(r.program_enrollment_id as string))
      .map((r) => ({
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
export async function fetchEngagementDataset(
  /** `fetchAdminDataset()`이 정한 테스트 계정 — 같은 기준으로 거른다 */
  testIds: ReadonlySet<string>,
): Promise<EngagementDataset> {
  const db = getSupabaseAdminClient();

  // ⚠️ 열람권 쪽은 개수 질의(head:true)를 쓰지 않는다. 테스트 계정을 빼야 해서
  //    누가 썼는지를 알아야 한다. 두 테이블 다 작다(실측 0행·2행).
  const [notifyRes, viewRes, pickRes] = await Promise.all([
    db
      .from("notifications")
      .select("user_id,type,created_at,read_at")
      .in("type", [...ENGAGEMENT_NOTIFICATION_TYPES]),
    db.from("record_views").select("viewer_id"),
    db.from("challenge_peek_picks").select("viewer_id"),
  ]);

  for (const [name, res] of [
    ["notifications", notifyRes],
    ["record_views", viewRes],
    ["challenge_peek_picks", pickRes],
  ] as const) {
    if (res.error) throw new Error(`${name} 조회 실패: ${res.error.message}`);
  }

  const notifications: EngagementNotificationRow[] = (notifyRes.data ?? [])
    .filter((r) => !testIds.has(r.user_id as string))
    .map((r) => ({
      userId: r.user_id as string,
      type: r.type as string,
      createdAt: new Date(r.created_at as string),
      readAt: r.read_at ? new Date(r.read_at as string) : null,
    }));

  const notTest = (rows: { viewer_id: unknown }[] | null) =>
    (rows ?? []).filter((r) => !testIds.has(r.viewer_id as string)).length;

  return {
    notifications,
    recordViewCount: notTest(viewRes.data),
    challengePickCount: notTest(pickRes.data),
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
  /** `fetchAdminDataset()`이 정한 테스트 계정 — 같은 기준으로 거른다 */
  testIds: ReadonlySet<string>,
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
    .select("challenge_id,user_id,status")
    .in("status", ["joined", "dropped"]);
  if (participantError) {
    throw new Error(
      `challenge_participants 조회 실패: ${participantError.message}`,
    );
  }

  const memberCount = new Map<string, number>();
  const realMemberCount = new Map<string, number>();
  for (const participant of participants ?? []) {
    const challengeId = participant.challenge_id as string;
    memberCount.set(challengeId, (memberCount.get(challengeId) ?? 0) + 1);
    if (!testIds.has(participant.user_id as string)) {
      realMemberCount.set(challengeId, (realMemberCount.get(challengeId) ?? 0) + 1);
    }
  }

  /*
    참가자가 **전원 테스트 계정**인 방은 뺀다 (2026-08-17). 실사용자가 한 명도
    없는 방은 실제 활동이 아니다 — 실측에서 `Test11`·`개발 확인용 챌린지`가 그랬다.

    ⚠️ **이름으로 거르지 않는다.** "Test11"처럼 보이는 이름을 실사용자가 지을 수
    있다. 판정 근거는 누가 들어가 있느냐다.
    ⚠️ 참가자가 0명인 방은 남긴다. 아직 아무도 안 들어온 새 방일 수 있고,
    "전원 테스트"라고 말할 근거도 없다.
  */
  const realChallenges = (data ?? []).filter((c) => {
    const total = memberCount.get(c.id as string) ?? 0;
    return total === 0 || (realMemberCount.get(c.id as string) ?? 0) > 0;
  });

  return Promise.all(
    realChallenges.map(async (c) => {
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

// ── 신고함 (0089) ────────────────────────────────────────────

export type AdminReport = {
  id: string;
  createdAt: string;
  reason: string;
  note: string | null;
  reporterNickname: string;
  targetNickname: string;
  targetId: string;
  challengeName: string | null;
};

/**
 * 처리 안 된 신고 (0089).
 *
 * ⚠️ **테스트 계정으로 거르지 않는다.** 다른 패널은 실사용자 지표를 보려고
 *    테스트 계정을 빼지만, 신고는 지표가 아니라 **처리해야 할 일**이다.
 *    픽스처 계정이 낸 신고라도 화면에 떠야 그게 픽스처인 줄 알고 닫는다.
 *    조용히 빼면 "신고했는데 아무 데도 안 뜬다"가 되고, 그 상태는 신고 기능이
 *    죽은 것과 구별되지 않는다.
 *
 * status 변경(reviewed/dismissed)은 아직 화면에 없다 — SQL Editor에서 한다.
 * 지금 규모에서 버튼을 먼저 만들면 쓰지도 않는 화면만 는다.
 */
export async function fetchOpenReports(): Promise<AdminReport[]> {
  const db = getSupabaseAdminClient();

  const { data, error } = await db
    .from("user_reports")
    .select("id,created_at,reason,note,reporter_id,target_id,challenge_id")
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(50);
  // 신고 테이블은 0089에서 생긴다. 마이그레이션 Run 전에 배포되면 여기서
  // 던지는데, 그러면 /admin 전체가 500이 된다 — 지표를 보러 온 사람이 신고
  // 기능 때문에 아무것도 못 본다. 빈 목록으로 접는다.
  if (error) return [];

  const rows = data ?? [];
  if (rows.length === 0) return [];

  const userIds = [
    ...new Set(rows.flatMap((r) => [r.reporter_id as string, r.target_id as string])),
  ];
  const challengeIds = [
    ...new Set(rows.map((r) => r.challenge_id as string | null).filter(Boolean)),
  ] as string[];

  const [{ data: profiles }, { data: challenges }] = await Promise.all([
    db.from("profiles").select("id,nickname").in("id", userIds),
    challengeIds.length > 0
      ? db.from("challenges").select("id,name").in("id", challengeIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);

  const nickname = new Map(
    (profiles ?? []).map((p) => [p.id as string, p.nickname as string]),
  );
  const challengeName = new Map(
    (challenges ?? []).map((c) => [c.id as string, c.name as string]),
  );

  return rows.map((r) => ({
    id: r.id as string,
    createdAt: r.created_at as string,
    reason: r.reason as string,
    note: (r.note as string | null) ?? null,
    // 프로필이 없는 계정일 수 있다(익명). id 앞자리로라도 구별되게 둔다.
    reporterNickname:
      nickname.get(r.reporter_id as string) ?? `(프로필 없음 ${String(r.reporter_id).slice(0, 8)})`,
    targetNickname:
      nickname.get(r.target_id as string) ?? `(프로필 없음 ${String(r.target_id).slice(0, 8)})`,
    targetId: r.target_id as string,
    challengeName: r.challenge_id
      ? (challengeName.get(r.challenge_id as string) ?? "(지워진 챌린지)")
      : null,
  }));
}
