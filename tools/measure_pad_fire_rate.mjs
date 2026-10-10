#!/usr/bin/env node
// measure_pad_fire_rate.mjs — 「배치된 도약대 중 실제로 «발동»하는 비율」 실측.
// A축 기각의 근거인 밀도모델(floor(길이/3608))이 거친 대용치라 Easy 에서 반례가 났다.
// 대용치를 버리고 실제 padLaunches 를 센다.
const PW='file:///C:/Users/USER/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';
const BASE=process.env.BASE_URL||'http://localhost:5183';
const {chromium}=await import(PW);
const b=await chromium.launch();
const p=await (await b.newContext({viewport:{width:390,height:844}})).newPage();
async function probe(ff){
  for(let a=1;a<=3;a++){try{
    await p.goto(`${BASE}/?auto=1&ff=${ff}&freeze=1`,{waitUntil:'load',timeout:30000});
    await p.waitForFunction(()=>!!window.__debug&&typeof window.__debug.worldX==='number',null,{timeout:30000});
    return await p.evaluate(()=>{const s=window.__debug;return{worldX:s.worldX,padLaunches:s.padLaunches,
      liftoffs:s.liftoffs,stageCleared:s.stageCleared,sSegTotal:s.sSegTotal,totalScore:s.totalScore,crashed:s.crashed};});
  }catch(e){if(a===3)throw e;}}
}
console.log('스테이지1(Easy, 4200px, 배치 도약대 2개) — 시간에 따른 padLaunches 누적');
console.log(['ff(s)','worldX','pads','liftoffs','S_seg','total','clear'].join('\t'));
let maxPads=0,clearX=null;
for(const t of [1.0,1.5,1.8,2.0,2.2,2.5,3.0,3.4,3.6,3.8,4.0,4.5,5.0]){
  const d=await probe(t);
  maxPads=Math.max(maxPads,d.padLaunches);
  if(d.stageCleared&&clearX===null)clearX=d.worldX;
  console.log([t,d.worldX.toFixed(0),d.padLaunches,d.liftoffs,d.sSegTotal,d.totalScore,d.stageCleared].join('\t'));
}
await b.close();
console.log('');
console.log('★ 스테이지1에서 실제 발동한 도약대 = '+maxPads+' / 배치 2개');
console.log('  → 발동률 '+(maxPads/2*100).toFixed(0)+'%');
console.log('  밀도 대용치 floor(4200/3608)=1 이 예측한 값과 '+(maxPads===1?'일치':'★불일치 — 대용치 폐기')); 
console.log('실행시각='+new Date().toISOString());
