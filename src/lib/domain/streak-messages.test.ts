import { describe, expect, it } from "vitest";
import {
  EXPIRED_MESSAGES,
  STAGE_MESSAGES,
  TODAY_DONE_MESSAGES,
  pickByDay,
} from "./streak-messages";
import { daysSinceLastWorkout, streakStage } from "./streak";

describe("d4 카피 — 어제는 '운동한 날'이지 '쉰 날'이 아니다", () => {
  it("d4는 마지막 운동이 어제인 상태다", () => {
    // 이 전제가 깨지면 아래 문구 규칙도 다시 봐야 한다.
    expect(streakStage(["2026-07-22"], "2026-07-23")).toBe("d4");
    expect(daysSinceLastWorkout(["2026-07-22"], "2026-07-23")).toBe(1);
  });

  it("어느 변형도 어제를 쉰 날로 단정하지 않는다", () => {
    // 2026-07-23 사용자 신고: 어제 운동했는데 "어제 쉬셨다?"가 떴다.
    // 로테이션되므로 세 변형 전부를 검사한다.
    const variants = STAGE_MESSAGES.d4 ?? [];
    expect(variants.length).toBeGreaterThan(0);
    for (const make of variants) {
      const msg = make(2);
      for (const banned of [
        "어제 쉬",
        "하루 걸렀",
        "어제 뭐 하셨",
        "이틀째",
        "연속 휴식",
      ]) {
        expect(msg).not.toContain(banned);
      }
      expect(msg).toContain("2일"); // 스트릭 수는 계속 정확히 찌른다
      expect(msg).toContain("D-4");
    }
  });
});

describe("나머지 단계는 쉰 일수를 정확히 말한다", () => {
  // d3=2일째, d2=3일째, d1=4일째(오늘 포함) — gap과 일치해야 한다.
  it.each([
    ["d3", "2026-07-21", 2],
    ["d2", "2026-07-20", 3],
    ["d1", "2026-07-19", 4],
  ] as const)("%s = gap %i", (stage, lastDay, gap) => {
    expect(streakStage([lastDay], "2026-07-23")).toBe(stage);
    expect(daysSinceLastWorkout([lastDay], "2026-07-23")).toBe(gap);
  });

  it("d1은 '오늘 안 하면 리셋'이 맞다 (내일이면 소멸)", () => {
    expect(streakStage(["2026-07-19"], "2026-07-24")).toBe("expired");
    for (const make of STAGE_MESSAGES.d1 ?? []) {
      expect(make(5)).toContain("D-1");
    }
  });
});

/**
 * 2026-08-13 사용자 지시 — "알림 메시지는 손실 회피 심리를 자극하는 문구로".
 *
 * ⚠️ 문구는 사람이 손으로 고치는 곳이라 시간이 지나면 물러진다. 다음 사람이
 * 부드럽게 다듬다가 **잃을 양을 빼 버리는 것**을 막는 것이 이 describe의 목적이다.
 */
describe("손실 회피 — 잃을 양을 숫자로 말한다", () => {
  const STAGES = ["d4", "d3", "d2", "d1"] as const;

  it("모든 단계가 잃을 일수(n)를 문구 안에 적는다", () => {
    for (const stage of STAGES) {
      const variants = STAGE_MESSAGES[stage] ?? [];
      expect(variants.length).toBeGreaterThan(0);
      for (const make of variants) {
        // 7을 넣었으면 "7일"이 보여야 한다. "곧 사라져요" 같은 막연한 말은 손실
        // 회피가 아니다 — 손실은 **양이 보일 때** 아프다.
        expect(make(7)).toContain("7일");
      }
    }
  });

  it("모든 단계가 남은 시간을 D-N으로 못 박는다", () => {
    for (const stage of STAGES) {
      for (const make of STAGE_MESSAGES[stage] ?? []) {
        expect(make(7)).toMatch(/D-[1-4]/);
      }
    }
  });

  /**
   * ⚠️ **사실을 넘는 위협을 쓰지 않는다.** 이 앱의 스트릭은 5일 유예다
   * (`STREAK_EXPIRY_DAYS = 5`). 어제 운동한 사람(d4)에게 "오늘 안 하면 리셋"은
   * 거짓말이고, 한 번 거짓말한 경고는 다음에도 안 믿긴다.
   */
  it("d4~d2는 오늘 소멸한다고 말하지 않는다 — 아직 여유가 있다", () => {
    for (const stage of ["d4", "d3", "d2"] as const) {
      for (const make of STAGE_MESSAGES[stage] ?? []) {
        const msg = make(7);
        expect(msg).not.toContain("오늘 안 하면");
        expect(msg).not.toContain("마지막 기회");
      }
    }
  });

  it("d1만 전부 잃는다고 말한다 — 그때가 사실이다", () => {
    for (const make of STAGE_MESSAGES.d1 ?? []) {
      expect(make(7)).toMatch(/0일|마지막|끝/);
    }
  });
});

/**
 * 2026-08-13 사용자 지시 — "손실회피와 동기 부여를 조합. 인간 본능과 심리 이론을
 * 바탕으로".
 *
 * ⚠️ **전부 공포로 밀면 안 된다.** 손실 회피만 반복하면 ① 여유 있는 단계에서
 * 거짓말이 되고 ② 매일 겁주는 알림은 꺼진다. 단계마다 다른 기제를 쓰는 것이
 * 설계이고, 아래 단언이 그 기제의 흔적을 고정한다. 근거 이론은
 * `streak-messages.ts` 상단 표에 있다.
 */
describe("동기 조합 — 단계마다 다른 기제", () => {
  /** 목표 구배: 다음 한 칸(n+1)을 보여준다 — 위협이 거짓인 단계의 지렛대 */
  it("d4는 위협 대신 다음 숫자(n+1)를 보여준다", () => {
    const variants = STAGE_MESSAGES.d4 ?? [];
    expect(variants.length).toBeGreaterThan(0);
    for (const make of variants) {
      expect(make(7)).toContain("8일"); // n+1
    }
  });

  /** 보유 효과·매몰 노력: 이미 **가진** 것과 들인 수고를 상기시킨다 */
  it("d3은 이미 쌓은 것을 상기시킨다", () => {
    for (const make of STAGE_MESSAGES.d3 ?? []) {
      expect(make(7)).toMatch(/당신|쌓|기다리|주인/);
    }
  });

  /** 자기효능: 잃을 양만 말하고 문턱을 안 낮추면 "어차피 못 해"로 간다 */
  it("d2·d1은 잃을 양과 함께 할 수 있다는 신호를 준다", () => {
    for (const stage of ["d2", "d1"] as const) {
      for (const make of STAGE_MESSAGES[stage] ?? []) {
        expect(make(7)).toMatch(/30분|한 번|지금|됩니다|지킵니다/);
      }
    }
  });

  /** 목표 구배: 오늘 마친 사람에겐 잃을 게 없다 — 다음 칸이 유일한 지렛대 */
  it("오늘 완료 문구도 다음 숫자나 쌓인 수를 말한다", () => {
    for (const make of TODAY_DONE_MESSAGES) {
      const msg = make(7);
      expect(msg).toContain("오늘 완료"); // 반영 사실은 남긴다
      expect(msg).toMatch(/7일|8일/);
    }
  });

  /**
   * ⚠️ **소멸 단계에는 손실 회피를 쓰지 않는다. 의도적이다.** 이미 잃은 뒤라
   * 찌를 손실이 없고, "당신은 N일을 잃었습니다"는 재촉이 아니라 면박이다.
   * 남은 지렛대는 다시 시작하는 문턱을 낮추는 것(새 출발 효과)뿐이다.
   */
  it("소멸 문구는 겁주지 않고 재시작을 권한다", () => {
    expect(EXPIRED_MESSAGES.length).toBeGreaterThan(0);
    for (const msg of EXPIRED_MESSAGES) {
      expect(msg).toMatch(/다시|1일/);
      expect(msg).not.toMatch(/잃었|후회|실패/);
    }
  });
});

describe("pickByDay — 같은 날엔 고정, 날마다 로테이션", () => {
  it("같은 날짜는 항상 같은 변형", () => {
    const v = ["a", "b", "c"];
    expect(pickByDay(v, "2026-07-23")).toBe(pickByDay(v, "2026-07-23"));
  });

  it("여러 날에 걸쳐 변형이 하나로 고정되지 않는다", () => {
    const v = ["a", "b", "c"];
    const days = Array.from(
      { length: 30 },
      (_, i) => `2026-07-${String(i + 1).padStart(2, "0")}`,
    );
    expect(new Set(days.map((d) => pickByDay(v, d))).size).toBeGreaterThan(1);
  });
});
