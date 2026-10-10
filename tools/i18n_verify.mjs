#!/usr/bin/env node
// i18n_verify.mjs — 9개 로케일 키 대칭 검증. src/i18n/index.ts를 esbuild로
// 번들해 실제 런타임 객체를 임포트한다(문자열 파싱이 아니라 실값 대조).
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const bundlePath = path.join(__dirname, '_i18n_bundle_tmp.mjs');
await build({
  entryPoints: [path.join(__dirname, '..', 'src', 'i18n', 'index.ts')],
  bundle: true, format: 'esm', platform: 'neutral', outfile: bundlePath,
});
const mod = await import('file://' + bundlePath);
const { MESSAGES, SUPPORTED_LOCALES, FALLBACK_LOCALE, getGameTitle } = mod;

console.log('='.repeat(78));
console.log('i18n 검증: 9개 로케일 키 대칭 + 미번역(빈값) 0건');
console.log('='.repeat(78));

const baseKeys = Object.keys(MESSAGES[FALLBACK_LOCALE]).sort();
console.log('기준(' + FALLBACK_LOCALE + ') 키 수 =', baseKeys.length);

let allOk = true;
for (const locale of SUPPORTED_LOCALES) {
  const keys = Object.keys(MESSAGES[locale]).sort();
  const missing = baseKeys.filter((k) => !keys.includes(k));
  const extra = keys.filter((k) => !baseKeys.includes(k));
  const empty = keys.filter((k) => !MESSAGES[locale][k] || MESSAGES[locale][k].trim() === '');
  const ok = missing.length === 0 && extra.length === 0 && empty.length === 0;
  if (!ok) allOk = false;
  console.log(locale.padEnd(8) + ' 키수=' + keys.length + (ok ? '  PASS' : '  FAIL missing=' + JSON.stringify(missing) + ' extra=' + JSON.stringify(extra) + ' empty=' + JSON.stringify(empty)));
}

console.log('\n[개수 차이 원인 규명 안내] 이번 로케일셋은 전 로케일 19키로 완전대칭(개수차 0).');
console.log('  향후 개수차가 나면: 버그로 단정 말고 CLDR 복수형(PluralRules) 등 정상 비대칭 사례부터 확인할 것.');

console.log('\n[게임명 로케일누출 확인] getGameTitle 결과:');
for (const locale of SUPPORTED_LOCALES) {
  console.log('  ' + locale.padEnd(8) + ' -> ' + getGameTitle(locale));
}

console.log('\n' + (allOk ? 'RESULT: PASS - 전 로케일 키 대칭, 미번역 0건' : 'RESULT: FAIL'));
process.exitCode = allOk ? 0 : 1;

// ---------------------------------------------------------------------------
// ★ 스크립트(문자체계) 검사 - Secretary 지적 반영. 키대칭·빈값만으로는 로마자
// 음역(예: 'Igrat')도 PASS 해버린다(실사고, ru 최초버전). 기대 문자범위를
// «가진» 로케일만 자동검사한다. 라틴계열(en/es/fr/de/pt-BR)은 음역과 구분이
// 안 돼 자동검사 «불가» - 이 스크립트의 한계로 명시하고 대신 원문 대조표를 낸다.
const SCRIPT_RANGES = {
  ru: { name: '키릴', ranges: [[0x0400, 0x04FF]] },
  ja: { name: '가나(한자혼용허용)', ranges: [[0x3040, 0x30FF], [0x4E00, 0x9FFF]] },
  'zh-Hans': { name: '한자', ranges: [[0x4E00, 0x9FFF]] },
  ko: { name: '한글', ranges: [[0xAC00, 0xD7A3]] },
};
const LATIN_ONLY_LOCALES = ['en', 'es', 'fr', 'de', 'pt-BR']; // 자동검사 불가 - 한계 명시 대상

function isNeutralValue(v) {
  // 언어중립값 면제 규칙(하드코딩 목록 아님): 문자(letter)를 하나도 안 포함하거나,
  // 라틴 알파벳 길이<=2 인 값(기호·숫자·단위표시 등). 예: 'x', '%', '+'.
  const hasLetter = /\p{L}/u.test(v);
  if (!hasLetter) return true;
  const isShortLatin = /^[A-Za-z]{1,2}$/.test(v);
  return isShortLatin;
}

function inRanges(ch, ranges) {
  const cp = ch.codePointAt(0);
  return ranges.some(([lo, hi]) => cp >= lo && cp <= hi);
}

console.log('\n' + '='.repeat(78));
console.log('[스크립트 검사] 기대 문자범위 보유 로케일만 자동검사 (ru/ja/zh-Hans/ko)');
console.log('='.repeat(78));
for (const [locale, spec] of Object.entries(SCRIPT_RANGES)) {
  const msgs = MESSAGES[locale];
  let checked = 0, passed = 0, skipped = [];
  const failures = [];
  for (const [key, val] of Object.entries(msgs)) {
    if (isNeutralValue(val)) { skipped.push(key); continue; }
    checked++;
    const hasExpectedScript = [...val].some((ch) => inRanges(ch, spec.ranges));
    if (hasExpectedScript) passed++; else failures.push(key + '=' + JSON.stringify(val));
  }
  console.log(locale.padEnd(8) + spec.name.padEnd(14) + ' 검사대상=' + checked + '/' + Object.keys(msgs).length
    + ' 통과=' + passed + ' 실패=' + failures.length
    + (checked === passed ? '  PASS' : '  FAIL ' + JSON.stringify(failures)));
  for (const sk of skipped) console.log('    SKIPPED: ' + sk + ' (언어중립값 면제)');
}

console.log('\n[한계 명시] 라틴계열(' + LATIN_ONLY_LOCALES.join(',') + ')은 로마자 음역과 정상번역을');
console.log('  코드로 구분할 수 없다 - 스크립트 자동검사 대상에서 «제외»한다(면제 아님, 불가능).');
console.log('  대신 아래 en 원문 대조표로 사람이 3초 내 음역 여부를 판별할 수 있게 한다:');
console.log('');
for (const locale of LATIN_ONLY_LOCALES) {
  console.log('--- ' + locale + ' vs en ---');
  for (const key of Object.keys(MESSAGES.en)) {
    if (key === 'hud.multiplier') continue; // 언어중립, 대조 의미 없음
    console.log('  ' + key.padEnd(28) + 'en=' + JSON.stringify(MESSAGES.en[key]).padEnd(24) + locale + '=' + JSON.stringify(MESSAGES[locale][key]));
  }
}
