"use client";

import { useState } from "react";

/**
 * 숫자 한 칸 — 타이핑 중에는 사용자가 친 글자를 그대로 보여 주고, 포커스를
 * 잃으면 부모가 들고 있는 값으로 되돌아온다.
 *
 * ⚠️ **`defaultValue`로 돌아가지 마라.** 목표 카드의 `기간 총 목표`는 계산기의
 * `하루 목표`·`주 며칠`을 건드릴 때 **따라 바뀌어야 한다.** 비제어 입력은 그
 * 갱신을 화면에 못 그린다(값은 바뀌었는데 칸에는 옛 숫자가 남는다).
 *
 * ⚠️ 그렇다고 `value={String(value)}`만 쓰면 칸을 지우는 순간 `0`이 들어와
 * 커서가 밀린다. 그래서 포커스 중에만 draft를 쓴다.
 */
export function NumberField({
  value,
  onValue,
  ariaLabel,
  className = "",
}: {
  value: number;
  onValue: (v: number) => void;
  ariaLabel: string;
  className?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <input
      inputMode="decimal"
      aria-label={ariaLabel}
      value={draft ?? String(value)}
      onFocus={(e) => setDraft(e.target.value)}
      onBlur={() => setDraft(null)}
      onChange={(e) => {
        setDraft(e.target.value);
        const v = parseFloat(e.target.value);
        onValue(Number.isFinite(v) ? v : 0);
      }}
      className={`h-11 w-full rounded-card-sm border border-line bg-surface-2 px-3 text-right font-mono text-sm font-bold ${className}`}
    />
  );
}
