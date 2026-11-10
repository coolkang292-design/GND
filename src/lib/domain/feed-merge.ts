import type { FeedItem } from "@/lib/social";
import { dayKey } from "./time";
import { mergeThreads } from "./session-comments";

/**
 * 같은 사람이 **같은 날** 한 운동들을 피드 카드 하나로 묶는다 (사용자 지시 2026-11-11:
 * "오늘 추가 운동을 하면 기존 생성된 피드에 추가가 되는 구조").
 *
 * ⚠️ **DB 세션은 합치지 않는다.** 세션을 하나로 합치면 운동 기록·XP·기록 갱신·챌린지 집계·
 *    시각이 한꺼번에 얽힌다. 세션은 그대로 두고 **읽을 때 한 카드로 보여 줄 뿐**이다.
 *    그래서 되돌리기도 쉽다(이 함수를 안 거치면 예전 그대로다).
 *
 * 대표 세션 = 그날 **첫 운동**. 좋아요·댓글·한마디·사진은 거기에 붙는다 — 둘째 운동 뒤에
 * 새로 단 댓글도 같은 카드에 쌓인다. 둘째 운동에 이미 달려 있던 댓글·좋아요·사진은
 * 합쳐서 보여 준다.
 *
 * 입력은 **최신순**이다. 결과 카드의 자리는 묶인 것 중 가장 늦은 운동의 자리라, 오늘 추가
 * 운동을 하면 카드가 맨 위로 올라온다. 이미 묶인 카드를 다시 넣어도 같은 결과다(페이지를
 * 이어 붙일 때 쓴다).
 */
export function mergeSameDayFeed(
  items: FeedItem[],
  timeZone: string,
): FeedItem[] {
  const groups = new Map<string, FeedItem[]>();
  const order: string[] = [];
  for (const item of items) {
    const key = `${item.userId}|${dayKey(item.completedAt, timeZone)}`;
    const list = groups.get(key);
    if (list) list.push(item);
    else {
      groups.set(key, [item]);
      order.push(key);
    }
  }
  return order.map((key) => mergeGroup(groups.get(key)!));
}

function mergeGroup(group: FeedItem[]): FeedItem {
  if (group.length === 1) return group[0];
  // 대표 = 가장 이른 운동. 묶인 카드가 섞여 들어와도 `cursorAt`이 가장 이른 시각이다
  const sorted = [...group].sort(
    (a, b) => a.cursorAt.getTime() - b.cursorAt.getTime(),
  );
  const anchor = sorted[0];
  const latest = sorted.reduce((a, b) =>
    b.completedAt.getTime() > a.completedAt.getTime() ? b : a,
  );

  const sessionIds = [...new Set(sorted.flatMap((i) => i.sessionIds))];
  const unique = <T,>(list: T[]) => [...new Set(list)];

  const reactions = { fire: 0, clap: 0, like: 0 } as FeedItem["reactions"];
  for (const i of sorted) {
    for (const k of Object.keys(reactions) as (keyof typeof reactions)[]) {
      reactions[k] += i.reactions[k] ?? 0;
    }
  }

  const notes = unique(
    sorted.map((i) => i.recordNote).filter((n): n is string => Boolean(n)),
  );
  const tabata = sorted
    .map((i) => i.tabataMinutes)
    .filter((n): n is number => typeof n === "number");

  return {
    ...anchor,
    sessionId: anchor.sessionId,
    sessionIds,
    cursorAt: anchor.cursorAt,
    completedAt: latest.completedAt,
    title: sorted.find((i) => i.title)?.title ?? null,
    durationMinutes: sum(sorted, (i) => i.durationMinutes),
    exerciseNames: unique(sorted.flatMap((i) => i.exerciseNames)),
    volume: {
      weightVolumeKg: sum(sorted, (i) => i.volume.weightVolumeKg),
      bodyweightReps: sum(sorted, (i) => i.volume.bodyweightReps),
      cardioDistanceMeters: sum(sorted, (i) => i.volume.cardioDistanceMeters),
      cardioDurationSeconds: sum(sorted, (i) => i.volume.cardioDurationSeconds),
      completedSetCount: sum(sorted, (i) => i.volume.completedSetCount),
    },
    photos: sorted.flatMap((i) => i.photos),
    streak: Math.max(...sorted.map((i) => i.streak)),
    recordNote: notes.length ? notes.join(" / ") : null,
    tabataMinutes: tabata.length ? tabata.reduce((a, b) => a + b, 0) : null,
    breakdown: sorted.flatMap((i) => i.breakdown),
    reactions,
    // 내가 누른 표시는 대표 세션 것만 — 누르면 대표 세션에 걸리기 때문이다
    myReactions: anchor.myReactions,
    thread: mergeThreads(sorted.map((i) => i.thread)),
    likers: unique(sorted.flatMap((i) => i.likers)),
    people: anchor.people,
  };
}

function sum(items: FeedItem[], pick: (i: FeedItem) => number): number {
  return items.reduce((s, i) => s + pick(i), 0);
}
