import { describe, expect, it } from "vitest";
import { creatorReturnPath } from "./creator-return";

describe("login return path for Creator Studio", () => {
  it("accepts only Creator Studio paths", () => {
    expect(creatorReturnPath("/challenge/creator")).toBe("/challenge/creator");
    expect(creatorReturnPath("/challenge/creator/df294495-f955-4307-a573-b790e1f08e02"))
      .toBe("/challenge/creator/df294495-f955-4307-a573-b790e1f08e02");
    expect(creatorReturnPath("/challenge/creator/abc/members/def")).toBe("/challenge/creator/abc/members/def");
  });

  // 로그인 뒤 아무 주소로나 보내면 오픈 리다이렉트가 된다.
  it("rejects anything that could leave the studio", () => {
    for (const bad of [
      null,
      "",
      "https://evil.example/challenge/creator",
      "//evil.example/challenge/creator",
      "/challenge/creator/../../account",
      "/challenge/creator/a?x=1",
      "/challenge/creatorx",
      "/record",
      "/challenge/creator/a/b/c/d",
    ]) {
      expect(creatorReturnPath(bad)).toBeNull();
    }
  });
});
