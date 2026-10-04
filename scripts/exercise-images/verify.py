"""Verify exact UUID coverage, quarantine, batch identity, output bytes and QA gates."""
import copy
import csv
import hashlib
import json
from pathlib import Path
from PIL import Image

ROOT=Path(__file__).resolve().parents[2]
def read(p): return json.loads((ROOT/p).read_text(encoding='utf-8'))
def validate(m,b,s):
    rows=m['exercises']; ids=[r['exercise_id'] for r in rows]
    seeds={r['id'] for r in s['rows'] if r['is_seed'] and not r['is_custom']}
    assert len(rows)==335 and len(set(ids))==335 and set(ids)==seeds, 'UUID coverage mismatch'
    byid={r['exercise_id']:r for r in rows}
    assert all(not r['is_custom'] and r['storage_path'] is None and r['image_url'] is None for r in rows)
    for r in rows:
        if r['definition_status']=='DRAFT_READY':
            assert r['visual_family'] and r['pose_description'] and r['equipment'] and r['target_muscles']
        else: assert r['definition_status']=='NEEDS_REVIEW' and not r['cropped_file'] and not r['batch_no']
    planned=[uid for batch in b['batches'] for uid in batch['exercises']]
    held=[uid for batch in b['held_batches'] for uid in batch['exercises']]
    assert len(set(planned+held))==335 and set(planned+held)==set(ids)
    assert len(planned)==len(set(planned)) and len(held)==len(set(held))
    assert all(byid[uid]['definition_status']=='NEEDS_REVIEW' for uid in held)
    assert sum(batch['generation_authorized'] for batch in b['batches'])==1
    for batch in b['batches']:
        assert 1<=len(batch['exercises'])<=10
        for slot,uid in enumerate(batch['exercises'],1):
            assert byid[uid]['slot_no']==slot and byid[uid]['batch_no']==batch['batch_no']
            if batch['batch_no']!='GND-TRIAL-001': assert not byid[uid]['cropped_file'] and byid[uid]['attempt_count']==0
    trial=[r for r in rows if r['batch_no']=='GND-TRIAL-001']
    assert len(trial)==10 and all(r['attempt_count']==1 and r['status']=='QA_FAIL' for r in trial)
    assert not any(r['status'] in ['UPLOADED','LINKED','DONE','QA_PASS'] for r in rows)

def main():
    m=read('data/exercise-image-manifest.json'); b=read('data/exercise-image-batches.json'); s=read('data/exercise-image-catalog-snapshot.json')
    validate(m,b,s); passed=1
    # Prove that incorrect IDs, quarantine bypass and slot swaps are rejected.
    mutations=[]
    bad=copy.deepcopy(m); bad['exercises'][0]['exercise_id']='00000000-0000-0000-0000-000000000000'; mutations.append(bad)
    bad=copy.deepcopy(m); ready=next(r for r in bad['exercises'] if r['definition_status']=='DRAFT_READY'); ready['pose_description']=None; mutations.append(bad)
    bad=copy.deepcopy(m); held=next(r for r in bad['exercises'] if r['definition_status']=='NEEDS_REVIEW'); held['cropped_file']='bad.png'; mutations.append(bad)
    bad=copy.deepcopy(m); trial=next(r for r in bad['exercises'] if r['batch_no']=='GND-TRIAL-001'); trial['slot_no']=11; mutations.append(bad)
    bad=copy.deepcopy(m); trial=next(r for r in bad['exercises'] if r['batch_no']=='GND-TRIAL-001'); trial['status']='QA_PASS'; mutations.append(bad)
    for bad in mutations:
        rejected=False
        try: validate(bad,b,s)
        except AssertionError: rejected=True
        assert rejected, 'Failure injection was not rejected'; passed+=1
    report=read('output/exercise-images/reports/trial-qa.json')
    sheet=ROOT/report['source_file']
    assert hashlib.sha256(sheet.read_bytes()).hexdigest()==report['source_sha256']; passed+=1
    assert report['qa_pass']==0 and report['qa_fail']==10 and report['generation_calls']==1; passed+=1
    hashes=[]
    for r in report['images']:
        p=ROOT/r['file']; actual=hashlib.sha256(p.read_bytes()).hexdigest()
        assert actual==r['sha256']; hashes.append(actual)
        with Image.open(p) as image:
            image.load(); assert image.size==(512,512) and image.format=='PNG' and image.mode=='RGB' and image.info.get('icc_profile')
        assert r['source_resolution_qa']=='FAIL' and min(r['source_cell_resolution'])<512 and r['upscaled'] and r['overall_qa']=='FAIL'
        passed+=1
    assert len(set(hashes))==10; passed+=1
    existing=read('data/exercise-image-existing-qa.json')
    assert existing['reviewed_files']==19 and existing['reusable_now']==0 and existing['mapped_uuid_count']==21; passed+=1
    assert all(hashlib.sha256((ROOT/r['file']).read_bytes()).hexdigest()==r['sha256'] for r in existing['images']); passed+=1
    with (ROOT/'data/exercise-image-manifest.csv').open(encoding='utf-8-sig',newline='') as f: csvrows=list(csv.DictReader(f))
    assert len(csvrows)==335 and all(c['qa_status']==r['qa_status'] and c['exercise_id']==r['exercise_id'] for c,r in zip(csvrows,m['exercises'])); passed+=1
    print(json.dumps({'passed':passed,'failed':0,'coverage':335,'trial_pngs':10,'qa_pass':0,'qa_fail':10,'no_uploads':True}))

if __name__=='__main__': main()
