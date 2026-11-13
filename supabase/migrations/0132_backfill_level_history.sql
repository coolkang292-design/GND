-- 0132 — XP 원장으로 과거 레벨 진입 시점을 복원한다 (history_source = 'reconstructed').
--
-- 0131 뒤에 돌린다. 새 테이블에 insert만 하고 기존 행은 건드리지 않는다.
-- 원장 순서(created_at, id)의 누적 XP가 레벨 컷을 넘는 거래의 created_at이 진입 시각이다.
-- 관리자 조정(admin_adjustment)·데모 지급도 같은 원장에 있어 그대로 누적된다.
-- 트리거가 이미 적은 'actual' 행은 on conflict로 지킨다.
with t as (
  select x.user_id, x.id, x.created_at,
         sum(x.amount) over (partition by x.user_id order by x.created_at, x.id) cum
  from public.xp_transactions x
), lv as (
  select t.*, (select level from public.level_definitions
               where required_total_xp <= t.cum order by required_total_xp desc limit 1) lvl
  from t
), e as (
  select *, lag(lvl, 1, 1::smallint) over (partition by user_id order by created_at, id) prev from lv
)
insert into public.user_level_history
  (user_id, level, entered_at, entry_xp, source_transaction_id, history_source)
select e.user_id, g.level, e.created_at, e.cum, e.id, 'reconstructed'
from e, generate_series(e.prev + 1, e.lvl) g(level)
where e.lvl > e.prev
on conflict (user_id, level) do nothing;
