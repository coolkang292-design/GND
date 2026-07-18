import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { LocalExercise } from "@/lib/workout";
import { ExerciseCard } from "./exercise-card";

const exercise: LocalExercise = {
  key: "bench-press",
  name: "벤치 프레스",
  bodyPart: "가슴",
  exerciseType: "weight",
  measure: null,
  isCustom: false,
  sets: [
    {
      key: "set-1",
      weightKg: 60,
      reps: 8,
      distanceKm: 0,
      durationMin: 0,
      done: false,
    },
  ],
};

function renderCard({
  active = false,
  loadingLast = false,
}: {
  active?: boolean;
  loadingLast?: boolean;
} = {}) {
  return renderToStaticMarkup(
    <ExerciseCard
      exercise={exercise}
      index={0}
      active={active}
      loadingLast={loadingLast}
      onLoadLast={vi.fn()}
      onUpdateSet={vi.fn()}
      onToggleDone={vi.fn()}
      onAddSet={vi.fn()}
      onRemoveSet={vi.fn()}
      onRemoveExercise={vi.fn()}
    />,
  );
}

function loadLastButton(html: string): string {
  const button = html.match(
    /<button[^>]*aria-label="벤치 프레스 직전 기록 불러오기"[^>]*>/,
  );
  expect(button).not.toBeNull();
  return button![0];
}

describe("ExerciseCard 직전 기록 불러오기", () => {
  it("운동 시작 전에는 종목별 불러오기 버튼을 활성화한다", () => {
    const html = renderCard();

    expect(html).toContain("↻ 불러오기");
    expect(html).toContain('aria-label="벤치 프레스 직전 기록 불러오기"');
    expect(loadLastButton(html)).not.toContain('disabled=""');
  });

  it("운동 중에는 직전 기록 불러오기 버튼을 비활성화한다", () => {
    const html = renderCard({ active: true });

    expect(loadLastButton(html)).toContain('disabled=""');
  });

  it("직전 기록을 조회하는 동안 문구를 바꾸고 버튼을 비활성화한다", () => {
    const html = renderCard({ loadingLast: true });

    expect(html).toContain("불러오는 중…");
    expect(loadLastButton(html)).toContain('disabled=""');
  });
});
