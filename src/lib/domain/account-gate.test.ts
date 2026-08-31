import { describe, expect, it } from "vitest";
import {
  ACCOUNT_LINK_PATH,
  PERMANENT_ACCOUNT_REQUIRED,
  accountGateMessage,
  isPermanentAccountRequired,
  permanentAccountMessage,
} from "./account-gate";

describe("isPermanentAccountRequired", () => {
  it("Error·문자열·PostgrestError 모양을 모두 알아본다", () => {
    expect(isPermanentAccountRequired(new Error(PERMANENT_ACCOUNT_REQUIRED))).toBe(true);
    expect(isPermanentAccountRequired(PERMANENT_ACCOUNT_REQUIRED)).toBe(true);
    expect(isPermanentAccountRequired({ message: PERMANENT_ACCOUNT_REQUIRED })).toBe(true);
  });

  it("Supabase가 앞뒤로 감싼 문구 안에서도 찾는다", () => {
    // 실제 응답 예: {"code":"P0001","message":"permanent_account_required"}
    expect(
      isPermanentAccountRequired(
        new Error('failed: permanent_account_required (P0001)'),
      ),
    ).toBe(true);
  });

  it("다른 오류는 잡지 않는다", () => {
    expect(isPermanentAccountRequired(new Error("already_crew"))).toBe(false);
    expect(isPermanentAccountRequired(new Error("not_authenticated"))).toBe(false);
    expect(isPermanentAccountRequired(null)).toBe(false);
    expect(isPermanentAccountRequired(undefined)).toBe(false);
    expect(isPermanentAccountRequired(42)).toBe(false);
  });

  it("⚠️ 코드 문자열이 DB와 같아야 한다 — 갈리면 안내가 통째로 안 뜬다", () => {
    // 0094의 `raise exception 'permanent_account_required'`와 같은 값
    expect(PERMANENT_ACCOUNT_REQUIRED).toBe("permanent_account_required");
  });
});

describe("permanentAccountMessage", () => {
  it("세 상황이 각각 다른 첫 문장을 쓴다", () => {
    expect(permanentAccountMessage("invite")).toContain("친구 초대 링크");
    expect(permanentAccountMessage("crew")).toContain("크루 요청");
    expect(permanentAccountMessage("challenge")).toContain("챌린지 방");
  });

  it("⚠️ '안 된다'로 끝내지 않고 다음에 할 일을 말한다", () => {
    for (const a of ["invite", "crew", "challenge"] as const) {
      const m = permanentAccountMessage(a);
      expect(m).toContain("카카오·구글");
      expect(m).toContain("계정");
    }
  });

  it("⚠️ 기록이 유지된다고 말한다 — 이걸 안 쓰면 사용자가 연결을 무서워한다", () => {
    expect(permanentAccountMessage("crew")).toContain("기록은 그대로");
  });

  it("연결하러 갈 곳이 정해져 있다", () => {
    expect(ACCOUNT_LINK_PATH).toBe("/account");
  });
});

describe("accountGateMessage", () => {
  it("정식 계정 문제면 문구를, 아니면 null을 준다", () => {
    expect(accountGateMessage(new Error(PERMANENT_ACCOUNT_REQUIRED), "crew")).toContain(
      "크루 요청",
    );
    // null이면 각 화면이 원래 쓰던 문구를 그대로 쓴다
    expect(accountGateMessage(new Error("already_crew"), "crew")).toBeNull();
  });
});

describe("문구가 자연스러운 한국어인가", () => {
  it("⚠️ '보내려면에는' 같은 조사 중복이 없다 (2026-08-31 화면에서 잡았다)", () => {
    for (const a of ["invite", "crew", "challenge"] as const) {
      const m = permanentAccountMessage(a);
      expect(m).not.toContain("려면에는");
      expect(m).not.toContain("면에는");
      expect(m).toMatch(/려면 카카오·구글 연결이 필요해요/);
    }
  });
});
