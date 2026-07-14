export function ScreenPlaceholder({
  title,
  subtitle,
  phase,
}: {
  title: string;
  subtitle: string;
  phase: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      <header className="pt-2 pb-1">
        <h1 className="text-[19px] font-extrabold tracking-tight">{title}</h1>
        <p className="mt-0.5 text-[12.5px] text-muted">{subtitle}</p>
      </header>
      <div className="rounded-card border border-line bg-surface p-4 shadow-card">
        <span className="inline-block rounded-full bg-accent-weak px-2.5 py-1 text-xs font-bold text-accent">
          {phase} 구현 예정
        </span>
        <p className="mt-2 text-sm text-muted">
          Phase 1은 앱 기반(테마·탭·인증·PWA)까지입니다.
        </p>
      </div>
    </div>
  );
}
