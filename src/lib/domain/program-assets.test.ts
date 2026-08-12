import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const FILES = ["shoulder", "chest", "arms", "lower", "lean"] as const;

describe("공식 프로그램 대표 이미지", () => {
  for (const name of FILES) {
    it(`${name}.webp는 유효한 WebP이고 180KB 이하다`, () => {
      const path = join(
        process.cwd(),
        `public/program-assets/${name}.webp`,
      );
      const bytes = readFileSync(path);

      expect(bytes.subarray(0, 4).toString("ascii")).toBe("RIFF");
      expect(bytes.subarray(8, 12).toString("ascii")).toBe("WEBP");
      expect(statSync(path).size).toBeLessThanOrEqual(180_000);
    });
  }
});
