import { describe, expect, it } from "vitest";
import { bugReminderDedupeKey, bugReminderText } from "./bug-reminder";

describe("dedupe 키 — 하루 1건, 사람마다 따로", () => {
  // notifications의 dedupe_key 유니크 인덱스는 **컬럼 하나뿐(전역 유니크)**이다.
  // uid를 빼면 감시자가 둘 이상일 때 첫 사람만 받고 나머지는 조용히 삼켜진다.
  const A = "4fa751c8-8ee6-4e74-bcac-68f963ff032f";
  const B = "2d195bec-6a36-4ceb-b914-f934436a9d22";
  const NOON_KST = new Date("2026-07-31T03:00:00Z");

  it("사람이 다르면 키가 다르다", () => {
    expect(bugReminderDedupeKey(A, NOON_KST)).not.toBe(
      bugReminderDedupeKey(B, NOON_KST),
    );
  });

  it("같은 사람·같은 날이면 키가 같다 — 하루에 두 번 안 보낸다", () => {
    const morning = new Date("2026-07-31T00:10:00Z"); // KST 09:10
    const evening = new Date("2026-07-31T13:00:00Z"); // KST 22:00
    expect(bugReminderDedupeKey(A, morning)).toBe(bugReminderDedupeKey(A, evening));
  });

  it("날이 바뀌면 키가 바뀐다 — 다음 날 다시 알린다", () => {
    const d31 = new Date("2026-07-31T03:00:00Z");
    const d1 = new Date("2026-08-01T03:00:00Z");
    expect(bugReminderDedupeKey(A, d31)).not.toBe(bugReminderDedupeKey(A, d1));
  });

  it("날짜 경계는 UTC가 아니라 KST다", () => {
    // UTC 2026-07-31 15:30 = KST 2026-08-01 00:30. UTC로 자르면 하루가 밀려
    // 09시 브리핑과 다른 날짜를 쓰게 되고, 같은 날 두 번 나가거나 하루를 건너뛴다.
    const beforeMidnightKst = new Date("2026-07-31T14:30:00Z"); // KST 7/31 23:30
    const afterMidnightKst = new Date("2026-07-31T15:30:00Z"); // KST 8/1 00:30
    expect(bugReminderDedupeKey(A, beforeMidnightKst)).toContain("2026-07-31");
    expect(bugReminderDedupeKey(A, afterMidnightKst)).toContain("2026-08-01");
  });
});

describe("문구", () => {
  it("건수를 제목에 넣는다", () => {
    expect(bugReminderText(3).title).toContain("3건");
  });

  it("1건일 때 복수 표현을 쓰지 않는다", () => {
    expect(bugReminderText(1).body).toContain("1건");
  });

  it("본문이 비어 있지 않다 — 푸시 본문이 빈칸이면 알림이 무의미하다", () => {
    for (const n of [1, 2, 17]) {
      expect(bugReminderText(n).body.length).toBeGreaterThan(5);
      expect(bugReminderText(n).title.length).toBeGreaterThan(3);
    }
  });
});
