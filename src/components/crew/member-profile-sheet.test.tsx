import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MemberProfileBody, MemberProfileSheet } from "./member-profile-sheet";
import type { CrewMemberProfile } from "@/lib/progression";

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
      {
        badgeKey: "record_beaten_1",
        earnedAt: new Date("2026-07-20T10:00:00+09:00"),
      },
      {
        badgeKey: "record_beaten_5",
        earnedAt: new Date("2026-07-24T10:00:00+09:00"),
      },
    ],
    ...over,
  };
}

describe("MemberProfileBody — 레벨", () => {
  it("단계·레벨·누적 XP·진행률·남은 XP를 표시한다", () => {
    const html = renderToStaticMarkup(<MemberProfileBody profile={profile()} />);
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
      />,
    );
    expect(html).toContain("최고 레벨");
    expect(html).not.toContain("다음 레벨까지");
  });
});

describe("MemberProfileBody — 배지", () => {
  it("획득 배지는 이모지와 이름, 미획득은 자물쇠로 표시한다", () => {
    const html = renderToStaticMarkup(<MemberProfileBody profile={profile()} />);
    expect(html).toContain("첫 기록 갱신");
    expect(html).toContain("기록 갱신 5회");
    expect(html).toContain("기록 갱신 10회"); // 미획득도 진열한다
    expect(html).toContain("🔒");
    expect(html).toContain("2 / 3");
  });

  it("배지가 하나도 없으면 안내 문구를 보여준다", () => {
    const html = renderToStaticMarkup(
      <MemberProfileBody profile={profile({ badges: [] })} />,
    );
    expect(html).toContain("아직 획득한 배지가 없어요");
    expect(html).toContain("0 / 3");
  });

  it("카탈로그에 없는 배지 키는 표시하지 않는다", () => {
    const html = renderToStaticMarkup(
      <MemberProfileBody
        profile={profile({
          badges: [
            { badgeKey: "future_badge_99", earnedAt: new Date("2026-07-26") },
          ],
        })}
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
