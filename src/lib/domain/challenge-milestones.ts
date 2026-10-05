/**
 * 챌린지 마일스톤 — 시안의 `챌린지 보상` 칸 (2026-10-05 사용자 결정 "1번으로").
 *
 * ⚠️⚠️ **보상 지급 기능이 아니다.** 사용자가 고른 것은 "챌린지 안의 실제 연속일과 완주
 *    진행만 보여 주는 칸(지급은 없음)"이다. XP·배지·포인트를 주지 않고, 서버에 아무것도
 *    기록하지 않는다. 화면 문구도 `보상`이 아니라 `마일스톤`이다(적용 지침: "새로운 지급
 *    조건이나 보상 기능을 만들라는 뜻이 아니다").
 *
 * 재료는 챌린지 기간 운동일(`PeriodStats.workoutDayKeys`, 서버 집계와 같은 원천)뿐이다.
 *
 * 연속은 **달력상 하루도 빠지지 않은 날 수**다. 앱 스트릭(5일 유예)과 다른 자다 —
 * `7일 연속`을 유예로 세면 이틀에 한 번 운동한 사람도 달성이라 문구가 거짓이 된다.
 */

export type MilestoneState = "done" | "progress" | "locked";

export type ChallengeMilestone = {
  key: "streak7" | "streak14" | "finish";
  /** 배지 안 숫자 */
  badge: number;
  title: string;
  state: MilestoneState;
  /** 0~1 — 진행 중일 때 막대 */
  ratio: number;
};

function nextDay(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

/** 기간 안에서 가장 길게 이어진 연속 운동일 */
export function longestConsecutiveDays(dayKeys: readonly string[]): number {
  const days = [...new Set(dayKeys)].sort();
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const k of days) {
    run = prev !== null && nextDay(prev) === k ? run + 1 : 1;
    best = Math.max(best, run);
    prev = k;
  }
  return best;
}

/**
 * 세 칸: 7일 연속 · 14일 연속 · 기간 완주.
 * 순서대로 첫 미달성 하나만 `progress`, 그 뒤는 `locked`(시안: 달성 완료 · 진행 중 · 잠금 중).
 */
export function challengeMilestones(input: {
  workoutDayKeys: readonly string[];
  startDate: string;
  endDate: string;
  todayKey: string;
  /** 기간 전체 일수(시작·끝 포함) */
  totalDays: number;
  /** 오늘까지 지난 일수(1부터) */
  dayIndex: number;
}): ChallengeMilestone[] {
  const inPeriod = input.workoutDayKeys.filter(
    (k) => k >= input.startDate && k <= input.endDate && k <= input.todayKey,
  );
  const best = longestConsecutiveDays(inPeriod);
  const finished = input.todayKey > input.endDate;

  const raw: Omit<ChallengeMilestone, "state">[] = [
    { key: "streak7", badge: 7, title: "7일 연속", ratio: Math.min(1, best / 7) },
    { key: "streak14", badge: 14, title: "14일 연속", ratio: Math.min(1, best / 14) },
    {
      key: "finish",
      badge: input.totalDays,
      title: `${input.totalDays}일 완주`,
      ratio: finished ? 1 : Math.min(1, Math.max(0, input.dayIndex / input.totalDays)),
    },
  ];

  let progressGiven = false;
  return raw.map((m) => {
    if (m.ratio >= 1) return { ...m, state: "done" as const };
    if (!progressGiven) {
      progressGiven = true;
      return { ...m, state: "progress" as const };
    }
    return { ...m, state: "locked" as const };
  });
}
