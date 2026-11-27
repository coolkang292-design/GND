"use client";

import Link from "next/link";
import { useState } from "react";
import { FeedItemCard } from "@/components/feed/feed-item";
import { Icon } from "@/components/ui/icon";
import { primeCharacterFaces } from "@/lib/character-faces";
import { buildExampleFeed, exampleCharacterFaces } from "@/lib/domain/example-tour";

/** 피드에 펼칠 예시 — 사진 2장+댓글(민수), 처음 온 사람(유진), 아침 러닝(지은). 최신이 위 */
const PREVIEW_SESSIONS = [
  "example-session-minsu",
  "example-session-yujin",
  "example-session-jieun",
] as const;

/**
 * 크루가 0명인 사람의 피드에 **처음부터 펼쳐 두는** 예시 (2026-11-26 사용자 결정).
 *
 * > "맨 처음 조인하는 사람이 피드로 랜딩이 되게 하고 피드에 디폴트로 업데이트"
 *
 * 링크 뒤에 숨겨 두면 아무도 안 누른다. 그래서 진짜 피드 자리에 예시 카드 셋을 펼친다.
 * 전체 이야기(순위·결과)는 `/feed/example`.
 *
 * ⚠️ **크루가 생기면 사라진다**(사용자가 고른 조건). 내 운동을 올려도 남는다 — 혼자 운동한
 *    사람도 "다른 사람들은 이렇게 한다"를 계속 볼 수 있어야 한다. 조건은 부르는 쪽(피드)이 건다.
 * ⚠️ 진짜 게시물과 섞여 보이면 안 된다 — 점선 테두리로 묶고 "예시 · 실제 회원이 아니에요"
 *    띠를 붙인다. 띠는 이 묶음 안에서 스크롤해도 위에 붙어 있다.
 * ⚠️ 카드는 `demo`다. 서버에 쓰는 길이 전부 닫혀 있다(`feed-item-demo.test.tsx`).
 */
export function ExampleFeedPreview({
  viewerId,
  onOpenRecruit,
}: {
  viewerId: string;
  /** 피드 안의 "챌린지 모집" 탭으로 바꾼다 */
  onOpenRecruit: () => void;
}) {
  const [items] = useState(() => {
    // 자식 카드가 그려지기 **전에** 얼굴을 넣어 둬야 첫 화면부터 캐릭터가 뜬다
    primeCharacterFaces(exampleCharacterFaces());
    const all = buildExampleFeed(new Date());
    return PREVIEW_SESSIONS.map((id) => all.find((i) => i.sessionId === id)).filter(
      (i): i is NonNullable<typeof i> => i !== undefined,
    );
  });

  return (
    <section
      aria-label="예시 피드"
      data-testid="example-feed-preview"
      className="flex flex-col gap-3 rounded-card border border-dashed border-accent/50 p-2.5"
    >
      <p
        role="note"
        className="sticky top-0 z-10 flex items-center justify-center gap-1.5 rounded-full border border-accent/40 bg-bg/95 px-3 py-2 text-[12.5px] font-extrabold text-accent backdrop-blur"
      >
        <Icon name="eye" size={15} />
        예시 · 실제 회원이 아니에요
      </p>
      <div className="px-1.5">
        <h2 className="text-[17px] font-black">챌린지는 이렇게 흘러가요</h2>
        <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted">
          크루와 챌린지를 하면 서로의 운동이 이렇게 올라와요. 크루가 생기면 이 예시는 사라지고 크루의 운동이
          여기에 떠요.
        </p>
      </div>

      {items.map((item) => (
        <FeedItemCard
          key={item.sessionId}
          item={item}
          userId={viewerId}
          onProfileClick={() => {}}
          demo
          openComments={item.sessionId === "example-session-minsu"}
        />
      ))}

      <div className="flex flex-col gap-2 px-0.5 pt-1">
        <button
          type="button"
          onClick={onOpenRecruit}
          className="flex min-h-[46px] items-center justify-center gap-1.5 rounded-card-sm bg-accent text-[14.5px] font-extrabold text-accent-ink"
        >
          모집 중인 챌린지 보러 가기
          <Icon name="arrow" size={16} />
        </button>
        <Link
          href="/feed/example"
          className="flex min-h-[42px] items-center justify-center gap-1 rounded-card-sm border border-line text-[13px] font-bold text-muted"
        >
          순위·결과까지 전체 흐름 보기
          <Icon name="chevron" size={14} />
        </Link>
      </div>
    </section>
  );
}
