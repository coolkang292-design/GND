import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildCreatorSnapshot, type CreatorParticipant } from "@/lib/domain/creator-studio";
import type { UserGoal } from "@/lib/types";
import { CreatorHome } from "./creator-home";

const participants: CreatorParticipant[] = [
  { user_id: "host", role: "host", status: "joined", joined_at: "2026-10-01T00:00:00Z" },
  { user_id: "quiet", role: "member", status: "joined", joined_at: "2026-10-02T03:00:00Z" },
  { user_id: "fresh", role: "member", status: "joined", joined_at: "2026-10-22T03:00:00Z" },
];
const base = {
  participants,
  profiles: [],
  goals: [{ user_id: "quiet" }, { user_id: "fresh" }] as UserGoal[],
  sessions: [{ userId: "quiet", completedAt: "2026-10-10T03:00:00Z", exercises: [] }],
  startDate: "2026-10-01",
  endDate: "2026-10-31",
  todayKey: "2026-10-24",
};
const challenge = {
  id: "c1", name: "4주 같이 운동하기", start_date: "2026-10-01", end_date: "2026-10-31",
  invite_code: "ABC123", recruit_image_url: null, recruit_note: null,
};

function render(status: "setup" | "active" | "ended") {
  const snapshot = buildCreatorSnapshot({ ...base, status, ...(status === "ended" ? { endDate: "2026-10-20" } : {}) });
  return renderToStaticMarkup(
    <CreatorHome challenge={{ ...challenge, status }} snapshot={snapshot} recent={[]} viewerId="host" />,
  );
}

describe("Creator Studio home (mockup 4)", () => {
  it("leads with the invite only while recruiting", () => {
    const html = render("setup");
    expect(html).toContain("초대 링크 공유");
    expect(html).not.toContain("성과 리포트 보기"); // 시작 전엔 리포트할 것이 없다
    expect(render("active")).toContain("/challenge/creator/c1/report");
    expect(html).not.toContain("3일 이상 기록 없음");
  });

  it("during the challenge, points to members and lists only non-empty to-dos", () => {
    const html = render("active");
    expect(html).not.toContain("초대 링크 공유"); // 서버가 진행 중 참가를 거부한다
    expect(html).toContain("참여자 관리");
    expect(html).toContain("3일 이상 기록 없음 1명");
    expect(html).toContain("/challenge/creator/c1/members?filter=attention");
    expect(html).toContain("이번 주 새로 합류 1명");
    expect(html).not.toContain("목표 미설정 0명"); // 0명은 할 일이 아니다
  });

  it("after the end, shows results and no to-do list", () => {
    const html = render("ended");
    expect(html).toContain("결과 보기");
    expect(html).not.toContain("오늘 할 일");
  });

  // 시안의 예시 수치는 측정하지 않는다 — 칸 자체가 없어야 한다.
  it("never renders unmeasured metrics", () => {
    for (const s of ["setup", "active", "ended"] as const) {
      const html = render(s);
      for (const fake of ["링크 클릭", "재참여", "전환율", "유입 채널"]) expect(html).not.toContain(fake);
    }
  });
});
