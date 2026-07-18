"use client";

export type ShareResult = "shared" | "canceled" | "copied" | "failed";

/**
 * 텍스트를 공유 시트로, 안 되면 클립보드로.
 * http+IP(비보안 컨텍스트)에서는 share/clipboard API가 없어(교훈 5)
 * textarea+execCommand 폴백까지 내려간다.
 */
export async function shareOrCopyText(text: string): Promise<ShareResult> {
  if (typeof navigator !== "undefined" && "share" in navigator) {
    try {
      await navigator.share({ text });
      return "shared";
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        return "canceled";
      }
      // NotAllowedError 등 — 클립보드 폴백으로
    }
  }

  try {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return "copied";
    }
  } catch {
    // 비보안 컨텍스트 등 — execCommand 폴백으로
  }

  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok ? "copied" : "failed";
  } catch {
    return "failed";
  }
}

/** ShareResult → 사용자 토스트 문구 (canceled는 null = 토스트 없음) */
export function shareResultToast(result: ShareResult): string | null {
  switch (result) {
    case "shared":
      return null; // 공유 시트가 이미 피드백
    case "canceled":
      return null;
    case "copied":
      return "운동 일지를 복사했어요 — AI 코치에게 붙여넣어 보세요 📋";
    case "failed":
      return "공유에 실패했어요. 다시 시도해주세요";
  }
}
