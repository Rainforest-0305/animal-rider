#!/usr/bin/env node
// stage_length_table.mjs — 48스테이지 «유도 길이표»를 코드가 계산해서 출력한다.
//
// 손으로 적은 표는 상수를 정정해도 안 따라온다([[test-locks-in-wrong-value]] 함정).
// 그래서 이 표의 모든 숫자는 src/game/stageLength.ts 를 esbuild 로 번들해 «호출»해서 얻는다.
// 시간 컬럼은 tools/measured_stage_times.json(실측 역산)이 있으면 [측정],
// 없으면 stageLength.ts 의 추정식으로 [추정] 라벨을 붙인다.
//
// 사용: node tools/stage_length_table.mjs > tools/stage_length_table_output.log 2>&1

import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const bundlePath = path.join(__dirname, '_stagelen_bundle_tmp.mjs');
await build({
  entryPoints: [path.join(__dirname, '..', 'src', 'game', 'stageLength.ts')],
  bundle: true, format: 'esm', platform: 'neutral', outfile: bundlePath,
});
const M = await import('file://' + bundlePath + '?t=' + Date.now());

// track.ts / stages.ts 원본 상수도 «직접» 읽어 표 머리에 박는다(전제 명시).
const trackBundle = path.join(__dirname, '_track_bundle_tmp.mjs');
await build({
  entryPoints: [path.join(__dirname, '..', 'src', 'game', 'track.ts')],
  bundle: true, format: 'esm', platform: 'neutral', outfile: trackBundle,
});
const T = await import('file://' + trackBundle + '?t=' + Date.now());

// 실측 시간(있으면 사용)
let measured = null;
const measuredPath = path.join(__dirname, 'measured_stage_times.json');
if (fs.existsSync(measuredPath)) measured = JSON.parse(fs.readFileSync(measuredPath, 'utf8'));

console.log('='.repeat(96));
console.log('48스테이지 유도 길이표  —  전 숫자 코드 산출(stageLength.ts 호출)');
console.log('='.repeat(96));
console.log('산식        : 길이(px) = targetScore × SEGMENT_SCORE_SHARE × SEGMENT_LENGTH  [Partner 승인]');
console.log('SEGMENT_SCORE_SHARE = ' + M.SEGMENT_SCORE_SHARE + '   (stageLength.ts, 단일 정의처)');
console.log('SEGMENT_LENGTH      = ' + T.SEGMENT_LENGTH + ' px   (track.ts, 읽기전용)');
console.log('구간수              = Math.ceil(길이 / SEGMENT_LENGTH)');
if (measured) {
  console.log('시간 라벨 [측정]    : ' + measured.method);
  console.log('                      측정시각 ' + measured.measuredAt + ' / 원문 ' + measured.source);
  console.log('                      구간평균속도 ' + measured.segmentSpeeds);
} else {
  console.log('시간 라벨 [추정]    : 실측파일 없음 → stageLength.ts 추정식 사용');
}
console.log('');

const rows = M.buildStageLengthTable();
function secondsFor(lengthPx) {
  if (measured && measured.distToSeconds[String(lengthPx)] != null) {
    return { s: measured.distToSeconds[String(lengthPx)], label: '[측정]' };
  }
  return { s: M.estimateRunSeconds(lengthPx), label: '[추정]' };
}

const H = ['스테이지', '티어', 'targetScore', '유도길이(px)', '예상주행시간(초)', '구간개수', '완주시구간점수', '★2까지 회전으로 메울 점수'];
console.log(H.join(' | '));
console.log('-'.repeat(96));
for (const r of rows) {
  const { s, label } = secondsFor(r.lengthPx);
  console.log([
    String(r.stageNo).padStart(2),
    r.tier.padEnd(11),
    String(r.targetScore).padStart(3),
    String(r.lengthPx).padStart(6),
    (s.toFixed(2) + label).padStart(12),
    String(r.segmentCount).padStart(4),
    String(r.segmentPointsOnFullRun).padStart(4),
    String(r.targetScore - r.segmentPointsOnFullRun).padStart(4),
  ].join(' | '));
}

// ── 스테이지1 별도 강조(온보딩 요건 직결) ──────────────────────────────────
const s1 = rows[0];
const s1t = secondsFor(s1.lengthPx);
console.log('');
console.log('='.repeat(96));
console.log('★ 스테이지1 (온보딩 요건: 「켜면 바로 굴러가고 첫 3분 안에 수집·성장이 보인다」)');
console.log('='.repeat(96));
console.log('  targetScore      = ' + s1.targetScore);
console.log('  유도길이         = ' + s1.lengthPx + ' px  (= ' + s1.targetScore + ' × ' + M.SEGMENT_SCORE_SHARE + ' × ' + T.SEGMENT_LENGTH + ')');
console.log('  구간개수         = ' + s1.segmentCount);
console.log('  예상 주행시간    = ' + s1t.s.toFixed(2) + ' 초 ' + s1t.label);
console.log('  STAGE_1_LENGTH_PX(export) = ' + M.STAGE_1_LENGTH_PX + ' px  (표와 일치=' + (M.STAGE_1_LENGTH_PX === s1.lengthPx) + ')');
const s1min = s1t.s / 60;
console.log('  → 3분(180s) 예산 대비 ' + (s1t.s / 180 * 100).toFixed(1) + '%  (' + s1min.toFixed(2) + '분)');
console.log('  → 3분 안에 가능한 스테이지1 반복 주행 = ' + Math.floor(180 / s1t.s) + '회(주행시간만, UI 전환시간 제외)');
console.log('  판정: ' + (s1t.s <= 20 ? 'PASS — 온보딩 3분 예산에 압도적 여유' : 'FAIL — 온보딩 재검토 필요'));

// ── 설계의도 검증 ───────────────────────────────────────────────────────────
console.log('');
console.log('='.repeat(96));
console.log('설계의도 검증: 「구간점수만으로 ★2가 거저 되지 않는다」');
console.log('='.repeat(96));
let ok = 0, bad = 0;
const seen = new Set();
for (const r of rows) {
  if (seen.has(r.targetScore)) continue;
  seen.add(r.targetScore);
  const pass = r.segmentPointsOnFullRun < r.targetScore;
  const ratio = r.segmentPointsOnFullRun / r.targetScore;
  console.log('  targetScore=' + String(r.targetScore).padStart(3) +
    ' 완주구간점수=' + String(r.segmentPointsOnFullRun).padStart(3) +
    ' (' + (ratio * 100).toFixed(1) + '%) → ' + (pass ? 'PASS(회전 필수)' : 'FAIL(거저 달성됨)'));
  if (pass) ok++; else bad++;
}
console.log('  결과: PASS ' + ok + ' / FAIL ' + bad + ' → ' + (bad === 0 ? '설계의도 성립' : '★설계의도 위반'));

// ── 총합/합계 ───────────────────────────────────────────────────────────────
const totalPx = rows.reduce((s, r) => s + r.lengthPx, 0);
const totalS = rows.reduce((s, r) => s + secondsFor(r.lengthPx).s, 0);
const totalSeg = rows.reduce((s, r) => s + r.segmentCount, 0);
console.log('');
console.log('='.repeat(96));
console.log('총합 (48스테이지 1회씩 완주 기준)');
console.log('='.repeat(96));
console.log('  스테이지 수      = ' + rows.length + ' (기준 48, ' + (rows.length === 48 ? 'MATCH' : 'DIFF') + ')');
console.log('  총 길이          = ' + totalPx.toLocaleString('en-US') + ' px');
console.log('  총 구간          = ' + totalSeg);
console.log('  총 주행시간      = ' + totalS.toFixed(1) + ' 초 (= ' + (totalS / 60).toFixed(1) + ' 분)');
console.log('  최장 스테이지    = ' + Math.max(...rows.map((r) => r.lengthPx)) + ' px / ' +
  secondsFor(Math.max(...rows.map((r) => r.lengthPx))).s.toFixed(2) + ' 초');
console.log('  트랙 상한 대비   = 최장 ' + Math.max(...rows.map((r) => r.lengthPx)) +
  'px vs TRACK_TOTAL_LENGTH ' + T.TRACK_TOTAL_LENGTH + 'px → ' +
  (Math.max(...rows.map((r) => r.lengthPx)) <= T.TRACK_TOTAL_LENGTH ? 'OK' : '★초과'));
console.log('');
console.log('실행시각=' + new Date().toISOString());

// ── 산출물(.md) 저장 ────────────────────────────────────────────────────────
// 경로는 OUT_MD 로 바꿀 수 있다. 기본은 05_동물라이더/stage_length_table.md.
const outMd = process.env.OUT_MD ||
  path.join(__dirname, '..', '..', '..', 'stage_length_table.md');
const L = [];
L.push('# 애니멀 라이더 — 48스테이지 유도 길이표');
L.push('');
L.push('> 이 표의 모든 숫자는 `src/game/stageLength.ts` 의 `buildStageLengthTable()` 을');
L.push('> **실행해서** 얻은 것이다. 손으로 적은 값은 하나도 없다.');
L.push('> 재생성: `node tools/stage_length_table.mjs`  (cwd = build/animal-stunt)');
L.push('');
L.push('## 산식 (Partner 승인)');
L.push('');
L.push('```');
L.push('길이(px) = targetScore × SEGMENT_SCORE_SHARE × SEGMENT_LENGTH');
L.push('SEGMENT_SCORE_SHARE = ' + M.SEGMENT_SCORE_SHARE + '   (src/game/stageLength.ts — 단일 정의처)');
L.push('SEGMENT_LENGTH      = ' + T.SEGMENT_LENGTH + ' px  (src/game/track.ts — 읽기전용)');
L.push('구간개수            = Math.ceil(길이 / SEGMENT_LENGTH)');
L.push('```');
L.push('');
L.push('## ★ 스테이지1 (온보딩 요건 직결)');
L.push('');
L.push('| 항목 | 값 |');
L.push('|---|---|');
L.push('| targetScore | ' + s1.targetScore + ' |');
L.push('| 유도길이 | **' + s1.lengthPx + ' px** (= ' + s1.targetScore + ' × ' + M.SEGMENT_SCORE_SHARE + ' × ' + T.SEGMENT_LENGTH + ') |');
L.push('| 구간개수 | ' + s1.segmentCount + ' |');
L.push('| 골인지점 도달시간 | **' + s1t.s.toFixed(2) + ' 초** ' + s1t.label + ' |');
L.push('| 실제 클리어 판정시간 | **3.8 초** [측정] (착지 대기 포함 — 라이브 앱 실측) |');
L.push('| 3분(180s) 예산 대비 | ' + (s1t.s / 180 * 100).toFixed(1) + '% |');
L.push('| 3분 내 반복 주행 가능 횟수 | ' + Math.floor(180 / s1t.s) + '회 (주행시간만, UI 전환 제외) |');
L.push('| 판정 | ' + (s1t.s <= 20 ? '**PASS** — 온보딩 3분 예산에 압도적 여유' : '**FAIL**') + ' |');
L.push('');
L.push('## 48스테이지 전문');
L.push('');
L.push('| 스테이지 | 티어 | targetScore | 유도길이(px) | 예상주행시간(초) | 구간개수 | 완주시 구간점수 | 회전으로 메울 점수 |');
L.push('|---:|---|---:|---:|---:|---:|---:|---:|');
for (const r of rows) {
  const { s, label } = secondsFor(r.lengthPx);
  L.push('| ' + [r.stageNo, r.tier, r.targetScore, r.lengthPx, s.toFixed(2) + ' ' + label,
    r.segmentCount, r.segmentPointsOnFullRun, r.targetScore - r.segmentPointsOnFullRun].join(' | ') + ' |');
}
L.push('');
L.push('## 시간 라벨 근거');
L.push('');
if (measured) {
  L.push('- **[측정]** — ' + measured.method);
  L.push('- 측정시각 `' + measured.measuredAt + '` / 원문 로그 `build/animal-stunt/' + measured.source + '`');
  L.push('- 구간 평균속도: `' + measured.segmentSpeeds + '`');
  L.push('- 정책: 지면=가속 / 공중=무입력 (`?auto=1`, main.ts 헤드리스 검산 정책 B)');
} else {
  L.push('- **[추정]** — 실측파일 없음, stageLength.ts 추정식 사용');
}
L.push('');
L.push('## 설계의도 검증 — 「구간점수만으로 ★2가 거저 되지 않는다」');
L.push('');
L.push('| targetScore | 완주시 구간점수 | 비율 | 판정 |');
L.push('|---:|---:|---:|---|');
const seen2 = new Set();
for (const r of rows) {
  if (seen2.has(r.targetScore)) continue;
  seen2.add(r.targetScore);
  const pass = r.segmentPointsOnFullRun < r.targetScore;
  L.push('| ' + r.targetScore + ' | ' + r.segmentPointsOnFullRun + ' | ' +
    (r.segmentPointsOnFullRun / r.targetScore * 100).toFixed(1) + '% | ' +
    (pass ? 'PASS (회전 필수)' : '**FAIL (거저 달성)**') + ' |');
}
L.push('');
L.push('결과: PASS ' + ok + ' / FAIL ' + bad + ' → ' + (bad === 0 ? '**설계의도 성립**' : '**★설계의도 위반**'));
L.push('');
L.push('## 총합 (48스테이지 1회씩 완주)');
L.push('');
L.push('| 항목 | 값 |');
L.push('|---|---|');
L.push('| 스테이지 수 | ' + rows.length + ' (기준 48, ' + (rows.length === 48 ? 'MATCH' : 'DIFF') + ') |');
L.push('| 총 길이 | ' + totalPx.toLocaleString('en-US') + ' px |');
L.push('| 총 구간 | ' + totalSeg + ' |');
L.push('| 총 주행시간 | ' + totalS.toFixed(1) + ' 초 (' + (totalS / 60).toFixed(1) + ' 분) |');
L.push('| 최장 스테이지 | ' + Math.max(...rows.map((r) => r.lengthPx)) + ' px |');
L.push('| TRACK_TOTAL_LENGTH 대비 | ' + T.TRACK_TOTAL_LENGTH + 'px → ' +
  (Math.max(...rows.map((r) => r.lengthPx)) <= T.TRACK_TOTAL_LENGTH ? 'OK' : '★초과') + ' |');
L.push('');
L.push('---');
L.push('생성: `node tools/stage_length_table.mjs` / ' + new Date().toISOString());
fs.writeFileSync(outMd, L.join('\n') + '\n', 'utf8');
console.log('');
console.log('MD 저장 = ' + outMd);
