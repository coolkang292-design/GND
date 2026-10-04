"""Check trial2 outputs and prove upscaling/squashing cannot pass."""
import hashlib
import importlib.util
import json
from pathlib import Path
from PIL import Image

ROOT=Path(__file__).resolve().parents[2]
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def main():
    spec=importlib.util.spec_from_file_location('crop002',Path(__file__).with_name('crop-trial-002.py'))
    mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
    assert mod.scale_cell(Image.new('RGB',(768,768))).size==(512,512)
    count=1
    for size in [(511,511),(400,400),(768,769)]:
        failed=False
        try:mod.scale_cell(Image.new('RGB',size))
        except ValueError:failed=True
        assert failed;count+=1
    b=json.loads((ROOT/'data/exercise-image-trial-002.json').read_text(encoding='utf-8'))
    r=json.loads((ROOT/'data/exercise-image-trial-002-qa.json').read_text(encoding='utf-8'))
    assert sha(ROOT/'data/exercise-image-manifest.json')==b['parent_manifest_sha256'];count+=1
    assert len(b['exercises'])==4 and len({x['visual_family'] for x in b['exercises']})==4;count+=1
    assert sha(ROOT/r['source_file'])==r['source_sha256'];count+=1
    with Image.open(ROOT/r['source_file']) as im: assert list(im.size)==r['source_resolution']
    assert r['source_resolution']==[1254,1254] and mod.boxes(1254,1254)==[tuple(x['crop_box']) for x in r['images']];count+=1
    for expected,actual in zip(b['exercises'],r['images']):
        assert actual['exercise_id']==expected['exercise_id'] and actual['slot_no']==expected['slot_no']
        assert actual['native_cell_resolution']==[627,627] and actual['native_resolution_qa']=='PASS'
        assert actual['scale_factor']<1 and not actual['upscaled'] and actual['overall_qa']=='PASS'
        p=ROOT/actual['file'];assert sha(p)==actual['sha256']
        with Image.open(p) as im:
            im.load();assert im.size==(512,512) and im.format=='PNG' and im.mode=='RGB' and im.info.get('icc_profile')
        count+=1
    assert len({x['sha256'] for x in r['images']})==4;count+=1
    assert r['minimum_native_cell'] is None and r['minimum_768_gate_suspended_by_user']
    assert r['qa_pass']==4 and r['qa_fail']==0 and r['semantic_pass']==4 and r['thumbnail_pass']==4;count+=1
    p=json.loads((ROOT/'data/exercise-image-generation-policy.json').read_text(encoding='utf-8'))
    assert not p['further_generation_authorized'] and not p['upload_authorized'] and p['retired_generation_layout']==[5,2];count+=1
    ui=json.loads((ROOT/'data/exercise-image-local-ui-qa.json').read_text(encoding='utf-8'))
    assert len(ui['images'])==4 and all(x['overall']=='PASS' and x['fallback']=='PASS' for x in ui['images'])
    assert ui['actual_css_thumbnail']==[48,48] and not ui['horizontal_overflow'] and not ui['production_changes'];count+=1
    for evidence in ui['evidence']: assert sha(ROOT/evidence['path'])==evidence['sha256']
    print(json.dumps({'passed':count,'failed':0,'quality_pass':4,'quality_fail':0,'old_manifest_preserved':True,'no_upscaling':True,'app_qa_evidence_verified':True}))
if __name__=='__main__':main()
