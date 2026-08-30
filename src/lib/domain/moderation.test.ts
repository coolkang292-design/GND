import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  REPORT_NOTE_MAX,
  REPORT_REASONS,
  blockConfirmCopy,
  isReportReason,
  reportDraftMessage,
  validateReportDraft,
} from "./moderation";

const MIGRATION = readFileSync(
  resolve(process.cwd(), "supabase/migrations/0089_block_report_recruit_limits.sql"),
  "utf8",
);

describe("신고 사유 목록", () => {
  // 이 테스트가 이 파일의 존재 이유다. 사유 목록이 화면(여기)과 DB CHECK 제약
  // 두 곳에 있어서, 한쪽만 늘리면 화면은 사유를 보여주는데 서버가
  // invalid_reason으로 튕긴다. 사람이 눈으로 맞추는 대신 테스트가 맞춘다.
  it("0089의 CHECK 제약과 정확히 같은 집합이다", () => {
    const line = MIGRATION.split("\n").find(
      (l) => l.includes("reason") && l.includes("check (reason in ("),
    );
    expect(line, "0089에서 reason CHECK 제약을 못 찾았다").toBeTruthy();

    const inside = line!.slice(line!.indexOf("check (reason in (") + "check (reason in (".length);
    const sqlReasons = [...inside.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);

    expect(sqlReasons.length).toBeGreaterThan(0);
    expect([...sqlReasons].sort()).toEqual([...REPORT_REASONS.map((r) => r.id)].sort());
  });

  it("0089의 note 길이 제한과 같은 값이다", () => {
    const m = MIGRATION.match(/length\(note\)\s*<=\s*(\d+)/);
    expect(m, "0089에서 note 길이 제약을 못 찾았다").toBeTruthy();
    expect(Number(m![1])).toBe(REPORT_NOTE_MAX);
  });

  it("사유마다 라벨과 설명이 비어 있지 않다", () => {
    for (const r of REPORT_REASONS) {
      expect(r.label.trim().length, `${r.id}의 라벨이 비었다`).toBeGreaterThan(0);
      expect(r.hint.trim().length, `${r.id}의 설명이 비었다`).toBeGreaterThan(0);
    }
  });

  it("id가 중복되지 않는다", () => {
    const ids = REPORT_REASONS.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("isReportReason은 목록에 있는 것만 통과시킨다", () => {
    expect(isReportReason("spam")).toBe(true);
    expect(isReportReason("other")).toBe(true);
    expect(isReportReason("스팸")).toBe(false);
    expect(isReportReason("")).toBe(false);
    expect(isReportReason("SPAM")).toBe(false);
  });
});

describe("validateReportDraft", () => {
  it("사유를 안 고르면 막는다", () => {
    expect(validateReportDraft({ reason: null, note: "" })).toBe("reason_missing");
  });

  it("모르는 사유는 막는다", () => {
    expect(validateReportDraft({ reason: "nonsense", note: "" })).toBe("reason_unknown");
  });

  it("사유만 고르면 설명 없이도 보낼 수 있다", () => {
    expect(validateReportDraft({ reason: "spam", note: "" })).toBeNull();
    expect(validateReportDraft({ reason: "harassment", note: "   " })).toBeNull();
  });

  // '그 밖의 문제'는 라벨이 아무것도 말해 주지 않는다. 설명 없이 받으면
  // /admin에 사유가 other 하나만 남은 신고가 쌓이고, 그걸로는 판단을 못 한다.
  it("'그 밖의 문제'는 설명을 요구한다", () => {
    expect(validateReportDraft({ reason: "other", note: "" })).toBe("note_required");
    expect(validateReportDraft({ reason: "other", note: "   " })).toBe("note_required");
    expect(validateReportDraft({ reason: "other", note: "이런 일이 있었어요" })).toBeNull();
  });

  it("설명이 제한을 넘으면 막는다 — 경계에서 정확하다", () => {
    const exact = "가".repeat(REPORT_NOTE_MAX);
    expect(validateReportDraft({ reason: "spam", note: exact })).toBeNull();
    expect(validateReportDraft({ reason: "spam", note: `${exact}가` })).toBe("note_too_long");
  });

  // 앞뒤 공백은 서버가 trim해서 저장한다(0089의 nullif(trim(...))). 화면도 같은
  // 기준으로 세야 "500자까지"라고 해놓고 499자에서 막히는 일이 없다.
  it("길이는 trim한 뒤로 센다", () => {
    const padded = `   ${"가".repeat(REPORT_NOTE_MAX)}   `;
    expect(validateReportDraft({ reason: "spam", note: padded })).toBeNull();
  });

  it("모든 문제에 사람이 읽을 문구가 있다", () => {
    const problems = [
      "reason_missing",
      "reason_unknown",
      "note_too_long",
      "note_required",
    ] as const;
    for (const p of problems) {
      expect(reportDraftMessage(p).trim().length, `${p}의 문구가 비었다`).toBeGreaterThan(0);
    }
  });
});

describe("blockConfirmCopy", () => {
  it("닉네임을 문구에 넣는다", () => {
    expect(blockConfirmCopy("스칼레또").title).toContain("스칼레또");
  });

  // 이 세 가지가 이 기능의 성질이고, 사용자가 누르기 전에 알아야 하는 전부다.
  // 문구에서 빠지면 "차단하면 크루가 끊기나?"를 눌러 보고 알게 된다.
  it("무엇이 일어나는지 세 가지를 모두 말한다", () => {
    const { body } = blockConfirmCopy("아무개");
    expect(body, "게시물이 안 보인다는 말이 없다").toMatch(/게시물|보이지 않/);
    expect(body, "상대가 모른다는 말이 없다").toMatch(/알려지지 않/);
    expect(body, "되돌릴 수 있다는 말이 없다").toMatch(/풀면|돌아와/);
  });
});
