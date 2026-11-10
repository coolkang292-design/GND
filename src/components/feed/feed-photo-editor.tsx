"use client";

import { useRef, useState } from "react";
import { SessionPhotoManager } from "@/components/record/session-photo-manager";
import { Icon } from "@/components/ui/icon";
import { dayKey, resolveTimeZone } from "@/lib/domain/time";
import type { SessionPhoto } from "@/lib/domain/workout-photos";
import type { FeedItem } from "@/lib/social";

/**
 * 내 피드 카드에서 **사진 추가·삭제·순서** (사용자 지시 2026-11-11 "피드 자체를 수정하도록").
 *
 * 기록 완료 화면의 `SessionPhotoManager`를 그대로 쓴다 — 올리기(촬영·앨범)·삭제·순서·인증 상태
 * 정리가 이미 그 안에 있어서, 여기서 따로 만들면 규칙이 두 갈래로 갈라진다.
 *
 * ⚠️ **오늘 올린 카드만** 고칠 수 있다. 사진을 나중에 붙이는 창이 "같은 날"인 것과 같은 이유다
 *    (`domain/photo-window.ts`) — 지난 기록을 소급해서 바꾸지 못하게 한다. 지난 카드에는 버튼을
 *    안 그린다.
 *
 * ⚠️ 같은 날 운동을 합친 카드는 **사진이 운동(세션)마다 따로 붙어 있다.** 사진 인증이 필요한
 *    챌린지는 세션마다 사진을 보기 때문에, 한 운동의 사진을 다른 운동으로 옮기지 않는다.
 *    그래서 묶인 카드는 운동별 칸으로 나눠 보여 준다.
 */
export function FeedPhotoEditor({
  item,
  userId,
  onItemChange,
  onToast,
}: {
  item: FeedItem;
  userId: string;
  onItemChange: (next: FeedItem) => void;
  onToast?: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  // 세션별 현재 사진 — 한 칸이 바뀌면 카드 전체 사진을 다시 모아 올린다
  const bySession = useRef(new Map<string, SessionPhoto[]>());

  const tz = resolveTimeZone();
  const isToday = dayKey(item.completedAt, tz) === dayKey(new Date(), tz);
  if (!isToday) return null;

  function handleChange(sessionId: string, list: SessionPhoto[]) {
    bySession.current.set(sessionId, list);
    const photos = item.sessionIds.flatMap(
      (id) => bySession.current.get(id) ?? [],
    );
    // 아직 불러오지 못한 칸이 있으면 기존 사진을 지우지 않는다
    const loaded = item.sessionIds.every((id) => bySession.current.has(id));
    if (loaded) onItemChange({ ...item, photos });
  }

  return (
    <div className="flex flex-col gap-2" data-testid="feed-photo-editor">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex min-h-[32px] items-center gap-1 self-start text-[12px] font-bold text-accent"
      >
        <Icon name="camera" size={14} />
        {open ? "사진 관리 닫기" : "사진 추가·삭제"}
      </button>
      {open && (
        <div className="flex flex-col gap-3 rounded-card-sm border border-line bg-surface-2/60 p-3">
          {item.sessionIds.map((id, index) => (
            <div key={id} className="flex flex-col gap-1.5">
              {item.sessionIds.length > 1 && (
                <p className="text-[11.5px] font-bold text-muted">
                  {index + 1}번째 운동
                </p>
              )}
              <SessionPhotoManager
                userId={userId}
                sessionId={id}
                onToast={onToast ?? (() => {})}
                onPhotosChange={(list) => handleChange(id, list)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
