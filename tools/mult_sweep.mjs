#!/usr/bin/env node
// mult_sweep.mjs — 완전착지 배수를 «임의로 고르지 않고» 판단기준1(전 티어 허용실패>=1)을
// 만족하는 최소값을 탐색한다. 회전용량은 실측(tools/rotation_final.log).
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url'; import path from 'node:path';
const __d=path.dirname(fileURLToPath(import.meta.url)), SRC=path.join(__d,'..','src','game');
async function imp(f,t){const o=path.join(__d,`_ms_${t}.mjs`);await build({entryPoints:[path.join(SRC,f)],bundle:true,format:'esm',platform:'neutral',outfile:o});return import('file://'+o+'?t='+Date.now());}
const S=await imp('stages.ts','s'), L=await imp('stageLength.ts','l'), SC=await imp('score.ts','sc'), P=await imp('physics.ts','p');
const TH=SC.ROTATION_CREDIT_THRESHOLD;
const MEAS={Easy:[0.81,1.09],Moderate1:[0.88,1.72,1.23],Moderate2:[1.44,1.16,1.02,1.27],
  Difficult1:[1.44,1.16,0.84,1.44,1.48,0.74],Difficult2:[1.44,1.02,0.84,1.44,1.30,0.91,0.63,1.37],
  Extreme:[1.44,1.02,1.41,0.91,1.34,1.62,1.02,1.02,1.12,1.55,0.98]};
console.log('회전인정 임계 = '+TH.toFixed(4)+' (= 1 - '+P.NORMAL_LANDING_TOLERANCE_DEG+'/360, 물리 유도)');
console.log('');
console.log(['배수','티어별 허용실패','최소허용실패','전티어>=1','도달별','24종'].join(' | '));
function evalMult(m){
  const rows=[]; let cum=0; const gate={}; for(const g of S.TIER_GATES) gate[g.tier]=g.requiredStars;
  for(const t of S.TIERS){
    if(cum<(gate[t.tier]??0)) return {rows,cum,blocked:t.tier};
    const caps=MEAS[t.tier]; const px=L.deriveStageLengthPx(t.targetScore);
    const seg=L.segmentPointsOnFullRun(px), need=t.targetScore-seg;
    let rot=0, usable=0;
    for(const c of caps){
      let pts=0;
      if(c>=1.0){pts=m;usable++;}
      else if(c>=TH){const dev=(1-c)*360;
        if(dev<=P.PERFECT_LANDING_TOLERANCE_DEG){pts=m;usable++;}
        else if(dev<=P.NORMAL_LANDING_TOLERANCE_DEG){pts=1;usable++;}}
      rot+=pts;
    }
    const ok=seg+rot>=t.targetScore;
    rows.push({tier:t.tier,allowFail:usable-Math.ceil(need/m)});
    cum+=t.stageCount*(ok?3:1);
  }
  return {rows,cum,blocked:null};
}
let chosen=null;
for(const m of [2,3,4,5,6,7,8,9,10]){
  const r=evalMult(m);
  const mins=r.rows.map(x=>x.allowFail);
  const minv=mins.length?Math.min(...mins):-99;
  const ok=minv>=1 && r.cum>=57 && !r.blocked;
  if(ok&&!chosen) chosen=m;
  console.log(['x'+m, r.rows.map(x=>x.allowFail).join('/'), String(minv).padStart(3),
    (minv>=1?'YES':'no').padStart(4), String(r.cum).padStart(4)+'/144',
    (r.cum>=57?'성립':'불성립')+(r.blocked?'(차단:'+r.blocked+')':'')].join(' | '));
}
console.log('');
console.log(chosen? '★ 판단기준1(전 티어 허용실패>=1) 을 만족하는 «최소» 배수 = x'+chosen
                  : '★ 어떤 배수로도 전 티어 허용실패>=1 불가 — 다른 축 필요');
console.log('실행시각='+new Date().toISOString());
