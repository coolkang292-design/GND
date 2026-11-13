import Link from "next/link";
import { getStageGroups } from "@/lib/domain/progression";
import type { GateCondition, StageGateStatus } from "@/lib/domain/evolution-gate";

const labels: Record<GateCondition["key"], string> = {
  xp: "경험치 레벨", days: "운동한 날", weeks: "운동 시작 후", recent: "최근 운동",
  growth_count: "성장 종목", growth_average: "진화 평가 평균",
};
function value(c: GateCondition) {
  if (c.current === null || c.required === null) return "기준 확인 중";
  const unit = c.key === "growth_average" ? "%" : c.key === "growth_count" ? "종목"
    : c.key === "weeks" ? "주" : c.key === "xp" ? "레벨" : "일";
  const current = c.key === "growth_average" ? Number(c.current.toFixed(1)) : c.current;
  return `${current} / ${c.required}${unit}`;
}

/** 판정은 서버 값만 사용한다. 화면에서 평균을 다시 계산해 met/state를 덮어쓰지 않는다. */
export function StageEvolutionStatusView({ status }: { status: StageGateStatus }) {
  if (status.nextStage === null) return <section className="rounded-card border border-line bg-surface p-4 shadow-card">
    <h2 className="text-[15px] font-extrabold">최종 단계에 도달했어요</h2>
    <p className="mt-2 text-sm text-muted">전설의 기록을 계속 쌓아 보세요.</p>
  </section>;
  const target = getStageGroups()[status.nextStage - 1];
  const conditions = status.state === "error" ? status.conditions.filter(c => !c.key.startsWith("growth_")) : status.conditions;
  return <section className="rounded-card border border-line bg-surface p-4 shadow-card" data-testid="server-evolution-status">
    <h2 className="text-[15px] font-extrabold">다음 진화 · {target.stageName}</h2>
    <p className="mt-2 text-[13px] font-bold text-accent">
      {status.state === "error" ? "진화 판정을 다시 확인하고 있어요. 운동 기록과 경험치는 그대로예요."
        : status.state === "needs_baseline" ? "성장 비교 기준을 확인 중이에요."
        : status.state === "eligible" ? "진화 조건을 모두 채웠어요."
        : "진화 조건이 남았어요"}
    </p>
    <p className="mt-1 text-[11.5px] text-muted">
      {status.nextStage <= 3 ? "시동러까지는 경험치만으로 진화해요."
        : "경험치·운동 습관·성장 종목 수·평균 목표를 모두 채우면 진화해요."}
    </p>
    <ul className="mt-3 flex flex-col gap-2.5">
      {conditions.map(c => <li key={c.key} className="flex items-center justify-between gap-3 text-[12px]">
        <span>{c.met ? "✓ " : "○ "}{labels[c.key]}{c.windowDays ? ` ${c.windowDays}일` : ""}</span>
        <span className={c.met ? "font-bold text-accent" : "font-bold"}>{value(c)}</span>
      </li>)}
    </ul>
    <p className="mt-3 border-t border-line pt-2 text-[11px] text-muted">한번 진화한 모습은 운동을 쉬어도 그대로예요.</p>
    <Link href="/record" className="mt-3 flex h-12 items-center justify-center rounded-full bg-accent text-sm font-extrabold text-accent-ink">오늘 운동 시작하기</Link>
  </section>;
}
