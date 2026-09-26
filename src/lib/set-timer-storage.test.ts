// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";

import { clearSetTimer, loadSetTimer, saveSetTimer } from "./workout";

const timer = {
  sessionId: "session-1",
  exerciseKey: "ex-tread",
  setIndex: 0,
  startedAtMs: 1_800_000_000_000,
  targetSec: 1_800,
};

beforeEach(() => localStorage.clear());

/**
 * 세트 시계 보관 (2026-09-23) — 페이지가 다시 로드돼도 시작 시각이 남아야 한다.
 * 판정(세션 대조·6시간)은 `set-timer-restore.ts`가 하고, 여기는 넣고 빼기만 한다.
 */
describe("세트 시계 보관", () => {
  it("넣은 것을 그대로 꺼낸다", () => {
    saveSetTimer("user-1", timer);
    expect(loadSetTimer("user-1")).toEqual(timer);
  });

  it("사람마다 따로 둔다 — 한 기기에서 계정을 바꿔도 섞이지 않는다", () => {
    saveSetTimer("user-1", timer);
    expect(loadSetTimer("user-2")).toBeNull();
  });

  it("지우면 없다", () => {
    saveSetTimer("user-1", timer);
    clearSetTimer("user-1");
    expect(loadSetTimer("user-1")).toBeNull();
  });

  it("손상된 값은 null — 화면이 죽지 않는다", () => {
    localStorage.setItem("gnd-set-timer:user-1", "{not json");
    expect(loadSetTimer("user-1")).toBeNull();
    localStorage.setItem(
      "gnd-set-timer:user-1",
      JSON.stringify({ ...timer, setIndex: "0" }),
    );
    expect(loadSetTimer("user-1")).toBeNull();
  });
});
