import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MemberProfileBody, MemberProfileSheet } from "./member-profile-sheet";
import type { CrewMemberProfile } from "@/lib/progression";
import type { BadgeMeta } from "@/lib/domain/badges";

const CATALOG: BadgeMeta[] = [
  { key: "record_beaten_1", emoji: "🏅", name: "어제의 나를 이겼개",
    description: "기록 1회 갱신", tier: "bronze", rarity: "common",
    metricKey: "record_beaten", threshold: 1, pointReward: 300,
    repeatable: false, repeatStep: null, sortOrder: 601 },
  { key: "record_beaten_5", emoji: "💪", name: "다섯 번 넘었개",
    description: "기록 5회 갱신", tier: "bronze", rarity: "rare",
    metricKey: "record_beaten", threshold: 5, pointReward: 300,
    repeatable: false, repeatStep: null, sortOrder: 602 },
  { key: "record_beaten_10", emoji: "🔥", name: "기록이 무섭개",
    description: "기록 10회 갱신", tier: "silver", rarity: "epic",
    metricKey: "record_beaten", threshold: 10, pointReward: 800,
    repeatable: false, repeatStep: null, sortOrder: 603 },
];

function profile(over: Partial<CrewMemberProfile> = {}): CrewMemberProfile {
  return {
    totalXp: 7220,
    currentLevel: 17,
    currentStage: 4,
    stageName: "물고가개",
    characterPath: "/characters/char-4.png",
    nextLevelRequiredXp: 7600,
    xpToNextLevel: 380,
    levelProgressPercent: 52.5,
    badges: [
      { badgeKey: "record_beaten_1", periodKey: "lifetime",
        earnedAt: new Date("2026-07-20T10:00:00+09:00") },
      { badgeKey: "record_beaten_5", periodKey: "lifetime",
        earnedAt: new Date("2026-07-24T10:00:00+09:00") },
    ],
    ...over,
  };
}

describe("MemberProfileBody — 레벨", () => {
  it("단계·레벨·누적 XP·진행률·남은 XP를 표시한다", () => {
    const html = renderToStaticMarkup(
      <MemberProfileBody profile={profile()} catalog={CATALOG} />,
    );
    expect(html).toContain("물고가개 Lv.17");
    expect(html).toContain("누적 7,220 XP");
    expect(html).toContain('aria-valuenow="53"'); // 52.5 반올림
    expect(html).toContain("다음 레벨까지 380 XP");
  });

  it("최고 레벨이면 남은 XP 대신 달성 문구", () => {
    const html = renderToStaticMarkup(
      <MemberProfileBody
        profile={profile({
          currentLevel: 35,
          nextLevelRequiredXp: null,
          xpToNextLevel: 0,
          levelProgressPercent: 100,
        })}
        catalog={CATALOG}
      />,
    );
    expect(html).toContain("최고 레벨");
    expect(html).not.toContain("다음 레벨까지");
  });
});

describe("MemberProfileBody — 배지 (보유만 + 의미·보상)", () => {
  it("보유 배지만 이름·의미·보상과 함께 보여준다", () => {
    const html = renderToStaticMarkup(
      <MemberProfileBody profile={profile()} catalog={CATALOG} />,
    );
    expect(html).toContain("어제의 나를 이겼개");
    expect(html).toContain("기록 1회 갱신"); // 의미(설명)
    expect(html).toContain("다섯 번 넘었개");
    expect(html).toContain("기록 5회 갱신");
    expect(html).toContain("+300 P"); // 획득 보상
    expect(html).toContain("2 / 3");
  });

  it("미획득 배지와 자물쇠는 보여주지 않는다", () => {
    const html = renderToStaticMarkup(
      <MemberProfileBody profile={profile()} catalog={CATALOG} />,
    );
    expect(html).not.toContain("기록이 무섭개"); // 미획득은 숨김
    expect(html).not.toContain("🔒");
  });

  it("배지가 하나도 없으면 안내 문구를 보여준다", () => {
    const html = renderToStaticMarkup(
      <MemberProfileBody profile={profile({ badges: [] })} catalog={CATALOG} />,
    );
    expect(html).toContain("아직 획득한 배지가 없어요");
    expect(html).toContain("0 / 3");
  });

  it("카탈로그에 없는 배지 키는 표시하지 않는다", () => {
    const html = renderToStaticMarkup(
      <MemberProfileBody
        profile={profile({
          badges: [
            { badgeKey: "future_badge_99", periodKey: "lifetime",
              earnedAt: new Date("2026-07-26") },
          ],
        })}
        catalog={CATALOG}
      />,
    );
    expect(html).not.toContain("future_badge_99");
    expect(html).toContain("0 / 3");
  });
});

describe("MemberProfileSheet", () => {
  it("닉네임·스트릭·다이얼로그 역할·닫기 버튼을 렌더한다", () => {
    const html = renderToStaticMarkup(
      <MemberProfileSheet
        userId="friend-1"
        nickname="낭만송곳니"
        avatarUrl="🐶"
        streak={12}
        onClose={() => {}}
      />,
    );
    expect(html).toContain("낭만송곳니");
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-labelledby="member-profile-title"');
    expect(html).toContain("🔥12");
    expect(html).toContain("닫기");
  });

  it("스트릭이 없으면 불꽃을 표시하지 않는다", () => {
    const html = renderToStaticMarkup(
      <MemberProfileSheet
        userId="friend-1"
        nickname="낭만송곳니"
        avatarUrl={null}
        onClose={() => {}}
      />,
    );
    expect(html).not.toContain("🔥");
    expect(html).toContain("👤"); // 아바타 없으면 기본 얼굴
  });
});
