import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 0070 정적 계약 (설계 2026-08-12 §5).
 *
 * DB를 못 돌리는 단위 테스트라도, **적용된 0066~0069를 고치지 않았는지**와
 * **인터벌 분기가 실제로 들어갔는지**는 파일로 확인할 수 있다.
 */
describe("0070 인터벌 회차 마이그레이션", () => {
  const dir = join(process.cwd(), "supabase", "migrations");
  const sql = readFileSync(
    join(dir, "0070_program_interval_sessions.sql"),
    "utf8",
  );

  it("등록 RPC를 다시 만든다", () => {
    expect(sql).toMatch(
      /create or replace function public\.create_program_enrollment/i,
    );
  });

  it("난이도 3단계를 테이블과 RPC 양쪽에 넣는다", () => {
    // 한쪽만 넣으면 RPC는 통과하는데 insert가 check로 막힌다
    expect(sql).toMatch(
      /check \(level_at_start in \('beginner', 'moderate', 'experienced'\)\)/,
    );
    expect(sql).toMatch(
      /p_level_at_start not in \('beginner', 'moderate', 'experienced'\)/,
    );
  });

  it("기존 난이도 두 값을 지우지 않는다", () => {
    // 기존 등록 행이 beginner·experienced다. 좁히면 그 행들이 죽는다.
    const check = /check \(level_at_start in \(([^)]*)\)\)/.exec(sql)?.[1] ?? "";
    expect(check).toContain("'beginner'");
    expect(check).toContain("'experienced'");
  });

  it("tabata_minutes를 4·8·16으로만 받는다", () => {
    expect(sql).toContain("program_invalid_tabata_minutes");
    expect(sql).toMatch(/\(v_plan->>'tabata_minutes'\) not in \('4', '8', '16'\)/);
  });

  it("인터벌이면 종목 4개, 근력이면 5~6개다", () => {
    expect(sql).toMatch(
      /v_is_interval\s*\n\s*and jsonb_array_length\(v_plan->'exercises'\) <> 4/,
    );
    expect(sql).toMatch(
      /not v_is_interval\s*\n\s*and jsonb_array_length\(v_plan->'exercises'\) not between 5 and 6/,
    );
  });

  it("인터벌은 세트가 정확히 1개다", () => {
    expect(sql).toMatch(
      /v_is_interval\s*\n\s*and jsonb_array_length\(v_exercise->'sets'\) <> 1/,
    );
  });

  it("인터벌은 처방을 요구하지 않는다", () => {
    // 20초/10초는 음원이 정한다 — restSeconds 60~300에 걸리면 안 된다
    expect(sql).toMatch(/not v_is_interval and not \(v_exercise \? 'prescription'\)/);
    expect(sql).toMatch(/if not v_is_interval then\s*\n\s*v_prescription/);
  });

  it("근력 처방 검증은 그대로 남는다", () => {
    // 인터벌을 받으려다 근력 검증을 느슨하게 만들면 안 된다
    expect(sql).toContain("program_invalid_prescription");
    expect(sql).toMatch(/'restSeconds'\)::int not between 60 and 300/);
  });

  it("한 등록에 두 모양이 섞이는 것을 막는다", () => {
    expect(sql).toContain("program_mixed_plan_kinds");
    expect(sql).toMatch(/v_interval_plans not in \(0, 18\)/);
  });

  it("계획 행에 tabata_minutes를 싣는다", () => {
    // 안 실으면 등록은 되는데 회차를 열었을 때 인터벌인 줄 모른다
    expect(sql).toMatch(
      /insert into public\.workout_plans \([\s\S]*?tabata_minutes,[\s\S]*?\) values/,
    );
  });

  it("연속 요일 허용(0069)을 되돌리지 않는다", () => {
    expect(sql).not.toMatch(/raise exception 'program_recovery_gap'/);
    expect(sql).toMatch(/v_plan_date - v_previous_date < 1/);
  });

  it("트랜잭션으로 감싼다", () => {
    expect(sql).toMatch(/^begin;$/m);
    expect(sql).toMatch(/^commit;$/m);
  });

  it("권한을 0066·0069와 같게 다시 못 박는다", () => {
    expect(sql).toMatch(/from public, anon/);
    expect(sql).toMatch(
      /grant execute on function public\.create_program_enrollment/i,
    );
  });

  it("적용된 0066~0069는 손대지 않는다", () => {
    // 적용된 마이그레이션을 고치면 DB는 안 바뀌고 다음 사람만 헷갈린다.
    // 옛 정의가 그대로 남아 있는 것이 "안 고쳤다"는 증거다.
    expect(
      readFileSync(join(dir, "0066_official_program_enrollments.sql"), "utf8"),
    ).toMatch(/check \(level_at_start in \('beginner', 'experienced'\)\)/);
    expect(
      readFileSync(join(dir, "0069_program_allow_consecutive_days.sql"), "utf8"),
    ).toMatch(/p_level_at_start not in \('beginner', 'experienced'\)/);
  });
});
