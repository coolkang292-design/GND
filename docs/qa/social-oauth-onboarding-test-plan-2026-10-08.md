# GND 카카오·구글 OAuth 온보딩 장애 진단 및 QA 실행 계획

- 작성일: 2026-10-08 (KST)
- 상태: **OAuth 및 설치 안내 UX 진단 계획 갱신 / 추가 테스트 미실행 / 운영 코드·DB·배포 미변경**
- 대상: GND 운영 앱 (대표 도메인 `https://gnd-one.vercel.app`)
- GitHub: `coolkang292-design/GND`
- 범위: SNS(YouTube Shorts·Instagram) → 랜딩 → 익명 세션 → **InstallGate 설치/브라우저 이동 안내·닫기** → 카카오/구글 신원 연결 → OAuth 콜백 → 닉네임 저장/프로필 생성 → 실제 사용(첫 운동/챌린지) → **선택형 설치 유도**
- 실행 담당: 개발 에이전트(정적·자동화 검사), QA 담당(실기기 OAuth)
- 목적: "SNS 유입 15개 계정이 모두 온보딩은 시작했으나 정식 가입되지 않은 이유"를 **설치 안내 팝업으로 인한 이탈/버튼 미클릭/계측 누락/제공자 오류/콜백·세션 오류/닉네임·프로필 저장 실패**로 분리하고 재현·수정·회귀 검증한다.

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
- G. 최초 SNS 방문자에게 설치·브라우저 이동 안내가 가입 동선을 가로막거나 Safari 이동/설치 요구가 심리적 마찰을 만들어 이탈함. 실제 이탈 원인 여부는 **미검증**.

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

**선행 P0:** 아래 §9의 설치 안내 P0 테스트(S17~S22)를 OAuth 장애 재현과 함께 수행. InstallGate에 화면이 가려지면 OAuth 버튼 노출/클릭/실패 데이터를 혼동할 수 있다.

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
- [ ] **S17~S22 P0:** 신규 방문자 Instagram·YouTube·Safari·iOS Chrome에서 설치 안내가 소셜 가입을 가로막지 않는지 확인. 설치 거절/닫기 이후 서비스 접근이 가능하고 UID/UTM이 보존됨.
- [ ] **S23~S26 P1:** 첫 운동/챌린지 이후 선택형 설치 유도, 브라우저별 홈 화면 추가 동작, 기존 회원의 설치 안내 접근성·회귀 검증.
- [ ] 성공한 신규 계정의 `auth.users.is_anonymous=false`, provider identity 존재, `profiles` 단일 행, 동일 UID가 검증됨.
- [ ] OAuth callback 실패 시 사용자가 이해할 수 있는 오류 및 안전한 재시도/기존계정 로그인 경로 존재.
- [ ] 마케팅 유입 `landing_opened` → 온보딩 화면 표시 → 버튼 실제 실행/인증 결과 → 프로필 생성의 **단계별 집계 차이를 설명 가능**. 계측 누락·이탈·장애를 구분.
- [ ] 원인/재현 방법/변경 PR/테스트 로그(익명화)/배포 버전/재측정 결과를 Issue 댓글 또는 QA 리포트에 남김.
- [ ] 신규 Shorts·Instagram 링크를 통한 비테스트 외부 회원 전환은 추후 관찰 지표. QA 테스트 자체의 성공과 **실제 마케팅 전환 성공을 혼동하지 않음**.

## 7. 수행 순서 및 산출물

**Phase 0 — 읽기 전용 검증 (우선):** Production 설정 확인 → 인증 에러 로그 시각/패턴 집계 → 실배포 SHA 고정 → 15개 SNS 유입의 이력 재확인(합계만 공유) → **InstallGate 호출 시점·모달 노출/닫기·환경 판정과 OAuth 버튼 접근성 점검 (§9)**. 산출물: 환경/로그 진단표 및 '설치 안내 노출 vs 로그인 시도' 구분표.

**Phase 1 — 실기기 재현:** **S17~S22 설치 안내 선행 검증과 S01~S08 OAuth 검증을 연계 실행**. 이후 실패 유형별 S09~S16·S23~S26 확장. 산출물: 설치 모달/인앱 브라우저/비로그인 상태별 비식별 재현표·영상 및 실패 원인.

**Phase 2 — 최소 수정:** **원인 확인 후** 별도 브랜치/PR. 코드·환경·제공자 설정 변경은 승인 및 롤백 계획을 포함. 산출물: 근본 원인, 수정 PR, 기능별 테스트.

**Phase 3 — 회귀/출시 검증:** CI `typecheck`·`lint`·`test`·`build`, P0/P1 실기기 재테스트, 콜백/로그/퍼널 재확인, 배포 승인. 산출물: QA 결과 보고서 및 운영 모니터링 기준.

**중지 기준:** 테스트 과정에서 실제 유저 계정 분리/데이터 접근 상실, OAuth 비밀값 노출, 운영 DB 변경 위험, 결제나 외부 계정에 영향 징후 발견 시 해당 실험 즉시 중지.

## 8. 개발 에이전트에 전달할 시작 명령

 > 이 계획서(`docs/qa/social-oauth-onboarding-test-plan-2026-10-08.md`)를 QA 체크리스트로 사용하라. **현재 운영환경을 수정하지 않고**, Phase 0(운영/프리뷰 설정, 배포 SHA, 오류 로그, InstallGate 적용 시점)과 **S17~S22 설치 팝업 + S01~S08 OAuth 재현 테스트**를 실행할 준비를 먼저 해라. 접근할 수 없는 모바일 기기/공급자 관리자 콘솔은 BLOCKED로 표기하고 사용자에게 필요한 검증 절차를 제시하라. 익명→소셜 UID 유지, OAuth 콜백, 닉네임 프로필 생성, 계측 누락을 구분하라. 실제 오류가 재현되기 전에는 코드/DB/설정을 변경하지 마라. 원인·근거·재현 절차·최소 수정 PR 초안·회귀 결과를 이슈에 남겨라.


## 9. [추가 2026-10-08] Instagram·YouTube 인앱 브라우저 설치 안내 마찰 P0 점검

### 9.1 사용자 실기기 스크린샷에서 확인한 현상 — **사용자 관찰 / 원인 미확정**

- **Instagram iOS 인앱 브라우저:** GND 운동 기록 화면을 어둡게 덮는 시트가 나타나며 제목 **"이제 홈 화면에 놓을 차례예요"**, 설명 **"카톡 안에서는 앱을 못 깔아요"**, "공유 → Safari로 열기", "주소 복사하기" 등을 제시한다. Instagram 맥락에 카톡 전용 문구·이미지를 쓰고 있다.
- **YouTube에서 링크를 연 iOS 화면:** 주소창에 GND가 표시되고 기존 운동 기록을 덮는 시트 **"사파리로 열어 주세요 / 아이폰은 사파리에서만 홈 화면에 추가할 수 있어요"**가 노출된다. 해당 화면이 일반 iOS 브라우저 또는 앱 내 브라우저로 어떤 User-Agent에서 식별되는지 실측이 필요하다.
- **중요 제한:** 두 스크린샷의 배경에는 기존 운동 기록과 연속 운동 상태가 보인다. 이는 기존 로그인된 사용자의 관찰일 수 있다. **신규 익명 사용자가 정확히 같은 설치 시트를 봤다는 증거는 아니다.** 다만 코드에서 신규 익명 사용자용 `login-first` 자동 시트가 별도로 확인되므로 신규 유입 경로도 검사해야 한다.
- 위 관찰과 Supabase 15개 SNS 유입·0개 정식 전환은 연관성의 **가설**일 뿐, 모달 노출/닫기 로그가 없으므로 인과관계·이탈률을 산출할 수 없다.

### 9.2 코드에서 확인된 동작 — 추측 아님

| 파일 / 함수 | 확인 사항 | 위험 또는 검증점 |
|---|---|---|
| `src/app/layout.tsx` | `InstallGate`를 앱 **루트**에 배치 | 로그인/온보딩/기록 화면에도 적용. 단일 페이지별 표시 제한이 없다 |
| `src/components/install/install-gate.tsx` | `decideGuide` 결과에 따라 자동 설치/탈출/`login-first` 시트를 오픈 | 계정이 연결되지 않았으면 설치보다 먼저 `login-first` 안내. 사용자가 실제 가입 버튼을 보기 전에 가려질 가능성 |
| `src/lib/domain/install-prompt.ts` | `!linked`이면 `login-first`, `linked && inapp-ios`면 `escape`, `linked && ios-other`면 `install` 정책 적용 | 화면 맥락과 설치 의도 대신 신원/UA 중심 조건. 가입·첫 체험에 안내가 끼어들 수 있음 |
| `src/components/install/install-gate.tsx` `handlePrimary` | `login-first`의 버튼은 **`/account`로 이동** | 신규 가입의 `/onboarding` 흐름을 우회하는지 검증 필요. 익명 신원 연결 안전성 유지 |
| `src/components/install/install-sheet.tsx` | `escape-ios` 문구/캡처 이미지가 Kakao 전용 | Instagram 화면에서도 "카톡 안에서는" 노출되는 UX 불일치 |
| `src/lib/domain/install-prompt.ts` `detectInstallEnv` | Instagram 표식 있음; YouTube 인앱 표식 별도 없음 | YouTube 인앱의 User-Agent가 iOS Safari/ios-other로 **오판될 수 있음**. 브라우저 UI만으로 확정 금지 |
| `src/components/install/install-sheet.tsx` | `escape-ios-other`에 "아이폰은 사파리에서만 홈 화면에 추가" 문구 | **과도하게 단정적**. iOS Chrome 버전/OS별 홈 화면 추가 가능 여부 및 설치 결과를 실기기로 확인해 브라우저별로 정확히 안내 |
| `src/lib/analytics-events.ts` | 설치 시트 노출·닫기·외부 브라우저 이동 추적 이벤트 부재 | 로그인 클릭 전 이탈과 설치 가이드 이탈을 분리 측정 불가 |

참조: [InstallGate](../../src/components/install/install-gate.tsx), [환경 분류/노출 정책](../../src/lib/domain/install-prompt.ts), [설치 안내 문구](../../src/components/install/install-sheet.tsx), [루트 배치](../../src/app/layout.tsx), [기존 PWA 설치 설계](../superpowers/plans/2026-08-21-pwa-install-prompt-pipeline.md).

### 9.3 추가 실기기·자동화 시나리오

| ID | 우선 | 실험 | 기대 결과/판정 기준 |
|---|---|---|---|
| **S17** | P0 | **완전 신규 iPhone/Instagram 인앱**, 쿠키·로그인 없음, 릴스 UTM 유입 | ① 어느 안내가 언제 뜨는지 기록 ② 닫으면 카카오·구글 **정상 접근** ③ 강제 홈 화면 추가 없음 ④ 가입 성공 여부 확인 |
| **S18** | P0 | **완전 신규 iPhone/YouTube Shorts 인앱**, 쿠키·로그인 없음 | UA/실제 앱 브라우저 판정, 설치 시트 자동 노출/닫기, 소셜 버튼 클릭 및 콜백 도달 확인 |
| **S19** | P0 | **기존 정식 회원** Instagram 인앱/YouTube 인앱 각각 | 사용자 스크린샷처럼 설치 시트가 재현되는지, 닫으면 앱 사용 가능한지, 재노출/반복 강요 여부 확인 |
| **S20** | P0 | iOS Safari·Chrome 최초 접속 / iOS 버전 명시 | 가입이 설치 없이 가능한지; Chrome에 홈 화면 추가 메뉴가 실제 존재하는지, 동작 후 세션/앱 모드 차이 확인. 지원을 가정하지 말 것 |
| **S21** | P0 | 신규 익명 사용자에서 `login-first` 시트 **계정 연결하러 가기** 클릭 | `/account` 도착 후 카카오/구글 연결 → 콜백 → 닉네임/프로필 생성까지 끊기지 않는가? 정상 `/onboarding` 경로와 비교 |
| **S22** | P0 | 설치 시트 **X/배경 터치**, 재진입, 뒤로가기, 다른 브라우저 열기 | 닫아도 가입/기록/챌린지로 정상 이동, 무한 루프 없음; UTM/초대 컨텍스트와 UID 손실 없음 |
| **S23** | P1 | **첫 운동 완료/첫 챌린지 참가 이후** 선택형 설치 유도 UX 시나리오 | 기존 회원/신규 회원 구분; 설명 없이 막지 않고 **'나중에'·닫기** 제공; 재노출 정책 테스트 |
| **S24** | P1 | iOS Chrome/Safari/Instagram/YouTube 인앱, Android Chrome/인앱 + PWA 설치 | 브라우저별 올바른 UI·텍스트; 불가능한 경우 홈 화면 추가 약속 금지; iOS Chrome 지원 여부 실측 |
| **S25** | P1 | 설치 시트 이벤트 계측 변경안의 단위/통합 테스트 | `guide_shown`, `guide_dismissed`, `install_intent` 등 필요한 **최소 이벤트**를 기존 스키마·RLS·중복 정책과 대조하여 설계; 실제 구현은 별도 승인 |
| **S26** | P1 | **동일 콘텐츠 캠페인** 기존 UX vs 설치 안내 후순위 UX의 제한된 파일럿 | 동일 UTM별 랜딩→소셜 버튼 클릭→신원 승격→프로필 생성→첫 운동 전환 비교. 표본 15건은 확정적 인과/개선 효과 주장 불가 |

**모든 S17~S26 증빙 기록:** 테스트 계정 분류(기존/신규), 실제 UA를 **민감정보 제거 후 특징만**, iOS/Android 버전, 최초 진입 출처·캠페인, 시트 variant, 표시 시점, 닫기 여부, 버튼 표시/클릭, OAuth request/redirect/return, Identity 생성, 프로필 저장, 주간 운동 완료 유무, PASS/FAIL/BLOCKED. `onboarding_started`는 화면 진입 이벤트이므로 **시트에 가려져도 기록될 수 있는지** 실측 필요.

### 9.4 변경안 (승인 전 설계, **현재 코드 미변경**)

**A. 권장 순서: 가치 체험 우선(우선 검증할 대안)**

```text
릴스·쇼츠 → 랜딩/온보딩 → 카카오·구글 가입(익명 UID 유지)
  → 닉네임 → 운동 기록 또는 챌린지 참여
  → 이후 [선택] 홈 화면 추가 / [나중에] 계속 사용
```

- **P0 의사결정:** 신규/익명 사용자가 `/onboarding`, `/login`, `/auth/callback`에 있을 때 `InstallGate`의 **자동 안내 중지** 후보를 검증. 단, 기존 계정의 복구를 막거나 계정을 분리하지 않는 안전 경로는 유지.
- **P1 설계:** 설치는 최초 가입의 **필수 단계로 만들지 말고**, 첫 운동 완료 또는 챌린지 가치 확인 이후 **사용자 선택형 편의 기능**으로 제시하는 안을 A/B 실험. 앱 다운로드가 필수라는 문구·동작 제거를 검토.
- **브라우저별 안내:** Instagram에 카톡 전용 텍스트/사진을 그대로 쓰지 않는다. YouTube UA를 실제 수집/익명화하여 환경 판정을 보완. iOS Chrome에서 홈 화면에 추가가 가능한 OS/브라우저 버전과 실제 설치 형태를 검증하고 "Safari만 가능" 문구를 조건부·정확한 문구로 수정 제안.
- **계측:** 사용자에게 보이는 설치 시트의 variant 및 노출/닫기 → 소셜 버튼 실제 클릭 → OAuth 결과 → 프로필 생성 단계를 연결. 기존 `unique(user_id,event_name)`/이벤트 allowlist 때문에 스키마 변경 없이 이벤트명을 무작정 INSERT하지 않는다. 개인정보·토큰·전체 referrer URL 수집 금지.
- **중요 보존사항:** 설치 본체와 브라우저의 저장소는 달라질 수 있으므로 소셜 UID의 계정 복원 경로, 기존 PWA 사용자 및 초대 링크/UTM이 깨지지 않는지 회귀 검증. **단순 팝업 제거가 모든 인증 결함을 해결한다고 가정하지 않는다.**

**B. 반증 기준:** S17~S22에서 신규 SNS 방문자에게 자동 설치 시트가 표시되지 않거나, 시트가 가입 행동을 방해하지 않고 정상 전환되는데도 가입 실패가 재현된다면 설치 팝업이 **기술적 가입 실패의 원인이라는 가설을 기각/낮은 우선순위**로 처리하고 OAuth 콜백·프로필 저장을 우선 조사.

**C. 완료 조건:** P0 설치 시트 시나리오 전부 PASS; 신규 가입은 홈 화면 설치 강요 없이 완료; 닫기를 누르면 소셜 가입을 재개할 수 있음; Instagram·YouTube·Safari/Chrome 안내가 사용자 환경을 정확히 설명; 오탐/노출·이탈을 실제 이벤트로 검증할 수 있는 계측 계획 확보. 운영 배포/DB/코드 수정은 사용자 별도 승인 이후.


---
이 문서는 **QA 계획**이며 본 작성 자체로 로그인 오류를 수정하거나 테스트 통과를 의미하지 않는다.
