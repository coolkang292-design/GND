import { describe, expect, it } from "vitest";
import type { CatalogExercise } from "@/lib/types";

import {
  INTERVAL_COPY,
  TABATA_EXERCISE_COUNT,
  TABATA_ROUND_SECONDS,
  TABATA_TRACKS,
  asTabataMinutes,
  tabataDraftExercises,
  tabataResumeFromSession,
  tabataPickFromNames,
  tabataRepsForMinutes,
  tabataTrackForMinutes,
} from "./tabata";

describe("전신 인터벌 사용자 안내", () => {
  it("사용자에게 방식보다 시간을 먼저 말한다", () => {
    expect(INTERVAL_COPY.title).toBe("4분부터 시작하는 전신 인터벌");
    expect(INTERVAL_COPY.short).toBe("4분 인터벌");
    expect(INTERVAL_COPY.description).toBe("음악에 맞춰 20초 운동 · 10초 휴식");
    expect(INTERVAL_COPY.session(8)).toBe("전신 인터벌 8분");
    expect(INTERVAL_COPY.stopConfirm).toBe(
      "전신 인터벌을 중단할까요? 운동은 기록되지 않아요.",
    );
  });
});

const catalogItem = (name: string): CatalogExercise => ({
  id: `cat-${name}`,
  name,
  body_part: "코어",
  exercise_type: "bodyweight",
  measure: "reps",
  is_custom: false,
  created_by: null,
  created_at: "2026-07-01T00:00:00Z",
});

describe("tabataRepsForMinutes", () => {
  it("코스 분수를 종목당 라운드 수로 바꾼다 (4→2 · 8→4 · 16→8)", () => {
    expect(tabataRepsForMinutes(4)).toBe(2);
    expect(tabataRepsForMinutes(8)).toBe(4);
    expect(tabataRepsForMinutes(16)).toBe(8);
  });

  it("라운드 길이·종목 수와 어긋나지 않는다", () => {
    // 상수가 바뀌면 이 값도 같이 바뀌어야 한다 — 2를 박아두지 않는 이유다.
    for (const track of TABATA_TRACKS) {
      const rounds = (track.minutes * 60) / TABATA_ROUND_SECONDS;
      expect(tabataRepsForMinutes(track.minutes)).toBe(
        rounds / TABATA_EXERCISE_COUNT,
      );
    }
  });
});

describe("tabataDraftExercises", () => {
  it("선택한 운동을 각 1세트(미완료) 임시운동으로 변환하고, 코스 분수만큼 횟수를 채운다", () => {
    let n = 0;
    const result = tabataDraftExercises(
      [catalogItem("버피"), catalogItem("마운틴 클라이머")],
      () => `key-${n++}`,
      8,
    );
    expect(result).toEqual([
      {
        key: "key-0",
        name: "버피",
        bodyPart: "코어",
        exerciseType: "bodyweight",
        measure: "reps",
        isCustom: false,
        sets: [
          {
            key: "key-1",
            weightKg: 0,
            reps: 4,
            distanceKm: 0,
            durationMin: 0,
            done: false,
          },
        ],
      },
      {
        key: "key-2",
        name: "마운틴 클라이머",
        bodyPart: "코어",
        exerciseType: "bodyweight",
        measure: "reps",
        isCustom: false,
        sets: [
          {
            key: "key-3",
            weightKg: 0,
            reps: 4,
            distanceKm: 0,
            durationMin: 0,
            done: false,
          },
        ],
      },
    ]);
  });

  it("4분 코스는 종목마다 2회로 기록된다", () => {
    let n = 0;
    const [exercise] = tabataDraftExercises(
      [catalogItem("점프 스쿼트")],
      () => `key-${n++}`,
      4,
    );
    expect(exercise.sets[0].reps).toBe(2);
  });

  it("타바타 구성 운동 수는 4개다", () => {
    expect(TABATA_EXERCISE_COUNT).toBe(4);
  });
});

describe("tabataPickFromNames", () => {
  const catalog = [
    catalogItem("점프 스쿼트"),
    catalogItem("마운틴 클라이머"),
    catalogItem("타이슨 푸시업"),
    catalogItem("벤드 레터럴 레이즈"),
    catalogItem("버피"),
  ];

  it("지난 기록의 종목 이름을 카탈로그 항목으로 되돌린다", () => {
    const picked = tabataPickFromNames(
      ["점프 스쿼트", "마운틴 클라이머", "타이슨 푸시업", "벤드 레터럴 레이즈"],
      catalog,
    );
    expect(picked.map((p) => p.name)).toEqual([
      "점프 스쿼트",
      "마운틴 클라이머",
      "타이슨 푸시업",
      "벤드 레터럴 레이즈",
    ]);
  });

  it("공백·대소문자가 달라도 찾는다", () => {
    expect(tabataPickFromNames(["  점프 스쿼트  "], catalog)).toHaveLength(1);
  });

  it("카탈로그에 없는 이름은 건너뛴다 — 지운 커스텀 종목이 있어도 나머지는 채운다", () => {
    const picked = tabataPickFromNames(
      ["점프 스쿼트", "없는운동", "버피"],
      catalog,
    );
    expect(picked.map((p) => p.name)).toEqual(["점프 스쿼트", "버피"]);
  });

  it("같은 종목이 두 번 나와도 한 번만 담는다", () => {
    const picked = tabataPickFromNames(["버피", "버피"], catalog);
    expect(picked).toHaveLength(1);
  });

  it("종목이 4개를 넘는 일반 운동 기록이면 앞에서 4개만 담는다", () => {
    const picked = tabataPickFromNames(
      [
        "점프 스쿼트",
        "마운틴 클라이머",
        "타이슨 푸시업",
        "벤드 레터럴 레이즈",
        "버피",
      ],
      catalog,
    );
    expect(picked).toHaveLength(TABATA_EXERCISE_COUNT);
    expect(picked.map((p) => p.name)).not.toContain("버피");
  });

  it("하나도 못 찾으면 빈 배열 — 부르는 쪽이 시트를 닫지 않고 안내한다", () => {
    expect(tabataPickFromNames(["없는운동"], catalog)).toEqual([]);
    expect(tabataPickFromNames([], catalog)).toEqual([]);
  });
});

describe("tabataResumeFromSession — 지난 기록을 타바타로 되살린다 (2026-08-07)", () => {
  const catalog = [
    catalogItem("점프 스쿼트"),
    catalogItem("마운틴 클라이머"),
    catalogItem("타이슨 푸시업"),
    catalogItem("벤드 레터럴 레이즈"),
    catalogItem("벤치프레스"),
  ];
  const names = [
    "점프 스쿼트",
    "마운틴 클라이머",
    "타이슨 푸시업",
    "벤드 레터럴 레이즈",
  ];

  it("타바타 세션이면 코스와 구성 운동을 돌려준다", () => {
    /*
      원래 버그: 기록 탭의 '지난 운동 불러오기'로 지난 타바타를 고르면 음원도
      코스도 없는 **맨몸 운동 4개**가 목록에 담겼다. 타바타를 다시 하려면
      타바타 시트를 따로 열어 4개를 새로 골라야 했다.
    */
    const out = tabataResumeFromSession({
      session: { tabataMinutes: 8, exerciseNames: names },
      catalog,
    });
    expect(out?.minutes).toBe(8);
    expect(out?.picked.map((p) => p.name)).toEqual(names);
  });

  it("일반 운동 세션이면 null — 부르는 쪽이 평소대로 목록에 담는다", () => {
    expect(
      tabataResumeFromSession({
        session: { tabataMinutes: null, exerciseNames: ["벤치프레스"] },
        catalog,
      }),
    ).toBeNull();
  });

  it("아는 코스가 아니면 null", () => {
    expect(
      tabataResumeFromSession({
        session: { tabataMinutes: 5, exerciseNames: names },
        catalog,
      }),
    ).toBeNull();
  });

  it("종목을 하나도 못 찾으면 null — 빈 타바타 시트를 열지 않는다", () => {
    expect(
      tabataResumeFromSession({
        session: { tabataMinutes: 4, exerciseNames: ["지워진운동"] },
        catalog,
      }),
    ).toBeNull();
  });

  it("목록에 없는 세션이면 null", () => {
    expect(tabataResumeFromSession({ session: undefined, catalog })).toBeNull();
  });
});

describe("타바타 코스", () => {
  it("4·8·16분 코스가 각자의 음원을 가진다", () => {
    expect(TABATA_TRACKS.map((t) => t.minutes)).toEqual([4, 8, 16]);
    expect(new Set(TABATA_TRACKS.map((t) => t.src)).size).toBe(3);
    for (const track of TABATA_TRACKS) {
      expect(track.src).toMatch(/^\/audio\/tabata-.*\.mp3$/);
    }
  });

  it("분수로 코스를 찾는다", () => {
    expect(tabataTrackForMinutes(8)?.src).toBe(
      "/audio/tabata-8min-total-body.mp3",
    );
    expect(tabataTrackForMinutes(5)).toBeNull();
  });

  it("DB에서 온 값은 아는 코스일 때만 받아들인다", () => {
    expect(asTabataMinutes(16)).toBe(16);
    expect(asTabataMinutes(5)).toBeNull();
    expect(asTabataMinutes(null)).toBeNull();
    expect(asTabataMinutes(undefined)).toBeNull();
    expect(asTabataMinutes("8")).toBeNull();
  });
});
