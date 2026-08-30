import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  MAX_RAISE_MULTIPLE,
  goalRaiseMessage,
  goalRaiseServerMessage,
  validateGoalRaise,
} from "./goal-raise";

const MIGRATION = readFileSync(
  resolve(process.cwd(), "supabase/migrations/0090_raise_goal_while_active.sql"),
  "utf8",
);

describe("validateGoalRaise", () => {
  it("올리는 것은 통과한다", () => {
    expect(validateGoalRaise({ current: 10, next: 12 })).toBeNull();
    expect(validateGoalRaise({ current: 10, next: 10.5 })).toBeNull();
  });

  /**
   * 이게 이 규칙의 전부다. 낮추기를 열면 막판에 목표를 내려 100%를 만들 수 있고,
   * 그러면 랭킹이 달성률로 서는 의미가 사라진다.
   */
  it("낮추는 것은 막는다", () => {
    expect(validateGoalRaise({ current: 10, next: 9 })).toBe("lowered");
    expect(validateGoalRaise({ current: 10, next: 0.5 })).toBe("lowered");
  });

  it("같은 값은 바꿀 것이 없다고 말한다", () => {
    expect(validateGoalRaise({ current: 10, next: 10 })).toBe("unchanged");
  });

  it("숫자가 아니거나 0 이하면 막는다", () => {
    expect(validateGoalRaise({ current: 10, next: Number.NaN })).toBe("not_a_number");
    expect(validateGoalRaise({ current: 10, next: Infinity })).toBe("not_a_number");
    expect(validateGoalRaise({ current: 10, next: 0 })).toBe("not_positive");
    expect(validateGoalRaise({ current: 10, next: -5 })).toBe("not_positive");
  });

  /**
   * 상향은 되돌릴 수 없다 — 내리는 길이 없기 때문이다. 0을 하나 더 붙인 오타가
   * 그대로 굳으면 남은 기간 내내 달성률 5%짜리 목표를 안고 간다.
   * 서버는 이걸 안 막는다(규칙상 올리기는 전부 정당하다). 화면이 마지막 관문이다.
   */
  it("한 번에 너무 크게 올리는 것은 오타로 보고 막는다", () => {
    // 상한은 상수에서 읽는다 — 10을 손으로 박으면 상수를 바꿔도 테스트가 통과한다
    const cur = 10;
    const limit = cur * MAX_RAISE_MULTIPLE;
    expect(validateGoalRaise({ current: cur, next: limit })).toBeNull(); // 경계는 허용
    expect(validateGoalRaise({ current: cur, next: limit + 1 })).toBe("too_large");
    expect(validateGoalRaise({ current: 12, next: 12 * MAX_RAISE_MULTIPLE })).toBeNull();
    expect(validateGoalRaise({ current: 12, next: 12 * MAX_RAISE_MULTIPLE + 1 })).toBe(
      "too_large",
    );
  });

  it("문구가 상한 값을 그대로 말한다", () => {
    expect(goalRaiseMessage("too_large")).toContain(String(MAX_RAISE_MULTIPLE));
  });

  it("현재 목표가 0이면 상한을 적용하지 않는다", () => {
    // 0 * 10 = 0이라 상한이 모든 값을 막아 버린다. 0인 목표는 실무상 없지만,
    // 있다면 올릴 길이 아예 막히는 쪽이 더 나쁘다.
    expect(validateGoalRaise({ current: 0, next: 50 })).toBeNull();
  });

  it("모든 문제에 사람이 읽을 문구가 있다", () => {
    const problems = [
      "not_a_number",
      "not_positive",
      "lowered",
      "unchanged",
      "too_large",
    ] as const;
    for (const p of problems) {
      expect(goalRaiseMessage(p).trim().length, `${p}의 문구가 비었다`).toBeGreaterThan(0);
    }
  });

  // "안 돼요"만 하면 버그로 읽힌다. 왜 안 되는지가 문구에 있어야 한다.
  it("낮추기 거부 문구가 이유를 말한다", () => {
    expect(goalRaiseMessage("lowered")).toMatch(/올리는 것만|낮출 수 없/);
  });
});

describe("goalRaiseServerMessage ↔ 0090", () => {
  /**
   * 서버가 던지는 이름과 화면이 아는 이름이 두 곳에 있다. 한쪽만 바꾸면
   * 사용자는 정확한 이유 대신 "목표를 바꾸지 못했어요"만 보게 된다 —
   * 실패한 것은 맞으니 아무도 눈치채지 못하고 오래 남는다.
   */
  it("0090이 던지는 예외 이름을 전부 알고 있다", () => {
    const raised = [
      ...MIGRATION.matchAll(/raise exception '([a-z_]+)'/g),
    ].map((m) => m[1]);

    expect(raised.length, "0090에서 raise exception을 못 찾았다").toBeGreaterThan(0);

    for (const name of new Set(raised)) {
      expect(
        goalRaiseServerMessage(name),
        `${name}에 대응하는 문구가 없다`,
      ).not.toBe("목표를 바꾸지 못했어요");
    }
  });

  it("모르는 오류는 일반 문구로 떨어진다", () => {
    expect(goalRaiseServerMessage("some_network_error")).toBe(
      "목표를 바꾸지 못했어요",
    );
  });

  /**
   * ⚠️ `goal_locked`가 `goal_lowered`보다 먼저 잡히면 안 된다 — 둘 다 `goal_`로
   *    시작해서 순서를 잘못 두면 낮추기 거부가 엉뚱한 문구로 뜬다.
   */
  it("비슷한 이름끼리 서로를 가리지 않는다", () => {
    expect(goalRaiseServerMessage("goal_lowered")).toMatch(/낮출 수 없/);
    expect(goalRaiseServerMessage("goal_planned_days_lowered")).toMatch(/일수/);
    expect(goalRaiseServerMessage("goal_locked")).toMatch(/고칠 수 없/);
  });
});
