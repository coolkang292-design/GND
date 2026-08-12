import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 0069 정적 계약 (사용자 확정 2026-08-12).
 *
 * DB를 못 돌리는 단위 테스트라도, **적용된 0066을 고치지 않았는지**와
 * **간격 검사가 정말 빠졌는지**는 파일로 확인할 수 있다.
 */
describe("0069 연속 요일 허용 마이그레이션", () => {
  const dir = join(process.cwd(), "supabase", "migrations");
  const sql = readFileSync(
    join(dir, "0069_program_allow_consecutive_days.sql"),
    "utf8",
  );

  it("두 RPC를 모두 다시 만든다", () => {
    expect(sql).toMatch(
      /create or replace function public\.create_program_enrollment/i,
    );
    expect(sql).toMatch(
      /create or replace function public\.reschedule_program_plans/i,
    );
  });

  it("회복 간격 예외를 더 이상 던지지 않는다", () => {
    // 확인 쿼리 주석에는 이름이 나온다 — **실행되는 raise**만 본다.
    expect(sql).not.toMatch(/raise exception 'program_recovery_gap'/);
  });

  it("같은 날 두 회차는 여전히 막는다", () => {
    // 간격 제한을 없앤 것이지 중복을 허용한 게 아니다.
    expect(sql).toContain("program_plan_date_order");
    expect(sql).toMatch(/v_plan_date - v_previous_date < 1/);
    expect(sql).toMatch(/final_date - previous_date < 1/);
  });

  it("서로 다른 요일 3개 조건은 남긴다", () => {
    expect(sql).toContain("program_slot_weekday_duplicate");
  });

  it("트랜잭션으로 감싼다", () => {
    expect(sql).toMatch(/^begin;$/m);
    expect(sql).toMatch(/^commit;$/m);
  });

  it("권한을 0066과 같게 다시 못 박는다", () => {
    expect(sql).toMatch(/from public, anon/);
    expect(sql).toMatch(/grant execute on function public\.create_program_enrollment/i);
    expect(sql).toMatch(/grant execute on function public\.reschedule_program_plans/i);
  });

  it("적용된 0066은 손대지 않는다 — 옛 검사가 그대로 남아 있어야 한다", () => {
    // 적용된 마이그레이션을 고치면 DB는 안 바뀌고 다음 사람만 헷갈린다.
    // 0066에 옛 검사가 남아 있는 것이 "안 고쳤다"는 증거다.
    expect(
      readFileSync(join(dir, "0066_official_program_enrollments.sql"), "utf8"),
    ).toMatch(/raise exception 'program_recovery_gap'/);
  });
});
