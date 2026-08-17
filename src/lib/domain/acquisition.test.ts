import { describe, expect, it } from "vitest";
import {
  ACQUISITION_VALUE_MAX,
  acquisitionChannel,
  buildAcquisition,
  landingShape,
  referrerHost,
} from "./acquisition";

const now = new Date("2026-08-17T00:00:00Z");

describe("referrerHost", () => {
  it("호스트만 남기고 검색어는 버린다", () => {
    // ⚠️ 이 단언이 핵심이다 — 전체 URL을 담으면 검색어가 DB에 눕는다
    expect(
      referrerHost("https://www.google.com/search?q=집에서+운동", "gnd.app"),
    ).toBe("www.google.com");
  });

  it("자기 자신에서 온 것은 유입이 아니다", () => {
    expect(referrerHost("https://gnd.app/home", "gnd.app")).toBeNull();
    // 대소문자가 달라도 같은 호스트다
    expect(referrerHost("https://GND.app/home", "gnd.app")).toBeNull();
  });

  it("다른 호스트는 남긴다 — 자기 자신 판정이 전부를 삼키면 안 된다", () => {
    expect(referrerHost("https://m.kakao.com/x", "gnd.app")).toBe("m.kakao.com");
  });

  it("빈 값·깨진 URL은 조용히 null", () => {
    expect(referrerHost(null, "gnd.app")).toBeNull();
    expect(referrerHost("", "gnd.app")).toBeNull();
    expect(referrerHost("어쩌구", "gnd.app")).toBeNull();
  });
});

describe("landingShape", () => {
  it("초대 코드를 마스킹한다", () => {
    // 코드 자체가 남으면 남의 초대 링크가 통계에 눕는다
    expect(landingShape("/invite/GND-7K2QP")).toBe("/invite/:code");
    expect(landingShape("/challenge/8f1c2d3e")).toBe("/challenge/:id");
  });

  it("정적 경로는 그대로 둔다", () => {
    expect(landingShape("/home")).toBe("/home");
    expect(landingShape("/")).toBe("/");
  });

  it("긴 값은 자른다", () => {
    const long = `/x${"y".repeat(400)}`;
    expect(landingShape(long)!.length).toBe(ACQUISITION_VALUE_MAX);
  });
});

describe("buildAcquisition", () => {
  it("utm 세 개를 뽑는다", () => {
    const a = buildAcquisition({
      search: "?utm_source=kakao&utm_medium=social&utm_campaign=8월오픈",
      referrer: null,
      pathname: "/invite/GND-7K2QP",
      selfHost: "gnd.app",
      now,
    });
    expect(a.source).toBe("kakao");
    expect(a.medium).toBe("social");
    expect(a.campaign).toBe("8월오픈");
    expect(a.landing).toBe("/invite/:code");
    expect(a.capturedAt).toBe("2026-08-17T00:00:00.000Z");
  });

  it("utm도 referrer도 없으면 전부 null이지만 객체는 나온다", () => {
    // ⚠️ null을 돌려주면 "직접 들어온 사람"이 통계에서 통째로 사라진다
    const a = buildAcquisition({
      search: "",
      referrer: null,
      pathname: "/",
      selfHost: "gnd.app",
      now,
    });
    expect(a.source).toBeNull();
    expect(a.referrer).toBeNull();
    expect(a.landing).toBe("/");
    expect(a.capturedAt).toBe("2026-08-17T00:00:00.000Z");
  });

  it("빈 문자열 utm은 값이 아니다", () => {
    const a = buildAcquisition({
      search: "?utm_source=&utm_medium=%20",
      referrer: null,
      pathname: "/",
      selfHost: "gnd.app",
      now,
    });
    expect(a.source).toBeNull();
    expect(a.medium).toBeNull();
  });

  it("긴 utm 값은 자른다", () => {
    const a = buildAcquisition({
      search: `?utm_campaign=${"가".repeat(500)}`,
      referrer: null,
      pathname: "/",
      selfHost: "gnd.app",
      now,
    });
    expect(a.campaign!.length).toBe(ACQUISITION_VALUE_MAX);
  });
});

describe("acquisitionChannel", () => {
  it("utm_source가 있으면 그것이 답이다", () => {
    // 광고·공유 링크가 스스로 밝힌 값이 referrer 추정보다 정확하다
    expect(
      acquisitionChannel({ source: "Instagram", referrer: "www.google.com" }),
    ).toBe("instagram");
  });

  it("utm이 없으면 referrer 호스트로 채널을 찍는다", () => {
    expect(acquisitionChannel({ source: null, referrer: "m.kakao.com" })).toBe(
      "kakao",
    );
    expect(
      acquisitionChannel({ source: null, referrer: "search.naver.com" }),
    ).toBe("naver");
  });

  it("둘 다 없으면 direct — 측정 실패가 아니라 하나의 채널이다", () => {
    expect(acquisitionChannel({ source: null, referrer: null })).toBe("direct");
  });

  it("모르는 호스트는 호스트 그대로 낸다", () => {
    expect(
      acquisitionChannel({ source: null, referrer: "blog.example.com" }),
    ).toBe("blog.example.com");
  });
});
