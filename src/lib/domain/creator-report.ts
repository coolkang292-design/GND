import { foldPeriodStats, type PeriodSessionRow } from "@/lib/challenge";
import { dayKey, DEFAULT_TIMEZONE } from "@/lib/domain/time";
import type { CreatorParticipant } from "@/lib/domain/creator-studio";
import type { Challenge } from "@/lib/types";

export type DailyProofRate = {
  day: string;
  /** Joined, non-host members whose join day is on or before `day`. */
  members: number;
  /** Of those, how many have a counted proof that day. */
  proofs: number;
  /** proofs / members; null when nobody had joined yet (a gap, not 0%). */
  rate: number | null;
};

function nextDay(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

/**
 * 성과 리포트 "일별 인증률" (시안 1 축소판, 계획서 §5.4).
 *
 * 분모 = 그날까지 합류한 joined 회원(방장·탈퇴 제외). 합류 전 날을 분모에 넣으면
 * 늦게 들어온 회원이 "안 한 날"로 잡혀 인증률이 거짓으로 낮아진다.
 * 인증 = 챌린지 화면과 같은 `foldPeriodStats` 운동일. 쉬는 날은 모른다.
 */
export function buildDailyProofRates(input: {
  participants: readonly CreatorParticipant[];
  sessions: readonly PeriodSessionRow[];
  startDate: string;
  endDate: string;
  todayKey: string;
  status: Challenge["status"];
}): DailyProofRate[] {
  if (input.status === "setup" || input.todayKey < input.startDate) return [];
  const last = input.todayKey < input.endDate ? input.todayKey : input.endDate;
  const members = input.participants
    .filter((p) => p.role !== "host" && p.status === "joined")
    .map((p) => ({ id: p.user_id, from: p.joined_at ? dayKey(new Date(p.joined_at), DEFAULT_TIMEZONE) : input.startDate }));
  const stats = foldPeriodStats([...input.sessions], input.startDate, last, DEFAULT_TIMEZONE);
  const proofDays = new Map(members.map((m) => [m.id, new Set(stats.get(m.id)?.workoutDayKeys ?? [])]));

  const out: DailyProofRate[] = [];
  for (let day = input.startDate; day <= last; day = nextDay(day)) {
    const present = members.filter((m) => m.from <= day);
    const proofs = present.filter((m) => proofDays.get(m.id)?.has(day)).length;
    out.push({ day, members: present.length, proofs, rate: present.length ? proofs / present.length : null });
  }
  return out;
}

/** Average over member-days (Σproofs ÷ Σmembers), so a 1-member day can't outweigh a 20-member day. */
export function summarizeRates(days: readonly DailyProofRate[]): { proofs: number; memberDays: number; rate: number | null } {
  const proofs = days.reduce((n, d) => n + d.proofs, 0);
  const memberDays = days.reduce((n, d) => n + d.members, 0);
  return { proofs, memberDays, rate: memberDays ? proofs / memberDays : null };
}
