// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AvatarShopMock } from "./avatar-shop-mock";

afterEach(cleanup);

describe("AvatarShopMock", () => {
  it("모자를 구매하고 장착, 해제, 재장착한다", () => {
    render(<AvatarShopMock />);
    const capLayer = () =>
      screen
        .getByTestId("avatar-coordinate-preview")
        .querySelector('img[aria-hidden="true"]');

    expect(screen.getByText("12,840 P")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "500 P 구매하기" }));
    expect(screen.getByText("12,340 P")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "장착하기" }));
    expect(capLayer()).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "해제하기" }));
    expect(capLayer()).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "장착하기" }));
    expect(capLayer()).not.toBeNull();
  });

  it("나머지 5개 아이템은 준비 중으로 비활성화한다", () => {
    render(<AvatarShopMock />);
    const disabled = screen.getAllByRole("button", { name: /준비 중/ });
    expect(disabled).toHaveLength(5);
    expect(disabled.every((button) => button.hasAttribute("disabled"))).toBe(true);
  });
});
