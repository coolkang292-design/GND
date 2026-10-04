"""Record this trial's explicit visual inspection. Bound to image hashes.
Changing a source image requires a new review; never promotes an unreviewed asset.
"""
import hashlib
import json
import re
from pathlib import Path
from PIL import Image

ROOT=Path(__file__).resolve().parents[2]
def read(p): return json.loads(p.read_text(encoding='utf-8'))
def write(p,v): p.write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()

def main():
    path=ROOT/'data/exercise-image-manifest.json'; manifest=read(path)
    report_path=ROOT/'output/exercise-images/reports/trial-qa.json'; report=read(report_path)
    expected='efd37d59584bba386ec8d16a27409106d378577c2a35fb60502b4715a0fb40b0'
    assert report['source_sha256']==expected, 'Trial changed: manual review must be repeated'
    verdicts=[
      ('PASS','PASS','Inclined bench and barbell distinguish movement; blue spills onto non-primary muscles.'),
      ('PASS','PASS','Flat bench and opened dumbbell arms recognizable.'),
      ('FAIL','FAIL','Tall cable columns and open cable handles depict cable fly, not forward machine chest press.'),
      ('PASS','FAIL','Push-up recognizable, but normal versus wide hand spacing is not sufficiently clear at48px.'),
      ('PASS','FAIL','Wide hands visible at full size; distinction from standard push-up weak at48px.'),
      ('PASS','PASS','Standing lateral raise and two dumbbells recognizable.'),
      ('PASS','PASS','Seated press, upright back support and dumbbells recognizable.'),
      ('PASS','PASS','Hinged standing barbell row recognizable.'),
      ('PASS','PASS','Seated knee extension and shin roller recognizable; machine geometry needs specialist final review.'),
      ('PASS','PASS','Stationary bicycle recognizable.'),
    ]
    byid={r['exercise_id']:r for r in manifest['exercises']}
    for result,(semantic,thumbnail,note) in zip(report['images'],verdicts):
        assert sha(ROOT/result['file'])==result['sha256']
        result.update(semantic_qa=semantic,thumbnail_qa=thumbnail,qa_notes=note,reviewer='Codex visual inspection; not an independent exercise expert',overall_qa='FAIL')
        item=byid[result['exercise_id']]
        item.update(status='QA_FAIL',qa_status='FAIL',semantic_qa=semantic,qa_notes=note+' Native source cell below512px; do not promote.',structural_qa='FAIL')
    report.update(qa_pass=0,qa_fail=10,semantic_pass=9,semantic_fail=1,thumbnail_pass=7,thumbnail_fail=3,
                  recommendation='STOP: native cell resolution fails all10, machine chest press incorrect, standard/wide push-ups weak at48px.',
                  generation_calls=1,has_text=False,style_notes='Style broadly consistent; primary-only muscle highlighting not consistently respected.')
    write(report_path,report)
    text=(ROOT/'src/lib/domain/exercise-images.ts').read_text(encoding='utf-8')
    mappings=re.findall(r'^\s*(?:"([^"\n]+)"|([\w가-힣]+)):\s*\{\s*file:\s*"([^"]+)"',text,re.M)
    existing=[]
    for file in sorted((ROOT/'public/exercise-images').glob('*.webp')):
        names=[a or b for a,b,stem in mappings if stem==file.stem]
        entries=[r for r in manifest['exercises'] if r['name'] in names]
        assert entries, f'Unmapped asset {file}'
        with Image.open(file) as image:
            image.load(); fmt=image.format; size=image.size
        semantic='NEEDS_REVIEW' if file.stem in ['dumbbell-pullover','standing-cable-fly'] else 'PASS'
        note='Pullover weight configuration not confidently determined from existing image.' if file.stem=='dumbbell-pullover' else 'Cable pulley height/trajectory needs confirmation; never assume low-pulley variant.' if file.stem=='standing-cable-fly' else 'Visual exercise/gear agrees with corrected local mapping; full expert anatomical QA not performed.'
        result={'file':str(file.relative_to(ROOT)),'sha256':sha(file),'format':fmt,'resolution':size,'exercise_ids':[r['exercise_id'] for r in entries],
                'names':names,'semantic_qa':semantic,'format_qa':'FAIL','overall_qa':'NEEDS_QA','reusable_now':False,'notes':note+' Existing160px WebP does not satisfy512px PNG requirement.'}
        existing.append(result)
        for r in entries: r['existing_candidates']=[result]
    assert len(existing)==19 and len({x['sha256'] for x in existing})==19
    write(ROOT/'data/exercise-image-existing-qa.json',{'reviewed_files':19,'mapped_uuid_count':sum(len(r['exercise_ids']) for r in existing),
           'reusable_now':0,'semantic_pass_candidates':17,'semantic_needs_review':2,'reviewer':'Codex visual inspection of source sheets and160px contact sheet','images':existing})
    write(path,manifest)
    print(json.dumps({'trial_pass':0,'trial_fail':10,'semantic_pass':9,'semantic_fail':1,'thumbnail_pass':7,'thumbnail_fail':3,'existing_reviewed':19,'existing_reusable':0}))

if __name__=='__main__': main()
