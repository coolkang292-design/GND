import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * **프로필 편집은 `내 정보` 화면의 맨 위다** (사용자 지시 2026-08-20 —
 * *"프로필 편집 위치가 너무 아래 있음 최상단으로 수정해줘"*).
 *
 * ⚠️ 옛 판은 `GrowthHub` **아래**에 있었다. 성장 허브는 레벨·XP·배지·포인트를
 * 전부 그려서 화면 몇 개 길이다 — 프로필 사진을 바꾸러 온 사람이 그만큼
 * 스크롤해야 했다. 2026-08-19에 사진 업로드가 붙으면서 이 자리를 찾는 일이
 * 훨씬 잦아졌고, 사장님이 폰에서 바로 지적했다.
 *
 * 렌더 **순서**는 단위 테스트로 잡기 번거롭고(컴포넌트 둘 다 무거운 조회를 한다)
 * 스냅샷은 무관한 변경에도 깨진다. 순서 한 가지만 소스에서 확인한다.
 */
describe("내 정보 화면 순서 (2026-08-20)", () => {
  it("프로필 편집이 성장 허브보다 위에 있다", () => {
    const src = readFileSync(
      path.join(process.cwd(), "src/app/(tabs)/profile/page.tsx"),
      "utf8",
    );

    const edit = src.indexOf("<ProfileEditSheet");
    const hub = src.indexOf("<GrowthHub");

    expect(edit).toBeGreaterThan(-1);
    expect(hub).toBeGreaterThan(-1);
    // 실패하면 두 줄의 자리를 되돌린 것이다. 사용자 지시를 확인하고 바꿔라.
    expect(edit).toBeLessThan(hub);
  });
});
