import { describe, expect, it } from "vitest";

import { pushPayloadFor, shouldDispatchPush } from "./push";

describe("pushPayloadFor", () => {
  it("uses the notification title and body as-is", () => {
    expect(
      pushPayloadFor({ type: "cheer_received", title: "응원 도착", body: "화이팅!" }),
    ).toEqual({ title: "응원 도착", body: "화이팅!", url: "/home" });
  });

  it("falls back to GND title and empty body", () => {
    expect(pushPayloadFor({ type: "poke", title: "", body: null })).toEqual({
      title: "GND",
      body: "",
      url: "/home",
    });
  });

  it.each([
    ["cheer_received", "/home"],
    ["poke", "/home"],
    ["morning_briefing", "/home"],
    ["workout_started", "/home"],
    ["record_viewed", "/home"],
    ["reaction_received", "/feed"],
    ["record_beaten", "/feed"],
    // ⚠️ 2026-08-14 정정: `/record` → `/profile`. 배지 진열대가 `GrowthHub`로
    //    들어가면서 내 정보 탭으로 옮겨졌는데 라우팅만 안 따라왔었다.
    ["badge_earned", "/profile"],
    ["level_up", "/profile"],
    ["rank_change", "/challenge"],
    ["challenge_started", "/challenge"],
    ["challenge_ended", "/challenge"],
    ["app_update", "/whats-new"],
    ["crew_request", "/crew"],
    ["crew_accepted", "/crew"],
    ["unknown_type", "/home"],
  ])("maps %s to url %s", (type, url) => {
    expect(pushPayloadFor({ type, title: "t", body: "b" }).url).toBe(url);
  });
});

describe("shouldDispatchPush", () => {
  const now = new Date("2026-07-19T12:00:00Z");

  it("dispatches a fresh unpushed notification", () => {
    expect(
      shouldDispatchPush({
        createdAt: new Date("2026-07-19T11:59:00Z"),
        pushedAt: null,
        now,
      }),
    ).toBe(true);
  });

  it("skips an already pushed notification", () => {
    expect(
      shouldDispatchPush({
        createdAt: new Date("2026-07-19T11:59:00Z"),
        pushedAt: new Date("2026-07-19T11:59:30Z"),
        now,
      }),
    ).toBe(false);
  });

  it("skips a notification older than ten minutes", () => {
    expect(
      shouldDispatchPush({
        createdAt: new Date("2026-07-19T11:49:59Z"),
        pushedAt: null,
        now,
      }),
    ).toBe(false);
  });

  it("dispatches exactly at the ten minute boundary", () => {
    expect(
      shouldDispatchPush({
        createdAt: new Date("2026-07-19T11:50:00Z"),
        pushedAt: null,
        now,
      }),
    ).toBe(true);
  });
});

describe("0077 새 알림 유형의 목적지 (exhaustive가 아니라 손으로 챙겨야 한다)", () => {
  /**
   * ⚠️⚠️ `PUSH_URL_BY_TYPE`은 `Record<string, string>`이라 유형을 늘려도
   * 컴파일러가 안 잡아주고 `/home`으로 조용히 떨어진다. 이 단언이 그 자리다.
   */
  it("시작 예고는 챌린지 탭으로 간다", () => {
    expect(
      pushPayloadFor({ type: "challenge_starting_soon", title: null, body: null }).url,
    ).toBe("/challenge");
  });

  it("탈락 통보도 챌린지 탭으로 간다", () => {
    expect(
      pushPayloadFor({ type: "challenge_dropped", title: null, body: null }).url,
    ).toBe("/challenge");
  });

  /**
   * ⚠️ **이건 정정이다.** 옛 값은 `/record`였고 주석은 *"배지 진열대가 기록 탭
   * 달력에 있다(2026-07-21)"*였다. 그 뒤 진열대가 `GrowthHub`로 들어가면서
   * **`/profile`(내 정보) 탭으로 옮겨졌는데 라우팅이 안 따라왔다.**
   * 알림 본문도 "내 정보에서 확인해 보세요"라고 말하면서 기록 탭으로 보냈다.
   */
  it("배지 알림은 진열대가 있는 내 정보 탭으로 간다", () => {
    expect(
      pushPayloadFor({ type: "badge_earned", title: null, body: null }).url,
    ).toBe("/profile");
  });
});
