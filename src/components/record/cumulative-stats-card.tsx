"use client";

import {
  formatCumulativeDistance,
  formatCumulativeMinutes,
  formatCumulativeVolume,
} from "@/lib/domain/profile-history";

/**
 * 기록 탭 **누적 성과** 카드 (2026-08-21 사용자 요청 —
 * *"기록 탭에는 누적 운동일수, 누적 중량, 누적 Km, 누적 운동 시간을 같이 보여주는 것도"*).
 *
 * ⚠️ **여기서 조회하지 않는다.** 무게·거리·시간은 `get_my_badge_metrics`(0036 RPC)가
 * 서버에서 합산한 값이고, 운동일수는 기록 화면이 이미 들고 있는 세션에서 센다.
 * 카드 안에서 다시 부르면 같은 질의가 두 번 나간다(홈 카드가 같은 규약).
 *
 * ⚠️ **부르는 쪽이 값이 다 오기 전에는 안 그린다.** 0으로 채운 카드를 잠깐 보여 주면
 * "아무것도 안 했다"는 거짓말이 된다 — `TodayStatusCard`가 같은 이유로 그렇게 한다.
 *
 * ⚠️ 라벨이 프로필 시트(`member-profile-sheet`)의 `운동한 날 · 시간 · 거리`보다 길다.
 * 그쪽은 시트 안 2칸이라 폭이 좁고, 여기는 카드 한 장을 다 쓴다. 숫자의 **원천은
 * 같다**(같은 RPC 계열) — 둘이 다른 숫자를 말하면 그건 고장이다.
 */
export function CumulativeStatsCard({
  workoutDays,
  totalMinutes,
  volumeKg,
  distanceMeters,
}: {
  /** 운동한 날 수 — 세션 **횟수**가 아니다. 하루에 두 번 해도 하루다 */
  workoutDays: number;
  totalMinutes: number;
  volumeKg: number;
  distanceMeters: number;
}) {
  return (
    <section className="rounded-card border border-line bg-surface p-4 shadow-card">
      <h2 className="text-sm font-extrabold">누적 성과</h2>
      <div className="mt-2.5 grid grid-cols-2 gap-2">
        <Tile label="운동한 날" value={`${Math.max(0, workoutDays)}일`} />
        <Tile label="운동 시간" value={formatCumulativeMinutes(totalMinutes)} />
        <Tile label="든 무게" value={formatCumulativeVolume(volumeKg)} />
        {/* ⚠️ `formatCumulativeDistance`는 0이면 `null`을 준다 — 프로필 시트는 그때
            칸을 통째로 뺀다(짧은 요약이라 잡음을 줄이는 게 맞다). 여기는 사용자가
            **넷을 지정해 요청한 자리**라 빈 칸이 생기면 넷이 셋으로 보인다.
            0은 사실이므로 그대로 적는다. */}
        <Tile
          label="달린 거리"
          value={formatCumulativeDistance(distanceMeters) ?? "0km"}
        />
      </div>
    </section>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-card-sm border border-line bg-surface-2 px-3 py-2">
      <span className="text-[11px] leading-tight text-muted">{label}</span>
      <strong className="text-[17px] font-extrabold leading-tight">
        {value}
      </strong>
    </div>
  );
}
