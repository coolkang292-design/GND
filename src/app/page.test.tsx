import { describe, expect, it, vi } from "vitest";

/**
 * ⚠️ **이 파일은 2026-08-17 개발 서버에서 잡은 고장의 재발 방지선이다.**
 *
 * `/`는 서버 사이드 `redirect()`라 302 응답에서 쿼리스트링이 통째로 사라진다.
 * 클라이언트 JS가 한 줄도 돌기 전에 없어지므로 `AcquisitionTracker`가 아무리
 * 일찍 실행돼도 잡을 값이 없었다 — `?utm_source=kakao`로 들어왔는데
 * `source: null`로 기록됐다.
 *
 * `acquisition.test.ts`는 전부 통과했다. 파싱 함수는 멀쩡했고, **넘겨줄 문자열이
 * 비어 있던 것**이라 순수 함수 테스트로는 잡히지 않는다. 그래서 리다이렉트가
 * 무엇을 실어 보내는지를 여기서 직접 고정한다.
 */

const redirect = vi.fn();
vi.mock("next/navigation", () => ({
  redirect: (url: string) => redirect(url),
}));

const { default: RootPage } = await import("./page");

async function go(params: Record<string, string | string[] | undefined>) {
  redirect.mockClear();
  await RootPage({ searchParams: Promise.resolve(params) });
  return redirect.mock.calls[0]?.[0] as string;
}

describe("RootPage 리다이렉트", () => {
  it("utm이 없으면 그냥 /home", async () => {
    expect(await go({})).toBe("/home");
  });

  it("utm 세 개를 /home으로 실어 보낸다", async () => {
    const url = await go({
      utm_source: "kakao",
      utm_medium: "social",
      utm_campaign: "8월오픈",
    });
    const qs = new URLSearchParams(url.split("?")[1]);
    expect(url.startsWith("/home?")).toBe(true);
    expect(qs.get("utm_source")).toBe("kakao");
    expect(qs.get("utm_medium")).toBe("social");
    expect(qs.get("utm_campaign")).toBe("8월오픈");
  });

  it("일부만 있어도 있는 것만 넘긴다", async () => {
    const url = await go({ utm_source: "instagram" });
    expect(url).toBe("/home?utm_source=instagram");
  });

  it("utm이 아닌 파라미터는 넘기지 않는다", async () => {
    // 들어온 것을 통째로 실어 나르면 남의 링크에 붙은 값이 우리 주소로 옮겨 붙는다
    const url = await go({ utm_source: "kakao", next: "https://evil.example" });
    expect(url).toBe("/home?utm_source=kakao");
    expect(url).not.toContain("evil");
  });

  it("배열로 들어오면 첫 값만 쓴다", async () => {
    // `?utm_source=a&utm_source=b`는 Next가 배열로 준다
    expect(await go({ utm_source: ["kakao", "naver"] })).toBe(
      "/home?utm_source=kakao",
    );
  });

  it("빈 값은 넘기지 않는다", async () => {
    expect(await go({ utm_source: "" })).toBe("/home");
  });
});
