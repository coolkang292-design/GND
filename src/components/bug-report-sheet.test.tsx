import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BugReportSheet } from "./bug-report-sheet";

// 이 앱의 컴포넌트 테스트는 SSR 마크업을 본다(vitest environment: node).
// 상호작용은 여기서 못 본다 — 그건 `pnpm dev`에서 눈으로 확인한다(CLAUDE.md).
const render = (ui: React.ReactElement) => renderToStaticMarkup(ui);

describe("신고 시트 — 사람은 한 줄만 쓴다", () => {
  it("입력칸이 하나뿐이고 카테고리 고르기가 없다", () => {
    // 비개발자가 분류를 고르면 틀린다. 자유 한 줄 + 자동 맥락이 낫다는 것이
    // 설계 결정이라, 선택지가 늘어나면 이 단언이 깨진다.
    const html = render(<BugReportSheet route="/challenge" />);
    expect(html.match(/<textarea/g) ?? []).toHaveLength(1);
    expect(html).not.toContain("<select");
    expect(html).toContain("어떤 게 이상했나요");
  });

  it("경로를 자동으로 보여준다 — 사람에게 묻지 않는다", () => {
    const html = render(<BugReportSheet route="/challenge" />);
    expect(html).toContain("/challenge");
    expect(html).toContain("자동으로 함께 보내요");
  });

  it("무엇이 함께 전송되는지 밝힌다", () => {
    // 몰래 보내지 않는다. 이 문구가 사라지면 사용자는 기기 정보가 가는 걸 모른다.
    const html = render(<BugReportSheet route="/home" />);
    expect(html).toContain("기기 정보");
    expect(html).toContain("최근 동작");
  });

  it("운동 기록·사진은 안 보낸다고 명시한다", () => {
    const html = render(<BugReportSheet route="/home" />);
    expect(html).toContain("운동 기록이나 사진은 보내지");
  });

  it("빈 입력에서는 보내기 버튼이 잠겨 있다", () => {
    const html = render(<BugReportSheet route="/home" />);
    expect(html).toContain("disabled");
  });

  it("경로를 모를 때도 렌더된다 — global-error는 경로를 못 읽을 수 있다", () => {
    // 루트 레이아웃까지 죽은 자리에서 이 컴포넌트가 못 뜨면 신고 수단이 0이 된다.
    const html = render(<BugReportSheet route={null} />);
    expect(html).toContain("어떤 게 이상했나요");
    expect(html).not.toContain("지금 화면:");
  });
});
