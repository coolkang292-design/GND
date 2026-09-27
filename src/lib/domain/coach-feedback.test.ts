import { describe, expect, it } from "vitest";
import {
  BASELINE_MESSAGE,
  buildCoachInput,
  coachSystemPrompt,
  parseModelJson,
  sanitizeCoachFeedback,
} from "./coach-feedback";
import {
  analyzeWorkout,
  type AnalysisExercise,
  type AnalysisSet,
} from "./workout-analysis";

function sets(weightKg: number, reps: number[]): AnalysisSet[] {
  return reps.map((r) => ({
    weightKg,
    reps: r,
    durationSec: 0,
    distanceM: 0,
    done: true,
    effort: null,
    clientCompletedAtMs: null,
  }));
}

const ex = (name: string, w: number, reps: number[]): AnalysisExercise => ({
  name,
  type: "weight",
  measure: null,
  sets: sets(w, reps),
});

function progressAnalysis(flags: ("pain" | "short_time")[] = []) {
  return analyzeWorkout({
    session: {
      durationMinutes: 64,
      exercises: [
        ex("덤벨 숄더 프레스", 14, [10, 10, 9, 9]),
        ex("벤치프레스", 60, [12, 12, 12]),
      ],
    },
    history: [
      {
        completedAtMs: 1,
        exercises: [
          ex("덤벨 숄더 프레스", 14, [10, 10, 8, 8]),
          ex("벤치프레스", 60, [12, 11, 10]),
        ],
      },
    ],
    goal: "hypertrophy",
    sessionEffort: "light",
    flags,
  });
}

const goodOutput = {
  summary: "같은 무게에서 반복이 늘었어요.",
  primary_result: { type: "progress", message: "숄더프레스 총 반복이 2회 늘었습니다." },
  wins: [{ exercise: "덤벨숄더프레스", message: "14kg에서 총 38회" }],
  cautions: [],
  next_actions: [
    { exercise: "덤벨 숄더 프레스", action: "maintain", message: "14kg 유지, 40회를 노리세요." },
  ],
  coach_message: "좋은 흐름입니다. 다음에도 같은 무게로 반복을 채워 보세요.",
};

describe("buildCoachInput — AI에 보내는 것", () => {
  it("판정과 수치만 싣고 신원 정보는 싣지 않는다", () => {
    const input = buildCoachInput(progressAnalysis(), {
      primaryGoal: "hypertrophy",
      experienceLevel: "intermediate",
      sessionsPerWeek: 4,
      sessionMinutes: 60,
      trainingLocation: "gym",
      priorityBodyParts: ["어깨"],
      limitationBodyParts: ["허리" as never],
      currentWeightKg: 80,
      targetWeightKg: 75,
    });
    const json = JSON.stringify(input);
    expect(input.primary_result).toBe("progress");
    expect(input.goal?.primary_goal).toBe("hypertrophy");
    // 불편 부위·체중은 판단에 쓰지 않으므로 보내지 않는다
    expect(json).not.toContain("허리");
    expect(json).not.toContain("current_weight");
    expect(json).not.toMatch(/user_?id|nickname|email|session_?id/i);
    const shoulder = input.exercises.find((e) => e.exercise === "덤벨 숄더 프레스");
    expect(shoulder?.changes.reps).toBe(2);
    expect(shoulder?.previous?.reps).toEqual([10, 10, 8, 8]);
  });

  it("통증은 '있었다'만 보내고 증량 차단을 명시한다", () => {
    const input = buildCoachInput(progressAnalysis(["pain"]), null);
    expect(input.progression_blocked).toBe(true);
    expect(input.user_feedback.pain_reported).toBe(true);
    expect(input.goal).toBeNull();
  });

  it("종목은 6개까지만, 기준선이 아닌 것을 먼저 싣는다", () => {
    const many = Array.from({ length: 9 }, (_, i) => ex(`종목${i}`, 10, [10]));
    const analysis = analyzeWorkout({
      session: { durationMinutes: 30, exercises: many },
      history: [{ completedAtMs: 1, exercises: [ex("종목8", 10, [8])] }],
      goal: null,
      sessionEffort: null,
      flags: [],
    });
    const input = buildCoachInput(analysis, null);
    expect(input.exercises).toHaveLength(6);
    expect(input.exercises[0].exercise).toBe("종목8");
  });
});

describe("coachSystemPrompt", () => {
  it("JSON 모드 조건(‘json’ 단어와 예시)을 만족한다", () => {
    const prompt = coachSystemPrompt();
    expect(prompt.toLowerCase()).toContain("json");
    expect(prompt).toContain('"next_actions"');
    expect(prompt).toContain(BASELINE_MESSAGE);
  });
});

describe("parseModelJson", () => {
  it("코드 펜스로 감싸 와도 읽는다", () => {
    expect(parseModelJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });
  it("빈 응답·깨진 JSON은 null", () => {
    expect(parseModelJson("")).toBeNull();
    expect(parseModelJson("{oops")).toBeNull();
    expect(parseModelJson("[1,2]")).toBeNull();
  });
});

describe("sanitizeCoachFeedback — AI 결과를 그대로 믿지 않는다", () => {
  it("정상 응답은 통과하고 종목 이름을 정규 이름으로 맞춘다", () => {
    const result = sanitizeCoachFeedback(goodOutput, progressAnalysis());
    expect(result).not.toBeNull();
    expect(result!.wins[0].exercise).toBe("덤벨 숄더 프레스");
    expect(result!.next_actions).toHaveLength(1);
  });

  it("AI가 판정을 바꿔 말하면 코드 판정으로 덮는다", () => {
    const result = sanitizeCoachFeedback(
      { ...goodOutput, primary_result: { type: "fatigue_signal", message: "피곤해요" } },
      progressAnalysis(),
    );
    expect(result!.primary_result.type).toBe("progress");
  });

  it("기준선이면 정해진 문장을 쓴다 — 없는 향상을 말하지 못한다", () => {
    const analysis = analyzeWorkout({
      session: { durationMinutes: 30, exercises: [ex("벤치프레스", 60, [10])] },
      history: [],
      goal: null,
      sessionEffort: null,
      flags: [],
    });
    const result = sanitizeCoachFeedback(
      { ...goodOutput, primary_result: { type: "progress", message: "지난번보다 좋아졌어요!" } },
      analysis,
    );
    expect(result!.primary_result).toEqual({ type: "baseline", message: BASELINE_MESSAGE });
  });

  it("목록에 없는 종목 이름은 null로 바꾼다", () => {
    const result = sanitizeCoachFeedback(
      { ...goodOutput, wins: [{ exercise: "데드리프트", message: "좋아요" }] },
      progressAnalysis(),
    );
    expect(result!.wins[0].exercise).toBeNull();
  });

  it("코드가 정한 행동과 다른 다음 행동은 버린다", () => {
    const result = sanitizeCoachFeedback(
      {
        ...goodOutput,
        next_actions: [
          { exercise: "덤벨 숄더 프레스", action: "increase_candidate", message: "무게를 올리세요" },
          { exercise: "벤치프레스", action: "increase_candidate", message: "62.5kg 도전" },
        ],
      },
      progressAnalysis(),
    );
    // 숄더프레스의 코드 판정은 maintain, 벤치는 목표 달성+가벼움이라 increase_candidate
    expect(result!.next_actions).toEqual([
      { exercise: "벤치프레스", action: "increase_candidate", message: "62.5kg 도전" },
    ]);
  });

  it("종목 없는 다음 행동은 증량·감량 후보가 될 수 없다", () => {
    const result = sanitizeCoachFeedback(
      {
        ...goodOutput,
        next_actions: [{ exercise: null, action: "increase_candidate", message: "전체 증량" }],
      },
      progressAnalysis(),
    );
    expect(result!.next_actions).toEqual([]);
  });

  it("통증 신고 세션에서 증량을 말하는 문장은 안전 문장으로 바꾼다", () => {
    const result = sanitizeCoachFeedback(
      {
        ...goodOutput,
        coach_message: "잘했어요. 다음엔 벤치프레스 무게를 올려 보세요.",
        wins: [{ exercise: null, message: "증량 준비 완료" }],
      },
      progressAnalysis(["pain"]),
    );
    expect(result!.coach_message).not.toMatch(/올려|증량/);
    expect(result!.wins).toEqual([]);
  });

  it("목록은 2개, 문장은 길이 상한으로 자른다", () => {
    const long = "가".repeat(500);
    const result = sanitizeCoachFeedback(
      {
        ...goodOutput,
        summary: long,
        wins: [1, 2, 3].map(() => ({ exercise: null, message: "좋아요" })),
      },
      progressAnalysis(),
    );
    expect(result!.summary.length).toBeLessThanOrEqual(140);
    expect(result!.wins).toHaveLength(2);
  });

  it("요약이나 코치 한마디가 없으면 실패로 본다", () => {
    expect(sanitizeCoachFeedback({ ...goodOutput, summary: "" }, progressAnalysis())).toBeNull();
    expect(
      sanitizeCoachFeedback({ ...goodOutput, coach_message: 3 }, progressAnalysis()),
    ).toBeNull();
    expect(sanitizeCoachFeedback("text", progressAnalysis())).toBeNull();
  });
});
