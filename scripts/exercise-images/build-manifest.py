"""Offline catalog -> UUID manifest / batch plan. Never connects to Supabase.

Unknown definitions are held for review; this script never generates images.
Rebuilding preserves progress when an exercise's definition has not changed.
"""
import csv
import hashlib
import json
import re
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / 'data'
VERSION = 'gnd-anatomy-v1'
TRIAL = ['인클라인 벤치프레스', '덤벨 플라이', '체스트프레스 머신', '푸시업', '와이드 푸시업',
         '덤벨 레터럴 레이즈', '시티드 덤벨 숄더 프레스', '바벨 로우', '레그 익스텐션', '사이클']

# Definitions express the visually distinguishing equipment, stance and action.
# They are draft instructional specs, not evidence that a resulting image passed QA.
EXACT = {
 '인클라인 벤치프레스': ('bench_press', 'Lying on an inclined bench about 35 degrees, both feet on floor, lowering a BARBELL to upper chest; barbell remains above chest, not behind neck. Side three-quarter view.', ['incline bench', 'barbell'], ['pectoralis major']),
 '덤벨 플라이': ('chest_fly', 'Lying on a FLAT bench, holding one dumbbell in each hand, arms opened wide with softly bent elbows at chest height. Show the flat bench unmistakably. Three-quarter side view.', ['flat bench', 'two dumbbells'], ['pectoralis major']),
 '체스트프레스 머신': ('chest_press_machine', 'Seated upright against a back pad, feet on floor, pressing two MACHINE handles forward at chest level. Show the seated chest press machine, not a bench or free weights.', ['seated chest press machine'], ['pectoralis major']),
 '푸시업': ('push_up', 'Standard floor push-up, toes and palms on floor, body straight from heels to head, hands beneath shoulders, elbows bent at bottom. Side view.', ['floor'], ['pectoralis major']),
 '와이드 푸시업': ('push_up', 'Floor push-up with palms visibly wider than shoulder width, toes on floor, straight body, elbows bent. Front three-quarter view emphasizing the wide hand spacing.', ['floor'], ['pectoralis major']),
 '덤벨 레터럴 레이즈': ('lateral_raise', 'Standing upright, one dumbbell in each hand, lifting arms sideways to shoulder height with slightly bent elbows; weights travel sideways, not forward. Front three-quarter view.', ['two dumbbells'], ['lateral deltoids']),
 '시티드 덤벨 숄더 프레스': ('shoulder_press', 'Seated upright on a bench with upright back support, feet on floor, pressing TWO DUMBBELLS above shoulders, elbows under wrists. Front three-quarter view.', ['upright bench', 'two dumbbells'], ['anterior and lateral deltoids']),
 '바벨 로우': ('row', 'Standing with hips hinged and knees slightly bent, torso leaning forward about 45 degrees, both hands pulling a BARBELL toward the lower ribs. No bench or machine. Side three-quarter view.', ['barbell'], ['latissimus dorsi', 'rhomboids']),
 '레그 익스텐션': ('leg_extension', 'Seated against the back pad of a leg-extension MACHINE, knees aligned with machine pivot, extending both knees against a padded roller in front of lower shins. Side view.', ['leg extension machine'], ['quadriceps']),
 '사이클': ('cardio_bike', 'Riding a stationary exercise bicycle, seated on the saddle, feet on pedals, hands on handlebars. Show both wheels or stationary flywheel housing and entire bicycle.', ['stationary exercise bicycle'], ['quadriceps']),
 '랫풀다운': ('lat_pulldown', 'Seated under a high cable pulley, thighs under support pads, hands on a wide bar, pulling bar toward upper chest in front of the head.', ['lat pulldown machine', 'wide bar'], ['latissimus dorsi']),
 '페이스풀': ('face_pull', 'Standing facing a cable machine, holding a rope attachment with both hands, pulling rope ends to either side of the face with elbows elevated.', ['cable machine', 'rope attachment'], ['posterior deltoids']),
 '시티드 로우': ('row', 'Seated with knees slightly bent, feet on foot plates, torso upright, pulling a low cable handle toward abdomen without leaning back.', ['low cable row machine'], ['latissimus dorsi', 'rhomboids']),
 '트레드밀': ('cardio_treadmill', 'Running on a motorized treadmill belt, upright body, natural alternating leg stride and bent arms. Entire treadmill is inside the cell.', ['treadmill'], ['quadriceps']),
 '복근 롤아웃': ('rollout', 'Kneeling on floor with both hands gripping an ab wheel, rolling wheel forward while extending hips and arms without arching back.', ['ab wheel'], ['rectus abdominis']),
 '벤치프레스': ('bench_press', 'Lying on a flat bench, feet on floor, both hands gripping a barbell above mid chest, elbows bent in a controlled bench press.', ['flat bench', 'barbell'], ['pectoralis major']),
 '스쿼트': ('squat', 'Barbell back squat, standing with a barbell resting on upper back, feet shoulder-width apart, hips and knees bent in a squat.', ['barbell'], ['quadriceps', 'gluteus maximus']),
 '바벨 백스쿼트': ('squat', 'Barbell back squat, barbell resting across upper back, feet shoulder-width, bending hips and knees with heels planted.', ['barbell'], ['quadriceps', 'gluteus maximus']),
 '데드리프트': ('deadlift', 'Conventional barbell deadlift from floor, feet hip-width, hands outside knees, hips hinged and back neutral, bar close to shins.', ['barbell'], ['gluteus maximus', 'hamstrings']),
 '컨벤셔널 데드리프트': ('deadlift', 'Conventional barbell deadlift, feet hip-width, grip outside legs, neutral spine, lifting bar from floor close to shins.', ['barbell'], ['gluteus maximus', 'hamstrings']),
 '오버헤드 프레스': ('shoulder_press', 'Standing strict barbell overhead press in FRONT of head, feet planted, pressing bar from upper chest overhead with no leg drive.', ['barbell'], ['anterior and lateral deltoids']),
 '시티드 덤벨 리어 레터럴 레이즈': ('rear_delt', 'Seated on a bench, torso hinged forward over thighs, holding two dumbbells and raising arms sideways, emphasizing posterior shoulders.', ['bench', 'two dumbbells'], ['posterior deltoids']),
 '니 푸시업': ('push_up', 'Knees and palms on floor, knees remain in contact with floor, straight line from knees to shoulders, bending elbows in a knee-supported push-up.', ['floor'], ['pectoralis major']),
 '덤벨 벤치프레스': ('bench_press', 'Lying on a flat bench, feet on floor, pressing one dumbbell in each hand upward from chest level.', ['flat bench', 'two dumbbells'], ['pectoralis major']),
 '덤벨 스퀴즈 프레스': ('bench_press', 'Lying on a flat bench, holding two dumbbells PRESSED TOGETHER over center of chest throughout the upward press; show dumbbells touching.', ['flat bench', 'two dumbbells'], ['pectoralis major']),
 '덤벨 풀오버': ('pullover', 'Lying lengthwise on a flat bench, holding ONE dumbbell with both hands, moving weight in an arc behind head with slightly bent elbows.', ['flat bench', 'one dumbbell'], ['latissimus dorsi', 'pectoralis major']),
 '인클라인 덤벨 플라이': ('chest_fly', 'Lying on a visibly inclined bench about 35 degrees, arms opening wide with slightly bent elbows, one dumbbell in each hand.', ['incline bench', 'two dumbbells'], ['pectoralis major']),
 '디클라인 덤벨 플라이': ('chest_fly', 'Lying on a decline bench, head LOWER than hips, ankles secured, opening two dumbbells sideways with softly bent elbows.', ['decline bench', 'two dumbbells'], ['pectoralis major']),
 '인클라인 벤치프레스 머신': ('chest_press_machine', 'Seated reclined in an incline chest press MACHINE, pressing handles upward and forward along an incline path, not a decline path.', ['incline chest press machine'], ['pectoralis major']),
 '디클라인 푸시업': ('push_up', 'Hands on floor and feet elevated on a stable bench, straight body descending from feet toward head, bending elbows to lower chest.', ['bench', 'floor'], ['pectoralis major']),
 '스탠딩 케이블 플라이': ('chest_fly', 'Standing between two cable columns, holding one handle in each hand, bringing arms together in front of chest at chest height.', ['dual cable machine', 'two handles'], ['pectoralis major']),
 '맨몸 스쿼트': ('squat', 'Bodyweight squat without weights, both feet planted shoulder-width, bending knees and hips with arms extended forward.', ['floor'], ['quadriceps', 'gluteus maximus']),
 '플랭크': ('plank', 'Forearms and toes on floor, elbows beneath shoulders, body straight and parallel to floor, holding position.', ['floor'], ['rectus abdominis']),
 '사이드 플랭크': ('plank', 'Side plank on one forearm and outer edge of feet, elbow under shoulder, hips lifted, body in a straight line.', ['floor'], ['obliques']),
 '크런치': ('crunch', 'Lying on back on floor, knees bent and feet planted, lifting shoulder blades slightly off floor without a full sit-up.', ['floor'], ['rectus abdominis']),
 '풀업': ('pull_up', 'Hanging from a pull-up bar with overhand grip, lifting chin above bar, feet off floor, back view.', ['pull-up bar'], ['latissimus dorsi']),
 '친업': ('pull_up', 'Pull-up with UNDERHAND palms-facing-body grip, chin above horizontal bar, feet off floor.', ['pull-up bar'], ['latissimus dorsi', 'biceps brachii']),
 '매달리기': ('dead_hang', 'Dead hang from horizontal bar, arms fully extended overhead, feet off floor, not performing a pull-up.', ['pull-up bar'], ['forearm flexors']),
 '걷기': ('cardio_walk', 'Walking on level ground, one foot in contact with floor, upright body and relaxed alternating arm swing; no treadmill.', ['floor'], ['quadriceps']),
 '러닝': ('cardio_run', 'Running on level ground with an unmistakable running stride, bent elbows, no treadmill or machine.', ['floor'], ['quadriceps']),
 '로잉': ('cardio_row', 'Seated on a rowing ergometer with feet strapped into foot plates, knees extending, pulling handle to lower ribs; entire rowing machine visible.', ['rowing ergometer'], ['latissimus dorsi', 'quadriceps']),
 '줄넘기': ('cardio_skip', 'Standing in mid rope skip, holding a rope handle in each hand with a continuous rope arc under feet.', ['jump rope'], ['gastrocnemius']),
 '덤벨 컬': ('biceps_curl', 'Standing, elbows close to ribs, palms up, curling two dumbbells toward shoulders.', ['two dumbbells'], ['biceps brachii']),
 '덤벨 해머 컬': ('biceps_curl', 'Standing, elbows beside ribs, curling two dumbbells with neutral thumb-up grip maintained throughout.', ['two dumbbells'], ['brachialis', 'brachioradialis']),
 '케이블 푸시다운': ('triceps_extension', 'Standing facing high cable pulley, elbows kept at sides, pressing a straight cable bar downward by extending elbows.', ['high cable machine', 'straight bar attachment'], ['triceps brachii']),
 '벤치 딥스': ('dip', 'Hands on edge of a bench behind hips, feet on floor in front, lowering hips in front of bench by bending elbows.', ['flat bench'], ['triceps brachii']),
 '힙 브릿지': ('hip_bridge', 'Lying on back on floor, knees bent, feet planted, lifting hips while shoulders stay on floor.', ['floor'], ['gluteus maximus']),
 '글루트 브릿지': ('hip_bridge', 'Lying on back on floor, knees bent, feet planted, lifting hips without a bench.', ['floor'], ['gluteus maximus']),
 '월 싯': ('wall_sit', 'Back against a vertical wall, knees and hips bent about 90 degrees, thighs horizontal and feet planted.', ['wall'], ['quadriceps']),
 '점핑잭': ('jumping_jack', 'Jumping jack with legs spread and both arms overhead, body upright; no equipment.', ['floor'], ['quadriceps']),
 '하이 니': ('high_knees', 'Running in place with one knee raised toward hip height and opposite elbow forward.', ['floor'], ['hip flexors']),
 '데드버그': ('dead_bug', 'Lying on back, one arm extending overhead and opposite leg extending low above floor while other hip and knee remain bent.', ['floor'], ['rectus abdominis']),
 '버드독': ('bird_dog', 'On hands and knees extending one arm forward and opposite leg backward parallel to floor, neutral back.', ['floor'], ['spinal stabilizers']),
 '마운틴 클라이머': ('mountain_climber', 'High plank on palms and toes, drawing one knee toward chest with opposite leg extended.', ['floor'], ['rectus abdominis']),
 '바이시클 크런치': ('crunch', 'Lying on back, shoulder blades lifted, twisting opposite elbow toward bent knee while other leg extends.', ['floor'], ['obliques']),
 '러시안 트위스트': ('core_rotation', 'Seated on floor with knees bent, torso leaned back, both hands together rotating torso to one side, no external weight.', ['floor'], ['obliques']),
 '레그 레이즈': ('leg_raise', 'Lying on back on floor, both straight legs raised toward vertical, pelvis controlled, no hanging bar.', ['floor'], ['rectus abdominis']),
 '플러터 킥': ('leg_raise', 'Lying on back, straight legs alternating small up-down movements above floor.', ['floor'], ['rectus abdominis']),
 '브이 업': ('v_up', 'Balancing on hips, torso and straight legs lifted into a V, hands reaching toward toes.', ['floor'], ['rectus abdominis']),
 '파이크 푸시업': ('push_up', 'Palms and toes on floor, hips raised in an inverted V, elbows bending to lower head between hands.', ['floor'], ['anterior deltoids']),
 '핸드스탠드': ('handstand', 'Inverted handstand with both palms on floor, arms straight, legs together vertically overhead.', ['floor'], ['deltoids']),
 '핸드스탠드 푸시업': ('push_up', 'Inverted handstand with both palms on floor, bending elbows to lower head toward floor, legs vertically overhead.', ['floor'], ['deltoids']),
 '캣 카우 스트레치': ('spinal_mobility', 'On hands and knees with spine gently rounded upward in cat stretch, shoulders above wrists and hips above knees.', ['floor'], ['spinal stabilizers']),
 '딥스': ('dip', 'On parallel dip bars, feet off floor, elbows bent, torso leaning slightly forward between bars.', ['parallel bars'], ['pectoralis major', 'triceps brachii']),
 '스포토 벤치프레스': ('bench_press', 'Flat barbell bench press paused with bar a few centimeters above chest without touching it.', ['flat bench', 'barbell'], ['pectoralis major']),
 '펙덱 플라이 머신': ('chest_fly', 'Seated upright in a pec-deck machine, elbows softly bent, bringing machine handles together in front of chest.', ['pec-deck machine'], ['pectoralis major']),
}

REVIEW = {
 '타이슨 푸시업': 'Existing guide and local generation prompt disagree on this movement.',
 'DY 로우 머신': 'Exact machine geometry and grip not confirmed.',
 '숄더프레스': 'Catalog name does not specify machine versus free weights.',
 '레그 컬': 'Prone/seated/standing version not specified.',
 '카프 레이즈': 'Standing/seated version and equipment not specified.',
 '하이퍼 익스텐션': 'Bench angle and movement range not specified.',
 '해머 벤치프레스': 'Hammer-grip dumbbells versus Hammer Strength machine not confirmed.',
 '업도미널 힙 쓰러스트': 'Catalog terminology requires explicit definition.',
 '중량 업도미널 힙 쓰러스트': 'Catalog terminology requires explicit definition.',
 '암 컬 머신': 'Machine geometry and arm support not specified.',
 '스컬 크러셔': 'Bar type not specified.',
 '힙 쓰러스트': 'External load/equipment not specified.',
 '카프 레이즈': 'Equipment not specified.',
}

# Explicit definitions for common machines and variations. Generic family rules
# must never erase these equipment differences.
EXACT.update({
 '디클라인 벤치프레스': ('bench_press','Lying on a decline bench with head lower than hips and ankles secured, pressing a BARBELL over lower chest.', ['decline bench','barbell'],['pectoralis major']),
 '디클라인 체스트 프레스 머신': ('chest_press_machine','Seated in a decline chest press machine, pushing handles forward and downward relative to shoulders, no dumbbells.', ['decline chest press machine'],['pectoralis major']),
 '스미스머신 벤치프레스': ('bench_press','Lying on FLAT bench inside Smith frame, pressing bar along fixed vertical rails over chest.', ['Smith machine','flat bench'],['pectoralis major']),
 '스미스머신 인클라인 벤치프레스': ('bench_press','Lying on visibly INCLINED bench inside Smith frame, pressing guided bar above upper chest.', ['Smith machine','incline bench'],['pectoralis major']),
 '클로즈 그립 벤치프레스': ('bench_press','Flat barbell bench press with hands close together near shoulder width and elbows kept near torso.', ['barbell','flat bench'],['triceps brachii']),
 '클로즈그립 스미스머신 벤치프레스': ('bench_press','Flat bench inside Smith machine, narrow grip on guided bar, extending elbows over chest.', ['Smith machine','flat bench'],['triceps brachii']),
 '시티드 딥스 머신': ('dip','Seated upright in dip machine with hands on handles beside hips, pushing handles DOWN by extending elbows.', ['seated dip machine'],['triceps brachii']),
 '어시스트 딥스 머신': ('dip','On parallel dip handles of assisted dip machine, knees on moving assistance pad, bending elbows to lower torso.', ['assisted dip machine'],['pectoralis major','triceps brachii']),
 '덤벨 Y 레이즈': ('shoulder_raise','Standing torso hinged forward, arms raised diagonally overhead to form a Y, light dumbbell each hand.', ['two dumbbells'],['lower trapezius']),
 '라잉 Y 레이즈': ('shoulder_raise','Prone on floor, arms diagonally extended overhead in a Y and lifted slightly off floor, no weights.', ['floor'],['lower trapezius']),
 '레터럴 레이즈 머신': ('lateral_raise','Seated in lateral raise machine, upper arms against elbow pads, raising arms sideways toward shoulder height.', ['lateral raise machine'],['lateral deltoids']),
 '리어 델토이드 플라이 머신': ('rear_delt','Seated facing chest pad of reverse pec deck, hands on handles in front, opening arms sideways backward.', ['reverse pec deck machine'],['posterior deltoids']),
 '슈러그 머신': ('shrug','Standing in shrug machine, arms straight at sides holding low handles, elevating shoulders without bending elbows.', ['shrug machine'],['upper trapezius']),
 '스미스머신 슈러그': ('shrug','Standing within Smith frame, straight arms holding guided bar in front of thighs, shrugging shoulders upward.', ['Smith machine'],['upper trapezius']),
 '비하인드 넥 프레스': ('shoulder_press','Barbell press from behind head, bar near upper trapezius, elbows below wrists, pressing upward. Do not render bar in front of face.', ['barbell'],['deltoids']),
 '숄더 탭': ('shoulder_tap','High plank on palms and toes, one hand lifts to touch opposite shoulder while torso remains stable.', ['floor'],['rectus abdominis']),
 '케이블 리버스 플라이': ('rear_delt','Standing facing two cable columns, crossing opposite handles in front and opening arms sideways at shoulder height.', ['dual cable machine','two handles'],['posterior deltoids']),
 '케이블 익스터널 로테이션': ('shoulder_rotation','Standing beside cable column, working elbow bent 90 degrees against side, rotating forearm OUTWARD away from abdomen.', ['cable machine','single handle'],['infraspinatus','teres minor']),
 '케이블 인터널 로테이션': ('shoulder_rotation','Standing beside cable column, working elbow bent 90 degrees against side, rotating forearm INWARD toward abdomen.', ['cable machine','single handle'],['subscapularis']),
 '푸시 프레스': ('shoulder_press','Standing with barbell in front rack, slight knee dip then leg drive to press bar overhead, distinct from strict press.', ['barbell'],['deltoids']),
 '플레이트 숄더 프레스': ('shoulder_press','Standing holding ONE weight plate with both hands at chest, pressing plate overhead.', ['weight plate'],['deltoids']),
 'RKC 플랭크': ('plank','Forearm plank with elbows pulling toward toes and glutes squeezed, rigid straight body with feet together.', ['floor'],['rectus abdominis']),
 '버피': ('burpee','Full sequence squat to hands on floor, feet jump back to push-up then forward and jump upward. Depict push-up phase; one illustration cannot prove full sequence.', ['floor'],['pectoralis major','quadriceps']),
 '복근 크런치 머신': ('crunch','Seated in abdominal crunch machine, torso flexing forward against padded resistance with pelvis stable.', ['abdominal crunch machine'],['rectus abdominis']),
 '케이블 크런치': ('crunch','Kneeling facing high cable pulley, rope beside head, curling torso downward using abdominal flexion.', ['high cable machine','rope'],['rectus abdominis']),
 '케이블 트위스트': ('core_rotation','Standing side-on to cable pulley at chest height, hands together gripping handle, rotating torso horizontally.', ['cable machine','handle'],['obliques']),
 '토르소 로테이션 머신': ('core_rotation','Seated with thighs secured in torso rotation machine, torso rotating against padded upper-body support.', ['torso rotation machine'],['obliques']),
 '플랭크 트위스트': ('plank','Forearm plank, rotating hips toward one side while elbows stay on floor.', ['floor'],['obliques']),
 '필라테스 잭나이프': ('core_flexion','Lying on back, both straight legs raised vertically, lifting pelvis off mat with arms pressed to floor.', ['floor'],['rectus abdominis']),
 '리스트 롤러': ('wrist','Standing arms forward, both hands holding wrist roller handle with rope and hanging weight, rotating wrists to wind rope.', ['wrist roller','hanging weight'],['forearm flexors']),
 '악력기': ('grip','One hand squeezing a spring hand gripper between palm and fingers; show entire athlete and close clear gripper at chest height.', ['spring hand gripper'],['forearm flexors']),
 '바이셉 컬 머신': ('biceps_curl','Seated in biceps curl machine, upper arms supported on preacher pad, curling machine handles upward.', ['biceps curl machine'],['biceps brachii']),
 '프리쳐 컬 머신': ('biceps_curl','Seated with upper arms resting on angled preacher pad, bending elbows against machine lever handles.', ['preacher curl machine'],['biceps brachii']),
 '트라이셉 익스텐션 머신': ('triceps_extension','Seated in triceps extension machine, upper arms supported on pad, extending elbows against lever handles.', ['triceps extension machine'],['triceps brachii']),
 '트라이셉 프레스 머신': ('triceps_extension','Seated upright in triceps press machine, pushing handles beside hips downward through elbow extension.', ['triceps press machine'],['triceps brachii']),
 '컨센트레이션 컬': ('biceps_curl','Seated leaning forward, working upper arm braced against inner thigh, curling ONE dumbbell toward shoulder.', ['bench','one dumbbell'],['biceps brachii']),
 '케이블 오버헤드 트라이셉 익스텐션': ('triceps_extension','Standing facing away from low cable pulley, rope overhead behind head, extending elbows while upper arms stay overhead.', ['low cable machine','rope'],['triceps brachii']),
 '케이블 라잉 트라이셉 익스텐션': ('triceps_extension','Lying on flat bench with low pulley behind head, upper arms vertical, extending elbows holding cable bar.', ['low cable machine','flat bench','bar attachment'],['triceps brachii']),
 '케이블 해머컬': ('biceps_curl','Standing facing LOW pulley, holding rope with neutral thumbs-up grip, elbows by ribs, curling upward.', ['low cable machine','rope'],['brachialis','brachioradialis']),
 '글루트 킥백 머신': ('hip_extension','Torso supported by machine chest pad, one foot pressing rear lever backward through hip extension.', ['glute kickback machine'],['gluteus maximus']),
 '노르딕 햄스트링 컬': ('leg_curl','Kneeling with ankles secured, torso and thighs straight, lowering entire body forward by extending knees without bending hips.', ['ankle restraint','floor'],['hamstrings']),
 '덤벨 레그 컬': ('leg_curl','Prone on flat bench, ONE dumbbell secured between feet, bending knees to bring heels upward.', ['flat bench','one dumbbell'],['hamstrings']),
 '덩키 카프 레이즈': ('calf_raise','Standing with hips hinged about90 degrees and hands supported, heels lifting onto forefeet, knees straight.', ['support bench'],['gastrocnemius']),
 '루마니안 데드리프트': ('deadlift','Standing holding barbell, slight knee bend, hips hinge backward lowering bar close to legs without resting on floor.', ['barbell'],['hamstrings','gluteus maximus']),
 '스모 데드리프트': ('deadlift','Wide stance, toes outward, hands gripping BARBELL inside knees, lifting bar from floor.', ['barbell'],['gluteus maximus','hamstrings']),
 '스티프 레그 데드리프트': ('deadlift','Standing barbell hip hinge with knees nearly straight, lowering bar close to shins, neutral back.', ['barbell'],['hamstrings']),
 '스미스머신 데드리프트': ('deadlift','Standing inside Smith frame, neutral-spine hip hinge, raising guided bar close to legs.', ['Smith machine'],['gluteus maximus','hamstrings']),
 '스미스머신 스쿼트': ('squat','Back squat inside Smith frame, guided bar across upper back, bending knees and hips with heels planted.', ['Smith machine'],['quadriceps','gluteus maximus']),
 '스미스머신 스플릿 스쿼트': ('lunge','Stationary split stance within Smith frame, guided bar on upper back, both feet planted while bending knees.', ['Smith machine'],['quadriceps','gluteus maximus']),
 '스미스머신 불가리안 스플릿 스쿼트': ('lunge','Split squat inside Smith frame, guided bar on upper back, rear foot elevated on a bench.', ['Smith machine','bench'],['quadriceps','gluteus maximus']),
 '스미스머신 카프 레이즈': ('calf_raise','Standing in Smith frame, guided bar on upper back, knees straight, lifting heels from a calf step.', ['Smith machine','step'],['gastrocnemius']),
 '스탠딩 카프 레이즈': ('calf_raise','Standing with knees straight on a step, raising heels high onto forefeet, no external weights.', ['step'],['gastrocnemius']),
 '시티드 카프 레이즈': ('calf_raise','Seated at seated calf machine, knees bent90 degrees and thigh pad above knees, raising heels from foot platform.', ['seated calf machine'],['soleus']),
 '스탠딩 햄스트링 컬 머신': ('leg_curl','Standing supported by hamstring curl machine, one ankle against roller, bending working knee backward.', ['standing leg curl machine'],['hamstrings']),
 '시티드 레그 컬': ('leg_curl','Seated with thighs secured by pad, heels over ankle roller, bending BOTH knees to pull roller downward under seat.', ['seated leg curl machine'],['hamstrings']),
 '시티드 원레그 컬': ('leg_curl','Seated leg curl machine with thighs secured, only ONE knee bending against ankle roller, other leg inactive.', ['seated leg curl machine'],['hamstrings']),
 '원레그 익스텐션': ('leg_extension','Seated in leg extension machine, only ONE knee straightening against shin roller, other leg relaxed.', ['leg extension machine'],['quadriceps']),
 '수평 레그 프레스': ('leg_press','Seated upright in horizontal leg press machine, feet on platform in front, extending hips and knees to push platform horizontally.', ['horizontal leg press machine'],['quadriceps','gluteus maximus']),
 '수평 원레그 프레스': ('leg_press','Horizontal leg press machine, only ONE foot on platform, pushing horizontally by extending knee and hip.', ['horizontal leg press machine'],['quadriceps','gluteus maximus']),
 '벨트 스쿼트 머신': ('squat','Standing on belt squat platform, load suspended from belt around pelvis, squatting with no bar on shoulders.', ['belt squat machine','hip belt'],['quadriceps','gluteus maximus']),
 '힙 어덕션 머신': ('hip_adduction','Seated in adductor machine, pads against INNER knees, moving thighs inward together.', ['hip adduction machine'],['hip adductors']),
 '힙 어브덕션 머신': ('hip_abduction','Seated in abductor machine, pads against OUTER knees, opening thighs outward.', ['hip abduction machine'],['gluteus medius']),
 '케이블 힙 어브덕션': ('hip_abduction','Standing beside LOW cable column, ankle cuff on outer leg, moving straight leg sideways away from body.', ['low cable machine','ankle cuff'],['gluteus medius']),
 '케이블 킥백': ('hip_extension','Standing facing low pulley, ankle cuff on working leg, extending leg backward while torso remains supported.', ['low cable machine','ankle cuff'],['gluteus maximus']),
 '케이블 풀 스루': ('hip_hinge','Facing away from LOW cable machine, rope held between legs, hips hinged then extended, arms straight.', ['low cable machine','rope'],['gluteus maximus','hamstrings']),
 '박스 점프': ('jump','Jumping with both feet toward top of stable box, knees flexed and arms swinging for balance.', ['plyometric box'],['quadriceps']),
 '스텝업': ('step_up','One foot on stable box, stepping upward by extending planted leg while other foot rises from floor.', ['box'],['quadriceps','gluteus maximus']),
 '프론트 스쿼트': ('squat','BARBELL resting across FRONT shoulders with elbows forward, heels planted, knees and hips bent in squat.', ['barbell'],['quadriceps']),
 '저처 스쿼트': ('squat','Barbell held in crooks of both elbows in front of abdomen, squatting with torso upright.', ['barbell'],['quadriceps','gluteus maximus']),
 '정지 백 스쿼트': ('squat','Barbell back squat paused at bottom, heels planted, hip crease near knee level; still image depicts bottom hold.', ['barbell'],['quadriceps','gluteus maximus']),
 '정지 데드리프트': ('deadlift','Conventional barbell deadlift paused with bar just above floor near shins, hips hinged and spine neutral.', ['barbell'],['gluteus maximus','hamstrings']),
 '정지 스모 데드리프트': ('deadlift','Wide sumo stance with hands inside knees, barbell paused near shins shortly above floor.', ['barbell'],['gluteus maximus','hamstrings']),
})

# The pause position above is a draft definition rather than a catalog guarantee.
# Hold versions whose pause point is not documented.
REVIEW.update({'정지 데드리프트':'Pause height not defined in catalog.', '정지 스모 데드리프트':'Pause height not defined in catalog.'})

for prefix, gear in [('덤벨','two dumbbells'),('바벨','barbell'),('이지바','EZ curl bar')]:
    for suffix in ['프리쳐 컬','스파이더 컬']:
        pose = 'Seated, upper arms supported on angled preacher pad, elbows flexing to curl load.' if '프리쳐' in suffix else 'Prone chest supported on incline bench, upper arms hanging vertically, curling load with palms up.'
        EXACT[prefix+' '+suffix]=('biceps_curl',pose+' Use '+gear+'.',[gear,'preacher bench' if '프리쳐' in suffix else 'incline bench'],['biceps brachii'])
EXACT['덤벨 프리처 해머 컬']=('biceps_curl','Seated on preacher bench, upper arms supported on angled pad, curling dumbbells with thumbs-up neutral grip.', ['two dumbbells','preacher bench'],['brachialis','brachioradialis'])

def equipment(name):
    if '스미스머신' in name: return ['Smith machine']
    if '트랩바' in name: return ['trap bar']
    if '세이프티바' in name: return ['safety squat bar']
    if '이지바' in name: return ['EZ curl bar']
    if '바벨' in name: return ['barbell']
    if '덤벨' in name: return ['one dumbbell' if ('원암' in name or '컨센트레이션' in name) else 'two dumbbells']
    if '케틀벨' in name: return ['kettlebell']
    if '케이블' in name: return ['cable machine']
    if '맨몸' in name: return ['floor']
    return []

def definition(name):
    if name in REVIEW: return None, REVIEW[name]
    if name in EXACT: return EXACT[name], None
    eq = equipment(name)
    # Specialist geometry is not inferred from the generic exercise family.
    if re.search('보수볼|머신|로터리|덩키 카프|레버리지|리니어|펜듈럼|브이 스쿼트|핵 스쿼트|JM|저크|스내치|클린|터키쉬|쓰러스터|라디얼|수피네이션', name):
        return None, 'Specialist equipment/multi-phase movement requires an explicit reviewed definition.'
    family = pose = muscles = None
    if '벤치프레스' in name and eq:
        family, muscles = 'bench_press', ['pectoralis major']
        bench = 'decline bench with head lower than hips' if '디클라인' in name else 'incline bench about 35 degrees' if '인클라인' in name else 'flat bench'
        pose = 'Lying on a ' + bench + ', feet secured, pressing load above chest.'
        eq = eq + [bench]
        if '클로즈' in name: pose += ' Hands noticeably closer than standard shoulder-width grip.'; muscles = ['triceps brachii']
    elif '플로어 프레스' in name and eq:
        family, pose, muscles = 'bench_press', 'Lying on FLOOR with bent knees, pressing load over chest; elbows stop against floor, no bench.', ['pectoralis major']
    elif '덤벨' in name and '플라이' in name:
        family, pose, muscles = 'chest_fly', 'Lying on a bench, opening both arms sideways with a slight elbow bend.', ['pectoralis major']
        bench = 'incline bench' if '인클라인' in name else 'decline bench' if '디클라인' in name else 'flat bench'
        eq += [bench]; pose += ' Bench must be a ' + bench + '.'
    elif '케이블' in name and '플라이' in name:
        family, muscles = 'chest_fly', ['pectoralis major']
        if '로우 풀리' in name: pose = 'Standing between two LOW cable pulleys, lifting handles upward and inward from hip height toward upper chest.'
        elif '인클라인' in name: pose = 'Lying on an incline bench between cable columns, opening arms wide then bringing cable handles together above upper chest.'; eq += ['incline bench']
        else: return None, 'Cable attachment height or stance not specified.'
        eq += ['two handles']
    elif '푸시업' in name:
        variants = {
          '인클라인 푸시업': 'Hands elevated on a bench, toes on floor, straight body sloping upward toward shoulders.',
          '클랩 푸시업': 'Explosive floor push-up, hands momentarily off floor clapping in front of chest, toes on floor.',
          '클로즈그립 푸시업': 'Floor push-up with palms close together beneath center of chest, straight body.',
          '아처 푸시업': 'Wide floor push-up shifted toward one bent elbow while opposite arm stays straight sideways.',
          '리버스그립 푸시업': 'Floor push-up with hands rotated so fingers point toward feet, straight body.',
          '인치웜 푸시업': 'From standing, hands walk forward on floor to a high plank and perform a push-up; depict high plank phase and describe full motion in metadata.',
        }
        if name not in variants: return None, 'Push-up variation/load not explicitly defined.'
        family, pose, muscles = 'push_up', variants[name], ['pectoralis major']; eq = ['bench', 'floor'] if '인클라인' in name else ['floor']
    elif '데드리프트' in name and eq:
        if '데피싯' in name: return None, 'Deficit platform height not specified.'
        family, muscles = 'deadlift', ['gluteus maximus', 'hamstrings']
        pose = 'Standing hip hinge, neutral back, lowering load close to legs and extending hips.'
        if '루마니안' in name: pose += ' Romanian version: softly bent knees, hips move backward, load remains off floor.'
        elif '스티프' in name: pose += ' Stiff-leg version: knees nearly straight, controlled hip hinge.'
        elif '스모' in name: pose += ' Sumo stance: very wide feet and hands inside knees.'
        elif '원레그' in name: pose += ' Balance on ONE leg while the other leg extends backward.'
        else: pose += ' Conventional stance: feet hip-width, grip outside knees, load starts on floor.'
    elif '런지' in name and (eq or name in ['런지','리버스 런지','사이드 런지']):
        if '트위스트' in name or '프론트 랙' in name: return None, 'Combined rotation/rack position requires separate definition.'
        family, muscles = 'lunge', ['quadriceps', 'gluteus maximus']
        pose = 'Split stance, lowering rear knee toward floor with front foot planted.'
        if '사이드' in name or '레터럴' in name: pose = 'Wide lateral step, bending stepping-leg knee while other leg remains straight.'
        elif '불가리안' in name: pose += ' Rear foot elevated on a bench.'; eq += ['bench']
        elif '리버스' in name or '백워드' in name: pose += ' Step backward into the lunge.'
        elif '워킹' in name: pose += ' Step forward through successive lunges.'
        else: pose += ' Step forward into the lunge.'
        if '바벨' in name: pose += ' Bar rests on upper back.'
        if not eq: eq = ['floor']
    elif '스플릿 스쿼트' in name and eq:
        family, pose, muscles = 'lunge', 'Stationary split stance, both feet remain planted, bending front and rear knees.', ['quadriceps','gluteus maximus']
        if '불가리안' in name: pose += ' Rear foot elevated on bench.'; eq += ['bench']
        if '바벨' in name: pose += ' Bar rests across upper back.'
    elif name in ['맨몸 오버헤드 스쿼트','트랩바 스쿼트']:
        return None, 'Arm position or trap-bar squat/hinge distinction requires explicit review.'
    elif '스쿼트' in name and (eq or name in ['와이드 스쿼트','점프 스쿼트','피스톨 스쿼트','피스톨 박스 스쿼트']):
        family, pose, muscles = 'squat', 'Both feet planted, bending knees and hips with neutral spine.', ['quadriceps', 'gluteus maximus']
        if '오버헤드' in name: pose += ' Load held OVERHEAD with straight arms.'
        elif '프론트' in name: pose += ' Load held in FRONT of shoulders.'
        elif '고블릿' in name: pose += ' One weight held with both hands at chest.'
        elif '덤벨' in name: pose += ' One dumbbell in each hand at sides.'
        elif '케틀벨' in name: return None, 'Kettlebell rack position not specified.'
        elif '바벨' in name or '스미스머신' in name or '세이프티바' in name: pose += ' Bar rests across upper back.'
        if '스모' in name or '와이드' in name: pose += ' Wide stance, toes angled outward.'
        if '박스' in name: pose += ' Squat toward a box behind hips.'; eq += ['box']
        if '피스톨' in name: pose = 'Squatting on ONE leg with opposite straight leg extended forward.' + (' Box behind hips.' if '박스' in name else '')
        if '점프' in name: pose += ' Jump upward from squat, both feet visibly leaving floor.'
        if not eq: eq = ['floor']
    elif '카프 레이즈' in name and eq:
        family, pose, muscles = 'calf_raise', 'Standing with knees straight, rising onto balls of feet by lifting heels.', ['gastrocnemius']
        if '바벨' in name: pose += ' Bar rests on upper back.'
    elif '숄더 프레스' in name and eq:
        family, muscles = 'shoulder_press', ['deltoids']
        if name.startswith('시티드'): pose = 'Seated upright on bench, pressing load overhead.'; eq += ['upright bench']
        elif '덤벨' in name: return None, 'Seated versus standing dumbbell press not specified.'
        else: pose = 'Standing upright, pressing load overhead in front of head.'
    elif '오버헤드 프레스' in name and '스미스머신' in name:
        return None, 'Seated/standing Smith press not specified.'
    elif '랜드마인 프레스' in name:
        if not name.startswith('원암'): return None, 'One-arm versus two-arm landmine press not specified.'
        family, pose, muscles = 'shoulder_press', 'Standing, one hand pressing free end of anchored barbell upward and forward along an angled arc.', ['anterior deltoids']; eq = ['barbell', 'landmine anchor']
    elif '레터럴 레이즈' in name and eq:
        family, muscles = 'lateral_raise', ['lateral deltoids']; pose = 'Standing, raising arm sideways to shoulder height.'
        if '벤트오버' in name: pose = 'Hips hinged forward, raising both arms sideways.'; muscles = ['posterior deltoids']; family = 'rear_delt'
        if '원암' in name: pose += ' Only one arm works.'
        if '케이블' in name: pose += ' Cable attached to LOW pulley and handle held in working hand.'; eq += ['single handle']
    elif name == '사이드 레터럴 레이즈':
        return None, 'Dumbbell/cable equipment is unspecified; avoid assuming an alias.'
    elif '프론트 레이즈' in name and eq:
        family, pose, muscles = 'front_raise', 'Standing, raising load FORWARD to shoulder height with softly bent elbows.', ['anterior deltoids']
        if '케이블' in name: pose += ' Load connected to low pulley.'
    elif '슈러그' in name and eq:
        family, pose, muscles = 'shrug', 'Standing with arms straight down holding load, elevating shoulders toward ears without bending elbows.', ['upper trapezius']
    elif '업라이트 로우' in name and eq:
        family, pose, muscles = 'upright_row', 'Standing, pulling load vertically close to torso with elbows rising out to sides.', ['deltoids']
    elif name == '덤벨 로우': return None, 'Single-arm supported versus unsupported row not specified.'
    elif name == '인버티드 로우':
        family, pose, muscles = 'row', 'Body straight beneath a fixed low bar, heels on floor, pulling chest up toward bar.', ['latissimus dorsi']; eq = ['fixed horizontal bar']
    elif name == '슈퍼맨 로우':
        family, pose, muscles = 'row', 'Prone on floor with chest slightly raised, arms bent to pull elbows toward ribs, no weights.', ['spinal erectors']; eq = ['floor']
    elif '리스트 컬' in name and eq:
        family, pose, muscles = 'wrist_curl', 'Seated with forearms supported on thighs, only wrists curling load upward.', ['forearm flexors']; eq += ['bench']
        if '리버스' in name: pose += ' Palms down, wrists extending upward.'; muscles = ['forearm extensors']
        else: pose += ' Palms up.'
        if '비하인드 백' in name: pose = 'Standing, holding load behind hips with straight arms, curling wrists only.'; eq = equipment(name)
        if '원암' in name: pose += ' Only one wrist works.'
    elif '컬' in name and eq and '레그' not in name:
        if '스트레치' in name or '프리쳐' in name or '프리처' in name or '스파이더' in name:
            return None, 'Preacher/support/cable arrangement needs explicit definition.'
        family, muscles = 'biceps_curl', ['biceps brachii']; pose = 'Standing, elbows beside ribs, bending elbows to curl load upward.'
        if '시티드' in name: pose = 'Seated upright on bench, elbows beside ribs, curling load upward.'; eq += ['bench']
        if '인클라인' in name: pose = 'Seated reclined on incline bench, upper arms hanging down, curling dumbbells.'; eq += ['incline bench']
        if '컨센트레이션' in name: return None, 'Concentration curl equipment not explicit.'
        if '해머' in name: pose += ' Neutral thumbs-up grip maintained.'; muscles = ['brachialis', 'brachioradialis']
        elif '리버스' in name: pose += ' Palms-down grip maintained.'; muscles = ['brachioradialis']
        else: pose += ' Palms face upward.'
        if '원암' in name: pose += ' Only ONE arm performs curl.'
        if '케이블' in name: return None, 'Cable attachment and pulley height not specified.'
    elif '트라이셉 익스텐션' in name and eq:
        family, muscles = 'triceps_extension', ['triceps brachii']
        if '라잉' in name: pose = 'Lying on flat bench, upper arms vertical, bending elbows to lower load toward forehead then extending elbows.'; eq += ['flat bench']
        elif '오버헤드' in name: pose = 'Standing with upper arms overhead, flexing then extending elbows behind head.'
        elif '시티드' in name: pose = 'Seated on upright bench, upper arms overhead, extending elbows to raise load.'; eq += ['upright bench']
        else: return None, 'Overhead versus lying triceps extension not specified.'
        if '케이블' in name: return None, 'Cable setup and attachment require explicit definition.'
    elif name in ['케이블 로프 푸시 다운','케이블 이지바 푸시 다운']:
        family, pose, muscles = 'triceps_extension', 'Standing facing HIGH cable, elbows fixed at sides, extending elbows to push attachment downward.', ['triceps brachii']; eq = ['high cable machine', 'rope attachment' if '로프' in name else 'EZ bar attachment']
    elif name in ['덤벨 킥백','덤벨 인클라인 킥백']:
        family, pose, muscles = 'triceps_extension', 'Torso hinged forward, upper arms along torso, extending elbows backward with dumbbells.', ['triceps brachii']; eq = ['two dumbbells']
        if '인클라인' in name: pose = 'Chest supported face-down on incline bench, upper arms beside torso, extending elbows backward.'; eq += ['incline bench']
    elif '싯업' in name or '크런치' in name:
        if name.startswith('중량') or '케이블' in name: return None, 'External load position/cable setup not specified.'
        family, muscles = 'crunch', ['rectus abdominis']; pose = 'Lying on back, knees bent, flexing torso to raise shoulders.'; eq = ['floor']
        if '싯업' in name: pose += ' Raise torso toward seated position.'
        if '디클라인' in name: pose += ' On a decline bench with head lower than hips and ankles secured.'; eq = ['decline bench']
        if '리버스' in name: pose = 'Lying on back with knees bent, curling pelvis off support toward chest.'
        if '사이드' in name: return None, 'Side crunch posture variant not specified.'
    elif name in ['행잉 니 레이즈','행잉 레그 레이즈','캡틴스 체어 니 레이즈','토즈투 바']:
        family, muscles = 'hanging_leg_raise', ['rectus abdominis']; pose = 'Hanging from horizontal bar, raising ' + ('bent knees toward chest.' if '니 레이즈' in name else 'straight legs forward.'); eq = ['pull-up bar']
        if '토즈투' in name: pose = 'Hanging from bar, raising both straight legs until toes approach the bar.'
        if '캡틴스' in name: pose = 'Forearms supported on captain chair pads, torso upright, raising bent knees.'; eq = ['captains chair']
    elif name in ['덤벨 사이드 벤드','케이블 사이드 벤드']:
        family, pose, muscles = 'side_bend', 'Standing upright, holding resistance in one hand at side, bending torso sideways without rotating.', ['obliques']; eq = ['one dumbbell'] if '덤벨' in name else ['low cable pulley', 'single handle']
    elif name in ['힐 터치','할로우 포지션','할로우 락','리버스 크런치','시티드 니업']:
        defs = {
         '힐 터치':'Lying on back with knees bent and shoulder blades lifted, reaching one hand sideways toward same-side heel.',
         '할로우 포지션':'Lying on back with lower back pressed to floor, straight arms overhead and straight legs raised slightly off floor.',
         '할로우 락':'Hollow-body hold on back with extended arms and legs, rocking gently as one rigid shape.',
         '리버스 크런치':'Lying on back with knees bent, curling pelvis upward toward chest.',
         '시티드 니업':'Seated on bench edge, hands gripping bench, drawing both bent knees toward torso.',
        }; family, pose, muscles = 'core_flexion', defs[name], ['rectus abdominis']; eq = ['bench'] if name=='시티드 니업' else ['floor']
    elif name in ['케틀벨 스윙','덩키 킥','파이어 하이드런트','사이드 라잉 클램','스탠딩 힙 어브덕션','라잉 힙 어브덕션','싱글 레그 글루트 브릿지']:
        defs = {
         '케틀벨 스윙':('hip_hinge','Standing, hips hinging then extending to swing ONE kettlebell with both hands to chest height; arms do not lift overhead.', ['kettlebell'], ['gluteus maximus','hamstrings']),
         '덩키 킥':('hip_extension','On hands and knees, extending one hip backward and upward with knee bent.', ['floor'], ['gluteus maximus']),
         '파이어 하이드런트':('hip_abduction','On hands and knees, lifting one bent knee sideways without rotating torso.', ['floor'], ['gluteus medius']),
         '사이드 라잉 클램':('hip_abduction','Lying on side with hips and knees bent, feet together, opening upper knee upward.', ['floor'], ['gluteus medius']),
         '스탠딩 힙 어브덕션':('hip_abduction','Standing on one leg, moving other straight leg sideways without cable or machine.', ['floor'], ['gluteus medius']),
         '라잉 힙 어브덕션':('hip_abduction','Lying on side, lifting upper straight leg sideways upward.', ['floor'], ['gluteus medius']),
         '싱글 레그 글루트 브릿지':('hip_bridge','Lying on back, one foot planted and other leg raised, lifting hips using planted leg.', ['floor'], ['gluteus maximus']),
        }; return defs[name], None
    if not pose: return None, 'No sufficiently explicit definition available in current specification.'
    return (family, pose + ' Use equipment: ' + ', '.join(eq) + '. Full body and equipment visible.', eq, muscles), None

def atomic_json(path, value):
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    temporary.replace(path)

def main():
    rows = json.loads((DATA/'exercise-image-catalog-snapshot.json').read_text(encoding='utf-8'))['rows']
    assert len(rows)==348 and len({r['id'] for r in rows})==348
    seeds = [r for r in rows if r['is_seed'] and not r['is_custom']]
    assert len(seeds)==348
    path = DATA/'exercise-image-manifest.json'
    old = {r['exercise_id']:r for r in json.loads(path.read_text(encoding='utf-8'))['exercises']} if path.exists() else {}
    exercises=[]
    for r in seeds:
        spec, reason = definition(r['name'])
        signature = hashlib.sha256(json.dumps(spec,ensure_ascii=False).encode()).hexdigest()
        item = {'exercise_id':r['id'], 'name':r['name'], 'body_part':r['body_part'], 'exercise_type':r['exercise_type'],
                'is_custom':False, 'scope':'seed', 'visual_family':spec[0] if spec else None,
                'pose_description':spec[1] if spec else None, 'equipment':spec[2] if spec else [], 'target_muscles':spec[3] if spec else [],
                'definition_status':'DRAFT_READY' if spec else 'NEEDS_REVIEW', 'definition_source':'curated explicit movement specification v1' if spec else None,
                'definition_signature':signature, 'review_notes':reason, 'batch_no':None, 'slot_no':None, 'status':'PENDING',
                'sheet_file':None,'cropped_file':None,'storage_path':None,'image_url':None,'prompt_version':VERSION,
                'qa_status':'NOT_RUN','qa_notes':None,'attempt_count':0,'last_error':None,'existing_candidates':[]}
        prev=old.get(r['id'])
        if prev and prev.get('definition_signature')==signature:
            for k in ['status','sheet_file','cropped_file','qa_status','qa_notes','attempt_count','last_error','existing_candidates','structural_qa','semantic_qa','pilot_040','pilot_080','pilot_120','pilot_160']:
                if k in prev: item[k]=prev[k]
        exercises.append(item)
    byname={r['name']:r for r in exercises}
    assert all(byname[n]['definition_status']=='DRAFT_READY' for n in TRIAL)
    batches=[{'batch_no':'GND-TRIAL-001','generation_authorized':True,'kind':'trial','exercises':[byname[n]['exercise_id'] for n in TRIAL]}]
    pending=[r for r in exercises if r['definition_status']=='DRAFT_READY' and r['name'] not in TRIAL]
    # Keep body parts separate and sort by family; small family groups can share a batch.
    for part in sorted({r['body_part'] for r in pending}):
        group=sorted([r for r in pending if r['body_part']==part],key=lambda r:(r['visual_family'],r['name'],r['exercise_id']))
        for offset in range(0,len(group),10):
            batches.append({'batch_no':f'GND-{len(batches):03d}','generation_authorized':False,'kind':'planned','body_part':part,'exercises':[r['exercise_id'] for r in group[offset:offset+10]]})
    byid={r['exercise_id']:r for r in exercises}
    for batch in batches:
        for slot, uid in enumerate(batch['exercises'],1):
            byid[uid]['batch_no']=batch['batch_no']; byid[uid]['slot_no']=slot
            if byid[uid]['status']=='PENDING': byid[uid]['status']='BATCHED'
    manifest={'schema_version':1,'catalog_snapshot':'exercise-image-catalog-snapshot.json','prompt_version':VERSION,
              'scope':'348 seed exercises only; custom exercises excluded','exercises':exercises}
    atomic_json(path,manifest)
    held=[]
    for part in sorted({r['body_part'] for r in exercises}):
        group=[r for r in exercises if r['body_part']==part and r['definition_status']=='NEEDS_REVIEW']
        for offset in range(0,len(group),10):
            held.append({'batch_no':f'GND-HOLD-{len(held)+1:03d}','generation_authorized':False,'kind':'NEEDS_REVIEW','body_part':part,
                         'exercises':[r['exercise_id'] for r in group[offset:offset+10]],'note':'Reserved planning group only. Definitions must be approved and prompt/order frozen before generation.'})
    atomic_json(DATA/'exercise-image-batches.json',{'grid':{'columns':5,'rows':2,'requested_width':2560,'requested_height':1024,'cell_size':512},'batches':batches,
                'held_batches':held,'held_for_review':[r['exercise_id'] for r in exercises if r['definition_status']=='NEEDS_REVIEW']})
    custom_path=DATA/'exercise-image-custom-review.json'
    # Private custom catalog details remain local and are not needed for rebuilding
    # the public seed manifest. Do not silently replace them with an empty export.
    excluded=json.loads(custom_path.read_text(encoding='utf-8'))['exercises'] if custom_path.exists() else []
    fields=['exercise_id','name','body_part','visual_family','definition_status','pose_description','equipment','target_muscles','batch_no','slot_no','status','qa_status','review_notes']
    with (DATA/'exercise-image-manifest.csv').open('w',encoding='utf-8-sig',newline='') as f:
        if any('pilot_040' in r for r in exercises):
            fields += ['pilot_first_generation_pass','pilot_regeneration_count','pilot_final_qa']
            for row in exercises:
                pilot=row.get('pilot_040',{})
                row['pilot_first_generation_pass']=str(pilot['first_generation_pass']).lower() if pilot else ''
                row['pilot_regeneration_count']=pilot.get('regeneration_count','')
                row['pilot_final_qa']=pilot.get('final_qa','')
        if any('pilot_080' in r for r in exercises):
            fields += ['pilot080_first_generation_pass','pilot080_regeneration_count','pilot080_final_qa']
            for row in exercises:
                pilot=row.get('pilot_080',{})
                row['pilot080_first_generation_pass']=str(pilot['first_generation_pass']).lower() if pilot else ''
                row['pilot080_regeneration_count']=pilot.get('regeneration_count','')
                row['pilot080_final_qa']=pilot.get('final_qa','')
        if any('pilot_120' in r for r in exercises):
            fields += ['pilot120_first_generation_pass','pilot120_regeneration_count','pilot120_final_qa']
            for row in exercises:
                pilot=row.get('pilot_120',{})
                row['pilot120_first_generation_pass']=str(pilot['first_generation_pass']).lower() if pilot else ''
                row['pilot120_regeneration_count']=pilot.get('regeneration_count','')
                row['pilot120_final_qa']=pilot.get('final_qa','')
        if any('pilot_160' in r for r in exercises):
            fields += ['pilot160_first_generation_pass','pilot160_regeneration_count','pilot160_final_qa']
            for row in exercises:
                pilot=row.get('pilot_160',{})
                row['pilot160_first_generation_pass']=str(pilot['first_generation_pass']).lower() if pilot else ''
                row['pilot160_regeneration_count']=pilot.get('regeneration_count','')
                row['pilot160_final_qa']=pilot.get('final_qa','')
        writer=csv.DictWriter(f,fieldnames=fields); writer.writeheader()
        writer.writerows({k:json.dumps(r[k],ensure_ascii=False) if isinstance(r[k],list) else r[k] for k in fields} for r in exercises)
    assert len({uid for b in batches for uid in b['exercises']})==sum(len(b['exercises']) for b in batches)
    print(json.dumps({'manifest':len(exercises),'definition_counts':dict(Counter(r['definition_status'] for r in exercises)),
                      'batches':len(batches),'held_batches':len(held),'custom_excluded_snapshot_count':13,'custom_local_records':len(excluded),'needs_review':[r['name'] for r in exercises if r['definition_status']=='NEEDS_REVIEW']},ensure_ascii=False))

if __name__=='__main__': main()
