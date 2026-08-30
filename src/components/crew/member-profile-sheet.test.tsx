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
    // 0081 — 이력·누적. 기본값은 "가입일만 있고 나머지는 0"이다.
    joinedAt: new Date("2026-07-19T10:00:00+09:00"),
    // 0085 — 소개·SNS. 기본은 셋 다 없음
    bio: null,
    instagramUrl: null,
    youtubeUrl: null,
    levelUps: [],
    workoutCount: 0,
    totalMinutes: 0,
    workoutDays: 0,
    distanceMeters: 0,
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

/**
 * 2026-08-19 사용자 요청 — *"언제 가입했고 언제 어떤 배지를 받았으며 언제
 * 레벨업을 했는지 … 누적으로 몇 시간·며칠·몇 km"*
 */
describe("MemberProfileBody — 이력·누적 (0081)", () => {
  it("누적 성과는 RPC 값으로 그린다 — stats prop이 없어도 뜬다", () => {
    const html = renderToStaticMarkup(
      <MemberProfileBody
        profile={profile({
          workoutCount: 23,
          workoutDays: 22,
          totalMinutes: 1873,
          distanceMeters: 110490,
        })}
        catalog={CATALOG}
      />,
    );
    // ⚠️ 옛 판은 `stats`(홈에서만 넘김)가 있어야 성과 블록을 그렸다 —
    //    그래서 피드·크루에서 열면 성과가 통째로 안 보였다.
    expect(html).toContain("누적 성과");
    expect(html).toContain("23회");
    expect(html).toContain("22일");
    expect(html).toContain("31시간 13분");
    expect(html).toContain("110.5km");
  });

  it("거리가 0이면 거리 칸을 안 그린다", () => {
    const html = renderToStaticMarkup(
      <MemberProfileBody profile={profile({ distanceMeters: 0 })} catalog={CATALOG} />,
    );
    expect(html).not.toContain("거리");
  });

  it("가입·레벨업·배지를 최신순 이력으로 그린다", () => {
    const html = renderToStaticMarkup(
      <MemberProfileBody
        profile={profile({
          joinedAt: new Date("2026-07-19T10:00:00+09:00"),
          levelUps: [{ level: 17, at: new Date("2026-08-10T10:00:00+09:00") }],
        })}
        catalog={CATALOG}
      />,
    );
    expect(html).toContain("이력");
    expect(html).toContain("Lv.17 달성");
    expect(html).toContain("GND 시작");
    expect(html).toContain("어제의 나를 이겼개"); // 배지 이름
    // 최신(레벨업 8/10)이 가입(7/19)보다 앞에 온다
    expect(html.indexOf("Lv.17 달성")).toBeLessThan(html.indexOf("GND 시작"));
  });

  it("이력이 하나도 없으면 이력 블록을 안 그린다", () => {
    const html = renderToStaticMarkup(
      <MemberProfileBody
        profile={profile({ joinedAt: null, levelUps: [], badges: [] })}
        catalog={CATALOG}
      />,
    );
    expect(html).not.toContain(">이력<");
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

/**
 * 소개 · SNS (0085).
 *
 * ⚠️ `MemberProfileSheet` **하나만** 고쳐서 피드·크루·챌린지 전 진입점에
 *    동시에 반영된다. 진입점마다 따로 그리면 한 곳만 고쳐지는 날이 온다.
 */
describe("MemberProfileBody — 소개·SNS", () => {
  it("소개가 있으면 그린다", () => {
    const html = renderToStaticMarkup(
      <MemberProfileBody
        profile={profile({ bio: "퇴근 후 주 4회 웨이트 중입니다." })}
        catalog={CATALOG}
      />,
    );
    expect(html).toContain("퇴근 후 주 4회 웨이트 중입니다.");
  });

  it("소개도 링크도 없으면 블록 자체를 안 그린다", () => {
    const html = renderToStaticMarkup(
      <MemberProfileBody profile={profile()} catalog={CATALOG} />,
    );
    expect(html).not.toContain("📷");
    expect(html).not.toContain("▶️");
  });

  it("링크가 있으면 핸들로 보여준다", () => {
    const html = renderToStaticMarkup(
      <MemberProfileBody
        profile={profile({
          instagramUrl: "https://instagram.com/gnd_user",
          youtubeUrl: "https://youtube.com/@gnd",
        })}
        catalog={CATALOG}
      />,
    );
    expect(html).toContain("@gnd_user");
    expect(html).toContain("@gnd");
  });

  /**
   * ⚠️⚠️ 회귀 방어. `noopener`가 없으면 열린 페이지가 `window.opener`로 이 창을
   * 조종할 수 있다. 도메인 검증을 통과한 주소여도 **별개 방어**다 — 다른
   * 클라이언트가 넣은 값이 DB에 남아 있을 수 있다.
   */
  it("외부 링크는 새 탭 + noopener noreferrer", () => {
    const html = renderToStaticMarkup(
      <MemberProfileBody
        profile={profile({ instagramUrl: "https://instagram.com/gnd_user" })}
        catalog={CATALOG}
      />,
    );
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("한쪽만 있으면 그것만 그린다", () => {
    const html = renderToStaticMarkup(
      <MemberProfileBody
        profile={profile({ youtubeUrl: "https://youtube.com/@only" })}
        catalog={CATALOG}
      />,
    );
    expect(html).toContain("@only");
    expect(html).not.toContain("📷");
  });
});
