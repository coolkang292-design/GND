"""Second separately authorized 40, sharing offline crop/QA functions only."""
import argparse,csv,importlib.util,json,shutil,hashlib
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
spec=importlib.util.spec_from_file_location('base',Path(__file__).with_name('pilot40.py'))
base=importlib.util.module_from_spec(spec);spec.loader.exec_module(base)
ROOT=base.ROOT
base.PLAN=ROOT/'data/exercise-image-pilot-080.json'
base.LEDGER=ROOT/'data/exercise-image-pilot-080-qa.json'
base.OUT=ROOT/'output/exercise-images/pilot-080'
DEST=ROOT/'운동 이미지/GPT 생성된 이미지/추가40_041-080'
GROUPS=[
 ['덤벨 벤치프레스','친업','덤벨 리스트 컬','맨몸 스쿼트'],
 ['인클라인 벤치프레스','슈퍼맨 로우','벤치 딥스','데드버그'],
 ['인클라인 푸시업','벤트오버 덤벨 레터럴 레이즈','시티드 덤벨 트라이셉 익스텐션','걷기'],
 ['스탠딩 케이블 플라이','바벨 슈러그','이지바 컬','런지'],
 ['바벨 플로어 프레스','덤벨 Y 레이즈','리버스 덤벨 리스트 컬','버드독'],
 ['와이드 푸시업','레터럴 레이즈 머신','컨센트레이션 컬','루마니안 데드리프트'],
 ['숄더 탭','악력기','힙 어덕션 머신','레그 레이즈'],
 ['파이크 푸시업','케틀벨 스윙','힙 어브덕션 머신','덤벨 사이드 벤드'],
 ['케이블 프론트 레이즈','케이블 로프 푸시 다운','박스 점프','월 싯'],
 ['핸드스탠드','시티드 카프 레이즈','덤벨 고블릿 스쿼트','리버스 크런치']]

def init():
    assert not base.PLAN.exists(),'Resume existing set; do not overwrite'
    manifest=base.read(ROOT/'data/exercise-image-manifest.json');byname={r['name']:r for r in manifest['exercises']}
    excluded={r['exercise_id'] for r in base.read(ROOT/'data/exercise-image-pilot-040.json')['selection']}
    excluded.update(r['exercise_id'] for r in base.read(ROOT/'data/exercise-image-trial-002.json')['exercises'])
    rows=[];batches=[]
    for i,names in enumerate(GROUPS,1):
        batch=f'GND-P080-{i:02}'
        selected=[byname[n] for n in names]
        assert len({r['visual_family'] for r in selected})==4
        lines=[]
        for slot,r in enumerate(selected,1):
            assert r['exercise_id'] not in excluded and r['definition_status']=='DRAFT_READY'
            assert not r['is_custom'] and all(r[k] for k in ['pose_description','equipment','target_muscles'])
            item={k:r[k] for k in ['exercise_id','name','body_part','visual_family','pose_description','equipment','target_muscles','definition_signature']}
            item.update(batch_no=batch,slot_no=slot,definition_preflight='PASS');rows.append(item)
            lines.append(f"QUADRANT {slot}: {r['name']}. Pose: {r['pose_description']} Equipment exactly: {', '.join(r['equipment'])}. BLUE ONLY: {', '.join(r['target_muscles'])}.")
        prompt=base.STYLE.replace('generous 6percent safe margin but subject fills roughly80percent cell','generous 15percent safe margin on EACH of FOUR sides of EACH cell, subject and complete equipment fills at most70percent cell')
        prompt+=' HARD CONSTRAINT: invisible midlines at50percent width/height. Each exercise is wholly confined to its own quadrant. No head, rope, bar, machine or feet may touch or cross midlines or outside edges. Every quadrant has empty navy padding at top/bottom/left/right. Exactly one figure per quadrant. Do not add extra figures to demonstrate another view. Broad lats must be smooth blue back wings, NOT serratus teeth. Rear delts must be blue at rear shoulders, not chest. Anatomically correct cyan target placement is mandatory.\n'+'\n'.join(lines)
        batches.append({'batch_no':batch,'exercise_ids':[r['exercise_id'] for r in selected],'prompt':prompt})
    assert len(rows)==40 and len({r['exercise_id'] for r in rows})==40
    for folder in ['sheets','attempts','final','reports','prompts']:(base.OUT/folder).mkdir(parents=True,exist_ok=True)
    plan={'pilot_id':'GND-P080','scope':'Second40 only; previous40 and trial4 excluded; NEEDS_REVIEW74/custom13 excluded','parent_manifest_sha256':base.sha(ROOT/'data/exercise-image-manifest.json'),'production_db':False,'storage_upload':False,'deploy':False,'selection':rows,'batches':batches,'retry_policy':'Failed exercise individually, at most2 retries; no whole-sheet regeneration','destination':str(DEST)}
    base.write(base.PLAN,plan);base.write(base.LEDGER,{'pilot_id':'GND-P080','calls':[],'images':[{'exercise_id':r['exercise_id'],'name':r['name'],'visual_family':r['visual_family'],'body_part':r['body_part'],'attempts':[],'final_qa':'NOT_RUN'} for r in rows]})
    for b in batches:(base.OUT/'prompts'/f"{b['batch_no']}.txt").write_text(b['prompt'],encoding='utf-8')
    print(json.dumps({'selected':40,'parts':sorted({r['body_part'] for r in rows}),'families':len({r['visual_family'] for r in rows})},ensure_ascii=False))

def sync():
    ledger=base.read(base.LEDGER);manifest=base.read(ROOT/'data/exercise-image-manifest.json');lookup={r['exercise_id']:r for r in ledger['images']}
    for row in manifest['exercises']:
        if row['exercise_id'] not in lookup:continue
        item=lookup[row['exercise_id']]
        row['pilot_080']={'first_generation_pass':item['attempts'][0]['qa']=='PASS','regeneration_count':len(item['attempts'])-1,'final_qa':item['final_qa'],'attempts':item['attempts'],'final_file':item.get('final_file'),'final_sha256':item.get('final_sha256')}
    base.write(ROOT/'data/exercise-image-manifest.json',manifest)
    path=ROOT/'data/exercise-image-manifest.csv'
    with path.open(encoding='utf-8-sig',newline='') as f:r=csv.DictReader(f);fields=r.fieldnames;rows=list(r)
    fields += [k for k in ['pilot080_first_generation_pass','pilot080_regeneration_count','pilot080_final_qa'] if k not in fields]
    for row in rows:
        if row['exercise_id'] in lookup:
            item=lookup[row['exercise_id']];row.update(pilot080_first_generation_pass=str(item['attempts'][0]['qa']=='PASS').lower(),pilot080_regeneration_count=len(item['attempts'])-1,pilot080_final_qa=item['final_qa'])
    with path.open('w',encoding='utf-8-sig',newline='') as f:w=csv.DictWriter(f,fieldnames=fields);w.writeheader();w.writerows(rows)

def export():
    plan=base.read(base.PLAN);ledger=base.read(base.LEDGER);summary=base.read(base.PLAN.with_name(base.PLAN.stem+'-summary.json'))
    for src,dst in [('final','PASS_512'),('attempts','생성시도_512'),('sheets','원본시트'),('reports','검수'),('prompts','생성프롬프트')]:
        (DEST/dst).mkdir(parents=True,exist_ok=True)
        for p in (base.OUT/src).glob('*'):
            if p.is_file():shutil.copy2(p,DEST/dst/p.name)
    definitions={r['exercise_id']:r for r in plan['selection']};mapping=[]
    for r in ledger['images']:
        row=definitions[r['exercise_id']];a=r['attempts'];item={k:row[k] for k in ['exercise_id','name','body_part','visual_family','equipment','target_muscles']}
        item.update(first_generation_pass=a[0]['qa']=='PASS',regeneration_count=len(a)-1,final_qa=r['final_qa'],file='PASS_512/'+r['exercise_id']+'.png' if r['final_qa']=='PASS' else None,sha256=r.get('final_sha256'))
        mapping.append(item)
    base.write(DEST/'운동_UUID_파일매핑.json',mapping)
    with (DEST/'운동_UUID_파일매핑.csv').open('w',encoding='utf-8-sig',newline='') as f:
        fields=['exercise_id','name','body_part','visual_family','first_generation_pass','regeneration_count','final_qa','file','sha256'];w=csv.DictWriter(f,fieldnames=fields,extrasaction='ignore');w.writeheader();w.writerows(mapping)
    for path in [base.PLAN,base.LEDGER,base.PLAN.with_name(base.PLAN.stem+'-summary.json')]:shutil.copy2(path,DEST/path.name)
    canvas=Image.new('RGB',(1000,760),(16,27,36));draw=ImageDraw.Draw(canvas);font=ImageFont.truetype('C:/Windows/Fonts/malgun.ttf',11)
    for i,row in enumerate(mapping):
        x=i%5*200;y=i//5*95
        if row['file']:
            with Image.open(DEST/row['file']) as im:canvas.paste(im.resize((48,48),Image.Resampling.LANCZOS),(x,y))
        draw.text((x,y+50),row['name'],fill='white',font=font);draw.text((x,y+67),row['final_qa'],fill='white',font=font)
    canvas.save(DEST/'검수/전체_실제48px.png')
    text=f"# 클로드 인수인계: 추가40 (041-080)\n\n2026-10-05. 기존40개 및 기존시험4개와 중복0. NEEDS_REVIEW74/custom13 제외.\n\n최초PASS {summary['first_pass']} / 재생성후PASS {summary['pass_after_retry']} / 최종FAIL {summary['final_fail']}. 생성 {summary['image_generation_calls']}회, 평균재생성 {summary['average_regeneration_all40']:.3f}회.\n\nPASS_512의512×512PNG만 운동_UUID_파일매핑.json의exercise_id UUID로 연결한다. final_qa=FAIL/file=null은 적용하지 않는다. 원본/생성시도는 과정 기록이다. 원본 셀512 이상에서 축소만 수행하며 확대0. 텍스트/번호 없음. 기존 첫40개 폴더는 그대로 유지한다.\n\nCodex는 이미지 생성·시각검수만 수행했다. 이번40개 실제앱QA와 독립운동전문가 검수는 미검증. 클로드는 별도 적용 지시 후 로컬48px렌더링/레이아웃/로딩실패fallback을 직접 검증한다. 운영DB/Storage/배포/전체335생성은 승인되지 않았다.\n\n오류 및 family별 최초/최종 실패율:\n\n```json\n{json.dumps(summary,ensure_ascii=False,indent=2)}\n```\n"
    (DEST/'클로드_인수인계.md').write_text(text,encoding='utf-8')
    print(json.dumps({'destination':str(DEST),'pass':summary['total_pass']},ensure_ascii=False))

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('action',choices=['init','ingest','qa','report','export','sync']);p.add_argument('--batch');p.add_argument('--source');p.add_argument('--exercise-id');p.add_argument('--judgments');a=p.parse_args()
    if a.action=='init':init()
    elif a.action=='ingest':base.ingest(a.batch,a.source,a.exercise_id)
    elif a.action=='qa':base.qa(a.batch,json.loads(a.judgments))
    elif a.action=='export':export()
    elif a.action=='sync':sync()
    else:base.report()
