import { describe, expect, it } from "vitest";
import {
  COMPLETION_HERO_IMAGES,
  completionHero,
  lastSetCheer,
  pickCompletionHeroIndex,
  workoutCompletionMessage,
} from "./workout-complete-message";

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

/**
 * 마지막 세트를 **하기 직전**의 응원 (2026-08-09 사용자 지시).
 *
 * 2026-08-04 요구는 원래 "마지막 세트를 **할 때** 응원"이었는데 구현이 응원을
 * 완료 화면에만 뒀다. 요구와 구현이 갈린 채로, 테스트가 완료 화면만 단언해서
 * 드러나지 않았다. 아래 단언들이 그 구멍을 막는다.
 */
describe("lastSetCheer — 마지막 세트 직전", () => {
  const DAYS = [
    "2026-08-01",
    "2026-08-02",
    "2026-08-03",
    "2026-08-04",
    "2026-08-05",
    "2026-08-06",
    "2026-08-07",
    "2026-08-08",
    "2026-08-09",
  ];

  it("완료 응원과 **다른** 문구다 — 완료 문구는 전부 과거형이라 여기 못 쓴다", () => {
    for (const todayKey of DAYS) {
      expect(lastSetCheer({ todayKey })).not.toBe(
        workoutCompletionMessage({ todayKey }).cheer,
      );
    }
  });

  it("완료 문구의 과거형 표현을 쓰지 않는다", () => {
    // "다 했어요"·"안 남기셨네요"류가 아직 안 한 세트 앞에 뜨면 거짓말이 된다.
    const past = ["남기셨네요", "완납", "채우셨습니다", "끝내는 사람"];
    for (const todayKey of DAYS) {
      const cheer = lastSetCheer({ todayKey });
      for (const word of past) expect(cheer).not.toContain(word);
    }
  });

  it("같은 날에는 같은 문구다 — 재렌더마다 바뀌면 안 된다", () => {
    expect(lastSetCheer({ todayKey: "2026-08-09" })).toBe(
      lastSetCheer({ todayKey: "2026-08-09" }),
    );
  });

  it("날짜가 다르면 돌아간다", () => {
    const seen = new Set(DAYS.map((todayKey) => lastSetCheer({ todayKey })));

    // 9일치에서 최소 3가지는 나와야 로테이션이라 할 수 있다.
    expect(seen.size).toBeGreaterThanOrEqual(3);
  });

  it("빈 날짜에도 문구가 있다 — 화면이 비지 않아야 한다", () => {
    expect(lastSetCheer({ todayKey: "" }).length).toBeGreaterThan(0);
  });
});

/**
 * ③ 운동 완료 카드 (2026-09-28 사용자 요청 — "성취감이 느껴지게 사진 자산과
 * '오늘도 해냈다'는 느낌, 기록이 쌓여서 실력이 된다는 느낌의 마케팅 문구").
 * 문구는 **사용자가 만든 이미지 안에 이미 있다.** 여기는 이미지가 못 하는 것 —
 * 실제 쌓인 날 수 — 만 말한다.
 */
describe("completionHero", () => {
  it("고른 번호의 사진과 그 사진 속 문구(대체 텍스트)를 준다", () => {
    const hero = completionHero({ workoutDays: 20, imageIndex: 0 });
    expect(hero.image).toBe(COMPLETION_HERO_IMAGES[0].src);
    expect(hero.alt).toBe(COMPLETION_HERO_IMAGES[0].alt);
    expect(hero.alt).toContain("오늘도 해냈다");
  });

  it("범위를 벗어난 번호도 목록 안의 사진으로 떨어진다 — 사진이 빠지면 안 된다", () => {
    const n = COMPLETION_HERO_IMAGES.length;
    expect(completionHero({ workoutDays: 3, imageIndex: n }).image).toBe(
      COMPLETION_HERO_IMAGES[0].src,
    );
    expect(completionHero({ workoutDays: 3, imageIndex: -1 }).image).toBe(
      COMPLETION_HERO_IMAGES[n - 1].src,
    );
  });

  it("쌓인 날 수를 실제 숫자로 말한다 — 기록이 쌓인다는 근거", () => {
    expect(completionHero({ workoutDays: 21, imageIndex: 0 }).progressLine).toContain(
      "21일째",
    );
  });

  it("첫날은 '첫 기록'으로 말한다 — '1일째'보다 시작의 의미가 산다", () => {
    const line = completionHero({ workoutDays: 1, imageIndex: 0 }).progressLine;
    expect(line).toContain("첫 기록");
    expect(line).not.toContain("1일째");
  });

  it("날 수를 모르면 숫자를 지어내지 않는다", () => {
    expect(completionHero({ workoutDays: null, imageIndex: 0 }).progressLine).toBeNull();
    expect(completionHero({ workoutDays: 0, imageIndex: 0 }).progressLine).toBeNull();
  });
});

/** 운동할 때마다 무작위 사진 (2026-09-29 사용자 요청) */
describe("COMPLETION_HERO_IMAGES", () => {
  it("사진이 여러 장이고, 경로가 겹치지 않는다", () => {
    expect(COMPLETION_HERO_IMAGES.length).toBeGreaterThanOrEqual(8);
    const srcs = COMPLETION_HERO_IMAGES.map((i) => i.src);
    expect(new Set(srcs).size).toBe(srcs.length);
  });

  it("모든 사진에 경로 규칙과 대체 텍스트가 있다", () => {
    for (const image of COMPLETION_HERO_IMAGES) {
      expect(image.src).toMatch(/^\/record-assets\/workout-complete-.+\.webp$/);
      expect(image.alt.length).toBeGreaterThan(5);
    }
  });
});

describe("pickCompletionHeroIndex", () => {
  const n = COMPLETION_HERO_IMAGES.length;

  it("난수에 따라 모든 사진이 나올 수 있다", () => {
    const seen = new Set<number>();
    for (let k = 0; k < n; k++) seen.add(pickCompletionHeroIndex((k + 0.5) / n, null));
    expect(seen.size).toBe(n);
  });

  it("직전에 본 사진은 바로 다시 나오지 않는다", () => {
    for (let prev = 0; prev < n; prev++) {
      for (let k = 0; k < 50; k++) {
        const picked = pickCompletionHeroIndex(k / 50, prev);
        expect(picked).not.toBe(prev);
        expect(picked).toBeGreaterThanOrEqual(0);
        expect(picked).toBeLessThan(n);
      }
    }
  });

  it("직전을 빼도 나머지 사진은 전부 나올 수 있다", () => {
    const seen = new Set<number>();
    for (let k = 0; k < 200; k++) seen.add(pickCompletionHeroIndex(k / 200, 0));
    expect(seen.size).toBe(n - 1);
  });

  it("직전 번호가 이상한 값이면 무시하고 목록 안에서 고른다", () => {
    for (const bad of [-1, n, 999, Number.NaN]) {
      const picked = pickCompletionHeroIndex(0.99, bad);
      expect(picked).toBeGreaterThanOrEqual(0);
      expect(picked).toBeLessThan(n);
    }
  });

  it("난수가 1이어도 범위를 넘지 않는다", () => {
    expect(pickCompletionHeroIndex(1, null)).toBeLessThan(n);
    expect(pickCompletionHeroIndex(1, n - 1)).toBeLessThan(n);
  });
});
