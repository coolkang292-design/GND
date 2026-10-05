"use client";

import { BottomSheet, SheetHeader } from "@/components/challenge/bottom-sheet";
import { InviteSheet } from "@/components/challenge/invite-sheet";
import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { setChallengeLiveRanking, type MyChallenge } from "@/lib/challenge";

const TITLE_ID = "challenge-manage-title";

/**
 * 챌린지 관리 (⋯) — 방장만 (2026-09-18 챌린지 탭 개편).
 *
 * 옛 상세 화면은 닉네임 초대·공개 모집·모집글·모집 사진·링크를 **본문에 전부**
 * 펼쳐 놓았다. 참가자가 할 일(목표·운동)이 그 아래로 밀렸다. 방장의 관리 기능은
 * 여기로 옮기고 본문에는 대표 버튼 하나만 남긴다.
 *
 * ⚠️ **기능을 새로 짜지 않았다.** `InviteSheet`를 그대로 품는다 — 닉네임 초대
 *    (`invite_to_challenge`), 공개 모집(`discoverable` UPDATE + 방장당 1건 규칙),
 *    모집글·사진(0087), 링크(0091 `by`)가 전부 그 안에 있고 테스트도 그대로다.
 *
 * ⚠️ 초대 링크 공유는 **방장 전용이 아니다**(0091). 참가자는 상세 상단의
 *    공유 버튼을 쓴다 — 여기에만 두면 참가자가 링크를 못 뿌린다.
 */
export function ChallengeManageSheet({
  challenge,
  busy,
  onChanged,
  onCancelChallenge,
  onClose,
}: {
  challenge: MyChallenge;
  busy: boolean;
  /** 초대·모집 설정이 바뀌었다 — 화면을 다시 읽는다 */
  onChanged: () => void;
  onCancelChallenge: () => void;
  onClose: () => void;
}) {
  const cancellable = challenge.status === "setup" || challenge.status === "active";
  /**
   * 실시간 랭킹 공개 (0115) — **시작 전(setup)에만** 바꿀 수 있다(사용자 결정 2026-10-05).
   * 서버 트리거도 같은 규칙으로 막는다. 낙관적으로 바꾸고 실패하면 되돌린다.
   */
  const [live, setLive] = useState(challenge.live_ranking);
  const [liveBusy, setLiveBusy] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);
  async function toggleLive() {
    if (liveBusy) return;
    const next = !live;
    setLive(next);
    setLiveBusy(true);
    setLiveError(null);
    try {
      await setChallengeLiveRanking(challenge.id, next);
      onChanged();
    } catch (e) {
      setLive(!next);
      setLiveError(
        e instanceof Error && e.message === "live_ranking_locked"
          ? "챌린지가 시작돼서 더는 바꿀 수 없어요"
          : "저장하지 못했어요. 잠시 뒤 다시 눌러 주세요",
      );
    } finally {
      setLiveBusy(false);
    }
  }

  return (
    <BottomSheet
      titleId={TITLE_ID}
      onClose={onClose}
      header={<SheetHeader titleId={TITLE_ID} title="챌린지 관리" onClose={onClose} />}
    >
      <InviteSheet
        challengeId={challenge.id}
        myRole={challenge.myRole}
        status={challenge.status}
        discoverable={challenge.discoverable}
        recruitNote={challenge.recruit_note}
        recruitImageUrl={challenge.recruit_image_url}
        onInvited={onChanged}
      />

      <section className="mt-3 rounded-card border border-line bg-surface p-4">
        <button
          type="button"
          role="switch"
          aria-checked={live}
          onClick={() => void toggleLive()}
          disabled={challenge.status !== "setup" || liveBusy}
          className="flex w-full items-center gap-3 text-left disabled:opacity-60"
        >
          <Icon name="ranking" size={22} className={live ? "text-accent" : "text-muted"} />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-extrabold">실시간 랭킹 공개</span>
            <span className="block text-[11.5px] text-muted">
              {challenge.status === "setup"
                ? "켜면 진행 중에도 종합점수 TOP 3와 내 순위가 보여요 · 시작 전까지만 바꿀 수 있어요"
                : "챌린지가 시작돼서 바꿀 수 없어요"}
            </span>
          </span>
          <span
            aria-hidden
            className={`relative h-6 w-11 flex-none rounded-full transition-colors ${
              live ? "bg-accent" : "bg-surface-3"
            }`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                live ? "translate-x-[22px]" : "translate-x-0.5"
              }`}
            />
          </span>
        </button>
        {liveError && <p className="mt-2 text-[11.5px] font-bold text-danger">{liveError}</p>}
      </section>

      {cancellable && (
        <section className="mt-3 rounded-card border border-line bg-surface p-4">
          <h3 className="text-sm font-extrabold">챌린지 취소</h3>
          <p className="mt-0.5 text-[11.5px] text-muted">
            취소하면 되돌릴 수 없어요. 참가자 모두에게서 사라져요.
          </p>
          <button
            type="button"
            onClick={onCancelChallenge}
            disabled={busy}
            className="mt-2.5 h-11 w-full rounded-card-sm border border-line bg-surface-2 text-[13px] font-bold text-warn disabled:opacity-50"
          >
            <span className="inline-flex items-center gap-1.5">
              <Icon name="trash" size={15} /> 챌린지 취소하기
            </span>
          </button>
        </section>
      )}
    </BottomSheet>
  );
}
