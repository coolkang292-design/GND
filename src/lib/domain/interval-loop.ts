import { INTERVAL_BLOCK_SECONDS } from "@/lib/domain/interval-cue";
import type { TabataMinutes } from "@/lib/domain/tabata";

/**
 * 인터벌 음원 반복 재생 (2026-11-19, GND 배포 용량).
 *
 * 8·16분 코스는 4분 음원(블록, 250.02초)을 2·4번 **그대로 반복**한 것이었다.
 * 파일을 따로 두는 대신 4분 파일 하나를 `audio.loop`로 돌린다 — 정적 자산 56MB → 8MB.
 *
 * 화면은 `intervalCueAt(누적 경과)`가 그린다. 누적 경과는 파일 위치
 * (`audio.currentTime`, 0~250)에 지나간 블록 수를 더한 값이다. 블록 수는
 * **currentTime이 크게 되감길 때** 하나 올린다.
 */

/** 이 값보다 크게 줄어들면 파일이 처음으로 되감긴 것으로 본다 (초) */
export const LOOP_REWIND_THRESHOLD_SECONDS = 1;

/** 코스 전체가 몇 번의 블록(4분 음원 재생)으로 이뤄지는지 */
export function intervalBlockCount(minutes: TabataMinutes): number {
  return minutes / 4;
}

/**
 * 한 번 더 돌려야 하는가 — 마지막 블록은 `loop`를 꺼서 끝에서 `ended`가 오게 한다.
 * (끝에서 반복음이 새지 않고 곧바로 운동 완료로 넘어간다)
 */
export function shouldLoopAudio(block: number, totalBlocks: number): boolean {
  return block < totalBlocks - 1;
}

/**
 * 새로 읽은 `currentTime`으로 블록 번호를 갱신한다.
 *
 * - 직전 값보다 1초 넘게 줄었으면 되감김 → +1 (마지막 블록을 넘지 않는다)
 * - 그 밖(일반 진행, 같은 값, 1초 이하의 흔들림)은 그대로
 */
export function advanceLoopBlock(input: {
  block: number;
  totalBlocks: number;
  prevTime: number;
  currentTime: number;
}): number {
  const { block, totalBlocks, prevTime, currentTime } = input;
  if (!Number.isFinite(prevTime) || !Number.isFinite(currentTime)) return block;
  const rewound = currentTime < prevTime - LOOP_REWIND_THRESHOLD_SECONDS;
  if (!rewound) return block;
  return Math.min(block + 1, Math.max(totalBlocks - 1, 0));
}

/** 블록 번호 + 파일 위치 → 코스 전체의 누적 경과 (초) */
export function cumulativeIntervalElapsed(
  block: number,
  currentTime: number,
): number {
  const time = Number.isFinite(currentTime) && currentTime > 0 ? currentTime : 0;
  return Math.max(block, 0) * INTERVAL_BLOCK_SECONDS + time;
}
