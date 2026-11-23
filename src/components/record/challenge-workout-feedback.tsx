"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { actualForGoal, foldPeriodStats, goalLabel, GOAL_TYPE_META, toPeriodSessionRow, type FinishedDraftExercise, type GoalContribution } from "@/lib/challenge";
import { loadChallengeScoreSnapshot } from "@/lib/challenge-workout-feedback";
import { calculateWorkoutImpact, forecastWorkout, recommendWorkoutAdditions, winGuidance, type ChallengeScoreSnapshot, type WinGuidance } from "@/lib/domain/challenge-workout-impact";
import type { ActiveChallengeContext } from "@/lib/domain/challenge-confirmation";
import { durationSecondsOf } from "@/lib/domain/set-timer";
import type { LocalExercise } from "@/lib/workout";
import { VerifiedChallengeProofCard } from "./verified-challenge-proof-card";

const points = (n: number) => n.toFixed(2);

/** 목표를 모두 채워 점수가 더 안 오를 때 — 동점 규칙과 내 위치, 우승하려면 무엇을 할지 */
function WinGuidanceBox({ guidance }: { guidance: WinGuidance }) {
  return (
    <div data-testid="win-guidance" className="mt-3 rounded-xl bg-accent-weak p-3">
      <p className="text-[13px] font-extrabold">목표를 모두 채웠어요 — 이제 활동 점수로 우승을 노려요</p>
      <p className="mt-1 text-xs text-muted">{guidance.rule}</p>
      <p className="mt-2 text-xs font-bold">{guidance.standing}</p>
      {guidance.action && <p className="mt-1 text-xs font-bold text-accent">{guidance.action}</p>}
    </div>
  );
}
/**
 * 1시간 규칙으로 '운동 횟수'에서 빠졌을 때, 화면 아래에 잠깐 떴다 사라지는 안내 (사용자 선택, 2026-11-22).
 * 결과 카드 안의 글자 상자만으로는 놓칠 수 있어서 한 번 더 알려준다. 운동 직후의 흐름을 끊지 않도록
 * 확인 버튼 없는 작은 알림으로 4초 뒤 스스로 사라진다.
 * 같은 운동(sessionId)에는 한 번만 뜬다 — 카드가 다시 그려져도 반복되지 않게 sessionStorage에 기록한다.
 */
function SessionGapToast({ sessionId }: { sessionId: string }) {
  const key = `gnd:session-gap-toast:${sessionId}`;
  // 읽기만 한다(개발 모드에서 두 번 실행돼도 안전). 기록은 아래 effect에서 한다.
  const [open, setOpen] = useState(() => {
    try {
      return !sessionStorage.getItem(key);
    } catch {
      return true; // 저장소를 못 써도 안내는 보여준다
    }
  });
  useEffect(() => {
    if (!open) return;
    try {
      sessionStorage.setItem(key, "1");
    } catch {
      /* 무시 */
    }
    const t = setTimeout(() => setOpen(false), 4000);
    return () => clearTimeout(t);
  }, [open, key]);
  if (!open) return null;
  return (
    <div
      role="status"
      data-testid="session-gap-toast"
      className="pointer-events-none fixed inset-x-4 bottom-24 z-50 mx-auto max-w-sm rounded-2xl border border-warn/40 bg-surface px-4 py-3 text-center text-[13px] font-bold leading-snug text-warn shadow-lg"
    >
      1시간 안에 이어 한 운동은 &lsquo;운동 횟수&rsquo;에 더해지지 않아요
    </div>
  );
}

type ReadState = { key: string; snapshot: ChallengeScoreSnapshot | null; error: boolean };

function useSnapshot(userId: string, challengeId: string, scope: string, enabled = true) {
  const [retry, setRetry] = useState(0);
  const [read, setRead] = useState<ReadState | null>(null);
  const key = `${userId}:${challengeId}:${scope}:${retry}`;
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    void loadChallengeScoreSnapshot(userId, challengeId).then(
      (snapshot) => { if (alive) setRead({ key, snapshot, error: false }); },
      () => { if (alive) setRead({ key, snapshot: null, error: true }); },
    );
    return () => { alive = false; };
  }, [key, userId, challengeId, enabled]);
  const refresh = useCallback(() => setRetry((n) => n + 1), []);
  return { read: read?.key === key ? read : null, refresh };
}

export function ChallengeWorkoutResultCard({ userId, sessionId, context, gains, photoDone }: {
  userId: string; sessionId: string; context: ActiveChallengeContext; gains: readonly GoalContribution[]; photoDone: boolean;
}) {
  const pending = context.photoRequired && !photoDone;
  const { read, refresh } = useSnapshot(userId, context.id, `${sessionId}:${photoDone}`, !pending && gains.length > 0);
  if (gains.length === 0) return null;
  if (pending) return <VerifiedChallengeProofCard name={context.name} photoRequired photoDone={false} gains={gains} confirmation={{status:"checking"}}/>;
  if (read && !read.error && !read.snapshot) return null;
  const snapshot = read?.snapshot;
  if (!snapshot && context.liveRanking !== true) {
    return <><VerifiedChallengeProofCard name={context.name} photoRequired={context.photoRequired} photoDone={photoDone} gains={gains} confirmation={{status:read?.error?"unavailable":"checking"}}/>{read?.error && <button type="button" className="tap-44 text-xs font-bold text-accent" onClick={refresh}>다시 확인</button>}</>;
  }
  if (snapshot && !snapshot.challenge.live_ranking) {
    const stats = foldPeriodStats(snapshot.rows, snapshot.challenge.start_date, snapshot.challenge.end_date, snapshot.timeZone).get(userId);
    const totals = snapshot.goals.filter((g) => g.user_id === userId).map((g) => ({ type:g.goal_type, label:goalLabel(g.goal_type,g.qualifier), value:stats ? actualForGoal(stats,g.goal_type,g.qualifier):0, unit:GOAL_TYPE_META[g.goal_type].unit, target:Number(g.target_value) }));
    return <VerifiedChallengeProofCard name={snapshot.challenge.name} photoRequired={snapshot.challenge.photo_required} photoDone={photoDone} gains={gains} confirmation={{status:"confirmed",totals}}/>;
  }
  const impact = snapshot ? calculateWorkoutImpact(snapshot, userId, sessionId) : null;
  const movement = impact ? impact.beforeRank - impact.afterRank : 0;
  const guidance = snapshot && impact ? winGuidance(snapshot, userId) : null;
  return (
    <section className="rounded-card border border-accent/40 bg-surface p-4" aria-label={`${context.name} 챌린지 결과`}>
      <p className="text-xs font-extrabold text-muted">{snapshot?.challenge.name ?? context.name}</p>
      {!read ? <p className="mt-2 text-sm text-muted" role="status">점수와 순위를 확인하고 있어요…</p> : !impact ? (
        <><p className="mt-2 text-sm text-muted">운동은 저장됐어요. {read.error ? "챌린지 점수를 불러오지 못했어요." : "이번 운동의 반영을 확인하지 못했어요."}</p><button type="button" className="tap-44 mt-2 text-sm font-bold text-accent" onClick={refresh}>다시 확인</button></>
      ) : (
        <>
          <p className="mt-3 text-[13px] font-bold">이번 운동 총 획득 점수</p>
          <p data-testid="total-gain" className="mt-1 font-mono text-[30px] font-black tracking-tight text-accent">{impact.totalDelta > 0 ? "+" : ""}{points(impact.totalDelta)}<span className="ml-1 text-sm">점</span></p>
          <p className="text-sm text-muted">챌린지 총점 {points(impact.beforeTotal)}점 → <b className="text-text">{points(impact.afterTotal)}점</b></p>
          <div data-testid="score-breakdown" className="mt-2 space-y-1 rounded-xl border border-line px-3 py-2 text-sm">
            <p className="flex justify-between gap-2"><span className="font-bold">기본 점수</span><span className="font-mono font-bold text-accent">{impact.delta > 0 ? "+" : ""}{points(impact.delta)}</span></p>
            <p className="flex justify-between gap-2"><span className="font-bold">활동 점수</span><span className="font-mono font-bold text-accent">{impact.activityDelta > 0 ? "+" : ""}{points(impact.activityDelta)}</span></p>
            {impact.delta === 0 && <p className="text-xs text-muted">목표를 이미 채워서 기본 점수는 더 오르지 않아요.</p>}
            {impact.activityDelta > 0 && (
              <details data-testid="activity-detail" className="text-xs text-muted">
                <summary className="tap-44 cursor-pointer py-2 font-bold">활동 점수 자세히</summary>
                <ul className="space-y-1 pb-1">
                  <li className="flex justify-between gap-2"><span>운동한 날</span><span className="font-mono">+{points(impact.activityParts.days)}</span></li>
                  <li className="flex justify-between gap-2"><span>운동 횟수</span><span className="font-mono">+{points(impact.activityParts.sessions)}</span></li>
                  <li className="flex justify-between gap-2"><span>운동 시간</span><span className="font-mono">+{points(impact.activityParts.minutes)}</span></li>
                </ul>
              </details>
            )}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-accent-weak px-3 py-2">
            <b className="text-lg">{impact.beforeRank}위 → {impact.afterRank}위</b>
            <span className="text-xs font-bold text-accent">{movement > 0 ? `${movement}계단 상승` : movement < 0 ? `${-movement}계단 하락` : "순위 유지"}</span>
          </div>
          {!impact.sessionCounted && <SessionGapToast sessionId={sessionId} />}
          {!impact.sessionCounted && <p data-testid="session-gap-notice" className="mt-2 rounded-xl bg-warn/10 p-3 text-xs font-bold leading-relaxed text-warn">이번 운동은 앞선 운동이 끝나고 1시간이 지나기 전에 시작해서 &lsquo;운동 횟수&rsquo;에는 더해지지 않았어요. 운동 시간·거리·무게는 그대로 반영됐어요.</p>}
          {impact.reason && <p className="mt-2 text-xs leading-relaxed text-muted">{impact.reason}</p>}
          {impact.tieReason && <p className="mt-2 text-xs leading-relaxed text-muted">{impact.tieReason}</p>}
          {guidance && <WinGuidanceBox guidance={guidance} />}
          <details className="mt-3 text-xs text-muted"><summary className="tap-44 cursor-pointer py-3 font-bold">목표별 반영 내역</summary><ul className="space-y-2">{impact.goalChanges.map((g,i)=><li key={`${g.type}:${i}`} className="flex justify-between gap-2"><span>{g.label}</span><span>{g.before.toLocaleString("ko-KR",{maximumFractionDigits:1})} → {g.after.toLocaleString("ko-KR",{maximumFractionDigits:1})}{g.unit}</span></li>)}</ul></details>
          <p className="mt-2 text-[11px] leading-relaxed text-faint">현재 참가자 기록 기준으로 이번 운동 반영 전후를 비교했어요. 동점 가산점은 기본 점수와 별도로 순위에 반영돼요.</p>
          <Link href={`/challenge?open=${encodeURIComponent(context.id)}&ranking=overall`} className="mt-3 flex min-h-11 items-center justify-center rounded-xl border border-line px-3 text-sm font-extrabold">챌린지 랭킹 보기</Link>
        </>
      )}
    </section>
  );
}

function PlanCard({ userId, context, exercises, onAdd, now, tabataMinutes }: {
  userId:string; context:ActiveChallengeContext; exercises:readonly LocalExercise[]; onAdd?:(exercise:FinishedDraftExercise)=>boolean|void; now?:Date; tabataMinutes?:number|null;
}) {
  // 인터벌(타바타)이면 코스 분수가 기록에 실린다 — 시작 전에 "이걸 하면 몇 점"을 보여 주는 카드다
  const interval=Boolean(tabataMinutes);
  const {read,refresh}=useSnapshot(userId,context.id,"plan");
  const [usedNames,setUsedNames]=useState<string[]>([]);
  const [plannedAt,setPlannedAt]=useState(()=>now?.getTime()??Date.now());
  useEffect(()=>{
    const onFocus=()=>{setPlannedAt(now?.getTime()??Date.now());refresh();};
    const onVisible=()=>{if(document.visibilityState==="visible") onFocus();};
    window.addEventListener("focus",onFocus); document.addEventListener("visibilitychange",onVisible);
    return ()=>{window.removeEventListener("focus",onFocus);document.removeEventListener("visibilitychange",onVisible);};
  },[refresh,now]);
  const plan=useMemo(()=>toPeriodSessionRow({userId,completedAtMs:plannedAt,startedAtMs:plannedAt,tabataMinutes:tabataMinutes??null,exercises:exercises.map((ex)=>({...ex,sets:ex.sets.map((s)=>({...s,done:true,durationMin:durationSecondsOf(s)/60}))}))}),[userId,exercises,plannedAt,tabataMinutes]);
  const forecast=read?.snapshot ? forecastWorkout(read.snapshot,userId,plan):null;
  const guidance=read?.snapshot && forecast ? winGuidance(read.snapshot,userId,plan):null;
  const suggestions=useMemo(()=>onAdd && !interval && read?.snapshot && usedNames.length<2 ? recommendWorkoutAdditions(read.snapshot,userId,plan).filter((s)=>!usedNames.includes(s.exercise.name)):[],[read,plan,userId,usedNames,onAdd,interval]);
  if(read && !read.error && !forecast) return null;
  return <section className="rounded-card border border-accent/30 bg-surface p-4" aria-label={`${context.name} 계획 예상 점수`}>
    <p className="text-xs font-extrabold text-muted">{read?.snapshot?.challenge.name??context.name}</p>
    {!read ? <p className="mt-2 text-sm text-muted" role="status">계획의 예상 점수를 확인하고 있어요…</p> : read.error ? <><p className="mt-2 text-sm text-muted">예상 점수를 불러오지 못했어요. 운동은 그대로 진행할 수 있어요.</p><button type="button" className="tap-44 text-xs font-bold text-accent" onClick={refresh}>다시 확인</button></> : forecast && <>
      <p className="mt-3 text-sm font-bold">{interval?"이 인터벌을 마치면":"이 계획을 완료하면"}</p>
      <p className="mt-1 font-mono text-[25px] font-black text-accent">예상 +{points(forecast.totalDelta)}점</p>
      <p className="mt-1 text-xs text-muted">기본 점수 +{points(forecast.delta)} ({points(forecast.beforeScore)} → {points(forecast.afterScore)}점)</p>
      {forecast.activityDelta > 0 && <p data-testid="activity-forecast" className="mt-1 text-xs font-bold">활동 점수 <span className="font-mono text-accent">+{points(forecast.activityDelta)}점</span> <span className="font-normal text-muted">· 총점 {points(forecast.beforeTotal)} → {points(forecast.afterTotal)}점</span></p>}
      {!forecast.sessionCounted && <p data-testid="session-gap-forecast-notice" className="mt-2 rounded-xl bg-warn/10 p-3 text-xs font-bold leading-relaxed text-warn">앞선 운동이 끝나고 1시간이 지나기 전이라, 이 운동은 &lsquo;운동 횟수&rsquo;에 더해지지 않아요. 예상 점수에도 횟수 점수는 빠져 있어요.</p>}
      {forecast.reason && <p className="mt-2 text-xs text-muted">{forecast.reason}</p>}
      {guidance && <WinGuidanceBox guidance={guidance}/>}
      {suggestions.length>0 && <div className="mt-3 space-y-2 border-t border-line pt-3">{suggestions.map((suggestion)=><div key={suggestion.id} className="rounded-xl bg-accent-weak p-3"><p className="text-[13px] font-extrabold">{suggestion.label}</p><p className="mt-1 text-xs text-muted">현재 계획보다 <b className="text-accent">+{points(suggestion.extraPoints)}점 더</b> · 최종 예상 {points(suggestion.afterScore)}점</p><button type="button" className="mt-2 min-h-11 rounded-xl border border-accent/40 px-4 text-xs font-extrabold text-accent" onClick={()=>{if(onAdd?.(suggestion.exercise)!==false)setUsedNames((names)=>[...names,suggestion.exercise.name]);}}>계획에 추가</button></div>)}</div>}
      <p className="mt-3 text-[11px] leading-relaxed text-faint">{interval?(context.photoRequired?"끝까지 하고 사진 인증했을 때의 예상 점수예요.":"끝까지 했을 때의 예상 점수예요."):(context.photoRequired?"계획대로 완료하고 사진 인증했을 때의 예상 점수예요.":"계획대로 완료했을 때의 예상 점수예요.")}{!interval&&" 추가 제안은 각각 하나를 적용한 경우예요. 무리하지 않는 범위에서 선택하세요."}</p>
    </>}
  </section>;
}

export function ChallengePlanFeedback({userId,contexts,exercises,onAdd,now,tabataMinutes}:{userId:string;contexts:readonly ActiveChallengeContext[];exercises:readonly LocalExercise[];onAdd?:(exercise:FinishedDraftExercise)=>boolean|void;now?:Date;tabataMinutes?:number|null}) {
  // 인터벌은 종목을 아직 안 골랐어도 코스 분수만으로 횟수·시간 점수가 생긴다
  if(exercises.length===0 && !tabataMinutes) return null;
  return <>{contexts.filter((c)=>c.liveRanking===true && c.goals.length>0).map((context)=><PlanCard key={context.id} userId={userId} context={context} exercises={exercises} onAdd={onAdd} now={now} tabataMinutes={tabataMinutes}/>)}</>;
}
