/**
 * 크루 프로필 공개 완료 기록의 월별 읽기 전용 조회.
 *
 * 운동 완료 여부의 단일 원천은 workout_sessions. 새로운 저장소/통계 캐시 없음.
 * DB의 sessions_select_own_or_crew RLS가 관계를 최종적으로 검사한다.
 * visibility='group'도 명시해 본인 화면에서도 비공개 운동을 노출하지 않는다.
 */
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  summarizePublicCrewMonth,
  type PublicCrewMonth,
} from "@/lib/domain/crew-calendar";
import { DEFAULT_TIMEZONE } from "@/lib/domain/time";
import type { Verification } from "@/lib/domain/calendar";

export type PublicCrewCalendarMonth = PublicCrewMonth & { timeZone: string };

function validTimeZone(input: string | null | undefined): string {
  const candidate = input || DEFAULT_TIMEZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate });
    return candidate;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

/**
 * 날짜 범위는 양 끝 48시간을 더 조회한 후 대상의 시간대로 재분류한다.
 * 48시간은 유효한 IANA 시간대의 월 경계 차이를 포함한다.
 * 월을 이동할 때마다 해당 월만 조회해 운동 이력 전량을 다운로드하지 않는다.
 */
/**
 * 홈에서 본인 프로필을 연 경우에만 비공개 완료 운동을 포함한다.
 * auth.getUser 검증으로 다른 사람의 비공개 운동이 조회되지 않도록 한다.
 */
export async function getMyWorkoutCalendarMonth(
  targetId: string,
  year: number,
  month: number,
): Promise<PublicCrewCalendarMonth> {
  const supabase = getSupabaseBrowserClient();
  const { data: auth, error } = await supabase.auth.getUser();
  if (error || !auth.user || auth.user.id !== targetId) {
    throw new Error("private_calendar_owner_only");
  }
  return loadCrewCalendarMonth(targetId, year, month, true);
}

export async function getPublicCrewCalendarMonth(
  targetId: string,
  year: number,
  month: number,
): Promise<PublicCrewCalendarMonth> {
  return loadCrewCalendarMonth(targetId, year, month, false);
}

async function loadCrewCalendarMonth(
  targetId: string,
  year: number,
  month: number,
  includePrivate: boolean,
): Promise<PublicCrewCalendarMonth> {
  if (!Number.isInteger(year) || year < 2000 || year > 2100 ||
      !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error("invalid_calendar_month");
  }

  const extra = 48 * 60 * 60 * 1000;
  const from = new Date(Date.UTC(year, month - 1, 1) - extra).toISOString();
  const until = new Date(Date.UTC(year, month, 1) + extra).toISOString();

  const supabase = getSupabaseBrowserClient();
  let sessionsQuery = supabase.from("workout_sessions")
    .select("completed_at, duration_minutes, verification_status")
    .eq("user_id", targetId)
    .eq("status", "completed");
  // 타인 조회에서는 기존의 visibility 필터를 반드시 유지한다.
  if (!includePrivate) sessionsQuery = sessionsQuery.eq("visibility", "group");
  const [person, records] = await Promise.all([
    supabase.from("profiles").select("timezone").eq("id", targetId).maybeSingle(),
    sessionsQuery
      .is("deleted_at", null)
      .not("completed_at", "is", null)
      .gte("completed_at", from)
      .lt("completed_at", until)
      .order("completed_at", { ascending: true }),
  ]);

  if (person.error) throw person.error;
  if (!person.data) throw new Error("crew_profile_unavailable");
  if (records.error) throw records.error;

  const timeZone = validTimeZone(person.data.timezone);
  const sessions = (records.data ?? []).map((record) => {
    const status = record.verification_status;
    const verification: Verification =
      status === "camera_verified" || status === "photo_uploaded" ? status : "none";
    return {
      completedAt: new Date(record.completed_at as string),
      durationSeconds: Math.max(0, record.duration_minutes ?? 0) * 60,
      verification,
    };
  });

  return {
    ...summarizePublicCrewMonth(sessions, timeZone, year, month),
    timeZone,
  };
}
