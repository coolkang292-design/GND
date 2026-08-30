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

/**
 * 2026-08-16 — 계획 없는 날 제안.
 *
 * ⚠️⚠️ `PUSH_URL_BY_TYPE`은 **exhaustive가 아니다**(`Record<string,string>`).
 * 유형을 늘려도 컴파일러가 안 잡고 `/home`으로 조용히 떨어진다. 그러면 알림은
 * "담아 뒀어요"라고 말하면서 홈으로 보내고, 사용자는 담긴 것을 못 찾는다.
 * (`TYPE_ICON`은 exhaustive라 타입 오류로 막힌다 — 여기만 손으로 챙겨야 한다.)
 */
describe("workout_suggestion — 계획 없는 날 제안", () => {
  it("기록 탭으로 보내고 제안 표식을 싣는다", () => {
    const payload = pushPayloadFor({
      type: "workout_suggestion",
      title: "🚶 오늘은 10분 걷기부터",
      body: "오래 하는 것보다, 하루도 빼먹지 않는 게 중요해요",
    });
    expect(payload.url).toBe("/record?suggest=1");
  });

  it("홈으로 떨어지지 않는다", () => {
    const payload = pushPayloadFor({
      type: "workout_suggestion",
      title: "t",
      body: "b",
    });
    expect(payload.url).not.toBe("/home");
  });
});

/**
 * 0082 — 알림에서 **그 게시물**로 돌아오는 길.
 *
 * 이게 없으면 댓글 알림을 눌러도 피드 최상단으로 떨어져서, 누가 무엇에 댓글을
 * 달았는지 사용자가 찾을 수 없다. 대화가 왕복하지 않는다.
 */
describe("게시물 딥링크 (reference_id)", () => {
  it.each(["comment_received", "reaction_received", "record_beaten"])(
    "%s는 그 세션으로 보낸다",
    (type) => {
      expect(
        pushPayloadFor({
          type,
          title: "t",
          body: "b",
          referenceId: "11111111-2222-3333-4444-555555555555",
        }).url,
      ).toBe("/feed?session=11111111-2222-3333-4444-555555555555");
    },
  );

  /**
   * ⚠️⚠️ 회귀 방어. `send_cheer`는 `notify(..., c.id, ...)`로 **cheers 행 id**를
   * 넘긴다 — 세션 id가 아니다. 응원을 딥링크 목록에 넣으면 **존재하지 않는
   * 게시물**로 보내게 된다. 응원은 애초에 진행 중 세션이라 게시물이 없다.
   */
  it("cheer_received는 reference_id가 있어도 딥링크로 만들지 않는다", () => {
    expect(
      pushPayloadFor({
        type: "cheer_received",
        title: "t",
        body: "b",
        referenceId: "11111111-2222-3333-4444-555555555555",
      }).url,
    ).toBe("/home");
  });

  it("reference_id가 없으면 예전 그대로 유형별 고정 주소", () => {
    expect(
      pushPayloadFor({ type: "comment_received", title: "t", body: "b" }).url,
    ).toBe("/feed");
    expect(
      pushPayloadFor({
        type: "reaction_received",
        title: "t",
        body: "b",
        referenceId: null,
      }).url,
    ).toBe("/feed");
  });

  it("딥링크 대상이 아닌 유형은 reference_id를 무시한다", () => {
    expect(
      pushPayloadFor({
        type: "badge_earned",
        title: "t",
        body: "b",
        referenceId: "11111111-2222-3333-4444-555555555555",
      }).url,
    ).toBe("/profile");
  });
});
