"""Verify second40, scope/non-overlap, hashes/PNG/no-upscale and lineage."""
import csv,hashlib,importlib.util,json,subprocess
from pathlib import Path
from PIL import Image
ROOT=Path(__file__).resolve().parents[2]
def read(p):return json.loads((ROOT/p).read_text(encoding='utf-8'))
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def main():
    plan=read('data/exercise-image-pilot-080.json');ledger=read('data/exercise-image-pilot-080-qa.json');summary=read('data/exercise-image-pilot-080-summary.json');manifest=read('data/exercise-image-manifest.json');count=0
    ids={r['exercise_id'] for r in plan['selection']};old={r['exercise_id'] for r in read('data/exercise-image-pilot-040.json')['selection']}
    old.update(r['exercise_id'] for r in read('data/exercise-image-trial-002.json')['exercises'])
    assert len(ids)==40 and not ids&old;count+=1
    assert len(plan['batches'])==10 and all(len(b['exercise_ids'])==4 for b in plan['batches']);count+=1
    byid={r['exercise_id']:r for r in manifest['exercises']}
    assert len(byid)==335 and sum(r['definition_status']=='NEEDS_REVIEW' for r in byid.values())==74;count+=1
    assert all(byid[u]['definition_status']=='DRAFT_READY' and not byid[u]['is_custom'] for u in ids);count+=1
    assert len({r['body_part'] for r in plan['selection']})==7 and len({r['visual_family'] for r in plan['selection']})==32;count+=1
    assert sum('pilot_080' in r for r in byid.values())==40;count+=1
    for row in manifest['exercises']:row.pop('pilot_080',None);row.pop('pilot_120',None)
    text=json.dumps(manifest,ensure_ascii=False,indent=2)+'\n'
    assert hashlib.sha256(text.replace('\n','\r\n').encode()).hexdigest()==plan['parent_manifest_sha256'];count+=1
    assert not plan['production_db'] and not plan['storage_upload'] and not plan['deploy'];count+=1
    calls={r['call_id']:r for r in ledger['calls']}
    assert len(calls)==22 and sum(c['kind']=='sheet_2x2' for c in calls.values())==10;count+=1
    for c in calls.values():
        p=ROOT/c['file'];assert sha(p)==c['sha256']
        with Image.open(p) as im:assert im.format=='PNG' and list(im.size)==c['resolution']==[1254,1254]
    count+=1
    for row in ledger['images']:
        assert row['final_qa']=='PASS' and len(row['attempts'])<=3
        assert set(row['attempts'][-1]['checks'])=={'exercise','equipment','target_muscle','style','thumbnail_48','format'}
        assert all(v=='PASS' for v in row['attempts'][-1]['checks'].values())
        for i,a in enumerate(row['attempts']):
            assert a['attempt_no']==i+1 and a['call_id'] in calls and a['scale_factor']<=1 and min(a['native_cell'])>=512
            if i:assert row['attempts'][i-1]['qa']=='FAIL'
            assert sha(ROOT/a['file'])==a['sha256']
            with Image.open(ROOT/a['file']) as im:assert im.format=='PNG' and im.size==(512,512) and im.info.get('icc_profile')
        assert sha(ROOT/row['final_file'])==row['final_sha256']
    count+=1
    assert (summary['first_pass'],summary['pass_after_retry'],summary['final_fail'],summary['pending'])==(29,11,0,0);count+=1
    assert summary['image_generation_calls']==22 and summary['individual_retry_calls']==12 and summary['average_regeneration_all40']==0.3;count+=1
    assert summary['repeated_error_categories']=={'wrong_highlight_muscle':8,'cell_boundary_clipping':3} and not summary['recommend_expansion'];count+=1
    dest=Path(plan['destination']);mapping=json.loads((dest/'운동_UUID_파일매핑.json').read_text(encoding='utf-8'))
    assert len(mapping)==40 and all(r['final_qa']=='PASS' for r in mapping);count+=1
    assert len(list((dest/'PASS_512').glob('*.png')))==40;count+=1
    for row in mapping:assert sha(dest/row['file'])==row['sha256']
    count+=1
    with (ROOT/'data/exercise-image-manifest.csv').open(encoding='utf-8-sig',newline='') as f:csvrows=list(csv.DictReader(f))
    assert len(csvrows)==335 and sum(r['pilot080_final_qa']=='PASS' for r in csvrows)==40 and sum(r['pilot_final_qa']=='PASS' for r in csvrows)==39;count+=1
    spec=importlib.util.spec_from_file_location('pilot80',Path(__file__).with_name('pilot80.py'));mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
    for size in [(511,511),(512,513)]:
        try:mod.base.scale_cell(Image.new('RGB',size))
        except ValueError:count+=1
        else:raise AssertionError('Upscale/stretch accepted')
    try:mod.base.ingest('unused','missing.png',ledger['images'][0]['exercise_id'])
    except AssertionError:count+=1
    else:raise AssertionError('PASS retry accepted')
    print(json.dumps({'passed':count,'failed':0,'qa_pass':40,'qa_fail':0,'calls':22,'prior_records_preserved':True,'nonoverlapping40':True}))
if __name__=='__main__':main()
