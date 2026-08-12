import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("0068 프로그램 등록 소유권 함수 보안", () => {
  const sql = readFileSync(
    join(
      process.cwd(),
      "supabase",
      "migrations",
      "0068_program_enrollment_helper_security.sql",
    ),
    "utf8",
  );

  it("security definer 함수의 검색 경로를 비우고 객체를 완전한 이름으로 참조한다", () => {
    expect(sql).toMatch(/security definer\s+set search_path\s*=\s*''/i);
    expect(sql).toContain("public.program_enrollments");
    expect(sql).toContain("auth.uid()");
  });

  it("PUBLIC·anon 실행권한을 회수하고 authenticated만 허용한다", () => {
    expect(sql).toMatch(
      /revoke all on function public\.owns_program_enrollment\(uuid\) from public, anon/i,
    );
    expect(sql).toMatch(
      /grant execute on function public\.owns_program_enrollment\(uuid\) to authenticated/i,
    );
  });
});
