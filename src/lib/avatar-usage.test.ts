import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * **화면은 `avatar_url`을 직접 그리지 않는다 — `<Avatar>`만 쓴다** (2026-08-19).
 *
 * 2026-08-19 이전에는 14곳이 전부 `{x.avatar_url ?? "👤"}` 꼴이었다. 그때는
 * 그 칸에 이모지 한 글자만 들어왔으니 맞는 코드였다. 프로필 사진이 붙으면서
 * 같은 칸에 `https://…`가 들어오는데, 그 자리들은 **주소를 글자로 그린다.**
 *
 * ⚠️⚠️ 이 고장은 **사진을 올린 사람의 화면에서만** 보인다. 아무도 안 올린 채로
 * 개발 서버를 열면 옛 코드도 멀쩡해 보이고, 단위 테스트도 전부 초록이다.
 * `local-id-usage.test.ts`가 막는 것과 **같은 종류**다 — 특정 상태에서만
 * 재현되는 화면 고장. 그래서 소스를 훑어 규칙 자체를 고정한다.
 *
 * 새 화면을 만들 때 이 테스트가 실패하면, 그 자리를 `<Avatar>`로 바꾼다:
 *   <Avatar src={x.avatarUrl} className="(원래 span에 있던 클래스)" />
 */
const ROOTS = ["src/components", "src/app"];

/** 정의처 본인은 예외 — 판정과 렌더가 여기 산다 */
const ALLOWED = new Set([path.normalize("src/components/avatar.tsx")]);

/** `avatar_url ?? "..."` · `avatarUrl ?? "..."` — 기본 이모지를 화면에서 고르는 꼴 */
const RENDER_PATTERN = /avatar_?[Uu]rl\s*\?\?\s*["'`]/;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(full));
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

describe("아바타 렌더 규칙 (2026-08-19)", () => {
  it("화면 코드에 `avatar_url ?? \"이모지\"`가 남아 있지 않다", () => {
    const offenders: string[] = [];
    for (const root of ROOTS) {
      const abs = path.join(process.cwd(), root);
      for (const file of walk(abs)) {
        const rel = path.relative(process.cwd(), file);
        if (ALLOWED.has(path.normalize(rel))) continue;
        if (RENDER_PATTERN.test(readFileSync(file, "utf8"))) {
          offenders.push(rel.split(path.sep).join("/"));
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
