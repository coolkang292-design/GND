import type { Metadata } from "next";

import { detailArtFor } from "@/lib/domain/challenge-art";
import { challengeJoinPath } from "@/lib/domain/challenge-invite";
import {
  challengeShareMeta,
  OG_IMAGE_HEIGHT,
  OG_IMAGE_WIDTH,
} from "@/lib/domain/share-meta";
import { lookupChallengeByInviteCode, lookupNickname } from "@/lib/share-lookup";

import { JoinRedirect } from "./join-redirect";

/**
 * 챌린지 초대 **공유 주소** — 카카오톡 카드를 만들기 위해 생긴 서버 경로
 * (2026-09-20, 사용자 결정 D1).
 *
 * ── 왜 새 경로인가 ──────────────────────────────────────────────────────
 *
 * 옛 공유 주소는 `/challenge?join=CODE&by=UID`였다. 그런데 `/challenge`는
 * `"use client"` 페이지(782줄)라 **`generateMetadata`를 내보낼 수 없고**,
 * `(tabs)/layout.tsx`의 `generateMetadata`는 `searchParams`를 못 받는다. 즉
 * 그 주소에는 초대별 카드를 붙일 길이 구조적으로 없다.
 *
 * 그래서 **서버 컴포넌트인 새 주소를 앞에 하나 둔다.** 참가 자체는 여전히
 * `/challenge?join=`이 한다 — `JoinRedirect`가 사람을 그리로 보낸다.
 * **참가 경로는 여전히 한 벌이다.**
 *
 * ⚠️ **옛 `/challenge?join=` 주소를 없애지 마라.** 카카오톡에 이미 뿌려진
 *    링크가 그 모양이다. 미리보기는 안 뜨지만 **동작은 해야 한다.**
 */

/** 초대 코드마다 카드가 달라야 하므로 정적 생성을 하지 않는다 */
export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ code: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** `?by=`가 배열로 올 수도 있다(중복 파라미터). 첫 값만 쓴다 */
function firstParam(v: string | string[] | undefined): string | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

export async function generateMetadata({
  params,
  searchParams,
}: Props): Promise<Metadata> {
  const [{ code: raw }, sp] = await Promise.all([params, searchParams]);
  const code = decodeURIComponent(raw);
  const by = firstParam(sp.by);

  // ⚠️ **여기서 던지면 안 된다.** `generateMetadata`가 500을 내면 스크래퍼는
  //    카드를 통째로 안 만든다. 두 조회 모두 무슨 일이 있어도 null을 준다
  //    (`share-lookup.ts`) — 그때는 이름 없는 기본 문구가 나간다.
  const [challenge, inviter] = await Promise.all([
    lookupChallengeByInviteCode(code),
    lookupNickname(by),
  ]);

  const share = challengeShareMeta({
    challengeName: challenge?.name,
    inviterNickname: inviter,
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

export default async function ChallengeSharePage({
  params,
  searchParams,
}: Props) {
  const [{ code: raw }, sp] = await Promise.all([params, searchParams]);
  const code = decodeURIComponent(raw);
  const by = firstParam(sp.by);

  const challenge = await lookupChallengeByInviteCode(code);
  const href = challengeJoinPath(code, by);

  /*
   * ⚠️ 이 화면은 **거의 안 보인다** — `JoinRedirect`가 즉시 참가 경로로 옮긴다.
   *    그래도 비워 두지 않는 이유가 셋이다:
   *      1. 카톡 인앱 브라우저·느린 3G에서는 이 화면이 1~2초 떠 있다. 공백이면
   *         "링크가 깨졌나"로 읽힌다
   *      2. 자바스크립트가 막힌 환경에서는 아래 `<a>`가 유일한 문이다
   *      3. 공유가 어떻게 끝났든 **실패로 보이면 안 된다**는 이 저장소의 규칙
   *         (`shareOutcomeMessage` 주석)이 여기에도 적용된다
   */
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={detailArtFor(challenge?.imageUrl)}
        alt=""
        className="aspect-[16/9] w-full max-w-[320px] rounded-card object-cover"
      />
      <h1 className="text-[21px] leading-snug font-extrabold tracking-tight">
        {challenge?.name ?? "운동 챌린지"}
      </h1>
      <p className="text-sm text-muted">참여하는 중…</p>
      <a
        href={href}
        className="rounded-card bg-accent px-5 py-2.5 text-sm font-extrabold text-accent-ink"
      >
        참여하기
      </a>
      <JoinRedirect href={href} />
    </main>
  );
}
