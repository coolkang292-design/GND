import { describe, expect, it } from "vitest";
import {
  FREQUENT_LIMIT,
  FREQUENT_WINDOW_DAYS,
  exerciseFrequencyMap,
  frequentCatalogPicks,
  sortByFrequency,
  topExercisesByFrequency,
} from "./exercise-frequency";

const NOW = new Date("2026-08-02T12:00:00+09:00");

/** NOW 기준 daysAgo일 전에 완료한 세션 */
function session(daysAgo: number, ...exerciseNames: string[]) {
  return {
    completedAt: new Date(NOW.getTime() - daysAgo * 86_400_000),
    exerciseNames,
  };
}

describe("topExercisesByFrequency — 최근 90일간 등장한 완료 세션 수", () => {
  it("세션 수가 많은 순으로 정렬한다", () => {
    const top = topExercisesByFrequency(
      [
        session(1, "벤치프레스", "랫풀다운"),
        session(2, "벤치프레스"),
        session(3, "벤치프레스", "스쿼트"),
        session(4, "랫풀다운"),
      ],
      NOW,
    );

    expect(top).toEqual([
      { name: "벤치프레스", count: 3 },
      { name: "랫풀다운", count: 2 },
      { name: "스쿼트", count: 1 },
    ]);
  });

  it("한 세션에 같은 운동이 두 번 있어도 1회로 센다", () => {
    // 세션 수 기준(D2)이다. 세트를 잘게 나눈 운동이 과대평가되면 안 된다.
    const top = topExercisesByFrequency(
      [session(1, "스쿼트", "스쿼트", "스쿼트"), session(2, "벤치프레스")],
      NOW,
    );

    expect(top).toEqual([
      { name: "벤치프레스", count: 1 },
      { name: "스쿼트", count: 1 },
    ]);
  });

  it("90일보다 오래된 세션은 세지 않는다", () => {
    // 경계가 밀리면 "지금 하는 운동"이 아니라 옛날 운동이 상위에 남는다.
    const top = topExercisesByFrequency(
      [
        session(89, "벤치프레스"),
        session(91, "데드리프트"),
        session(400, "데드리프트"),
      ],
      NOW,
    );

    expect(top).toEqual([{ name: "벤치프레스", count: 1 }]);
  });

  it("정확히 창 경계(90일)에 있는 세션은 포함한다", () => {
    const top = topExercisesByFrequency([session(90, "러닝")], NOW);
    expect(top).toEqual([{ name: "러닝", count: 1 }]);
  });

  it("미래에 완료된 세션(기기 시계 오차)도 최근으로 센다", () => {
    // completedAt은 서버 시각이지만 now는 브라우저 시각이라 몇 초 앞설 수 있다.
    // 상한을 걸면 방금 끝낸 운동이 순위에서 사라진다.
    const top = topExercisesByFrequency([session(-0.001, "플랭크")], NOW);
    expect(top).toEqual([{ name: "플랭크", count: 1 }]);
  });

  it("동수는 이름 오름차순으로 고정한다", () => {
    // 정렬이 흔들리면 피커를 열 때마다 칩 순서가 바뀐다.
    const top = topExercisesByFrequency(
      [session(1, "풀업", "가슴", "나비")],
      NOW,
    );
    expect(top.map((item) => item.name)).toEqual(["가슴", "나비", "풀업"]);
  });

  it("limit으로 상위 N개만 돌려준다", () => {
    const top = topExercisesByFrequency(
      [session(1, "a", "b", "c", "d", "e", "f", "g")],
      NOW,
      { limit: 3 },
    );
    expect(top).toHaveLength(3);
  });

  it("기록이 없으면 빈 배열", () => {
    expect(topExercisesByFrequency([], NOW)).toEqual([]);
  });

  it("종목이 없는 세션은 건너뛴다", () => {
    expect(topExercisesByFrequency([session(1)], NOW)).toEqual([]);
  });

  it("기본 창은 90일, 기본 개수는 5개다", () => {
    expect(FREQUENT_WINDOW_DAYS).toBe(90);
    expect(FREQUENT_LIMIT).toBe(5);
  });
});

describe("frequentCatalogPicks — 카탈로그에 있는 종목만", () => {
  const catalog = [
    { id: "1", name: "벤치프레스" },
    { id: "2", name: "랫풀다운" },
    { id: "3", name: "스쿼트" },
    { id: "4", name: "데드리프트" },
    { id: "5", name: "러닝" },
    { id: "6", name: "플랭크" },
  ];
  const name = (item: { name: string }) => item.name;

  it("카탈로그에 없는 이름이 섞여도 limit을 채운다", () => {
    // 자르고 나서 거르면 '지운커스텀' 두 개가 자리만 차지해 3개만 남는다.
    // 이 단언이 그 회귀를 잡는다.
    const picks = frequentCatalogPicks(
      [
        session(1, "지운커스텀A"),
        session(2, "지운커스텀A"),
        session(3, "지운커스텀A"),
        session(1, "지운커스텀B"),
        session(2, "지운커스텀B"),
        session(1, "벤치프레스"),
        session(2, "벤치프레스"),
        session(1, "랫풀다운"),
        session(1, "스쿼트"),
        session(1, "데드리프트"),
        session(1, "러닝"),
      ],
      NOW,
      catalog,
      name,
      { limit: 5 },
    );

    expect(picks).toHaveLength(5);
    expect(picks.map((p) => p.item.name)).toEqual([
      "벤치프레스",
      "데드리프트",
      "랫풀다운",
      "러닝",
      "스쿼트",
    ]);
  });

  it("횟수를 함께 돌려준다", () => {
    const picks = frequentCatalogPicks(
      [session(1, "스쿼트"), session(2, "스쿼트")],
      NOW,
      catalog,
      name,
    );
    expect(picks).toEqual([{ item: { id: "3", name: "스쿼트" }, count: 2 }]);
  });

  it("90일 밖의 기록만 있으면 빈 배열", () => {
    const picks = frequentCatalogPicks(
      [session(120, "벤치프레스")],
      NOW,
      catalog,
      name,
    );
    expect(picks).toEqual([]);
  });

  it("카탈로그가 비어 있으면 빈 배열", () => {
    const picks = frequentCatalogPicks([session(1, "벤치프레스")], NOW, [], name);
    expect(picks).toEqual([]);
  });
});

describe("exerciseFrequencyMap — 이름 → 사용 횟수", () => {
  it("창 안의 세션만 세고 세션 내 중복은 1회로 접는다", () => {
    const map = exerciseFrequencyMap(
      [
        session(1, "스쿼트", "스쿼트"),
        session(2, "스쿼트"),
        session(100, "스쿼트"), // 창 밖
      ],
      NOW,
    );
    expect(map.get("스쿼트")).toBe(2);
  });

  it("한 번도 안 한 종목은 맵에 없다", () => {
    const map = exerciseFrequencyMap([session(1, "스쿼트")], NOW);
    expect(map.has("벤치프레스")).toBe(false);
  });
});

describe("sortByFrequency — 목록을 사용 횟수순으로", () => {
  // 카탈로그 원래 순서는 created_at(시드 입력 순) — 이름순이 아니다
  const catalog = [
    { name: "벤치프레스" },
    { name: "인클라인 벤치프레스" },
    { name: "덤벨 플라이" },
    { name: "체스트프레스 머신" },
  ];
  const name = (item: { name: string }) => item.name;

  it("많이 한 종목이 위로 온다", () => {
    const freq = new Map([
      ["덤벨 플라이", 5],
      ["벤치프레스", 9],
      ["체스트프레스 머신", 1],
    ]);
    expect(sortByFrequency(catalog, freq, name).map(name)).toEqual([
      "벤치프레스",
      "덤벨 플라이",
      "체스트프레스 머신",
      "인클라인 벤치프레스", // 0회는 뒤로
    ]);
  });

  it("동수와 0회는 원래 순서를 유지한다 (안정 정렬)", () => {
    // 이름순으로 다시 흩뜨리면 안 쓰던 종목을 찾기가 오히려 어려워진다.
    // 카탈로그는 부위별로 묶인 시드 순서라 그 묶음을 지켜야 한다.
    const freq = new Map([
      ["벤치프레스", 3],
      ["덤벨 플라이", 3],
    ]);
    expect(sortByFrequency(catalog, freq, name).map(name)).toEqual([
      "벤치프레스",
      "덤벨 플라이",
      "인클라인 벤치프레스",
      "체스트프레스 머신",
    ]);
  });

  it("원본 배열을 건드리지 않는다", () => {
    const original = [...catalog];
    sortByFrequency(catalog, new Map([["체스트프레스 머신", 9]]), name);
    expect(catalog).toEqual(original);
  });

  it("기록이 하나도 없으면 순서가 그대로다", () => {
    expect(sortByFrequency(catalog, new Map(), name).map(name)).toEqual(
      catalog.map(name),
    );
  });
});
