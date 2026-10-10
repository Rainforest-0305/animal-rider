#!/usr/bin/env node
// tolerance_sweep.mjs — «허용 실패횟수»를 점수가중으로 다시 정의하고 배수를 탐색한다.
// ★ 앞 지표의 결함: «쓸 수 있는 도약 개수 - 필요 성공수»로 셌는데, 도약마다 주는 점수가 다르다
//   (완전착지 가능 도약 = m점 / 임계구제 도약 = 1점). 개수만 세면 여유를 과대평가한다.
// 올바른 정의: «가장 좋은 도약 k개가 실패해도 목표점수를 채울 수 있는 최대 k» (최악가정).
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url'; import path from 'node:path';
const __d=path.dirname(fileURLToPath(import.meta.url)), SRC=path.join(__d,'..','src','game');
async function imp(f,t){const o=path.join(__d,`_ts_${t}.mjs`);await build({entryPoints:[path.join(SRC,f)],bundle:true,format:'esm',platform:'neutral',outfile:o});return import('file://'+o+'?t='+Date.now());}
const S=await imp('stages.ts','s'), L=await imp('stageLength.ts','l'), SC=await imp('score.ts','sc'), P=await imp('physics.ts','p');
const TH=SC.ROTATION_CREDIT_THRESHOLD;
const MEAS={Easy:[0.81,1.09],Moderate1:[0.88,1.72,1.23],Moderate2:[1.44,1.16,1.02,1.27],
  Difficult1:[1.44,1.16,0.84,1.44,1.48,0.74],Difficult2:[1.44,1.02,0.84,1.44,1.30,0.91,0.63,1.37],
  Extreme:[1.44,1.02,1.41,0.91,1.34,1.62,1.02,1.02,1.12,1.55,0.98]};
function padPts(c,m){
  if(c>=1.0) return m;
  if(c>=TH){const d=(1-c)*360;
    if(d<=P.PERFECT_LANDING_TOLERANCE_DEG) return m;
    if(d<=P.NORMAL_LANDING_TOLERANCE_DEG) return 1;}
  return 0;
}
function tol(caps,need,m){
  const pts=caps.map(c=>padPts(c,m)).filter(x=>x>0).sort((a,b)=>b-a);
  let k=0;
  while(k<=pts.length){const rem=pts.slice(k).reduce((s,x)=>s+x,0); if(rem<need) break; k++;}
  return k-1; // 마지막으로 성공한 k
}
console.log('임계='+TH.toFixed(4)+' (물리유도) / 지표=«최악가정 허용실패»(좋은 도약부터 실패시킴)');
console.log('');
console.log(['배수','티어별 허용실패(Easy→Extreme)','최소','도달별','24종'].join(' | '));
let best=null;
for(const m of [4,5,6,7,8,10,12]){
  const tols=[]; let cum=0; const gate={}; for(const g of S.TIER_GATES) gate[g.tier]=g.requiredStars;
  let blocked=null;
  for(const t of S.TIERS){
    if(cum<(gate[t.tier]??0)){blocked=t.tier;break;}
    const px=L.deriveStageLengthPx(t.targetScore), seg=L.segmentPointsOnFullRun(px), need=t.targetScore-seg;
    const caps=MEAS[t.tier];
    const total=caps.reduce((s,c)=>s+padPts(c,m),0);
    tols.push(tol(caps,need,m));
    cum+=t.stageCount*((seg+total>=t.targetScore)?3:1);
  }
  const mn=tols.length?Math.min(...tols):-9;
  if(mn>=1&&cum>=57&&!blocked&&!best) best=m;
  console.log(['x'+m, tols.join('/'), String(mn).padStart(3), String(cum).padStart(4)+'/144',
    (cum>=57?'성립':'불성립')+(blocked?'(차단:'+blocked+')':'')].join(' | '));
}
console.log('');
console.log(best? '★ 전 티어 허용실패>=1 을 만족하는 최소 배수 = x'+best
                : '★ Easy 는 «쓸 수 있는 도약이 1개»뿐이라 어떤 배수로도 허용실패 0 — 구조적 한계');
console.log('실행시각='+new Date().toISOString());
