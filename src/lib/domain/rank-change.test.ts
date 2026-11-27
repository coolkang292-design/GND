import { describe, expect, it } from "vitest";
import { scoreParticipant, type ParticipantInput } from "./goal-score";
import {
  RANK_CHANGE_COOLDOWN_MS,
  filterByRanksSetting,
  planRankChange,
  rankLabel,
  waitsForPhoto,
  type RankRow,
} from "./rank-change";

const NOW = new Date("2026-11-15T03:00:00Z");
const row = (userId: string, rank: number): RankRow => ({ userId, rank });

const base = {
  challengeName: "5만원빵",
  now: NOW,
  lastNotifiedAt: {} as Record<string, string | null>,
};

describe("rankLabel", () => {
  it("단독 순위는 N위, 공동이면 공동 N위", () => {
    expect(rankLabel(2, [row("a", 1), row("b", 2), row("c", 3)])).toBe("2위");
    expect(rankLabel(1, [row("a", 1), row("b", 1), row("c", 3)])).toBe("공동 1위");
  });
});

describe("닉네임 — '○○님이 N위 됐어요' (사용자 결정 2026-11-15)", () => {
  const nicknames = { a: "에이", b: "비", c: "씨" };

  it("밀린 사람·그대로인 사람 제목은 올라간 사람 이름을 말하고, 올라간 본인은 '올랐어요'", () => {
    const plan = planRankChange({
      ...base,
      nicknames,
      prev: [row("a", 1), row("b", 2), row("c", 3)],
      next: [row("b", 1), row("a", 2), row("c", 3)],
    });
    const by = Object.fromEntries(plan.notifications.map((n) => [n.userId, n]));
    expect(by.a.title).toBe("📉 5만원빵 · 비님이 1위 됐어요"); // 밀림
    expect(by.a.body).toContain("지금 나는 2위예요");
    expect(by.c.title).toBe("📊 5만원빵 · 비님이 1위 됐어요"); // 그대로
    expect(by.c.body).toContain("3위 그대로");
    expect(by.b.title).toBe("📈 5만원빵 · 1위로 올랐어요"); // 본인
  });

  it("주인공은 새 순위가 가장 높은 사람, 같으면 더 많이 뛴 사람", () => {
    const plan = planRankChange({
      ...base,
      nicknames,
      // c: 3→2, b: 2→1 … 새 순위가 더 높은 b가 주인공
      prev: [row("a", 1), row("b", 2), row("c", 3)],
      next: [row("b", 1), row("c", 2), row("a", 3)],
    });
    const a = plan.notifications.find((n) => n.userId === "a")!;
    expect(a.title).toBe("📉 5만원빵 · 비님이 1위 됐어요");
  });

  it("공동 순위는 '공동 N위'", () => {
    const plan = planRankChange({
      ...base,
      nicknames,
      prev: [row("a", 1), row("b", 2)],
      next: [row("a", 1), row("b", 1)],
    });
    const a = plan.notifications.find((n) => n.userId === "a")!;
    expect(a.title).toBe("📊 5만원빵 · 비님이 공동 1위 됐어요");
  });

  it("닉네임이 없으면 이름 없는 옛 문구로 간다", () => {
    const plan = planRankChange({
      ...base,
      prev: [row("a", 1), row("b", 2)],
      next: [row("b", 1), row("a", 2)],
    });
    const a = plan.notifications.find((n) => n.userId === "a")!;
    expect(a.title).toBe("📉 5만원빵 · 2위로 밀렸어요");
  });
});

describe("위트 변형 — 어떤 씨앗이든 사실 어구는 그대로 (2026-11-15)", () => {
  const describeGoal = () => ({ label: "유산소 거리", unit: "km" });
  const aIn: ParticipantInput = {
    userId: "a",
    goals: [{ type: "cardio_distance", target: 10, actual: 8 }],
    workoutDays: 4,
    plannedDays: 5,
  };
  const bIn: ParticipantInput = { ...aIn, userId: "b", goals: [{ type: "cardio_distance", target: 10, actual: 6 }] };

  it("씨앗 0~15 전부: 밀림=지금 나는 2위예요+탈환, 오름=2위 → 1위, 그대로=3위 그대로", () => {
    const bodies = new Set<string>();
    for (let seed = 0; seed < 16; seed += 1) {
      const plan = planRankChange({
        ...base,
        variantSeed: seed,
        nicknames: { a: "에이", b: "비", c: "씨" },
        prev: [row("b", 1), row("a", 2), row("c", 3)],
        next: [row("a", 1), row("b", 2), row("c", 3)],
        inputs: { a: aIn, b: bIn, c: { ...aIn, userId: "c" } },
        describeGoal,
      });
      const by = Object.fromEntries(plan.notifications.map((n) => [n.userId, n]));
      expect(by.b.body).toContain("지금 나는 2위예요");
      expect(by.b.body).toContain("다시 1위를 탈환할 수 있어요");
      expect(by.a.body).toContain("2위 → 1위");
      expect(by.c.body).toContain("3위 그대로");
      bodies.add(by.b.body);
    }
    // 변형이 실제로 돈다(같은 말만 반복하면 잔소리가 된다)
    expect(bodies.size).toBeGreaterThan(3);
  });

  it("같은 씨앗이면 같은 문구 — 재현 가능", () => {
    const run = () =>
      planRankChange({
        ...base,
        variantSeed: 7,
        prev: [row("b", 1), row("a", 2)],
        next: [row("a", 1), row("b", 2)],
      }).notifications.map((n) => n.body);
    expect(run()).toEqual(run());
  });
});

describe("waitsForPhoto — 사진 필수 방은 사진이 와야 잰다 (2026-11-26 사고)", () => {
  it("사진 필수 방 + 이 운동에 사진이 아직 없으면 기다린다(재지 않는다)", () => {
    expect(waitsForPhoto({ photoRequired: true, sessionHasPhoto: false })).toBe(true);
  });
  it("사진이 이미 있거나, 사진이 필요 없는 방이면 바로 잰다", () => {
    expect(waitsForPhoto({ photoRequired: true, sessionHasPhoto: true })).toBe(false);
    expect(waitsForPhoto({ photoRequired: false, sessionHasPhoto: false })).toBe(false);
    expect(waitsForPhoto({ photoRequired: null, sessionHasPhoto: false })).toBe(false);
  });
});

describe("filterByRanksSetting — 순위 알림을 끈 사람", () => {
  const list = [{ userId: "a" }, { userId: "b" }, { userId: "c" }];

  it("ranks=false인 사람만 뺀다", () => {
    const out = filterByRanksSetting(list, [{ userId: "b", ranks: false }]);
    expect(out.map((n) => n.userId)).toEqual(["a", "c"]);
  });

  it("설정 행이 없거나 ranks가 true/null이면 켜짐 — 보낸다 (0011 관례)", () => {
    expect(filterByRanksSetting(list, [])).toHaveLength(3);
    const out = filterByRanksSetting(list, [
      { userId: "a", ranks: true },
      { userId: "b", ranks: null },
    ]);
    expect(out).toHaveLength(3);
  });
});

describe("planRankChange", () => {
  it("스냅샷이 없으면(첫 계산) 알림 없이 기준선만 저장한다", () => {
    const plan = planRankChange({
      ...base,
      prev: [],
      next: [row("a", 1), row("b", 2)],
    });
    expect(plan.notifications).toEqual([]);
    expect(plan.baseline).toBe(true);
    expect(plan.snapshot).toEqual([row("a", 1), row("b", 2)]);
  });

  it("아무도 안 바뀌었으면 알림 0건", () => {
    const plan = planRankChange({
      ...base,
      prev: [row("a", 1), row("b", 2)],
      next: [row("a", 1), row("b", 2)],
    });
    expect(plan.notifications).toEqual([]);
    expect(plan.baseline).toBe(false);
  });

  it("한 명이라도 바뀌면 참가자 전원에게 1건씩 — 바뀐 사람은 from→to", () => {
    const plan = planRankChange({
      ...base,
      prev: [row("a", 1), row("b", 2), row("c", 3)],
      next: [row("b", 1), row("a", 2), row("c", 3)],
    });
    expect(plan.notifications).toHaveLength(3);
    const byUser = Object.fromEntries(plan.notifications.map((n) => [n.userId, n]));
    expect(byUser.b.title).toBe("📈 5만원빵 · 1위로 올랐어요");
    expect(byUser.b.body).toContain("2위 → 1위");
    expect(byUser.a.title).toBe("📉 5만원빵 · 2위로 밀렸어요");
    expect(byUser.a.body).toContain("지금 나는 2위예요");
  });

  it("순위가 그대로인 사람에게는 '순위가 바뀌었어요 · N위 그대로'", () => {
    const plan = planRankChange({
      ...base,
      prev: [row("a", 1), row("b", 2), row("c", 3)],
      next: [row("b", 1), row("a", 2), row("c", 3)],
    });
    const c = plan.notifications.find((n) => n.userId === "c")!;
    expect(c.title).toBe("📊 5만원빵 · 순위가 바뀌었어요");
    expect(c.body).toContain("3위 그대로");
  });

  it("쿨다운 안에 알림받은 사람은 건너뛰되 스냅샷은 최신으로 갱신한다", () => {
    const recent = new Date(NOW.getTime() - RANK_CHANGE_COOLDOWN_MS + 60_000).toISOString();
    const plan = planRankChange({
      ...base,
      lastNotifiedAt: { a: recent },
      prev: [row("a", 1), row("b", 2)],
      next: [row("b", 1), row("a", 2)],
    });
    expect(plan.notifications.map((n) => n.userId)).toEqual(["b"]);
    expect(plan.snapshot).toEqual([row("b", 1), row("a", 2)]);
    // ⚠️ 건너뛴 사람의 '알려준 순위'는 바꾸지 않는다 — 쿨다운이 끝나면 전해야 하므로 (2026-11-26 사고)
    expect(plan.told).toEqual([row("b", 1)]);
  });

  describe("알려준 순위(told) — 쿨다운에 막힌 변화를 잃지 않는다 (2026-11-26 08:01 사고)", () => {
    const old = new Date(NOW.getTime() - RANK_CHANGE_COOLDOWN_MS - 1000).toISOString();
    const recent = new Date(NOW.getTime() - 60_000).toISOString();

    it("쿨다운 중 바뀐 순위는 다음 계산 때 '마지막으로 알려준 순위'와 비교해 전한다", () => {
      // 08:01:14 전원에게 "오뎅 1위"를 알렸다 → 08:01:28 사진 반영으로 낭만 1위 (쿨다운이라 보류)
      const held = planRankChange({
        ...base,
        nicknames: { o: "오뎅", n: "낭만", s: "스칼" },
        lastNotifiedAt: { o: recent, n: recent, s: recent },
        prev: [row("o", 1), row("n", 2), row("s", 3)],
        told: { o: 1, n: 2, s: 3 },
        next: [row("n", 1), row("o", 2), row("s", 3)],
      });
      expect(held.notifications).toEqual([]);
      expect(held.told).toEqual([]);
      expect(held.snapshot).toEqual([row("n", 1), row("o", 2), row("s", 3)]);

      // 쿨다운이 끝난 뒤 아무 일(다른 사람 운동 등)로 다시 잴 때 — 순위 자체는 그 사이 안 바뀌었다
      const later = planRankChange({
        ...base,
        nicknames: { o: "오뎅", n: "낭만", s: "스칼" },
        lastNotifiedAt: { o: old, n: old, s: old },
        prev: held.snapshot,
        told: { o: 1, n: 2, s: 3 },
        next: [row("n", 1), row("o", 2), row("s", 3)],
      });
      const by = Object.fromEntries(later.notifications.map((x) => [x.userId, x]));
      expect(Object.keys(by).sort()).toEqual(["n", "o"]); // 스칼은 자기 순위도, 새 변동도 없다
      expect(by.n.title).toBe("📈 5만원빵 · 1위로 올랐어요");
      expect(by.n.body).toContain("2위 → 1위");
      // '방금 일어난 일'이 아니므로 "○○님이 N위 됐어요"라고 말하지 않는다
      expect(by.o.title).toBe("📉 5만원빵 · 2위로 밀렸어요");
      expect(by.o.type).toBe("rank_drop");
      expect(later.told).toEqual([row("n", 1), row("o", 2)]);
    });

    it("새 변동이 있으면 '알려준 순위'를 기준으로 from→to를 말한다", () => {
      const plan = planRankChange({
        ...base,
        prev: [row("a", 2), row("b", 1), row("c", 3)], // 마지막 계산
        told: { a: 1, b: 2, c: 3 }, // a·b는 예전 순위만 들었다
        next: [row("c", 1), row("a", 2), row("b", 3)],
      });
      const by = Object.fromEntries(plan.notifications.map((x) => [x.userId, x]));
      expect(by.a.body).toContain("지금 나는 2위예요"); // 들은 1위 → 지금 2위 = 밀림
      expect(by.a.type).toBe("rank_drop");
      expect(by.b.title).toBe("📉 5만원빵 · 3위로 밀렸어요");
      expect(by.c.body).toContain("3위 → 1위");
    });

    it("새 변동도 없고 모두 들은 순위 그대로면 알림 0건", () => {
      const plan = planRankChange({
        ...base,
        lastNotifiedAt: { a: old, b: old },
        prev: [row("a", 1), row("b", 2)],
        told: { a: 1, b: 2 },
        next: [row("a", 1), row("b", 2)],
      });
      expect(plan.notifications).toEqual([]);
      expect(plan.told).toEqual([]);
    });

    it("told가 없는 옛 행은 마지막 계산 순위를 들은 것으로 본다(0152 이전 호환)", () => {
      const plan = planRankChange({
        ...base,
        prev: [row("a", 1), row("b", 2)],
        told: { a: null, b: undefined },
        next: [row("b", 1), row("a", 2)],
      });
      expect(plan.notifications.map((x) => x.userId).sort()).toEqual(["a", "b"]);
    });
  });

  it("쿨다운이 지났으면 다시 보낸다", () => {
    const old = new Date(NOW.getTime() - RANK_CHANGE_COOLDOWN_MS - 1000).toISOString();
    const plan = planRankChange({
      ...base,
      lastNotifiedAt: { a: old },
      prev: [row("a", 1), row("b", 2)],
      next: [row("b", 1), row("a", 2)],
    });
    expect(plan.notifications.map((n) => n.userId).sort()).toEqual(["a", "b"]);
  });

  it("새로 합류한 사람(이전 스냅샷에 없음)만으로는 알림을 만들지 않는다", () => {
    const plan = planRankChange({
      ...base,
      prev: [row("a", 1), row("b", 2)],
      next: [row("a", 1), row("b", 2), row("c", 3)],
    });
    expect(plan.notifications).toEqual([]);
    expect(plan.snapshot).toHaveLength(3);
  });

  it("공동 순위는 '공동 N위'로 적는다", () => {
    const plan = planRankChange({
      ...base,
      prev: [row("a", 1), row("b", 2)],
      next: [row("a", 1), row("b", 1)],
    });
    const b = plan.notifications.find((n) => n.userId === "b")!;
    expect(b.title).toBe("📈 5만원빵 · 공동 1위로 올랐어요");
  });

  describe("다시 추월하려면 — 제안 문구", () => {
    const describeGoal = (type: string) =>
      type === "cardio_distance"
        ? { label: "유산소 거리", unit: "km" }
        : { label: "운동일", unit: "일" };

    // a(위): 달성 80%·참여 높음 / b(밀린 사람): 달성 60%
    const aInput: ParticipantInput = {
      userId: "a",
      goals: [{ type: "cardio_distance", target: 10, actual: 8 }],
      workoutDays: 4,
      plannedDays: 5,
    };
    const bInput: ParticipantInput = {
      userId: "b",
      goals: [{ type: "cardio_distance", target: 10, actual: 6 }],
      workoutDays: 4,
      plannedDays: 5,
    };

    it("목표를 채우면 실제로 앞서는 경우 남은 양을 올림해서 말한다", () => {
      const plan = planRankChange({
        ...base,
        prev: [row("b", 1), row("a", 2)],
        next: [row("a", 1), row("b", 2)],
        inputs: { a: aInput, b: bInput },
        describeGoal,
      });
      const b = plan.notifications.find((n) => n.userId === "b")!;
      expect(b.body).toContain("지금 나는 2위예요");
      expect(b.body).toContain("유산소 거리 4km 더 하면 다시 1위를 탈환할 수 있어요");
    });

    it("그 제안을 실제로 하면 정말 위 사람의 종합점수를 넘는다 (거짓 제안 금지)", () => {
      const done = { ...bInput, goals: [{ ...bInput.goals[0], actual: 10 }] };
      expect(scoreParticipant(done).overall).toBeGreaterThan(
        scoreParticipant(aInput).overall,
      );
    });

    it("목표 하나로는 못 넘으면 '운동 하루만 더'를 곁들인다", () => {
      const strongA: ParticipantInput = {
        ...aInput,
        goals: [{ type: "cardio_distance", target: 10, actual: 10 }],
        workoutDays: 4,
      };
      const weakB: ParticipantInput = {
        userId: "b",
        goals: [{ type: "cardio_distance", target: 10, actual: 9 }],
        workoutDays: 4,
        plannedDays: 5,
      };
      const plan = planRankChange({
        ...base,
        prev: [row("b", 1), row("a", 2)],
        next: [row("a", 1), row("b", 2)],
        inputs: { a: strongA, b: weakB },
        describeGoal,
      });
      // a = 100×0.8 + 80×0.2 + 3 = 99. b가 목표만 채우면 똑같이 99(동점 → 못 넘음),
      // 하루 더하면 참여 100% → 103이라 넘는다.
      const b = plan.notifications.find((n) => n.userId === "b")!;
      expect(b.body).toContain("채우고 운동 하루 더 하면 다시 1위를 탈환");
    });

    it("무엇을 해도 못 넘으면 일반 문구로 대체한다", () => {
      const unreachable: ParticipantInput = {
        ...aInput,
        goals: [{ type: "cardio_distance", target: 10, actual: 10 }],
        workoutDays: 5,
      };
      const hopeless: ParticipantInput = {
        userId: "b",
        goals: [{ type: "cardio_distance", target: 10, actual: 0 }],
        workoutDays: 0,
        plannedDays: 5,
      };
      const plan = planRankChange({
        ...base,
        prev: [row("b", 1), row("a", 2)],
        next: [row("a", 1), row("b", 2)],
        inputs: { a: unreachable, b: hopeless },
        describeGoal,
      });
      const b = plan.notifications.find((n) => n.userId === "b")!;
      expect(b.body).toContain("다시 1위를 탈환할 수 있어요");
    });

    it("이전 순위를 못 되찾으면 되찾을 수 있는 가장 높은 순위까지만 말한다 (거짓 '탈환' 금지)", () => {
      const mk = (id: string, actual: number, days: number): ParticipantInput => ({
        userId: id,
        goals: [{ type: "cardio_distance", target: 10, actual }],
        workoutDays: days,
        plannedDays: 5,
      });
      const plan = planRankChange({
        ...base,
        prev: [row("b", 1), row("a", 2), row("c", 3)],
        next: [row("a", 1), row("c", 2), row("b", 3)],
        inputs: { a: mk("a", 10, 5), c: mk("c", 8, 4), b: mk("b", 2, 2) },
        describeGoal,
      });
      const b = plan.notifications.find((n) => n.userId === "b")!;
      // 1위(a=103점)는 b가 아무리 해도 못 넘는다 → '탈환'이라 말하면 안 된다
      expect(b.body).not.toContain("탈환");
      expect(b.body).toContain("2위까지 올라갈 수 있어요");
    });

    it("밀린 사람만 rank_drop + 목표 종류 meta, 나머지는 rank_change + meta 없음", () => {
      const plan = planRankChange({
        ...base,
        prev: [row("b", 1), row("a", 2), row("c", 3)],
        next: [row("a", 1), row("b", 2), row("c", 3)],
        inputs: { a: aInput, b: bInput },
        describeGoal,
      });
      const by = Object.fromEntries(plan.notifications.map((n) => [n.userId, n]));
      expect(by.b.type).toBe("rank_drop");
      expect(by.b.meta).toEqual({ goal_type: "cardio_distance" });
      expect(by.a.type).toBe("rank_change"); // 올라감 — 세팅 없음
      expect(by.a.meta).toBeNull();
      expect(by.c.type).toBe("rank_change"); // 그대로 — 세팅 없음
      expect(by.c.meta).toBeNull();
    });

    it("제안을 못 만들면 rank_drop이어도 goal_type은 null이다(평소 제안으로 대체)", () => {
      const plan = planRankChange({
        ...base,
        prev: [row("b", 1), row("a", 2)],
        next: [row("a", 1), row("b", 2)],
      });
      const b = plan.notifications.find((n) => n.userId === "b")!;
      expect(b.type).toBe("rank_drop");
      expect(b.meta).toEqual({ goal_type: null });
    });

    it("제안에 위 사람의 닉네임·점수를 넣지 않는다", () => {
      const plan = planRankChange({
        ...base,
        prev: [row("b", 1), row("a", 2)],
        next: [row("a", 1), row("b", 2)],
        inputs: { a: aInput, b: bInput },
        describeGoal,
      });
      const b = plan.notifications.find((n) => n.userId === "b")!;
      expect(b.body).not.toMatch(/점|님/);
    });
  });

  it("notifiedUserIds는 실제 발송 대상과 같다", () => {
    const plan = planRankChange({
      ...base,
      prev: [row("a", 1), row("b", 2)],
      next: [row("b", 1), row("a", 2)],
    });
    expect(plan.notifiedUserIds.sort()).toEqual(["a", "b"]);
  });
});
