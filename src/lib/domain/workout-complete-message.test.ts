import { describe, expect, it } from "vitest";
import { workoutCompletionMessage } from "./workout-complete-message";

/**
 * ② 마지막 세트를 끝냈을 때의 안내 + 응원 (2026-08-04, 사용자 요청).
 *
 * ⚠️ **렌더 중 랜덤을 쓰지 않는다.** `streak-messages.ts`가 같은 이유로
 * `pickByDay`를 쓴다 — 재렌더마다 문구가 바뀌면 화면이 덜컹거리고,
 * 서버·클라이언트 문구가 갈리면 하이드레이션이 어긋난다.
 */
describe("workoutCompletionMessage", () => {
  it("오늘 계획한 운동을 다 했다고 알린다", () => {
    const message = workoutCompletionMessage({ todayKey: "2026-08-04" });

    expect(message.headline).toContain("계획한 운동");
  });

  it("응원 문구를 함께 준다", () => {
    const message = workoutCompletionMessage({ todayKey: "2026-08-04" });

    expect(message.cheer.length).toBeGreaterThan(0);
    expect(message.cheer).not.toBe(message.headline);
  });

  it("같은 날에는 같은 문구가 나온다 — 재렌더마다 바뀌면 안 된다", () => {
    const a = workoutCompletionMessage({ todayKey: "2026-08-04" });
    const b = workoutCompletionMessage({ todayKey: "2026-08-04" });

    expect(a).toEqual(b);
  });

  it("날짜가 다르면 응원 문구가 돌아간다", () => {
    const days = [
      "2026-08-01",
      "2026-08-02",
      "2026-08-03",
      "2026-08-04",
      "2026-08-05",
      "2026-08-06",
      "2026-08-07",
      "2026-08-08",
    ];
    const cheers = new Set(
      days.map((todayKey) => workoutCompletionMessage({ todayKey }).cheer),
    );

    // 며칠에 걸쳐 최소 두 가지 이상은 나와야 로테이션이라 할 수 있다
    expect(cheers.size).toBeGreaterThan(1);
  });

  it("빈 날짜 문자열에도 문구를 돌려준다 — 화면이 비지 않아야 한다", () => {
    const message = workoutCompletionMessage({ todayKey: "" });

    expect(message.headline.length).toBeGreaterThan(0);
    expect(message.cheer.length).toBeGreaterThan(0);
  });
});
