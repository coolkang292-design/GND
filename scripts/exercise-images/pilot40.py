"""Offline pilot ledger, crop and statistics. No generation/provider/DB/upload calls."""
import argparse, csv, hashlib, json
from collections import Counter, defaultdict
from pathlib import Path
from PIL import Image, ImageCms, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'output/exercise-images/pilot-040'
PLAN = ROOT / 'data/exercise-image-pilot-040.json'
LEDGER = ROOT / 'data/exercise-image-pilot-040-qa.json'
CHECKS = ['exercise', 'equipment', 'target_muscle', 'style', 'thumbnail_48', 'format']
GROUPS = [
 ['벤치프레스','랫풀다운','덤벨 컬','레그 익스텐션'],
 ['푸시업','시티드 로우','오버헤드 프레스','플랭크'],
 ['덤벨 플라이','풀업','덤벨 킥백','시티드 레그 컬'],
 ['딥스','인버티드 로우','덤벨 프론트 레이즈','스쿼트'],
 ['덤벨 풀오버','매달리기','케이블 푸시다운','스탠딩 카프 레이즈'],
 ['펙덱 플라이 머신','데드리프트','페이스풀','사이드 플랭크'],
 ['시티드 덤벨 숄더 프레스','바벨 컬','수평 레그 프레스','크런치'],
 ['덤벨 슈러그','힙 브릿지','러시안 트위스트','러닝'],
 ['덤벨 해머 컬','스텝업','복근 롤아웃','로잉'],
 ['사이드 런지','마운틴 클라이머','줄넘기','트레드밀'],
]

def read(path): return json.loads(path.read_text(encoding='utf-8'))
def write(path, value): path.write_text(json.dumps(value, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()

STYLE = '''Create ONE square 2x2 exercise sprite sheet, preferred2048x2048PNG, absolutely at least1024x1024. Four equal square quadrants in reading order:top-left,top-right,bottom-left,bottom-right. No text,letters,numbers,labels,arrows,borders or grid lines anywhere. Each cell is an independent exercise icon with full body and entire essential equipment INSIDE its quadrant, no overlap between cells; generous 6percent safe margin but subject fills roughly80percent cell. Reference image is STYLE ONLY; replace all four poses/equipment with the specified exercises. Match approved GND anatomical semi-realistic 3D illustration: SAME athletic adult male silver-gray body, dark shorts, dark graphite equipment, uniform very dark navy background #101b24; luminous saturated cyan-blue highlights ONLY the specified target muscles. All other muscles silver-gray, not blue. Muscles are anatomically localized: biceps front upperarm,triceps rear upperarm,lats broad side-back,rhomboids between shoulderblades,pectorals chest,deltoids shoulders,rectus abdominis frontabs,obliques sideabdomen,quadriceps frontthigh,hamstrings backthigh,gastrocnemius calf,trapezius upperback neck region,forearm flexors innerforearm. When gluteals are targeted a blue anatomical overlay may appear on shorts at buttock contours; avoid broad undifferentiated blue patches. Choose the view exposing target muscles and unmistakable equipment/pose, while preserving the prescribed view if given. Crisp large silhouettes readable at48x48. No photography, no charts, no duplicate/missing/extra limb, no invented machine, no accessory load not specified. Pose must be physically possible and show correct grip, supports and load path.'''

def init():
    if PLAN.exists(): raise ValueError('Pilot already exists; resume instead')
    manifest = read(ROOT/'data/exercise-image-manifest.json')
    by_name = {r['name']: r for r in manifest['exercises']}
    rows=[];batches=[]
    for i, names in enumerate(GROUPS,1):
        batch=f'GND-P040-{i:02}'
        selected=[by_name[n] for n in names]
        assert len({r['visual_family'] for r in selected})==4
        prompts=[]
        for slot, row in enumerate(selected,1):
            assert row['definition_status']=='DRAFT_READY' and row['pose_description'] and row['equipment'] and row['target_muscles']
            r={k:row[k] for k in ['exercise_id','name','body_part','visual_family','pose_description','equipment','target_muscles','definition_signature']}
            r.update(batch_no=batch,slot_no=slot,definition_preflight='PASS');rows.append(r)
            prompts.append(f"CELL{slot} {r['name']}: POSE: {r['pose_description']} EXACT EQUIPMENT: {', '.join(r['equipment'])}. BLUE TARGETS: {', '.join(r['target_muscles'])}. No other equipment/muscle highlights.")
        batches.append({'batch_no':batch,'exercise_ids':[r['exercise_id'] for r in selected],'prompt':STYLE+'\n'+'\n'.join(prompts)})
    assert len(rows)==40 and len({r['exercise_id'] for r in rows})==40
    assert Counter(r['body_part'] for r in rows)=={'가슴':6,'등':6,'어깨':5,'팔':5,'하체':8,'코어':6,'유산소':4}
    for d in ['sheets','attempts','final','reports','prompts']: (OUT/d).mkdir(parents=True,exist_ok=True)
    plan={'pilot_id':'GND-P040','scope':'40 seed DRAFT_READY only; all74 NEEDS_REVIEW excluded; no335 bulk generation','standard':'2x2 ->native cell crop ->512PNG; no upscaling','preferred_sheet':[2048,2048],'minimum_input_cell':[512,512],'parent_manifest_sha256':sha(ROOT/'data/exercise-image-manifest.json'),'production_db':False,'storage_upload':False,'deploy':False,'selection':rows,'batches':batches,'definition_audit_notes':['Unselected 덤벨 스컬 크러셔 has biceps-curl draft mismatch; record for later review without changing original74-list.'], 'retry_policy': 'Only failed exercise individually, maximum2 targeted retries in this pilot; never regenerate a whole sheet. Exhausted retries remain FAIL.'}
    write(PLAN,plan)
    write(LEDGER,{'pilot_id':'GND-P040','calls':[],'images':[{'exercise_id':r['exercise_id'],'name':r['name'],'visual_family':r['visual_family'],'body_part':r['body_part'],'attempts':[],'final_qa':'NOT_RUN'} for r in rows]})
    for b in batches: (OUT/'prompts'/f"{b['batch_no']}.txt").write_text(b['prompt'],encoding='utf-8')
    print(json.dumps({'selected':40,'sheets':10,'parts':dict(Counter(r['body_part'] for r in rows)),'families':len({r['visual_family'] for r in rows})},ensure_ascii=False))

def scale_cell(cell):
    if cell.width!=cell.height: raise ValueError('Non-square native cell; stretching forbidden')
    if cell.width<512: raise ValueError('Native cell below512: upscaling forbidden')
    return cell.convert('RGB').resize((512,512), Image.Resampling.LANCZOS)

def ingest(batch, source, exercise_id=None):
    plan=read(PLAN); ledger=read(LEDGER); source=Path(source)
    if exercise_id:
        rows=[r for r in plan['selection'] if r['exercise_id']==exercise_id];assert len(rows)==1
        row=next(r for r in ledger['images'] if r['exercise_id']==exercise_id)
        assert row['attempts'] and row['attempts'][-1]['qa']=='FAIL', 'Retry only after a recorded failure'
        assert len(row['attempts'])<3, 'Pilot retry budget exhausted'
        call_id=f"RETRY-{exercise_id}-{len(row['attempts'])}"
    else:
        rows=[r for r in plan['selection'] if r['batch_no']==batch];assert len(rows)==4
        call_id=batch
    assert not any(c['call_id']==call_id for c in ledger['calls']), 'Duplicate generation ingestion'
    dest=OUT/'sheets'/f'{call_id}.png';dest.write_bytes(source.read_bytes())
    with Image.open(dest) as im:
        im.load(); assert im.format=='PNG' and im.width==im.height, 'SquarePNG source required'
        size=im.size; boxes=[(0,0,im.width,im.height)] if exercise_id else [(round(c*im.width/2),round(r*im.height/2),round((c+1)*im.width/2),round((r+1)*im.height/2)) for r in range(2) for c in range(2)]
        for r,box in zip(rows,boxes):
            cell=im.crop(box);png=scale_cell(cell)
            item=next(x for x in ledger['images'] if x['exercise_id']==r['exercise_id']);attempt=len(item['attempts'])+1
            file=OUT/'attempts'/f"{r['exercise_id']}-a{attempt}.png"
            png.save(file,icc_profile=ImageCms.ImageCmsProfile(ImageCms.createProfile('sRGB')).tobytes())
            item['attempts'].append({'attempt_no':attempt,'call_id':call_id,'source_sha256':sha(dest),'native_cell':list(cell.size),'crop_box':list(box),'file':file.relative_to(ROOT).as_posix(),'sha256':sha(file),'scale_factor':512/cell.width,'qa':'NOT_RUN','checks':{},'errors':[],'notes':None})
    ledger['calls'].append({'call_id':call_id,'kind':'single_retry' if exercise_id else 'sheet_2x2','exercise_ids':[r['exercise_id'] for r in rows],'file':dest.relative_to(ROOT).as_posix(),'sha256':sha(dest),'resolution':list(size)})
    write(LEDGER,ledger);contact(batch);print(json.dumps({'call':call_id,'source':size,'pngs':len(rows),'upscaled':0}))

def contact(batch):
    plan=read(PLAN);ledger=read(LEDGER);rows=[r for r in plan['selection'] if r['batch_no']==batch]
    for size in [48,256]:
        # 48 images are pasted at true48px, never enlarged on the review canvas.
        w=size+140;h=size+26;canvas=Image.new('RGB',(w*2,h*2),(16,27,36));draw=ImageDraw.Draw(canvas)
        for i,row in enumerate(rows):
            item=next(r for r in ledger['images'] if r['exercise_id']==row['exercise_id']);attempt=item['attempts'][-1]
            with Image.open(ROOT/attempt['file']) as im: canvas.paste(im.resize((size,size),Image.Resampling.LANCZOS),((i%2)*w,(i//2)*h))
            draw.text(((i%2)*w,(i//2)*h+size+2),f"slot{row['slot_no']} / a{attempt['attempt_no']}",fill='white')
        canvas.save(OUT/'reports'/f'{batch}-{size}.png')

def qa(batch, judgments):
    plan=read(PLAN);ledger=read(LEDGER)
    for judge in judgments:
        row=next(r for r in plan['selection'] if r['batch_no']==batch and r['slot_no']==judge['slot'])
        item=next(r for r in ledger['images'] if r['exercise_id']==row['exercise_id']);a=item['attempts'][-1]
        assert a['qa']=='NOT_RUN', 'Cannot rewrite a prior judgment'
        errors=judge.get('errors',[]); assert all(e in CHECKS for e in errors)
        a.update(checks={k:'FAIL' if k in errors else 'PASS' for k in CHECKS},errors=errors,error_types=judge.get('error_types',errors),notes=judge['notes'],qa='FAIL' if errors else 'PASS',reviewer='Codex direct512/256/native and true48px visual review; not independent expert')
        item['final_qa']=a['qa']
        if a['qa']=='PASS':
            p=OUT/'final'/f"{item['exercise_id']}.png";p.write_bytes((ROOT/a['file']).read_bytes());item['final_file']=p.relative_to(ROOT).as_posix();item['final_sha256']=sha(p)
    write(LEDGER,ledger);report()

def report():
    ledger=read(LEDGER);first=retry=fail=pending=0;errors=Counter();types=Counter();families=defaultdict(lambda:{'selected':0,'initial_fail':0,'final_fail':0})
    for r in ledger['images']:
        a=r['attempts'];family=families[r['visual_family']];family['selected']+=1
        if not a or a[-1]['qa']=='NOT_RUN':pending+=1;continue
        if a[0]['qa']=='PASS':first+=1
        elif r['final_qa']=='PASS':retry+=1
        if a[0]['qa']=='FAIL':family['initial_fail']+=1
        if r['final_qa']=='FAIL':fail+=1;family['final_fail']+=1
        for attempt in a:errors.update(attempt['errors']);types.update(attempt.get('error_types',attempt['errors']))
    for v in families.values():
        v['initial_failure_rate']=v['initial_fail']/v['selected'];v['final_failure_rate']=v['final_fail']/v['selected']
    retries=sum(max(0,len(r['attempts'])-1) for r in ledger['images']);failed_initial=sum(bool(r['attempts']) and r['attempts'][0]['qa']=='FAIL' for r in ledger['images'])
    repeated={k:v for k,v in types.items() if v>=2}
    stats={'first_pass':first,'pass_after_retry':retry,'final_fail':fail,'pending':pending,'total_pass':first+retry,'error_counts_by_failed_attempt':dict(errors),'error_types_by_failed_attempt':dict(types),'families':dict(families),'image_generation_calls':len(ledger['calls']),'sheet_calls':sum(c['kind']=='sheet_2x2' for c in ledger['calls']),'individual_retry_calls':sum(c['kind']=='single_retry' for c in ledger['calls']),'average_regeneration_all40':retries/40,'average_regeneration_initial_failures':retries/failed_initial if failed_initial else 0,'repeated_error_categories':repeated,'recommend_expansion':pending==0 and first+retry>=38 and not repeated,'repeat_detection':'Conservative: same detailed error type in2+attempts blocks recommendation, even if retries fix it.'}
    write(ROOT/'data/exercise-image-pilot-040-summary.json',stats);print(json.dumps({k:v for k,v in stats.items() if k!='families'},ensure_ascii=False))

def sync_manifest():
    ledger=read(LEDGER);manifest=read(ROOT/'data/exercise-image-manifest.json');lookup={r['exercise_id']:r for r in ledger['images']}
    for r in manifest['exercises']:
        if r['exercise_id'] not in lookup:continue
        item=lookup[r['exercise_id']];r['pilot_040']={'first_generation_pass': bool(item['attempts']) and item['attempts'][0]['qa']=='PASS','regeneration_count':max(0,len(item['attempts'])-1),'final_qa':item['final_qa'],'attempts':item['attempts'],'final_file':item.get('final_file'),'final_sha256':item.get('final_sha256')}
    write(ROOT/'data/exercise-image-manifest.json',manifest)
    csv_path=ROOT/'data/exercise-image-manifest.csv'
    with csv_path.open(encoding='utf-8-sig',newline='') as f:reader=csv.DictReader(f);fields=reader.fieldnames;rows=list(reader)
    fields=fields+[k for k in ['pilot_first_generation_pass','pilot_regeneration_count','pilot_final_qa'] if k not in fields]
    for r in rows:
        p=lookup.get(r['exercise_id'])
        if p:r.update(pilot_first_generation_pass=str(p['attempts'][0]['qa']=='PASS').lower(),pilot_regeneration_count=max(0,len(p['attempts'])-1),pilot_final_qa=p['final_qa'])
    with csv_path.open('w',encoding='utf-8-sig',newline='') as f:writer=csv.DictWriter(f,fieldnames=fields);writer.writeheader();writer.writerows(rows)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('action',choices=['init','ingest','qa','report','sync']);p.add_argument('--batch');p.add_argument('--source');p.add_argument('--exercise-id');p.add_argument('--judgments');a=p.parse_args()
    if a.action=='init':init()
    elif a.action=='ingest':ingest(a.batch,a.source,a.exercise_id)
    elif a.action=='qa':qa(a.batch,json.loads(a.judgments))
    elif a.action=='sync':sync_manifest()
    else:report()
