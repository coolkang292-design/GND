# 인수인계 — 인터벌 뒤 이어하기 (2026-09-29)

> 상태: **운영 배포 완료 · 운영 실물 검증 완료 · ⛔ 사용자 Run 2건 남음 (§4)**
> 설계: `docs/superpowers/specs/2026-09-29-interval-follow-up-design.md`
> 계획: `docs/superpowers/plans/2026-09-29-interval-follow-up.md` (실행 중 달라진 것이 맨 위에 있다)

## 1. 무엇이 바뀌었나

인터벌 계획(`workout_plans.tabata_minutes` 4·8·16)의 **앞 4개 = 음원 인터벌**, **5번째부터 = 이어하기**.

- 음원이 끝나면 이어하기가 있으면 운동을 끝내지 않는다 → 블록 4종 ✓ · 활동 시각 갱신 · 휴식 1회
  (세트를 끝냈을 때와 같은 `startRest`, 처방이 없으면 평소 휴식 시간) → 운동중 화면 → 완료 1회 → 기록 1개
- 이어하기가 없으면 예전 그대로 음원 끝 = 완료
- 인터벌 4종은 계획의 **앞 4개에서만** 카탈로그에 대조한다. 없으면 빈칸(3/4) — 뒤에서 끌어오지 않는다
- 무동작 감지: 블록이 도는 동안만 끈다(`intervalBlockPending`)
- 운동 중 블록 종목은 빼기·건너뛰기·옮기기 불가(`isIntervalBlockExercise`) — 저장 `sort_order` 0~3이 곧 인터벌이다
- 인터벌 블록은 비교에 쓰지 않는다: 기록 갱신(`withoutIntervalBlock`) · 지난 기록 조회(`getPreviousExerciseRecords`)
  · AI 코치 지난 기록(`readHistory`) · AI 코치 **이번 세션**(`coachSessionRows`, 섞인 세션만 — 순수 인터벌은 그대로)
- 지난 기록 조회는 일반·인터벌 세션을 **따로** 가져온다(`mergeRecentSessions`) — 합치면 인터벌이 20·40 한도를 먹는다
- 달력: 카드에 "인터벌 뒤에 이어서: …" 줄, 인터벌 계획을 고쳐 저장해도 이어하기 보존
- `0113`: `workout_plans.tabata_minutes` 열 설명에 형식을 적는다(ChatGPT가 스키마를 본다). **CHECK 제약은 뺐다** — 설계 §7
- ChatGPT 붙여넣기 규칙: `docs/chatgpt-plan-rules.md`

## 2. 게이트

lint 0 errors(경고 2건은 `scripts/make-study-pack.mjs`, 무관) · typecheck OK · **테스트 3915건 통과** · build OK

## 3. 개발 서버 확인 (픽스처 A, 375px, 헤드리스 크롬을 `tools/demo-video`의 playwright-core로 직접 조작)

| # | 결과 |
|---|---|
| ① 배너 | `푸시업 · 마운틴 클라이머 · 점핑잭 · 크런치 · 이어서 2종목` |
| ② 시트 | "인터벌 뒤에 이어서: 버드독 · 데드버그", "음원이 끝나면 이어서 2종목을 해요." |
| ③ 음원 끝 | 운동 안 끝남 · 토스트 · **휴식 중 1:30** · 다음 운동 버드독 · `4 / 7 완료` |
| ④ 휴식 건너뛰기 | 버드독 입력 |
| ⑤ 블록 삭제 시도 | "인터벌 종목은 운동 중에 빼거나 옮길 수 없어요", 푸시업 그대로 |
| ⑥ 완료 | 세션 1개 · 종목 6개(DB `0~3` 인터벌 각 2회 · `4` 버드독 10·10 · `5` 데드버그 10) · 계획 삭제 |
| ⑦ 두 번째 섞인 세션 | "🏅 버드독을 4회 더 하셨어요" — 이어하기가 지난 기록이 됐다 |
| ⑦' AI 코치 | 처음엔 "푸시업 30회 → 2회, 크게 줄었다"가 떴다 → `coachSessionRows` 추가 → 버드독·데드버그만 분석 |
| ⑧ 순수 인터벌 | 예전처럼 바로 완료(`완료 세트 4개`) |
| ⑨ 달력 | 카드 이어하기 줄 · 16분으로 고쳐 저장해도 이어하기 유지(DB 6종목) |
| ⑩ 375px | 넘침 없음. 단어 중간 끊김은 `break-keep`로 고침 |
| ⑪ 무동작 | +60·180·290초 정지 안 됨 · **+330초 정지 창** — 이어하기 동안 감지가 켜져 있다 |

테스트 계획(`title` "개발 확인 ·")은 전부 지웠다. 픽스처 A 세션 기록은 남겼다.
개발 서버를 헤드리스로 열 때 **익명 계정이 하나 생긴다**(프로필 없음, 무해 — CLAUDE.md "지우지 마라").

## 4. ⛔ 사용자 Run 2건 (SQL Editor, 순서·배포 무관)

1. `supabase/migrations/0113_interval_plan_contract_comment.sql` 전체
2. 오뎅끼데스까 카탈로그 4종(파일로 남기지 않는 1회 보정). 안 하면 수요일 인터벌 칸 1개(`Scapular Push-up Plus`)가 빈다:
```sql
insert into public.exercise_catalog (name, body_part, exercise_type, measure, is_custom, created_by)
select v.name, v.body_part, v.exercise_type, v.measure, true, p.id
from public.profiles p
cross join (values
  ('Scapular Push-up Plus', '어깨', 'bodyweight', 'reps'),
  ('흉추 익스텐션', '등', 'bodyweight', 'reps'),
  ('도어웨이 가슴 스트레칭', '가슴', 'bodyweight', 'time'),
  ('Wall Slide', '어깨', 'bodyweight', 'reps')
) as v(name, body_part, exercise_type, measure)
where p.nickname = '오뎅끼데스까'
on conflict (created_by, name) where created_by is not null do nothing
returning name;
```
Run 뒤 확인: 오뎅끼데스까 계정에서 네 이름이 `is_custom = true, created_by = 본인`으로 보이는지(읽기 전용 조회).

## 5. 배포

- `dd36015` 푸시 → 원격 `0 0` · 기본 브랜치 `main`
- `git archive HEAD` 복사본에서 `npx vercel --prod --yes` → `gnd-3ydswbs22-gnd4.vercel.app` Ready
- 운영 실물(`gnd-one.vercel.app`): `/record` 번들 `08h3x-7uib18z.js`에 "인터벌 끝! 숨 고르고 이어서 해요" ·
  "인터벌 뒤에 이어서" · 블록 잠금 문구 / `/whats-new` 새 항목 / `/api/workout-feedback` 비로그인 401
- 알림 발송 없음(지시할 때만)

## 6. 남은 것 · 한계

- `[미검증]` 실제 아이폰: 음원 종료 뒤 휴식 끝 비프(비프 준비는 사용자 탭 안에서 해야 하는데 음원 종료에는 탭이 없다) · 이어하기 도중 새로고침 복원
- 한계(설계 §10): 섞인 **과거 기록**을 📋 복사·"지난 운동 불러오기"하면 인터벌 4종만 옮겨진다 · 인터벌을 건너뛰고 이어하기만 하기 불가 · 앱에서 이어하기 종목 편집 불가(보존만)
- 인터벌 **전에** 할 운동은 같은 날 별도 계획(더 이른 `scheduled_at`) — ChatGPT 규칙 문서에 적었다
- 운영 프로필이 기준선 8개가 아니라 **9개**(새 계정 `Ing`) — 이번 작업과 무관, 실사용자로 보인다. CLAUDE.md 기준선 갱신 여부는 사용자 확인
