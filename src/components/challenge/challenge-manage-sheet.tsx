"use client";

import { BottomSheet, SheetHeader } from "@/components/challenge/bottom-sheet";
import { InviteSheet } from "@/components/challenge/invite-sheet";
import { UiIcon } from "@/components/ui-icon";
import type { MyChallenge } from "@/lib/challenge";

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
            <UiIcon name="trash" /> 챌린지 취소하기
          </button>
        </section>
      )}
    </BottomSheet>
  );
}
