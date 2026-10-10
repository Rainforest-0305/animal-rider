// verify_stage1_live.mjs — 라이브 앱이 실제로 유도길이(4200px)에서 스테이지1을 끝내는지 확인.
const PW='file:///C:/Users/USER/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';
const {chromium}=await import(PW);
const b=await chromium.launch();
const p=await (await b.newContext({viewport:{width:390,height:844}})).newPage();
console.log(['ff(s)','worldX','stageCleared?','키목록에 stage 관련'].join('\t'));
for(const t of [3.3,3.5,3.6,3.7,3.8,3.9,4.0]){
  await p.goto(`http://localhost:5183/?auto=1&ff=${t}&freeze=1`,{waitUntil:'load',timeout:30000});
  await p.waitForFunction(()=>!!window.__debug&&typeof window.__debug.worldX==='number',null,{timeout:30000});
  const d=await p.evaluate(()=>{const s=window.__debug;const keys=Object.keys(s).filter(k=>/stage|clear|star/i.test(k));
    const o={worldX:s.worldX};for(const k of keys)o[k]=s[k];return o;});
  console.log([t,d.worldX.toFixed(0),JSON.stringify(d)].join('\t'));
}
await b.close();
console.log('실행시각='+new Date().toISOString());
