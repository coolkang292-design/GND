# 진화 카드 디자인 개선 (시안 B) — 설계

작성 2026-11-13 · 상태 **사용자 승인(채팅, 시안 B 선택·설계 확인)** · 브랜치 `feat/evolution-card-b`
관련: `plans/2026-11-13-evolution-rules-evidence-adjustment.md`(규칙·수치), `src/components/profile/stage-evolution-status.tsx`

## 1. 목표
서버 진화 카드를 더 직관적으로 보이게 하고, **목표를 넘겨 달성하면 성취감**이 느껴지게 한다. 서버·DB·규칙은 바꾸지 않는다. 표시만 바꾼다.

## 2. 구성 (위 → 아래)
1. **헤더** — "다음 진화 · {단계명}" + 조건 달성 칸 막대(칸 하나 = 조건 하나) + "조건 N개 중 M개를 채웠어요". 서버 `state === "eligible"`이면 "진화 조건을 모두 채웠어요"와 라임 체크. 목표를 **2배 이상** 넘긴 조건이 있으면 "목표를 크게 넘긴 조건 N개"를 덧붙인다.
2. **달성한 조건 = 2열 큰 숫자 타일**(`met === true`). 라벨, 큰 값, "목표 X". 
3. **남은 조건 = 폭 전체 막대 줄**(`met === false`). "현재 → 목표", 막대와 %, 쉬운 설명(예 "2레벨 남았어요"). **남은 조건이 정확히 1개**면 "마지막 조건이에요".
4. **대체 경로** — 맨 아래 작게(막대 + 문구). 5단계 운동일 경로는 "꾸준함은 따로 채우지 않아도 돼요". 달성하면 체크.
5. 하단 고정 문구와 "오늘 운동 시작하기" 버튼은 현행 유지.

## 3. 초과 달성 표시 규칙 (순수 함수로 분리·시험)
- `ratio = current / required` (둘 다 유한하고 `required > 0`일 때만).
- `ratio < 1` → 미달(막대 줄). `ratio === 1`(반올림 전 값) → 배지 없음, 부제 "목표 달성".
- `1 < ratio < 2` → **초과** 배지 `+{차이}{단위}` — 일·주·종목·회·레벨은 정수 차이, 평균은 `+{차이 소수1자리}%p`.
- `ratio >= 2` → **크게 초과** 배지 `{ratio 소수1자리}배`.
- 초과 타일: 배경 `accent-weak`, 테두리 라임(평균·크게 초과) 또는 초록(일수 등 일반 초과), 숫자 색 라임/초록. 단순 달성 타일: `surface-2`, 부제 라임.
- 판정은 서버 `met`을 그대로 쓴다. 화면이 `met`을 다시 계산하지 않고 **표시용 배수만** 계산한다.
- 모든 숫자는 반올림 후 표시(부동소수 노출 금지). `growth_average`의 `current`는 소수 1자리.

## 4. 조건 → 타일/줄 매핑
| key | 라벨 | 단위 | 비고 |
|---|---|---|---|
| `xp` | 경험치 레벨 | 레벨 | 값은 `Lv.N` |
| `days` | 운동한 날 | 일 | 4·5단계 |
| `weeks` | 운동 시작 후 | 주 | 6·7단계 |
| `recent` | 최근 운동 {windowDays}일 | 일 | 6·7단계 |
| `growth_count` | 성장 종목 | 종목 | 서버가 `current`를 `null`로 주면 "기준 확인 중" |
| `growth_average` | 평균 성장 | % | 부제 "목표 +{required}%" |
| `steady` | 꾸준함 | 회 | 5~7단계 |

## 5. 상태별
- `needs_baseline`: 성장 타일은 값 자리에 "기준 확인 중"(0%로 표시 금지), 헤더 문구 "성장 비교 기준을 확인 중이에요".
- `error`: 현행 유지 — 성장 조건·대체 경로 숨김, "운동 기록과 경험치는 그대로예요".
- `xp_only`(시동러까지): 경험치 막대 줄 하나만. "시동러까지는 경험치만으로 진화해요".
- `max_stage`(`nextStage === null`): 현행 유지.
- 압박·죄책감 문구 금지. "마지막 조건이에요"는 응원 톤.

## 6. 모션·접근성
- 진화 조건을 모두 채우면(`eligible`) 헤더 체크가 **한 번만** 살짝 커지는 효과. `prefers-reduced-motion: reduce`에서는 효과 없음. 꽃가루 등 과한 연출 금지.
- 색만으로 구분하지 않는다(체크/문구/배지 병행). 막대는 `role="progressbar"`와 `aria-valuenow/min/max`, 칸 막대는 `aria-label`로 "조건 N개 중 M개". 타일은 목록(`ul/li`)으로.
- 앱 기존 색 토큰만 사용: `accent`(#c8ff3d), `accent-weak`, `good`(#50dc88), `warn`(#fb8a3c), `surface-2`, `line`, `muted`, `faint`. 새 색 추가 금지.

## 7. 구조
- `src/lib/domain/evolution-card-model.ts`(신규, 순수): `buildEvolutionCardModel(status) → { headline, segments[], tiles[], rows[], alternate, overCount }`. 배수·배지·부제·막대 %·"마지막 조건" 판단을 여기서 계산. React 의존 없음.
- `src/components/profile/stage-evolution-status.tsx`: 모델을 그리기만 한다(표시 컴포넌트). 성장 허브·프로필 시트가 같은 컴포넌트를 쓰므로 둘 다 바뀐다.
- 옛 카드(`EvolutionStatusView`, 서버 미설치용)는 건드리지 않는다.

## 8. 시험·검증
- 모델 단위 시험: 경계값(0.99·1.0·1.01·1.99·2.0·3.18배), `required` 0/`null`/`current` `null`, 단계별 조건 구성(4·5: days, 6·7: weeks+recent), 막대 % 상한(100% 초과는 막대는 100%로 고정하고 배지로 표현), 남은 조건 1개일 때 "마지막 조건", 대체 경로 면제 문구.
- 렌더 시험: 상태 5종(blocked·eligible·needs_baseline·error·xp_only) + 초과/단순달성/미달 혼합, `role="progressbar"` 값, `prefers-reduced-motion` 클래스 분기.
- 기존 시험(`stage-evolution-status.test.tsx`, `evolution-status-card.gate.client.test.tsx`)은 문구·구조가 바뀌므로 새 규칙에 맞춰 갱신하되 **서버 `met` 신뢰**·**error에서 성장 숨김**·**needs_baseline에서 0% 금지** 단언은 유지.
- 개발 서버에서 실제 서버 응답(중계 패스스루)과 오뎅끼데스까 JSON으로 성장 허브·프로필 시트를 **375px 모바일·데스크톱 폭**에서 확인(가로 스크롤 없음, 넘침 없음).
- 전체 `lint`·`typecheck`·`test`·`build`. 푸시·배포는 별도 승인.

## 9. 범위 밖 (YAGNI)
서버 규칙·수치 변경, 옛 카드 개편, '내 성장' 카드(`level-growth-card`) 디자인, 알림·푸시 문구, 효과음/꽃가루 연출, 다크/라이트 전환(앱은 다크 전용).
