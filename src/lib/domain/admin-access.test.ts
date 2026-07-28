import { describe, expect, it } from "vitest";
import {
  constantTimeEqual,
  hasAdminAccess,
  isAdminUser,
  isValidAccessKey,
  parseAdminIds,
} from "./admin-access";

describe("parseAdminIds", () => {
  it("쉼표 구분 uuid를 배열로 자른다", () => {
    expect(parseAdminIds("a-1,b-2")).toEqual(["a-1", "b-2"]);
  });

  it("공백을 제거한다", () => {
    expect(parseAdminIds(" a-1 , b-2 ")).toEqual(["a-1", "b-2"]);
  });

  it("빈 항목을 버린다", () => {
    expect(parseAdminIds("a-1,,b-2,")).toEqual(["a-1", "b-2"]);
  });

  it("undefined면 빈 배열", () => {
    expect(parseAdminIds(undefined)).toEqual([]);
  });

  it("빈 문자열이면 빈 배열", () => {
    expect(parseAdminIds("")).toEqual([]);
  });

  it("공백만 있으면 빈 배열", () => {
    expect(parseAdminIds("  ,  ")).toEqual([]);
  });
});

describe("isAdminUser", () => {
  it("허용목록에 있으면 true", () => {
    expect(isAdminUser("a-1", ["a-1", "b-2"])).toBe(true);
  });

  it("허용목록에 없으면 false", () => {
    expect(isAdminUser("c-3", ["a-1", "b-2"])).toBe(false);
  });

  // fail-closed: 환경변수 미설정이 전면 개방으로 이어지면 안 된다
  it("허용목록이 비면 누구든 false", () => {
    expect(isAdminUser("a-1", [])).toBe(false);
  });

  it("userId가 null이면 false", () => {
    expect(isAdminUser(null, ["a-1"])).toBe(false);
  });

  it("userId가 빈 문자열이면 false", () => {
    expect(isAdminUser("", ["a-1", ""])).toBe(false);
  });

  // prefix/부분 일치로 뚫리면 안 된다
  it("접두사만 같으면 false", () => {
    expect(isAdminUser("a-1", ["a-12"])).toBe(false);
    expect(isAdminUser("a-12", ["a-1"])).toBe(false);
  });

  it("대소문자가 다르면 false", () => {
    expect(isAdminUser("A-1", ["a-1"])).toBe(false);
  });
});

describe("constantTimeEqual", () => {
  it("같으면 true", () => {
    expect(constantTimeEqual("abc123", "abc123")).toBe(true);
  });

  it("다르면 false", () => {
    expect(constantTimeEqual("abc123", "abc124")).toBe(false);
  });

  it("길이가 다르면 false", () => {
    expect(constantTimeEqual("abc", "abcd")).toBe(false);
  });

  it("빈 문자열끼리는 true (판정은 상위에서 막는다)", () => {
    expect(constantTimeEqual("", "")).toBe(true);
  });
});

describe("isValidAccessKey", () => {
  it("키가 맞으면 true", () => {
    expect(isValidAccessKey("s3cret", "s3cret")).toBe(true);
  });

  it("키가 다르면 false", () => {
    expect(isValidAccessKey("wrong", "s3cret")).toBe(false);
  });

  // 서버에 키가 없으면 열리는 경로를 만들지 않는다
  it("서버 키가 없으면 무엇을 보내도 false", () => {
    expect(isValidAccessKey("anything", undefined)).toBe(false);
    expect(isValidAccessKey("anything", "")).toBe(false);
    expect(isValidAccessKey("", "")).toBe(false);
  });

  it("보낸 값이 없으면 false", () => {
    expect(isValidAccessKey(null, "s3cret")).toBe(false);
    expect(isValidAccessKey(undefined, "s3cret")).toBe(false);
    expect(isValidAccessKey("", "s3cret")).toBe(false);
  });
});

describe("hasAdminAccess", () => {
  it("UID 허용목록에 있으면 통과", () => {
    expect(
      hasAdminAccess({
        userId: "u1",
        adminIds: ["u1"],
        cookieValue: null,
        accessKey: "s3cret",
      }),
    ).toBe(true);
  });

  it("암호키 쿠키가 맞으면 UID가 목록에 없어도 통과", () => {
    expect(
      hasAdminAccess({
        userId: "stranger",
        adminIds: ["u1"],
        cookieValue: "s3cret",
        accessKey: "s3cret",
      }),
    ).toBe(true);
  });

  it("세션이 아예 없어도 암호키만 맞으면 통과", () => {
    expect(
      hasAdminAccess({
        userId: null,
        adminIds: [],
        cookieValue: "s3cret",
        accessKey: "s3cret",
      }),
    ).toBe(true);
  });

  it("둘 다 아니면 차단", () => {
    expect(
      hasAdminAccess({
        userId: "stranger",
        adminIds: ["u1"],
        cookieValue: "wrong",
        accessKey: "s3cret",
      }),
    ).toBe(false);
  });

  // 설정이 전부 비었을 때 열리면 최악이다
  it("허용목록도 키도 없으면 차단(fail-closed)", () => {
    expect(
      hasAdminAccess({
        userId: "u1",
        adminIds: [],
        cookieValue: "anything",
        accessKey: undefined,
      }),
    ).toBe(false);
  });
});
