import { describe, expect, it } from "vitest";
import {
  acquisitionBreakdown,
  acquisitionCaptureRate,
  crewOriginBreakdown,
  originKnownRate,
  topInviters,
  type AcquisitionProfileRow,
  type CrewLinkOriginRow,
} from "./analytics-acquisition";

const link = (
  userA: string,
  userB: string,
  origin: string | null,
  initiatedBy: string | null = null,
): CrewLinkOriginRow => ({ userA, userB, origin, initiatedBy });

const profile = (
  userId: string,
  over: Partial<AcquisitionProfileRow> = {},
): AcquisitionProfileRow => ({
  userId,
  nickname: userId,
  invitedBy: null,
  source: null,
  referrer: null,
  ...over,
});

describe("crewOriginBreakdown", () => {
  it("출처별로 세고 정해진 순서로 낸다", () => {
    const rows = crewOriginBreakdown([
      link("a", "b", "search"),
      link("c", "d", "invite_link"),
      link("e", "f", "invite_link"),
      link("g", "h", "unknown"),
    ]);
    expect(rows.map((r) => [r.origin, r.count])).toEqual([
      ["invite_link", 2],
      ["search", 1],
      ["unknown", 1],
    ]);
  });

  it("null 출처는 unknown으로 합친다", () => {
    const rows = crewOriginBreakdown([link("a", "b", null)]);
    expect(rows).toEqual([
      { origin: "unknown", label: "알 수 없음 (0079 이전)", count: 1 },
    ]);
  });

  it("라벨 없는 새 출처도 버리지 않는다 — 합이 어긋나면 안 된다", () => {
    // ⚠️ 여기가 뒤집히는 지점이다. 모르는 값을 버리도록 짜면 이 단언이 실패한다.
    const rows = crewOriginBreakdown([
      link("a", "b", "search"),
      link("c", "d", "qr_poster"),
    ]);
    expect(rows.reduce((s, r) => s + r.count, 0)).toBe(2);
    expect(rows.find((r) => r.origin === "qr_poster")?.label).toBe("qr_poster");
  });

  it("연결이 없으면 빈 배열", () => {
    expect(crewOriginBreakdown([])).toEqual([]);
  });
});

describe("originKnownRate", () => {
  it("unknown과 null은 '아는 것'에 넣지 않는다", () => {
    expect(
      originKnownRate([
        link("a", "b", "search"),
        link("c", "d", "unknown"),
        link("e", "f", null),
        link("g", "h", "challenge"),
      ]),
    ).toEqual({ numerator: 2, denominator: 4 });
  });

  it("연결이 없으면 모수 0 — 0%가 아니라 잴 수 없음", () => {
    expect(originKnownRate([])).toEqual({ numerator: 0, denominator: 0 });
  });
});

describe("topInviters", () => {
  it("데려온 사람과 먼저 연 연결을 나눠 센다", () => {
    const rows = topInviters(
      [link("a", "b", "invite_link", "a"), link("a", "c", "search", "a")],
      [
        profile("a", { nickname: "부른사람" }),
        profile("b", { nickname: "신규", invitedBy: "a" }),
        profile("c", { nickname: "기존" }), // 검색으로 이어짐 → 데려온 게 아니다
      ],
    );
    expect(rows).toEqual([
      { nickname: "부른사람", linksInitiated: 2, broughtIn: 1 },
    ]);
  });

  it("먼저 연 연결만 있고 데려온 사람이 0이어도 목록에 남는다", () => {
    // ⚠️ 이 구분이 핵심이다 — 빼 버리면 "기존 사용자끼리 이어 준 사람"이
    //    화면에서 사라져 확산이 있는 것처럼 읽힌다
    const rows = topInviters(
      [link("a", "b", "search", "a")],
      [profile("a", { nickname: "연결러" }), profile("b")],
    );
    expect(rows).toEqual([
      { nickname: "연결러", linksInitiated: 1, broughtIn: 0 },
    ]);
  });

  it("데려온 사람이 많은 순으로 정렬한다", () => {
    const rows = topInviters(
      [
        link("a", "x", "search", "a"),
        link("a", "y", "search", "a"),
        link("a", "z", "search", "a"),
        link("b", "p", "invite_link", "b"),
        link("b", "q", "invite_link", "b"),
      ],
      [
        profile("a", { nickname: "연결많음" }),
        profile("b", { nickname: "유입많음" }),
        profile("p", { invitedBy: "b" }),
        profile("q", { invitedBy: "b" }),
        profile("x"),
        profile("y"),
        profile("z"),
      ],
    );
    expect(rows[0].nickname).toBe("유입많음");
    expect(rows[0].broughtIn).toBe(2);
    expect(rows[1].nickname).toBe("연결많음");
  });

  it("아무도 초대하지 않았으면 빈 목록 — 전체 사용자 표가 되면 안 된다", () => {
    expect(topInviters([], [profile("a"), profile("b")])).toEqual([]);
  });

  it("limit으로 자른다", () => {
    const links = ["a", "b", "c"].map((id) => link(id, "z", "search", id));
    const profiles = ["a", "b", "c", "z"].map((id) => profile(id));
    expect(topInviters(links, profiles, 2)).toHaveLength(2);
  });
});

describe("acquisitionBreakdown", () => {
  it("채널별로 세고 많은 순으로 낸다", () => {
    const rows = acquisitionBreakdown([
      profile("a", { source: "kakao" }),
      profile("b", { source: "kakao" }),
      profile("c", { referrer: "www.instagram.com" }),
      profile("d"),
    ]);
    expect(rows).toEqual([
      { channel: "kakao", count: 2 },
      { channel: "direct", count: 1 },
      { channel: "instagram", count: 1 },
    ]);
  });

  it("direct를 빼지 않는다 — 빼면 나머지 비율이 부풀려진다", () => {
    const rows = acquisitionBreakdown([profile("a"), profile("b")]);
    expect(rows).toEqual([{ channel: "direct", count: 2 }]);
  });
});

describe("acquisitionCaptureRate", () => {
  it("utm이든 referrer든 하나라도 있으면 잡힌 것으로 센다", () => {
    expect(
      acquisitionCaptureRate([
        profile("a", { source: "kakao" }),
        profile("b", { referrer: "m.naver.com" }),
        profile("c"),
      ]),
    ).toEqual({ numerator: 2, denominator: 3 });
  });

  it("계측 전 가입자만 있으면 0/N — 이 값이 direct의 진짜 뜻을 가른다", () => {
    // "0이어야 한다"로 끝내지 않는다. 위 단언이 2/3라 뒤집힘이 확인된다.
    expect(acquisitionCaptureRate([profile("a"), profile("b")])).toEqual({
      numerator: 0,
      denominator: 2,
    });
  });

  it("가입자가 없으면 모수 0", () => {
    expect(acquisitionCaptureRate([])).toEqual({
      numerator: 0,
      denominator: 0,
    });
  });
});
