import { beforeEach, describe, expect, it } from "vitest";
import {
  TRAIL_DETAIL_MAX,
  TRAIL_MAX,
  clearTrail,
  isUserAction,
  noteTrail,
  pathOnly,
  readTrail,
} from "./bug-trail";

beforeEach(() => clearTrail());

describe("링버퍼 — 최신이 앞", () => {
  it("나중에 넣은 것이 index 0이다", () => {
    // 순서가 뒤집히면 서버가 앞에서 30개를 남길 때 **직전 동작이 잘려 나간다.**
    // 신고에서 가장 중요한 한 줄이 사라지는 것이므로 이 단언이 회귀를 잡는다.
    noteTrail("nav", "먼저");
    noteTrail("action", "나중");
    expect(readTrail()[0]?.label).toBe("나중");
    expect(readTrail()[1]?.label).toBe("먼저");
  });

  it(`${TRAIL_MAX}개를 넘으면 가장 오래된 것부터 버린다`, () => {
    for (let i = 0; i < TRAIL_MAX + 12; i += 1) noteTrail("action", `a${i}`);
    const trail = readTrail();
    // "0이어야 한다"가 아니라 정확한 개수로 단언한다 — 버퍼가 통째로 망가져
    // 비어 있어도 통과하는 단언은 아무것도 검사하지 않는다.
    expect(trail).toHaveLength(TRAIL_MAX);
    expect(trail[0]?.label).toBe(`a${TRAIL_MAX + 11}`);
    expect(trail.at(-1)?.label).toBe("a12");
  });

  it("readTrail은 복사본이라 밖에서 고쳐도 버퍼가 안 변한다", () => {
    noteTrail("nav", "/home");
    const copy = readTrail();
    copy[0]!.label = "덮어씀";
    copy.push({ t: "x", kind: "nav", label: "끼워넣음" });
    expect(readTrail()).toHaveLength(1);
    expect(readTrail()[0]?.label).toBe("/home");
  });
});

describe("길이 제한 — 신고 본문이 통째로 실려 오지 않게", () => {
  it(`detail은 ${TRAIL_DETAIL_MAX}자로 자른다`, () => {
    noteTrail("fail", "db", "가".repeat(500));
    expect(readTrail()[0]?.detail).toHaveLength(TRAIL_DETAIL_MAX);
  });

  it("label도 자른다", () => {
    noteTrail("action", "x".repeat(500));
    expect(readTrail()[0]?.label).toHaveLength(TRAIL_DETAIL_MAX);
  });

  it("빈 label은 아예 안 담는다", () => {
    noteTrail("action", "");
    expect(readTrail()).toHaveLength(0);
  });

  it("detail이 없으면 키 자체가 없다", () => {
    noteTrail("nav", "/home");
    expect(readTrail()[0]).not.toHaveProperty("detail");
  });
});

describe("계측은 앱을 죽이지 않는다", () => {
  it("이상한 값을 넣어도 던지지 않는다", () => {
    // 계측 코드가 던지면 그 자리의 기능이 통째로 죽는다. 신고 장치가 앱을
    // 망가뜨리는 건 본말전도다.
    expect(() =>
      noteTrail("action", undefined as unknown as string),
    ).not.toThrow();
    expect(() =>
      noteTrail("action", "ok", { toString: null } as unknown as string),
    ).not.toThrow();
  });
});

describe("pathOnly — 쿼리스트링을 통째로 버린다", () => {
  it("닉네임이 든 필터가 흔적에 남지 않는다", () => {
    // `?nickname=eq.스칼레또` 같은 값이 그대로 저장되면 개인정보가 샌다.
    const out = pathOnly(
      "https://x.supabase.co/rest/v1/profiles?select=id&nickname=eq.스칼레또",
    );
    expect(out).not.toContain("스칼레또");
    expect(out).not.toContain("?");
    expect(out).toBe("profiles");
  });

  it("uuid가 든 필터도 남지 않는다", () => {
    const out = pathOnly(
      "https://x.supabase.co/rest/v1/bug_reports?id=eq.4fa751c8-8ee6-4e74-bcac-68f963ff032f",
    );
    expect(out).toBe("bug_reports");
  });

  it("auth 경로는 접두어를 남겨 구분한다", () => {
    expect(pathOnly("https://x.supabase.co/auth/v1/token?grant_type=refresh")).toBe(
      "auth/token",
    );
  });

  it("RPC 이름은 남는다 — 어느 호출이 실패했는지가 핵심이다", () => {
    expect(pathOnly("https://x.supabase.co/rest/v1/rpc/accept_challenge_invite")).toBe(
      "rpc/accept_challenge_invite",
    );
  });

  it("깨진 URL에도 던지지 않는다", () => {
    expect(() => pathOnly("!!! not a url")).not.toThrow();
  });
});

describe("isUserAction — 사용자가 누른 것만 남긴다", () => {
  const S = (p: string) => `https://x.supabase.co${p}`;
  const U = S("/rest/v1/rpc/send_cheer");

  it("읽기(GET)는 동작이 아니다", () => {
    // GET을 담으면 화면 한 번 열 때 수십 건이 나가 30칸 버퍼를 즉시 덮어쓴다.
    // 그러면 정작 사용자가 누른 것이 밀려 나가 흔적이 쓸모없어진다.
    expect(isUserAction("GET", S("/rest/v1/profiles?select=id"))).toBe(false);
    expect(isUserAction("HEAD", U)).toBe(false);
    expect(isUserAction("OPTIONS", U)).toBe(false);
  });

  it("쓰기 4종은 동작이다", () => {
    for (const m of ["POST", "PATCH", "PUT", "DELETE"]) {
      expect(isUserAction(m, U)).toBe(true);
    }
  });

  it("소문자 메서드도 인식한다", () => {
    expect(isUserAction("post", U)).toBe(true);
  });

  it("auth는 동작이 아니다 — 토큰 갱신은 사용자가 한 일이 아니다", () => {
    expect(isUserAction("POST", S("/auth/v1/token?grant_type=refresh_token"))).toBe(false);
    expect(isUserAction("POST", S("/auth/v1/signup"))).toBe(false);
  });

  // ── 2026-07-31 실제 신고에서 드러난 것 ──────────────────────
  // 첫 판 규칙은 "쓰기 메서드면 동작"이었다. PostgREST는 **읽기 전용 함수도 POST로**
  // 부르기 때문에 흔적 30칸이 1분치 배경 잡음으로 꽉 찼다. 아래는 그 신고에 실제로
  // 찍혔던 경로들이고, 전부 걸러져야 한다.
  describe("실제 신고에서 잡음이던 것들 (회귀 방지)", () => {
    const NOISE = [
      "/rest/v1/rpc/get_my_badge_metrics",
      "/rest/v1/rpc/get_incoming_crew_requests",
      "/rest/v1/rpc/get_my_recent_pokes",
      "/rest/v1/rpc/get_challenge_period_sessions",
      "/rest/v1/rpc/get_challenge_participant_profiles",
      "/rest/v1/rpc/autostart_due_challenges",
      "/rest/v1/rpc/autofinalize_due_challenges",
      "/storage/v1/object/sign/workout-images",
    ];
    for (const p of NOISE) {
      it(`잡음이 아니다: ${p}`, () => {
        expect(isUserAction("POST", S(p))).toBe(false);
      });
    }
  });

  describe("진짜 동작은 살아남는다", () => {
    const REAL = [
      "/rest/v1/rpc/send_cheer",
      "/rest/v1/rpc/poke_user",
      "/rest/v1/rpc/accept_challenge_invite",
      "/rest/v1/rpc/join_challenge_with_code",
      "/rest/v1/rpc/complete_workout",
      "/rest/v1/rpc/submit_bug_report",
      "/rest/v1/workout_sessions",
      "/rest/v1/notifications",
      // 업로드는 서명과 달리 진짜 동작이다 — 사진을 올린 것이다
      "/storage/v1/object/workout-images/abc.jpg",
    ];
    for (const p of REAL) {
      it(`동작이다: ${p}`, () => {
        expect(isUserAction("POST", S(p))).toBe(true);
      });
    }
  });

  it("걸러내기가 통째로 망가지면 잡히도록 — 잡음 8건 중 통과가 0이어야 한다", () => {
    // 위 개별 단언이 하나씩 무력화돼도 이 집계가 잡는다.
    const noise = [
      "/rest/v1/rpc/get_x",
      "/rest/v1/rpc/list_x",
      "/rest/v1/rpc/search_x",
      "/rest/v1/rpc/autostart_x",
      "/rest/v1/rpc/autofinalize_x",
      "/rest/v1/rpc/admin_x",
      "/rest/v1/rpc/pending_x",
      "/rest/v1/rpc/schema_x",
    ];
    expect(noise.filter((p) => isUserAction("POST", S(p)))).toHaveLength(0);
  });

  it("깨진 URL에도 던지지 않는다 — 계측이 던지면 그 자리 기능이 죽는다", () => {
    // `new URL(x, base)`는 상대 경로로 해석하므로 사실상 던지지 않는다.
    // 그래서 검사할 것은 반환값이 아니라 **던지지 않는다는 것**이다.
    // (해석 불가한 주소로 나간 POST도 쓰기는 쓰기다 — 동작으로 남겨 둔다.)
    expect(() => isUserAction("POST", "!!! not a url")).not.toThrow();
    expect(() => isUserAction("GET", "")).not.toThrow();
    expect(isUserAction("GET", "")).toBe(false);
  });

  it("실제로 담기는 이름이 어느 동작인지 알아볼 수 있다", () => {
    // 흔적에 `rpc/accept_challenge_invite`가 남아야 "챌린지 수락을 눌렀다"를
    // 읽어낼 수 있다. 경로가 뭉개지면 동작을 기록해도 해석이 안 된다.
    expect(pathOnly("https://x.supabase.co/rest/v1/rpc/send_cheer")).toBe("rpc/send_cheer");
    expect(pathOnly("https://x.supabase.co/rest/v1/workout_sessions?id=eq.abc")).toBe("workout_sessions");
  });
});
