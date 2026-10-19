import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseBrowserClient: () => ({
    from: mocks.from,
    auth: { getUser: mocks.getUser },
  }),
}));

import {
  getMyWorkoutCalendarMonth,
  getPublicCrewCalendarMonth,
} from "./crew-calendar";

function query() {
  const q = {
    select: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
    not: vi.fn(),
    gte: vi.fn(),
    lt: vi.fn(),
    order: vi.fn(),
    maybeSingle: vi.fn(),
  };
  for (const key of ["select", "eq", "is", "not", "gte", "lt"] as const) {
    q[key].mockReturnValue(q);
  }
  return q;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("홈 프로필 달력 — 비공개 세션 노출 방지", () => {
  function setup() {
    const person = query();
    const sessions = query();
    person.maybeSingle.mockResolvedValue({ data: { timezone: "Asia/Seoul" }, error: null });
    sessions.order.mockResolvedValue({
      data: [
        { completed_at: "2026-10-05T01:00:00Z", duration_minutes: 30, verification_status: "none" },
      ],
      error: null,
    });
    mocks.from.mockImplementation((name: string) =>
      name === "profiles" ? person : sessions,
    );
    return sessions;
  }

  it("크루 달력 조회에는 visibility=group 조건이 필수다", async () => {
    const sessions = setup();
    const result = await getPublicCrewCalendarMonth("friend-id", 2026, 10);
    expect(sessions.eq).toHaveBeenCalledWith("visibility", "group");
    expect(result.workoutDays).toBe(1);
    expect(result.stamps[0].dateKey).toBe("2026-10-05");
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it("본인 확인을 통과한 달력에서만 비공개 운동까지 포함한다", async () => {
    const sessions = setup();
    mocks.getUser.mockResolvedValue({ data: { user: { id: "my-id" } }, error: null });
    const result = await getMyWorkoutCalendarMonth("my-id", 2026, 10);
    expect(sessions.eq).toHaveBeenCalledWith("user_id", "my-id");
    expect(sessions.eq).not.toHaveBeenCalledWith("visibility", "group");
    expect(result.workoutDays).toBe(1);
  });

  it("다른 사용자 ID로 본인 달력을 조회하면 쿼리 전 차단한다", async () => {
    setup();
    mocks.getUser.mockResolvedValue({ data: { user: { id: "my-id" } }, error: null });
    await expect(getMyWorkoutCalendarMonth("friend-id", 2026, 10))
      .rejects.toThrow("private_calendar_owner_only");
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
