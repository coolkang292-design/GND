import { getSupabaseBrowserClient } from "./supabase/client";
import { parseStageGateStatus, type StageGateStatus } from "./domain/evolution-gate";

/** 단계 서버가 아직 설치되지 않은 기존 배포만 호환한다. 다른 오류는 반드시 화면에 알린다. */
export async function getMyStageEvolutionStatus(): Promise<StageGateStatus | null> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("get_my_stage_evolution_status");
  if (error) {
    if (error.code === "PGRST202" || error.code === "42883") {
      const setting = await supabase.from("stage_evolution_settings").select("enabled").eq("singleton", true).single();
      if (setting.error?.code === "42P01" || setting.error?.code === "PGRST205") return null;
      if (setting.error) throw setting.error;
      if (setting.data?.enabled === false) return null;
    }
    throw error;
  }
  return parseStageGateStatus(data);
}

/** 성장 허브에서 본인만 한 번 재판정. 서버 OFF/미설치 상태에서는 쓰기 RPC를 호출하지 않는다. */
export async function refreshMyStageEvolution(): Promise<StageGateStatus | null> {
  const current = await getMyStageEvolutionStatus();
  if (!current || current.mode === "legacy_xp") return current;
  const { data, error } = await getSupabaseBrowserClient().rpc("refresh_my_stage_evolution");
  if (error) throw error;
  return parseStageGateStatus(data);
}
