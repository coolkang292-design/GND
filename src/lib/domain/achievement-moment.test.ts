import { describe, expect, it } from "vitest";
import {
  achievementMomentLine,
  completedWorkoutFeedPath,
  challengeProofState,
  feedPathAfterProof,
  isChallengeProofPending,
} from "./achievement-moment";

const kst = "Asia/Seoul";
const at = (iso: string) => new Date(iso);

describe("achievementMomentLine", () => {
  it("compares unique workout days, not sessions, across weeks", () => {
    const line = achievementMomentLine({
      previousCompletedAts: [
        at("2026-10-12T07:00:00+09:00"),
        at("2026-10-19T07:00:00+09:00"),
        at("2026-10-19T08:00:00+09:00"),
      ],
      completedAt: at("2026-10-20T08:00:00+09:00"),
      timeZone: kst,
    });
    expect(line).toBe("지난주보다 1일 더 운동했어요.");
  });

  it("never describes current performance as worse if prior week was larger", () => {
    const line = achievementMomentLine({
      previousCompletedAts: [
        at("2026-10-12T07:00:00+09:00"),
        at("2026-10-13T07:00:00+09:00"),
        at("2026-10-14T07:00:00+09:00"),
      ],
      completedAt: at("2026-10-19T08:00:00+09:00"),
      timeZone: kst,
    });
    expect(line).toBe("이번 주 1일째, 오늘도 해냈어요.");
  });

  it("does not invent achievement data when history fails", () => {
    expect(achievementMomentLine({ previousCompletedAts: null, completedAt: at("2026-10-19T08:00:00+09:00"), timeZone: kst })).toBeNull();
  });

  it("celebrates the first confirmed workout without artificial comparisons", () => {
    expect(achievementMomentLine({ previousCompletedAts: [], completedAt: at("2026-10-19T08:00:00+09:00"), timeZone: kst })).toContain("첫 운동");
  });

  it("respects local Monday boundaries", () => {
    const line = achievementMomentLine({
      previousCompletedAts: [at("2026-10-18T23:55:00+09:00")],
      completedAt: at("2026-10-19T00:05:00+09:00"),
      timeZone: kst,
    });
    expect(line).toBe("이번 주 1일째, 오늘도 해냈어요.");
  });
});

describe("completedWorkoutFeedPath", () => {
  it("deep-links only group-visible sessions", () => {
    expect(completedWorkoutFeedPath("workout-id", "group")).toBe("/feed?session=workout-id&from=complete");
    expect(completedWorkoutFeedPath("workout-id", "private")).toBeNull();
    expect(completedWorkoutFeedPath("workout-id", null)).toBeNull();
  });
  it("escapes the link parameter", () => {
    expect(completedWorkoutFeedPath("a&b", "group")).toBe("/feed?session=a%26b&from=complete");
  });
});

/**
 * 인증 대기 (2026-10-19 사용자 결정, 시안 docs/ux/workout-complete-ux-reference-20261019.svg STATE 01).
 * 사진 필수 챌린지에 보탤 몫이 있는데 사진이 없으면 피드로 보내지 않는다 —
 * 인증을 끝내야 피드 버튼이 생긴다.
 */
describe("isChallengeProofPending", () => {
  const gains = [{ delta: 1 }];
  it("사진 필수 + 보탤 몫 있음 + 사진 없음 → 대기", () => {
    expect(isChallengeProofPending({ photoRequired: true, photoDone: false, gains })).toBe(true);
  });
  it("사진을 올리면 대기가 풀린다", () => {
    expect(isChallengeProofPending({ photoRequired: true, photoDone: true, gains })).toBe(false);
  });
  it("사진 필수가 아니면 대기가 아니다", () => {
    expect(isChallengeProofPending({ photoRequired: false, photoDone: false, gains })).toBe(false);
  });
  it("챌린지에 보탤 몫이 없으면 사진과 무관하다", () => {
    expect(isChallengeProofPending({ photoRequired: true, photoDone: false, gains: [] })).toBe(false);
    expect(isChallengeProofPending({ photoRequired: true, photoDone: false, gains: [{ delta: 0 }] })).toBe(false);
  });
});

describe("feedPathAfterProof", () => {
  it("인증 대기면 피드 링크를 거둔다", () => {
    expect(feedPathAfterProof("/feed?session=x&from=complete", true)).toBeNull();
  });
  it("대기가 아니면 그대로 — 비공개(null)는 계속 null", () => {
    expect(feedPathAfterProof("/feed?session=x&from=complete", false)).toBe("/feed?session=x&from=complete");
    expect(feedPathAfterProof(null, false)).toBeNull();
  });
});

/**
 * 이슈 #16 P0-B — 사진 인증 상태를 정확히 나눈다.
 * 서버 집계(`get_challenge_period_sessions`)는 사진 필수 챌린지에서 `workout_images` 행이
 * 있는 세션만 센다. 그래서 "사진 있음(업로드·확정 성공)" = 반영 확정이다.
 */
describe("challengeProofState", () => {
  const gains = [{ delta: 1 }];
  it("챌린지 기여 계산이 없으면 none — 챌린지 문구를 그리지 않는다", () => {
    expect(challengeProofState({ photoRequired: true, photoDone: false, gains: [] })).toBe("none");
  });
  it("보탤 몫이 0이면 no_gain — 반영됐다고 말하지 않는다", () => {
    expect(challengeProofState({ photoRequired: true, photoDone: true, gains: [{ delta: 0 }] })).toBe("no_gain");
    expect(challengeProofState({ photoRequired: false, photoDone: false, gains: [{ delta: 0 }] })).toBe("no_gain");
  });
  it("사진 필수 + 사진 없음 → pending(예정형)", () => {
    expect(challengeProofState({ photoRequired: true, photoDone: false, gains })).toBe("pending");
  });
  it("사진 필수 + 사진 있음 → confirmed(확정형)", () => {
    expect(challengeProofState({ photoRequired: true, photoDone: true, gains })).toBe("confirmed");
  });
  it("사진 필수가 아니면 사진과 무관하게 confirmed — 인증 강제 문구 없음", () => {
    expect(challengeProofState({ photoRequired: false, photoDone: false, gains })).toBe("confirmed");
  });
  it("isChallengeProofPending과 판정이 같다", () => {
    for (const photoRequired of [true, false])
      for (const photoDone of [true, false])
        for (const g of [[], [{ delta: 0 }], gains]) {
          const input = { photoRequired, photoDone, gains: g };
          expect(isChallengeProofPending(input)).toBe(challengeProofState(input) === "pending");
        }
  });
});
