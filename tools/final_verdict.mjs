#!/usr/bin/env node
// final_verdict.mjs — 실측 회전용량으로 «각 스테이지가 실제로 ★2/★3을 낼 수 있는가»를 판정.
// ★ 핵심 상호작용(내가 놓쳤다가 발견): 회전을 «인정»받아도 착지각이 틀어지면 완전착지 배수를 못 받는다.
//   플레이어는 체공용량 c(바퀴) 안에서 «정수 바퀴»를 노린다.
//   - c >= 1.00 : 정확히 1바퀴 → 착지각 0° → 완전착지 → 1회전 × mult
//   - THRESH <= c < 1.00 : c만큼 돌고 착지 → 착지 편차 (1-c)*360°
//        편차 <= PERFECT(14°) → 완전착지(×mult) / <= NORMAL(38°) → 일반(×1) / 초과 → 전복(0)
//   - c < THRESH : 회전 포기(0점). 억지로 돌면 전복이라 «쓸 수 없는» 도약이다.
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url'; import path from 'node:path';
const __d=path.dirname(fileURLToPath(import.meta.url)), SRC=path.join(__d,'..','src','game');
async function imp(f,t){const o=path.join(__d,`_fv_${t}.mjs`);await build({entryPoints:[path.join(SRC,f)],bundle:true,format:'esm',platform:'neutral',outfile:o});return import('file://'+o+'?t='+Date.now());}
const S=await imp('stages.ts','s'), L=await imp('stageLength.ts','l'), SC=await imp('score.ts','sc'), P=await imp('physics.ts','p');
const MULT=SC.jumpScore(360,'perfect').multiplier, TH=SC.ROTATION_CREDIT_THRESHOLD;
// [측정] tools/rotation_final.log — 스테이지별 도약 회전용량(바퀴)
const MEAS={1:[0.81,1.09],11:[0.88,1.72,1.23],19:[1.44,1.16,1.02,1.27],
  27:[1.44,1.16,0.84,1.44,1.48,0.74],35:[1.44,1.02,0.84,1.44,1.30,0.91,0.63,1.37],
  43:[1.44,1.02,1.41,0.91,1.34,1.62,1.02,1.02,1.12,1.55,0.98]};
const TIER_STAGE={Easy:1,Moderate1:11,Moderate2:19,Difficult1:27,Difficult2:35,Extreme:43};
function padPoints(c){
  if(c>=1.0) return {pts:MULT,kind:'완전착지'};
  if(c>=TH){const dev=(1-c)*360;
    if(dev<=P.PERFECT_LANDING_TOLERANCE_DEG) return {pts:MULT,kind:'완전착지(임계구제)'};
    if(dev<=P.NORMAL_LANDING_TOLERANCE_DEG) return {pts:1,kind:'일반착지(임계구제)'};
    return {pts:0,kind:'전복위험→포기'};}
  return {pts:0,kind:'회전불가'};
}
console.log('='.repeat(96));
console.log('최종 판정 — 실측 회전용량 기반 (완전착지 배수 x'+MULT+' / 회전인정 임계 '+TH+')');
console.log('착지 허용: 완전 ±'+P.PERFECT_LANDING_TOLERANCE_DEG+'° / 일반 ±'+P.NORMAL_LANDING_TOLERANCE_DEG+'°');
console.log('='.repeat(96));
console.log(['티어','T','구간점','부족점','도약','회전점','최대점','판정','여유'].join(' | '));
let cum=0, blocked=null; const gate={}; for(const g of S.TIER_GATES) gate[g.tier]=g.requiredStars;
const detail=[];
for(const t of S.TIERS){
  if(cum<(gate[t.tier]??0)){blocked={tier:t.tier,need:gate[t.tier],have:cum};break;}
  const caps=MEAS[TIER_STAGE[t.tier]]||[];
  const px=L.deriveStageLengthPx(t.targetScore), seg=L.segmentPointsOnFullRun(px), need=t.targetScore-seg;
  const per=caps.map(padPoints); const rot=per.reduce((s,x)=>s+x.pts,0);
  const max=seg+rot, ok=max>=t.targetScore;
  const usable=per.filter(x=>x.pts>0).length;
  const needSucc=Math.ceil(need/MULT), allowFail=usable-needSucc;
  cum+=t.stageCount*(ok?3:1);
  detail.push({t:t.tier,caps,per,usable,needSucc,allowFail});
  console.log([t.tier.padEnd(11),String(t.targetScore).padStart(3),String(seg).padStart(4),String(need).padStart(4),
    String(caps.length).padStart(3),String(rot).padStart(4),String(max).padStart(4),(ok?'★3':'★1').padStart(3),
    String(max-t.targetScore).padStart(4)].join(' | '));
}
console.log('');
console.log('도달가능 별 = '+cum+' / '+S.TOTAL_STARS+(blocked?'  ★차단: '+blocked.tier+'('+blocked.need+'별>'+blocked.have+')':''));
console.log('서리 57 → '+(cum>=57?'OK':'★불가')+'  /  돌담 48 → '+(cum>=48?'OK':'★불가')+
  '  ⇒ 24종 완주 '+(cum>=57?'★성립':'불성립'));
console.log('');
console.log('='.repeat(96));
console.log('★ 초보자 관점 — 티어별 «쓸 수 있는 도약» 과 «허용 실패횟수»');
console.log('='.repeat(96));
console.log(['티어','도약용량(바퀴)','쓸수있는도약','필요성공','허용실패'].join(' | '));
for(const d of detail){
  console.log([d.t.padEnd(11),'['+d.caps.map(c=>c.toFixed(2)).join(',')+']',
    String(d.usable).padStart(3),String(d.needSucc).padStart(3),
    (d.allowFail>=1?String(d.allowFail):'★'+d.allowFail).padStart(4)].join(' | '));
}
const zero=detail.filter(d=>d.allowFail<1);
console.log('');
console.log(zero.length? '★ 허용실패 0 이하 티어: '+zero.map(d=>d.t).join(', ')+'  → «최적플레이 전제». 판단기준1 위반'
                       : '전 티어 허용실패 1회 이상 → 초보자 여유 확보');
console.log('실행시각='+new Date().toISOString());
