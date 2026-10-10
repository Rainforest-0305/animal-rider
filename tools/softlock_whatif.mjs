#!/usr/bin/env node
// softlock_whatif.mjs — 소프트락 해소 후보안 «what-if» 평가 엔진.
//
// ★ stages.ts 를 «수정하지 않는다». 후보값을 입력으로 받아, 판정에는 stages.ts 의
//   «실제» judgeStars() 를 그대로 쓴다(로직 재구현 금지 — 재구현하면 그건 검증이 아니다).
//
// 평가 항목(지시 필수조건):
//   ① 도달가능 최대별 (게이트 차단 반영)
//   ② 24종 완주 성립 = 서리(별57)·돌담(별환산48)·SPECIAL 2종(하늘/불티) 전부 도달
//   ④ 스테이지1 온보딩 시간(유도길이 변화 반영)
//   + 물리 제약: 도약대 밀도가 «비행 수평거리»를 넘지 않는가(실측 3608px/도약)
//
// 사용: node tools/softlock_whatif.mjs > tools/softlock_whatif_output.log 2>&1

import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, '..', 'src', 'game');
async function bundleImport(file, tag) {
  const out = path.join(__dirname, `_wif_${tag}_tmp.mjs`);
  await build({ entryPoints: [path.join(SRC, file)], bundle: true, format: 'esm', platform: 'neutral', outfile: out });
  return import('file://' + out + '?t=' + Date.now());
}
const S = await bundleImport('stages.ts', 'stages');
const L = await bundleImport('stageLength.ts', 'len');

const line = (c = '=') => console.log(c.repeat(100));

// ── 실측 상수(전부 출처 명기) ───────────────────────────────────────────────
const MEAS = {
  // ★ 2026-08-09 정정: 앞선 1.82s/3608px/1.92바퀴는 «비행 2회 병합»값이었다(폐기).
  //   발사시점(padLaunches 증가) 기준으로 쪼갠 실측 — tools/pad_flight_exact.log
  padFlightSecondsMin: 0.80,  // [측정] 발사1
  padFlightSecondsMax: 1.02,  // [측정] 발사2
  padFlightPxMin: 1527,       // [측정] 발사1 수평이동
  padFlightPxMax: 2080,       // [측정] 발사2 수평이동
  padRotationsMin: 0.85,      // floor = 0  ← 회전점수 0점인 도약도 «실제로 있다»
  padRotationsMax: 1.08,      // floor = 1  (문서상 실측상한 1.09와 일치)
  padFireRateStage1: 1.00,    // [측정] 배치 2개 중 2개 발동 tools/pad_fire_rate.log
  naturalFlightSeconds: 0.25, // [측정] 자연이함 최대(나머지는 프레임보다 짧음)
  rotDegPerSec: 380,          // physics.ts
  stage1Seconds: 3.31,        // [측정]
  steadySpeedPxPerS: 1420,    // [측정]
};
const SEORI_STARS = 57;   // roster.ts (읽기전용)
const DOLDAM_STARS = 48;  // roster.ts starEquivalent (읽기전용)

line();
console.log('소프트락 해소 what-if 평가 — stages.ts 무접촉, 판정은 실제 judgeStars() 사용');
line();
console.log('실측 입력값:');
for (const [k, v] of Object.entries(MEAS)) console.log('  ' + k.padEnd(22) + v);
console.log('  서리 필요별=' + SEORI_STARS + ' / 돌담 별환산=' + DOLDAM_STARS + ' (roster.ts, 불변)');

/**
 * 후보 구성 하나를 평가한다.
 * cfg = { name, tiers:[{tier,stageCount,targetScore,launchPadCount,gate}], rotPerPad, perfectMult }
 *   rotPerPad    : 도약 1회로 «완주되는» 회전수(현행 floor(1.92)=1)
 *   perfectMult  : 완전착지 배수(현행 2)
 */
function evaluate(cfg) {
  const rows = [];
  let reach = 0; let blocked = null;
  for (const t of cfg.tiers) {
    if (reach < t.gate) { blocked = { tier: t.tier, gate: t.gate, have: reach }; break; }
    const px = L.deriveStageLengthPx(t.targetScore);
    const segPts = L.segmentPointsOnFullRun(px);
    const rotPts = cfg.rotPerPad * t.launchPadCount * cfg.perfectMult;
    const maxScore = segPts + rotPts;
    // ★ 판정은 재구현하지 않고 stages.ts 의 실제 함수를 호출한다.
    const def = { tier: t.tier, stageCount: t.stageCount, starsPerStage: 3, targetScore: t.targetScore,
      targetRotationsCumulative: 1, fieldBand: '0~30', revivesProvided: false, launchPadCount: t.launchPadCount };
    const judged = S.judgeStars(def, maxScore, cfg.rotPerPad * t.launchPadCount, 0, true);
    reach += t.stageCount * judged.stars;
    // 물리 제약: 도약대 간격이 비행 수평거리보다 좁으면 «날아넘어» 발동 불가
    // 밀도 타당성: 도약대 «간격»이 비행 수평거리보다 넓어야 날아넘지 않고 발동한다.
    // 기준은 실측 최대 비행거리(2080px). 착지 즉시 재발사가 실측되므로 지상주행 여유는 0으로 둔다.
    const spacingPx = px / t.launchPadCount;
    const usablePads = Math.max(1, Math.floor(px / MEAS.padFlightPxMax));
    rows.push({ tier: t.tier, targetScore: t.targetScore, pads: t.launchPadCount, px, segPts, rotPts,
      maxScore, stars: judged.stars, cum: reach, spacingPx, usablePads,
      padFeasible: t.launchPadCount <= usablePads });
  }
  const seoriOK = reach >= SEORI_STARS;
  const doldamOK = reach >= DOLDAM_STARS;
  const allTiersPlayed = rows.length === cfg.tiers.length;
  const stage1Px = L.deriveStageLengthPx(cfg.tiers[0].targetScore);
  const stage1S = stage1Px / MEAS.steadySpeedPxPerS + 0.35 * Math.exp(-stage1Px / 4200);
  return { cfg, rows, reach, blocked, seoriOK, doldamOK, allTiersPlayed, stage1Px, stage1S,
    collectionOK: seoriOK && doldamOK };
}

function report(r) {
  line('-');
  console.log('▶ ' + r.cfg.name);
  console.log('  rotPerPad=' + r.cfg.rotPerPad + ' perfectMult=' + r.cfg.perfectMult);
  line('-');
  console.log(['티어', 'T', '도약대', '길이px', '구간점', '회전점', '최대점', '별', '누적', '간격px', '쓸수있는최대', '밀도OK'].join(' | '));
  for (const x of r.rows) {
    console.log([x.tier.padEnd(11), String(x.targetScore).padStart(3), String(x.pads).padStart(3),
      String(x.px).padStart(6), String(x.segPts).padStart(4), String(x.rotPts).padStart(4),
      String(x.maxScore).padStart(4), ('★' + x.stars).padStart(3), String(x.cum).padStart(4),
      String(Math.round(x.spacingPx)).padStart(6), String(x.usablePads).padStart(5),
      (x.padFeasible ? 'OK' : '★불가').padStart(5)].join(' | '));
  }
  if (r.blocked) console.log('  ★차단: ' + r.blocked.tier + ' 게이트 ' + r.blocked.gate + '별 > 보유 ' + r.blocked.have + '별');
  console.log('  도달가능 최대별 = ' + r.reach + ' / ' + S.TOTAL_STARS +
    '   (전 티어 플레이 ' + (r.allTiersPlayed ? 'O' : 'X') + ')');
  console.log('  서리(' + SEORI_STARS + ') ' + (r.seoriOK ? 'OK' : '불가') +
    ' / 돌담(' + DOLDAM_STARS + ') ' + (r.doldamOK ? 'OK' : '불가') +
    '  →  24종 완주 ' + (r.collectionOK ? '★성립' : '불성립'));
  console.log('  스테이지1 = ' + r.stage1Px + 'px / ' + r.stage1S.toFixed(2) + '초 (현행 ' +
    MEAS.stage1Seconds + '초, ' + (r.stage1S <= MEAS.stage1Seconds * 1.5 ? '온보딩 유지' : '★온보딩 악화') + ')');
  const infeasible = r.rows.filter((x) => !x.padFeasible);
  if (infeasible.length) console.log('  ★물리 불가 티어(도약대가 비행거리보다 촘촘): ' + infeasible.map((x) => x.tier).join(', '));
  return r;
}

const CUR = [
  { tier: 'Easy', stageCount: 10, targetScore: 12, launchPadCount: 2, gate: 0 },
  { tier: 'Moderate1', stageCount: 8, targetScore: 24, launchPadCount: 3, gate: 15 },
  { tier: 'Moderate2', stageCount: 8, targetScore: 38, launchPadCount: 4, gate: 32 },
  { tier: 'Difficult1', stageCount: 8, targetScore: 52, launchPadCount: 5, gate: 50 },
  { tier: 'Difficult2', stageCount: 8, targetScore: 68, launchPadCount: 6, gate: 72 },
  { tier: 'Extreme', stageCount: 6, targetScore: 88, launchPadCount: 7, gate: 95 },
];
const clone = (t) => t.map((x) => ({ ...x }));

line();
console.log('[기준선] 현행 — 소프트락 재현');
report(evaluate({ name: '현행(무수정)', tiers: clone(CUR), rotPerPad: 1, perfectMult: 2 }));

// ── A단독: 도약대를 «필요량»까지 올린다 → 밀도 불가 확인용 ─────────────────
line();
console.log('[A단독] 도약대만 필요량까지 상향 — 밀도 타당성 검사');
const aTiers = clone(CUR).map((t) => {
  const px = L.deriveStageLengthPx(t.targetScore);
  const need = t.targetScore - L.segmentPointsOnFullRun(px);
  return { ...t, launchPadCount: Math.max(t.launchPadCount, Math.ceil(need / 2)) };
});
report(evaluate({ name: 'A단독(도약대 상향)', tiers: aTiers, rotPerPad: 1, perfectMult: 2 }));

// ── C단독: targetScore 인하 ─────────────────────────────────────────────────
// 최대점수 = floor(0.7T) + 2P ≥ T  →  T ≤ 2P/0.3 (근사). 각 티어 P 고정하고 T 상한을 구한다.
line();
console.log('[C단독] targetScore 인하 — 현행 도약대 수에서 «달성 가능한» 최대 T 로 낮춘다');
const cTiers = clone(CUR).map((t) => {
  let best = t.targetScore;
  for (let T = t.targetScore; T >= 4; T--) {
    const px = L.deriveStageLengthPx(T);
    if (L.segmentPointsOnFullRun(px) + 2 * t.launchPadCount >= T) { best = T; break; }
  }
  return { ...t, targetScore: best };
});
report(evaluate({ name: 'C단독(targetScore 인하)', tiers: cTiers, rotPerPad: 1, perfectMult: 2 }));

// ── B단독: 게이트만 인하 ────────────────────────────────────────────────────
line();
console.log('[B단독] TIER_GATES 만 인하 — 지시대로 «단독 금지» 확인용');
const bTiers = clone(CUR).map((t, i) => ({ ...t, gate: [0, 10, 18, 26, 34, 42][i] }));
report(evaluate({ name: 'B단독(게이트 인하)', tiers: bTiers, rotPerPad: 1, perfectMult: 2 }));

// ── B+C 조합 ───────────────────────────────────────────────────────────────
line();
console.log('[B+C] targetScore 인하 + 게이트 재정렬');
const bcTiers = cTiers.map((t, i) => ({ ...t, gate: [0, 15, 32, 50, 72, 95][i] }));
report(evaluate({ name: 'B+C(현행 게이트 유지)', tiers: bcTiers, rotPerPad: 1, perfectMult: 2 }));

console.log('');
console.log('실행시각=' + new Date().toISOString());

// ── E2: 완전착지 배수 상향 (score.ts, 물리 무변경) ──────────────────────────
line();
console.log('[E2] 완전착지 배수 x2 → x3 (score.ts 만 변경, 물리·stages.ts 무변경)');
report(evaluate({ name: 'E2(배수 x3)', tiers: clone(CUR), rotPerPad: 1, perfectMult: 3 }));

line();
console.log('[E2강화] 완전착지 배수 x2 → x4');
report(evaluate({ name: 'E2강화(배수 x4)', tiers: clone(CUR), rotPerPad: 1, perfectMult: 4 }));

// ── A+E2 조합: 도약대 소폭 + 배수 x3 ────────────────────────────────────────
line();
console.log('[A+E2] 도약대 소폭 상향 + 배수 x3 — 양쪽을 «조금씩»');
const aeTiers = clone(CUR).map((t) => {
  const px = L.deriveStageLengthPx(t.targetScore);
  const need = t.targetScore - L.segmentPointsOnFullRun(px);
  return { ...t, launchPadCount: Math.max(t.launchPadCount, Math.ceil(need / 3)) }; // 배수3 기준 필요량
});
report(evaluate({ name: 'A+E2(도약대 최소상향 + 배수x3)', tiers: aeTiers, rotPerPad: 1, perfectMult: 3 }));

// ── 보수성 검사 ─────────────────────────────────────────────────────────────
// 실측상 도약 2회 중 1회는 0.85바퀴로 «회전 0점»이었다. 즉 rotPerPad=1 은 낙관값이다.
// 모든 도약이 1바퀴를 만든다는 보장이 없을 때 각 안이 버티는지 본다.
line();
console.log('[보수성 검사] 도약 중 절반만 1바퀴를 만든다면? (실측: 0.85바퀴 1회 = 0점, 1.08바퀴 1회 = 1점)');
line();
for (const [nm, tiers, mult] of [
  ['A단독', aTiers, 2], ['C단독', cTiers, 2], ['E2강화(x4)', clone(CUR), 4], ['A+E2', aeTiers, 3],
]) {
  const r = evaluate({ name: nm + ' @회전성공률50%', tiers, rotPerPad: 0.5, perfectMult: mult });
  console.log('  ' + nm.padEnd(14) + ' → 도달별 ' + String(r.reach).padStart(3) + '/144, 24종완주 ' +
    (r.collectionOK ? '성립' : '★불성립') + (r.blocked ? '  (차단: ' + r.blocked.tier + ')' : ''));
}
console.log('  ※ rotPerPad=0.5 는 «도약 2회당 1바퀴»라는 뜻. 실측 표본이 2회뿐이라 이 값 자체는 [가정]이다.');
console.log('    표본을 늘리려면 상위 티어 스테이지에서 도약별 체공을 재야 한다(미완, notes §5).');
console.log('');
console.log('보정본 실행시각=' + new Date().toISOString());
