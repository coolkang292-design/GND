import type { LocalExercise } from "@/lib/workout";
import type { CatalogExercise } from "@/lib/types";

/** 타바타 구성 운동 수 (설계 2026-07-19, 사용자 확정) */
export const TABATA_EXERCISE_COUNT = 4;

/** 한 라운드 = 20초 운동 + 10초 휴식 (타바타 프로토콜, 음원이 이 박자다) */
export const TABATA_ROUND_SECONDS = 30;

export type TabataMinutes = 4 | 8 | 16;

export const INTERVAL_COPY = {
  title: "4분부터 시작하는 전신 인터벌",
  short: "4분 인터벌",
  description: "음악에 맞춰 20초 운동 · 10초 휴식",
  start: "전신 인터벌 시작",
  stopConfirm: "전신 인터벌을 중단할까요? 운동은 기록되지 않아요.",
  session: (minutes: TabataMinutes) => `전신 인터벌 ${minutes}분`,
  // ── 인터벌 뒤 이어하기 (설계 2026-09-29) ──
  followUpLead: "인터벌 뒤에 이어서",
  followUpCount: (count: number) => `이어서 ${count}종목`,
  followUpAfterEnd: (count: number) => `음원이 끝나면 이어서 ${count}종목을 해요.`,
  followUpStart: "인터벌 끝! 숨 고르고 이어서 해요 💪",
  blockLocked: "인터벌 종목은 운동 중에 빼거나 옮길 수 없어요",
  leadingLocked: "인터벌 앞의 운동은 시작한 뒤에 뺄 수 없어요",
  removeViaCard: "인터벌은 목록의 인터벌 카드에서 통째로 뺄 수 있어요",
  // ── 운동 목록 안의 인터벌 (설계 2026-11-22) ──
  addToList: "운동 목록에 담기",
  addToListHint: "웨이트·유산소와 순서를 정해 한 번에 해요",
  onlyOnce: "인터벌은 한 번만 담을 수 있어요",
  alreadyInList: "이미 인터벌이 담겨 있어요. 목록의 인터벌을 눌러 코스를 바꾸세요",
  blockCardTitle: (minutes: number) => `전신 인터벌 ${minutes}분`,
  blockCardStart: "인터벌 시작",
  blockCardDone: "인터벌 완료",
  blockMoveUp: "위로",
  blockMoveDown: "아래로",
  blockRemove: "인터벌 빼기",
  inSessionLead: "코스와 구성은 정해졌어요. 준비되면 시작하세요. 끝나면 다음 운동으로 이어져요.",
  leaveConfirm: "인터벌을 멈추고 운동 목록으로 돌아갈까요? 다시 시작할 수 있어요.",
  leave: "목록으로 돌아가기",
} as const;

export type TabataTrack = {
  id: string;
  title: string;
  src: string;
  minutes: TabataMinutes;
  /** 별도 배경음을 쓰는 코스의 표시 이름 */
  musicTitle?: string;
};

/**
 * 내장 타바타 코스 — 8·16분은 4분 원본을 이어붙인 파일이다.
 *
 * ⚠️ 음원을 다시 만들면 **파일 이름의 버전도 올려라** (2026-08-13 `-v2`). 예전 8·16분
 *    파일은 이음매마다 4.98초가 빠져 있어서 화면 카운트다운이 음악보다 앞서 갔다.
 *    같은 이름으로 덮으면 브라우저·CDN이 **옛 파일을 계속 쓴다** — 고쳐 놓고도 안 맞는다.
 * `-v3` (2026-10-24, GND#22 배포 용량): v2를 256→128kbps로만 다시 인코딩했다(48kHz 스테레오).
 *    56MB → 28MB. 디코딩 길이는 원본과 같고, 준비·이음매·끝 15곳 상호상관 어긋남 0.0ms.
 * `4분 파일 반복` (2026-11-19, 배포 용량): 8·16분 파일은 4분 블록의 **그대로 반복**이라
 *    따로 두지 않는다. 세 코스가 같은 4분 파일을 가리키고, 시트가 `audio.loop`로 돌린다
 *    (`interval-loop.ts`). 56MB → 8MB. 4분 파일은 이름·내용이 그대로라 캐시 문제가 없다.
 *    ⚠️ 8·16분 전용 파일을 다시 만들지 마라 — `src`가 같아도 `minutes`가 블록 수를 정한다.
 * 추가는 여기 한 줄 (권리 확인된 사용자 제작 음원만).
 */
const TOTAL_BODY_BLOCK_SRC = "/audio/tabata-4min-total-body-v3.mp3";
const DYNAMITE_BLOCK_SRC = "/audio/tabata-4min-dynamite-v1.mp3";

export const TABATA_TRACKS: readonly TabataTrack[] = [
  {
    id: "total-body-4min",
    title: "4분 전신",
    src: TOTAL_BODY_BLOCK_SRC,
    minutes: 4,
  },
  {
    id: "total-body-8min",
    title: "8분 전신 (2회 반복)",
    src: TOTAL_BODY_BLOCK_SRC,
    minutes: 8,
  },
  {
    id: "total-body-16min",
    title: "16분 전신 (4회 반복)",
    src: TOTAL_BODY_BLOCK_SRC,
    minutes: 16,
  },
] as const;

/** 기본 음원과 같은 13초 준비·250초 블록으로 보정한 4분 파일을 반복한다. */
export const DYNAMITE_TABATA_TRACKS: readonly TabataTrack[] = TABATA_TRACKS.map(
  (track) => ({
    ...track,
    id: `dynamite-${track.minutes}min`,
    src: DYNAMITE_BLOCK_SRC,
    musicTitle: "Dynamite (Tabata)",
  }),
);

export function tabataTrackForMinutes(
  minutes: number,
  userId?: string | null,
): TabataTrack | null {
  // 계정별 재생 취향 설정이다. 인증·접근 권한 검사로 사용하지 않는다.
  // 실제 계정 고유번호는 코드 대신 gitignore 대상 .env.local에서 관리한다.
  const selectedUserIds = (
    process.env.NEXT_PUBLIC_INTERVAL_DYNAMITE_USER_IDS ?? ""
  ).split(",").map((id) => id.trim()).filter(Boolean);
  const tracks = userId && selectedUserIds.includes(userId)
    ? DYNAMITE_TABATA_TRACKS
    : TABATA_TRACKS;
  return tracks.find((track) => track.minutes === minutes) ?? null;
}

/**
 * 지난 기록을 **타바타로 되살릴지** 판정한다 (2026-08-07).
 *
 * 원래 버그: 기록 탭의 '지난 운동 불러오기'로 지난 타바타를 고르면 음원도
 * 코스도 없는 **맨몸 운동 4개**가 목록에 담겼다. 예정표는 코스를 싣고 다니는데
 * (0059) 이 경로만 안 실어서, 같은 기록을 어디서 부르느냐에 따라 결과가
 * 달랐다.
 *
 * **null이면 타바타가 아니다** — 부르는 쪽은 평소대로 목록에 담으면 된다.
 * 종목을 하나도 못 찾을 때도 null이다: 빈 타바타 시트를 열어 놓고 4개를 다시
 * 고르게 하느니, 이름만이라도 목록에 담기는 편이 낫다.
 */
export function tabataResumeFromSession(input: {
  session:
    | {
        tabataMinutes: number | null;
        exerciseNames: readonly string[];
        /** 비어 있으면 0 (2026-11-22 이전 기록) */
        intervalStartIndex?: number | null;
      }
    | undefined;
  catalog: CatalogExercise[];
}): { minutes: TabataMinutes; picked: CatalogExercise[] } | null {
  const minutes = asTabataMinutes(input.session?.tabataMinutes);
  if (!minutes || !input.session) return null;
  // 인터벌 세션의 5번째부터는 이어하기 종목이다 — 블록만 대조한다 (2026-09-29)
  const picked = tabataPickFromNames(
    intervalBlockNames(
      input.session.exerciseNames,
      input.session.intervalStartIndex,
    ),
    input.catalog,
  );
  return picked.length > 0 ? { minutes, picked } : null;
}

/**
 * DB·localStorage에서 온 값을 코스 분수로 받아들일지 판정한다 (2026-08-05).
 *
 * 음원이 없는 분수를 통과시키면 타바타 시트가 코스를 못 고른 채 열린다.
 * 아는 코스가 아니면 null — 부르는 쪽이 "일반 운동 계획"으로 다룬다.
 */
export function asTabataMinutes(value: unknown): TabataMinutes | null {
  const track = TABATA_TRACKS.find((t) => t.minutes === value);
  return track ? track.minutes : null;
}

/**
 * 코스 분수 → **종목당 라운드 수** = 기록에 남길 횟수 (2026-08-05).
 *
 * 4분 = 30초 × 8라운드이고 구성 운동이 4개라 종목마다 2라운드를 한다.
 * 8분이면 4회, 16분이면 8회. 예전에는 `reps: 0`으로 저장해서 지난 기록 상세가
 * 언제나 "0회"였다 — 사용자가 잡았다.
 *
 * ⚠️ 2를 박아두지 않는다. `TABATA_EXERCISE_COUNT`나 라운드 길이가 바뀌면
 * 이 값도 같이 바뀌어야 한다 (tabata.test.ts가 그 관계를 고정한다).
 */
export function tabataRepsForMinutes(minutes: TabataMinutes): number {
  const rounds = (minutes * 60) / TABATA_ROUND_SECONDS;
  return Math.max(1, Math.round(rounds / TABATA_EXERCISE_COUNT));
}

/** 선택한 운동들을 각 1세트(미완료) 임시운동으로 변환 — 종료 시 완료 처리된다 */
export function tabataDraftExercises(
  picked: CatalogExercise[],
  makeKey: () => string,
  minutes: TabataMinutes,
): LocalExercise[] {
  const reps = tabataRepsForMinutes(minutes);
  return picked.map((item) => ({
    key: makeKey(),
    name: item.name,
    bodyPart: item.body_part,
    exerciseType: item.exercise_type,
    measure: item.measure,
    isCustom: item.is_custom,
    sets: [
      {
        key: makeKey(),
        weightKg: 0,
        reps,
        distanceKm: 0,
        durationMin: 0,
        done: false,
      },
    ],
  }));
}

/** 이름 비교 규칙은 workout-import.ts와 같다 — 두 곳이 갈리면 복사가 어긋난다 */
function normalizedName(name: string): string {
  return name.trim().toLocaleLowerCase("ko-KR");
}

/**
 * 종목 **이름** 목록 → 타바타 구성 운동 (2026-08-05).
 *
 * 지난 기록·내 루틴에서 타바타를 다시 짤 때 쓴다. 이름만 있으면 되므로
 * `CalendarSession.exerciseNames`·`WorkoutRoutine.exercises`를 그대로 넘길 수
 * 있다 — **새 DB 질의가 필요 없다.**
 *
 * 카탈로그에 없는 이름(지운 커스텀 종목 등)은 건너뛰고, 중복은 한 번만 담고,
 * 종목이 많은 일반 운동 기록이면 앞에서 4개만 담는다.
 */
export function tabataPickFromNames(
  names: readonly string[],
  catalog: CatalogExercise[],
): CatalogExercise[] {
  const byName = new Map(
    catalog.map((item) => [normalizedName(item.name), item] as const),
  );
  const picked: CatalogExercise[] = [];
  const seen = new Set<string>();

  for (const name of names) {
    if (picked.length >= TABATA_EXERCISE_COUNT) break;
    const key = normalizedName(name);
    if (!key || seen.has(key)) continue;
    const item = byName.get(key);
    if (!item) continue;
    seen.add(key);
    picked.push(item);
  }
  return picked;
}

// ── 인터벌 블록 위치 (설계 2026-09-29 §4, 2026-11-22 시작 위치 추가) ─────────
//
// `tabata_minutes`가 있는 계획·draft·세션에서 **블록 = 인터벌 4종목**이다.
// 블록이 어디서 시작하는지는 `startIndex`(= `workout_sessions.interval_start_index`)가
// 말한다. **비어 있으면 0** — 2026-11-22 이전 기록 전부가 이 모양이고, 그때의
// "0~3번 = 블록, 4번~ = 이어하기" 규칙과 결과가 **같아야** 한다.
// 계획(`workout_plans`)은 ChatGPT가 DB에 직접 쓰므로(`docs/chatgpt-plan-rules.md`)
// 시작 위치를 싣지 않는다 — 계획은 언제나 0이다.
//
// 세션은 `saveSessionExercises`가 draft 순서대로 `sort_order: i`를 넣으므로
// 이 규칙이 저장까지 이어진다. 그래서 운동 중에는 블록을 가로질러 종목을 옮기지 못한다.
//
// ⚠️ 숫자 4를 다른 파일에 쓰지 마라. 여기 함수들을 거친다.

/** DB·draft의 시작 위치를 쓸 수 있는 값으로 — 비어 있거나 이상하면 0 */
export function normalizeIntervalStartIndex(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : 0;
}

/** 인터벌 계획·세션의 종목 이름 중 **블록만** — 카탈로그 대조는 이것만 한다 */
export function intervalBlockNames(
  names: readonly string[],
  startIndex?: number | null,
): string[] {
  const start = normalizeIntervalStartIndex(startIndex);
  return names.slice(start, start + TABATA_EXERCISE_COUNT);
}

/**
 * 인터벌을 앞(leading)·블록(block)·뒤(followUps)로 가른다.
 * 시작 위치가 0이면 leading은 비고, 4개 이하면 followUps도 빈다.
 */
export function splitIntervalPlan<T>(
  exercises: readonly T[],
  startIndex?: number | null,
): {
  leading: T[];
  block: T[];
  followUps: T[];
} {
  const start = normalizeIntervalStartIndex(startIndex);
  return {
    leading: exercises.slice(0, start),
    block: exercises.slice(start, start + TABATA_EXERCISE_COUNT),
    followUps: exercises.slice(start + TABATA_EXERCISE_COUNT),
  };
}

/**
 * 이 자리가 인터벌 블록인가.
 *
 * 인터벌 세션에서 자리(`sort_order`)를 모르면 **블록으로 본다.** 블록의
 * "반복"은 실제 횟수가 아니라 라운드 수라서, 모르는 행을 기록 비교에 넣으면
 * 가짜 기록 갱신이 뜬다. 모르면 빼는 쪽이 안전하다.
 * (2026-09-29 실측: 운영의 인터벌 세션 종목 116행은 전부 sort_order 0~3이다.)
 */
export function isIntervalBlockIndex(
  tabataMinutes: number | null | undefined,
  index: number | null | undefined,
  startIndex?: number | null,
): boolean {
  if (tabataMinutes === null || tabataMinutes === undefined) return false;
  if (index === null || index === undefined) return true;
  const start = normalizeIntervalStartIndex(startIndex);
  return index >= start && index < start + TABATA_EXERCISE_COUNT;
}

/**
 * 세트 기록 비교에 쓸 종목 — 인터벌 블록을 뺀다.
 *
 * 원칙: **인터벌 블록은 세트 기록 비교의 양쪽 어디에도 쓰지 않는다.** 8분
 * 코스의 "4회"는 라운드 수라, 지난 일반 기록이 3회면 "1회 더 하셨어요"가 뜬다.
 */
export function withoutIntervalBlock<T>(
  tabataMinutes: number | null | undefined,
  exercises: readonly T[],
  startIndex?: number | null,
): T[] {
  return exercises.filter(
    (_, index) => !isIntervalBlockIndex(tabataMinutes, index, startIndex),
  );
}

type IntervalDraftLike = {
  tabataMinutes: number | null;
  /** 비어 있으면 0 — 옛 draft·옛 세션 */
  intervalStartIndex?: number | null;
  exercises: readonly { key: string; sets: readonly { done: boolean }[] }[];
};

const hasUndone = (exercise: { sets: readonly { done: boolean }[] }) =>
  exercise.sets.some((set) => !set.done);

/**
 * 음원이 끝난 뒤 **블록 밖에 아직 할 종목이 있는가** — 있으면 운동을 끝내지 않는다.
 *
 * 예전에는 "5번째 종목이 있는가"였다. 시작 위치가 생기면서 블록 앞 종목도 있을
 * 수 있어, **안 한 세트가 남은 블록 밖 종목**으로 바꿨다. 앞 종목을 다 하고 인터벌이
 * 마지막이면 여기서 false가 되어 음원이 끝나는 순간 운동이 끝난다.
 */
export function hasIntervalFollowUps(draft: IntervalDraftLike): boolean {
  if (draft.tabataMinutes === null) return false;
  return draft.exercises.some(
    (exercise, index) =>
      !isIntervalBlockIndex(draft.tabataMinutes, index, draft.intervalStartIndex) &&
      hasUndone(exercise),
  );
}

/**
 * 인터벌 **차례**인가 — 무동작 감지를 끄는 조건이다.
 *
 * 블록에 안 끝난 세트가 있고, 블록 **앞**에 안 끝난 종목이 없을 때만 true다.
 * 앞 종목(웨이트 등)을 하는 동안은 사람이 세트를 누르므로 감지가 켜져 있어야 한다.
 * 이어하기도 마찬가지다 — 블록이 끝난 뒤에는 감지가 켜진다.
 *
 * ⚠️ 앞 종목을 건너뛰고 인터벌을 시작하는 경우는 이 함수로 못 잡는다. 화면이
 *    음원이 도는 동안(`intervalPlaying`)을 따로 더해서 끈다.
 */
export function intervalBlockPending(draft: IntervalDraftLike): boolean {
  if (draft.tabataMinutes === null) return false;
  const start = normalizeIntervalStartIndex(draft.intervalStartIndex);
  const leadingPending = draft.exercises.slice(0, start).some(hasUndone);
  if (leadingPending) return false;
  return draft.exercises
    .slice(start, start + TABATA_EXERCISE_COUNT)
    .some(hasUndone);
}

/** 음원이 끝났다 — 블록 4종의 세트만 완료로. 앞·뒤 종목은 건드리지 않는다 */
export function completeIntervalBlock(
  exercises: readonly LocalExercise[],
  startIndex?: number | null,
): LocalExercise[] {
  const start = normalizeIntervalStartIndex(startIndex);
  return exercises.map((exercise, index) =>
    index >= start && index < start + TABATA_EXERCISE_COUNT
      ? { ...exercise, sets: exercise.sets.map((set) => ({ ...set, done: true })) }
      : exercise,
  );
}

/**
 * 운동 중 이 종목이 인터벌 블록인가 — 빼기·건너뛰기·옮기기를 막는 데 쓴다.
 *
 * 블록이 빠지거나 자리를 바꾸면 저장되는 `sort_order`가 밀려서 이어하기
 * 종목이 블록 자리에 들어가고, 그 기록은 영영 "인터벌"로 취급된다.
 */
export function isIntervalBlockExercise(
  draft: {
    tabataMinutes: number | null;
    intervalStartIndex?: number | null;
    exercises: readonly { key: string }[];
  },
  exKey: string,
): boolean {
  const index = draft.exercises.findIndex((exercise) => exercise.key === exKey);
  return (
    index >= 0 &&
    isIntervalBlockIndex(draft.tabataMinutes, index, draft.intervalStartIndex)
  );
}

/**
 * 종목 하나를 `from` → `to`로 옮겨도 되는가 (운동 중·준비 중 공통).
 *
 * 블록 종목은 못 옮기고, **블록 건너편으로도 못 옮긴다** — 건너가면 블록 앞뒤 종목 수가
 * 바뀌어 저장된 시작 위치가 어긋난다. 블록 전체를 옮기는 것은 `moveIntervalBlock`.
 */
export function canMoveAcrossIntervalBlock(
  tabataMinutes: number | null | undefined,
  startIndex: number | null | undefined,
  from: number,
  to: number,
): boolean {
  if (tabataMinutes === null || tabataMinutes === undefined) return true;
  if (
    isIntervalBlockIndex(tabataMinutes, from, startIndex) ||
    isIntervalBlockIndex(tabataMinutes, to, startIndex)
  ) {
    return false;
  }
  const start = normalizeIntervalStartIndex(startIndex);
  const end = start + TABATA_EXERCISE_COUNT;
  return (from < start && to < start) || (from >= end && to >= end);
}

/**
 * 인터벌 블록을 **통째로** 새 위치로 옮긴다 (시작 전 준비 목록용).
 *
 * `toStart`는 옮긴 뒤 블록의 시작 위치다. 범위를 벗어나면 가장자리로 맞춘다.
 * 종목 목록과 새 시작 위치를 함께 돌려준다 — 둘이 어긋나면 안 되므로 한 번에 계산한다.
 */
export function moveIntervalBlock<T>(
  exercises: readonly T[],
  startIndex: number | null | undefined,
  toStart: number,
): { exercises: T[]; startIndex: number } {
  const start = normalizeIntervalStartIndex(startIndex);
  const block = exercises.slice(start, start + TABATA_EXERCISE_COUNT);
  const rest = [
    ...exercises.slice(0, start),
    ...exercises.slice(start + TABATA_EXERCISE_COUNT),
  ];
  const target = Math.min(Math.max(Math.trunc(toStart), 0), rest.length);
  return {
    exercises: [...rest.slice(0, target), ...block, ...rest.slice(target)],
    startIndex: target,
  };
}

/**
 * 시작 전 준비 목록에서 종목 하나를 `from` → `to`로 옮긴다 — **블록이 깨지지 않게**.
 *
 * - 블록 **밖** 종목끼리 같은 쪽에서 옮기면 그냥 옮긴다.
 * - 블록 밖 종목이 블록을 건너가면 블록의 시작 위치가 한 칸 바뀐다 (새 위치를 같이 돌려준다).
 * - 블록 종목을 옮기면 **블록 전체**가 따라 움직인다 (낱개로 떼지 못한다).
 * - 종목이 블록 한가운데로 들어가게 되는 이동은 `null` (막는다).
 *
 * 운동을 **시작한 뒤에는 쓰지 않는다** — 저장되는 시작 위치(DB)가 이미 정해졌다.
 * 그때는 `canMoveAcrossIntervalBlock`으로 같은 쪽 이동만 허용한다.
 */
export function reorderWithIntervalBlock<T>(
  exercises: readonly T[],
  startIndex: number | null | undefined,
  from: number,
  to: number,
): { exercises: T[]; startIndex: number } | null {
  const start = normalizeIntervalStartIndex(startIndex);
  const end = start + TABATA_EXERCISE_COUNT;
  if (from < 0 || from >= exercises.length || to < 0 || to >= exercises.length) {
    return null;
  }
  if (from === to) return { exercises: [...exercises], startIndex: start };

  const fromInBlock = from >= start && from < end;
  const toInBlock = to >= start && to < end;

  if (fromInBlock) {
    // 블록 안에서 자리를 바꾸는 것은 막는다 (블록 안의 순서는 코스가 정한다)
    if (toInBlock) return null;
    return moveIntervalBlock(exercises, start, to < start ? to : to - (TABATA_EXERCISE_COUNT - 1));
  }

  const moved = [...exercises];
  const [item] = moved.splice(from, 1);
  moved.splice(to, 0, item);
  const blockFirst = exercises[start];
  const newStart = blockFirst === undefined ? start : moved.indexOf(blockFirst);
  // 블록이 한 덩어리로 남았는지 확인 — 종목이 블록 사이로 끼어들면 막는다
  for (let i = 0; i < TABATA_EXERCISE_COUNT; i += 1) {
    if (blockFirst !== undefined && moved[newStart + i] !== exercises[start + i]) {
      return null;
    }
  }
  return { exercises: moved, startIndex: newStart };
}

/**
 * 시작 전 목록에서 `removeIndex` 자리의 종목을 뺀 뒤의 **블록 시작 위치**.
 * 블록 앞의 종목을 빼면 블록이 한 칸 앞으로 당겨진다. (블록 종목 자체는 못 뺀다.)
 */
export function startIndexAfterRemoval(
  startIndex: number | null | undefined,
  removeIndex: number,
): number {
  const start = normalizeIntervalStartIndex(startIndex);
  return removeIndex >= 0 && removeIndex < start ? start - 1 : start;
}

/**
 * 이 종목이 인터벌 블록 **앞**에 있는가.
 *
 * 운동을 시작한 뒤에는 이런 종목을 빼면 안 된다 — 빼면 저장되는 `sort_order`가 한 칸씩 당겨져
 * DB에 적힌 시작 위치와 어긋난다(블록 첫 종목이 앞 종목으로 읽힌다).
 */
export function isBeforeIntervalBlock(
  draft: {
    tabataMinutes: number | null;
    intervalStartIndex?: number | null;
    exercises: readonly { key: string }[];
  },
  exKey: string,
): boolean {
  if (draft.tabataMinutes === null) return false;
  const index = draft.exercises.findIndex((exercise) => exercise.key === exKey);
  return index >= 0 && index < normalizeIntervalStartIndex(draft.intervalStartIndex);
}

/**
 * 인터벌 블록이 **카드 한 장**으로 묶여 보일 때, 그 뒤 종목 카드의 번호(0부터).
 *
 * 블록 4종목이 번호 없는 카드 한 장이 되므로 뒤 종목은 4칸씩 당겨 센다.
 * 안 당기면 `벤치프레스 1 · (인터벌) · 트레드밀 6 · 런지 7`처럼 번호가 건너뛴다.
 */
export function cardNumberIndex(
  index: number,
  startIndex: number | null | undefined,
): number {
  const end = normalizeIntervalStartIndex(startIndex) + TABATA_EXERCISE_COUNT;
  return index >= end ? index - TABATA_EXERCISE_COUNT : index;
}

/**
 * 루틴(`workout_routines`)에 함께 저장할 코스 분수.
 *
 * 루틴·계획·지난 기록은 "앞 4개가 블록"인 모양만 안다(시작 위치를 싣지 않는다). 블록이
 * 가운데나 뒤에 있는 목록을 분수와 함께 저장하면 나중에 불러올 때 **웨이트가 인터벌 블록으로
 * 읽힌다.** 그래서 시작 위치가 0이 아니면 분수를 빼고 일반 루틴으로 저장한다.
 */
export function routineTabataMinutes(
  tabataMinutes: number | null | undefined,
  startIndex: number | null | undefined,
): number | null {
  if (tabataMinutes === null || tabataMinutes === undefined) return null;
  return normalizeIntervalStartIndex(startIndex) === 0 ? tabataMinutes : null;
}

/** 배너·카드의 한 줄 — `푸시업 · 버드독 · 데드버그 · 크런치 · 이어서 4종목` */
export function intervalPlanLine(
  names: readonly string[],
  startIndex?: number | null,
): string {
  const { block, followUps } = splitIntervalPlan(names, startIndex);
  const head = block.join(" · ");
  return followUps.length > 0
    ? `${head} · ${INTERVAL_COPY.followUpCount(followUps.length)}`
    : head;
}

/**
 * 폰의 운동 목록이 **오늘 인터벌 계획의 앞 4종(블록)만 담은 옛 복사본**인가 (2026-11-22).
 *
 * 이어하기를 담기 전 버전에서 '운동 목록에 담기'를 누르면 계획의 인터벌 4종만 목록에 들어갔다
 * (오뎅끼데스까님 폰: 계획은 12종인데 목록·카드는 4종). 계획이 가진 이어하기(웨이트 등)를 잃은
 * 상태라서, 이 목록은 **계획으로 갈아 끼워도 잃는 것이 없다**. 사용자가 직접 종목을 더했거나
 * 4종이 다르면 아니다 — 그 목록은 건드리지 않는다.
 */
export function isBlockOnlyCopyOfPlan(
  draftNames: readonly string[],
  planNames: readonly string[],
): boolean {
  if (draftNames.length !== TABATA_EXERCISE_COUNT) return false;
  if (planNames.length <= TABATA_EXERCISE_COUNT) return false;
  return intervalBlockNames(planNames).every((name, index) => name === draftNames[index]);
}

/**
 * 인터벌 카드의 **이어서 줄** — 블록 뒤 종목의 이름 (2026-11-22).
 *
 * 한 줄 카드는 "… · 이어서 8종목"으로만 말해서, 인터벌 계획 뒤에 웨이트를 이어 붙인 계획이
 * **웨이트가 사라지고 인터벌만 남은 것처럼** 보였다(사용자 신고). 앞 4개만 이름으로 적고 나머지는
 * 개수로 줄인다. 이어하기가 없으면 null.
 */
export function intervalFollowUpLine(
  names: readonly string[],
  startIndex?: number | null,
): string | null {
  const { followUps } = splitIntervalPlan(names, startIndex);
  if (followUps.length === 0) return null;
  const shown = followUps.slice(0, 4).join(" · ");
  const rest = followUps.length - 4;
  return rest > 0 ? `이어서 ${shown} 외 ${rest}종목` : `이어서 ${shown}`;
}

/**
 * 일반 세션 조회와 인터벌 세션 조회를 최신순 하나로 (2026-09-29).
 *
 * 둘을 **따로** 조회하는 이유: 한 조회로 합치면 인터벌 세션이 한도(20·40)를
 * 먹어 일반 기록이 밀려난다. 따로 가져오면 일반 쪽 결과는 예전과 같다.
 */
export function mergeRecentSessions<S extends { completed_at: string }>(
  regular: readonly S[],
  interval: readonly S[],
): S[] {
  return [...regular, ...interval].sort(
    (a, b) => Date.parse(b.completed_at) - Date.parse(a.completed_at),
  );
}

/**
 * AI 코치가 분석할 **이번 세션** 종목 (2026-09-29, 개발 서버 확인에서 발견).
 *
 * 이어하기가 있는 인터벌 세션이면 블록을 뺀다. 블록의 반복은 라운드 수라,
 * 넣으면 "푸시업 30회 → 2회, 크게 줄었다 · 이전 수준으로 회복하세요" 같은
 * 틀린 주의가 **인터벌을 한 날마다** 뜬다(픽스처 A에서 실제로 떴다).
 *
 * 순수 인터벌(블록만 있음)은 **예전 그대로** 둔다. 빼면 분석할 종목이 하나도
 * 남지 않는데, 그때 코치가 무엇을 말해야 하는지는 이번 범위가 아니다.
 */
export function coachSessionRows<R extends { sort_order: number | null }>(
  tabataMinutes: number | null | undefined,
  rows: readonly R[],
  startIndex?: number | null,
): R[] {
  const kept = rows.filter(
    (row) => !isIntervalBlockIndex(tabataMinutes, row.sort_order, startIndex),
  );
  return kept.length > 0 ? kept : [...rows];
}


/**
 * 인터벌 시트의 "오늘 계획으로 저장"이 **어느 계획에 쓸지** (사용자 지시 2026-11-17).
 *
 * - 예정표에서 연 시트(`prefillPlanId`)면 그 계획을 고친다. 그 계획이 이미 없으면 새로 만든다.
 * - 퀘스트·`4분 인터벌`처럼 계획 없이 연 시트는, 오늘 인터벌 계획이 **정확히 하나**일 때만 그걸 고친다 —
 *   같은 날 인터벌 카드가 둘이 되지 않게. 둘 이상이면 어느 것인지 모르니 새로 만든다(엉뚱한 계획을 덮지 않는다).
 * - 일반 계획(`tabataMinutes` 없음)은 건드리지 않는다.
 */
export function intervalSaveTarget(
  todayPlans: readonly { id: string; tabataMinutes: number | null }[],
  prefillPlanId?: string | null,
): { kind: "update"; planId: string } | { kind: "create" } {
  if (prefillPlanId && todayPlans.some((plan) => plan.id === prefillPlanId)) {
    return { kind: "update", planId: prefillPlanId };
  }
  const intervals = todayPlans.filter((plan) => plan.tabataMinutes);
  if (!prefillPlanId && intervals.length === 1) {
    return { kind: "update", planId: intervals[0].id };
  }
  return { kind: "create" };
}
