/**
 * 참여 지표 — 알림 · 열람권 · 확산. 순수 함수만. DB·네트워크 접근 금지.
 *
 * `analytics.ts`(가입·운동·리텐션)와 `analytics-program.ts`(프로그램)에 이어
 * **"기능을 붙였는데 쓰이고 있나"**를 보는 세 번째 묶음이다.
 *
 * ⚠️ **이 파일이 만드는 숫자 중 인과를 말하는 것은 하나도 없다.** 앱이 푸시 클릭을
 * 수집하지 않고 초대 출처를 기록하지 않아서, 여기서 셀 수 있는 것은 상관과 개수뿐이다.
 * 라벨을 "전환율"·"클릭률"·"바이럴 계수"로 바꾸는 순간 화면이 없는 계측을 있다고
 * 말하게 된다 — 각 함수 주석의 한계를 화면 문구까지 끌고 가라.
 */

import { ratio, type Period, type Ratio, type SessionRow } from "./analytics";
import { DEFAULT_BRIEF_MINUTE, SLOT_MINUTES } from "./notify-time";
import { dayKey, minuteOfDay, weekStart } from "./time";
import { KING_DAYS } from "./viewing-pass";

export interface EngagementNotificationRow {
  userId: string;
  type: string;
  createdAt: Date;
  /** 알림함에서 열어 본 시각. **푸시를 눌렀다는 뜻이 아니다** */
  readAt: Date | null;
}

/** 사용자별 운동한 날(dayKey) 집합 — 여러 집계가 공유하는 재료 */
export type WorkoutDayKeys = ReadonlyMap<string, ReadonlySet<string>>;

/**
 * 완료 세션을 사용자별 운동일 집합으로 접는다.
 *
 * 새 질의를 만들지 않기 위해 순수 함수로 뺐다 — `fetchAdminDataset()`이 이미
 * 완료 세션을 전부 갖고 있으므로 대시보드는 그것을 그대로 넘긴다.
 */
export function workoutDayKeysByUser(
  sessions: SessionRow[],
  timeZone: string,
): Map<string, Set<string>> {
  const byUser = new Map<string, Set<string>>();
  for (const s of sessions) {
    if (s.status !== "completed" || !s.completedAt) continue;
    if (!byUser.has(s.userId)) byUser.set(s.userId, new Set());
    byUser.get(s.userId)!.add(dayKey(s.completedAt, timeZone));
  }
  return byUser;
}

export interface NotificationConversion {
  type: string;
  label: string;
  sent: number;
  /** read_at 있음 / 발송 — 알림함에서 열어 본 비율 */
  opened: Ratio;
  /** 받은 날 운동 완료 / 발송. **인과가 아니다**(아래 주석) */
  workedOutSameDay: Ratio;
}

/**
 * 화면에 낼 알림 유형과 한글 라벨. 순서가 곧 패널의 줄 순서다.
 *
 * 여기 없는 유형(찌르기·크루 요청·응원 등)은 결과에서 빠진다 — "알림을 받고
 * 운동했나"를 묻는 패널이라 운동을 재촉하는 알림만 대상으로 삼는다.
 */
const CONVERSION_LABELS: readonly (readonly [string, string])[] = [
  ["workout_suggestion", "운동 제안"],
  ["morning_briefing", "아침 브리핑"],
];

/**
 * 아침 발송의 유형들. **둘을 함께 세야 한다.**
 *
 * `buildBriefings`는 같은 아침 한 통을 제안이 있는 날엔 `workout_suggestion`,
 * 없는 날엔 `morning_briefing`으로 내보낸다(`briefing.ts` — dedupe 키는 둘 다
 * `morning_briefing:<user>:<날짜>`로 같다). 한 유형만 세면 제안이 나간 날의
 * 발송 시각이 슬롯 분포에서 통째로 사라진다.
 */
export const BRIEFING_TYPES: readonly string[] = [
  "morning_briefing",
  "workout_suggestion",
];

/** 챌린지 열람창이 열렸다는 알림 — 이 알림 수가 곧 "창이 열린 횟수"다 */
export const CHALLENGE_PEEK_UNLOCKED_TYPE = "challenge_peek_unlocked";

/**
 * 대시보드가 조회할 알림 유형 전부.
 *
 * 조회를 **서버에서 이 목록으로 좁힌다** — 알림 테이블에는 찌르기·응원까지 다
 * 들어 있어서(2026-08-17 실측 537행) 전부 끌어올 이유가 없다. 목록이 여기 한 곳에
 * 있어야 "패널은 세는데 조회가 안 가져오는" 유형이 안 생긴다.
 */
export const ENGAGEMENT_NOTIFICATION_TYPES: readonly string[] = [
  ...new Set([
    ...CONVERSION_LABELS.map(([type]) => type),
    ...BRIEFING_TYPES,
    CHALLENGE_PEEK_UNLOCKED_TYPE,
  ]),
];

function inPeriod(d: Date, period: Period): boolean {
  return d >= period.from && d < period.to;
}

/** 그 사람이 그 알림을 받은 날(tz 기준)에 운동을 완료했나 */
function workedOutOnDayOf(
  row: EngagementNotificationRow,
  workoutDays: WorkoutDayKeys,
  timeZone: string,
): boolean {
  return (
    workoutDays.get(row.userId)?.has(dayKey(row.createdAt, timeZone)) ?? false
  );
}

/**
 * 유형별 발송 · 열람 · **받은 날 운동**.
 *
 * ⚠️ **`workedOutSameDay`는 인과가 아니라 상관이다.** "알림을 받은 날 그 사용자가
 * 운동을 완료했다"까지가 사실이고, 알림 **때문에** 했다는 증거는 이 저장소에 없다 —
 * 푸시 클릭을 수집하지 않는다. `readAt`도 알림함에서 열어 봤다는 뜻이지 푸시를
 * 눌렀다는 뜻이 아니다. 화면 라벨을 "전환율"로 쓰지 마라.
 *
 * 모수는 **사람이 아니라 발송 건**이다. 같은 사람이 하루에 두 통을 받으면 두 건이고,
 * 그날 운동했으면 두 건 다 분자에 든다. 사람 단위로 접으면 "많이 보낸 사람"의
 * 가중치가 사라져 발송량과 무관한 숫자가 된다.
 */
export function notificationConversion(
  rows: EngagementNotificationRow[],
  workoutDays: WorkoutDayKeys,
  period: Period,
  timeZone: string,
): NotificationConversion[] {
  return CONVERSION_LABELS.map(([type, label]) => {
    const of = rows.filter((r) => r.type === type && inPeriod(r.createdAt, period));
    return {
      type,
      label,
      sent: of.length,
      opened: ratio(of.filter((r) => r.readAt !== null).length, of.length),
      workedOutSameDay: ratio(
        of.filter((r) => workedOutOnDayOf(r, workoutDays, timeZone)).length,
        of.length,
      ),
    };
  });
}

export interface BriefingSlot {
  /** 슬롯 시작(자정부터의 분). SLOT_MINUTES의 배수 */
  minuteOfDay: number;
  /** "06:30" */
  label: string;
  sent: number;
  workedOutSameDay: Ratio;
  /** 추정 실패 시 떨어지는 기본 시각(09:00) 슬롯인가 */
  isFallbackSlot: boolean;
}

function slotLabel(minute: number): string {
  const h = String(Math.floor(minute / 60)).padStart(2, "0");
  const m = String(minute % 60).padStart(2, "0");
  return `${h}:${m}`;
}

/**
 * 아침 발송이 실제로 몇 시에 나갔나 — 30분 슬롯 분포.
 *
 * 시각 개인화(2026-08-13)가 실제로 퍼져 있는지 보는 지표다. 전원이 09:00에 몰려
 * 있다면 추정이 거의 안 되고 있다는 뜻이다.
 *
 * ⚠️ **09:00 슬롯이 전부 폴백은 아니다.** 평소 09:00에 운동해서 그 슬롯에 든 사람도
 * 섞여 있다 — 발송 시각만으로는 갈라낼 수 없다. `isFallbackSlot`은 "폴백이 섞이는
 * 슬롯"이라는 뜻이고, 화면도 그렇게 써야 한다.
 *
 * 슬롯 크기와 폴백 시각은 `notify-time.ts`에서 가져온다. 여기 30이나 540을 다시
 * 적으면 발송 로직이 바뀔 때 대시보드만 옛 기준으로 남는다.
 */
export function briefingSlotBreakdown(
  rows: EngagementNotificationRow[],
  workoutDays: WorkoutDayKeys,
  period: Period,
  timeZone: string,
): BriefingSlot[] {
  const bySlot = new Map<number, { sent: number; workedOut: number }>();

  for (const r of rows) {
    if (!BRIEFING_TYPES.includes(r.type)) continue;
    if (!inPeriod(r.createdAt, period)) continue;

    const slot =
      Math.floor(minuteOfDay(r.createdAt, timeZone) / SLOT_MINUTES) *
      SLOT_MINUTES;
    const acc = bySlot.get(slot) ?? { sent: 0, workedOut: 0 };
    acc.sent += 1;
    if (workedOutOnDayOf(r, workoutDays, timeZone)) acc.workedOut += 1;
    bySlot.set(slot, acc);
  }

  // 발송이 없는 슬롯은 넣지 않는다 — 하루 48칸을 0으로 채우면 실제 분포가 묻힌다
  return [...bySlot]
    .sort((a, b) => a[0] - b[0])
    .map(([minute, acc]) => ({
      minuteOfDay: minute,
      label: slotLabel(minute),
      sent: acc.sent,
      workedOutSameDay: ratio(acc.workedOut, acc.sent),
      isFallbackSlot: minute === DEFAULT_BRIEF_MINUTE,
    }));
}

export interface ViewingPassMetrics {
  /** 주 5일을 채운 (사용자, 주) 쌍의 수 = 꾸준왕 열람권이 열린 횟수 */
  kingEligibleWeeks: number;
  /** record_views 행 수 */
  kingUsed: number;
  kingUsage: Ratio;
  /** challenge_peek_unlocked 알림 수 = 2시간 창이 열린 횟수 */
  challengeUnlocked: number;
  /** challenge_peek_picks 행 수 = 실제로 대상을 고른 횟수 */
  challengePicked: number;
  challengeUsage: Ratio;
}

/**
 * 열람권이 열리기만 하고 안 쓰이는지 본다.
 *
 * ⚠️ **기간 필터를 걸지 않는다.** `record_views`·`challenge_peek_picks` 개수를
 * 누적으로 받기 때문에 분모도 누적이어야 한다. 한쪽만 기간을 자르면 사용률이
 * 100%를 넘거나 0으로 깔린다.
 *
 * 꾸준왕 자격은 앱과 같은 규칙(주 월요일 시작, 고유 5일)으로 다시 센다.
 * `KING_DAYS`·`weekStart`를 그대로 import한다 — 5를 여기 다시 적으면 규칙이 갈린다.
 *
 * 챌린지 쪽은 **알림 수를 분모로 쓴다.** `challenge_peek_unlocked` 알림이 곧
 * "창이 열렸다"라서 연속 5일 판정을 여기서 다시 구현할 필요가 없다.
 */
export function viewingPassMetrics(
  sessions: SessionRow[],
  recordViewCount: number,
  challengeUnlockedCount: number,
  challengePickCount: number,
  timeZone: string,
): ViewingPassMetrics {
  // (사용자, 주) → 그 주의 고유 운동일
  const daysByUserWeek = new Map<string, Set<string>>();
  for (const s of sessions) {
    if (s.status !== "completed" || !s.completedAt) continue;
    const key = `${s.userId}:${weekStart(s.completedAt, timeZone).getTime()}`;
    if (!daysByUserWeek.has(key)) daysByUserWeek.set(key, new Set());
    daysByUserWeek.get(key)!.add(dayKey(s.completedAt, timeZone));
  }

  const kingEligibleWeeks = [...daysByUserWeek.values()].filter(
    (d) => d.size >= KING_DAYS,
  ).length;

  return {
    kingEligibleWeeks,
    kingUsed: recordViewCount,
    kingUsage: ratio(recordViewCount, kingEligibleWeeks),
    challengeUnlocked: challengeUnlockedCount,
    challengePicked: challengePickCount,
    challengeUsage: ratio(challengePickCount, challengeUnlockedCount),
  };
}

export interface CrewLinkPair {
  userA: string;
  userB: string;
}

export interface ReferralMetrics {
  crewLinks: number;
  /** 크루 보유자 / 전체 프로필 */
  usersWithCrew: Ratio;
  /** 1인 평균 크루 수(소수 1자리) — 연결 끝 2개를 프로필 수로 나눈다 */
  avgCrewPerUser: number;
  /** 초대 코드 보유 / 전체 프로필 */
  inviteCodeIssued: Ratio;
}

/**
 * ⚠️ **바이럴 계수는 지금 데이터로 계산할 수 없다.**
 *
 * `crew_links(user_a, user_b, created_at)`에 **출처 컬럼이 없다.** 검색으로 맺었는지,
 * 초대 링크를 타고 왔는지, 챌린지 신입 자동 연결인지 구분이 안 된다.
 * `profiles.invite_code`는 발급만 기록하고 그 코드로 누가 왔는지는 남기지 않는다.
 *
 * 그래서 이 함수는 **셀 수 있는 것만** 낸다 — 연결 수, 보유율, 1인 평균, 발급률.
 * 화면은 이 상수를 보고 "측정할 수 없다"를 명시한다. 가짜 계수를 만들지 마라.
 *
 * 측정하려면 `crew_links.origin`(`search|invite_link|challenge`)을 더하고
 * `accept_crew_request`·`accept_friend_invite`·`accept_challenge_invite` 세 RPC가
 * 채워야 한다. 마이그레이션이 필요해 이번 범위 밖이다.
 */
export const REFERRAL_ATTRIBUTION_AVAILABLE = false;

export function referralMetrics(
  crewLinkPairs: CrewLinkPair[],
  profileCount: number,
  inviteCodeCount: number,
): ReferralMetrics {
  // 연결의 양쪽 끝이 모두 크루 보유자다 (analytics.ts의 crewParticipation과 같은 규칙)
  const withCrew = new Set<string>();
  for (const p of crewLinkPairs) {
    withCrew.add(p.userA);
    withCrew.add(p.userB);
  }

  return {
    crewLinks: crewLinkPairs.length,
    usersWithCrew: ratio(withCrew.size, profileCount),
    avgCrewPerUser:
      profileCount === 0
        ? 0
        : Math.round((crewLinkPairs.length * 2 * 10) / profileCount) / 10,
    inviteCodeIssued: ratio(inviteCodeCount, profileCount),
  };
}
