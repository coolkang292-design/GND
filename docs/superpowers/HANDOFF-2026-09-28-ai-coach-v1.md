# 인수인계 — AI 코치 V1 (운동 직후 피드백) · 2026-09-28

> 설계: `docs/superpowers/specs/2026-09-28-ai-coach-v1-design.md` (결정·제약·흐름은 거기가 기준)
> 상태: **코드 완료 · 게이트 초록 · 0112 미적용 · 커밋 전 · 배포 전**

## 1. 무엇을 만들었나

운동을 마치면 완료 화면에 **GND AI 코치** 칸이 붙는다. 코드가 본인의 같은 종목 직전 기록과
비교해 판정(진전·유지·피로·첫 기록)과 다음 행동 후보를 계산하고, DeepSeek는 그걸 짧은
한국어 코칭으로 바꾼다. 완료·XP·배지(`complete_workout_v2`)는 한 줄도 바뀌지 않았다.

| 파일 | 역할 |
|---|---|
| `supabase/migrations/0112_ai_coach_v1.sql` | 세트 기기 완료 시각 · 목표 프로필 · 세션 체감 · AI 결과 · 이벤트 1개 |
| `src/lib/domain/coach-config.ts` | 기준값·버전 한 곳 (`progression_v1`, `workout_feedback_v1`) |
| `src/lib/domain/workout-analysis.ts` | 분석 엔진 (AI 없음) |
| `src/lib/domain/coach-feedback.ts` | AI 입력 만들기 · 지시문 · **AI 결과 검증/교정** |
| `src/lib/domain/coach-highlights.ts` | "오늘의 성과" 종목 한 줄 (AI 없음) |
| `src/lib/domain/training-profile.ts` | 목표 프로필 값·변환 |
| `src/lib/ai-coach/deepseek.ts` | 제공사 어댑터 — 바꿀 때 이 파일만 |
| `src/lib/ai-coach/feedback-service.ts` | 서버 흐름 (소유 확인·중복 방지·재시도 3회) |
| `src/lib/ai-coach/supabase-deps.ts` | 읽기=사용자 권한, 쓰기=service role |
| `src/app/api/workout-feedback/route.ts` | `POST {sessionId, retry?}` |
| `src/lib/coach.ts` · `components/record/coach-card.tsx` · `training-profile-sheet.tsx` | 화면 |
| `src/lib/workout.ts` | `doneAtMs` → `client_completed_at` 저장 (`toSetRows`), **칸 없음 오류면 빼고 재시도** |
| `scripts/ai-coach-check.mjs` | RLS·권한·라우트 실측 (0112 적용 후) |

## 2. 확인한 것

- 게이트: `pnpm lint` 0 errors(기존 경고 2) · `typecheck` OK · **`test` 3858건 전부 통과** · `build` OK
- 클라이언트 번들에 `DEEPSEEK_API_KEY`·`api.deepseek.com`·`SUPABASE_SERVICE_ROLE_KEY` 0건 (OpenRouter 전환 뒤 재확인 필요)
- **0112 적용 전 안전망 (개발 서버, 픽스처 A, 2026-09-28 06:16 KST)**: 트레드밀 1세트로 운동 완료 →
  첫 세트 insert 400(PGRST204) → 칸 빼고 재시도 성공 → 세션 completed · 세트 1100m/563초 저장 ·
  XP 110 지급 · 완료 화면 정상 · AI 코치 칸은 **숨김**(테이블 404)
- ⚠️ 이 확인으로 픽스처 A에 **오늘 운동 1건**(트레드밀, 0분)이 운영 DB에 남았다

## 3. 남은 일 (순서대로)

1. ✅ **0112 적용** — 사용자가 SQL Editor에서 Run(2026-09-28). MCP로 객체 재조회: 테이블 3개 RLS on ·
   anon 권한 0 · `workout_ai_feedback`은 authenticated SELECT만 · 제약 9개 이벤트. Security Advisor 49건 중 0112 관련 0건
2. ✅ `pnpm db:snapshot` 갱신 (함수 102 · 정책 86 · 인덱스 105)
3. ✅ `node scripts/ai-coach-check.mjs --route http://localhost:3000` → **35 통과 / 0 실패**.
   처음 6 실패는 스크립트 결함이었다: ① 픽스처에 `profiles` 행이 없어 `start_workout`이 `workout_events` FK로 409 →
   세션이 draft에 남아 ③이 연쇄 실패 ② `analytics_events`에 `return=representation`으로 넣어 SELECT 권한에서 42501
   (앱은 `.insert()`만 쓴다). 둘 다 스크립트에서 고쳤다
4. ✅ `.env.local`에 `OPENROUTER_API_KEY` (2026-09-28 사용자 등록). 제공사는 **OpenRouter 경유 DeepSeek**
   (`deepseek/deepseek-v4.1-flash`, 추론 끔, `data_collection: deny`). `DEEPSEEK_API_KEY`는 OpenRouter 키가
   없을 때만 쓰는 대체 경로. 선택 `AI_COACH_MODEL`은 고른 경로의 이름 체계를 따른다
5. ✅ 개발 서버 화면 확인 (픽스처 A, 2026-09-28 06:47~06:54 KST):
   - 랫풀다운 45kg×13×3 → 목표 시트(6칩) → 체감 `적당` → **성장 신호** "36회 → 39회", 볼륨 +8.3%, 다음엔 증량 제안
   - 덤벨 컬 12kg×12×3 + `통증 있었음` + `힘듦` → 목표 시트 **건너뜀**(프로필 있음) → **유지**, 12회 도달에도 증량 제안 없음, 통증 안내 표시
   - DB: 두 세션 모두 `completed` · `attempt_count 1` · 새로고침 후에도 1. 세트 `client_completed_at` 간격 34초·40초,
     서버 `completed_at`은 3세트가 **같은 시각**(트리거 덮어쓰기 — 기기 시각을 따로 받는 이유가 실측으로 확인됨)
   - 콘솔 406 ×4는 로그인 전(온보딩)에서 난 것 — 코치 흐름 중 증가 0. 어느 요청인지는 [미검증]
   - ⚠️ 이 확인으로 픽스처 A에 운동 2건(랫풀다운·덤벨 컬)이 운영 DB에 남았다
6. ✅ Vercel `OPENROUTER_API_KEY` 사용자 등록 → **운영 배포 `d42039c`** (2026-09-28 07:42 KST) → 운영 실물 확인:
   `/whats-new` 항목 · 라우트 비로그인 401 · `/record` 번들에 "GND AI 코치" · 키·엔드포인트 노출 0 ·
   픽스처 A 기존 트레드밀 세션으로 운영 라우트 2회 호출 → `completed` · `attempt_count 1`. 알림 발송 없음(사용자 지시)
7. 개인정보처리방침에 **국외 이전(OpenRouter[미국] → 처리 제공사는 OpenRouter가 선택, 실측 때 StreamLake)** 고지 — 사용자 확인 필요
8. 완료 카드 개편(사진 + "오늘도 해냈다" + 기록→실력 문구)은 **이번 커밋에서 뺐다** — 사용자 이미지
   `어플 UI 이미지/운동완료 사진.png`로 다시 붙여 화면 확인 후 별도 배포

## 4. 알아둘 것

- 세트 간격 = 기기 완료 시각 차 = **수행+휴식**. 템포가 아니다(세트 시작 버튼 없음 — 사용자 결정)
- `analytics_events`는 평생 1행이라 KPI는 새 테이블로 센다:
  생성 성공률 = `workout_ai_feedback.status`, 열람 = `viewed_at`, 체감 응답 = `workout_session_feedback.overall_effort`
- 완료 화면의 기존 **"📤 AI 코치에게 공유"** 버튼(기록을 외부 AI로 복사)과 이름이 겹친다 — 정리 필요 여부는 사용자 판단
- 과거 기록 화면(달력·피드 상세)에는 아직 AI 결과를 안 보여 준다 — 완료 화면을 떠나면 다시 볼 곳이 없다(V1 범위 밖)
