/** 운영 읽기 전용. 환경변수 없으면 건너뛰며 계정·운동·XP를 만들거나 수정하지 않는다. */
import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { computeStageGrowth, computeEvolutionGrowthScore, toMetricPoints, type RawSession } from "./level-growth";
import { getStageGrowthGoal, STAGE_RULES, countSteadyWindows } from "./evolution-gate";
import { getStageGroups } from "./progression";
import { daysBetween } from "./evolution";
import { DEFAULT_TIMEZONE, dayKey } from "./time";

describe.skipIf(process.env.EVOLUTION_GATE_SIMULATION !== "1")("진화 규칙 전원 영향 분석(읽기 전용)", () => {
  it("현재 단계의 성장 수·상위N 평균·유산소 비교 가능 범위를 출력하고 진행도 불변 확인", async () => {
    const env = Object.fromEntries(readFileSync(".env.local", "utf8").split(/\r?\n/)
      .filter(l => l.includes("=")).map(l => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));
    const base = env.NEXT_PUBLIC_SUPABASE_URL;
    const key = env.SUPABASE_SERVICE_ROLE_KEY;
    expect(Boolean(base && key), "운영 읽기 전용 설정 필요").toBe(true);
    async function get<T>(path: string): Promise<T[]> {
      const response = await fetch(`${base}/rest/v1/${path}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
      if (!response.ok) throw new Error(`읽기 전용 조회 실패 HTTP ${response.status}`);
      return response.json();
    }
    type Progress = { user_id: string; total_xp: number; current_level: number; current_stage: number };
    const selectProgress = "user_progress?select=user_id,total_xp,current_level,current_stage&order=user_id.asc";
    const progress = await get<Progress>(selectProgress);
    const profiles = await get<{ id: string; nickname: string }>("profiles?select=id,nickname");
    const history = await get<{ user_id: string; level: number; entered_at: string }>("user_level_history?select=user_id,level,entered_at&limit=1000");
    expect(progress.length).toBeGreaterThan(0);
    expect(Math.max(progress.length, profiles.length, history.length), "API 상한이면 분석을 중단한다").toBeLessThan(1000);
    const groups = getStageGroups();
    const rows: Record<string, string | number>[] = [];
    for (const p of progress) {
      const stage = groups[p.current_stage - 1];
      const previous = groups[p.current_stage - 2];
      const entry = history.find(h => h.user_id === p.user_id && h.level === stage.startLevel);
      const previousEntry = history.find(h => h.user_id === p.user_id && h.level === previous?.startLevel);
      const nickname = profiles.find(profile => profile.id === p.user_id)?.nickname ?? "프로필 없음";
      if (!entry) {
        rows.push({ 사용자: nickname, 레벨: p.current_level, 현재단계: p.current_stage, 상태: "XP진화/단계기준준비중" });
        continue;
      }
      const sessions: RawSession[] = [];
      for (let page = 0; page < 20; page++) {
        const got = await get<RawSession>(`workout_sessions?select=id,completed_at,tabata_minutes,workout_exercises(exercise_name,exercise_type,sort_order,workout_sets(weight_kg,reps,duration_seconds,distance_meters,is_completed))&user_id=eq.${p.user_id}&status=eq.completed&deleted_at=is.null&completed_at=not.is.null&order=completed_at.asc,id.asc&limit=1000&offset=${page * 1000}`);
        sessions.push(...got);
        if (got.length < 1000) break;
        if (page === 19) throw new Error("분석 상한 초과: 부분 기록으로 판정하지 않음");
      }
      const points = toMetricPoints(sessions);
      const growth = computeStageGrowth({ points, stageEnteredAtMs: Date.parse(entry.entered_at),
        previousStageEnteredAtMs: previousEntry ? Date.parse(previousEntry.entered_at) : null });
      const goal = getStageGrowthGoal(p.current_stage, growth.previousStageExerciseCount);
      const score = goal.mode === "growth_preview" ? computeEvolutionGrowthScore(growth, goal.requiredCount) : null;
      const days = [...new Set(sessions.map(s => dayKey(new Date(s.completed_at), DEFAULT_TIMEZONE)))].sort();
      const elapsedWeeks = days.length ? Math.floor(daysBetween(days[0], dayKey(new Date(), DEFAULT_TIMEZONE)) / 7) : 0;
      const rule = goal.nextStage ? STAGE_RULES[goal.nextStage] : null;
      const steady = countSteadyWindows(days, dayKey(new Date(entry.entered_at), DEFAULT_TIMEZONE), dayKey(new Date(), DEFAULT_TIMEZONE));
      rows.push({ 사용자: nickname, 레벨: p.current_level, 현재단계: p.current_stage,
        다음진화: goal.nextStage ?? "최종", M: growth.previousStageExerciseCount ?? "—",
        N: goal.mode === "growth_preview" ? goal.requiredCount : "—", 성장: growth.growths.length,
        평균: score ? Number(score.averagePct.toFixed(4)) : "—",
        평균목표: goal.mode === "growth_preview" ? goal.averageTargetPct : "—",
        성장조건: goal.mode === "xp_only" ? "XP만" : score && goal.mode === "growth_preview"
          ? score.countMet && score.averagePct >= goal.averageTargetPct ? "충족" : "미충족" : goal.mode,
        유산소수행: points.filter(point => point.kind === "c").length,
        유산소성장: growth.growths.filter(g => g.kind === "c").length,
        유산소조건불일치: growth.unmatched.filter(g => g.reason === "cardio_condition").length,
        운동일: days.length, 경과주: elapsedWeeks,
        필요일: rule?.habit?.kind === "days" ? rule.habit.required : "—", 필요주: rule?.habit?.kind === "weeks" ? rule.habit.required : "—",
        꾸준함: rule && rule.steadyRequired > 0 ? `${steady}/${rule.steadyRequired}` : "—",
      });
    }
    console.table(rows);
    expect(rows).toHaveLength(progress.length);
    expect(await get<Progress>(selectProgress)).toEqual(progress);
    const headers = [...new Set(rows.flatMap(row => Object.keys(row)))];
    const cell = (value: string | number | undefined) => String(value ?? "—").replace(/\|/g, "\\|").replace(/[\r\n]/g, " ");
    writeFileSync("docs/superpowers/evolution-gate-simulation-2026-11-13.md", [
      "# 진화 조건 읽기 전용 시뮬레이션", "", `측정: ${new Date().toISOString()}`, "",
      "시동러까지 XP만 적용. 꾸준러부터 최소 N종목과 상위 N개 합/N의 평균 목표를 모두 평가한 초안이다.",
      "실제 서버 규칙은 바꾸지 않았다. 현재 진행 중 단계의 참고 결과이며 최종 탈락 판정이 아니다.",
      "운동일은 현행 표시와 같은 완료·미삭제 세션 날짜 기준. 유산소는 정확히 같은 시간 또는 속도 조건만 비교했다.",
      "평균 목표·M의 정의·N 비율·습관/미션 조건은 운영 활성화 전 승인 대상이다. 계정 ID·인증 정보는 포함하지 않는다.", "",
      `| ${headers.join(" | ")} |`, `| ${headers.map(() => "---").join(" | ")} |`,
      ...rows.map(row => `| ${headers.map(header => cell(row[header])).join(" | ")} |`), "",
      "검증: 사용자별 진행도(경험치·레벨·단계) 조회 전후 일치. 계정 생성·운동 기록·XP·알림 변경 없음.", "",
    ].join("\n"), "utf8");
  }, 120_000);
});
