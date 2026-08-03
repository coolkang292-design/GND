"use client";

import { useRef, useState } from "react";
import { compressImage } from "@/lib/image";
import {
  awardWorkoutPhotoXp,
  uploadWorkoutImage,
  type VerificationSource,
} from "@/lib/workout";

/**
 * 완료한 세션에 인증사진을 **나중에** 붙인다 (2026-08-04).
 *
 * 신고 4805090f: 사진은 완료 직후 결과 화면에서만 올릴 수 있었고 '확인'을
 * 누르면 영영 못 붙였다. 챌린지가 `photo_required = true`면 그 세션은 집계에서
 * 통째로 빠지므로, 사용자는 사진을 붙이려 **같은 운동을 다시 기록**했다.
 * 그 덫을 없애는 것이 목적이다 — 중복 감지를 따로 만들지 않는 이유이기도 하다.
 *
 * **촬영·앨범 둘 다 받는다 (사용자 결정 2026-08-04).** 처음엔 카메라 전용으로
 * 만들었지만 — 2026-08-01의 앨범 제거 결정을 되돌리지 않으려는 것이었다 —
 * 그 결정 자체가 이번에 뒤집혔다. 완료 화면에서 앨범이 되는데 나중 붙이기만
 * 막으면 규칙이 갈라진다. 등급은 그대로 나뉜다: 촬영 🔥 / 앨범 ●.
 *
 * ⚠️ 언제까지 붙일 수 있는지는 `domain/photo-window.ts`의 `canAttachPhotoLater`가
 *    정하고, 이 버튼을 그릴지 말지는 부모가 그걸로 판단한다.
 */
export function LatePhotoButton({
  userId,
  sessionId,
  onDone,
  onToast,
}: {
  userId: string;
  sessionId: string;
  /** 업로드 성공 — 부모가 그 세션의 인증 상태를 갱신한다 */
  onDone: (verification: "camera_verified" | "photo_uploaded") => void;
  onToast: (message: string) => void;
}) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const albumInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function handleFile(file: File, source: VerificationSource) {
    setBusy(true);
    try {
      const blob = await compressImage(file);
      await uploadWorkoutImage({
        userId,
        sessionId,
        blob,
        source,
        // 앨범은 촬영 시각을 모른다. 파일 시각은 촬영일이 아니라서 넣지 않는다.
        clientCapturedAt: source === "camera" ? new Date() : null,
      });
      onDone(source === "camera" ? "camera_verified" : "photo_uploaded");
      // 사진 XP는 완료 RPC가 못 준다. 실패해도 사진은 이미 저장됐으므로
      // 인증 자체는 성공으로 둔다 (verification-photo.tsx와 같은 규약).
      try {
        const xp = await awardWorkoutPhotoXp(sessionId);
        const label =
          source === "camera" ? "카메라 인증 완료 🔥" : "사진 업로드 완료 ●";
        onToast(
          xp.awarded ? `${label} · 인증 사진 +${xp.xpAwarded ?? 10} XP` : label,
        );
      } catch {
        onToast(
          source === "camera" ? "카메라 인증 완료 🔥" : "사진 업로드 완료 ●",
        );
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      onToast(
        msg.includes("duplicate") || msg.includes("Duplicate")
          ? "이미 인증사진이 등록된 운동이에요"
          : `사진 업로드 실패: ${msg}`,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={() => cameraInputRef.current?.click()}
        className="mt-2 h-10 w-full rounded-card-sm border border-accent bg-surface text-xs font-extrabold text-accent disabled:opacity-60"
      >
        {busy ? "올리는 중…" : "📷 지금 촬영해서 인증하기"}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => albumInputRef.current?.click()}
        className="mt-1.5 h-10 w-full rounded-card-sm border border-line bg-surface-2 text-xs font-bold text-accent disabled:opacity-60"
      >
        🖼 앨범에서 고르기
      </button>
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = ""; // 같은 파일 재선택 허용
          if (file) void handleFile(file, "camera");
        }}
      />
      {/* ⚠️ capture를 걸지 않는다 — 걸면 카메라가 열려 앨범을 못 고른다 */}
      <input
        ref={albumInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void handleFile(file, "album");
        }}
      />
    </>
  );
}
