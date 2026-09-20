/**
 * 공유 카드(Open Graph) 문구 — **순수 함수만** (2026-09-20).
 *
 * ── 왜 생겼나 ────────────────────────────────────────────────────────────
 *
 * 2026-09-20 운영 실측: `curl -A "kakaotalk-scrap/1.0"`로 받아 본 HTML에
 * **`og:` 태그가 한 개도 없었다.** 그래서 카카오톡이 `<title>`만 긁어
 * `GND / 여기를 눌러 링크를 확인하세요`라는 이미지 없는 작은 카드를 그렸다.
 * 초대 링크를 받은 사람이 **무슨 앱인지도 모르는 채로** 회색 줄 하나를 본다.
 *
 * ⚠️ 카카오는 **`og:*` 계열만 읽는다.** `<meta name="description">`은 안 본다 —
 *    그게 있었는데도 카카오 기본 문구가 떴던 이유다.
 *
 * ⚠️ 여기에 DB·네트워크·`navigator`가 들어오지 않는다. **무엇을 쓸지**만 정한다.
 *    값을 **조회**하는 것은 `lib/share-lookup.ts`(서버 전용)가 한다.
 */

/**
 * 카드 그림 — **사용자가 만든 디자인 원본**을 `public/og/`에 넣은 것이다
 * (2026-09-20). 원본 폴더는 다른 디자인 원본과 같이 `.gitignore` 대상이고,
 * 저장소에는 가공 결과만 들어간다.
 *
 * ⚠️ 교체할 때 **파일 이름과 확장자를 그대로 유지해라.** 이름을 바꾸면 여기와
 *    두 초대 경로를 같이 고쳐야 하고, 한 곳만 고치면 카드에 그림이 사라진다.
 *
 * ⚠️ 규격은 아래 `OG_IMAGE_WIDTH`·`HEIGHT`(1200×630)와 맞아야 한다. 그리고
 *    **300KB를 넘기지 마라** — 카카오 스크래퍼가 기다려 주는 시간이 짧다.
 */
export const OG_IMAGES = {
  default: "/og/default.jpg",
  challenge: "/og/challenge.jpg",
  invite: "/og/invite.jpg",
} as const;

/**
 * 카카오·페이스북·트위터 큰 카드 공통 안전값 (1.91:1).
 *
 * ⚠️ **실제 파일의 픽셀 크기와 같아야 한다.** 여기 적힌 값이 카카오에게 알려
 *    주는 크기라, 그림과 어긋나면 큰 카드가 아니라 작은 카드로 그려질 수 있다.
 */
export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;

export interface ShareMeta {
  title: string;
  description: string;
  /** `OG_IMAGES`의 한 값 */
  image: string;
}

/** 초대와 무관한 모든 주소가 쓰는 기본 카드 */
export const DEFAULT_SHARE: ShareMeta = {
  title: "GND — 친구 운동 챌린지",
  description:
    "혼자 하면 작심삼일, 같이 하면 4주. 친구와 목표를 걸고 운동해요 💪",
  image: OG_IMAGES.default,
};

/**
 * 닉네임을 문구에 쓸 수 있게 다듬는다.
 *
 * ⚠️ 카드는 **링크를 안 누른 사람에게도 보인다.** 단톡방에 전달되면 모르는
 *    사람도 본다. 그래서 닉네임 말고는(아바타·참가자 목록·UUID) 아무것도
 *    싣지 않는다 — 사용자 결정 D3(2026-09-20)의 경계다.
 *
 * ⚠️ 길이를 자른다. 닉네임은 사용자가 정하는 값이라 길이 상한이 없고, 카카오는
 *    제목을 잘라서 보여 준다 — 잘리는 자리가 **초대자 이름 한가운데**면 안 된다.
 */
const NICKNAME_MAX = 12;

function cleanNickname(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const v = String(raw).replace(/\s+/g, " ").trim();
  if (v === "") return null;
  return v.length > NICKNAME_MAX ? `${v.slice(0, NICKNAME_MAX)}…` : v;
}

/** 챌린지 이름도 같은 이유로 다듬는다 */
const CHALLENGE_NAME_MAX = 20;

function cleanChallengeName(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const v = String(raw).replace(/\s+/g, " ").trim();
  if (v === "") return null;
  return v.length > CHALLENGE_NAME_MAX
    ? `${v.slice(0, CHALLENGE_NAME_MAX)}…`
    : v;
}

/**
 * 챌린지 초대 카드 (`/c/[code]`).
 *
 * 넷 중 어느 조합이 와도 **문장이 된다.** 조회가 실패해도(둘 다 null) 카드가
 * 비지 않게 하는 것이 핵심이다 — 스크래퍼에게 빈 제목을 주면 카카오가 다시
 * `<title>`로 폴백해 버려 고친 의미가 없다.
 */
export function challengeShareMeta(input: {
  challengeName?: string | null;
  inviterNickname?: string | null;
}): ShareMeta {
  const name = cleanChallengeName(input.challengeName);
  const who = cleanNickname(input.inviterNickname);

  const title =
    who && name
      ? `${who}님이 ${name}에 초대했어요`
      : who
        ? `${who}님이 운동 챌린지에 초대했어요`
        : name
          ? `${name}, 같이 할래?`
          : "운동 챌린지에 초대받았어요";

  return {
    title,
    description:
      "링크를 누르면 바로 참여돼요. 친구와 목표를 걸고 4주 같이 운동해요 💪",
    image: OG_IMAGES.challenge,
  };
}

/**
 * 친구 초대 카드 (`/invite/[code]`).
 *
 * ⚠️ 챌린지 초대와 **다른 문구를 쓴다.** 이 앱엔 초대가 두 종류라, 같은 말을
 *    쓰면 받는 사람이 챌린지 초대로 오해한다(2026-08-07 사용자 질문이 정확히
 *    그것이었다 — `crew-card.tsx:83` 주석).
 */
export function friendInviteShareMeta(input: {
  inviterNickname?: string | null;
  /** 옛 그룹 코드(0061 이전)로 들어온 경우의 그룹 이름 */
  groupName?: string | null;
}): ShareMeta {
  const who = cleanNickname(input.inviterNickname);
  const group = cleanChallengeName(input.groupName);

  const title = who
    ? `${who}님이 GND 친구로 초대했어요`
    : group
      ? `${group} 크루에 초대받았어요`
      : "GND에 초대받았어요";

  return {
    title,
    description:
      "서로의 운동 기록이 보이면 안 빠지게 돼요. 링크를 누르면 바로 친구가 돼요 🙌",
    image: OG_IMAGES.invite,
  };
}
