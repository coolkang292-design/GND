import { describe, expect, it } from "vitest";

import { blockConfirmCopy } from "./moderation";

describe("blockConfirmCopy", () => {
  it("닉네임을 문구에 넣는다", () => {
    expect(blockConfirmCopy("스칼레또").title).toContain("스칼레또");
  });

  /**
   * 이 세 가지가 차단의 성질이고, 사용자가 누르기 전에 알아야 하는 전부다.
   * 문구에서 빠지면 "차단하면 크루가 끊기나?"를 눌러 보고 알게 된다 —
   * 되돌릴 수 있다는 걸 모르면 무서워서 아무도 안 쓰고, 그러면 정작 불편한
   * 사람을 계속 본다.
   */
  it("무엇이 일어나는지 세 가지를 모두 말한다", () => {
    const { body } = blockConfirmCopy("아무개");
    expect(body, "게시물이 안 보인다는 말이 없다").toMatch(/게시물|보이지 않/);
    expect(body, "상대가 모른다는 말이 없다").toMatch(/알려지지 않/);
    expect(body, "되돌릴 수 있다는 말이 없다").toMatch(/풀면|돌아와/);
  });

  it("확인 버튼 문구가 비어 있지 않다", () => {
    expect(blockConfirmCopy("아무개").confirm.trim().length).toBeGreaterThan(0);
  });
});
