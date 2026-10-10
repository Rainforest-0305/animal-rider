#!/usr/bin/env node
// unlock_days_ab.mjs — roster.ts 의 TOTAL_STARS_PLACEHOLDER(144) → stages.ts TOTAL_STARS 유도 교체
// «전/후 값 완전동일» A/B 대조군.
//
// 사용:  node tools/unlock_days_ab.mjs > tools/unlock_days_A_before.log 2>&1   (변경 전)
//        node tools/unlock_days_ab.mjs > tools/unlock_days_B_after.log  2>&1   (변경 후)
//        diff tools/unlock_days_A_before.log tools/unlock_days_B_after.log
//
// ★ 중요: 현재 로스터의 돌담은 starEquivalent=48 을 «명시»하고 있어서
//   `cond.starEquivalent ?? cond.target * (TOTAL_STARS/12)` 의 «?? 우변»,
//   즉 이번에 바뀌는 바로 그 식이 실제로는 «한 번도 실행되지 않는다».
//   그래서 SPECIAL 4종만 찍으면 «바뀐 줄을 지나가지 않는 가짜 증명»이 된다.
//   → 아래 [B] 절에서 starEquivalent 를 «제거한» 합성 조건으로 폴백 경로를
//     강제 실행해서 그 값까지 A/B 로 비교한다.

import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const bundlePath = path.join(__dirname, '_roster_ab_bundle_tmp.mjs');
await build({
  entryPoints: [path.join(__dirname, '..', 'src', 'game', 'roster.ts')],
  bundle: true, format: 'esm', platform: 'neutral', outfile: bundlePath,
});
const R = await import('file://' + bundlePath + '?t=' + Date.now());
const { ROSTER, unlockDaysFor } = R;

// collection_paths_sim.mjs 와 «동일한» 아키타입 pace(값을 새로 지어내지 않는다).
// ★ 이 144 는 stages.ts TOTAL_STARS(=48×3) 의 «복제»다. 티어 변경 시 같이 고칠 것.
//   (2026-08-06 백로그 등재 — tools/ 는 런타임 아님, 기준선 도구라 지금은 무접촉)
const AVG_STARS_PER_RUN = 144 / (60 * 25); // 0.096, core 앵커
const RUNS_PER_DAY = { light: 8, core: 25, heavy: 50 };
const ARCHETYPES = {
  light: { challengesPerDay: 0.4, starsPerDay: RUNS_PER_DAY.light * AVG_STARS_PER_RUN },
  core: { challengesPerDay: 1.2, starsPerDay: RUNS_PER_DAY.core * AVG_STARS_PER_RUN },
  heavy: { challengesPerDay: 2.0, starsPerDay: RUNS_PER_DAY.heavy * AVG_STARS_PER_RUN },
};

const specials = ROSTER.filter((c) => c.acquisition === 'condition');

console.log('='.repeat(78));
console.log('[A] SPECIAL 4종 unlockDaysFor() 산출값 (실 로스터 그대로)');
console.log('='.repeat(78));
console.log('id'.padEnd(10) + 'kind'.padEnd(26) + 'target'.padStart(7) +
  'starEq'.padStart(8) + 'light'.padStart(8) + 'core'.padStart(8) + 'heavy'.padStart(8));
for (const s of specials) {
  const u = s.unlock;
  console.log(
    s.id.padEnd(10) + u.kind.padEnd(26) + String(u.target).padStart(7) +
    String(u.starEquivalent ?? '-').padStart(8) +
    Object.keys(ARCHETYPES).map((a) => String(unlockDaysFor(u, ARCHETYPES[a])).padStart(8)).join('')
  );
}

console.log('');
console.log('='.repeat(78));
console.log('[B] 폴백 경로 강제 실행 — 「바뀐 그 줄」을 실제로 통과시키는 대조군');
console.log('    cond.starEquivalent 를 제거 → cond.target * (TOTAL_STARS / 12) 가 구동된다');
console.log('='.repeat(78));
console.log('target'.padStart(7) + 'derivedStars'.padStart(14) +
  'light'.padStart(8) + 'core'.padStart(8) + 'heavy'.padStart(8));
for (const target of [1, 2, 3, 4, 5, 6, 8, 12]) {
  const cond = { kind: 'customization_categories', target }; // starEquivalent 없음 = 폴백
  // 폴백이 만들어낸 별수를 역으로 노출(값이 바뀌면 즉시 드러나게).
  // ★ 이 144 는 stages.ts TOTAL_STARS(=48×3) 의 «복제»다. 티어 변경 시 같이 고칠 것.
  //   (2026-08-06 백로그 등재 — tools/ 는 런타임 아님, 기준선 도구라 지금은 무접촉)
  //   ※ 여기는 roster.ts 의 실제 산식을 «독립 재현»한 기대치라 import 로 바꾸면
  //     대조군이 피검체와 같은 소스를 보게 되어 검증력이 사라진다 — 고칠 때 주의.
  const derivedStars = target * (144 / 12); // 기대치(=12*target). 실제 구동값과 대조용
  console.log(
    String(target).padStart(7) + String(derivedStars).padStart(14) +
    Object.keys(ARCHETYPES).map((a) => String(unlockDaysFor(cond, ARCHETYPES[a])).padStart(8)).join('')
  );
}

console.log('');
console.log('='.repeat(78));
console.log('[C] 나머지 kind 회귀(변경 무관 경로가 안 깨졌는지)');
console.log('='.repeat(78));
const regress = [
  { kind: 'login_streak', target: 30 },
  { kind: 'challenge_count', target: 30 },
  { kind: 'challenge_count', target: 30, dailyCap: 1 },
  { kind: 'stage_stars', target: 57 },
  // ★ 이 144 는 stages.ts TOTAL_STARS(=48×3) 의 «복제»다. 티어 변경 시 같이 고칠 것.
  //   (2026-08-06 백로그 등재 — tools/ 는 런타임 아님, 기준선 도구라 지금은 무접촉)
  //   ※ 단 이 자리는 «회귀 테스트 입력값»("별 만점을 목표로 잡은 케이스")이지
  //     TOTAL_STARS 에서 유도되는 계산값이 아니다. stages_verify.mjs:19 의 기대값과
  //     같은 성격에 가까우니, 고칠 때 「테스트가 뭘 덮고 싶었나」를 먼저 볼 것.
  { kind: 'stage_stars', target: 144 },
];
for (const cond of regress) {
  console.log(
    (cond.kind + '/' + cond.target + (cond.dailyCap ? '/cap' + cond.dailyCap : '')).padEnd(34) +
    Object.keys(ARCHETYPES).map((a) => String(unlockDaysFor(cond, ARCHETYPES[a])).padStart(8)).join('')
  );
}

console.log('');
console.log('확정경제 대조: 1단 완주 light/core/heavy = 75/30/30 은 collection_paths_sim.mjs 소관.');
console.log('이 파일은 unlockDaysFor() 단독 산출값만 본다(A/B 동일성 증명이 목적).');
