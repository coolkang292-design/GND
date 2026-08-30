"use client";

import { useRef, useState } from "react";
import {
  CAPTION_CHIPS,
  CAPTION_MAX_LENGTH,
  isChipSelected,
  isValidCaption,
  normalizeCaption,
  toggleChip,
} from "@/lib/domain/session-caption";
import { updateSessionCaption } from "@/lib/workout";

/**
 * 운동에 **내 말** 한 줄 붙이기 — 원탭 칩 (2026-08-30).
 *
 * ⚠️ **자유 입력창을 기본으로 두지 마라 (사용자 결정 2026-08-30).**
 *    캡션을 쓰는 순간은 운동을 막 끝낸 직후다 — 땀나고 숨차고 한 손에 폰을 든
 *    상태다. 인스타는 소파에서 쓰지만 여기는 아니다. 자유 입력창을 첫 화면에
 *    놓으면 그 비용을 감당할 사람만 쓰고 나머지는 비워 두는데, 캡션이 비면
 *    게시물이 순수 데이터로 남아 **답할 거리가 없어 댓글도 안 달린다.**
 *    지친 사람이 지불할 수 있는 비용은 **탭 1회**다.
 *
 * ⚠️ 확인 버튼이 없다. **누르는 즉시 저장한다.** 한 번 더 눌러야 하면 탭 1회가
 *    아니게 된다. 실패하면 화면을 되돌리고 이유를 말한다(낙관적 반영 + 롤백).
 *
 * ⚠️ 같은 칩을 다시 누르면 **해제**다. 잘못 누른 것을 되돌릴 길이 없으면
 *    원탭은 위험한 조작이 된다.
 *
 * 완료 화면과 피드 본인 카드가 **같은 컴포넌트를 쓴다** — 옛 게시물에도 나중에
 * 붙일 수 있어야 하고(`LatePhotoButton`과 같은 사상), 규칙이 갈라지면 안 된다.
 */
export function CaptionPicker({
  sessionId,
  caption,
  onSaved,
  onToast,
  variant = "card",
}: {
  sessionId: string;
  /** 현재 저장된 캡션 (`workout_sessions.title`) */
  caption: string | null;
  onSaved: (next: string | null) => void;
  onToast?: (message: string) => void;
  /** `complete`는 완료 화면 — 안내 문구를 더 크게 낸다 */
  variant?: "card" | "complete";
}) {
  const [saving, setSaving] = useState(false);
  const [writing, setWriting] = useState(false);
  /**
   * 칩 목록을 펼쳐 놓았는가 (사용자 결정 2026-08-30).
   *
   * > "표시된 기분은 피드에서 다 보여 주지 말고 선택한 기분만 표시하게 해줘"
   *
   * ⚠️ **피드 카드에서는 접혀 있어야 한다.** 카드마다 기분 6개가 가로 스크롤로
   *    깔리면 게시물보다 편집 도구가 더 크다 — 남의 글에는 없는 것이라 내 글만
   *    유독 시끄러워 보인다. 완료 화면은 **고르라고 만든 화면**이라 펼쳐서 연다.
   */
  const [picking, setPicking] = useState(variant === "complete");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const current = normalizeCaption(caption);

  async function save(next: string | null) {
    if (saving) return;
    const previous = current;
    setError(null);
    setSaving(true);
    onSaved(next); // 낙관적 반영 — 탭 즉시 눈에 보여야 한다
    try {
      await updateSessionCaption(sessionId, next);
      setWriting(false);
      // 고르고 나면 카드에서는 도로 접는다 — 고른 기분은 캡션 줄이 보여 준다
      if (variant === "card") setPicking(false);
      onToast?.(next === null ? "한마디를 지웠어요" : "한마디를 남겼어요 ✍️");
    } catch {
      onSaved(previous); // 롤백
      // ⚠️ 0행 UPDATE도 여기로 온다 (`updateSessionCaption`이 `.select()`로
      //    바뀐 행을 확인하고 던진다). 전에는 `error`가 null이라 **성공으로
      //    보이고 아무것도 저장되지 않았다.**
      setError("저장하지 못했어요. 잠시 후 다시 눌러 주세요");
    } finally {
      setSaving(false);
    }
  }

  function submitFreeText() {
    const value = normalizeCaption(inputRef.current?.value);
    if (!isValidCaption(value)) {
      setError(`${CAPTION_MAX_LENGTH}자까지 쓸 수 있어요`);
      return;
    }
    void save(value);
  }

  // 접힌 카드에서는 **버튼 하나**만 낸다. 고른 기분 자체는 부모(`Caption`)가
  // 캡션 줄로 이미 그리고 있으므로 여기서 또 보여 주지 않는다.
  if (!picking) {
    return (
      <div className="flex flex-col gap-1">
        <button
          type="button"
          onClick={() => setPicking(true)}
          className="self-start text-[11.5px] font-bold text-accent"
        >
          {current === null ? "✍️ 오늘 기분 남기기" : "기분 바꾸기"}
        </button>
        {error && (
          <p className="text-[11.5px] font-bold text-accent">{error}</p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {variant === "complete" && (
        <p className="text-[12.5px] font-bold text-muted">
          오늘 어땠어요? 한 번만 누르면 돼요
        </p>
      )}

      {/* 가로 스크롤 한 줄. 지친 상태에서 훑는 데 1초를 안 넘겨야 한다 */}
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
        {CAPTION_CHIPS.map((chip) => {
          const on = isChipSelected(current, chip);
          return (
            <button
              key={chip}
              type="button"
              onClick={() => void save(toggleChip(current, chip))}
              disabled={saving}
              aria-pressed={on}
              className={`min-h-[38px] flex-none rounded-full border px-3 text-[12.5px] font-bold whitespace-nowrap transition-colors disabled:opacity-60 ${
                on
                  ? "border-accent bg-accent-weak text-accent"
                  : "border-line bg-surface-2 text-muted"
              }`}
            >
              {chip}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setWriting((open) => !open)}
          disabled={saving}
          aria-expanded={writing}
          className="min-h-[38px] flex-none rounded-full border border-line bg-surface-2 px-3 text-[12.5px] font-bold whitespace-nowrap text-muted disabled:opacity-60"
        >
          ✍️ 직접 쓰기
        </button>
      </div>

      {/* 자유 입력은 접혀 있다 — 원하는 사람만 편다 */}
      {writing && (
        <div className="flex gap-1.5">
          <input
            ref={inputRef}
            defaultValue={current ?? ""}
            maxLength={CAPTION_MAX_LENGTH}
            placeholder={`한마디 (${CAPTION_MAX_LENGTH}자)`}
            aria-label="운동 한마디"
            onKeyDown={(e) => {
              if (e.key === "Enter") submitFreeText();
            }}
            className="h-10 min-w-0 flex-1 rounded-card-sm border border-line bg-bg px-3 text-sm outline-none focus:border-accent"
          />
          <button
            type="button"
            onClick={submitFreeText}
            disabled={saving}
            className="h-10 flex-none rounded-card-sm bg-accent px-3.5 text-sm font-extrabold text-accent-ink disabled:opacity-60"
          >
            저장
          </button>
        </div>
      )}

      <div className="flex items-center gap-3">
        {current !== null && !writing && (
          <button
            type="button"
            onClick={() => void save(null)}
            disabled={saving}
            className="text-[11.5px] font-bold text-faint underline disabled:opacity-60"
          >
            한마디 지우기
          </button>
        )}
        {variant === "card" && (
          <button
            type="button"
            onClick={() => setPicking(false)}
            className="text-[11.5px] font-bold text-faint"
          >
            접기 ▲
          </button>
        )}
      </div>

      {error && <p className="text-[11.5px] font-bold text-accent">{error}</p>}
    </div>
  );
}
