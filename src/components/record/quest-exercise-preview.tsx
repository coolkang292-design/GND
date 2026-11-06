"use client";

import { useState } from "react";

export type QuestPreviewItem = { name: string; detail?: string };

export function QuestExercisePreview({
  items,
  onLoad,
  label = "오늘의 운동",
}: {
  items?: QuestPreviewItem[];
  onLoad?: () => Promise<QuestPreviewItem[]>;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState<QuestPreviewItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const visible = items ?? loaded ?? [];
  async function showDetails() {
    setOpen(true);
    if (!onLoad || items || loaded) return;
    setLoading(true);
    setError(false);
    try {
      setLoaded(await onLoad());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }
  return (
    <div className="relative mt-3 rounded-2xl border border-line bg-surface-2/70 p-3" data-testid="quest-exercise-preview">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-extrabold">{label}</span>
        {visible.length > 0 && <span className="text-[11px] text-muted">{visible.length}종</span>}
      </div>
      {visible.length > 0 ? (
        <ul className="mt-2 space-y-1.5">
          {visible.slice(0, 3).map((item, index) => (
            <li key={index} className="flex justify-between gap-2 text-[12px]">
              <span className="min-w-0 truncate">{item.name}</span>
              {item.detail && <span className="shrink-0 text-muted">{item.detail}</span>}
            </li>
          ))}
          {visible.length > 3 && <li className="text-[11px] text-muted">외 {visible.length - 3}종</li>}
        </ul>
      ) : (
        <p className="mt-1 text-[11.5px] text-muted">시작 전에 운동 목록을 확인할 수 있어요.</p>
      )}
      <button type="button" onClick={() => void showDetails()} className="mt-2.5 w-full rounded-xl border border-line-strong px-3 py-2 text-[12px] font-bold text-accent" data-testid="quest-preview-open">
        전체 운동 확인하기
      </button>
      {open && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70" role="presentation" onClick={() => setOpen(false)}>
          <section role="dialog" aria-modal="true" aria-label="퀘스트 전체 운동" onClick={(event) => event.stopPropagation()} className="max-h-[80dvh] w-full max-w-xl overflow-y-auto rounded-t-[24px] border border-line bg-surface p-5 pb-8">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-black">퀘스트 전체 운동</h3>
              <button type="button" onClick={() => setOpen(false)} aria-label="닫기" className="rounded-full border border-line px-3 py-1 text-sm">닫기</button>
            </div>
            {loading ? <p className="mt-4 text-sm text-muted">운동을 불러오는 중…</p> :
              error ? <p className="mt-4 text-sm text-muted">운동 목록을 불러오지 못했어요. 다시 열어 주세요.</p> :
              visible.length === 0 ? <p className="mt-4 text-sm text-muted">표시할 운동이 없어요.</p> :
              <ol className="mt-4 space-y-3">
                {visible.map((item, index) => <li key={index} className="flex items-start justify-between gap-3 border-b border-line pb-2 text-sm"><span>{index + 1}. {item.name}</span><span className="text-right text-xs text-muted">{item.detail ?? ""}</span></li>)}
              </ol>}
          </section>
        </div>
      )}
    </div>
  );
}
