#!/usr/bin/env node
// onboarding_gate_sim.mjs — 「무회전 완주로는 첫 가챠(12별)에 도달 못한다」 전제 검증 +
// 완화안 A/B/C 의 «시뮬 영향» 비교. President 결정용 숫자만 낸다. 코드 집행 없음.
//
// 절대 안 하는 것: 정상 수급률(별→보석) 변경, 확정경제(STAR_MILESTONE_STEP=12,
//   REWARD=600, 가챠가격 600+50(n-1) cap1200, 1단 20,100) 수정. 전부 «읽기»만 한다.
//
// 사용: node tools/onboarding_gate_sim.mjs > tools/onboarding_gate_sim_output.log 2>&1

import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const PW = 'file:///C:/Users/USER/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';
const BASE = process.env.BASE_URL || 'http://localhost:5183';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, '..', 'src', 'game');

async function bundleImport(file, tag) {
  const out = path.join(__dirname, `_ogs_${tag}_tmp.mjs`);
  await build({ entryPoints: [path.join(SRC, file)], bundle: true, format: 'esm', platform: 'neutral', outfile: out });
  return import('file://' + out + '?t=' + Date.now());
}
const S = await bundleImport('stages.ts', 'stages');
const L = await bundleImport('stageLength.ts', 'len');

const line = (c = '=') => console.log(c.repeat(92));

// ── 확정경제 상수(읽기 전용 인용, 여기서 바꾸지 않는다) ─────────────────────
const STAR_MILESTONE_STEP = 12;     // main.ts / economy_sim.mjs 동일
const STAR_MILESTONE_REWARD = 600;  // 젬
const gachaPrice = (n) => Math.min(600 + 50 * (n - 1), 1200); // cap 1200
const GACHA_POOL_1ST = 20;
let cum = 0; for (let n = 1; n <= GACHA_POOL_1ST; n++) cum += gachaPrice(n);
const GACHA_COST_1ST = cum; // 20,100

// 실측 상한: 1회 도약당 회전 (stages.ts 주석 / stages_verify.mjs 와 동일 근거)
const ROT_PER_LAUNCH_MEASURED = 1.09;

line();
console.log('온보딩 게이트 시뮬 — 「무회전 완주로 첫 가챠에 닿는가」');
line();
console.log('확정경제 인용(불변): STAR_MILESTONE_STEP=' + STAR_MILESTONE_STEP +
  ' / REWARD=' + STAR_MILESTONE_REWARD + '젬 / 1단 누적 가챠비용=' + GACHA_COST_1ST.toLocaleString('en-US') + '젬');
console.log('첫 가챠 가격 = ' + gachaPrice(1) + '젬  (즉 첫 마일스톤 600젬 = 정확히 1뽑기)');

// ── [1] 무회전 완주 실측 (auto=1 은 «공중 무입력» = 회전 0 정책) ────────────
line();
console.log('[1] 무회전 완주 실측 — 라이브 앱 (?auto=1 = 지면가속/공중무입력)');
line();
const { chromium } = await import(PW);
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
async function probe(ff) {
  await page.goto(`${BASE}/?auto=1&ff=${ff}&freeze=1`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction(() => !!window.__debug && typeof window.__debug.worldX === 'number', null, { timeout: 30000 });
  return page.evaluate(() => {
    const s = window.__debug;
    return {
      worldX: s.worldX, totalScore: s.totalScore, sSegTotal: s.sSegTotal,
      jumpsScorePoints: s.jumpsScorePoints, sRotCountTotal: s.sRotCountTotal,
      stageCleared: s.stageCleared, stageStars: s.stageStars, profileStars: s.profileStars,
      liftoffs: s.liftoffs, padLaunches: s.padLaunches, crashed: s.crashed,
    };
  });
}
console.log(['ff(s)', 'worldX', 'S_seg', 'S_rot', 'total', 'rot수', '이함', '도약', 'clear', '별'].join('\t'));
let cleared = null;
for (const ff of [3.0, 3.5, 3.8, 4.0, 4.5]) {
  const d = await probe(ff);
  console.log([ff, d.worldX.toFixed(0), d.sSegTotal, d.jumpsScorePoints, d.totalScore,
    d.sRotCountTotal, d.liftoffs, d.padLaunches, d.stageCleared, d.stageStars].join('\t'));
  if (d.stageCleared && !cleared) cleared = d;
}
await browser.close();

console.log('');
if (cleared) {
  console.log('★ 무회전 완주 결과(스테이지1): 총점=' + cleared.totalScore +
    ' (구간 ' + cleared.sSegTotal + ' + 회전 ' + cleared.jumpsScorePoints + ')' +
    ' / 목표점수=' + S.TIERS[0].targetScore + ' / 판정 별=' + cleared.stageStars);
  console.log('  → 무회전으로는 ★' + cleared.stageStars + '. 전제 ' +
    (cleared.stageStars === 1 ? '«확인»(★1뿐)' : '«반증»'));
} else {
  console.log('★ 측정 범위에서 클리어 미발생 — 수동 확인 필요');
}

// ── [2] 무회전 상한과 게이트 대조 ───────────────────────────────────────────
line();
console.log('[2] 무회전 시 티어별 상한 / 게이트 도달 가능성 [계산]');
line();
console.log(['티어', '스테이지', 'targetScore', '완주구간점수', '★2가능?', '누적별(무회전)'].join(' | '));
let cumStars = 0;
const cumByTier = {};
for (const t of S.TIERS) {
  const px = L.deriveStageLengthPx(t.targetScore);
  const segPts = L.segmentPointsOnFullRun(px);
  const star2 = segPts >= t.targetScore;
  cumStars += t.stageCount * 1; // 무회전 = 전부 ★1
  cumByTier[t.tier] = cumStars;
  console.log([t.tier.padEnd(11), String(t.stageCount).padStart(2), String(t.targetScore).padStart(3),
    String(segPts).padStart(3), (star2 ? 'YES' : 'NO').padStart(4), String(cumStars).padStart(3)].join(' | '));
}
console.log('');
console.log('첫 마일스톤(' + STAR_MILESTONE_STEP + '별) 도달 여부:');
console.log('  Easy 10스테이지 전부 ★1 = ' + cumByTier['Easy'] + '별  →  ' +
  (cumByTier['Easy'] >= STAR_MILESTONE_STEP ? '도달' : '★미달 (부족 ' + (STAR_MILESTONE_STEP - cumByTier['Easy']) + '별)'));
console.log('');
console.log('티어 해금 게이트 대조 — «여기가 진짜 벽이다»:');
for (const g of S.TIER_GATES) {
  const reach = cumByTier['Easy'] >= g.requiredStars;
  console.log('  ' + g.tier.padEnd(11) + ' 필요 ' + String(g.requiredStars).padStart(3) + '별' +
    ' / 무회전 Easy 상한 ' + cumByTier['Easy'] + '별 → ' + (reach ? 'OK' : '★차단'));
}
console.log('');
console.log('  ⇒ 무회전 플레이어는 Easy 10개를 다 깨도 ' + cumByTier['Easy'] + '별에서 «영구 정지»한다.');
console.log('    Moderate1 게이트가 ' + S.TIER_GATES[0].requiredStars + '별이라 다음 티어로 못 넘어가고,');
console.log('    더 딸 별이 없으므로 첫 가챠(' + STAR_MILESTONE_STEP + '별)에도 영원히 못 닿는다 = 소프트락.');

// ── [3] ★2 난이도 정량화 ────────────────────────────────────────────────────
line();
console.log('[3] ★2 달성 난이도 [계산] — 도약대 수 대비 필요 회전점수');
line();
console.log(['티어', '부족점수', '도약대', '최대회전(1.09/도약)', '완전착지시 최대점수', '여유'].join(' | '));
for (const t of S.TIERS) {
  const px = L.deriveStageLengthPx(t.targetScore);
  const need = t.targetScore - L.segmentPointsOnFullRun(px);
  const maxRot = Math.floor(ROT_PER_LAUNCH_MEASURED) * t.launchPadCount; // 도약당 floor(1.09)=1바퀴
  const maxPts = maxRot * 2; // 완전착지 x2
  console.log([t.tier.padEnd(11), String(need).padStart(3), String(t.launchPadCount).padStart(3),
    String(maxRot).padStart(3), String(maxPts).padStart(3),
    (maxPts - need >= 0 ? '+' : '') + (maxPts - need)].join(' | '));
}
console.log('');
console.log('  Easy: 부족 4점 / 최대 4점 → «여유 0». 두 도약 모두 1바퀴 완주 + 둘 다 완전착지라야 겨우 ★2.');
console.log('  한 번이라도 미완회전(0점)이거나 normal 착지(x1)면 즉시 실패 = 초심자 경계값.');

// ── [4] 완화안 A/B/C 시뮬 영향 ──────────────────────────────────────────────
line();
console.log('[4] 완화안 시뮬 영향 비교 (정상 수급률 무변경 전제)');
line();
console.log('A. 온보딩 그랜트 — 최초 1회 한정 보석 지급');
console.log('   과지급 금지 = 첫 뽑기 «딱 한 번»에 정확히 닿는 양 → ' + gachaPrice(1) + '젬 (첫 가챠가 정확히 600)');
console.log('   1단 총비용 대비 = ' + gachaPrice(1) + ' / ' + GACHA_COST_1ST.toLocaleString('en-US') +
  ' = ' + (gachaPrice(1) / GACHA_COST_1ST * 100).toFixed(2) + '%');
console.log('   ★ 부작용: 젬은 «부활(200/회)»에도 쓰인다 → 600젬 = 부활 3회로 새어나갈 수 있다(용도 강제 불가).');
console.log('     즉 「첫 뽑기 1회」 의도가 보장되지 않는다. 과지급은 아니나 «오용도»가 있다.');
console.log('');
console.log('B. 가챠 1회 무료 티켓');
console.log('   젬 수지 변화 = 0젬 (보석 경제를 아예 통과하지 않는다)');
console.log('   1단 총비용 대비 영향 = 첫 뽑기 1회분 ' + gachaPrice(1) + '젬 만큼 «지출 면제»');
console.log('   ★ 용도가 가챠로 «강제»된다 → 부활 유출 없음. 의도한 곳에 정확히 1회만 작동.');
console.log('');
console.log('C. (참고축, a22181 제안) Easy launchPadCount 상향 — stages.ts 소관');
console.log('   젬 수지 변화 = 0젬. 경제 총액 무접촉.');
for (const add of [1, 2, 3]) {
  const t = S.TIERS[0];
  const px = L.deriveStageLengthPx(t.targetScore);
  const need = t.targetScore - L.segmentPointsOnFullRun(px);
  const pads = t.launchPadCount + add;
  const maxPts = Math.floor(ROT_PER_LAUNCH_MEASURED) * pads * 2;
  const minPerfect = Math.ceil(need / 2); // 완전착지(x2) 기준 최소 성공 도약 수
  console.log('   도약대 ' + t.launchPadCount + '→' + pads + ': 최대 ' + maxPts + '점(부족 ' + need +
    ') 여유 +' + (maxPts - need) + ' / ★2에 필요한 «성공 도약» 최소 ' + minPerfect + '회 = 실패 허용 ' + (pads - minPerfect) + '회');
}
console.log('   ★ 별 총량(144)·마일스톤·가챠가격 전부 불변. 난이도 곡선만 완화.');

// ── [5] 제안 ────────────────────────────────────────────────────────────────
line();
console.log('[5] 제안 (결정은 President)');
line();
console.log('시뮬 영향이 «작은 쪽» = B (가챠 1회 무료 티켓).');
console.log('  근거1: 젬 수지 변화 0 — 확정경제(수급률·마일스톤·가챠가격) 어느 것도 안 지나간다.');
console.log('  근거2: A는 같은 600젬이라도 부활(200×3)로 샐 수 있어 «1회 뽑기» 의도가 보장 안 된다.');
console.log('  근거3: A/B 모두 1단 완주일수(라이트75/코어30/헤비30)에는 «첫 1뽑기» 분량만 영향 →');
console.log('         아래 [6] 실측으로 확인.');
console.log('');
console.log('★ 단, B도 C도 «소프트락 자체»는 못 푼다 — 소프트락의 원인은 젬이 아니라 «별»이다.');
console.log('  무회전 상한 ' + cumByTier['Easy'] + '별 < Moderate1 게이트 ' + S.TIER_GATES[0].requiredStars + '별.');
console.log('  A/B(젬/티켓)는 첫 가챠만 풀어줄 뿐 티어 진행을 못 푼다. 별을 더 딸 수 있게 하는');
console.log('  C(도약대) 또는 ★판정 완화만이 «진행 잠김»을 푼다. 이건 President 결정 대상이라 여기까지만 적는다.');

console.log('');
console.log('실행시각=' + new Date().toISOString());

// ── [6] 물리 검산 + 최대 획득가능 별수 (확정경제 충돌 점검) ─────────────────
const P = await bundleImport('physics.ts', 'phys');
line();
console.log('[6] 물리 검산 — 회전점수의 «유일한» 공급원이 도약대인가');
line();
const rotNeededS = 360 / P.AIR_ROTATION_DEG_PER_SEC;
console.log('AIR_ROTATION_DEG_PER_SEC=' + P.AIR_ROTATION_DEG_PER_SEC +
  ' → 1바퀴에 필요한 체공 ' + rotNeededS.toFixed(3) + 's');
const vLaunch = P.MAX_SPEED * P.LAUNCH_PAD_SPEED_MULT;
const vyLaunch = vLaunch * Math.sin(P.LAUNCH_PAD_ANGLE_DEG * Math.PI / 180);
const airLaunch = 2 * vyLaunch / P.GRAVITY;
console.log('도약대: v=' + P.MAX_SPEED + '×' + P.LAUNCH_PAD_SPEED_MULT + '=' + vLaunch.toFixed(0) +
  ', 각 ' + P.LAUNCH_PAD_ANGLE_DEG + '° → vy=' + vyLaunch.toFixed(0) +
  ', 체공 ' + airLaunch.toFixed(3) + 's → 회전 ' + (airLaunch * P.AIR_ROTATION_DEG_PER_SEC / 360).toFixed(2) + '바퀴');
console.log('  (문서상 실측 상한 ' + ROT_PER_LAUNCH_MEASURED + '바퀴와 대조 → ' +
  (Math.abs(airLaunch * P.AIR_ROTATION_DEG_PER_SEC / 360 - ROT_PER_LAUNCH_MEASURED) < 0.05 ? '일치, 모델 타당' : '불일치, 재확인 필요') + ')');
const vyNeeded = P.GRAVITY * rotNeededS / 2;
const slopeNeeded = vyNeeded / P.MAX_SPEED;
console.log('자연 이함으로 1바퀴 하려면 vy≥' + vyNeeded.toFixed(0) + ' → 최고속에서도 경사 ' +
  slopeNeeded.toFixed(2) + ' 필요. track.ts 실측 최대경사 0.410 «이며 이함은 마루(경사≈0)에서 난다»');
console.log('  ⇒ 자연 이함은 1바퀴를 못 만든다. 회전점수 공급원은 «도약대뿐» = [3] 계산 유효.');

line();
console.log('[7] 최적 플레이 시 최대 획득가능 별수 — 확정경제 충돌 점검');
line();
console.log(['티어', '완주구간', '도약대최대', '최대총점', 'targetScore', '최대별/스테이지', '누적최대'].join(' | '));
let maxCum = 0; const maxCumByTier = {};
for (const t of S.TIERS) {
  const px = L.deriveStageLengthPx(t.targetScore);
  const seg = L.segmentPointsOnFullRun(px);
  const rot = Math.floor(ROT_PER_LAUNCH_MEASURED) * t.launchPadCount * 2; // 완전착지 x2
  const maxScore = seg + rot;
  const met = maxScore >= t.targetScore;
  const maxStar = met ? 3 : 1; // targetScoreMet 은 ★2/★3 «공통» 전제
  maxCum += t.stageCount * maxStar;
  maxCumByTier[t.tier] = maxCum;
  console.log([t.tier.padEnd(11), String(seg).padStart(3), String(rot).padStart(3), String(maxScore).padStart(3),
    String(t.targetScore).padStart(3), ('★' + maxStar).padStart(4), String(maxCum).padStart(4)].join(' | '));
}
console.log('');
console.log('※ judgeStars: ★2도 ★3도 «targetScoreMet» 이 전제다 → 목표점수 미달이면 무조건 ★1.');
console.log('최대 획득가능 별 총합 = ' + maxCum + ' / 설계 별총량 ' + S.TOTAL_STARS +
  '  (' + (maxCum / S.TOTAL_STARS * 100).toFixed(1) + '%)');
console.log('');
console.log('게이트/해금 조건 도달 가능성(최적 플레이 기준):');
let firstBlock = null;
for (const g of S.TIER_GATES) {
  const prevTier = { Moderate1: 'Easy', Moderate2: 'Moderate1', Difficult1: 'Moderate2', Difficult2: 'Difficult1', Extreme: 'Difficult2' }[g.tier];
  const avail = maxCumByTier[prevTier];
  const ok = avail >= g.requiredStars;
  if (!ok && !firstBlock) firstBlock = g;
  console.log('  ' + g.tier.padEnd(11) + ' 필요 ' + String(g.requiredStars).padStart(3) +
    '별 / 직전까지 최대 ' + String(avail).padStart(3) + '별 → ' + (ok ? 'OK' : '★차단'));
}
console.log('  서리(SPECIAL) stage_stars 57 → 최대 ' + maxCum + '별 → ' + (maxCum >= 57 ? 'OK' : '★도달불가'));
console.log('  돌담(SPECIAL) starEquivalent 48 → 최대 ' + maxCum + '별 → ' + (maxCum >= 48 ? 'OK' : '★도달불가'));
console.log('');
if (firstBlock) {
  console.log('★★ 확정경제 충돌 — 진행이 ' + firstBlock.tier + ' 게이트(' + firstBlock.requiredStars + '별)에서 «최적 플레이로도» 막힌다.');
  console.log('   서리(57)·돌담(48)이 도달불가면 1단 컬렉션 완주(24종) 자체가 성립하지 않고,');
  console.log('   라이트75/코어30/헤비30 은 «도달 가능한 별 적립»을 전제로 산출된 값이라 근거가 무너진다.');
  console.log('   → 이건 밸런스 조정이 아니라 확정경제와의 충돌이다. 여기서 멈추고 상신한다(직접 판단 안 함).');
} else {
  console.log('확정경제 충돌 없음 — 최적 플레이로 모든 게이트/해금 도달 가능.');
}
console.log('');
console.log('[6][7] 실행시각=' + new Date().toISOString());

// ── [8] 정정 — 게이트 «차단»을 반영한 실제 도달가능 별수 ────────────────────
// [7]은 모든 티어를 다 플레이할 수 있다고 «가정»하고 누적을 냈다. 그런데 게이트에
// 막히면 그 뒤 티어는 «플레이 자체가 불가»라 별을 딸 수 없다. 순차적으로 다시 센다.
line();
console.log('[8] 정정 — 티어 게이트 차단을 반영한 «실제» 도달가능 별수');
line();
const gateOf = {};
for (const g of S.TIER_GATES) gateOf[g.tier] = g.requiredStars;
let reach = 0; let blockedAt = null; const playable = [];
for (const t of S.TIERS) {
  const need = gateOf[t.tier] ?? 0;
  if (reach < need) { blockedAt = { tier: t.tier, need, have: reach }; break; }
  const px = L.deriveStageLengthPx(t.targetScore);
  const maxScore = L.segmentPointsOnFullRun(px) + Math.floor(ROT_PER_LAUNCH_MEASURED) * t.launchPadCount * 2;
  const star = maxScore >= t.targetScore ? 3 : 1;
  reach += t.stageCount * star;
  playable.push(t.tier + '(★' + star + '×' + t.stageCount + ')');
  console.log('  ' + t.tier.padEnd(11) + ' 게이트 ' + String(need).padStart(3) +
    '별 ≤ 보유 ' + String(reach - t.stageCount * star).padStart(3) + '별 → 해금. 최대 ★' + star +
    ' × ' + t.stageCount + '스테이지 → 누적 ' + reach + '별');
}
console.log('');
console.log('플레이 가능 티어: ' + playable.join(' , '));
if (blockedAt) {
  console.log('★ 차단: ' + blockedAt.tier + ' 게이트 ' + blockedAt.need + '별 > 보유 상한 ' + blockedAt.have + '별');
  console.log('  → 게임은 ' + blockedAt.tier + ' 진입 직전에서 «영구 정지». 그 뒤 스테이지는 플레이 불가.');
}
console.log('');
console.log('실제 도달가능 별 상한 = ' + reach + '별  (설계 ' + S.TOTAL_STARS + '별의 ' +
  (reach / S.TOTAL_STARS * 100).toFixed(1) + '%)');
console.log('');
console.log('SPECIAL 해금 재판정(정정본):');
console.log('  서리  stage_stars 57      → 상한 ' + reach + '별 → ' + (reach >= 57 ? 'OK' : '★도달불가 (부족 ' + (57 - reach) + '별)'));
console.log('  돌담  starEquivalent 48   → 상한 ' + reach + '별 → ' + (reach >= 48 ? 'OK' : '★도달불가 (부족 ' + (48 - reach) + '별)'));
console.log('  하늘  login_streak 30     → 별 무관 → OK');
console.log('  불티  challenge_count 30  → 별 무관 → OK');
console.log('');
const maxMilestones = Math.floor(reach / STAR_MILESTONE_STEP);
console.log('별 마일스톤 획득 상한 = floor(' + reach + '/' + STAR_MILESTONE_STEP + ') = ' + maxMilestones +
  '회 × ' + STAR_MILESTONE_REWARD + '젬 = ' + (maxMilestones * STAR_MILESTONE_REWARD).toLocaleString('en-US') + '젬');
console.log('  1단 가챠 총비용 ' + GACHA_COST_1ST.toLocaleString('en-US') + '젬 대비 별수입 비중 = ' +
  (maxMilestones * STAR_MILESTONE_REWARD / GACHA_COST_1ST * 100).toFixed(1) + '%');
console.log('  (경제시뮬은 별 마일스톤을 12회=7,200젬 «전량 적립» 전제로 돌아간다 → 그 전제가 성립 안 함)');
console.log('');
console.log('[8] 실행시각=' + new Date().toISOString());

// ── [9] A/B 가 «1단 완주일수»에 주는 영향 — 근사 없이 상한논증 ──────────────
line();
console.log('[9] A/B 의 완주일수(라이트75/코어30/헤비30) 영향 — 상한논증 [계산]');
line();
// collection_paths_sim.mjs 실행값(현행 기준선) 인용
const PATHS = {
  haneul:  { light: 30, core: 30, heavy: 30, gemDependent: false, why: 'login_streak 30 = 캘린더, 젬 무관' },
  bulti:   { light: 75, core: 25, heavy: 15, gemDependent: false, why: 'challenge_count 30 = 플레이 횟수, 젬 무관' },
  seori:   { light: 75, core: 24, heavy: 12, gemDependent: false, why: 'stage_stars 57 = 별, 젬 무관' },
  doldam:  { light: 63, core: 20, heavy: 10, gemDependent: false, why: 'customization(별환산 48), 젬 무관' },
  gacha20: { light: 48, core: 30, heavy: 25, gemDependent: true,  why: '보석 20,100 소요 — A/B가 «유일하게» 건드리는 경로' },
};
const ARCH = ['light', 'core', 'heavy'];
console.log('경로별 완주일(현행 collection_paths_sim 실행값) 및 젬 의존 여부:');
for (const [k, v] of Object.entries(PATHS)) {
  console.log('  ' + k.padEnd(8) + ARCH.map((a) => String(v[a]).padStart(5)).join('') +
    '   젬의존=' + (v.gemDependent ? 'YES' : 'NO ') + '  ' + v.why);
}
console.log('');
console.log('1단 완주 = 5경로 «최댓값». A/B는 gacha20 경로만 단축시킨다.');
console.log('→ 상한논증: gacha20 을 «0일»로 만들어도(=전 20뽑기 무료라는 극단) 나머지 4경로가 남는다.');
console.log('   즉 A(600젬)든 B(1티켓)든 그 «상한»을 넘을 수 없다.');
console.log('');
console.log(['아키타입', '현행완주', 'gacha20=0일 가정시', '변화'].join(' | '));
for (const a of ARCH) {
  const cur = Math.max(...Object.values(PATHS).map((v) => v[a]));
  const woGacha = Math.max(...Object.entries(PATHS).filter(([k]) => k !== 'gacha20').map(([, v]) => v[a]));
  const binding = Object.entries(PATHS).filter(([k, v]) => k !== 'gacha20' && v[a] === woGacha).map(([k]) => k);
  console.log('  ' + a.padEnd(7) + String(cur).padStart(6) + String(woGacha).padStart(18) +
    '   ' + (cur === woGacha ? '0일 (구속경로: ' + binding.join(',') + ')' : (woGacha - cur) + '일'));
}
console.log('');
console.log('★ 결론: A·B 어느 쪽이든 라이트75/코어30/헤비30 은 «0일 변동». 흔들리지 않는다.');
console.log('  이유: 구속 경로가 전부 젬과 무관하다 — 라이트는 bulti/seori(75), 코어·헤비는 haneul(30, 캘린더).');
console.log('  gacha20 은 어느 아키타입에서도 최댓값이 아니다(light 48<75, core 30=30 동률, heavy 25<30).');
console.log('  ⇒ 완주일수는 A/B 선택의 판단근거가 «될 수 없다». 판단은 [4]의 유출위험으로 갈린다 → B.');
console.log('');
console.log('[9] 실행시각=' + new Date().toISOString());

// ── [10] 렌즈2 — 「도약 1회 = 최대 1바퀴」의 «최악조건» 상한검증 ─────────────
// [3][7]의 결론 전체가 「도약당 floor(회전)=1」에 걸려 있다. 만약 어떤 조건에서
// 2바퀴가 나오면 결론이 뒤집힌다. 그래서 물리가 허용하는 «가장 유리한» 조합으로
// 상한을 잡아 2바퀴에 닿는지 본다(가정이 아니라 상수에서 유도).
line();
console.log('[10] 렌즈2 — 도약 1회로 «2바퀴»가 가능한가 (최악조건 상한)');
line();
console.log('물리: 발사속도 = tangentSpeed × ' + P.LAUNCH_PAD_SPEED_MULT +
  ', 발사각 = 지형접선각 + ' + P.LAUNCH_PAD_ANGLE_DEG + '° (physics.ts:256-262 실제 코드)');
const need2 = 2 * 360 / P.AIR_ROTATION_DEG_PER_SEC;
console.log('2바퀴에 필요한 체공 = ' + need2.toFixed(3) + 's');
const vMaxOverspeed = P.MAX_SPEED * P.DOWNHILL_OVERSPEED_MULT; // 내리막 초과속 상한
const slopeMaxDeg = Math.atan(0.410) * 180 / Math.PI;          // track.ts 실측 최대경사
const cases = [
  { n: '평지·정속',              v: P.MAX_SPEED,   deg: 0 },
  { n: '평지·내리막초과속',      v: vMaxOverspeed, deg: 0 },
  { n: '최대오르막·정속',        v: P.MAX_SPEED,   deg: slopeMaxDeg },
  { n: '최대오르막·초과속(비현실 상한)', v: vMaxOverspeed, deg: slopeMaxDeg },
];
console.log(['조건', '속도', '발사각', '체공(s)', '회전(바퀴)', 'floor'].join(' | '));
let anyTwo = false;
for (const c of cases) {
  const sp = c.v * P.LAUNCH_PAD_SPEED_MULT;
  const dir = (c.deg + P.LAUNCH_PAD_ANGLE_DEG) * Math.PI / 180;
  const air = 2 * sp * Math.sin(dir) / P.GRAVITY;
  const rot = air * P.AIR_ROTATION_DEG_PER_SEC / 360;
  if (Math.floor(rot) >= 2) anyTwo = true;
  console.log('  ' + c.n.padEnd(30) + String(Math.round(c.v)).padStart(6) +
    (c.deg + P.LAUNCH_PAD_ANGLE_DEG).toFixed(1).padStart(8) + '°' +
    air.toFixed(3).padStart(9) + rot.toFixed(2).padStart(10) + String(Math.floor(rot)).padStart(6));
}
console.log('');
console.log('  ⇒ 2바퀴 도달: ' + (anyTwo ? '★가능 — [3][7] 결론 재검토 필요' : '불가. 최악조건에서도 floor=1'));
console.log('  ⇒ 렌즈1(문서 실측 1.09) 과 렌즈2(상수 유도 상한) 가 «같은 결론». 도약당 회전점수 상한 = 1바퀴 × x2 = 2점.');
console.log('');
console.log('[10] 실행시각=' + new Date().toISOString());
