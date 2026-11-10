-- 0125 (이미 운영 DB에 직접 적용됨 2026-11-11): "11월 챌린지 5만원빵" 실시간 랭킹 공개 (2026-11-11 사용자 지시)
--
-- 0115의 `guard_challenge_live_ranking` 트리거는 시작(setup 이후) 뒤 `live_ranking` 변경을 막는다.
-- 이미 진행 중인 이 챌린지 **한 건만** 예외로 켠다 — 트리거를 잠시 끄고 UPDATE한 뒤 바로 다시 켠다.
-- 한 트랜잭션이라 중간에 실패하면 트리거는 켜진 채로 롤백된다.
--
-- ⚠️ 기존 행을 바꾸는 UPDATE다 — 사용자 승인 후에만 적용한다.
-- ⚠️ `where` 조건에 id·이름·상태·현재값을 전부 건다. 다른 챌린지는 절대 건드리지 않는다.
-- ⚠️ 공개 범위의 서버 쪽 변화는 없다(0115 주석): 이 값은 화면 규칙을 켜는 스위치다.
--    참가자(3명)가 "비공개"로 알고 들어왔으므로 켜기 전에 알려 주는 것을 권한다.

begin;

alter table public.challenges disable trigger challenges_guard_live_ranking;

update public.challenges
   set live_ranking = true
 where id = '5a54034e-fbb0-4a4f-ace7-fad7e065c374'
   and name = '11월 챌린지 5만원빵'
   and status = 'active'
   and live_ranking = false;

alter table public.challenges enable trigger challenges_guard_live_ranking;

commit;
