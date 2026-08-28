import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 시간 기록의 단위 규칙 (2026-08-28).
 *
 * DB는 처음부터 초다(`workout_sets.duration_seconds int`, 0004). 그런데 클라
 * 모델이 `durationMin`(분)이라 **저장 경계에서 초가 눌렸다**:
 *
 * - 매달리기 37초 → 분 스테퍼라 **입력 자체가 불가능**했다(0분 아니면 1분)
 * - 러닝 32분 40초 → `32`분까지만 넣을 수 있어 40초가 사라졌다
 *
 * 이제 `durationSec`이 진실이고, 어디서 왔든 `durationSecondsOf()`로 읽는다.
 *
 * **이 테스트가 필요한 이유:** `saveSessionExercises()`는 Supabase 클라이언트에
 * 묶여 있어 단위 테스트가 없다. 저장 한 줄이 `durationMin * 60`으로 되돌아가도
 * 다른 어떤 테스트도 못 잡는다 — 화면은 초로 잘 보이고 DB에만 0이 들어간다.
 * `local-id-usage.test.ts`와 같은 방식(원본을 읽어 규칙을 단언)이다.
 */
const SOURCE_ROOTS = ["src/components", "src/app", "src/lib"];

/** 계획 JSON을 짓는 자리 — `durationMin`을 **일부러** 쓴다 */
const PLAN_FORMAT_FILES = new Set(
  [
    // 달력 계획·루틴·공식 프로그램 JSON의 포맷 정의. 서버 RPC가 `?&`로
    // `durationMin` 키의 **존재를 검사**한다(0066·0069·0070·0073).
    "src/lib/domain/workout-plan.ts",
  ].map((p) => path.normalize(p)),
);

/**
 * 주석을 지운다.
 *
 * ⚠️ 이 단계를 빼지 마라. 이 규칙을 설명하는 주석 자체가 `durationMin * 60`을
 * 인용하고 있어서, 원본을 그대로 훑으면 **정답을 적어 둔 파일이 위반으로 잡힌다.**
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

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

describe("시간 단위 규칙 (2026-08-28)", () => {
  /**
   * ⚠️ 사보타주 검사: 저장 줄을 `Math.round(s.durationMin * 60)`으로 되돌리면
   * 이 단언이 실패해야 한다.
   */
  it("세트를 저장할 때 `durationSecondsOf`로 초를 읽는다", () => {
    const source = readFileSync("src/lib/workout.ts", "utf8");
    const saveBlock = source.slice(
      source.indexOf("const setRows = exercises.flatMap"),
    );
    const insertIndex = saveBlock.indexOf('from("workout_sets").insert');
    expect(insertIndex).toBeGreaterThan(0);

    const rows = stripComments(saveBlock.slice(0, insertIndex));
    expect(rows).toContain("duration_seconds");
    expect(rows).toContain("durationSecondsOf(s)");
    // 분을 곱해 초를 만드는 옛 경로가 남아 있으면 안 된다
    expect(rows).not.toContain("durationMin * 60");
  });

  /**
   * `durationMin`을 그대로 읽어 화면에 쓰면 매달리기 37초가 `0분`이 된다.
   * 계획 포맷을 짓는 파일만 예외다.
   */
  it("화면·도메인은 `durationMin`을 직접 읽어 시간을 표시하지 않는다", () => {
    const offenders: string[] = [];
    for (const root of SOURCE_ROOTS) {
      for (const file of walk(root)) {
        if (PLAN_FORMAT_FILES.has(path.normalize(file))) continue;
        const source = stripComments(readFileSync(file, "utf8"));
        /*
          `${...durationMin}분` 처럼 분을 직접 문자열에 박는 자리.

          ⚠️ 단어 경계(\b)가 중요하다 — 없으면 `durationMinutes`(세션 전체 시간, 분이
          맞는 다른 개념)까지 잡아서 피드·인증사진이 위반으로 뜬다.
        */
        if (/\$\{[^}]*\bdurationMin\b[^}]*\}\s*분/.test(source)) {
          offenders.push(file);
        }
        // `Math.round(duration_seconds / 60)`으로 읽고 그걸 표시에 쓰는 자리는
        // 남아 있어도 되지만(계획 호환 필드), 옆에 `durationSec`가 반드시 있어야 한다
        if (
          source.includes("duration_seconds ?? 0) / 60") &&
          !source.includes("durationSec")
        ) {
          offenders.push(file);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  /** 기본 목표가 두 경로에서 갈리면 담는 방법에 따라 값이 달라진다 */
  it("시간형 기본 목표는 한 곳에서만 정의된다", () => {
    const setTimer = readFileSync("src/lib/domain/set-timer.ts", "utf8");
    expect(setTimer).toContain("export const DEFAULT_HOLD_SECONDS = 30");

    for (const file of [
      "src/lib/workout.ts",
      "src/lib/domain/recommended-sets.ts",
    ]) {
      const source = readFileSync(file, "utf8");
      expect(source).toContain("DEFAULT_HOLD_SECONDS");
    }
  });
});
