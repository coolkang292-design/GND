import type { ExercisePrescription } from "./workout-plan";
import type { TabataMinutes } from "./tabata";
import type { CatalogExercise } from "../types";

export type OfficialProgramKey =
  | "shoulder-frame-6w"
  | "chest-frame-6w"
  | "arm-outline-6w"
  | "lower-balance-6w"
  | "lean-body-6w"
  | "interval-burn-6w"
  | "pullup-ladder-18";

/**
 * 난이도 3단계 (설계 2026-08-12 §3.2).
 *
 * 기존 근력 5종은 `beginner`·`experienced` 둘만 쓴다 — 세트 수를 가른다.
 * 인터벌은 셋 다 쓰고 **종목 자체**가 갈린다. 라벨은 프로그램이 준다
 * (`levelLabels`) — 근력은 `초보/운동 경험 있음`, 인터벌은 `입문/보통/높음`.
 */
export type ProgramLevel = "beginner" | "moderate" | "experienced";

export const PROGRAM_LEVELS = [
  "beginner",
  "moderate",
  "experienced",
] as const satisfies readonly ProgramLevel[];

export type OfficialProgramRestSeconds = 60 | 75 | 90 | 120 | 150;

export type ProgramExerciseTemplate = ExercisePrescription & {
  restSeconds: OfficialProgramRestSeconds;
  exerciseName: string;
  beginnerSets: number;
  experiencedSets: number;
};

type ProgramExerciseInput = {
  name: string;
  sets: readonly [beginner: number, experienced: number];
  reps: readonly [min: number, max: number];
  targetRir?: 1 | 2 | 3;
  restSeconds: OfficialProgramRestSeconds;
  loadStepKg: 1 | 2.5 | 5;
};

const ex = ({
  name,
  sets,
  reps,
  targetRir = 2,
  restSeconds,
  loadStepKg,
}: ProgramExerciseInput): ProgramExerciseTemplate => ({
  exerciseName: name,
  beginnerSets: sets[0],
  experiencedSets: sets[1],
  repsMin: reps[0],
  repsMax: reps[1],
  targetRir,
  restSeconds,
  loadStepKg,
});

/**
 * 어느 종류든 카탈로그 카드에 서려면 있어야 하는 것.
 *
 * `coverImage`·`weeks`·`sessionsPerWeek`는 **여기 없다.** 사다리(2026-09-04)는
 * 사진 대신 숫자를 표지로 쓰고, 6주 A/B/C 구조가 아니다. 그 셋을 공통으로
 * 두면 사다리가 쓰지 않는 값을 지어내서 채워야 한다.
 */
type ProgramMetaBase = {
  key: OfficialProgramKey;
  version: 1;
  eyebrow: string;
  title: string;
  description: string;
  durationMinutes: readonly [number, number];
  /** 난이도 라벨 — 없으면 근력 기본값(`초보`·`운동 경험 있음`) */
  levelLabels?: Partial<Record<ProgramLevel, string>>;
};

type ProgramMeta = ProgramMetaBase & {
  coverImage: string;
  weeks: 6;
  sessionsPerWeek: 3;
};

/** 근력 프로그램 — 기존 5종. `kind`가 없으면 이것이다. */
export type StrengthProgram = ProgramMeta & {
  kind?: "strength";
  sessions: readonly {
    key: "A" | "B" | "C";
    title: string;
    exercises: readonly ProgramExerciseTemplate[];
  }[];
};

/**
 * 인터벌 회차의 한 칸 (설계 2026-08-12 §3.3).
 *
 * 근력 처방(반복·휴식·증량)이 **없다.** 20초 운동 / 10초 휴식은 음원이 정하고,
 * 회차 길이는 주차가 정한다(`minutesByWeek`). 그래서 여기 담을 것은 슬롯과
 * 난이도별 종목명뿐이다.
 */
export type IntervalExerciseTemplate = {
  slot: IntervalSlot;
  /** 문자열이면 세 난이도가 같은 종목을 쓴다 */
  exerciseName: string | Record<ProgramLevel, string>;
};

/**
 * 4종목을 기능 슬롯으로 고정한다 — 한 라운드에 같은 부위를 연속으로 때리면
 * 자세가 먼저 무너진다 (설계 §3.3).
 */
export type IntervalSlot = "lower" | "push" | "core" | "total";

export const INTERVAL_SLOTS = [
  "lower",
  "push",
  "core",
  "total",
] as const satisfies readonly IntervalSlot[];

export type IntervalProgram = ProgramMeta & {
  kind: "interval";
  levelLabels: Record<ProgramLevel, string>;
  /** 난이도별 1~6주차 회차 길이 (분). 음원이 4·8·16분뿐이다 */
  minutesByWeek: Record<ProgramLevel, readonly TabataMinutes[]>;
  sessions: readonly {
    key: "A" | "B" | "C";
    title: string;
    exercises: readonly IntervalExerciseTemplate[];
  }[];
};

/**
 * 사다리 회차 (2026-09-04) — 세 번째 종류.
 *
 * 근력·인터벌과 셋 다 다른 점이 회차 **모양**에 있다.
 *
 * | | 근력 | 인터벌 | 사다리 |
 * |---|---|---|---|
 * | 회차당 종목 | 5~6 | 4 | **1** |
 * | 종목당 세트 | 1~4 | 1 | **5** |
 * | 세트별 목표 | 없음(처방이 범위를 준다) | 없음 | **세트마다 다른 횟수** |
 * | 회차를 정하는 것 | 템플릿 A·B·C | 난이도 + 주차 | **회차 번호(며칠째)** |
 *
 * 마지막 줄이 핵심이다. 근력은 템플릿 3개를 18회차에 돌려쓰지만 사다리는
 * **18회차가 전부 다르다** — 그래서 템플릿을 들고 있지 않고, 회차 번호에서
 * `ladderRepsForDay`로 즉석에서 만든다.
 *
 * ⚠️ 그래도 DB에는 `template_key`가 A·B·C로 돌아간다. 등록 RPC가 위치로
 *    강제하기 때문이다(0066). 사다리에서 그 값은 **아무 뜻이 없고 아무도 안
 *    읽는다.** 며칠째인지는 `program_week`·`program_session`이 말해 준다
 *    (`ladderDayOfSession`).
 */
export type LadderProgram = ProgramMetaBase & {
  kind: "ladder";
  /** 카탈로그 시드 이름과 **글자까지** 같아야 한다 */
  exerciseName: string;
  /** 세트 사이 휴식. 원문은 값을 주지 않는다 — 아래 프로그램 주석 참조 */
  restSeconds: OfficialProgramRestSeconds;
  /** 화면이 권하는 주당 횟수. 원문의 "5일 훈련 1일 휴식"에 가장 가깝다 */
  recommendedSessionsPerWeek: 5;
  /** 진행 규칙을 사람 말로 — 화면과 출처를 잇는 한 줄 */
  sourceNote: string;
};

export type OfficialProgram = StrengthProgram | IntervalProgram | LadderProgram;

export function isIntervalProgram(
  program: OfficialProgram,
): program is IntervalProgram {
  return program.kind === "interval";
}

export function isLadderProgram(
  program: OfficialProgram,
): program is LadderProgram {
  return program.kind === "ladder";
}

export type ResolvedProgramExercise = ProgramExerciseTemplate & {
  item: CatalogExercise;
};

export function resolveProgram(
  program: StrengthProgram,
  catalog: readonly CatalogExercise[],
): readonly {
  key: "A" | "B" | "C";
  title: string;
  exercises: readonly ResolvedProgramExercise[];
}[] {
  const catalogByName = new Map(
    catalog
      .filter((item) => item.created_by === null)
      .map((item) => [item.name, item]),
  );
  const requiredNames = [
    ...new Set(
      program.sessions.flatMap((session) =>
        session.exercises.map((exercise) => exercise.exerciseName),
      ),
    ),
  ];
  const missing = requiredNames.filter((name) => !catalogByName.has(name));

  if (missing.length > 0) {
    throw new Error(`program_exercise_missing:${missing.join(",")}`);
  }

  return program.sessions.map((session) => ({
    key: session.key,
    title: session.title,
    exercises: session.exercises.map((exercise) => ({
      ...exercise,
      item: catalogByName.get(exercise.exerciseName)!,
    })),
  }));
}

/**
 * 등록 화면이 보여 줄 난이도 선택지.
 *
 * 근력은 **두 개**다 — `moderate`를 쓰지 않는다. 기존 5종에서 난이도는 세트
 * 수만 가르고, 가운데 값이 무엇을 뜻하는지 정의된 적이 없다.
 *
 * ⚠️ 라벨은 프로그램이 준다. 같은 `experienced`가 근력에서는 "운동 경험 있음",
 *    인터벌에서는 "높음"으로 읽힌다 (설계 §3.2).
 */
export function programLevelOptions(
  program: OfficialProgram,
): readonly { value: ProgramLevel; label: string }[] {
  /*
    사다리는 난이도를 **묻지 않는다** — 최대 개수를 숫자로 받는다
    (2026-09-04). 빈 목록을 주면 화면이 라디오를 아예 안 그린다. 여기서
    한 칸이라도 돌려주면 아무 뜻 없는 선택지가 화면에 선다.
  */
  if (isLadderProgram(program)) return [];
  const values: readonly ProgramLevel[] = isIntervalProgram(program)
    ? PROGRAM_LEVELS
    : ["beginner", "experienced"];
  const fallback: Record<ProgramLevel, string> = {
    beginner: "초보",
    moderate: "보통",
    experienced: "운동 경험 있음",
  };
  return values.map((value) => ({
    value,
    label: program.levelLabels?.[value] ?? fallback[value],
  }));
}

/** 난이도 묶음의 제목 — 인터벌은 강도를, 근력은 경험을 묻는다 */
export function programLevelLegend(program: OfficialProgram): string {
  if (isLadderProgram(program)) return "지금 최대 개수";
  return isIntervalProgram(program) ? "난이도" : "운동 경험";
}

/** 난이도에 해당하는 종목명. 문자열이면 세 난이도가 같다. */
export function intervalExerciseName(
  template: IntervalExerciseTemplate,
  level: ProgramLevel,
): string {
  return typeof template.exerciseName === "string"
    ? template.exerciseName
    : template.exerciseName[level];
}

/**
 * 주차가 정하는 회차 길이 (설계 §3.4).
 *
 * ⚠️ 입문은 16분에 **가지 않는다.** 16분은 32라운드·종목당 8라운드다. 점프도 안 해
 *    본 사람이 5주차에 그걸 하면 그 주에 그만둔다. 입문을 마친 사람의 다음 단계는
 *    **보통으로 다시 등록**하는 것이다. `interval-burn.test.ts`가 이걸 단언한다.
 */
export function intervalMinutesForWeek(
  program: IntervalProgram,
  level: ProgramLevel,
  week: number,
): TabataMinutes {
  const byWeek = program.minutesByWeek[level];
  if (!Number.isInteger(week) || week < 1 || week > byWeek.length) {
    throw new Error(`program_invalid_week:${week}`);
  }
  return byWeek[week - 1];
}

export type ResolvedIntervalExercise = {
  slot: IntervalSlot;
  exerciseName: string;
  item: CatalogExercise;
};

/**
 * 난이도를 골라 인터벌 회차를 실제 카탈로그 항목으로 합친다.
 *
 * `resolveProgram`과 나눠 놓은 이유: 근력은 처방(반복·휴식·증량)을 실어 나르고
 * 인터벌은 슬롯과 종목만 나른다. 한 함수로 합치면 양쪽 모두에서 쓰지 않는 필드를
 * 들고 다니게 된다.
 */
export function resolveIntervalProgram(
  program: IntervalProgram,
  level: ProgramLevel,
  catalog: readonly CatalogExercise[],
): readonly {
  key: "A" | "B" | "C";
  title: string;
  exercises: readonly ResolvedIntervalExercise[];
}[] {
  const catalogByName = new Map(
    catalog
      .filter((item) => item.created_by === null)
      .map((item) => [item.name, item]),
  );
  const names = program.sessions.flatMap((session) =>
    session.exercises.map((exercise) => intervalExerciseName(exercise, level)),
  );
  const missing = [...new Set(names)].filter(
    (name) => !catalogByName.has(name),
  );
  if (missing.length > 0) {
    throw new Error(`program_exercise_missing:${missing.join(",")}`);
  }

  return program.sessions.map((session) => ({
    key: session.key,
    title: session.title,
    exercises: session.exercises.map((exercise) => {
      const exerciseName = intervalExerciseName(exercise, level);
      return {
        slot: exercise.slot,
        exerciseName,
        item: catalogByName.get(exerciseName)!,
      };
    }),
  }));
}

/** 슬롯 4개를 난이도별 종목으로 채운다 — 표(설계 §3.3)를 그대로 옮기기 위한 헬퍼 */
function intervalSession(
  key: "A" | "B" | "C",
  title: string,
  rows: Record<IntervalSlot, Record<ProgramLevel, string>>,
): IntervalProgram["sessions"][number] {
  return {
    key,
    title,
    exercises: INTERVAL_SLOTS.map((slot) => ({
      slot,
      exerciseName: rows[slot],
    })),
  };
}

/**
 * 고강도 인터벌 6주 (설계 2026-08-12).
 *
 * ⚠️ 9조합 36칸은 **기본값이지 처방이 아니다.** 의학·전문가 검수를 거치지 않았다.
 *    36칸이 전부 `exercise_catalog` 시드에 실재하는 맨몸 종목인 것과, 시간형
 *    (플랭크·월 싯 등)이 섞이지 않은 것은 테스트가 지킨다 — 지금 인터벌 기록은
 *    횟수로 저장돼서(`tabataRepsForMinutes`) 시간형이 들어가면 어긋난다.
 *
 * ⚠️ 당기기(풀업·인버티드 로우)는 뺐다 — 철봉이 있어야 해서 집에서 못 한다.
 */
export const INTERVAL_PROGRAM: IntervalProgram = {
  key: "interval-burn-6w",
  version: 1,
  kind: "interval",
  eyebrow: "짧고 굵게 태우는 전신",
  title: "기구 없이 4분부터 시작하는 6주",
  description:
    "20초 운동 · 10초 휴식을 반복하는 고강도 인터벌입니다. 난이도를 고르면 종목이 정해지고, 6주 동안 회차 길이가 자랍니다.",
  durationMinutes: [4, 16],
  coverImage: "/program-assets/interval.webp",
  weeks: 6,
  sessionsPerWeek: 3,
  levelLabels: {
    beginner: "입문",
    moderate: "보통",
    experienced: "높음",
  },
  minutesByWeek: {
    // 입문은 8분에서 멈춘다 — 위 주석 참조
    beginner: [4, 4, 8, 8, 8, 8],
    moderate: [4, 4, 8, 8, 16, 16],
    experienced: [8, 8, 16, 16, 16, 16],
  },
  sessions: [
    intervalSession("A", "전신 인터벌 A", {
      lower: {
        beginner: "맨몸 스쿼트",
        moderate: "리버스 런지",
        experienced: "점프 스쿼트",
      },
      push: {
        beginner: "니 푸시업",
        moderate: "푸시업",
        experienced: "와이드 푸시업",
      },
      core: {
        beginner: "데드버그",
        moderate: "마운틴 클라이머",
        experienced: "브이 업",
      },
      total: {
        beginner: "마운틴 클라이머",
        moderate: "점핑잭",
        experienced: "버피",
      },
    }),
    intervalSession("B", "전신 인터벌 B", {
      lower: {
        beginner: "와이드 스쿼트",
        moderate: "사이드 런지",
        experienced: "피스톨 스쿼트",
      },
      push: {
        beginner: "라잉 Y 레이즈",
        moderate: "파이크 푸시업",
        experienced: "타이슨 푸시업",
      },
      core: {
        beginner: "버드독",
        moderate: "바이시클 크런치",
        experienced: "러시안 트위스트",
      },
      total: {
        beginner: "인치웜 푸시업",
        moderate: "하이 니",
        experienced: "하이 니",
      },
    }),
    intervalSession("C", "전신 인터벌 C", {
      lower: {
        beginner: "리버스 런지",
        moderate: "런지",
        experienced: "점프 스쿼트",
      },
      push: {
        beginner: "니 푸시업",
        moderate: "와이드 푸시업",
        experienced: "인치웜 푸시업",
      },
      core: {
        beginner: "슈퍼맨 로우",
        moderate: "레그 레이즈",
        experienced: "플러터 킥",
      },
      total: {
        beginner: "마운틴 클라이머",
        moderate: "점핑잭",
        experienced: "버피",
      },
    }),
  ],
};

/**
 * 근력 5종. 인터벌과 분리해 둔다 — 처방·세트 수를 단언하는 테스트가 이 목록을
 * 돈다. 화면이 쓰는 것은 아래 `OFFICIAL_PROGRAMS`(6종)다.
 */
export const STRENGTH_PROGRAMS = [
  {
    key: "shoulder-frame-6w",
    version: 1,
    eyebrow: "시선이 머무는 어깨",
    title: "상체의 틀을 넓히는 6주",
    description: "어깨와 등을 중심으로 상체의 균형 잡힌 틀을 만듭니다.",
    durationMinutes: [50, 65],
    coverImage: "/program-assets/shoulder.webp",
    weeks: 6,
    sessionsPerWeek: 3,
    sessions: [
      {
        key: "A",
        title: "밀고 세우기",
        exercises: [
          ex({
            name: "바벨 백스쿼트",
            sets: [3, 3],
            reps: [6, 10],
            restSeconds: 150,
            loadStepKg: 5,
          }),
          ex({
            name: "벤치프레스",
            sets: [3, 3],
            reps: [6, 10],
            restSeconds: 150,
            loadStepKg: 5,
          }),
          ex({
            name: "시티드 로우",
            sets: [3, 3],
            reps: [8, 12],
            restSeconds: 120,
            loadStepKg: 5,
          }),
          ex({
            name: "숄더프레스",
            sets: [2, 3],
            reps: [8, 12],
            restSeconds: 120,
            loadStepKg: 5,
          }),
          ex({
            name: "사이드 레터럴 레이즈",
            sets: [2, 3],
            reps: [12, 20],
            restSeconds: 75,
            loadStepKg: 2.5,
          }),
        ],
      },
      {
        key: "B",
        title: "등판과 뒤쪽 어깨",
        exercises: [
          ex({
            name: "루마니안 데드리프트",
            sets: [3, 3],
            reps: [6, 10],
            restSeconds: 150,
            loadStepKg: 5,
          }),
          ex({
            name: "랫풀다운",
            sets: [3, 3],
            reps: [8, 12],
            restSeconds: 120,
            loadStepKg: 5,
          }),
          ex({
            name: "인클라인 벤치프레스",
            sets: [3, 3],
            reps: [8, 12],
            restSeconds: 120,
            loadStepKg: 5,
          }),
          ex({
            name: "페이스풀",
            sets: [2, 3],
            reps: [12, 20],
            restSeconds: 75,
            loadStepKg: 2.5,
          }),
          ex({
            name: "덤벨 컬",
            sets: [2, 2],
            reps: [10, 15],
            restSeconds: 75,
            loadStepKg: 2.5,
          }),
        ],
      },
      {
        key: "C",
        title: "옆선과 전신 균형",
        exercises: [
          ex({
            name: "레그프레스",
            sets: [3, 3],
            reps: [8, 12],
            restSeconds: 150,
            loadStepKg: 5,
          }),
          ex({
            name: "덤벨 벤치프레스",
            sets: [3, 3],
            reps: [8, 12],
            restSeconds: 120,
            loadStepKg: 2.5,
          }),
          ex({
            name: "바벨 로우",
            sets: [3, 3],
            reps: [8, 12],
            restSeconds: 120,
            loadStepKg: 5,
          }),
          ex({
            name: "덤벨 레터럴 레이즈",
            sets: [3, 4],
            reps: [12, 20],
            restSeconds: 75,
            loadStepKg: 2.5,
          }),
          ex({
            name: "페이스풀",
            sets: [2, 2],
            reps: [12, 20],
            restSeconds: 75,
            loadStepKg: 2.5,
          }),
          ex({
            name: "케이블 푸시다운",
            sets: [2, 2],
            reps: [10, 15],
            restSeconds: 75,
            loadStepKg: 2.5,
          }),
        ],
      },
    ],
  },
  {
    key: "chest-frame-6w",
    version: 1,
    eyebrow: "티셔츠 핏을 살리는 가슴",
    title: "두껍고 탄탄한 상체를 만드는 6주",
    description: "가슴을 중심으로 상체 앞면의 힘과 형태를 만듭니다.",
    durationMinutes: [50, 65],
    coverImage: "/program-assets/chest.webp",
    weeks: 6,
    sessionsPerWeek: 3,
    sessions: [
      {
        key: "A",
        title: "기본 압박",
        exercises: [
          ex({
            name: "바벨 백스쿼트",
            sets: [3, 3],
            reps: [6, 10],
            restSeconds: 150,
            loadStepKg: 5,
          }),
          ex({
            name: "벤치프레스",
            sets: [3, 3],
            reps: [6, 10],
            restSeconds: 150,
            loadStepKg: 5,
          }),
          ex({
            name: "시티드 로우",
            sets: [3, 3],
            reps: [8, 12],
            restSeconds: 120,
            loadStepKg: 5,
          }),
          ex({
            name: "인클라인 벤치프레스",
            sets: [2, 3],
            reps: [8, 12],
            restSeconds: 120,
            loadStepKg: 5,
          }),
          ex({
            name: "사이드 레터럴 레이즈",
            sets: [2, 2],
            reps: [12, 20],
            restSeconds: 75,
            loadStepKg: 2.5,
          }),
        ],
      },
      {
        key: "B",
        title: "윗가슴과 볼륨",
        exercises: [
          ex({
            name: "루마니안 데드리프트",
            sets: [3, 3],
            reps: [6, 10],
            restSeconds: 150,
            loadStepKg: 5,
          }),
          ex({
            name: "랫풀다운",
            sets: [3, 3],
            reps: [8, 12],
            restSeconds: 120,
            loadStepKg: 5,
          }),
          ex({
            name: "덤벨 벤치프레스",
            sets: [3, 3],
            reps: [8, 12],
            restSeconds: 120,
            loadStepKg: 2.5,
          }),
          ex({
            name: "덤벨 플라이",
            sets: [2, 3],
            reps: [10, 15],
            restSeconds: 90,
            loadStepKg: 2.5,
          }),
          ex({
            name: "케이블 푸시다운",
            sets: [2, 2],
            reps: [10, 15],
            restSeconds: 75,
            loadStepKg: 2.5,
          }),
        ],
      },
      {
        key: "C",
        title: "안정된 마무리",
        exercises: [
          ex({
            name: "레그프레스",
            sets: [3, 3],
            reps: [8, 12],
            restSeconds: 150,
            loadStepKg: 5,
          }),
          ex({
            name: "체스트프레스 머신",
            sets: [2, 2],
            reps: [8, 12],
            restSeconds: 120,
            loadStepKg: 5,
          }),
          ex({
            name: "바벨 로우",
            sets: [3, 3],
            reps: [8, 12],
            restSeconds: 120,
            loadStepKg: 5,
          }),
          ex({
            name: "푸시업",
            sets: [2, 2],
            reps: [8, 15],
            restSeconds: 90,
            loadStepKg: 1,
          }),
          ex({
            name: "페이스풀",
            sets: [2, 2],
            reps: [12, 20],
            restSeconds: 75,
            loadStepKg: 2.5,
          }),
        ],
      },
    ],
  },
  {
    key: "arm-outline-6w",
    version: 1,
    eyebrow: "반팔이 달라지는 팔",
    title: "두께와 윤곽을 동시에 만드는 6주",
    description: "팔의 앞뒤를 고르게 훈련해 두께와 윤곽을 만듭니다.",
    durationMinutes: [45, 60],
    coverImage: "/program-assets/arms.webp",
    weeks: 6,
    sessionsPerWeek: 3,
    sessions: [
      {
        key: "A",
        title: "앞뒤 기본",
        exercises: [
          ex({
            name: "레그프레스",
            sets: [3, 3],
            reps: [8, 12],
            restSeconds: 150,
            loadStepKg: 5,
          }),
          ex({
            name: "벤치프레스",
            sets: [3, 3],
            reps: [6, 10],
            restSeconds: 150,
            loadStepKg: 5,
          }),
          ex({
            name: "시티드 로우",
            sets: [3, 3],
            reps: [8, 12],
            restSeconds: 120,
            loadStepKg: 5,
          }),
          ex({
            name: "덤벨 컬",
            sets: [3, 3],
            reps: [10, 15],
            restSeconds: 75,
            loadStepKg: 2.5,
          }),
          ex({
            name: "케이블 푸시다운",
            sets: [3, 3],
            reps: [10, 15],
            restSeconds: 75,
            loadStepKg: 2.5,
          }),
        ],
      },
      {
        key: "B",
        title: "팔뚝과 삼두",
        exercises: [
          ex({
            name: "루마니안 데드리프트",
            sets: [3, 3],
            reps: [6, 10],
            restSeconds: 150,
            loadStepKg: 5,
          }),
          ex({
            name: "숄더프레스",
            sets: [3, 3],
            reps: [8, 12],
            restSeconds: 120,
            loadStepKg: 5,
          }),
          ex({
            name: "랫풀다운",
            sets: [3, 3],
            reps: [8, 12],
            restSeconds: 120,
            loadStepKg: 5,
          }),
          ex({
            name: "덤벨 해머 컬",
            sets: [3, 3],
            reps: [10, 15],
            restSeconds: 75,
            loadStepKg: 2.5,
          }),
          ex({
            name: "벤치 딥스",
            sets: [3, 3],
            reps: [8, 15],
            restSeconds: 90,
            loadStepKg: 1,
          }),
        ],
      },
      {
        key: "C",
        title: "윤곽 마무리",
        exercises: [
          ex({
            name: "맨몸 스쿼트",
            sets: [3, 3],
            reps: [12, 20],
            restSeconds: 90,
            loadStepKg: 1,
          }),
          ex({
            name: "덤벨 벤치프레스",
            sets: [3, 3],
            reps: [8, 12],
            restSeconds: 120,
            loadStepKg: 2.5,
          }),
          ex({
            name: "덤벨 로우",
            sets: [3, 3],
            reps: [8, 12],
            restSeconds: 120,
            loadStepKg: 2.5,
          }),
          ex({
            name: "덤벨 컬",
            sets: [2, 2],
            reps: [10, 15],
            restSeconds: 75,
            loadStepKg: 2.5,
          }),
          ex({
            name: "케이블 푸시다운",
            sets: [2, 2],
            reps: [10, 15],
            restSeconds: 75,
            loadStepKg: 2.5,
          }),
          ex({
            name: "사이드 레터럴 레이즈",
            sets: [2, 2],
            reps: [12, 20],
            restSeconds: 75,
            loadStepKg: 2.5,
          }),
        ],
      },
    ],
  },
  {
    key: "lower-balance-6w",
    version: 1,
    eyebrow: "몸의 기반을 만드는 하체",
    title: "강하고 균형 잡힌 하체를 만드는 6주",
    description: "하체 전반을 고르게 훈련해 힘과 균형을 만듭니다.",
    durationMinutes: [50, 65],
    coverImage: "/program-assets/lower-v2.webp",
    weeks: 6,
    sessionsPerWeek: 3,
    sessions: [
      {
        key: "A",
        title: "스쿼트와 앞뒤 균형",
        exercises: [
          ex({
            name: "바벨 백스쿼트",
            sets: [3, 3],
            reps: [6, 10],
            restSeconds: 150,
            loadStepKg: 5,
          }),
          ex({
            name: "벤치프레스",
            sets: [3, 3],
            reps: [6, 10],
            restSeconds: 150,
            loadStepKg: 5,
          }),
          ex({
            name: "시티드 로우",
            sets: [3, 3],
            reps: [8, 12],
            restSeconds: 120,
            loadStepKg: 5,
          }),
          ex({
            name: "레그 익스텐션",
            sets: [2, 3],
            reps: [10, 15],
            restSeconds: 90,
            loadStepKg: 2.5,
          }),
          ex({
            name: "레그 컬",
            sets: [2, 3],
            reps: [10, 15],
            restSeconds: 90,
            loadStepKg: 2.5,
          }),
        ],
      },
      {
        key: "B",
        title: "후면과 한발 균형",
        exercises: [
          ex({
            name: "루마니안 데드리프트",
            sets: [3, 3],
            reps: [6, 10],
            restSeconds: 150,
            loadStepKg: 5,
          }),
          ex({
            name: "숄더프레스",
            sets: [3, 3],
            reps: [8, 12],
            restSeconds: 120,
            loadStepKg: 5,
          }),
          ex({
            name: "랫풀다운",
            sets: [3, 3],
            reps: [8, 12],
            restSeconds: 120,
            loadStepKg: 5,
          }),
          ex({
            name: "런지",
            sets: [3, 3],
            reps: [8, 12],
            restSeconds: 120,
            loadStepKg: 1,
          }),
          ex({
            name: "힙 브릿지",
            sets: [3, 3],
            reps: [10, 15],
            restSeconds: 90,
            loadStepKg: 1,
          }),
        ],
      },
      {
        key: "C",
        title: "하체 볼륨",
        exercises: [
          ex({
            name: "레그프레스",
            sets: [3, 3],
            reps: [8, 12],
            restSeconds: 150,
            loadStepKg: 5,
          }),
          ex({
            name: "덤벨 벤치프레스",
            sets: [3, 3],
            reps: [8, 12],
            restSeconds: 120,
            loadStepKg: 2.5,
          }),
          ex({
            name: "덤벨 로우",
            sets: [3, 3],
            reps: [8, 12],
            restSeconds: 120,
            loadStepKg: 2.5,
          }),
          ex({
            name: "레그 익스텐션",
            sets: [2, 2],
            reps: [10, 15],
            restSeconds: 90,
            loadStepKg: 2.5,
          }),
          ex({
            name: "레그 컬",
            sets: [2, 2],
            reps: [10, 15],
            restSeconds: 90,
            loadStepKg: 2.5,
          }),
        ],
      },
    ],
  },
  {
    key: "lean-body-6w",
    version: 1,
    eyebrow: "살은 빼고, 몸은 선명하게",
    title: "근육은 지키면서 체지방을 낮추는 6주",
    description:
      "근력과 근육을 지키며 선명한 몸을 만드는 데 집중합니다. 체중 변화는 식사와 일상 활동량의 영향도 받습니다. 이 프로그램은 근력과 근육량을 지키며 꾸준히 움직이는 습관을 만드는 데 초점을 둡니다.",
    durationMinutes: [40, 55],
    coverImage: "/program-assets/lean-v2.webp",
    weeks: 6,
    sessionsPerWeek: 3,
    sessions: [
      {
        key: "A",
        title: "전신 기본",
        exercises: [
          ex({
            name: "레그프레스",
            sets: [3, 3],
            reps: [8, 12],
            restSeconds: 120,
            loadStepKg: 5,
          }),
          ex({
            name: "체스트프레스 머신",
            sets: [3, 3],
            reps: [8, 12],
            restSeconds: 90,
            loadStepKg: 5,
          }),
          ex({
            name: "랫풀다운",
            sets: [3, 3],
            reps: [8, 12],
            restSeconds: 90,
            loadStepKg: 5,
          }),
          ex({
            name: "크런치",
            sets: [2, 3],
            reps: [12, 20],
            restSeconds: 60,
            loadStepKg: 1,
          }),
          ex({
            name: "시티드 로우",
            sets: [2, 2],
            reps: [8, 12],
            restSeconds: 90,
            loadStepKg: 5,
          }),
        ],
      },
      {
        key: "B",
        title: "큰 근육 순환",
        exercises: [
          ex({
            name: "루마니안 데드리프트",
            sets: [3, 3],
            reps: [8, 12],
            restSeconds: 120,
            loadStepKg: 5,
          }),
          ex({
            name: "숄더프레스",
            sets: [3, 3],
            reps: [8, 12],
            restSeconds: 90,
            loadStepKg: 5,
          }),
          ex({
            name: "시티드 로우",
            sets: [3, 3],
            reps: [8, 12],
            restSeconds: 90,
            loadStepKg: 5,
          }),
          ex({
            name: "런지",
            sets: [2, 3],
            reps: [10, 15],
            restSeconds: 90,
            loadStepKg: 1,
          }),
          ex({
            name: "푸시업",
            sets: [2, 2],
            reps: [8, 15],
            restSeconds: 75,
            loadStepKg: 1,
          }),
        ],
      },
      {
        key: "C",
        title: "밀도 높은 전신",
        exercises: [
          ex({
            name: "맨몸 스쿼트",
            sets: [3, 3],
            reps: [12, 20],
            restSeconds: 75,
            loadStepKg: 1,
          }),
          ex({
            name: "덤벨 벤치프레스",
            sets: [3, 3],
            reps: [8, 12],
            restSeconds: 90,
            loadStepKg: 2.5,
          }),
          ex({
            name: "덤벨 로우",
            sets: [3, 3],
            reps: [8, 12],
            restSeconds: 90,
            loadStepKg: 2.5,
          }),
          ex({
            name: "덤벨 컬",
            sets: [2, 2],
            reps: [10, 15],
            restSeconds: 60,
            loadStepKg: 2.5,
          }),
          ex({
            name: "케이블 푸시다운",
            sets: [2, 2],
            reps: [10, 15],
            restSeconds: 60,
            loadStepKg: 2.5,
          }),
        ],
      },
    ],
  },
] as const satisfies readonly StrengthProgram[];

/**
 * 풀업 사다리 18회 (사장님 지시 2026-09-04).
 *
 * 횟수 계산과 출처 원문은 `pullup-ladder.ts`에 있다. 여기는 **일정과 문구**만
 * 정한다.
 *
 * ⚠️ **일정을 요일로 잡지 않는다** — 이 프로그램만 그렇다. 원문의 "5일 훈련
 *    1일 휴식"은 6일 주기라 요일 목록(7일 주기)으로는 표현할 수 없다.
 *    `ladder-schedule.ts`가 시작일에서 주기로 날짜를 만든다. 24회차가 정확히
 *    28일 = 4주에 떨어진다.
 *
 *    ⚠️ 처음(2026-09-04 오전)에는 주 5회 요일 근사로 18회차를 깔았다. 그러면
 *       5일 훈련 뒤 **2일**을 쉬게 되어 원문의 루틴이 아니었다. 사장님 지적으로
 *       주기 기반으로 바꿨다.
 *
 * ⚠️ **휴식 90초는 원문에 없다.** 원문은 세트 사이 휴식을 말하지 않는다.
 *    그런데 등록 RPC가 처방에 `restSeconds`(60~300)를 **요구**해서 비워 둘 수가
 *    없다. "실패 지점까지 가지 않는다"는 원문의 취지에 맞춰 승인된 5값 중
 *    가운데를 골랐다 — 처방이 아니라 **기본값**이고, 사용자가 화면에서 바꾼다.
 *
 * ⚠️ 표지 사진이 없다. 사다리는 사진 대신 **숫자**를 표지로 쓴다
 *    (`ProgramCover`) — 스톡 사진 한 장보다 5·4·3·2·1이 이 프로그램을 더 잘
 *    설명한다.
 */
export const PULLUP_LADDER_PROGRAM: LadderProgram = {
  key: "pullup-ladder-18",
  version: 1,
  kind: "ladder",
  eyebrow: "실패 지점까지 가지 않는 풀업",
  title: "최대 개수를 올리는 18회 사다리",
  description:
    "파벨 차졸린의 러시안 파이터 풀업 루틴이에요. 지금 할 수 있는 최대 개수를 넣으면 5·4·3·2·1로 시작하는 사다리를 만들고, 회차마다 뒤쪽 세트를 1회씩 올려 18회를 미리 계획해요.",
  durationMinutes: [10, 20],
  exerciseName: "풀업",
  restSeconds: 90,
  recommendedSessionsPerWeek: 5,
  sourceNote:
    "5일 훈련하고 하루 쉬는 걸 4주 반복해요. 쉬는 날은 프로그램이 정해서 달력에 그대로 담겨요 — 24회차, 정확히 4주예요.",
};

/**
 * 회차 번호(`program_week`·`program_session`)를 며칠째 사다리인지로 바꾼다.
 *
 * 등록 RPC가 18칸을 `week = ⌊i/3⌋+1`, `session = i%3+1`로 **위치까지 강제**하기
 * 때문에 이 둘만 있으면 몇 번째 회차인지 되돌릴 수 있다. 사다리는 회차마다
 * 숫자가 다르므로 이 함수가 계획 행과 사다리를 잇는 유일한 열쇠다.
 */
export function ladderDayOfSession(week: number, session: number): number {
  // 24회차 = 8묶음. 근력·인터벌(18회 = 6묶음)보다 넓다 — 0101이 컬럼 제약도
  // 1~8로 넓혔다. 여기와 DB가 갈라지면 등록이 통째로 거절된다.
  if (!Number.isInteger(week) || week < 1 || week > 8) {
    throw new Error(`program_invalid_week:${week}`);
  }
  if (!Number.isInteger(session) || session < 1 || session > 3) {
    throw new Error(`program_invalid_session:${session}`);
  }
  return (week - 1) * 3 + session;
}

/**
 * 사다리 종목을 카탈로그 행과 잇는다.
 *
 * 근력·인터벌의 `resolveProgram`·`resolveIntervalProgram`과 같은 규칙이다 —
 * **공식 시드만**(`created_by === null`) 쓰고, 없으면 이름을 담아 던진다.
 * 동명 커스텀 종목이 골라지면 남의 종목에 계획을 심게 된다.
 */
export function resolveLadderProgram(
  program: LadderProgram,
  catalog: readonly CatalogExercise[],
): CatalogExercise {
  const item = catalog.find(
    (candidate) =>
      candidate.created_by === null && candidate.name === program.exerciseName,
  );
  if (!item) {
    throw new Error(`program_exercise_missing:${program.exerciseName}`);
  }
  return item;
}

/**
 * 등록 행에 남길 난이도.
 *
 * 사다리는 난이도를 **묻지 않는다** — 최대 개수를 숫자로 받는다. 그런데
 * `program_enrollments.level_at_start`는 세 값만 받는 not-null 컬럼이라
 * (0066) 무언가는 넣어야 한다. 최대 개수를 세 칸으로 접어 넣는다.
 *
 * ⚠️ **이 값으로 사다리를 되돌릴 수 없다.** 되돌릴 필요도 없다 — 계획 행이
 *    세트별 횟수를 그대로 들고 있다. 통계에서 "몇 개 하던 사람이 등록했나"를
 *    거칠게 보는 용도다.
 */
export function ladderLevelForMaxReps(maxReps: number): ProgramLevel {
  if (maxReps <= 6) return "beginner";
  if (maxReps <= 9) return "moderate";
  return "experienced";
}

/** 카탈로그에 서는 전체 목록 — 근력 5종 + 인터벌 1종 + 사다리 1종 */
export const OFFICIAL_PROGRAMS: readonly OfficialProgram[] = [
  ...STRENGTH_PROGRAMS,
  INTERVAL_PROGRAM,
  PULLUP_LADDER_PROGRAM,
];
