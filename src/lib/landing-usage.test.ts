import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AFTER_WORKOUT_PATH, APP_LANDING_PATH } from "./domain/landing";

/**
 * **앱을 켰을 때 떨어지는 자리를 여섯 파일에 흩뿌리지 않는다** (2026-08-19).
 *
 * ⚠️⚠️ 이 규칙이 없으면 반드시 하나가 빠진다. 특히 위험한 건 `manifest.ts`의
 * `start_url`이다 — 폰 홈화면에 **설치한 사람은 그 값으로만** 들어오고
 * `app/page.tsx`의 리다이렉트를 아예 안 탄다. 나머지 다섯을 다 고쳐도
 * **설치해서 쓰는 사람만 옛 화면을 본다.** 브라우저로 확인하면 멀쩡해 보인다.
 *
 * 실제로 이 작업에서 `auth/callback`이 `exitHref === "/home"`으로 문구를 고르고
 * 있었다. 랜딩을 옮기자 그 비교가 어긋나 나가는 문이 **"계정 화면으로 돌아가기"**
 * 라고 거짓말을 했다. lint도 typecheck도 못 잡는다.
 */
const ENTRY_FILES = [
  "src/app/manifest.ts", // ⚠️ 설치한 사람의 유일한 입구
  "src/app/page.tsx",
  "src/app/login/page.tsx",
  "src/app/auth/callback/page.tsx",
  "src/app/onboarding/page.tsx",
  "src/app/whats-new/page.tsx",
];

/**
 * 여기는 **일부러** 주소를 적는다 — 랜딩이 아니다.
 *   · `tab-bar.tsx` 홈 탭 자체
 *   · `domain/push.ts` 알림 유형별 목적지 (의도를 갖고 온 사람)
 *   · `invite/[code]` 친구를 맺은 **뒤** 결과를 보여주는 자리 · 오류 탈출구
 *   · `domain/landing.ts` 정의처
 */
function read(rel: string): string {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

describe("랜딩 주소 단일 원천 (2026-08-19)", () => {
  it.each(ENTRY_FILES)("%s 는 주소를 손으로 적지 않는다", (rel) => {
    const src = read(rel);
    // 실패하면 `APP_LANDING_PATH`(@/lib/domain/landing)로 바꾼다
    expect(src).not.toContain('"/home"');
    expect(src).toContain("APP_LANDING_PATH");
  });

  it("랜딩은 기록 화면, 운동 뒤에는 홈 — 둘은 서로 다르다", () => {
    expect(APP_LANDING_PATH).toBe("/record");
    expect(AFTER_WORKOUT_PATH).toBe("/home");
    expect(APP_LANDING_PATH).not.toBe(AFTER_WORKOUT_PATH);
  });

  /**
   * ⚠️ 푸시 알림은 **예외다.** 찌르기 알림을 눌렀는데 기록 화면이 나오면
   * 알림이 망가진다 — 의도를 갖고 온 사람은 그 의도로 보낸다.
   */
  it("푸시 알림 목적지는 랜딩에 끌려가지 않는다", () => {
    const push = read("src/lib/domain/push.ts");
    expect(push).not.toContain("APP_LANDING_PATH");
  });

  /** 운동 완료 「확인」이 홈으로 보낸다 — 찌르기가 열리는 유일한 순간이다 */
  it("기록 화면은 운동을 마치면 홈으로 보낸다", () => {
    const record = read("src/app/(tabs)/record/page.tsx");
    expect(record).toContain("AFTER_WORKOUT_PATH");
    expect(record).toContain("router.push(AFTER_WORKOUT_PATH)");
  });
});
