import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** 0071 정적 계약 (사용자 지시 2026-08-12). */
describe("0071 프로그램 그만두기 마이그레이션", () => {
  const dir = join(process.cwd(), "supabase", "migrations");
  const sql = readFileSync(
    join(dir, "0071_cancel_program_enrollment.sql"),
    "utf8",
  );
  /**
   * 주석을 뺀 **실행되는 SQL**. 0069 테스트가 같은 함정에 빠졌었다 —
   * 설명 주석에 나온 이름을 두고 "코드에 있다"고 판정한다.
   */
  const executable = sql
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");

  it("취소 RPC를 만든다", () => {
    expect(sql).toMatch(
      /create or replace function public\.cancel_program_enrollment/i,
    );
  });

  it("본인 등록만 취소한다", () => {
    expect(sql).toMatch(/where id = p_enrollment_id and user_id = v_user_id/);
    expect(sql).toContain("program_enrollment_not_found");
    expect(sql).toContain("not_authenticated");
  });

  it("진행 중인 등록만 취소한다", () => {
    // 이미 끝났거나 취소된 것을 또 취소하면 계획을 두 번 지운다
    expect(sql).toContain("program_not_active");
    expect(sql).toMatch(/v_status <> 'active'/);
  });

  it("등록 행을 지우지 않고 상태만 바꾼다", () => {
    // 지우면 "예전에 이걸 했었다"는 사실도 함께 사라진다
    expect(sql).toMatch(/set status = 'cancelled'/);
    expect(executable).not.toMatch(/delete from public\.program_enrollments/);
  });

  it("그 등록의 계획만 지운다", () => {
    expect(sql).toMatch(
      /delete from public\.workout_plans\s*\n\s*where program_enrollment_id = p_enrollment_id\s*\n\s*and user_id = v_user_id/,
    );
  });

  it("기록(workout_sessions)은 건드리지 않는다", () => {
    // 완료한 운동까지 사라지면 그만두기가 아니라 이력 삭제다
    expect(executable).not.toMatch(/workout_sessions/);
  });

  it("등록 RPC와 같은 잠금을 쓴다", () => {
    // 취소와 재등록이 겹치면 지우는 중에 새 계획이 들어온다
    expect(sql).toMatch(/pg_advisory_xact_lock/);
  });

  it("트랜잭션으로 감싸고 권한을 못 박는다", () => {
    expect(sql).toMatch(/^begin;$/m);
    expect(sql).toMatch(/^commit;$/m);
    expect(sql).toMatch(
      /revoke all on function public\.cancel_program_enrollment\(uuid\) from public, anon/,
    );
    expect(sql).toMatch(
      /grant execute on function public\.cancel_program_enrollment\(uuid\) to authenticated/,
    );
  });

  it("적용된 0066~0070은 손대지 않는다", () => {
    expect(
      readFileSync(join(dir, "0070_program_interval_sessions.sql"), "utf8"),
    ).toContain("program_invalid_tabata_minutes");
  });
});
