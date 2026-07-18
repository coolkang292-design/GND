# GND 진행 기록 (새 세션 시작용)

> 새 세션은 이 파일 + `C:\Users\SAMSUNG\Desktop\Workout app\IMPLEMENTATION_PLAN.md`(단일 진실)만 읽으면 바로 이어서 작업할 수 있다.
> 시각 스펙: 같은 폴더의 `운동앱-목업.html`.

## ⚠️ 다음 작업 = 핵심 E2E → 3명 4주 실사용 (Phase 7 진행 중)

**앱이 프로덕션에 떠 있다: https://gnd-one.vercel.app** — 실사용 시작 가능 상태. 2026-07-18 후반 완료: ①아침 브리핑 크론(0013 + `/api/briefing`, Vercel 크론 등록·프로덕션 dedupe 검증 완료) ②프로필 알림 설정 토글 5종 ③피드 사진 인증 모아보기 필터 → 전체 검증 후 **프로덕션 재배포 완료**. 상세는 아래 **"2026-07-18 후반 산출물"**. (오전분: 브랜딩·일지 공유·배포·피드 히스토리 — "2026-07-18 산출물" 참조.)

**폰 확인 대기 (배포 주소 https://gnd-one.vercel.app 기준):**
① 프로필 탭 알림 토글 5종 저장·반영 ② 피드 "사진 인증" 필터 칩 ③ 내일 아침 9시대 알림함 브리핑 카드(불독 아이콘) 도착. (이전 3항목 — 익명 인증 홈 진입·온보딩→운동→사진 인증 사이클·피드 날짜 헤더 — 미확인이면 함께 볼 것.)

**Vercel 운영 정보 (중요 — 이 섹션만 보면 배포 운영 가능):**
- 프로덕션: **https://gnd-one.vercel.app** (별칭 gnd-gnd4.vercel.app 동일). 계정 coolkang292@gmail.com · 팀 `gnd4`(Hobby) · 프로젝트 `gnd`. CLI 로그인 완료 상태(device 인증).
- **재배포 = `pnpm dlx vercel deploy --prod --yes` 한 줄.** GitHub 미사용 — git은 여전히 로컬 전용.
- **env 등록은 반드시 Bash로**: `printf '%s' "$VAL" | pnpm dlx vercel env add NAME production` (누적 교훈 9 — PowerShell 파이프는 BOM이 섞여 익명 인증이 통째로 깨졌음). 현재 `NEXT_PUBLIC_SUPABASE_URL`·`NEXT_PUBLIC_SUPABASE_ANON_KEY`·`CRON_SECRET`·`SUPABASE_SERVICE_ROLE_KEY` Production 등록 완료. CLI가 `.env.local`에 `VERCEL_OIDC_TOKEN` 한 줄 추가함(무해).
- **배포 도메인 = 새 오리진**: 로컬(localhost/IP)에서 쓰던 익명 계정·크루는 이어지지 않음(정상). 실사용 데이터는 배포 주소에서 새로 시작. https라 공유 시트·crypto 완전 동작.

**브리핑 크론 운영 메모 (구현 완료 — 운영 참고):**
- 구조: `vercel.json` crons `/api/briefing?hour=9`·스케줄 `0 0 * * *`(UTC 0시 = KST 09시) + `src/app/api/briefing/route.ts`(GET, `CRON_SECRET` Bearer 검증·hour 파라미터 검증). `CRON_SECRET`·`SUPABASE_SERVICE_ROLE_KEY`는 Vercel env + `.env.local`에 등록돼 있음(NEXT_PUBLIC_ 아님 — 클라 노출·커밋 금지).
- **Hobby 플랜 크론 제약** (공식 문서 2026-06 확인): 각 크론 **하루 1회 이하** + 실행 시각 **최대 59분 오차**(9시 지정 → 09:00~09:59). 웹푸시 없이 인앱 알림함에 쌓이는 방식(계획서 §18 웹푸시 메모 참조).
- 수동 발송 테스트: Bash에서 `SECRET=$(grep '^CRON_SECRET=' .env.local | cut -d= -f2)` 후 `curl -H "Authorization: Bearer $SECRET" "https://gnd-one.vercel.app/api/briefing?hour=9"`. dedupe_key(0013) 덕에 재호출은 `sent:0` — 하루 1건 멱등. 크론 등록 확인: `pnpm dlx vercel crons ls`.

### 다음 세션 시작 체크리스트

1. 저장소 `C:\Users\SAMSUNG\workout-app`, 브랜치 `main`, 작업트리 클린(`.claude/`만 untracked — 커밋 금지). 되돌리기·리셋 불필요.
2. **DB 0001~0013 전부 적용 완료 — SQL 파일 재실행 금지.** (0013 = 브리핑 dedupe_key + finalize ranks 존중, 2026-07-18 적용·통합 스크립트 8/8 확인)
3. dev 서버는 세션 종료와 함께 꺼졌을 수 있음 → `pnpm exec next dev -H 0.0.0.0`으로 시작 (폰: `http://192.168.219.104:3000` / Tailscale `http://100.85.240.15:3000`). build 돌릴 땐 dev 서버 먼저 종료(교훈 8 — 좀비면 `taskkill /PID <pid> /F`). 와이파이 IP는 DHCP라 변동 가능(.112→.104 전례) — 안 열리면 `ipconfig` 확인 후 `next.config.ts allowedDevOrigins` 갱신. 이제 순수 표시 확인은 배포 주소로도 가능.
4. 검증 명령: `pnpm test`(**150**) · `pnpm lint`(경고 1건 — `scripts/briefing-integration-test.mjs`, 무해) · `pnpm typecheck` · `pnpm build` · `node scripts/rls-test.mjs`(**107**, 응원 쿨다운 대기 포함 1~2분) · `node scripts/briefing-integration-test.mjs`(**8/8**, 실 DB).
5. E2E·스모크 스크립트는 세션 scratchpad에 있어 소멸됨 — 재작성 시 흐름: 익명 세션 쿠키(`sb-<ref>-auth-token`, base64- 접두) 파싱 → REST로 프로필·크루·세션 픽스처 → puppeteer-core(스크래치패드에 npm install)로 UI·Realtime 단언. 아래 "Phase 6 산출물" 참고.
6. **다음 작업 = 핵심 E2E → 3명 4주 실사용.** 사용자에게 먼저 확인: 위 "폰 확인 대기" 항목 결과(알림 토글·사진 필터·브리핑 카드 도착).

---

## 현재 상태 (2026-07-18 기준)

**Phase 0~6 완료 + Phase 7 진행 중(브랜딩·배포까지 완료). 프로덕션: https://gnd-one.vercel.app**

| Phase | 상태 | 비고 |
|---|---|---|
| 0 목업 | ✅ | 운동앱-목업.html |
| 1 웹앱 기반 | ✅ | 테마·5탭·익명인증·PWA·lib/domain/time (18 tests) |
| 2 신원·크루 | ✅ | 온보딩·초대링크·RLS — 2인 테스트 통과 |
| 3 운동 핵심 | ✅ | 세션·RPC·카탈로그·세트입력·휴식타이머·임시저장 — unit 47 + RLS 40/40 + PC·폰 스모크 통과 |
| 4 완료 루프 | ✅ | 달력(`9e540ef`)·지난 운동 복사(`1f3281d`)·인증사진(`a1a6e1a`) — unit 63 + RLS 54/54 + E2E 2종 통과 |
| 5 챌린지 | ✅ | goal-score TDD 20케이스·KPI 게이트·진행중 비공개·시상대(`ea6fb60`) — unit 83 + RLS 68/68 + E2E 통과 |
| 6 소셜 | ✅ | 피드·반응·진행중 카드·Realtime 응원·찌르기·알림함 — unit 104 + RLS 102/102 + E2E 2인 14/14 + 실기기 7항목 통과 |
| 7 안정화 | 🔶 진행 중 | 브랜딩 ✅·Vercel 배포 ✅·일지 공유 ✅·피드 히스토리 ✅·브리핑 크론 ✅·알림설정 토글 ✅·피드 사진 필터 ✅ — 남은 것: 핵심 E2E·3명 4주 실사용 |

### 2026-07-18 후반 산출물 (`cdb89c1`~`a9cd612` + 프로덕션 재배포)

- **설계·계획**: `docs/superpowers/specs/2026-07-18-briefing-cron-notification-settings-design.md` · `docs/superpowers/plans/2026-07-18-briefing-cron-notification-settings.md` (9개 태스크, TDD·커밋 분리·0013 게이트).
- **아침 브리핑 크론** (`ca37e98`~`f06c5f6`, 0013): `lib/domain/time.ts` `hourOfDay`(tz 기준 시각) + `lib/domain/briefing.ts` 발송 판정 TDD 16케이스(스펙 §3). 스트릭 카피는 `lib/domain/streak-messages.ts`로 공용 추출(`bbf407b`, streak-card와 브리핑이 재사용). **0013_briefing_dedupe_ranks_setting.sql**(적용 완료 ✅): notifications `dedupe_key` unique(하루 1건 멱등 upsert) + finalize_challenge가 ranks 알림 설정 존중. `src/app/api/briefing/route.ts`(GET, CRON_SECRET Bearer·hour 검증) + `src/lib/supabase/admin.ts`(service_role 클라, 서버 전용) + `vercel.json` crons. 알림함 브리핑 카드에 앱 아이콘 표시(`b82c3b4`).
- **알림 설정 토글 5종** (`920ed06`·`6f54f09`): 프로필 탭 — morning_brief(아침 브리핑)·cheers(응원)·pokes(찌르기)·ranks(챌린지 순위)·record_views(성과 열람). `lib/notification-settings.ts`, **행 없음=전부 on** 기본(0011 관례), 부분 upsert 저장, 토글 in-flight 가드·로드 실패 표시(리뷰 반영).
- **피드 사진 인증 모아보기 필터** (`8e52e91`·`a9cd612`): 피드 상단 칩 — `workout_images` inner join으로 사진 인증 세션만, 페이지네이션·날짜 헤더 유지, 필터 전환 중 스테일 페이지 가드·칩 `aria-pressed`(리뷰 반영).
- **전체 검증 (이 세션 실측)**: unit **150** · lint(경고 1건 — briefing-integration-test.mjs, 무해) · typecheck · build · RLS **107/107** · 브리핑 통합 `scripts/briefing-integration-test.mjs` **8/8**(dedupe 멱등·finalize ranks on/off).
- **프로덕션 재배포 + 크론 검증**: `pnpm dlx vercel deploy --prod --yes` → READY, https://gnd-one.vercel.app 200(`/`→`/home` 307은 정상 리다이렉트). 프로덕션 `/api/briefing?hour=9` 수동 호출 1차 `sent:2, errors:[]` → 2차 `sent:0, alreadySent:23`(dedupe 정상). skipped `no_history` 23건은 운동 기록 없는 테스트 잔여 익명 유저 — 정상. `pnpm dlx vercel crons ls`로 크론 등록 확인(`/api/briefing?hour=9` · `0 0 * * *`).

### 2026-07-18 산출물 (`c9c92f4`~`945890e`)

- **꾸준왕·홈 위젯 실기기 7항목 통과 확정** — ①스트릭 카드 ②주간 stat ③소멸 경고 ④꾸준왕 n/5일 ⑤열람권 흐름 ⑥재열람 거절 ⑦사진 스탬프. ⑦은 확인 중 발견한 버그 수정(`c9c92f4`): 스탬프 오버레이가 완료 화면에만 있어 홈·피드는 원본만 표시 → 공용 `components/photo-stamp.tsx` 추출, 홈(상단)·피드(하단)·완료 화면 재사용. 파일에 굽지 않는 §11 원칙 유지.
- **블랙&골드 브랜딩 적용** (`94b355f` 스펙·`d1526bc`, 폰 확인 통과): 계획서 §2 결정 변경(블랙&골드, GND 덤벨 로고+불독 마스코트, "NO EXCUSES. JUST RESULTS."). 라이트/다크 분기 제거 → 단일 `:root`(`--bg #0B0B0C`·`--accent #E8B84B`·경고색 앰버→주황 `#FB8A3C` 골드와 구분·완료 초록 유지). 아이콘 = 시안(`Desktop\Workout app\GND 앱 아이콘 디자인 소개.png`) 대형 패널을 sharp로 크롭 → 192/512/maskable + `apple-icon.png`(180). manifest 색·태그라인, iOS 상태바 black-translucent, 온보딩 골드 로고타입. 기존 설치 PWA는 삭제 후 재설치해야 아이콘 갱신.
- **운동 일지 텍스트 공유** (`cbe7c5e` 스펙·`411797b`, 폰 확인 통과): AI 코치 붙여넣기용. `lib/domain/workout-log.ts` `formatWorkoutLog` TDD 10케이스(완료 세트만·재번호·유형별 줄 형식·소수 중량). `lib/share.ts` share→클립보드→execCommand 폴백. 버튼 2곳: 달력 날짜 상세 시트(시트 열릴 때 프리페치 — iOS는 share를 제스처 안에서 호출해야 함)·완료 화면(draft 지우기 전 logText 보관). `getSessionLogExercises`는 is_completed 유지 매핑(복사용과 용도 분리).
- **Vercel 프로덕션 배포** (`1f36612`): CLI 직접 배포(GitHub 생략). 배포 직후 익명 인증 "non ISO-8859-1" 에러 → PowerShell 파이프 BOM이 env 값에 섞인 것. Bash printf로 재등록·재배포, 배포 번들 바이트 검사로 확인(교훈 9).
- **피드 날짜별 히스토리** (`9e9eb56`, 사용자 요청): 크루 인증 카드를 날짜 헤더(오늘/어제/M월 D일 (요일) + 그날 운동 수)로 그룹핑, 페이지네이션 유지. `lib/domain/social.ts` `groupByDay`·`feedDateLabel` TDD 6케이스(자정·연 경계). 렌더 중 `Date.now()`는 purity 린트 위반 → lazy useState 1회 고정(교훈 10).
- 검증 기준선: **unit 131** · RLS 107/107(오늘 DB 변경 없음) · lint · typecheck · build · 배포 200.

### 꾸준왕 열람권 + 홈 위젯 산출물 (2026-07-17, `5dd688c`~`59e62f9`)

- **설계·계획**: `docs/superpowers/specs/2026-07-17-king-viewing-pass-home-widgets-design.md` · `docs/superpowers/plans/2026-07-17-king-viewing-pass-home-widgets.md`. 핵심 결정: 꾸준왕=고정 주5일(운동한 '날' 기준, 하루 2회=1일) → 5일째 완료 시각부터 24h 유효·1회·주당 1장 열람권 → 크루원 1명 성과+진행중 챌린지 달성률·순위(Phase 5 🔒의 열쇠) 열람 → 👀 알림. 목업의 "꾸준왕 성과를 누구나 열람"을 사용자 결정으로 뒤집음.
- **0012_record_view_rpc.sql** (적용 완료 ✅): A안(파생 상태) — 열람권 테이블 없이 `view_record` RPC가 열람 순간 자격 판정(주5일·24h·미사용·크루) 후 record_views insert + notify. 직접 insert 권한·정책 회수. 에러 코드: not_eligible/pass_expired/pass_used/not_crew/self_view.
- `lib/domain/viewing-pass.ts`(TDD 11): `weekWorkoutDays`(주간 고유 운동일·5일째 시각)·`viewingPassStatus`(progress/available/used/expired). 서버와 같은 판정을 클라에서 재현.
- I/O: `lib/social.ts` `viewRecord`·`getMyRecordViewAts`·`getCrewPerformance`(주간 운동일·스트릭·챌린지 달성률·순위), `lib/challenge.ts` `getActiveChallengeRanking`.
- 홈 UI: `components/home/` — `home-client`(내 완료 세션 1회 fetch 공유, page.tsx 교체)·`streak-card`(🔥+요일 점+소멸 경고 D-4~D-1, streak.ts 재사용)·`weekly-stats`(운동일/달성률/스트릭)·`king-card`(상태별 카드·크루원 선택·확인 모달·성과 시트).
- **검증**: unit 115(+11) · RLS **107/107**(+5: 직접 insert 차단·not_eligible·self_view·not_crew·본인 select) · lint · typecheck · build 통과.
- **한계(기록)**: view_record 정상 경로(5일 자격 통과)는 자동 테스트 불가 — completed_at이 서버시간이라 테스트에서 5개 고유 날짜를 만들 수 없음. 판정 로직은 unit이 검증, SQL은 같은 규칙의 이식. 실사용에서 자연 확인.
- 열람권 자기 축하 배너·record_viewed 알림함 표시는 기존 알림 구조로 자동 처리(추가 코드 없음).
- **스트릭 메시지 개편 (사용자 요청, `175985e`·`ce54521`+로테이션)**: 손실회피(쌓아둔 n일을 잃는다는 숫자 프레이밍) + 능청 유머 톤 + **날짜 기반 로테이션**(단계별 변형 2~3개, todayKey 해시로 하루마다 다른 문구·같은 날엔 고정 — 렌더 중 Math.random은 하이드레이션 불일치라 금지). 문구 추가·수정은 `streak-card.tsx`의 `STAGE_MESSAGES`·`TODAY_DONE_MESSAGES`·`EXPIRED_MESSAGES` 배열에 항목만 넣으면 됨.
- **와이파이 IP 변동 대처 (`986497e`)**: DHCP 재할당으로 .112→.104. `ipconfig` 확인 → `next.config.ts allowedDevOrigins` 추가 → dev 서버 재시작. 이전 세션 dev 서버가 좀비로 남아 포트를 잡고 있으면 `taskkill /PID <pid> /F`.

### Phase 5.2~5.3 산출물 (2026-07-17, 커밋 `63e5c27`~`88d959b` + `b499510`)

- **챌린지 목표 카테고리 우선 개편 (5.2)**: goal_type 7종 + 레거시 volume(`weight_reps·weight_days·cardio_distance·cardio_time·bodyweight_reps·bodyweight_time·bodyweight_days`). 맨몸은 `measure`(reps/time)로 횟수형/시간형 구분(매달리기·플랭크·사이드플랭크·핸드스탠드=time), `*_days`는 하루 N부위/N종목+ 조건(`qualifier`, 0007). 설계·계획: `docs/superpowers/specs/2026-07-17-challenge-category-goals-design.md`, `docs/superpowers/plans/2026-07-17-challenge-category-goals.md`. 카테고리 코드는 0007(body_part·qualifier)+0008(measure·goal_type)을 모두 쿼리 — 하나라도 미적용이면 챌린지 화면 400.
- **burnfit 카탈로그 40종 시드 (5.3, 0009)**: https://burnfit.io/라이브러리/ 기반, 기존 시드 중복 제외, `on conflict do nothing` 재실행 안전.
- **맨몸 루틴 6종 시드 + 맨몸 칩 (0010)**: 점프 스쿼트·마운틴 클라이머·슈퍼맨 로우·인치웜 푸시업·라잉 Y 레이즈·타이슨 푸시업(전부 bodyweight·reps). `exercise-picker.tsx`에 "맨몸" 칩 — body_part가 아닌 `exercise_type==='bodyweight'` 모달리티 필터. 루틴 템플릿(종목 묶음) 기능은 별도 주제로 보류 — 현재는 "지난 운동 복사"로 대체.
- **홈 크루 최근 인증사진 (5.3)**: `getLatestCrewWorkoutWithPhoto(groupId)`(signed URL 1h) + `crew-latest-workout.tsx` 카드, 홈 "최근 친구 활동" 자리 배치. 목업 홈의 스트릭 카드·주간 stat·그룹 공동목표·오늘 그룹 현황·꾸준왕은 Phase 6에서(실데이터 필요).
- **RLS 픽스처 보정**: 0008 이전 goal_type 3곳(`distance`×2→`cardio_distance`, `frequency`→`weight_days`) 수정. `distance` 2곳은 네거티브 테스트라 보정 전엔 check 제약 위반으로도 통과하는 가짜 통과였음. 보정 후 현 DB 기준 **RLS 68/68**, unit **96 tests**, build, 실기기 확인 통과 후 커밋(`b499510`).

### Phase 5 산출물 (2026-07-17)

- `lib/domain/goal-score.ts` TDD 20케이스 (§7 그대로): rate 정규화→평균(개수중립)→100% 상한→overall 0.8/0.2→동점 ①달성률②참여율③선착④완료목표수⑤공동순위. `plannedDaysForPeriod`(주N일→기간 환산)·`gndLabel`(탈출/탈출중/확정).
- 0006: `challenges`(살아있는 챌린지 크루당 1개 partial unique)·`user_goals`(unique(user,challenge,type), **setup 단계만 쓰기 = 기록 보존**) + `start_challenge`(전원 KPI 게이트)·`cancel_challenge`(생성자)·`finalize_challenge`(KST 종료일 지나야) RPC.
- `lib/challenge.ts`: CRUD·지난 KPI 불러오기·`getPeriodStatsByUser`(기간 실적: 운동일·볼륨·거리·시간·맨몸횟수 — tz dayKey로 기간 필터)·`actualForGoal`.
- 챌린지 탭: 없음→만들기 시트 / setup→내 KPI·참여자 현황·전원 게이트 / active→내 진행률만(🔒 타인 잠금)·D-day / ended→시상대(👑)+상세 순위 카드.
- **미구현(Phase 6으로)**: 등수변동 알림(§18 Phase 5 항목이지만 notifications 테이블이 Phase 6) — 진행중 비공개라 실질 발동은 종료 시점, Phase 6 알림함과 함께.
- **결정 변경 (2026-07-17, 사용자)**: ① KPI 입력은 "하루량 × 주 N일 → 기간 총량 자동계산"이 기본(총량 직접 입력 토글 유지, `cdac252`). ② **volume(총볼륨)은 챌린지 목표 선택지에서 제외** — 부위·종목별 중량이 달라 기간 목표로 감 잡기 어려움(계획서 §7 "volume 포함" 결정 변경). DB·점수 산식·과거 데이터 렌더링은 유지, UI 선택지만 제거. ③ **reps = '총 반복 횟수'로 확장** — 맨몸 전용이 아니라 웨이트+맨몸 완료 세트 회수 합(`86f58c7`). 웨이트 유저 추천 = 운동 시간·총 반복 횟수.
- 한계(기록): 진행중 타인 진행률 숨김은 UI 레벨 — 완료 세션 자체는 크루 공개 데이터라 API로는 계산 가능. 실사용 리스크 낮음, §6 취지는 충족.

### Phase 4 산출물 (2026-07-16~17)

- **인증사진** (`a1a6e1a`): 0005 마이그레이션(버킷 2개 SQL 생성·workout_images+RLS·storage 정책·`set_workout_verification` RPC — 사진 존재해야 인증 인정). 완료 화면에서 촬영/앨범 → `lib/image.ts` 압축(≤1280px JPEG) → 비공개 업로드 → 오버레이 스탬프(화면만). 세션당 1장(unique). 달력 스탬프 ✓→🔥/● 자동 전환 확인(E2E).
- **지난 운동 복사** (`1f3281d`): 달력 상세 시트 "📋 복사" → 종목·세트 구조를 오늘 draft로(완료 여부 초기화), 운동 탭 자동 전환. 온보딩 게이트 401 경합 재시도 수정 포함.
- **E2E 스크립트**(scratchpad, puppeteer-core+Chrome): 신규유저→온보딩→운동완료→달력→복사 / →사진 업로드→● 스탬프. 새 세션에서 재작성 필요하면 위 흐름 참고.

- **달력 완료** (커밋 `9e540ef`):
  - `lib/domain/calendar.ts` — completed 세션 → tz 기준 날짜별 스탬프·월간요약·달성률. **순수함수 TDD 16케이스**(자정·월·연 경계 포함). unit 총 **63 tests**.
    - `computeDayStamps` / `sessionsInMonth`(제네릭) / `sessionsOnDay`(제네릭·상세시트·복사용) / `summarizeMonth`.
    - **달성률 정의**: `min(1, 운동일수 / (weeklyGoal/7 × 그달일수))` — 주간목표를 월 일수로 환산한 기대치 대비. (사용자 확인 완료)
  - `lib/workout.ts getCompletedSessions(userId)` — 완료 세션 + 종목명 조회(`CalendarSession = CompletedSession + {id, exerciseNames}`). 스탬프의 read-time 원천.
  - `components/record/calendar-view.tsx` — 월간요약(횟수·총시간·달성률)·‹오늘›월이동·인증수준별 스탬프(🔥카메라/●업로드/✓없음)·횟수뱃지·오늘강조·날짜 탭 상세 시트.
  - record 페이지: **운동/달력 서브탭** 추가(`subTab` state).
  - **verification은 아직 전부 none** — 인증사진 미구현이라 모든 스탬프가 ✓. 사진 붙으면 자동으로 🔥/● 전환(계산·표시 로직 준비됨).

### Phase 3 산출물 요약

- `supabase/migrations/0004_workout_core.sql` — exercise_catalog(시드 29종)·workout_sessions·workout_exercises·workout_sets + RLS + active 유니크 부분 인덱스 + start/complete/cancel RPC. **status/started_at/completed_at은 컬럼 권한으로 클라 쓰기 차단**(RPC는 security definer라 통과), 세트 completed_at은 트리거가 서버시간 기록.
- `lib/domain/volume.ts`(완료 세트만·유형별 분리)·`lib/domain/streak.ts`(5일 소멸·단계 판정) — TDD 47 tests.
- 기록 탭: 검색/직접만들기 시트·세트 입력(직전값 복사·직전 기록 프리필)·휴식 사전설정+카운트다운 바·경과 타이머·이전 대비 볼륨.
- 임시저장: localStorage(`gnd-workout-draft:{userId}`) 자동 저장 + 마운트 시 서버 세션 상태와 대사(다른 기기 완료/취소 반영, 로컬 유실 시 active 세션 재입양). 운동·세트 DB 기록은 완료 시 일괄 저장.
- `scripts/rls-test.mjs` 15 → 40케이스 확장 — 2026-07-16 실DB 40/40 통과.

## 환경 · 실행

- 저장소: `C:\Users\SAMSUNG\workout-app` (git 로컬 전용, 리모트 없음)
- 스택: Next.js 16 App Router · TS strict · Tailwind v4 · pnpm · Vitest
- 실행(PC만): `pnpm dev` → http://localhost:3000
- **실행(폰 테스트 포함)**: `pnpm exec next dev -H 0.0.0.0` 후
  - 같은 와이파이: `http://192.168.219.104:3000` (DHCP라 변동 가능 — `ipconfig`로 확인)
  - Tailscale(외부에서도): `http://100.85.240.15:3000`
  - 두 IP는 `next.config.ts allowedDevOrigins`에 등록돼 있음. IP가 바뀌면 거기도 갱신할 것.
  - 방화벽: 포트 3000 Private 프로필 인바운드 허용 규칙("GND dev server 3000 (Private)") 추가돼 있음 (Tailscale 경로용). Node.js Public 허용은 원래 있었음(와이파이 경로용).
  - 2026-07-17 확인: 최초 `/home` 컴파일은 느린 파일시스템 경고와 함께 약 20초 걸렸지만 이후 Wi-Fi·Tailscale 주소 모두 HTTP 200(약 0.4초). 첫 접속만 기다릴 것.
- 검증: `pnpm lint` · `pnpm typecheck` · `pnpm test` · `pnpm build`
- Supabase: 프로젝트 `cjdskubyxlnojwzhwbfx`, 익명 인증 ON, 키는 `.env.local`(커밋 안 됨)
- RLS 검증: `node scripts/rls-test.mjs` — 현재 107개 검사, 2026-07-18 기준 107/107 통과. 브리핑 통합: `node scripts/briefing-integration-test.mjs` — 8/8 통과.

## DB 마이그레이션 절차 (중요)

CLI/DB 비밀번호 없음 → **사용자가 SQL Editor에 수동 붙여넣기**로 적용한다.
`supabase/migrations/` 번호 순서대로. 새 마이그레이션 만들면 사용자에게 "파일 열기 → 전체 복사 → SQL Editor → Run"으로 안내.
Storage 버킷도 SQL로 생성 가능했음(`insert into storage.buckets`, 0005) — Dashboard 수동 생성 불필요.

**적용 현황 (2026-07-18):**
- 0001~0006: 적용 완료 (재실행 금지)
- 0007(body_part·qualifier): 적용 완료 확인 ✅ (2026-07-17, 검증 쿼리 세 컬럼 모두 true)
- 0008(measure·카테고리 goal_type): 적용 완료 ✅
- 0009(burnfit 시드): 적용 완료 ✅ (2026-07-17, "Success. No rows returned" 확인)
- 0010(맨몸 루틴 6종 시드): 적용 완료 ✅ (2026-07-17, REST 조회로 6/6 확인)
- 0011(소셜: events·reactions·cheers·notifications 등): 적용 완료 ✅ (2026-07-17 "Success" 확인)
- 0012(꾸준왕 열람권 view_record RPC): 적용 완료 ✅ (2026-07-17, RLS 107/107로 확인)
- 0013(브리핑 dedupe_key·finalize ranks 존중): 적용 완료 ✅ (2026-07-18, briefing-integration-test 8/8 + 프로덕션 크론 dedupe 검증으로 확인)
- 컬럼 추가·시드 위주라 idempotent 안전장치(`on conflict`, `if not exists` 성격) 있는 편이나, 재실행 시 `alter table add column`은 중복 에러 → 각 파일 1회만.

## 코드 구조 요약

- `src/app/(tabs)/` — 하단 5탭 화면 (home/feed/record/challenge/profile)
- `src/app/(tabs)/record/page.tsx` — 운동 기록 화면 전체 (상태·타이머·완료 흐름)
- `src/app/onboarding/` — 3단계 온보딩 · `src/app/invite/[code]/` — 초대 링크 자동 합류
- `src/components/record/` — exercise-picker(검색/직접만들기 시트)·exercise-card(세트 테이블)·rest-bar(휴식 카운트다운)·**calendar-view(달력 서브탭 전체)**
- `src/components/` — auth-provider(익명인증, 실패 사유 error로 노출)·onboarding-gate·tab-bar·crew-card 등
- `src/lib/domain/` — 순수 함수 + TDD (time·invite-code·volume·streak) ← 새 도메인 로직은 여기에 TDD로
- `src/lib/workout.ts` — 세션/카탈로그/세트 데이터 헬퍼 + localStorage 임시저장 + `localId()`(uuid 폴백)
- `src/lib/crew.ts` — profiles/groups 헬퍼 · `src/lib/supabase/` — browser/server 클라이언트

## 누적 교훈 (재발 방지)

1. **INSERT ... RETURNING은 SELECT 정책 검사를 받는다** — 생성 직후 본인이 못 읽는 정책이면 42501. owner 조건을 SELECT 정책에 포함할 것 (0002).
2. **plpgsql `returns table(...)` 컬럼명이 실제 테이블 컬럼과 겹치면** 42702 ambiguous → `#variable_conflict use_column` (0003).
3. RLS는 반드시 실제 2인 픽스처로 검증 — 코드 리뷰가 아닌 실행 테스트로만 발견되는 버그가 있다.
4. eslint `react-hooks/set-state-in-effect` — effect 안 동기 setState 금지. localStorage 프리필은 lazy useState 초기화, 시트 초기화는 언마운트→마운트로.
5. **폰 실기기 테스트(IP 접속)는 두 가지가 함께 막는다**: ① Next 16은 크로스 오리진 dev 리소스를 기본 차단 → 하이드레이션 자체가 안 됨(화면은 SSR 초기 상태로 박제, 에러도 안 뜸) → `allowedDevOrigins` 등록. ② http+IP는 비보안 컨텍스트 → `crypto.randomUUID`·`crypto.subtle` 없음 → `lib/workout.ts localId()` 폴백 사용.
6. **Windows 방화벽은 인터페이스 프로필별로 먹는다** — 이 PC는 와이파이=Public, Tailscale=Private. Node 허용이 Public에만 있어서 Tailscale 접속만 타임아웃됐음. 포트 3000 Private 허용 규칙로 해결.
7. **카카오톡 인앱 브라우저는 HTML에 속성을 주입**해 하이드레이션 경고(1 Issue 오버레이)를 띄운다 — 실제 오류 아님. `layout.tsx`의 html/body에 `suppressHydrationWarning` 적용해 억제. dev 오버레이는 프로덕션에선 안 뜸.
8. **개발 서버 실행 중 `pnpm build`를 동시에 돌리지 말 것** — 둘 다 `.next`를 사용해 기존 dev 서버가 3000번 포트를 잡은 채 요청에 응답하지 않는 상태가 발생했다. 최종 검증은 dev 서버를 먼저 종료하고 build를 실행한 뒤, 실기기 테스트가 더 필요하면 dev 서버를 새로 시작한다.
9. **Vercel env 등록에 PowerShell 파이프 금지** — `$val | vercel env add`는 인코딩 프리앰블(BOM, U+FEFF)이 값 앞에 섞여 저장되고, 그 값이 fetch 헤더에 들어가는 순간 "String contains non ISO-8859-1 code point"로 익명 인증이 통째로 깨진다. 반드시 Bash에서 `printf '%s' "$VAL" | pnpm dlx vercel env add NAME production`. 배포 후엔 번들에서 값 주변 바이트를 od로 확인하면 확실하다.
10. **렌더 중 `Date.now()`·`new Date()` 호출은 purity 린트 위반** — "오늘" 기준값은 lazy `useState(() => ...)`로 마운트 시 1회 고정한다 (streak-card의 todayKey, feed의 dateRef 전례).

## Phase 6 산출물 (2026-07-17, `fbd86b4`~`9f822ec`)

- **0011_social.sql** (적용 완료 ✅): workout_events·reactions·cheers·notifications·notification_settings·record_views + RLS + `send_cheer`(3회/10초 쿨다운)·`poke_user`(24h 1회) definer RPC + 반응 알림 트리거 + start/complete/cancel_workout·finalize_challenge 대체(이벤트·알림 추가) + notifications Realtime publication.
- `lib/domain/social.ts`(TDD 8): `activeSessionIds`(6h 유령 컷)·`unreadCount`. `lib/social.ts`: 피드·반응 토글·응원·찌르기·알림함·`subscribeNotifications`(구독마다 유니크 토픽 — 재사용 시 크래시, `9f822ec`).
- UI: `feed/page.tsx`(피드+페이지네이션)·`components/feed/`(feed-item·reaction-bar·active-workout-cards)·`cheer-banner`(레이아웃 장착)·`notification-bell`(홈·피드 헤더)·crew-card 찌르기(✅/👉콕). `lib/time-ago.ts` 공용화.
- 검증: unit 104 · RLS 102/102 · E2E 2인 14/14(scratchpad `e2e-phase6.mjs`, 익명세션 쿠키 파싱→REST 픽스처→UI·Realtime 단언 — 재작성 시 이 흐름 참고) · build.
- **운동 추가 다중 선택**(`4d60413`): 피커 탭=✓ 토글, [선택한 n개 운동 추가] 일괄 추가, 직접 만들기=생성 즉시 선택 담김. 실브라우저 스모크 5/5.
- **실기기 확인 통과 (2026-07-17, 계정 2개)**: ①진행중 카드 ②응원 배너 실시간 수신 ③스팸 제한 안내(쿨다운·3회 상한) ④완료 카드·반응 토글 ⑤찌르기→알림 도착 ⑥알림함 뱃지·일괄 읽음 ⑦운동 다중 선택 — 7항목 전부 통과.
- E2E가 잡은 실버그 1건: 배너·벨이 같은 Realtime 채널 토픽을 재사용해 페이지 크래시 → 토픽 유니크화로 수정(`9f822ec`).
- **후속(별도 계획)**: 꾸준왕 성과 열람 UI+record_viewed 알림, 홈 위젯(스트릭 카드·주간 stat·오늘 그룹 현황·꾸준왕), notification_settings UI(Phase 7).

## Phase 6 설계 기록 (계획서 §9·§18)

**설계·계획 완료 (2026-07-17):**
- 스펙: `docs/superpowers/specs/2026-07-17-phase6-social-design.md` (핵심 결정: 알림=definer RPC+트리거, 응원 스팸제한=send_cheer RPC, Realtime=notifications 단일 구독, 진행중 카드=workout_events)
- 계획: `docs/superpowers/plans/2026-07-17-phase6-social.md` (Task 1 RLS 테스트 → 2 도메인 TDD → 3 I/O → 4 피드 → 5 응원·배너 → 6 찌르기·알림함 → 7 검증)
- `supabase/migrations/0011_social.sql` — 커밋·DB 적용 완료 ✅ (당시엔 미적용 상태로 설계 후 사용자 SQL Editor 적용, 0007·0009 전례).
- 꾸준왕 열람 UI·홈 위젯은 후속 계획(record_views 테이블만 0011에 선반영).

원래 백로그(참고):
1. 마이그레이션 **0011**(0007~0010 사용됨): `reactions`(unique(session,user,type))·`cheers`(sender≠receiver, 크루 active 세션만)·`notifications`+`notification_settings`·`workout_events` + RLS(§14: 타인용 알림은 service_role만… MVP는 definer RPC로 대체 → 스펙 결정 1)
2. **그룹 피드**: 크루 공개 completed 최신순 — 인증사진(signed URL)·요약(볼륨·시간)·현재 스트릭·반응
3. **이모지 반응** fire/clap/like: 추가·취소·중복방지·낙관적 UI
4. **운동 시작 알림 + 진행 중 카드**: start_workout RPC에 workout_events·크루 알림 추가(0004 RPC 수정 마이그레이션), 피드/홈 진행 중 카드
5. **응원(cheer, Realtime)**: active 세션에 응원 → Realtime 인앱 배너. 스팸 제한(세션당 3회·10초 쿨다운·본인 금지)
6. **찌르기**: 오늘 미운동 크루원 찌르기 → 알림
7. 알림함(🔔+뱃지) + 등수변동 알림(Phase 5 이월분)
8. 검증: RLS(스팸·크루 경계) + E2E(2인: A 시작→B 응원→A 완료→B 피드 반응) + lint·typecheck·build

**실기기 스모크 (아직 안 한 것)**: 폰에서 사진 인증 → 달력 🔥/● 확인, 챌린지 2인 흐름(폰+PC로 KPI 게이트·진행중 잠금 확인)
