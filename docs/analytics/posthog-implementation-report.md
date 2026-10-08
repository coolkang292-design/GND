# PostHog 연동 구현 결과 (브랜치 `feat/posthog-funnel`)

작성 2026-10-09 · **운영 배포 전 상태.** 법적 검토 완료 아님. 개인정보 검토는 `posthog-privacy-review.md` 참고.

## 1. 한 줄 요약

PostHog는 **사용자가 동의한 경우에만**, 화이트리스트에 있는 이벤트만, Supabase 기록의 **탐색용 복제본**으로 받는다.
키(`NEXT_PUBLIC_POSTHOG_KEY`)가 없으면 배너·설정·전송이 전부 없고 기존 기능은 그대로다.

## 2. 구조

```
화면 코드 ──► recordFunnelEvent (기존, 한 곳)
              ├─► Supabase analytics_events (원본, 기존 동작 그대로)
              └─► trackProduct (동의·키·제외·중복방지·화이트리스트) ─► PostHog(US)
화면 코드 ──► trackProduct 직접 (신규 이벤트: 로그인/가입 결과, 온보딩 완료, 운동 완료)

AnalyticsProvider(AuthProvider 안) ── 동의/사용자/경로 변화 ──► syncAnalytics
  동의 없음 → posthog-js를 불러오지도 않음
  동의 있음 → 동적 import → init(자동수집 전부 off) → identify(auth.uid())
  철회/제외 → reset → opt_out → 저장 데이터 삭제
```

## 3. 변경 파일

신규
- `src/lib/posthog/config.ts` 키·호스트 검증(US만 허용, 오설정이면 꺼짐)
- `src/lib/posthog/consent.ts` · `consent-actions.ts` · `consent-copy.ts` 동의 상태·동작·문구(초안)
- `src/lib/posthog/events.ts` 이벤트·속성 화이트리스트, `before_send` 최종 필터
- `src/lib/posthog/client.ts` SDK 제어(동적 로드, 식별·reset·철회, 대기열)
- `src/lib/posthog/track.ts` 유일한 전송 입구(중복 방지 포함)
- `src/lib/posthog/exclusion.ts` 관리자/QA 경로·내부 브라우저·내부 계정 제외
- `src/lib/posthog/provider.ts` 제공자 이름 정규화, `workout-event.ts` 운동 완료 이벤트
- `src/components/analytics/analytics-provider.tsx` · `analytics-consent-banner.tsx` · `analytics-consent-setting.tsx`
- 테스트: `src/lib/posthog/*.test.ts` 7개, `src/components/analytics/analytics-consent.test.tsx`
- `docs/analytics/posthog-privacy-review.md`, 이 문서

수정
- `src/app/layout.tsx` (Provider·배너 장착), `src/app/layout.test.tsx` (새 컴포넌트 목)
- `src/lib/analytics-events.ts` (기존 9종을 PostHog로 복제, `provider` 부가 정보)
- `src/app/onboarding/page.tsx` (닉네임 단계 노출, 온보딩 완료, provider)
- `src/app/auth/callback/page.tsx` (연결/로그인 **결과** 기록, 이동 전 대기열 비움)
- `src/app/login/page.tsx` (로그인 실패/성공)
- `src/app/(tabs)/record/page.tsx` (운동 완료 복제)
- `src/app/account/page.tsx` (철회 토글)
- `package.json`, `pnpm-lock.yaml` (posthog-js), `pnpm-workspace.yaml` (core-js 빌드 스크립트 `false`)

**변경하지 않은 것**: `/privacy` 운영 페이지, DB 스키마·마이그레이션, Vercel 환경변수, 유료 기능.

## 4. 이벤트

| 이벤트 | 어디서 | DB(원본) |
|---|---|---|
| `landing_opened` | `FunnelTracker` → `recordFunnelEvent` | `analytics_events` (기존) |
| `onboarding_started` | 온보딩 | 기존 |
| `onboarding_nickname_shown` | 온보딩 | **PostHog 전용** |
| `onboarding_completed` | `upsertMyProfile` 성공 직후 | `profiles.created_at` |
| `identity_link_started` / `identity_link_failed`(이동 전 실패) | 온보딩 | 기존 |
| `identity_link_succeeded` / `identity_link_failed`(복귀 후 실패, 취소 포함) | `/auth/callback` | **PostHog 전용** (아래 §6) |
| `login_succeeded` / `login_failed` | `/login`, `/auth/callback` | **PostHog 전용** |
| `workout_completed` | `finishWorkout` 성공 직후 | `workout_sessions` |
| `challenge_viewed`, `challenge_*_started`, `ai_coach_onboarding_started` | 기존 호출 지점 | 기존 |

7일 재방문·반복 운동은 새 이벤트 없이 PostHog Retention/Funnel 인사이트로 `workout_completed`(`workout_index`)와 `landing_opened`를 쓴다.

## 5. 검증 결과

| 항목 | 결과 |
|---|---|
| TypeScript (`tsc --noEmit`) | 통과 (깨끗한 워크트리). 로컬 작업 폴더에는 git에 없는 `output/` 폴더가 있어 4건 오류가 나지만 이번 변경과 무관하고 CI/Vercel에는 없음 |
| ESLint (`eslint src`) | 0 error, 0 warning. (`pnpm lint` 전체는 git에 없는 `어플 UI 이미지/` 등의 `.cjs` 파일 때문에 실패 — 기존 상태) |
| 단위·통합 테스트 | 전체 246 files / 4192 tests 통과 (1 skipped는 기존, 저장소 우회 설정 사용 — 아래 환경 메모). PostHog 관련 신규 67개 |
| `next build` | 통과 (키 없음 / 로컬 가짜 키 두 가지) |
| 번들 | 키 없을 때 `phc_` 키 문자열 없음. SDK(약 317KB)는 초기 `<script>`에 없고 동의 후에만 로드 |

⚠️ **환경 메모**: 이 PC의 Node 26에서는 jsdom `localStorage`가 가려져, **main 브랜치에서도** 5개 테스트 파일(46개)이 실패한다
(`auth/callback`, `install-gate`, `challenge-invite-storage`, `completion-hero-pick`, `set-timer-storage`).
이 5개 파일은 임시 저장소 우회 설정(커밋 안 함)으로 돌려 모두 통과함을 확인했다 (login/onboarding/account 포함 92개 통과).
Node 22 LTS 등 정상 환경에서 `pnpm test`를 한 번 더 돌릴 것.

### 상태별 전송 검증 (자동 테스트 + 로컬 브라우저)

| 상태 | PostHog 요청 | PostHog 저장 데이터 | Supabase 기록·기존 기능 |
|---|---|---|---|
| 키 없음 | 0 | 0 | 정상 |
| 동의 전 | 0 | 0 (동의 기록 자체도 없음) | 정상 |
| 거부 | 0 | 0 | 정상 |
| 동의 | 허용 이벤트만 | `ph_*` + 식별 표식 | 정상 |
| 철회 | 이후 0 | 삭제됨 (`ph_*`, 식별 표식, 중복 방지 기록) | 정상 |

로컬 브라우저 확인(가짜 수집 서버 + 가짜 Supabase, 외부 통신 없음, 포트 3077):
- 동의 전 PostHog 요청 0, localStorage에는 앱 자체 키(`gnd-acquisition`)만, 배너 표시.
- 동의 후 `$identify`, `$set`(is_anonymous), 재방문 시 `landing_opened`, `onboarding_started`. 같은 사용자 재방문에서 `$identify`는 다시 나가지 않음(식별 표식).
- 이벤트 속성에 이메일·초대 코드·URL·IP 없음. 로그인 실패 시 `login_failed {provider: password, error_code: invalid_credentials}`만 나가고 입력한 이메일·비밀번호는 PostHog로 가지 않음.
- 철회 후 PostHog 요청 0, 저장 데이터 삭제, 앱·DB 기록(`landing_opened`, `onboarding_started`)은 정상 동작.

### Supabase ↔ PostHog 중복·누락 (자동 테스트 `reconcile.test.ts`)

- 동의 사용자: 기존 9종이 DB 1건 : PostHog 1건. 같은 세션 반복 호출도 1 : 1. DB가 23505로 거절해도 PostHog는 영향 없음.
- 동의 안 한 사용자: DB 정상 기록, PostHog 0건 → **PostHog 숫자는 동의한 사용자만의 부분집합이다.** 전체 수치는 /admin(DB)이 정답.
- DB와 PostHog 양쪽에 같은 이벤트가 생기는 경우에도 PostHog에서만 생기는 이벤트(§4 굵은 표시)는 대조 대상이 아니다.
- 동의 전에 발생한 이벤트(예: 첫 `landing_opened`)는 PostHog에 소급 전송하지 않는다. 최초 유입(utm)은 동의 후 사람 속성 `initial_utm_*`로만 전달한다.

## 6. 익명 ↔ 로그인 ID 연결 검증 (코드 기준)

설계 문서의 가정을 그대로 믿지 않고 코드를 다시 읽었다. 결과는 `posthog-privacy-review.md` §7에 있다. 요약:

1. 연결(`linkIdentity`)은 id 유지 → PostHog `distinct_id` 불변. 단, 승격 직후 옛 JWT는 `is_anonymous=true`라서 갱신 뒤 값(`auth/callback`의 `refreshSession` 이후)으로만 사람 속성을 갱신한다.
2. `/login`(`signInWithOAuth`, 비밀번호)은 **기존 계정 id로 들어온다.** 이 기기에 익명 계정이 있었다면 id가 달라진다 → 합치지 않고 reset 후 새로 식별(테스트로 확인).
3. **기존 계측의 빈틈**: `identity_link_failed`는 OAuth 이동 *전* 오류만 잡는다. 실패 대부분(`identity_already_exists`, 취소)은 `/auth/callback?error=…`로 돌아와서 나타나는데 DB 계측이 없다. 이번 브랜치는 PostHog에만 추가했고 DB는 그대로 둠. DB에도 넣을지 결정 필요.

## 7. PostHog 프로젝트

- 프로젝트 `653928`: 조직 `GND`(slug `gnd-yqcm`)의 유일한 프로젝트, 이름 "Default project", 2026-10-09 생성, 이벤트 0건 → GND 전용으로 보이며 **재사용 가능**. (ChatGPT PostHog 플러그인 읽기 전용 조회, 대시보드 1개·인사이트 8개는 내용 미확인)
- 철회 사용자 데이터 삭제는 PostHog에서 사람 삭제를 수동으로 요청받아 처리.

## 8. 프로젝트 키 설정 가이드 (사용자가 직접)

1. PostHog → Project settings → **Project API key**(`phc_`로 시작)를 복사. 개인용 API 키(`phx_`)는 쓰지 않는다.
2. Vercel → Project → Settings → Environment Variables에 추가 (값은 직접 붙여넣기):
   - `NEXT_PUBLIC_POSTHOG_KEY` = `phc_…`
   - (선택) `NEXT_PUBLIC_POSTHOG_HOST`는 **비워 둔다**(기본 `https://us.i.posthog.com`). US 이외 값은 코드가 거부한다.
   - (선택) `NEXT_PUBLIC_ANALYTICS_EXCLUDE_USER_IDS` = 내부 테스트 계정 `auth.uid` 목록(쉼표 구분)
3. **Preview 환경에 먼저** 넣고 확인한 뒤 Production에 넣는다. `NEXT_PUBLIC_*`는 빌드 때 박히므로 값을 바꾸면 **재배포**가 필요하다.
4. 내부 테스트 브라우저는 `?gnd_internal=1`로 한 번 열면 제외된다(`?gnd_internal=0`으로 해제).
5. PostHog 프로젝트 설정에서 데이터 보존 기간(제안 12개월)을 확인하고, 유료 기능(세션 리플레이 등)은 켜지 않는다.

## 9. 운영 배포 전 필수 확인

- [ ] `/privacy` 4번 문단의 "분석 도구를 쓰지 않습니다"를 수정하고 반영 (초안: `posthog-privacy-review.md` §8). **이게 먼저다** — 동의 안내가 가리키는 페이지가 지금은 반대로 말한다.
- [ ] 동의 안내 문구와 국외 이전(미국 PostHog) 고지의 법률 검토, 14세 미만 이용자 처리
- [ ] Node 22 등 정상 환경에서 `pnpm test` 전체 통과 확인 (§5 환경 메모)
- [ ] Vercel **Preview**에 키를 넣고 실제 PostHog 프로젝트에서 이벤트 수신·속성 확인 (이번에는 가짜 서버로만 검증했고 **실제 PostHog 서버로는 한 건도 보내지 않았다**)
- [ ] 실제 기기(iOS 사파리, 설치형 PWA, 카카오 인앱)에서 배너 위치·OAuth 복귀 후 이벤트 확인
- [ ] 광고 차단기 사용자 누락, `identity_link_failed`의 DB 반영 여부 결정
- [ ] PostHog 퍼널 3개(유입→온보딩완료→첫 운동 / 가입 실패 사유 / 7일 리텐션) 생성
