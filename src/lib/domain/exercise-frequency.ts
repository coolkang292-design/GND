/**
 * 자주 한 운동 — 최근 90일간 각 종목이 등장한 **완료 세션 수** (2026-08-02).
 *
 * 설계: docs/superpowers/specs/2026-08-02-routines-frequent-exercises-calendar-planning-design.md
 *
 * 세트 수가 아니라 세션 수를 세는 이유: 세트를 잘게 나누는 종목(맨몸·유산소)이
 * 과대평가되지 않는다. 한 세션에 같은 종목이 여러 번 들어 있어도 1회다.
 */

export const FREQUENT_WINDOW_DAYS = 90;
export const FREQUENT_LIMIT = 5;

const DAY_MS = 86_400_000;

export type ExerciseFrequency = {
  name: string;
  count: number;
};

/** 빈도 계산에 필요한 최소 형태 — `CalendarSession`이 그대로 들어맞는다. */
export type FrequencySession = {
  completedAt: Date;
  exerciseNames: string[];
};

/**
 * 최근 `windowDays`일간 등장한 완료 세션 수 내림차순, 동수는 이름 오름차순.
 *
 * 창 계산은 타임존을 끌어들이지 않는 단순 뺄셈이다. 롤링 90일에는 사용자
 * 타임존이 필요 없고, `dayKey` 경계를 쓰면 그 경계 버그를 새로 들여올 뿐이다.
 *
 * ⚠️ 상한(미래 컷)은 걸지 않는다. `completedAt`은 서버 시각이고 `now`는 브라우저
 * 시각이라 방금 끝낸 운동이 몇 초 앞설 수 있는데, 상한을 걸면 그게 사라진다.
 */
export function topExercisesByFrequency(
  sessions: readonly FrequencySession[],
  now: Date,
  options: { windowDays?: number; limit?: number } = {},
): ExerciseFrequency[] {
  const windowDays = options.windowDays ?? FREQUENT_WINDOW_DAYS;
  const limit = options.limit ?? FREQUENT_LIMIT;
  const since = now.getTime() - windowDays * DAY_MS;

  const counts = new Map<string, number>();
  for (const session of sessions) {
    if (session.completedAt.getTime() < since) continue;
    // 세션 안의 중복은 1회 — 세션 수 기준이므로 먼저 집합으로 접는다
    for (const name of new Set(session.exerciseNames)) {
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit);
}

/**
 * 카탈로그에 **실제로 있는** 종목만 남긴 상위 목록.
 *
 * `workout_exercises`는 카탈로그 FK가 아니라 `exercise_name` 텍스트를 저장하므로
 * 이름으로 맞춘다. 지운 커스텀 종목처럼 카탈로그에 없는 이름은 버린다.
 *
 * ⚠️ **자르기 전에 거른다.** 상위 5개를 먼저 자른 뒤 매칭하면 버려진 이름 자리가
 * 그대로 비어 4개만 뜬다. 전체를 정렬·매칭한 다음 마지막에 자른다.
 */
export function frequentCatalogPicks<T>(
  sessions: readonly FrequencySession[],
  now: Date,
  catalog: readonly T[],
  getName: (item: T) => string,
  options: { windowDays?: number; limit?: number } = {},
): { item: T; count: number }[] {
  const byName = new Map<string, T>();
  for (const item of catalog) {
    // 같은 이름이 여럿이면 먼저 온 것을 쓴다 (시드 우선 — 커스텀은 뒤에 온다)
    if (!byName.has(getName(item))) byName.set(getName(item), item);
  }

  return topExercisesByFrequency(sessions, now, {
    windowDays: options.windowDays,
    limit: Number.MAX_SAFE_INTEGER,
  })
    .flatMap(({ name, count }) => {
      const item = byName.get(name);
      return item ? [{ item, count }] : [];
    })
    .slice(0, options.limit ?? FREQUENT_LIMIT);
}
