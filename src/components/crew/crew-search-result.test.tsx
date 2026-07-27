import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CrewSearchResult } from "./crew-search-result";
import type { CrewSearchResult as Result } from "@/lib/domain/crew-link";

const base: Result = {
  id: "u1",
  nickname: "스칼레또",
  avatarUrl: "🐉",
  relation: "none",
  requestId: null,
};

// 버튼 잠김은 disabled 속성으로 본다. 클래스에 disabled:bg-line 같은 Tailwind
// 변형이 들어 있어 "disabled" 문자열만 찾으면 항상 걸린다(exercise-card.test.tsx 관례).
describe("CrewSearchResult", () => {
  it("relation=none이면 요청 버튼이 눌린다", () => {
    const html = renderToStaticMarkup(
      <CrewSearchResult result={base} pending={false} onAction={() => {}} />,
    );
    expect(html).toContain("크루 요청");
    expect(html).not.toContain('disabled=""');
  });

  it("relation=crew면 버튼이 잠긴다", () => {
    const html = renderToStaticMarkup(
      <CrewSearchResult
        result={{ ...base, relation: "crew" }}
        pending={false}
        onAction={() => {}}
      />,
    );
    expect(html).toContain("이미 크루");
    expect(html).toContain('disabled=""');
  });

  it("relation=request_received면 수락 버튼이 나온다", () => {
    const html = renderToStaticMarkup(
      <CrewSearchResult
        result={{ ...base, relation: "request_received", requestId: "r1" }}
        pending={false}
        onAction={() => {}}
      />,
    );
    expect(html).toContain("수락하기");
    expect(html).not.toContain('disabled=""');
  });

  it("닉네임과 아바타를 보여준다", () => {
    const html = renderToStaticMarkup(
      <CrewSearchResult result={base} pending={false} onAction={() => {}} />,
    );
    expect(html).toContain("스칼레또");
    expect(html).toContain("🐉");
  });

  it("pending이면 눌린 상태로 잠긴다", () => {
    const html = renderToStaticMarkup(
      <CrewSearchResult result={base} pending onAction={() => {}} />,
    );
    expect(html).toContain('disabled=""');
    expect(html).toContain("처리 중");
  });
});
