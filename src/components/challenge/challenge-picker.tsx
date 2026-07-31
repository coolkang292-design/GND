"use client";

import type { MyChallenge } from "@/lib/challenge";

const STATUS_LABEL: Record<string, string> = {
  setup: "준비 중",
  active: "진행 중",
  ended: "종료",
};

/**
 * 챌린지 선택기 — 여러 챌린지를 chip 행으로 보여주고 하나를 고른다.
 *
 * 1개일 때는 렌더하지 않는다. 고를 것이 없는데 선택기를 띄우면 화면만 복잡해진다.
 * 0044 전에는 크루당 살아있는 챌린지가 1개로 강제돼 있어서 이 자리가 없었다.
 */
export function ChallengePicker({
  challenges,
  selectedId,
  onSelect,
}: {
  challenges: MyChallenge[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (challenges.length < 2) return null;
  return (
    <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
      {challenges.map((c) => {
        const selected = c.id === selectedId;
        return (
          <button
            key={c.id}
            type="button"
            aria-current={selected ? "true" : undefined}
            onClick={() => onSelect(c.id)}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs ${
              selected
                ? "border-accent bg-accent text-accent-ink"
                : "border-line bg-surface-2 text-muted"
            }`}
          >
            <span className="font-bold">{c.name}</span>
            <span className="ml-1.5 opacity-70">
              {c.myStatus === "invited"
                ? "초대받음"
                : (STATUS_LABEL[c.status] ?? c.status)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
