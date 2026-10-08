# GND 카카오·구글 OAuth 온보딩 장애 진단 및 QA 실행 계획

- 작성일: 2026-10-08 (KST)
- 상태: **계획 등록 / 테스트 미실행 / 코드·DB·배포 미변경**
- 대상: GND 운영 앱 (대표 도메인 `https://gnd-one.vercel.app`)
- GitHub: `coolkang292-design/GND`
- 범위: SNS(YouTube Shorts·Instagram) → 랜딩 → 익명 세션 → 카카오/구글 신원 연결 → OAuth 콜백 → 닉네임 저장/프로필 생성 → 홈/초대 챌린지
- 실행 담당: 개발 에이전트(정적·자동화 검사), QA 담당(실기기 OAuth)
- 목적: "SNS 유입 15개 계정이 모두 온보딩은 시작했으나 정식 가입되지 않은 이유"를 **버튼 미클릭/계측 누락/제공자 오류/콜백·세션 오류/닉네임·프로필 저장 실패**로 분리하고 재현·수정·회귀 검증한다.

## 1. 2026-10-08 현재 근거: 사실 vs 가설

**조회 범위:** 최근 7일은 2026-10-01 00:00 ~ 2026-10-08 00:00 KST, 별도 언급 없으면 이 기간을 의미한다. 아래 수치는 당시 운영 Supabase/Vercel 조회의 스냅샷이며 재조회 시 변할 수 있다.

### [확인] 실제 수치

| 지표 | 확인 값 | 주의 |
|---|---:|---|
| 랜딩 진입 기록 | 59 | 고유 실사용자가 아닌 익명 계정 기준 이벤트 |
| YouTube Shorts 유입 계정 | 13 | UTM `source=youtube`, `medium=shorts` |
| Instagram 유입 계정 | 2 | UTM `source=ig` |
| 출처 미표시 랜딩 | 44 | SNS가 아니라고 단정 불가 |
| 온보딩 시작 기록 | 45 | 화면 표시 이벤트, 버튼 클릭 아님 |
| SNS 15개 계정 중 온보딩 시작 | 15 | 랜딩 후 같은 계정에서 온보딩 이벤트 확인 |
| SNS 15개 계정 중 비익명 계정 | 0 | 조회 시점 비익명 연결 미확인 |
| SNS 15개 계정 중 운동 완료 / 챌린지 참여 | 0 / 0 | 계정 기준 확인 |
| 전체 `identity_link_started` 이벤트 | 1 | 계측 손실 가능; 실제 버튼 클릭 건수로 단정 금지 |
| 전체 `identity_link_failed` 이벤트 | 0 | 실패 없음이 아니라 미기록일 수 있음 |
| 최근 신규 비익명 Auth 계정 / 신규 프로필 | 0 / 0 | **기존 익명 계정의 승격 날짜는 `auth.users.created_at`만으로 판단할 수 없음** |
| 기존 OAuth identity 누적 | Kakao 3 / Google 1 | 과거 성공 사례, 현재 정상 보증하지 않음 |

**운영 오류:** 2026-10-03 Vercel `/middleware`에 `Invalid Refresh Token: Already Used` 오류 2건(같은 시각). Supabase Auth에 10/03 `/token` 400, 10/06 `/token` 400 세 건 및 `/signup` 500 한 건이 관찰됨. **해당 오류가 위 SNS 계정의 실패 원인인지는 연결 증거가 없다.** `/api/push/notify`의 `url.parse()` 경고는 본 로그인 이슈의 원인으로 분류하지 않는다.

### [코드 확인] 현 구조

1. `src/components/auth-provider.tsx`: 일반 진입은 기존 세션을 읽고 없으면 `signInAnonymously()`. `/login`·`/auth/callback`은 익명 세션 자동 발급 제외.
2. `src/app/onboarding/page.tsx`: 켜진 OAuth 제공자 버튼을 먼저 보여 주고 `linkProvider()` 호출. 신원 연결 후 닉네임 입력 및 `upsertMyProfile()`로 가입 완료.
3. `src/lib/identity.ts`: 온보딩은 `linkIdentity`, 기존 사용자 로그인은 `signInWithOAuth`. 두 흐름을 무작정 교체하면 계정/운동 기록이 분리될 수 있음.
4. `src/app/auth/callback/page.tsx`: 콜백 코드 처리, 세션 확인/갱신, 프로필 유무별 라우팅. `refreshSession()`의 반환 `error`를 검사하지 않고 진행함.
5. `src/lib/analytics-events.ts`: `recordFunnelEvent`가 비동기 INSERT이며 호출부에서 `void`로 사용. OAuth 이동 직전 이벤트 저장 성공을 보장하지 못함. `unique (user_id,event_name)`로 같은 계정의 재시도 횟수도 측정하지 못함.
6. `src/lib/identity.ts`: `identity_link_failed`는 `linkIdentity()` 호출의 즉시 오류에만 기록됨. **제공자에서 돌아오는 콜백 오류 경로는 동일 이벤트로 기록되지 않음.**
7. `src/lib/identity.ts`의 `enabledProviders()`는 빌드에 포함되는 `NEXT_PUBLIC_OAUTH_PROVIDERS` 값으로 버튼 표시 결정. Vercel 운영 변수의 **키 존재는 확인**, 실제 비밀값은 API 조회 결과 마스킹되어 내용 미검증.

참조:
- [온보딩](../../src/app/onboarding/page.tsx)
- [인증 흐름](../../src/lib/identity.ts)
- [OAuth 콜백](../../src/app/auth/callback/page.tsx)
- [인증 Provider](../../src/components/auth-provider.tsx)
- [퍼널 계측](../../src/lib/analytics-events.ts)
- [과거 퍼널 전수 감사](../analytics/public-beta-funnel-audit.md)

### [가설] 원인 후보 (미확정)

- A. 사용자가 OAuth 버튼을 누르지 않고 온보딩 화면에서 떠남.
- B. 실제 버튼 클릭이 있었지만 OAuth 리다이렉트로 비동기 추적 요청이 유실됨.
- C. Kakao/Google 앱 등록·허용 리다이렉트 URL·Supabase OAuth/수동 계정 연결 설정 불일치.
- D. iOS Safari / Instagram·YouTube 인앱 브라우저의 쿠키·저장소·PKCE verifier·새 탭 복귀 차이.
- E. 콜백 코드 교환, `refreshSession`, JWT 익명→비익명 상태 동기화가 실패.
- F. OAuth는 성공했지만 닉네임 단계에서 `profiles` 저장 실패 또는 사용자의 자발적 이탈.

## 2. 수행 원칙 및 사전 준비 (P0)

- 이 문서의 등록은 **테스트 실행 또는 수정 완료가 아니다.**
- 우선 **읽기 전용**으로 운영 설정·로그 조사. 데이터 마이그레이션, 비밀키 수정, OAuth 제공자 설정 변경, 운영 배포는 별도 승인 및 안전한 개발/프리뷰 환경 검증 뒤 실행.
- QA는 가능하면 격리된 테스트 환경과 전용 QA 계정을 사용한다. 프리뷰가 운영 Supabase DB를 공유하는지 반드시 먼저 확인. 테스트 계정 생성·초대·기록이 운영 지표를 왜곡하지 않도록 태깅하고 집계에서 분리한다.
- 카카오·구글 Client Secret, `service_role` 키, JWT, authorization code, refresh token, 개인 이메일, 원본 초대코드를 GitHub Issue·문서·스크린샷·로그에 기록하지 않는다. 테스트 계정 식별자는 내부 전용, 이슈에는 익명화된 run ID만 게시.
- **실제 운영 버전 확인:** Vercel Production 배포 SHA/시점 및 GitHub `main` SHA를 비교. 달랐으면 운영 버전 소스/로그를 기준으로 먼저 재검증하고 차이를 기록.
- 환경 설정 확인 항목(값 노출 금지): `NEXT_PUBLIC_OAUTH_PROVIDERS`의 카카오/구글 활성 여부 및 빌드 시점, Supabase Authentication > Providers 설정, Manual Linking 허용 여부, Supabase Site URL·Redirect allowlist, Kakao/Google 개발자 콘솔의 정확한 redirect URI, `/auth/callback` 경로 및 프로덕션 도메인.
- QA 기준 시간: KST. 각 실험의 시작/종료 시각, 플랫폼, 브라우저/앱 버전, 유입 URL의 **UTM 세 키만**, 클릭 시각, 사용자에게 보이는 화면/오류, Auth 상태, 새 프로필 여부 기록.

## 3. 테스트 매트릭스 — 필수 시나리오

| ID | 환경·진입 | 방법 | 예상 결과 | 중요도 |
|---|---|---|---|---|
| S01 | iPhone Safari / 최초 방문 | 카카오로 시작 → 동의 → 돌아오기 → 닉네임 | 기존 익명 user id 유지, Kakao 연결, 비익명, 프로필 생성, 홈 이동 | P0 |
| S02 | iPhone Safari / 최초 방문 | 구글로 시작 → 동의 → 닉네임 | 위와 동일, Google 연결 | P0 |
| S03 | Instagram iOS 인앱 / 추적 UTM | 카카오로 시작 → 앱 전환/새 탭 → 원래 컨텍스트 복귀 | PKCE/쿠키 손실 없이 완료 또는 명시적 재시도 안내 | P0 |
| S04 | Instagram iOS 인앱 / 추적 UTM | 구글로 시작 | 완료, 또는 제한된 인앱 환경에서 외부 브라우저 이동 안내 제공 | P0 |
| S05 | YouTube iOS 인앱 / Shorts UTM | 카카오로 시작 | 콜백 후 정상 완료 및 유입 UTM 보존 | P0 |
| S06 | YouTube iOS 인앱 / Shorts UTM | 구글로 시작 | 위와 동일 | P0 |
| S07 | Android Chrome / 최초 방문 | 카카오·구글 각각 신규 계정으로 실행 | 양쪽 모두 가입 완료 | P0 |
| S08 | 기존 계정/재방문 | `/login`에서 카카오·구글로 로그인 | 기존 uid와 프로필·운동기록 유지; 새 계정 생성 안 됨 | P0 |
| S09 | 연결된 제공자를 신규 익명 계정에서 다시 시도 | 이미 다른 GND 계정에 연결된 Kakao/Google 버튼 누름 | `identity_already_exists` 등 정확한 오류·기존 계정 로그인 경로 제공, 기록 섞임 없음 | P0 |
| S10 | 제공자 동의 화면 | 취소/거부/뒤로가기 | 앱의 오류/취소 메시지와 재시도·로그인 경로 제공, 무한 로딩 금지 | P1 |
| S11 | 네트워크 오류·토큰 만료 | 연결 직전/콜백 복귀 시 끊김·재시도 | 복구 가능한 안내; 이중 코드 교환·무한 리다이렉트·유령 세션 없음 | P0 |
| S12 | 신규 사용자의 닉네임 단계 | 닉네임 저장, 새로고침, 뒤로가기, 중복 제출 | `profiles` 단일 생성/보존, 완료 시 올바른 화면 | P0 |
| S13 | 챌린지 초대 링크로 신규 진입 | OAuth 왕복 후 닉네임/참가 | 초대 맥락·코드가 유실되지 않고 해당 챌린지로 이동 | P1 |
| S14 | iOS 홈 화면 PWA | Safari 가입 후 설치본에서 기존 계정 로그인 | 동일 제공자로 계정 복원, 새로운 익명 계정에 연결하려고 하지 않음 | P1 |
| S15 | 동일 익명 계정 재시도 | 버튼 여러 번·새로고침·브라우저 복귀 | 중복 OAuth 실행 방지, 화면 상태 복구; 집계가 재시도를 허위 0으로 보이지 않도록 구분 | P1 |
| S16 | 제공자/설정 비활성화 대응 | 테스트 환경에서만 플래그 또는 공급자 비활성 상태 확인 | 로그인 버튼 숨김 또는 사용자 친화적인 우회 경로, 막다른 온보딩 없음 | P1 |

**테스트별 기록:** run ID, 환경/버전, 시각, 시작 익명 uid(외부 보고에는 익명화), 제공자, `linkIdentity` 또는 `signInWithOAuth` 경로, 앱 콜백 도착, 인증 결과, 닉네임 저장, 리다이렉트, DB 확인, 결과(PASS/FAIL/BLOCKED), 재현 영상(개인정보 마스킹).

## 4. 진단 순서 / 분기

1. 랜딩에서 익명 세션을 발급했는가? 실패하면 Auth 생성 에러, SDK 구성, 브라우저 저장소 검토.
2. 온보딩 화면과 카카오·구글 버튼이 **실제로 렌더링됐는가?** 환경변수/활성 제공자와 실제 DOM 상태 확인. `onboarding_started`만으로 버튼 표시를 가정하지 않음.
3. 각 버튼 클릭이 발생했는가? 화면/개발자도구 관찰과 서버의 authorize 요청을 대조. 클라이언트 계측의 **누락 가능성** 분리.
4. `/user/identities/authorize` 요청이 2xx/3xx로 시작되고 제공자 동의창으로 이동하는가? 즉시 오류 vs 리다이렉트 후 오류 구분.
5. provider → Supabase `/callback` → GND `/auth/callback`을 통과했는가? PKCE verifier, redirect URI, 도메인/저장소 차이를 기기별 비교.
6. callback에서 사용자 세션의 `is_anonymous`, identities, UID를 **이전 익명 계정과 대조**하고 `refreshSession()` 반환 객체의 `error`를 검사한다.
7. OAuth 성공 이후 `/onboarding`에서 닉네임 폼이 보이고 `profiles`에 1행 생성되는가? 실패 시 네트워크/권한/RLS/입력 조건을 분리.
8. 최종 홈/초대 챌린지 이동 및 새로고침 후 세션 복구를 확인. 10초 이상 연결 중/검사 중에 갇히면 FAIL로 기록.

## 5. 자동화·분석 보강 제안 (구현은 별도 승인)

- **계측 신뢰성(P1):** OAuth 이동 전 `identity_link_started` 전송 보장 전략을 선택하고 유실/중복의 트레이드오프 검증. `void insert`는 성공 보장이 없음. 기존 `unique(user_id,event_name)`을 고려해 최초 시도 여부와 재시도/실패를 구분하는 별도 모델을 **검토만** 한다.
- **제공자·결과 식별(P1):** Kakao/Google 단계별 성공/취소/실패 여부를 서버 쪽 사실(`auth.identities`, `profiles`)과 대조할 수 있도록 최소 이벤트 스키마 검토. callback의 `error_code`는 **허용 목록의 짧은 분류값만** 보관; 원문/토큰/URL 금지.
- **콜백 안전성(P0):** `refreshSession()` 반환 오류 및 세션/UID 검증 후에만 완료 처리. 실패 시 무한 재시도 없이 재로그인/재연결 선택지를 제공. 수동 교환과 SDK 자동 교환 간 중복 여부를 통합 테스트.
- **미들웨어/세션(P1):** `refresh_token_already_used` 재현/영향 범위 조사. 토큰 갱신 중복이 실제 로그인 실패 원인으로 **확정되기 전엔** 임의 패치 금지.
- **온보딩 경험(P1):** QA로 기술 오류가 배제된다면 버튼 문구, 시작 동기, 다음 단계 안내, 로그인 복귀 UX를 소규모 사용자 테스트.
- **테스트 코드(P0):** OAuth redirect/mock unit/integration test + 실제 제공자를 통한 기기별 수동 스모크 테스트. 공급자 비밀키/실계정으로 CI 자동 로그인 수행하지 않음.
- **퍼널 정합성:** 가입 완료는 `profiles.created_at`, 소셜 신원 연결은 `auth.identities.created_at`와 `auth.users.is_anonymous`를 사용. 기존 `docs/analytics/public-beta-funnel-audit.md`의 "사실 중복 계측 금지" 원칙 유지.

## 6. Acceptance Criteria — 완료 판단

- [ ] 운영/프리뷰 배포 SHA, OAuth 제공자, 관련 URL/환경 차이 파악 (비밀값 노출 없이 검증).
- [ ] S01~S08 필수 신규 가입/재로그인 **모두 PASS** (실기기/실공급자).
- [ ] S09~S12 실패·재시도·닉네임 저장에서 계정 분리, 가입 불능, 무한 대기 **0건**.
- [ ] S13~S16은 영향/우선순위 기록하고 P1 회귀 확인.
- [ ] 성공한 신규 계정의 `auth.users.is_anonymous=false`, provider identity 존재, `profiles` 단일 행, 동일 UID가 검증됨.
- [ ] OAuth callback 실패 시 사용자가 이해할 수 있는 오류 및 안전한 재시도/기존계정 로그인 경로 존재.
- [ ] 마케팅 유입 `landing_opened` → 온보딩 화면 표시 → 버튼 실제 실행/인증 결과 → 프로필 생성의 **단계별 집계 차이를 설명 가능**. 계측 누락·이탈·장애를 구분.
- [ ] 원인/재현 방법/변경 PR/테스트 로그(익명화)/배포 버전/재측정 결과를 Issue 댓글 또는 QA 리포트에 남김.
- [ ] 신규 Shorts·Instagram 링크를 통한 비테스트 외부 회원 전환은 추후 관찰 지표. QA 테스트 자체의 성공과 **실제 마케팅 전환 성공을 혼동하지 않음**.

## 7. 수행 순서 및 산출물

**Phase 0 — 읽기 전용 검증 (우선):** Production 설정 확인 → 인증 에러 로그 시각/패턴 집계 → 실배포 SHA 고정 → 15개 SNS 유입의 이력 재확인(합계만 공유). 산출물: 환경 및 로그 진단표.

**Phase 1 — 실기기 재현:** S01~S08 우선, 재현 실패 시 S09~S16. 산출물: 재현표, 비식별 스크린샷·영상, 실패 원인/재현 조건.

**Phase 2 — 최소 수정:** **원인 확인 후** 별도 브랜치/PR. 코드·환경·제공자 설정 변경은 승인 및 롤백 계획을 포함. 산출물: 근본 원인, 수정 PR, 기능별 테스트.

**Phase 3 — 회귀/출시 검증:** CI `typecheck`·`lint`·`test`·`build`, P0/P1 실기기 재테스트, 콜백/로그/퍼널 재확인, 배포 승인. 산출물: QA 결과 보고서 및 운영 모니터링 기준.

**중지 기준:** 테스트 과정에서 실제 유저 계정 분리/데이터 접근 상실, OAuth 비밀값 노출, 운영 DB 변경 위험, 결제나 외부 계정에 영향 징후 발견 시 해당 실험 즉시 중지.

## 8. 개발 에이전트에 전달할 시작 명령

> 이 계획서(`docs/qa/social-oauth-onboarding-test-plan-2026-10-08.md`)를 QA 체크리스트로 사용하라. **현재 운영환경을 수정하지 않고**, Phase 0(운영/프리뷰 설정 및 배포 SHA/오류 로그 판독)과 S01~S08 재현 테스트를 실행할 준비를 먼저 해라. 접근할 수 없는 모바일 기기/공급자 관리자 콘솔은 BLOCKED로 표기하고 사용자에게 필요한 검증 절차를 제시하라. 익명→소셜 UID 유지, OAuth 콜백, 닉네임 프로필 생성, 계측 누락을 구분하라. 실제 오류가 재현되기 전에는 코드/DB/설정을 변경하지 마라. 원인·근거·재현 절차·최소 수정 PR 초안·회귀 결과를 이슈에 남겨라.

---
이 문서는 **QA 계획**이며 본 작성 자체로 로그인 오류를 수정하거나 테스트 통과를 의미하지 않는다.
