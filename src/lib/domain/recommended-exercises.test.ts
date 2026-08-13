import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  EXERCISE_NOTES,
  PART_META,
  RECOMMENDED_BY_PART,
  RECOMMEND_PARTS,
  SITUATIONS,
  resolveByPart,
  resolveNames,
  resolveSituation,
  visibleSituations,
} from "./recommended-exercises";
import type { GoalCategory } from "@/lib/challenge";
import type { BodyPart, CatalogExercise, ExerciseType } from "@/lib/types";

function item(
  name: string,
  bodyPart: BodyPart = "가슴",
  exerciseType: ExerciseType = "weight",
): CatalogExercise {
  return {
    id: `cat-${name}`,
    name,
    body_part: bodyPart,
    exercise_type: exerciseType,
    measure: null,
    is_custom: false,
    created_by: null,
    created_at: "2026-01-01T00:00:00Z",
  };
}

/** 상수에 적힌 이름 전부를 가진 가짜 카탈로그 */
const ALL_NAMES = [
  ...new Set([
    ...RECOMMEND_PARTS.flatMap((p) => RECOMMENDED_BY_PART[p]),
    ...SITUATIONS.flatMap((s) => s.names),
    ...Object.keys(EXERCISE_NOTES),
  ]),
];
const FULL_CATALOG: CatalogExercise[] = ALL_NAMES.map((name) => item(name));

/** `/ui-icons/x.webp` → 저장소의 실제 파일 경로 */
const publicPath = (src: string) => join(process.cwd(), "public", src);

describe("resolveNames — 카탈로그 교집합", () => {
  it("카탈로그에 없는 이름은 조용히 뺀다", () => {
    // 시드 이름이 바뀌거나 오타가 나도 화면이 깨지지 않아야 한다 —
    // 목록 하나 때문에 운동 추가가 통째로 막히는 것보다 낫다.
    const resolved = resolveNames(
      ["랫풀다운", "있을 리 없는 운동"],
      [item("랫풀다운", "등")],
    );
    expect(resolved).toHaveLength(1);
    expect(resolved[0].item.name).toBe("랫풀다운");
  });

  it("카탈로그가 비면 빈 배열이다 (던지지 않는다)", () => {
    expect(resolveNames(["랫풀다운"], [])).toEqual([]);
  });

  it("같은 이름이 두 번 있어도 한 번만 낸다", () => {
    const resolved = resolveNames(["푸시업", "푸시업"], [item("푸시업")]);
    expect(resolved).toHaveLength(1);
  });

  it("부위·유형은 상수가 아니라 카탈로그 행에서 읽는다", () => {
    // 상수에 부위를 같이 적어 두면 시드가 바뀔 때 두 곳이 갈라지고
    // 화면의 부위 태그가 거짓말을 한다.
    const [resolved] = resolveNames(
      ["플랭크"],
      [item("플랭크", "코어", "bodyweight")],
    );
    expect(resolved.item.body_part).toBe("코어");
    expect(resolved.item.exercise_type).toBe("bodyweight");
  });

  it("순서를 그대로 지킨다 (순서가 곧 추천 순위다)", () => {
    const names = resolveByPart("가슴", FULL_CATALOG).map((r) => r.item.name);
    expect(names).toEqual([...RECOMMENDED_BY_PART.가슴]);
  });
});

describe("부위별 추천", () => {
  it("부위는 6개다 — 유산소·전신은 상황별이 덮는다", () => {
    // 유산소는 '부위'가 아니라 운동 방식이고, 상황별의 '유산소만 할래요'가
    // 덮는다. 여섯 개라 2열 그리드에 딱 떨어진다.
    expect(RECOMMEND_PARTS).toEqual(["가슴", "등", "하체", "어깨", "팔", "코어"]);
  });

  it("모든 부위에 추천이 3개 이상 있다", () => {
    for (const part of RECOMMEND_PARTS) {
      expect(resolveByPart(part, FULL_CATALOG).length).toBeGreaterThanOrEqual(3);
    }
  });

  it("모든 부위에 아이콘 파일과 한 줄 설명이 있다", () => {
    for (const part of RECOMMEND_PARTS) {
      // ⚠️ 경로가 있다는 것만 보면 오타를 못 잡는다 — 깨진 이미지는 유닛
      //    테스트에 안 잡히고 화면에서만 드러난다. 파일 존재까지 본다.
      expect(existsSync(publicPath(PART_META[part].iconSrc))).toBe(true);
      expect(PART_META[part].sub.length).toBeGreaterThan(3);
    }
  });

  it("같은 부위 안에 중복된 이름이 없다", () => {
    for (const part of RECOMMEND_PARTS) {
      const names = RECOMMENDED_BY_PART[part];
      expect(new Set(names).size).toBe(names.length);
    }
  });
});

describe("상황별 추천", () => {
  it("상황은 6개다", () => {
    expect(SITUATIONS).toHaveLength(6);
  });

  it("전신 인터벌 칸이 '집에서 할래요' 자리를 대신한다", () => {
    // 사용자 지시 2026-08-13 — 인터벌을 프로그램으로만 시작할 수 있었다.
    expect(SITUATIONS.map((s) => String(s.key))).not.toContain("home");
    const interval = SITUATIONS.find((s) => s.key === "interval");
    expect(interval?.label).toBe("전신 인터벌 할래요");
    // 인터벌 구성은 4종목이다 — 미리 보여 주는 목록도 그래야 한다
    expect(interval?.names).toHaveLength(4);
  });

  it("챌린지를 뺀 나머지 상황은 전부 종목을 갖고 있다", () => {
    for (const s of SITUATIONS) {
      if (s.key === "challenge") continue;
      expect(resolveSituation(s.key, FULL_CATALOG).length).toBeGreaterThanOrEqual(3);
    }
  });

  it("모든 상황에 아이콘 파일·라벨·한 줄 설명이 있다", () => {
    for (const s of SITUATIONS) {
      expect(existsSync(publicPath(s.iconSrc))).toBe(true);
      expect(s.label.length).toBeGreaterThan(1);
      expect(s.sub.length).toBeGreaterThan(3);
    }
  });
});

describe("'챌린지 목표에 맞게' — 내 목표에서 계산한다", () => {
  const catalog = [
    item("맨몸 스쿼트", "하체", "bodyweight"),
    item("푸시업", "가슴", "bodyweight"),
    item("플랭크", "코어", "bodyweight"),
    item("체스트프레스 머신", "가슴", "weight"),
    item("랫풀다운", "등", "weight"),
    item("걷기", "유산소", "cardio"),
  ];

  it("목표를 모르면 빈 목록이다", () => {
    expect(resolveSituation("challenge", catalog, null)).toEqual([]);
  });

  it("목표를 모르면 그 카드 자체가 안 나온다", () => {
    // 눌러도 빈 목록이 나오는 막다른 길을 주지 않는다.
    const keys = visibleSituations(null).map((s) => s.key);
    expect(keys).not.toContain("challenge");
    expect(keys).toHaveLength(5);
  });

  it("맨몸 목표면 맨몸 종목만 남는다", () => {
    const goals = new Set<GoalCategory>(["bodyweight"]);
    const names = resolveSituation("challenge", catalog, goals).map(
      (r) => r.item.name,
    );
    expect(names).toContain("맨몸 스쿼트");
    expect(names).not.toContain("체스트프레스 머신");
    expect(names).not.toContain("걷기");
  });

  it("목표가 둘이면 둘 다 남는다", () => {
    const goals = new Set<GoalCategory>(["bodyweight", "cardio"]);
    const types = resolveSituation("challenge", catalog, goals).map(
      (r) => r.item.exercise_type,
    );
    expect(new Set(types)).toEqual(new Set(["bodyweight", "cardio"]));
  });

  it("목표를 알면 그 카드가 6개 목록에 들어온다", () => {
    const goals = new Set<GoalCategory>(["weight"]);
    expect(visibleSituations(goals)).toHaveLength(6);
  });
});

describe("초보자 설명", () => {
  it("추천에 쓰이는 모든 이름에 설명이 있다", () => {
    // 설명이 비면 카드에 빈 줄이 생긴다.
    const used = new Set([
      ...RECOMMEND_PARTS.flatMap((p) => RECOMMENDED_BY_PART[p]),
      ...SITUATIONS.flatMap((s) => s.names),
    ]);
    for (const name of used) {
      expect(EXERCISE_NOTES[name], `'${name}' 설명 없음`).toBeTruthy();
    }
  });

  it("설명은 이름당 한 곳에만 있다 (부위별·상황별이 공유한다)", () => {
    // 체스트프레스 머신은 '가슴'에도 '처음 운동해요'에도 있다.
    // 두 화면이 같은 문구를 쓰는지 확인한다.
    const fromPart = resolveByPart("가슴", FULL_CATALOG).find(
      (r) => r.item.name === "체스트프레스 머신",
    );
    const fromSituation = resolveSituation("beginner", FULL_CATALOG).find(
      (r) => r.item.name === "체스트프레스 머신",
    );
    expect(fromPart?.note).toBe(fromSituation?.note);
    expect(fromPart?.note).toBeTruthy();
  });
});
