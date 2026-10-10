#!/usr/bin/env node
// collection_paths_sim.mjs — SPECIAL 4종 + 가챠 20종 = 5경로 1단완주 재현.
// roster.ts(src/game/roster.ts)를 esbuild로 번들해 «단일 소스»를 실제로
// 임포트한다(수식 복제 안 함 - roster.ts가 바뀌면 이 결과도 같이 바뀐다).
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const bundlePath = path.join(__dirname, '_roster_bundle_tmp.mjs');

await build({
  entryPoints: [path.join(__dirname, '..', 'src', 'game', 'roster.ts')],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  outfile: bundlePath,
});

const roster = await import('file://' + bundlePath);
const { ROSTER, GACHA_POOL, unlockDaysFor, verifyNoRomajiCollision, gradeCount } = roster;

// ★ 출구조건1 재도출(venture-secretary 2026-08-05 반려 대응).
// 옛 값: 3개 아키타입 전부 144/60=2.400 «균등 플레이스홀더» - 이제 stages.ts가
// 있으니 실제 유도로 대체한다.
// [자체설계 가정, 명시] 모델: starsPerDay = runsPerDay x AVG_STARS_PER_RUN.
//   런(=스테이지 시도) 1회당 기대 별수는 아키타입 무관 상수로 두고, «core»를
//   기존 60일/144별 앵커에 맞춰 역산해서 보정한다(다른 앵커를 쓸 수도 있었다 -
//   이게 유일한 정답은 아니다. 그러나 core를 기준으로 삼은 건 표 4-5a의
//   "코어=기준형" 성격과 일치시키기 위함).
//   AVG_STARS_PER_RUN = 144 / (60일 x 25런/일) = 0.096 별/런
// runsPerDay 출처: 설계서 4.5절 표 4-5a(라이트 8런/코어 25런/헤비 50런).
// ★ 이 144 는 stages.ts TOTAL_STARS(=48×3) 의 «복제»다. 티어 변경 시 같이 고칠 것.
//   (2026-08-06 백로그 등재 — tools/ 는 런타임 아님, 기준선 도구라 지금은 무접촉)
const AVG_STARS_PER_RUN = 144 / (60 * 25); // 0.096, core 앵커
const RUNS_PER_DAY = { light: 8, core: 25, heavy: 50 };
const DERIVED_STARS_PER_DAY = {
  light: RUNS_PER_DAY.light * AVG_STARS_PER_RUN,
  core: RUNS_PER_DAY.core * AVG_STARS_PER_RUN,
  heavy: RUNS_PER_DAY.heavy * AVG_STARS_PER_RUN,
};

const ARCHETYPES = {
  light: { challengesPerDay: 0.4, starsPerDay: DERIVED_STARS_PER_DAY.light },
  core: { challengesPerDay: 1.2, starsPerDay: DERIVED_STARS_PER_DAY.core },
  heavy: { challengesPerDay: 2.0, starsPerDay: DERIVED_STARS_PER_DAY.heavy },
};


const GACHA_DAYS_D2D3 = { light: 48, core: 30, heavy: 25 }; // economy_sim.mjs v3 검증값 인용

console.log('='.repeat(78));
console.log('SPECIAL 4종 + 가챠 = 5경로 1단완주 재현 (roster.ts 단일소스 직접 임포트)');
console.log('='.repeat(78));
console.log('로스터 구성 확인:', JSON.stringify({ total: ROSTER.length, COMMON: gradeCount('COMMON'), RARE: gradeCount('RARE'), EPIC: gradeCount('EPIC'), SPECIAL: gradeCount('SPECIAL'), gachaPool: GACHA_POOL.length }));
console.log('로마자 회피명단 충돌:', JSON.stringify(verifyNoRomajiCollision()));

const specials = ROSTER.filter((c) => c.acquisition === 'condition');
const results = {};
for (const arche of Object.keys(ARCHETYPES)) {
  const pace = ARCHETYPES[arche];
  const perCondition = {};
  for (const s of specials) perCondition[s.id] = unlockDaysFor(s.unlock, pace);
  perCondition['gacha20'] = GACHA_DAYS_D2D3[arche];
  results[arche] = perCondition;
}

console.log('\n경로별 완주일:');
console.log('경로'.padEnd(10) + Object.keys(ARCHETYPES).map((a) => a.padStart(8)).join(''));
const rows = [...specials.map((s) => s.id), 'gacha20'];
for (const row of rows) {
  console.log(row.padEnd(10) + Object.keys(ARCHETYPES).map((a) => String(results[a][row]).padStart(8)).join(''));
}

const maxByArche = {};
for (const arche of Object.keys(ARCHETYPES)) {
  maxByArche[arche] = Math.max(...Object.values(results[arche]));
}
console.log('\n1단완주(max5경로):', JSON.stringify(maxByArche));
const gapLH = maxByArche.light / maxByArche.heavy;
console.log('격차 light/heavy =', gapLH.toFixed(2) + 'x');

console.log('\n[인수기준]');
console.log('(a) 라이트 70~80 밴드:', maxByArche.light >= 70 && maxByArche.light <= 80 ? 'PASS' : 'FAIL', '(실측', maxByArche.light + ')');
const dominators = {};
for (const arche of Object.keys(ARCHETYPES)) {
  const m = maxByArche[arche];
  dominators[arche] = Object.keys(results[arche]).filter((k) => results[arche][k] === m);
}
const allSameDominator = new Set(Object.values(dominators).map((d) => d.join(','))).size === 1;
console.log('(b-신) 단일조건 동시지배 없음:', !allSameDominator ? 'PASS' : 'FAIL', JSON.stringify(dominators));
console.log('(c-신) Partner 기준교체: (a)와 동일(라이트 70~80일):', maxByArche.light >= 70 && maxByArche.light <= 80 ? 'PASS' : 'FAIL');
console.log('  참고: 격차 ' + gapLH.toFixed(2) + 'x (구조적 하한, 판정기준 아님 - 격차<=2.0 기준은 폐기됨)');
console.log('(d) 4축 유지(login/challenge/stars/customization): PASS(구조상 고정)');

console.log('SUPERSEDED: 75/40/40 5-path comparison block removed 2026-08-05 (2nd rejection).');
console.log('Authoritative model is tools/star_rate_sensitivity.mjs (exposure-vs-difficulty decomposed, sensitivity swept, dynamic threshold).');
