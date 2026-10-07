/** 최종 시안(2026-10-07)의 상세 탭 줄 — `개요 · 랭킹 · 피드 · 미션` / `결과 요약 · 최종 랭킹 · …` */
export function DetailTabs<K extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: readonly { key: K; label: string }[];
  value: K;
  onChange: (key: K) => void;
}) {
  return (
    <div role="tablist" className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
      {tabs.map((t) => {
        const on = t.key === value;
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(t.key)}
            className={`h-10 truncate rounded-[12px] border text-[13px] font-extrabold ${
              on ? "border-accent bg-accent-weak text-accent" : "border-line bg-surface text-muted"
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
