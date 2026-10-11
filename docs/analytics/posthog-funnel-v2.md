# PostHog 퍼널 계측 v2 — P0-2 흐름 연결·유입 구분·중복 방지

작성 2026-10-11 · 브랜치 `feat/posthog-funnel-v2` (대상 `main`, Draft PR) · **병합·배포 안 함**

> 원본은 Supabase(`analytics_events`·`profiles`·`workout_sessions`)다. PostHog는 **동의한 사용자**의
> 탐색용 복제본이다. 두 숫자가 다르면 DB가 맞다. 새 테이블·마이그레이션은 없다.

목표 퍼널(Instagram·YouTube·Threads 유입):

```
landing_opened → start_clicked → onboarding_completed → workout_started(is_first) → workout_completed(is_first) → identity_link_succeeded
```

---

## 1. 브랜치 이력 — 기존 `feat/posthog-funnel`에서 무엇을 가져오고 바꿨나

최신 `origin/main`(635e8cf, P0-1·P0-2·P0-3 반영)에서 새로 만들고 기존 2커밋을 cherry-pick했다.
기존 브랜치(`feat/posthog-funnel`, 86a4da3·fcd52a2)는 **건드리지 않았다.**

| 커밋 | 내용 | 충돌 |
|---|---|---|
| 7300a9c ← 86a4da3 | SDK·사전 동의·화이트리스트·테스트 (34파일) | `login/page.tsx`·`onboarding/page.tsx`의 **import 줄만** 충돌. main의 `useUsableProviders`(P0-3)와 PostHog import를 **둘 다** 남겼다. 본문은 자동 병합 |
| b80e3ff ← fcd52a2 | v1 구현 보고서 | 없음 |
| (이번 커밋) | v2 변경 — 아래 | — |

**그대로 유지한 것**: 동의 전 SDK 미로드(동적 import), 화이트리스트+`before_send` 이중 필터, IP·GeoIP·URL·referrer 제거,
autocapture·페이지뷰·리플레이·히트맵·플래그·설문 전부 끔, `distinct_id = auth.uid`, A→B 전환 시 reset(합치지 않음),
`/account` 철회, `login_*`·`identity_link_succeeded/failed`(콜백)·`workout_completed`·`onboarding_completed`.

**v2에서 바꾼 것**

| # | 무엇 | 왜 |
|---|---|---|
| 1 | `start_clicked`·`workout_started` 신규 | 퍼널 2·4단계가 없었다 |
| 2 | `onboarding_nickname_shown`이 P0-2 "바로 시작"에서도 발생 | v1 조건(`providers.length===0 \|\| linked`)은 바로 시작 경로를 빠뜨렸다 — **버그였다**(테스트로 고정) |
| 3 | 기록 지키기 카드(`ProtectRecordsCard`)에 `identity_link_started/failed` + `location` | P0-2 카드의 연결 시도가 PostHog에 안 남았다. 성공은 기존 콜백이 이미 기록 |
| 4 | 공통 속성 `utm_source`(5채널)·`traffic_type`·`is_internal` | 유입·신규/재방문·QA 구분 |
| 5 | 내부(QA) 브라우저: 차단 → **보내고 `is_internal=true` 표시** | 사용자 결정(2026-10-11) |
| 6 | 봇·자동화 차단 | 사용자 결정(2026-10-11) |
| 7 | 첫 운동 이벤트는 **사용자당 1회** | 첫 운동을 지우고 다시 하면 `is_first=true`가 두 번 나갔다 |
| 8 | **로그인 확인 중(`loading`)을 로그아웃으로 오인하던 버그 수정** | 로컬 브라우저에서 발견: 새로고침마다 `reset()`→`$identify` 재전송, **세션 id가 매번 새로 생겨 세션 수가 부풀었다** |
| 9 | 같은 사람 속성 `$set` 반복 전송 제거 | 로컬 브라우저에서 발견: 새로고침마다 `$set` 1~2건 |
| 10 | 동의 순간 `landing_opened`·`onboarding_started` 재시도 | 첫 화면에서 **나중에** 동의하면 이 둘이 PostHog에 영영 안 남았다 → PostHog 퍼널은 1단계 없는 사람을 통째로 뺀다. DB는 기존 중복 방지로 추가 기록 0 |

---

## 2. 이벤트 표

모든 이벤트에 공통 속성 `utm_source`·`traffic_type`·`is_internal`이 붙는다(§3).
줄 번호는 이 브랜치 HEAD 기준.

| 이벤트 | 발생 위치 | 속성 | Supabase 원본 대응 |
|---|---|---|---|
| `landing_opened` | `src/components/funnel-tracker.tsx:36` → `src/lib/analytics-events.ts` `mirrorToPosthog` | `utm_source`·`utm_medium`·`utm_campaign`·`referrer_host`·`landing_path` | `analytics_events(landing_opened)` + `profiles.acquisition_*` |
| `start_clicked` *(신규)* | 온보딩 바로 시작 `src/app/onboarding/page.tsx:537` · 카카오/구글 `src/app/onboarding/page.tsx:261` · `/login` 가입 링크 `src/app/login/page.tsx:301` | `location` ∈ `onboarding_try_first`·`onboarding_kakao`·`onboarding_google`·`login_signup` | **없음**(PostHog 전용). 카카오/구글은 `analytics_events(identity_link_started)`로 근사 가능 |
| `onboarding_started` | `src/app/onboarding/page.tsx:182` | — | `analytics_events(onboarding_started)` |
| `onboarding_nickname_shown` | `src/app/onboarding/page.tsx:198` | — | 없음(파생: 연결 성공 또는 바로 시작) |
| `onboarding_completed` | `src/app/onboarding/page.tsx:304` (`upsertMyProfile` 성공 뒤) | `has_invite` | `profiles.created_at` |
| `identity_link_started` | 온보딩 `src/app/onboarding/page.tsx:265` · 기록 지키기 `src/components/record/protect-records-card.tsx:60` | `provider`, `location` ∈ `onboarding`·`protect_records` | `analytics_events(identity_link_started)` — **온보딩만**. 기록 지키기는 PostHog 전용(콜백과 같은 규칙: DB 기록 동작은 안 바꿈) |
| `identity_link_succeeded` | `src/app/auth/callback/page.tsx:84` | `provider` | `auth.identities` / `auth.users.is_anonymous=false` |
| `identity_link_failed` | 온보딩 `src/app/onboarding/page.tsx:277` · 기록 지키기 `src/components/record/protect-records-card.tsx:67` · 콜백 `src/app/auth/callback/page.tsx:71` | `provider`, `location`, `error_code`(분류 코드) | `analytics_events(identity_link_failed)` — 온보딩 이동 전 오류만 |
| `login_succeeded` | `src/app/login/page.tsx:129` · `src/app/auth/callback/page.tsx:92` | `provider` | 없음(Supabase Auth 로그) |
| `login_failed` | `src/app/login/page.tsx:89`·`:118` · `src/app/auth/callback/page.tsx:73` | `provider`, `error_code` | 없음 |
| `workout_started` *(신규)* | `src/app/(tabs)/record/page.tsx:2774` → `src/lib/posthog/workout-event.ts` `reportWorkoutStarted` | `is_first`, `workout_index`(=완료 수+1) | `workout_sessions.started_at` |
| `workout_completed` | `src/app/(tabs)/record/page.tsx:2869` → `reportWorkoutCompleted` | `is_first`, `workout_index`, `exercise_count`, `duration_bucket`, `has_photo` | `workout_sessions` `status='completed'`·`completed_at` |
| `challenge_*`·`ai_coach_onboarding_started` | v1 그대로 | — | `analytics_events` |

`workout_started.workout_index`와 그 운동을 끝냈을 때의 `workout_completed.workout_index`는 같은 숫자다(테스트로 고정) — 시작→완료 이탈을 짝지어 볼 수 있다.

---

## 3. 유입·사용자 구분

| 속성 | 위치 | 값 | 규칙 |
|---|---|---|---|
| `utm_source` (이벤트) / `initial_utm_source` (사람, `$set_once`) | `src/lib/posthog/events.ts` `normalizeUtmSource` | `instagram`·`youtube`·`threads`·`tiktok`·`other` | `ig`(정확히)·`ig_*`·`*instagram*` → instagram, `yt`·`*youtube*`·`youtu.be` → youtube, `*threads*`, `*tiktok*`, 그 밖 문자열 → `other`, 비어 있으면 **속성 없음**(직접 유입). **원문은 보내지 않는다** — 이메일 모양도 `other` |
| `traffic_type` (이벤트) | `src/lib/posthog/context.ts` `trafficType` | `new`·`returning` | 첫 접촉 기록(`gnd-acquisition.capturedAt`, 기존 기능)이 30분 안이면 `new`. 정한 값은 **탭 세션 동안 고정**(sessionStorage) — 첫 방문 중 OAuth 왕복으로 페이지가 새로 떠도 안 뒤집힌다. 동의 후에만 계산·저장, 철회 시 삭제 |
| `is_internal` (이벤트+사람) | `context.ts` / `client.ts` `personProps` | true/false | `?gnd_internal=1`(켜기)·`=0`(끄기) — v1 로직 그대로, 차단만 표시로 바꿈 |
| 봇 | `src/lib/posthog/exclusion.ts` `isLikelyBot` | (전송 안 함) | `navigator.webdriver`, `headless`, 알려진 크롤러(구글·빙·네이버 Yeti·Daumoa·페이스북·카카오 스크랩·GPTBot·ClaudeBot 등), `curl/`·`python-requests` 등. 짧은 `bot`은 단어 경계로만(`CUBOT` 휴대폰 오인 방지). 인스타·스레드(Barcelona)·카톡·네이버·유튜브 인앱 UA는 사람(테스트 고정). **UA 원문은 전송하지 않는다** |

**봇을 표시가 아니라 차단으로 한 근거**(사용자 승인): 전송은 동의 버튼을 눌러야 시작되므로 일반 크롤러는 원래 0건이다.
남는 것은 Playwright 같은 자동화(우리 QA 포함)인데, 운영 숫자에 섞일 이유가 없다. posthog-js에도 자체 봇 필터가 있지만,
우리 차단은 그보다 앞에서 **SDK를 아예 불러오지 않는다**(테스트가 이 차이를 구분한다 — §5).

---

## 4. 동의 상태별 전송 결과

| 상태 | 자동 테스트 (진짜 posthog-js, `wire.test.ts`) | 로컬 브라우저 (개발 서버 + 가짜 수집 서버) | 운영 빌드 (`next start`) |
|---|---|---|---|
| 동의 전 | **0건** | **0건** (바로 시작 클릭 후에도) · PostHog 저장소·쿠키 0 | **0건** · SDK 청크 미로드 |
| 거부 | **0건** | **0건** | — |
| 동의 | **6건** (이벤트 5 + `$identify`) | 이벤트 도착 (§7) | SDK 청크 로드 · 요청 발생 |
| 철회 | 이후 **0건** | 이후 **0건** · `ph_*`·`gnd:ph:*` 전부 삭제 | — |
| 봇(webdriver) + 동의 | **0건** · SDK 미로드 | — | — |

자동 테스트 실측 로그: `{"unset":0,"denied":0,"granted":6,"withdrawn":0}`.

⚠️ 개발 모드(Turbopack)는 동의 전에도 `posthog-js` 청크 **파일**을 미리 받는다(실행은 안 됨 — `window.posthog` 없음, 저장소·요청 0).
운영 빌드에서는 동의 전 그 청크를 받지 않는 것을 확인했다.

---

## 5. 중복 검증 — PostHog 숫자가 부풀지 않는 근거

| 시나리오 | 결과 | 증거 |
|---|---|---|
| 익명 → 바로 시작 → 첫 운동 → 기록 지키기(`linkIdentity`) | UID 불변 → **사람 1명**, reset 0회, `identify` 1회, 승격은 `$set is_anonymous=false`만 | `funnel-v2.test.ts` "익명 → 바로 시작 …" — 6개 이벤트의 distinct_id 집합이 `[ANON]` 하나 |
| `/login`으로 다른 계정 | `identify(A)` → `reset` → `identify(B)`. alias/merge 호출 없음. B 이름으로 나간 것은 B의 이벤트뿐 | `funnel-v2.test.ts` "/login으로 다른 계정 …", `client.test.ts` A→B |
| 새로고침·OAuth 복귀 | `$identify`·`$set` 재전송 0, 세션 id 유지 | `analytics-provider.test.tsx`, `client.test.ts` "같은 사용자 재로드 …" + 로컬 브라우저(수정 전 재현 → 수정 후 사라짐) |
| 첫 운동 시작을 여러 번 / 지우고 다시 | `workout_started(is_first=true)` 1회 | `provider-workout.test.ts` |
| 첫 운동 완료를 지우고 다시 | `workout_completed(is_first=true)` 1회 | `provider-workout.test.ts` |
| 같은 세션 재시도·재생(`idempotentReplay`) | `workout_completed` 세션당 1회 | `provider-workout.test.ts` |
| `onboarding_completed` 반복 호출 | 1회 (사용자 키, persistent) | `funnel-v2.test.ts`, 온보딩 화면 테스트 |
| 동의 순간 진입 사실 재시도 | PostHog 1회(탭 세션), DB 추가 기록 0 | `funnel-tracker.test.tsx`, `reconcile.test.ts`, 로컬 브라우저 `analytics_events` 요청이 동의 전 2건·동의 후 0건 |

**사용자 수**: PostHog 사람 = `auth.uid` (`person_profiles: identified_only`, 식별 전 이벤트는 큐에 잡았다가 식별 뒤 전송).
익명 → 연결은 같은 UID라 한 사람이다. 한계: 같은 사람이 브라우저 저장소를 지우거나 다른 기기에서 **새 익명 계정**으로 시작하면
Supabase에서도 다른 계정이므로 PostHog에서도 다른 사람이다(DB와 같은 기준 — 부풀림이 아니라 정의가 같다).

**운동 완료 건수**: 세션 id 기준 persistent 중복 방지 + 첫 운동 사용자 키. 동의 이전·철회 중 운동은 PostHog에 없으므로
PostHog 건수 ≤ `workout_sessions` 건수가 정상이다.

---

## 6. PostHog 설정 (사용자가 할 일)

### 6-1. 내부(QA) 사용자 빼기 — "Filter out internal and test users"

1. PostHog → **Settings → Project → Product analytics → Filter out internal and test users**
2. **Add filter** → *Person properties* → `is_internal` → 연산자 **"is not"** → 값 `true`
   - 사람 속성 대신 이벤트 속성으로 하려면 *Event properties* → `is_internal` → **is not** → `true` (모든 제품 이벤트에 실려 있다)
3. **"Enable this filter on all new insights"** 켜기
4. 기존 인사이트는 각 화면의 **"Filter out internal and test users"** 토글을 켠다
5. 확인: QA 브라우저에서 `https://<Preview 주소>/onboarding?gnd_internal=1` → 동의 → 이벤트 발생 → **Activity**에서 `is_internal=true`로 보이고, 토글을 켠 인사이트에서는 빠지는지 본다. QA가 끝나면 `?gnd_internal=0`

`is_internal`은 식별할 때 항상 true/false로 넣으므로 "속성 없음" 사람이 생기지 않는다.

### 6-2. 퍼널 인사이트 예시

- 단계: `landing_opened` → `start_clicked` → `onboarding_completed` → `workout_started` (`is_first = true`) → `workout_completed` (`is_first = true`) → `identity_link_succeeded`
- Breakdown: 사람 `initial_utm_source` 또는 이벤트 `utm_source`
- Filter: `traffic_type = new`(신규만), 내부 필터 켬
- 집계 기준: Unique users. 전환 기간 7일 권장

⚠️ **해석 주의**: 동의 전 클릭은 PostHog에 없다. 첫 화면에서 배너보다 먼저 "바로 시작"을 누른 사람은 `start_clicked`가 비어
2단계에서 빠진 것처럼 보인다. **절대 전환율은 Supabase가 원본**이고, PostHog는 동의자 안에서의 상대적 이탈 구간을 보는 용도다.

---

## 7. 로컬 브라우저 검증 기록 (2026-10-11)

- 개발 서버: `next dev` (Node 22.23.3) `http://localhost:3011`, 뷰포트 375×812. 운영 빌드: `next start` `http://localhost:3012`
- 키: 가짜 `phc_localfake…`, 호스트 `http://127.0.0.1:8099`(로컬 가짜 수집 서버 — 받은 요청을 파일에 기록). **실제 PostHog로는 아무것도 보내지 않았다**
- Supabase는 `.env.local`(운영) — 익명 계정 생성·`analytics_events` 기록은 기존 동작. **프로필·운동 기록은 만들지 않았다**(닉네임 저장·운동 시작은 누르지 않음)

| 조작 | 기대 | 결과 |
|---|---|---|
| 동의 전 `/onboarding`에서 "닉네임만 정하고 바로 시작" | 요청 0, 닉네임 칸 표시 | ✅ 요청 0 · 닉네임 칸 보임 |
| 배너 "거부" → 다시 바로 시작 | 요청 0 | ✅ 0 |
| `/account` 동의 → 바로 시작 | `start_clicked(onboarding_try_first)`·`onboarding_nickname_shown` | ✅ 둘 다, 공통 속성 포함, URL·이메일 없음 |
| 새로고침 2회 | `$identify` 재전송 없음 | ❌ 재전송·새 세션 → **버그 #8 수정 후 ✅** |
| 새로고침 | `$set` 반복 없음 | ❌ 1~2건 → **#9 수정 후 ✅** |
| `/login?gnd_internal=1` → "회원가입하기" | `start_clicked(login_signup, is_internal=true)`, 사람 `is_internal=true` | ✅ |
| `/account` 철회 → 바로 시작 | 이후 요청 0, PostHog 저장소 삭제 | ✅ 15→15건, `ph_*`·`gnd:ph:*` 0 |
| 동의 후 "카카오로 시작하기"(카카오 로그인 화면으로 이동, 로그인 안 함) | 떠나기 전 이벤트 유실 없음 | ✅ `start_clicked(onboarding_kakao)`·`identity_link_started(location=onboarding)` 도착 |
| 운영 빌드, 저장소 비운 새 방문 `?utm_source=ig` → 배너 "동의"(새로고침 없음) | `landing_opened`·`onboarding_started` 도착, `ig`→`instagram` | ❌(#10 전에는 원리상 누락) → **수정 후 ✅** · 원문 `ig` 0건 · DB 추가 쓰기 0 |
| 운영 빌드 동의 전/후 SDK 청크 | 전: 미로드 / 후: 로드 | ✅ |

참고: 브라우저 패널이 창 뒤에 있어 일부 화면(`/account` 토글, 배너 버튼)은 화면 그리기가 멈춰 **DOM click 이벤트**로 눌렀다.
나머지 버튼은 실제 클릭이다.

**브라우저 [미검증]** (자동 테스트로만 증명):
- `/login` 이메일 로그인으로 다른 계정 전환 — 픽스처 비밀번호(`.env.local`) 읽기 권한이 거절돼 시도하지 않았다
- `workout_started`·`workout_completed`·기록 지키기 카드 클릭 — 운영 DB에 프로필·운동 기록을 만들어야 해서 하지 않았다
- 실제 카카오·구글 연결 완료 후 `identity_link_succeeded` — 외부 계정 로그인이 필요

---

## 8. 켜지 않은 기능 — 제안(코드 아님)

autocapture·페이지뷰 자동수집·세션 리플레이·히트맵은 **꺼진 그대로**다(`client.ts` `baseConfig`, 테스트 고정). 켜려면:

- **페이지뷰**: 지금 퍼널에는 불필요. 켜면 `$current_url`이 생기는데 `before_send`가 버리므로 경로 마스킹 규칙(`landing_path`와 같은 `:code` 치환)을 먼저 만들어야 한다
- **세션 리플레이**: 닉네임·운동 메모·사진이 화면에 그대로 보인다. 전 입력 마스킹 + 처리방침 갱신 + 별도 동의 문구가 선행돼야 한다
- **autocapture·히트맵**: 버튼 텍스트·요소 속성이 실린다. 화이트리스트 모델과 충돌 — 필요한 클릭은 `start_clicked`처럼 이름 붙은 이벤트로 추가하는 편이 맞다

---

## 9. 남은 일

**사용자가 해야 할 것**
1. Vercel **Preview** 환경에 `NEXT_PUBLIC_POSTHOG_KEY`(프로젝트 653928의 `phc_` 키) 입력 — 에이전트는 환경변수를 건드리지 않았다. 호스트는 비워 두면 US Cloud
2. `/privacy` 문구 승인 — 초안: `docs/analytics/posthog-privacy-review.md` §8(v2 수집 항목 반영). **운영 페이지는 수정하지 않았다**
3. PostHog 내부 사용자 필터 설정(§6-1)
4. Preview에서 QA: `?gnd_internal=1`로 동의 → 위 퍼널 이벤트가 Activity에 뜨는지

**미검증·후속 제안**
- §7의 브라우저 [미검증] 3건
- 기록 지키기의 `identity_link_started`를 **DB**에도 남길지 결정(지금은 PostHog 전용 — Supabase 퍼널에서는 이 시도가 안 보인다)
- 동의 전 클릭 손실(§6-2 주의)은 사전 동의 모델의 본질적 한계 — 해결하려면 동의 전 클릭을 기기에 잠깐 들고 있다가 동의 시 보내는 방식인데, 동의 전 저장이 생기므로 **법적 검토가 먼저**다(코드로 하지 않았다)
