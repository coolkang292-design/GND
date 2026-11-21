import { describe, expect, it } from "vitest";
import {
  SESSION_GAP_MINUTES,
  SESSION_GAP_RULE_FROM,
  uncountedSessions,
} from "./session-gap";

/** 규칙 시작 시각(이후 운동만 대상) — 테스트는 상수를 직접 쓰지 않고 이 기준으로 잰다 */
const FROM = Date.parse(SESSION_GAP_RULE_FROM);
const MIN = 60_000;
const iso = (offsetMin: number) => new Date(FROM + offsetMin * MIN).toISOString();

/** 시작·끝을 규칙 시작 기준 분(offset)으로 적는다 */
const s = (userId: string, startMin: number | null, endMin: number) => ({
  userId,
  startedAt: startMin === null ? null : iso(startMin),
  completedAt: iso(endMin),
});

describe("uncountedSessions — 1시간 안에 이어 한 운동은 횟수에서 뺀다", () => {
  it("기준은 60분이다", () => {
    expect(SESSION_GAP_MINUTES).toBe(60);
  });

  it("직전 운동이 끝나고 59분 만에 시작하면 뺀다", () => {
    const a = s("u", 10, 40);
    const b = s("u", 99, 130); // a 끝(40) + 59분
    expect(uncountedSessions([a, b])).toEqual(new Set([b]));
  });

  it("정확히 60분이면 센다 (경계는 센다)", () => {
    const a = s("u", 10, 40);
    const b = s("u", 100, 130);
    expect(uncountedSessions([a, b]).size).toBe(0);
  });

  it("뺀 운동 뒤에 이어 해도 '인정된' 운동 기준이다 — 59분씩 이어 붙여도 영원히 막히지 않는다", () => {
    const a = s("u", 10, 40); // 인정
    const b = s("u", 90, 100); // a 끝+50 → 제외
    const c = s("u", 150, 160); // 인정된 a 끝(40)+110 → 인정 (b 끝 100 기준이면 50분이라 제외됐을 것)
    expect(uncountedSessions([a, b, c])).toEqual(new Set([b]));
  });

  it("인정된 운동이 새 기준이 된다 — c 인정 뒤 59분 이내 d는 뺀다", () => {
    const a = s("u", 10, 40);
    const c = s("u", 150, 160);
    const d = s("u", 200, 210); // c 끝(160)+40 → 제외
    expect(uncountedSessions([a, c, d])).toEqual(new Set([d]));
  });

  it("사람마다 따로 잰다 — 남의 운동은 상관없다", () => {
    const a = s("u", 10, 40);
    const x = s("v", 50, 70);
    expect(uncountedSessions([a, x]).size).toBe(0);
  });

  it("입력 순서와 상관없다 (끝난 시각 순으로 본다)", () => {
    const a = s("u", 10, 40);
    const b = s("u", 99, 130);
    expect(uncountedSessions([b, a])).toEqual(new Set([b]));
  });

  it("이전 기록에는 영향이 없다 — 규칙 시작 전에 시작한 운동은 늘 센다", () => {
    const old1 = s("u", -90, -60);
    const old2 = s("u", -50, -20); // 둘 사이 10분이지만 규칙 시작 전 → 센다
    expect(uncountedSessions([old1, old2]).size).toBe(0);
  });

  it("규칙 시작 전 운동은 기준점이 되지도 않는다", () => {
    const old = s("u", -30, 5); // 규칙 시작 전에 시작
    const fresh = s("u", 20, 50); // old 끝+15분이지만 old는 기준점이 아니다 → 센다
    expect(uncountedSessions([old, fresh]).size).toBe(0);
  });

  it("시작 시각이 없는 행(옛 응답)은 늘 센다", () => {
    const a = s("u", 10, 40);
    const legacy = s("u", null, 60);
    expect(uncountedSessions([a, legacy]).size).toBe(0);
  });

  it("시작이 직전 운동 끝보다 앞서 겹쳐도 뺀다", () => {
    const a = s("u", 10, 60);
    const b = s("u", 30, 70);
    expect(uncountedSessions([a, b])).toEqual(new Set([b]));
  });

  it("행이 없으면 빈 집합", () => {
    expect(uncountedSessions([]).size).toBe(0);
  });
});
