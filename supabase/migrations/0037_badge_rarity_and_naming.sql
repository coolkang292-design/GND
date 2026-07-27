-- 0037: 배지 희귀도 컬럼 + 30종 seed(희귀도·일부 이름·사실형 설명)
-- 적용: SQL Editor Run. 여러 번 안전. 0022~0036 수정 금지. 이 파일이 0037.

alter table public.badge_definitions
  add column if not exists rarity text not null default 'common'
    check (rarity in ('common','rare','epic','legend','mythic'));

update public.badge_definitions as b
set rarity = v.rarity, name = v.name, description = v.description
from (values
  ('workout_1','common','첫 발','운동 1회 달성'),
  ('workout_10','common','열 번 찍었개','운동 10회 달성'),
  ('workout_30','rare','습관이 됐개','운동 30회 달성'),
  ('workout_50','rare','쉰 번째','운동 50회 달성'),
  ('workout_100','epic','세 자릿수 클럽','운동 100회 달성'),
  ('workout_200','legend','전설이개도 고개 숙임','운동 200회 달성'),
  ('minutes_300','common','영화 세 편','누적 5시간 운동'),
  ('minutes_1200','rare','인천에서 상파울루','누적 20시간 운동'),
  ('minutes_3000','epic','이틀 꼬박','누적 50시간 운동'),
  ('minutes_6000','legend','나흘을 통째로','누적 100시간 운동'),
  ('streak_5','common','불꽃 5일','5일 연속 달성'),
  ('streak_best_15','rare','슬슬 진심이개','15일 연속 달성'),
  ('streak_best_30','epic','개근상','30일 연속 달성'),
  ('streak_best_60','epic','이쯤 되면 병이개','60일 연속 달성'),
  ('streak_best_100','legend','개도 백일잔치','100일 연속 달성'),
  ('volume_1t','common','대형견 25마리','누적 1톤 볼륨'),
  ('volume_5t','common','코끼리 한 마리','누적 5톤 볼륨'),
  ('volume_20t','rare','시내버스 두 대','누적 20톤 볼륨'),
  ('volume_50t','rare','티라노사우루스 여섯 마리','누적 50톤 볼륨'),
  ('volume_100t','epic','보잉 737 한 대','누적 100톤 볼륨'),
  ('volume_250t','mythic','자유의 여신상','누적 250톤 볼륨'),
  ('cardio_10k','common','동네 한 바퀴 백 번','누적 10km'),
  ('cardio_42k','rare','마라톤 풀코스','누적 42.195km'),
  ('cardio_100k','rare','서울 탈출','누적 100km'),
  ('cardio_250k','epic','서울에서 대구까지','누적 250km'),
  ('cardio_500k','legend','반도 횡단','누적 500km'),
  ('record_beaten_1','common','어제의 나를 이겼개','기록 1회 갱신'),
  ('record_beaten_5','rare','다섯 번 넘었개','기록 5회 갱신'),
  ('record_beaten_10','epic','기록이 무섭개','기록 10회 갱신'),
  ('record_beaten_25','legend','갱신이 취미개','기록 25회 갱신')
) as v(badge_key, rarity, name, description)
where b.badge_key = v.badge_key;

-- 확인
select rarity, count(*) from public.badge_definitions group by rarity order by 1;
