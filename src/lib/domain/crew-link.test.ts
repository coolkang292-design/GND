import { describe, expect, it } from "vitest";
import {
  crewActionButton,
  isSearchable,
  normalizeNickname,
  orderedPair,
  type CrewRelation,
} from "./crew-link";

describe("normalizeNickname", () => {
  it("앞뒤 공백을 없앤다", () => {
    expect(normalizeNickname("  스칼레또 ")).toBe("스칼레또");
  });
  it("대소문자를 낮춘다 — 서버 비교와 같은 규칙이어야 한다", () => {
    expect(normalizeNickname("GnD")).toBe("gnd");
  });
});

describe("isSearchable", () => {
  it("공백만 있으면 검색하지 않는다", () => {
    expect(isSearchable("   ")).toBe(false);
  });
  it("한 글자여도 정확 일치 검색이므로 허용한다", () => {
    expect(isSearchable("가")).toBe(true);
  });
});

describe("orderedPair", () => {
  it("순서를 바꿔 넣어도 같은 쌍이 나온다", () => {
    const a = "11111111-1111-1111-1111-111111111111";
    const b = "22222222-2222-2222-2222-222222222222";
    expect(orderedPair(a, b)).toEqual(orderedPair(b, a));
  });
  it("사전순으로 정렬한다 — DB의 user_a < user_b와 같은 규칙", () => {
    const a = "11111111-1111-1111-1111-111111111111";
    const b = "22222222-2222-2222-2222-222222222222";
    expect(orderedPair(b, a)).toEqual([a, b]);
  });
});

describe("crewActionButton", () => {
  const cases: [CrewRelation, string, boolean][] = [
    ["none", "크루 요청", false],
    ["request_received", "수락하기", false],
    ["request_sent", "요청됨", true],
    ["crew", "이미 크루", true],
    ["self", "나예요", true],
  ];
  it.each(cases)("%s → %s (disabled=%s)", (relation, label, disabled) => {
    const button = crewActionButton(relation);
    expect(button.label).toBe(label);
    expect(button.disabled).toBe(disabled);
  });

  it("none만 send, request_received만 accept를 낸다", () => {
    expect(crewActionButton("none").action).toBe("send");
    expect(crewActionButton("request_received").action).toBe("accept");
    expect(crewActionButton("crew").action).toBe("none");
  });
});
