import { describe, expect, it } from "vitest";
import {
  FIXTURE_EMAIL_DOMAIN,
  isTestAccount,
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
