import type { Metadata } from "next";

import { normalizeInviteCode } from "@/lib/domain/invite-code";
import {
  friendInviteShareMeta,
  OG_IMAGE_HEIGHT,
  OG_IMAGE_WIDTH,
} from "@/lib/domain/share-meta";
import { lookupInviteOwner } from "@/lib/share-lookup";

import { InviteClient } from "./invite-client";

/**
 * 친구 초대 링크 — **카카오톡 공유 카드를 만들기 위한 서버 껍데기** (2026-09-20).
 *
 * 화면을 그리는 일은 `InviteClient`가 그대로 한다. 이 파일이 서버 컴포넌트인
 * 이유는 하나뿐이다: **`generateMetadata`는 서버 컴포넌트에서만 내보낼 수 있다.**
 *
 * ⚠️ 카카오 스크래퍼는 자바스크립트를 안 돌린다. 클라이언트에서 `document.title`을
 *    바꾸는 식으로는 **절대 안 된다** — 서버가 뱉는 HTML에 태그가 있어야 한다.
 */

/**
 * ⚠️ 초대 코드마다 카드가 달라야 하므로 정적 생성을 하지 않는다.
 *    (`generateMetadata`가 DB를 읽는 것만으로도 동적이 되지만, 의도를 못 박는다.)
 */
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ code: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code: raw } = await params;

  // ⚠️ **여기서 던지면 안 된다.** `generateMetadata`가 예외를 내면 페이지가
  //    500이 되고 스크래퍼는 카드를 통째로 안 만든다. `lookupInviteOwner`는
  //    무슨 일이 있어도 null을 주고, 그때는 이름 없는 기본 문구가 나간다.
  const code = normalizeInviteCode(decodeURIComponent(raw)) ?? "";
  const owner = code ? await lookupInviteOwner(code) : null;

  const share = friendInviteShareMeta({
    inviterNickname: owner?.nickname,
    groupName: owner?.groupName,
  });

  return {
    title: share.title,
    description: share.description,
    openGraph: {
      type: "website",
      siteName: "GND",
      locale: "ko_KR",
      title: share.title,
      description: share.description,
      images: [
        {
          url: share.image,
          width: OG_IMAGE_WIDTH,
          height: OG_IMAGE_HEIGHT,
          alt: share.title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: share.title,
      description: share.description,
      images: [share.image],
    },
  };
}

export default async function InvitePage({ params }: Props) {
  const { code } = await params;
  return <InviteClient code={code} />;
}
