// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  clearPendingChallengeInvite: vi.fn(),
  joinChallengeWithCode: vi.fn(),
  joinChallengeAsNewcomer: vi.fn(),
  isNotNewcomer: vi.fn(),
  saveOnboardingNotice: vi.fn(),
  peekPendingChallengeInvite: vi.fn(),
  clearPendingInvite: vi.fn(),
  createGroup: vi.fn(),
  peekPendingInvite: vi.fn(),
  redeemInviteCode: vi.fn(),
  upsertMyProfile: vi.fn(),
  getUserIdentities: vi.fn(),
  linkIdentity: vi.fn(),
  signInWithOAuth: vi.fn(),
}));

// ⚠️ `@/lib/identity`를 목으로 덮지 않는다. 이 화면이 **linkIdentity를 부르는가
//    signInWithOAuth를 부르는가**가 검사 대상이라, 그 모듈을 가리면 뒤바꿔도
//    통과한다. Supabase 경계만 막고 실제 identity.ts를 태운다.
vi.mock("@/lib/supabase/client", () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      getUserIdentities: mocks.getUserIdentities,
      linkIdentity: mocks.linkIdentity,
      signInWithOAuth: mocks.signInWithOAuth,
    },
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace }),
}));

vi.mock("@/components/auth-provider", () => ({
  useAuth: () => ({
    userId: "fresh-user",
    loading: false,
    configured: true,
  }),
}));

// ⚠️ `isNotNewcomer`·`challengeJoinError`는 **실물을 쓴다.** 둘 다 순수 함수이고,
//    목으로 덮으면 "어떤 오류에 폴백하는가 / 어떤 오류에 사용자를 붙잡아 두는가"가
//    검사 대상에서 사라진다. Supabase를 타는 것만 목으로 막는다.
vi.mock("@/lib/challenge", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/challenge")>()),
  clearPendingChallengeInvite: mocks.clearPendingChallengeInvite,
  joinChallengeWithCode: mocks.joinChallengeWithCode,
  joinChallengeAsNewcomer: mocks.joinChallengeAsNewcomer,
  saveOnboardingNotice: mocks.saveOnboardingNotice,
  peekPendingChallengeInvite: mocks.peekPendingChallengeInvite,
}));

vi.mock("@/lib/crew", () => ({
  clearPendingInvite: mocks.clearPendingInvite,
  createGroup: mocks.createGroup,
  peekPendingInvite: mocks.peekPendingInvite,
  redeemInviteCode: mocks.redeemInviteCode,
  upsertMyProfile: mocks.upsertMyProfile,
}));

import OnboardingPage from "./page";

const ORIGINAL_FLAG = process.env.NEXT_PUBLIC_OAUTH_PROVIDERS;

/** 신원 없음 = 모드 1 (카카오·구글 화면) */
function noIdentities() {
  mocks.getUserIdentities.mockResolvedValue({
    data: { identities: [] },
    error: null,
  });
}
/** 신원 있음 = 모드 2 (제공자에서 돌아옴 → 닉네임만 받는다) */
function linkedIdentity() {
  mocks.getUserIdentities.mockResolvedValue({
    data: { identities: [{ provider: "kakao" }] },
    error: null,
  });
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_OAUTH_PROVIDERS = "kakao,google";
  mocks.linkIdentity.mockResolvedValue({ data: {}, error: null });
  noIdentities();
});

afterEach(() => {
  process.env.NEXT_PUBLIC_OAUTH_PROVIDERS = ORIGINAL_FLAG;
});

/**
 * ⚠️⚠️ 3차 결정(2026-08-08) — 첫 화면은 **카카오·구글만**이다.
 * *"처음부터 가입할 때 카카오·구글로 가는 게 더 안전한 방법인 것 같음."*
 *
 * 닉네임 경로를 첫 화면에 되살리면 이 describe가 깨진다. 되살리기 전에 설계
 * §4.2의 3차 결정을 읽어라 — "나중에 연결하면 된다"가 항상 되는 게 아니라서
 * 뺀 것이다(`identity_already_exists`로 기회를 잃는다).
 */
describe("OnboardingPage 모드 1 — 처음 (신원 없음)", () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_OAUTH_PROVIDERS = "kakao,google";
    mocks.linkIdentity.mockResolvedValue({ data: {}, error: null });
    noIdentities();
    mocks.peekPendingInvite.mockReturnValue(null);
    mocks.peekPendingChallengeInvite.mockReturnValue(null);
  });

  it("카카오·구글 버튼만 보여주고 닉네임을 묻지 않는다", async () => {
    render(<OnboardingPage />);

    await screen.findByRole("button", { name: "카카오로 시작하기" });
    expect(
      screen.getByRole("button", { name: "구글로 시작하기" }),
    ).not.toBeNull();
    // 부정 확인 — 닉네임은 **돌아온 뒤**에 받는다. 리다이렉트로 화면을 떠나므로
    // 여기서 입력받으면 그 값이 사라진다.
    expect(screen.queryByPlaceholderText("예: 스칼레또")).toBeNull();
  });

  /** 온보딩은 익명 세션 위에서 돈다 — signInWithOAuth를 쓰면 기록이 갈린다 */
  it("주 버튼은 linkIdentity를 부른다 (signInWithOAuth가 아니다)", async () => {
    render(<OnboardingPage />);
    fireEvent.click(await screen.findByRole("button", { name: "카카오로 시작하기" }));

    await waitFor(() => expect(mocks.linkIdentity).toHaveBeenCalledTimes(1));
    expect(mocks.linkIdentity.mock.calls[0][0].provider).toBe("kakao");
    expect(mocks.signInWithOAuth).not.toHaveBeenCalled();
  });

  /**
   * ⚠️ 비상구. 플래그를 끄면(카카오 장애·설정 사고) 주 버튼이 사라지는데, 닉네임
   * 경로까지 없으면 **신규 가입이 0이 된다.**
   */
  it("제공자가 하나도 없으면 닉네임 입력이 대신 뜬다", async () => {
    process.env.NEXT_PUBLIC_OAUTH_PROVIDERS = "";
    render(<OnboardingPage />);

    await screen.findByPlaceholderText("예: 스칼레또");
    expect(
      screen.queryByRole("button", { name: "카카오로 시작하기" }),
    ).toBeNull();
  });

  it("이모지 선택과 주간목표 스테퍼가 없다 (프로필 편집 시트로 옮겼다)", async () => {
    render(<OnboardingPage />);

    await screen.findByRole("button", { name: "카카오로 시작하기" });
    expect(screen.queryByText("프로필 사진")).toBeNull();
    expect(screen.queryByText("주간 운동 목표")).toBeNull();
  });
});

describe("OnboardingPage 모드 2 — 제공자에서 돌아옴 (신원 있음)", () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_OAUTH_PROVIDERS = "kakao,google";
    linkedIdentity();
    mocks.peekPendingInvite.mockReturnValue(null);
    mocks.peekPendingChallengeInvite.mockReturnValue(null);
    mocks.upsertMyProfile.mockResolvedValue(undefined);
  });

  it("닉네임만 받고 주 버튼을 다시 보여주지 않는다", async () => {
    render(<OnboardingPage />);

    await screen.findByPlaceholderText("예: 스칼레또");
    expect(screen.getByRole("heading", { name: /반가워요!/ })).not.toBeNull();
    expect(
      screen.queryByRole("button", { name: "카카오로 시작하기" }),
    ).toBeNull();
  });

  /** 컬럼이 not null이라 기본값을 반드시 넣는다. 바꾸는 자리는 프로필 편집 시트다. */
  it("이모지·주간목표는 기본값으로 저장한다", async () => {
    render(<OnboardingPage />);
    fireEvent.change(await screen.findByPlaceholderText("예: 스칼레또"), {
      target: { value: "새사람" },
    });
    fireEvent.click(screen.getByRole("button", { name: "GND 시작하기" }));

    await waitFor(() =>
      expect(mocks.upsertMyProfile).toHaveBeenCalledWith({
        id: "fresh-user",
        nickname: "새사람",
        avatar_url: "🧔",
        weekly_goal: 3,
      }),
    );
  });
});

describe("OnboardingPage 챌린지 초대 모드", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_OAUTH_PROVIDERS = "kakao,google";
    noIdentities();
    mocks.peekPendingInvite.mockReturnValue(null);
    mocks.peekPendingChallengeInvite.mockReturnValue("GND-ABCDE");
    mocks.upsertMyProfile.mockResolvedValue(undefined);
    // 기본은 **신입 경로**다 — 온보딩을 지나는 사람은 방금 프로필을 만든 사람이라
    // 서버(0063)가 신입으로 판정하는 것이 정상 흐름이다.
    mocks.joinChallengeAsNewcomer.mockResolvedValue({
      challengeId: "challenge-1",
      challengeName: "테스트 챌린지",
      crewLinked: 1,
      hostNickname: "방장형",
    });
    mocks.joinChallengeWithCode.mockResolvedValue({
      challengeId: "challenge-1",
      challengeName: "테스트 챌린지",
      crewLinked: 0,
    });
  });

  afterEach(() => cleanup());

  /**
   * ⚠️⚠️ **초대로 와도 카카오·구글이 먼저다** (사용자 지시 2026-08-08 —
   * *"모든 유저는 카카오/구글 회원 가입 > 닉네임 세팅하기 > 홈 or 챌린지"*).
   *
   * 옛 동작은 초대면 이 단계를 건너뛰고 닉네임만 물었다. 그러면 초대로 들어온
   * 사람이 **소셜 신원 0개짜리 브라우저 전용 계정**을 쥐게 된다 — 브라우저를
   * 지우면 기록이 사라지는, 배치 3이 없애려던 그 상태다. 되살리지 마라.
   */
  it("신원이 없으면 초대로 와도 카카오·구글을 먼저 보여준다", async () => {
    render(<OnboardingPage />);

    expect(
      await screen.findByRole("button", { name: "카카오로 시작하기" }),
    ).not.toBeNull();
    expect(
      screen.getByRole("button", { name: "구글로 시작하기" }),
    ).not.toBeNull();
    // 아직 닉네임을 묻지 않는다 — 제공자로 떠나면 입력값이 사라진다.
    expect(screen.queryByPlaceholderText("예: 스칼레또")).toBeNull();
    // ⚠️ 로그인 문을 숨기지 마라. 기존 사용자가 새 기기에서 챌린지 링크를 타면
    //    카카오를 눌러도 `identity_already_exists`로 막히므로 여기가 유일한 길이다.
    expect(screen.getByText("이미 계정이 있나요? 로그인")).not.toBeNull();
  });

  it("제공자에서 돌아오면 닉네임과 챌린지 참가 버튼을 보여준다", async () => {
    linkedIdentity();
    render(<OnboardingPage />);

    expect(
      await screen.findByRole("heading", { name: /챌린지에 초대받았어요/ }),
    ).not.toBeNull();
    expect(screen.getByPlaceholderText("예: 스칼레또")).not.toBeNull();
    expect(
      screen.getByRole("button", { name: "챌린지 참가하기" }),
    ).not.toBeNull();
    expect(screen.queryByText("프로필 사진")).toBeNull();
    expect(screen.queryByText("주간 운동 목표")).toBeNull();
    // 이미 신원을 붙였으니 주 버튼을 다시 보여주지 않는다.
    expect(
      screen.queryByRole("button", { name: "카카오로 시작하기" }),
    ).toBeNull();
    expect(screen.queryByText("크루에 들어가요")).toBeNull();
  });

  async function submitNickname(nick = "새참가자") {
    linkedIdentity();
    render(<OnboardingPage />);
    fireEvent.change(
      await screen.findByPlaceholderText("예: 스칼레또"),
      { target: { value: nick } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "챌린지 참가하기" }),
    );
  }

  it("신입은 방장과 친구까지 맺고 챌린지 화면으로 이동한다", async () => {
    await submitNickname();

    await waitFor(() =>
      expect(mocks.joinChallengeAsNewcomer).toHaveBeenCalledWith(
        "GND-ABCDE",
      ),
    );
    expect(mocks.upsertMyProfile).toHaveBeenCalledWith({
      id: "fresh-user",
      nickname: "새참가자",
      avatar_url: "🧔",
      weekly_goal: 3,
    });
    // 신입이 성공했으면 폴백은 부르지 않는다 — 두 번 참가시키면 안 된다.
    expect(mocks.joinChallengeWithCode).not.toHaveBeenCalled();
    // 참가와 친구 연결이 **동시에** 일어났으므로 화면이 둘 다 말해야 한다.
    // 방장 닉네임이 빠지면 "누구랑 친구가 됐는지" 알 수 없다.
    const notice = mocks.saveOnboardingNotice.mock.calls[0]?.[0] as string;
    expect(notice).toContain("방장형");
    expect(notice).toContain("테스트 챌린지");
    expect(mocks.clearPendingChallengeInvite).toHaveBeenCalledOnce();
    // ⚠️ 링크를 만든 **그 챌린지**로 보낸다. `/challenge`만 열면 대표 챌린지가
    //    잡혀 초대받은 사람이 엉뚱한 방을 본다(챌린지를 여러 개 만들 수 있다).
    //    ⚠️ `?join=`으로 넘기지 마라 — 챌린지 화면이 참가를 한 번 더 시도한다.
    expect(mocks.replace).toHaveBeenCalledWith("/challenge?open=challenge-1");
    expect(
      mocks.upsertMyProfile.mock.invocationCallOrder[0],
    ).toBeLessThan(
      mocks.joinChallengeAsNewcomer.mock.invocationCallOrder[0],
    );
  });

  it("신입이 아니면 joinChallengeWithCode로 폴백해 참가는 시킨다", async () => {
    // ⚠️ 이 폴백이 없으면 **기존 사용자가 챌린지 링크로 아예 못 들어간다**
    // (세션이 끊겨 온보딩으로 떨어진 사람 등). 인수인계서 §8-4.
    mocks.joinChallengeAsNewcomer.mockRejectedValue(
      new Error("not_newcomer"),
    );
    await submitNickname("기존사용자");

    await waitFor(() =>
      expect(mocks.joinChallengeWithCode).toHaveBeenCalledWith(
        "GND-ABCDE",
      ),
    );
    expect(mocks.replace).toHaveBeenCalledWith("/challenge?open=challenge-1");
    // 친구를 안 맺었으므로 방장 이름을 말하면 거짓말이 된다.
    const notice = mocks.saveOnboardingNotice.mock.calls[0]?.[0] as string;
    expect(notice).toContain("테스트 챌린지");
    expect(notice).not.toContain("친구가 됐어요");
  });

  /**
   * ⚠️⚠️ 2026-08-08까지 이 화면은 서버 오류를 `catch {}`로 버리고
   * `초대 링크를 다시 확인해 주세요` 한 줄만 보여줬다. 실측한 실패는 셋이었다 —
   * `invalid_invite_code` · `invalid_status:cancelled` · `invalid_status:active`.
   * **링크가 멀쩡한데 링크를 의심하게 만들어** 사용자가 실제로 시간을 썼다.
   * 원인별 문구를 지우고 한 줄로 되돌리지 마라.
   */
  it.each([
    ["invalid_invite_code", /초대 링크가 만료됐거나 잘못됐어요/],
    ["invalid_status:active", /이미 시작해서 참가가 닫혔어요/],
    ["invalid_status:cancelled", /취소된 챌린지예요/],
    ["already_joined", /이미 참가한 챌린지예요/],
  ])("%s면 이유를 말하고 홈으로 보낸다 (갇히지 않는다)", async (code, text) => {
    mocks.joinChallengeAsNewcomer.mockRejectedValue(new Error(code));
    await submitNickname();

    // ⚠️ 되돌릴 수 없는 실패다. 가입은 이미 끝났으므로 화면에 붙잡아 두면
    //    사용자가 갇힌다 — `/onboarding`은 `(tabs)` 밖이라 OnboardingGate가
    //    없어서 새로고침해도 못 나간다.
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/home"));
    expect(mocks.saveOnboardingNotice.mock.calls[0]?.[0]).toMatch(text);
    // ⚠️ 코드도 지운다. 남기면 이 브라우저의 **다음 가입**까지 오염된다.
    expect(mocks.clearPendingChallengeInvite).toHaveBeenCalledOnce();
    // 폴백이 모든 오류를 삼키면 틀린 코드로도 참가를 시도하게 된다.
    expect(mocks.joinChallengeWithCode).not.toHaveBeenCalled();
  });

  it("원인을 모르는 실패는 코드를 남기고 다시 시도하게 한다", async () => {
    // 네트워크 등 일시적 실패까지 코드를 지우면 되살릴 수 없는 링크가 된다.
    mocks.joinChallengeAsNewcomer.mockRejectedValue(new Error("network down"));
    await submitNickname();

    await screen.findByText(/챌린지에 참가하지 못했어요 \(network down\)/);
    expect(mocks.clearPendingChallengeInvite).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "챌린지 참가하기" }),
    ).not.toBeNull();
  });
});

describe("OnboardingPage 친구 초대 링크 모드", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_OAUTH_PROVIDERS = "kakao,google";
    noIdentities();
    // 챌린지가 아니라 **친구** 초대 링크로 들어온 사람 (`/invite/<코드>`가 보관).
    mocks.peekPendingChallengeInvite.mockReturnValue(null);
    mocks.peekPendingInvite.mockReturnValue("GND-7FDVC");
    mocks.upsertMyProfile.mockResolvedValue(undefined);
    mocks.redeemInviteCode.mockResolvedValue({
      kind: "friend",
      nickname: "낭만송곳니",
      alreadyFriends: false,
    });
  });

  afterEach(() => cleanup());

  async function finishProfile() {
    linkedIdentity();
    render(<OnboardingPage />);
    fireEvent.change(
      await screen.findByPlaceholderText("예: 스칼레또"),
      { target: { value: "새친구" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "GND 시작하기" }));
  }

  it("신원이 없으면 친구 초대로 와도 카카오·구글이 먼저다", async () => {
    render(<OnboardingPage />);
    expect(
      await screen.findByRole("button", { name: "카카오로 시작하기" }),
    ).not.toBeNull();
    expect(screen.queryByPlaceholderText("예: 스칼레또")).toBeNull();
  });

  /**
   * ⚠️⚠️ **마운트에서 `clearPendingInvite()`를 부르지 마라.** 2026-08-08까지
   * 그랬는데, 초대로 온 사람도 카카오·구글을 거치게 되면서 치명적이 됐다 —
   * 제공자로 떠났다 돌아오면 화면이 다시 마운트되고, 그때는 코드가 이미 지워져
   * 있어 **친구 초대 링크가 통째로 증발한다.** 다 쓴 뒤에만 지운다.
   */
  it("코드를 다 쓰기 전에는 지우지 않는다 (제공자 왕복에서 살아남아야 한다)", async () => {
    linkedIdentity();
    render(<OnboardingPage />);
    await screen.findByPlaceholderText("예: 스칼레또");
    expect(mocks.clearPendingInvite).not.toHaveBeenCalled();
  });

  /**
   * ⚠️ 0061 전에는 이 링크가 그룹 합류였고 마지막 화면이 "크루 참여 완료!"였다.
   * 이제 맺어지는 것은 **친구**다 — 크루 이름을 말하면 화면이 거짓말을 한다
   * (들어간 그룹이 없다).
   */
  it("친구를 맺으면 상대 닉네임을 말하고 크루 이름은 말하지 않는다", async () => {
    await finishProfile();

    await screen.findByRole("heading", { name: "친구가 됐어요!" });
    expect(mocks.redeemInviteCode).toHaveBeenCalledWith("GND-7FDVC");
    expect(screen.getByText(/낭만송곳니/)).not.toBeNull();
    expect(screen.queryByText(/크루 참여 완료/)).toBeNull();
    expect(screen.queryByText(/의 GND 챌린지에 함께해요/)).toBeNull();
    // 다 썼으므로 이제 지운다 — 안 지우면 다음 가입이 같은 코드를 또 쓴다.
    expect(mocks.clearPendingInvite).toHaveBeenCalledOnce();
  });

  it("이미 친구였으면 그렇게 말한다", async () => {
    mocks.redeemInviteCode.mockResolvedValue({
      kind: "friend",
      nickname: "낭만송곳니",
      alreadyFriends: true,
    });
    await finishProfile();

    await screen.findByRole("heading", { name: "이미 친구예요" });
    expect(screen.queryByRole("heading", { name: "친구가 됐어요!" })).toBeNull();
  });

  /** 옛 그룹 코드 링크(카카오톡에 뿌려진 것)는 여전히 그룹 합류로 끝난다 */
  it("옛 그룹 코드로 들어오면 크루 참여 완료로 끝난다", async () => {
    mocks.redeemInviteCode.mockResolvedValue({
      kind: "group",
      groupName: "불꽃 크루",
    });
    await finishProfile();

    await screen.findByRole("heading", { name: "크루 참여 완료!" });
    expect(screen.getByText(/불꽃 크루/)).not.toBeNull();
  });

  /**
   * ⚠️ 코드가 죽었다고 앱에 못 들어오게 막으면 안 된다. 2026-08-08에 코드 손입력
   * 화면을 지웠으므로(사용자 지시) **홈으로 보낸다** — 가입은 이미 끝났고,
   * 프로필이 생긴 뒤에는 같은 링크를 다시 눌렀을 때 `/invite/[code]`가 바로
   * 친구를 맺어 주므로 되돌릴 수 있다.
   */
  it("코드가 죽었어도 갇히지 않고 홈으로 보낸다", async () => {
    mocks.redeemInviteCode.mockRejectedValue(new Error("invalid_invite_code"));
    await finishProfile();

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/home"));
  });
});
