#!/usr/bin/env node
// measure_rotation_success.mjs — 티어별 «회전 성공률» 실측.
// 성공 = 도약 1건의 체공이 1바퀴(360/380=0.947s) 이상 → floor(회전)>=1 → 점수 발생.
// 경계는 «파생지표(airborne 연속구간)»가 아니라 «이벤트(padLaunches 증가)»로 긋는다(신규규율).
// ?stage=N 훅 사용(main.ts:1388 확인). auto=1 은 공중 무입력이라 순수 물리 체공을 잰다.
const PW='file:///C:/Users/USER/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';
const BASE=process.env.BASE_URL||'http://localhost:5183';
const STEP=Number(process.env.STEP) || (1/60), ROT=380, NEED=360/ROT;
const STAGES=(process.env.STAGES||'1,11,19,27,35,43').split(',').map(Number);
const TMAX=Number(process.env.TMAX||26);
const {chromium}=await import(PW);
const b=await chromium.launch();
const p=await (await b.newContext({viewport:{width:390,height:844}})).newPage();
async function probe(stage,ff){
  for(let a=1;a<=3;a++){try{
    await p.goto(`${BASE}/?auto=1&stage=${stage}&ff=${ff}&freeze=1`,{waitUntil:'load',timeout:30000});
    await p.waitForFunction(()=>!!window.__debug&&typeof window.__debug.worldX==='number',null,{timeout:30000});
    return await p.evaluate(()=>{const s=window.__debug;return{worldX:s.worldX,airborne:s.airborne,
      padLaunches:s.padLaunches,stageCleared:s.stageCleared,crashed:s.crashed};});
  }catch(e){if(a===3)throw e;}}
}
console.log('회전 성공률 실측 — 성공기준: 도약 1건 체공 >= '+NEED.toFixed(3)+'s');
console.log('격자 '+STEP.toFixed(4)+'s / 대상 스테이지 '+STAGES.join(',')+' / 최대 '+TMAX+'s');
console.log('');
const all=[];
for(const st of STAGES){
  const rows=[];
  for(let t=0;t<=TMAX+1e-9;t=Number((t+STEP).toFixed(4))){
    const d=await probe(st,Number(t.toFixed(4)));
    rows.push({t:Number(t.toFixed(4)),...d});
    if(d.stageCleared||d.crashed) break;
  }
  const fires=[]; for(let i=1;i<rows.length;i++) if(rows[i].padLaunches>rows[i-1].padLaunches) fires.push(i);
  const flights=[];
  for(let k=0;k<fires.length;k++){
    const s=fires[k], limit=(k+1<fires.length)?fires[k+1]:rows.length;
    let land=-1; for(let i=s;i<limit;i++) if(!rows[i].airborne){land=i;break;}
    const endI=(land>=0)?land:limit-1;
    const dur=rows[endI].t-rows[s].t;
    flights.push({dur,rot:dur*ROT/360,ok:dur>=NEED,landed:land>=0});
  }
  const succ=flights.filter(f=>f.ok).length;
  const rate=flights.length?succ/flights.length:0;
  all.push({stage:st,flights,succ,rate,cleared:rows[rows.length-1].stageCleared,crashed:rows[rows.length-1].crashed});
  console.log('스테이지 '+String(st).padStart(2)+' | 도약 '+String(flights.length).padStart(2)+
    '회 | 성공 '+String(succ).padStart(2)+' | 성공률 '+(rate*100).toFixed(0).padStart(3)+'%'+
    ' | 회전값 ['+flights.map(f=>f.rot.toFixed(2)).join(', ')+']'+
    (rows[rows.length-1].crashed?'  ★crash':'')+(rows[rows.length-1].stageCleared?'  clear':''));
}
await b.close();
const tot=all.reduce((s,a)=>s+a.flights.length,0), suc=all.reduce((s,a)=>s+a.succ,0);
console.log('');
console.log('='.repeat(80));
console.log('전체: 도약 '+tot+'회 중 성공 '+suc+'회 → 회전 성공률 '+(tot?(suc/tot*100).toFixed(1):'-')+'%');
console.log('필요 성공률(현행 파라미터) 77% 대비 → '+(tot&&suc/tot>=0.77?'충족':'★미달'));
console.log('='.repeat(80));
console.log('실행시각='+new Date().toISOString());
