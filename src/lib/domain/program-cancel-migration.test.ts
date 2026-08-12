import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const dir = join(process.cwd(), "supabase", "migrations");

/** 주석을 뺀 **실행되는 SQL**만 남긴다 — 설명 주석에 나온 이름에 속지 않도록 */
function executableSql(fileName: string): string {
  return readFileSync(join(dir, fileName), "utf8")
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

/**
 * 0071·0072 정적 계약 (사용자 지시 2026-08-12).
 *
 * ⚠️ 이 파일이 잡지 **못한** 것이 있다. 0071은 `status`만 바꾸고 `cancelled_at`을
 *    비워 뒀는데, 여기서는 `set status = 'cancelled'`가 있다는 것만 확인해서
 *    통과했다. 0066의 테이블 check 위반은 **실제 update가 일어나야** 드러난다 —
 *    운영 실측(`scripts/program-interval-enrollment-test.mjs`)이 잡았고 0072로
 *    고쳤다. **문자열 검사와 실행은 서로를 대신하지 못한다.**
 */
describe("0071 프로그램 그만두기 마이그레이션", () => {
  const file = "0071_cancel_program_enrollment.sql";
  const sql = readFileSync(join(dir, file), "utf8");
  const executable = executableSql(file);

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
      /delete from public\.workout_plans\s+where program_enrollment_id = p_enrollment_id\s+and user_id = v_user_id/,
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

describe("0072 그만두기가 cancelled_at을 채운다", () => {
  const file = "0072_cancel_enrollment_timestamp.sql";
  const sql = readFileSync(join(dir, file), "utf8");
  const executable = executableSql(file);

  /**
   * 0066의 테이블 check가 상태와 타임스탬프를 묶어 두었다:
   *   (status = 'cancelled' and completed_at is null and cancelled_at is not null)
   * 상태만 바꾸면 23514로 행 전체가 거절된다.
   */
  it("상태와 함께 cancelled_at을 쓴다", () => {
    expect(sql).toMatch(/set status = 'cancelled',\s+cancelled_at = now\(\)/);
  });

  it("completed_at은 건드리지 않는다", () => {
    // check가 'cancelled'일 때 completed_at이 null이기를 요구한다
    expect(executable).not.toMatch(/completed_at\s*=/);
  });

  it("0071의 나머지 규칙을 그대로 지킨다", () => {
    for (const kept of [
      "not_authenticated",
      "program_enrollment_not_found",
      "program_not_active",
      "pg_advisory_xact_lock",
    ]) {
      expect(sql).toContain(kept);
    }
    expect(sql).toMatch(/delete from public\.workout_plans/);
  });

  it("적용된 0071은 손대지 않는다", () => {
    // 0071에 옛 update가 그대로 남아 있는 것이 "안 고쳤다"는 증거다
    const previous = readFileSync(
      join(dir, "0071_cancel_program_enrollment.sql"),
      "utf8",
    );
    expect(previous).toMatch(/set status = 'cancelled'\s+where id/);
    expect(previous).not.toContain("cancelled_at = now()");
  });

  it("트랜잭션과 권한을 다시 못 박는다", () => {
    expect(sql).toMatch(/^begin;$/m);
    expect(sql).toMatch(/^commit;$/m);
    expect(sql).toMatch(
      /grant execute on function public\.cancel_program_enrollment\(uuid\) to authenticated/,
    );
  });
});
