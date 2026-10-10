#!/usr/bin/env node
// measure_natural_liftoff.mjs — «자연 이함»의 체공 특성 실측.
//
// 왜 필요한가: 소프트락 해소 D축(자연이함에도 회전 인정)의 성패는 「자연 이함 1회의
// 체공시간」이 결정한다. 1바퀴(=360/380=0.947s)에 못 미치면 «회전 인정»을 해도
// 점수가 안 붙는다(score.ts 는 floor(|각|/360) 이라 미완회전 0점).
// 그 숫자가 지금 없다 → 추정하지 말고 잰다.
//
// 방법: ?auto=1&ff=t&freeze=1 을 촘촘한 t 격자로 훑어 airborne / liftoffs / padLaunches 를
//   샘플링한다. auto 는 «공중 무입력»이라 회전이 개입하지 않는 순수 지형 반응이다.
//   - 체공 구간 = airborne=true 가 연속인 t 구간
//   - 도약대 발사 구간은 padLaunches 증가로 식별해 «분리»한다(자연이함만 남긴다)
//
// 사용: node tools/measure_natural_liftoff.mjs > tools/natural_liftoff_output.log 2>&1

const PW = 'file:///C:/Users/USER/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';
const BASE = process.env.BASE_URL || 'http://localhost:5183';
const T_MAX = Number(process.env.T_MAX || 6);
const T_STEP = Number(process.env.T_STEP || 1/60); // «물리 프레임» 격자. 0.05s 로는 짧은 자연이함을 통째로 놓친다(실측 확인)

const { chromium } = await import(PW);
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();

async function sample(tt) {
  for (let a = 1; a <= 3; a++) {
    try {
      await page.goto(`${BASE}/?auto=1&ff=${tt}&freeze=1`, { waitUntil: 'load', timeout: 30000 });
      await page.waitForFunction(() => !!window.__debug && typeof window.__debug.worldX === 'number', null, { timeout: 30000 });
      return await page.evaluate(() => {
        const s = window.__debug;
        return {
          worldX: s.worldX, airborne: s.airborne, y: s.y,
          liftoffs: s.liftoffs, padLaunches: s.padLaunches, crashed: s.crashed,
        };
      });
    } catch (e) { if (a === 3) throw e; }
  }
}

const rows = [];
for (let t = 0; t <= T_MAX + 1e-9; t = Number((t + T_STEP).toFixed(4))) {
  const tt = Number(t.toFixed(4));
  const d = await sample(tt);
  rows.push({ t: tt, ...d });
  if (d.crashed) break;
}
await browser.close();

// ── 체공 구간 추출 ──────────────────────────────────────────────────────────
const flights = [];
let cur = null;
for (let i = 0; i < rows.length; i++) {
  const r = rows[i];
  if (r.airborne && !cur) {
    cur = { startT: r.t, startX: r.worldX, padAtStart: r.padLaunches, liftAtStart: r.liftoffs, maxY: r.y };
  } else if (r.airborne && cur) {
    cur.maxY = Math.max(cur.maxY, r.y);
  } else if (!r.airborne && cur) {
    cur.endT = r.t; cur.endX = r.worldX;
    cur.padDelta = r.padLaunches - cur.padAtStart;
    cur.dur = cur.endT - cur.startT;
    cur.dist = cur.endX - cur.startX;
    flights.push(cur); cur = null;
  }
}
if (cur) { cur.endT = rows[rows.length - 1].t; cur.endX = rows[rows.length - 1].worldX; cur.padDelta = rows[rows.length - 1].padLaunches - cur.padAtStart; cur.dur = cur.endT - cur.startT; cur.dist = cur.endX - cur.startX; flights.push(cur); }

const ROT_DEG_PER_S = 380; // physics.ts AIR_ROTATION_DEG_PER_SEC
const need1 = 360 / ROT_DEG_PER_S;

console.log('='.repeat(90));
console.log('자연 이함 체공 실측 (?auto=1, 공중 무입력 = 순수 지형 반응)');
console.log('='.repeat(90));
console.log('샘플 격자 = ' + T_STEP + 's, 구간 = 0~' + T_MAX + 's, 샘플수 = ' + rows.length);
console.log('1바퀴 필요 체공 = 360/' + ROT_DEG_PER_S + ' = ' + need1.toFixed(3) + 's');
console.log('');
console.log('체공 구간 목록 (padDelta>0 = 도약대 발사, 0 = 자연 이함):');
console.log(['#', '시작t', '종료t', '체공(s)', '수평이동(px)', '최고높이', '종류', 'padDelta', '가능회전'].join('\t'));
let i2 = 0;
for (const f of flights) {
  i2++;
  const kind = f.padDelta > 0 ? '도약대' : '자연';
  const rot = f.dur * ROT_DEG_PER_S / 360;
  // ★ padDelta 를 «값»으로 찍는다. 2 이상이면 도약 여러 번이 한 비행으로 «병합»된 것이라
  //   1회분 체공으로 읽으면 회전수를 2배로 오판한다(착지가 프레임 사이에 끼면 검출 안 됨).
  console.log([i2, f.startT.toFixed(2), f.endT.toFixed(2), f.dur.toFixed(2), f.dist.toFixed(0),
    f.maxY.toFixed(0), kind, f.padDelta, rot.toFixed(2)].join('\t'));
  if (f.padDelta >= 2) {
    console.log('   ★ 병합 감지: 이 구간에 도약대 발사가 ' + f.padDelta + '회 들어있다.');
    console.log('     → 1회 «평균» 체공 ' + (f.dur / f.padDelta).toFixed(3) + 's / 회전 ' +
      (f.dur / f.padDelta * ROT_DEG_PER_S / 360).toFixed(2) + '바퀴 / 수평 ' +
      (f.dist / f.padDelta).toFixed(0) + 'px');
    console.log('     ※ 균등분할 «가정»이다. 개별 비행은 속도·경사가 달라 편차가 있다.');
    console.log('     ※ 중요한 결론은 이것 — 합계 ' + f.dur.toFixed(2) + 's 가 ' + f.padDelta +
      '회분이므로 «단일 도약이 2바퀴(1.895s)에 닿지 않는다»는 것이 확정된다.');
  }
}

const nat = flights.filter((f) => f.padDelta === 0);
const pad = flights.filter((f) => f.padDelta > 0);
const airTotal = flights.reduce((s, f) => s + f.dur, 0);
const span = rows[rows.length - 1].t;

console.log('');
console.log('='.repeat(90));
console.log('요약');
console.log('='.repeat(90));
console.log('총 체공구간 ' + flights.length + '개 (자연 ' + nat.length + ' / 도약대 ' + pad.length + ')');
// ★ 검출 완전성 교차확인: 앱이 세는 liftoffs/padLaunches 카운터와 내 구간검출 수를 대조한다.
//   격자가 성기면 짧은 비행을 통째로 놓치므로 이 대조 없이는 «측정했다»고 할 수 없다.
const last = rows[rows.length - 1];
console.log('교차확인 — 앱 카운터: liftoffs=' + last.liftoffs + ' padLaunches=' + last.padLaunches +
  ' / 내 검출: 자연=' + nat.length + ' 도약대=' + pad.length);
const missNat = last.liftoffs - nat.length;
console.log('  자연이함 미검출 추정 = ' + missNat + '개 → ' +
  (missNat > 0 ? '★격자보다 짧은 비행이 존재. 아래 통계는 «검출된 것 중» 값이라 상한으로만 읽어라'
               : '전수 검출됨(통계 신뢰 가능)'));
console.log('전체 체공비율 = ' + (airTotal / span * 100).toFixed(1) + '%  (체공 ' + airTotal.toFixed(2) + 's / 전체 ' + span + 's)');
const stat = (arr, f) => arr.length ? { min: Math.min(...arr.map(f)), max: Math.max(...arr.map(f)), avg: arr.reduce((s, x) => s + f(x), 0) / arr.length } : null;
const ns = stat(nat, (f) => f.dur);
const ps = stat(pad, (f) => f.dur);
if (ns) console.log('자연이함 체공(s):  최소 ' + ns.min.toFixed(2) + ' / 평균 ' + ns.avg.toFixed(2) + ' / 최대 ' + ns.max.toFixed(2));
if (ps) console.log('도약대 체공(s):    최소 ' + ps.min.toFixed(2) + ' / 평균 ' + ps.avg.toFixed(2) + ' / 최대 ' + ps.max.toFixed(2));
console.log('');
if (ns) {
  const can = nat.filter((f) => f.dur >= need1).length;
  console.log('★ 자연이함 중 «1바퀴 완주 가능»(체공 ≥ ' + need1.toFixed(3) + 's) = ' + can + ' / ' + nat.length + '개');
  console.log('  최대 자연이함 체공 ' + ns.max.toFixed(2) + 's → 최대 회전 ' + (ns.max * ROT_DEG_PER_S / 360).toFixed(2) + '바퀴');
  console.log('  ⇒ D축(자연이함 회전인정) 현행 물리 그대로는 ' +
    (can > 0 ? '«일부 유효»' : '«무효» — 체공이 1바퀴에 못 미쳐 floor()=0점'));
  if (can === 0) {
    const mult = need1 / ns.max;
    console.log('  D축을 살리려면 체공을 ' + mult.toFixed(2) + '배로 늘리거나(지형/물리 변경),');
    console.log('  AIR_ROTATION_DEG_PER_SEC 를 ' + (ROT_DEG_PER_S * mult).toFixed(0) + ' 이상으로 올려야 한다(=②감 변경).');
    console.log('  또는 score.ts 의 floor() 를 «부분회전 인정»으로 바꿔야 한다(점수규칙 변경).');
  }
}
console.log('');
console.log('실행시각=' + new Date().toISOString());
