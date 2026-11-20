import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProgressEvent } from "@/lib/domain/progress-event";

// 그 사람의 외형(남/여)은 캐릭터 얼굴 경로로 안다 — 테스트에서 값을 바꿔 넣는다
const face = vi.hoisted(() => ({ src: null as string | null }));
vi.mock("@/lib/character-faces", () => ({ useCharacterFace: () => face.src }));

import { ProgressBadge } from "./progress-badge";

const evolution: ProgressEvent = {
  kind: "evolution", level: 16, prevLevel: 15, stage: 4, stageName: "꾸준러", prevStage: 3, prevStageName: "시동러",
};
const levelUp: ProgressEvent = {
  kind: "level_up", level: 5, prevLevel: 4, stage: 2, stageName: "꿈틀러", prevStage: 2, prevStageName: "꿈틀러",
};
// next/image가 그림 주소를 %2F로 감싸서 내보낸다 — 슬래시만 되돌려 경로를 읽는다 (HTML 전체를 해독하면 `%` 클래스에서 깨진다)
const html = (event: ProgressEvent) =>
  renderToStaticMarkup(<ProgressBadge event={event} userId="u1" />).replace(/%2F/gi, "/");

beforeEach(() => {
  face.src = null;
});

describe("ProgressBadge — 시안의 '캐릭터 + 꾸준러로 진화 / Lv.16 달성'", () => {
  it("진화: 단계 이름 + '로 진화' + 'Lv.16 달성'", () => {
    const h = html(evolution);
    expect(h).toContain('data-testid="progress-badge"');
    expect(h).toContain("꾸준러");
    expect(h).toContain("로 진화");
    expect(h).toContain("Lv.16 달성");
  });

  it("레벨업: 'Lv.5 레벨업' + 'Lv.4 → Lv.5'", () => {
    const h = html(levelUp);
    expect(h).toContain("Lv.5");
    expect(h).toContain("레벨업");
    expect(h).toContain("Lv.4 → Lv.5");
    expect(h).not.toContain("진화"); // 레벨업에 '진화'를 말하지 않는다 (부정 확인)
  });

  it("캐릭터 그림은 오른 뒤 단계(4)의 그림이다 — 남성 기본 경로", () => {
    const h = html(evolution);
    expect(h).toContain("/characters/char-4.png");
    expect(h).not.toContain("/characters/female/");
  });

  it("여성 캐릭터인 사람은 여성 그림이다 — 외형을 얼굴 경로로 안다", () => {
    face.src = "/characters/female/avatar/evolution_avatar_04.webp";
    expect(html(evolution)).toContain("/characters/female/char-4.png");
  });

  it("레벨업도 그 단계의 그림을 쓴다 (stage 2)", () => {
    expect(html(levelUp)).toContain("/characters/char-2.png");
  });

  it("사진 위에 겹치는 모양이 아니다 — 본문 줄이다 (사용자 지시 2026-11-20 '사진에 표시말고 사진 없는 카드처럼')", () => {
    const h = html(evolution);
    expect(h).not.toContain("absolute");
    expect(h).not.toContain("pointer-events-none");
    expect(h).not.toContain("backdrop-blur");
    expect(h).not.toContain("overlay");
  });
});
