import { describe, expect, it } from "vitest";
import {
  FIXTURE_EMAIL_DOMAIN,
  isTestAccount,
  membershipCounts,
  parseExcludedIds,
  testAccountReason,
  testUserIds,
} from "./analytics-accounts";

const real = {
  userId: "u-real",
  nickname: "오뎅끼데스까",
  email: "atty2@naver.com",
};

describe("isTestAccount", () => {
  it("픽스처 이메일 도메인이면 테스트 계정이다", () => {
    expect(
      isTestAccount(
        { userId: "a", nickname: "dev-테스터A", email: `dev-fixture-a${FIXTURE_EMAIL_DOMAIN}` },
        [],
      ),
    ).toBe(true);
  });

  it("닉네임이 test면 테스트 계정이다 — 대소문자·공백을 무시한다", () => {
    for (const nickname of ["test", "TEST", " Test "]) {
      expect(isTestAccount({ userId: "a", nickname, email: null }, [])).toBe(true);
    }
  });

  it("닉네임에 test가 들어가기만 한 것은 아니다", () => {
    // "testosterone" 같은 진짜 닉네임을 실사용자에게서 빼앗으면 안 된다
    expect(
      isTestAccount({ userId: "a", nickname: "testosterone", email: null }, []),
    ).toBe(false);
  });

  it("실사용자는 테스트 계정이 아니다", () => {
    expect(isTestAccount(real, [])).toBe(false);
  });

  it("수동 제외 목록에 있으면 규칙과 무관하게 테스트 계정이다", () => {
    expect(isTestAccount(real, ["u-real"])).toBe(true);
  });

  it("이메일 대소문자가 달라도 도메인으로 잡는다", () => {
    expect(
      isTestAccount({ userId: "a", nickname: "x", email: "DEV-FIXTURE-B@GND.LOCAL" }, []),
    ).toBe(true);
  });
});

describe("testAccountReason", () => {
  it("왜 뺐는지를 화면에 적을 수 있게 사유를 낸다", () => {
    expect(
      testAccountReason(
        { userId: "a", nickname: "dev-테스터A", email: `x${FIXTURE_EMAIL_DOMAIN}` },
        [],
      ),
    ).toBe("픽스처 계정");
    expect(testAccountReason({ userId: "a", nickname: "test", email: null }, [])).toBe(
      "테스트 닉네임",
    );
    expect(testAccountReason(real, ["u-real"])).toBe("수동 제외 목록");
    expect(testAccountReason(real, [])).toBeNull();
  });
});

describe("parseExcludedIds", () => {
  it("쉼표로 나누고 공백과 빈 항목을 버린다", () => {
    expect(parseExcludedIds(" a , b ,, c ")).toEqual(["a", "b", "c"]);
  });

  it("설정이 없으면 빈 목록이다 — 규칙만으로 판정한다", () => {
    expect(parseExcludedIds(undefined)).toEqual([]);
    expect(parseExcludedIds("")).toEqual([]);
  });
});

describe("testUserIds", () => {
  it("테스트 계정의 id만 모은다", () => {
    const ids = testUserIds(
      [
        real,
        { userId: "f1", nickname: "dev-테스터A", email: `a${FIXTURE_EMAIL_DOMAIN}` },
        { userId: "t1", nickname: "test", email: null },
      ],
      [],
    );
    expect([...ids].sort()).toEqual(["f1", "t1"]);
    expect(ids.has("u-real")).toBe(false);
  });

  it("계정이 없으면 빈 집합이다", () => {
    expect(testUserIds([], []).size).toBe(0);
  });
});

describe("membershipCounts", () => {
  const NOW = new Date("2026-08-31T00:00:00Z");
  const daysAgo = (n: number) =>
    new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);

  /** 2026-08-31 운영 실측을 그대로 옮긴 축소판 */
  const users = [
    // 영구 + 프로필 + 실사용자 (오래됨)
    { userId: "real-1", isAnonymous: false, createdAt: daysAgo(43) },
    { userId: "real-2", isAnonymous: false, createdAt: daysAgo(42) },
    // 영구 + 프로필 + 실사용자 (22일 전 = 30일 안, 7일 밖)
    { userId: "real-3", isAnonymous: false, createdAt: daysAgo(22) },
    // 영구 + 프로필 + 픽스처
    { userId: "fix-a", isAnonymous: false, createdAt: daysAgo(30) },
    // 익명 + 프로필 (닉네임 test)
    { userId: "anon-with-profile", isAnonymous: true, createdAt: daysAgo(24) },
    // 익명 + 프로필 없음 — 앱을 열기만 한 빈 계정
    { userId: "empty-1", isAnonymous: true, createdAt: daysAgo(3) },
    { userId: "empty-2", isAnonymous: true, createdAt: daysAgo(1) },
  ];
  const profileIds = new Set([
    "real-1",
    "real-2",
    "real-3",
    "fix-a",
    "anon-with-profile",
  ]);
  const testIds = new Set(["fix-a", "anon-with-profile"]);

  it("auth 총수를 회원 수로 읽지 않게 네 층으로 가른다", () => {
    const m = membershipCounts(users, profileIds, testIds, NOW);
    expect(m.authTotal).toBe(7);
    expect(m.authAnonymous).toBe(3);
    expect(m.authPermanent).toBe(4);
    expect(m.profilesTotal).toBe(5);
    expect(m.profilesExcluded).toBe(2);
    // 이 프로젝트가 실제로 알고 싶은 숫자
    expect(m.profilesReal).toBe(3);
  });

  it("각 층은 다음 층보다 크거나 같다 — 뒤집히면 집계가 틀린 것이다", () => {
    const m = membershipCounts(users, profileIds, testIds, NOW);
    expect(m.authTotal).toBeGreaterThanOrEqual(m.authPermanent);
    expect(m.authTotal).toBeGreaterThanOrEqual(m.profilesTotal);
    expect(m.profilesTotal).toBeGreaterThanOrEqual(m.profilesReal);
    expect(m.authAnonymous + m.authPermanent).toBe(m.authTotal);
  });

  it("최근 가입은 영구 계정만 센다 — 익명은 빈 계정이라 섞이면 부풀어 오른다", () => {
    const m = membershipCounts(users, profileIds, testIds, NOW);
    // empty-1(3일), empty-2(1일)는 익명이라 7일 집계에 안 들어간다
    expect(m.permanentSignups7d).toBe(0);
    // real-3(22일) + fix-a(30일 경계 밖) → 22일짜리 하나만
    expect(m.permanentSignups30d).toBe(1);
  });

  it("30일 집계는 7일 집계를 포함한다", () => {
    const recent = [
      { userId: "p-new", isAnonymous: false, createdAt: daysAgo(2) },
      { userId: "p-mid", isAnonymous: false, createdAt: daysAgo(20) },
    ];
    const m = membershipCounts(recent, new Set(), new Set(), NOW);
    expect(m.permanentSignups7d).toBe(1);
    expect(m.permanentSignups30d).toBe(2);
    expect(m.permanentSignups30d).toBeGreaterThanOrEqual(m.permanentSignups7d);
  });

  it("계정이 하나도 없으면 전부 0이다 — 빈 배열에 터지지 않는다", () => {
    const m = membershipCounts([], new Set(), new Set(), NOW);
    expect(m.authTotal).toBe(0);
    expect(m.profilesReal).toBe(0);
    expect(m.permanentSignups30d).toBe(0);
  });

  it("프로필이 없는 영구 계정은 프로필 층에 안 들어간다 (온보딩 이탈)", () => {
    const m = membershipCounts(
      [{ userId: "no-profile", isAnonymous: false, createdAt: daysAgo(1) }],
      new Set(),
      new Set(),
      NOW,
    );
    expect(m.authPermanent).toBe(1);
    expect(m.profilesTotal).toBe(0);
    expect(m.permanentSignups7d).toBe(1);
  });
});
