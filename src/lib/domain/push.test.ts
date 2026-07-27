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
    ["badge_earned", "/record"],
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
