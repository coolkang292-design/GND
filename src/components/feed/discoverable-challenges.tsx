"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/avatar";
import { useAuth } from "@/components/auth-provider";
import {
  getDiscoverableChallenges,
  joinDiscoverableChallenge,
  type DiscoverableChallenge,
} from "@/lib/challenge";

/** `2026-09-01` → `9/1` */
function shortDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${Number(m)}/${Number(d)}`;
}

function joinErrorMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : "";
  if (msg.includes("already_joined")) return "이미 참가 중이에요";
  if (msg.includes("not_discoverable")) return "모집이 끝난 챌린지예요";
  if (msg.includes("invalid_status")) return "이미 시작한 챌린지예요";
  return "참가하지 못했어요";
}

/**
 * 같이 할 챌린지 — 피드의 공개 모집 줄 (0085).
 *
 * ⚠️ **운동 게시물 사이에 끼워 넣지 않는다.** 진행 중 카드 아래, 날짜별 피드
 *    위에 가로 한 줄로 둔다. 게시물 사이에 반복 삽입하면 광고처럼 읽힌다.
 *
 * ⚠️⚠️ **크루가 0명인 신규 사용자에게도 보여야 한다.** 이 컴포넌트는 피드 목록과
 *    독립적으로 스스로 조회한다 — `getCrewFeed` 결과가 0이라고 이것까지 숨기면,
 *    **이 기능이 가장 필요한 사람에게 안 보인다.**
 *
 * ⚠️ 공개 챌린지가 0개면 영역 자체를 그리지 않는다. 빈 제목만 남으면 고장 같다.
 *
 * ⚠️ 이미 참가한 방을 목록에서 **감추지 않는다.** 감추면 내가 들어간 방이 갑자기
 *    사라진 것처럼 보인다 — 버튼만 `참가 중 · 보기`로 바꾼다.
 */
export function DiscoverableChallenges() {
  const { userId, loading, configured } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<DiscoverableChallenge[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!configured || loading || !userId) return;
    let cancelled = false;
    void (async () => {
      // 실패해도 던지지 않는다(`getDiscoverableChallenges`가 빈 배열을 준다) —
      // 모집 카드는 부가 정보라 피드 전체를 막으면 안 된다.
      const list = await getDiscoverableChallenges();
      if (!cancelled) setItems(list);
    })();
    return () => {
      cancelled = true;
    };
  }, [configured, loading, userId]);

  async function join(challenge: DiscoverableChallenge) {
    if (busyId) return;
    if (challenge.alreadyJoined) {
      router.push(`/challenge?open=${challenge.id}`);
      return;
    }
    setBusyId(challenge.id);
    setError(null);
    try {
      await joinDiscoverableChallenge(challenge.id);
      // 참가 뒤에는 기존 챌린지 화면으로 보낸다 — 목표 설정·시작 흐름은 거기 있다
      router.push(`/challenge?open=${challenge.id}`);
    } catch (e) {
      setError(joinErrorMessage(e));
      // 방장이 방금 시작했거나 모집을 껐으면 목록에서 뺀다
      setItems((prev) => prev.filter((c) => c.id !== challenge.id));
    } finally {
      setBusyId(null);
    }
  }

  /*
    ⚠️⚠️ `items.length === 0`만 보고 null을 돌려주면, **거절 직후 마지막 카드를
       뺐을 때 오류 문구까지 같이 사라진다** — 사용자는 왜 안 됐는지 못 본다.
       (`discoverable-challenges.test.tsx`가 이 회귀를 잡는다.)
  */
  if (items.length === 0 && !error) return null;

  return (
    <section className="flex flex-col gap-2">
      <p className="flex items-center gap-2 text-xs font-extrabold text-muted">
        <span className="text-accent">🏆</span> 같이 할 챌린지
      </p>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {items.map((c) => (
          <article
            key={c.id}
            className="flex w-[210px] flex-none flex-col gap-2 rounded-card border border-line bg-surface p-3 shadow-card"
          >
            <div className="flex items-center gap-2">
              <Avatar
                src={c.hostAvatarUrl}
                className="flex h-6 w-6 flex-none items-center justify-center overflow-hidden rounded-full bg-surface-2 text-xs"
              />
              <p className="min-w-0 flex-1 truncate text-[11.5px] font-bold text-muted">
                {c.hostNickname}
              </p>
            </div>

            <p className="line-clamp-2 text-[13.5px] leading-snug font-extrabold">
              {c.name}
            </p>

            <p className="text-[11.5px] font-bold text-muted">
              {shortDate(c.startDate)} 시작 · 참가 {c.participantCount}명
              {c.photoRequired && <span className="ml-1">· 📷 인증</span>}
            </p>

            <button
              type="button"
              onClick={() => void join(c)}
              disabled={busyId === c.id}
              className={`mt-0.5 h-9 rounded-card-sm text-[12.5px] font-extrabold disabled:opacity-60 ${
                c.alreadyJoined
                  ? "border border-line bg-surface-2 text-muted"
                  : "bg-accent text-accent-ink"
              }`}
            >
              {busyId === c.id
                ? "…"
                : c.alreadyJoined
                  ? "참가 중 · 보기"
                  : "참여하기"}
            </button>
          </article>
        ))}
      </div>

      {error && <p className="text-[11.5px] font-bold text-accent">{error}</p>}
    </section>
  );
}
