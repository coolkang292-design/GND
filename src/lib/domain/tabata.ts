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
} as const;

export type TabataTrack = {
  id: string;
  title: string;
  src: string;
  minutes: TabataMinutes;
};

/**
 * 내장 타바타 코스 — 8·16분은 4분 원본을 이어붙인 파일이다.
 *
 * ⚠️ 파일 이름의 `-v2`를 지우지 마라 (2026-08-13). 예전 8·16분 파일은 이음매마다
 *    4.98초가 빠져 있어서 화면 카운트다운이 음악보다 앞서 갔다. 같은 이름으로
 *    덮으면 브라우저·CDN이 **옛 파일을 계속 쓴다** — 고쳐 놓고도 안 맞는다.
 *    음원을 다시 만들면 이름도 올려라.
 * 추가는 여기 한 줄 (권리 확인된 사용자 제작 음원만).
 */
export const TABATA_TRACKS: readonly TabataTrack[] = [
  {
    id: "total-body-4min",
    title: "4분 전신",
    src: "/audio/tabata-4min-total-body.mp3",
    minutes: 4,
  },
  {
    id: "total-body-8min",
    title: "8분 전신 (2회 반복)",
    src: "/audio/tabata-8min-total-body-v2.mp3",
    minutes: 8,
  },
  {
    id: "total-body-16min",
    title: "16분 전신 (4회 반복)",
    src: "/audio/tabata-16min-total-body-v2.mp3",
    minutes: 16,
  },
] as const;

export function tabataTrackForMinutes(minutes: number): TabataTrack | null {
  return TABATA_TRACKS.find((track) => track.minutes === minutes) ?? null;
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
    | { tabataMinutes: number | null; exerciseNames: readonly string[] }
    | undefined;
  catalog: CatalogExercise[];
}): { minutes: TabataMinutes; picked: CatalogExercise[] } | null {
  const minutes = asTabataMinutes(input.session?.tabataMinutes);
  if (!minutes || !input.session) return null;
  const picked = tabataPickFromNames(input.session.exerciseNames, input.catalog);
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
