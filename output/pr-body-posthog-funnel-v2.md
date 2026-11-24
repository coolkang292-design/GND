> ⚠️ **Draft · 병합 금지 · 운영 배포 안 함.** Vercel 환경변수·운영 DB·마이그레이션·`/privacy` 운영 페이지는 건드리지 않았습니다.
> 상세 근거: [`docs/analytics/posthog-funnel-v2.md`](docs/analytics/posthog-funnel-v2.md)

## 1. 브랜치 · HEAD

- 브랜치: `feat/posthog-funnel-v2` (base `main` @ `635e8cf`)
- HEAD: `dfd635ab64c6f864a353e9fc8195d7e38e8ffc83`
- 커밋 3개: `7300a9c`(← 86a4da3 cherry-pick) · `b80e3ff`(← fcd52a2 cherry-pick) · `dfd635a`(v2 신규)
- 기존 `feat/posthog-funnel`은 건드리지 않음

## 2. 변경 파일

**기존 브랜치에서 가져온 것** (86a4da3 · fcd52a2, 34파일): SDK·사전 동의·화이트리스트·테스트·문서. 충돌은 `src/app/login/page.tsx`·`src/app/onboarding/page.tsx`의 **import 줄만** — main의 `useUsableProviders`(P0-3)와 PostHog import를 둘 다 남김. 본문 자동 병합.

**v2에서 새로 쓰거나 고친 것** (27파일):

| 파일 | 이유 |
|---|---|
| `src/lib/posthog/events.ts` | `start_clicked`·`workout_started` 등록, `location` enum, 공통 속성(`utm_source` 5채널 정규화·`traffic_type`·`is_internal`), 사람 속성 `is_internal` |
| `src/lib/posthog/context.ts` *(신규)* | 공통 속성 계산 — 첫 접촉 채널, 첫 방문/재방문(탭 세션 고정) |
| `src/lib/posthog/track.ts` | 공통 속성 부착, 철회 시 `traffic_type` 기록 삭제 |
| `src/lib/posthog/exclusion.ts` | `isLikelyBot`(webdriver·headless·크롤러 UA). 내부 플래그 = 차단 → 표시 |
| `src/lib/posthog/client.ts` | 봇 차단, 사람 속성 `is_internal`, 같은 사람 속성 `$set` 반복 제거 |
| `src/lib/posthog/workout-event.ts` | `reportWorkoutStarted`, 첫 운동 `is_first=true` 사용자당 1회 |
| `src/components/analytics/analytics-provider.tsx` | **버그 수정**: 로그인 확인 중(`loading`)을 로그아웃으로 오인 → 새로고침마다 reset·`$identify`·새 세션 |
| `src/components/analytics/use-consent-status.ts` *(신규)* | 동의 상태 구독 훅 |
| `src/components/funnel-tracker.tsx` · `src/app/onboarding/page.tsx` | 동의 순간 `landing_opened`·`onboarding_started` 재시도(PostHog 1회, DB 추가 0) · `start_clicked` · **P0-2 바로 시작에서 `onboarding_nickname_shown` 누락 수정** · `location` |
| `src/app/login/page.tsx` | `start_clicked(login_signup)` |
| `src/app/(tabs)/record/page.tsx` | `workout_started` 호출 |
| `src/components/record/protect-records-card.tsx` | 기록 지키기 `identity_link_started/failed(location=protect_records)` |
| `src/lib/analytics-events.ts` | `location`을 PostHog 복제에만 전달(DB 불변) |
| 테스트 10개 | `funnel-v2.test.ts`·`analytics-provider.test.tsx`·`funnel-tracker.test.tsx` 신규, 나머지 갱신 |
| `docs/analytics/*` | v2 보고서 신규, 개인정보 검토 표·처리방침 초안 갱신, v1 보고서에 v2 안내 |

## 3. 이벤트 표

모든 이벤트에 공통 속성 `utm_source`(instagram/youtube/threads/tiktok/other, utm 없으면 생략) · `traffic_type`(new/returning) · `is_internal`(bool).

| 이벤트 | 발생 위치 | 속성 | Supabase 원본 대응 |
|---|---|---|---|
| `landing_opened` | `src/components/funnel-tracker.tsx:36` | utm_*·referrer_host·landing_path | `analytics_events` + `profiles.acquisition_*` |
| `start_clicked` 🆕 | `src/app/onboarding/page.tsx:537`(바로 시작) · `:261`(카카오/구글) · `src/app/login/page.tsx:301` | `location` | 없음(PostHog 전용) |
| `onboarding_started` | `src/app/onboarding/page.tsx:182` | — | `analytics_events` |
| `onboarding_nickname_shown` | `src/app/onboarding/page.tsx:198` | — | 없음(파생) |
| `onboarding_completed` | `src/app/onboarding/page.tsx:304` | `has_invite` | `profiles.created_at` |
| `identity_link_started` | `src/app/onboarding/page.tsx:265` · `src/components/record/protect-records-card.tsx:60` | provider·`location` | `analytics_events`(온보딩만) |
| `identity_link_succeeded` | `src/app/auth/callback/page.tsx:84` | provider | `auth.identities`·`is_anonymous=false` |
| `identity_link_failed` | `src/app/onboarding/page.tsx:277` · `src/components/record/protect-records-card.tsx:67` · `src/app/auth/callback/page.tsx:71` | provider·location·error_code | `analytics_events`(온보딩 이동 전만) |
| `login_succeeded` / `login_failed` | `src/app/login/page.tsx:129` / `:89`·`:118` · `src/app/auth/callback/page.tsx:92` / `:73` | provider·error_code | 없음(Auth 로그) |
| `workout_started` 🆕 | `src/app/(tabs)/record/page.tsx:2774` | `is_first`·`workout_index`(=완료 수+1) | `workout_sessions.started_at` |
| `workout_completed` | `src/app/(tabs)/record/page.tsx:2869` | is_first·workout_index·exercise_count·duration_bucket·has_photo | `workout_sessions.completed_at` |

## 4. 동의 상태별 전송 결과 (PostHog 요청 수)

| 상태 | 자동 테스트(진짜 posthog-js) | 로컬 브라우저(가짜 수집 서버) | 운영 빌드 `next start` |
|---|---|---|---|
| 동의 전 | **0** | **0** | **0** · SDK 청크 미로드 |
| 거부 | **0** | **0** | — |
| 동의 | **6**(이벤트 5 + `$identify`) | 이벤트 도착 | SDK 로드 · 요청 발생 |
| 철회 | 이후 **0** | 이후 **0**(15→15) · `ph_*`·`gnd:ph:*` 삭제 | — |
| 봇 + 동의 | **0** · SDK 미로드 | — | — |

autocapture·페이지뷰·리플레이·히트맵은 꺼진 그대로(테스트 고정). 켜는 제안은 문서 §8에만 있음.

## 5. 중복 검증

- **익명 → 기록 지키기(linkIdentity)**: UID 불변 → 6개 이벤트 distinct_id가 1개, reset 0회, identify 1회 (`funnel-v2.test.ts`)
- **/login 다른 id**: `identify(A)`→`reset`→`identify(B)`, alias/merge 없음, B 이름으로는 B 이벤트만 (`funnel-v2.test.ts`, `client.test.ts`)
- **새로고침**: `$identify`·`$set` 재전송 0, 세션 유지 — 로컬 브라우저에서 재현한 버그를 고친 뒤 확인 (`analytics-provider.test.tsx`, `client.test.ts`)
- **첫 운동**: `workout_started`·`workout_completed`의 `is_first=true` 사용자당 1회, 같은 세션 재시도 1회 (`provider-workout.test.ts`)
- **동의 순간 재시도**: PostHog 1회, DB `analytics_events` 추가 쓰기 0(브라우저에서 동의 전 2건·동의 후 0건)
- 변이 테스트: 봇 차단·첫 운동 키·traffic 고정·loading 가드·`$set` 표식·동의 의존성을 하나씩 지우면 해당 테스트가 실패함을 확인

## 6. 검증 수치 (Node 22.23.3)

| 항목 | 결과 |
|---|---|
| `pnpm typecheck` | ✅ 0 오류 |
| `pnpm lint` | ✅ 0 errors · 4 warnings — **전부 기존**(`scripts/make-study-pack.mjs`, `tools/demo-video/features.mjs`, 이번 diff 밖) |
| `pnpm test` | ✅ 253 files · **4294 passed · 1 skipped**(`challenge-metrics.live.test.ts`, 기존 live 테스트) · 0 failed |
| `pnpm build` 키 없음 | ✅ 성공 · 정적 청크에 키 값 0 |
| `pnpm build` 가짜 키 | ✅ 성공 |

## 7. 남은 일

**사용자가 할 것**
1. Vercel **Preview**에 `NEXT_PUBLIC_POSTHOG_KEY` 입력(프로젝트 653928 `phc_` 키). 에이전트는 환경변수를 건드리지 않음
2. `/privacy` 문구 승인 — 초안 `docs/analytics/posthog-privacy-review.md` §8 (운영 페이지 미수정)
3. PostHog "Filter out internal and test users"에 `is_internal is not true` 설정 — 방법: v2 문서 §6-1
4. Preview에서 `?gnd_internal=1`로 동의 후 Activity 확인

**[미검증]** (자동 테스트로만 증명)
- 브라우저에서 `/login` 이메일 로그인으로 다른 계정 전환 — 픽스처 비밀번호 읽기 권한 거절로 시도 안 함
- 브라우저에서 `workout_started`·`workout_completed`·기록 지키기 클릭 — 운영 DB에 프로필·운동을 만들어야 해서 안 함
- 실제 카카오·구글 연결 완료 후 `identity_link_succeeded`

**알아둘 한계**: 동의 전 클릭은 PostHog에 없다(사전 동의 모델). 절대 전환율은 Supabase가 원본.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
