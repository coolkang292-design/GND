// OPTION 1 원본 크롭을 설치·알림 아이콘으로 변환. 실행: node scripts/generate-icons.mjs
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
const require=createRequire(import.meta.url);
const sharp=createRequire(require.resolve('next/package.json'))('sharp');
const master='public/icons/gnd-monogram-master.png';
for(const size of [192,512]){
 const png=await sharp(master).resize(size,size).removeAlpha().png().toBuffer();
 writeFileSync(`public/icons/gnd-monogram-${size}.png`,png);
 writeFileSync(`public/icons/icon-${size}.png`,png); // 기존 설치본·알림 목록 경로 호환
}
const maskable=await sharp({create:{width:512,height:512,channels:3,background:'#090A0C'}}).composite([{input:await sharp(master).resize(450,450).toBuffer(),left:31,top:31}]).png().toBuffer();
writeFileSync('public/icons/gnd-monogram-maskable-512.png',maskable);
writeFileSync('public/icons/icon-maskable-512.png',maskable);
const apple=await sharp(master).resize(180,180).removeAlpha().png().toBuffer();
writeFileSync('public/icons/gnd-monogram-180.png',apple);
writeFileSync('src/app/apple-icon.png',apple);
// Android 상태표시줄: 원본의 라임 G만 투명 배경·단색 실루엣으로 변환.
const {data,info}=await sharp(master).extract({left:36,top:62,width:210,height:175}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
for(let i=0;i<data.length;i+=4){const visible=data[i]>90&&data[i+1]>120&&data[i+2]<110;data[i]=data[i+1]=data[i+2]=255;data[i+3]=visible?255:0;}
const symbol=await sharp(data,{raw:info}).trim().resize(72,72,{fit:'contain',background:'#00000000'}).png().toBuffer();
await sharp({create:{width:96,height:96,channels:4,background:'#00000000'}}).composite([{input:symbol,left:12,top:12}]).png().toFile('public/icons/gnd-monogram-badge-96.png');
const favicon=await sharp(master).resize(32,32).ensureAlpha().png().toBuffer();
const header=Buffer.alloc(22);header.writeUInt16LE(1,2);header.writeUInt16LE(1,4);header[6]=header[7]=32;header.writeUInt16LE(1,10);header.writeUInt16LE(32,12);header.writeUInt32LE(favicon.length,14);header.writeUInt32LE(22,18);
writeFileSync('src/app/favicon.ico',Buffer.concat([header,favicon]));
console.log('GND OPTION 1 설치·알림 아이콘 생성 완료');
