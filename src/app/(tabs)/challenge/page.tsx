"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import {
  ChallengeSetupSheet,
  type SetupSubmit,
} from "@/components/challenge/setup-sheet";
import {
  achievementScore,
  gndLabel,
  goalRate,
  overallScore,
  participationScore,
  plannedDaysForPeriod,
  rankParticipants,
  type ParticipantInput,
} from "@/lib/domain/goal-score";
import { dayKey } from "@/lib/domain/time";
import { getCrewProfiles, getMyGroups, getMyProfile } from "@/lib/crew";
import {
  GOAL_TYPE_META,
  actualForGoal,
  cancelChallenge,
  createChallenge,
  finalizeChallenge,
  getChallengeGoals,
  getCurrentChallenge,
  getMyPreviousGoals,
  getPeriodStatsByUser,
  saveMyGoals,
  startChallenge,
  type GoalDraft,
  type PeriodStats,
} from "@/lib/challenge";
import type { Challenge, Group, Profile, UserGoal } from "@/lib/types";

const EMPTY_STATS: PeriodStats = {
  workoutDays: 0,
  distanceKm: 0,
  durationMin: 0,
  volumeKg: 0,
  totalReps: 0,
};

function periodDays(startDate: string, endDate: string): number {
  const toUtc = (d: string) => {
    const [y, m, dd] = d.split("-").map(Number);
    return Date.UTC(y, m - 1, dd);
  };
  return Math.round((toUtc(endDate) - toUtc(startDate)) / 86_400_000) + 1;
}

function errorMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes("kpi_incomplete")) {
    return `아직 KPI 미설정 크루원이 있어요 (${msg.split(":")[1] ?? ""}) 🔒`;
  }
  if (msg.includes("not_ended_yet")) return "아직 종료일이 지나지 않았어요";
  if (msg.includes("invalid_status"))
    return "챌린지 상태가 맞지 않아요. 새로고침해 주세요";
  if (msg.includes("challenges_one_live"))
    return "이미 진행 중인 챌린지가 있어요";
  return `오류: ${msg}`;
}

export default function ChallengePage() {
  const { userId, loading, configured, error } = useAuth();

  if (!configured) {
    return (
      <p className="pt-10 text-center text-sm text-muted">
        Supabase 설정(.env.local)이 필요해요.
      </p>
    );
  }
  if (loading) {
    return <p className="pt-10 text-center text-sm text-muted">불러오는 중…</p>;
  }
  if (!userId) {
    return (
      <p className="pt-10 text-center text-sm text-warn">
        익명 인증에 실패했어요{error ? ` — ${error}` : ""}. 홈 탭에서 상태를
        확인해 주세요.
      </p>
    );
  }
  return <ChallengeScreen userId={userId} />;
}

function ChallengeScreen({ userId }: { userId: string }) {
  const [loading, setLoading] = useState(true);
  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<Profile[]>([]);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [goals, setGoals] = useState<UserGoal[]>([]);
  const [stats, setStats] = useState<Map<string, PeriodStats> | null>(null);
  const [timeZone, setTimeZone] = useState("Asia/Seoul");
  const [prevGoals, setPrevGoals] = useState<GoalDraft[] | null>(null);
  const [sheet, setSheet] = useState<{
    mode: "create" | "goals";
    defaults: SetupSubmit;
  } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  const reload = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
      const [groups, profile] = await Promise.all([
        getMyGroups(),
        getMyProfile(userId),
      ]);
      if (cancelled) return;
      const g = groups[0] ?? null;
      setGroup(g);
      const tz =
        profile?.timezone ||
        Intl.DateTimeFormat().resolvedOptions().timeZone ||
        "Asia/Seoul";
      setTimeZone(tz);
      if (!g) return;

      const [crew, ch] = await Promise.all([
        getCrewProfiles(g.id),
        getCurrentChallenge(g.id),
      ]);
      if (cancelled) return;
      setMembers(crew);
      setChallenge(ch);

      if (ch) {
        const [chGoals, prev] = await Promise.all([
          getChallengeGoals(ch.id),
          getMyPreviousGoals(userId, g.id, ch.id),
        ]);
        setGoals(chGoals);
        setPrevGoals(
          prev.map((p) => ({
            type: p.goal_type,
            target: Number(p.target_value),
          })),
        );
        if (ch.status === "active" || ch.status === "ended") {
          setStats(
            await getPeriodStatsByUser(g.id, ch.start_date, ch.end_date, tz),
          );
        }
      } else {
        const prev = await getMyPreviousGoals(userId, g.id, null);
        setPrevGoals(
          prev.map((p) => ({
            type: p.goal_type,
            target: Number(p.target_value),
          })),
        );
      }
      } catch {
        if (!cancelled) showToast("데이터를 불러오지 못했어요");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, refreshKey, showToast]);

  const myGoals = useMemo(
    () => goals.filter((g) => g.user_id === userId),
    [goals, userId],
  );
  const goalCountByUser = useMemo(() => {
    const m = new Map<string, number>();
    for (const g of goals) m.set(g.user_id, (m.get(g.user_id) ?? 0) + 1);
    return m;
  }, [goals]);

  const todayKey = dayKey(new Date(), timeZone);
  const endedByDate = challenge ? challenge.end_date < todayKey : false;
  const dday = challenge ? periodDays(todayKey, challenge.end_date) - 1 : 0;

  async function handleCreate(v: SetupSubmit) {
    if (!group) return;
    setBusy(true);
    try {
      const ch = await createChallenge({
        groupId: group.id,
        name: v.name,
        startDate: v.startDate,
        endDate: v.endDate,
      });
      await saveMyGoals({
        userId,
        challengeId: ch.id,
        groupId: group.id,
        goals: v.goals,
        plannedDays: v.plannedDays,
      });
      setSheet(null);
      showToast("챌린지를 만들었어요 — 크루원들이 KPI를 설정하면 시작! 🎯");
      reload();
    } catch (e) {
      showToast(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveGoals(v: SetupSubmit) {
    if (!group || !challenge) return;
    setBusy(true);
    try {
      await saveMyGoals({
        userId,
        challengeId: challenge.id,
        groupId: group.id,
        goals: v.goals,
        plannedDays: v.plannedDays,
      });
      setSheet(null);
      showToast("내 KPI를 저장했어요 ✓");
      reload();
    } catch (e) {
      showToast(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleStart() {
    if (!challenge) return;
    setBusy(true);
    try {
      await startChallenge(challenge.id);
      showToast("🏁 챌린지 시작! 오늘부터 기록이 반영돼요");
      reload();
    } catch (e) {
      showToast(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleCancel() {
    if (!challenge) return;
    if (!window.confirm("챌린지를 취소할까요? 되돌릴 수 없어요.")) return;
    setBusy(true);
    try {
      await cancelChallenge(challenge.id);
      setChallenge(null);
      setGoals([]);
      showToast("챌린지를 취소했어요");
      reload();
    } catch (e) {
      showToast(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleFinalize() {
    if (!challenge) return;
    setBusy(true);
    try {
      await finalizeChallenge(challenge.id);
      showToast("🏆 결과가 발표됐어요!");
      reload();
    } catch (e) {
      showToast(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  function openSheet(mode: "create" | "goals") {
    const now = new Date();
    setSheet({
      mode,
      defaults: {
        name: `${now.getMonth() + 1}월 GND 챌린지`,
        startDate: dayKey(now, timeZone),
        endDate: dayKey(new Date(now.getTime() + 27 * 86_400_000), timeZone),
        goals:
          mode === "goals" && myGoals.length > 0
            ? myGoals.map((g) => ({
                type: g.goal_type,
                target: Number(g.target_value),
              }))
            : [{ type: "frequency", target: 12 }],
        plannedDays: myGoals[0]?.planned_days ?? 5,
      },
    });
  }

  if (loading) {
    return <p className="pt-10 text-center text-sm text-muted">불러오는 중…</p>;
  }

  const days = challenge
    ? periodDays(challenge.start_date, challenge.end_date)
    : 0;

  // 순위·진행률 계산 재료 (§7) — 목표 있는 참여자만
  const participantInputs: ParticipantInput[] = members
    .filter((m) => (goalCountByUser.get(m.id) ?? 0) > 0)
    .map((m) => {
      const userGoals = goals.filter((g) => g.user_id === m.id);
      const s = stats?.get(m.id) ?? EMPTY_STATS;
      return {
        userId: m.id,
        goals: userGoals.map((g) => ({
          type: g.goal_type,
          target: Number(g.target_value),
          actual: actualForGoal(s, g.goal_type),
        })),
        workoutDays: s.workoutDays,
        plannedDays: plannedDaysForPeriod(userGoals[0]?.planned_days ?? 5, days),
        allGoalsCompletedAtMs: null,
      };
    });

  const me = participantInputs.find((p) => p.userId === userId) ?? null;
  const myAchievement = me ? achievementScore(me.goals) : 0;
  const myParticipation = me
    ? participationScore(me.workoutDays, me.plannedDays)
    : 0;
  const myOverall = overallScore(myAchievement, myParticipation);

  const profileOf = (id: string) => members.find((m) => m.id === id);

  return (
    <div className="flex flex-col gap-3 pb-10">
      <header className="pt-2 pb-1">
        <h1 className="text-[19px] font-extrabold tracking-tight">
          GND 챌린지
        </h1>
        {challenge && (
          <p className="mt-0.5 text-[12.5px] text-muted">
            {challenge.name} · {challenge.start_date} ~ {challenge.end_date}
          </p>
        )}
      </header>

      {!group && (
        <p className="pt-8 text-center text-sm text-muted">
          크루에 참여하면 챌린지를 만들 수 있어요.
        </p>
      )}

      {/* ── 챌린지 없음 ─────────────────────────────── */}
      {group && !challenge && (
        <>
          <section className="rounded-card border border-line bg-surface p-5 text-center shadow-card">
            <div className="text-3xl">🏆</div>
            <h2 className="mt-1 text-base font-extrabold">
              아직 진행 중인 챌린지가 없어요
            </h2>
            <p className="mt-1 text-xs text-muted">
              기간을 정하면 크루원 각자 자기 목표(KPI)를 세우고, 전원 설정 완료
              시 시작돼요.
            </p>
          </section>
          <button
            onClick={() => openSheet("create")}
            className="h-12 rounded-card bg-accent text-sm font-extrabold text-accent-ink"
          >
            ＋ 새 챌린지 만들기 (기간·목표 설정)
          </button>
        </>
      )}

      {/* ── setup: 전원 KPI 게이트 (§6) ─────────────── */}
      {group && challenge?.status === "setup" && (
        <>
          {myGoals.length === 0 ? (
            <button
              onClick={() => openSheet("goals")}
              className="rounded-card border border-warn/40 bg-surface p-3.5 text-left text-[13px] font-bold text-warn shadow-card"
            >
              🎯 새 챌린지에 초대됐어요! <b>내 KPI를 설정</b>해야 시작돼요 ·
              설정하기 →
            </button>
          ) : (
            <section className="rounded-card border border-line bg-surface p-4 shadow-card">
              <div className="flex items-center justify-between">
                <p className="text-sm font-extrabold">
                  🎯 내 목표 {myGoals.length}개
                </p>
                <button
                  onClick={() => openSheet("goals")}
                  className="text-xs font-bold text-accent"
                >
                  수정
                </button>
              </div>
              <div className="mt-2 flex flex-col gap-1.5">
                {myGoals.map((g) => (
                  <div
                    key={g.id}
                    className="flex justify-between rounded-card-sm bg-surface-2 px-3 py-2 text-[12.5px]"
                  >
                    <span>{GOAL_TYPE_META[g.goal_type].label}</span>
                    <span className="font-mono font-bold">
                      {Number(g.target_value).toLocaleString()}
                      {g.unit}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="rounded-card border border-line bg-surface p-4 shadow-card">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-extrabold">참여자 KPI 설정 현황</h3>
              <span className="text-xs text-muted">
                {
                  members.filter((m) => (goalCountByUser.get(m.id) ?? 0) > 0)
                    .length
                }{" "}
                / {members.length} 완료
              </span>
            </div>
            {members.map((m) => {
              const count = goalCountByUser.get(m.id) ?? 0;
              return (
                <div key={m.id} className="flex items-center gap-2.5 py-1.5">
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-surface-2 text-base">
                    {m.avatar_url ?? "👤"}
                  </span>
                  <span className="flex-1 text-[13.5px] font-bold">
                    {m.nickname}
                    {m.id === userId && (
                      <span className="ml-1 text-faint">(나)</span>
                    )}
                  </span>
                  {count > 0 ? (
                    <span className="rounded-full bg-good-weak px-2.5 py-1 text-[11px] font-bold text-good">
                      목표 {count}개 ✓
                    </span>
                  ) : (
                    <span className="rounded-full bg-surface-2 px-2.5 py-1 text-[11px] font-bold text-muted">
                      설정 대기
                    </span>
                  )}
                </div>
              );
            })}
            <p className="mt-2 text-[11px] text-muted">
              🔒 <b>전원 KPI 설정 완료</b> 시 챌린지가 시작돼요.
            </p>
          </section>

          <button
            onClick={handleStart}
            disabled={
              busy || members.some((m) => (goalCountByUser.get(m.id) ?? 0) === 0)
            }
            className="h-12 rounded-card bg-accent text-sm font-extrabold text-accent-ink disabled:opacity-50"
          >
            {members.some((m) => (goalCountByUser.get(m.id) ?? 0) === 0)
              ? "전원 완료 대기 중…"
              : "챌린지 시작 🏁"}
          </button>
          {challenge.created_by === userId && (
            <button
              onClick={handleCancel}
              disabled={busy}
              className="text-xs font-bold text-faint"
            >
              챌린지 취소
            </button>
          )}
        </>
      )}

      {/* ── active: 내 진행률만 공개 (§6 비공개) ─────── */}
      {group && challenge?.status === "active" && (
        <>
          <section className="rounded-card bg-gradient-to-br from-accent to-[#0B6E66] p-5 text-accent-ink shadow-card">
            <p className="text-xs font-bold opacity-80">{challenge.name}</p>
            <div className="mt-2 flex items-end justify-between">
              <div>
                <p className="text-[13px] opacity-90">
                  내 목표 {me?.goals.length ?? 0}개 · 평균 달성
                </p>
                <p className="font-mono text-[26px] leading-tight font-extrabold">
                  {Math.round(myAchievement)}%
                </p>
              </div>
              <div className="text-right">
                <p className="font-mono text-[32px] leading-none font-extrabold">
                  {myOverall.toFixed(1)}
                </p>
                <p className="text-[11px] opacity-90">내 종합점수</p>
              </div>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/25">
              <div
                className="h-full rounded-full bg-white"
                style={{
                  width: `${Math.min(100, Math.round(myAchievement))}%`,
                }}
              />
            </div>
            <p className="mt-2.5 text-xs opacity-95">
              결과 발표까지{" "}
              <b className="font-mono">
                {endedByDate ? "종료!" : `D-${Math.max(0, dday)}`}
              </b>{" "}
              · 참여율 {Math.round(myParticipation)}%
            </p>
          </section>

          {me && me.goals.length > 0 && (
            <section className="rounded-card border border-line bg-surface p-4 shadow-card">
              <h3 className="text-sm font-extrabold">내 목표 진행률</h3>
              <div className="mt-2 flex flex-col gap-2">
                {me.goals.map((g, i) => {
                  const rate = goalRate(g.target, g.actual);
                  return (
                    <div key={i}>
                      <div className="flex justify-between text-[12.5px]">
                        <span className="font-bold">
                          {GOAL_TYPE_META[g.type].label}{" "}
                          {g.target.toLocaleString()}
                          {GOAL_TYPE_META[g.type].unit}
                        </span>
                        <span className="font-mono font-bold">
                          {Math.round(g.actual * 10) / 10} ·{" "}
                          {Math.round(rate * 100)}%
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
                        <div
                          className={`h-full rounded-full ${
                            rate >= 1 ? "bg-good" : "bg-accent"
                          }`}
                          style={{ width: `${Math.min(100, rate * 100)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="mt-2 text-[11px] text-muted">
                초과 달성은 표시만 — 점수는 목표당 100%까지 반영돼요.
              </p>
            </section>
          )}

          <div className="rounded-card border border-line bg-surface-2 p-3 text-center text-[12px] font-bold text-muted">
            🔒 공정성을 위해 <b>기간 중에는 내 진행률만</b> 볼 수 있어요
          </div>

          <section className="rounded-card border border-line bg-surface p-4 shadow-card">
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-sm font-extrabold">
                참여자 ({members.length}명)
              </h3>
              <span className="text-xs text-muted">🔒 종료일 공개</span>
            </div>
            {members.map((m) => (
              <div key={m.id} className="flex items-center gap-2.5 py-1.5">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-surface-2 text-base">
                  {m.avatar_url ?? "👤"}
                </span>
                <span className="flex-1 text-[13.5px] font-bold">
                  {m.nickname}
                  {m.id === userId && (
                    <span className="ml-1 text-faint">(나)</span>
                  )}
                </span>
                <span className="font-mono text-sm font-extrabold text-faint">
                  {m.id === userId ? `${Math.round(myAchievement)}%` : "🔒"}
                </span>
              </div>
            ))}
          </section>

          {endedByDate && (
            <button
              onClick={handleFinalize}
              disabled={busy}
              className="h-12 rounded-card bg-good text-sm font-extrabold text-white disabled:opacity-60"
            >
              🏆 결과 발표하기
            </button>
          )}
          {challenge.created_by === userId && !endedByDate && (
            <button
              onClick={handleCancel}
              disabled={busy}
              className="text-xs font-bold text-faint"
            >
              챌린지 취소
            </button>
          )}
        </>
      )}

      {/* ── ended: 시상대 + 상세 순위 (§6) ───────────── */}
      {group && challenge?.status === "ended" && (
        <ResultView
          participants={participantInputs}
          goals={goals}
          profileOf={profileOf}
          myUserId={userId}
        />
      )}

      {sheet && group && (
        <ChallengeSetupSheet
          mode={sheet.mode}
          defaults={sheet.defaults}
          periodDaysFixed={sheet.mode === "goals" && challenge ? days : undefined}
          prevGoals={prevGoals}
          busy={busy}
          onSubmit={sheet.mode === "create" ? handleCreate : handleSaveGoals}
          onClose={() => setSheet(null)}
        />
      )}

      {toast && (
        <div
          className="fixed inset-x-8 z-[60] rounded-card border border-line bg-surface px-4 py-3 text-center text-sm font-bold shadow-card"
          style={{ bottom: "calc(env(safe-area-inset-bottom) + 90px)" }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}

/** 시상대 + 상세 순위 (§6 결과 발표) */
function ResultView({
  participants,
  goals,
  profileOf,
  myUserId,
}: {
  participants: ParticipantInput[];
  goals: UserGoal[];
  profileOf: (id: string) => Profile | undefined;
  myUserId: string;
}) {
  const ranked = rankParticipants(participants);
  const total = ranked.length;
  const podiumOrder = [ranked[1], ranked[0], ranked[2]].filter(
    (r): r is (typeof ranked)[number] => Boolean(r),
  );
  const heights: Record<number, string> = { 1: "h-20", 2: "h-14", 3: "h-10" };

  return (
    <>
      <section className="rounded-card border border-line bg-surface p-4 shadow-card">
        <h3 className="text-center text-base font-extrabold">
          🏆 최종 순위 발표
        </h3>
        <div className="mt-4 flex items-end justify-center gap-2">
          {podiumOrder.map((r) => {
            const p = profileOf(r.userId);
            const h = heights[Math.min(r.rank, 3)];
            return (
              <div key={r.userId} className="flex w-20 flex-col items-center">
                {r.rank === 1 && <span className="text-lg">👑</span>}
                <span className="grid h-10 w-10 place-items-center rounded-full bg-surface-2 text-xl">
                  {p?.avatar_url ?? "👤"}
                </span>
                <span className="mt-1 text-xs font-extrabold">
                  {p?.nickname ?? "?"}
                </span>
                <span className="font-mono text-[11px] text-muted">
                  {r.overall.toFixed(1)}점
                </span>
                <span
                  className={`mt-0.5 rounded-full px-1.5 py-0.5 text-[9.5px] font-extrabold ${
                    r.rank === 1
                      ? "bg-good-weak text-good"
                      : r.rank === total
                        ? "bg-surface-2 text-warn"
                        : "bg-surface-2 text-muted"
                  }`}
                >
                  {gndLabel(r.rank, total)}
                </span>
                <div
                  className={`mt-1.5 w-full rounded-t-lg bg-accent-weak text-center font-mono text-sm font-extrabold text-accent ${h}`}
                >
                  {r.rank}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {ranked.map((r) => {
        const p = profileOf(r.userId);
        const userGoals = goals.filter((g) => g.user_id === r.userId);
        const input = participants.find((x) => x.userId === r.userId);
        return (
          <article
            key={r.userId}
            className={`rounded-card border bg-surface p-4 shadow-card ${
              r.userId === myUserId ? "border-accent/50" : "border-line"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <span
                className={`grid h-8 w-8 place-items-center rounded-full font-mono text-sm font-extrabold ${
                  r.rank === 1
                    ? "bg-accent text-accent-ink"
                    : "bg-surface-2 text-muted"
                }`}
              >
                {r.rank}
              </span>
              <div className="flex-1">
                <p className="text-sm font-extrabold">
                  {p?.nickname ?? "?"}
                  {r.userId === myUserId && (
                    <span className="ml-1 rounded-full bg-accent-weak px-1.5 text-[10px] text-accent">
                      나
                    </span>
                  )}{" "}
                  <span className="text-[11px] font-bold text-muted">
                    {gndLabel(r.rank, total)}
                  </span>
                </p>
                <p className="text-[11px] text-muted">
                  목표 {userGoals.length}개 · 평균 달성{" "}
                  {Math.round(r.achievement)}%
                </p>
              </div>
              <div className="text-right">
                <p className="font-mono text-lg font-extrabold">
                  {r.overall.toFixed(1)}
                </p>
                <p className="text-[10px] text-muted">종합점수</p>
              </div>
            </div>

            <div className="mt-2.5 flex flex-col gap-1">
              {userGoals.map((g) => {
                const actual =
                  input?.goals.find((x) => x.type === g.goal_type)?.actual ?? 0;
                const rate = goalRate(Number(g.target_value), actual);
                return (
                  <div
                    key={g.id}
                    className="flex justify-between rounded-card-sm bg-surface-2 px-3 py-1.5 text-[12px]"
                  >
                    <span>
                      {GOAL_TYPE_META[g.goal_type].label}{" "}
                      {Number(g.target_value).toLocaleString()}
                      {g.unit}
                    </span>
                    <span className="font-mono font-bold">
                      {Math.round(actual * 10) / 10} · {Math.round(rate * 100)}%
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="mt-2.5 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-card-sm bg-surface-2 py-1.5">
                <p className="font-mono text-sm font-extrabold">
                  {Math.round(r.achievement)}%
                </p>
                <p className="text-[10px] text-muted">평균 달성률</p>
              </div>
              <div className="rounded-card-sm bg-surface-2 py-1.5">
                <p className="font-mono text-sm font-extrabold">
                  {Math.round(r.participation)}%
                </p>
                <p className="text-[10px] text-muted">참여율</p>
              </div>
              <div className="rounded-card-sm bg-surface-2 py-1.5">
                <p className="font-mono text-sm font-extrabold">
                  {r.completedGoalCount}개
                </p>
                <p className="text-[10px] text-muted">완료 목표</p>
              </div>
            </div>
          </article>
        );
      })}
    </>
  );
}
