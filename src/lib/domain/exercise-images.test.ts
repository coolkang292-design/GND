import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import manifest from "../../../data/exercise-image-manifest.json";
import type { BodyPart } from "@/lib/types";
import {
  EXERCISE_IMAGES,
  exerciseImageSrc,
  imageIdForAddedExercise,
  imagesFirst,
  partIconSrc,
  seedExerciseIdByName,
} from "./exercise-images";

const ROOT = join(__dirname, "..", "..", "..");
const publicPath = (src: string) => join(ROOT, "public", src);

/**
 * 시드 카탈로그 (운동 ID → 이름). Codex 매니페스트의 시드 335개는 2026-10-05
 * 운영 DB와 (ID, 이름) 쌍 해시까지 같음을 확인했다 — DB에 붙지 않고 대조한다.
 */
const SEED_NAME_BY_ID = new Map(
  (manifest.exercises as { exercise_id: string; name: string; scope: string }[])
    .filter((e) => e.scope === "seed")
    .map((e) => [e.exercise_id, e.name]),
);
const PARTS: BodyPart[] = ["가슴", "등", "하체", "어깨", "팔", "코어", "유산소"];

describe("exercise-images", () => {
  it("매니페스트가 비어 있지 않다 (아래 대조 단언이 공회전하지 않게)", () => {
    expect(SEED_NAME_BY_ID.size).toBe(335);
    expect(Object.keys(EXERCISE_IMAGES).length).toBeGreaterThanOrEqual(50);
  });

  it("기본 운동 키는 시드 ID이고 이름이 같다 · 직접 만든 운동 키는 시드가 아니고 이름이 비어 있다", () => {
    for (const [id, entry] of Object.entries(EXERCISE_IMAGES)) {
      if (entry.custom) {
        // 남의 직접 운동 이름을 앱에 싣지 않는다 (2026-10-05 기록누락 묶음)
        expect(SEED_NAME_BY_ID.has(id), id).toBe(false);
        expect(entry.name, id).toBe("");
      } else {
        expect(SEED_NAME_BY_ID.get(id), `${id} ${entry.name}`).toBe(entry.name);
      }
    }
  });

  it("연결표의 모든 그림 파일이 public/에 있고, public/에 연결 안 된 파일이 없다", () => {
    const files = new Set(Object.values(EXERCISE_IMAGES).map((e) => `${e.file}.webp`));
    for (const f of files) expect(existsSync(publicPath(`exercise-images/${f}`)), f).toBe(true);
    const onDisk = readdirSync(publicPath("exercise-images"));
    expect(onDisk.filter((f) => !files.has(f))).toEqual([]);
  });

  it("그림이 있는 운동은 ID로 그 그림을 주고, 같은 운동의 다른 이름은 같은 그림이다", () => {
    const idOf = (name: string) =>
      [...SEED_NAME_BY_ID].find(([, n]) => n === name)![0];
    expect(exerciseImageSrc(idOf("벤치프레스"))).toMatch(/^\/exercise-images\/.+\.webp$/);
    expect(exerciseImageSrc(idOf("스쿼트"))).toBe(exerciseImageSrc(idOf("바벨 백스쿼트")));
    expect(exerciseImageSrc(idOf("데드리프트"))).toBe(exerciseImageSrc(idOf("컨벤셔널 데드리프트")));
  });

  it("그림이 없는 운동·모르는 ID는 undefined다 (부위 아이콘으로 떨어지지 않는다)", () => {
    expect(exerciseImageSrc("00000000-0000-0000-0000-000000000000")).toBeUndefined();
    expect(exerciseImageSrc("맨몸 스쿼트")).toBeUndefined(); // 이름으로는 안 잡힌다
  });

  it("로딩 실패용 부위 아이콘 파일이 부위마다 있다", () => {
    for (const part of PARTS) expect(existsSync(publicPath(partIconSrc(part))), part).toBe(true);
  });
});

describe("imagesFirst — 그림 있는 운동을 위로 (사용자 지시 2026-10-05)", () => {
  const withImg = Object.keys(EXERCISE_IMAGES);
  const items = [
    { id: "no-1", n: 5 },
    { id: withImg[0], n: 4 },
    { id: "no-2", n: 3 },
    { id: withImg[1], n: 2 },
  ];

  it("그림 있는 것이 먼저, 각 무리 안에서는 들어온 순서를 그대로 둔다(안정)", () => {
    expect(imagesFirst(items, (i) => i.id).map((i) => i.id)).toEqual([
      withImg[0],
      withImg[1],
      "no-1",
      "no-2",
    ]);
  });

  it("빠지거나 늘어나는 항목이 없다", () => {
    expect(imagesFirst(items, (i) => i.id)).toHaveLength(items.length);
  });
});

describe("imageIdForAddedExercise — 담은 운동의 그림 ID", () => {
  const customId = Object.entries(EXERCISE_IMAGES).find(([, e]) => e.custom)?.[0];

  it("전제 — 직접 만든 운동 그림이 연결표에 하나 이상 있다", () => {
    expect(customId).toBeTruthy();
  });

  it("기본 운동은 이름으로 찾는다", () => {
    expect(imageIdForAddedExercise({ name: "벤치프레스", isCustom: false })).toBe(
      seedExerciseIdByName("벤치프레스"),
    );
  });

  it("직접 만든 운동은 본인 카탈로그의 같은 이름 직접 운동 ID로 찾는다", () => {
    const own = [{ id: customId!, name: "내 운동", is_custom: true }];
    expect(imageIdForAddedExercise({ name: "내 운동", isCustom: true }, own)).toBe(customId);
  });

  it("직접 만든 운동은 기본 운동과 이름이 같아도 기본 운동 그림을 쓰지 않는다", () => {
    const own = [{ id: "someone-custom", name: "벤치프레스", is_custom: true }];
    expect(imageIdForAddedExercise({ name: "벤치프레스", isCustom: true }, own)).toBeUndefined();
    expect(imageIdForAddedExercise({ name: "벤치프레스", isCustom: true })).toBeUndefined();
  });

  it("본인 카탈로그의 기본 운동 행으로는 직접 운동을 찾지 않는다", () => {
    const seedId = seedExerciseIdByName("벤치프레스")!;
    const own = [{ id: seedId, name: "벤치프레스", is_custom: false }];
    expect(imageIdForAddedExercise({ name: "벤치프레스", isCustom: true }, own)).toBeUndefined();
  });

  it("직접 운동 이름은 기본 운동 이름표에 섞이지 않는다", () => {
    expect(seedExerciseIdByName("")).toBeUndefined();
  });
});
