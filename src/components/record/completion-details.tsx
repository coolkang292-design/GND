"use client";

import { type ReactNode, useState } from "react";
import { Icon } from "@/components/ui/icon";

/**
 * 완료 화면의 "내 운동 분석 · 보상 보기" 접힘 영역 (이슈 #16 P0-C, 2026-10-19 사용자 결정).
 *
 * 안에 든 것: 보상 상세(XP·포인트·레벨업·배지 모달 입구), 기록 상세(볼륨·세트),
 * GND 퍼포먼스 리포트(체감·컨디션 선택 포함). 운동 직후의 축하가 긴 분석에 묻히지 않게
 * **기본 접힘**이고, 열면 기능과 결과를 그대로 준다.
 *
 * ⚠️ 접혀 있을 때 안의 내용을 **마운트하지 않는다** — 리포트는 열었을 때 분석을 시작한다.
 * ⚠️ 접혀 있어도 `summary`(받은 보상 한 줄)는 보인다. 레벨업·배지가 버튼 안쪽에 숨으면
 *    받은 줄도 모른다(PR #15에서 고친 것).
 * ⚠️ 크루 피드 한마디는 여기 넣지 않는다 — 접으면 잃어버린다(이슈 #16). 완료 화면에 따로 있다.
 */
export function CompletionDetails({
  summary,
  children,
}: {
  /** 받은 보상 한 줄 — 없으면(보상 0) 줄을 그리지 않는다 */
  summary: string | null;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className="rounded-card border border-line bg-surface shadow-card">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="completion-details-body"
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-12 w-full items-center justify-between gap-2 px-4 py-3 text-left"
      >
        <span className="min-w-0">
          <span className="block text-sm font-extrabold">내 운동 분석 · 보상 보기</span>
          {summary && (
            <span className="mt-0.5 block text-[12.5px] font-extrabold text-accent">{summary}</span>
          )}
        </span>
        <Icon
          name="chevron"
          size={18}
          className={`shrink-0 text-muted transition-transform ${open ? "-rotate-90" : "rotate-90"}`}
        />
      </button>
      {open && (
        <div id="completion-details-body" className="flex flex-col gap-3 border-t border-line p-4">
          {children}
        </div>
      )}
    </section>
  );
}
