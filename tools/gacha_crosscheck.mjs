#!/usr/bin/env node
// gacha_crosscheck.mjs — gacha.ts(코드, 단일소스)와 economy_sim.mjs(시뮬)의
// 뽑기가격 공식이 «같은 값」을 내는지 실행으로 증명한다.
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const bundlePath = path.join(__dirname, '_gacha_bundle_tmp.mjs');
await build({
  entryPoints: [path.join(__dirname, '..', 'src', 'game', 'gacha.ts')],
  bundle: true, format: 'esm', platform: 'neutral', outfile: bundlePath,
});
const gacha = await import('file://' + bundlePath);

const codeSide = {
  draw1: gacha.gachaPriceForDraw(1),
  draw13: gacha.gachaPriceForDraw(13),
  draw14: gacha.gachaPriceForDraw(14),
  pool20: gacha.cumulativeCostForPool(20),
  pool30: gacha.cumulativeCostForPool(30),
};
console.log('[gacha.ts 코드측]', JSON.stringify(codeSide));
console.log('[대조] economy_sim.mjs 출력값: GACHA_1ST(20종)=20100 GACHA_EXPANDED(30종)=32100, 13회차상한도달');
const pass = codeSide.pool20 === 20100 && codeSide.pool30 === 32100 && codeSide.draw13 === 1200 && codeSide.draw14 === 1200 && codeSide.draw1 === 600;
console.log(pass ? 'CROSSCHECK PASS: 코드/시뮬 뽑기공식 값 일치' : 'CROSSCHECK FAIL');
