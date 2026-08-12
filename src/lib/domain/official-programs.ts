import type { ExercisePrescription } from "./workout-plan";

export type OfficialProgramKey =
  | "shoulder-frame-6w"
  | "chest-frame-6w"
  | "arm-outline-6w"
  | "lower-balance-6w"
  | "lean-body-6w";

export type ProgramExerciseTemplate = ExercisePrescription & {
  exerciseName: string;
  beginnerSets: number;
  experiencedSets: number;
};

export type OfficialProgram = {
  key: OfficialProgramKey;
  version: 1;
  eyebrow: string;
  title: string;
  description: string;
  durationMinutes: readonly [number, number];
  coverImage: string;
  weeks: 6;
  sessionsPerWeek: 3;
  sessions: readonly {
    key: "A" | "B" | "C";
    title: string;
    exercises: readonly ProgramExerciseTemplate[];
  }[];
};

export const OFFICIAL_PROGRAMS = [
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
      { key: "A", title: "A 운동", exercises: [] },
      { key: "B", title: "B 운동", exercises: [] },
      { key: "C", title: "C 운동", exercises: [] },
    ],
  },
  {
    key: "chest-frame-6w",
    version: 1,
    eyebrow: "옷태를 세우는 가슴",
    title: "상체 앞면을 단단하게 만드는 6주",
    description: "가슴을 중심으로 상체 앞면의 힘과 형태를 만듭니다.",
    durationMinutes: [50, 65],
    coverImage: "/program-assets/chest.webp",
    weeks: 6,
    sessionsPerWeek: 3,
    sessions: [
      { key: "A", title: "A 운동", exercises: [] },
      { key: "B", title: "B 운동", exercises: [] },
      { key: "C", title: "C 운동", exercises: [] },
    ],
  },
  {
    key: "arm-outline-6w",
    version: 1,
    eyebrow: "소매를 채우는 팔",
    title: "팔의 두께와 윤곽을 만드는 6주",
    description: "팔의 앞뒤를 고르게 훈련해 두께와 윤곽을 만듭니다.",
    durationMinutes: [45, 60],
    coverImage: "/program-assets/arms.webp",
    weeks: 6,
    sessionsPerWeek: 3,
    sessions: [
      { key: "A", title: "A 운동", exercises: [] },
      { key: "B", title: "B 운동", exercises: [] },
      { key: "C", title: "C 운동", exercises: [] },
    ],
  },
  {
    key: "lower-balance-6w",
    version: 1,
    eyebrow: "실루엣을 완성하는 하체",
    title: "하체의 힘과 균형을 세우는 6주",
    description: "하체 전반을 고르게 훈련해 힘과 균형을 만듭니다.",
    durationMinutes: [50, 65],
    coverImage: "/program-assets/lower.webp",
    weeks: 6,
    sessionsPerWeek: 3,
    sessions: [
      { key: "A", title: "A 운동", exercises: [] },
      { key: "B", title: "B 운동", exercises: [] },
      { key: "C", title: "C 운동", exercises: [] },
    ],
  },
  {
    key: "lean-body-6w",
    version: 1,
    eyebrow: "몸은 가볍게, 인상은 선명하게",
    title: "근육을 지키는 체지방 관리 6주",
    description: "근력과 근육을 지키며 선명한 몸을 만드는 데 집중합니다.",
    durationMinutes: [40, 55],
    coverImage: "/program-assets/lean.webp",
    weeks: 6,
    sessionsPerWeek: 3,
    sessions: [
      { key: "A", title: "A 운동", exercises: [] },
      { key: "B", title: "B 운동", exercises: [] },
      { key: "C", title: "C 운동", exercises: [] },
    ],
  },
] as const satisfies readonly OfficialProgram[];
