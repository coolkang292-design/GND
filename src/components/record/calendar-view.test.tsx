// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CalendarView } from "./calendar-view";

// vitest globals가 꺼져 있어 RTL 자동 정리가 안 돈다 (CLAUDE.md §함정)
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const mocks = vi.hoisted(() => ({
  getMyProfile: vi.fn(),
  getCompletedSessions: vi.fn(),
  getSessionLogExercises: vi.fn(),
  getWorkoutPlans: vi.fn(),
  getActiveProgramEnrollments: vi.fn(),
  rescheduleProgramPlans: vi.fn(),
  cancelProgramEnrollment: vi.fn(),
  localId: vi.fn(),
  saveWorkoutPlan: vi.fn(),
}));

vi.mock("@/lib/crew", () => ({ getMyProfile: mocks.getMyProfile }));
vi.mock("@/lib/workout", () => ({
  getCompletedSessions: mocks.getCompletedSessions,
  getSessionLogExercises: mocks.getSessionLogExercises,
  // 실제 `localId`와 같은 자리 — 없으면 저장 경로가 undefined를 부른다.
  // 세는 방식이라 단언에서 키를 읽을 수 있다.
  localId: mocks.localId,
}));
vi.mock("@/lib/workout-plan", () => ({
  getWorkoutPlans: mocks.getWorkoutPlans,
  saveWorkoutPlan: mocks.saveWorkoutPlan,
  moveWorkoutPlan: vi.fn(),
  deleteWorkoutPlan: vi.fn(),
}));
vi.mock("@/lib/programs", () => ({
  getActiveProgramEnrollments: mocks.getActiveProgramEnrollments,
  rescheduleProgramPlans: mocks.rescheduleProgramPlans,
  cancelProgramEnrollment: mocks.cancelProgramEnrollment,
}));

/** 월 경계에서 흔들리지 않게 달 한가운데로 고정한다 (KST 2026-08-15) */
const TODAY_KST = new Date("2026-08-15T12:00:00+09:00");

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(TODAY_KST);
  mocks.getMyProfile.mockResolvedValue({
    timezone: "Asia/Seoul",
    weekly_goal: 3,
  });
  mocks.getCompletedSessions.mockResolvedValue([]);
  mocks.getWorkoutPlans.mockResolvedValue([]);
  mocks.getSessionLogExercises.mockResolvedValue([]);
  mocks.getActiveProgramEnrollments.mockResolvedValue([]);
  mocks.rescheduleProgramPlans.mockReset();
  mocks.rescheduleProgramPlans.mockResolvedValue(undefined);
  let seq = 0;
  mocks.localId.mockReset();
  mocks.localId.mockImplementation(() => `id-${++seq}`);
  mocks.saveWorkoutPlan.mockReset();
  mocks.saveWorkoutPlan.mockResolvedValue({ id: "plan-1" });
});

/** 인터벌 고르기 화면은 맨몸·비시간형만 보여 준다 */
const BODYWEIGHT_CATALOG = ["푸시업", "맨몸 스쿼트", "버피", "점핑잭"].map(
  (name, i) => ({
    id: `cat-${i}`,
    name,
    body_part: "코어" as const,
    exercise_type: "bodyweight" as const,
    measure: "reps" as const,
    is_custom: false,
    created_by: null,
    created_at: "2026-01-01T00:00:00Z",
  }),
);

async function setup(catalog: React.ComponentProps<typeof CalendarView>["catalog"] = []) {
  const view = render(
    <CalendarView
      userId="user-1"
      catalog={catalog}
      onScheduleSession={vi.fn()}
      onLoadPlan={vi.fn()}
      onCreateCustom={vi.fn()}
    />,
  );
  // useEffect의 3건 fetch가 끝나 달력이 그려질 때까지
  await screen.findByText("2026년 8월");
  return view;
}

describe("CalendarView — 날짜를 눌러 계획하기 (2026-08-02)", () => {
  it("미래의 빈 날짜 셀은 눌린다", async () => {
    // 이 단언이 그 버그 자체다. 전에는 disabled={!stamp && !plan}이라
    // 기록도 계획도 없는 미래 셀이 전부 잠겨 있어서, "새 운동 계획 만들기"에
    // 도달할 방법이 사실상 없었다. 다시 잠기면 여기서 실패한다.
    await setup();

    const tomorrow = screen.getByRole("button", { name: "8월 16일" });
    expect(tomorrow).not.toHaveProperty("disabled", true);
    expect((tomorrow as HTMLButtonElement).disabled).toBe(false);
  });

  it("오늘의 빈 날짜 셀도 눌린다", async () => {
    await setup();
    const today = screen.getByRole("button", {
      name: "8월 15일",
    }) as HTMLButtonElement;
    expect(today.disabled).toBe(false);
  });

  it("과거의 빈 날짜 셀은 잠긴다", async () => {
    // 반대 방향 단언 — 전부 열어 버리는 과잉 수정을 막는다.
    // 지난 날은 기록도 없고 0015 RLS상 계획도 세울 수 없다.
    await setup();
    const yesterday = screen.getByRole("button", {
      name: "8월 14일",
    }) as HTMLButtonElement;
    expect(yesterday.disabled).toBe(true);
  });

  it("미래의 빈 날짜를 누르면 계획 만들기 버튼이 있는 시트가 열린다", async () => {
    await setup();

    expect(screen.queryByText("➕ 새 운동 계획 만들기")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "8월 16일" }));

    expect(screen.getByText("➕ 새 운동 계획 만들기")).toBeTruthy();
    expect(
      screen.getByText(/아직 이 날의 계획이 없어요/),
    ).toBeTruthy();
  });
});

/**
 * ⑥ 계획한 운동의 상세보기 (2026-08-04).
 *
 * 계획의 세트·수량은 `workout_plans.exercises` jsonb에 **이미 들어 있고**
 * 시트가 그걸 이미 손에 쥐고 있다. 전에는 종목명만 join해 그렸다.
 */
const PLAN = {
  id: "plan-1",
  userId: "user-1",
  planDate: "2026-08-16",
  sourceSessionId: null,
  createdAt: "2026-08-15T00:00:00Z",
  updatedAt: "2026-08-15T00:00:00Z",
  exercises: [
    {
      name: "스쿼트",
      bodyPart: "하체" as const,
      exerciseType: "weight" as const,
      measure: null,
      isCustom: false,
      sets: [
        { weightKg: 80, reps: 5, distanceKm: 0, durationMin: 0 },
        { weightKg: 80, reps: 3, distanceKm: 0, durationMin: 0 },
      ],
    },
    {
      name: "러닝",
      bodyPart: "유산소" as const,
      exerciseType: "cardio" as const,
      measure: null,
      isCustom: false,
      sets: [{ weightKg: 0, reps: 0, distanceKm: 3, durationMin: 25 }],
    },
  ],
};

/**
 * ④ 지난 운동 기록 상세보기 — 달력 경로 (2026-08-04).
 *
 * 시트는 공유 텍스트용으로 `getSessionLogExercises`를 **이미 호출한다**.
 * 세션별로 나눠 보관해 그리기만 하면 된다 — 새 조회가 없다.
 */
const SESSION = {
  id: "session-1",
  completedAt: new Date("2026-08-10T19:00:00+09:00"),
  verification: "camera_verified" as const,
  durationSeconds: 3600,
  exerciseNames: ["벤치 프레스"],
  recordNote: null,
  tabataMinutes: null,
};

const SESSION_LOG = [
  {
    name: "벤치 프레스",
    exerciseType: "weight" as const,
    measure: null,
    sets: [
      { weightKg: 60, reps: 8, distanceKm: 0, durationMin: 0, done: true },
      { weightKg: 60, reps: 4, distanceKm: 0, durationMin: 0, done: false },
    ],
  },
];

/**
 * 인터벌로 계획하기 (사용자 지시 2026-08-13).
 *
 * 예전에는 `새 운동 계획 만들기`로 인터벌 계획을 만들 수 없었다 — 코스를 고르는
 * 화면이 없어서, 종목만 담으면 **3세트 10회짜리 일반 계획**이 됐다.
 */
describe("CalendarView — 인터벌로 계획하기 (2026-08-13)", () => {
  it("상황별 추천에 인터벌 칸이 있고, 누르면 코스 고르는 화면이 열린다", async () => {
    await setup();

    fireEvent.click(screen.getByRole("button", { name: "8월 16일" }));
    fireEvent.click(screen.getByText("➕ 새 운동 계획 만들기"));
    fireEvent.click(screen.getByText("운동 직접 고르기"));
    fireEvent.click(screen.getByText(/상황별 추천/));
    fireEvent.click(screen.getByText("전신 인터벌 할래요"));

    // 기록 화면과 달리 **계획**이라고 말한다
    fireEvent.click(screen.getByRole("button", { name: "인터벌로 계획하기" }));

    // 코스 셋과 저장 버튼이 있는 화면 — 시트의 고르는 화면을 빌린다
    expect(screen.getByRole("button", { name: "4분" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "8분" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "16분" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /8월 16일 예정표로 저장/ }),
    ).toBeTruthy();
  });

  it("종목 4개를 채우기 전에는 저장할 수 없다", async () => {
    await setup();

    fireEvent.click(screen.getByRole("button", { name: "8월 16일" }));
    fireEvent.click(screen.getByText("➕ 새 운동 계획 만들기"));
    fireEvent.click(screen.getByText("운동 직접 고르기"));
    fireEvent.click(screen.getByText(/상황별 추천/));
    fireEvent.click(screen.getByText("전신 인터벌 할래요"));
    fireEvent.click(screen.getByRole("button", { name: "인터벌로 계획하기" }));

    const save = screen.getByRole("button", {
      name: /8월 16일 예정표로 저장/,
    }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
  });

  /*
    회귀: 저장이 **실제로 무엇을 보내는지**는 아무도 보지 않았다. 위 두 테스트는
    화면이 열리는 것과 잠기는 것만 본다.

    두 가지를 여기서 잡는다.

    ① 코스가 세트를 정한다. 예전에 `newPlanExercises`를 쓰던 시절 인터벌 계획이
       **3세트 10회**로 저장돼 달력에 `0회`로 떴다(사용자 지적 2026-08-13).
       4분 = 2회다.
    ② `tabataMinutes`가 실려야 예정표가 인터벌로 되살아난다. 빠지면 종목만 남은
       평범한 맨몸 계획이 되고, 음원도 전체화면도 열리지 않는다.
  */
  it("코스가 세트를 정한다 — 4분이면 2회로 저장한다", async () => {
    await setup(BODYWEIGHT_CATALOG);

    fireEvent.click(screen.getByRole("button", { name: "8월 16일" }));
    fireEvent.click(screen.getByText("➕ 새 운동 계획 만들기"));
    fireEvent.click(screen.getByText("운동 직접 고르기"));
    fireEvent.click(screen.getByText(/상황별 추천/));
    fireEvent.click(screen.getByText("전신 인터벌 할래요"));
    fireEvent.click(screen.getByRole("button", { name: "인터벌로 계획하기" }));

    fireEvent.click(screen.getByRole("button", { name: "4분" }));
    fireEvent.click(screen.getByText(/운동 고르기 \(0\/4\)/));
    for (const c of BODYWEIGHT_CATALOG) {
      fireEvent.click(screen.getByText(c.name));
    }
    fireEvent.click(screen.getByText("선택한 4개 운동 추가"));
    fireEvent.click(
      screen.getByRole("button", { name: /8월 16일 예정표로 저장/ }),
    );

    await waitFor(() => expect(mocks.saveWorkoutPlan).toHaveBeenCalled());
    const sent = mocks.saveWorkoutPlan.mock.calls[0][0];
    expect(sent.planDate).toBe("2026-08-16");
    expect(sent.tabataMinutes).toBe(4); // ② 빠지면 인터벌이 아니게 된다
    expect(sent.exercises).toHaveLength(4);
    for (const ex of sent.exercises) {
      // 한 종목이 한 줄이고, 그 줄의 **횟수가 라운드 수**다.
      // 4분 = 8라운드 ÷ 종목 4개 = 2회. 예전 `0회`가 여기서 나왔다.
      expect(ex.sets).toHaveLength(1);
      expect(ex.sets[0].reps).toBe(2);
    }
  });

  /*
    회귀: 이 화면은 `crypto.randomUUID()`를 직접 불렀다. 그건 **보안 컨텍스트
    전용**이라 `http://<LAN IP>:3000`으로 띄운 개발 서버 — 폰으로 확인할 때 쓰는
    바로 그 주소 — 에서는 없다. 저장이 거기서만 터졌다.

    `@/lib/workout`의 `localId()`가 그 대비를 이미 들고 있다. 아래는 그 함수를
    **거쳐 가는지**를 본다. 직접 부르면 이 단언이 0으로 떨어진다.
  */
  it("키를 localId로 만든다 — 보안 컨텍스트가 아니어도 저장된다", async () => {
    await setup(BODYWEIGHT_CATALOG);

    fireEvent.click(screen.getByRole("button", { name: "8월 16일" }));
    fireEvent.click(screen.getByText("➕ 새 운동 계획 만들기"));
    fireEvent.click(screen.getByText("운동 직접 고르기"));
    fireEvent.click(screen.getByText(/상황별 추천/));
    fireEvent.click(screen.getByText("전신 인터벌 할래요"));
    fireEvent.click(screen.getByRole("button", { name: "인터벌로 계획하기" }));
    fireEvent.click(screen.getByText(/운동 고르기 \(0\/4\)/));
    for (const c of BODYWEIGHT_CATALOG) {
      fireEvent.click(screen.getByText(c.name));
    }
    fireEvent.click(screen.getByText("선택한 4개 운동 추가"));
    fireEvent.click(
      screen.getByRole("button", { name: /8월 16일 예정표로 저장/ }),
    );

    await waitFor(() => expect(mocks.saveWorkoutPlan).toHaveBeenCalled());
    expect(mocks.localId).toHaveBeenCalled();
  });
});
describe("CalendarView — 지난 기록 상세 (2026-08-04)", () => {
  beforeEach(() => {
    mocks.getCompletedSessions.mockResolvedValue([SESSION]);
    mocks.getSessionLogExercises.mockResolvedValue(SESSION_LOG);
  });

  async function openDay() {
    await setup();
    fireEvent.click(screen.getByRole("button", { name: "8월 10일" }));
  }

  it("펼치기 전에는 세트가 보이지 않는다", async () => {
    await openDay();

    expect(screen.queryByText("60kg 8회")).toBeNull();
  });

  it("세션 줄을 누르면 그 운동의 세트가 펼쳐진다", async () => {
    await openDay();

    fireEvent.click(await screen.findByRole("button", { name: /운동 상세/ }));

    expect(screen.getByText("60kg 8회")).toBeTruthy();
    expect(screen.getByText("60kg 4회")).toBeTruthy();
  });

  it("완료 세트와 미완료 세트를 구분해 보여준다 — done이 실제로 전달돼야 한다", async () => {
    await openDay();

    fireEvent.click(await screen.findByRole("button", { name: /운동 상세/ }));

    expect(screen.getByLabelText("1세트 완료")).toBeTruthy();
    expect(screen.getByLabelText("2세트 미완료")).toBeTruthy();
  });

  it("다시 누르면 접힌다", async () => {
    await openDay();

    const row = await screen.findByRole("button", { name: /운동 상세/ });
    fireEvent.click(row);
    expect(screen.getByText("60kg 8회")).toBeTruthy();

    fireEvent.click(row);
    expect(screen.queryByText("60kg 8회")).toBeNull();
  });

  it("복사 버튼은 그대로 남는다 — 상세는 더하는 것이지 뺏는 게 아니다", async () => {
    await openDay();

    expect(screen.getByText("📋 복사")).toBeTruthy();
  });
});

describe("CalendarView — 계획 상세 (2026-08-04)", () => {
  it("계획을 누르면 종목별 세트 수량까지 보여준다", async () => {
    mocks.getWorkoutPlans.mockResolvedValue([PLAN]);
    await setup();

    fireEvent.click(screen.getByRole("button", { name: "8월 16일" }));

    expect(screen.getByText("80kg 5회")).toBeTruthy();
    expect(screen.getByText("80kg 3회")).toBeTruthy();
    expect(screen.getByText("3km 25분")).toBeTruthy();
  });

  it("계획에는 완료·미완료 표시를 그리지 않는다", async () => {
    mocks.getWorkoutPlans.mockResolvedValue([PLAN]);
    await setup();

    fireEvent.click(screen.getByRole("button", { name: "8월 16일" }));

    expect(screen.queryByLabelText(/세트 완료$/)).toBeNull();
    expect(screen.queryByLabelText(/세트 미완료$/)).toBeNull();
  });

  it("종목 요약 줄은 그대로 남는다 — 상세는 더하는 것이지 바꾸는 게 아니다", async () => {
    mocks.getWorkoutPlans.mockResolvedValue([PLAN]);
    await setup();

    fireEvent.click(screen.getByRole("button", { name: "8월 16일" }));

    expect(screen.getByText("스쿼트 · 러닝")).toBeTruthy();
    expect(screen.getByText(/2종목/)).toBeTruthy();
  });
});

/**
 * 명칭 통일 (2026-08-12, 사용자 지시) — 화면에서는 "타바타"라는 전문용어를
 * 쓰지 않고 "전신 인터벌"로 부른다. 예정 배지·준비 버튼·지난 기록 줄이
 * 같은 말을 해야 한다. 내부 필드명(`tabataMinutes`)은 그대로다.
 */
const INTERVAL_PLAN = {
  ...PLAN,
  id: "plan-interval",
  planDate: "2026-08-15",
  tabataMinutes: 8,
};

const INTERVAL_SESSION = {
  ...SESSION,
  id: "session-interval",
  tabataMinutes: 8,
};

describe("CalendarView — 전신 인터벌 명칭 (2026-08-12)", () => {
  it("오늘의 인터벌 계획은 예정 배지와 준비 버튼을 전신 인터벌로 안내한다", async () => {
    mocks.getWorkoutPlans.mockResolvedValue([INTERVAL_PLAN]);
    await setup();

    fireEvent.click(screen.getByRole("button", { name: "8월 15일" }));

    expect(screen.getByText("🔥 전신 인터벌 8분 예정")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "🔥 전신 인터벌 시작하기" }),
    ).toBeTruthy();
  });

  it("지난 인터벌 기록 줄도 전신 인터벌로 적는다", async () => {
    mocks.getCompletedSessions.mockResolvedValue([INTERVAL_SESSION]);
    await setup();

    fireEvent.click(screen.getByRole("button", { name: "8월 10일" }));

    expect(screen.getByText(/전신 인터벌 8분/)).toBeTruthy();
  });

  it("옛 용어 '타바타'는 계획에도 기록에도 남지 않는다", async () => {
    // 제거 검증 — 새 문구가 있는지만 보면 옛 문구가 사라졌는지 확인한 게 아니다.
    mocks.getWorkoutPlans.mockResolvedValue([INTERVAL_PLAN]);
    mocks.getCompletedSessions.mockResolvedValue([INTERVAL_SESSION]);
    const { container } = await setup();

    fireEvent.click(screen.getByRole("button", { name: "8월 15일" }));
    expect(container.textContent ?? "").not.toContain("타바타");

    fireEvent.click(screen.getByRole("button", { name: "8월 10일" }));
    expect(container.textContent ?? "").not.toContain("타바타");
  });
});

/**
 * 프로그램 진행 표시와 결석 재배치 (계획 2026-08-12 Task 7).
 *
 * 데이터·도메인은 이미 있다 — `WorkoutPlan`이 프로그램 메타를 싣고 오고,
 * `buildMissedSessionProposal()`은 순수 함수이며 `rescheduleProgramPlans()`가
 * RPC를 감싼다. 여기서 고정하는 것은 **화면 배선**이다.
 *
 * ⚠️ 제안만 만들었을 때 DB를 건드리면 안 된다. 사용자가 확인을 누르기 전에
 *    RPC가 나가면 "미리보기"가 아니라 그냥 실행이다.
 */
const ENROLLMENT = {
  id: "11111111-1111-4111-8111-111111111111",
  programKey: "shoulder-frame-6w",
  programVersion: 1,
  title: "상체의 틀을 넓히는 6주",
  levelAtStart: "beginner" as const,
  startDate: "2026-08-10",
  timeZone: "Asia/Seoul",
  // 월·수·금 19시 — 2026-08-10/12/14가 여기 걸린다
  preferredSlots: [
    { weekday: 1 as const, time: "19:00" },
    { weekday: 3 as const, time: "19:00" },
    { weekday: 5 as const, time: "19:00" },
  ],
  status: "active" as const,
};

function programPlan(overrides: {
  id: string;
  planDate: string;
  programWeek: number;
  programSession: number;
}) {
  return {
    userId: "user-1",
    sourceSessionId: null,
    exercises: [
      {
        name: "숄더프레스",
        bodyPart: "어깨" as const,
        exerciseType: "weight" as const,
        measure: null,
        isCustom: false,
        sets: [{ weightKg: 0, reps: 8, distanceKm: 0, durationMin: 0 }],
      },
    ],
    tabataMinutes: null,
    title: ENROLLMENT.title,
    scheduledAt: `${overrides.planDate}T10:00:00.000Z`,
    programEnrollmentId: ENROLLMENT.id,
    programTemplateVersion: 1,
    createdAt: "2026-08-09T00:00:00.000Z",
    updatedAt: "2026-08-09T00:00:00.000Z",
    ...overrides,
  };
}

describe("CalendarView — 프로그램 진행 표시 (2026-08-12)", () => {
  beforeEach(() => {
    mocks.getActiveProgramEnrollments.mockResolvedValue([ENROLLMENT]);
  });

  it("프로그램 계획에 프로그램명과 주차·회차 기호를 보여준다", async () => {
    mocks.getWorkoutPlans.mockResolvedValue([
      programPlan({
        id: "22222222-2222-4222-8222-222222222222",
        planDate: "2026-08-24",
        programWeek: 2,
        programSession: 1,
      }),
    ]);
    await setup();

    fireEvent.click(screen.getByRole("button", { name: "8월 24일" }));

    expect(screen.getByText("상체의 틀을 넓히는 6주")).toBeTruthy();
    expect(screen.getByText("2주차 · A")).toBeTruthy();
  });

  it("회차 번호를 A·B·C로 옮긴다 — 3회차는 C다", async () => {
    mocks.getWorkoutPlans.mockResolvedValue([
      programPlan({
        id: "22222222-2222-4222-8222-222222222223",
        planDate: "2026-08-24",
        programWeek: 6,
        programSession: 3,
      }),
    ]);
    await setup();

    fireEvent.click(screen.getByRole("button", { name: "8월 24일" }));

    expect(screen.getByText("6주차 · C")).toBeTruthy();
  });

  it("프로그램 계획은 일반 계획과 구분된다 — 운동 예정으로 뭉뚱그리지 않는다", async () => {
    mocks.getWorkoutPlans.mockResolvedValue([
      programPlan({
        id: "22222222-2222-4222-8222-222222222222",
        planDate: "2026-08-24",
        programWeek: 2,
        programSession: 1,
      }),
    ]);
    await setup();

    fireEvent.click(screen.getByRole("button", { name: "8월 24일" }));

    expect(screen.queryByText("운동 예정")).toBeNull();
    expect(screen.getByText(/프로그램 예정/)).toBeTruthy();
  });

  /**
   * 사용자 지적 2026-08-12 — 달력에서 프로그램을 끝낼 수 있어야 한다.
   * `삭제` 하나만 있으면 그만두려는 사람이 18번 눌러야 한다.
   */
  it("달력에서 프로그램을 통째로 그만둘 수 있다", async () => {
    const plans = [
      programPlan({
        id: "22222222-2222-4222-8222-222222222222",
        planDate: "2026-08-24",
        programWeek: 2,
        programSession: 1,
      }),
      programPlan({
        id: "22222222-2222-4222-8222-222222222224",
        planDate: "2026-08-26",
        programWeek: 2,
        programSession: 2,
      }),
    ];
    mocks.getWorkoutPlans.mockResolvedValue(plans);
    mocks.cancelProgramEnrollment.mockResolvedValue(2);
    const confirmSpy = vi
      .spyOn(window, "confirm")
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    await setup();

    fireEvent.click(screen.getByRole("button", { name: "8월 24일" }));
    // 두 삭제의 범위가 라벨로 갈린다
    expect(screen.getByRole("button", { name: "이 회차만 삭제" })).toBeTruthy();
    const quit = screen.getByRole("button", { name: "프로그램 그만두기" });

    // ① 확인창에서 아니오 → 아무것도 안 지운다
    await act(async () => fireEvent.click(quit));
    expect(mocks.cancelProgramEnrollment).not.toHaveBeenCalled();

    // ② 예 → 그 등록의 계획이 달력에서 모두 사라진다
    await act(async () => fireEvent.click(quit));
    expect(mocks.cancelProgramEnrollment).toHaveBeenCalledWith(ENROLLMENT.id);
    await waitFor(() => {
      expect(screen.queryByText(/프로그램 예정/)).toBeNull();
    });

    confirmSpy.mockRestore();
  });

  it("일반 계획에는 그만두기가 없다", async () => {
    // 프로그램이 아닌 계획에 프로그램 그만두기가 뜨면 안 된다
    mocks.getWorkoutPlans.mockResolvedValue([PLAN]);
    await setup();

    fireEvent.click(screen.getByRole("button", { name: "8월 16일" }));

    expect(screen.getByRole("button", { name: "삭제" })).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "프로그램 그만두기" }),
    ).toBeNull();
  });

  it("일반 계획은 예전 그대로 운동 예정이다 — 회귀", async () => {
    mocks.getWorkoutPlans.mockResolvedValue([PLAN]);
    await setup();

    fireEvent.click(screen.getByRole("button", { name: "8월 16일" }));

    expect(screen.getByText("운동 예정")).toBeTruthy();
    expect(screen.queryByText(/프로그램 예정/)).toBeNull();
  });

  it("지난 미완료 회차에 놓친 운동을 표시한다", async () => {
    mocks.getWorkoutPlans.mockResolvedValue([
      programPlan({
        id: "22222222-2222-4222-8222-222222222224",
        planDate: "2026-08-10",
        programWeek: 1,
        programSession: 1,
      }),
    ]);
    await setup();

    fireEvent.click(screen.getByRole("button", { name: "8월 10일" }));

    expect(screen.getByText("놓친 운동")).toBeTruthy();
  });

  it("그날 운동을 마쳤으면 놓친 운동이 아니다", async () => {
    mocks.getWorkoutPlans.mockResolvedValue([
      programPlan({
        id: "22222222-2222-4222-8222-222222222225",
        planDate: "2026-08-10",
        programWeek: 1,
        programSession: 1,
      }),
    ]);
    mocks.getCompletedSessions.mockResolvedValue([
      {
        ...SESSION,
        id: "done-1",
        completedAt: new Date("2026-08-10T19:00:00+09:00"),
      },
    ]);
    await setup();

    fireEvent.click(screen.getByRole("button", { name: "8월 10일" }));

    expect(screen.queryByText("놓친 운동")).toBeNull();
  });

  it("아직 오지 않은 회차는 놓친 운동이 아니다", async () => {
    mocks.getWorkoutPlans.mockResolvedValue([
      programPlan({
        id: "22222222-2222-4222-8222-222222222226",
        planDate: "2026-08-24",
        programWeek: 2,
        programSession: 1,
      }),
    ]);
    await setup();

    fireEvent.click(screen.getByRole("button", { name: "8월 24일" }));

    expect(screen.queryByText("놓친 운동")).toBeNull();
  });
});

describe("CalendarView — 남은 일정 재배치 (2026-08-12)", () => {
  /** 08-10 놓침 · 08-12 완료 · 08-17 예정 */
  const PLANS = [
    programPlan({
      id: "33333333-3333-4333-8333-333333333331",
      planDate: "2026-08-10",
      programWeek: 1,
      programSession: 1,
    }),
    programPlan({
      id: "33333333-3333-4333-8333-333333333332",
      planDate: "2026-08-12",
      programWeek: 1,
      programSession: 2,
    }),
    programPlan({
      id: "33333333-3333-4333-8333-333333333333",
      planDate: "2026-08-17",
      programWeek: 1,
      programSession: 3,
    }),
  ];

  beforeEach(() => {
    mocks.getActiveProgramEnrollments.mockResolvedValue([ENROLLMENT]);
    mocks.getWorkoutPlans.mockResolvedValue(PLANS);
    // 08-12은 실제로 운동을 마쳤다 → 이동 대상이 아니다
    mocks.getCompletedSessions.mockResolvedValue([
      {
        ...SESSION,
        id: "done-2",
        completedAt: new Date("2026-08-12T19:00:00+09:00"),
      },
    ]);
  });

  async function openMissed() {
    await setup();
    fireEvent.click(screen.getByRole("button", { name: "8월 10일" }));
  }

  it("프로그램 계획은 날짜 이동 대신 남은 일정 다시 잡기를 준다", async () => {
    await openMissed();

    expect(
      screen.getByRole("button", { name: "남은 일정 다시 잡기" }),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "날짜 이동" })).toBeNull();
  });

  it("아직 오지 않은 프로그램 회차에는 재배치 버튼을 보이지 않는다", async () => {
    await setup();
    fireEvent.click(screen.getByRole("button", { name: "8월 17일" }));

    expect(
      screen.queryByRole("button", { name: "남은 일정 다시 잡기" }),
    ).toBeNull();
  });

  it("일반 계획에는 날짜 이동이 그대로 남는다 — 회귀", async () => {
    mocks.getWorkoutPlans.mockResolvedValue([PLAN]);
    mocks.getCompletedSessions.mockResolvedValue([]);
    await setup();

    fireEvent.click(screen.getByRole("button", { name: "8월 16일" }));

    expect(screen.getByRole("button", { name: "날짜 이동" })).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "남은 일정 다시 잡기" }),
    ).toBeNull();
  });

  it("제안을 눌러도 확인 전에는 DB를 바꾸지 않는다", async () => {
    await openMissed();

    fireEvent.click(screen.getByRole("button", { name: "남은 일정 다시 잡기" }));

    expect(await screen.findByText(/이렇게 옮길게요/)).toBeTruthy();
    expect(mocks.rescheduleProgramPlans).not.toHaveBeenCalled();
  });

  it("제안에 옮겨질 날짜가 보인다", async () => {
    await openMissed();

    fireEvent.click(screen.getByRole("button", { name: "남은 일정 다시 잡기" }));
    await screen.findByText(/이렇게 옮길게요/);

    // 놓친 08-10은 오늘(08-15) 이후로 밀린다
    expect(screen.getByText(/8월 10일 →/)).toBeTruthy();
  });

  it("확인하면 RPC를 정확히 한 번 부른다", async () => {
    await openMissed();

    fireEvent.click(screen.getByRole("button", { name: "남은 일정 다시 잡기" }));
    fireEvent.click(await screen.findByRole("button", { name: "이대로 옮기기" }));

    await waitFor(() =>
      expect(mocks.rescheduleProgramPlans).toHaveBeenCalledTimes(1),
    );
    const arg = mocks.rescheduleProgramPlans.mock.calls[0][0];
    expect(arg.enrollmentId).toBe(ENROLLMENT.id);
    expect(arg.moves.length).toBeGreaterThan(0);
  });

  it("이미 마친 회차는 이동 대상에 넣지 않는다", async () => {
    await openMissed();

    fireEvent.click(screen.getByRole("button", { name: "남은 일정 다시 잡기" }));
    fireEvent.click(await screen.findByRole("button", { name: "이대로 옮기기" }));

    await waitFor(() =>
      expect(mocks.rescheduleProgramPlans).toHaveBeenCalledTimes(1),
    );
    const { moves } = mocks.rescheduleProgramPlans.mock.calls[0][0];
    expect(
      (moves as { planId: string }[]).some((m) => m.planId === PLANS[1].id),
    ).toBe(false);
  });

  it("옮기는 날짜는 전부 오늘 이후다 — 과거로 되돌리지 않는다", async () => {
    await openMissed();

    fireEvent.click(screen.getByRole("button", { name: "남은 일정 다시 잡기" }));
    fireEvent.click(await screen.findByRole("button", { name: "이대로 옮기기" }));

    await waitFor(() =>
      expect(mocks.rescheduleProgramPlans).toHaveBeenCalledTimes(1),
    );
    const { moves } = mocks.rescheduleProgramPlans.mock.calls[0][0];
    for (const move of moves as { suggestedDate: string }[]) {
      expect(move.suggestedDate >= "2026-08-15").toBe(true);
    }
  });
});

/**
 * 계획이 있는 날은 준비 단계를 건너뛴다 (사용자 지시 2026-08-12).
 *
 * 예전에는 `운동 준비하기` → 운동 탭으로 이동 → `운동 시작`으로 **두 번** 눌러야
 * 했다. 계획을 이미 짜 둔 날에 "준비"를 한 번 더 시키는 것은 같은 결정을 두 번
 * 묻는 것이다.
 *
 * ⚠️ 전신 인터벌 계획은 예외다 — 시트에서 음원·코스를 확인하고 시작한다.
 */
describe("CalendarView — 계획한 날 바로 시작 (2026-08-12)", () => {
  const todayPlan = { ...PLAN, id: "plan-today", planDate: "2026-08-15" };

  it("오늘 계획의 버튼은 '운동 시작하기'다", async () => {
    mocks.getWorkoutPlans.mockResolvedValue([todayPlan]);
    await setup();

    fireEvent.click(screen.getByRole("button", { name: "8월 15일" }));

    expect(screen.getByRole("button", { name: "운동 시작하기" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "운동 준비하기" })).toBeNull();
  });

  it("누르면 바로 시작하라고 알린다", async () => {
    const onLoadPlan = vi.fn().mockReturnValue(true);
    mocks.getWorkoutPlans.mockResolvedValue([todayPlan]);
    render(
      <CalendarView
        userId="user-1"
        catalog={[]}
        onScheduleSession={vi.fn()}
        onLoadPlan={onLoadPlan}
        onCreateCustom={vi.fn()}
      />,
    );
    await screen.findByText("2026년 8월");

    fireEvent.click(screen.getByRole("button", { name: "8월 15일" }));
    fireEvent.click(screen.getByRole("button", { name: "운동 시작하기" }));

    await waitFor(() => expect(onLoadPlan).toHaveBeenCalledTimes(1));
    expect(onLoadPlan).toHaveBeenCalledWith(
      expect.objectContaining({ id: "plan-today" }),
      { startNow: true },
    );
  });

  it("전신 인터벌 계획도 한 번에 시작한다", async () => {
    const onLoadPlan = vi.fn().mockReturnValue(true);
    mocks.getWorkoutPlans.mockResolvedValue([
      { ...todayPlan, id: "plan-interval", tabataMinutes: 8 },
    ]);
    render(
      <CalendarView
        userId="user-1"
        catalog={[]}
        onScheduleSession={vi.fn()}
        onLoadPlan={onLoadPlan}
        onCreateCustom={vi.fn()}
      />,
    );
    await screen.findByText("2026년 8월");

    fireEvent.click(screen.getByRole("button", { name: "8월 15일" }));
    fireEvent.click(
      screen.getByRole("button", { name: "🔥 전신 인터벌 시작하기" }),
    );

    await waitFor(() => expect(onLoadPlan).toHaveBeenCalledTimes(1));
    // 사용자 지시 2026-08-13 — 인터벌만 `준비하기`로 한 단계 더 있었다.
    // 계획이 종목과 코스를 이미 들고 있어서 시트에서 고를 것이 없다.
    expect(onLoadPlan).toHaveBeenCalledWith(
      expect.objectContaining({ id: "plan-interval" }),
      { startNow: true },
    );
  });

  it("오늘이 아닌 날에는 시작 버튼을 내지 않는다", async () => {
    mocks.getWorkoutPlans.mockResolvedValue([PLAN]);
    await setup();

    fireEvent.click(screen.getByRole("button", { name: "8월 16일" }));

    expect(screen.queryByRole("button", { name: /운동 시작하기/ })).toBeNull();
  });
});
