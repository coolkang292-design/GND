// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CompletionDetails } from "./completion-details";

afterEach(cleanup);

/**
 * 이슈 #16 P0-C (2026-10-19) — 분석·보상·기록 상세는 기본 접힘. 열면 그대로 나온다.
 * 접혀 있어도 받은 보상 한 줄은 보인다(보상 정보 누락 방지).
 */
describe("CompletionDetails", () => {
  it("기본은 접혀 있고 안의 내용을 그리지 않는다", () => {
    render(
      <CompletionDetails summary="+110 XP · +100 P">
        <p>퍼포먼스 리포트</p>
      </CompletionDetails>,
    );
    const toggle = screen.getByRole("button", { name: /내 운동 분석 · 보상 보기/ });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("퍼포먼스 리포트")).toBeNull();
  });

  it("접혀 있어도 받은 보상 요약은 보인다", () => {
    render(
      <CompletionDetails summary="+110 XP · Lv.5 달성">
        <p>x</p>
      </CompletionDetails>,
    );
    expect(screen.getByText("+110 XP · Lv.5 달성")).toBeTruthy();
  });

  it("누르면 펼쳐지고 다시 누르면 접힌다", () => {
    render(
      <CompletionDetails summary={null}>
        <p>퍼포먼스 리포트</p>
      </CompletionDetails>,
    );
    const toggle = screen.getByRole("button", { name: /내 운동 분석 · 보상 보기/ });
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("퍼포먼스 리포트")).toBeTruthy();
    fireEvent.click(toggle);
    expect(screen.queryByText("퍼포먼스 리포트")).toBeNull();
  });

  it("터치 영역이 44px 이상이다", () => {
    render(
      <CompletionDetails summary={null}>
        <p>x</p>
      </CompletionDetails>,
    );
    expect(screen.getByRole("button", { name: /내 운동 분석/ }).className).toMatch(/min-h-1[2-9]|min-h-11/);
  });
});
