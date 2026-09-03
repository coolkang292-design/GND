import type { PlanExercise, PlanSet } from "@/lib/domain/workout-plan";
import type { CatalogExercise } from "@/lib/types";

/**
 * 추천 루틴 — 앱이 미리 만들어 두는 루틴 (2026-09-03 사장님 지시).
 *
 * ⚠️ **DB에 행을 만들지 않는다.** `workout_routines`는 사용자 소유 테이블이고
 *    슬롯 한도(0056 트리거)가 걸려 있다. 추천 루틴을 거기 심으면 ① 사람마다
 *    복사본이 생기고 ② 남의 슬롯을 잡아먹는다. 대신 **메모리에서 만들어**
 *    기존 `addRoutine` 경로에 그대로 태운다 — 그 핸들러는 `name`·`exercises`·
 *    `tabataMinutes`만 읽고 `id`나 DB를 건드리지 않는다(실측 확인).
 *
 * ⚠️ 부위·유형·`measure`를 여기 적지 않는다. **카탈로그 행에서 읽는다** —
 *    `recommended-exercises.ts`의 `resolveNames`와 같은 규칙이다. 상수에
 *    복사하면 시드가 바뀔 때 두 곳이 갈라져 화면이 거짓말을 한다.
 */

/** 카탈로그 시드 이름과 **글자까지** 같아야 한다. 다르면 추천이 조용히 빠진다. */
export const PULLUP_EXERCISE_NAME = "풀업";

/**
 * 풀업 사다리 — **1일차** 세트 (사장님 제공 이미지).
 *
 * ⚠️⚠️ **이 다섯 숫자가 출처 그대로다.** 이미지 원문:
 *    "최대 5개가 가능한 사람 기준으로 하루 5세트를 나누어 5, 4, 3, 2, 1회로
 *     시작합니다."
 *    바꾸지 마라 — 바꾸는 순간 출처와 갈라진다.
 */
export const PULLUP_LADDER_DAY1: readonly number[] = [5, 4, 3, 2, 1];

/**
 * 2일차부터의 진행 — **앱이 자동으로 올려 주지 않는다.**
 *
 * 사장님 결정(2026-09-03): *"처음에는 첨부한 사진의 숫자대로 세팅하고 나중에는
 * 지난 기록 불러오기로 진행하면 될 것 같아."*
 *
 * 그래서 훈련일 카운터·최대개수 측정·휴식일 판정을 **만들지 않았다.** 2일차부터는
 * 기존 「지난 기록 불러오기」가 직전 세트를 그대로 가져오고, 사용자가 뒤쪽 세트를
 * 1회 올린다. 원문의 진행 규칙은 아래와 같다(화면 안내 문구의 근거):
 *
 *    1일차 5, 4, 3, 2, 1
 *    2일차 5, 4, 3, 2, 2   ← 맨 뒤 세트 +1
 *    3일차 5, 4, 3, 3, 2   ← 그다음 뒤 세트 +1
 *    …  5일 훈련 / 1일 휴식 · 4주 · 이후 2~3일 쉬고 최대 개수 재측정
 *
 * ⚠️ **4일차 이후의 표를 코드에 넣지 않은 것은 의도다.** 이미지가 준 것은
 *    1~3일차뿐이고, 나머지는 "뒤쪽 세트부터 1회씩"을 확장한 **추정**이다.
 *    추정을 앱이 처방하면 출처에 없는 것을 출처인 척하게 된다.
 */
export const PULLUP_LADDER_SOURCE_NOTE =
  "1일차 5·4·3·2·1로 시작해서, 다음 날부터 맨 뒤 세트를 1회씩 올려요. 5일 하고 하루 쉬는 걸 4주 반복해요.";

export type PresetRoutine = {
  key: "pullup-ladder";
  name: string;
  /** 카드 부제 */
  sub: string;
  /** 담기 전에 보여 줄 한 줄 (무엇이 담기는지) */
  summary: string;
  /** 진행 방법 안내 — 앱이 자동으로 안 올려 준다는 사실을 여기서 밝힌다 */
  howTo: string;
  exerciseName: string;
  /** 세트별 횟수. 길이 = 세트 수 */
  reps: readonly number[];
};

export const PRESET_ROUTINES: readonly PresetRoutine[] = [
  {
    key: "pullup-ladder",
    name: "풀업 사다리",
    sub: "5·4·3·2·1 · 실패 지점까지 안 가요",
    summary: "풀업 5세트 — 5회, 4회, 3회, 2회, 1회",
    howTo: PULLUP_LADDER_SOURCE_NOTE,
    exerciseName: PULLUP_EXERCISE_NAME,
    reps: PULLUP_LADDER_DAY1,
  },
];

function emptySet(): PlanSet {
  return { weightKg: 0, reps: 0, distanceKm: 0, durationMin: 0 };
}

/**
 * 추천 루틴 → `addRoutine`이 먹는 모양.
 *
 * 카탈로그에 종목이 없으면 **null**을 준다 — 부르는 쪽이 카드를 아예 안 낸다.
 * 시드 이름이 바뀌었을 때 "눌러도 아무 일도 안 일어나는 카드"를 남기지 않으려는
 * 것이다(`resolveNames`가 없는 이름을 빼는 것과 같은 규칙).
 */
export function buildPresetRoutineExercises(
  preset: PresetRoutine,
  catalog: readonly CatalogExercise[],
): PlanExercise[] | null {
  const item = catalog.find(
    (c) => c.name === preset.exerciseName && c.created_by === null,
  );
  if (!item) return null;

  return [
    {
      name: item.name,
      // ⚠️ 카탈로그 행에서 읽는다 — 위 주석 참조
      bodyPart: item.body_part,
      exerciseType: item.exercise_type,
      measure: item.measure,
      isCustom: false,
      sets: preset.reps.map((reps) => ({ ...emptySet(), reps })),
    },
  ];
}

/** 지금 화면에 낼 추천 루틴 — 카탈로그에 종목이 있는 것만 */
export function visiblePresetRoutines(
  catalog: readonly CatalogExercise[],
): PresetRoutine[] {
  return PRESET_ROUTINES.filter(
    (p) => buildPresetRoutineExercises(p, catalog) !== null,
  );
}
