import { describe, expect, it } from "vitest";
import { isAdminUser, parseAdminIds } from "./admin-access";

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
