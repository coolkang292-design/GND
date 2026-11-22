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
  7: { name: "전설", desc: "개노답을 완전히 탈출했어요. 운동이 곧 나예요." },
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
  /**
   * 단계별 경험치 방식(`getStageLevelProgress`)에서만 채운다. true = 이 단계의 경험치 양을 다 채워
   * 레벨이 단계 마지막 레벨에서 멈춘 상태 — 진화 조건을 채워야 다음 레벨로 간다(최고 레벨이 아니다).
   */
  capped?: boolean;
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

// ── 단계별 경험치 방식 (2026-11-22, 사용자 확정) ──────────────────────────────────────────
//
// 레벨은 **누적 경험치가 아니라 "현재 단계에서 쌓은 경험치"(stage_xp)** 로 정한다. 단계가 올라갈
// 때 새 단계의 출발점은 그 순간의 누적 경험치라서(= stage_xp가 0에서 시작) 막혀 있는 동안 넘친
// 경험치가 다음 단계 조건을 미리 채우지 않는다. 누적 경험치(`total_xp`)는 그대로 계속 쌓인다.
// 서버 규칙·설계: docs/superpowers/plans/2026-11-22-evolution-mission-and-stage-xp.md §3
//
// ⚠️ 서버(`user_progress.stage_xp`)가 null이면 아직 옛 방식이다 — 호출부는 `resolveLevelProgress`를
//    써서 두 방식을 한 곳에서 가른다.

/** 한 단계에서 채울 경험치 양 — 그 단계 첫 레벨 컷과 다음 단계 첫 레벨 컷의 차. 7단계는 35레벨 컷까지 */
export function getStageXpWidth(stageIndex: number): number {
  const first = LEVEL_DEFS.find((d) => d.stageIndex === stageIndex);
  if (!first) throw new RangeError("invalid stage");
  const nextFirst = LEVEL_DEFS.find((d) => d.stageIndex === stageIndex + 1);
  const end = nextFirst ?? LEVEL_DEFS[LEVEL_DEFS.length - 1];
  return end.requiredTotalXp - first.requiredTotalXp;
}

/**
 * 단계 안 레벨/진행도. 한 단계는 5레벨이고 레벨 폭은 균등하다(`단계 양 / 5`, 마지막 7단계만 `/ 4`).
 * `stageXp`가 단계 양에 닿으면 `capped`(7단계 제외) — 레벨은 단계 마지막 레벨에서 멈춘다.
 */
export function getStageLevelProgress(stageIndex: number, stageXp: number): LevelProgress {
  if (!Number.isFinite(stageXp)) throw new Error("stageXp must be finite");
  const first = LEVEL_DEFS.find((d) => d.stageIndex === stageIndex);
  if (!first) throw new RangeError("invalid stage");
  const xp = Math.max(0, stageXp); // 취소(음수) 적립으로 0 아래로 내려가지 않게
  const width = getStageXpWidth(stageIndex);
  const isLastStage = stageIndex === STAGES.length;
  // 1~6단계는 5레벨이 단계 양을 5등분하고 다음 단계 첫 레벨이 그 끝이다. 마지막(7)단계는 끝이
  // 35레벨 자체라 4등분이다(31~35레벨, 폭 1250).
  const step = isLastStage ? width / 4 : width / 5;
  const index = Math.min(4, Math.floor(xp / step));
  const level = LEVEL_DEFS[first.level - 1 + index];
  const capped = !isLastStage && xp >= width;
  const base = {
    currentLevel: level.level,
    currentStageIndex: level.stageIndex,
    stageName: level.stageName,
    characterPath: level.characterPath,
  };
  if (isLastStage && index === 4) {
    // 전설(마지막 단계)의 마지막 레벨 = 최고 레벨
    return { ...base, nextLevelRequiredXp: null, xpIntoLevel: 0, xpForLevel: 0, xpToNextLevel: 0, percent: 100, capped: false };
  }
  if (capped) {
    return { ...base, nextLevelRequiredXp: width, xpIntoLevel: step, xpForLevel: step, xpToNextLevel: 0, percent: 100, capped: true };
  }
  const nextThreshold = index === 4 ? width : (index + 1) * step;
  const xpIntoLevel = xp - index * step;
  return {
    ...base,
    nextLevelRequiredXp: nextThreshold,
    xpIntoLevel,
    xpForLevel: step,
    xpToNextLevel: nextThreshold - xp,
    percent: (xpIntoLevel / step) * 100,
    capped: false,
  };
}

/**
 * 레벨 표시의 단일 진입점. 서버가 `stage_xp`를 주면(단계별 경험치 방식) 그 값으로, null/없음이면
 * **지금까지와 똑같이** 누적 경험치로 계산한다 — 서버 전환 전에는 화면이 하나도 달라지지 않는다.
 */
export function resolveLevelProgress(input: {
  totalXp: number;
  /** 서버가 인정한 현재 단계(1~7) */
  stage: number | null | undefined;
  stageXp: number | null | undefined;
}): LevelProgress {
  const { totalXp, stage, stageXp } = input;
  if (typeof stageXp === "number" && Number.isFinite(stageXp) && Number.isInteger(stage) && (stage as number) >= 1 && (stage as number) <= STAGES.length) {
    return getStageLevelProgress(stage as number, stageXp);
  }
  return getLevelProgress(totalXp);
}
