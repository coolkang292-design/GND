import type { ExercisePrescription } from "./workout-plan";

export type OfficialProgramKey =
  | "shoulder-frame-6w"
  | "chest-frame-6w"
  | "arm-outline-6w"
  | "lower-balance-6w"
  | "lean-body-6w";

export type OfficialProgramRestSeconds = 60 | 75 | 90 | 120 | 150;

export type ProgramExerciseTemplate = ExercisePrescription & {
  restSeconds: OfficialProgramRestSeconds;
  exerciseName: string;
  beginnerSets: number;
  experiencedSets: number;
};

const ex = (
  exerciseName: string,
  beginnerSets: number,
  experiencedSets: number,
  repsMin: number,
  repsMax: number,
  targetRir: 1 | 2 | 3,
  restSeconds: OfficialProgramRestSeconds,
  loadStepKg: 1 | 2.5 | 5,
): ProgramExerciseTemplate => ({
  exerciseName,
  beginnerSets,
  experiencedSets,
  repsMin,
  repsMax,
  targetRir,
  restSeconds,
  loadStepKg,
});

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
      {
        key: "A",
        title: "밀고 세우기",
        exercises: [
          ex("바벨 백스쿼트", 3, 3, 6, 10, 2, 150, 5),
          ex("벤치프레스", 3, 3, 6, 10, 2, 150, 5),
          ex("시티드 로우", 3, 3, 8, 12, 2, 120, 5),
          ex("숄더프레스", 2, 3, 8, 12, 2, 120, 5),
          ex("사이드 레터럴 레이즈", 2, 3, 12, 20, 2, 75, 2.5),
        ],
      },
      {
        key: "B",
        title: "등판과 뒤쪽 어깨",
        exercises: [
          ex("루마니안 데드리프트", 3, 3, 6, 10, 2, 150, 5),
          ex("랫풀다운", 3, 3, 8, 12, 2, 120, 5),
          ex("인클라인 벤치프레스", 3, 3, 8, 12, 2, 120, 5),
          ex("페이스풀", 2, 3, 12, 20, 2, 75, 2.5),
          ex("덤벨 컬", 2, 2, 10, 15, 2, 75, 2.5),
        ],
      },
      {
        key: "C",
        title: "옆선과 전신 균형",
        exercises: [
          ex("레그프레스", 3, 3, 8, 12, 2, 150, 5),
          ex("덤벨 벤치프레스", 3, 3, 8, 12, 2, 120, 2.5),
          ex("바벨 로우", 3, 3, 8, 12, 2, 120, 5),
          ex("덤벨 레터럴 레이즈", 3, 4, 12, 20, 2, 75, 2.5),
          ex("페이스풀", 2, 2, 12, 20, 2, 75, 2.5),
          ex("케이블 푸시다운", 2, 2, 10, 15, 2, 75, 2.5),
        ],
      },
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
      {
        key: "A",
        title: "기본 압박",
        exercises: [
          ex("바벨 백스쿼트", 3, 3, 6, 10, 2, 150, 5),
          ex("벤치프레스", 3, 3, 6, 10, 2, 150, 5),
          ex("시티드 로우", 3, 3, 8, 12, 2, 120, 5),
          ex("인클라인 벤치프레스", 2, 3, 8, 12, 2, 120, 5),
          ex("사이드 레터럴 레이즈", 2, 2, 12, 20, 2, 75, 2.5),
        ],
      },
      {
        key: "B",
        title: "윗가슴과 볼륨",
        exercises: [
          ex("루마니안 데드리프트", 3, 3, 6, 10, 2, 150, 5),
          ex("랫풀다운", 3, 3, 8, 12, 2, 120, 5),
          ex("덤벨 벤치프레스", 3, 3, 8, 12, 2, 120, 2.5),
          ex("덤벨 플라이", 2, 3, 10, 15, 2, 90, 2.5),
          ex("케이블 푸시다운", 2, 2, 10, 15, 2, 75, 2.5),
        ],
      },
      {
        key: "C",
        title: "안정된 마무리",
        exercises: [
          ex("레그프레스", 3, 3, 8, 12, 2, 150, 5),
          ex("체스트프레스 머신", 2, 2, 8, 12, 2, 120, 5),
          ex("바벨 로우", 3, 3, 8, 12, 2, 120, 5),
          ex("푸시업", 2, 2, 8, 15, 2, 90, 1),
          ex("페이스풀", 2, 2, 12, 20, 2, 75, 2.5),
        ],
      },
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
      {
        key: "A",
        title: "앞뒤 기본",
        exercises: [
          ex("레그프레스", 3, 3, 8, 12, 2, 150, 5),
          ex("벤치프레스", 3, 3, 6, 10, 2, 150, 5),
          ex("시티드 로우", 3, 3, 8, 12, 2, 120, 5),
          ex("덤벨 컬", 3, 3, 10, 15, 2, 75, 2.5),
          ex("케이블 푸시다운", 3, 3, 10, 15, 2, 75, 2.5),
        ],
      },
      {
        key: "B",
        title: "팔뚝과 삼두",
        exercises: [
          ex("루마니안 데드리프트", 3, 3, 6, 10, 2, 150, 5),
          ex("숄더프레스", 3, 3, 8, 12, 2, 120, 5),
          ex("랫풀다운", 3, 3, 8, 12, 2, 120, 5),
          ex("덤벨 해머 컬", 3, 3, 10, 15, 2, 75, 2.5),
          ex("벤치 딥스", 3, 3, 8, 15, 2, 90, 1),
        ],
      },
      {
        key: "C",
        title: "윤곽 마무리",
        exercises: [
          ex("맨몸 스쿼트", 3, 3, 12, 20, 2, 90, 1),
          ex("덤벨 벤치프레스", 3, 3, 8, 12, 2, 120, 2.5),
          ex("덤벨 로우", 3, 3, 8, 12, 2, 120, 2.5),
          ex("덤벨 컬", 2, 2, 10, 15, 2, 75, 2.5),
          ex("케이블 푸시다운", 2, 2, 10, 15, 2, 75, 2.5),
          ex("사이드 레터럴 레이즈", 2, 2, 12, 20, 2, 75, 2.5),
        ],
      },
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
      {
        key: "A",
        title: "스쿼트와 앞뒤 균형",
        exercises: [
          ex("바벨 백스쿼트", 3, 3, 6, 10, 2, 150, 5),
          ex("벤치프레스", 3, 3, 6, 10, 2, 150, 5),
          ex("시티드 로우", 3, 3, 8, 12, 2, 120, 5),
          ex("레그 익스텐션", 2, 3, 10, 15, 2, 90, 2.5),
          ex("레그 컬", 2, 3, 10, 15, 2, 90, 2.5),
        ],
      },
      {
        key: "B",
        title: "후면과 한발 균형",
        exercises: [
          ex("루마니안 데드리프트", 3, 3, 6, 10, 2, 150, 5),
          ex("숄더프레스", 3, 3, 8, 12, 2, 120, 5),
          ex("랫풀다운", 3, 3, 8, 12, 2, 120, 5),
          ex("런지", 3, 3, 8, 12, 2, 120, 1),
          ex("힙 브릿지", 3, 3, 10, 15, 2, 90, 1),
        ],
      },
      {
        key: "C",
        title: "하체 볼륨",
        exercises: [
          ex("레그프레스", 3, 3, 8, 12, 2, 150, 5),
          ex("덤벨 벤치프레스", 3, 3, 8, 12, 2, 120, 2.5),
          ex("덤벨 로우", 3, 3, 8, 12, 2, 120, 2.5),
          ex("레그 익스텐션", 2, 2, 10, 15, 2, 90, 2.5),
          ex("레그 컬", 2, 2, 10, 15, 2, 90, 2.5),
        ],
      },
    ],
  },
  {
    key: "lean-body-6w",
    version: 1,
    eyebrow: "몸은 가볍게, 인상은 선명하게",
    title: "근육을 지키는 체지방 관리 6주",
    description:
      "근력과 근육을 지키며 선명한 몸을 만드는 데 집중합니다. 체중 변화는 식사와 일상 활동량의 영향도 받습니다. 이 프로그램은 근력과 근육량을 지키며 꾸준히 움직이는 습관을 만드는 데 초점을 둡니다.",
    durationMinutes: [40, 55],
    coverImage: "/program-assets/lean.webp",
    weeks: 6,
    sessionsPerWeek: 3,
    sessions: [
      {
        key: "A",
        title: "전신 기본",
        exercises: [
          ex("레그프레스", 3, 3, 8, 12, 2, 120, 5),
          ex("체스트프레스 머신", 3, 3, 8, 12, 2, 90, 5),
          ex("랫풀다운", 3, 3, 8, 12, 2, 90, 5),
          ex("크런치", 2, 3, 12, 20, 2, 60, 1),
          ex("시티드 로우", 2, 2, 8, 12, 2, 90, 5),
        ],
      },
      {
        key: "B",
        title: "큰 근육 순환",
        exercises: [
          ex("루마니안 데드리프트", 3, 3, 8, 12, 2, 120, 5),
          ex("숄더프레스", 3, 3, 8, 12, 2, 90, 5),
          ex("시티드 로우", 3, 3, 8, 12, 2, 90, 5),
          ex("런지", 2, 3, 10, 15, 2, 90, 1),
          ex("푸시업", 2, 2, 8, 15, 2, 75, 1),
        ],
      },
      {
        key: "C",
        title: "밀도 높은 전신",
        exercises: [
          ex("맨몸 스쿼트", 3, 3, 12, 20, 2, 75, 1),
          ex("덤벨 벤치프레스", 3, 3, 8, 12, 2, 90, 2.5),
          ex("덤벨 로우", 3, 3, 8, 12, 2, 90, 2.5),
          ex("덤벨 컬", 2, 2, 10, 15, 2, 60, 2.5),
          ex("케이블 푸시다운", 2, 2, 10, 15, 2, 60, 2.5),
        ],
      },
    ],
  },
] as const satisfies readonly OfficialProgram[];
