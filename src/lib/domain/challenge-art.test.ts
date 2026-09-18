import { describe, expect, it } from "vitest";
import {
  CARD_ART,
  DETAIL_ART,
  cardArtFor,
  detailArtFor,
} from "./challenge-art";

describe("cardArtFor — 사진 없는 챌린지의 카드 그림", () => {
  it("⚠️ 사용자가 넣은 사진이 언제나 이긴다", () => {
    expect(cardArtFor("c1", "https://cdn/my.jpg")).toBe("https://cdn/my.jpg");
  });

  it("사진이 없으면 대체 그림을 준다", () => {
    expect(CARD_ART).toContain(cardArtFor("c1"));
    expect(CARD_ART).toContain(cardArtFor("c1", null));
    expect(CARD_ART).toContain(cardArtFor("c1", ""));
  });

  it("⚠️ 같은 챌린지는 **언제나 같은 그림** — 랜덤이면 렌더마다 바뀐다", () => {
    const first = cardArtFor("5dcdbfef-8610-416d-8a17-e2ee4a85c7fa");
    for (let i = 0; i < 20; i++) {
      expect(cardArtFor("5dcdbfef-8610-416d-8a17-e2ee4a85c7fa")).toBe(first);
    }
  });

  it("방마다 고루 갈린다 — 한 장만 계속 나오지 않는다", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 60; i++) seen.add(cardArtFor(`challenge-${i}`));
    expect(seen.size).toBe(CARD_ART.length);
  });

  it("빈 id여도 죽지 않는다", () => {
    expect(CARD_ART).toContain(cardArtFor(""));
  });
});

describe("detailArtFor — 상세 히어로", () => {
  it("사용자 사진이 이긴다", () => {
    expect(detailArtFor("https://cdn/my.jpg")).toBe("https://cdn/my.jpg");
  });

  it("없으면 16:9 대체 그림", () => {
    expect(detailArtFor(null)).toBe(DETAIL_ART);
    expect(detailArtFor()).toBe(DETAIL_ART);
  });
});
