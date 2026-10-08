# PostHog 도입 — 개인정보 검토 (코드 작성 전 정리)

작성 2026-10-09 · 브랜치 `feat/posthog-funnel`

> **이 문서는 법적 검토가 끝난 문서가 아니다.** 사실관계(무엇을 보내는가)는 코드 기준으로 적었고,
> 법적 판단이 필요한 항목은 "미해결"로 표시했다. 운영 배포 전에 개인정보 담당자·법률 자문 확인이 필요하다.

## 1. 원칙

- **원본은 Supabase.** 온보딩 완료, 첫 운동, 재운동의 정답은 `profiles`, `workout_sessions` 등 기존 DB다. PostHog는 동의한 사용자에 한해 퍼널·리텐션을 탐색하는 보조 도구다. 두 숫자가 다르면 DB가 맞다.
- **동의 전에는 아무것도 하지 않는다.** 동의 전에는 `posthog-js`를 내려받지도 않는다(동적 import). 따라서 동의 전에는 네트워크 요청, 쿠키, localStorage 기록이 PostHog 쪽에서 0이다.
- **동의가 없어도 앱은 그대로 동작한다.** 로그인, 운동 기록, 챌린지는 PostHog 상태와 무관하다. 모든 PostHog 호출은 예외를 삼킨다.
- 프로젝트 키(`NEXT_PUBLIC_POSTHOG_KEY`)가 없으면 동의 배너·설정 항목도 그려지지 않고 전송도 없다.

## 2. 실제로 PostHog에 보내는 데이터

### 2-1. 이벤트 (동의한 사용자만, 화이트리스트 방식)

| 이벤트 | 속성 |
|---|---|
| `landing_opened` | `utm_source`, `utm_medium`, `utm_campaign`, `referrer_host`(호스트만), `landing_path`(초대 코드 마스킹) |
| `onboarding_started` / `onboarding_nickname_shown` | 없음 |
| `onboarding_completed` | `has_invite`(true/false) |
| `identity_link_started` | `provider`(kakao/google) |
| `identity_link_succeeded` | `provider` |
| `identity_link_failed` | `provider`, `error_code`(분류 코드) |
| `login_succeeded` | `provider`(kakao/google/password) |
| `login_failed` | `provider`, `error_code` |
| `workout_completed` | `is_first`, `workout_index`(n번째), `exercise_count`, `duration_bucket`(구간), `has_photo` |
| `challenge_viewed`, `challenge_create_started`, `challenge_share_started`, `challenge_goal_started`, `ai_coach_onboarding_started` | 없음 |

### 2-2. 식별자와 사람 속성

- `distinct_id`: Supabase `auth.uid()`(무작위 UUID). 로그인 전/세션 없음 구간에는 PostHog가 만든 무작위 UUID.
- 사람 속성: `is_anonymous`(bool), 최초 유입 `initial_utm_source/medium/campaign`(`$set_once`).

### 2-3. SDK가 자동으로 붙이는 값 (허용 목록으로 걸러냄)

유지: 브라우저·OS 종류와 버전, 기기 유형, 화면·뷰포트 크기, 시간대, 세션 ID, 라이브러리 버전.
**제거/변환**: 전체 URL과 쿼리스트링(경로 모양만 남김, 초대 코드는 `:code`로 마스킹), referrer 전체 URL(호스트만), `$initial_*` 계열, IP(`ip: false`, GeoIP 비활성).

### 2-4. 보내지 않는 것 (코드로 차단)

이메일, 닉네임, 이름, 프로필 사진, 운동 사진, 운동 종목명·무게·메모·캡션, 초대 코드 원문, 챌린지 이름·ID, 검색어, 토큰, 자유 텍스트. 화이트리스트에 없는 속성 키는 전부 버리고, 이메일·JWT 모양의 값은 허용된 키에서도 버린다(단위 테스트로 검증).

### 2-5. 켜지 않는 기능

autocapture, 페이지뷰·페이지이탈 자동 수집, 세션 리플레이, 히트맵, 설문, 웹 실험, 대화(conversations), 제품 투어, 에러 자동 수집, dead click/rage click, 피처 플래그 호출.

## 3. 수집 목적

가입 퍼널(유입, 로그인·가입 성공/실패, 온보딩 이탈), 첫 운동 완료, 7일 재방문·반복 운동을 파악해 서비스 개선과 오류 원인 파악에 쓴다. 광고, 프로파일링, 제3자 제공은 하지 않는다.

## 4. 보유 기간

**제안: PostHog 프로젝트의 데이터 보존 기간 12개월.** 무료 플랜 기본값이 확인되면 그에 맞춘다(유료 기능은 켜지 않는다). 동의를 철회한 사용자의 기존 데이터는 삭제 요청 시 `distinct_id` 기준으로 PostHog에서 삭제한다.
*미해결: 프로젝트 설정 화면에서 실제 보존 기간 확인.*

## 5. 국외 이전 (미국)

| 항목 | 내용 |
|---|---|
| 이전받는 자 | PostHog Inc. (미국) |
| 이전 국가 / 방법 | 미국 / US Cloud(us.i.posthog.com)로 네트워크 전송 |
| 이전 항목 | 위 2-1, 2-2, 2-3의 항목 |
| 이전 목적 | 서비스 이용 행태 분석 |
| 보유·이용 기간 | 위 4항 |
| 거부 방법과 결과 | 동의를 거부하거나 철회해도 서비스 이용에 제한이 없다 |

*미해결: 처리위탁·보관 목적의 국외 이전을 방침 공개로 갈음할 수 있는지, 별도 동의가 필요한지는 법률 확인 필요. 이번 설계는 사전 동의(옵트인)로 보수적으로 처리한다.*

## 6. 동의와 철회 절차

- **동의**: 키가 설정된 환경에서 첫 방문 시 화면 하단 안내가 뜬다. "동의"와 "거부"는 같은 비중의 버튼이다. 선택 전에는 기본값이 "수집 안 함"이다.
- **저장**: 선택은 이 기기의 localStorage(`gnd-analytics-consent`)에 `{버전, 상태, 시각}`으로 저장된다. 안내 문구 버전이 바뀌면 다시 묻는다.
- **철회**: `/account`의 "분석 허용" 설정에서 언제든 끈다. 끄는 즉시 `posthog.opt_out_capturing()`, `reset()`, PostHog가 만든 저장 데이터(`ph_*`) 삭제를 수행하고 이후 전송이 없다.
- 거부/철회 상태에서도 Supabase 자체 계측(`analytics_events`)은 기존 처리방침 범위에서 그대로 동작한다. (이 부분은 이번 변경 대상이 아니다.)
- *미해결: 다른 기기의 동의는 기기별로 따로 받는다(계정에 동의 기록을 저장하려면 DB 변경이 필요해 이번에는 하지 않음).*

## 7. 익명 -> 로그인 ID 연결 (코드 검증 결과)

기존 설계 문서의 가정("`auth.uid()`로 키잉하면 가입 전후가 이어진다")을 코드로 다시 확인했다.

| 경로 | 코드 | 결과 |
|---|---|---|
| 온보딩/`/account`에서 카카오·구글 연결 | `identity.ts` `linkIdentity` | **같은 user id 유지.** 익명 계정이 제자리에서 승격된다. `distinct_id`가 안 바뀐다. |
| 승격 직후 JWT | `auth/callback/page.tsx`가 `refreshSession()` 호출(0094) | 갱신 전 토큰은 `is_anonymous=true`를 들고 있다. 그래서 `is_anonymous` 사람 속성은 세션 `user.is_anonymous`가 아니라 **콜백 갱신 후** 값으로만 `$set` 한다. |
| `/login` (OAuth, 이메일/비밀번호) | `signInWithOAuth`, `signInWithPassword` | **기존 계정 B의 id로 들어온다.** 이 기기에 익명 계정 A가 남아 있었다면 A와 B는 **다른 id**다(예: 연결이 `identity_already_exists`로 실패한 뒤 로그인). A의 이벤트를 B로 합치지 않는다 — 같은 사람이라는 증거가 앱에 없고, 잘못 합치면 되돌릴 수 없다. |
| 세션 중 id 변경/로그아웃 | `AuthProvider.onAuthStateChange` | userId가 A->B 또는 null로 바뀌면 PostHog를 `reset()` 후 새 id로 `identify`. 이전 id가 새 id에 붙지 않는다. |
| 같은 계정, 다른 기기 | 같은 `auth.uid()` | PostHog에서 한 사람으로 합쳐진다. |

**남는 한계**: 신규 기기에서 로그인한 사용자의 로그인 전 이벤트(`login_failed` 등)는 익명 id에 남고, 로그인 직후 `identify`가 PostHog의 익명 id를 그 사용자에게 연결한다(PostHog 기본 동작). 이미 identified 상태였던 A를 reset한 뒤이므로 A의 기록은 섞이지 않는다.

**기존 문서와 다른 점 1건**: 기존 `identity_link_failed`는 OAuth 이동 *전* 오류만 잡는다. 실제 실패인 `identity_already_exists`는 제공자에서 `/auth/callback?error=...`로 돌아올 때 나타나는데 현재 계측이 없다. 이번 브랜치에서 PostHog에는 그 지점에 `identity_link_failed`를 추가했고, DB(`analytics_events`)는 기존 동작을 그대로 두었다. DB에도 넣을지는 별도 결정이 필요하다.

## 8. 처리방침 수정 초안 (운영 페이지는 수정하지 않음)

기존 문구(`/privacy` 4번 말미): "분석 도구(구글 애널리틱스 등)나 광고 추적 도구는 쓰지 않습니다."

**초안 (법적 검토 전):**

> **이용 분석 도구 (선택)**
> GND는 서비스 개선을 위해 PostHog(PostHog Inc., 미국)를 **사용자가 동의한 경우에만** 사용합니다.
>
> - **수집 항목**: 이름 없는 이용자 식별 번호, 방문 경로(광고·링크 출처 구분 값), 로그인·가입 성공 또는 실패와 분류 코드, 온보딩 진행 단계, 운동 완료 여부와 횟수·종목 수·시간대(구간), 브라우저·기기 종류와 화면 크기, 시간대.
> - **수집하지 않는 것**: 이메일, 닉네임, 사진, 운동 메모, 초대 코드, 정확한 접속 주소, IP 주소 저장.
> - **목적**: 가입·운동 기록 과정에서 이탈하는 구간을 찾아 서비스를 개선합니다. 광고나 제3자 제공에 쓰지 않습니다.
> - **보유 기간**: 12개월 (검토 후 확정)
> - **국외 이전**: 미국 PostHog 서버로 전송·보관됩니다. 동의를 거부해도 서비스 이용에는 제한이 없습니다.
> - **동의 철회**: [계정] 화면의 "분석 허용"을 끄면 즉시 수집이 중단됩니다. 이미 전송된 데이터의 삭제는 개인정보 문의 창구로 요청해 주세요.
>
> 위 분석 도구를 제외하고 광고 추적 도구는 쓰지 않습니다. (GND가 직접 기록하는 유입 경로는 기존 1번에 적은 범위와 같습니다.)

## 9. 동의 안내 문구 초안 (화면 하단)

> **이용 분석에 도움을 주실래요?**
> 가입·운동 기록 중 어디서 막히는지 알아보려고 이름 없는 이용 기록(방문 경로, 가입·운동 완료 여부 등)을 미국의 분석 서비스(PostHog)로 보냅니다. 이메일·닉네임·사진은 보내지 않아요. 거부해도 앱은 똑같이 쓸 수 있고, 계정 화면에서 언제든 끌 수 있어요.
> [동의] [거부]  · 자세히 보기 (/privacy)

## 10. 미해결 항목

1. 처리방침 운영 페이지 수정(초안만 있음). 이 수정이 반영되기 전에는 배포하지 않는다. 동의 안내가 가리키는 `/privacy`가 지금은 "분석 도구 미사용"이라고 말한다.
2. 국외 이전 고지·동의 방식의 법률 확인, 14세 미만 이용자 처리.
3. PostHog 프로젝트 `653928`이 GND 전용인지 확인(로그인 필요), 데이터 보존 기간 설정.
4. 동의 철회 시 이미 보낸 데이터의 삭제 절차(PostHog 사람 삭제를 수동으로 요청받는 방식) 운영 방안.
5. 계정 단위 동의 저장(DB 변경 필요)은 이번 범위 밖.
6. 키/호스트 환경변수 추가는 Vercel 승인 후에 한다.
