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
  ["gaenodap", "개노답"], ["nuntteotgae", "꿈틀러"], ["ildanhagae", "시동러"],
  ["mulgogagae", "꾸준러"], ["michyeobogae", "불꽃러"], ["paneuljjagae", "대장"],
  ["jeonseorigae", "전설"],
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

/**
 * 단계별 상태 설명(설계 §7). 이름은 `STAGES`가 기준이며, 아래 `name`이
 * 어긋나면 테스트가 실패한다 — 표시 문구가 두 곳으로 갈라지는 걸 막는다.
 */
export const STAGE_DESCRIPTIONS: Record<number, { name: string; desc: string }> = {
  1: { name: "개노답", desc: "생각만 많고 아직 안 움직여요. 여기가 출발선이에요. 작은 행동 하나가 탈출의 시작이에요." },
  2: { name: "꿈틀러", desc: "드디어 몸이 반응해요. 작게라도 움직이기 시작했어요." },
  3: { name: "시동러", desc: "완벽하지 않아도 일단 시작해요. 이제 멈추지 않아요." },
  4: { name: "꾸준러", desc: "빠지지 않고 나와요. 운동이 습관으로 붙었어요." },
  5: { name: "불꽃러", desc: "운동에 불이 붙었어요. 불꽃 연속 기록의 주인공이에요." },
  6: { name: "대장", desc: "내 루틴을 직접 짜고 크루를 이끌어요." },
  7: { name: "전설", desc: "GND를 완전히 탈출했어요. 운동이 곧 나예요." },
};

export interface StageGroup {
  stageIndex: number;
  stageKey: StageKey;
  stageName: string;
  description: string;
  startLevel: number;
  endLevel: number;
  requiredTotalXp: number; // 이 단계 첫 레벨의 누적 XP = 해금 기준
  characterPath: string;
}

/** `LEVEL_DEFS`를 7단계로 묶는다 — 성장 허브 캐러셀·다음 단계 미리보기용. */
export function getStageGroups(): StageGroup[] {
  return STAGES.map(([stageKey, stageName], i) => {
    const stageIndex = i + 1;
    const levels = LEVEL_DEFS.filter((d) => d.stageIndex === stageIndex);
    const first = levels[0];
    return {
      stageIndex,
      stageKey,
      stageName,
      description: STAGE_DESCRIPTIONS[stageIndex].desc,
      startLevel: first.level,
      endLevel: levels[levels.length - 1].level,
      requiredTotalXp: first.requiredTotalXp,
      characterPath: first.characterPath,
    };
  });
}

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
