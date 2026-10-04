"""Trial002 only: 2x2 native grid ->512PNG, no upscaling; user suspended768 gate.
Never edits the original manifest/batch plan or invokes generation/providers.
"""
import argparse
import hashlib
import json
import shutil
from pathlib import Path
from PIL import Image, ImageCms

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'output/exercise-images/trial-002'
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def boxes(width,height):
    return [(round(c*width/2),round(r*height/2),round((c+1)*width/2),round((r+1)*height/2)) for r in range(2) for c in range(2)]
def scale_cell(cell):
    if min(cell.size)<512: raise ValueError('Source cell below512px: upscaling prohibited')
    if cell.width!=cell.height: raise ValueError('Square native cells required; no stretching')
    return cell.resize((512,512),Image.Resampling.LANCZOS)
def main():
    parser=argparse.ArgumentParser();parser.add_argument('--source',required=True);args=parser.parse_args()
    b=json.loads((ROOT/'data/exercise-image-trial-002.json').read_text(encoding='utf-8'))
    assert len(b['exercises'])==4 and len({r['visual_family'] for r in b['exercises']})==4
    assert sha(ROOT/'data/exercise-image-manifest.json')==b['parent_manifest_sha256'], 'Parent manifest changed'
    for folder in ['sheets','cropped','reports']: (OUT/folder).mkdir(parents=True,exist_ok=True)
    source=Path(args.source); dest=OUT/'sheets/GND-TRIAL-002.png'
    if dest.exists() and sha(dest)!=sha(source): raise ValueError('Different trial image: overwrite refused')
    if source.resolve()!=dest.resolve(): shutil.copy2(source,dest)
    with Image.open(dest) as image:
        assert image.format=='PNG'; image.load(); sheet=image.convert('RGB')
    report={'batch_no':b['batch_no'],'source_file':str(dest.relative_to(ROOT)),'source_sha256':sha(dest),'source_resolution':sheet.size,
            'requested_resolution':[2048,2048],'historical_minimum_native_cell':[768,768],'minimum_native_cell':None,'minimum_768_gate_suspended_by_user':True,'generation_calls':1,'upscaling_allowed':False,'images':[]}
    profile=ImageCms.ImageCmsProfile(ImageCms.createProfile('sRGB')).tobytes()
    for row,box in zip(b['exercises'],boxes(*sheet.size)):
        cell=sheet.crop(box); target=OUT/'cropped'/f"{row['exercise_id']}.png"; png=scale_cell(cell); png.save(target,icc_profile=profile)
        sufficient=min(cell.size)>=512
        report['images'].append({'exercise_id':row['exercise_id'],'name':row['name'],'slot_no':row['slot_no'],'crop_box':box,
            'native_cell_resolution':cell.size,'file':str(target.relative_to(ROOT)),'sha256':sha(target),'output_resolution':[512,512],
            'scale_factor':512/cell.width,'upscaled':False,'format_qa':'PASS','native_resolution_qa':'PASS' if sufficient else 'FAIL',
            'semantic_qa':'NOT_RUN','thumbnail_qa':'NOT_RUN','overall_qa':'NEEDS_QA'})
    assert len({r['sha256'] for r in report['images']})==4
    for size in [48,160]:
        preview=Image.new('RGB',(2*size,2*size),(30,36,41))
        for i,row in enumerate(report['images']):
            with Image.open(ROOT/row['file']) as image: preview.paste(image.resize((size,size),Image.Resampling.LANCZOS),((i%2)*size,(i//2)*size))
        preview.save(OUT/f'reports/contact-{size}.png')
    path=ROOT/'data/exercise-image-trial-002-qa.json';path.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'source':sheet.size,'native_cells':[r['native_cell_resolution'] for r in report['images']],'output':[512,512],
                      'native_resolution_pass':sum(r['native_resolution_qa']=='PASS' for r in report['images']),'upscaled':0}))
if __name__=='__main__':main()
