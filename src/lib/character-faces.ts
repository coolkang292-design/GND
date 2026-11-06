import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  evolutionAvatarSrc,
  normalizeCharacterVariant,
} from "@/lib/domain/character-variant";

/**
 * 다른 사람의 **아바타용 캐릭터 얼굴** 경로 — 챌린지 참가자 목록·랭킹·활동 등.
 *
 * 단계·외형은 `get_character_faces` RPC(0123)가 준다. 그 사람과 크루·그룹·챌린지를 같이 할 때만
 * 값이 나오고, 아니면 빈 값이다 → 화면은 기존 아바타(이모지)로 남는다.
 *
 * 한 화면에 아바타가 수십 개라 **사람마다 부르면 요청이 수십 번**이다. 같은 틱에 요청된 id를
 * 모아 **한 번에** 묻고(배치), 받은 값은 세션 동안 기억한다(캐시). 단계가 바뀌는 건 하루에
 * 한 번 있을까 말까 하므로 새로고침 때 갱신되면 충분하다.
 */

type Entry = { stage: number; variant: string };

const cache = new Map<string, string | null>(); // userId → face src(null = 값 없음)
const waiters = new Map<string, Set<() => void>>();
let queue = new Set<string>();
let scheduled = false;

function notify(id: string) {
  for (const fn of waiters.get(id) ?? []) fn();
}

async function flush() {
  scheduled = false;
  const ids = [...queue];
  queue = new Set();
  if (ids.length === 0) return;
  const found = new Map<string, Entry>();
  try {
    const supabase = getSupabaseBrowserClient();
    // RPC 상한이 200이라 나눠서 보낸다
    for (let i = 0; i < ids.length; i += 200) {
      const { data, error } = await supabase.rpc("get_character_faces", {
        p_user_ids: ids.slice(i, i + 200),
      });
      if (error) continue; // 실패하면 값 없음으로 둔다 — 아바타는 장식이다
      for (const row of (data ?? []) as {
        user_id: string;
        stage: number;
        variant: string;
      }[]) {
        found.set(row.user_id, { stage: row.stage, variant: row.variant });
      }
    }
  } catch {
    /* 네트워크 실패 — 아래에서 값 없음으로 처리 */
  }
  for (const id of ids) {
    const e = found.get(id);
    cache.set(
      id,
      e ? evolutionAvatarSrc(e.stage, normalizeCharacterVariant(e.variant)) : null,
    );
    notify(id);
  }
}

function request(id: string) {
  if (cache.has(id) || queue.has(id)) return;
  queue.add(id);
  if (!scheduled) {
    scheduled = true;
    queueMicrotask(() => void flush());
  }
}

/**
 * 한 사람의 캐릭터 얼굴 경로. 아직 모르거나 값이 없으면 `null` — 부르는 쪽은 기존 아바타를 그린다.
 * `userId`가 없으면 조회하지 않는다.
 */
export function useCharacterFace(userId: string | null | undefined): string | null {
  const [, force] = useState(0);
  useEffect(() => {
    if (!userId) return;
    const bump = () => force((n) => n + 1);
    let set = waiters.get(userId);
    if (!set) {
      set = new Set();
      waiters.set(userId, set);
    }
    set.add(bump);
    if (!cache.has(userId)) request(userId);
    return () => {
      set.delete(bump);
    };
  }, [userId]);
  return userId ? (cache.get(userId) ?? null) : null;
}

/** 테스트용 — 캐시·대기열 초기화 */
export function __resetCharacterFacesForTest() {
  cache.clear();
  waiters.clear();
  queue = new Set();
  scheduled = false;
}
