#!/usr/bin/env node
// measure_pad_flight_exact.mjs — 도약 «1회분» 비행을 정확히 분리해 잰다.
// 앞선 측정은 airborne 연속구간만 보고 두 비행을 «병합»했다(착지가 프레임 사이에 끼임).
// 이번엔 padLaunches «증가 시점»을 비행 시작으로 잡아 발사별로 쪼갠다.
const PW='file:///C:/Users/USER/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';
const BASE=process.env.BASE_URL||'http://localhost:5183';
const T0=Number(process.env.T0||1.5), T1=Number(process.env.T1||4.0), STEP=1/60;
const {chromium}=await import(PW);
const b=await chromium.launch();
const p=await (await b.newContext({viewport:{width:390,height:844}})).newPage();
const rows=[];
for(let t=T0;t<=T1+1e-9;t=Number((t+STEP).toFixed(4))){
  const tt=Number(t.toFixed(4));
  let d=null;
  for(let a=1;a<=3&&!d;a++){try{
    await p.goto(`${BASE}/?auto=1&ff=${tt}&freeze=1`,{waitUntil:'load',timeout:30000});
    await p.waitForFunction(()=>!!window.__debug&&typeof window.__debug.worldX==='number',null,{timeout:30000});
    d=await p.evaluate(()=>{const s=window.__debug;return{worldX:s.worldX,airborne:s.airborne,y:s.y,
      padLaunches:s.padLaunches,liftoffs:s.liftoffs};});
  }catch(e){if(a===3)throw e;}}
  rows.push({t:tt,...d});
}
await b.close();
const ROT=380;
console.log('t격자 1/60s, 구간 '+T0+'~'+T1+'s, 샘플 '+rows.length);
console.log(['t','worldX','air','y','pads'].join('\t'));
for(const r of rows) console.log([r.t.toFixed(3),r.worldX.toFixed(0),r.airborne?1:0,r.y.toFixed(0),r.padLaunches].join('\t'));
// ── 발사 시점(padLaunches 증가) 기준으로 비행 분리 ──
const fires=[];
for(let i=1;i<rows.length;i++) if(rows[i].padLaunches>rows[i-1].padLaunches) fires.push(i);
console.log('');
console.log('='.repeat(80));
console.log('도약 발사 '+fires.length+'회 검출');
console.log('='.repeat(80));
console.log(['#','발사t','발사worldX','착지t','착지worldX','체공(s)','수평(px)','회전(바퀴)','floor'].join('\t'));
for(let k=0;k<fires.length;k++){
  const s=fires[k];
  // 착지 = 발사 이후 airborne=false 가 처음 나오는 지점(다음 발사 이전까지)
  const limit=(k+1<fires.length)?fires[k+1]:rows.length;
  let land=-1;
  for(let i=s;i<limit;i++) if(!rows[i].airborne){land=i;break;}
  if(land<0){console.log([k+1,rows[s].t.toFixed(3),rows[s].worldX.toFixed(0),'미착지(구간밖)','','','','',''].join('\t'));continue;}
  const dur=rows[land].t-rows[s].t, dist=rows[land].worldX-rows[s].worldX, rot=dur*ROT/360;
  console.log([k+1,rows[s].t.toFixed(3),rows[s].worldX.toFixed(0),rows[land].t.toFixed(3),
    rows[land].worldX.toFixed(0),dur.toFixed(3),dist.toFixed(0),rot.toFixed(2),Math.floor(rot)].join('\t'));
}
console.log('');
console.log('※ 착지 판정은 «발사 이후 첫 airborne=false». 프레임보다 짧은 접지는 여전히 못 본다(한계 명시).');
console.log('실행시각='+new Date().toISOString());
