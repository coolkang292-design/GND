import { describe, expect, it } from "vitest";
import type { CatalogExercise } from "@/lib/types";
import type { LocalExercise } from "@/lib/workout";

import {
  INTERVAL_COPY,
  TABATA_EXERCISE_COUNT,
  TABATA_ROUND_SECONDS,
  TABATA_TRACKS,
  asTabataMinutes,
  coachSessionRows,
  completeIntervalBlock,
  hasIntervalFollowUps,
  intervalBlockNames,
  intervalBlockPending,
  intervalPlanLine,
  isIntervalBlockExercise,
  isIntervalBlockIndex,
  mergeRecentSessions,
  splitIntervalPlan,
  tabataDraftExercises,
  tabataResumeFromSession,
  tabataPickFromNames,
  tabataRepsForMinutes,
  tabataTrackForMinutes,
  withoutIntervalBlock,
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
      "/audio/tabata-8min-total-body-v2.mp3",
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

/**
 * 인터벌 뒤 이어하기 (설계 2026-09-29 §4) — "인터벌 블록 = 앞 4개".
 *
 * 계획은 ChatGPT가 DB에 직접 쓴다. 예전에는 목록 **전체**에서 카탈로그에 있는
 * 이름 4개를 골라서, 수요일 계획은 `Scapular Push-up Plus`(카탈로그에 없음)
 * 대신 8번째 `YTW`(덤벨)가 인터벌에 끼어들었다.
 */
function localExercise(name: string, done: boolean[]): LocalExercise {
  return {
    key: `k-${name}`,
    name,
    bodyPart: "코어",
    exerciseType: "bodyweight",
    measure: "reps",
    isCustom: false,
    sets: done.map((d, i) => ({
      key: `s-${name}-${i}`,
      weightKg: 0,
      reps: 4,
      distanceKm: 0,
      durationMin: 0,
      done: d,
    })),
  } as LocalExercise;
}

describe("인터벌 블록 = 앞 4개 (2026-09-29)", () => {
  it("계획을 인터벌 4개와 이어하기로 가른다", () => {
    const names = ["리버스 런지", "Scapular Push-up Plus", "마운틴 클라이머", "점핑잭", "흉추 익스텐션", "YTW"];
    expect(splitIntervalPlan(names)).toEqual({
      block: ["리버스 런지", "Scapular Push-up Plus", "마운틴 클라이머", "점핑잭"],
      followUps: ["흉추 익스텐션", "YTW"],
    });
    expect(splitIntervalPlan(names.slice(0, 4)).followUps).toEqual([]);
    expect(splitIntervalPlan(names.slice(0, 3))).toEqual({ block: names.slice(0, 3), followUps: [] });
  });

  it("카탈로그 대조는 앞 4개 이름만 — 없는 이름을 뒤에서 채우지 않는다 (수요일 재현)", () => {
    const catalog = ["리버스 런지", "마운틴 클라이머", "점핑잭", "YTW"].map(catalogItem);
    const names = ["리버스 런지", "Scapular Push-up Plus", "마운틴 클라이머", "점핑잭", "흉추 익스텐션", "YTW"];
    const picked = tabataPickFromNames(intervalBlockNames(names), catalog);
    expect(picked.map((p) => p.name)).toEqual(["리버스 런지", "마운틴 클라이머", "점핑잭"]);
  });

  it("지난 인터벌 기록을 되살릴 때도 앞 4개만 본다", () => {
    const catalog = ["리버스 런지", "마운틴 클라이머", "점핑잭", "YTW"].map(catalogItem);
    const resumed = tabataResumeFromSession({
      session: {
        tabataMinutes: 8,
        exerciseNames: ["리버스 런지", "Scapular Push-up Plus", "마운틴 클라이머", "점핑잭", "YTW"],
      },
      catalog,
    });
    expect(resumed?.picked.map((p) => p.name)).toEqual(["리버스 런지", "마운틴 클라이머", "점핑잭"]);
  });

  it("인터벌 세션의 0~3번만 블록이다 — 일반 세션은 어느 자리도 블록이 아니다", () => {
    expect(isIntervalBlockIndex(8, 0)).toBe(true);
    expect(isIntervalBlockIndex(8, TABATA_EXERCISE_COUNT - 1)).toBe(true);
    expect(isIntervalBlockIndex(8, TABATA_EXERCISE_COUNT)).toBe(false);
    expect(isIntervalBlockIndex(null, 0)).toBe(false);
    expect(isIntervalBlockIndex(undefined, 0)).toBe(false);
  });

  it("인터벌 세션에서 자리를 모르면(null) 블록으로 본다 — 모르면 비교에서 빼는 쪽이 안전하다", () => {
    expect(isIntervalBlockIndex(8, null)).toBe(true);
    expect(isIntervalBlockIndex(null, null)).toBe(false);
  });

  it("기록 비교에 쓸 종목에서 인터벌 블록을 뺀다 — 순수 인터벌은 아무것도 안 남는다", () => {
    const eight = ["a", "b", "c", "d", "e", "f"];
    expect(withoutIntervalBlock(8, eight)).toEqual(["e", "f"]);
    expect(withoutIntervalBlock(8, eight.slice(0, 4))).toEqual([]);
    expect(withoutIntervalBlock(null, eight)).toEqual(eight);
  });

  it("이어하기가 있는지 — 인터벌이고 종목이 4개를 넘을 때만", () => {
    const four = ["a", "b", "c", "d"].map((n) => localExercise(n, [false]));
    const six = [...four, localExercise("e", [false]), localExercise("f", [false])];
    expect(hasIntervalFollowUps({ tabataMinutes: 8, exercises: six })).toBe(true);
    expect(hasIntervalFollowUps({ tabataMinutes: 8, exercises: four })).toBe(false);
    expect(hasIntervalFollowUps({ tabataMinutes: null, exercises: six })).toBe(false);
  });

  it("음원이 끝나면 블록 4종의 세트만 완료 — 이어하기는 그대로 미완료", () => {
    const six = [
      ...["a", "b", "c", "d"].map((n) => localExercise(n, [false])),
      localExercise("e", [false, false]),
      localExercise("f", [false]),
    ];
    const out = completeIntervalBlock(six);
    expect(out.slice(0, 4).every((ex) => ex.sets.every((s) => s.done))).toBe(true);
    expect(out[4].sets.map((s) => s.done)).toEqual([false, false]);
    expect(out[5].sets.map((s) => s.done)).toEqual([false]);
    // 원본은 건드리지 않는다
    expect(six[0].sets[0].done).toBe(false);
  });

  it("무동작 감지를 끌 때는 블록이 아직 남아 있을 때뿐이다", () => {
    const pending = [
      ...["a", "b", "c", "d"].map((n) => localExercise(n, [false])),
      localExercise("e", [false]),
    ];
    expect(intervalBlockPending({ tabataMinutes: 8, exercises: pending })).toBe(true);
    expect(intervalBlockPending({ tabataMinutes: 8, exercises: completeIntervalBlock(pending) })).toBe(false);
    expect(intervalBlockPending({ tabataMinutes: null, exercises: pending })).toBe(false);
  });

  it("운동 중 블록 종목은 빼거나 옮길 수 없다 — 이어하기는 된다", () => {
    const draft = {
      tabataMinutes: 8,
      exercises: [
        ...["a", "b", "c", "d"].map((n) => localExercise(n, [true])),
        localExercise("e", [false]),
      ],
    };
    expect(isIntervalBlockExercise(draft, "k-a")).toBe(true);
    expect(isIntervalBlockExercise(draft, "k-d")).toBe(true);
    expect(isIntervalBlockExercise(draft, "k-e")).toBe(false);
    expect(isIntervalBlockExercise(draft, "없는-key")).toBe(false);
    expect(isIntervalBlockExercise({ ...draft, tabataMinutes: null }, "k-a")).toBe(false);
  });

  it("배너·카드 한 줄 — 블록 이름 뒤에 이어하기 개수", () => {
    expect(intervalPlanLine(["a", "b", "c", "d", "e", "f"])).toBe("a · b · c · d · 이어서 2종목");
    expect(intervalPlanLine(["a", "b", "c", "d"])).toBe("a · b · c · d");
  });

  it("일반·인터벌 세션 조회를 최신순 하나로 합친다", () => {
    const regular = [
      { id: "r1", completed_at: "2026-09-27T22:00:00+00:00" },
      { id: "r2", completed_at: "2026-09-20T22:00:00+00:00" },
    ];
    const interval = [{ id: "i1", completed_at: "2026-09-24T22:05:00+00:00" }];
    expect(mergeRecentSessions(regular, interval).map((s) => s.id)).toEqual(["r1", "i1", "r2"]);
  });

  it("안내 문구", () => {
    expect(INTERVAL_COPY.followUpLead).toBe("인터벌 뒤에 이어서");
    expect(INTERVAL_COPY.followUpCount(4)).toBe("이어서 4종목");
    expect(INTERVAL_COPY.followUpAfterEnd(4)).toBe("음원이 끝나면 이어서 4종목을 해요.");
    expect(INTERVAL_COPY.followUpStart).toBe("인터벌 끝! 숨 고르고 이어서 해요 💪");
    expect(INTERVAL_COPY.blockLocked).toBe("인터벌 종목은 운동 중에 빼거나 옮길 수 없어요");
  });
});

describe("AI 코치가 분석할 이번 세션 종목 (2026-09-29, 개발 서버 확인에서 발견)", () => {
  const row = (name: string, sort_order: number | null) => ({ name, sort_order });

  it("이어하기가 있는 인터벌 세션이면 블록을 뺀다 — '푸시업 30회 → 2회' 같은 틀린 주의를 막는다", () => {
    const rows = [
      row("푸시업", 0), row("마운틴 클라이머", 1), row("점핑잭", 2), row("크런치", 3),
      row("버드독", 4), row("데드버그", 5),
    ];
    expect(coachSessionRows(4, rows).map((r) => r.name)).toEqual(["버드독", "데드버그"]);
  });

  it("순수 인터벌은 예전 그대로 둔다 — 빼면 분석할 종목이 하나도 안 남는다", () => {
    const rows = [row("푸시업", 0), row("마운틴 클라이머", 1), row("점핑잭", 2), row("크런치", 3)];
    expect(coachSessionRows(4, rows)).toEqual(rows);
  });

  it("일반 세션은 건드리지 않는다", () => {
    const rows = [row("벤치프레스", 0), row("랫풀다운", 1)];
    expect(coachSessionRows(null, rows)).toEqual(rows);
  });
});
