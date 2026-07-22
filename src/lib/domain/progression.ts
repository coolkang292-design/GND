/**
 * 영구 성장 레벨(1~35)·7단계 순수 함수. **챌린지 레벨(level.ts)과 무관.**
 *
 * 기준 데이터 원칙:
 * - **공식 기준 데이터는 `public.level_definitions`(DB)다.**
 * - 아래 `LEVEL_DEFS`는 클라이언트 즉시 계산용 **정적 미러**일 뿐이다.
 * - 두 정의가 어긋나면 홈/내 정보 표시와 서버 지급이 불일치한다.
 * - 그래서 실 DB 테스트(Task 7)에서 DB와 이 미러의 아래 필드가
 *   하나라도 다르면 테스트를 실패시킨다:
 *   level · required_total_xp · stage_index · stage_key · stage_name · character_path
 */
export type StageKey =
  | "gaenodap" | "nuntteotgae" | "ildanhagae" | "mulgogagae"
  | "michyeobogae" | "paneuljjagae" | "jeonseorigae";

export interface LevelDefinition {
  level: number;
  requiredTotalXp: number;
  stageIndex: number;
  stageKey: StageKey;
  stageName: string;
  characterPath: string;
}

const STAGES: [StageKey, string][] = [
  ["gaenodap", "개노답"], ["nuntteotgae", "눈떴개"], ["ildanhagae", "일단하개"],
  ["mulgogagae", "물고가개"], ["michyeobogae", "미쳐보개"], ["paneuljjagae", "판을짜개"],
  ["jeonseorigae", "전설이개"],
];

const CUTS = [
  0, 200, 400, 600, 800, 1000, 1400, 1800, 2200, 2600, 3000, 3600, 4200, 4800,
  5400, 6000, 6800, 7600, 8400, 9200, 10000, 11000, 12000, 13000, 14000, 15000,
  16200, 17400, 18600, 19800, 21000, 22250, 23500, 24750, 26000,
];

export const LEVEL_DEFS: LevelDefinition[] = CUTS.map((xp, i) => {
  const level = i + 1;
  const stageIndex = Math.ceil(level / 5); // 1~5→1, 6~10→2 …
  const [stageKey, stageName] = STAGES[stageIndex - 1];
  return {
    level,
    requiredTotalXp: xp,
    stageIndex,
    stageKey,
    stageName,
    characterPath: `/characters/char-${stageIndex}.png`,
  };
});

export const MAX_LEVEL = 35;

export function getLevelFromTotalXp(totalXp: number): LevelDefinition {
  if (!Number.isFinite(totalXp) || totalXp < 0) {
    throw new Error("totalXp must be a non-negative finite number");
  }
  let matched = LEVEL_DEFS[0];
  for (const d of LEVEL_DEFS) {
    if (totalXp >= d.requiredTotalXp) matched = d;
    else break;
  }
  return matched;
}

export interface LevelProgress {
  currentLevel: number;
  currentStageIndex: number;
  stageName: string;
  characterPath: string;
  nextLevelRequiredXp: number | null;
  xpIntoLevel: number;
  xpForLevel: number;
  xpToNextLevel: number;
  percent: number; // 0~100
}

export function getLevelProgress(totalXp: number): LevelProgress {
  const cur = getLevelFromTotalXp(totalXp);
  const next = LEVEL_DEFS[cur.level] ?? null; // level은 1-index, 배열은 0-index → 다음은 [cur.level]
  if (!next) {
    return {
      currentLevel: cur.level, currentStageIndex: cur.stageIndex, stageName: cur.stageName,
      characterPath: cur.characterPath, nextLevelRequiredXp: null,
      xpIntoLevel: 0, xpForLevel: 0, xpToNextLevel: 0, percent: 100,
    };
  }
  const xpIntoLevel = totalXp - cur.requiredTotalXp;
  const xpForLevel = next.requiredTotalXp - cur.requiredTotalXp;
  return {
    currentLevel: cur.level, currentStageIndex: cur.stageIndex, stageName: cur.stageName,
    characterPath: cur.characterPath, nextLevelRequiredXp: next.requiredTotalXp,
    xpIntoLevel, xpForLevel, xpToNextLevel: next.requiredTotalXp - totalXp,
    percent: (xpIntoLevel / xpForLevel) * 100,
  };
}
