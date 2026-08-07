import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ASSETS = [
  {
    path: "public/record-assets/exercise-picker-hero.webp",
    maxBytes: 180_000,
  },
  {
    path: "public/exercise-thumbs/chest-press-machine.webp",
    maxBytes: 70_000,
  },
  {
    path: "public/exercise-thumbs/lat-pulldown.webp",
    maxBytes: 70_000,
  },
  {
    path: "public/exercise-thumbs/leg-press.webp",
    maxBytes: 70_000,
  },
  {
    path: "public/exercise-thumbs/shoulder-press.webp",
    maxBytes: 70_000,
  },
] as const;

describe("운동 추가 이미지 자산", () => {
  for (const asset of ASSETS) {
    it(`${asset.path}는 유효한 WebP이고 용량 제한 안이다`, () => {
      const filePath = join(process.cwd(), asset.path);
      const bytes = readFileSync(filePath);

      expect(bytes.subarray(0, 4).toString("ascii")).toBe("RIFF");
      expect(bytes.subarray(8, 12).toString("ascii")).toBe("WEBP");
      expect(statSync(filePath).size).toBeLessThanOrEqual(asset.maxBytes);
    });
  }
});
