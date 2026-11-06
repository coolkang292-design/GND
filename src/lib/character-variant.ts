import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  characterSrc,
  normalizeCharacterVariant,
  type CharacterVariant,
} from "@/lib/domain/character-variant";

export {
  CHARACTER_NAMES,
  CHARACTER_VARIANTS,
  characterSrc,
  evolutionAvatarSrc,
  normalizeCharacterVariant,
  type CharacterVariant,
} from "@/lib/domain/character-variant";

/**
 * 다른 사람들의 외형. `profiles` SELECT 정책이 본인·크루·같은 그룹에게 열려 있어
 * 새 DB 작업이 필요 없다. **실패하면 빈 맵** — 호출부는 male로 그린다(기존 동작).
 */
export async function getCharacterVariants(
  ids: string[],
): Promise<Map<string, CharacterVariant>> {
  const out = new Map<string, CharacterVariant>();
  if (ids.length === 0) return out;
  try {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase
      .from("profiles")
      .select("id, character_variant")
      .in("id", ids);
    if (error) return out;
    for (const r of (data ?? []) as { id: string; character_variant?: unknown }[]) {
      out.set(r.id, normalizeCharacterVariant(r.character_variant));
    }
  } catch {
    /* 외형은 장식이다 — 실패해도 화면을 막지 않는다 */
  }
  return out;
}

/** 내 `character_variant`. RLS로 본인 행만 보인다. 실패하면 male(기존 동작). */
export async function getMyCharacterVariant(): Promise<CharacterVariant> {
  const supabase = getSupabaseBrowserClient();
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return "male";
  const { data, error } = await supabase
    .from("profiles")
    .select("character_variant")
    .eq("id", uid)
    .maybeSingle();
  if (error) return "male";
  return normalizeCharacterVariant(
    (data as { character_variant?: unknown } | null)?.character_variant,
  );
}

/** 요약을 안 들고 있는 화면(XP 모달 등)용. 첫 렌더는 male, 조회 후 바뀐다. */
export function useMyCharacterVariant(): CharacterVariant {
  const [variant, setVariant] = useState<CharacterVariant>("male");
  useEffect(() => {
    let alive = true;
    getMyCharacterVariant().then((v) => {
      if (alive) setVariant(v);
    });
    return () => {
      alive = false;
    };
  }, []);
  return variant;
}


/**
 * 내 전신 캐릭터 이미지 경로 (현재 단계와 외형) - 오늘의 퀘스트 카드 오른쪽에 그린다.
 * 본인 행만 읽는다(RLS). 못 읽거나 단계가 범위 밖이면 null: 그림 없이 카드만 그린다.
 */
export async function getMyCharacterFullSrc(): Promise<string | null> {
  try {
    const supabase = getSupabaseBrowserClient();
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) return null;
    const [profile, progress] = await Promise.all([
      supabase.from("profiles").select("character_variant").eq("id", uid).maybeSingle(),
      supabase.from("user_progress").select("current_stage").eq("user_id", uid).maybeSingle(),
    ]);
    const stage = (progress.data as { current_stage?: number } | null)?.current_stage ?? 1;
    if (!Number.isInteger(stage) || stage < 1 || stage > 7) return null;
    const variant = normalizeCharacterVariant(
      (profile.data as { character_variant?: unknown } | null)?.character_variant,
    );
    return characterSrc(`/characters/char-${stage}.png`, variant);
  } catch {
    return null;
  }
}

export function useMyCharacterFullSrc(): string | null {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    getMyCharacterFullSrc().then((v) => {
      if (alive) setSrc(v);
    });
    return () => {
      alive = false;
    };
  }, []);
  return src;
}
