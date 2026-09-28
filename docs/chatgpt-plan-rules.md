# GND 운동 계획 작성 규칙 (ChatGPT 붙여넣기용)

> 사용자가 ChatGPT 프로젝트 지침에 이 파일의 "붙여넣기" 블록을 그대로 넣는다.
> 규칙이 바뀌면 여기와 `supabase/migrations/0113_interval_plan_contract_comment.sql`의
> 열 설명을 같이 고친다. 근거: `docs/superpowers/specs/2026-09-29-interval-follow-up-design.md`

## 붙여넣기

```
GND 운동 계획(public.workout_plans)을 넣거나 고칠 때 규칙:

1. 하루에 계획을 여러 개 넣어도 된다. 계획 1개 = 운동 시작 1번 = 기록 1개다.
2. 인터벌(음원) 계획은 tabata_minutes = 4, 8, 16 중 하나.
   - exercises 배열의 앞 4개가 인터벌 종목이다. 각 종목은 세트 1개, 맨몸 동작만.
     (20초 운동 / 10초 휴식으로 4종목이 번갈아 돈다. 덤벨·기구 운동을 넣지 않는다.)
   - 인터벌이 끝난 뒤 이어서 할 운동(교정·스트레칭·보강)은 5번째부터 넣는다.
     앱은 음원이 끝나면 휴식 1번 뒤 이 종목들로 넘어가고, 전부 한 기록으로 남는다.
   - 인터벌 전에 할 운동(워밍업 등)은 5번째에 넣지 말고, 같은 날 별도 계획
     (tabata_minutes = null, scheduled_at이 인터벌보다 이르게)으로 넣는다.
3. 인터벌이 아닌 계획은 tabata_minutes = null. 종목 수 1~50.
4. 종목 이름은 public.exercise_catalog에 있는 이름을 그대로 쓴다.
   없는 운동은 먼저 exercise_catalog에 is_custom = true, created_by = 사용자 id로
   만든다(name 40자 이내, body_part·exercise_type·measure는 아래 값만).
5. exercises 각 원소 모양:
   {"name": "...", "bodyPart": "가슴|등|하체|어깨|팔|코어|유산소",
    "exerciseType": "weight|bodyweight|cardio", "measure": "reps|time|null",
    "isCustom": true|false,
    "sets": [{"weightKg": 0, "reps": 10, "distanceKm": 0, "durationMin": 0}]}
   - 인터벌 종목의 reps는 앱이 코스 길이로 다시 채우므로 아무 값이나 괜찮다.
```

## 왜 이렇게 됐나 (2026-09-29)

- ChatGPT가 평일 계획 16개를 `인터벌 8분 + 종목 8개`(인터벌 4 + 어깨교정 4)로 넣었다.
  그때 앱은 인터벌 계획을 열면 목록 전체에서 카탈로그에 있는 4개만 골라 음원을 돌리고,
  나머지는 기록도 없이 버렸다. 카탈로그에 없는 이름(`Scapular Push-up Plus`)이 있던
  수요일은 8번째 `YTW`(덤벨)가 인터벌에 끼어들었다.
- 이제 앞 4개만 인터벌로 보고, 5번째부터는 음원이 끝난 뒤 같은 세션에서 이어서 한다.
  **그래서 인터벌 종목을 반드시 맨 앞 4칸에 둬야 한다.** 순서가 틀리면 DB도 앱도 알아챌 수 없다.
