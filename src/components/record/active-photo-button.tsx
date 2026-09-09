"use client";

import { useEffect, useRef, useState } from "react";
import { UiIcon } from "@/components/ui-icon";
import { compressImage } from "@/lib/image";
import { listSessionPhotoRows, uploadWorkoutImage } from "@/lib/workout";
import {
  MAX_WORKOUT_PHOTOS,
  canAddWorkoutPhoto,
} from "@/lib/domain/workout-photos";

/**
 * 운동 **중**에 사진을 찍는 아주 작은 버튼 (0103, 계획 §7).
 *
 * ⚠️⚠️ **운동 중에는 아무것도 묻지 않는다.** 캡션·편집·필터·공개 범위·태그·
 * 사진 순서 — 하나도 없다. 지금 화면을 보는 사람은 **땀나고 숨찬 상태**이고,
 * 세트 사이의 쉬는 시간을 쓰고 있다. 지불할 수 있는 비용은 탭 한 번이다.
 * 정리는 완료 화면에서 한다(`SessionPhotoManager`).
 *
 * ⚠️⚠️ **업로드를 기다리게 하지 않는다.** 촬영 → 압축 → 업로드 **시작** →
 * 곧바로 운동 화면. `await` 하지 않는 것이 이 컴포넌트의 요점이다.
 * 다만 조용히 실패하면 안 되므로 올리는 중 표시와 실패 토스트를 남긴다.
 *
 * ⚠️ **여기서 인증을 확정하지 않는다.** `set_workout_verification`은
 * `status = 'completed'`인 세션만 받는다. 운동 중에는 **저장만** 하고,
 * 확정은 완료 뒤 `finalizeWorkoutVerification`이 한 번 한다.
 * 그 RPC가 active를 받도록 고치는 것은 금지다 — 저장과 인증은 다른 사건이다.
 */
export function ActivePhotoButton({
  userId,
  sessionId,
  onToast,
  onCountChange,
}: {
  userId: string;
  sessionId: string;
  onToast: (message: string) => void;
  /** 사진 수가 바뀔 때 — 완료 화면이 이어받을 수 있게 부모에게 알린다 */
  onCountChange?: (count: number) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [saved, setSaved] = useState(0);
  /** 올라가는 중인 장수 — **자리를 차지한다** (아래 주석 참조) */
  const [inFlight, setInFlight] = useState(0);

  // 새로고침·앱 복귀로 다시 마운트돼도 이미 올린 사진이 안 보이면 안 된다.
  // 서버가 진실이므로 한 번 읽고 시작한다.
  useEffect(() => {
    let alive = true;
    void listSessionPhotoRows(sessionId)
      .then((rows) => {
        if (!alive) return;
        setSaved(rows.length);
        onCountChange?.(rows.length);
      })
      .catch(() => {
        // 못 읽어도 촬영은 막지 않는다 — 상한은 DB가 최종적으로 지킨다
      });
    return () => {
      alive = false;
    };
    // sessionId 가 바뀔 때만 다시 읽는다. onCountChange 를 넣으면 부모가
    // 함수를 새로 만들 때마다 서버를 다시 읽는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  /**
   * ⚠️ 올라가는 중인 사진도 장수에 센다. 안 세면 4장에서 연달아 두 번 찍었을 때
   *    6번째를 시도하게 되고, DB가 23505로 막아 **이유 없는 실패**로 보인다.
   */
  const used = saved + inFlight;
  const full = !canAddWorkoutPhoto(used);

  function handleFile(file: File) {
    setInFlight((n) => n + 1);
    // ⚠️ 이 체인을 `await` 하지 않는다 — 그게 이 컴포넌트의 요점이다.
    void (async () => {
      try {
        const blob = await compressImage(file);
        await uploadWorkoutImage({
          userId,
          sessionId,
          blob,
          source: "camera",
          // 운동 중 촬영은 그 순간이 곧 촬영 시각이다 (앨범과 달리 지어내는 게 아니다)
          clientCapturedAt: new Date(),
        });
        setSaved((n) => {
          const next = n + 1;
          onCountChange?.(next);
          return next;
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        onToast(
          msg.includes("photo_limit_reached") || msg.includes("duplicate")
            ? `사진은 운동 하나에 ${MAX_WORKOUT_PHOTOS}장까지예요`
            : "사진 저장 실패 — 완료 화면에서 다시 올릴 수 있어요",
        );
      } finally {
        setInFlight((n) => Math.max(0, n - 1));
      }
    })();
  }

  return (
    <>
      <button
        type="button"
        disabled={full}
        onClick={() => inputRef.current?.click()}
        aria-label={
          full
            ? `사진을 다 채웠어요 (${used}/${MAX_WORKOUT_PHOTOS})`
            : `지금 사진 찍기 (${used}/${MAX_WORKOUT_PHOTOS})`
        }
        className="flex h-9 items-center gap-1.5 rounded-full border border-line bg-surface-2 px-3 text-[12px] font-bold text-accent disabled:opacity-45"
      >
        <UiIcon name="camera" size={15} />
        {inFlight > 0 ? (
          <span className="text-muted">올리는 중…</span>
        ) : (
          <span>
            {used}/{MAX_WORKOUT_PHOTOS}
          </span>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = ""; // 같은 파일 재선택 허용
          if (file) handleFile(file);
        }}
      />
    </>
  );
}
