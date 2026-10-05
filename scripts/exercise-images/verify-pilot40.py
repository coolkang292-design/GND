"""Verify real pilot files, lineage, scope, counters and no-upscale/retry guards."""
import csv, hashlib, importlib.util, json
from pathlib import Path
from PIL import Image

ROOT=Path(__file__).resolve().parents[2]
def read(path):return json.loads((ROOT/path).read_text(encoding='utf-8'))
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def main():
    spec=importlib.util.spec_from_file_location('pilot',Path(__file__).with_name('pilot40.py'))
    mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
    plan=read('data/exercise-image-pilot-040.json');ledger=read('data/exercise-image-pilot-040-qa.json');summary=read('data/exercise-image-pilot-040-summary.json')
    manifest=read('data/exercise-image-manifest.json');passed=0
    assert len(plan['selection'])==40 and len({r['exercise_id'] for r in plan['selection']})==40;passed+=1
    byid={r['exercise_id']:r for r in manifest['exercises']}
    assert all(byid[r['exercise_id']]['definition_status']=='DRAFT_READY' and not byid[r['exercise_id']]['is_custom'] for r in plan['selection']);passed+=1
    assert len({r['body_part'] for r in plan['selection']})==7 and len({r['visual_family'] for r in plan['selection']})==33;passed+=1
    assert sum(r['definition_status']=='NEEDS_REVIEW' for r in byid.values())==74;passed+=1
    for row in manifest['exercises']:
        row.pop('pilot_040',None);row.pop('pilot_080',None);row.pop('pilot_120',None);row.pop('pilot_160',None)
    original=json.dumps(manifest,ensure_ascii=False,indent=2)+'\n'
    assert hashlib.sha256(original.replace('\n','\r\n').encode()).hexdigest()==plan['parent_manifest_sha256'];passed+=1
    assert not plan['production_db'] and not plan['storage_upload'] and not plan['deploy'];passed+=1
    for size in [(511,511),(512,513)]:
        try:mod.scale_cell(Image.new('RGB',size))
        except ValueError:passed+=1
        else:raise AssertionError('Upscale/stretch was accepted')
    assert mod.scale_cell(Image.new('RGB',(627,627))).size==(512,512);passed+=1
    calls={r['call_id']:r for r in ledger['calls']}
    assert len(calls)==22 and sum(r['kind']=='sheet_2x2' for r in calls.values())==10;passed+=1
    for call in calls.values():
        path=ROOT/call['file'];assert sha(path)==call['sha256']
        with Image.open(path) as im:assert im.format=='PNG' and list(im.size)==call['resolution']
    passed+=1
    for row in ledger['images']:
        assert len(row['attempts'])<=3 and row['final_qa'] in ['PASS','FAIL']
        for index,attempt in enumerate(row['attempts']):
            assert attempt['attempt_no']==index+1 and attempt['call_id'] in calls
            assert attempt['scale_factor']<=1 and min(attempt['native_cell'])>=512
            assert set(attempt['checks'])==set(mod.CHECKS)
            if index:assert row['attempts'][index-1]['qa']=='FAIL'
            path=ROOT/attempt['file'];assert sha(path)==attempt['sha256']
            with Image.open(path) as im:assert im.format=='PNG' and im.size==(512,512) and im.info.get('icc_profile')
        if row['final_qa']=='PASS':assert sha(ROOT/row['final_file'])==row['final_sha256']
    passed+=1
    assert (summary['first_pass'],summary['pass_after_retry'],summary['final_fail'],summary['pending'])==(29,10,1,0);passed+=1
    assert summary['image_generation_calls']==22 and summary['average_regeneration_all40']==0.3;passed+=1
    assert summary['repeated_error_categories']=={'cell_boundary_clipping':6,'wrong_highlight_muscle':3} and not summary['recommend_expansion'];passed+=1
    with (ROOT/'data/exercise-image-manifest.csv').open(encoding='utf-8-sig',newline='') as f:rows=list(csv.DictReader(f))
    assert len(rows)==335 and sum(r['pilot_final_qa']=='PASS' for r in rows)==39 and sum(r['pilot_final_qa']=='FAIL' for r in rows)==1;passed+=1
    for item in [next(r for r in ledger['images'] if r['final_qa']=='PASS'),next(r for r in ledger['images'] if r['final_qa']=='FAIL')]:
        try:mod.ingest('not-used','missing.png',item['exercise_id'])
        except AssertionError:passed+=1
        else:raise AssertionError('PASS retry or exhausted budget accepted')
    dest=ROOT/'운동 이미지/GPT 생성된 이미지'
    mapping=json.loads((dest/'운동_UUID_파일매핑.json').read_text(encoding='utf-8'))
    assert len(mapping)==40 and sum(bool(r['file']) for r in mapping)==39;passed+=1
    for r in mapping:
        if r['file']:assert sha(dest/r['file'])==r['sha256']
        else:assert r['final_qa']=='FAIL'
    assert len(list((dest/'PASS_512').glob('*.png')))==39;passed+=1
    assert (dest/'클로드_인수인계.md').exists();passed+=1
    print(json.dumps({'passed':passed,'failed':0,'pilot_qa_pass':39,'pilot_qa_fail':1,'calls':22,'original_manifest_fields_preserved':True,'export_verified':True}))
if __name__=='__main__':main()
