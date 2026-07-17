import Link from "next/link";
import { AuthStatus } from "@/components/auth-status";
import { CrewCard } from "@/components/crew-card";
import { CrewLatestWorkout } from "@/components/crew-latest-workout";

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

      <Link
        href="/record"
        className="block rounded-[22px] bg-gradient-to-br from-accent to-[#0B6E66] p-5 text-accent-ink shadow-card"
      >
        <p className="text-xs font-bold opacity-80">오늘의 운동</p>
        <h2 className="mt-1 text-xl font-extrabold">운동 시작하기</h2>
        <p className="mt-1 text-sm opacity-90">
          30초면 기록할 수 있어요. 친구들이 기다리고 있어요.
        </p>
      </Link>

      <CrewCard />

      <div className="mt-1 flex items-center justify-between px-0.5">
        <h3 className="text-sm font-extrabold">최근 친구 활동</h3>
        <Link href="/feed" className="text-xs font-bold text-accent">
          피드 전체
        </Link>
      </div>
      <CrewLatestWorkout />

      <AuthStatus />
    </div>
  );
}
