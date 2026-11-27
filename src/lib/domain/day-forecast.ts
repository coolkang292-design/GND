/**
 * 하루 전체 예상 점수의 **시간표** (이슈 #33 TASK-07).
 *
 * 남은 계획을 가상의 완료 운동으로 만들 때, 각 운동의 시작·끝 시각을 정한다. 이 시각이 1시간 규칙
 * (`session-gap.ts` — 앞선 인정 운동이 끝나고 60분 안에 시작하면 횟수에서 뺀다)을 그대로 거친다.
 *
 * - 첫 운동(지금 퀘스트)은 **예정 시각**이 있으면 그때, 없거나 이미 지났으면 지금 시작한다
 * - 다음 운동은 예정 시각이 있으면 그때 시작한다. 앞 운동이 끝나기 전이면(일정 겹침) 앞 운동이 끝난 직후로 민다
 * - 예정 시각이 없으면 앞 운동이 끝난 **직후**에 바로 이어 한다고 본다 — 간격을 모르면 횟수 점수를
 *   **보수적으로**(덜) 계산한다. 화면은 이 경우 조건을 알린다(`assumed`)
 * - 끝 = 시작 + 예상 운동시간. 0분이면 1분으로 둔다(시작과 끝이 같으면 행 순서가 흔들린다)
 *
 * 순수 함수다 — 화면 진입 시각(`nowMs`)은 **예정 시각이 없을 때만** 쓴다.
 */
export type DaySessionInput<T> = {
  /** 이 운동이 무엇인지 — 그대로 돌려준다 */
  item: T;
  minutes: number;
  scheduledAtMs: number | null;
};

export type TimedDaySession<T> = DaySessionInput<T> & {
  startMs: number;
  endMs: number;
  /** 시각을 정한 방법 — `now`(예정 없음/지남)·`scheduled`·`after-previous`(예정 없음 → 바로 이어서)·`overlap`(예정이 앞 운동과 겹침) */
  timing: "now" | "scheduled" | "after-previous" | "overlap";
};

const MINUTE = 60_000;

export function scheduleDaySessions<T>(
  nowMs: number,
  sessions: readonly DaySessionInput<T>[],
): TimedDaySession<T>[] {
  const out: TimedDaySession<T>[] = [];
  let cursor = nowMs;
  sessions.forEach((session, index) => {
    const minutes = Math.max(1, Number.isFinite(session.minutes) ? session.minutes : 0);
    let startMs: number;
    let timing: TimedDaySession<T>["timing"];
    const scheduled = session.scheduledAtMs;
    if (index === 0) {
      if (scheduled !== null && scheduled > nowMs) {
        startMs = scheduled;
        timing = "scheduled";
      } else {
        startMs = nowMs;
        timing = "now";
      }
    } else if (scheduled === null) {
      startMs = cursor;
      timing = "after-previous";
    } else if (scheduled < cursor) {
      startMs = cursor;
      timing = "overlap";
    } else {
      startMs = scheduled;
      timing = "scheduled";
    }
    const endMs = startMs + Math.round(minutes * MINUTE);
    out.push({ ...session, startMs, endMs, timing });
    cursor = endMs;
  });
  return out;
}

/** 시간표 중 간격을 몰라 보수적으로 계산한 것이 있는가 — 화면 조건 안내용 */
export function hasAssumedTiming(sessions: readonly TimedDaySession<unknown>[]): boolean {
  return sessions.some((session) => session.timing === "after-previous" || session.timing === "overlap");
}
