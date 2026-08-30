"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/avatar";
import { useAuth } from "@/components/auth-provider";
import { ReportBlockSheet } from "@/components/moderation/report-block-sheet";
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
 * 모집 중인 챌린지 조회 (0085).
 *
 * ⚠️⚠️ **피드 목록과 무관하게 스스로 조회한다.** `getCrewFeed` 결과가 0이라고
 *    이것까지 숨기면 **크루가 0명인 신규 사용자에게 안 보인다** — 이 기능이
 *    가장 필요한 사람이다.
 *
 * 실패해도 던지지 않는다(`getDiscoverableChallenges`가 빈 배열을 준다) —
 * 모집은 부가 정보라 피드 화면 전체를 막으면 손해가 더 크다.
 */
export function useDiscoverableChallenges() {
  const { userId, loading, configured } = useAuth();
  const [items, setItems] = useState<DiscoverableChallenge[]>([]);

  useEffect(() => {
    if (!configured || loading || !userId) return;
    let cancelled = false;
    void (async () => {
      const list = await getDiscoverableChallenges();
      if (!cancelled) setItems(list);
    })();
    return () => {
      cancelled = true;
    };
  }, [configured, loading, userId]);

  return { items, setItems };
}

function JoinButton({
  challenge,
  busy,
  onJoin,
  size = "md",
}: {
  challenge: DiscoverableChallenge;
  busy: boolean;
  onJoin: () => void;
  size?: "md" | "lg";
}) {
  return (
    <button
      type="button"
      onClick={onJoin}
      disabled={busy}
      className={`rounded-card-sm font-extrabold disabled:opacity-60 ${
        size === "lg" ? "h-12 text-sm" : "h-11 text-[13px]"
      } ${
        challenge.alreadyJoined
          ? "border border-line bg-surface-2 text-muted"
          : "bg-accent text-accent-ink"
      }`}
    >
      {busy ? "…" : challenge.alreadyJoined ? "참가 중 · 보기" : "참여하기"}
    </button>
  );
}

/**
 * 모집글 상세 (2026-08-31 사용자 지시 — *"해당 게시글을 클릭하면 모집글의 상세를
 * 확인할 수 있게"*).
 *
 * ⚠️ 카드는 목록이라 글을 **잘라서** 보여준다(`line-clamp-2`). 잘린 글을 끝까지
 *    읽을 자리가 없으면 150자를 쓸 이유가 없다. 여기서 통째로 보여준다.
 */
function RecruitDetailSheet({
  challenge,
  busy,
  onJoin,
  onClose,
  onReport,
}: {
  challenge: DiscoverableChallenge;
  busy: boolean;
  onJoin: () => void;
  onClose: () => void;
  /** 신고·차단 시트를 연다 (0089) */
  onReport: () => void;
}) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/40"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="recruit-detail-title"
        className="fixed inset-x-0 bottom-0 z-50 flex max-h-[85dvh] flex-col overflow-y-auto rounded-t-[22px] border-t border-line bg-surface pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-card"
      >
        <div className="mx-auto my-3 h-1 w-10 flex-none rounded-full bg-line" />

        {challenge.recruitImageUrl && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={challenge.recruitImageUrl}
            alt=""
            className="aspect-[16/9] w-full object-cover"
          />
        )}

        <div className="flex flex-col gap-3 p-5">
          <div className="flex items-center gap-2.5">
            <Avatar
              src={challenge.hostAvatarUrl}
              className="flex h-9 w-9 flex-none items-center justify-center overflow-hidden rounded-full bg-surface-2 text-lg"
            />
            <p className="min-w-0 flex-1 truncate text-[13px] font-bold text-muted">
              {challenge.hostNickname}
            </p>
          </div>

          <h3
            id="recruit-detail-title"
            className="text-lg leading-snug font-extrabold"
          >
            {challenge.name}
          </h3>

          {challenge.recruitNote && (
            /* 줄바꿈을 지킨다 — 방장이 나눠 쓴 것을 한 줄로 붙이지 않는다 */
            <p className="text-sm leading-relaxed break-words whitespace-pre-line">
              {challenge.recruitNote}
            </p>
          )}

          <dl className="mt-1 grid grid-cols-2 gap-2">
            <div className="rounded-card-sm border border-line bg-surface-2 px-3 py-2">
              <dt className="text-[11px] text-muted">기간</dt>
              <dd className="mt-0.5 text-[13px] font-extrabold">
                {shortDate(challenge.startDate)} ~ {shortDate(challenge.endDate)}
              </dd>
            </div>
            <div className="rounded-card-sm border border-line bg-surface-2 px-3 py-2">
              <dt className="text-[11px] text-muted">참가</dt>
              <dd className="mt-0.5 text-[13px] font-extrabold">
                {challenge.participantCount}명
              </dd>
            </div>
          </dl>

          <p className="text-[11.5px] text-faint">
            {challenge.photoRequired
              ? "📷 인증사진을 올린 운동만 집계돼요."
              : "인증사진 없이도 집계돼요."}{" "}
            참가해도 서로 크루가 되지는 않아요.
          </p>

          <JoinButton
            challenge={challenge}
            busy={busy}
            onJoin={onJoin}
            size="lg"
          />
          <button
            type="button"
            onClick={onClose}
            className="h-11 rounded-card border border-line bg-surface text-[13px] font-bold text-muted"
          >
            닫기
          </button>

          {/* 신고·차단 (0089). 참여 버튼과 **같은 무게로 두지 않는다** — 작고
              조용한 글씨다. 대부분의 사람은 이걸 평생 안 누르고, 눈에 띄게
              두면 목록 전체가 의심스러운 곳처럼 읽힌다. */}
          <button
            type="button"
            onClick={onReport}
            className="mt-1 self-center text-[11.5px] font-bold text-faint underline underline-offset-2"
          >
            이 모집글 신고 · 차단
          </button>
        </div>
      </div>
    </>
  );
}

/**
 * 챌린지 모집 목록 (0085 · 탭 분리·사진·상세 2026-08-31).
 *
 * ⚠️ **세로 목록이다.** 처음엔 피드 위에 가로 스크롤 한 줄로 얹었는데, 그러면
 *    화면 위쪽을 통째로 먹어 **첫 운동 게시물이 접힘선 밖으로 밀렸다**
 *    (사용자 화면 확인). 지금은 전용 탭이라 세로로 펼친다.
 *
 * ⚠️ 이미 참가한 방을 **감추지 않는다.** 감추면 내가 들어간 방이 갑자기 사라진
 *    것처럼 보인다 — 버튼만 `참가 중 · 보기`로 바꾼다.
 */
export function DiscoverableChallengeList({
  items,
  setItems,
}: {
  items: DiscoverableChallenge[];
  setItems: (
    update: (prev: DiscoverableChallenge[]) => DiscoverableChallenge[],
  ) => void;
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<DiscoverableChallenge | null>(null);
  const [moderating, setModerating] = useState<DiscoverableChallenge | null>(null);

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
      // 참가 뒤에는 기존 챌린지 화면으로 — 목표 설정·시작 흐름이 거기 있다
      router.push(`/challenge?open=${challenge.id}`);
    } catch (e) {
      setError(joinErrorMessage(e));
      setDetail(null);
      // 방장이 방금 시작했거나 모집을 껐으면 계속 눌러도 계속 실패한다 — 뺀다
      setItems((prev) => prev.filter((c) => c.id !== challenge.id));
    } finally {
      setBusyId(null);
    }
  }

  if (items.length === 0 && !error) {
    return (
      <section className="rounded-card border border-line bg-surface p-5 text-center shadow-card">
        <p className="text-sm font-bold">지금은 모집 중인 챌린지가 없어요</p>
        <p className="mt-1 text-xs text-muted">
          챌린지 탭에서 방을 만들고 <b className="text-text">챌린지 초대</b> 안의{" "}
          <b className="text-text">피드에서 참가자 구하기</b>를 켜면 여기 올라와요.
        </p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3">
      {items.map((c) => (
        <article
          key={c.id}
          className="overflow-hidden rounded-card border border-line bg-surface shadow-card"
        >
          {/* 카드 본문 전체가 상세 버튼이다.
              ⚠️ `참여하기`를 이 버튼 **안**에 넣지 마라. 중첩 버튼은 유효하지 않은
                 HTML이고, 참여를 눌러도 상세가 먼저 열린다. */}
          <button
            type="button"
            onClick={() => setDetail(c)}
            aria-label={`${c.name} 모집글 자세히 보기`}
            className="block w-full text-left"
          >
            {c.recruitImageUrl && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={c.recruitImageUrl}
                alt=""
                loading="lazy"
                className="aspect-[16/9] w-full object-cover"
              />
            )}

            <div className="flex flex-col gap-2 px-4 pt-3.5">
              <div className="flex items-center gap-2">
                <Avatar
                  src={c.hostAvatarUrl}
                  className="flex h-7 w-7 flex-none items-center justify-center overflow-hidden rounded-full bg-surface-2 text-sm"
                />
                <p className="min-w-0 flex-1 truncate text-[12px] font-bold text-muted">
                  {c.hostNickname}
                </p>
              </div>

              <p className="text-[15px] leading-snug font-extrabold">{c.name}</p>

              {/* 모집글 (0087). 없으면 안 그린다 — 이름만으로는 참여를 결정할
                  근거가 없다. 잘린 나머지는 상세에서 읽는다. */}
              {c.recruitNote && (
                <p className="line-clamp-2 text-[13px] leading-snug break-words text-muted">
                  {c.recruitNote}
                </p>
              )}

              <p className="text-[12px] font-bold text-muted">
                {shortDate(c.startDate)} ~ {shortDate(c.endDate)} · 참가{" "}
                {c.participantCount}명
                {c.photoRequired && <span className="ml-1">· 📷 인증</span>}
              </p>
            </div>
          </button>

          <div className="flex flex-col px-4 pt-2.5 pb-3.5">
            <JoinButton
              challenge={c}
              busy={busyId === c.id}
              onJoin={() => void join(c)}
            />
          </div>
        </article>
      ))}

      {error && <p className="text-[12px] font-bold text-accent">{error}</p>}

      {detail && (
        <RecruitDetailSheet
          challenge={detail}
          busy={busyId === detail.id}
          onJoin={() => void join(detail)}
          onClose={() => setDetail(null)}
          onReport={() => setModerating(detail)}
        />
      )}

      {moderating && (
        <ReportBlockSheet
          targetId={moderating.hostId}
          targetNickname={moderating.hostNickname}
          challengeId={moderating.id}
          onClose={() => setModerating(null)}
          onBlocked={() => {
            // ⚠️ 그 모집글 하나가 아니라 **그 방장의 글 전부**를 뺀다. 한 방장이
            //    여러 방을 갖고 있을 수 있고(옛 글은 만료 전까지 남는다), 하나만
            //    빼면 차단했는데 같은 사람 카드가 그대로 남아 있다.
            setItems((prev) => prev.filter((c) => c.hostId !== moderating.hostId));
            setDetail(null);
            setModerating(null);
          }}
        />
      )}
    </section>
  );
}
