#!/usr/bin/env node
// stages_verify.mjs — 48스테이지/144별 총합 검증 + 회전목표 실현가능성 확인.
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const bundlePath = path.join(__dirname, '_stages_bundle_tmp.mjs');
await build({
  entryPoints: [path.join(__dirname, '..', 'src', 'game', 'stages.ts')],
  bundle: true, format: 'esm', platform: 'neutral', outfile: bundlePath,
});
const { TIERS, TOTAL_STAGES, TOTAL_STARS, TIER_GATES, judgeStars } = await import('file://' + bundlePath);

console.log('='.repeat(78));
console.log('48스테이지 6구간 검증');
console.log('='.repeat(78));
console.log('TOTAL_STAGES=' + TOTAL_STAGES + ' (기준 48, ' + (TOTAL_STAGES === 48 ? 'MATCH' : 'DIFF') + ')');
console.log('TOTAL_STARS=' + TOTAL_STARS + ' (기준 144, ' + (TOTAL_STARS === 144 ? 'MATCH' : 'DIFF') + ')');

console.log('\n티어별 구성 + 회전목표 실현가능성(실측상한 1.09/도약 기준):');
for (const t of TIERS) {
  const jumpsNeeded = Math.ceil(t.targetRotationsCumulative / 1.09);
  const feasible = t.launchPadCount >= jumpsNeeded;
  console.log(
    t.tier.padEnd(12) + '스테이지=' + String(t.stageCount).padStart(2) +
    ' 목표점수=' + String(t.targetScore).padStart(3) +
    ' 목표회전(누적)=' + t.targetRotationsCumulative +
    ' 필요도약수=' + jumpsNeeded +
    ' 배치도약대=' + t.launchPadCount +
    '  ' + (feasible ? 'FEASIBLE(여유' + (t.launchPadCount - jumpsNeeded) + ')' : 'INFEASIBLE - 상신필요')
  );
}

console.log('\n티어 해금 게이트:');
for (const g of TIER_GATES) console.log('  ' + g.tier.padEnd(12) + '요구별=' + g.requiredStars);

console.log('\n★1/★2/★3 판정 함수 표본 테스트:');
const easy = TIERS[0];
console.log('  실패(미도달):', JSON.stringify(judgeStars(easy, 0, 0, 0, false)));
console.log('  도달만(★1):', JSON.stringify(judgeStars(easy, 5, 0, 0, true)));
console.log('  목표점수달성(★2):', JSON.stringify(judgeStars(easy, 12, 0, 1, true)));
console.log('  완벽(★3):', JSON.stringify(judgeStars(easy, 15, 1, 0, true)));
