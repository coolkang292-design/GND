/**
 * 관리자 분석 대시보드 집계 — 순수 함수만. DB·네트워크 접근 금지.
 *
 * 스트릭·레벨은 여기서 새로 계산하지 않고 앱 화면이 쓰는 기존 함수를 그대로
 * 호출한다. 자체 계산을 두면 "관리자 화면 12일 / 앱 7일"처럼 조용히 갈라진다.
 */

import { getLevelProgress } from "./progression";
import { currentStreak, workoutDayKeys } from "./streak";
import { DAY_MS, dayKey } from "./time";

export type PeriodDays = 7 | 28 | 90;

export interface Period {
  days: PeriodDays;
  from: Date;
  to: Date;
  prevFrom: Date;
  prevTo: Date;
}

/** 비율은 항상 모수를 들고 다닌다 — 표본 크기를 숨기지 않기 위해서다 */
export interface Ratio {
  numerator: number;
  denominator: number;
}

/** 이 아래로는 퍼센트를 표시하지 않는다 */
export const MIN_RATIO_SAMPLE = 5;

/** 피드의 "운동 중" 판정과 같은 값 — 화면마다 다른 기준을 쓰면 어긋난다 */
export const ABANDON_AFTER_HOURS = 6;

export type SessionStatus = "draft" | "active" | "completed" | "cancelled";

export interface SessionRow {
  userId: string;
  status: SessionStatus;
  startedAt: Date | null;
  completedAt: Date | null;
}

export interface ProfileRow {
  userId: string;
  createdAt: Date;
}

export interface AdminProfileRow extends ProfileRow {
  nickname: string;
  avatarUrl: string | null;
}

export function buildPeriod(days: PeriodDays, now: Date): Period {
  const from = new Date(now.getTime() - days * DAY_MS);
  return {
    days,
    from,
    to: now,
    prevFrom: new Date(from.getTime() - days * DAY_MS),
    prevTo: from,
  };
}

export function ratio(numerator: number, denominator: number): Ratio {
  return { numerator, denominator };
}

/**
 * 모수 0 → "—"(측정 불가와 0%는 다르다)
 * 모수 < MIN_RATIO_SAMPLE → 퍼센트 없이 "2/4"
 * 그 외 → "30% (3/10)"
 */
export function formatRatio(r: Ratio): string {
  if (r.denominator === 0) return "—";
  if (r.denominator < MIN_RATIO_SAMPLE) {
    return `${r.numerator}/${r.denominator}`;
  }
  const pct = Math.round((r.numerator / r.denominator) * 100);
  return `${pct}% (${r.numerator}/${r.denominator})`;
}

function inRange(d: Date | null, from: Date, to: Date): boolean {
  return d !== null && d >= from && d < to;
}

/** 직전 구간이 0이면 null — 0에서 늘어난 것을 퍼센트로 쓰면 ∞다 */
function deltaPct(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

/** 오름차순 정렬 배열의 p75 (nearest-rank) */
function p75(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const rank = Math.ceil(sorted.length * 0.75);
  return sorted[rank - 1];
}

/** 완료 세션만 사용자별로 모은다 (여러 집계가 공유) */
function completedDatesByUser(sessions: SessionRow[]): Map<string, Date[]> {
  const byUser = new Map<string, Date[]>();
  for (const s of sessions) {
    if (s.status !== "completed" || !s.completedAt) continue;
    if (!byUser.has(s.userId)) byUser.set(s.userId, []);
    byUser.get(s.userId)!.push(s.completedAt);
  }
  return byUser;
}

export interface Kpi {
  activeUsers: number;
  newUsers: number;
  completedWorkouts: number;
  cancelledWorkouts: number;
  abandonedWorkouts: number;
  completionRate: Ratio;
  workoutsPerUser: number;
  topQuartileWorkouts: number;
  prevActiveUsers: number;
  prevCompletedWorkouts: number;
  activeUsersDeltaPct: number | null;
  completedWorkoutsDeltaPct: number | null;
}

export function buildKpi(
  sessions: SessionRow[],
  profiles: ProfileRow[],
  period: Period,
  now: Date,
): Kpi {
  const completedIn = (from: Date, to: Date) =>
    sessions.filter(
      (s) => s.status === "completed" && inRange(s.completedAt, from, to),
    );

  const current = completedIn(period.from, period.to);
  const previous = completedIn(period.prevFrom, period.prevTo);

  const activeUsers = new Set(current.map((s) => s.userId)).size;
  const prevActiveUsers = new Set(previous.map((s) => s.userId)).size;

  const cancelledWorkouts = sessions.filter(
    (s) =>
      s.status === "cancelled" && inRange(s.startedAt, period.from, period.to),
  ).length;

  const abandonCutoff = new Date(
    now.getTime() - ABANDON_AFTER_HOURS * 3_600_000,
  );
  const abandonedWorkouts = sessions.filter(
    (s) =>
      (s.status === "active" || s.status === "draft") &&
      inRange(s.startedAt, period.from, period.to) &&
      s.startedAt! < abandonCutoff,
  ).length;

  const perUser = new Map<string, number>();
  for (const s of current) {
    perUser.set(s.userId, (perUser.get(s.userId) ?? 0) + 1);
  }
  const counts = [...perUser.values()].sort((a, b) => a - b);

  return {
    activeUsers,
    newUsers: profiles.filter((p) =>
      inRange(p.createdAt, period.from, period.to),
    ).length,
    completedWorkouts: current.length,
    cancelledWorkouts,
    abandonedWorkouts,
    completionRate: ratio(
      current.length,
      current.length + cancelledWorkouts + abandonedWorkouts,
    ),
    workoutsPerUser: activeUsers === 0 ? 0 : current.length / activeUsers,
    topQuartileWorkouts: p75(counts),
    prevActiveUsers,
    prevCompletedWorkouts: previous.length,
    activeUsersDeltaPct: deltaPct(activeUsers, prevActiveUsers),
    completedWorkoutsDeltaPct: deltaPct(current.length, previous.length),
  };
}

export interface DailyActivePoint {
  dayKey: string;
  count: number;
}

/**
 * 기간의 매일에 대한 완료 사용자 수. 운동이 없는 날도 0으로 채운다 —
 * 빈 날을 빼면 막대그래프의 가로축이 거짓말을 한다.
 */
export function dailyActiveSeries(
  sessions: SessionRow[],
  period: Period,
  timeZone: string,
): DailyActivePoint[] {
  const usersByDay = new Map<string, Set<string>>();
  for (const s of sessions) {
    if (s.status !== "completed") continue;
    if (!inRange(s.completedAt, period.from, period.to)) continue;
    const key = dayKey(s.completedAt!, timeZone);
    if (!usersByDay.has(key)) usersByDay.set(key, new Set());
    usersByDay.get(key)!.add(s.userId);
  }

  const points: DailyActivePoint[] = [];
  for (let i = period.days - 1; i >= 0; i--) {
    const day = new Date(period.to.getTime() - i * DAY_MS);
    const key = dayKey(day, timeZone);
    points.push({ dayKey: key, count: usersByDay.get(key)?.size ?? 0 });
  }
  return points;
}

export interface ActiveUserCounts {
  dau: number;
  wau: number;
  mau: number;
  dauOverMau: Ratio;
}

export function activeUserCounts(
  sessions: SessionRow[],
  now: Date,
): ActiveUserCounts {
  const distinctWithin = (days: number) =>
    new Set(
      sessions
        .filter(
          (s) =>
            s.status === "completed" &&
            inRange(s.completedAt, new Date(now.getTime() - days * DAY_MS), now),
        )
        .map((s) => s.userId),
    ).size;

  const dau = distinctWithin(1);
  const mau = distinctWithin(28);
  return { dau, wau: distinctWithin(7), mau, dauOverMau: ratio(dau, mau) };
}

/**
 * **"재방문"이 아니라 "재운동" 리텐션이다.**
 * 앱이 방문·페이지뷰·로그인 이벤트를 수집하지 않아 진짜 재방문은 계산할 수 없다
 * (auth.users.last_sign_in_at은 마지막 1개 값뿐이라 코호트에 못 쓴다).
 * 그래서 "가입 후 D일차에 운동을 완료했는가"로 정의한다. 화면 문구도 재운동이다.
 */
export interface Retention {
  d1: Ratio;
  d7: Ratio;
  /**
   * ⚠️ **2026-08-17에 D28을 D30으로 바꿨다** (사용자 지시 — "한 달 뒤 남나?").
   * 28은 MAU 창(4주)에 맞춘 값이었는데, 물어보는 질문이 "한 달"이라 창을 질문에
   * 맞춘다. 두 개를 나란히 두면 거의 같은 숫자 둘이 화면에서 헷갈린다.
   */
  d30: Ratio;
  /**
   * 가입 30일이 지난 사람 중 **최근 7일에 운동한** 사람.
   *
   * d30이 "30일째 되는 그 하루"만 보는 것과 다르다. 하루 창은 표본이 작을수록
   * 튀고, 29일째·31일째에 온 사람을 놓친다. "한 달 뒤에도 **살아 있나**"를
   * 물으려면 이쪽이 맞다 — 둘 다 두는 이유다.
   */
  aliveAfter30d: Ratio;
}

/** 가입 후 며칠째를 코호트 리텐션으로 볼 것인가 — 화면 라벨과 같아야 한다 */
export const RETENTION_ALIVE_DAYS = 30;
/** "살아 있다"로 볼 최근 며칠 */
export const RETENTION_ALIVE_WINDOW_DAYS = 7;

export function reworkoutRetention(
  profiles: ProfileRow[],
  sessions: SessionRow[],
  now: Date,
): Retention {
  const completedByUser = completedDatesByUser(sessions);

  // 아직 D일이 지나지 않은 사람은 분모에서 뺀다 — 안 그러면 최근 가입자가
  // 전부 "미복귀"로 잡혀 리텐션이 실제보다 낮게 나온다.
  const cohortOf = (day: number) =>
    profiles.filter((p) => now.getTime() - p.createdAt.getTime() >= day * DAY_MS);

  const at = (day: number): Ratio => {
    const cohort = cohortOf(day);
    const returned = cohort.filter((p) => {
      const windowFrom = new Date(p.createdAt.getTime() + day * DAY_MS);
      const windowTo = new Date(windowFrom.getTime() + DAY_MS);
      return (completedByUser.get(p.userId) ?? []).some(
        (d) => d >= windowFrom && d < windowTo,
      );
    });
    return ratio(returned.length, cohort.length);
  };

  // 창의 기준이 **가입일이 아니라 오늘**이다. 코호트만 가입일로 자른다.
  const aliveFrom = new Date(
    now.getTime() - RETENTION_ALIVE_WINDOW_DAYS * DAY_MS,
  );
  const aliveCohort = cohortOf(RETENTION_ALIVE_DAYS);
  const stillAlive = aliveCohort.filter((p) =>
    (completedByUser.get(p.userId) ?? []).some(
      (d) => d >= aliveFrom && d <= now,
    ),
  );

  return {
    d1: at(1),
    d7: at(7),
    d30: at(RETENTION_ALIVE_DAYS),
    aliveAfter30d: ratio(stillAlive.length, aliveCohort.length),
  };
}

export interface FunnelStep {
  label: string;
  count: number;
}

/**
 * 활성화 퍼널 3단계.
 *
 * **크루 단계를 넣지 않는 이유**: 온보딩의 "혼자 시작하기"는 DB에 흔적을
 * 남기지 않아(setStep("done")만 하고 쓰기 없음) "혼자 완료"와 "크루 단계
 * 이탈"을 구분할 수 없다. 크루 유무로 단계를 만들면 혼자모드 사용자가 크루 없이
 * 첫 운동을 완료해 다음 단계가 이전 단계보다 커지는 비단조 퍼널이 된다.
 * 크루 참여율은 crewParticipation()으로 따로 낸다.
 *
 * ⚠️ **2026-08-17에 `가입 완료`(auth 기준) 단계를 뺐다.** 앱이 익명 인증이라
 * 브라우저를 새로 열 때마다 auth 계정이 하나씩 생긴다. 실측에서 auth 66개 중
 * **59개가 프로필 없는 익명 계정**이었고 대부분 개발자 본인의 브라우저·자동화
 * 세션이었다 — 그 상태로 퍼널을 그리면 첫 단계에서 -89%가 빠지는데 그건 온보딩
 * 이탈이 아니라 **테스트 흔적**이다. 사용자 지시로 프로필을 만든 계정만 센다.
 *
 * ⚠️ **대신 "온보딩 중도 이탈"은 이제 측정하지 않는다.** 진짜 이탈자도 같이
 * 빠졌기 때문이다. 되살리려면 익명 계정 중 테스트 흔적을 가려낼 표식(예: 온보딩
 * 시작 이벤트)이 먼저 필요하다. 화면도 이 사실을 적는다.
 */
export function activationFunnel(
  profiles: ProfileRow[],
  sessions: SessionRow[],
): FunnelStep[] {
  const completedCount = new Map<string, number>();
  for (const s of sessions) {
    if (s.status !== "completed") continue;
    completedCount.set(s.userId, (completedCount.get(s.userId) ?? 0) + 1);
  }

  // 모든 단계를 "프로필이 있는 사용자" 부분집합에서 센다 —
  // 그래야 프로필 없는 사용자의 세션이 단조성을 깨지 않는다.
  const withFirst = profiles.filter(
    (p) => (completedCount.get(p.userId) ?? 0) >= 1,
  );
  const withThree = profiles.filter(
    (p) => (completedCount.get(p.userId) ?? 0) >= 3,
  );

  return [
    { label: "가입·프로필 완료", count: profiles.length },
    { label: "첫 운동 완료", count: withFirst.length },
    { label: "3회 운동 완료", count: withThree.length },
  ];
}

/**
 * 크루 보유 사용자 / 전체 프로필. 퍼널 단계가 아니라 독립 지표다(위 주석 참고).
 *
 * 원천은 **crew_links**여야 한다 — 0039부터 "크루" = 상호 수락 연결이고,
 * group_members는 챌린지 전용으로만 남았다.
 */
export function crewParticipation(
  profiles: ProfileRow[],
  crewUserIds: string[],
): Ratio {
  const inCrew = new Set(crewUserIds);
  return ratio(
    profiles.filter((p) => inCrew.has(p.userId)).length,
    profiles.length,
  );
}

export type UserStatus = "활성" | "주의" | "휴면";
export type ChurnRisk = "낮음" | "중간" | "높음";

export function userStatus(daysSinceLastWorkout: number | null): UserStatus {
  if (daysSinceLastWorkout === null) return "휴면";
  if (daysSinceLastWorkout <= 7) return "활성";
  if (daysSinceLastWorkout <= 14) return "주의";
  return "휴면";
}

/**
 * 경계 5일은 streak.ts의 STREAK_EXPIRY_DAYS와 같다.
 * 앱이 "불꽃 살아있음"을 보여주는 사용자가 여기서 "위험"으로 뜨면 안 된다.
 */
export function churnRisk(daysSinceLastWorkout: number | null): ChurnRisk {
  if (daysSinceLastWorkout === null) return "높음";
  if (daysSinceLastWorkout < 5) return "낮음";
  if (daysSinceLastWorkout < 14) return "중간";
  return "높음";
}

export interface UserRow {
  userId: string;
  nickname: string;
  avatarUrl: string | null;
  level: number;
  stageName: string;
  workoutsInPeriod: number;
  streakDays: number;
  lastActiveAt: Date | null;
  status: UserStatus;
  churnRisk: ChurnRisk;
}

export function buildUserRows(
  profiles: AdminProfileRow[],
  sessions: SessionRow[],
  totalXpByUser: Map<string, number>,
  period: Period,
  now: Date,
  timeZone: string,
): UserRow[] {
  const completedByUser = completedDatesByUser(sessions);
  const todayKey = dayKey(now, timeZone);

  return profiles.map((p) => {
    const all = completedByUser.get(p.userId) ?? [];
    const lastActiveAt =
      all.length === 0 ? null : all.reduce((a, b) => (a > b ? a : b));

    const daysSince =
      lastActiveAt === null
        ? null
        : Math.floor((now.getTime() - lastActiveAt.getTime()) / DAY_MS);

    // 앱 화면과 같은 함수로 계산한다 — 자체 계산을 두면 조용히 어긋난다
    const streakDays = currentStreak(workoutDayKeys(all, timeZone), todayKey);
    const progress = getLevelProgress(totalXpByUser.get(p.userId) ?? 0);

    return {
      userId: p.userId,
      nickname: p.nickname,
      avatarUrl: p.avatarUrl,
      // LevelProgress의 필드명은 level이 아니라 currentLevel이다
      level: progress.currentLevel,
      stageName: progress.stageName,
      workoutsInPeriod: all.filter((d) => inRange(d, period.from, period.to))
        .length,
      streakDays,
      lastActiveAt,
      status: userStatus(daysSince),
      churnRisk: churnRisk(daysSince),
    };
  });
}
