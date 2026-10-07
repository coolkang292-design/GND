/**
 * 실데이터 교차 확인 — `scripts/challenge-metrics-check.mjs`가 저장한 덤프가 있을 때만 돈다.
 * 스크립트의 독립 계산(도메인 모듈 미사용)과 화면이 쓰는 `normalizeChallengePeriodSessions` →
 * `metricTotalsByUser` → `rankMetric` 결과가 **완전히 같아야** 한다.
 */
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { normalizeChallengePeriodSessions } from "@/lib/challenge";
import { metricTotalsByUser, rankMetric, type MetricKey } from "./challenge-metrics";

type Dump = {
  challenge: { id: string; name: string; start_date: string };
  memberIds: string[];
  endKey: string;
  timeZone: string;
  rows: unknown;
  expected: Record<MetricKey, { userId: string; value: number; rank: number | null }[]>;
}[];

const path = process.env.CHALLENGE_METRICS_DUMP;
const run = path && existsSync(path) ? describe : describe.skip;

run("종목별 랭킹 — 실데이터 교차 확인", () => {
  const dump: Dump = path && existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : [];

  it("덤프에 참가자 2명 이상 챌린지가 있다", () => {
    expect(dump.length).toBeGreaterThan(0);
    for (const d of dump) expect(d.memberIds.length).toBeGreaterThanOrEqual(2);
  });

  for (const d of dump) {
    it(`${d.challenge.name}: 4종 순위가 독립 계산과 같다`, () => {
      const rows = normalizeChallengePeriodSessions(d.rows);
      const totals = metricTotalsByUser(rows, d.memberIds, d.challenge.start_date, d.endKey, d.timeZone);
      for (const key of ["sessions", "minutes", "cardioKm", "volumeKg"] as const) {
        const got = rankMetric(totals, key).map((r) => ({ ...r, value: Math.round(r.value * 1000) / 1000 }));
        const want = d.expected[key].map((r) => ({ ...r, value: Math.round(r.value * 1000) / 1000 }));
        expect(got, key).toEqual(want);
      }
    });
  }
});
