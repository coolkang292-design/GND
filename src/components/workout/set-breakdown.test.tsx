import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SetBreakdown, type BreakdownExercise } from "./set-breakdown";

/**
 * 지난 기록 상세(④)와 계획 상세(⑥)가 함께 쓰는 표시 컴포넌트.
 *
 * 기록에는 완료 여부가 있고 계획에는 없다. **플래그로 나누지 않고 데이터로
 * 나눈다** — 세트에 `done`이 없으면 계획이므로 완료 표시를 그리지 않는다.
 */
const weight: BreakdownExercise = {
  name: "벤치 프레스",
  exerciseType: "weight",
  measure: null,
  sets: [
    { weightKg: 60, reps: 8, distanceKm: 0, durationMin: 0, done: true },
    { weightKg: 60, reps: 6, distanceKm: 0, durationMin: 0, done: false },
  ],
};

const render = (exercises: BreakdownExercise[]) =>
  renderToStaticMarkup(<SetBreakdown exercises={exercises} />);

describe("SetBreakdown", () => {
  it("종목명과 세트별 수량을 그린다", () => {
    const html = render([weight]);

    expect(html).toContain("벤치 프레스");
    expect(html).toContain("60kg 8회");
    expect(html).toContain("60kg 6회");
  });

  it("완료한 세트와 미완료 세트를 구분해 알린다", () => {
    const html = render([weight]);

    expect(html).toContain('aria-label="1세트 완료"');
    expect(html).toContain('aria-label="2세트 미완료"');
  });

  it("done이 없는 세트(계획)에는 완료 표시를 그리지 않는다", () => {
    const html = render([
      {
        name: "스쿼트",
        exerciseType: "weight",
        measure: null,
        sets: [{ weightKg: 80, reps: 5, distanceKm: 0, durationMin: 0 }],
      },
    ]);

    expect(html).toContain("80kg 5회");
    expect(html).not.toContain("세트 완료");
    expect(html).not.toContain("세트 미완료");
  });

  it("유형이 섞여 있어도 종목마다 자기 규칙으로 그린다", () => {
    const html = render([
      weight,
      {
        name: "러닝",
        exerciseType: "cardio",
        measure: null,
        sets: [{ weightKg: 0, reps: 0, distanceKm: 3.5, durationMin: 30, done: true }],
      },
      {
        name: "플랭크",
        exerciseType: "bodyweight",
        measure: "time",
        sets: [{ weightKg: 0, reps: 0, distanceKm: 0, durationMin: 2, done: true }],
      },
    ]);

    expect(html).toContain("60kg 8회");
    expect(html).toContain("3.5km 30분");
    expect(html).toContain("2분");
  });

  it("종목 순서를 받은 그대로 유지한다 — sort_order가 이미 정렬돼 온다", () => {
    const html = render([
      { ...weight, name: "첫번째" },
      { ...weight, name: "두번째" },
    ]);

    expect(html.indexOf("첫번째")).toBeLessThan(html.indexOf("두번째"));
  });

  it("세트가 하나도 없는 종목도 이름은 보여준다", () => {
    const html = render([
      { name: "빈 종목", exerciseType: "weight", measure: null, sets: [] },
    ]);

    expect(html).toContain("빈 종목");
  });

  it("종목이 하나도 없으면 저장된 세트가 없다고 알린다", () => {
    expect(render([])).toContain("세트 기록이 없어요");
  });
});
