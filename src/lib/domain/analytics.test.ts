import { describe, expect, it } from "vitest";
import {
  ABANDON_AFTER_HOURS,
  activationFunnel,
  activeUserCounts,
  buildKpi,
  buildPeriod,
  buildUserRows,
  churnRisk,
  crewParticipation,
  dailyActiveSeries,
  formatRatio,
  ratio,
  reworkoutRetention,
  userStatus,
  type SessionRow,
} from "./analytics";

const s = (
  userId: string,
  status: SessionRow["status"],
  completedAt: string | null,
  startedAt: string | null = completedAt,
): SessionRow => ({
  userId,
  status,
  startedAt: startedAt ? new Date(startedAt) : null,
  completedAt: completedAt ? new Date(completedAt) : null,
});

describe("buildPeriod", () => {
  const now = new Date("2026-07-28T00:00:00Z");

  it("28일 구간은 now에서 28일 전부터 now까지", () => {
    const p = buildPeriod(28, now);
    expect(p.days).toBe(28);
    expect(p.to).toEqual(now);
    expect(p.from).toEqual(new Date("2026-06-30T00:00:00Z"));
  });

  it("직전 구간은 같은 길이로 바로 앞에 붙는다", () => {
    const p = buildPeriod(28, now);
    expect(p.prevTo).toEqual(p.from);
    expect(p.prevFrom).toEqual(new Date("2026-06-02T00:00:00Z"));
  });

  it("7일·90일도 같은 규칙", () => {
    expect(buildPeriod(7, now).from).toEqual(new Date("2026-07-21T00:00:00Z"));
    expect(buildPeriod(90, now).from).toEqual(new Date("2026-04-29T00:00:00Z"));
  });
});

describe("formatRatio — 표본 표기 규칙", () => {
  it("모수가 충분하면 퍼센트와 모수를 함께 쓴다", () => {
    expect(formatRatio(ratio(3, 10))).toBe("30% (3/10)");
  });

  // 4명 규모에서 퍼센트를 큰 글씨로 띄우면 그 자체가 거짓 정보다
  it("모수 5 미만이면 퍼센트를 숨기고 원시수치만", () => {
    expect(formatRatio(ratio(2, 4))).toBe("2/4");
    expect(formatRatio(ratio(1, 1))).toBe("1/1");
  });

  it("모수 0은 측정 불가 — 0%가 아니라 —", () => {
    expect(formatRatio(ratio(0, 0))).toBe("—");
  });

  it("모수 5는 경계 안쪽이라 퍼센트를 쓴다", () => {
    expect(formatRatio(ratio(1, 5))).toBe("20% (1/5)");
  });

  it("반올림은 정수 퍼센트", () => {
    expect(formatRatio(ratio(1, 6))).toBe("17% (1/6)"); // 16.67 → 17
    expect(formatRatio(ratio(1, 8))).toBe("13% (1/8)"); // 12.5 → 13
  });

  // 모수가 작으면 퍼센트를 만들지 않는다는 규칙이 반올림보다 우선한다
  it("모수 5 미만이면 반올림할 것도 없이 원시수치", () => {
    expect(formatRatio(ratio(1, 3))).toBe("1/3");
  });
});

describe("buildKpi", () => {
  const now = new Date("2026-07-28T00:00:00Z");
  const period = buildPeriod(28, now);

  it("활성 사용자는 기간 내 완료 세션의 distinct 사용자", () => {
    const k = buildKpi(
      [
        s("u1", "completed", "2026-07-20T10:00:00Z"),
        s("u1", "completed", "2026-07-21T10:00:00Z"),
        s("u2", "completed", "2026-07-22T10:00:00Z"),
      ],
      [],
      period,
      now,
    );
    expect(k.activeUsers).toBe(2);
    expect(k.completedWorkouts).toBe(3);
  });

  it("기간 밖 세션은 제외한다", () => {
    const k = buildKpi(
      [
        s("u1", "completed", "2026-05-01T10:00:00Z"),
        s("u2", "completed", "2026-07-22T10:00:00Z"),
      ],
      [],
      period,
      now,
    );
    expect(k.activeUsers).toBe(1);
    expect(k.completedWorkouts).toBe(1);
  });

  it("취소 세션을 센다", () => {
    const k = buildKpi(
      [
        s("u1", "completed", "2026-07-20T10:00:00Z"),
        s("u2", "cancelled", null, "2026-07-21T10:00:00Z"),
      ],
      [],
      period,
      now,
    );
    expect(k.cancelledWorkouts).toBe(1);
  });

  // 6시간은 피드의 "운동 중" 판정과 같은 값을 쓴다
  it("시작 후 6시간이 지나도 안 끝난 active는 방치로 센다", () => {
    const k = buildKpi(
      [s("u1", "active", null, "2026-07-20T00:00:00Z")],
      [],
      period,
      now,
    );
    expect(k.abandonedWorkouts).toBe(1);
  });

  it("아직 6시간이 안 지난 active는 방치가 아니다(운동 중)", () => {
    const recent = new Date(
      now.getTime() - (ABANDON_AFTER_HOURS - 1) * 3_600_000,
    );
    const k = buildKpi(
      [s("u1", "active", null, recent.toISOString())],
      [],
      period,
      now,
    );
    expect(k.abandonedWorkouts).toBe(0);
  });

  it("완료율 = 완료 / (완료+취소+방치)", () => {
    const k = buildKpi(
      [
        s("u1", "completed", "2026-07-20T10:00:00Z"),
        s("u1", "completed", "2026-07-21T10:00:00Z"),
        s("u2", "cancelled", null, "2026-07-21T10:00:00Z"),
        s("u3", "active", null, "2026-07-01T00:00:00Z"),
      ],
      [],
      period,
      now,
    );
    expect(k.completionRate).toEqual({ numerator: 2, denominator: 4 });
  });

  it("신규는 기간 내 가입한 프로필 수", () => {
    const k = buildKpi(
      [],
      [
        { userId: "u1", createdAt: new Date("2026-07-20T00:00:00Z") },
        { userId: "u2", createdAt: new Date("2026-01-01T00:00:00Z") },
      ],
      period,
      now,
    );
    expect(k.newUsers).toBe(1);
  });

  it("1인당 운동 = 완료 / 활성 사용자", () => {
    const k = buildKpi(
      [
        s("u1", "completed", "2026-07-20T10:00:00Z"),
        s("u1", "completed", "2026-07-21T10:00:00Z"),
        s("u2", "completed", "2026-07-22T10:00:00Z"),
      ],
      [],
      period,
      now,
    );
    expect(k.workoutsPerUser).toBeCloseTo(1.5);
  });

  it("활성 사용자 0이면 1인당 운동은 0", () => {
    const k = buildKpi([], [], period, now);
    expect(k.workoutsPerUser).toBe(0);
  });

  it("상위 25%는 사용자별 완료 수의 p75", () => {
    const rows: SessionRow[] = [];
    for (let i = 0; i < 4; i++)
      rows.push(s("u1", "completed", "2026-07-20T10:00:00Z"));
    for (let i = 0; i < 3; i++)
      rows.push(s("u2", "completed", "2026-07-20T10:00:00Z"));
    for (let i = 0; i < 2; i++)
      rows.push(s("u3", "completed", "2026-07-20T10:00:00Z"));
    rows.push(s("u4", "completed", "2026-07-20T10:00:00Z"));
    expect(buildKpi(rows, [], period, now).topQuartileWorkouts).toBe(3);
  });

  it("직전 구간과 비교해 증감을 낸다", () => {
    const k = buildKpi(
      [
        s("u1", "completed", "2026-07-20T10:00:00Z"),
        s("u2", "completed", "2026-06-10T10:00:00Z"),
        s("u3", "completed", "2026-06-11T10:00:00Z"),
      ],
      [],
      period,
      now,
    );
    expect(k.prevCompletedWorkouts).toBe(2);
    expect(k.completedWorkoutsDeltaPct).toBe(-50);
  });

  // 0 → 5는 ∞%다. 퍼센트를 만들지 않는다.
  it("직전 구간이 0이면 증감 퍼센트는 null", () => {
    const k = buildKpi(
      [s("u1", "completed", "2026-07-20T10:00:00Z")],
      [],
      period,
      now,
    );
    expect(k.prevCompletedWorkouts).toBe(0);
    expect(k.completedWorkoutsDeltaPct).toBeNull();
  });
});

describe("dailyActiveSeries", () => {
  const now = new Date("2026-07-28T00:00:00Z");

  it("KST 날짜별 distinct 사용자 수를 낸다", () => {
    const series = dailyActiveSeries(
      [
        s("u1", "completed", "2026-07-27T01:00:00Z"),
        s("u2", "completed", "2026-07-27T02:00:00Z"),
        s("u1", "completed", "2026-07-26T01:00:00Z"),
      ],
      buildPeriod(7, now),
      "Asia/Seoul",
    );
    const byKey = Object.fromEntries(series.map((p) => [p.dayKey, p.count]));
    expect(byKey["2026-07-27"]).toBe(2);
    expect(byKey["2026-07-26"]).toBe(1);
  });

  it("운동이 없는 날도 0으로 채운다(막대가 비지 않게)", () => {
    const series = dailyActiveSeries([], buildPeriod(7, now), "Asia/Seoul");
    expect(series).toHaveLength(7);
    expect(series.every((p) => p.count === 0)).toBe(true);
  });

  // UTC 자정 직전 운동이 KST로는 다음 날이다
  it("UTC 22시 운동은 KST 다음 날로 센다", () => {
    const series = dailyActiveSeries(
      [s("u1", "completed", "2026-07-26T22:00:00Z")],
      buildPeriod(7, now),
      "Asia/Seoul",
    );
    const byKey = Object.fromEntries(series.map((p) => [p.dayKey, p.count]));
    expect(byKey["2026-07-27"]).toBe(1);
    // 빈 날도 0으로 채워지므로 undefined가 아니라 0이어야 한다
    expect(byKey["2026-07-26"]).toBe(0);
  });
});

describe("activeUserCounts", () => {
  const now = new Date("2026-07-28T00:00:00Z");

  it("DAU·WAU·MAU를 각각 1·7·28일 창으로 센다", () => {
    const c = activeUserCounts(
      [
        s("u1", "completed", "2026-07-27T12:00:00Z"),
        s("u2", "completed", "2026-07-24T12:00:00Z"),
        s("u3", "completed", "2026-07-10T12:00:00Z"),
        s("u4", "completed", "2026-05-01T12:00:00Z"),
      ],
      now,
    );
    expect(c.dau).toBe(1);
    expect(c.wau).toBe(2);
    expect(c.mau).toBe(3);
  });

  it("DAU/MAU는 Ratio로 낸다", () => {
    const c = activeUserCounts(
      [
        s("u1", "completed", "2026-07-27T12:00:00Z"),
        s("u2", "completed", "2026-07-10T12:00:00Z"),
      ],
      now,
    );
    expect(c.dauOverMau).toEqual({ numerator: 1, denominator: 2 });
  });

  it("아무 활동이 없으면 전부 0", () => {
    expect(activeUserCounts([], now)).toEqual({
      dau: 0,
      wau: 0,
      mau: 0,
      dauOverMau: { numerator: 0, denominator: 0 },
    });
  });
});

describe("reworkoutRetention", () => {
  const now = new Date("2026-07-28T00:00:00Z");

  it("가입 후 D1에 운동한 사람을 센다", () => {
    const r = reworkoutRetention(
      [{ userId: "u1", createdAt: new Date("2026-07-01T00:00:00Z") }],
      [s("u1", "completed", "2026-07-02T05:00:00Z")],
      now,
    );
    expect(r.d1).toEqual({ numerator: 1, denominator: 1 });
  });

  it("D7 코호트는 가입 후 7일이 지난 사람만 분모에 넣는다", () => {
    const r = reworkoutRetention(
      [
        { userId: "u1", createdAt: new Date("2026-07-01T00:00:00Z") },
        { userId: "u2", createdAt: new Date("2026-07-27T00:00:00Z") },
      ],
      [],
      now,
    );
    expect(r.d7.denominator).toBe(1);
  });

  it("D28도 마찬가지로 아직 28일이 안 된 사람은 제외", () => {
    const r = reworkoutRetention(
      [{ userId: "u1", createdAt: new Date("2026-07-20T00:00:00Z") }],
      [],
      now,
    );
    expect(r.d28.denominator).toBe(0);
  });

  it("해당 일자에 운동이 없으면 분자에 안 들어간다", () => {
    const r = reworkoutRetention(
      [{ userId: "u1", createdAt: new Date("2026-07-01T00:00:00Z") }],
      [s("u1", "completed", "2026-07-05T05:00:00Z")],
      now,
    );
    expect(r.d1.numerator).toBe(0);
    expect(r.d7.numerator).toBe(0);
  });
});

describe("activationFunnel", () => {
  it("가입은 auth 기준, 프로필 설정은 profiles 기준", () => {
    const f = activationFunnel(
      [
        { userId: "u1", createdAt: new Date("2026-07-01T00:00:00Z") },
        { userId: "u2", createdAt: new Date("2026-07-02T00:00:00Z") },
        { userId: "u3", createdAt: new Date("2026-07-03T00:00:00Z") },
      ],
      [
        { userId: "u1", createdAt: new Date("2026-07-01T00:00:00Z") },
        { userId: "u2", createdAt: new Date("2026-07-02T00:00:00Z") },
      ],
      [
        s("u1", "completed", "2026-07-04T00:00:00Z"),
        s("u1", "completed", "2026-07-05T00:00:00Z"),
        s("u1", "completed", "2026-07-06T00:00:00Z"),
        s("u2", "completed", "2026-07-04T00:00:00Z"),
      ],
    );
    expect(f.map((step) => step.count)).toEqual([3, 2, 2, 1]);
    expect(f.map((step) => step.label)).toEqual([
      "가입 완료",
      "프로필 설정",
      "첫 운동 완료",
      "3회 운동 완료",
    ]);
  });

  // 단계 수는 절대 늘어나면 안 된다 — 늘어나면 퍼널을 읽을 수 없다
  it("단계는 단조 감소한다", () => {
    const f = activationFunnel(
      [{ userId: "u1", createdAt: new Date("2026-07-01T00:00:00Z") }],
      [{ userId: "u1", createdAt: new Date("2026-07-01T00:00:00Z") }],
      [s("u1", "completed", "2026-07-02T00:00:00Z")],
    );
    for (let i = 1; i < f.length; i++) {
      expect(f[i].count).toBeLessThanOrEqual(f[i - 1].count);
    }
  });

  // 프로필 없는 사용자가 세션을 갖고 있어도 단조성이 깨지면 안 된다
  it("프로필 없는 사용자의 운동은 이후 단계에 안 들어간다", () => {
    const f = activationFunnel(
      [{ userId: "orphan", createdAt: new Date("2026-07-01T00:00:00Z") }],
      [],
      [s("orphan", "completed", "2026-07-02T00:00:00Z")],
    );
    expect(f.map((step) => step.count)).toEqual([1, 0, 0, 0]);
  });

  it("가입자가 없으면 전 단계 0", () => {
    expect(activationFunnel([], [], []).map((step) => step.count)).toEqual([
      0, 0, 0, 0,
    ]);
  });
});

describe("crewParticipation", () => {
  it("크루에 속한 사용자 비율", () => {
    expect(
      crewParticipation(
        [
          { userId: "u1", createdAt: new Date() },
          { userId: "u2", createdAt: new Date() },
          { userId: "u3", createdAt: new Date() },
        ],
        ["u1", "u2"],
      ),
    ).toEqual({ numerator: 2, denominator: 3 });
  });

  it("같은 사용자가 여러 연결에 있어도 1명으로 센다", () => {
    expect(
      crewParticipation([{ userId: "u1", createdAt: new Date() }], ["u1", "u1"]),
    ).toEqual({ numerator: 1, denominator: 1 });
  });

  it("프로필이 없으면 모수 0", () => {
    expect(crewParticipation([], ["u1"])).toEqual({
      numerator: 0,
      denominator: 0,
    });
  });
});

describe("userStatus", () => {
  it("7일 이내 운동이면 활성", () => {
    expect(userStatus(0)).toBe("활성");
    expect(userStatus(7)).toBe("활성");
  });

  it("8~14일이면 주의", () => {
    expect(userStatus(8)).toBe("주의");
    expect(userStatus(14)).toBe("주의");
  });

  it("15일 이상이면 휴면", () => {
    expect(userStatus(15)).toBe("휴면");
  });

  it("운동 기록이 없으면(null) 휴면", () => {
    expect(userStatus(null)).toBe("휴면");
  });
});

describe("churnRisk", () => {
  // 경계 5일 = STREAK_EXPIRY_DAYS. 앱이 불꽃을 보여주는 사용자가
  // 관리자 화면에서 "위험"으로 뜨면 두 화면이 어긋난다.
  it("스트릭이 살아있는 5일 미만은 낮음", () => {
    expect(churnRisk(0)).toBe("낮음");
    expect(churnRisk(4)).toBe("낮음");
  });

  it("5~13일은 중간", () => {
    expect(churnRisk(5)).toBe("중간");
    expect(churnRisk(13)).toBe("중간");
  });

  it("14일 이상은 높음", () => {
    expect(churnRisk(14)).toBe("높음");
  });

  it("기록 없음은 높음", () => {
    expect(churnRisk(null)).toBe("높음");
  });
});

describe("buildUserRows", () => {
  const now = new Date("2026-07-28T00:00:00Z");
  const period = buildPeriod(28, now);

  it("닉네임·단계·기간 내 운동 수·스트릭·마지막 활동을 채운다", () => {
    const rows = buildUserRows(
      [
        {
          userId: "u1",
          nickname: "오뎅끼",
          avatarUrl: "🧔",
          createdAt: new Date("2026-01-01T00:00:00Z"),
        },
      ],
      [
        s("u1", "completed", "2026-07-27T01:00:00Z"),
        s("u1", "completed", "2026-07-26T01:00:00Z"),
      ],
      new Map([["u1", 3000]]),
      period,
      now,
      "Asia/Seoul",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].nickname).toBe("오뎅끼");
    expect(rows[0].workoutsInPeriod).toBe(2);
    expect(rows[0].streakDays).toBe(2);
    expect(rows[0].stageName).toBe("일단하개"); // 3000 XP = Lv.11 = 3단계
    expect(rows[0].level).toBe(11);
    expect(rows[0].status).toBe("활성");
  });

  it("운동이 0건인 사용자도 표에 남긴다(휴면 발견이 목적)", () => {
    const rows = buildUserRows(
      [
        {
          userId: "u1",
          nickname: "휴면이",
          avatarUrl: null,
          createdAt: new Date("2026-01-01T00:00:00Z"),
        },
      ],
      [],
      new Map(),
      period,
      now,
      "Asia/Seoul",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].workoutsInPeriod).toBe(0);
    expect(rows[0].lastActiveAt).toBeNull();
    expect(rows[0].status).toBe("휴면");
    expect(rows[0].churnRisk).toBe("높음");
  });

  it("XP가 없으면 1레벨 1단계로 본다", () => {
    const rows = buildUserRows(
      [
        {
          userId: "u1",
          nickname: "새싹",
          avatarUrl: null,
          createdAt: new Date(),
        },
      ],
      [],
      new Map(),
      period,
      now,
      "Asia/Seoul",
    );
    expect(rows[0].level).toBe(1);
    expect(rows[0].stageName).toBe("개노답");
  });

  it("기간 밖 운동은 기간 내 운동 수에 안 들어간다", () => {
    const rows = buildUserRows(
      [
        {
          userId: "u1",
          nickname: "u",
          avatarUrl: null,
          createdAt: new Date("2026-01-01T00:00:00Z"),
        },
      ],
      [s("u1", "completed", "2026-01-05T01:00:00Z")],
      new Map(),
      period,
      now,
      "Asia/Seoul",
    );
    expect(rows[0].workoutsInPeriod).toBe(0);
    // 마지막 활동은 기간과 무관하게 전체에서 본다
    expect(rows[0].lastActiveAt).toEqual(new Date("2026-01-05T01:00:00Z"));
  });

  it("완료가 아닌 세션은 마지막 활동으로 치지 않는다", () => {
    const rows = buildUserRows(
      [
        {
          userId: "u1",
          nickname: "u",
          avatarUrl: null,
          createdAt: new Date("2026-01-01T00:00:00Z"),
        },
      ],
      [s("u1", "cancelled", null, "2026-07-27T01:00:00Z")],
      new Map(),
      period,
      now,
      "Asia/Seoul",
    );
    expect(rows[0].lastActiveAt).toBeNull();
    expect(rows[0].status).toBe("휴면");
  });
});
