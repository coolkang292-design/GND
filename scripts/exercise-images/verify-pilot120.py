"""Verify third40 package, immutable parent history, and actual crop provenance."""
import csv,hashlib,json
from collections import Counter
from pathlib import Path
from PIL import Image
ROOT=Path(__file__).resolve().parents[2]
def read(p):return json.loads(p.read_text(encoding='utf-8'))
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def main():
    data=ROOT/'data';plan=read(data/'exercise-image-pilot-120.json');ledger=read(data/'exercise-image-pilot-120-qa.json');summary=read(data/'exercise-image-pilot-120-summary.json');manifest=read(data/'exercise-image-manifest.json');n=0
    ids={r['exercise_id'] for r in plan['selection']};old=set()
    for filename,key in [('exercise-image-pilot-040.json','selection'),('exercise-image-pilot-080.json','selection'),('exercise-image-trial-002.json','exercises')]:old.update(r['exercise_id'] for r in read(data/filename)[key])
    assert len(ids)==40 and not ids&old;n+=1
    assert len(plan['batches'])==10 and all(len(b['exercise_ids'])==4 for b in plan['batches']);n+=1
    definitions={r['exercise_id']:r for r in manifest['exercises']}
    assert len(definitions)==335 and sum(r['definition_status']=='NEEDS_REVIEW' for r in definitions.values())==74;n+=1
    assert all(definitions[u]['definition_status']=='DRAFT_READY' and not definitions[u]['is_custom'] for u in ids);n+=1
    assert len({r['body_part'] for r in plan['selection']})==5 and len({r['visual_family'] for r in plan['selection']})==27;n+=1
    assert sum('pilot_120' in r for r in definitions.values())==40;n+=1
    for row in manifest['exercises']:row.pop('pilot_120',None)
    original=json.dumps(manifest,ensure_ascii=False,indent=2)+'\n'
    assert hashlib.sha256(original.replace('\n','\r\n').encode()).hexdigest()==plan['parent_manifest_sha256'];n+=1
    assert not any(plan[k] for k in ['production_db','storage_upload','deploy']);n+=1
    calls={c['call_id']:c for c in ledger['calls']}
    assert len(calls)==19 and sum(c['kind']=='sheet_2x2' for c in calls.values())==10;n+=1
    for c in calls.values():
        p=ROOT/c['file'];assert sha(p)==c['sha256']
        with Image.open(p) as im:assert im.format=='PNG' and list(im.size)==c['resolution']==[1254,1254]
    n+=1
    checks={'exercise','equipment','target_muscle','style','thumbnail_48','format'}
    for row in ledger['images']:
        assert row['final_qa'] in ['PASS','FAIL'] and 1<=len(row['attempts'])<=3
        for i,a in enumerate(row['attempts']):
            assert a['attempt_no']==i+1 and a['call_id'] in calls and a['scale_factor']<=1 and min(a['native_cell'])>=512
            assert set(a['checks'])==checks and a['qa'] in ['PASS','FAIL']
            if i:assert row['attempts'][i-1]['qa']=='FAIL'
            assert sha(ROOT/a['file'])==a['sha256']
            with Image.open(ROOT/a['file']) as im:assert im.format=='PNG' and im.size==(512,512) and im.info.get('icc_profile')
        if row['final_qa']=='PASS':
            assert all(v=='PASS' for v in row['attempts'][-1]['checks'].values())
            assert sha(ROOT/row['final_file'])==row['final_sha256']
        else:assert not row.get('final_file') and not (ROOT/'output/exercise-images/pilot-120/final'/f"{row['exercise_id']}.png").exists()
    n+=1
    assert (summary['first_pass'],summary['pass_after_retry'],summary['final_fail'],summary['pending'])==(33,5,2,0);n+=1
    assert summary['image_generation_calls']==19 and summary['individual_retry_calls']==9 and summary['average_regeneration_all40']==0.225;n+=1
    errors=Counter(t for r in ledger['images'] for a in r['attempts'] if a['qa']=='FAIL' for t in a.get('error_types',[]))
    assert dict(errors)==summary['error_types_by_failed_attempt'] and not summary['recommend_expansion'];n+=1
    dest=Path(plan['destination']);mapping=read(dest/'운동_UUID_파일매핑.json')
    assert len(mapping)==40 and sum(r['final_qa']=='PASS' for r in mapping)==38;n+=1
    assert len(list((dest/'PASS_512').glob('*.png')))==38;n+=1
    for r in mapping:
        if r['file']:assert sha(dest/r['file'])==r['sha256']
        else:assert r['final_qa']=='FAIL'
    n+=1
    with (data/'exercise-image-manifest.csv').open(encoding='utf-8-sig',newline='') as f:rows=list(csv.DictReader(f))
    assert len(rows)==335 and sum(r['pilot120_final_qa']=='PASS' for r in rows)==38;n+=1
    total=read(dest.parent/'전체120_UUID_파일매핑.json')
    assert len(total)==120 and len({r['exercise_id'] for r in total})==120 and sum(r['final_qa']=='PASS' for r in total)==117;n+=1
    for r in total:
        if r['file']:assert sha(dest.parent/r['file'])==r['sha256']
    n+=1
    print(json.dumps({'passed':n,'failed':0,'qa_pass':38,'qa_fail':2,'calls':19,'parent_preserved':True,'cumulative_pass':117}))
if __name__=='__main__':main()
