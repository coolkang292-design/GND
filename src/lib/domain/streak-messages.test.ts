import { describe, expect, it } from "vitest";
import {
  EXPIRED_MESSAGES,
  AT_RISK_MESSAGES,
  PERSISTENCE_MESSAGES,
  QUOTE_MESSAGES,
  RESTART_MESSAGES,
  ROLE_MODEL_MESSAGES,
  START_MESSAGES,
  STAGE_MESSAGES,
  TODAY_DONE_MESSAGES,
  dailyMessage,
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

/**
 * 스트릭 칸 한 줄 — **성공은 반복과 지속에서 나온다** 계열 (2026-08-21 사용자 지시).
 *
 * ⚠️ 이건 `STAGE_MESSAGES`(재촉)도 `streakHeadline`(사실 상태)도 아닌 **세 번째
 * 갈래**다. 위험을 말하지 않고, 지금 하고 있는 반복 자체를 성공의 재료로 되돌려
 * 준다. 셋을 한 곳에 섞으면 같은 자리에서 같은 말이 두 번 나온다(2026-07-23 사고).
 *
 * ⚠️⚠️ **"매일"이라고 말하면 거짓말이다.** 이 앱의 스트릭은 5일 유예라
 * (`STREAK_EXPIRY_DAYS = 5`) 사흘 쉬어도 이어진다. `11일째`는 "11일 동안 하루도
 * 안 빠졌다"가 아니라 "11번의 운동이 끊기지 않고 이어졌다"는 뜻이다.
 * 문구를 다듬다가 이 선을 넘으면 화면이 사용자에게 없던 성실을 씌운다.
 */
describe("반복·지속 한 줄 — 성공은 반복에서 나온다", () => {
  const ALL = [...PERSISTENCE_MESSAGES, ...ROLE_MODEL_MESSAGES];

  it("스트릭이 있으면 어느 변형이든 그 숫자를 적는다", () => {
    expect(PERSISTENCE_MESSAGES.length).toBeGreaterThan(3);
    for (const make of ALL) {
      expect(make(11)).toContain("11");
    }
  });

  it("어느 변형도 매일 했다고 단정하지 않는다 — 5일 유예가 있다", () => {
    for (const make of ALL) {
      const msg = make(11);
      for (const banned of [
        "매일",
        "하루도",
        "빠짐없이",
        "쉬지 않고",
        "연속으로 매",
      ]) {
        expect(msg).not.toContain(banned);
      }
    }
  });

  it("어느 변형이든 반복·지속·성공 계열의 말을 쓴다", () => {
    const words = ["반복", "지속", "꾸준", "계속", "이어", "쌓"];
    for (const make of ALL) {
      expect(words.some((w) => make(11).includes(w))).toBe(true);
    }
  });

  /**
   * ⚠️ **실존 인물에 대한 사실 주장이다.** 다음 사람이 "비슷한 얘기"를 지어 붙이는
   * 것을 막는다 — 이름을 늘리려면 이 목록을 같이 늘려야 하고, 그때 출처(파일 주석)를
   * 확인하게 된다.
   */
  it("인물 사례는 출처를 확인한 사람만 쓴다", () => {
    const VERIFIED = ["팀 쿡", "브랜슨", "저커버그", "하워드 슐츠"];
    expect(ROLE_MODEL_MESSAGES.length).toBeGreaterThan(2);
    for (const make of ROLE_MODEL_MESSAGES) {
      expect(VERIFIED.some((name) => make(11).includes(name))).toBe(true);
    }
  });

  it("한 번도 안 한 사람에겐 숫자를 세지 않고 시작을 권한다", () => {
    expect(START_MESSAGES.length).toBeGreaterThan(1);
    for (const msg of START_MESSAGES) {
      expect(msg).not.toMatch(/0일/);
      // 시작한 적 없는 사람에게 "다시"는 자기 기록이 사라졌다는 말로 읽힌다
      expect(msg).not.toContain("다시");
    }
    expect(START_MESSAGES).toContain(
      dailyMessage({ stage: "none", streak: 0, todayKey: "2026-08-21" }),
    );
  });

  /**
   * 2026-08-21 사용자 지시 — *"스트릭이 꺼질 위험에 있거나 꺼진 사람에게는 실패에도
   * 불구하고 극복할 수 있다는 메시지 위주로"*.
   */
  it("위험한 사람에게는 겁이 아니라 회복을 말한다", () => {
    for (const stage of ["d4", "d3", "d2", "d1"] as const) {
      const line = dailyMessage({ stage, streak: 11, todayKey: "2026-08-21" });
      expect(AT_RISK_MESSAGES.map((make) => make(11))).toContain(line);
      // 잃을 양·남은 날을 말하는 것은 **경고 배너**의 몫이다. 여기까지 겁주면
      // 같은 자리에서 두 번 몰아붙인다.
      for (const banned of ["소멸", "D-", "0일이 돼", "잃"]) {
        expect(line).not.toContain(banned);
      }
    }
  });

  it("꺼진 사람에게는 다시 붙일 수 있다고 말한다", () => {
    const line = dailyMessage({
      stage: "expired",
      streak: 0,
      todayKey: "2026-08-21",
    });
    expect(RESTART_MESSAGES).toContain(line);
  });

  /**
   * ⚠️⚠️ **경고 배너와 같이 뜨는 줄은 한 줄을 넘기면 안 된다.** 두 줄이 되면 카드가
   * 403px가 되고 375×812에서 크루 카드 하단이 하단 탭(754px)에 닿는다 — 홈을 두 카드로
   * 나눈 이유가 사라진다(2026-08-21 실측). 11px 글자 기준 28자가 한 줄이다.
   */
  it("위험·소멸·시작 문구는 한 줄(28자)을 넘지 않는다", () => {
    const lines = [
      ...AT_RISK_MESSAGES.map((make) => make(100)),
      ...RESTART_MESSAGES,
      ...START_MESSAGES,
    ];
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(28);
    }
  });

  /**
   * ⚠️ **인용문은 스트릭 수를 달지 않는다.** 남의 말에 내 숫자를 이어 붙이면 그 사람이
   * 내 기록을 두고 한 말처럼 읽힌다. 그래서 "고른 줄에 숫자가 있다"로 단언할 수 없고,
   * **만들어 둔 줄 중 하나인가**로 본다.
   */
  it("오늘 마친 사람에게는 성공·반복 갈래에서 고른다", () => {
    const pool = [
      ...PERSISTENCE_MESSAGES.map((make) => make(11)),
      ...ROLE_MODEL_MESSAGES.map((make) => make(11)),
      ...QUOTE_MESSAGES,
    ];
    expect(pool).toContain(
      dailyMessage({ stage: "today_done", streak: 11, todayKey: "2026-08-21" }),
    );
  });

  /**
   * ⚠️ **실제 발언이다.** 다음 사람이 "느낌이 비슷한 말"을 지어 붙이는 것을 막는다 —
   * 화자를 늘리려면 이 목록을 같이 늘려야 하고, 그때 출처(파일 주석)를 확인하게 된다.
   */
  it("인용문은 따옴표와 화자를 함께 적고, 확인된 사람만 쓴다", () => {
    const VERIFIED = ["팀 쿡", "리처드 브랜슨", "마크 큐번"];
    expect(QUOTE_MESSAGES.length).toBeGreaterThan(2);
    for (const quote of QUOTE_MESSAGES) {
      expect(quote.startsWith('"')).toBe(true);
      expect(quote).toContain(" — ");
      expect(VERIFIED.some((name) => quote.endsWith(name))).toBe(true);
    }
  });

  it("같은 날엔 고정, 날마다 돌아간다", () => {
    const pick = (todayKey: string) =>
      dailyMessage({ stage: "today_done", streak: 11, todayKey });
    expect(pick("2026-08-21")).toBe(pick("2026-08-21"));
    const week = new Set(
      ["21", "22", "23", "24", "25", "26", "27"].map((d) =>
        pick(`2026-08-${d}`),
      ),
    );
    expect(week.size).toBeGreaterThan(1);
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
