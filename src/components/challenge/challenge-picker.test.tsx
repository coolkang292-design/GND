import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChallengePicker } from "./challenge-picker";
import type { MyChallenge } from "@/lib/challenge";

// 선택기는 id·name·status·myStatus만 읽는다. 나머지 Challenge 필드를 다 채우면
// 테스트가 무엇을 검증하는지 흐려지므로 필요한 것만 만들고 한 번 캐스트한다.
const ch = (
  id: string,
  name: string,
  status: "setup" | "active" | "ended",
  myStatus: MyChallenge["myStatus"] = "joined",
) =>
  ({ id, name, status, myStatus, end_date: "2026-09-30" }) as unknown as MyChallenge;

const html = (challenges: MyChallenge[], selectedId: string | null) =>
  renderToStaticMarkup(
    <ChallengePicker
      challenges={challenges}
      selectedId={selectedId}
      onSelect={() => {}}
    />,
  );

describe("ChallengePicker", () => {
  it("챌린지가 2개면 둘 다 보인다", () => {
    const out = html(
      [ch("a", "7월 GND", "active"), ch("b", "8월 벌크업", "setup")],
      "a",
    );
    expect(out).toContain("7월 GND");
    expect(out).toContain("8월 벌크업");
  });

  it("상태 라벨을 한글로 보여준다", () => {
    const out = html(
      [ch("a", "7월 GND", "active"), ch("b", "8월 벌크업", "setup")],
      "a",
    );
    expect(out).toContain("진행 중");
    expect(out).toContain("준비 중");
  });

  it("1개면 아무것도 렌더하지 않는다 (고를 것이 없다)", () => {
    expect(html([ch("a", "7월 GND", "active")], "a")).toBe("");
  });

  it("0개여도 터지지 않는다", () => {
    expect(html([], null)).toBe("");
  });

  it("초대받은 챌린지는 상태 대신 초대 표시가 붙는다", () => {
    const out = html(
      [ch("a", "7월 GND", "active"), ch("b", "초대된 방", "setup", "invited")],
      "a",
    );
    expect(out).toContain("초대받음");
    // 초대 상태가 "준비 중"을 덮어써야 한다 — 둘 다 뜨면 사용자가 헷갈린다
    expect(out).not.toContain("준비 중");
  });

  it("선택된 챌린지 하나에만 aria-current가 붙는다", () => {
    const out = html(
      [ch("a", "7월 GND", "active"), ch("b", "8월 벌크업", "setup")],
      "b",
    );
    expect(out.match(/aria-current="true"/g)?.length).toBe(1);
    // 선택 표시가 "8월 벌크업" chip 안에 있어야 한다 (앞 chip이 아니라)
    const idx = out.indexOf('aria-current="true"');
    expect(out.slice(idx).indexOf("8월 벌크업")).toBeLessThan(
      out.slice(idx).indexOf("7월 GND") === -1
        ? Number.MAX_SAFE_INTEGER
        : out.slice(idx).indexOf("7월 GND"),
    );
  });

  it("선택이 목록에 없으면 아무것도 선택 표시되지 않는다", () => {
    const out = html(
      [ch("a", "7월 GND", "active"), ch("b", "8월 벌크업", "setup")],
      "없는id",
    );
    expect(out).not.toContain('aria-current="true"');
  });
});
