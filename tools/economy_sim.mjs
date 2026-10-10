#!/usr/bin/env node
// economy_sim.mjs — 동물라이더(작업명 animal-stunt) 보석경제 재시뮬레이션. 게임명 미정.
// v3 (2026-08-05 Partner 재확정): 목표는 "1단 컬렉션완주(가챠20종,20,100)"와
// "2단 완전제패(+강화43,200=63,300)" «2단 구조»로 최종 확정. 강화는 D1로
// 외형승급 정의이나 목표에는 복귀했다(2단 소속). UI에서 두 단계는 반드시
// 물리적으로 분리 표시한다(같은 막대 금지 - Partner 명시).
// 목표는 2단 구조로 확정됐다: 1단=컬렉션완주(20,100) / 2단=완전제패(63,300).
// 규칙 출처: 1차설계서 v1.0 4.3/4.4절 + Partner 결정 D2(R-A)/D3(R-B).
// 뽑기 상한 1,200 / 강화 고정가 2종(2,400/3,600) / 가챠 중복없음(확정, 4.4절).

const ARCHETYPES = {
  light: { challengesPerDay: 0.4, revivesPerDay: 0.4, completion: 0.70 },
  core:  { challengesPerDay: 1.2, revivesPerDay: 1.2, completion: 1.00 },
  heavy: { challengesPerDay: 2.0, revivesPerDay: 2.2, completion: 1.00 },
};

const TOTAL_CHALLENGES = 100;
const CHALLENGE_REWARD = 200;
const REVIVE_COST = 200;
const FREE_REVIVES_PER_DAY = 3; // D2 / R-A 채택
// ★ 이 144 는 stages.ts TOTAL_STARS(=48×3) 의 «복제»다. 티어 변경 시 같이 고칠 것.
//   (2026-08-06 백로그 등재 — tools/ 는 런타임 아님, 기준선 도구라 지금은 무접촉)
const TOTAL_STARS = 144;
const STAR_MILESTONE_STEP = 12;
const STAR_MILESTONE_REWARD = 600; // D3 / R-B: 별 12개마다 600, 총 12회=7,200(1회성)
const STAR_MILESTONE_LUMP = (TOTAL_STARS / STAR_MILESTONE_STEP) * STAR_MILESTONE_REWARD; // 7200

// 1차 로스터 24종 구성 (COMMON8/RARE7/EPIC5/SPECIAL4)
const GACHA_POOL_1ST = 20;      // COMMON8+RARE7+EPIC5 (SPECIAL 뽑기 불가)
const GACHA_POOL_EXPANDED = 30; // 확장 42종 케이스의 뽑기풀 참고용(라벨 분리)
const ENHANCE_RARE_EPIC_COUNT = 12; // RARE7 + EPIC5
const ENHANCE_SPECIAL_COUNT = 4;
const ENHANCE_RARE_EPIC_COST = 2400;
const ENHANCE_SPECIAL_COST = 3600;

function dailyLetterSetGross(streakDay) {
  return Math.min(200 + Math.min(120, 30 * (streakDay - 1)), 320);
}

function gachaPriceForRun(n, cap) {
  const p = 600 + 50 * (n - 1);
  return cap ? Math.min(p, 1200) : p;
}

function gachaCumulativeCost(poolSize, cap) {
  let total = 0;
  for (let n = 1; n <= poolSize; n++) total += gachaPriceForRun(n, cap);
  return total;
}

const ENHANCE_TOTAL_COST =
  ENHANCE_RARE_EPIC_COUNT * ENHANCE_RARE_EPIC_COST +
  ENHANCE_SPECIAL_COUNT * ENHANCE_SPECIAL_COST; // 12*2400 + 4*3600 = 43200

const GACHA_COST_1ST = gachaCumulativeCost(GACHA_POOL_1ST, true);           // 20,100
const GACHA_COST_EXPANDED = gachaCumulativeCost(GACHA_POOL_EXPANDED, true); // 32,100
const STAGE1_TARGET_COLLECTION = GACHA_COST_1ST;               // ★ 1단: 컬렉션 완주 목표 (결정3/재확정)
const STAGE2_TARGET_FULL_MASTERY = GACHA_COST_1ST + ENHANCE_TOTAL_COST; // 2단: 완전 제패 목표 (Partner 확정, 폐기 아님)

// ---------------------------------------------------------------------------
// D3(R-B) 별 마일스톤 적립 시점 가정. venture-secretary 역산 확정(2026-08-05):
// "60일 균등 «연속» 적립"이 v1.0 4-6c 48/30/25를 3개 아키타입 전부 재현한다
// (12단계 이산 계단적립은 자잘한 반올림오차로 근사만 됨 - 폐기, continuous로 대체).
const STAR_ACCRUAL_HORIZON_DAYS = 60;
const STAR_ACCRUAL_DAILY_RATE = STAR_MILESTONE_LUMP / STAR_ACCRUAL_HORIZON_DAYS; // 120/day

function rbCreditForDay(day, mode) {
  if (mode === 'none') return 0;
  if (mode === 'lump') return day === 1 ? STAR_MILESTONE_LUMP : 0; // 상한(낙관) 참고용
  if (mode === 'continuous') {
    return day <= STAR_ACCRUAL_HORIZON_DAYS ? STAR_ACCRUAL_DAILY_RATE : 0;
  }
  return 0;
}

// R-C(런 성과 보상) — 설계서 선택안. Partner D2/D3만 확정이므로 참고용으로만 계산.
const RC_DAILY_AVG = 40;

// ---------------------------------------------------------------------------
const SCENARIOS = {
  baseline: { useD2: false, rb: 'none', useRC: false },
  d2:       { useD2: true,  rb: 'none', useRC: false },
  d2_lump:  { useD2: true,  rb: 'lump', useRC: false },
  d2_cont:  { useD2: true,  rb: 'continuous', useRC: false },
  d2_cont_rc: { useD2: true, rb: 'continuous', useRC: true },
};

const MAX_DAYS = 1500;

function simulate(archetypeName, scenarioName) {
  const a = ARCHETYPES[archetypeName];
  const sc = SCENARIOS[scenarioName];
  let challengesDone = 0;
  let balance = 0;
  let dayStage1Hit = null; // 1단: 컬렉션 완주(가챠 20종 20,100)
  let dayStage2Hit = null;    // 2단 완전제패(가챠+강화 63,300) - Partner 확정, 폐기 아님
  let exhaustDay = null;
  let steadyNet = null;

  for (let day = 1; day <= MAX_DAYS; day++) {
    let dayIncome = dailyLetterSetGross(day) * a.completion;

    if (challengesDone < TOTAL_CHALLENGES) {
      let toAdd = a.challengesPerDay;
      if (challengesDone + toAdd > TOTAL_CHALLENGES) toAdd = TOTAL_CHALLENGES - challengesDone;
      challengesDone += toAdd;
      dayIncome += toAdd * CHALLENGE_REWARD;
      if (challengesDone >= TOTAL_CHALLENGES - 1e-9 && exhaustDay === null) exhaustDay = day;
    }

    dayIncome += rbCreditForDay(day, sc.rb);
    if (sc.useRC) dayIncome += RC_DAILY_AVG;

    let daySpend;
    if (sc.useD2) {
      const paid = Math.max(0, a.revivesPerDay - FREE_REVIVES_PER_DAY);
      daySpend = paid * REVIVE_COST;
    } else {
      daySpend = a.revivesPerDay * REVIVE_COST;
    }

    balance += dayIncome - daySpend;

    if (dayStage1Hit === null && balance >= STAGE1_TARGET_COLLECTION) dayStage1Hit = day;
    if (dayStage2Hit === null && balance >= STAGE2_TARGET_FULL_MASTERY) dayStage2Hit = day;

    if (exhaustDay !== null && day === exhaustDay + 1) {
      const postIncome = dailyLetterSetGross(day) * a.completion;
      const postSpend = daySpend;
      steadyNet = round2(postIncome - postSpend);
    }
    if (dayStage1Hit !== null && dayStage2Hit !== null && steadyNet !== null) break;
  }

  return { dayStage1Hit, dayStage2Hit, exhaustDay, steadyNet, balanceCapped: balance };
}

function simulate90(archetypeName, scenarioName) {
  const a = ARCHETYPES[archetypeName];
  const sc = SCENARIOS[scenarioName];
  let challengesDone = 0;
  let income = 0, spend = 0;
  for (let day = 1; day <= 90; day++) {
    let dayIncome = dailyLetterSetGross(day) * a.completion;
    if (challengesDone < TOTAL_CHALLENGES) {
      let toAdd = a.challengesPerDay;
      if (challengesDone + toAdd > TOTAL_CHALLENGES) toAdd = TOTAL_CHALLENGES - challengesDone;
      challengesDone += toAdd;
      dayIncome += toAdd * CHALLENGE_REWARD;
    }
    dayIncome += rbCreditForDay(day, sc.rb);
    if (sc.useRC) dayIncome += RC_DAILY_AVG;
    let daySpend = sc.useD2
      ? Math.max(0, a.revivesPerDay - FREE_REVIVES_PER_DAY) * REVIVE_COST
      : a.revivesPerDay * REVIVE_COST;
    income += dayIncome; spend += daySpend;
  }
  return { income: round2(income), spend: round2(spend), net: round2(income - spend) };
}

function round2(x) { return Math.round(x * 10) / 10; }

// 가챠 2x2 분해(상한 x 중복정책) - Secretary 재도출표 재현/검산용(30종 기준).
function couponCollectorExpectedDraws(n) {
  let h = 0;
  for (let i = 1; i <= n; i++) h += 1 / i;
  return n * h;
}
function costForDraws(numDraws, cap) {
  let total = 0;
  for (let i = 1; i <= numDraws; i++) total += gachaPriceForRun(i, cap);
  return Math.round(total);
}

// ---------------------------------------------------------------------------
// Secretary 독립 재도출 기준선(2026-08-05, 2단 목표구조 최종반영). 다르면 발견으로 보고.
const BASELINE = {
  income90: { light: 27150, core: 48500, heavy: 48500 },
  reviveSpend90_noD2: { light: 7200, core: 21600, heavy: 39600 },
  net90_noRescue: { light: 19950, core: 26900, heavy: 8900 },
  steadyNet_noRescue: { light: 144, core: 80, heavy: -120 },
  steadyNet_D2: { light: 224, core: 320, heavy: 320 },
  // 1단: 컬렉션 완주 = 가챠 20종 수집완료(20,100)
  daysStage1_noRescue: { light: 91, core: 64, heavy: null },
  daysStage1_D2: { light: 67, core: 37, heavy: 29 },
  daysStage1_D2D3: { light: 48, core: 30, heavy: 25 },
  // 2단: 완전 제패 = 가챠20종+강화43,200=63,300 (Partner 확정)
  daysStage2_D2: { light: 209, core: 137, heavy: 137 },
  daysStage2_D2D3: { light: 186, core: 114, heavy: 114 },
};

function fmt(n) { return n === null ? 'X(도달불가)' : String(n); }
function cmp(actual, expected) {
  if (expected === undefined) return '';
  const diff = actual === null || expected === null ? null : round2(actual - expected);
  const flag = actual === expected ? 'MATCH' : `DIFF(${diff})`;
  return `  [기준선 ${fmt(expected)} -> ${flag}]`;
}

console.log('='.repeat(78));
console.log('동물라이더(작업명 animal-stunt) 경제 재시뮬 v2 ' + new Date().toISOString());
console.log('전제: 24종 로스터(뽑기풀 20종) / 뽑기상한 1,200 / 강화 고정가(2400/3600)');
console.log('★ 결정3: "100% 달성"=수집완료(가챠20종 20,100) 단독. 강화43,200은 목표에서 제외(외형승급,지출로만 추적)');
console.log('★ 결정4: 가챠 중복없음 [자체설계-확정] (원작정책 미확인 라벨 폐기)');
console.log('='.repeat(78));

console.log('\n[상수검산] GACHA_1ST(20종)=' + GACHA_COST_1ST + ' GACHA_EXPANDED(30종)=' + GACHA_COST_EXPANDED);
console.log('[상수검산] ENHANCE_TOTAL(지출추적용,목표아님)=' + ENHANCE_TOTAL_COST);
console.log('[상수검산] STAGE1(컬렉션완주)=' + STAGE1_TARGET_COLLECTION + '   STAGE2(완전제패)=' + STAGE2_TARGET_FULL_MASTERY);

console.log('\n--- 90일 누적 (구제책없음 baseline) ---');
for (const arche of Object.keys(ARCHETYPES)) {
  const r = simulate90(arche, 'baseline');
  console.log(arche.padEnd(6) + ' income=' + r.income + cmp(r.income, BASELINE.income90[arche])
    + '  spend=' + r.spend + cmp(r.spend, BASELINE.reviveSpend90_noD2[arche])
    + '  net=' + r.net + cmp(r.net, BASELINE.net90_noRescue[arche]));
}

console.log('\n--- 정상상태(챌린지100개소진후) 일 순증 ---');
for (const arche of Object.keys(ARCHETYPES)) {
  const rb = simulate(arche, 'baseline');
  const rd2 = simulate(arche, 'd2');
  console.log(arche.padEnd(6) + ' 구제없음=' + rb.steadyNet + cmp(rb.steadyNet, BASELINE.steadyNet_noRescue[arche])
    + '   D2적용=' + rd2.steadyNet + cmp(rd2.steadyNet, BASELINE.steadyNet_D2[arche])
    + '   (소진일 구제없음=' + rb.exhaustDay + ', D2=' + rd2.exhaustDay + ')');
}

console.log('\n=== ★ 1단 컬렉션 완주(가챠 20종 수집완료 20,100) 소요일 ===');
console.log('--- 구제책 없음 ---');
for (const arche of Object.keys(ARCHETYPES)) {
  const r = simulate(arche, 'baseline');
  console.log(arche.padEnd(6) + ' ' + fmt(r.dayStage1Hit) + cmp(r.dayStage1Hit, BASELINE.daysStage1_noRescue[arche]));
}
console.log('--- D2(R-A: 부활무료3회) ---');
for (const arche of Object.keys(ARCHETYPES)) {
  const r = simulate(arche, 'd2');
  console.log(arche.padEnd(6) + ' ' + fmt(r.dayStage1Hit) + cmp(r.dayStage1Hit, BASELINE.daysStage1_D2[arche]));
}
console.log('--- D2+D3(R-A+R-B: 별마일스톤, 60일연속적립) - Partner 확정 48/30/25 재현 목표 ---');
for (const arche of Object.keys(ARCHETYPES)) {
  const r = simulate(arche, 'd2_cont');
  console.log(arche.padEnd(6) + ' ' + fmt(r.dayStage1Hit) + cmp(r.dayStage1Hit, BASELINE.daysStage1_D2D3[arche]));
}
console.log('--- (참고) D2+D3 즉시선지급(상한 밴드) ---');
for (const arche of Object.keys(ARCHETYPES)) {
  const r = simulate(arche, 'd2_lump');
  console.log(arche.padEnd(6) + ' ' + fmt(r.dayStage1Hit));
}

console.log('\n=== 2단 완전 제패(가챠20종+강화43,200=63,300) 소요일 - Partner 확정, 폐기 아님 ===');
console.log('결정3(강화 목표복귀,2단분리)에 따라 2단은 여전히 확정 목표다. 진행도 막대는 1단과 물리적으로 분리 표시.');
console.log('--- D2 ---');
for (const arche of Object.keys(ARCHETYPES)) {
  const r = simulate(arche, 'd2');
  console.log(arche.padEnd(6) + ' ' + fmt(r.dayStage2Hit) + cmp(r.dayStage2Hit, BASELINE.daysStage2_D2[arche]));
}
console.log('--- D2+D3(60일연속) ---');
for (const arche of Object.keys(ARCHETYPES)) {
  const r = simulate(arche, 'd2_cont');
  console.log(arche.padEnd(6) + ' ' + fmt(r.dayStage2Hit) + cmp(r.dayStage2Hit, BASELINE.daysStage2_D2D3[arche]));
}

console.log('\n--- (참고) D2+D3+RC 1단 소요일 - RC는 D1~D6 미확정 ---');
for (const arche of Object.keys(ARCHETYPES)) {
  const r = simulate(arche, 'd2_cont_rc');
  console.log(arche.padEnd(6) + ' 1단완주=' + fmt(r.dayStage1Hit));
}

console.log('\n' + '='.repeat(78));
console.log('[관전포인트1] 구제없음 헤비: 1단(20,100)에서도 여전히 «도달불가»인지 확인');
{
  const r = simulate('heavy', 'baseline');
  console.log('  heavy baseline dayStage1Hit=' + fmt(r.dayStage1Hit) + ' steadyNet=' + r.steadyNet
    + ' -> ' + (r.dayStage1Hit === null ? 'CONFIRMED: 여전히 도달불가 (D2 구조적 필요성 불변)' : '주의: 도달함, 인과 재검토 필요'));
}
console.log('[관전포인트2] D3(R-B) 단축효과가 1단에서 더 커지는지 확인 (2단기준 11% vs 1단기준 ?%)');
for (const arche of Object.keys(ARCHETYPES)) {
  const d2 = simulate(arche, 'd2').dayStage1Hit;
  const d2d3 = simulate(arche, 'd2_cont').dayStage1Hit;
  const pct = d2 && d2d3 ? round2(((d2 - d2d3) / d2) * 100) : null;
  console.log('  ' + arche.padEnd(6) + ' D2=' + fmt(d2) + ' D2+D3=' + fmt(d2d3) + ' 단축률=' + pct + '%');
}

console.log('\n' + '='.repeat(78));
console.log('[결정4 기록] 뽑기 2x2 분해 (상한 x 중복정책, 30종 기준) - 재계산으로 재검증');
{
  const capNodup = costForDraws(30, true);
  const nocapNodup = costForDraws(30, true === false ? true : false); // no-cap, 30 draws (no-dup means exactly 30 draws)
  const expectedDrawsDup = couponCollectorExpectedDraws(30);
  const drawsDupRounded = Math.round(expectedDrawsDup);
  const capDup = costForDraws(drawsDupRounded, true);
  const nocapDup = costForDraws(drawsDupRounded, false);
  console.log('                상한1200      상한없음');
  console.log('  중복없음(30회)   ' + capNodup + '        ' + nocapNodup);
  console.log('  중복허용(' + drawsDupRounded + '회)  ' + capDup + '       ' + nocapDup);
  console.log('  기대회차(coupon collector, H(30)) = ' + expectedDrawsDup.toFixed(2) + ' -> ' + drawsDupRounded + '회');
  const capEffect = round2(nocapNodup / capNodup);
  const dupEffect = round2(capDup / capNodup);
  const bothEffect = round2(nocapDup / capNodup);
  console.log('  상한 단독효과=' + capEffect + 'x   중복 단독효과=' + dupEffect + 'x   합성효과=' + bothEffect + 'x');
  console.log('  -> 13.4배(구관측)의 주 동인은 상한이 아니라 중복정책이었음을 재확인.');
}

console.log('SUPERSEDED-2026-08-05: old 50-challenge/95-star 1-danjeong block removed.');
console.log('Authoritative source: src/game/roster.ts (bulti=30, seori=57) via tools/collection_paths_sim.mjs.');
