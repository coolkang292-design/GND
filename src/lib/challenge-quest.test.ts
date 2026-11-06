import { describe, expect, it } from "vitest";
import { pickChallengeExercises, pickChallengeFocus } from "./challenge-quest";
import { dailyQuestCopy } from "./domain/daily-quest";
import type { CatalogExercise, UserGoal } from "./types";
import type { GoalType } from "./domain/goal-score";

function goal(type: GoalType, target = 10): UserGoal {
  return {
    id: type, user_id: "u", challenge_id: "c", group_id: "g", goal_type: type,
    target_value: target, unit: null, planned_days: 3, qualifier: null,
    created_at: "", updated_at: "",
  };
}

function ex(id: string, name: string, type: CatalogExercise["exercise_type"]): CatalogExercise {
  return {
    id, name, body_part: "가슴", exercise_type: type, measure: null,
    is_custom: false, created_by: null, created_at: "",
  };
}

describe("pickChallengeFocus — 챌린지 목표에 맞춘 오늘의 분류", () => {
  it("목표가 없으면 null — 기존 퀘스트(지난 운동·걷기·인터벌)", () => {
    expect(pickChallengeFocus(null, "2026-11-06")).toBeNull();
    expect(pickChallengeFocus([], "2026-11-06")).toBeNull();
  });

  it("종목을 안 가리는 목표(주 N회)뿐이면 null — 특정 분류를 권할 이유가 없다", () => {
    expect(pickChallengeFocus([goal("workout_days", 12)], "2026-11-06")).toBeNull();
  });

  it("목표가 한 분류뿐이면 매일 그 분류, 목표 이름을 말한다", () => {
    for (const d of ["2026-11-06", "2026-11-07", "2026-11-08"]) {
      expect(pickChallengeFocus([goal("cardio_distance", 20)], d)).toEqual({
        kind: "cardio",
        goalLabel: "유산소 거리 20km",
      });
    }
  });

  it("여러 분류면 날짜로 돌려가며 한 분류씩 — 매일 같은 것만 권하지 않는다", () => {
    const goals = [goal("weight_reps", 300), goal("cardio_distance", 20), goal("bodyweight_reps", 200)];
    const kinds = ["2026-11-06", "2026-11-07", "2026-11-08", "2026-11-09"].map(
      (d) => pickChallengeFocus(goals, d)!.kind,
    );
    expect(new Set(kinds)).toEqual(new Set(["weight", "cardio", "bodyweight"]));
    // 같은 날은 항상 같은 분류 (렌더마다 안 바뀐다)
    expect(pickChallengeFocus(goals, "2026-11-06")).toEqual(pickChallengeFocus(goals, "2026-11-06"));
  });

  it("타바타 목표는 인터벌로 제안한다", () => {
    expect(pickChallengeFocus([goal("tabata_count", 12)], "2026-11-06")).toEqual({
      kind: "interval",
      goalLabel: "인터벌 운동 횟수 12회",
    });
  });

  it("주 N회 목표와 섞여 있으면 세부 목표의 분류만 쓴다", () => {
    const f = pickChallengeFocus([goal("workout_days", 12), goal("volume", 5000)], "2026-11-06");
    expect(f).toEqual({ kind: "weight", goalLabel: "웨이트 총 운동량 5000kg" });
  });
});

describe("pickChallengeExercises — 담을 종목", () => {
  const catalog = [
    ex("1", "벤치프레스", "weight"),
    ex("2", "스쿼트", "weight"),
    ex("3", "랫풀다운", "weight"),
    ex("4", "러닝", "cardio"),
    ex("5", "사이클", "cardio"),
    ex("6", "푸시업", "bodyweight"),
    ex("7", "플랭크", "bodyweight"),
  ];

  it("분류가 맞는 종목만 담는다 — 아니면 챌린지 실적이 오르지 않는다", () => {
    const names = (kind: "weight" | "cardio" | "bodyweight") =>
      pickChallengeExercises(kind, catalog, []).map((c) => c.exercise_type);
    expect(new Set(names("weight"))).toEqual(new Set(["weight"]));
    expect(new Set(names("cardio"))).toEqual(new Set(["cardio"]));
    expect(new Set(names("bodyweight"))).toEqual(new Set(["bodyweight"]));
  });

  it("내가 해 온 그 분류의 종목을 먼저 담는다 (최근 순)", () => {
    const got = pickChallengeExercises("weight", catalog, ["랫풀다운", "러닝", "벤치프레스"]);
    expect(got.map((c) => c.name)).toEqual(["랫풀다운", "벤치프레스", "스쿼트"]);
  });

  it("분류별 개수 상한: 웨이트·맨몸 3개, 유산소 2개", () => {
    expect(pickChallengeExercises("weight", catalog, [])).toHaveLength(3);
    expect(pickChallengeExercises("cardio", catalog, [])).toHaveLength(2);
    expect(pickChallengeExercises("bodyweight", catalog, [])).toHaveLength(2);
  });

  it("이력도 추천 이름도 없으면 카탈로그의 그 분류 첫 종목들", () => {
    const small = [ex("a", "이상한 머신", "weight")];
    expect(pickChallengeExercises("weight", small, []).map((c) => c.name)).toEqual(["이상한 머신"]);
  });

  it("그 분류 종목이 카탈로그에 없으면 빈 목록 (호출부가 기존 퀘스트로 떨어진다)", () => {
    expect(pickChallengeExercises("cardio", [ex("1", "벤치프레스", "weight")], [])).toEqual([]);
  });

  it("같은 종목을 두 번 담지 않는다", () => {
    const got = pickChallengeExercises("weight", catalog, ["벤치프레스", "벤치프레스", " 벤치 프레스 "]);
    expect(got.filter((c) => c.name === "벤치프레스")).toHaveLength(1);
  });
});

describe("dailyQuestCopy — 챌린지 목표 반영", () => {
  const focus = { kind: "cardio" as const, goalLabel: "유산소 거리 20km" };

  it("어떤 목표를 겨냥했는지 말하고, 제목 꼬리가 분류에 맞는다", () => {
    const c = dailyQuestCopy({ kind: "repeat", todayKey: "2026-11-06", streak: 3, focus });
    expect(c.lead).toBe("챌린지 목표(유산소 거리 20km)에 맞춰 추천했어요");
    expect(c.headline).toEqual(["이 퀘스트 하나면", "오늘 유산소 완료"]);
  });

  it("담긴 뒤에는 '세팅해 뒀어요' + 종목 이름", () => {
    const c = dailyQuestCopy({
      kind: "repeat", todayKey: "2026-11-06", streak: 3, focus, applied: true, names: ["러닝"],
    });
    expect(c.lead).toBe("챌린지 목표(유산소 거리 20km)에 맞춰 세팅해 뒀어요 · 러닝");
  });

  it("내가 직접 짠 계획이면 챌린지 문구보다 '내 계획'이 먼저다", () => {
    const c = dailyQuestCopy({
      kind: "repeat", todayKey: "2026-11-06", streak: 3, focus, applied: true, planned: true, names: ["스쿼트"],
    });
    expect(c.lead).toBe("오늘 계획한 운동이에요 · 스쿼트");
  });

  it("인터벌 목표는 4분 인터벌을 추천한다", () => {
    const c = dailyQuestCopy({
      kind: "repeat", todayKey: "2026-11-06", streak: 0,
      focus: { kind: "interval", goalLabel: "인터벌 운동 횟수 12회" },
    });
    expect(c.lead).toContain("4분 인터벌");
    expect(c.headline[1]).toBe("오늘 인터벌 완료");
  });

  it("챌린지가 없으면 기존 문구 그대로 (회귀)", () => {
    const c = dailyQuestCopy({ kind: "repeat", todayKey: "2026-11-06", streak: 3 });
    expect(c.lead).toBe("지난 운동을 바탕으로 추천했어요");
    expect(c.headline[1]).toBe("오늘 운동 완료");
  });
});
