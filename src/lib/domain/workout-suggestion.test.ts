import { describe, expect, it } from "vitest";
import {
  NEW_USER_GRACE_DAYS,
  pickSuggestionKind,
  secondaryKind,
  SUGGESTION_PHILOSOPHY,
  suggestionCopy,
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
   * ⚠️⚠️ **경계 그 자체다.** 위의 6일·8일 단언은 각각 컷오프에서 하루씩 떨어져
   * 있어서, `<`를 `<=`로 바꿔 창을 **위험한 방향으로** 하루 넓혀도 둘 다 통과한다
   * (코드 품질 검토에서 실제로 고장 내서 확인했다). 이 단언이 그 구멍을 막는다.
   */
  it("가입 7일째는 창 밖이다 — 창은 0~6일이다", () => {
    expect(
      pickSuggestionKind({
        ...base,
        hasHistory: false,
        signedUpDayKey: "2026-08-09", // 정확히 7일 전
        todayKey: "2026-08-16",
      }),
    ).toBeNull();
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

  /**
   * 날짜 문자열이 망가지면 `NaN`이 나오고 `NaN < 7`은 `false`라 제안이 없다.
   * **안전한 방향으로 실패한다** — 알림이 덜 가지, 더 가지 않는다. 이 성질이
   * 뒤집히면(예: 비교를 `!(x >= 7)`로 바꾸면) 여기서 잡힌다.
   */
  it("가입일 문자열이 망가지면 조용히 제안하지 않는다", () => {
    for (const bad of ["", "2026-8-1", "2026-08-16T09:00:00Z", "nonsense"]) {
      expect(
        pickSuggestionKind({
          ...base,
          hasHistory: false,
          signedUpDayKey: bad,
          todayKey: "2026-08-16",
        }),
      ).toBeNull();
    }
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

describe("suggestionCopy — 문구", () => {
  it("걷기는 10분을 말한다", () => {
    const copy = suggestionCopy("walk", "2026-08-16", 0);
    expect(copy.title).toContain("10분");
  });

  /**
   * 제목이 스트릭을 그대로 안고 간다. 브리핑이 하던 일을 뺏지 않고,
   * **지금 항상 null인 body를** 제안이 채운다.
   */
  it("지난 운동은 제목에 스트릭 일수를 싣는다", () => {
    const copy = suggestionCopy("repeat", "2026-08-16", 7);
    expect(copy.title).toContain("7");
  });

  it("인터벌은 4분을 말한다", () => {
    const copy = suggestionCopy("interval", "2026-08-16", 3);
    expect(copy.title).toContain("4분");
  });

  /**
   * ⚠️⚠️ **회귀선이다 (사용자 지시 2026-08-16).**
   *
   * "오래 하는 게 중요한 게 아니라 하루라도 빼먹지 않는 게 중요하다" —
   * 이 메시지가 이 기능의 존재 이유다. 문구를 다듬다가 이게 빠지면
   * 그냥 또 하나의 운동 권유 알림이 된다.
   */
  it("본문은 '빼먹지 않는 것'을 말한다", () => {
    for (const kind of ["walk", "interval"] as const) {
      const copy = suggestionCopy(kind, "2026-08-16", 0);
      expect(SUGGESTION_PHILOSOPHY).toContain(copy.body);
    }
  });

  it("지난 운동 본문은 4분이라도 하라고 말한다", () => {
    const copy = suggestionCopy("repeat", "2026-08-16", 5);
    expect(copy.body).toContain("4분");
  });

  /**
   * ⚠️⚠️ **로테이션의 회귀선이다.**
   *
   * 계획 없는 날이 이어지면 이 알림이 매일 온다. 문구가 고정이면 잔소리가
   * 되고, 그건 기존 브리핑(`pickByDay`로 이미 돌고 있다)보다 후퇴다.
   */
  it("같은 kind라도 날짜가 다르면 제목이 다르다", () => {
    const titles = new Set(
      ["2026-08-16", "2026-08-17", "2026-08-18"].map(
        (d) => suggestionCopy("walk", d, 0).title,
      ),
    );
    expect(titles.size).toBeGreaterThan(1);
  });

  it("같은 날짜에는 같은 문구가 나온다 — 렌더마다 바뀌면 안 된다", () => {
    const a = suggestionCopy("walk", "2026-08-16", 0);
    const b = suggestionCopy("walk", "2026-08-16", 0);
    expect(a).toEqual(b);
  });

  /**
   * ⚠️⚠️ 세 번째 변형만 `n + 1`을 쓴다. 다른 단언들은 전부 index 0에 떨어져서
   * 이 변형을 **한 번도 안 본다** — 코드 품질 검토에서 `n + 1`을 `n - 1`로
   * 뒤집었더니 18건이 그대로 통과했다.
   *
   * ⚠️ 이 단언은 `pickByDay`의 해시가 이 날짜를 index 2로 보낸다는 사실에
   *    **의존한다.** 변형을 더하거나 빼면 여기가 먼저 깨진다 — 그때는 새 날짜를
   *    다시 골라야 한다.
   */
  it("'오늘만 채우면' 변형은 다음 숫자를 말한다", () => {
    const copy = suggestionCopy("repeat", "2026-08-18", 7);
    expect(copy.title).toContain("8");
  });
});
