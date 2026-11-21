/**
 * 챌린지 '운동 횟수' 쪼개기 방지 (2026-11-21, 사용자 요청).
 *
 * 운동을 잘게 나눠 '횟수'만 부풀리는 것을 막는다. 규칙:
 *   직전에 **인정된** 운동이 끝난 뒤 60분이 지나기 전에 시작한 운동은 횟수에 안 센다.
 *
 * ⚠️ 빠지는 것은 **횟수뿐**이다. 운동 시간·유산소 거리·웨이트 볼륨은 쪼개도 합이 같아서
 *    막을 이유가 없다. 챌린지 종합 점수의 `workout_days`는 하루를 1일로 세므로 원래 안 뚫린다.
 * ⚠️ 기준점은 "직전 운동"이 아니라 "직전에 **인정된** 운동"이다. 직전 운동 기준이면
 *    59분마다 이어 붙인 사람은 영원히 한 번으로만 세진다.
 * ⚠️ **앞으로 시작한 운동에만 적용한다.** `SESSION_GAP_RULE_FROM` 이전에 시작했거나
 *    시작 시각이 없는 행은 늘 세고, 기준점도 되지 않는다 — 이전 순위가 바뀌면 안 된다.
 * ⚠️ 규칙이 이 한 곳에만 있다. 화면마다 따로 세면 숫자가 갈린다 (challenge-metrics 참고).
 */

export const SESSION_GAP_MINUTES = 60;

/** 화면에 그대로 쓰는 안내 문구 — 규칙을 바꾸면 여기만 고친다 */
export const SESSION_GAP_NOTICE =
  "앞선 운동이 끝나고 1시간이 지나기 전에 시작한 운동은 '운동 횟수'에 더해지지 않아요. 운동 시간·거리·무게는 그대로 반영돼요.";

/**
 * 이 시각 **이후에 시작한** 운동부터 규칙을 적용한다.
 * ⚠️ 배포 직전에 배포 시각으로 맞춘다. 배포 뒤에는 바꾸지 마라 — 바꾸면 이미 센 기록이 달라진다.
 */
export const SESSION_GAP_RULE_FROM = "2026-11-22T06:00:00+09:00";

export type GapRow = {
  userId: string;
  startedAt?: string | null;
  completedAt: string;
};

/** 횟수에서 빠지는 행의 집합 (행 객체 그대로 — 호출한 쪽이 `has(row)`로 거른다) */
export function uncountedSessions<T extends GapRow>(
  rows: readonly T[],
  ruleFrom: string = SESSION_GAP_RULE_FROM,
  gapMinutes: number = SESSION_GAP_MINUTES,
): Set<T> {
  const from = Date.parse(ruleFrom);
  const gapMs = gapMinutes * 60_000;
  const out = new Set<T>();

  const byUser = new Map<string, T[]>();
  for (const r of rows) {
    const list = byUser.get(r.userId);
    if (list) list.push(r);
    else byUser.set(r.userId, [r]);
  }

  for (const list of byUser.values()) {
    const sorted = [...list].sort(
      (a, b) => Date.parse(a.completedAt) - Date.parse(b.completedAt),
    );
    let lastCountedEnd: number | null = null;
    for (const r of sorted) {
      const start = r.startedAt ? Date.parse(r.startedAt) : NaN;
      const end = Date.parse(r.completedAt);
      // 규칙 대상이 아니다 → 늘 센다, 기준점도 아니다
      if (!Number.isFinite(start) || !Number.isFinite(end) || start < from) continue;
      if (lastCountedEnd !== null && start - lastCountedEnd < gapMs) {
        out.add(r);
        continue;
      }
      lastCountedEnd = end;
    }
  }
  return out;
}
