import { describe, expect, it } from "vitest";
import { buildCreatorDemo, DEMO_CHALLENGE_ID } from "./creator-demo";
import { buildCreatorMemberDetail } from "./creator-member-detail";
import { buildDailyProofRates } from "./creator-report";
import { buildCreatorSnapshot } from "./creator-studio";

const today = "2026-10-25";
// 14:00 KST — 오늘 운동 시각이 지금보다 앞서는지 확인한다
const now = Date.parse("2026-10-25T05:00:00Z");

function snapshotOf(demo: ReturnType<typeof buildCreatorDemo>) {
  return buildCreatorSnapshot({
    participants: demo.participants,
    profiles: demo.profiles,
    goals: demo.goals,
    sessions: demo.sessions,
    startDate: demo.challenge.start_date,
    endDate: demo.challenge.end_date,
    todayKey: today,
    status: "active",
  });
}

describe("Creator Studio preview data (dev only)", () => {
  it("is deterministic for the same day", () => {
    expect(buildCreatorDemo(today, now)).toEqual(buildCreatorDemo(today, now));
  });

  it("is a 4-week challenge in its third week, 20 members plus the host", () => {
    const demo = buildCreatorDemo(today, now);
    expect(demo.challenge).toMatchObject({ id: DEMO_CHALLENGE_ID, status: "active", start_date: "2026-10-05", end_date: "2026-11-01" });
    expect(demo.participants.filter((p) => p.role !== "host")).toHaveLength(20);
    expect(demo.sessions.every((s) => Date.parse(s.completedAt) <= now)).toBe(true); // 미래 시각 없음
    // 오늘 운동은 KST 오늘 날짜에 남는다(자정 이전으로 밀리지 않는다)
    const kstMidnight = Date.parse("2026-10-24T15:00:00Z");
    const todays = demo.sessions.filter((s) => Date.parse(s.completedAt) >= kstMidnight);
    expect(todays.length).toBeGreaterThanOrEqual(5);
  });

  // 미리보기의 존재 이유 — 화면이 보여 줘야 할 상태가 전부 나와야 한다.
  it("covers every member state the screens can show", () => {
    const demo = buildCreatorDemo(today, now);
    const snap = snapshotOf(demo);
    const badges = new Set(snap.members.map((m) => m.badge));
    for (const b of ["done-today", "attention", "needs-goal", "new", "active"]) expect(badges).toContain(b);
    expect(snap.attentionCount).toBeGreaterThanOrEqual(2);
    expect(snap.todayProofCount).toBeGreaterThanOrEqual(5);
    expect(snap.yesterdayProofCount).not.toBe(snap.todayProofCount); // ▲/▼가 보인다

    const live = demo.activity.find((a) => a.status === "active");
    expect(live).toBeTruthy();
    const detail = buildCreatorMemberDetail({
      userId: live!.user_id, ...demo, startDate: demo.challenge.start_date,
      endDate: demo.challenge.end_date, todayKey: today, status: "active",
    });
    expect(detail?.liveSessionId).toBe(live!.session_id);
    expect(detail?.goals.length).toBeGreaterThanOrEqual(1);
  });

  it("produces a daily rate line that actually moves", () => {
    const demo = buildCreatorDemo(today, now);
    const rates = buildDailyProofRates({
      participants: demo.participants, sessions: demo.sessions,
      startDate: demo.challenge.start_date, endDate: demo.challenge.end_date, todayKey: today, status: "active",
    }).map((d) => d.rate ?? 0);
    expect(rates).toHaveLength(21);
    expect(Math.max(...rates) - Math.min(...rates)).toBeGreaterThan(0.25);
  });
});
