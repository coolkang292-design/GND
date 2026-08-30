"use client";

import { useRef, useState } from "react";

import { CheerPointModal } from "@/components/feed/cheer-point-modal";
import { cheerToastMessage } from "@/lib/domain/cheer-points";
import { sendCheer, SocialError, type CheerType } from "@/lib/social";

const CHEER_BUTTONS: { type: CheerType; emoji: string; label: string }[] = [
  { type: "fire", emoji: "🔥", label: "불태워" },
  { type: "power", emoji: "💪", label: "힘내" },
  { type: "clap", emoji: "👏", label: "멋져" },
  { type: "finish", emoji: "🏁", label: "끝까지" },
];

export function cheerErrorMessage(e: unknown): string {
  if (e instanceof SocialError) {
    if (e.code === "cheer_cooldown") return "잠시 후 다시 응원할 수 있어요";
    if (e.code === "cheer_limit") return "이 운동엔 3번까지 응원할 수 있어요";
    if (e.code === "not_active") return "운동이 방금 끝났어요";
  }
  return "응원을 보내지 못했어요";
}

/**
 * 응원 4버튼 + ✍️ 한마디 (Phase C에서 `ActiveWorkoutCard` 본문에서 뽑았다).
 *
 * 왜 뽑았나: 홈은 카드 안에서, 피드 스토리 트레이는 시트 안에서 **같은 응원**을
 * 한다. 두 벌로 만들면 응원 상한(3회)·쿨다운 문구·포인트 팝업이 갈라지고,
 * 갈라지면 한쪽만 고쳐진다. 실제로 `buildParticipantInput`이 세 벌이 될 뻔한
 * 전례가 있다(challenge.ts 주석).
 *
 * 상태(보냄·전송중·포인트 팝업)를 자기가 갖는다. 부모는 어느 세션인지와 누구인지만
 * 준다.
 */
export function CheerActions({
  sessionId,
  nickname,
  onSent,
}: {
  sessionId: string;
  nickname: string;
  /** 응원이 실제로 나간 뒤 — 시트를 닫는 등 부모가 할 일이 있으면 */
  onSent?: () => void;
}) {
  const [sent, setSent] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [sending, setSending] = useState(false);
  /** 지급받은 포인트. 0이면 팝업 없이 토스트만 (하루 1회 상한). */
  const [earned, setEarned] = useState<number | null>(null);
  const messageRef = useRef<HTMLInputElement>(null);

  async function cheer(type: CheerType, message?: string) {
    setSending(true);
    setNotice(null);
    try {
      const { pointsAwarded } = await sendCheer(sessionId, type, message);
      setSent(true);
      setCustomOpen(false);
      if (pointsAwarded > 0) {
        // 받았을 때만 팝업. 토스트는 3초 뒤 사라져서 "받았나?"가 남는다.
        setEarned(pointsAwarded);
      } else {
        setNotice(cheerToastMessage(pointsAwarded));
        setTimeout(() => setNotice(null), 3000);
      }
      setTimeout(() => setSent(false), 3000);
      onSent?.();
    } catch (e) {
      setNotice(cheerErrorMessage(e));
      setTimeout(() => setNotice(null), 3000);
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <div className="mt-3 flex gap-1.5">
        {CHEER_BUTTONS.map((b) => (
          <button
            key={b.type}
            onClick={() => void cheer(b.type)}
            disabled={sent || sending}
            className="flex-1 rounded-card-sm border border-line bg-surface-2 py-2 text-center disabled:opacity-50"
          >
            <span className="block text-base">{b.emoji}</span>
            <span className="block text-[10px] font-bold text-muted">{b.label}</span>
          </button>
        ))}
        <button
          onClick={() => setCustomOpen((v) => !v)}
          disabled={sent || sending}
          className="flex-1 rounded-card-sm border border-line bg-surface-2 py-2 text-center disabled:opacity-50"
        >
          <span className="block text-base">✍️</span>
          <span className="block text-[10px] font-bold text-muted">한마디</span>
        </button>
      </div>

      {customOpen && (
        <div className="mt-2 flex gap-1.5">
          <input
            ref={messageRef}
            maxLength={30}
            placeholder="응원 한마디 (30자)"
            className="h-10 flex-1 rounded-card-sm border border-line bg-bg px-3 text-sm outline-none focus:border-accent"
          />
          <button
            onClick={() => {
              const msg = (messageRef.current?.value ?? "").trim();
              if (msg) void cheer("custom", msg);
            }}
            disabled={sending}
            className="h-10 rounded-card-sm bg-accent px-3.5 text-sm font-extrabold text-accent-ink disabled:opacity-60"
          >
            보내기
          </button>
        </div>
      )}

      {earned !== null && (
        <CheerPointModal
          points={earned}
          nickname={nickname}
          onClose={() => setEarned(null)}
        />
      )}

      {notice && <p className="mt-2 text-xs font-bold text-accent">{notice}</p>}
    </>
  );
}
