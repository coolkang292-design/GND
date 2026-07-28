# GND 진행 기록 (새 세션 시작용)

> 새 세션은 이 파일 + `C:\Users\SAMSUNG\Desktop\Workout app\IMPLEMENTATION_PLAN.md`(단일 진실)만 읽으면 바로 이어서 작업할 수 있다.
> 시각 스펙: 같은 폴더의 `운동앱-목업.html`.

## ✅ 2026-07-28 — 크루 연결 그래프: 닉네임 검색 · 상호 수락 (운영 배포 ✅)

설계 `docs/superpowers/specs/2026-07-28-crew-link-graph-design.md` · 계획 `docs/superpowers/plans/2026-07-28-crew-link-graph.md`(12 태스크). **"같은 그룹이니 크루" → "닉네임으로 찾아 서로 수락했으니 크루"**. 마이그레이션 **0038·0039·0040 운영 적용 ✅**. 그룹은 지우지 않았다 — 챌린지가 아직 그룹 기반이라 의미만 축소했다.

- **왜 두 개로 쪼갰나** — 0038(추가만·무해) 적용 후 `/crew` 화면을 먼저 배포해 실기기로 확인하고, 그 뒤 0039(전환)로 넘어갔다. 한 번에 하면 "요청도 안 되고 피드도 비어 있는" 상태에서 원인을 못 가른다.
- **0038** — `crew_requests`(요청 이력) + `crew_links`(수락된 연결, `user_a < user_b` 정규화라 쌍 하나 = 행 하나) + `is_crew_with()` + RPC 8개. 쌍 단위 `pg_advisory_xact_lock`으로 동시성 3종(상호 동시수락 데드락·상호 동시요청 시 자동수락 불발·두 번 탭의 raw 23505) 차단. 거절 후 **7일 재요청 쿨다운**(에러코드는 `request_exists` 재사용 — 거절 사실을 숨긴다). 기존 3명 → **3쌍 백필**, 재실행이 해제한 사이를 되살리지 않게 `where not exists` 가드.
- **0039 — 전환 지점이 계획서의 9곳이 아니라 11곳이었다.** 마이그레이션 전수 조사로 찾았다. 계획서에 **없던 2곳**: `session_crew_shared`(0011:84 — `workout_events`·`cheers` SELECT를 여는 헬퍼. 피드 "운동 중" 카드의 판정 원천)와 `send_cheer`(0011:319 — 안 고치면 크루끼리 응원 불가, 혼자모드는 영영 응원받지 못함). 계획서에 **있었지만 뺀 1곳**: `record_views` insert 정책 — 0012가 이미 지웠다. 정책 이름도 정정(`profiles_select_self_or_crew` → 실제 `profiles_select_own_or_crew`) — 틀린 이름이면 `drop`이 조용히 no-op 하고 옛 그룹 정책이 OR로 살아남아 전환이 무효가 된다.
- **🔴 DB 리뷰(opus)가 잡은 블로커** — `workout_session_crew_visible`의 자기접근. 옛 판정 `is_group_member(s.group_id, auth.uid())`는 세션 주인 본인에게 true였는데 `is_crew_with`는 `check (user_a < user_b)` 때문에 자기 자신에겐 구조적으로 **항상 false**다. `reactions` 정책 두 개가 앞단에 self 분기가 없어(거기 `user_id`는 세션 주인이 아니라 "반응을 누른 사람") 그대로 뒀으면 **내 카드의 반응이 0으로 뭉개지고 내 카드엔 반응을 못 달았다** — 알림은 트리거가 definer라 계속 와서 눈치채기 어렵다. `send_cheer`의 `own_session`이 `session_not_found`로 새던 것도 같이 고쳤다.
- **혼자모드 알림이 0건이던 것도 같이 고쳤다** — 팬아웃 3곳이 `group_id is not null` 게이트를 통과해야 발송되는데 혼자모드는 `group_id`가 null이라 지금까지 한 건도 안 나갔다. "혼자 시작 → 나중에 크루 추가" 흐름이 이제 실제로 성립한다.
- **0040 — 챌린지 성과 열람을 "지정한 한 명"으로**(사용자 요청). 5일 연속 달성으로 열리는 2시간 창에서 전원 순위표가 통째로 보이던 것을 "내 성과 + 고른 한 명"으로 좁혔다. 그 창 동안 바꿀 수 없다(자유롭게 바꾸면 사실상 전원 열람). 선택 목록엔 점수를 노출하지 않는다. **한계**: 순위 점수는 클라가 `user_goals`·`workout_sessions`를 읽어 직접 계산하고 그 RLS는 여전히 그룹 기준이라 **화면 규칙이지 데이터 경계가 아니다** — 진짜 경계는 챌린지 개편 때.
- **검증 실측**: unit **517/517**(54파일, 483에서 +34) · typecheck · lint 0 · build ✅ · 실 DB `crew-link-check` **53/53** · `challenge-peek-check` **11/11** · `crew-profile-check` 8/8 · `record-beaten-test` 9/9 · `badge-point-check` 14/14 · `xp-bonus-check` 6/6. 기존 스크립트 3개는 픽스처가 그룹으로만 엮여 있어 크루 연결 단계를 더했다(rls-test 25실패 → 6). **rls-test에 남은 6건은 0039와 무관한 기존 노후** — 찌르기 3건은 0028의 `poke_requires_workout`(B가 자기 운동을 완료한 적 없음), 챌린지 3건은 0025의 전원 동의 단계가 스크립트에 아예 없음.
- **레벨업 팬아웃도 결국 런타임으로 검증했다** — 계획서는 "재현 불가"로 보고 구조 확인(`pg_get_functiondef` grep)으로 대체하라고 했다. 정상 운동 경로로는 맞다(Lv.2가 200 XP인데 하루 최대 150, 같은 날 두 번째 운동은 0 XP). 하지만 `apply_xp_and_progress`는 `public·anon·authenticated`에서만 회수돼 있고 **`service_role`은 회수 대상이 아니다** — service_role로 직접 부르면 XP를 한 번에 크게 줄 수 있고 팬아웃이 그대로 돈다. `crew-link-check` [51]~[53]이 이걸 검증한다(`reason`은 0022가 허용 목록으로 제약하므로 `admin_adjustment`를 쓴다). **팬아웃 3종 전부 런타임 검증됨.**
- **배포 사고** — Vercel이 커밋 이메일(`atty2@naver.com`)을 GitHub 계정에 매칭하지 못해 `Deployment Blocked`. GitHub에 이메일 추가·인증(A안)도, noreply 이메일로 커밋(B안)도 통하지 않았다. **`git archive HEAD`로 추적 파일만 `.git` 없는 임시 폴더에 풀고 거기서 배포하면 통과한다**(C안) — git 메타데이터가 없으면 매칭할 이메일도 없다. 다음 배포도 이 방법으로.
- **범위 밖**: 챌린지 개편(내가 만들고 크루를 초대하는 방), 차단(block), 크루 추천·수 상한, QR·링크로 크루 맺기, 앞글자 검색, `profiles` SELECT RLS의 `or shares_group_with(id)` 제거(챌린지 랭킹판 닉네임 때문에 한시 유지).

## ✅ 2026-07-27 — 업적(배지) 퀘스트 UX v2.0 (운영 배포 ✅)

설계=사용자 피드백 13항목, 계획 `docs/superpowers/plans/2026-07-27-badge-quest-ux.md`. 배지 화면을 "도감"에서 **다음 목표·진행률·남은수치·희귀도·완료율의 퀘스트 화면**으로. 서브에이전트 구동(구현 태스크별 에이전트 + opus 최종 리뷰)으로 실행. 마이그레이션 **0036·0037 운영 적용 ✅**. 배포 `gnd-5txy2wpe3-gnd4.vercel.app` Ready.

- **진행 지표 원천 = 판정과 같은 SQL(0036)** — 진행바의 "7/10"은 사용자 현재 지표가 필요한데, `evaluate_badges`가 이미 내부에서 계산하던 지표 6종 집계를 `badge_metrics(uuid)`로 빼고 `evaluate_badges`도 그걸 부르게 리팩터(DRY). 클라는 `get_my_badge_metrics()`로 읽는다. 진행바와 실제 지급이 갈라지는 "조용한 버그"를 원천 차단. 신규 `scripts/badge-metrics-check.mjs`가 RPC↔직접집계를 실계정으로 대조.
- **희귀도(0037)** — `badge_definitions.rarity`(common/rare/epic/legend/mythic) 컬럼 + 30종 seed. 분포 common 8·rare 9·epic 7·legend 5·mythic 1. 이름 2건 변경(서울 탈출·반도 횡단), 설명은 사실 한 줄("운동 30회 달성")로 통일(이전 위트 설명 대체 — 위트는 이름이 담당).
- **도메인(`src/lib/domain/achievements.ts`, 순수·TDD)** — `Achievement` 모델, `buildAchievements`(진행률·남은수치·반복배지 다음배수 목표), `selectNextGoal`(미획득 1회성 중 진행률 최고·동률 시 보상), `categoryCompletion`·`overallCompletion`, `toDisplayUnit`(분→시간·kg→톤·m→km)·`toRemainingDisplay`(올림).
- **UI** — 최상단 `NextGoalCard`(다음 목표), `BadgeSheet` 재작성(전체·카테고리 완료율 바 + 배지별 진행바·현재/목표·남은수치·희귀도 pill·보상·잠금 "🔒 앞으로 N"), `ProgressBar`·`RarityPill` 분리, 획득 연출 자리(`badge-earn-animation.tsx`) 구조만.
- **최종 리뷰가 잡은 2건 수정**: (1) 불꽃처럼 지표가 내려가는 배지는 이미 획득해도 "3/30일(10%)"로 보이던 모순 → 획득한 1회성은 완료로 고정. (2) 남은수치 반올림이 "앞으로 0시간"으로 뭉개지던 것 → `toRemainingDisplay` 올림으로 최소단위 보장.
- **검증 실측**: unit **483/483**(49파일, 이전 462에서 +21) · typecheck · lint 0 · build ✅ · 실 DB `badge-metrics-check` 4/4 · `badge-point-check` 14/14 · `streak-parity` 불일치 0건(판정 DRY 리팩터 무영향 확인) · `/profile` 200 · 번들 grep(`다음 목표`·`앞으로`·`EPIC`·`MYTHIC`·`보유 배지`).
- **범위 밖**: 보상 확장(프로필 테두리·아이템 해금 — 구조만 여지), 획득 애니메이션 실제 연출(자리만), 아이템 상점.

## ✅ 2026-07-27 (후속) — 크루원 프로필 배지 개선 + 배포 소식 알림 (운영 배포 ✅)

배지·포인트 배포 직후 사용자 요청 2건. 커밋 `d80dd63`·`8572794`·`e9ce66c`.

- **크루원 프로필은 보유 배지만 + 의미·보상** (`d80dd63`) — 남의 프로필(`MemberProfileBody`)에서 미획득·자물쇠를 빼고 보유한 것만 리스트로 진열한다. 각 항목에 배지 그림·이름·**의미(설명)**·**획득 보상(+포인트)**를 함께 보여 그 사람이 무엇을 어떻게 땄는지 한눈에 보이게 했다. 미획득을 목표로 진열하는 동기 설계는 **본인 성장 허브 전체 시트에만** 남긴다(남과 나의 목적이 다르다). SSR 테스트로 보유만 표시·미획득 숨김·설명·보상 문구 고정.
- **배포 소식 알림 + 새 소식(`/whats-new`)** (`8572794`, 마이그레이션 **0034 적용 ✅**) — 배포 내용을 알림으로 띄우고 클릭 시 릴리스 노트 상세로 보낸다. `app_update` 알림 유형 추가(0034가 `notifications_type_check` 확장), 푸시 url→`/whats-new`, 인앱 알림함 행을 **클릭 가능**하게(탭하면 그 유형 상세로 — 푸시든 인앱이든 성립). 발송은 `scripts/broadcast-release.mjs`가 전 사용자에 알림 insert → 0016 트리거가 구독자에게 푸시. **실측**: 4명 인앱 도달·`pushed_at` 전부 기록, 구독 보유 3명에 웹푸시.
- **릴리스 알림 프로세스 굳힘** (`e9ce66c`) — 사용자 요청 "매번 새 기능마다 업데이트 알림". 릴리스 노트를 `src/lib/domain/release-notes.data.json` **단일 원천**으로 두고(화면·알림·스크립트가 같은 파일), 발송 스크립트가 **최신 항목을 자동으로 읽어** 아직 안 보낸 것이면 보낸다(제목=릴리스로 **멱등**, 재실행 안전). **새 기능 배포 절차 = ① 그 json 맨 앞에 항목 추가 → ② `pnpm release:notify` (미리보기) → `pnpm release:notify -- --send`**. 0034 같은 새 타입이 필요 없는 한 매 배포에 이 두 단계면 끝.
- **검증 실측**: unit **462/462**(43파일) · typecheck · lint 0 · build ✅ · `/whats-new` 200(릴리스 내용 SSR) · 배포 `gnd-g34yem2xt-gnd4.vercel.app` production Ready.

## ✅ 2026-07-27 — 배지 30종 + 포인트 경제 (운영 배포 ✅)

설계 `docs/superpowers/specs/2026-07-27-badge-catalog-and-point-economy-design.md` · 계획 `docs/superpowers/plans/2026-07-27-badge-catalog-and-point-economy.md`. 배지를 3개 → **30종**으로 늘리고 **포인트 경제**를 붙였다. 마이그레이션 **0031·0032·0033 운영 적용 ✅**. 배포 `gnd-jdfmnf0if-gnd4.vercel.app` production Ready → `gnd-one.vercel.app` 별칭.

- **0031 스키마 + 배지 30종 seed** — 배지 조건을 `badge_definitions` **테이블**로 둬 30종을 SQL 함수에 하드코딩하지 않는다(배지 추가 = seed 한 줄). `user_badges` PK를 `(user_id, badge_key, period_key)`로 확장해 반복 획득을 담고 기존 2건은 `period_key='lifetime'`으로 보존. `point_transactions` 원장 + `user_wallet`.
- **0032 판정·지급 엔진** — 포인트는 **운동마다 100 + 배지 보너스**(배지에서만 나오면 다 딴 순간 수입이 끊기고 ⚡배수가 곱할 대상을 잃는다). 불꽃은 **홈 🔥와 같은 사슬 규칙**(`current_streak_days`가 `domain/streak.ts`와 동일), 불꽃 배지는 **5일마다 스택**(재달성 방식이면 배지를 더 받으려 5일 쉬는 게 이득이 된다). 반복 배지 멱등키 = **달성한 날(KST)**. 하루 2번째 운동은 **XP·포인트 모두 0**. RPC가 `pointsAwarded·pointMultiplier·streakDays·newBadges`를 완료 응답에 실어 준다.
- **0033 기존 실적 소급** — 판정은 운동 완료 때만 도므로 이미 쌓인 실적에 1회 돌려 도입 즉시 진열대를 채웠다(`evaluate_badges` 멱등). 사용자 Run 실측: 오뎅끼데스까 7종·스칼레또 6종·낭만송곳니 1종.
- **화면**: 내 정보 성장 허브에 **포인트 3칸**(잔액·⚡배수·🔥연속)·**배지 진열**·**전체 시트**(30종 지표별 묶음, 미획득은 비유 문구) 배선. 불꽃은 홈과 같은 `currentStreak()`으로 계산해 화면끼리 안 어긋난다. 운동 완료 모달에 `xp → point → badge` 순차 이벤트 추가. 배지 진열을 **기록 탭에서 프로필로 일원화**(`badge-shelf.tsx` 삭제). 크루원 프로필 시트도 새 시그니처(`badgeShelf(catalog, earned)`) + 배지 이미지.
- **조용히 틀릴 수 있는 3곳 = 테스트로 고정**: 불꽃 SQL↔TS(`scripts/streak-parity-check.mjs`), 배수 구간표 SQL↔`point-summary.tsx` TIERS(`point-summary.test.tsx` 경계 10개), 배지 키↔이미지 파일명(`badge-keys.test.ts`). 배지 이미지 `public/badges/` 30장(384², 파일명=`badge_key`).
- **검증 실측**: unit **455/455**(42파일, 이전 438에서 +17) · typecheck · lint 0 · build ✅ · 실 DB `badge-point-check.mjs` **14/14** · `streak-parity-check.mjs` **불일치 0건** · 배포 번들 grep(`GND 포인트`·`포인트 배수`·`보유 배지`·`아직 획득한 배지가 없어요`) 4/4 · `/home`·`/feed`·`/record`·`/profile` 200.
- **커밋**: `0b0ce5d`(배지 이미지) · `266e188`(0031) · `98d7bbf`(0032) · `a63c9ce`(실DB검증) · `7028b0e`(카탈로그 DB 단일원천) · `62c9789`(포인트요약·배지진열) · `e7b35b6`(프로필 배선·기록탭 정리) · `cbfd687`(완료 모달 포인트·배지) · `2ec0a8a`(0033).
- **계정 정리 (운영 DB 직접, service_role · 사용자 요청)** — 사용자 지정으로 실사용 4계정만 남기고 정리했다. **auth 28→4명** · profiles 9→4개 · groups 7→1개(리얼GND). 삭제: 지정 5명(오뎅끼·눈·ㄹ홀·리라·웅, 각 1인 '불꽃 크루' 4개 + 눈의 챌린지 1개 연쇄) + **프로필 없는 익명 orphan 24개**(온보딩 미완 세션, `RLS테스트크루` 2개 포함). 남긴 4명 = 오뎅끼데스까·스칼레또·낭만송곳니·repro-mry7tyx0. 삭제 전 "크루에 보존 멤버가 있으면 중단"·"보존 4계정이 프로필을 갖는지 단언" 안전장치 통과. 리얼GND(멤버 3명) 온전.
- **범위 밖 (다음 스펙)**: 아이템 상점·구매·장착(포인트 `spend` 쪽은 스키마만·UI 없음), 가격표 재산정(설계 §5.4 — 목업 롤렉스 1,500P가 운동당 100P×배수 수입 구조와 안 맞음), 드림 아이템 진행바, 포인트 내역 화면(`getRecentPointTransactions`는 만들어 뒀으나 미사용), 프로필 5개 섹션 재배치.

## ✅ 2026-07-26 — XP 보너스 버그 2건 + 콕 게이트 + 레벨업 알림 + 크루원 프로필 시트 (운영 배포 ✅)

마이그레이션 **0026~0029 운영 적용 ✅**. 커밋 `69598a6`·`8e28d7b`·`0ac26ac`·`9db6242`.

- **🔴 기록 완성 보너스가 유산소를 차별하고 있었다 (0027)** — 사용자 신고 "60분 넘게 했는데 130밖에 안 들어옴"에서 출발. `v_rec`가 "완료 세트 중 `reps`가 null인 것이 없을 것"을 요구했는데 **유산소·시간 종목 세트는 설계상 reps가 null**(거리·시간으로 기록)이다. 실측: 오뎅끼데스까 7/25 세션은 웨이트 21세트를 전부 횟수까지 채웠는데 **트레드밀 1세트(1920초·3700m) 때문에 10점이 0점**이 됐다. 설계 `specs/2026-07-23-...-design.md` §5·6·8은 이미 "유산소는 앱 필수값 충족 시 인정"이라 규정했고 **구현만 그 문장을 빠뜨린 것**. 0024가 `is_valid_workout`에서 같은 유산소 차별을 이미 고쳤던 것과 같은 계열이다. 수정: 완료 세트는 **실적(횟수·시간·거리) 중 하나라도 있으면** 충족. 기존보다 엄격해지는 경우가 없어 회귀 위험 0. 검증 후 7/26 세션이 `기본 100 + 시간 30 + 기록 10 = 140 XP`로 실제 지급됨을 폰에서 확인.
- **🔴 인증사진 10 XP를 아무도 못 받고 있었다 (클라 전용)** — 완료 RPC의 사진 판정은 **완료 시점에 사진 행이 있어야** 참인데, `VerificationPhoto`는 **완료 화면에만** 있어 사진은 항상 완료 뒤에 올라온다(실측 15초 후). 후등록용 `award_workout_photo_xp`(30분 창)가 0022에 있었으나 **`grep -rn "award_workout_photo_xp" src/` = 0건** — 호출부가 없었다. 배포 이후 `reason='workout_photo'` 거래 **총 0건**. 업로드 성공 직후 호출하도록 배선하고 토스트에 `· 인증 사진 +10 XP`를 붙였다.
- **콕 발신자 게이트 (0028)** — 오늘 운동을 마친 사람만 찌를 수 있다. 안 하는 사람이 하는 사람을 재촉하던 구조를 뒤집는다. 사람당 하루 1회 제한은 유지(사용자 확정). 운동 전에는 버튼 비활성 + `오늘 운동을 마치면 크루를 콕 찌를 수 있어요 👉` 안내(숨기지 않고 규칙을 알린다).
- **레벨업 크루 알림 (0029)** — `apply_xp_and_progress`가 레벨이 바뀌는 **유일한 지점**이라 여기 한 곳에 넣어 모든 경로(운동 완료·사진 XP)를 덮었다. 단계 진화를 겸하면 문구가 달라진다(`🎉 …님이 진화했어요!`). 본인 제외, 혼자모드면 0행. 푸시 탭 → `/profile`. **함정**: `reference_id`(uuid)에 타입 없는 `null`을 넣어 text로 추론돼 42804로 죽었고 **완료 트랜잭션 전체가 롤백**됐다 — 사용자가 실제로 "종료가 안 됨"을 겪음. `null::uuid`로 수정. 단위 테스트로는 안 잡히는 종류라 실 DB 스크립트가 값을 했다.
- **크루원 프로필 시트 (0026)** — 설계 `specs/2026-07-26-crew-member-profile-sheet-design.md` · 계획 `plans/2026-07-26-crew-member-profile-sheet.md`. 피드 카드·홈 크루 카드에서 크루원을 누르면 단계·레벨·진행률·누적 XP·배지 현황을 바텀시트로. `user_progress`·`user_badges` 둘 다 본인 전용 RLS라 정의자 RPC `get_crew_member_profile` 하나로 **레벨+배지를 합쳐** 반환(왕복 1회, 권한 검사 1곳). RPC는 `badge_key`만 주고 이름·이모지는 클라 카탈로그가 붙여 **배지 46개 확장 시 SQL 무수정**. 레벨은 캐시값 대신 `totalXp`로 재계산 — 내 정보 화면과 같은 `getLevelProgress`를 써야 숫자가 안 어긋난다. 크루 카드는 프로필 버튼과 콕 버튼을 **형제**로 둔다(감싸면 버튼 중첩으로 HTML이 깨짐).
- **검증 실측**: unit **438/438**(40파일, 이전 423에서 +15) · typecheck · lint 0 · build ✅ · 실 DB **xp-bonus 6/6**(적용 전 4/6) · **poke-levelup 10/10** · **crew-profile 8/8** · 배포 번들 grep 9/9 · `/home`·`/feed`·`/record`·`/profile` 200. 테스트 계정 전부 정리, 실계정 미접촉.
- **XP 소급 완료 (0030 적용 ✅)** — 사용자 요청으로 전 계정 정합성 감사를 먼저 돌렸다(원장SUM↔캐시 · 레벨컷 · 완료이벤트 · 배지 = 전부 이상 없음). 감사가 **세 번째 버그를 하나 더 찾았다**: 스칼레또 7/23 세션(유산소 걷기 37분·1세트)이 **0024 이전 "완료 세트 3개 이상"만 유효** 규칙에 걸려 0점이었다. 0024가 규칙은 고쳤지만 피해 세션을 소급하진 않았던 것. 0030은 금액을 하드코딩하지 않고 **SQL이 지금 규칙으로 재판정해 차액만** 지급한다 — (A) 보너스 누락은 `admin_adjustment`, (B) 무효 판정 피해는 `earn`+`historical_backfill`+`reward_group='daily_workout'`으로 넣어 **`xp_daily_workout_reward_unique` 인덱스가 하루 1회 제한을 DB 레벨에서 강제**하게 했다. (C) `user_progress`는 원장 SUM으로 재계산. **소급으로 레벨이 올라도 크루 알림은 보내지 않는다**(정정은 사건이 아니므로 `apply_xp_and_progress` 우회). 실측 **총 210 XP**(오뎅끼데스까 30 · 스칼레또 150 · 낭만송곳니 20 · 오뎅끼 10), 스칼레또는 Lv.2로 상승. **가동 이후 전 세션 재검증 불일치 0건**(무효 세션은 0점 유지 = 과다 지급 없음). 곁들여 `getRecentXpTransactions`가 `transaction_type='earn'`만 조회해 정정 거래가 화면에서 사라지던 것도 고쳤다 — 누적 XP만 조용히 늘고 이유를 알 수 없으면 안 된다.
- **알아둘 것**: `scripts/`의 검증 스크립트 중 세션별 지급액을 보는 것은 **원장 합계 기준**으로 봐야 한다. 소급은 원본 `workout_completed` 거래의 metadata를 고치지 않고 별도 거래로 쌓으므로, 원본 metadata만 보면 영원히 "미지급"으로 보인다.

## ✅ 2026-07-24 — 혼자모드 + 챌린지 동의 게이트 + 성과 열람권 개편 (운영 배포 ✅)

계획 `docs/superpowers/plans/2026-07-24-challenge-consent-and-performance-pass.md`(§1 결정 3건 모두 권장안 확정: **엄밀 연속 5일 · 크루 전체 순위판 · 달성 시각부터 2h**). 세 작업 모두 커밋·배포·검증 완료. 배포 `gnd-qjdgtrrj0-gnd4.vercel.app` production Ready.

- **리라 → 리얼GND 크루 제거** (운영 DB 직접, service_role): 리라는 목표 0개라 동의 게이트를 영구 차단하므로 크루에서 제거(계정은 유지·크루 멤버십만 삭제). 리얼GND = 오뎅끼데스까(owner)·스칼레또·낭만송곳니 **3명**.
- **혼자모드** (`7842d29`): GND는 이미 크루 없이 기록·XP·성장이 되도록 설계됨(`workout_sessions.group_id` nullable, RLS도 null 허용). 유일한 관문이 **온보딩의 크루 강제**였다. ① 온보딩 crew 스텝에 "혼자 시작하기(나중에 크루 참여)" 탈출구 ② 크루 없을 때 홈 `CrewCard`가 null 대신 **NoCrewCard**(만들기/초대코드 참여) 렌더 — 앱 내 최초의 크루 진입점(피드·챌린지의 "홈에서 참여" 안내가 이제 실제로 동작). 브라우저 E2E로 혼자 유저 홈(캐릭터·기록·스트릭 전부 정상) 확인.
- **Phase A — 목표 상호 동의 게이트** (`68096ed`, 마이그레이션 **0025 운영 적용 ✅**): `challenge_goal_approvals` 테이블 + RLS(크루만 조회, 직접 쓰기 차단) + `approve`/`unapprove_challenge_goals` RPC + `start_challenge` 재정의(**전원 목표 + 전원 동의** 게이트, 미달 시 `consent_incomplete`). setup UI에 참여자별 동의 배지·내 동의/철회 버튼·전원 동의 시에만 "시작" 활성화. 실 DB `node scripts/challenge-consent-test.mjs` **20/20**(멱등·철회·직접쓰기 차단·비크루 조회 차단·active 전환). 브라우저 E2E로 동의→게이트 해제 확인.
- **Phase B — 성과 열람권 개편** (`25dddec`): 열람 자격을 **엄밀 연속 5일**(`hasConsecutiveWorkoutDays`), 창을 **2시간**(`challengePassStatus`, `CHALLENGE_PASS_HOURS=2`)으로. 홈 **ChallengePerformanceCard** — 챌린지 active일 때만, 평소 순위판을 블러+🔒+"N/5일"로 가리고 5일 연속 달성 시각부터 2h 크루 전체 순위판 공개, **D-day 항상 표시**. **보안**: 잠금 상태에선 `getActiveChallengeRanking`을 호출하지 않아 순위 데이터가 클라에 안 내려감(블러는 시각 처리일 뿐). B2(view_record 2h RPC)는 D2=순위판 확정으로 **건너뜀**. KingCard는 렌더만 제거하고 파일 보존(롤백 대비). 도메인 TDD + 브라우저 E2E로 잠금/언락 양쪽 확인.
- **검증 실측**: unit **423/423**(38파일, 이전 412에서 +11) · typecheck · lint 0 · build ✅ · 배포 번들 grep 4/4(`크루 전원의 목표에 동의하기`·`전원 동의 대기 중`·`챌린지 크루 성과`·`5일 연속 운동하면 열려요`) · `/home`·`/challenge`·`/onboarding`·`/record` 200. 테스트 계정 전부 정리(잔여물 0), 실계정·리얼GND 미접촉.

## ✅ 2026-07-24 — 배포 후 핫픽스 3건 (스트릭 문구·운동 종료 버그·홈 레이아웃)

XP 시스템 배포 직후 사용자 실사용에서 나온 이슈 3건을 고쳐 재배포했다.

- **🔴 "종료했는데 200분 넘게 운동중" — 진짜 원인 (마이그레이션 0023 필수)** — 진행 중 카드(`active-workout-cards`)는 세션 status가 아니라 **`workout_events`로 완료를 판정**한다(`activeSessionIds`: workout_started 있고 닫는 이벤트 없으면 시작 후 6h까지 '운동 중'). 구 `complete_workout`(0011)은 완료 시 `workout_completed` 이벤트를 남겼지만 **`complete_workout_v2`(0022)는 안 남긴다**. 그래서 v2로 완료한 운동은 크루 피드에 최대 6시간 '운동 중'으로 남는다. 실 DB 확인: 스칼레또 7/23·오뎅끼 7/23 세션(=배포 후 v2로 완료된 유일한 2건)만 `events=[workout_started]`, 나머지 전부 `[started,completed]`. **클라에서 workout_events insert 권한 없음(정의자 RPC 전용) → 서버 수정만 가능.**
- **운동 종료 400 버그 (같은 계열)** — **0 XP로 완료된 세션**(당일 2번째·완료 세트 3 미만)을 재종료하면 v2가 원장 없다고 `incomplete_xp_processing`(400)을 raise. 재시도·중복탭·새로고침 복구로 draft가 완료 세션을 가리키면 종료 불가에 갇힘. 재현: `scripts/finish-repro.mjs`.
  - **수정 ①(즉시 배포 `5b48716`)**: `finishWorkout` 래퍼가 '이미 완료' 오류를 잡아 completed면 조용한 성공 처리. `handleFinish` 종료 재진입 가드. → 갇힌 사용자 다음 종료 탭에서 탈출.
  - **수정 ②(⚠️ SQL 적용 필수)**: `supabase/migrations/0023_fix_complete_workout_v2.sql` — (A) v2 완료 경로에 **workout_completed 이벤트 insert 추가**(200분 버그 근본 해결) (B) replay 분기가 원장 없어도 idempotentReplay 반환(400 해결) (C) 이미 이벤트 없이 완료된 세션 **백필**(대상 2건 확인). **0022 수정 금지라 새 파일. SQL Editor에 붙여넣고 Run 1회 — 적용 전까지 모든 v2 완료가 6h '운동 중'으로 남으므로 이번 건은 선택이 아니라 필수.**
- **스트릭 문구 오류** — 커밋 `7837755`. d4 단계는 "어제 운동했고 오늘만 아직"인데 문구 3개가 전부 "어제 쉬셨다"로 단정. gap과 일수가 d4만 하루 밀려 있었다. STAGE_MESSAGES는 아침 브리핑 푸시와 공용이라 알림에도 나갔다. 카드 부제(사실)와 경고 배너(재촉)가 같은 문장을 반복하던 것도 분리. 회귀 테스트로 옛 문구 되돌리면 실패 확인.
- **홈 레이아웃** — 커밋 `58811e5`. 캐릭터/레벨 카드를 "운동 시작하기" 바로 아래로 이동(사용자 요청).
- **검증**: unit **409/409**(37파일) · typecheck · lint 0 · build ✅ · 배포 번들에서 종료 복원 로직 반영 확인. 배포 `gnd-ll0n2nn9g-gnd4.vercel.app` production Ready, `/home`·`/record` 200.

## ✅ 2026-07-23 — XP·35레벨·7단계 캐릭터 시스템 (Task 1~14 완료 · **운영 배포 ✅**)

- **문서**: 설계 `docs/superpowers/specs/2026-07-23-xp-level-character-system-design.md` · 계획 `docs/superpowers/plans/2026-07-23-xp-level-character-system.md` · 인수인계 `docs/superpowers/HANDOFF-2026-07-23-xp-system.md`.
- **배포 완료 (2026-07-23)**: `feat/xp-level-character-system` → main **fast-forward 병합**(11커밋, `ba79ef8`) → `pnpm dlx vercel deploy --prod --yes` → `gnd-oiutfai04-gnd4.vercel.app` ● Ready(target production). `/home`·`/profile`·`/record`·`/feed` 전부 **HTTP 200**, `char-1.png` 200(**248,857B** = 최적화본이 실제로 서빙됨).
- **번들 실검증(교훈 9 절차)**: 배포된 청크에서 `7단계 캐릭터 진화`·`판을짜개`·`성장 타임라인`·`준비 중`·`XP 획득 방법` 전부 확인. 홈 카드는 `` `오늘 운동하면 최대 ${MAX_DAILY_WORKOUT_XP_NOW} XP` `` 로 상수 참조하며, **옛 하드코딩 "최대 180 XP"는 0건**.
- **실기기 검수에서 잡힌 것 1건 (`ba79ef8`)**: "7단계 안내 ›"가 캐러셀로 스크롤만 해서, 캐러셀이 이미 화면에 보이는 위치라 **아무 동작도 하지 않았다**(계획서 지시대로 만든 결과). 라벨이 약속하는 설명이 실제로 없었으므로 `StageGuideSheet`(7단계 전체 · 캐릭터 · 레벨구간 · 상태설명 · 해금 XP · 남은 XP)를 만들고, 진입점 3개(현재단계 "7단계 안내 ›" · 캐러셀 헤더 `?` · 캐러셀 타일 — 뒤 둘도 눌러도 무반응이었다)를 여기에 연결했다.
- **Phase A 엔진 (Task 1~8B)**: `0022_xp_level_system.sql` **운영 DB 적용 완료 → 절대 수정 금지**(추가 변경은 0023+). 5테이블·RLS·35레벨 seed·`complete_workout_v2`(멱등)·`apply_xp_and_progress`(공통)·`award_workout_photo_xp`·`is_valid_workout`(내부전용). 성장 레벨(영구 1~35, `domain/progression.ts`)은 **챌린지 레벨(임시 1~5, `domain/level.ts`)과 완전 별개**.
- **Phase B 화면 (Task 9~13)**: 홈 캐릭터 카드 · **내 정보 성장 허브**(7단계 캐러셀·현재 단계·레벨 혜택·다음 단계 미리보기·성장 타임라인·최근 XP 내역, 알림 설정은 우상단 톱니로 이동) · **XP 획득 방법 시트** · **운동 완료 순차 이벤트 모달**(xp → level_up → stage_up → reward).
- **완료 경로 교체**: `completeWorkout` → **`completeWorkoutV2`**. 타바타 자동 완료도 `handleFinish`를 지나므로 같은 경로로 XP를 받는다. v2는 세션 행을 안 주므로 완료 시각·소요 시간은 `getSessionById`로 다시 읽는다(조회 실패해도 완료 흐름은 막지 않음).
- **정정 — 최대 XP는 180이 아니라 160**: 홈 카드가 "최대 180 XP"라고 안내했지만 운영 RPC가 `v_plan := 0`이라 계획 완료 +20이 **지급되지 않는다**. 실제 상한 = 100+40+10+10 = **160**. `MAX_DAILY_WORKOUT_XP_NOW`로 단일화했고, 0023에서 계획 XP가 실제 지급되면 180으로 올린다. 지급 안 되는 XP를 지급되는 것처럼 안내하지 않는다(修正17).
- **"준비 중" 규칙(修正2)**: `reward_status='coming_soon'` 혜택은 레벨을 넘겨도 "해금됨"이 아니라 **"준비 중"** 배지로만 표시한다. `data_only`는 노출하지 않는다. 핵심 기능(기록·피드·통계)은 Lv.1부터 전부 열려 있다.
- **캐릭터 이미지 최적화**: char-1~7+fallback이 각 ~2MB(1086×1448, 총 16.9MB)라 Next Image 최적화가 느려 프리뷰 스크린샷이 타임아웃됐다. sharp로 600×800 + 팔레트 양자화 → **1.88MB(-89%)**. 파일명·확장자는 유지(DB `character_path`가 `.png`로 seed됨). 실측: 캐러셀 7장 최적화 **1.6초**, w=128 각 12.8KB.
- **검증 실측 (2026-07-23, 배포 직전 main에서)**: unit **392/392**(34파일, 이전 358에서 +34) · typecheck · lint 0 · build ✅ · **실 DB `node scripts/xp-test.mjs` 15/15**(멱등·RLS·타바타·DB↔TS 미러·360분·내부함수 보호, 픽스처 자동 정리).
- **커밋**: `139df4a`(이미지 최적화) · `5303389`(160 정정) · `ce632f7`(XP 시트) · `f3770bb`(성장 허브) · `783bd3d`(완료 모달+v2 경로) · `cf8b91c`(문서) · `ba79ef8`(7단계 안내 시트).
- **검수 방식**: Vercel **프리뷰 배포**(`target: null`, Production 무영향)로 실기기 확인 후 배포했다. Preview 환경에 공개 키 2개(`NEXT_PUBLIC_SUPABASE_URL`·`ANON_KEY`)만 넣었고 서비스 롤 키는 넣지 않았다. 프리뷰는 Vercel SSO로 보호되므로 계정 로그인 후 접근한다.
- **알려진 것**: 성장 타임라인에 **날짜는 없다** — 0022에 레벨 이력 테이블이 없어 추정 날짜를 지어내지 않았다. 레벨·누적 XP·상태만 보여준다.
- **배포 후 폰 확인 잔여**: 푸시 알림·아침 브리핑 크론은 프리뷰에서 검증하지 않았다(VAPID·CRON_SECRET을 Preview에 안 넣음). **운영 주소에서** 기존대로 동작하는지 한 번 봐야 한다 — 이번 변경이 건드린 영역은 아니다.
- **다음**: `docs/superpowers/plans/2026-07-23-plan-completion-xp.md`(0023 계획 완료 +20). 착수 시 `MAX_DAILY_WORKOUT_XP_NOW`를 **160 → 180**으로 올리는 것도 함께.

## ✅ 2026-07-21 — 기록 갱신을 종목별 판정으로 교체

- **문서**: 설계 `docs/superpowers/specs/2026-07-21-per-exercise-record-beaten-design.md` · 계획 `docs/superpowers/plans/2026-07-21-per-exercise-record-beaten.md`.
- **왜 바꿨나**: 세션 총합 비교는 ①종목 구성이 하나만 달라도 판정 자체를 안 하고 ②종목을 빼면 유리해지는 악용 경로가 있었으며 ③"볼륨 +300kg"이 어느 종목인지 알 수 없었다.
- **새 규칙**: 종목마다 **그 종목의 직전 기록**(최근 20세션, 타바타·당일 세션 제외)과 비교. 문구는 실제로 변한 항목으로 쓴다 — 세트↑ → "N세트 더", 무게↑ → "Nkg 더 무겁게", 횟수↑ → "N회 더". 조사(을/를)는 받침으로 고른다.
- **알림**: 세션당 **1건**으로 묶는다. 대표는 개선율 최대 종목, 나머지는 "외 N종목 갱신". **개선폭 문턱 없음**(사용자 확정 — 1회만 더 해도 발송).
- **0021 적용 ✅**: `mark_record_beaten`의 문구 길이 40 → 80, 알림 body가 `{닉네임}님이 {문구}. 칭찬 한마디 남겨주세요! 👏`. 배지 로직은 0020과 동일.
- **쿼리 개선**: 완료 시 이력 전체를 긁던 것을 종목 이름으로 묶어 **쿼리 2회**로 줄였다 — 이전 백로그 항목 해소.
- **알려진 한계**: 시간은 분 단위 정수 입력이라 플랭크 60초→90초 같은 개선은 잡히지 않는다(1분→2분이어야 함).
- **검증 실측**: unit 314/314 · typecheck · lint 0 · build · RLS 107 · 예정표 15 · 사진 8 · 브리핑 8 · 푸시 8 · 기록갱신 9/9 · 배지 9/9.
- **커밋**: `09daf4e`(도메인 TDD)·`f03dbe4`(배치 조회)·`e0e3537`(완료 흐름)·`be750b6`(0021)·`8f7cb29`(실 DB 검증).
- **실기기 확인 대기**: 같은 종목을 지난번보다 1회 더 하고 완료 → 완료 화면에 종목 이름 든 문구 · 피드 🏅 · 크루 폰 "○○님이 △△를 N회 더 하셨어요" 푸시.

## ✅ 2026-07-21 — 비프음 2배 + 칭찬 알림 + 배지 시스템 (0020 적용 ✅, 운영 배포 ✅)

- **문서**: 설계 `docs/superpowers/specs/2026-07-21-beep-boost-praise-badges-design.md` · 계획 `docs/superpowers/plans/2026-07-21-beep-boost-praise-badges.md`. 브랜치 `feat/beep-badges`(main 미병합).
- **비프음 2배** (`9e9d1f2`): `BEEP_GAIN` 0.25 → **0.5**. 음악에 여전히 묻힌다는 사용자 신고. 사인파 단일 오실레이터라 0.5에서도 클리핑 없음(호출 간격 1초 > 최장 비프 0.35초라 중첩도 없음).
- **판정 범위 확대** (`c618bd6`·`ab56dea`·`75e6d84`): 복사 예정표뿐 아니라 **종목 이름 집합이 똑같은 내 직전 완료 세션**과 자동 비교. `findComparableSession` TDD 10케이스(집합 일치·순서 무관·최근 우선·동점은 먼저 만난 것·타바타 제외·자기 자신 제외). 타바타는 세트 실적이 0이라 후보가 되면 정상 후보를 가리므로 뺀다. 복사 원본(`sourceSessionId`)이 있으면 그쪽 우선 — 기존 동작 보존.
- **칭찬 CTA** (0020): 크루 알림이 `🏅 기록 갱신! 칭찬해주세요` / `…님이 지난 기록을 넘었어요 — {문구}. 칭찬 한마디 남겨주세요! 👏`.
- **모으는 배지** (`51020e9`·`5c74f8a`·`dcbff0e` + **0020 적용 ✅**): `user_badges`(PK `user_id,badge_key`) — authenticated에겐 **select만** 부여해 앱에서 위조 불가, 지급은 definer RPC 경로 전용. `mark_record_beaten`이 갱신 횟수 1·5·10 도달 시 지급하고 **새로 얻었을 때만** 본인에게 `badge_earned` 알림 1건. 기록 탭 달력 상단 진열대, 미획득은 🔒.
- **배지 늘리는 법**: `src/lib/domain/badges.ts` 카탈로그에 한 줄 + 새 마이그레이션에 임계값 한 줄. **임계값은 SQL이 단일 원천**이고 TS는 표시 메타만 갖는다(양쪽에 두면 어긋날 때 조용히 틀림). 키 불일치는 `src/lib/badge-keys.test.ts`(`42dc295`)가 마이그레이션을 파싱해 잡는다 — 오타 주입으로 실제 검출 확인함.
- **검증 실측 (2026-07-21)**: unit **311/311**(29파일) · typecheck · lint 0 · build · RLS **107/107** · 예정표 **15/15** · 사진 **8/8** · 브리핑 **8/8** · 푸시 **8/8** · 기록갱신 **8/8** · **배지 9/9**(지급·중복 방지·직접 insert 차단·타인 배지 비노출).
- **배포 완료 (2026-07-21)**: `feat/beep-badges` → main 병합(`b0e477a`) 후 `pnpm dlx vercel deploy --prod --yes` → `gnd-a85ggzm4p-gnd4.vercel.app` Ready(target production). `/home`·`/record`·`/feed` 전부 **HTTP 200**. 번들 실검증: 청크에서 `linearRampToValueAtTime(.5,s+.01)` 확인 — 새 음량 0.5가 실제로 배포됨(교훈 9 재발 방지 절차).
- **남은 게이트 — 폰 확인만 남음(배포 주소 기준, 아직 미확인)**: ①음악 재생 중 휴식 비프음이 들리는지(아이폰은 **벨소리 모드**여야 함) ②같은 구성으로 직전보다 더 한 운동 완료 시 완료 화면 축하·피드 🏅·크루 폰 "칭찬해주세요" 푸시 ③달력 상단 배지 진열대와 첫 배지 획득. **0.5도 부족하면 `BEEP_GAIN`만 올려 재배포하면 된다.**
- **백로그 (이번에 알면서 남긴 것)**: ①복사가 아닌 운동을 완료할 때마다 `getCompletedSessions`로 **완료 이력 전체를 무제한 조회**한다 — 세션이 수백 개면 완료 탭 지연이 커진다. 쿼리 제한·`pastSessions` 캐시 재사용·`setResult` 이후로 판정 미루기 중 택일. ②`mark_record_beaten`은 **클라이언트가 계산한 문구를 그대로 믿는다**(0018부터). 마음먹으면 빈 세션으로 배지 파밍·칭찬 알림 스팸이 가능하다. 근본 해결은 서버에서 총량 재계산. 3인 사적 크루 기준으로 수용 중.

## ✅ 2026-07-19 — 5초 휴식 비프음 + 운영 배포 완료

**앱 프로덕션: https://gnd-one.vercel.app** — 이번 배포로 **5초 휴식 비프음, 챌린지 사진 인증·레벨, 달력 운동 예정표**가 모두 운영에 반영됐다. 남은 것은 재배포가 아니라 배포 주소에서의 폰 확인뿐이다.

- **5초 비프음 (A안)**: 웨이트·맨몸 휴식 5·4·3·2초 짧은 `삠` + 1초 긴 `삐임`, 음성 나레이션 없음, 유산소는 휴식 타이머·비프음 제외 유지. `getRestCountdownBeep` 짧은 비프 범위만 2~5초로 확장(구현 `f70d3b6`, main 병합 `7c62f8a`). TDD RED→GREEN, 스펙 리뷰·코드 품질 리뷰 통과, 사용자 폰+이어폰 실기기 확인 완료(2026-07-19).
- **배포 직전 전체 게이트 (실측)**: unit **229/229**(21파일) · typecheck · lint(오류 0, 무해 경고 2 — briefing-integration-test.mjs 본체+워크트리 사본) · build · RLS **107/107** · workout-plan **15/15** · challenge-photo **8/8** · briefing **8/8**. DB 0001~0015는 기적용이라 재실행하지 않음.
- **배포 결과**: `pnpm dlx vercel deploy --prod --yes` → 배포 `gnd-57c1ffnw4-gnd4.vercel.app` `● Ready`(target production), `https://gnd-one.vercel.app/home`·`/record` HTTP **200** 확인.
- **iOS 오디오 후속 수정 (같은 날, `43f038a` + 재배포)**: 배포 확인에서 아이폰 무음 스위치가 웹 비프음을 통째로 음소거하는 문제 발견(교훈 11). 실기기 실험으로 `navigator.audioSession`(iOS 17+) 유형별 트레이드오프 확정 후 사용자 결정 = **음악 공존 우선**: `transient` 세션 선언 + 비프 게인 0.06→0.25(음악에 묻힘 방지). 멜론 재생 중 비프음 공존을 dev 실기기에서 확인(진단 로그 `resume:ok(running)→play:beep`). 재배포 `gnd-amopssaai-gnd4.vercel.app` `● Ready`, `/record` 200, 번들에 `transient`·`.25` 반영 확인. **아이폰은 벨소리(소리) 모드여야 비프음이 난다 — 무음 모드 무성은 iOS 정책상 정상.**
- **배포 후 폰 확인 항목(배포 주소 기준)**: ①휴식 비프음 5초 패턴 — 벨소리 모드 + 음악 재생 중 공존까지 ②새 챌린지 사진 인증 안내·진행 중 내 레벨·종료 후 전원 레벨 ③달력 복사→날짜 선택→예정 표시→당일 운동 준비 흐름.

- **전문가 평가·강화 패스 (`e80a04a` + 최종 배포 `gnd-kajhy44t1`)**: 배포 전 3축 평가(보안 96 · 코드/테스트 94 · UX/운영 95 → 종합 95/100) 후 보완 — ①비프 창·길이 상수화 ②CRON_SECRET 타이밍 안전 비교(sha256+timingSafeEqual, 운영에서 유효 200/무효 401 검증) ③`src/lib/supabase/admin.ts`에 `server-only` 가드(클라 import 시 빌드 실패) ④lint 경고 0 달성. 남은 백로그: record/page.tsx(823줄) 분할, 오프라인 캐시(P1).
- **프로덕션 데이터 전체 초기화 (2026-07-19, 사용자 승인)**: 테스트 잔여물 전부 삭제 — groups 39 · auth 익명 유저 112 · workout-images 파일 44. 16개 테이블+auth 전부 0 검증, 운동 카탈로그 77종 유지. 리셋 후 신규 익명 가입·온보딩 정상 확인(확인용 계정도 삭제, 최종 0명). **크루 온보딩 대기 상태.** 순서 주의: groups 먼저(owner_id FK 비cascade) → auth 유저(cascade) → storage.
- **운동 순서 이동 완료 (2026-07-19, `1223059`~`6b44b21` + 배포)**: 설계 `docs/superpowers/specs/2026-07-19-exercise-reorder-design.md` · 계획 `docs/superpowers/plans/2026-07-19-exercise-reorder.md`. 운동 카드 제목 0.5초 길게 누르기 → "운동 순서 이동" 바텀시트(부위|이름 + 🗑 + ≡ 드래그 핸들, 완료 세트 있으면 삭제 확인). `lib/domain/reorder.ts` moveItem TDD 9케이스 + `hooks/use-long-press.ts` TDD 7케이스(10px 이동·조기해제 취소). draft 배열만 재배열 — 세트 기록·휴식 타이머는 운동별 uuid 키라 무영향, localStorage·완료 저장 순서 자동 반영. 검증: 전체 267/267·typecheck·lint 0·build, 실기기(준비/운동 중 드래그·새로고침 유지·🗑) 확인 후 운영 배포 200. 와이파이 IP .104→.112 재변동(allowedDevOrigins에 둘 다 등록됨).
- **새 운동 계획 짜기 완료 (2026-07-19, `33bf4b5` + 배포)**: 설계 `docs/superpowers/specs/2026-07-19-new-workout-plan-design.md`. 달력 오늘 이후 날짜 → "➕ 새 운동 계획 만들기" → 기록 탭과 같은 피커(검색·직접 만들기·지난 기록 탭=복사 파이프라인 재사용)로 예정표 생성. 0015가 source null을 이미 허용해 **마이그레이션 불필요**. `newPlanExercises` TDD 3케이스.
- **🏅 기록 갱신 보상 완료 (2026-07-19, `7c65128`~`2278918` + 0018 + 배포)**: 설계 `docs/superpowers/specs/2026-07-19-record-beaten-design.md`. 복사 예정표 운동 완료 시 원본 세션과 유형별 합계 비교(웨이트 볼륨→맨몸 횟수→맨몸 시간→거리→유산소 시간, **원본에 실적 있던 지표만**) → 초과 시 완료 화면 축하 + 피드/달력 🏅 뱃지 + 크루 알림·푸시. draft v4(`sourceSessionId`), `lib/domain/record-beaten.ts` TDD 11케이스, **0018**(record_note 컬럼·notifications type에 record_beaten 추가·mark_record_beaten definer RPC) 적용 ✅ — `scripts/record-beaten-test.mjs` **8/8**(위조·재마킹·빈 문구 차단, 크루 알림 생성, 본인 제외). 판정/알림 실패는 완료 흐름을 막지 않음. 배포 직전 전체 게이트: unit 283/283 · RLS 107 · 예정표 15 · 사진 8 · 브리핑 8 · 푸시 8 · 실기기 확인. 후속 백로그(B안): 챌린지 "기록 갱신왕" 부문.
- **🔥 타바타 모드 완료 (2026-07-19~20, `e132f32`~`105b7f0` + 0019 + 배포)**: 설계 `2026-07-19-tabata-mode-design.md`·`2026-07-19-tabata-courses-design.md` · 계획 `2026-07-19-tabata-courses.md`. 사용자 제작 음원(권리 확인) 내장 — 기록 탭 🔥 타바타 → **4·8·16분 코스**(8·16분은 ffmpeg 이어붙임, 원본은 4:10으로 트림해 종료 축하 구간 제거) → 운동 4개 선택 → 음원 재생(HTML5 audio라 무음 스위치 무시, Wake Lock) → **음원 종료 시 자동 완료 기록**(구성 운동 4개 그대로) → 인증샷. **0019** 적용 ✅: `workout_sessions.tabata_minutes`(4|8|16, 컬럼 grant) + goal_type `tabata_count`. 피드·달력 "🔥 타바타 N분" 배지, 챌린지 맨몸 카테고리에 "타바타 횟수"(`tabataCount` 집계, fold TDD). 검증: unit 289/289 · 실 DB 6종 · 배포 200.
- **rls-test 잔여물 사고 (2026-07-20, `71ba64a`) — 교훈 13**: rls-test에 픽스처 정리가 없어 실행마다 계정 2개+크루가 누적돼 왔고(리셋 전 112개의 정체), 0017 닉네임 유니크 이후 잔여 "유저A"가 다음 실행과 충돌해 107 중 31개 연쇄 실패. 수정 = 닉네임 실행별 고유화 + 종료 시 크루→계정 순 자동 정리(owner FK 비cascade 주의) + 잔여물 전량 삭제. **실 DB 픽스처 스크립트는 반드시 정리까지 책임져야 한다.**
- **크루 사용 안내서**: `docs/GND-크루-사용안내.md` — 설치 먼저 → 홈 화면 앱에서 1회 가입(초대 코드 입력) → 푸시 켜기 → 사용법 → 계정 유실 주의 순 (웹 푸시·중복 가입 방지 반영, 2026-07-19 갱신).
- **웹 푸시 알림 완료 (2026-07-19, `70b7837`~`2d619ed`)**: 설계 `docs/superpowers/specs/2026-07-19-web-push-design.md` · 계획 `docs/superpowers/plans/2026-07-19-web-push.md`. 알림함에 저장되는 모든 알림을 잠금화면 푸시로 발송 — **0016**(push_subscriptions 본인 RLS + notifications.pushed_at + pg_net 트리거→`/api/push/notify`) 적용 ✅, 발송 API는 service_role 재조회·pushed_at 원자 선점·만료 구독(404/410) 자동 삭제, 도메인 TDD 16케이스(payload url 매핑·10분 창), sw.js push/notificationclick 핸들러, `lib/push.ts` 구독 헬퍼 + 프로필 "기기 푸시 알림" 토글 + 홈 1회 안내 카드. VAPID 3종 env는 `.env.local`+Vercel Production(Bash printf). **검증 실측**: unit 251/251 · push RLS 8/8(`scripts/push-rls-test.mjs`) · 발송 API invalid_id/not_found/already_pushed 경로 · **실기기 잠금화면 수신 확인**(테스트 알림 → pushed_at 마킹 → 폰 도착). 제약: 아이폰은 iOS 16.4+·홈 화면 설치 앱에서만.
- **2차 정리 (2026-07-19 오후)**: "다시 열면 처음부터" 신고 → 접속 이력 분석 결과 원인 = 익명 계정의 브라우저 저장소 분리(카톡 인앱/사파리/홈 화면 앱이 각각 별개 계정). 스칼레또는 1차 정리에서 실사용 쪽(13:44)이 삭제돼 닉네임이 옛 계정에 잠긴 상태였음 → 사용자 승인 후 스칼레또 옛 계정·낭만송곳니(크루 미합류 중복)·온보딩 미완 유령 4개 삭제. 잔존: 오뎅끼데스까·송곳니 2계정(전부 크루O). 스칼레또는 홈 화면 앱에서 재가입+초대 코드 재합류. **운영 원칙: 크루는 항상 홈 화면 앱으로만 접속.** 근본 해결(실계정 로그인)은 백로그.
- **중복 가입 정리 + 방지 (2026-07-19)**: 사파리↔홈 화면 앱 저장소 분리로 오뎅끼데스까·스칼레또 각 2계정 발생 → 사용자 확인 후 중복 2계정·빈 불꽃 크루 삭제(잔존: 리얼GND + 실사용 2계정). **0017**(닉네임 lower(trim) 유니크) 적용 ✅ — 중복 닉네임 재가입 409 차단 실검증, `upsertMyProfile`이 23505를 친절한 안내로 변환. 안내서도 "설치 먼저 → 앱에서 1회 가입" 순서로 재작성해 원인 차단.

**관련 문서**: 설계 `docs/superpowers/specs/2026-07-19-rest-countdown-beeps-design.md` · 계획 `docs/superpowers/plans/2026-07-19-five-second-rest-beeps-and-deploy.md`(체크박스 완료 처리됨).

### ✅ 운영 배포 완료 (2026-07-19) — 챌린지 사진 인증 필수 + 레벨 시스템

- **문서**: 설계 `docs/superpowers/specs/2026-07-18-challenge-photo-levels-design.md` · 계획 `docs/superpowers/plans/2026-07-18-challenge-photo-levels.md` (사용자 승인 완료, 커밋 `a727c70`·`6046890`).
- **요구사항 요약**: ①새로 만드는 챌린지는 사진 인증한 운동만 목표·참여율·레벨에 집계(기존 챌린지는 소급 없음, DB `challenges.photo_required` 컬럼) ②챌린지 기간 전용 불독 5단계 레벨(Lv.1 잠만보 불독~Lv.5 개노답 탈출) — 시작일 기준 7일 블록에 5일+ 운동하면 +1(블록당 1회), 운동일 공백 5일(스트릭 소멸 규칙 재사용)마다 -1, 챌린지 종료 시 시상대에 최종 레벨 공개.
- **구현 완료**: Task 1 레벨 도메인(`5a7aeff`) · Task 2 운동일 배열(`4af8d12`) · Task 3 사진 필수 집계(`4b7f5b4`) · Task 4 DB 보안(`872ddcc`) · Task 5 안내 UI(`a659533`) · Task 6 레벨 UI(`d3d958b`). 각 단계 리뷰 완료.
- **DB 완료**: `0014_challenge_photo_required.sql` 사용자가 SQL Editor에 적용. 실제 Storage 파일이 없는 가짜 인증 행과 연결 사진 삭제 우회를 차단하며, 새 챌린지는 `photo_required=true`만 생성 가능.
- **최종 검증**: unit **166/166** · lint · typecheck · build · RLS **107/107** · 사진 인증 통합 **8/8** · 브리핑 통합 **8/8** (2026-07-18 실측).
- **남은 게이트**: 배포 주소에서 새 챌린지 생성 안내·진행 중 내 레벨·종료 후 전원 레벨을 폰으로 확인 (배포는 2026-07-19 완료).

### ✅ 운영 배포 완료 (2026-07-19) — 달력 운동 예정표 계정 동기화

- **문서**: 설계 `docs/superpowers/specs/2026-07-18-calendar-workout-plans-design.md` · 계획 `docs/superpowers/plans/2026-07-18-calendar-workout-plans.md`.
- **구현 완료**: 과거 운동 `복사` → 오늘 이후 날짜 선택 → 날짜별 예정표 저장 → 달력 `예정` 표시 → 당일 `운동 준비하기` → 실제 완료 후 예정표 제거. 미래 예정표는 날짜 이동·삭제 가능.
- **통계 안전**: 예정표는 완료 세션과 별도 `workout_plans`에 저장하므로 실제 완료 전에는 월간 통계·챌린지·레벨에 포함되지 않는다.
- **DB 완료**: `0015_workout_plans.sql` 적용 완료. 본인만 CRUD 가능하고, 타인 세션 원본·타인 수정/삭제/RPC 이동·과거 날짜·확인 없는 교체를 차단한다.
- **검증**: unit **175/175** · lint 오류 0 · typecheck · build · 예정표 실 DB **15/15** · 기존 RLS **107/107**. 커밋 `21cb611`·`6ec7c91`·`8af3918`.
- **남은 게이트**: 배포 주소에서 폰으로 복사→날짜 선택→예정 표시→당일 준비 흐름을 육안 확인 (배포는 2026-07-19 완료).

### 폰 확인 대기 (배포 주소 https://gnd-one.vercel.app 기준, 브리핑 크론 세션분 — 위 신규 기능과 무관, 아직 미확인)
① 프로필 탭 알림 토글 5종 저장·반영 ② 피드 "사진 인증" 필터 칩 ③ 알림함 브리핑 카드(불독 아이콘) 도착(9시대 자동 발송 확인 필요 — 수동 curl로 오늘자는 이미 발송됨, 내일 아침 자동분으로 확인).

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
2. **DB 0001~0021 전부 적용 완료 — SQL 파일 재실행 금지.** (0021 = 종목별 기록 갱신 문구, 전용 실 DB 검사 기록갱신 9/9·배지 9/9 확인)
3. dev 서버는 세션 종료와 함께 꺼졌을 수 있음 → `pnpm exec next dev -H 0.0.0.0`으로 시작 (폰: `http://192.168.219.104:3000` / Tailscale `http://100.85.240.15:3000`). build 돌릴 땐 dev 서버 먼저 종료(교훈 8 — 좀비면 `taskkill /PID <pid> /F`). 와이파이 IP는 DHCP라 변동 가능(.112→.104 전례) — 안 열리면 `ipconfig` 확인 후 `next.config.ts allowedDevOrigins` 갱신. 이제 순수 표시 확인은 배포 주소로도 가능.
4. 검증 명령: `pnpm test`(**175**) · `pnpm lint` · `pnpm typecheck` · `pnpm build` · `node scripts/rls-test.mjs`(**107**, 응원 쿨다운 대기 포함 약 30초) · `node scripts/workout-plan-test.mjs`(**15/15**, 실 DB) · `node scripts/challenge-photo-test.mjs`(**8/8**, 실 DB) · `node scripts/briefing-integration-test.mjs`(**8/8**, 실 DB).
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
| 7 안정화 | 🔶 진행 중 | 브랜딩 ✅·Vercel 배포 ✅·일지 공유 ✅·피드 히스토리 ✅·브리핑 크론 ✅·알림설정 토글 ✅·피드 사진 필터 ✅·챌린지 사진/레벨 ✅·달력 예정표 ✅·5초 휴식 비프음 ✅(2026-07-19 전부 운영 배포 완료) — 남은 것: 핵심 E2E·3명 4주 실사용 |

### 챌린지 사진 인증·레벨 산출물 (2026-07-18, `5a7aeff`~`d3d958b`, 2026-07-19 운영 배포 완료)

- **레벨 계산**: `lib/domain/level.ts` TDD 15케이스. 챌린지 기간의 고유 운동일로 주간 상승·5일 공백 하락을 계산하고 1~5 범위를 유지한다.
- **사진 집계**: `PeriodStats.workoutDayKeys`를 노출하고, `photo_required=true`인 챌린지만 `workout_images`가 연결된 완료 세션을 목표·참여율·레벨에 사용한다. 기존 챌린지는 전체 완료 세션 집계를 유지한다.
- **0014 보안**: 기존 챌린지는 `false`, 새 챌린지는 `true` 기본. 앱 우회 `false` 생성, Storage 실파일 없는 사진 행, 인증에 연결된 사진 파일의 사용자 직접 삭제를 차단한다.
- **UI**: 사진 필수 챌린지 헤더·생성 시트 안내. 진행 중에는 본인 레벨만 공개하고, 종료 후 상세 순위에 전 참가자 최종 레벨을 표시한다.
- **검증**: unit 166/166 · lint · typecheck · build · RLS 107/107 · `challenge-photo-test` 8/8 · 브리핑 통합 8/8. 새 브라우저가 미로그인 상태라 실제 사용자 데이터가 들어간 레벨 화면 육안 확인은 운영 배포 후 폰 확인으로 남김.

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
- **지난 운동 복사** (`1f3281d` → `8af3918` 개선): 달력 상세 시트 `복사` → 오늘 이후 날짜의 계정 동기화 예정표로 저장. 당일에만 운동 준비 목록으로 불러오며 완료 여부는 항상 초기화한다. 실제 완료 후에만 예정표가 제거되고 통계에 반영된다.
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
- RLS 검증: `node scripts/rls-test.mjs` — 현재 107개 검사, 2026-07-18 기준 107/107 통과. 운동 예정표 통합: `node scripts/workout-plan-test.mjs` — 15/15 통과. 사진 인증 통합: `node scripts/challenge-photo-test.mjs` — 8/8 통과. 브리핑 통합: `node scripts/briefing-integration-test.mjs` — 8/8 통과.

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
- 0014(챌린지 사진 필수·인증 우회 차단): 적용 완료 ✅ (2026-07-18, challenge-photo-test 8/8 + RLS 107/107로 확인)
- 0015(날짜별 운동 예정표·본인 전용 RLS·이동 RPC): 적용 완료 ✅ (2026-07-18, workout-plan-test 15/15 + RLS 107/107로 확인)
- 0016(웹 푸시 구독·pushed_at·pg_net 발송 트리거): 적용 완료 ✅ (2026-07-19, push-rls-test 8/8 + 실기기 잠금화면 수신으로 확인)
- 0017(닉네임 유니크 — 중복 가입 방지): 적용 완료 ✅ (2026-07-19, 중복 닉네임 409 차단 실검증)
- 0018(기록 갱신 — record_note·알림 type 확장·mark_record_beaten RPC): 적용 완료 ✅ (2026-07-19, record-beaten-test 8/8 + 전체 실 DB 게이트 재통과)
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
11. **iOS 무음 스위치는 Web Audio를 통째로 음소거한다** (이어폰이어도) — 웹앱 대응은 `navigator.audioSession`(iOS 17+)뿐이며, `"playback"`은 무음을 이기지만 백그라운드 음악(멜론 등 네이티브 앱)을 끊고, `"transient"`는 음악과 섞이지만 무음 스위치를 따른다. 둘 다 만족은 네이티브 전용 옵션이라 웹에선 불가. GND는 음악 공존 우선(`transient`) + 비프 게인 0.25 채택 — 무음 모드에서 비프가 안 나는 건 정상이고, 음악에 묻히는 건 게인으로 해결한다. 브라우저 내 재생(네이버)과 네이티브 앱 재생(멜론)은 오디오 세션 동작이 다르니 실기기 확인은 네이티브 음악 앱으로 할 것.
12. **서버에서 계정을 삭제해도 클라이언트 세션은 토큰 만료 전까지 살아 있다** — 2026-07-19 데이터 리셋 직후 기존 기기들이 삭제된 계정의 유령 세션으로 동작해 온보딩 프로필 저장이 "저장 실패"로 죽었다. `getSession()`은 로컬 저장소만 보므로, 세션이 있으면 `getUser()`로 서버 실존을 확인하고 401/403이면 signOut 후 새 익명 계정을 자동 발급한다(`ea3d557`, auth-provider 테스트 4케이스). 네트워크 오류는 로컬 세션을 유지한다(오프라인 보호). 앞으로 계정을 지울 일이 있으면 이 자동 복구가 기기들을 알아서 회복시킨다.

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
