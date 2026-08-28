import { describe, expect, it } from "vitest";
import {
  REST_PRESET_SECONDS,
  adjustAmount,
  amountFields,
  propagateAmount,
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

  /**
   * ⚠️ **`durationMin`으로 되돌리면 이 단언이 잡는다** (2026-08-28).
   * 분이던 시절엔 `step: 1`분이라 매달리기 37초를 넣을 방법이 아예 없었다 —
   * 0분 아니면 1분이었다.
   */
  it("맨몸 시간형은 시간 한 칸이고 **초**로 잰다", () => {
    const fields = amountFields("bodyweight", "time");

    expect(fields.map((f) => f.key)).toEqual(["durationSec"]);
    expect(fields[0].label).toBe("시간");
    // 37초를 스테퍼로 만들 수 있어야 한다 — 5초 단위
    expect(fields[0].step).toBe(5);
  });

  it("시간 칸은 세트 시계가 채운다고 표시돼 있다", () => {
    expect(amountFields("bodyweight", "time")[0].timed).toBe(true);
    expect(amountFields("cardio", null)[1].timed).toBe(true);
    // 웨이트·횟수형에는 시계가 붙지 않는다
    for (const field of amountFields("weight", null)) {
      expect(field.timed).toBeUndefined();
    }
    expect(amountFields("bodyweight", "reps")[0].timed).toBeUndefined();
  });

  it("시간 칸은 숫자를 사람 말로 바꿔 준다 — `1960` → `32분 40초`", () => {
    const hold = amountFields("bodyweight", "time")[0];
    const cardio = amountFields("cardio", null)[1];

    expect(hold.format?.(37)).toBe("37초");
    expect(cardio.format?.(1_960)).toBe("32분 40초");
    // 분이 딱 떨어지면 초를 안 붙인다 — 옛 기록 표기가 안 바뀐다
    expect(cardio.format?.(1_800)).toBe("30분");
  });

  it("유산소는 거리와 시간 두 칸", () => {
    const fields = amountFields("cardio", null);

    expect(fields.map((f) => f.key)).toEqual(["distanceKm", "durationSec"]);
    expect(fields[0]).toMatchObject({ label: "거리", unit: "km" });
  });

  it("칸마다 빠른 조절 값이 단위에 맞게 붙는다", () => {
    // 목업: 무게 -2.5/-1/+1/+2.5, 횟수 -2/-1/+1/+2
    expect(amountFields("weight", null)[0].quickSteps).toEqual([
      -2.5, -1, 1, 2.5,
    ]);
    expect(amountFields("weight", null)[1].quickSteps).toEqual([-2, -1, 1, 2]);
  });

  /**
   * 2026-08-09 사용자 지시로 0.5 → 0.1이 됐다. "유산소 거리는 보통 0.1 단위
   * 수정을 해야 하므로." 0.5로 되돌리면 3.2km를 스테퍼로 만들 수 없다.
   */
  it("거리는 0.1km, 시간은 1분(=60초) 단위로 조절한다", () => {
    const cardio = amountFields("cardio", null);

    expect(cardio[0].step).toBe(0.1);
    /*
      ⚠️ 값은 **초**지만 손으로 담을 때 러닝은 분 단위 일이다 (2026-08-28).
      5초 단위로 바꾸면 30분을 만드는 데 360번 눌러야 한다.
    */
    expect(cardio[1].step).toBe(60);
    expect(cardio[1].quickSteps).toEqual([-300, -60, 60, 300]);
    // 칩 문구는 초가 아니라 분으로 읽힌다
    expect(cardio[1].stepLabel?.(300)).toBe("+5분");
    expect(amountFields("bodyweight", "time")[0].stepLabel?.(30)).toBe("+30초");
  });

  it("거리의 빠른 칩에는 굵은 조절(±1)이 남아 있다", () => {
    // 0.1만 있으면 5km를 넣는 데 50번 눌러야 한다.
    expect(amountFields("cardio", null)[0].quickSteps).toEqual([
      -1, -0.1, 0.1, 1,
    ]);
  });

  it("저장 구조에 없는 필드를 만들지 않는다", () => {
    const all = (["weight", "bodyweight", "cardio"] as const).flatMap((type) =>
      [null, "reps", "time"].flatMap((measure) =>
        amountFields(type, measure as "reps" | "time" | null).map((f) => f.key),
      ),
    );
    const allowed = new Set([
      "weightKg",
      "reps",
      "distanceKm",
      "durationMin",
      "durationSec",
    ]);

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

  it("0.1 단위 거리 조절이 오차를 남기지 않는다", () => {
    // 거리 step이 0.1이 되면서(2026-08-09) 이쪽이 실사용 경로가 됐다.
    // 3.2 + 0.1 = 3.3000000000000003이 화면에 뜨면 안 된다.
    expect(adjustAmount(3.2, 0.1)).toBe(3.3);
    expect(adjustAmount(0.3, -0.1)).toBe(0.2);
    // 0.1을 열 번 누르면 정확히 1.0이다
    let v = 0;
    for (let i = 0; i < 10; i++) v = adjustAmount(v, 0.1);
    expect(v).toBe(1);
  });
});

describe("REST_PRESET_SECONDS", () => {
  it("목업의 다섯 가지 — 30초·45초·1분·1분 30초·2분", () => {
    expect(REST_PRESET_SECONDS).toEqual([30, 45, 60, 90, 120]);
  });
});

/**
 * 운동 중 값 수정의 뒤 세트 전파 (2026-08-09 사용자 지시).
 * "운동 시작하고 운동중 무게 수정하면 다음 세트부터 일괄 적용하게"
 */
describe("propagateAmount — 다음 세트부터 일괄 적용", () => {
  const set = (weightKg: number, done = false) => ({ weightKg, reps: 10, done });

  it("뒤에 남은 세트에 같은 값을 쓴다", () => {
    const sets = [set(60), set(60), set(60), set(60)];

    const out = propagateAmount(sets, 0, "weightKg", 50);

    // ⚠️ "0이 아니다"가 아니라 **정확히 3**이어야 한다. 서버·로직이 통째로
    //    망가져도 0은 통과하지만 3은 통과하지 않는다.
    expect(out.changed).toBe(3);
    expect(out.sets.map((s) => s.weightKg)).toEqual([60, 50, 50, 50]);
  });

  it("이미 완료한 뒤 세트는 건드리지 않는다 — 그건 예상치가 아니라 기록이다", () => {
    const sets = [set(60), set(60, true), set(60)];

    const out = propagateAmount(sets, 0, "weightKg", 50);

    expect(out.changed).toBe(1);
    expect(out.sets.map((s) => s.weightKg)).toEqual([60, 60, 50]);
    expect(out.sets[1].done).toBe(true);
  });

  it("앞 세트는 건드리지 않는다 — '다음 세트부터'다", () => {
    const sets = [set(60), set(60), set(60)];

    const out = propagateAmount(sets, 2, "weightKg", 50);

    expect(out.changed).toBe(0);
    expect(out.sets.map((s) => s.weightKg)).toEqual([60, 60, 60]);
  });

  it("마지막 세트에서 바꾸면 전파할 곳이 없다", () => {
    const sets = [set(60), set(60)];

    expect(propagateAmount(sets, 1, "weightKg", 50).changed).toBe(0);
  });

  it("무게만이 아니라 네 칸 전부에 적용된다 (사용자 결정 2026-08-09)", () => {
    const sets = [
      { weightKg: 0, reps: 12, distanceKm: 0, durationMin: 0, done: false },
      { weightKg: 0, reps: 12, distanceKm: 0, durationMin: 0, done: false },
    ];

    expect(propagateAmount(sets, 0, "reps", 10).sets[1].reps).toBe(10);
    expect(
      propagateAmount(sets, 0, "distanceKm", 3.3).sets[1].distanceKm,
    ).toBe(3.3);
    expect(
      propagateAmount(sets, 0, "durationMin", 25).sets[1].durationMin,
    ).toBe(25);
  });

  it("바뀐 게 없으면 같은 배열을 그대로 돌려준다 — 불필요한 렌더를 만들지 않는다", () => {
    const sets = [set(50), set(50), set(50)];

    const out = propagateAmount(sets, 0, "weightKg", 50);

    expect(out.changed).toBe(0);
    expect(out.sets).toBe(sets); // 참조 동일성
  });

  it("바꾼 세트만 새 객체다 — 나머지는 참조가 유지된다", () => {
    const sets = [set(60), set(60)];

    const out = propagateAmount(sets, 0, "weightKg", 50);

    expect(out.sets[0]).toBe(sets[0]);
    expect(out.sets[1]).not.toBe(sets[1]);
  });
});
