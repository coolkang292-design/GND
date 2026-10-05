"""Copy local pilot deliverables to the user-named folder, without app/DB writes."""
import csv, hashlib, json, shutil
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / 'output/exercise-images/pilot-040'
DEST = ROOT / '운동 이미지/GPT 생성된 이미지'

def export():
    plan = json.loads((ROOT/'data/exercise-image-pilot-040.json').read_text(encoding='utf-8'))
    ledger = json.loads((ROOT/'data/exercise-image-pilot-040-qa.json').read_text(encoding='utf-8'))
    summary = json.loads((ROOT/'data/exercise-image-pilot-040-summary.json').read_text(encoding='utf-8'))
    # All paths belong to this named pilot; retain existing unrelated files.
    for name in ['PASS_512','생성시도_512','원본시트','검수','생성프롬프트','기록']:
        (DEST/name).mkdir(parents=True, exist_ok=True)
    for src, target in [('attempts','생성시도_512'),('sheets','원본시트'),('reports','검수'),('prompts','생성프롬프트')]:
        for file in (SRC/src).glob('*'):
            if file.is_file(): shutil.copy2(file, DEST/target/file.name)
    definitions = {r['exercise_id']: r for r in plan['selection']}
    mappings = []
    for item in ledger['images']:
        row = definitions[item['exercise_id']]
        attempts = item['attempts']
        entry = {k: row[k] for k in ['exercise_id','name','body_part','visual_family','equipment','target_muscles','batch_no','slot_no']}
        entry.update(first_generation_pass=bool(attempts) and attempts[0]['qa']=='PASS', regeneration_count=max(0,len(attempts)-1), final_qa=item['final_qa'], file=None, sha256=None)
        if item['final_qa']=='PASS':
            file = ROOT/item['final_file']
            target = DEST/'PASS_512'/file.name
            shutil.copy2(file,target)
            with Image.open(target) as im: assert im.format=='PNG' and im.size==(512,512)
            entry.update(file='PASS_512/'+file.name, sha256=hashlib.sha256(target.read_bytes()).hexdigest())
            assert entry['sha256']==item['final_sha256']
        mappings.append(entry)
    (DEST/'운동_UUID_파일매핑.json').write_text(json.dumps(mappings,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    fields = ['exercise_id','name','body_part','visual_family','first_generation_pass','regeneration_count','final_qa','file','sha256']
    with (DEST/'운동_UUID_파일매핑.csv').open('w',encoding='utf-8-sig',newline='') as f:
        writer=csv.DictWriter(f,fieldnames=fields,extrasaction='ignore');writer.writeheader();writer.writerows(mappings)
    for name in ['exercise-image-pilot-040.json','exercise-image-pilot-040-qa.json','exercise-image-pilot-040-summary.json','exercise-image-manifest.json']:
        shutil.copy2(ROOT/'data'/name,DEST/'기록'/name)
    canvas = Image.new('RGB',(1000,8*95),(16,27,36));draw=ImageDraw.Draw(canvas)
    font=ImageFont.truetype('C:/Windows/Fonts/malgun.ttf',11)
    for i,entry in enumerate(mappings):
        x=(i%5)*200;y=(i//5)*95
        if entry['file']:
            with Image.open(DEST/entry['file']) as im:canvas.paste(im.resize((48,48),Image.Resampling.LANCZOS),(x,y))
        draw.text((x,y+50),entry['name'],fill='white',font=font)
        draw.text((x,y+67),entry['final_qa'],fill='white',font=font)
    canvas.save(DEST/'검수/전체_실제48px.png')
    fail = [r['name'] for r in mappings if r['final_qa']=='FAIL']
    text = f'''# 클로드 인수인계 — GND 운동 이미지 40개 파일럿

기준일: 2026-10-05. 이 파일은 로컬 자산 인수인계이며 운영 적용 승인이 아니다.

## 현재 상태

- 최초 PASS {summary['first_pass']} / 재생성 후 PASS {summary['pass_after_retry']} / 현재 FAIL {summary['final_fail']} / 미판정 {summary['pending']}.
- 이미지 생성 호출 {summary['image_generation_calls']}회, 전체 40개 기준 평균 재생성 {summary['average_regeneration_all40']:.3f}회.
- 남은 FAIL: {', '.join(fail) if fail else '없음'}.
- 전체 생성 확대 권고: {'가능' if summary['recommend_expansion'] else '보류'}. 반복 오류: {json.dumps(summary['repeated_error_categories'],ensure_ascii=False)}.
- 40개는 기본 운동 중 정의 완료 운동만 선정. 기존 NEEDS_REVIEW 74개와 사용자 등록 13개 제외.
- 이미지 내용과 실제 48px 비교대지로 검수. 독립 운동 전문가 검수와 이 40개의 실제 앱 렌더링은 미검증.

## 파일 사용법

1. `운동_UUID_파일매핑.json`의 final_qa가 PASS이며 file이 있는 행만 사용한다. 이름 검색으로 연결하지 말고 exercise_id UUID로 연결한다.
2. `PASS_512/UUID.png`가 사용 후보이다. 전부 512×512 PNG. `생성시도_512`와 `원본시트`는 과정 기록으로 앱에 연결하지 않는다.
3. 신규 기본 방식은 2×2 원본 → 셀 crop → 512×512 축소. 최초 원본은 1254×1254, 셀은 627×627. 확대하지 않았다. 실패 운동은 해당 운동만 개별 재생성한다.
4. 최초 성공 여부/재생성 횟수/각 시도 판정은 `기록/exercise-image-pilot-040-qa.json`, 전체 family별 실패율은 summary.json을 확인한다.
5. `검수/전체_실제48px.png`는 각 그림을 실제 48px로 배치한 대지다. 이름/판정 문자는 검수 대지에만 있으며 자산에는 없다.
6. `생성프롬프트`에는 내장 image_gen 생성 프롬프트를 보관한다. 기존 GND 은회색 인체/짙은 남색 배경/청색 목표 근육 스타일을 유지한다.

## 클로드가 앱 적용을 맡을 때

사용자의 별도 적용 지시를 받은 뒤 기존 ExercisePicker/썸네일 구조를 확인하여 PASS 자산을 UUID 매핑으로 로컬 연결한다. 48px 크기, 선명도/식별성, 행 높이/정렬, 로딩 실패 시 기존 부위 아이콘 fallback을 개발 서버에서 직접 확인한다. 기존 사용자 수정과 이전 로컬 QA 4개를 보존한다. `.env.local`은 운영 Supabase에 연결되므로 DB 쓰기 없는 로컬 검수부터 진행한다.

현재 production DB/schema 변경, Supabase Storage 업로드, 배포, 335개 전체 생성은 승인되지 않았다. 이 문서를 보고 자동으로 실행하지 않는다. Codex는 이미지와 검수/기록을 담당하고 앱 구현은 클로드 담당이다. 이 폴더 전달은 클로드에게 메시지를 보냈다는 뜻이 아니다.

## 추가 주의

파일럿 밖 `덤벨 스컬 크러셔` 초안에 이두 컬 정의 불일치를 발견했으며 이번 40개에는 포함하지 않았다. 기존 74개 목록을 바꾸지 않고 별도 재검토 메모로 남겼다. 261개 전체 정의가 모두 검증됐다고 가정하지 않는다.
'''
    text += '\n## 오류 유형별 건수\n\n실패한 시도 기준으로 집계하며 한 시도에 여러 오류가 있을 수 있다.\n\n| 유형 | 건수 |\n|---|---:|\n'
    text += ''.join(f'| {key} | {count} |\n' for key,count in summary['error_types_by_failed_attempt'].items())
    text += '\n## visual_family별 실패율\n\n분모는 해당 family에 선정된 운동 수. 표본이 작은 파일럿이므로 전체 실패율로 일반화하지 않는다.\n\n| family | 선정 | 최초 실패율 | 최종 실패율 |\n|---|---:|---:|---:|\n'
    text += ''.join(f"| {key} | {value['selected']} | {value['initial_failure_rate']:.0%} | {value['final_failure_rate']:.0%} |\n" for key,value in summary['families'].items())
    text += '\n## 클로드에게 붙여 넣을 요청\n\n```text\nC:\\Users\\SAMSUNG\\workout-app\\운동 이미지\\GPT 생성된 이미지\\클로드_인수인계.md를 읽고 PASS_512 이미지만 UUID 매핑에 따라 GND 운동 선택 화면에 로컬 적용해줘. 실제 48px 렌더링과 로딩 실패 fallback을 직접 QA해줘. production DB 변경, Storage 업로드, 배포는 하지 말고 로컬 검증 결과를 먼저 보고해줘.\n```\n'
    (DEST/'클로드_인수인계.md').write_text(text,encoding='utf-8')
    files=[p for p in DEST.rglob('*') if p.is_file()]
    print(json.dumps({'destination':str(DEST),'pass_png':sum(r['final_qa']=='PASS' for r in mappings),'mapping_rows':len(mappings),'files':len(files),'bytes':sum(p.stat().st_size for p in files)},ensure_ascii=False))

if __name__=='__main__':export()
