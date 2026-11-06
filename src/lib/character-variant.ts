import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * 캐릭터 외형. `profiles.character_variant` (기본 'male').
 * 레벨·XP·단계 계산과 무관하다 — 이미지 경로만 바꾼다.
 */
export type CharacterVariant = "male" | "female";

export function normalizeCharacterVariant(v: unknown): CharacterVariant {
  return v === "female" ? "female" : "male";
}

/**
 * `/characters/char-N.png` → female이면 `/characters/female/char-N.png`.
 * male이거나 모르는 경로면 그대로 둔다.
 */
export function characterSrc(path: string, variant: CharacterVariant): string {
  if (variant !== "female") return path;
  return path.replace(/^\/characters\/(char-\d+\.png)$/, "/characters/female/$1");
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
