// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FullScreenFlow, leaveFullScreenFlow } from "./full-screen-flow";

afterEach(async () => { cleanup(); await new Promise((resolve) => setTimeout(resolve, 30)); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function Harness({ asyncNavigation = false }: { asyncNavigation?: boolean }) {
  const [open, setOpen] = useState(false);
  return <><button onClick={() => setOpen(true)}>열기</button>{open && <FullScreenFlow title="운동 선택" onBack={() => setOpen(false)} onClose={() => setOpen(false)} closeLabel="운동 선택 닫기"><button onClick={() => leaveFullScreenFlow(() => { setOpen(false); if (asyncNavigation) queueMicrotask(() => history.pushState({}, "", "?program=async")); else history.pushState({}, "", "?program=1"); })}>프로그램</button></FullScreenFlow>}</>;
}

describe("전체 화면 이동과 초점", () => {
  it("빨리 닫고 다시 열어도 브라우저 뒤로가기는 열린 화면을 닫는다", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByText("열기"));
    fireEvent.click(screen.getByLabelText("운동 선택 닫기"));
    fireEvent.click(screen.getByText("열기"));
    await new Promise((resolve) => setTimeout(resolve, 30));
    history.back();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
  it("다른 주소로 이동하면 닫기 정리가 새 주소를 되돌리지 않는다", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByText("열기"));
    fireEvent.click(screen.getByText("프로그램"));
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(location.search).toBe("?program=1");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("화면이 먼저 닫히고 주소가 나중에 바뀌어도 이동이 취소되지 않는다", async () => {
    history.replaceState({}, "", location.pathname);
    const nativeBack = history.back.bind(history);
    // Model a real browser where history traversal finishes after router.push.
    vi.spyOn(history, "back").mockImplementation(() => { setTimeout(nativeBack, 20); });
    render(<Harness asyncNavigation />);
    fireEvent.click(screen.getByText("열기"));
    fireEvent.click(screen.getByText("프로그램"));
    // 고정 대기(50ms)는 전체 점검처럼 컴퓨터가 바쁠 때 20ms 지연을 못 따라가 거짓 실패를 냈다
    await waitFor(() => expect(location.search).toBe("?program=async"));
    expect(screen.queryByRole("dialog")).toBeNull();
    history.back();
    await waitFor(() => expect(location.search).toBe(""));
  });
  it("키보드 초점은 화면 안에서 돌고 닫으면 열기 버튼으로 돌아간다", () => {
    render(<Harness />);
    const opener = screen.getByText("열기");
    opener.focus();
    fireEvent.click(opener);
    const last = screen.getByText("프로그램");
    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(screen.getByLabelText("이전 화면으로 돌아가기"));
    fireEvent.click(screen.getByLabelText("운동 선택 닫기"));
    expect(document.activeElement).toBe(opener);
  });
  it("키보드가 보이는 높이로 줄면 작은 화면 모드를 켜고 입력값을 보존한다", () => {
    const viewport = Object.assign(new EventTarget(), { height: 844, offsetTop: 0 });
    vi.stubGlobal("visualViewport", viewport);
    const view = render(<FullScreenFlow title="운동 선택" onBack={vi.fn()} onClose={vi.fn()}><input aria-label="검색어" defaultValue="벤치" /></FullScreenFlow>);
    const flow = screen.getByRole("dialog");
    expect(flow.dataset.compact).toBe("false");
    viewport.height = 460;
    viewport.dispatchEvent(new Event("resize"));
    expect(flow.dataset.compact).toBe("true");
    expect(flow.style.getPropertyValue("--flow-height")).toBe("460px");
    expect((screen.getByLabelText("검색어") as HTMLInputElement).value).toBe("벤치");
    viewport.height = 844;
    viewport.dispatchEvent(new Event("resize"));
    expect(flow.dataset.compact).toBe("false");
    view.unmount();
  });

});
