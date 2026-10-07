# 챌린지 경쟁·결과 화면 (최종 시안 2026-10-07) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 사용자의 **최종 시안**(2026-10-07, 4화면)대로 챌린지 상세를 바꾼다. ① 진행 중 — 종합 점수는 잠그고 **종목별 실시간 랭킹 4종**(운동 횟수·운동 시간·유산소 거리·웨이트 볼륨)으로 경쟁, ② 종료 후 — 종합 점수 공개 + 결과 요약·최종 랭킹·기록 분석.

**Architecture:** 새 테이블 없음. 모든 랭킹은 이미 쓰는 `get_challenge_period_sessions` RPC 행(참가자 확인·사진 인증 정책·삭제/취소 제외가 서버에 있음)을 페이지가 한 번 받아 순수 함수로 계산한다. 운동 시간만 0117(같은 RPC에 `duration_minutes` 한 칸)이 필요하다. 종합 점수는 지금처럼 `rankParticipants` 한 곳. 참가자는 **2명~수십 명**을 전제로 짠다(목록 상한·내 줄 고정·공동 순위).

**Tech Stack:** Next.js App Router · React 19 · Tailwind 토큰 · Vitest + Testing Library · Supabase RPC · SVG 차트(라이브러리 없음)

**사용자 지시 요약 (2026-10-07)**
- 첫 시안(결과 2화면) → "이미지 제외, UI·그래프는 최대한 비슷하게"
- 진행 중 경쟁 명세(붙여 넣은 지침): 지표 4종·TOP 3 + 내 순위·라임 강조·차이 문구·연속/인증/이번 주 1위 칩·종합 점수 잠금·게임 요소는 왕관·메달·불꽃·진행 막대까지·기존 데이터 우선·RLS 우회 금지·390px·실데이터 2인 이상 검증
- 참가자 2명~수십 명 감안
- **최종 시안 4화면 — 이 계획의 기준**

**확정된 결정 (2026-10-07 질문 답)**

| # | 결정 |
|---|---|
| 1 | 꾸준왕 **열람권 카드는 화면에서 뺀다**(서버 기능은 둔다) — 종목별 랭킹이 그 역할을 한다 |
| 2 | 방장 옵션 `live_ranking`(0115)을 **켠 방만** 진행 중에도 랭킹에 `종합 점수` 탭이 보인다. 나머지는 종료일 공개 |
| 3 | `다음 챌린지 참여하기` → **둘러보기**(모집 중 챌린지) |
| 4 | `챌린지 기록 인증 >` → **결과 텍스트 공유** |
| 기본값 | 첫 시안의 「나의 챌린지 결과」 내용(목표 링·일별 활동·주요 기록·나의 성장·레벨·보상·주간 달성)은 종료 화면 **`기록 분석` 탭**으로 옮긴다 |
| 기본값 | 시안의 사진·트로피·캐릭터 일러스트는 그리지 않는다. 히어로 배경은 기존 챌린지 사진(`detailArtFor`), 인물은 실제 아바타 |
| 기본값 | 종료 후 `피드` 탭은 서버가 활동 조회를 막으므로(`challenge_not_active`) "챌린지가 끝나 활동 피드가 닫혔어요"를 보인다 |

---

## DB 조사 결과 (지침: 먼저 조사하고 기존 데이터로 되는지 확인)

| 지표 | 정의(지침) | 원천 | 가능 여부 |
|---|---|---|---|
| 운동 횟수 | 기간 내 유효 완료 세션 수 | RPC 행 수 | ✅ 지금 |
| 운동 시간 | 완료 세션 `duration_minutes` 합 | `workout_sessions.duration_minutes`(서버가 완료 때 계산) — **RPC가 안 싣는다** | ⏳ **0117 필요** |
| 유산소 거리 | `workout_sets.distance_meters` 합 | RPC의 세트 | ✅ 지금 — **완료 세트만**(점수 집계 `foldPeriodStats`와 같은 규칙) |
| 웨이트 볼륨 | `weight_kg × reps` 합 | RPC의 세트 | ✅ 지금 — **웨이트 종목·완료 세트만**(같은 규칙) |

- 범위: `start_date` ~ 오늘(진행 중) / ~ `end_date`(종료). 날짜는 사용자 시간대 `dayKey` — 점수와 같은 자
- 삭제·취소 제외: RPC가 `status = 'completed' and deleted_at is null`
- 사진 인증 필수 챌린지: RPC가 `workout_images` 있는 세션만
- 참가자만: RPC 게이트 `shares_challenge_with` + `challenge_participants`. 화면은 **현재 참가자 명단**(`get_challenge_participant_profiles`)에 있는 사람만 순위에 넣는다
- RLS: RPC는 0051부터 있는 `security definer` + 참가자 게이트다. 새 우회 없음. 보상 칸 장부는 본인 행 정책(`*_own_select`)
- 새 테이블·뷰 없음. 0117은 같은 함수에 키 하나(권한·게이트 그대로, 비파괴). **이 세션엔 Supabase MCP가 없어 적용 못 함** → 적용 전에는 운동 시간 탭에 "운동 시간 집계 준비 중"이 보이고 나머지 3종은 정상
- 규모: 수십 명 × 한 달이면 행 수천 개 — 이미 점수 계산 때문에 받고 있는 같은 응답이라 추가 비용 없음

---

## 이미 끝난 것 (브랜치 `feat/challenge-result-screen`, 커밋됨)

| 커밋 | 내용 | 최종 시안에서 |
|---|---|---|
| 08571e6 | 0117 마이그레이션 파일(미적용) | 그대로 |
| 87b864c | 세션 행 `durationMinutes` 정규화 | 그대로 |
| 44c4c0b·c79df73 | `domain/challenge-report.ts` — 일별 합계·막대·주간 달성·주요 기록·기간 보상·상위 %·표기·`restRanking` | 그대로 + 재사용 |
| 8cc5ab8 | `myScoreTrend` | 기록 분석 탭 |
| 9736cf5 | `challenge-rewards.ts` 본인 장부 | 기록 분석 탭 |
| b6646f8 | `share` 아이콘, 시상대 `metaOf` | 결과 요약 TOP 3 |
| 3d2a65b | 결과 부품 9종 | 기록 분석 탭에서 재사용 |
| c79df73 | 화면 A/B + 상세·페이지 연결(행 보존) | **A는 결과 요약으로 교체**, B는 기록 분석 탭으로 |
| e958dc2 | 개발 전용 `/challenge-result-qa?n=` | 진행 중·종료 둘 다 보도록 확장 |

---

## 최종 시안 → 구현 대응

### 1. 진행 중 — 챌린지 상세 (`랭킹` 탭)

| 시안 | 구현 |
|---|---|
| `<` 챌린지 상세 · 공유, 사진 히어로 · `진행 중` · 이름 · `9.1 (월) ~ 9.30 (화)` · `D-25` · 아바타 겹침 `+7 참여자 12명` | 기존 히어로를 시안 배치로(아바타 최대 3 + `+N`) |
| 탭 `개요 · 랭킹 · 피드 · 미션` | 상세 안 탭. 개요 = 내 진행·목표·참여자·공정성 안내 / 랭킹 = 새 경쟁 / 피드 = 챌린지 활동 / 미션 = 마일스톤 |
| `내 현재 순위 👑 1위 · 운동 횟수 기준` + `오늘 인증 완료 ✓ · 3일 연속 🔥` `>` | 대표 순위 = 내가 가장 높은 지표(동률이면 횟수→시간→거리→볼륨). 오른쪽 = 오늘 운동 여부·연속일·`이번 주 1위` 칩. `>` → 랭킹 화면 |
| 지표 선택 4칸 (선택 = 라임 테두리) | 같은 4칸. 0117 전이면 운동 시간 칸에 작은 `준비 중` |
| `운동 횟수 랭킹 ⓘ · 내 기록 12회` · `2위와 +1회 차이예요! 한 번 더 하면 선두를 더 굳힐 수 있어요.` | 같은 배치. ⓘ = 지표 정의 한 줄(접힘) |
| 1~5위 목록(금·은·동 메달, 내 줄 라임) · 막대 아이콘 | TOP 5 + **내 줄**(5위 밖이면 점선 뒤에 고정). 기록 0은 순위 없이 `기록 없음` |
| `전체 랭킹 보기 >` | 랭킹 화면으로 |
| (지침) 종합 점수 잠금 | 목록 아래 `🔒 종합 점수는 종료일 공개` 카드. 결정 2: `live_ranking` 방은 대신 랭킹 화면에 `종합 점수` 탭 |

### 2. 진행 중 — 챌린지 랭킹 (하위 화면)

| 시안 | 구현 |
|---|---|
| `<` 챌린지 랭킹 · 공유 / 지표 탭 4개 | 같은 배치(+ 결정 2의 종합 점수 탭) |
| `운동 시간 랭킹 · 내 기록 509분` · `1위까지 -24분! 이번 주에도 화이팅해요!` | 같은 문구 규칙 |
| 순위 목록 | **전체 참가자**(수십 명이면 10위까지 + 내 줄 + `전체 N명 보기`) |
| `내 진행 현황` 막대(날짜별) · 말풍선 `9/14(일) 62분` · 점선 `목표 420분` · `전체 기간 ▾` | 선택 지표의 내 날짜별 값. 점선은 **내 목표가 같은 지표일 때만**(유산소 거리↔`cardio_distance`, 볼륨↔`volume`) 하루 페이스(목표÷기간일수)로. 기간: 전체/이번 주 |
| `2위와 비교` — 나 509분 · `-24분` · 스칼레또 533분 · 진행 막대 | 비교 대상 = 내 바로 위(내가 1위면 2위). 막대 = 내 값 ÷ 상대 값 |
| 💡 `이번 주 120분만 더 하면 1위를 다시 탈환할 수 있어요!` | 차이만큼 남은 양 문구(1위면 `선두를 지키고 있어요`) |

### 3. 종료 — 챌린지 결과 (`결과 요약` 탭)

| 시안 | 구현 |
|---|---|
| `<` 챌린지 결과 · 공유, 히어로(트로피 그림 제외) · `종료` · 이름 · 날짜 · 아바타 `참여자 12명` | 진행 중 히어로와 같은 부품, 칩만 `종료` |
| 탭 `결과 요약 · 최종 랭킹 · 기록 분석 · 피드` | 같은 4탭 |
| 내 결과 카드: 월계수 `1위` · 아바타+왕관 · `나` · `종합 점수 83.2점` | 왕관·월계수는 기존 장식 자산(`/gnd/decorations`, 시상대가 이미 씀) — 앱 자산이지 시안 일러스트가 아니다 |
| 지표 4칸: 값 + `(1위)` | 같은 4칸, 지표별 내 최종 순위 |
| `최종 TOP 3` 시상대 · `26회 | 512분` | 기존 `RankingPodium` + `metaOf`로 횟수·시간 |
| `전체 랭킹 보기 >` | `최종 랭킹` 탭으로 |

### 4. 종료 — 최종 랭킹 (`최종 랭킹` 탭)

| 시안 | 구현 |
|---|---|
| 탭 `종합 점수 · 운동 횟수 · 운동 시간 · 유산소 거리 · 웨이트 볼륨` | 같은 5탭 |
| 표 `순위 · 참가자 · 종합 점수 · 주요 기록(28회/603분)` · 내 줄 라임 · 1~3위 메달 | 같은 표. 지표 탭이면 가운데 칸이 그 지표 값. **전원 표시**(최종 랭킹은 전체를 보는 화면) |
| `챌린지 기록 인증 >` | 결과 텍스트 공유(결정 4) |
| `다음 챌린지 참여하기` | 둘러보기 탭으로(결정 3) |

`기록 분석` 탭 = 이미 만든 「나의 챌린지 결과」 본문(머리 제외) + 레벨 카드·주간 달성·획득한 보상.

---

## File Structure

| 파일 | 역할 | |
|---|---|---|
| `src/lib/domain/challenge-metrics.ts` | 지표 4종 합계·순위(공동·0 제외)·대표 순위·차이 문구·이번 주 1위·표기 | 신규 |
| `src/lib/domain/challenge-metrics.test.ts` | 2명·30명·공동·0·0117 전 | 신규 |
| `src/components/challenge/detail/challenge-hero.tsx` | 사진 히어로(진행 중/종료 공용) | 신규 |
| `src/components/challenge/detail/detail-tabs.tsx` | 상세 탭 줄(공용) | 신규 |
| `src/components/challenge/competition/metric-selector.tsx` | 지표 4(+종합) 선택 | 신규 |
| `src/components/challenge/competition/metric-ranking-list.tsx` | 순위 목록(TOP N + 내 줄 + 펼침) | 신규 |
| `src/components/challenge/competition/my-standing-card.tsx` | 내 현재 순위 + 오늘 인증·연속·이번 주 1위 칩 | 신규 |
| `src/components/challenge/competition/competition-tab.tsx` | 진행 중 `랭킹` 탭 본문 | 신규 |
| `src/components/challenge/competition/ranking-screen.tsx` | 진행 중 랭킹 하위 화면(내 진행 현황·비교) | 신규 |
| `src/components/challenge/competition/metric-daily-chart.tsx` | 선택 지표 날짜별 막대 + 말풍선 + 페이스 점선 | 신규 |
| `src/components/challenge/result/result-overview.tsx` | 종료 `결과 요약` | 신규 |
| `src/components/challenge/result/final-ranking.tsx` | 종료 `최종 랭킹` | 신규 |
| `src/components/challenge/result/record-analysis.tsx` | 종료 `기록 분석`(기존 B 본문 + 레벨·보상·주간) | 신규(기존 부품 조립) |
| `src/components/challenge/challenge-result.tsx` | `ResultView` = 히어로 + 4탭 | 교체 |
| `src/components/challenge/result/result-summary.tsx` · `my-result-report.tsx` | A/B 화면 | **삭제**(본문은 위로 이전) |
| `src/components/challenge/challenge-detail.tsx` | 진행 중 = 히어로 + 4탭, 열람권 카드 제거 | 수정 |
| `src/app/(tabs)/challenge/page.tsx` | `onDiscover`(둘러보기 탭 열기) 전달 | 수정 |
| `src/app/challenge-result-qa/*` | `?state=active|ended&n=` | 수정 |
| `scripts/challenge-metrics-check.mjs` | 픽스처 A로 로그인(RLS 적용)해 실제 챌린지 행을 받아 독립 계산 + 덤프 | 신규 |
| `src/lib/domain/challenge-metrics.live.test.ts` | 덤프가 있을 때만 — 도메인 함수 결과 = 독립 계산 | 신규 |

---

### Task 1: 지표 도메인 `challenge-metrics.ts`

**Files:** Create `src/lib/domain/challenge-metrics.ts`, `src/lib/domain/challenge-metrics.test.ts`

- [ ] **Step 1: 실패하는 테스트**

```ts
import { describe, expect, it } from "vitest";
import {
  METRICS,
  formatMetric,
  gapMessage,
  metricTotalsByUser,
  rankMetric,
  representativeStanding,
  weeklyLeaders,
  type MetricRow,
} from "./challenge-metrics";

const TZ = "Asia/Seoul";
const S = "2026-09-01";

function row(
  userId: string,
  iso: string,
  o: Partial<{ min: number | null | undefined; kg: number; reps: number; km: number; done: boolean; type: "weight" | "bodyweight" | "cardio" }> = {},
): MetricRow {
  const done = o.done ?? true;
  return {
    userId,
    completedAt: iso,
    ...(o.min === undefined ? { durationMinutes: 30 } : o.min === null ? {} : { durationMinutes: o.min }),
    exercises: [
      { exerciseType: o.type ?? "weight", sets: [{ weightKg: o.kg ?? 0, reps: o.reps ?? 0, distanceMeters: null, isCompleted: done }] },
      { exerciseType: "cardio", sets: [{ weightKg: null, reps: null, distanceMeters: (o.km ?? 0) * 1000, isCompleted: done }] },
    ],
  };
}

describe("metricTotalsByUser", () => {
  it("4종 합계 — 명단에 있는 사람만, 기간 밖 제외, 완료 세트만", () => {
    const m = metricTotalsByUser(
      [
        row("a", "2026-09-02T01:00:00Z", { min: 40, kg: 50, reps: 10, km: 3 }),
        row("a", "2026-09-02T09:00:00Z", { min: 20, kg: 20, reps: 5, km: 1, done: false }),
        row("a", "2026-08-30T01:00:00Z", { min: 99 }),
        row("x", "2026-09-02T01:00:00Z", { min: 99 }), // 명단 밖(나간 사람 등)
      ],
      ["a", "b"],
      S,
      "2026-09-10",
      TZ,
    );
    expect(m.get("a")).toEqual({ sessions: 2, minutes: 60, cardioKm: 3, volumeKg: 500 });
    expect(m.get("b")).toEqual({ sessions: 0, minutes: 0, cardioKm: 0, volumeKg: 0 });
    expect(m.has("x")).toBe(false);
  });

  it("맨몸 세트의 무게×횟수는 볼륨에 안 들어간다(점수 집계와 같은 규칙)", () => {
    const m = metricTotalsByUser([row("a", "2026-09-02T01:00:00Z", { kg: 10, reps: 10, type: "bodyweight" })], ["a"], S, "2026-09-10", TZ);
    expect(m.get("a")?.volumeKg).toBe(0);
  });
});

describe("rankMetric", () => {
  const totals = new Map([
    ["a", { sessions: 12, minutes: 509, cardioKm: 0, volumeKg: 100 }],
    ["b", { sessions: 11, minutes: 533, cardioKm: 0, volumeKg: 100 }],
    ["c", { sessions: 11, minutes: 412, cardioKm: 0, volumeKg: 0 }],
  ]);

  it("내림차순, 같은 값은 같은 등수, 다음은 건너뜀", () => {
    expect(rankMetric(totals, "sessions").map((r) => [r.userId, r.rank])).toEqual([["a", 1], ["b", 2], ["c", 2]]);
  });

  it("0은 순위 없음(null) — 아무도 안 한 지표에서 전원 1위가 되지 않게", () => {
    expect(rankMetric(totals, "cardioKm").map((r) => r.rank)).toEqual([null, null, null]);
    expect(rankMetric(totals, "volumeKg").map((r) => [r.userId, r.rank])).toEqual([["a", 1], ["b", 1], ["c", null]]);
  });

  it("2명도 된다", () => {
    const two = new Map([["a", { sessions: 1, minutes: 0, cardioKm: 0, volumeKg: 0 }], ["b", { sessions: 3, minutes: 0, cardioKm: 0, volumeKg: 0 }]]);
    expect(rankMetric(two, "sessions").map((r) => [r.userId, r.rank])).toEqual([["b", 1], ["a", 2]]);
  });

  it("40명도 된다 — 순서·등수 일관", () => {
    const many = new Map(Array.from({ length: 40 }, (_, i) => [`u${i}`, { sessions: i % 7, minutes: 0, cardioKm: 0, volumeKg: 0 }] as const));
    const r = rankMetric(many, "sessions");
    expect(r).toHaveLength(40);
    expect(r[0].value).toBe(6);
    expect(r.filter((x) => x.rank === 1).every((x) => x.value === 6)).toBe(true);
    expect(r.filter((x) => x.value === 0).every((x) => x.rank === null)).toBe(true);
  });
});

describe("representativeStanding", () => {
  it("내가 가장 높은 지표, 동률이면 횟수→시간→거리→볼륨 순", () => {
    const totals = new Map([
      ["me", { sessions: 5, minutes: 100, cardioKm: 9, volumeKg: 0 }],
      ["b", { sessions: 6, minutes: 200, cardioKm: 3, volumeKg: 10 }],
    ]);
    expect(representativeStanding(totals, "me", true)).toEqual({ metric: "cardioKm", rank: 1 });
  });

  it("운동 시간 집계 전(0117)이면 시간 지표는 후보에서 뺀다", () => {
    const totals = new Map([
      ["me", { sessions: 1, minutes: 0, cardioKm: 0, volumeKg: 0 }],
      ["b", { sessions: 2, minutes: 0, cardioKm: 0, volumeKg: 0 }],
    ]);
    expect(representativeStanding(totals, "me", false)).toEqual({ metric: "sessions", rank: 2 });
  });

  it("아무 기록도 없으면 null", () => {
    expect(representativeStanding(new Map([["me", { sessions: 0, minutes: 0, cardioKm: 0, volumeKg: 0 }]]), "me", true)).toBeNull();
  });
});

describe("gapMessage — 시안 문구", () => {
  const totals = new Map([
    ["me", { sessions: 12, minutes: 509, cardioKm: 0, volumeKg: 0 }],
    ["b", { sessions: 11, minutes: 533, cardioKm: 0, volumeKg: 0 }],
  ]);

  it("1위: 2위와 +N 차이", () => {
    const g = gapMessage(rankMetric(totals, "sessions"), "me", "sessions");
    expect(g.headline).toBe("2위와 +1회 차이예요!");
    expect(g.tip).toBe("한 번 더 하면 선두를 더 굳힐 수 있어요.");
    expect(g.rival?.userId).toBe("b");
  });

  it("2위: 1위까지 -N", () => {
    const g = gapMessage(rankMetric(totals, "minutes"), "me", "minutes");
    expect(g.headline).toBe("1위까지 -24분!");
    expect(g.tip).toBe("24분만 더 하면 1위를 탈환할 수 있어요!");
  });

  it("공동 1위", () => {
    const tie = new Map([["me", { sessions: 3, minutes: 0, cardioKm: 0, volumeKg: 0 }], ["b", { sessions: 3, minutes: 0, cardioKm: 0, volumeKg: 0 }]]);
    expect(gapMessage(rankMetric(tie, "sessions"), "me", "sessions").headline).toBe("공동 1위예요!");
  });

  it("기록 없음", () => {
    const g = gapMessage(rankMetric(totals, "cardioKm"), "me", "cardioKm");
    expect(g.headline).toBe("아직 기록이 없어요");
    expect(g.rival).toBeNull();
  });
});

describe("weeklyLeaders — 이번 주 1위 칩", () => {
  it("오늘이 속한 챌린지 주(시작일부터 7일씩)만 센다", () => {
    const rows = [
      row("me", "2026-09-02T01:00:00Z"), // 1주
      row("me", "2026-09-03T01:00:00Z"),
      row("b", "2026-09-09T01:00:00Z"), // 2주
      row("me", "2026-09-10T01:00:00Z"),
      row("me", "2026-09-11T01:00:00Z"),
    ];
    expect(weeklyLeaders(rows, ["me", "b"], S, "2026-09-12", TZ, "sessions")).toEqual(["me"]);
  });
});

describe("표기", () => {
  it("formatMetric", () => {
    expect(formatMetric("sessions", 12)).toBe("12회");
    expect(formatMetric("minutes", 509.4)).toBe("509분");
    expect(formatMetric("cardioKm", 42.26)).toBe("42.3km");
    expect(formatMetric("volumeKg", 12350)).toBe("12,350kg");
    expect(METRICS.map((m) => m.label)).toEqual(["운동 횟수", "운동 시간", "유산소 거리", "웨이트 볼륨"]);
  });
});
```

- [ ] **Step 2: 실패 확인** — `npx vitest run src/lib/domain/challenge-metrics.test.ts` → 모듈 없음

- [ ] **Step 3: 구현**

```ts
/**
 * 챌린지 종목별 경쟁 지표 (2026-10-07 최종 시안 · 사용자 지침).
 *
 * 진행 중엔 종합 점수를 잠그고(종료일 공개) **실제 운동 기록**으로 경쟁한다 — 4종:
 * 운동 횟수(완료 세션 수) · 운동 시간(`duration_minutes` 합) · 유산소 거리 · 웨이트 볼륨.
 *
 * ⚠️ 재료는 `get_challenge_period_sessions` 행뿐이다. 참가자 확인·사진 인증·삭제/취소 제외는
 *    서버가 한다. 여기서 다시 거르지 않는다(규칙이 두 벌이 되면 화면마다 숫자가 갈린다).
 * ⚠️ 거리·볼륨은 **완료 세트만**, 볼륨은 **웨이트 종목만** — `foldPeriodStats`와 같은 규칙.
 * ⚠️ 0은 순위가 없다. 아무도 유산소를 안 했는데 전원이 "1위"가 되는 걸 막는다.
 * ⚠️ 같은 값은 같은 등수(1·1·3) — `rankParticipants`·`activityLeaders`와 같은 규칙.
 */
import { addDaysToDateKey } from "./workout-plan";
import { inclusiveDays } from "./challenge-time";
import { dayKey } from "./time";

export type MetricKey = "sessions" | "minutes" | "cardioKm" | "volumeKg";
export type MetricTotals = Record<MetricKey, number>;

export const METRICS: readonly { key: MetricKey; label: string; unit: string }[] = [
  { key: "sessions", label: "운동 횟수", unit: "회" },
  { key: "minutes", label: "운동 시간", unit: "분" },
  { key: "cardioKm", label: "유산소 거리", unit: "km" },
  { key: "volumeKg", label: "웨이트 볼륨", unit: "kg" },
];

export type MetricRow = {
  userId: string;
  completedAt: string;
  durationMinutes?: number | null;
  exercises: readonly {
    exerciseType: "weight" | "bodyweight" | "cardio";
    sets: readonly { weightKg: number | null; reps: number | null; distanceMeters: number | null; isCompleted: boolean }[];
  }[];
};

const ZERO: MetricTotals = { sessions: 0, minutes: 0, cardioKm: 0, volumeKg: 0 };

/** 0117 전 응답이면 운동 시간을 모른다 — 행이 있는데 아무 행에도 키가 없을 때 */
export function minutesKnown(rows: readonly MetricRow[]): boolean {
  return rows.length === 0 || rows.some((r) => r.durationMinutes !== undefined);
}

export function metricTotalsByUser(
  rows: readonly MetricRow[],
  memberIds: readonly string[],
  startDate: string,
  endKey: string,
  timeZone: string,
): Map<string, MetricTotals> {
  const out = new Map<string, MetricTotals>(memberIds.map((id) => [id, { ...ZERO }]));
  for (const r of rows) {
    const t = out.get(r.userId);
    if (!t) continue;
    const k = dayKey(new Date(r.completedAt), timeZone);
    if (k < startDate || k > endKey) continue;
    t.sessions += 1;
    if (r.durationMinutes != null && r.durationMinutes > 0) t.minutes += r.durationMinutes;
    for (const ex of r.exercises) {
      for (const s of ex.sets) {
        if (!s.isCompleted) continue;
        if (ex.exerciseType === "weight") t.volumeKg += Number(s.weightKg ?? 0) * (s.reps ?? 0);
        else if (ex.exerciseType === "cardio") t.cardioKm += Number(s.distanceMeters ?? 0) / 1000;
      }
    }
  }
  return out;
}

export type MetricRank = { userId: string; value: number; rank: number | null };

const EPS = 1e-9;

export function rankMetric(totals: ReadonlyMap<string, MetricTotals>, key: MetricKey): MetricRank[] {
  const list = [...totals].map(([userId, t]) => ({ userId, value: t[key] }));
  list.sort((a, b) => b.value - a.value || a.userId.localeCompare(b.userId));
  const out: MetricRank[] = [];
  list.forEach((x, i) => {
    if (x.value <= EPS) {
      out.push({ ...x, rank: null });
      return;
    }
    const prev = out[i - 1];
    const rank = prev && prev.rank !== null && Math.abs(prev.value - x.value) <= EPS ? prev.rank : i + 1;
    out.push({ ...x, rank });
  });
  return out;
}

/** 시안 `내 현재 순위 👑 1위 · 운동 횟수 기준` */
export function representativeStanding(
  totals: ReadonlyMap<string, MetricTotals>,
  myUserId: string,
  minutesAvailable: boolean,
): { metric: MetricKey; rank: number } | null {
  let best: { metric: MetricKey; rank: number } | null = null;
  for (const m of METRICS) {
    if (m.key === "minutes" && !minutesAvailable) continue;
    const mine = rankMetric(totals, m.key).find((r) => r.userId === myUserId);
    if (!mine || mine.rank === null) continue;
    if (best === null || mine.rank < best.rank) best = { metric: m.key, rank: mine.rank };
  }
  return best;
}

export function formatMetric(key: MetricKey, v: number): string {
  if (key === "cardioKm") return `${(Math.round(v * 10) / 10).toLocaleString()}km`;
  const n = Math.round(v).toLocaleString();
  return key === "sessions" ? `${n}회` : key === "minutes" ? `${n}분` : `${n}kg`;
}

/** 시안 `2위와 +1회 차이예요! 한 번 더 하면…` / `1위까지 -24분!` */
export function gapMessage(
  ranks: readonly MetricRank[],
  myUserId: string,
  key: MetricKey,
): { headline: string; tip: string; rival: MetricRank | null; diff: number } {
  const me = ranks.find((r) => r.userId === myUserId);
  if (!me || me.rank === null) {
    return { headline: "아직 기록이 없어요", tip: "첫 기록을 남기면 순위에 들어가요.", rival: null, diff: 0 };
  }
  if (me.rank === 1) {
    const tied = ranks.filter((r) => r.rank === 1 && r.userId !== myUserId);
    if (tied.length > 0) {
      return { headline: "공동 1위예요!", tip: "한 번 더 하면 단독 선두예요.", rival: tied[0], diff: 0 };
    }
    const second = ranks.find((r) => r.userId !== myUserId && r.rank !== null) ?? null;
    if (!second) return { headline: "지금 선두예요!", tip: "이대로 지켜 보세요.", rival: null, diff: 0 };
    const diff = me.value - second.value;
    return {
      headline: `${second.rank}위와 +${formatMetric(key, diff)} 차이예요!`,
      tip: key === "sessions" ? "한 번 더 하면 선두를 더 굳힐 수 있어요." : "조금만 더 하면 선두를 더 굳힐 수 있어요.",
      rival: second,
      diff,
    };
  }
  // 내 바로 위 등수 중 값이 가장 작은 사람(= 따라잡을 상대)
  const above = ranks.filter((r) => r.rank !== null && r.rank < me.rank!);
  const rival = above[above.length - 1];
  const diff = rival.value - me.value;
  return {
    headline: `${rival.rank}위까지 -${formatMetric(key, diff)}!`,
    tip: `${formatMetric(key, diff)}만 더 하면 ${rival.rank}위를 탈환할 수 있어요!`,
    rival,
    diff,
  };
}

/** 시안·지침 `이번 주 1위` 칩 — 오늘이 속한 챌린지 주(시작일부터 7일씩) */
export function weeklyLeaders(
  rows: readonly MetricRow[],
  memberIds: readonly string[],
  startDate: string,
  todayKey: string,
  timeZone: string,
  key: MetricKey,
): string[] {
  const idx = Math.max(0, inclusiveDays(startDate, todayKey) - 1);
  const weekStart = addDaysToDateKey(startDate, Math.floor(idx / 7) * 7);
  const ranks = rankMetric(metricTotalsByUser(rows, memberIds, weekStart, todayKey, timeZone), key);
  return ranks.filter((r) => r.rank === 1).map((r) => r.userId);
}
```

(테스트의 `gapMessage` 1위 문구는 `formatMetric("sessions", 1)` = `1회` → `2위와 +1회 차이예요!`.)

- [ ] **Step 4: 통과 확인** → PASS
- [ ] **Step 5: Commit** — `feat(challenge): 종목별 경쟁 지표 4종 — 합계·순위·차이 문구`

---

### Task 2: 실데이터 검증 도구 (지침: 실제 챌린지 2인 이상으로 4종 검증)

**Files:** Create `scripts/challenge-metrics-check.mjs`, `src/lib/domain/challenge-metrics.live.test.ts`

- [ ] **Step 1: 스크립트** — `scripts/dev-fixture.mjs`가 `.env.local`을 읽는 방식 그대로 URL·anon key·`DEV_FIXTURE_PASSWORD`를 읽는다(값을 출력·저장하지 않는다). 픽스처 A로 **이메일 로그인**(RLS 그대로) → 내 챌린지 중 참가자 2명 이상인 active/ended를 고른다 → `get_challenge_period_sessions` · `get_challenge_participant_profiles` 호출 → **독립 계산**(도메인 모듈을 쓰지 않는 단순 반복문)으로 4종 합계·순위를 표로 출력 → 원본 응답을 스크래치 경로(`CHALLENGE_METRICS_DUMP` 환경변수, 저장소 밖)에 JSON으로 저장. 닉네임 외 개인정보는 출력하지 않는다.
- [ ] **Step 2: 교차 확인 테스트** — `challenge-metrics.live.test.ts`는 `process.env.CHALLENGE_METRICS_DUMP`가 없으면 `describe.skip`. 있으면 덤프를 읽어 `normalizeChallengePeriodSessions` → `metricTotalsByUser` → `rankMetric` 결과가 스크립트의 독립 계산 값과 **완전히 같은지** 단언.
- [ ] **Step 3:** 픽스처 챌린지에 기록이 없으면 `node scripts/dev-fixture.mjs status`로 상태만 보고, 기록을 만드는 일(운영 DB 쓰기)은 하지 않는다 — 그 경우 `[미검증] 실데이터`로 보고하고 사용자에게 어떤 챌린지로 볼지 묻는다.
- [ ] **Step 4: Commit** — `chore(challenge): 종목별 랭킹 실데이터 교차 확인 도구`

---

### Task 3: 공용 부품 — 히어로 · 탭 · 지표 선택 · 순위 목록

**Files:** `detail/challenge-hero.tsx`, `detail/detail-tabs.tsx`, `competition/metric-selector.tsx`, `competition/metric-ranking-list.tsx` (+ 각 테스트 일부는 Task 5·7 화면 테스트에서)

- `ChallengeHero({ challenge, members, statusChip: "진행 중" | "종료", dday?: number })`: 기존 상세 히어로의 사진 처리(`detailArtFor`, 그라데이션)를 옮겨 쓰고, 시안 배치 — 칩 · 이름(22px black) · `9.1 (월) ~ 9.30 (화)`(새 표기 함수 `formatPeriod`를 `challenge-report.ts`에 추가, 테스트 포함) · `D-25` 알약 · 아바타 3개 겹침 + `+N` + `참여자 N명`
- `DetailTabs({ tabs: {key,label}[], value, onChange })`: 시안의 4칸 알약 탭, 선택 = 라임 테두리 + 라임 글자, `role="tablist"`/`tab`/`aria-selected`
- `MetricSelector({ value, onChange, minutesAvailable, withOverall?: boolean })`: 4칸(종합 포함 시 5칸, 가로 스크롤) 아이콘+라벨, 선택 = `bg-accent-weak border-accent`. `minutesAvailable=false`면 운동 시간 칸에 `준비 중` 작은 글자
- `MetricRankingList({ ranks, metric, myUserId, profileOf, limit, expandable })`:
  - 1~3위 메달(금 `--gold`, 은 `--silver`, 동 `--bronze` 원 + 숫자), 4위부터 숫자
  - 내 줄 `border-accent bg-accent-weak`, 값 라임
  - `limit` 밖에 내가 있으면 점선 뒤 내 줄(`restRanking`과 같은 원리 — 일반화한 `pinMine(list, myUserId, limit)`를 `challenge-metrics.ts`에 추가, 테스트 포함)
  - `rank === null` 줄은 순위 칸 `-`, 값 `기록 없음`
  - 수십 명: `expandable`이면 `전체 N명 보기` 토글
- [ ] Commit — `feat(challenge): 상세 히어로·탭·지표 선택·순위 목록 부품`

---

### Task 4: 진행 중 — `랭킹` 탭 본문 `competition-tab.tsx`

- 순서(시안 1): `MyStandingCard` → `MetricSelector` → 카드[`{지표} 랭킹 ⓘ` · `내 기록 {값}` · `gapMessage.headline + tip` · `MetricRankingList limit=5` · `전체 랭킹 보기 >`] → 잠금 카드 `🔒 종합 점수는 종료일 공개 · 지금은 개별 종목만 확인할 수 있어요`(`live_ranking` 방은 잠금 대신 `종합 점수는 랭킹 화면에서 볼 수 있어요` 링크)
- `MyStandingCard`: 왼쪽 `내 현재 순위` · 왕관(1위면 금색) · `{rank}위` · `{지표} 기준`(`representativeStanding`, null이면 `첫 기록을 남겨 보세요`) / 오른쪽 칩 `오늘 인증 완료 ✓`(아니면 `오늘 아직 운동 전` → `/record` 링크) · `{n}일 연속 🔥`(n≥2, 기존 `myStreak`) · `이번 주 1위 👑`(`weeklyLeaders`에 내가 있을 때) / `>` → 랭킹 화면
- ⓘ: 지표 정의 한 줄(예: 운동 시간 = "완료한 운동의 기록 시간 합계")
- [ ] 테스트(`competition-tab.test.tsx`): 2명(내가 1위 → `2위와 +1회 차이예요!`), 12명(TOP 5 + 내 줄 9위 점선), 0117 전(운동 시간 칸 `준비 중`, 대표 순위가 시간 제외), 잠금 카드 있음 / `live_ranking` 방은 잠금 카드 대신 안내, 칩 3종 조건
- [ ] Commit — `feat(challenge): 진행 중 랭킹 탭 — 내 순위·종목 선택·TOP 5·차이 문구·종합 잠금`

---

### Task 5: 진행 중 — 랭킹 하위 화면 `ranking-screen.tsx` + `metric-daily-chart.tsx`

- 머리 `<` `챌린지 랭킹` 공유(초대 공유 — 기존 `onShare`) → `MetricSelector`(`live_ranking`이면 `종합 점수` 탭 추가 — `rankParticipants` 결과를 같은 목록 부품으로) → 카드[`{지표} 랭킹` · `내 기록` · `gapMessage.headline + "이번 주에도 화이팅해요!"` · 목록 `limit=10` + 펼침] → `내 진행 현황` 카드 → `{n}위와 비교` 카드 → 💡 팁
- `MetricDailyChart({ bars: {dayKey, value}[], metric, paceLine?: number })`: 이미 만든 `DailyActivityChart`와 같은 말풍선·막대 규칙(단일 라임 막대), 말풍선 `9/14(일) · 62분`, 점선 = 하루 페이스(목표 ÷ 기간일수, 같은 지표 목표가 있을 때만) 라벨 `하루 목표 15분`. 기간 선택 `전체 기간 | 이번 주`(select)
- 날짜별 값: `metricTotalsByUser`를 하루 단위로 돌리지 않고 `dailyTotals`(challenge-report)를 재사용해 지표 키로 매핑하는 `dailyMetric(totals, key)`를 `challenge-metrics.ts`에 추가(테스트 포함)
- 비교 카드: 나 vs `gapMessage.rival` — 값 두 개, 가운데 차이 알약(`-24분`/`+1회`), 진행 막대(내 값 ÷ 큰 값)
- [ ] 테스트: 지표 바꾸면 목록·내 기록·문구가 바뀐다, 30명 펼침, 비교 카드 값, 0117 전 운동 시간 탭은 `운동 시간 집계 준비 중` 안내
- [ ] Commit — `feat(challenge): 진행 중 랭킹 화면 — 전체 순위·내 진행 현황·비교`

---

### Task 6: 진행 중 상세 재배치 `challenge-detail.tsx`

- `status === "active"`: 히어로(`ChallengeHero`) → `DetailTabs [개요, 랭킹, 피드, 미션]`(기본 `랭킹` — 시안 1) → 탭 본문
  - 개요: 기존 `내 진행`·목표·정보줄·참여자 목록·공정성 안내·목표 올리기(옮기기만, 계산 그대로)
  - 랭킹: Task 4
  - 피드: `ChallengeActivity`
  - 미션: 마일스톤 카드
- **열람권 카드(`ParticipantPerformanceCard`) 렌더 제거**(결정 1). 컴포넌트·서버 기능은 지우지 않는다(다른 화면 사용 여부 grep 후 판단, 남으면 그대로)
- 기존 진행 중 `liveRanked` 시상대(0115)는 랭킹 화면의 `종합 점수` 탭으로 옮긴다(결정 2)
- `view` 상태 `"detail" | "ranking"` — 랭킹 화면은 상세 안 하위 화면(라우트 추가 없음, 뒤로 = 상세)
- `setup` 상태 화면은 손대지 않는다
- [ ] 페이지 테스트 갱신: 열람권 관련 단언 → "열람권 카드가 없다"(부정 확인), 랭킹 공개 방/비공개 방 단언을 새 위치로
- [ ] Commit — `feat(challenge): 진행 중 상세를 시안대로 — 히어로·4탭, 열람권 카드 제거`

---

### Task 7: 종료 — `ResultView`를 히어로 + 4탭으로

- `결과 요약`(`result-overview.tsx`): 내 결과 카드(왼쪽 월계수+`{rank}위` 금색, 가운데 아바타+왕관, 오른쪽 `종합 점수 {x}점`) → 지표 4칸(값 + `({n}위)`, 0117 전 운동 시간 `-`) → `최종 TOP 3` 카드(`RankingPodium`, `metaOf` = `26회 | 512분`) → `전체 랭킹 보기 >`(→ 최종 랭킹 탭)
- `최종 랭킹`(`final-ranking.tsx`): `MetricSelector withOverall`(기본 종합) → 표 머리 `순위 · 참가자 · {종합 점수|지표} · 주요 기록` → 전원 줄(내 줄 라임, 1~3위 메달, 주요 기록 = `{횟수}회` / `{분}분` 두 줄) → `챌린지 기록 인증 >`(텍스트 공유) → `다음 챌린지 참여하기`(`onDiscover`)
- `기록 분석`(`record-analysis.tsx`): 기존 `MyResultReport` 본문(머리·하단 버튼 제외) + `LevelCard`(누르면 아무 데도 안 감 → 버튼 아닌 카드로) + `WeeklyHeatmap` + `RewardsRow`
- `피드`: `챌린지가 끝나 활동 피드가 닫혔어요` 안내
- `result-summary.tsx`·`my-result-report.tsx` 삭제, `challenge-result.test.tsx` 새 구조로 갱신(지표 4칸 순위, 최종 랭킹 30명 전원·탭 전환, 기록 분석에 링·막대·보상, 열람권·랜덤 상자 문구 없음)
- `resultShareText`에 지표 4종 한 줄 추가(테스트 갱신)
- page: `onDiscover = () => { backToList(); setTab("discover"); }` 전달
- [ ] Commit — `feat(challenge): 종료 화면을 최종 시안대로 — 결과 요약·최종 랭킹·기록 분석·피드`

---

### Task 8: 개발 확인 페이지 확장 + 화면 확인

- `/challenge-result-qa?state=active|ended&n=2..60&min=0|1`(`min=0`이면 0117 전 응답 흉내)
- 개발 서버 390px(playwright-core — `tools/demo-video/node_modules` 재사용, 스크립트는 스크래치에) — 시안 4장 옆에 두고:

| 화면 | 조작 | 기대 |
|---|---|---|
| 진행 중 상세 | 첫 화면 | 히어로·4탭(랭킹 선택)·내 순위 카드·지표 4칸·TOP 5·전체 랭킹 보기·종합 잠금 |
| | 지표 바꾸기 ×4 | 목록·내 기록·차이 문구 바뀜, 내 줄 라임 |
| | n=2 / n=40 | 2명 목록 2줄 / 40명 TOP 5 + 내 줄 |
| | 탭 개요·피드·미션 | 기존 내용 보임, **열람권 카드 없음** |
| 랭킹 화면 | `>` | 전체 순위(10 + 내 줄 + 펼침), 내 진행 현황 막대 말풍선, 비교 카드, 팁 |
| | min=0 | 운동 시간 `준비 중` |
| 종료 결과 | 첫 화면 | 히어로(종료)·4탭·내 결과 카드·지표 4칸 순위·TOP 3 |
| | 최종 랭킹 탭 | 표 전원, 지표 탭 5개 전환, 기록 인증·다음 챌린지 참여하기 |
| | 기록 분석 탭 | 링·일별 활동·주요 기록·성장·레벨·보상·주간 |
| 공통 | 375/430px | 가로 넘침 없음 |

- 실데이터: Task 2 스크립트 → live 테스트 통과, 표 결과 보고
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build`

### Task 9: 기록·푸시

- `PROGRESS.md` 최상단, `docs/superpowers/HANDOFF-2026-10-07-challenge-competition.md`(0117 미적용·실데이터 결과·`[미검증]`)
- 배포는 별도 승인. 배포하지 않고 끝나면 푸시 여부를 묻는다(브랜치 `feat/challenge-result-screen`)

---

## Self-Review

- 지침 항목 대조: 지표 4종 정의(Task 1)·TOP 3 + 내 순위 + 라임(Task 3·4)·대표 순위 크게(Task 4)·4지표 선택(Task 3)·차이 문구 3종(Task 1 `gapMessage`)·연속/인증/이번 주 1위 칩(Task 4)·게임 요소 제한(왕관·메달·불꽃·막대만)·종합 잠금(Task 4, 결정 2 예외)·디자인 토큰 유지·DB 조사(위 표)·신규 테이블 없음·RLS 우회 없음·390px·long-scroll 대신 **최종 시안의 탭**(최종 시안이 더 나중 지시)·검증 4종(Task 8)·실데이터 2인 이상(Task 2)
- 2명~수십 명: `rankMetric`(공동·0), `pinMine`/`restRanking`(내 줄 고정), 펼침, 40명 테스트
- 점수 경로 하나: 종합 점수는 `rankParticipants`만. 종목 지표는 점수에 들어가지 않는다
