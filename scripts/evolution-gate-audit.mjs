// 운영에서는 GET만 한다. 전체 판정/기준 고정은 로컬 메모리 PostgreSQL에서만 실행한다.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
if (!process.env.GND_PGLITE_MODULE) throw new Error('로컬 GND_PGLITE_MODULE 설정이 필요합니다.');
const { PGlite } = createRequire(import.meta.url)(process.env.GND_PGLITE_MODULE);
const root = new URL('../', import.meta.url);
const read = p => readFileSync(new URL(p,root),'utf8');
const env = Object.fromEntries(read('.env.local').split(/\r?\n/).filter(l=>l.includes('=')).map(l=>[l.slice(0,l.indexOf('=')).trim(),l.slice(l.indexOf('=')+1).trim()]));
if(!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('읽기 전용 조회 설정이 없습니다.');
async function get(path) {
  const r=await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${path}`,{method:'GET',headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:`Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`}});
  if(!r.ok) throw new Error(`운영 읽기 조회 실패 HTTP ${r.status}`);
  return r.json();
}
const progressPath='user_progress?select=user_id,total_xp,current_level,current_stage&order=user_id.asc';
const [progress,profiles,history]=await Promise.all([get(progressPath),get('profiles?select=id,nickname,created_at'),get('user_level_history?select=user_id,level,entered_at&limit=1000')]);
assert.ok(progress.length && Math.max(progress.length,profiles.length,history.length)<1000,'조회 상한/빈 결과는 분석하지 않습니다.');
const db=await PGlite.create();
try {
  await db.exec(read('scripts/fixtures/evolution-gate-schema.sql'));
  for(const file of ['0133_stage_evolution_foundation','0134_stage_evolution_evaluator','0135_stage_evolution_bootstrap']) await db.exec(read(`supabase/migrations/${file}.sql`));
  await db.exec('update public.stage_evolution_settings set enabled=true'); // 로컬 전용
  const one=async(sql,args=[]) => (await db.query(sql,args)).rows[0];
  const rows=[];
  for(const p of progress) {
    const profile=profiles.find(x=>x.id===p.user_id);assert.ok(profile?.created_at,'가입 시각 근거 필요');
    await db.query('insert into auth.users values($1)',[p.user_id]);
    await db.query('insert into public.profiles values($1,$2,$3)',[p.user_id,profile.nickname,profile.created_at]);
    await db.query('insert into public.user_progress(user_id,total_xp,current_level,current_stage) values($1,$2,$3,$4)',[p.user_id,p.total_xp,p.current_level,p.current_stage]);
    for(const h of history.filter(x=>x.user_id===p.user_id)) await db.query('insert into public.user_level_history(user_id,level,entered_at) values($1,$2,$3)',[p.user_id,h.level,h.entered_at]);
    let total=0;
    for(let page=0;page<20;page++) {
      const sessions=await get(`workout_sessions?select=started_at,completed_at,duration_minutes,tabata_minutes,workout_exercises(exercise_name,exercise_type,sort_order,workout_sets(weight_kg,reps,duration_seconds,distance_meters,is_completed))&user_id=eq.${p.user_id}&status=eq.completed&deleted_at=is.null&completed_at=not.is.null&order=completed_at.asc,id.asc&limit=1000&offset=${page*1000}`);
      total+=sessions.length;
      for(const s of sessions) {
        const {id}=await one("insert into public.workout_sessions(user_id,started_at,completed_at,duration_minutes,tabata_minutes,status) values($1,$2,$3,$4,$5,'completed') returning id",[p.user_id,s.started_at,s.completed_at,s.duration_minutes,s.tabata_minutes]);
        for(const e of s.workout_exercises??[]) {
          const ex=await one('insert into public.workout_exercises(session_id,exercise_name,exercise_type,sort_order) values($1,$2,$3,$4) returning id',[id,e.exercise_name,e.exercise_type,e.sort_order]);
          for(const w of e.workout_sets??[]) await db.query('insert into public.workout_sets(workout_exercise_id,weight_kg,reps,duration_seconds,distance_meters,is_completed) values($1,$2,$3,$4,$5,$6)',[ex.id,w.weight_kg,w.reps,w.duration_seconds,w.distance_meters,w.is_completed]);
        }
      }
      if(sessions.length<1000) break;
      if(page===19) throw new Error('조회 상한 초과: 부분 분석 중단');
    }
    const ready=(await one('select gnd_evolution.bootstrap_user($1) ready',[p.user_id])).ready;
    const s=(await one('select gnd_evolution.stage_status($1,now()) v',[p.user_id])).v;
    const valid=(await one('select count(*)::int n from gnd_evolution.valid_sessions($1,now())',[p.user_id])).n;
    rows.push({사용자:profile.nickname,레벨:p.current_level,단계:p.current_stage,완료세션:total,유효세션:valid,이력준비:ready?'완료':'누락',
      M:s.growthSummary?.previousStageExerciseCount??'—',N:s.requiredGrowthCount??'—',성장:s.filledGrowthCount,
      평균:s.averageGrowthPct===null?'—':Number(s.averageGrowthPct.toFixed(4)),판정:s.state,
      남은조건:s.conditions.filter(c=>!c.met).map(c=>`${c.key}:${c.current??'준비'}/${c.required??'미정'}`).join(', ')||'없음'});
  }
  assert.deepEqual(await get(progressPath),progress,'분석 중 진행도 변경: 보고서 갱신 중단');
  const headers=Object.keys(rows[0]);const cell=v=>String(v??'—').replaceAll('|','\\|').replace(/[\r\n]/g,' ');
  writeFileSync(new URL('docs/superpowers/evolution-gate-server-audit-2026-11-13.md',root),[
    '# 서버 진화 판정 — 로컬 SQL 영향 분석','',`측정: ${new Date().toISOString()}`,'',
    '운영 데이터는 GET으로만 조회하고, 새 SQL은 로컬 메모리 PostgreSQL에서만 실행했다. 운영 DB 적용·설정 활성화·운동/XP/알림 변경 없음.',
    '유효 세션: 완료·미삭제·시작/완료 시각 존재·0~359분이며 기존 앱의 완료 세트/유산소/인터벌 유효성 충족. 유산소 조건은 정확히 같은 원본 시간/속도.',
    '초안 수치: 꾸준러36일12주5%15%, 불꽃러60일24주8%20%, 대장100일40주12%25%+최근28일8일, 전설156일60주15%30%+최근42일12일. M최소1일. 미션·활동 대체 경로는 미적용.',
    '이미 획득한 단계는 유지하는 상태에서 다음 진화만 시험한 참고값이다. 이력 준비와 성장 비교 가능 여부는 별개다. IDs·키는 보고서에 저장하지 않는다.','',
    `| ${headers.join(' | ')} |`,`| ${headers.map(()=>'---').join(' | ')} |`,...rows.map(r=>`| ${headers.map(h=>cell(r[h])).join(' | ')} |`),'',
    `진행도 ${progress.length}명 조회 전후 불변. 같은 데이터에서 운영 신규 객체/기존 함수/설정은 변경하지 않았다.`,
    'M=0/이력 누락 사용자의 정식 대체 경로와 활성화 직전 재분석, 실제 Supabase 두 계정 흐름 검증은 별도 필요.',''
  ].join('\n'),'utf8');
  console.table(rows);console.log(`읽기 전용 분석 ${rows.length}명 완료 · 운영 진행도 불변`);
} finally { await db.close(); }
