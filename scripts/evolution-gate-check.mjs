// 로컬 PostgreSQL(WASM)만 사용. 운영 URL·.env·인증정보를 읽지 않는다.
// 임시 도구 설치/실행 방법은 docs/superpowers/evolution-gate-server-review-2026-11-13.md 참조.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
if (!process.env.GND_PGLITE_MODULE) throw new Error('GND_PGLITE_MODULE에 로컬 시험용 @electric-sql/pglite 경로를 지정하세요. 운영 DB는 사용하지 않습니다.');
const { PGlite } = require(process.env.GND_PGLITE_MODULE);
const db = await PGlite.create();
const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root),'utf8');
let passed = 0, failed = 0;
const uiFixtures = {};
async function check(name, fn) {
  try { await fn(); passed++; console.log(`PASS ${name}`); }
  catch (e) { failed++; console.error(`FAIL ${name}: ${e.message}`); }
}
const one = async (sql,args=[]) => (await db.query(sql,args)).rows[0];
const A='00000000-0000-4000-8000-000000000001', B='00000000-0000-4000-8000-000000000002';
const entry='2026-08-01T00:00:00Z', prev='2026-07-01T00:00:00Z';
const point=(name,value,day='2026-08-10',kind='r',extra={}) => ({exerciseKey:name,kind,value,day,
  completedAtMs:Date.parse(`${day}T00:00:00Z`),best:{weight:null,reps:kind==='r'?value:null,seconds:null,...extra}});
const score = async (before,after,n) => (await one('select gnd_evolution.score_points($1::jsonb,$2::jsonb,$3) as v',[JSON.stringify(before),JSON.stringify(after),n])).v;
const status=async()=> (await one('select public.get_my_stage_evolution_status() as v')).v;
const refresh=async()=> (await one('select public.refresh_my_stage_evolution() as v')).v;
const xp=async(amount,id)=> (await one("select public.apply_xp_and_progress($1,$2,'admin_adjustment',null,'test',$3,current_date,'{}') as v",[A,amount,id])).v;
async function fixture(stage=4,xp=10000) {
  await db.exec('reset role; truncate public.notifications,public.crew_links,public.workout_sets,public.workout_exercises,public.workout_sessions,public.xp_transactions,public.user_unlocks,public.streak_shield_transactions,public.user_level_history,public.user_progress,public.profiles,auth.users cascade;');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[A]);
  await db.query('insert into auth.users values ($1),($2)',[A,B]);
  await db.query("insert into public.profiles values ($1,'A','2026-01-01'),($2,'B','2026-01-01')",[A,B]);
  await db.query('insert into public.user_progress(user_id,total_xp,current_level,current_stage) values ($1,$2,(select max(level) from public.level_definitions where required_total_xp<=$2),$3),($4,0,1,1)',[A,xp,stage,B]);
  await db.query("insert into public.user_level_history(user_id,level,entered_at) select $1,1+(g-1)*5, case when g=$2 then $3::timestamptz else $4::timestamptz end from generate_series(2,$2::int) g",[A,stage,entry,prev]);
  await db.query('insert into public.crew_links values ($1,$2)',[A,B]);
  await db.exec('update public.stage_evolution_settings set enabled=true;');
  await db.query('select gnd_evolution.bootstrap_user($1)',[A]);
}
async function session(day,values={스쿼트:10},type='bodyweight',state='completed') {
  const s=(await one("insert into public.workout_sessions(user_id,started_at,completed_at,duration_minutes,status) values ($1,$2::timestamptz-interval '30 minutes',$2,30,$3) returning id",[A,`${day}T00:00:00Z`,state])).id;
  let order=0;
  for(const [name,value] of Object.entries(values)) {
    const e=(await one('insert into public.workout_exercises(session_id,exercise_name,exercise_type,sort_order) values ($1,$2,$3,$4) returning id',[s,name,type,order++])).id;
    for(let i=0;i<3;i++) await db.query('insert into public.workout_sets(workout_exercise_id,reps,is_completed) values ($1,$2,true)',[e,value]);
  }
  return s;
}
try {
  await db.exec(read('scripts/fixtures/evolution-gate-schema.sql'));
  const old=read('docs/db-current-schema.sql');
  for(const name of ['is_valid_workout','apply_xp_and_progress','complete_workout_v2']) {
    const source=old.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\$function\\$;`,'i'))?.[0];
    assert.ok(source,`현행 ${name} 정의`); await db.exec(source);
  }
  for(const name of ['0133_stage_evolution_foundation','0134_stage_evolution_evaluator','0135_stage_evolution_bootstrap','0136_stage_evolution_integration']) await db.exec(read(`supabase/migrations/${name}.sql`));
  if (process.argv.includes('--mutation-denominator')) {
    const source=read('supabase/migrations/0133_stage_evolution_foundation.sql').match(/create function gnd_evolution.score_points[\s\S]*?end \$\$;/)?.[0];
    assert.ok(source);await db.exec(source.replace('create function','create or replace function').replace('/p_n into mean','/greatest(n_filled,1) into mean'));
  }
  // 꾸준함 순수 함수: TS countSteadyWindows(evolution-gate.test.ts)와 같은 벡터. 2026-01-05=월요일.
  {
    const D=n=>new Date(Date.UTC(2026,0,5+n)).toISOString().slice(0,10);
    const wk=(w,n)=>Array.from({length:n},(_,i)=>D(w*7+i*2));
    const pat=p=>p.flatMap((n,w)=>wk(w,n));
    const sun=w=>D(w*7+6), MON=D(0);
    const vectors=[
      ['4/4 충족',pat([2,2,2,2]),MON,sun(3),1],
      ['3/4 [2,2,2,0]',pat([2,2,2,0]),MON,sun(3),1],['3/4 [0,2,2,2]',pat([0,2,2,2]),MON,sun(3),1],
      ['3/4 [2,0,2,2]',pat([2,0,2,2]),MON,sun(3),1],['3/4 [2,2,0,2]',pat([2,2,0,2]),MON,sun(3),1],
      ['2/4',pat([2,2,0,0]),MON,sun(3),0],['주 1일씩',pat([2,2,1,1]),MON,sun(3),0],
      ['8주 연속=2회',pat([2,2,2,2,2,2,2,2]),MON,sun(7),2],['7주 연속=1회',pat([2,2,2,2,2,2,2]),MON,sun(6),1],
      ['공백 뒤 한 주씩 밀기',pat([0,0,2,2,2,2,2,2]),MON,sun(7),1],
      ['끝나지 않은 구간은 세지 않음',pat([2,2,2]),MON,sun(2),0],['현재 주가 구간 마지막 주면 인정',pat([2,2,2]),MON,D(21),1],
      ['일요일+월요일은 다른 주',[D(6),D(7),D(13),D(14),D(20),D(21)],MON,sun(3),0],
      ['월요일 경계 충족',[D(0),D(6),D(7),D(13),D(14),D(20)],MON,sun(3),1],
      ['진입 주 부분 주',[D(0),D(1),D(2),...wk(1,2),...wk(2,2),...wk(3,2)],D(2),sun(3),1],
      ['진입 주 부분 주+2/4',[D(0),D(1),D(2),...wk(1,2),...wk(2,2)],D(2),sun(3),0],
      ['한 날 여러 번=1일',[D(0),D(0),D(0),D(0),...wk(1,2),...wk(2,2),...wk(3,2)],MON,sun(3),1],
      ['중복뿐이면 주 1일',[D(0),D(0),D(7),D(7),D(14),D(14),D(21),D(21)],MON,sun(3),0],
      ['운동 없음',[],MON,sun(3),0],['진입일 없음',pat([2,2,2,2]),null,sun(3),0],
    ];
    for(const [name,days,since,today,expected] of vectors)
      await check(`꾸준함 ${name} → ${expected}`,async()=>assert.equal((await one('select gnd_evolution.steady_count($1::date[],$2::date,$3::date) v',[days,since,today])).v,expected));
  }
  await check('초기 설정은 OFF',async()=>assert.equal((await one('select enabled from public.stage_evolution_settings')).enabled,false));
  await check('필요4·성장3 평균6%·수 미달',async()=>{const s=await score(['a','b','c'].map(n=>point(n,100)),[point('a',110),point('b',108),point('c',106)],4);assert.equal(s.averagePct,6);assert.equal(s.countMet,false);});
  await check('+20/+10/+1/+1 → 4개·평균8%',async()=>{const s=await score(['a','b','c','d'].map(n=>point(n,100)),[120,110,101,101].map((v,i)=>point('abcd'[i],v)),4);assert.equal(s.averagePct,8);assert.equal(s.countMet,true);});
  await check('상위 N개만 선택, 같은 종목 중복 제외',async()=>{const s=await score([point('a',100),point('a',100,'2026-08-10','t'),point('b',100),point('c',100)], [point('a',120),point('a',125,'2026-08-10','t'),point('b',110),point('c',101)],2);assert.equal(s.averagePct,17.5);assert.equal(s.filledCount,2);});
  await check('하락/동일/기준 없음은 양수 성장에 넣지 않음',async()=>{const s=await score([point('a',100),point('b',100)],[point('a',90),point('b',100),point('c',120)],3);assert.equal(s.averagePct,0);assert.equal(s.summary.unmatched[0].reason,'no_baseline');});
  await check('100%는 인정, 초과 점프는 제외하고 분모 유지',async()=>{const s=await score([point('a',100),point('b',100)],[point('a',200),point('b',201)],2);assert.equal(s.averagePct,50);assert.equal(s.summary.unmatched[0].reason,'jump');});
  await check('평균은 반올림 전 8% 직전/동일 구분',async()=>{const s=await score([point('a',100000)],[point('a',107999)],1);assert.ok(s.averagePct<8);});
  await check('유산소 같은 시간 거리10%',async()=>{const s=await score([point('트레드밀',3000,'2026-08-10','c',{distanceMeters:3000,seconds:1800})],[point('트레드밀',3300,'2026-08-11','c',{distanceMeters:3300,seconds:1800})],1);assert.equal(s.averagePct,10);assert.equal(s.selected[0].cardioComparison,'distance_at_same_time');});
  await check('유산소 같은 속도 시간10%',async()=>{const s=await score([point('사이클',9000,'2026-08-10','c',{distanceMeters:9000,seconds:1800})],[point('사이클',9900,'2026-08-11','c',{distanceMeters:9900,seconds:1980})],1);assert.equal(s.averagePct,10);assert.equal(s.selected[0].cardioComparison,'time_at_same_speed');});
  await check('유산소 느리게 오래 함은 조건부족',async()=>{const s=await score([point('사이클',9000,'2026-08-10','c',{distanceMeters:9000,seconds:1800})],[point('사이클',10000,'2026-08-11','c',{distanceMeters:10000,seconds:2400})],1);assert.equal(s.filledCount,0);assert.equal(s.summary.unmatched[0].reason,'cardio_condition');});
  await check('유산소 과거 최고 조건과 비교',async()=>{const s=await score([point('a',3000,'2026-08-10','c',{distanceMeters:3000,seconds:1800}),point('a',3600,'2026-08-11','c',{distanceMeters:3600,seconds:1800})],[point('a',3300,'2026-08-12','c',{distanceMeters:3300,seconds:1800})],1);assert.equal(s.averagePct,0);});
  await check('N0 입력은 계산 오류',async()=>await assert.rejects(score([],[],0),/invalid_required_count/));
  await fixture(1,0);
  await check('신규 사용자 시작단계 기준 생성',async()=>assert.equal((await one('select count(*)::int n from public.user_stage_history where user_id=$1',[A])).n,1));
  await check('꿈틀러 XP만 진화',async()=>assert.equal((await xp(1000,'xp1')).newStage,2));
  uiFixtures.xp = await status();
  await check('시동러 XP만 진화',async()=>assert.equal((await xp(2000,'xp2')).newStage,3));
  await check('꾸준러는 XP만으로 통과 금지',async()=>assert.equal((await xp(3000,'xp3')).newStage,3));
  await check('원장 재송신 XP·진화·알림 중복 없음',async()=>{const n=(await one('select count(*)::int n from public.notifications')).n;assert.equal((await xp(3000,'xp3')).inserted,false);assert.equal((await one('select count(*)::int n from public.notifications')).n,n);});
  await fixture(1,0);
  await check('대량 XP도 초기단계만 건너뛰고 꾸준러 보류',async()=>{const r=await xp(10000,'bulk');assert.equal(r.newStage,3);assert.equal(r.newLevel,21);assert.equal((await one('select count(*)::int n from public.user_unlocks')).n,1);assert.equal((await one('select count(*)::int n from public.notifications')).n,1);});
  await fixture();
  await check('M0은 N0 자동통과 금지',async()=>{const r=await status();assert.equal(r.state,'needs_baseline');assert.equal(r.requiredGrowthCount,null);});
  uiFixtures.preparing=await status();
  await check('조회는 이력·진행도 쓰기 없음',async()=>{const b=await one('select row_to_json(p) v from public.user_progress p where user_id=$1',[A]);await status();assert.deepEqual(await one('select row_to_json(p) v from public.user_progress p where user_id=$1',[A]),b);});
  await fixture();
  await session('2026-07-10',{a:100,b:100,c:100,d:100});
  // M=4면 비율20%의 N=1. N=4 시험은 위 순수 점수 시험에서 별도로 보장.
  await db.query('delete from public.user_stage_history where user_id=$1',[A]);
  await db.query('select gnd_evolution.bootstrap_user($1)',[A]);
  await check('이전단계 M과 기준이 고정 저장',async()=>assert.equal((await one('select previous_exercise_count n from public.user_stage_history where user_id=$1 and stage=4',[A])).n,4));
  await session('2026-08-10',{a:110});
  await check('성장만 충족해도 습관 미달이면 blocked',async()=>{const r=await status();assert.equal(r.state,'blocked');assert.equal(r.filledGrowthCount,1);});
  await check('원본 과거 삭제 후 기준/M 불변',async()=>{const before=(await status()).averageGrowthPct;await db.exec("update public.workout_sessions set deleted_at=now() where completed_at<'2026-08-01'");const r=await status();assert.equal(r.averageGrowthPct,before);assert.equal(r.requiredGrowthCount,1);});
  await check('조건 N4·평균8%여도 성장3이면 blocked',async()=>{
    await db.query('update public.user_stage_history set previous_exercise_count=18 where user_id=$1 and stage=4',[A]);
    await session('2026-08-11',{a:120,b:110,c:102});
    const r=await status();assert.equal(r.requiredGrowthCount,4);assert.equal(r.averageGrowthPct,8);
    assert.equal(r.conditions.find(c=>c.key==='growth_average').met,true);
    assert.equal(r.conditions.find(c=>c.key==='growth_count').met,false);assert.equal(r.state,'blocked');
  });
  await check('없는 규칙은 정상 미달로 숨기지 않음',async()=>{
    await db.exec("update public.stage_evolution_settings set rule_version='missing'");await assert.rejects(status(),/stage_rule_missing/);
    await db.exec("update public.stage_evolution_settings set rule_version='stage_growth_v1'");
  });
  for(let i=0;i<61;i++) await session(new Date(Date.UTC(2026,0,1+i)).toISOString().slice(0,10),{habit:1});
  uiFixtures.short=await status();
  await check('운동일 충족·평균 충족이어도 성장3/4이고 진입 이후 꾸준함 0회면 차단(5단계)',async()=>{
    // 운동 61일은 단계 진입(2026-08-01) 이전에 몰려 있어 꾸준함은 진입 이후만 센다 → 0회
    assert.deepEqual(uiFixtures.short.conditions.filter(c=>!c.met).map(c=>c.key),['growth_count','steady']);
    assert.equal(uiFixtures.short.conditions.find(c=>c.key==='steady').current,0);
    assert.equal(uiFixtures.short.state,'blocked');
  });
  // 진입(8/1) 이후 4개 달력 주(월 8/3·8/10·8/17·8/24 시작)에 주 2일씩 → 꾸준함 1회
  for(const d of ['2026-08-03','2026-08-05','2026-08-10','2026-08-12','2026-08-17','2026-08-19','2026-08-24','2026-08-26']) await session(d,{habit:1});
  await check('진입 이후 4주 연속 주 2일이면 꾸준함 1회',async()=>{
    const s=await status();const st=s.conditions.find(c=>c.key==='steady');
    assert.equal(st.current,1);assert.equal(st.met,true);
    assert.deepEqual(s.conditions.filter(c=>!c.met).map(c=>c.key),['growth_count']);
    assert.equal(s.state,'blocked');
  });
  await db.exec("update public.workout_sets set reps=101 where reps=102 and workout_exercise_id in(select id from public.workout_exercises where exercise_name='c')");
  await session('2026-08-12',{d:101});
  uiFixtures.met=await status();
  await check('4/4·평균8%·나머지 충족이면 진화',async()=>{
    assert.equal(uiFixtures.met.averageGrowthPct,8);assert.equal(uiFixtures.met.state,'eligible');
    uiFixtures.advanced=await refresh();assert.equal(uiFixtures.advanced.currentStage,5);
  });
  await fixture(3,6000);
  await session('2026-07-10',{a:100});
  await db.query('delete from public.user_stage_history where user_id=$1',[A]);await db.query('select gnd_evolution.bootstrap_user($1)',[A]);
  for(let i=0;i<36;i++) await session(new Date(Date.UTC(2026,7,2+i)).toISOString().slice(0,10),{a:110});
  await check('XP+습관+성장 → eligible',async()=>assert.equal((await status()).state,'eligible'));
  await check('재판정 실제 단계상승·알림1개·이력1개',async()=>{const r=await refresh();assert.equal(r.currentStage,4);assert.equal((await one('select count(*)::int n from public.notifications')).n,1);assert.equal((await one('select count(*)::int n from public.user_stage_history where user_id=$1 and stage=4',[A])).n,1);});
  await check('재판정 반복은 단계·알림 중복 없음',async()=>{await Promise.all([refresh(),refresh()]);assert.equal((await one('select current_stage s from public.user_progress where user_id=$1',[A])).s,4);assert.equal((await one('select count(*)::int n from public.notifications')).n,1);});
  await check('새 단계 시각·기준 실제 진화시각 사용',async()=>{const r=await one('select entered_at,history_source from public.user_stage_history where user_id=$1 and stage=4',[A]);assert.equal(r.history_source,'actual');assert.ok(new Date(r.entered_at)>new Date(entry));const s=await status();assert.equal(s.filledGrowthCount,0);});
  await check('본인 RPC는 UUID 인자를 받지 않음',async()=>{await assert.rejects(db.query('select public.refresh_my_stage_evolution($1)',[B]),/does not exist/);});
  await check('타인 이력 RLS·내부 함수 접근 차단',async()=>{await db.exec('set role authenticated');assert.equal((await one('select count(*)::int n from public.user_stage_history where user_id=$1',[B])).n,0);await assert.rejects(db.query('select gnd_evolution.evaluate_stage_evolution($1)',[B]),/permission denied/);await db.exec('reset role');});
  await check('미인증 조회 거부',async()=>{await db.query("select set_config('request.jwt.claim.sub','',false)");await assert.rejects(status(),/not_authenticated/);await db.query("select set_config('request.jwt.claim.sub',$1,false)",[A]);});
  await check('최종 단계 nextStage=null',async()=>{await db.query('update public.user_progress set current_stage=7,current_level=35 where user_id=$1',[A]);assert.equal((await status()).nextStage,null);assert.equal((await status()).state,'max_stage');});
  uiFixtures.final=await status();
  // 5단계 대체 경로(운동 90일): 성장 기준·꾸준함 없이도 통과(면제). 89일은 통과하지 않는다.
  // 운동은 단계 진입(2026-08-01) 이전에 몰려 있어 꾸준함은 0회다.
  for(const [days,expected] of [[89,'needs_baseline'],[90,'eligible']]) {
    await fixture(4,10000);
    for(let i=0;i<days;i++) await session(new Date(Date.UTC(2026,1,1+i)).toISOString().slice(0,10),{habit:1});
    await check(`5단계 대체 경로 운동 ${days}일 → ${expected}`,async()=>{
      const s=await status();
      assert.equal(s.state,expected);assert.equal(s.conditions.find(c=>c.key==='steady').current,0);
      assert.equal(s.alternate.kind,'days');assert.equal(s.alternate.required,90);assert.equal(s.alternate.exemptsSteady,true);
      assert.equal(s.alternate.met,days>=90);
      assert.equal(s.path,days>=90?'alternate':'growth');
    });
  }
  await fixture(3,6000);
  await check('OFF 기존 XP 진화 유지',async()=>{await db.exec('update public.stage_evolution_settings set enabled=false');assert.equal((await xp(4000,'off')).newStage,5);assert.equal((await status()).mode,'legacy_xp');});
  await fixture(3,6000);
  await check('성장 없는 레벨업 알림은 진화라고 쓰지 않음',async()=>{
    const r=await xp(800,'levelOnly');assert.equal(r.newLevel,17);assert.equal(r.newStage,3);
    const n=await one('select title,body from public.notifications limit 1');assert.match(n.title,/레벨업/);assert.doesNotMatch(n.title,/진화/);
  });
  await fixture(3,6000);
  await session('2026-07-10',{a:100});await db.query('delete from public.user_stage_history where user_id=$1',[A]);await db.query('select gnd_evolution.bootstrap_user($1)',[A]);
  for(let i=0;i<36;i++) await session(new Date(Date.UTC(2026,7,2+i)).toISOString().slice(0,10),{a:100});
  await db.query("insert into public.xp_transactions(user_id,amount,transaction_type,reason,reward_group,source_type,source_id,effective_date) values ($1,100,'earn','workout_completed','daily_workout','workout','earlier',current_date)",[A]);
  const sid=await session(new Date().toISOString().slice(0,10),{a:110},'bodyweight','active');
  await db.query("update public.workout_sessions set started_at=now()-interval '30 minutes',completed_at=null where id=$1",[sid]);
  await check('같은 날 XP0 완료도 성장 진화',async()=>{const r=(await one('select public.complete_workout_v2($1) v',[sid])).v;assert.equal(r.xpAwarded,0);assert.equal(r.newStage,4);assert.equal(r.stageUp,true);assert.equal((await one('select count(*)::int n from public.notifications')).n,1);});
  await check('완료 재송신은 새 알림·XP 없음',async()=>{const r=(await one('select public.complete_workout_v2($1) v',[sid])).v;assert.equal(r.idempotentReplay,true);assert.equal((await one('select count(*)::int n from public.notifications')).n,1);});
  await check('판정 내부 오류는 부분 진화 취소·XP 성공·오류 상태 기록',async()=>{
    await db.exec("create or replace function gnd_evolution.evaluate_stage_evolution(p_user_id uuid) returns jsonb language plpgsql as $$begin update public.user_progress set current_stage=6 where user_id=p_user_id; raise exception 'test_gate_fault'; end$$;");
    const r=await xp(1,'failure');assert.equal(r.inserted,true);assert.equal(r.stageUp,false);assert.equal(r.newStage,4);
    assert.ok((await one('select error_code from public.stage_evolution_errors where user_id=$1',[A])).error_code);
    assert.equal((await status()).state,'error');
  });
  await check('오류 시 공개 재판정도 완전한 상태 응답',async()=>{
    const r=await refresh();assert.equal(r.state,'error');assert.equal(r.currentStage,4);assert.ok(Array.isArray(r.conditions));
  });
  uiFixtures.error=await status();
  if (!failed && process.env.GND_EVOLUTION_UI_FIXTURE) writeFileSync(process.env.GND_EVOLUTION_UI_FIXTURE,JSON.stringify(uiFixtures,null,2));
} catch (e) { failed++; console.error(`FAIL 준비/실행: ${e.message}`); }
finally { await db.close(); }
console.log(`${passed} passed / ${failed} failed`);
if(failed) process.exitCode=1;
