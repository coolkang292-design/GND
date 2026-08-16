import { describe, expect, it } from "vitest";
import { emptyDraft, expireStaleSuggestion, type WorkoutDraft } from "@/lib/workout";

const TODAY = "2026-08-16";
const YESTERDAY = "2026-08-15";

function draftWith(over: Partial<WorkoutDraft>): WorkoutDraft {
  return {
    ...emptyDraft(),
    exercises: [
      {
        key: "e1",
        name: "걷기",
        bodyPart: "유산소",
        exerciseType: "cardio",
        measure: null,
        isCustom: false,
        sets: [
          { key: "s1", weightKg: 0, reps: 0, distanceKm: 0, durationMin: 0, done: false },
        ],
      },
    ],
    ...over,
  };
}

describe("expireStaleSuggestion — 자정에 제안을 지운다", () => {
  /**
   * ⚠️⚠️ **이 파일에서 가장 중요한 단언이다.**
   *
   * 스탬프가 없다는 것은 **사용자가 직접 담았다**는 뜻이다. 그걸 지우면
   * 어제 저녁에 짜 둔 운동이 아침에 사라진다. 제안만 지운다.
   */
  it("스탬프 없는 draft는 손대지 않는다", () => {
    const draft = draftWith({ suggestedForDayKey: null });
    expect(expireStaleSuggestion(draft, TODAY)).toBe(draft);
  });

  it("오늘 제안은 그대로 둔다", () => {
    const draft = draftWith({ suggestedForDayKey: TODAY });
    expect(expireStaleSuggestion(draft, TODAY)).toBe(draft);
  });

  it("어제 제안은 종목을 비운다", () => {
    const draft = draftWith({ suggestedForDayKey: YESTERDAY });
    const next = expireStaleSuggestion(draft, TODAY);
    expect(next.exercises).toHaveLength(0);
    expect(next.suggestedForDayKey).toBeNull();
  });

  /**
   * 운동 중에는 무슨 일이 있어도 손대지 않는다. 자정을 넘겨 운동하는 사람의
   * 세션이 진행 중인 채로 목록만 비면 화면과 서버가 어긋난다.
   */
  it("운동 중이면 어제 제안이라도 안 지운다", () => {
    const draft = draftWith({
      suggestedForDayKey: YESTERDAY,
      startedAtMs: 1_700_000_000_000,
    });
    expect(expireStaleSuggestion(draft, TODAY)).toBe(draft);
  });

  /**
   * ⚠️ `<` 비교가 아니라 `!==` 다. 기기 시계가 앞서 있거나 사용자가 타임존을
   *    옮기면 스탬프가 **미래**일 수 있는데, `<`면 그 draft가 영영 안 지워진다.
   */
  it("스탬프가 미래여도 오늘이 아니면 지운다", () => {
    const draft = draftWith({ suggestedForDayKey: "2026-08-20" });
    expect(expireStaleSuggestion(draft, TODAY).exercises).toHaveLength(0);
  });

  it("휴식 설정은 보존한다 — 제안과 무관한 사용자 설정이다", () => {
    const draft = draftWith({ suggestedForDayKey: YESTERDAY, restSeconds: 120 });
    expect(expireStaleSuggestion(draft, TODAY).restSeconds).toBe(120);
  });
});
