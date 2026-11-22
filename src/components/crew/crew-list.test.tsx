import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CrewList } from "./crew-list";
import type { CrewMember, CrewRequest } from "@/lib/domain/crew-link";

const member: CrewMember = {
  id: "u1",
  nickname: "낭만송곳니",
  avatarUrl: "🐺",
  totalXp: 640,
  currentLevel: 3,
  currentStage: 1,
};

const request: CrewRequest = {
  requestId: "r1",
  requesterId: "u2",
  nickname: "오뎅끼데스까",
  avatarUrl: "🍢",
  createdAt: new Date("2026-07-28T09:00:00Z"),
};

const noop = () => {};

function render(members: CrewMember[], requests: CrewRequest[]) {
  return renderToStaticMarkup(
    <CrewList
      members={members}
      requests={requests}
      pendingIds={new Set()}
      onAccept={noop}
      onReject={noop}
      onRemove={noop}
      onSelect={noop}
    />,
  );
}

describe("CrewList 레벨 표기", () => {
  /**
   * 2026-11-22: **서버가 정한 레벨(`currentLevel`)을 쓴다.** 단계별 경험치 방식에서는 진화 전까지 레벨이
   * 단계 마지막 레벨에서 멈추므로, 누적 경험치(`total_xp`)로 다시 계산하면 같은 사람이 화면마다 다른
   * 레벨로 보인다. 홈 친구 목록(`friend-board`)도 같은 값을 쓴다. (2026-08-07의 "total_xp로 다시 계산"은
   * 서버 캐시가 믿을 수 없던 때의 규칙이라 뒤집었다.)
   */
  it("누적 경험치가 아니라 서버가 정한 레벨을 보여준다 — 진화 전 레벨이 멈춘 사람", () => {
    const html = render(
      // 누적 경험치로는 Lv.17(옛 방식)인데 서버는 3단계 마지막 레벨 15에서 멈춰 있다
      [{ ...member, totalXp: 6900, currentLevel: 15 }],
      [],
    );
    expect(html).toContain("Lv.15");
    expect(html).not.toContain("Lv.17");
  });
});

describe("CrewList", () => {
  it("크루가 없고 요청도 없으면 빈 상태 안내를 낸다", () => {
    expect(render([], [])).toContain("아직 크루가 없어요");
  });

  it("받은 요청이 있으면 수락·거절이 보인다", () => {
    const html = render([], [request]);
    expect(html).toContain("오뎅끼데스까");
    expect(html).toContain("수락");
    expect(html).toContain("거절");
  });

  it("크루원은 닉네임과 레벨을 보여준다", () => {
    const html = render([member], []);
    expect(html).toContain("낭만송곳니");
    // 이 픽스처는 640 XP(옛 누적 방식으로는 Lv.4)에 서버 레벨 3이다. 화면은 서버 값을 따른다(2026-11-22).
    expect(html).toContain("Lv.3");
  });

  it("크루가 있으면 빈 상태 문구는 사라진다", () => {
    expect(render([member], [])).not.toContain("아직 크루가 없어요");
  });

  it("크루 수를 제목에 낸다", () => {
    expect(render([member], [])).toContain("내 크루 1명");
  });
});
