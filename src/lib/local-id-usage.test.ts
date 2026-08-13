import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * `crypto.randomUUID`는 **보안 컨텍스트 전용**이다 (https 또는 localhost).
 *
 * 폰으로 개발 서버를 볼 때는 `http://<LAN IP>:3000`으로 들어간다 — 거기서는
 * `crypto.randomUUID`가 없다. 그 자리에서만 저장이 터지고, 프로덕션(https)과
 * 단위 테스트(jsdom)는 멀쩡해서 **아무도 못 잡는다**.
 *
 * 그래서 `src/lib/workout.ts`의 `localId()`가 없는 환경용 대체 경로를 들고
 * 있다. 화면 코드는 그 함수만 쓴다.
 *
 * 2026-08-13에 `calendar-view.tsx`가 이 규칙을 깨고 직접 불렀다. 개발 서버를
 * 폰으로 열었을 때만 재현되는 종류라 배포 전 검사 전부가 초록이었다.
 * 이 테스트가 그 재발을 막는다.
 */
const ROOTS = ["src/components", "src/app"];

/** 정의처 본인은 예외 — 대체 경로가 여기 있다 */
const ALLOWED = new Set([path.normalize("src/lib/workout.ts")]);

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

describe("localId 규칙 (2026-08-13)", () => {
  it("화면 코드는 crypto.randomUUID를 직접 부르지 않는다", () => {
    const offenders: string[] = [];
    for (const root of ROOTS) {
      const abs = path.join(process.cwd(), root);
      for (const file of walk(abs)) {
        const rel = path.relative(process.cwd(), file);
        if (ALLOWED.has(path.normalize(rel))) continue;
        if (readFileSync(file, "utf8").includes("crypto.randomUUID")) {
          offenders.push(rel.split(path.sep).join("/"));
        }
      }
    }

    // 실패하면 그 파일에서 `localId()`(@/lib/workout)로 바꾼다.
    expect(offenders).toEqual([]);
  });

  it("localId는 crypto.randomUUID가 없어도 값을 준다", async () => {
    const { localId } = await import("./workout");
    const original = Object.getOwnPropertyDescriptor(globalThis, "crypto");
    // LAN IP 개발 서버와 같은 상태 — 보안 컨텍스트가 아니면 이 API가 없다
    Object.defineProperty(globalThis, "crypto", {
      value: {},
      configurable: true,
    });
    try {
      const id = localId();
      expect(typeof id).toBe("string");
      expect(id.length).toBeGreaterThan(0);
      expect(id).not.toBe(localId());
    } finally {
      if (original) Object.defineProperty(globalThis, "crypto", original);
    }
  });
});
