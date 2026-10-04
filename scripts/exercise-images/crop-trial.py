"""Crop only the authorized trial; record source resolution rather than hiding upscaling.
Usage: python scripts/exercise-images/crop-trial.py --source <generated PNG>
No generation, upload, DB connection or app edits.
"""
import argparse
import hashlib
import json
import shutil
from pathlib import Path
from PIL import Image, ImageCms, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT/'output/exercise-images'

def digest(p): return hashlib.sha256(p.read_bytes()).hexdigest()

def main():
    parser=argparse.ArgumentParser(); parser.add_argument('--source', required=True); args=parser.parse_args()
    manifest_path=ROOT/'data/exercise-image-manifest.json'
    manifest=json.loads(manifest_path.read_text(encoding='utf-8'))
    entries=sorted([r for r in manifest['exercises'] if r['batch_no']=='GND-TRIAL-001'],key=lambda r:r['slot_no'])
    assert len(entries)==10 and [r['slot_no'] for r in entries]==list(range(1,11))
    assert all(r['definition_status']=='DRAFT_READY' for r in entries)
    for folder in ['sheets','cropped','reports']: (OUT/folder).mkdir(parents=True,exist_ok=True)
    source=Path(args.source); dest=OUT/'sheets/GND-TRIAL-001.png'
    if dest.exists() and digest(dest)!=digest(source): raise RuntimeError('Refusing to overwrite different trial sheet')
    if source.resolve()!=dest.resolve(): shutil.copy2(source,dest)
    with Image.open(dest) as im:
        assert im.format=='PNG'; im.load(); sheet=im.convert('RGB'); width,height=sheet.size
    profile=ImageCms.ImageCmsProfile(ImageCms.createProfile('sRGB')).tobytes()
    report={'batch_no':'GND-TRIAL-001','source_file':str(dest.relative_to(ROOT)), 'source_sha256':digest(dest),
            'source_resolution':[width,height], 'requested_resolution':[2560,1024], 'crop_policy':'round normalized grid boundaries; no semantic recentering; pad/resample to 512',
            'has_text':'manual review required', 'images':[]}
    board=Image.new('RGB',(5*160,2*180),(22,28,34)); draw=ImageDraw.Draw(board)
    for index,row in enumerate(entries):
        col=index%5; line=index//5
        box=(round(col*width/5),round(line*height/2),round((col+1)*width/5),round((line+1)*height/2))
        cell=sheet.crop(box); rawsize=cell.size
        # A square canvas preserves body/equipment aspect ratio, never stretching it.
        side=max(rawsize); square=Image.new('RGB',(side,side),cell.getpixel((0,0))); square.paste(cell,((side-rawsize[0])//2,(side-rawsize[1])//2))
        png=square.resize((512,512),Image.Resampling.LANCZOS)
        target=OUT/'cropped'/f"{row['exercise_id']}.png"
        png.save(target,icc_profile=profile)
        with Image.open(target) as check:
            check.load(); valid=check.format=='PNG' and check.size==(512,512) and check.mode=='RGB' and bool(check.info.get('icc_profile'))
        sufficient=min(rawsize)>=512
        result={'exercise_id':row['exercise_id'],'name':row['name'],'slot_no':row['slot_no'],'crop_box':box,'source_cell_resolution':rawsize,
                'file':str(target.relative_to(ROOT)), 'resolution':[512,512],'bytes':target.stat().st_size,'sha256':digest(target),
                'format_qa':'PASS' if valid else 'FAIL','source_resolution_qa':'PASS' if sufficient else 'FAIL',
                'upscaled':not sufficient,'scale_factor':round(512/side,4),'semantic_qa':'NOT_RUN','thumbnail_qa':'NOT_RUN','overall_qa':'NEEDS_QA'}
        report['images'].append(result)
        row.update(status='CROPPED',sheet_file=str(dest.relative_to(ROOT)),cropped_file=str(target.relative_to(ROOT)),attempt_count=max(1,row['attempt_count']),
                   structural_qa='PASS' if valid and sufficient else 'FAIL',qa_status='NEEDS_QA',qa_notes='Native source cell below 512px; enlarged output is not native 512px quality.' if not sufficient else None)
        board.paste(png.resize((160,160),Image.Resampling.LANCZOS),(col*160,line*180)); draw.text((col*160+5,line*180+161),f'Slot {index+1}',fill='white')
    assert len({r['sha256'] for r in report['images']})==10, 'Duplicate trial outputs'
    report['duplicate_sha256_count']=0
    board.save(OUT/'reports/trial-contact-160.png')
    for size in [48,64]:
        mini=Image.new('RGB',(5*(size+8),2*(size+8)),(22,28,34))
        for i,row in enumerate(entries):
            with Image.open(ROOT/row['cropped_file']) as img: mini.paste(img.resize((size,size),Image.Resampling.LANCZOS),((i%5)*(size+8),(i//5)*(size+8)))
        mini.save(OUT/f'reports/trial-thumbnails-{size}.png')
    (OUT/'reports/trial-qa.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    manifest_path.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'source':sheet.size,'png_count':len(entries),'output':[512,512],'native_cell_min':min(min(r['source_cell_resolution']) for r in report['images']),
                      'format_pass':sum(r['format_qa']=='PASS' for r in report['images']),'source_resolution_pass':sum(r['source_resolution_qa']=='PASS' for r in report['images'])}))

if __name__=='__main__': main()
