import { describe, expect, it } from "vitest";
import {
  GOAL_TYPE_META,
  categoriesLabel,
  countsTowardChallenge,
  goalCategories,
  sessionGoalContribution,
  actualForGoal,
  foldPeriodStats,
  goalLabel,
  normalizeChallengeParticipantProfiles,
  normalizeChallengePeriodSessions,
  type PeriodSessionRow,
  type PeriodStats,
} from "@/lib/challenge";

const STATS: PeriodStats = {
  workoutDays: 5,
  workoutDayKeys: [
    "2026-07-01",
    "2026-07-02",
    "2026-07-03",
    "2026-07-04",
    "2026-07-05",
  ],
  weightReps: 240,
  volumeKg: 3000,
  cardioDistanceKm: 12,
  cardioTimeMin: 90,
  bodyweightReps: 180,
  bodyweightTimeMin: 24,
  tabataCount: 0,
  weightKindsByDay: { "2026-07-01": 3, "2026-07-02": 1, "2026-07-03": 4 },
  bodyweightKindsByDay: { "2026-07-01": 2, "2026-07-04": 3 },
};

describe("goalLabel", () => {
  it("weight_days는 종목 조건을 붙인다", () => {
    expect(goalLabel("weight_days", 3)).toBe("웨이트 운동일(하루 3종목+)");
  });
  it("bodyweight_days는 종목 조건을 붙인다", () => {
    expect(goalLabel("bodyweight_days", 2)).toBe("맨몸 운동일(하루 2종목+)");
  });
  it("일반 지표는 라벨 그대로", () => {
    expect(goalLabel("weight_reps")).toBe(GOAL_TYPE_META.weight_reps.label);
  });
});

describe("actualForGoal", () => {
  it("weight_reps", () => expect(actualForGoal(STATS, "weight_reps")).toBe(240));
  it("cardio_distance", () =>
    expect(actualForGoal(STATS, "cardio_distance")).toBe(12));
  it("cardio_time", () => expect(actualForGoal(STATS, "cardio_time")).toBe(90));
  it("bodyweight_reps", () =>
    expect(actualForGoal(STATS, "bodyweight_reps")).toBe(180));
  it("bodyweight_time", () =>
    expect(actualForGoal(STATS, "bodyweight_time")).toBe(24));
  it("weight_days는 N종목+ 인 날만 센다", () => {
    expect(actualForGoal(STATS, "weight_days", 3)).toBe(2); // 3,4 부위인 날 2개
  });
  it("bodyweight_days는 N종목+ 인 날만 센다", () => {
    expect(actualForGoal(STATS, "bodyweight_days", 3)).toBe(1); // 3종목인 날 1개
  });
  it("volume은 레거시 볼륨", () =>
    expect(actualForGoal(STATS, "volume")).toBe(3000));
  it("tabata_count는 타바타 세션 수", () =>
    expect(actualForGoal({ ...STATS, tabataCount: 5 }, "tabata_count")).toBe(5));
});

describe("normalizeChallengePeriodSessions", () => {
  const validRpcRow = {
    user_id: "u1",
    completed_at: "2026-07-31T03:00:00Z",
    tabata_minutes: null,
    workout_exercises: [
      {
        exercise_type: "weight",
        exercise_name: "벤치프레스",
        body_part: "가슴",
        workout_sets: [
          {
            weight_kg: 60,
            reps: 10,
            distance_meters: null,
            duration_seconds: null,
            is_completed: true,
          },
        ],
      },
    ],
  };

  it("RPC의 snake_case 행을 PeriodSessionRow로 변환한다", () => {
    const rows = normalizeChallengePeriodSessions([
      {
        user_id: "u1",
        completed_at: "2026-07-31T03:00:00Z",
        tabata_minutes: 12,
        workout_exercises: [
          {
            exercise_type: "weight",
            exercise_name: "벤치프레스",
            body_part: "가슴",
            workout_sets: [
              {
                weight_kg: 60,
                reps: 10,
                distance_meters: null,
                duration_seconds: null,
                is_completed: true,
              },
            ],
          },
        ],
      },
    ]);

    expect(rows).toEqual([
      {
        userId: "u1",
        completedAt: "2026-07-31T03:00:00Z",
        tabataMinutes: 12,
        exercises: [
          {
            exerciseType: "weight",
            exerciseName: "벤치프레스",
            bodyPart: "가슴",
            sets: [
              {
                weightKg: 60,
                reps: 10,
                distanceMeters: null,
                durationSeconds: null,
                isCompleted: true,
              },
            ],
          },
        ],
      },
    ] satisfies PeriodSessionRow[]);
  });

  it("RPC 결과가 배열이 아니면 명시적인 오류를 던진다", () => {
    expect(() => normalizeChallengePeriodSessions({ error: "broken" })).toThrow(
      "invalid_challenge_period_sessions",
    );
  });

  it.each([
    ["빈 행", [{}]],
    ["null 행", [null]],
    [
      "배열이 아닌 운동 목록",
      [{ ...validRpcRow, workout_exercises: { exercise_type: "weight" } }],
    ],
    [
      "배열이 아닌 세트 목록",
      [
        {
          ...validRpcRow,
          workout_exercises: [
            {
              ...validRpcRow.workout_exercises[0],
              workout_sets: { is_completed: true },
            },
          ],
        },
      ],
    ],
    [
      "허용되지 않은 운동 유형",
      [
        {
          ...validRpcRow,
          workout_exercises: [
            {
              ...validRpcRow.workout_exercises[0],
              exercise_type: "swimming",
            },
          ],
        },
      ],
    ],
    ["잘못된 필드 타입", [{ ...validRpcRow, completed_at: 123 }]],
  ])("%s이면 같은 오류를 던진다", (_name, data) => {
    expect(() => normalizeChallengePeriodSessions(data)).toThrow(
      "invalid_challenge_period_sessions",
    );
  });
});

describe("normalizeChallengeParticipantProfiles", () => {
  it("필요한 프로필 필드만 새 객체로 돌려준다", () => {
    expect(
      normalizeChallengeParticipantProfiles([
        {
          id: "u1",
          nickname: "그린",
          avatar_url: null,
          weekly_goal: 5,
        },
      ]),
    ).toEqual([{ id: "u1", nickname: "그린", avatar_url: null }]);
  });

  it.each([
    ["배열이 아닌 응답", { id: "u1" }],
    [
      "잘못된 필드 타입",
      [{ id: "u1", nickname: 123, avatar_url: null }],
    ],
    ["필수 필드 누락", [{ id: "u1", nickname: "그린" }]],
  ])("%s이면 명시적인 오류를 던진다", (_name, data) => {
    expect(() => normalizeChallengeParticipantProfiles(data)).toThrow(
      "invalid_challenge_participant_profiles",
    );
  });
});

describe("foldPeriodStats", () => {
  const rows: PeriodSessionRow[] = [
    {
      userId: "u1",
      completedAt: "2026-07-01T02:00:00Z", // KST 07-01 11시
      exercises: [
        {
          exerciseType: "weight",
          exerciseName: "벤치프레스",
          bodyPart: "가슴",
          sets: [
            { weightKg: 60, reps: 10, distanceMeters: null, durationSeconds: null, isCompleted: true },
            { weightKg: 60, reps: 8, distanceMeters: null, durationSeconds: null, isCompleted: false },
          ],
        },
        {
          exerciseType: "bodyweight",
          exerciseName: "매달리기",
          bodyPart: "등",
          sets: [
            { weightKg: null, reps: null, distanceMeters: null, durationSeconds: 180, isCompleted: true },
          ],
        },
        {
          exerciseType: "bodyweight",
          exerciseName: "푸시업",
          bodyPart: "가슴",
          sets: [
            { weightKg: null, reps: 20, distanceMeters: null, durationSeconds: null, isCompleted: true },
          ],
        },
        {
          exerciseType: "cardio",
          exerciseName: "러닝",
          bodyPart: "유산소",
          sets: [
            { weightKg: null, reps: null, distanceMeters: 5000, durationSeconds: 1800, isCompleted: true },
          ],
        },
      ],
    },
  ];

  it("카테고리별 완료 세트만 집계한다", () => {
    const m = foldPeriodStats(rows, "2026-07-01", "2026-07-31", "Asia/Seoul");
    const s = m.get("u1")!;
    expect(s.workoutDays).toBe(1);
    expect(s.weightReps).toBe(10); // 완료 세트만 (8은 미완료)
    expect(s.volumeKg).toBe(600);
    expect(s.bodyweightReps).toBe(20); // 푸시업
    expect(s.bodyweightTimeMin).toBe(3); // 매달리기 180초=3분
    expect(s.cardioDistanceKm).toBe(5);
    expect(s.cardioTimeMin).toBe(30);
    expect(s.weightKindsByDay["2026-07-01"]).toBe(1); // 벤치프레스 1종목
    expect(s.bodyweightKindsByDay["2026-07-01"]).toBe(2); // 매달리기·푸시업
  });

  it("타바타 표식 세션 수를 집계한다 (일반 세션 제외)", () => {
    const tabataRows: PeriodSessionRow[] = [
      { ...rows[0], tabataMinutes: 4 },
      { ...rows[0], completedAt: "2026-07-02T02:00:00Z", tabataMinutes: 8 },
      { ...rows[0], completedAt: "2026-07-03T02:00:00Z" }, // 일반
      { ...rows[0], completedAt: "2026-08-05T02:00:00Z", tabataMinutes: 4 }, // 기간 밖
    ];
    const m = foldPeriodStats(tabataRows, "2026-07-01", "2026-07-31", "Asia/Seoul");
    expect(m.get("u1")!.tabataCount).toBe(2);
  });

  it("기간 밖(tz 기준) 세션은 제외", () => {
    const m = foldPeriodStats(rows, "2026-07-02", "2026-07-31", "Asia/Seoul");
    expect(m.get("u1")).toBeUndefined();
  });
});

describe("foldPeriodStats - workoutDayKeys (레벨 재료)", () => {
  const row = (userId: string, completedAt: string): PeriodSessionRow => ({
    userId,
    completedAt,
    exercises: [],
  });

  it("기간 내 운동일을 오름차순 dayKey 배열로 노출한다 (중복 세션은 1일)", () => {
    const stats = foldPeriodStats(
      [
        row("u1", "2026-07-03T10:00:00+09:00"),
        row("u1", "2026-07-01T09:00:00+09:00"),
        row("u1", "2026-07-01T20:00:00+09:00"),
        row("u1", "2026-06-30T10:00:00+09:00"),
      ],
      "2026-07-01",
      "2026-07-28",
      "Asia/Seoul",
    );

    expect(stats.get("u1")!.workoutDayKeys).toEqual([
      "2026-07-01",
      "2026-07-03",
    ]);
    expect(stats.get("u1")!.workoutDays).toBe(2);
  });
});

describe("foldPeriodStats — weight_days는 종목 수로 센다 (2026-07-30 수정)", () => {
  // 실측 재현: 하체 3종목 + 팔 1종목 + 등 1종목 = 종목 5개, 부위 3개.
  // 부위로 세면 3, 종목으로 세면 5다. qualifier=4를 만족해야 한다.
  const row: PeriodSessionRow = {
    userId: "u1",
    completedAt: "2026-07-28T13:05:00Z",
    exercises: (
      [
        ["힙 어브덕션", "하체"],
        ["이너따이", "하체"],
        ["스쿼트", "하체"],
        ["덤벨", "팔"],
        ["랫풀다운", "등"],
      ] as const
    ).map(([exerciseName, bodyPart]) => ({
      exerciseType: "weight" as const,
      exerciseName,
      bodyPart,
      sets: [
        {
          weightKg: 10,
          reps: 25,
          distanceMeters: null,
          durationSeconds: null,
          isCompleted: true,
        },
      ],
    })),
  };

  it("같은 부위의 다른 종목을 각각 센다", () => {
    const s = foldPeriodStats([row], "2026-07-27", "2026-09-30", "Asia/Seoul").get("u1")!;
    expect(s.weightKindsByDay["2026-07-28"]).toBe(5);
  });

  it("qualifier 4를 만족한다 — 부위로 셌을 때 0이던 것이 1이 된다", () => {
    const s = foldPeriodStats([row], "2026-07-27", "2026-09-30", "Asia/Seoul").get("u1")!;
    expect(actualForGoal(s, "weight_days", 4)).toBe(1);
    expect(actualForGoal(s, "weight_days", 6)).toBe(0);
  });

  it("완료되지 않은 세트만 있는 종목은 세지 않는다", () => {
    const incomplete: PeriodSessionRow = {
      ...row,
      exercises: row.exercises.map((ex) => ({
        ...ex,
        sets: ex.sets.map((st) => ({ ...st, isCompleted: false })),
      })),
    };
    const s = foldPeriodStats([incomplete], "2026-07-27", "2026-09-30", "Asia/Seoul").get("u1")!;
    expect(s.weightKindsByDay["2026-07-28"] ?? 0).toBe(0);
  });
});

describe("foldPeriodStats — 타바타 분수가 맨몸 시간에 들어간다 (2026-07-30 수정)", () => {
  // 실측 재현: 타바타 세트는 reps=0·durationSeconds=null이고 분수는
  // 세션의 tabataMinutes에만 있다.
  const tabataRow: PeriodSessionRow = {
    userId: "u1",
    completedAt: "2026-07-29T07:06:00Z",
    tabataMinutes: 8,
    exercises: ["점프 스쿼트", "마운틴 클라이머"].map((exerciseName) => ({
      exerciseType: "bodyweight" as const,
      exerciseName,
      bodyPart: "하체",
      sets: [
        {
          weightKg: null,
          reps: 0,
          distanceMeters: null,
          durationSeconds: null,
          isCompleted: true,
        },
      ],
    })),
  };

  it("타바타 분수가 bodyweightTimeMin에 더해진다", () => {
    const s = foldPeriodStats([tabataRow], "2026-07-27", "2026-09-30", "Asia/Seoul").get("u1")!;
    expect(s.bodyweightTimeMin).toBe(8);
  });

  it("bodyweight_time 목표에 반영된다", () => {
    const s = foldPeriodStats([tabataRow], "2026-07-27", "2026-09-30", "Asia/Seoul").get("u1")!;
    expect(actualForGoal(s, "bodyweight_time")).toBe(8);
  });

  it("타바타 횟수는 그대로 1회 — 분수를 더해도 중복 집계되지 않는다", () => {
    const s = foldPeriodStats([tabataRow], "2026-07-27", "2026-09-30", "Asia/Seoul").get("u1")!;
    expect(s.tabataCount).toBe(1);
  });

  it("세트에 durationSeconds가 있으면 그것과 함께 더해진다", () => {
    const mixed: PeriodSessionRow = {
      ...tabataRow,
      tabataMinutes: 4,
      exercises: [
        {
          ...tabataRow.exercises[0],
          sets: [{ ...tabataRow.exercises[0].sets[0], durationSeconds: 120 }],
        },
      ],
    };
    const s = foldPeriodStats([mixed], "2026-07-27", "2026-09-30", "Asia/Seoul").get("u1")!;
    expect(s.bodyweightTimeMin).toBe(6); // 타바타 4분 + 세트 120초
  });

  it("타바타가 아닌 세션은 영향 없다", () => {
    const plain: PeriodSessionRow = { ...tabataRow, tabataMinutes: null };
    const s = foldPeriodStats([plain], "2026-07-27", "2026-09-30", "Asia/Seoul").get("u1")!;
    expect(s.bodyweightTimeMin).toBe(0);
    expect(s.tabataCount).toBe(0);
  });
});

describe("goalCategories · countsTowardChallenge (신고 0783ca35, 2026-08-04)", () => {
  it("목표 유형을 분류로 접는다", () => {
    const cats = goalCategories([
      { goal_type: "bodyweight_reps" },
      { goal_type: "bodyweight_time" },
      { goal_type: "cardio_distance" },
    ]);
    expect([...cats].sort()).toEqual(["bodyweight", "cardio"]);
  });

  it("타바타는 맨몸으로, 볼륨은 웨이트로 접힌다", () => {
    expect([...goalCategories([{ goal_type: "tabata_count" }])]).toEqual([
      "bodyweight",
    ]);
    expect([...goalCategories([{ goal_type: "volume" }])]).toEqual(["weight"]);
  });

  it("맨몸·유산소 목표만 있으면 웨이트는 실적에 안 잡힌다", () => {
    // 낭만송곳니의 실제 상황 — 스쿼트를 '웨이트'로 100회 했는데 맨몸 %가 0이었다
    const cats = goalCategories([
      { goal_type: "bodyweight_reps" },
      { goal_type: "cardio_distance" },
    ]);
    expect(countsTowardChallenge("weight", cats)).toBe(false);
    expect(countsTowardChallenge("bodyweight", cats)).toBe(true);
    expect(countsTowardChallenge("cardio", cats)).toBe(true);
  });

  it("목표를 모르면 경고하지 않는다", () => {
    // 챌린지가 없거나 아직 못 불러온 상태에서 "도움 안 된다"고 하면
    // 멀쩡한 운동을 말리는 셈이다. 확실할 때만 경고한다.
    expect(countsTowardChallenge("weight", null)).toBe(true);
    expect(countsTowardChallenge("weight", new Set())).toBe(true);
  });

  it("분류 이름은 웨이트·맨몸·유산소 순으로 고정한다", () => {
    // Set 삽입 순서에 맡기면 사람마다 다른 순서로 보인다
    const cats = goalCategories([
      { goal_type: "cardio_time" },
      { goal_type: "bodyweight_reps" },
      { goal_type: "weight_reps" },
    ]);
    expect(categoriesLabel(cats)).toBe("웨이트 · 맨몸 · 유산소");
  });
});

describe("sessionGoalContribution — 완료 화면의 챌린지 기여 (2026-08-04)", () => {
  const KST = "Asia/Seoul";

  function session(
    exercises: PeriodSessionRow["exercises"],
    tabataMinutes: number | null = null,
  ): PeriodSessionRow {
    return {
      userId: "u1",
      completedAt: "2026-08-04T03:00:00Z", // KST 12:00
      tabataMinutes,
      exercises,
    };
  }

  const bodyweightSquat = {
    exerciseType: "bodyweight" as const,
    exerciseName: "맨몸 스쿼트",
    bodyPart: "하체",
    sets: [
      { weightKg: null, reps: 20, distanceMeters: null, durationSeconds: null, isCompleted: true },
      { weightKg: null, reps: 20, distanceMeters: null, durationSeconds: null, isCompleted: true },
    ],
  };

  it("맨몸 횟수 목표에 이번 운동분을 더해 보여준다", () => {
    const out = sessionGoalContribution({
      session: session([bodyweightSquat]),
      goals: [{ goal_type: "bodyweight_reps", target_value: 565.7 }],
      timeZone: KST,
    });
    expect(out).toEqual([
      { type: "bodyweight_reps", label: "맨몸 횟수", delta: 40, unit: "회", target: 565.7 },
    ]);
  });

  it("보탠 게 없는 목표도 0으로 그대로 돌려준다", () => {
    // ⚠️ 걸러 내면 안 된다. 기여가 하나도 없는 운동에서 카드가 통째로 사라져
    //    "왜 내 숫자가 안 오르지?"에 침묵하게 된다 — 원래 버그와 같은 실패다.
    //    무엇을 보여줄지는 화면이 정한다.
    const out = sessionGoalContribution({
      session: session([bodyweightSquat]),
      goals: [
        { goal_type: "bodyweight_reps", target_value: 565.7 },
        { goal_type: "weight_reps", target_value: 300 },
        { goal_type: "cardio_distance", target_value: 113.1 },
      ],
      timeZone: KST,
    });
    expect(out.map((c) => [c.type, c.delta])).toEqual([
      ["bodyweight_reps", 40],
      ["weight_reps", 0],
      ["cardio_distance", 0],
    ]);
  });

  it("웨이트 2종목은 하루 3종목 목표에 0일이다 (2026-08-04 실측)", () => {
    // 사용자가 개발 서버에서 실제로 만난 경우다. 규칙상 0이 맞지만,
    // 0을 돌려주지 않으면 화면이 이유를 설명할 수 없다.
    const weightEx = (name: string) => ({
      exerciseType: "weight" as const,
      exerciseName: name,
      bodyPart: "가슴",
      sets: [
        { weightKg: 40, reps: 10, distanceMeters: null, durationSeconds: null, isCompleted: true },
      ],
    });
    const out = sessionGoalContribution({
      session: session([weightEx("벤치프레스"), weightEx("인클라인 벤치프레스")]),
      goals: [{ goal_type: "weight_days", target_value: 12, qualifier: 3 }],
      timeZone: KST,
    });
    expect(out).toEqual([
      {
        type: "weight_days",
        label: "웨이트 운동일(하루 3종목+)",
        delta: 0,
        unit: "일",
        target: 12,
      },
    ]);
  });

  it("완료하지 않은 세트는 안 센다", () => {
    const out = sessionGoalContribution({
      session: session([
        {
          ...bodyweightSquat,
          sets: [
            { weightKg: null, reps: 20, distanceMeters: null, durationSeconds: null, isCompleted: true },
            { weightKg: null, reps: 99, distanceMeters: null, durationSeconds: null, isCompleted: false },
          ],
        },
      ]),
      goals: [{ goal_type: "bodyweight_reps", target_value: 100 }],
      timeZone: KST,
    });
    expect(out[0].delta).toBe(20);
  });

  it("타바타 분수가 맨몸 시간에 들어간다 (집계 규칙을 그대로 쓴다)", () => {
    // 이 단언이 이 함수를 foldPeriodStats에 얹어 둔 이유다. 규칙을 따로 쓰면
    // 타바타 세트가 reps=0·duration=null이라 여기서만 0분이 된다.
    const out = sessionGoalContribution({
      session: session([], 4),
      goals: [{ goal_type: "bodyweight_time", target_value: 100 }],
      timeZone: KST,
    });
    expect(out[0].delta).toBe(4);
  });

  it("맨몸 운동일은 하루 최소 종목 수를 채워야 +1일이 된다", () => {
    const goals = [
      { goal_type: "bodyweight_days" as const, target_value: 12, qualifier: 2 },
    ];
    // 1종목 — 조건 미달이라 0일 (행은 남는다: 화면이 이유를 말해야 한다)
    expect(
      sessionGoalContribution({ session: session([bodyweightSquat]), goals, timeZone: KST })[0],
    ).toMatchObject({ delta: 0, unit: "일" });
    // 2종목 — +1일
    const out = sessionGoalContribution({
      session: session([
        bodyweightSquat,
        { ...bodyweightSquat, exerciseName: "푸시업", bodyPart: "가슴" },
      ]),
      goals,
      timeZone: KST,
    });
    expect(out[0]).toMatchObject({ delta: 1, unit: "일", label: "맨몸 운동일(하루 2종목+)" });
  });

  it("유산소 거리는 m를 km로 바꿔 소수 첫째 자리까지", () => {
    const out = sessionGoalContribution({
      session: session([
        {
          exerciseType: "cardio",
          exerciseName: "걷기",
          bodyPart: "유산소",
          sets: [{ weightKg: null, reps: null, distanceMeters: 3200, durationSeconds: 2520, isCompleted: true }],
        },
      ]),
      goals: [{ goal_type: "cardio_distance", target_value: 113.1 }],
      timeZone: KST,
    });
    expect(out[0].delta).toBe(3.2);
  });

  it("목표가 없으면 빈 배열", () => {
    expect(
      sessionGoalContribution({ session: session([bodyweightSquat]), goals: [], timeZone: KST }),
    ).toEqual([]);
  });
});
