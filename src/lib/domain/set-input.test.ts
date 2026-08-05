import { describe, expect, it } from "vitest";
import {
  REST_PRESET_SECONDS,
  adjustAmount,
  amountFields,
} from "./set-input";

/**
 * ② 큰 팝업의 세트 입력 (2026-08-04, 사용자 목업).
 *
 * 목업은 웨이트(무게×횟수)만 보여주지만 **같은 틀에 필드만 바꿔** 유산소·맨몸도
 * 담는다(사용자 결정). 지시서의 "입력 항목을 임의로 추가·삭제하지 마라"를
 * 지키려면 필드 목록이 저장 구조(`LocalSet`)와 정확히 맞아야 한다.
 */
describe("amountFields — 유형별 입력 칸", () => {
  it("웨이트는 무게와 횟수 두 칸", () => {
    const fields = amountFields("weight", null);

    expect(fields.map((f) => f.key)).toEqual(["weightKg", "reps"]);
    expect(fields[0]).toMatchObject({ label: "무게", unit: "kg" });
    expect(fields[1]).toMatchObject({ label: "횟수", unit: "회" });
  });

  it("맨몸 횟수형은 횟수 한 칸", () => {
    expect(amountFields("bodyweight", "reps").map((f) => f.key)).toEqual([
      "reps",
    ]);
  });

  it("맨몸 measure가 null이면 횟수형으로 본다", () => {
    expect(amountFields("bodyweight", null).map((f) => f.key)).toEqual(["reps"]);
  });

  it("맨몸 시간형은 시간 한 칸", () => {
    const fields = amountFields("bodyweight", "time");

    expect(fields.map((f) => f.key)).toEqual(["durationMin"]);
    expect(fields[0]).toMatchObject({ label: "시간", unit: "분" });
  });

  it("유산소는 거리와 시간 두 칸", () => {
    const fields = amountFields("cardio", null);

    expect(fields.map((f) => f.key)).toEqual(["distanceKm", "durationMin"]);
    expect(fields[0]).toMatchObject({ label: "거리", unit: "km" });
  });

  it("칸마다 빠른 조절 값이 단위에 맞게 붙는다", () => {
    // 목업: 무게 -2.5/-1/+1/+2.5, 횟수 -2/-1/+1/+2
    expect(amountFields("weight", null)[0].quickSteps).toEqual([
      -2.5, -1, 1, 2.5,
    ]);
    expect(amountFields("weight", null)[1].quickSteps).toEqual([-2, -1, 1, 2]);
  });

  it("거리는 0.5km, 시간은 1분 단위로 조절한다", () => {
    const cardio = amountFields("cardio", null);

    expect(cardio[0].step).toBe(0.5);
    expect(cardio[1].step).toBe(1);
  });

  it("저장 구조에 없는 필드를 만들지 않는다", () => {
    const all = (["weight", "bodyweight", "cardio"] as const).flatMap((type) =>
      [null, "reps", "time"].flatMap((measure) =>
        amountFields(type, measure as "reps" | "time" | null).map((f) => f.key),
      ),
    );
    const allowed = new Set(["weightKg", "reps", "distanceKm", "durationMin"]);

    for (const key of all) expect(allowed.has(key)).toBe(true);
  });
});

describe("adjustAmount — 스테퍼·빠른 칩 공용", () => {
  it("더하고 뺀다", () => {
    expect(adjustAmount(40, 2.5)).toBe(42.5);
    expect(adjustAmount(40, -2.5)).toBe(37.5);
  });

  it("0 아래로 내려가지 않는다 — 음수 중량·횟수는 저장 구조가 거부한다", () => {
    expect(adjustAmount(1, -2.5)).toBe(0);
    expect(adjustAmount(0, -1)).toBe(0);
  });

  it("소수점 오차를 남기지 않는다", () => {
    // 0.1 + 0.2 = 0.30000000000000004 같은 값이 화면에 그대로 뜨면 안 된다
    expect(adjustAmount(0.1, 0.2)).toBe(0.3);
    expect(adjustAmount(2.5, 0.5)).toBe(3);
  });
});

describe("REST_PRESET_SECONDS", () => {
  it("목업의 다섯 가지 — 30초·45초·1분·1분 30초·2분", () => {
    expect(REST_PRESET_SECONDS).toEqual([30, 45, 60, 90, 120]);
  });
});
