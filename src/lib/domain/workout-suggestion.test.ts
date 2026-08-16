import { describe, expect, it } from "vitest";
import {
  NEW_USER_GRACE_DAYS,
  pickSuggestionKind,
  secondaryKind,
} from "./workout-suggestion";

/** 이력 있는 사람의 기본형 — 각 테스트가 필요한 것만 덮어쓴다 */
const base = {
  hasPlanToday: false,
  didWorkoutToday: false,
  hasHistory: true,
  lastSessionWasInterval: false,
  isInActiveChallenge: false,
  signedUpDayKey: "2026-01-01",
  todayKey: "2026-08-16",
};

describe("pickSuggestionKind — 제안하지 않는 경우", () => {
  it("오늘 계획이 있으면 제안하지 않는다", () => {
    expect(pickSuggestionKind({ ...base, hasPlanToday: true })).toBeNull();
  });

  it("오늘 이미 운동했으면 제안하지 않는다", () => {
    expect(pickSuggestionKind({ ...base, didWorkoutToday: true })).toBeNull();
  });

  /**
   * ⚠️⚠️ **이 파일에서 가장 중요한 단언이다.**
   *
   * 가입만 하고 잊은 사람에게 영원히 알림이 가면 안 된다. 이 창이 없으면
   * 기록 0건인 계정 전부가 매일 알림을 받는다 — 알림 차단이나 앱 삭제로 이어진다.
   */
  it("기록 0건이고 가입 창이 지났으면 제안하지 않는다", () => {
    expect(
      pickSuggestionKind({
        ...base,
        hasHistory: false,
        signedUpDayKey: "2026-08-08", // 8일 전
        todayKey: "2026-08-16",
      }),
    ).toBeNull();
  });
});

describe("pickSuggestionKind — 신규 유저", () => {
  it("가입 당일이면 걷기를 권한다", () => {
    expect(
      pickSuggestionKind({
        ...base,
        hasHistory: false,
        signedUpDayKey: "2026-08-16",
        todayKey: "2026-08-16",
      }),
    ).toBe("walk");
  });

  /**
   * 창의 **마지막 날**이다. 위의 "8일 전은 null"과 한 쌍이라야 경계를 잡는다 —
   * 한쪽만 있으면 창을 통째로 열거나 닫아도 통과한다.
   */
  it("가입 창의 마지막 날까지는 걷기를 권한다", () => {
    expect(NEW_USER_GRACE_DAYS).toBe(7);
    expect(
      pickSuggestionKind({
        ...base,
        hasHistory: false,
        signedUpDayKey: "2026-08-10", // 6일 전 → 창 안
        todayKey: "2026-08-16",
      }),
    ).toBe("walk");
  });

  /**
   * 챌린지에 참가했는데 기록이 0건인 사람. 되살릴 지난 운동이 없으므로
   * 걷기 창이 지났어도 인터벌로 보낸다 — 사용자 지시 2026-08-16.
   */
  it("기록 0건이어도 챌린지 참가 중이면 인터벌을 권한다", () => {
    expect(
      pickSuggestionKind({
        ...base,
        hasHistory: false,
        isInActiveChallenge: true,
        signedUpDayKey: "2026-01-01", // 창 밖
      }),
    ).toBe("interval");
  });
});

describe("pickSuggestionKind — 이력 있는 유저", () => {
  it("지난 운동을 그대로 권한다", () => {
    expect(pickSuggestionKind(base)).toBe("repeat");
  });

  /**
   * ⚠️ 지난 세션이 인터벌이었으면 주 제안이 인터벌이다. 안 그러면
   * 주 제안(지난 운동 = 인터벌)과 보조 제안(인터벌)이 **같은 것 둘**이 된다.
   */
  it("지난 세션이 인터벌이면 인터벌을 권한다", () => {
    expect(
      pickSuggestionKind({ ...base, lastSessionWasInterval: true }),
    ).toBe("interval");
  });
});

describe("secondaryKind — 보조 제안", () => {
  it("지난 운동에는 4분 인터벌을 같이 낸다", () => {
    expect(secondaryKind("repeat")).toBe("interval");
  });

  /**
   * ⚠️ 인터벌이 주 제안일 때 보조로도 인터벌을 내면 **같은 버튼이 둘**이 된다.
   */
  it("인터벌이 주 제안이면 보조가 없다", () => {
    expect(secondaryKind("interval")).toBeNull();
  });

  /**
   * 신규에게는 걷기만 낸다 (사용자 지시 2026-08-16). 인터벌 4종
   * (맨몸 스쿼트·니 푸시업·데드버그·마운틴 클라이머)은 처음 온 사람에게
   * 걷기보다 부담이 크다.
   */
  it("걷기에는 보조가 없다", () => {
    expect(secondaryKind("walk")).toBeNull();
  });
});
