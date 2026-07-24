import { describe, expect, it } from "vitest";
import {
  CHALLENGE_PASS_HOURS,
  KING_DAYS,
  PASS_HOURS,
  challengePassStatus,
  hasConsecutiveWorkoutDays,
  viewingPassStatus,
  weekWorkoutDays,
} from "./viewing-pass";

const TZ = "Asia/Seoul";
const d = (iso: string) => new Date(iso);
// 이번 주: 2026-07-13(월) 00:00 KST ~ / now 기본값: 금요일 저녁
const NOW = d("2026-07-17T19:00:00+09:00");

describe("weekWorkoutDays — 이번 주(월요일 시작) 고유 운동일", () => {
  it("빈 입력 → 0일, fifthAt 없음", () => {
    expect(weekWorkoutDays([], NOW, TZ)).toEqual({ days: [], fifthAt: null });
  });

  it("하루 2세션은 1일로 센다", () => {
    const r = weekWorkoutDays(
      [d("2026-07-14T07:00:00+09:00"), d("2026-07-14T21:00:00+09:00")],
      NOW,
      TZ,
    );
    expect(r.days).toEqual(["2026-07-14"]);
  });

  it("지난 주 세션은 제외 — 월요일 00:00 KST 직전은 지난 주", () => {
    const r = weekWorkoutDays(
      [d("2026-07-12T14:59:59Z"), d("2026-07-12T15:00:00Z")], // KST 일 23:59:59 / 월 00:00
      NOW,
      TZ,
    );
    expect(r.days).toEqual(["2026-07-13"]);
  });

  it("5번째 고유 날짜의 '첫' 세션 시각이 fifthAt", () => {
    const r = weekWorkoutDays(
      [
        d("2026-07-13T08:00:00+09:00"),
        d("2026-07-14T08:00:00+09:00"),
        d("2026-07-15T08:00:00+09:00"),
        d("2026-07-16T08:00:00+09:00"),
        d("2026-07-17T06:00:00+09:00"), // 5일째 첫 세션 ← fifthAt
        d("2026-07-17T20:00:00+09:00"),
      ],
      NOW,
      TZ,
    );
    expect(r.days).toHaveLength(KING_DAYS);
    expect(r.fifthAt).toEqual(d("2026-07-17T06:00:00+09:00"));
  });
});

const FIVE_DAYS = [
  d("2026-07-13T08:00:00+09:00"),
  d("2026-07-14T08:00:00+09:00"),
  d("2026-07-15T08:00:00+09:00"),
  d("2026-07-16T08:00:00+09:00"),
  d("2026-07-17T06:00:00+09:00"),
];
const FIFTH_AT = d("2026-07-17T06:00:00+09:00");
const EXPIRES_AT = new Date(FIFTH_AT.getTime() + PASS_HOURS * 3_600_000);

describe("viewingPassStatus — 열람권 상태", () => {
  it("4일이면 progress + daysDone", () => {
    const s = viewingPassStatus(FIVE_DAYS.slice(0, 4), [], NOW, TZ);
    expect(s).toEqual({
      state: "progress",
      daysDone: 4,
      acquiredAt: null,
      expiresAt: null,
    });
  });

  it("5일 달성 & 24h 이내 & 미사용 → available", () => {
    const s = viewingPassStatus(FIVE_DAYS, [], NOW, TZ);
    expect(s.state).toBe("available");
    expect(s.acquiredAt).toEqual(FIFTH_AT);
    expect(s.expiresAt).toEqual(EXPIRES_AT);
  });

  it("만료 시각 정각부터 expired (now >= expiresAt)", () => {
    expect(viewingPassStatus(FIVE_DAYS, [], EXPIRES_AT, TZ).state).toBe(
      "expired",
    );
    expect(
      viewingPassStatus(FIVE_DAYS, [], new Date(EXPIRES_AT.getTime() - 1), TZ)
        .state,
    ).toBe("available");
  });

  it("획득 이후 열람 기록이 있으면 used", () => {
    const s = viewingPassStatus(
      FIVE_DAYS,
      [d("2026-07-17T07:00:00+09:00")],
      NOW,
      TZ,
    );
    expect(s.state).toBe("used");
  });

  it("획득 이전(지난 열람권) 기록은 무시 → available", () => {
    const s = viewingPassStatus(
      FIVE_DAYS,
      [d("2026-07-10T07:00:00+09:00")],
      NOW,
      TZ,
    );
    expect(s.state).toBe("available");
  });

  it("6일째 운동해도 fifthAt(획득 시각)은 5일째 그대로 — 재발급 없음", () => {
    const withSixth = [...FIVE_DAYS, d("2026-07-18T08:00:00+09:00")];
    const s = viewingPassStatus(
      withSixth,
      [],
      d("2026-07-18T09:00:00+09:00"),
      TZ,
    );
    expect(s.acquiredAt).toEqual(FIFTH_AT);
  });

  it("주가 바뀌면 progress로 리셋 — 지난 주 5일은 무효", () => {
    const nextMonday = d("2026-07-20T10:00:00+09:00");
    const s = viewingPassStatus(FIVE_DAYS, [], nextMonday, TZ);
    expect(s).toEqual({
      state: "progress",
      daysDone: 0,
      acquiredAt: null,
      expiresAt: null,
    });
  });
});

// ── 챌린지 열람권: 엄밀 연속 5일 + 2시간 (D1·D3) ──────────────
const at = (day: string) => new Date(`${day}T03:00:00Z`); // KST 정오

describe("hasConsecutiveWorkoutDays — 오늘 포함 최근 N일 모두 운동", () => {
  it("5일 연속이면 true, 하루라도 빠지면 false", () => {
    const keys = [
      "2026-07-20",
      "2026-07-21",
      "2026-07-22",
      "2026-07-23",
      "2026-07-24",
    ];
    expect(hasConsecutiveWorkoutDays(keys, "2026-07-24", 5)).toBe(true);
    const gap = ["2026-07-20", "2026-07-22", "2026-07-23", "2026-07-24"]; // 21 빠짐
    expect(hasConsecutiveWorkoutDays(gap, "2026-07-24", 5)).toBe(false);
  });
  it("오늘 미운동이면 false (연속의 끝은 오늘이어야)", () => {
    const keys = [
      "2026-07-19",
      "2026-07-20",
      "2026-07-21",
      "2026-07-22",
      "2026-07-23",
    ];
    expect(hasConsecutiveWorkoutDays(keys, "2026-07-24", 5)).toBe(false);
  });
  it("월 경계를 넘어도 정확히 이어짐", () => {
    const keys = [
      "2026-06-28",
      "2026-06-29",
      "2026-06-30",
      "2026-07-01",
      "2026-07-02",
    ];
    expect(hasConsecutiveWorkoutDays(keys, "2026-07-02", 5)).toBe(true);
  });
});

describe("challengePassStatus — 연속 5일 만든 시각부터 2시간 공개", () => {
  it("CHALLENGE_PASS_HOURS는 2", () => {
    expect(CHALLENGE_PASS_HOURS).toBe(2);
  });
  it("5일 연속 직후는 unlocked, 2시간 지나면 locked_expired", () => {
    const days = [
      at("2026-07-20"),
      at("2026-07-21"),
      at("2026-07-22"),
      at("2026-07-23"),
      at("2026-07-24"),
    ];
    const justNow = new Date(at("2026-07-24").getTime() + 30 * 60_000); // 30분 후
    const later = new Date(at("2026-07-24").getTime() + 3 * 3600_000); // 3시간 후
    expect(challengePassStatus(days, justNow, TZ).state).toBe("unlocked");
    expect(challengePassStatus(days, later, TZ).state).toBe("locked_expired");
  });
  it("연속 5일 미달이면 locked_progress + consecutiveDays", () => {
    const days = [at("2026-07-22"), at("2026-07-23"), at("2026-07-24")];
    const s = challengePassStatus(days, at("2026-07-24"), TZ);
    expect(s.state).toBe("locked_progress");
    expect(s.consecutiveDays).toBe(3);
  });
  it("unlocked면 expiresAt = 5일째 첫 완료 시각 + 2h", () => {
    const days = [
      at("2026-07-20"),
      at("2026-07-21"),
      at("2026-07-22"),
      at("2026-07-23"),
      at("2026-07-24"),
    ];
    const s = challengePassStatus(days, at("2026-07-24"), TZ);
    expect(s.state).toBe("unlocked");
    expect(s.fifthAt?.getTime()).toBe(at("2026-07-24").getTime());
    expect(s.expiresAt?.getTime()).toBe(
      at("2026-07-24").getTime() + 2 * 3600_000,
    );
  });
});
