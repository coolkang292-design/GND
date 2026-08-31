# 공개 베타 퍼널 — 계측 가능 범위 전수 조사

**작성** 2026-08-31 · 계획: `docs/superpowers/plans/2026-08-31-public-beta-security-gate.md` §D
**원칙** 이미 DB에 확실한 흔적이 남는 행동은 **새 이벤트를 만들지 않는다.**
같은 사실을 두 곳에 저장해 숫자가 갈리는 구조를 만들지 않는다.

---

## 0. 실제 사용자 여정 — 코드로 확인한 순서

⚠️ **브리프가 가정한 순서와 다르다.** 브리프는 `온보딩 완료 → 계정 연결 → 프로필`이지만
GND는 **계정 연결이 프로필보다 먼저**다. 근거:

```
onboarding/page.tsx:335  mustAskNickname   = providers.length === 0   (카카오·구글이 둘 다 죽었을 때만 참)
onboarding/page.tsx:336  showNicknameStep  = mustAskNickname || linked === true
                         → 닉네임 칸은 카카오·구글을 연결한 뒤에만 뜬다
onboarding/page.tsx:206  await upsertMyProfile({...})   ← 온보딩을 끝내는 유일한 행위
```

```
외부 링크 진입
  → 익명 auth 계정 발급          (auth-provider.tsx:158  signInAnonymously)
  → 온보딩 화면 (카카오·구글 버튼 2개)
  → [버튼을 누른다]
  → OAuth 왕복 후 복귀 = 정식 계정 전환
  → [닉네임 화면]
  → 프로필 생성 = 온보딩 완료     (upsertMyProfile — 이 한 번이 끝이다)
  → 홈 · 또는 초대로 왔으면 /challenge?open=…
  → 첫 운동 시작 → 완료 → 3회 → D1/D7 재운동
```

---

## 1. 단계별 감사표

| 단계 | DB 흔적 | 어떤 테이블/컬럼 | 익명에서도 확인? | linking 후 같은 사람으로 연결? | 지금 /admin에 나오나 | 추가 계측 | 이유 |
|---|---|---|---|---|---|---|---|
| 외부 링크 진입 | **없음** | — (localStorage `gnd-acquisition`만) | — | — | ❌ | ✅ `landing_opened` | 프로필이 생겨야 DB에 쓴다(`crew.ts:44`). 온보딩 미완자는 흔적 0 |
| 익명 auth 생성 | 있음 | `auth.users.created_at` · `is_anonymous` | ✅ | ✅ 같은 행 | ✅ (배포 A MEMBERSHIP) | ❌ | 이미 정확 |
| 온보딩 화면 진입 | **없음** | — | — | — | ❌ | ✅ `onboarding_started` | 화면을 본 사실은 안 남는다 |
| 카카오·구글 **누름** | **없음** | — | — | — | ❌ | ✅ `identity_link_started` | ⚠️ **가장 큰 공백.** 안 누른 사람과 눌렀다 실패한 사람이 구분 안 된다 |
| linking 실패 | **없음** | — | — | — | ❌ | ✅ `identity_link_failed` | "가입 싫어서"와 "카카오 오류"는 고칠 것이 완전히 다르다. **error code만** 저장 |
| 정식 계정 전환 | 있음 | `auth.identities` · `is_anonymous=false` | ✅ | ✅ id 불변 | ✅ | ❌ | 이미 정확 |
| 닉네임 화면 노출 | **없음** | — | — | — | ❌ | ⚠️ 안 만든다 | `identity_link` 성공 = 닉네임 화면 노출이라 파생 가능. 이벤트를 더 만들 값이 없다 |
| **온보딩 완료 = 프로필 생성** | 있음 | `profiles.created_at` | — | ✅ | ✅ | ❌ | ⚠️ **같은 행위다.** `upsertMyProfile` 한 번이 온보딩을 끝낸다. 다른 호출처(`profile-edit-sheet`)는 수정이라 `created_at`을 안 바꾼다 |
| 홈 진입 | 없음 | — | — | — | ❌ | ❌ | 프로필 다음은 자동 라우팅이라 이탈 지점이 아니다 |
| 첫 운동 시작 | 있음 | `workout_sessions.started_at` · `workout_events`(313행) | — | ✅ | ✅ FunnelPanel | ❌ | 이미 정확 |
| 첫 운동 완료 | 있음 | `workout_sessions.status`·`completed_at` | — | ✅ | ✅ | ❌ | 이미 정확 |
| 챌린지 **확인** | **없음** | — | — | — | ❌ | ✅ `challenge_viewed` | 화면을 본 것은 안 남는다. 참가는 남는다 |
| 챌린지 참가 | 있음 | `challenge_participants` | — | ✅ | ✅ ChallengePanel | ❌ | 이미 정확 |
| 3회 운동 | 있음 | `workout_sessions` 집계 | — | ✅ | ✅ `activationFunnel()` | ❌ | 이미 정확 |
| D1/D7 재운동 | 있음 | `workout_sessions` | — | ✅ | ✅ `reworkoutRetention()` | ❌ | 이미 정확 |

### 결론 — 새 이벤트는 **5종**

`landing_opened` · `onboarding_started` · `identity_link_started` ·
`identity_link_failed` · `challenge_viewed`

**만들지 않는 것** (브리프가 후보로 들었으나 기존 DB로 정확히 알 수 있다):
`onboarding_completed`(=`profiles.created_at`) · `identity_link_completed`(=`auth.identities`) ·
`profile_completed` · `first_workout_started`/`_completed`(=`workout_sessions`) ·
`challenge_joined`(=`challenge_participants`) · `three_workouts_completed` · `D7 reworkout`

---

## 2. 익명 → 정식 계정 연결 — **성립한다 (실측)**

GND는 익명 계정에 identity를 **붙여서** 승격시킨다. 계정이 새로 갈리지 않는다.

```
오뎅끼데스까   is_anonymous=false   identities=3   (2026-07-19 생성, 익명으로 시작)
헬스장주주     is_anonymous=false   identities=1
```

→ 이벤트를 `auth.uid()`로만 키잉하면 **새 device fingerprint 없이** 익명 때 기록과
가입 후 행동이 같은 사람으로 이어진다. 광고 식별자를 만들지 않는다.

⚠️ **[미검증] 남은 것 1개**: linking **직후 JWT가 갱신되어 `is_anonymous=false`가 되는지.**
갱신이 늦으면 "UI는 영구인데 DB는 익명"인 구간이 생긴다. D 구현 중 실측한다.

---

## 3. 유입 채널·캠페인

| | 상태 |
|---|---|
| `UTM_KEYS` | `["utm_source","utm_medium","utm_campaign"]` — 이미 파싱한다 (`domain/acquisition.ts:24`) |
| `profiles.acquisition_*` | 6개 컬럼 전부 존재하고 `crew.ts:44`가 쓴다 |
| admin이 campaign을 읽나 | **아니다** — `queries.ts`가 `acquisition_source, acquisition_referrer`만 select |
| 운영 데이터 현황 | `acquisition_campaign` 있는 행 **1개** · `source` **1개**(kakao) |

→ **새 컬럼을 만들지 않는다.** `utm_medium=creator` + `utm_campaign=influencer_a_pilot01`로
인플루언서·파일럿을 구분한다. 표시명은 `CAMPAIGN_LABELS` **코드 상수**로 붙이고,
라벨이 없는 값도 원본 키를 그대로 낸다(`CREW_ORIGIN_LABELS`와 같은 패턴).

⚠️ **유입 단계의 campaign은 `landing_opened` 이벤트에도 실어야 한다** — 프로필이 안 생긴
사람의 캠페인은 `profiles`에 영영 안 남기 때문이다. 두 곳에 생기는 값의 우선순위와
불일치 처리는 계획서 §D-8 ②를 따른다(운영에서 던지지 않고 "불일치 N건"으로 표시).

---

## 4. 지금도 측정할 수 없는 것 (D 이후에도 남는다)

- **링크를 열었지만 앱이 뜨기 전에 이탈** — `landing_opened`는 앱이 떠야 기록된다
- **같은 사람의 여러 기기** — 기기마다 익명 계정이 달라 별개로 센다. 광고 식별자를
  만들지 않기로 했으므로 이건 의도한 한계다
- **linking 승격 시점** — `auth.users.created_at`은 익명으로 처음 연 날에 머문다.
  "언제 정식이 됐나"는 `auth.identities.created_at`이 필요하다 (D에서 쓸지 검토)
- **계측 시작(2026-08-31) 이전 사용자** — 전부 `unknown`. 추측 backfill하지 않는다
