import { describe, expect, it } from "vitest";
import {
  LADDER_MAX_REPS_MAX,
  LADDER_MAX_REPS_MIN,
  LADDER_RUNGS,
  LADDER_SESSIONS,
  isLadderMaxReps,
  ladderRepsForDay,
  ladderTotalReps,
} from "./pullup-ladder";

describe("ladderRepsForDay — 출처(사장님 제공 이미지)가 직접 준 3일", () => {
  /*
    원문 그대로:
      "최대 5개가 가능한 사람 기준으로 하루 5세트를 나누어 5, 4, 3, 2, 1회로
       시작합니다. 매일 뒤쪽 세트부터 1회씩 늘려 나가는 것이 핵심으로,
       둘째 날은 5, 4, 3, 2, 2회, 셋째 날은 5, 4, 3, 3, 2회"

    이 세 줄은 **출처가 직접 준 값**이다. 여기가 어긋나면 나머지 계산이
    아무리 그럴듯해도 앱이 원문과 다른 것을 처방하고 있는 것이다.
  */
  it("1일차는 5·4·3·2·1", () => {
    expect(ladderRepsForDay(5, 1)).toEqual([5, 4, 3, 2, 1]);
  });

  it("2일차는 맨 뒤 세트가 +1 — 5·4·3·2·2", () => {
    expect(ladderRepsForDay(5, 2)).toEqual([5, 4, 3, 2, 2]);
  });

  it("3일차는 그다음 뒤 세트가 +1 — 5·4·3·3·2", () => {
    expect(ladderRepsForDay(5, 3)).toEqual([5, 4, 3, 3, 2]);
  });
});

describe("ladderRepsForDay — 원문 규칙(뒤에서부터 1회씩)의 연장", () => {
  it("4·5일차도 뒤에서부터 차례로 오른다", () => {
    expect(ladderRepsForDay(5, 4)).toEqual([5, 4, 4, 3, 2]);
    expect(ladderRepsForDay(5, 5)).toEqual([5, 5, 4, 3, 2]);
  });

  /*
    다섯 번 올리면 사다리 전체가 한 칸 올라간다. 이것이 이 프로그램이 "한 달
    뒤 최대 개수가 는다"고 말하는 근거다 — 6일차에 1일차보다 1개 많은
    사다리를 선다.
  */
  it("6일차에 사다리 전체가 한 칸 오른다 — 6·5·4·3·2", () => {
    expect(ladderRepsForDay(5, 6)).toEqual([6, 5, 4, 3, 2]);
  });

  it("7일차는 다시 맨 뒤부터 — 6·5·4·3·3", () => {
    expect(ladderRepsForDay(5, 7)).toEqual([6, 5, 4, 3, 3]);
  });

  /*
    "매일 1회씩"이 규칙의 전부다. 하루에 2회가 오르거나 제자리인 날이 있으면
    사다리가 원문과 갈라진 것이다.
  */
  it("하루에 정확히 1회씩 늘어난다 (마지막 회차까지)", () => {
    for (let day = 2; day <= LADDER_SESSIONS; day += 1) {
      expect(ladderTotalReps(5, day) - ladderTotalReps(5, day - 1)).toBe(1);
    }
  });

  /*
    "뒤쪽 세트부터"를 규칙 그대로 한 걸음씩 돌린 결과와 같은지 본다.
    구현은 O(1) 공식이라 규칙을 눈으로 못 읽는다 — 이 테스트가 공식과 원문
    사이의 다리다.
  */
  it("규칙을 한 걸음씩 돌린 결과와 같다", () => {
    for (const maxReps of [5, 8, 12, LADDER_MAX_REPS_MAX]) {
      const walked = [...ladderRepsForDay(maxReps, 1)];
      for (let day = 2; day <= LADDER_SESSIONS; day += 1) {
        /*
          "뒤쪽 세트부터 1회씩" — 올리는 자리가 맨 뒤에서 앞으로 **차례로**
          옮겨 간다. 맨 앞까지 가면 다시 맨 뒤로 돌아온다.

          ⚠️ "지금 올릴 수 있는 가장 뒤 세트"가 아니다. 그 읽기로는 4일차가
             5·4·3·3·3이 되는데 원문은 5·4·4·3·2다(3일차 5·4·3·3·2에서
             올린 자리가 뒤가 아니라 **앞으로** 옮겨 갔다).
        */
        const step = day - 2;
        const target = LADDER_RUNGS - 1 - (step % LADDER_RUNGS);
        walked[target] += 1;
        expect(ladderRepsForDay(maxReps, day)).toEqual(walked);
      }
    }
  });
});

describe("ladderRepsForDay — 사용자가 입력한 최대 개수에서 만든다", () => {
  it("최대 8개면 8·7·6·5·4로 시작한다", () => {
    expect(ladderRepsForDay(8, 1)).toEqual([8, 7, 6, 5, 4]);
  });

  it("최대 12개면 12·11·10·9·8로 시작한다", () => {
    expect(ladderRepsForDay(12, 1)).toEqual([12, 11, 10, 9, 8]);
  });

  it("최대 개수가 무엇이든 6일차에 한 칸 오른다", () => {
    expect(ladderRepsForDay(8, 6)).toEqual([9, 8, 7, 6, 5]);
    expect(ladderRepsForDay(12, 6)).toEqual([13, 12, 11, 10, 9]);
  });

  it("최대 개수가 무엇이든 하루 1회씩 늘어난다", () => {
    for (const maxReps of [LADDER_MAX_REPS_MIN, 9, LADDER_MAX_REPS_MAX]) {
      for (let day = 2; day <= LADDER_SESSIONS; day += 1) {
        expect(
          ladderTotalReps(maxReps, day) - ladderTotalReps(maxReps, day - 1),
        ).toBe(1);
      }
    }
  });
});

describe("ladderRepsForDay — 모양 불변식 (DB가 이 모양을 요구한다)", () => {
  it("언제나 5세트다 — 원문이 정한 세트 수", () => {
    for (const maxReps of [5, 8, LADDER_MAX_REPS_MAX]) {
      for (const day of [1, 2, 7, 13, LADDER_SESSIONS]) {
        expect(ladderRepsForDay(maxReps, day)).toHaveLength(LADDER_RUNGS);
      }
    }
  });

  it("내림차순이 뒤집히지 않는다", () => {
    for (const maxReps of [5, 8, LADDER_MAX_REPS_MAX]) {
      for (let day = 1; day <= LADDER_SESSIONS; day += 1) {
        const reps = ladderRepsForDay(maxReps, day);
        for (let i = 1; i < reps.length; i += 1) {
          expect(reps[i]).toBeLessThanOrEqual(reps[i - 1]);
        }
      }
    }
  });

  it("모든 세트가 1회 이상이다", () => {
    for (const maxReps of [LADDER_MAX_REPS_MIN, LADDER_MAX_REPS_MAX]) {
      for (let day = 1; day <= LADDER_SESSIONS; day += 1) {
        for (const reps of ladderRepsForDay(maxReps, day)) {
          expect(reps).toBeGreaterThanOrEqual(1);
        }
      }
    }
  });

  /*
    ⚠️ RPC가 처방 횟수를 1~100으로 본다. 상한 입력으로 마지막 회차까지 갔을
       때 100을 넘으면 등록이 통째로 거절된다 — 입력 상한이 그것을 막고
       있는지 여기서 못 박는다.
  */
  it("상한 입력으로 마지막 회차까지 가도 100회를 넘지 않는다", () => {
    const last = ladderRepsForDay(LADDER_MAX_REPS_MAX, LADDER_SESSIONS);
    expect(Math.max(...last)).toBeLessThanOrEqual(100);
  });
});

describe("ladderRepsForDay — 입력 검증", () => {
  /*
    ⚠️ 하한이 5인 것은 임의가 아니다. 5·4·3·2·1이 성립하려면 최대 개수가 5는
       돼야 하고, 원문 자체가 "최대 5개가 가능한 사람 기준"이라고 말한다.
       4개인 사람에게 무엇을 시킬지는 원문에 없다 — 앱이 지어내지 않는다.
  */
  it("최대 개수 5 미만을 거절한다", () => {
    expect(() => ladderRepsForDay(LADDER_MAX_REPS_MIN - 1, 1)).toThrow(
      "program_invalid_max_reps",
    );
  });

  it("범위 밖 최대 개수를 거절한다", () => {
    expect(() => ladderRepsForDay(LADDER_MAX_REPS_MAX + 1, 1)).toThrow(
      "program_invalid_max_reps",
    );
    expect(() => ladderRepsForDay(5.5, 1)).toThrow("program_invalid_max_reps");
  });

  it("범위 밖 일차를 거절한다", () => {
    expect(() => ladderRepsForDay(5, 0)).toThrow("program_invalid_day");
    expect(() => ladderRepsForDay(5, LADDER_SESSIONS + 1)).toThrow(
      "program_invalid_day",
    );
    expect(() => ladderRepsForDay(5, 1.5)).toThrow("program_invalid_day");
  });
});

describe("isLadderMaxReps", () => {
  it("범위 안 정수만 받는다", () => {
    expect(isLadderMaxReps(LADDER_MAX_REPS_MIN)).toBe(true);
    expect(isLadderMaxReps(LADDER_MAX_REPS_MAX)).toBe(true);
    expect(isLadderMaxReps(LADDER_MAX_REPS_MIN - 1)).toBe(false);
    expect(isLadderMaxReps(LADDER_MAX_REPS_MAX + 1)).toBe(false);
    expect(isLadderMaxReps(7.5)).toBe(false);
    expect(isLadderMaxReps("7")).toBe(false);
    expect(isLadderMaxReps(Number.NaN)).toBe(false);
  });
});
