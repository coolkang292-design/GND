"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { UiIcon } from "@/components/ui-icon";
import { compressImage } from "@/lib/image";
import {
  awardWorkoutPhotoXp,
  deleteWorkoutImage,
  finalizeWorkoutVerification,
  listSessionPhotos,
  reorderWorkoutImages,
  uploadWorkoutImage,
} from "@/lib/workout";
import {
  MAX_WORKOUT_PHOTOS,
  canAddWorkoutPhoto,
  movePhoto,
  type SessionPhoto,
} from "@/lib/domain/workout-photos";

/**
 * 완료 화면의 사진 관리 — 추가 · 삭제 · 순서 (0103, 계획 §9).
 *
 * ⚠️ **드래그앤드롭을 쓰지 않는다.** 모바일 사용성이 우선이라는 지시가 있었고,
 * 4:3 썸네일 다섯 개를 손가락으로 끌어 옮기는 것은 폰에서 정확도가 낮다.
 * `◀ ▶` 두 버튼이 더 정확하고, 낭독·키보드에서도 그대로 동작한다.
 *
 * ⚠️ **여기는 완료 화면이다** — 운동 중(`ActivePhotoButton`)과 달리 인증을
 * 확정해도 된다(`status = 'completed'`). 사진을 더하면 등급이 바뀔 수 있으므로
 * (album만 있다가 camera가 붙으면 `photo_uploaded` → `camera_verified`)
 * 추가 뒤에 다시 확정한다.
 *
 * ⚠️ 삭제는 `deleteWorkoutImage`가 행·스토리지·슬롯·인증을 **한 묶음**으로
 * 정리한다. 여기서 따로 손대지 않는다 — 나눠서 하면 중간에 실패했을 때
 * 화면과 서버가 어긋난다.
 */
export function SessionPhotoManager({
  userId,
  sessionId,
  onToast,
  onPhotosChange,
}: {
  userId: string;
  sessionId: string;
  onToast: (message: string) => void;
  /** 장수가 바뀌면 알린다 — 완료 화면의 '챌린지에 쌓일 몫' 문구가 따라간다 */
  onPhotosChange?: (photos: SessionPhoto[]) => void;
}) {
  const [photos, setPhotos] = useState<SessionPhoto[]>([]);
  const [busy, setBusy] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const albumRef = useRef<HTMLInputElement>(null);

  const apply = useCallback(
    (next: SessionPhoto[]) => {
      setPhotos(next);
      onPhotosChange?.(next);
    },
    // onPhotosChange 를 넣으면 부모가 함수를 새로 만들 때마다 서버를 다시 읽는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  /** 서버가 진실이다 — 삭제·재정렬 뒤에는 슬롯이 바뀌어 있을 수 있다 */
  const reload = useCallback(async () => {
    const next = await listSessionPhotos(sessionId);
    apply(next);
    return next;
  }, [sessionId, apply]);

  /**
   * 결과 화면에 닿으면 **서버 인증 상태를 한 번 맞춘다** (2026-09-10 실측 버그).
   *
   * 완료 핸들러는 완료 그 순간에 **한 번만** 확정한다. 그런데 `"잠시 후 결과
   * 화면으로 넘어가요…"` 구간에서도 운동 중 사진 버튼이 살아 있어서, 그 뒤에
   * 찍은 사진은 확정될 기회가 없었다 — 사진이 2장인데 `verification_status`가
   * `none`으로 남아 달력·피드 스탬프가 안 찍혔다.
   *
   * 사진이 어떤 경로로 생겼든(운동 중 · 완료 직후 · 나중 붙이기) 결과 화면은
   * 반드시 지난다. 그러니 여기가 맞추기에 옳은 자리다.
   *
   * ⚠️ `ActivePhotoButton`에서 부르는 것으로 고치지 마라 — 그쪽은 `active`
   *    세션에서도 도는데 `set_workout_verification`은 `completed`만 받는다.
   * ⚠️ 0장이면 부르지 않는다. `set_workout_verification`은 멱등이라 불러도
   *    해롭진 않지만, 사진 없는 운동마다 헛 RPC를 쏘게 된다.
   */
  const finalizedFor = useRef<string | null>(null);

  useEffect(() => {
    let alive = true;
    void listSessionPhotos(sessionId)
      .then(async (next) => {
        if (!alive) return;
        apply(next);
        // 세션당 한 번. StrictMode의 이중 마운트에서도 두 번 쏘지 않는다
        if (next.length === 0 || finalizedFor.current === sessionId) return;
        finalizedFor.current = sessionId;
        try {
          await finalizeWorkoutVerification(sessionId);
        } catch {
          // 확정이 실패해도 사진 관리는 그대로 쓸 수 있어야 한다.
          // 다음에 이 화면을 다시 열면 또 시도한다.
          finalizedFor.current = null;
        }
      })
      .catch(() => {
        // 못 읽어도 화면을 막지 않는다 — 아래 추가 버튼은 그대로 쓸 수 있다
      });
    return () => {
      alive = false;
    };
  }, [sessionId, apply]);

  async function handleAdd(file: File, source: "camera" | "album") {
    setBusy(true);
    try {
      const blob = await compressImage(file);
      await uploadWorkoutImage({
        userId,
        sessionId,
        blob,
        source,
        // 앨범은 촬영 시각을 모른다. 파일 시각은 촬영일이 아니라 넣지 않는다
        // (`verification-photo.tsx`와 같은 규약).
        clientCapturedAt: source === "camera" ? new Date() : null,
      });
      // 등급이 바뀔 수 있다 — album만 있다가 camera가 붙으면 승격된다
      await finalizeWorkoutVerification(sessionId);
      await reload();

      const label = source === "camera" ? "카메라 인증 🔥" : "사진 업로드 ●";
      try {
        const xp = await awardWorkoutPhotoXp(sessionId);
        // ⚠️ 실제 지급됐을 때만 XP를 말한다. 사진 XP는 운동 1회당 한 번이라
        //    2장째부터는 늘 already_awarded 다 — 그때도 "+10 XP"라고 하면 거짓말이다.
        onToast(xp.awarded ? `${label} · 인증 사진 +${xp.xpAwarded ?? 10} XP` : label);
      } catch {
        onToast(label);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      onToast(
        msg.includes("photo_limit_reached") || msg.includes("duplicate")
          ? `사진은 운동 하나에 ${MAX_WORKOUT_PHOTOS}장까지예요`
          : `사진 업로드 실패: ${msg}`,
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(target: SessionPhoto) {
    setBusy(true);
    try {
      const result = await deleteWorkoutImage({
        sessionId,
        imageId: target.id,
        // 서명 URL이 아니라 저장 경로가 필요하다. 서명 URL의 경로 부분에서
        // 버킷 뒤를 떼어 낸다 — `{userId}/{sessionId}/{ts}.jpg` 모양이다.
        imagePath: storagePathOf(target.url, userId, sessionId),
      });
      await reload();
      if (result.verificationCleared) {
        // ⚠️ 말해 줘야 한다. 말 안 하면 달력에서 스탬프가 사라진 것을 나중에
        //    보고 "기록이 사라졌다"고 느낀다 (계획 §9).
        onToast("사진을 모두 지워서 인증이 풀렸어요");
      }
    } catch (e) {
      onToast(`사진 삭제 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleMove(index: number, direction: -1 | 1) {
    const ids = movePhoto(
      photos.map((p) => p.id),
      index,
      direction,
    );
    // 낙관적으로 먼저 그린다 — 순서 바꾸기는 눈이 바로 따라와야 한다
    const optimistic = ids
      .map((id) => photos.find((p) => p.id === id))
      .filter((p): p is SessionPhoto => !!p);
    setPhotos(optimistic);
    try {
      await reorderWorkoutImages(sessionId, ids);
      await reload();
    } catch (e) {
      await reload().catch(() => {});
      onToast(`순서 변경 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const canAdd = canAddWorkoutPhoto(photos.length);

  return (
    <section className="rounded-card border border-line bg-surface p-4 shadow-card">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-accent">오늘의 사진</p>
        <p className="text-xs font-bold text-muted">
          {photos.length}/{MAX_WORKOUT_PHOTOS}
        </p>
      </div>

      <ul className="mt-3 flex gap-2 overflow-x-auto pb-1">
        {photos.map((p, i) => (
          <li key={p.id} className="w-[92px] flex-none">
            <div className="relative aspect-[4/3] overflow-hidden rounded-card-sm bg-surface-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.url}
                alt={`${i + 1}번째 사진`}
                className="h-full w-full object-cover"
                loading="lazy"
              />
              <span className="absolute left-1 top-1 rounded-full bg-black/55 px-1.5 text-[10px] font-bold text-white">
                {i + 1}
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleDelete(p)}
                aria-label={`${i + 1}번째 사진 삭제`}
                className="absolute right-1 top-1 h-5 w-5 rounded-full bg-black/60 text-[11px] font-bold text-white disabled:opacity-50"
              >
                ✕
              </button>
            </div>
            {/* ◀ ▶ — 드래그보다 폰에서 정확하다. 끝에서는 아예 그리지 않는다 */}
            {photos.length > 1 && (
              <div className="mt-1 flex gap-1">
                {i > 0 && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleMove(i, -1)}
                    aria-label={`${i + 1}번째 사진 앞으로 옮기기`}
                    className="h-6 flex-1 rounded-card-sm border border-line bg-surface-2 text-[11px] font-bold disabled:opacity-50"
                  >
                    ◀
                  </button>
                )}
                {i < photos.length - 1 && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleMove(i, 1)}
                    aria-label={`${i + 1}번째 사진 뒤로 옮기기`}
                    className="h-6 flex-1 rounded-card-sm border border-line bg-surface-2 text-[11px] font-bold disabled:opacity-50"
                  >
                    ▶
                  </button>
                )}
              </div>
            )}
          </li>
        ))}

        {canAdd && (
          <li className="w-[92px] flex-none">
            <button
              type="button"
              disabled={busy}
              onClick={() => cameraRef.current?.click()}
              aria-label="사진 추가 (촬영)"
              className="flex aspect-[4/3] w-full items-center justify-center rounded-card-sm border border-dashed border-line bg-surface-2 text-accent disabled:opacity-50"
            >
              {busy ? (
                <span className="text-[11px] font-bold">올리는 중…</span>
              ) : (
                <UiIcon name="camera" size={18} />
              )}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => albumRef.current?.click()}
              className="mt-1 h-6 w-full rounded-card-sm border border-line bg-surface text-[11px] font-bold text-accent disabled:opacity-50"
            >
              🖼 앨범
            </button>
          </li>
        )}
      </ul>

      <p className="mt-2 text-[11px] text-muted">
        {photos.length === 0
          ? "사진을 올리면 여기에 표시돼요"
          : "◀ ▶로 순서를 바꿔요 · 첫 사진이 피드 대표로 보여요"}
      </p>

      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void handleAdd(file, "camera");
        }}
      />
      {/* ⚠️ 앨범 입력에는 capture를 걸지 않는다 — 걸면 카메라가 열려 앨범을 못 고른다 */}
      <input
        ref={albumRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void handleAdd(file, "album");
        }}
      />
    </section>
  );
}

/**
 * 서명 URL → 스토리지 경로.
 *
 * 삭제에는 `{userId}/{sessionId}/{timestamp}.jpg` 경로가 필요한데 화면이 든 것은
 * 서명 URL이다. URL 안에 그 경로가 그대로 들어 있으므로 잘라 쓴다.
 *
 * ⚠️ 못 잘라 내면 `{userId}/{sessionId}/` 접두사만으로는 특정할 수 없다 — 그때는
 *    빈 문자열을 돌려주고, 스토리지 삭제는 조용히 실패한다(행은 지워진다).
 *    고아 객체 하나가 남을 뿐 화면에는 영향이 없다.
 */
function storagePathOf(signedUrl: string, userId: string, sessionId: string): string {
  const marker = `${userId}/${sessionId}/`;
  const at = signedUrl.indexOf(marker);
  if (at < 0) return "";
  const tail = signedUrl.slice(at).split("?")[0];
  return decodeURIComponent(tail);
}
