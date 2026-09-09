import { describe, expect, it } from "vitest";
import {
  MAX_WORKOUT_PHOTOS,
  canAddWorkoutPhoto,
  capturedAtForPhotos,
  movePhoto,
  nextPhotoSlot,
  sortWorkoutPhotos,
  verificationSourceForPhotos,
  type WorkoutPhotoRow,
} from "@/lib/domain/workout-photos";

/** 행 하나 — 검사에 안 쓰는 칸은 기본값으로 채운다 */
function row(over: Partial<WorkoutPhotoRow> & { id: string }): WorkoutPhotoRow {
  return {
    image_path: `u/s/${over.id}.jpg`,
    source: "camera",
    sort_order: 0,
    client_captured_at: null,
    ...over,
  };
}

describe("MAX_WORKOUT_PHOTOS", () => {
  it("베타 상한은 5장이다 — DB의 CHECK(0..4)와 같은 수를 말한다", () => {
    expect(MAX_WORKOUT_PHOTOS).toBe(5);
  });
});

describe("sortWorkoutPhotos — sort_order ASC", () => {
  it("슬롯 순서로 정렬한다 (DB 반환 순서를 믿지 않는다)", () => {
    const sorted = sortWorkoutPhotos([
      row({ id: "c", sort_order: 2 }),
      row({ id: "a", sort_order: 0 }),
      row({ id: "b", sort_order: 1 }),
    ]);
    expect(sorted.map((p) => p.id)).toEqual(["a", "b", "c"]);
  });

  it("구멍이 뚫린 슬롯도 순서를 지킨다 (삭제 직후 상태)", () => {
    const sorted = sortWorkoutPhotos([
      row({ id: "y", sort_order: 4 }),
      row({ id: "x", sort_order: 1 }),
    ]);
    expect(sorted.map((p) => p.id)).toEqual(["x", "y"]);
  });

  it("원본 배열을 바꾸지 않는다", () => {
    const input = [row({ id: "b", sort_order: 1 }), row({ id: "a", sort_order: 0 })];
    sortWorkoutPhotos(input);
    expect(input.map((p) => p.id)).toEqual(["b", "a"]);
  });

  it("0장이면 빈 배열", () => {
    expect(sortWorkoutPhotos([])).toEqual([]);
  });

  it("1장이면 그대로", () => {
    expect(sortWorkoutPhotos([row({ id: "only", sort_order: 3 })])).toHaveLength(1);
  });

  it("5장을 전부 순서대로 돌려준다", () => {
    const shuffled = [4, 0, 3, 1, 2].map((n) => row({ id: `p${n}`, sort_order: n }));
    expect(sortWorkoutPhotos(shuffled).map((p) => p.id)).toEqual([
      "p0",
      "p1",
      "p2",
      "p3",
      "p4",
    ]);
  });
});

describe("nextPhotoSlot — 새 사진이 들어갈 슬롯", () => {
  it("사진이 없으면 0", () => {
    expect(nextPhotoSlot([])).toBe(0);
  });

  it("연속으로 찬 뒤에는 max+1", () => {
    expect(nextPhotoSlot([row({ id: "a", sort_order: 0 })])).toBe(1);
    expect(
      nextPhotoSlot([
        row({ id: "a", sort_order: 0 }),
        row({ id: "b", sort_order: 1 }),
      ]),
    ).toBe(2);
  });

  it("5장이 차 있으면 null — DB CHECK 이전에 화면에서 먼저 막는다", () => {
    const full = [0, 1, 2, 3, 4].map((n) => row({ id: `p${n}`, sort_order: n }));
    expect(nextPhotoSlot(full)).toBeNull();
  });

  /**
   * ⚠️ 이 단언이 이 함수의 존재 이유다. `max+1`만 쓰면 0·1·2를 지운 뒤
   *    남은 3·4에서 max+1 = 5가 되어 **2장뿐인데 CHECK(0..4)에 막힌다.**
   *    빈 슬롯을 찾아 쓰면 그 덫이 사라진다.
   */
  it("앞 슬롯이 비어 있으면 그 구멍을 쓴다 (max+1이면 5가 되어 막힌다)", () => {
    const afterDelete = [
      row({ id: "d", sort_order: 3 }),
      row({ id: "e", sort_order: 4 }),
    ];
    expect(nextPhotoSlot(afterDelete)).toBe(0);
  });

  it("가운데 구멍도 찾아 쓴다", () => {
    const holed = [
      row({ id: "a", sort_order: 0 }),
      row({ id: "c", sort_order: 2 }),
    ];
    expect(nextPhotoSlot(holed)).toBe(1);
  });
});

describe("canAddWorkoutPhoto", () => {
  it("5장 미만이면 추가 가능", () => {
    expect(canAddWorkoutPhoto(0)).toBe(true);
    expect(canAddWorkoutPhoto(4)).toBe(true);
  });

  it("5장이면 불가", () => {
    expect(canAddWorkoutPhoto(5)).toBe(false);
  });

  it("어쩌다 5장을 넘겨도 불가 (음수·초과 방어)", () => {
    expect(canAddWorkoutPhoto(6)).toBe(false);
  });
});

describe("verificationSourceForPhotos — 섞였을 때의 등급", () => {
  it("전부 camera면 camera", () => {
    expect(
      verificationSourceForPhotos([
        row({ id: "a", source: "camera" }),
        row({ id: "b", source: "camera" }),
      ]),
    ).toBe("camera");
  });

  it("전부 album이면 album", () => {
    expect(
      verificationSourceForPhotos([
        row({ id: "a", source: "album" }),
        row({ id: "b", source: "album" }),
      ]),
    ).toBe("album");
  });

  it("camera가 하나라도 섞이면 camera (§8 규칙)", () => {
    expect(
      verificationSourceForPhotos([
        row({ id: "a", source: "album" }),
        row({ id: "b", source: "album" }),
        row({ id: "c", source: "camera" }),
      ]),
    ).toBe("camera");
  });

  it("0장이면 null — 확정할 것이 없다", () => {
    expect(verificationSourceForPhotos([])).toBeNull();
  });
});

describe("capturedAtForPhotos — 임의 생성하지 않는다 (§8)", () => {
  it("camera 사진에 저장된 값 중 가장 이른 것을 쓴다", () => {
    expect(
      capturedAtForPhotos([
        row({ id: "b", source: "camera", client_captured_at: "2026-09-10T04:00:00Z" }),
        row({ id: "a", source: "camera", client_captured_at: "2026-09-10T03:00:00Z" }),
      ]),
    ).toBe("2026-09-10T03:00:00Z");
  });

  it("album 사진의 값은 쓰지 않는다 — 촬영 시각이 아니다", () => {
    expect(
      capturedAtForPhotos([
        row({ id: "a", source: "album", client_captured_at: "2026-09-10T01:00:00Z" }),
        row({ id: "b", source: "camera", client_captured_at: "2026-09-10T05:00:00Z" }),
      ]),
    ).toBe("2026-09-10T05:00:00Z");
  });

  it("camera 사진이 있어도 값이 전부 비어 있으면 null (지어내지 않는다)", () => {
    expect(
      capturedAtForPhotos([row({ id: "a", source: "camera", client_captured_at: null })]),
    ).toBeNull();
  });

  it("album만 있으면 null", () => {
    expect(
      capturedAtForPhotos([
        row({ id: "a", source: "album", client_captured_at: "2026-09-10T01:00:00Z" }),
      ]),
    ).toBeNull();
  });

  it("0장이면 null", () => {
    expect(capturedAtForPhotos([])).toBeNull();
  });
});

describe("movePhoto — 좌/우 이동 (드래그앤드롭 대신, 모바일 우선)", () => {
  const ids = ["a", "b", "c"];

  it("왼쪽으로 한 칸", () => {
    expect(movePhoto(ids, 1, -1)).toEqual(["b", "a", "c"]);
  });

  it("오른쪽으로 한 칸", () => {
    expect(movePhoto(ids, 1, 1)).toEqual(["a", "c", "b"]);
  });

  it("맨 앞에서 왼쪽은 그대로 (원본을 그대로 돌려준다)", () => {
    expect(movePhoto(ids, 0, -1)).toEqual(["a", "b", "c"]);
  });

  it("맨 뒤에서 오른쪽은 그대로", () => {
    expect(movePhoto(ids, 2, 1)).toEqual(["a", "b", "c"]);
  });

  it("원본 배열을 바꾸지 않는다", () => {
    const input = ["a", "b", "c"];
    movePhoto(input, 0, 1);
    expect(input).toEqual(["a", "b", "c"]);
  });

  it("범위 밖 인덱스는 그대로", () => {
    expect(movePhoto(ids, 9, -1)).toEqual(["a", "b", "c"]);
    expect(movePhoto(ids, -1, 1)).toEqual(["a", "b", "c"]);
  });
});
