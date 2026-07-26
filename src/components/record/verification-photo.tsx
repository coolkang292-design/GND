"use client";

import { useEffect, useRef, useState } from "react";
import { compressImage } from "@/lib/image";
import {
  awardWorkoutPhotoXp,
  uploadWorkoutImage,
  type VerificationSource,
} from "@/lib/workout";
import { PhotoStamp } from "@/components/photo-stamp";

/** 완료 화면 인증사진 (§11) — 촬영/앨범 → 압축 → 비공개 업로드 → 화면 오버레이 */
export function VerificationPhoto({
  userId,
  sessionId,
  durationMinutes,
  completedAtMs,
  streakLabel,
  onToast,
}: {
  userId: string;
  sessionId: string;
  durationMinutes: number;
  completedAtMs: number;
  streakLabel?: string;
  onToast: (msg: string) => void;
}) {
  const cameraInput = useRef<HTMLInputElement>(null);
  const albumInput = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "uploading" | "done">("idle");
  const [verified, setVerified] = useState<VerificationSource | null>(null);

  // objectURL 정리
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const completedAt = new Date(completedAtMs);

  async function handleFile(file: File, source: VerificationSource) {
    setState("uploading");
    try {
      const blob = await compressImage(file);
      const url = URL.createObjectURL(blob);
      setPreviewUrl((old) => {
        if (old) URL.revokeObjectURL(old);
        return url;
      });
      await uploadWorkoutImage({
        userId,
        sessionId,
        blob,
        source,
        clientCapturedAt:
          source === "album" && file.lastModified
            ? new Date(file.lastModified)
            : new Date(),
      });
      setVerified(source);
      setState("done");
      const label =
        source === "camera" ? "카메라 인증 완료 🔥" : "사진 업로드 완료 ●";
      // 사진 XP는 완료 RPC가 줄 수 없다(사진이 늘 완료 뒤에 올라온다) — 여기서
      // 따로 청구한다. 실패해도 사진은 이미 저장됐으므로 인증은 성공으로 둔다.
      try {
        const xp = await awardWorkoutPhotoXp(sessionId);
        onToast(
          xp.awarded ? `${label} · 인증 사진 +${xp.xpAwarded ?? 10} XP` : label,
        );
      } catch {
        onToast(label);
      }
    } catch (e) {
      setState("idle");
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("duplicate") || msg.includes("Duplicate")) {
        onToast("이미 인증사진이 등록된 운동이에요");
      } else {
        onToast(`사진 업로드 실패: ${msg}`);
      }
    }
  }

  function onPick(
    e: React.ChangeEvent<HTMLInputElement>,
    source: VerificationSource,
  ) {
    const file = e.target.files?.[0];
    e.target.value = ""; // 같은 파일 재선택 허용
    if (file) void handleFile(file, source);
  }

  return (
    <section className="rounded-card border border-line bg-surface p-4 shadow-card">
      <p className="text-xs font-bold text-accent">인증 사진</p>

      {/* 미리보기 + 화면 오버레이 스탬프 (§11 — 파일에 굽지 않음) */}
      <div className="relative mt-3 aspect-[4/3] overflow-hidden rounded-card bg-surface-2">
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt="인증 사진 미리보기"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="grid h-full w-full place-items-center text-sm text-faint">
            📷 사진을 올리면 여기에 표시돼요
          </div>
        )}
        <PhotoStamp
          completedAt={completedAt}
          durationMinutes={durationMinutes}
          streakLabel={streakLabel}
        />
      </div>

      {state === "done" ? (
        <p className="mt-3 text-center text-sm font-bold text-good">
          {verified === "camera" ? "🔥 카메라 인증 완료" : "● 사진 업로드 완료"}
        </p>
      ) : (
        <>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => cameraInput.current?.click()}
              disabled={state === "uploading"}
              className="h-11 flex-1 rounded-card bg-accent text-sm font-extrabold text-accent-ink disabled:opacity-60"
            >
              {state === "uploading" ? "올리는 중…" : "📷 지금 촬영"}
            </button>
            <button
              onClick={() => albumInput.current?.click()}
              disabled={state === "uploading"}
              className="h-11 flex-1 rounded-card border border-line bg-surface-2 text-sm font-bold disabled:opacity-60"
            >
              🖼 앨범 선택
            </button>
          </div>
          <p className="mt-2 text-center text-[11px] text-muted">
            브라우저에서 압축(≤1280px) 후 비공개 저장 · 날짜·시간은 화면에만
            표시돼요
          </p>
        </>
      )}

      <input
        ref={cameraInput}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => onPick(e, "camera")}
      />
      <input
        ref={albumInput}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => onPick(e, "album")}
      />
    </section>
  );
}
