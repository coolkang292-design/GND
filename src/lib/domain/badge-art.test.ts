import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { badgeImageSrc } from "./badge-art";

/**
 * 배지 새 그림(Performance Social catalog)이 **옛 배지 키 30개 전부**에 있는가 (2026-10-05).
 *
 * ⚠️ 렌더 테스트로는 못 잡는다 — jsdom에서 없는 이미지는 오류 없이 통과한다.
 *    키 하나라도 빠지면 그 배지만 깨진 그림으로 뜨므로 파일 존재를 직접 본다.
 */
const PUBLIC = join(process.cwd(), "public");
const OLD_KEYS = readdirSync(join(PUBLIC, "badges"))
  .filter((f) => f.endsWith(".png"))
  .map((f) => f.replace(/\.png$/, ""));

describe("badgeImageSrc", () => {
  it("옛 배지 키 30개를 센다 — 비면 아무것도 검사하지 않고 통과한다", () => {
    expect(OLD_KEYS).toHaveLength(30);
  });

  it("모든 키에 새 그림 파일이 있다", () => {
    const missing = OLD_KEYS.filter((k) => !existsSync(join(PUBLIC, badgeImageSrc(k))));
    expect(missing).toEqual([]);
  });

  it("한 장이 20KB를 넘지 않는다 — 배지 시트는 30장을 한 번에 그린다", () => {
    const heavy = OLD_KEYS.filter((k) => statSync(join(PUBLIC, badgeImageSrc(k))).size > 20 * 1024);
    expect(heavy).toEqual([]);
  });
});
