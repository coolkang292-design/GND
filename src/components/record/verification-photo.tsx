"use client";

import { useEffect, useRef, useState } from "react";
import { compressImage } from "@/lib/image";
import {
  awardWorkoutPhotoXp,
  uploadWorkoutImage,
  type VerificationSource,
} from "@/lib/workout";
import { PhotoStamp } from "@/components/photo-stamp";

/**
 * 완료 화면 인증사진 (§11) — 촬영·앨범 → 압축 → 비공개 업로드 → 화면 오버레이
 *
 * **앨범 선택을 되살렸다 (사용자 결정 2026-08-04).** 2026-08-01에 지웠던 것을
 * 다시 연다. 대신 **등급으로만 나눈다** — 촬영은 `camera`(🔥 카메라 인증),
 * 앨범은 `album`(● 사진 업로드)로 저장되고 달력·피드가 이미 그렇게 구분해 그린다.
 *
 * ⚠️ **촬영일 검사는 하지 않는다.** 기술 검토 결론이 "당일 촬영 사진만"은 보장
 * 불가였다 — EXIF `DateTimeOriginal`도 파일 `lastModified`도 사용자가 자유롭게
 * 바꿀 수 있고, 화면을 카메라로 재촬영하면 어떤 검사도 통과한다. 게다가 지금
 * 파이프라인은 canvas 재인코딩이라 EXIF가 애초에 남지 않는다. 그래서 **검사하는
 * 척하지 않는다** — 문구로도 "당일 사진만" 같은 보장을 약속하지 않는다.
 * 설계: `docs/superpowers/specs/2026-08-04-eight-improvements-investigation-and-plan.md`
 */
export function VerificationPhoto({
  userId,
  sessionId,
  durationMinutes,
  completedAtMs,
  streakLabel,
  onToast,
  onUploaded,
}: {
  userId: string;
  sessionId: string;
  durationMinutes: number;
  completedAtMs: number;
  streakLabel?: string;
  onToast: (msg: string) => void;
  /** 업로드 성공 — 완료 화면의 '챌린지에 쌓일 몫' 문구가 확정형으로 바뀐다 */
  onUploaded?: () => void;
}) {
  const cameraInput = useRef<HTMLInputElement>(null);
  const albumInput = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "uploading" | "done">("idle");
  /** 어느 경로로 올렸는지 — 완료 문구를 등급에 맞춘다 */
  const [uploadedSource, setUploadedSource] =
    useState<VerificationSource | null>(null);

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
        // 촬영은 그 순간이 곧 촬영 시각이다. 앨범은 **null로 둔다** —
        // 파일 `lastModified`는 촬영일이 아니라 파일 시각이라 메신저 저장·
        // 다운로드에서 '지금'으로 갱신된다. 틀린 값을 넣느니 없는 편이 낫다
        // (제거 전 코드가 정확히 그 값을 쓰고 있었다).
        clientCapturedAt: source === "camera" ? new Date() : null,
      });
      setState("done");
      setUploadedSource(source);
      onUploaded?.();
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
          {uploadedSource === "album"
            ? "● 사진 업로드 완료"
            : "🔥 카메라 인증 완료"}
        </p>
      ) : (
        <>
          <button
            onClick={() => cameraInput.current?.click()}
            disabled={state === "uploading"}
            className="mt-3 h-11 w-full rounded-card bg-accent text-sm font-extrabold text-accent-ink disabled:opacity-60"
          >
            {state === "uploading" ? "올리는 중…" : "📷 지금 촬영"}
          </button>
          <button
            onClick={() => albumInput.current?.click()}
            disabled={state === "uploading"}
            className="mt-2 h-11 w-full rounded-card border border-line bg-surface-2 text-sm font-bold text-accent disabled:opacity-60"
          >
            🖼 앨범에서 고르기
          </button>
          {/*
            보장하지 않는 것을 문구로 약속하지 않는다 (2026-08-04).
            "당일 촬영만" 같은 말을 쓰면 검사한다는 뜻이 되는데 검사하지 않는다.
          */}
          <p className="mt-2 text-center text-[11px] text-muted">
            지금 촬영하면 🔥 카메라 인증, 앨범에서 고르면 ● 사진 업로드로 남아요 ·
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
        onChange={(event) => onPick(event, "camera")}
      />
      {/* ⚠️ 앨범 입력에는 capture를 걸지 않는다 — 걸면 카메라가 열려 앨범을 못 고른다 */}
      <input
        ref={albumInput}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => onPick(event, "album")}
      />
    </section>
  );
}
