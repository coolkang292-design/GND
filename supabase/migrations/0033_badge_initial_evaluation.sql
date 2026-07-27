-- 0033: 기존 사용자에게 배지 최초 판정을 1회 돌린다
-- 적용: SQL Editor에 붙여넣고 Run. **여러 번 돌려도 안전하다(evaluate_badges가 멱등).**
--
-- 왜: 0031·0032로 배지 30종이 생겼지만 판정은 운동 완료 시점에만 돈다.
--     이미 쌓인 실적(스칼레또 10회·5.4톤·18.3km 등)에 대해 한 번 돌려줘야
--     도입 즉시 진열대가 채워진다.
--
-- 반복 배지 주의: streak_5는 "오늘 불꽃이 5의 배수일 때"만 지급된다. 소급으로
-- 과거 사슬을 되짚어 여러 개를 주지는 않는다 — 과거 어느 날 불꽃이 몇이었는지는
-- 지금 데이터로 재구성할 수 있지만, 그 값이 당시 화면에 보인 숫자와 같다는 보장이
-- 없다. 앞으로 쌓이는 것만 센다.

do $$
declare
  u record;
  v_new jsonb;
  v_total int := 0;
begin
  for u in select user_id from user_progress loop
    v_new := public.evaluate_badges(u.user_id);
    v_total := v_total + jsonb_array_length(v_new);
  end loop;
  raise notice '소급 지급 배지 % 개', v_total;
end $$;

-- 확인
select p.nickname,
       count(distinct ub.badge_key) as 배지종류,
       coalesce(w.balance, 0) as 포인트
from profiles p
left join user_badges ub on ub.user_id = p.id
left join user_wallet w on w.user_id = p.id
group by p.nickname, w.balance
order by 배지종류 desc;
