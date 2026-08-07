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
   * ⚠️ 홈 친구 목록·프로필 시트가 `total_xp`로 레벨을 다시 계산한다
   * (`progression.ts:157`). 여기만 DB 캐시값 `currentLevel`을 쓰면 같은 사람이
   * 화면마다 다른 레벨로 보인다.
   */
  it("DB 캐시값이 아니라 total_xp로 계산한다", () => {
    const html = render(
      [{ ...member, totalXp: 0, currentLevel: 9 }],
      [],
    );
    expect(html).toContain("Lv.1");
    expect(html).not.toContain("Lv.9");
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
    // 640 XP는 level_definitions 기준 Lv.4다. 이 픽스처의 currentLevel(3)은
    // 그와 어긋나 있는데, **두 원천이 갈릴 수 있다는 게 바로 이 픽스처가
    // 보여주는 것**이다. 화면은 total_xp 쪽을 따른다(2026-08-07).
    expect(html).toContain("Lv.4");
  });

  it("크루가 있으면 빈 상태 문구는 사라진다", () => {
    expect(render([member], [])).not.toContain("아직 크루가 없어요");
  });

  it("크루 수를 제목에 낸다", () => {
    expect(render([member], [])).toContain("내 크루 1명");
  });
});
