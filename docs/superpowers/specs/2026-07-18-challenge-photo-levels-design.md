# 챌린지 사진 인증 필수 + 챌린지 레벨 시스템 — 설계

2026-07-18. 사용자 승인 완료 (설계 대화에서 정책 4개 확정).

## 1. 목표

1. **사진 인증 필수**: 새로 만드는 챌린지는 사진 인증한 운동만 집계에 인정 — "사진 없으면 안 한 거다".
2. **챌린지 레벨**: 챌린지 기간 동안 운동 빈도에 따라 오르내리는 불독 5단계 레벨.

## 2. 확정 정책 (사용자 결정 사항)

| 항목 | 결정 |
|---|---|
| 사진 규칙 적용 시점 | **다음 챌린지부터** — 진행 중 챌린지는 기존 규칙 유지 (소급 없음) |
| 적용 방식 | **새 챌린지는 무조건 필수** — 생성 옵션 없음 |
| 적용 범위 | **전부 사진 기준** — 목표 실적 + 참여율(운동일) + 레벨 카운트 모두 |
| 레벨 규칙 | 한 구간(7일)에 **5일 이상 운동 → +1**, **스트릭 꺼짐(5일 공백)마다 → -1** |
| 레벨 유효 범위 | **챌린지 기간 동안만** — 시작 시 전원 Lv.1, 과거 이력 소급 없음 |

레벨 이름 (고정):

| Lv | 이름 |
|---|---|
| 1 | 잠만보 불독 |
| 2 | 산책 시작 |
| 3 | 쇠질 입문 |
| 4 | 근육 불독 |
| 5 | 개노답 탈출 |

## 3. Feature A — 챌린지 사진 인증 필수

### 3.1 DB (0014 마이그레이션)

```sql
alter table public.challenges
  add column if not exists photo_required boolean not null default false;
```

- 기존 챌린지 전부 `false` → 기존 규칙 그대로. RLS·함수 변경 없음 (`finalize_challenge`는 점수를 계산하지 않으므로 무관).
- `select("*")` 패턴이라 컬럼 추가는 기존 배포 코드에 무해. 단 **`createChallenge`가 `photo_required`를 insert하는 새 코드는 0014 적용 후에만 배포** (순서 게이트).

### 3.2 타입·생성

- `types.ts` `Challenge`에 `photo_required: boolean` 추가.
- `createChallenge`(challenge.ts)가 항상 `photo_required: true`로 insert.

### 3.3 집계 게이트 (핵심)

`getPeriodStatsByUser(groupId, startDate, endDate, timeZone, photoRequired = false)`:

- `photoRequired === true`면 select embed에 `workout_images!inner(image_path)`를 추가해 **사진 없는 세션을 서버(PostgREST inner join)에서 제외**. `false`면 기존 쿼리 그대로 (embed 자체 없음).
- 피드 [📷 사진만] 필터(Task 8, 리뷰 2단계 승인)와 동일한 검증된 패턴. 세션당 사진 1장 unique(0005)라 조인 중복 없음. RLS 정합성도 동일 논리로 성립.
- 이 함수 하나가 순위·참여율·꾸준왕 성과 시트·레벨의 유일한 데이터 소스이므로 **여기 한 곳만 게이트하면 전 화면 일관 적용**.

호출부 2곳이 `challenge.photo_required`를 전달:

- `challenge/page.tsx` (active/ended 로드, 현재 `:164`)
- `getActiveChallengeRanking`(challenge.ts, 현재 `:435`) — 홈 꾸준왕 성과 시트가 이를 통해 자동 반영

### 3.4 UI

- **챌린지 화면 헤더**: `challenge.photo_required`면 기간 아래 배지 `📷 사진 인증 필수 — 사진 없는 운동은 집계되지 않아요`.
- **생성 시트**(setup-sheet, create 모드): 고정 안내 문구 `📷 이 챌린지는 사진 인증한 운동만 집계돼요` (새 챌린지는 전부 필수이므로 조건 없이 표시).
- 운동 기록 화면은 변경 없음 (사진 첨부 UI 기존재 — 넛지 추가는 비범위).

## 4. Feature B — 챌린지 레벨 시스템

### 4.1 도메인 (`src/lib/domain/level.ts`, 순수·TDD)

```ts
export const LEVEL_NAMES = ["잠만보 불독", "산책 시작", "쇠질 입문", "근육 불독", "개노답 탈출"];
export function levelLabel(level: number): string; // "Lv.3 쇠질 입문"
export function challengeLevel(
  dayKeys: string[],   // 기간 내 운동일 (photo_required면 사진 세션만 — 호출부가 보장)
  startDate: string,   // 챌린지 start_date
  endDate: string,     // 챌린지 end_date
  todayKey: string,    // 사용자 tz 기준 오늘
): number;             // 1~5
```

계산 규칙 — 이벤트를 날짜순으로 적용, 매 단계 1~5로 클램프:

1. **주 블록**: `start_date`부터 7일 단위(`[start, start+6]`, `[start+7, start+13]`, …), 마지막 블록은 `end_date`에서 잘림. 달력 요일과 무관 — 챌린지가 무슨 요일에 시작해도 공평.
2. **레벨업(+1)**: 한 블록 안에서 **5번째 운동일이 발생한 날**. **블록당 최대 1회** — 6·7일을 채워도 추가 업 없음. 7일 미만 잘린 블록에서 5일을 못 채우면 자연히 업 없음.
3. **레벨다운(-1)**: 연속 운동일 사이 **간격 ≥ 5일**(스트릭 소멸 규칙 `STREAK_EXPIRY_DAYS` 재사용)이 벌어질 때마다 — 이벤트 시각은 `이전 운동일 + 5일`. 마지막 운동일부터 `min(todayKey, endDate)`까지의 공백도 동일 판정(1회).
4. **동일 날짜 충돌**: 공백 5일째 되는 날 복귀 운동한 경우 다운 이벤트가 먼저(공백이 시간상 선행), 그 날부터 블록 카운트 재개.
5. **경계**: `todayKey < startDate` → Lv.1. `todayKey > endDate` → `endDate` 기준으로 고정(종료 후 시상대에 표시될 최종 레벨). 기간 시작~첫 운동일 사이 공백은 다운 미적용(Lv.1 floor라 효과 없음 — 규칙 단순화).
6. 레벨은 **표시 전용** — 순위 점수(achievement/participation/overall)에 영향 없음.

### 4.2 데이터 연결

- `PeriodStats`에 `workoutDayKeys: string[]`(기간 내 운동일, 오름차순) 추가 — `foldPeriodStats`가 이미 갖고 있는 `days` Set을 정렬 배열로 노출. `workoutDays`(개수)는 유지.
- `EMPTY_STATS`가 challenge.ts와 page.tsx에 중복 정의돼 있음 → challenge.ts에서 export하고 page.tsx는 import로 교체 (중복 제거, 필드 추가 시 한 곳만 수정).
- 레벨 계산: `challengeLevel(stats.get(uid).workoutDayKeys, ch.start_date, ch.end_date, todayKey)` — 별도 쿼리 없음.

### 4.3 UI (기존 "🔒 기간 중 내 진행률만 공개" 정책 준수)

- **active**: 히어로 카드(그라데이션)에 **내 레벨만** 뱃지 표시 — `Lv.2 산책 시작`. 참여자 리스트의 타인 레벨은 표시하지 않음.
- **ended(시상대)**: 상세 순위 카드의 닉네임 옆에 각자 **최종 레벨** 뱃지 (전원 공개 시점이므로).
- setup 상태·챌린지 없음 상태에서는 레벨 미표시. 홈·프로필·피드에도 v1 미표시.

## 5. 테스트·검증

- **level.test.ts (TDD)**: 운동 없음→1 / 블록 5일→2 / 4블록 연속→5 캡 / 업 후 5일 공백→다운 / Lv.1 floor / 블록에 걸친 4+1일→업 없음 / 잘린 마지막 블록 / trailing 공백 / 종료 후 endDate 고정 / 공백 5일째 복귀(다운 우선) — 10케이스 내외.
- **foldPeriodStats**: `workoutDayKeys` 정렬·기간 필터 케이스 추가.
- **0014 실 DB 검증 스크립트**(`scripts/challenge-photo-test.mjs`): 익명 유저 픽스처로 사진 有/無 세션 만들고 `photo_required` on/off 쿼리 결과 비교 (rls-test.mjs 인프라 참고). SQL Editor 적용 게이트 후 실행.
- 회귀: unit 150+신규 · RLS 107 · build.

## 6. 적용 순서 (게이트)

1. 도메인·테스트 구현 (DB 무관 부분 선행 가능)
2. **0014를 사용자가 SQL Editor에 적용** ← 수동 게이트
3. 실 DB 검증 스크립트 → 통과 후 `createChallenge` 포함 코드 배포
4. 프로덕션 확인

## 7. 비범위 (YAGNI)

- 기록 화면 사진 강제/넛지, 레벨업 알림(푸시·토스트), 크루원 레벨 실시간 공개(active 중), 홈/프로필/피드 레벨 표시, 기존 챌린지 소급, 브리핑 문구 연동.
