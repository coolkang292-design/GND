import { AuthStatus } from "@/components/auth-status";
import { CrewCard } from "@/components/crew-card";

export default function HomePage() {
  return (
    <div className="flex flex-col gap-3">
      <header className="flex items-center justify-between pt-2 pb-1">
        <div>
          <h1 className="text-[19px] font-extrabold tracking-tight">GND</h1>
          <p className="mt-0.5 text-[12.5px] text-muted">
            오늘도 GND 탈출하자 🔥
          </p>
        </div>
      </header>

      <section className="rounded-[22px] bg-gradient-to-br from-accent to-[#0B6E66] p-5 text-accent-ink shadow-card">
        <p className="text-xs font-bold opacity-80">오늘의 운동</p>
        <h2 className="mt-1 text-xl font-extrabold">운동 시작하기</h2>
        <p className="mt-1 text-sm opacity-90">
          Phase 3에서 세션 기록이 열립니다.
        </p>
      </section>

      <CrewCard />

      <AuthStatus />
    </div>
  );
}
