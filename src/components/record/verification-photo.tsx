"use client";

import { useEffect, useRef, useState } from "react";
import { compressImage } from "@/lib/image";
import { MAX_WORKOUT_PHOTOS } from "@/lib/domain/workout-photos";
import {
  awardWorkoutPhotoXp,
  finalizeWorkoutVerification,
  uploadWorkoutImage,
  type VerificationSource,
} from "@/lib/workout";
import { PhotoStamp } from "@/components/photo-stamp";
import { UiIcon } from "@/components/ui-icon";

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
 *
 * 이슈 #16 P0-B (2026-10-19):
 * - `emphasis="required"`(챌린지 인증 대기)면 **사진 인증하기**가 화면의 단 하나의 강한 CTA다.
 *   `optional`이면 보조 버튼 모양이라 다른 CTA와 겨루지 않는다.
 * - 사진이 없을 때 빈 4:3 미리보기 칸을 그리지 않는다. 등급·압축·날짜·달력 스탬프 설명은
 *   `도움말`로 접는다(같은 뜻의 설명이 여러 문단 반복되던 것).
 * - 실패하면 그 자리에 **다시 시도**가 생긴다. 압축본을 붙들고 있다가 같은 사진으로 다시
 *   올린다. 저장은 됐는데 인증 확정만 실패했으면 **확정만** 다시 한다 — 다시 올리면 사진이
 *   두 장이 된다.
 */
export function VerificationPhoto({
  userId,
  sessionId,
  durationMinutes,
  completedAtMs,
  streakLabel,
  onToast,
  onUploaded,
  emphasis = "optional",
  collapsedInitially = false,
}: {
  userId: string;
  sessionId: string;
  durationMinutes: number;
  completedAtMs: number;
  streakLabel?: string;
  onToast: (msg: string) => void;
  /** 업로드 성공 — 완료 화면의 '챌린지에 쌓일 몫' 문구가 확정형으로 바뀐다 */
  onUploaded?: () => void;
  /** `required` = 챌린지 인증 대기 — 사진 인증이 주 CTA (이슈 #16) */
  emphasis?: "required" | "optional";
  /** Hide optional camera/album choices until the user requests a photo. */
  collapsedInitially?: boolean;
}) {
  const cameraInput = useRef<HTMLInputElement>(null);
  const albumInput = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "uploading" | "failed" | "done">("idle");
  const [optionalExpanded, setOptionalExpanded] = useState(false);
  /**
   * 마지막 시도 — 실패 시 같은 사진으로 다시 한다. `stored`는 파일·행 저장까지는 끝났다는 뜻
   * (그러면 다시 시도는 인증 확정부터).
   */
  const lastAttempt = useRef<{ blob: Blob; source: VerificationSource; stored: boolean } | null>(null);
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
    let blob: Blob;
    try {
      blob = await compressImage(file);
    } catch (e) {
      setState("idle");
      onToast(`사진 업로드 실패: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    const url = URL.createObjectURL(blob);
    setPreviewUrl((old) => {
      if (old) URL.revokeObjectURL(old);
      return url;
    });
    lastAttempt.current = { blob, source, stored: false };
    await send();
  }

  async function send() {
    const attempt = lastAttempt.current;
    if (!attempt) return;
    const { blob, source } = attempt;
    setState("uploading");
    try {
      if (!attempt.stored) {
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
        attempt.stored = true;
      }
      // ⚠️ 저장과 인증 확정은 **다른 일이다** (0103). `uploadWorkoutImage`는 이제
      //    파일과 행만 만든다 — 확정을 여기서 따로 부르지 않으면 인증 스탬프가
      //    영영 안 찍힌다. 완료 화면이라 바로 확정해도 되고, 운동 중 촬영은
      //    완료 시점에 `record/page.tsx`가 한 번 확정한다.
      await finalizeWorkoutVerification(sessionId);
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
      // 미리보기와 압축본은 그대로 둔다 — 사진을 잃지 않고 '다시 시도'로 이어 간다
      setState("failed");
      const msg = e instanceof Error ? e.message : String(e);
      // 0103 이후 "이미 등록됨"은 틀린 말이다 — 상한은 1장이 아니라 5장이다.
      if (
        msg.includes("photo_limit_reached") ||
        msg.includes("duplicate") ||
        msg.includes("Duplicate")
      ) {
        onToast(`사진은 운동 하나에 ${MAX_WORKOUT_PHOTOS}장까지예요`);
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

  // One small optional action by default: do not make people read photo instructions
  // after exercise unless a challenge requires verification or they opt in.
  if (collapsedInitially && emphasis === "optional" && !optionalExpanded && state === "idle") {
    return (
      <section className="rounded-card border border-line bg-surface px-4 py-2 shadow-card">
        <button
          type="button"
          onClick={() => setOptionalExpanded(true)}
          className="flex min-h-11 w-full items-center justify-between gap-2 text-sm font-bold text-muted"
          aria-label="운동 사진 추가 (선택)"
        >
          <span className="flex items-center gap-2"><UiIcon name="camera" size={17} /> 운동 사진 추가 · 선택</span>
          <span aria-hidden="true">＋</span>
        </button>
      </section>
    );
  }

  return (
    <section className="rounded-card border border-line bg-surface p-4 shadow-card">
      <p className="text-xs font-bold text-accent">
        인증 사진
        {emphasis === "optional" && <span className="ml-1 font-bold text-faint">· 선택</span>}
      </p>

      {/* 미리보기 + 화면 오버레이 스탬프 (§11 — 파일에 굽지 않음).
          ⚠️ 사진이 없을 때 빈 칸을 그리지 않는다 (이슈 #16 — 운동 직후 화면을 차지하던 빈 4:3) */}
      {previewUrl && (
        <div className="relative mt-3 aspect-[4/3] overflow-hidden rounded-card bg-surface-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt="인증 사진 미리보기"
            className="h-full w-full object-cover"
          />
          <PhotoStamp
            completedAt={completedAt}
            durationMinutes={durationMinutes}
            streakLabel={streakLabel}
          />
        </div>
      )}

      {state === "done" ? (
        <p className="mt-3 text-center text-sm font-bold text-good">
          {uploadedSource === "album"
            ? "● 사진 업로드 완료"
            : "🔥 카메라 인증 완료"}
        </p>
      ) : state === "failed" ? (
        <div className="mt-3" role="alert">
          <p className="text-center text-sm font-bold text-warn">
            사진을 올리지 못했어요. 사진은 그대로 있어요.
          </p>
          <button
            type="button"
            onClick={() => void send()}
            className="mt-2 h-11 w-full rounded-card bg-accent text-sm font-extrabold text-accent-ink"
          >
            다시 시도
          </button>
          <button
            type="button"
            onClick={() => {
              lastAttempt.current = null;
              setState("idle");
            }}
            className="mt-1 h-11 w-full text-[12px] font-bold text-faint"
          >
            다른 사진 고르기
          </button>
        </div>
      ) : (
        <>
          <button
            onClick={() => cameraInput.current?.click()}
            disabled={state === "uploading"}
            className={`mt-3 flex h-11 w-full items-center justify-center gap-1.5 rounded-card text-sm disabled:opacity-60 ${
              emphasis === "required"
                ? "bg-accent font-extrabold text-accent-ink"
                : "border border-line bg-surface-2 font-bold text-accent"
            }`}
          >
            {state === "uploading" ? (
              "올리는 중…"
            ) : (
              <>
                {/* 라임 버튼 위라 아이콘을 검게 눕힌다 — `HubCard`의 primary와 같은
                    이유다. 안 그러면 배경과 같은 색이라 안 보인다. */}
                <UiIcon
                  name="camera"
                  size={17}
                  className={emphasis === "required" ? "brightness-0" : ""}
                />
                {emphasis === "required" ? "사진 인증하기" : "지금 촬영"}
              </>
            )}
          </button>
          <button
            onClick={() => albumInput.current?.click()}
            disabled={state === "uploading"}
            className="mt-2 h-11 w-full rounded-card border border-line bg-surface-2 text-sm font-bold text-accent disabled:opacity-60"
          >
            🖼 {emphasis === "required" ? "앨범에서 선택" : "앨범에서 고르기"}
          </button>
        </>
      )}

      {/*
        보장하지 않는 것을 문구로 약속하지 않는다 (2026-08-04).
        "당일 촬영만" 같은 말을 쓰면 검사한다는 뜻이 되는데 검사하지 않는다.
        이슈 #16: 운동 직후 화면에서 같은 뜻의 설명이 여러 문단 반복돼 '도움말'로 접었다.
        달력 스탬프 안내는 예전에 완료 화면(`record/page.tsx`)에 따로 있던 줄이다.
      */}
      <details className="mt-2 text-[11px] text-muted">
        <summary className="flex min-h-11 cursor-pointer items-center justify-center font-bold text-faint">
          도움말
        </summary>
        <p className="pb-1 text-center leading-relaxed">
          지금 촬영하면 🔥 카메라 인증, 앨범에서 고르면 ● 사진 업로드로 남아요.
          &lsquo;달력&rsquo; 탭에서 오늘 스탬프로 확인할 수 있어요. 브라우저에서
          압축(≤1280px) 후 비공개로 저장하고, 날짜·시간은 화면에만 표시돼요.
        </p>
      </details>

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
