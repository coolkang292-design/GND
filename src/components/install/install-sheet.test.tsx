import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { InstallSheet, type SheetVariant } from "./install-sheet";

// 이 앱의 컴포넌트 테스트는 SSR 마크업을 본다(vitest environment: node).
// 상호작용은 여기서 못 본다 — 그건 `pnpm dev`에서 눈으로 확인한다(CLAUDE.md).
function html(variant: SheetVariant): string {
  return renderToStaticMarkup(
    <InstallSheet
      variant={variant}
      onClose={() => {}}
      onPrimary={() => {}}
      onSecondary={() => {}}
    />,
  );
}

/** 단계 카드 개수 — 이 화면의 핵심 수치다 */
function steps(markup: string): number {
  return (markup.match(/<li\b/g) ?? []).length;
}

function shots(markup: string): string[] {
  return [...markup.matchAll(/<img[^>]*src="([^"]+)"/g)].map((m) => m[1]);
}

describe("InstallSheet — 단계 개수", () => {
  it("⚠️ 아이폰 설치 안내는 정확히 4단계다 — ··· → 공유 → 홈 화면에 추가 → 추가", () => {
    // 2026-08-21 사장님 실물 확인으로 3단계에서 정정했다. 카톡에서 넘어온
    // 사파리는 하단바에 **공유 버튼이 없다** — `···` 안에 들어 있다.
    const m = html("install-ios");
    expect(steps(m)).toBe(4);
    expect(m).toContain("점 3개");
    // ⚠️ 옛 첫 단계가 되살아나면 첫 걸음부터 틀린 안내가 된다
    expect(m).not.toContain("맨 아래 공유 버튼");
  });

  it("⚠️ 안드로이드에 설치 버튼이 있으면 단계 안내는 0개다 — 3단계는 틀린 안내다", () => {
    const m = html("install-android-prompt");
    expect(steps(m)).toBe(0);
    expect(m).toContain("앱 설치하기");
  });

  it("안드로이드 수동 안내는 2단계", () => {
    expect(steps(html("install-android-manual"))).toBe(2);
  });

  it("카톡 탈출 안내는 2단계", () => {
    expect(steps(html("escape-ios"))).toBe(2);
  });
});

describe("InstallSheet — 안전 문구", () => {
  it("⚠️⚠️ 아이폰 설치 안내에는 '다시 로그인' 안내가 반드시 있다", () => {
    // 이 줄이 없으면 설치본의 로그인 화면을 보고 **다시 가입**한다 = 계정 분리
    expect(html("install-ios")).toContain("다시 로그인하면 끝이에요");
  });

  it("⚠️ 안드로이드에는 '다시 로그인' 안내가 없다 — 로그인이 유지된다", () => {
    expect(html("install-android-prompt")).not.toContain("다시 로그인");
    expect(html("install-android-manual")).not.toContain("다시 로그인");
  });

  it("⚠️ 카톡 안내는 '로그인 뒤' 말투 하나뿐이다 — 로그인 전에는 안 뜬다", () => {
    // 2026-08-21 결정: 앱을 아직 못 본 사람에게 브라우저를 옮기라고 하면 나간다.
    // 안내는 로그인/가입에 성공한 뒤에만 뜨므로 "처음 온 사람" 말투가 필요 없다.
    const m = html("escape-ios");
    expect(m).toContain("이제 홈 화면에 놓을 차례예요");
    expect(m).not.toContain("여기선 앱을 못 깔아요");
    // 사파리에서 또 로그인해야 한다는 걸 미리 말해야 되돌아오지 않는다
    expect(m).toContain("한 번만 더 누르면 끝이에요");
  });

  it("공유 버튼을 가리키는 화살표는 카톡·사파리 안내에만 있다", () => {
    expect(html("escape-ios")).toContain("바로 아래 이 버튼!");
    expect(html("install-ios")).toContain("바로 아래 이 버튼!");
    // 안드로이드는 공유 버튼을 쓰지 않는다 — 가리킬 것이 없다
    expect(html("install-android-prompt")).not.toContain("바로 아래");
    expect(html("install-android-manual")).not.toContain("바로 아래");
  });
});

describe("InstallSheet — 사진", () => {
  it("카톡 탈출 안내에는 공유 버튼과 Safari로 열기 사진이 붙는다", () => {
    expect(shots(html("escape-ios"))).toEqual([
      "/onboarding/install/step-kakao-share.webp",
      "/onboarding/install/step-open-safari.webp",
    ]);
  });

  it("⚠️ 아이폰 설치 안내의 사진은 '···'와 '홈 화면에 추가' 둘뿐이다 (§13-2)", () => {
    // 4장을 다 붙이면 시트가 길어져 마지막 단계를 아무도 못 본다.
    // ②(공유)는 메뉴 맨 위라 안 헤매고, ④(추가)는 오른쪽 위 한 곳뿐이다.
    expect(shots(html("install-ios"))).toEqual([
      "/onboarding/install/step-safari-more.webp",
      "/onboarding/install/step-add-home.webp",
    ]);
  });

  it("안드로이드 안내에는 사진이 없다", () => {
    expect(shots(html("install-android-prompt"))).toEqual([]);
    expect(shots(html("install-android-manual"))).toEqual([]);
  });
});

describe("InstallSheet — 여정 안내 (2026-08-22 사장님 지시)", () => {
  it("⚠️ 카톡 안내는 '그다음에 뭘 하는지'까지 알려준다", () => {
    // 여정이 두 화면에 걸쳐 있으면 첫 화면이 지도를 줘야 한다. 이게 없으면
    // 사파리로 옮긴 뒤 무엇을 해야 하는지 모른 채 끊긴다.
    expect(html("escape-ios")).toContain("공유 → 홈 화면에 추가");
  });

  it("⚠️ 모든 시트가 '다시 찾는 법'을 알려준다 — 되돌아올 문의 이정표", () => {
    const all = [
      "login-first",
      "escape-ios",
      "escape-android",
      "escape-ios-other",
      "install-ios",
      "install-android-prompt",
      "install-android-manual",
    ] as const;
    for (const v of all) {
      expect(html(v)).toContain("내 정보 → ⚙️ → 📲 홈 화면에 앱 설치");
    }
  });

  it("익명 사용자에게는 로그인이 먼저라고 말한다", () => {
    const m = html("login-first");
    expect(m).toContain("먼저 로그인해 주세요");
    expect(m).toContain("계정 연결하러 가기");
    // ⚠️ 여기서 바로 로그인시키면 익명 계정이 갈린다 — 계정 화면으로 보낸다
    expect(m).not.toContain("카카오로 로그인");
  });
});

describe("InstallSheet — 닫기 버튼 (2026-08-22 사장님 지적)", () => {
  /**
   * ⚠️⚠️ *"다 했어요라는 버튼이 필요가 없지 않아? 어차피 어플을 설치하면 해당
   * 알림이 안 뜨는 거잖아?"* — 맞다. 설치하면 다음 실행부터 `standalone`으로
   * 잡혀 자동으로 안 뜬다. 그 버튼이 하던 유일한 일은 "했다고 말했지만 안 한
   * 사람"을 **영구히** 막는 것이었고, 그게 사람을 가뒀다.
   */
  it("⚠️ 설치 안내에는 버튼이 ✕ 하나뿐이다 — 아무 일도 안 하는 버튼은 없앤다", () => {
    for (const v of ["install-ios", "install-android-manual"] as const) {
      const m = html(v);
      expect(m).not.toContain("다 했어요");
      expect(m).not.toContain("나중에 할게요");
      // ✕ 하나. 되살아나면 이 단언이 깨진다.
      expect((m.match(/<button/g) ?? []).length).toBe(1);
      expect(m).toContain('aria-label="닫기"');
    }
  });

  it("⚠️ 실제로 무언가를 하는 버튼만 남는다", () => {
    // 설치를 실행한다
    expect(html("install-android-prompt")).toContain("앱 설치하기");
    // 크롬을 연다 · 주소를 복사한다
    expect(html("escape-android")).toContain("크롬으로 열기");
    expect(html("escape-ios")).toContain("주소 복사하기");
    // 계정 화면으로 보낸다
    expect(html("login-first")).toContain("계정 연결하러 가기");
  });

  it("모든 시트에 닫는 방법이 보인다 — 안 보이면 갇혔다고 느낀다", () => {
    const all = [
      "login-first",
      "escape-ios",
      "escape-android",
      "escape-ios-other",
      "install-ios",
      "install-android-prompt",
      "install-android-manual",
    ] as const;
    for (const v of all) expect(html(v)).toContain('aria-label="닫기"');
  });
});
