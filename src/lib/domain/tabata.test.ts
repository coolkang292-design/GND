import { describe, expect, it } from "vitest";
import type { CatalogExercise } from "@/lib/types";

import {
  TABATA_EXERCISE_COUNT,
  TABATA_ROUND_SECONDS,
  TABATA_TRACKS,
  asTabataMinutes,
  tabataDraftExercises,
  tabataPickFromNames,
  tabataRepsForMinutes,
  tabataTrackForMinutes,
} from "./tabata";

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
