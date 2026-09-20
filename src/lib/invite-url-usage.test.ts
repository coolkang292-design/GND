import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { challengeInviteUrl, challengeJoinPath } from "./domain/challenge-invite";

/**
 * **밖으로 내보내는 초대 주소를 손으로 조립하지 않는다** (2026-09-20).
 *
 * ⚠️⚠️ 이 규칙이 없으면 반드시 하나가 빠진다. 실제로 이 작업에서 빠졌다:
 *    `challengeInviteUrl`을 `/c/[code]`로 바꿔 놓고 배포 직전에야
 *    `invite-sheet.tsx`가 **주소를 따로 조립하고 있는 것**을 찾았다. 그대로
 *    나갔으면 "초대 링크 복사하기" 버튼으로 만든 링크만 카카오톡 미리보기가
 *    없었을 것이다 — 그리고 그건 **참가자가 쓰는 유일한 초대 경로**다.
 *
 * ⚠️ lint도 typecheck도 테스트도 이걸 못 잡았다. 옛 주소가 여전히 **동작하기**
 *    때문이다(참가는 된다). 깨지는 것은 미리보기뿐이라 화면으로도 안 보인다.
 *    그래서 소스를 훑는다 — `landing-usage.test.ts`와 같은 이유다.
 */

const SRC = path.join(process.cwd(), "src");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

/**
 * 조립이 **허용된** 곳.
 *   · `domain/challenge-invite.ts` 정의처 (여기가 단일 원천이다)
 *   · `lib/challenge.ts` 보관한 초대를 이어가는 주소 — `challengeJoinPath`에 위임한다
 */
const DEFINITION = path.join(SRC, "lib", "domain", "challenge-invite.ts");

/**
 * 주소를 **템플릿 문자열로 조립하는** 모양만 잡는다. 주석에 적힌
 * `/challenge?join=`이나 `/c/[code]`는 설명이라 걸리면 안 된다.
 */
const HAND_BUILT = [
  // `${...}/challenge?join=` 또는 `"/challenge?join=" + code`
  /\/challenge\?join=\$\{/,
  /["'`]\/challenge\?join=["'`]\s*\+/,
  // `${window.location.origin}/c/${code}`
  /origin\}\/c\//,
];

describe("초대 주소 단일 원천 (2026-09-20)", () => {
  it("정의처 말고는 아무도 초대 주소를 손으로 조립하지 않는다", () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      if (file === DEFINITION) continue;
      const src = readFileSync(file, "utf8");
      for (const re of HAND_BUILT) {
        if (re.test(src)) {
          offenders.push(`${path.relative(process.cwd(), file)}  (${re})`);
        }
      }
    }
    // 실패하면 `challengeInviteUrl`(공유용) 또는 `challengeJoinPath`(참가용)를 쓴다
    expect(offenders).toEqual([]);
  });

  /**
   * ⚠️ 둘은 **서로 다른 주소다.** 공유하는 것은 카드가 붙는 `/c/[code]`,
   *    참가시키는 것은 챌린지 탭이 읽는 `/challenge?join=`이다. 같아지면
   *    카카오톡 미리보기가 통째로 사라지거나(참가 경로를 공유), 링크를 눌러도
   *    참가가 안 된다(공유 경로로 참가 시도).
   */
  it("공유 주소와 참가 주소는 다르다", () => {
    const shared = challengeInviteUrl("https://x.app", "GND-ABCDE", "u1");
    const join = challengeJoinPath("GND-ABCDE", "u1");

    expect(shared).toContain("/c/GND-ABCDE");
    expect(shared).not.toContain("/challenge?join=");

    expect(join).toContain("/challenge?join=GND-ABCDE");
    expect(join).not.toContain("/c/");
  });

  /**
   * 카카오톡에 **이미 뿌려진** 링크가 `/challenge?join=` 모양이다. 참가 경로를
   * 옮기면 그 링크가 전부 죽는다 — 미리보기가 없을 뿐 동작은 해야 한다.
   */
  it("옛 링크가 쓰던 참가 경로를 바꾸지 않았다", () => {
    expect(challengeJoinPath("GND-ABCDE")).toBe("/challenge?join=GND-ABCDE");
  });
});
