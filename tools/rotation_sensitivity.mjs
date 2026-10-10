#!/usr/bin/env node
// rotation_sensitivity.mjs — 「회전 성공률」에 대한 도달별 민감도 + 티어별 허용실패횟수.
//
// 왜 이 모형인가: 회전점수는 «도약 건별»로 floor(|각|/360) 이 적용된다. 즉 0.85바퀴 도약은
//   부분점수가 아니라 «0점»이다(실측). 따라서 «평균 회전수»로 뭉뚱그리면 안 되고,
//   도약 1건이 1바퀴를 넘느냐 마느냐의 «베르누이 시행»으로 봐야 한다.
//   ⇒ 도약 P개 중 성공 S개일 때 회전점수 = S × mult.  ★2 조건: floor(0.7T) + S×mult ≥ T
//
// 산출:
//   ① 티어별 «필요 성공수»와 «허용 실패횟수»
//   ② 회전성공률 p ∈ {100%,75%,50%} 에서 스테이지 ★2 확률(이항) 과 «기대 도달별»
//   ③ 24종 완주(별 57) 성립에 필요한 «최소 성공률» 역산
//
// ★ 확률모형의 한계: 도약 성공이 서로 «독립»이고 모든 도약이 같은 p 를 갖는다고 «가정»한다.
//   실측(0.85 / 1.08)은 도약마다 속도·경사가 달라 p 가 다를 수 있음을 시사한다. [가정] 라벨 유지.
//
// 사용: node tools/rotation_sensitivity.mjs > tools/rotation_sensitivity_output.log 2>&1

import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, '..', 'src', 'game');
async function bundleImport(file, tag) {
  const out = path.join(__dirname, `_rs_${tag}_tmp.mjs`);
  await build({ entryPoints: [path.join(SRC, file)], bundle: true, format: 'esm', platform: 'neutral', outfile: out });
  return import('file://' + out + '?t=' + Date.now());
}
const S = await bundleImport('stages.ts', 'stages');
const L = await bundleImport('stageLength.ts', 'len');
const SC = await bundleImport('score.ts', 'score');

const line = (c = '=') => console.log(c.repeat(104));
const SEORI = 57, DOLDAM = 48;
const PAD_FLIGHT_PX = 2080; // [측정] 단일 도약 최대 수평이동 tools/pad_flight_exact.log

// 현재 score.ts 의 «실제» 완전착지 배수를 코드에서 뽑는다(숫자를 다시 적지 않는다).
const MULT = SC.jumpScore(360, 'perfect').multiplier;

function nCr(n, r) { let v = 1; for (let i = 0; i < r; i++) v = v * (n - i) / (i + 1); return v; }
function binomAtLeast(n, k, p) { let s = 0; for (let i = k; i <= n; i++) s += nCr(n, i) * Math.pow(p, i) * Math.pow(1 - p, n - i); return s; }

function tierRows(mult, padOverride) {
  return S.TIERS.map((t) => {
    const pads = padOverride ? padOverride(t) : t.launchPadCount;
    const px = L.deriveStageLengthPx(t.targetScore);
    const seg = L.segmentPointsOnFullRun(px);
    const needPts = t.targetScore - seg;
    const needSucc = Math.ceil(needPts / mult);
    return { tier: t.tier, stageCount: t.stageCount, T: t.targetScore, px, seg, pads,
      needPts, needSucc, allowFail: pads - needSucc,
      maxUsablePads: Math.floor(px / PAD_FLIGHT_PX) };
  });
}

line();
console.log('회전 성공률 민감도 — 「도약 1건이 1바퀴를 넘는가」를 베르누이 시행으로 모형화');
line();
console.log('현재 적용값: 완전착지 배수 = x' + MULT + ' (score.ts 에서 직접 추출)');
console.log('도약대 수(stages.ts 현재값): ' + S.TIERS.map((t) => t.tier + '=' + t.launchPadCount).join(' / '));
console.log('실측 근거: 단일 도약 회전 0.85(=0점) / 1.08(=1점) → 표본 2회 중 성공 1회');
console.log('');

const rows = tierRows(MULT);
line('-');
console.log('① 티어별 필요 성공수 / 허용 실패횟수  [계산]');
line('-');
console.log(['티어', 'T', '구간점', '부족점', '도약대', '필요성공', '허용실패', '길이상 최대도약대'].join(' | '));
for (const r of rows) {
  console.log([r.tier.padEnd(11), String(r.T).padStart(3), String(r.seg).padStart(4), String(r.needPts).padStart(4),
    String(r.pads).padStart(4), String(r.needSucc).padStart(5), String(r.allowFail).padStart(5),
    String(r.maxUsablePads).padStart(6)].join(' | '));
}
const zeroMargin = rows.filter((r) => r.allowFail <= 0);
console.log('');
console.log('허용실패 0회인 티어 = ' + (zeroMargin.length ? zeroMargin.map((r) => r.tier).join(', ') : '없음'));

// ── ② 성공률별 기대 도달별 ─────────────────────────────────────────────────
function reachAt(p, rws) {
  // 게이트를 순차 반영. 각 티어에서 ★2 확률 = P(성공 ≥ needSucc).
  // ★3 은 추가로 회전누적 조건이 필요하나 needSucc≥targetRotations 이면 동시충족되므로 동일 확률로 본다.
  const gate = {}; for (const g of S.TIER_GATES) gate[g.tier] = g.requiredStars;
  let cum = 0;
  for (const r of rws) {
    const need = gate[r.tier] ?? 0;
    if (cum < need) return { reach: cum, blocked: r.tier };
    const pStar = binomAtLeast(r.pads, r.needSucc, p);
    // 기대 별 = pStar 확률로 ★3, 아니면 ★1
    const expStar = pStar * 3 + (1 - pStar) * 1;
    cum += r.stageCount * expStar;
  }
  return { reach: cum, blocked: null };
}

line('-');
console.log('② 회전 성공률별 «기대» 도달별  [계산, 이항모형]');
line('-');
console.log(['성공률', 'Easy★2확률', 'Mod1', 'Mod2', 'Dif1', 'Dif2', 'Extreme', '기대도달별', '24종완주'].join(' | '));
for (const p of [1.0, 0.75, 0.5]) {
  const probs = rows.map((r) => binomAtLeast(r.pads, r.needSucc, p));
  const { reach, blocked } = reachAt(p, rows);
  console.log([
    (p * 100).toFixed(0).padStart(5) + '%',
    ...probs.map((x) => (x * 100).toFixed(1).padStart(6) + '%'),
    reach.toFixed(1).padStart(7),
    (reach >= SEORI ? '성립' : '★불성립') + (blocked ? '(차단:' + blocked + ')' : ''),
  ].join(' | '));
}
console.log('');
console.log('※ «기대»별이다. 실제로는 재시도가 가능하므로 «반복 플레이 시» 최댓값에 수렴한다.');
console.log('  아래 ③은 「무한 재시도 시 언젠가 달성 가능한가」가 아니라 「한 판에 얼마나 자주 되는가」를 본다.');

// ── ③ 24종 완주(별 57)에 필요한 최소 성공률 ────────────────────────────────
line('-');
console.log('③ 24종 완주(별 ' + SEORI + ') 성립에 필요한 «최소 회전성공률» 역산  [계산]');
line('-');
let need = null;
for (let p = 1.0; p >= 0.0; p -= 0.01) {
  const { reach } = reachAt(Number(p.toFixed(2)), rows);
  if (reach < SEORI) { need = Number((p + 0.01).toFixed(2)); break; }
}
console.log('  현재 파라미터(배수 x' + MULT + ', 도약대 ' + rows.map((r) => r.pads).join('/') + ')');
console.log('  → 회전 성공률 **' + (need === null ? '0' : (need * 100).toFixed(0)) + '% 미만이면 24종 완주 불가**');

// ── ④ 50% 에서도 성립하는 파라미터 탐색 ────────────────────────────────────
line('-');
console.log('④ 회전성공률 50% 에서도 24종 완주가 성립하는 파라미터 탐색');
line('-');
console.log(['배수', '도약대(길이상한까지)', '허용실패', '기대도달별@50%', '24종완주@50%'].join(' | '));
for (const mult of [3, 4, 5]) {
  const rws = tierRows(mult, (t) => {
    const px = L.deriveStageLengthPx(t.targetScore);
    return Math.min(Math.floor(px / PAD_FLIGHT_PX), Math.max(t.launchPadCount, 20));
  });
  const { reach, blocked } = reachAt(0.5, rws);
  console.log(['x' + mult, rws.map((r) => r.pads).join('/'), rws.map((r) => r.allowFail).join('/'),
    reach.toFixed(1), (reach >= SEORI ? '성립' : '★불성립') + (blocked ? '(차단:' + blocked + ')' : '')].join(' | '));
}
console.log('');
console.log('※ 도약대는 «길이가 허용하는 최대»(= floor(길이/' + PAD_FLIGHT_PX + 'px))까지 올린 경우다.');
console.log('  Easy 는 4200px 라 물리적으로 2개가 상한이다 — 여기가 병목이다.');
console.log('');
console.log('실행시각=' + new Date().toISOString());
