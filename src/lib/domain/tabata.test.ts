import { afterEach, describe, expect, it, vi } from "vitest";
import type { CatalogExercise } from "@/lib/types";
import type { LocalExercise } from "@/lib/workout";

import {
  DYNAMITE_TABATA_TRACKS,
  INTERVAL_COPY,
  TABATA_EXERCISE_COUNT,
  TABATA_ROUND_SECONDS,
  TABATA_TRACKS,
  asTabataMinutes,
  canMoveAcrossIntervalBlock,
  cardNumberIndex,
  routineTabataMinutes,
  moveIntervalBlock,
  reorderWithIntervalBlock,
  startIndexAfterRemoval,
  isBeforeIntervalBlock,
  coachSessionRows,
  completeIntervalBlock,
  hasIntervalFollowUps,
  intervalBlockNames,
  intervalBlockPending,
  intervalPlanLine,
  isBlockOnlyCopyOfPlan,
  intervalFollowUpLine,
  intervalSaveTarget,
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
  afterEach(() => vi.unstubAllEnvs());

  it("지정한 세 계정만 코스별 Dynamite 음원을 쓴다", () => {
    const users = ["user-a", "user-b", "user-c"];
    vi.stubEnv("NEXT_PUBLIC_INTERVAL_DYNAMITE_USER_IDS", ` ${users.join(", ")} `);
    for (const userId of users) {
      for (const minutes of [4, 8, 16]) {
        expect(tabataTrackForMinutes(minutes, userId)).toMatchObject({
          // 8·16분도 4분 파일 하나를 반복한다 (2026-11-19)
          src: "/audio/tabata-4min-dynamite-v1.mp3",
          minutes,
          musicTitle: "Dynamite (Tabata)",
        });
      }
    }
  });

  it("다른 계정·미로그인·설정 누락은 기존 음원을 쓴다", () => {
    vi.stubEnv("NEXT_PUBLIC_INTERVAL_DYNAMITE_USER_IDS", "user-a,user-b,user-c");
    for (const userId of ["user-a-extra", "other-user", "", null, undefined]) {
      expect(tabataTrackForMinutes(4, userId)).toBe(TABATA_TRACKS[0]);
    }
    expect(tabataTrackForMinutes(5, "user-a")).toBeNull();
    vi.stubEnv("NEXT_PUBLIC_INTERVAL_DYNAMITE_USER_IDS", "");
    expect(tabataTrackForMinutes(4, "user-a")).toBe(TABATA_TRACKS[0]);
  });

  it("4·8·16분 코스가 4분 음원 하나를 함께 쓴다 (반복 재생, 2026-11-19)", () => {
    expect(TABATA_TRACKS.map((t) => t.minutes)).toEqual([4, 8, 16]);
    expect(new Set(TABATA_TRACKS.map((t) => t.src)).size).toBe(1);
    expect(new Set(DYNAMITE_TABATA_TRACKS.map((t) => t.src)).size).toBe(1);
    for (const track of TABATA_TRACKS) {
      expect(track.src).toMatch(/^\/audio\/tabata-.*\.mp3$/);
    }
  });

  it("분수로 코스를 찾는다", () => {
    expect(tabataTrackForMinutes(8)?.src).toBe(
      "/audio/tabata-4min-total-body-v3.mp3",
    );
    expect(tabataTrackForMinutes(8)?.minutes).toBe(8);
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
      leading: [],
      block: ["리버스 런지", "Scapular Push-up Plus", "마운틴 클라이머", "점핑잭"],
      followUps: ["흉추 익스텐션", "YTW"],
    });
    expect(splitIntervalPlan(names.slice(0, 4)).followUps).toEqual([]);
    expect(splitIntervalPlan(names.slice(0, 3))).toEqual({ leading: [], block: names.slice(0, 3), followUps: [] });
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

/**
 * 인터벌 시트에서 "오늘 계획으로 저장" — 어느 계획에 쓸지 (사용자 지시 2026-11-17).
 * 시작하지 않고 닫으면 바꾼 종목이 사라졌다. 저장하면 오늘 카드(`오늘은 전신 인터벌이에요`)가 그 구성이 된다.
 */
describe("intervalSaveTarget — 저장할 인터벌 계획 고르기", () => {
  const interval = (id: string) => ({ id, tabataMinutes: 8 });
  const general = (id: string) => ({ id, tabataMinutes: null });

  it("예정표에서 연 시트면 그 계획을 고친다", () => {
    expect(intervalSaveTarget([interval("a"), interval("b")], "b")).toEqual({ kind: "update", planId: "b" });
  });

  it("열었던 계획이 이미 없어졌으면 새로 만든다 (고칠 대상이 없다)", () => {
    expect(intervalSaveTarget([interval("a")], "gone")).toEqual({ kind: "create" });
  });

  it("계획 없이 연 시트(퀘스트·4분 인터벌)인데 오늘 인터벌 계획이 정확히 하나면 그걸 고친다 — 같은 카드가 둘이 되지 않게", () => {
    expect(intervalSaveTarget([general("g"), interval("a")], null)).toEqual({ kind: "update", planId: "a" });
  });

  it("오늘 인터벌 계획이 없으면 새로 만든다 — 일반 계획은 건드리지 않는다", () => {
    expect(intervalSaveTarget([general("g")], null)).toEqual({ kind: "create" });
    expect(intervalSaveTarget([], undefined)).toEqual({ kind: "create" });
  });

  it("오늘 인터벌 계획이 둘 이상이고 어느 것인지 모르면 새로 만든다 — 엉뚱한 계획을 덮어쓰지 않는다", () => {
    expect(intervalSaveTarget([interval("a"), interval("b")], null)).toEqual({ kind: "create" });
  });
});

// ── 인터벌 시작 위치 (설계 2026-11-22) ─────────────────────────────
// 인터벌 4종은 순서표 어디서든 시작할 수 있다. 시작 위치를 안 주면 0 — 지금까지의
// "앞 4개" 규칙과 결과가 **완전히 같아야** 옛 기록 56건이 그대로 읽힌다.
describe("인터벌 시작 위치 — 옛 규칙(0)과 같다", () => {
  const names = ["a", "b", "c", "d", "e", "f"];

  it("시작 위치를 안 주면 앞 4개가 블록이다 (옛 동작 그대로)", () => {
    expect(isIntervalBlockIndex(8, 0)).toBe(true);
    expect(isIntervalBlockIndex(8, 3)).toBe(true);
    expect(isIntervalBlockIndex(8, 4)).toBe(false);
    expect(intervalBlockNames(names)).toEqual(["a", "b", "c", "d"]);
    expect(splitIntervalPlan(names).block).toEqual(["a", "b", "c", "d"]);
    expect(splitIntervalPlan(names).followUps).toEqual(["e", "f"]);
    expect(splitIntervalPlan(names).leading).toEqual([]);
  });

  it("시작 위치가 null·undefined여도 0과 같다 (DB의 빈 칸)", () => {
    expect(isIntervalBlockIndex(8, 0, null)).toBe(true);
    expect(isIntervalBlockIndex(8, 4, undefined)).toBe(false);
  });
});

describe("인터벌 시작 위치 — 가운데·맨 뒤", () => {
  it("2번부터 시작하면 2~5번이 블록이다", () => {
    expect(isIntervalBlockIndex(8, 1, 2)).toBe(false);
    expect(isIntervalBlockIndex(8, 2, 2)).toBe(true);
    expect(isIntervalBlockIndex(8, 5, 2)).toBe(true);
    expect(isIntervalBlockIndex(8, 6, 2)).toBe(false);
  });

  it("인터벌 세션이 아니면 위치와 상관없이 블록이 아니다", () => {
    expect(isIntervalBlockIndex(null, 2, 2)).toBe(false);
    expect(isIntervalBlockIndex(undefined, 2, 2)).toBe(false);
  });

  it("자리(sort_order)를 모르면 블록으로 본다 — 모르면 기록 비교에서 빼는 쪽이 안전", () => {
    expect(isIntervalBlockIndex(8, null, 2)).toBe(true);
  });

  it("이름 목록을 앞·블록·뒤로 가른다", () => {
    const names = ["w1", "w2", "a", "b", "c", "d", "x"];
    expect(intervalBlockNames(names, 2)).toEqual(["a", "b", "c", "d"]);
    expect(splitIntervalPlan(names, 2)).toEqual({
      leading: ["w1", "w2"],
      block: ["a", "b", "c", "d"],
      followUps: ["x"],
    });
  });

  it("기록 비교에서는 블록만 뺀다 — 앞·뒤 웨이트는 남는다", () => {
    const rows = ["w1", "w2", "a", "b", "c", "d", "x"];
    expect(withoutIntervalBlock(8, rows, 2)).toEqual(["w1", "w2", "x"]);
    expect(withoutIntervalBlock(null, rows, 2)).toEqual(rows);
  });

  it("AI 코치도 블록만 뺀다", () => {
    const rows = [0, 1, 2, 3, 4, 5, 6].map((sort_order) => ({ sort_order }));
    expect(coachSessionRows(8, rows, 2).map((r) => r.sort_order)).toEqual([0, 1, 6]);
  });
});

describe("인터벌 시작 위치 — 운동 중 흐름", () => {
  const ex = (names: string[], done: boolean) =>
    names.map((n) => localExercise(n, [done]));
  const draftOf = (start: number, leadingDone: boolean) => ({
    tabataMinutes: 8,
    intervalStartIndex: start,
    exercises: [
      ...ex(["w1", "w2"], leadingDone),
      ...ex(["a", "b", "c", "d"], false),
    ],
  });

  it("블록이 남았을 때만 무동작 감지를 끈다 — 앞 웨이트가 진행 중이면 감지는 켜져 있다", () => {
    expect(intervalBlockPending(draftOf(2, true))).toBe(true);
    // 블록 차례가 되기 전에도 '블록이 아직 안 끝남'이지만, 앞 종목이 남아 있으면
    // 사람이 세트를 누르는 중이므로 감지를 꺼선 안 된다
    expect(intervalBlockPending(draftOf(2, false))).toBe(false);
    expect(intervalBlockPending(draftOf(2, true))).toBe(true);
  });

  it("블록이 끝나면 블록 4종만 완료로 — 앞 종목은 건드리지 않는다", () => {
    const out = completeIntervalBlock(draftOf(2, false).exercises, 2);
    expect(out.slice(0, 2).every((e) => e.sets.every((s) => !s.done))).toBe(true);
    expect(out.slice(2).every((e) => e.sets.every((s) => s.done))).toBe(true);
  });

  it("블록 밖에 아직 할 종목이 있으면 음원이 끝나도 운동을 끝내지 않는다", () => {
    expect(hasIntervalFollowUps(draftOf(2, false))).toBe(true);
    // 앞 종목을 다 하고 인터벌이 마지막이면 — 끝낸다
    expect(hasIntervalFollowUps(draftOf(2, true))).toBe(false);
    // 순수 인터벌
    expect(
      hasIntervalFollowUps({
        tabataMinutes: 8,
        intervalStartIndex: 0,
        exercises: ex(["a", "b", "c", "d"], false),
      }),
    ).toBe(false);
  });

  it("옛 모양(앞 4개 + 이어하기)은 시작 위치 없이도 이어하기로 본다", () => {
    expect(
      hasIntervalFollowUps({
        tabataMinutes: 8,
        exercises: [...ex(["a", "b", "c", "d"], false), ...ex(["e"], false)],
      }),
    ).toBe(true);
  });

  it("운동 중 블록 종목은 빼거나 옮길 수 없다 — 앞·뒤 종목은 된다", () => {
    const draft = draftOf(2, true);
    expect(isIntervalBlockExercise(draft, "k-w1")).toBe(false);
    expect(isIntervalBlockExercise(draft, "k-a")).toBe(true);
    expect(isIntervalBlockExercise(draft, "k-d")).toBe(true);
  });
});

describe("블록을 가로지르는 이동 막기 (순서가 곧 규칙이라서)", () => {
  it("종목을 블록 건너편으로 옮기면 시작 위치가 어긋나므로 막는다", () => {
    // w1 w2 [a b c d] x   (start 2)
    expect(canMoveAcrossIntervalBlock(8, 2, 0, 1)).toBe(true); // 앞쪽끼리
    expect(canMoveAcrossIntervalBlock(8, 2, 6, 6)).toBe(true); // 제자리
    expect(canMoveAcrossIntervalBlock(8, 2, 0, 6)).toBe(false); // 앞 → 뒤 (블록 건넘)
    expect(canMoveAcrossIntervalBlock(8, 2, 6, 0)).toBe(false); // 뒤 → 앞
    expect(canMoveAcrossIntervalBlock(8, 2, 3, 0)).toBe(false); // 블록 종목은 못 움직임
    expect(canMoveAcrossIntervalBlock(null, 0, 0, 5)).toBe(true); // 일반 운동은 자유
  });
});

describe("블록을 통째로 옮기기 — 시작 위치만 바뀐다", () => {
  it("블록을 한 칸 뒤로", () => {
    const list = ["w1", "w2", "a", "b", "c", "d", "x"];
    expect(moveIntervalBlock(list, 2, 3)).toEqual({
      exercises: ["w1", "w2", "x", "a", "b", "c", "d"],
      startIndex: 3,
    });
  });

  it("블록을 맨 앞으로", () => {
    const list = ["w1", "w2", "a", "b", "c", "d"];
    expect(moveIntervalBlock(list, 2, 0)).toEqual({
      exercises: ["a", "b", "c", "d", "w1", "w2"],
      startIndex: 0,
    });
  });

  it("범위를 벗어난 위치는 가장자리로 맞춘다", () => {
    const list = ["w1", "a", "b", "c", "d"];
    expect(moveIntervalBlock(list, 1, 99).startIndex).toBe(1); // 이미 맨 뒤
    expect(moveIntervalBlock(list, 1, -5).startIndex).toBe(0);
  });
});

describe("준비 목록 옮기기 — 블록이 깨지지 않는다", () => {
  // w1 w2 [a b c d] x
  const items = ["w1", "w2", "a", "b", "c", "d", "x"].map((name) => ({ name }));
  const names = (list: readonly { name: string }[]) => list.map((i) => i.name);

  it("블록 앞쪽끼리는 그냥 옮긴다 — 시작 위치 그대로", () => {
    const out = reorderWithIntervalBlock(items, 2, 0, 1)!;
    expect(names(out.exercises)).toEqual(["w2", "w1", "a", "b", "c", "d", "x"]);
    expect(out.startIndex).toBe(2);
  });

  it("뒤 종목이 블록 건너편 앞으로 가면 블록이 한 칸 밀린다", () => {
    const out = reorderWithIntervalBlock(items, 2, 6, 1)!;
    expect(names(out.exercises)).toEqual(["w1", "x", "w2", "a", "b", "c", "d"]);
    expect(out.startIndex).toBe(3);
  });

  it("앞 종목이 블록 건너편 뒤로 가면 블록이 한 칸 당겨진다", () => {
    const out = reorderWithIntervalBlock(items, 2, 0, 6)!;
    expect(names(out.exercises)).toEqual(["w2", "a", "b", "c", "d", "x", "w1"]);
    expect(out.startIndex).toBe(1);
  });

  it("종목이 블록 한가운데로 들어가는 이동은 막는다", () => {
    expect(reorderWithIntervalBlock(items, 2, 0, 3)).toBeNull();
    expect(reorderWithIntervalBlock(items, 2, 6, 4)).toBeNull();
  });

  it("블록 종목을 끌면 블록 전체가 따라간다", () => {
    // b(3)를 맨 위로 → 블록이 맨 앞
    const up = reorderWithIntervalBlock(items, 2, 3, 0)!;
    expect(names(up.exercises)).toEqual(["a", "b", "c", "d", "w1", "w2", "x"]);
    expect(up.startIndex).toBe(0);
    // b(3)를 맨 뒤 x 자리로 → 블록이 x 뒤
    const down = reorderWithIntervalBlock(items, 2, 3, 6)!;
    expect(names(down.exercises)).toEqual(["w1", "w2", "x", "a", "b", "c", "d"]);
    expect(down.startIndex).toBe(3);
  });

  it("블록 안에서 자리를 바꾸는 것은 막는다", () => {
    expect(reorderWithIntervalBlock(items, 2, 2, 4)).toBeNull();
  });

  it("범위 밖이거나 제자리면 안전하게 처리한다", () => {
    expect(reorderWithIntervalBlock(items, 2, -1, 3)).toBeNull();
    expect(reorderWithIntervalBlock(items, 2, 0, 99)).toBeNull();
    expect(reorderWithIntervalBlock(items, 2, 4, 4)!.startIndex).toBe(2);
  });

  it("시작 위치가 0인 옛 모양도 같은 규칙이다 (인터벌 + 이어하기)", () => {
    const old = ["a", "b", "c", "d", "e", "f"].map((name) => ({ name }));
    const out = reorderWithIntervalBlock(old, undefined, 5, 4)!;
    expect(names(out.exercises)).toEqual(["a", "b", "c", "d", "f", "e"]);
    expect(out.startIndex).toBe(0);
  });
});

describe("종목을 뺄 때 블록 위치", () => {
  it("블록 앞 종목을 빼면 시작 위치가 한 칸 당겨진다", () => {
    expect(startIndexAfterRemoval(2, 0)).toBe(1);
    expect(startIndexAfterRemoval(2, 1)).toBe(1);
  });
  it("블록 뒤 종목을 빼면 그대로", () => {
    expect(startIndexAfterRemoval(2, 6)).toBe(2);
    expect(startIndexAfterRemoval(undefined, 5)).toBe(0);
  });

  it("블록 앞 종목인지 알아본다 — 시작한 뒤에는 이런 종목을 뺄 수 없다", () => {
    const draft = {
      tabataMinutes: 8,
      intervalStartIndex: 2,
      exercises: ["w1", "w2", "a", "b", "c", "d", "x"].map((n) => ({ key: "k-" + n })),
    };
    expect(isBeforeIntervalBlock(draft, "k-w1")).toBe(true);
    expect(isBeforeIntervalBlock(draft, "k-w2")).toBe(true);
    expect(isBeforeIntervalBlock(draft, "k-a")).toBe(false);
    expect(isBeforeIntervalBlock(draft, "k-x")).toBe(false);
    expect(isBeforeIntervalBlock({ ...draft, tabataMinutes: null }, "k-w1")).toBe(false);
    // 시작 위치 0이면 앞 종목이 없다 — 옛 인터벌 세션에서 이어하기를 빼도 되는 이유
    expect(isBeforeIntervalBlock({ ...draft, intervalStartIndex: 0 }, "k-x")).toBe(false);
  });
});

describe("목록에서 인터벌이 카드 한 장일 때 — 번호와 저장 (2026-11-22 개발 서버 확인에서 발견)", () => {
  it("블록 뒤 종목은 4칸 당겨 센다 — 번호가 1, 6, 7로 건너뛰지 않는다", () => {
    // 벤치프레스(0) [인터벌 1~4] 트레드밀(5) 런지(6)
    expect(cardNumberIndex(0, 1)).toBe(0);
    expect(cardNumberIndex(5, 1)).toBe(1);
    expect(cardNumberIndex(6, 1)).toBe(2);
  });

  it("블록이 맨 앞이면 뒤 종목이 0번부터 센다, 블록 앞 종목은 그대로", () => {
    expect(cardNumberIndex(4, 0)).toBe(0);
    expect(cardNumberIndex(5, undefined)).toBe(1);
    expect(cardNumberIndex(1, 2)).toBe(1);
  });

  it("루틴에는 블록이 맨 앞일 때만 코스 분수를 싣는다 — 아니면 웨이트가 인터벌로 읽힌다", () => {
    expect(routineTabataMinutes(8, 0)).toBe(8);
    expect(routineTabataMinutes(8, undefined)).toBe(8);
    expect(routineTabataMinutes(8, null)).toBe(8);
    expect(routineTabataMinutes(8, 1)).toBeNull();
    expect(routineTabataMinutes(8, 3)).toBeNull();
    expect(routineTabataMinutes(null, 2)).toBeNull();
  });
});

describe("인터벌 카드의 '이어서' 줄 — 뒤 종목 이름을 보여 준다 (2026-11-22)", () => {
  // 합친 계획(인터벌 4 + 웨이트 8)이 카드에는 "이어서 8종목"으로만 보여서 웨이트가 사라진 것처럼 읽혔다
  const names = ["a", "b", "c", "d", "w1", "w2", "w3", "w4", "w5", "w6", "w7", "w8"];

  it("이어하기가 없으면 줄이 없다", () => {
    expect(intervalFollowUpLine(["a", "b", "c", "d"])).toBeNull();
    expect(intervalFollowUpLine([])).toBeNull();
  });

  it("앞 4종목만 이름으로 보여 주고 나머지는 개수로 줄인다", () => {
    expect(intervalFollowUpLine(names)).toBe("이어서 w1 · w2 · w3 · w4 외 4종목");
  });

  it("4종목 이하면 전부 이름으로 보여 준다", () => {
    expect(intervalFollowUpLine(["a", "b", "c", "d", "w1", "w2"])).toBe("이어서 w1 · w2");
  });
});

describe("폰 목록이 계획의 앞 4종(인터벌)만 담은 옛 복사본인가 (2026-11-22, 오뎅끼데스까님 폰)", () => {
  const plan = ["a", "b", "c", "d", "w1", "w2", "w3"];

  it("계획의 인터벌 4종과 같고 목록에 그 4종뿐이면 옛 복사본이다", () => {
    expect(isBlockOnlyCopyOfPlan(["a", "b", "c", "d"], plan)).toBe(true);
  });

  it("목록에 다른 종목이 더 있으면 아니다 — 사용자가 직접 만든 목록", () => {
    expect(isBlockOnlyCopyOfPlan(["a", "b", "c", "d", "x"], plan)).toBe(false);
  });

  it("4종이 계획과 다르면 아니다 (이름·순서)", () => {
    expect(isBlockOnlyCopyOfPlan(["a", "b", "c", "z"], plan)).toBe(false);
    expect(isBlockOnlyCopyOfPlan(["b", "a", "c", "d"], plan)).toBe(false);
  });

  it("계획에 이어하기가 없으면 아니다 — 잃은 것이 없다", () => {
    expect(isBlockOnlyCopyOfPlan(["a", "b", "c", "d"], ["a", "b", "c", "d"])).toBe(false);
  });

  it("목록이 4종보다 적으면 아니다", () => {
    expect(isBlockOnlyCopyOfPlan(["a", "b"], plan)).toBe(false);
  });
});
