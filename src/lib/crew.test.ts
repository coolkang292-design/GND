import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseBrowserClient: () => ({ rpc: mocks.rpc }),
}));

import { isNotFriendCode, redeemInviteCode } from "./crew";

/**
 * RPC 이름별로 답을 정해 두는 디스패처.
 *
 * ⚠️ 어떤 RPC가 **어떤 순서로** 불렸는지가 이 파일의 핵심이라 호출 이름을 남긴다.
 * `redeemInviteCode`의 계약은 "친구 먼저, 그룹은 하위 호환"이고, 순서가 뒤집히면
 * 친구 코드가 그룹 코드로 오인될 수 있다(0061이 코드 공간을 공유한다).
 */
function rpcDispatcher(answers: Record<string, { data?: unknown; error?: unknown }>) {
  const called: string[] = [];
  mocks.rpc.mockImplementation((fn: string) => {
    called.push(fn);
    const a = answers[fn];
    if (!a) throw new Error(`예상하지 못한 RPC 호출: ${fn}`);
    return Promise.resolve({ data: a.data ?? null, error: a.error ?? null });
  });
  return called;
}

/** PostgREST가 주는 오류 — 2.110.3의 `PostgrestError`는 `Error`를 상속한다 */
const pgError = (message: string) => new Error(message);

beforeEach(() => vi.clearAllMocks());

describe("redeemInviteCode — 친구 먼저, 옛 그룹 코드는 하위 호환", () => {
  it("친구 코드면 친구를 맺고 그룹은 건드리지 않는다", async () => {
    const called = rpcDispatcher({
      accept_friend_invite: {
        data: { ownerId: "owner-1", nickname: "낭만송곳니", alreadyFriends: false },
      },
    });

    const result = await redeemInviteCode("GND-7FDVC");

    expect(result).toEqual({
      kind: "friend",
      nickname: "낭만송곳니",
      alreadyFriends: false,
    });
    // 그룹으로도 넣으면 "친구 초대"가 조용히 그룹 합류를 겸하게 된다.
    expect(called).toEqual(["accept_friend_invite"]);
  });

  it("이미 친구였다는 답을 그대로 넘긴다 — 화면이 '이미 친구예요'로 말해야 한다", async () => {
    rpcDispatcher({
      accept_friend_invite: {
        data: { ownerId: "owner-1", nickname: "스칼레또", alreadyFriends: true },
      },
    });

    const result = await redeemInviteCode("GND-FUGBY");

    expect(result).toEqual({
      kind: "friend",
      nickname: "스칼레또",
      alreadyFriends: true,
    });
  });

  /**
   * ⚠️ 이 폴백이 없으면 카카오톡에 **이미 뿌려진 옛 링크가 전부 죽는다.**
   * 0061 이전의 `/invite/<코드>`는 전부 `groups.invite_code`를 실었다.
   */
  it("친구 코드가 아니면 옛 그룹 코드로 재시도한다", async () => {
    const called = rpcDispatcher({
      accept_friend_invite: { error: pgError("invalid_friend_code") },
      join_group_with_code: {
        data: { group_id: "g1", group_name: "불꽃 크루" },
      },
    });

    const result = await redeemInviteCode("GND-3Y7J5");

    expect(result).toEqual({ kind: "group", groupName: "불꽃 크루" });
    expect(called).toEqual(["accept_friend_invite", "join_group_with_code"]);
  });

  /**
   * ⚠️⚠️ 이 단언이 이 파일에서 제일 중요하다.
   *
   * `self_invite`는 **친구 코드가 맞는데 거절된** 경우다. 여기서 그룹으로 재시도하면
   * 그룹 쪽도 실패하면서 마지막 오류가 그룹 것으로 덮여, 자기 링크를 누른 사람에게
   * "존재하지 않는 초대 링크"라는 엉뚱한 문구가 뜬다.
   * `/invite/[code]`가 `self_invite`를 보고 "내 초대 링크예요"라고 말하는 근거다.
   */
  it("self_invite는 그룹으로 폴백하지 않고 그대로 던진다", async () => {
    const called = rpcDispatcher({
      accept_friend_invite: { error: pgError("self_invite") },
    });

    await expect(redeemInviteCode("GND-7FDVC")).rejects.toThrow("self_invite");
    expect(called).toEqual(["accept_friend_invite"]);
  });

  it("둘 다 실패하면 그룹 쪽 오류를 던진다 — 호출부가 '없는 코드'로 옮긴다", async () => {
    rpcDispatcher({
      accept_friend_invite: { error: pgError("invalid_friend_code") },
      join_group_with_code: { error: pgError("invalid_invite_code") },
    });

    await expect(redeemInviteCode("GND-XXXXX")).rejects.toThrow(
      "invalid_invite_code",
    );
  });
});

describe("isNotFriendCode — 그룹 재시도 조건", () => {
  it("invalid_friend_code만 참이다", () => {
    expect(isNotFriendCode(pgError("invalid_friend_code"))).toBe(true);
    expect(isNotFriendCode(pgError("self_invite"))).toBe(false);
    expect(isNotFriendCode(pgError("not_authenticated"))).toBe(false);
  });
});
