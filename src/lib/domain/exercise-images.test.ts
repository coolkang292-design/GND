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
    // 335 (2026-10-05) + 운영자 직접 운동 13개를 공용으로 전환 (0118, 2026-10-10)
    expect(SEED_NAME_BY_ID.size).toBe(348);
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

describe("DY row machine: planned gym exercise image", () => {
  const id = "50aa51d7-6b63-4b88-a117-76a635d447ee";

  it("maps the registered seed exercise to its dedicated WebP without a fallback", () => {
    expect(SEED_NAME_BY_ID.get(id)).toBe("DY 로우 머신");
    expect(EXERCISE_IMAGES[id]).toEqual({
      name: "DY 로우 머신",
      file: id,
      source: "gnd",
      origin: "gnd-dy-row-2026-10-09",
    });
    expect(existsSync(publicPath(`exercise-images/${id}.webp`))).toBe(true);
    expect(seedExerciseIdByName("DY 로우 머신")).toBe(id);
    expect(imageIdForAddedExercise({ name: "DY 로우 머신", isCustom: false })).toBe(id);
    expect(exerciseImageSrc(id)).toBe(`/exercise-images/${id}.webp`);
  });
});

describe("0118: 운영자가 직접 만든 운동 → 공용 운동 (2026-10-10)", () => {
  // 같은 ID를 기본 운동으로 바꾼 것 중 그림이 있는 10개 (옛 이름 → 새 이름)
  const promoted = [
    ["3d9264b3-b67c-40ee-9385-fad0d8fb786b", "YTW", "인클라인 YTW 레이즈"],
    ["ba21558a-58db-4e58-a055-12309b9a438b", "벤드 레터럴 레이즈", "맨몸 벤트오버 레터럴 레이즈"],
    ["e6a6598d-8597-4d22-8d81-ef2265e0c168", "불가리안 스플릿 스쿼트", "불가리안 스플릿 스쿼트"],
    ["b79eef2a-2e72-4d00-836a-c5559de8669d", "Scapular Push-up Plus", "스캐풀러 푸시업 플러스"],
    ["90033d48-4db9-40bd-bd3f-3b8e1cbb55d1", "아이소 레터럴 인클라인 프레스머신", "아이소 레터럴 인클라인 프레스 머신"],
    ["4f47934b-e7a8-4618-8d24-085ebc297dde", "밴드 바이셉 컬", "밴드 바이셉 컬"],
    ["3ac56225-c8be-49bb-9997-5360e651882d", "밴드 풀어파트", "밴드 풀어파트"],
    ["e5835092-9ce2-4cd6-ae4e-e71cde1d7583", "밴드 스쿼트", "밴드 스쿼트"],
    ["bef0d91e-ea01-4817-b00e-e5978a5bdbe8", "밴드 레터럴 레이즈", "밴드 레터럴 레이즈"],
    ["aaf1b8e3-e12e-4d6f-846c-c1fd2cec768d", "밴드 시티드 로우", "밴드 시티드 로우"],
  ] as const;
  // 그림 없이 공용이 된 3개
  const promotedNoImage = [
    ["cb431896-1837-45d7-afed-e31cee522974", "흉추 익스텐션"],
    ["ac897fe5-30df-466b-a190-e0a660a545c3", "도어웨이 가슴 스트레칭"],
    ["b84bb13d-7323-42d4-b97e-f220d261432c", "월 슬라이드"],
  ] as const;
  // 기존 기본 운동으로 합치고 지운 직접 운동
  const merged = ["e62f53c9-bb53-4f0d-b89a-9e7ad6fe77b9", "bc0e833c-985d-4cf3-8a01-024a071bcfcd"];

  it("공용이 된 운동은 같은 ID·같은 그림을 새 공용 이름으로 찾는다", () => {
    for (const [id, , name] of promoted) {
      expect(SEED_NAME_BY_ID.get(id), id).toBe(name);
      const entry = EXERCISE_IMAGES[id];
      expect(entry.name, id).toBe(name);
      expect(entry.custom, id).toBeUndefined();
      expect(entry.file, id).toBe(id);
      expect(existsSync(publicPath(`exercise-images/${id}.webp`)), id).toBe(true);
      expect(seedExerciseIdByName(name), id).toBe(id);
      expect(imageIdForAddedExercise({ name, isCustom: false }), id).toBe(id);
    }
    for (const [id, name] of promotedNoImage) {
      expect(SEED_NAME_BY_ID.get(id), id).toBe(name);
      expect(EXERCISE_IMAGES[id], id).toBeUndefined();
    }
  });

  it("0118 실행 전(아직 직접 운동)에도 본인 카탈로그 ID로 같은 그림을 찾는다 — 앱을 먼저 배포해도 된다", () => {
    for (const [id, oldName] of promoted) {
      const own = [{ id, name: oldName, is_custom: true }];
      expect(imageIdForAddedExercise({ name: oldName, isCustom: true }, own), id).toBe(id);
    }
  });

  it("영어·오타였던 옛 이름으로는 공용 그림이 붙지 않는다", () => {
    for (const [, oldName, name] of promoted) {
      if (oldName !== name) expect(seedExerciseIdByName(oldName), oldName).toBeUndefined();
    }
  });

  it("합친 직접 운동은 연결표·그림 파일에서 빠지고 합친 공용 운동 그림을 쓴다", () => {
    for (const id of merged) {
      expect(EXERCISE_IMAGES[id], id).toBeUndefined();
      expect(existsSync(publicPath(`exercise-images/${id}.webp`)), id).toBe(false);
    }
    expect(imageIdForAddedExercise({ name: "시티드 로우", isCustom: false })).toBe("71220804-54f1-4e40-88aa-84663495dc2d");
    expect(seedExerciseIdByName("인클라인 덤벨 벤치프레스")).toBe("1c0251d1-54ca-45f6-ace2-4cb8bebab7a6");
  });

  it("연결표에 직접 운동 항목이 남지 않았다 (모두 운영자 운동이었다)", () => {
    expect(Object.values(EXERCISE_IMAGES).filter((e) => e.custom)).toEqual([]);
  });

  it("같은 이름이라도 다른 사람의 직접 운동 ID에는 그림이 붙지 않는다", () => {
    const other = [{ id: "00000000-0000-0000-0000-000000000000", name: "밴드 바이셉 컬", is_custom: true }];
    expect(imageIdForAddedExercise({ name: "밴드 바이셉 컬", isCustom: true }, other)).toBeUndefined();
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
  // 0118 이후 연결표에 직접 운동 항목은 없다. 그림이 있는 아무 ID로 "본인 카탈로그의
  // 직접 운동 행이 그 ID다"라는 상황을 만든다 (0118 실행 전의 운영자 운동이 그랬다).
  const customId = "90033d48-4db9-40bd-bd3f-3b8e1cbb55d1";

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
