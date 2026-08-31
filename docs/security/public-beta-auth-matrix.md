# 익명 / 정식 계정 권한 매트릭스 (배포 C · 0094)

**작성** 2026-08-31 · 근거: 운영 DB에 익명 토큰으로 REST를 직접 때려 확인
(`scripts/anon-capability-probe.mjs`). **추측이 아니라 실측이다.**

---

## 0. 먼저 알아야 할 것 — `role`로는 판별할 수 없다

```
익명 계정의 JWT:  role = "authenticated" · is_anonymous = true
정식 계정의 JWT:  role = "authenticated" · is_anonymous = false
```

**둘 다 `authenticated`다.** 그래서 판정은 `is_anonymous` 클레임으로만 한다
(`public.is_anonymous_session()`).

### ⚠️⚠️ JWT는 발급 시점에 굳는다 — 최우선 위험이었다

실측(`scripts/anon-upgrade-jwt-check.mjs`, 10/10 통과):

| 시점 | 서버(`auth.users`) | 클라이언트 토큰 |
|---|---|---|
| 익명 가입 직후 | `is_anonymous = true` | `true` |
| **승격 직후 · 갱신 안 함** | **`false`** | **`true`** ← 어긋난다 |
| 갱신 후 | `false` | **`false`** ✅ |

승격 뒤 토큰을 갱신하지 않으면 **방금 카카오로 가입한 사람이 익명으로 오인돼
막힌다.** 그래서 두 겹으로 막았다:

1. `/auth/callback`이 콜백 처리 끝에 **`refreshSession()`을 명시적으로 호출**한다
   (`src/app/auth/callback/page.tsx`). 기존 `if (!session && code)` 분기는 세션이
   이미 있으면 교환을 건너뛰므로, 그 경로에서도 토큰이 새것이 되게 한다
2. 판정이 **fail-open**이다 — 클레임이 없으면(옛 세션) 막지 않는다.
   정식 사용자를 잘못 막는 것이 익명을 놓치는 것보다 나쁘다

---

## 1. 매트릭스

| 기능 | 익명 | 정식 | 공개 베타 정책 | DB 보호 | 클라이언트 | 온보딩 영향 | 판정 근거 |
|---|---|---|---|---|---|---|---|
| 온보딩 · 프로필 생성 | ✅ | ✅ | **유지** | RLS `id = auth.uid()` | — | 없음 | 막으면 아무도 가입 못 한다 |
| 자기 운동 기록 | ✅ | ✅ | **유지** | 컬럼 단위 INSERT 권한 14칸 | — | 없음 | 제품의 본질 |
| 운동 계획·추천 읽기 | ✅ | ✅ | **유지** | RLS 자기 것만 | — | 없음 | 읽기 |
| 계측 `analytics_events` | ✅ INSERT만 | ✅ | **유지** | 0093 RLS `auth.uid() = user_id` | — | 없음 | 익명 퍼널이 계측의 목적 자체다 |
| 초대 링크 **수신** `/invite/[code]` | ✅ | ✅ | **유지** | — | — | 없음 | 바이럴 유입의 입구 |
| `accept_friend_invite` | ✅ | ✅ | **유지** | — | — | 없음 | 0091 신규 가입 흐름 |
| `join_challenge_as_newcomer` | ✅ | ✅ | **유지** | — | — | 없음 | 0091 신규 가입 흐름 |
| 닉네임 검색 | ✅ | ✅ | **유지** | — | — | 없음 | 읽기 |
| 차단 `block_user` | ✅ | ✅ | **유지** | — | — | 없음 | 자기 보호를 막으면 해롭다 |
| 신고 `report_user` | ✅ | ✅ | **유지** | — | — | 없음 | 모더레이션 입구 |
| 버그 신고 `submit_bug_report` | ✅ | ✅ | **유지** | — | — | 없음 | 익명이 겪는 버그가 가장 중요하다 |
| **초대 코드 발행** `issue_my_invite_code` | 🔒 **차단** | ✅ | **정식만** | 0094 가드 | 카드를 아예 안 그린다 | 없음(온보딩에서 안 부름) | 사라질 계정이 남을 끌어들인다 |
| **크루 요청** `send_crew_request` | 🔒 **차단** | ✅ | **정식만** | 0094 가드 | 안내 문구 | 없음 | 상대에게 알림이 남는다 |
| **챌린지 방 생성** `create_challenge_room` | 🔒 **차단** | ✅ | **정식만** | 0094 가드 | 안내 문구 | 없음 | 방장이 사라지면 방이 고아가 된다 |
| 찌르기 · 응원 · 댓글 | 🔒 자동 | ✅ | **손대지 않음** | `is_crew_with` 전제 | — | 없음 | 크루가 있어야 성립 → 이미 제한된다 |
| 관리자 `/admin` | ❌ | ❌(허용목록만) | 유지 | `requireAdmin()` 404 | — | 없음 | 기존 게이트 |

## 2. 왜 이 세 개만인가

실측에서 **익명 토큰으로 REST를 직접 때리면** 프로필을 만들고 위 세 가지를
전부 실행할 수 있었다. UI 버튼을 숨기는 것만으로는 못 막는다.

반대로 **필요 이상으로 넓게 막지 않았다.** 차단·신고·버그신고·검색·초대 수락은
그대로 열려 있다. 찌르기·응원·댓글은 크루 관계가 전제라 손대지 않아도 이미 막힌다 —
그걸 또 막으면 초대로 들어온 신규 사용자가 친구에게 응원조차 못 하게 된다.

## 3. UI와 DB가 같은 말을 하는가

| 화면 | 익명일 때 |
|---|---|
| 홈 크루 카드 | 초대 코드 발급이 실패하면 **카드를 안 그린다** — 눌러서 실패하는 버튼이 없다 |
| 크루 화면 | `permanentAccountMessage("crew")` — "카카오·구글 연결이 필요해요… 기록은 그대로 유지돼요" |
| 챌린지 화면 | `errorMessage()`가 같은 문구로 번역. 단 **익명·무프로필은 `OnboardingGate`가 온보딩으로 보내므로 이 화면에 도달하지 않는다**(2026-08-31 화면 확인) |

문구는 `src/lib/domain/account-gate.ts` **한 곳**에서만 만든다.

## 4. 검증 기록 (2026-08-31)

- `scripts/anon-upgrade-jwt-check.mjs` — 10/10. 승격 시 토큰 갱신 동작
- `scripts/anon-capability-probe.mjs` — 익명 차단 3건 · 승격 후 3건 모두 복구 · 초대 흐름 유지
- 화면: `/invite/GND-7FDVC` → 온보딩 이동 + `gnd-pending-invite` 보관 ✅
- 화면: `/challenge?join=GND-D9536` → 온보딩 이동 + `gnd-pending-challenge-invite` 보관 ✅
- `crew-link-check` 53/53 · `challenge-invite-link-check` 27/27

## 5. 이번 범위 밖 (배포 B로 넘김)

**기존 테이블 12개에 `authenticated`가 TRUNCATE 권한을 갖고 있다.**
TRUNCATE는 RLS를 우회한다. PostgREST에 TRUNCATE 동사가 없어 공개 API로는
도달할 수 없어 실효 위험은 낮지만, 최소 권한이 아니다.
**C에서 섞어 고치지 않았다** — REVOKE는 파괴적 변경이라 별도 감사가 필요하다.
