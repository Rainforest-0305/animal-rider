#!/usr/bin/env node
// measure_stage_times.mjs — 라이더 worldX(t) 곡선 «실측» → 스테이지 유도길이의 도달시간 역산.
//
// 왜 단일 평균속도로 나누지 않는가:
//   초반 가속 구간 때문에 평균속도가 시간에 따라 크게 변한다(실측 ff=2s 815px/s vs
//   ff=45s 1449px/s, 1.8배). 스테이지1(4200px)은 «전부 가속 구간»이라 장시간 평균으로
//   나누면 시간이 과소평가된다. 그래서 worldX(t)를 촘촘히 재고 거리→시간으로 역산한다.
//
// 관측 경로: window.__debug (main.ts 가 «항상» 유지한다고 명시한 자동검증용 계약).
//   HUD 텍스트는 ?debug=1 일 때만 화면에 나오므로 DOM 텍스트를 읽으면 안 된다.
// URL 훅: ?auto=1(지면가속/공중무입력) & ff=t(고정dt 1/60 로 t초 선진행) & freeze=1(이후 정지).
//
// 대상 거리는 src/game/stageLength.ts 를 esbuild 로 번들해 «코드가 계산한» 값을 쓴다
// (숫자를 이 스크립트에 다시 적지 않는다 - 상수 정정 시 표가 썩는 걸 막는다).
//
// 사용: node tools/measure_stage_times.mjs > tools/stage_times_output.log 2>&1

import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

// npx 캐시에 playwright 1.48.2(browsers 미설치)와 1.62.1 이 둘 다 있다.
// chromium-1234 가 설치된 «1.62.1» 을 명시적으로 집는다(1.48.2 는 chromium-1140 을 찾다 실패).
const PW = 'file:///C:/Users/USER/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';
const BASE = process.env.BASE_URL || 'http://localhost:5183';
const T_MAX = Number(process.env.T_MAX || 26); // 최장 스테이지(30800px)는 ~21.5s 실측 → 26s 면 덮는다
const T_STEP = Number(process.env.T_STEP || 0.25);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, '..', 'src');

// ── 측정 대상 거리(코드가 계산) ─────────────────────────────────────────────
const bundlePath = path.join(__dirname, '_stagelen_bundle_tmp.mjs');
await build({
  entryPoints: [path.join(SRC, 'game', 'stageLength.ts')],
  bundle: true, format: 'esm', platform: 'neutral', outfile: bundlePath,
});
const mod = await import('file://' + bundlePath + '?t=' + Date.now());
const targets = [...new Set(mod.buildStageLengthTable().map((r) => r.lengthPx))].sort((a, b) => a - b);
console.log('대상 유도길이(px, stageLength.ts 가 계산) = ' + targets.join(', '));

// ── 측정 시점의 소스 mtime(다른 라인이 물리/메인을 편집 중이면 측정이 흔들린다) ──
function mt(rel) {
  const p = path.join(SRC, rel);
  return rel + ' ' + fs.statSync(p).mtime.toISOString();
}
const mtimesBefore = ['main.ts', 'game/physics.ts', 'game/track.ts'].map(mt);
console.log('측정 시작 시 소스 mtime:');
for (const m of mtimesBefore) console.log('  ' + m);

// ── 측정 ────────────────────────────────────────────────────────────────────
const { chromium } = await import(PW);
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();

async function sample(tt) {
  // 간헐 실패(HMR 리로드 등)는 «측정 실패»이지 게임 문제가 아니다 → 재시도.
  let last = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await page.goto(`${BASE}/?auto=1&ff=${tt}&freeze=1`, { waitUntil: 'load', timeout: 30000 });
      await page.waitForFunction(
        () => !!window.__debug && typeof window.__debug.worldX === 'number',
        null, { timeout: 30000 }
      );
      return await page.evaluate(() => {
        const s = window.__debug;
        return {
          worldX: s.worldX, vx: s.vx, crashed: s.crashed,
          liftoffs: s.liftoffs, padLaunches: s.padLaunches, frame: s.frame,
        };
      });
    } catch (e) {
      last = e;
      console.log(`  (t=${tt} 시도${attempt} 실패: ${e.name})`);
    }
  }
  throw last;
}

const curve = [{ t: 0, x: 0, vx: 0, crashed: false }];
let aborted = null;
console.log('');
console.log('worldX(t) 실측:');
console.log(['t(s)', 'worldX(px)', 'vx', 'crashed', 'liftoffs', 'pads'].join('\t'));
for (let t = T_STEP; t <= T_MAX + 1e-9; t = Number((t + T_STEP).toFixed(4))) {
  const tt = Number(t.toFixed(2));
  let s;
  try {
    s = await sample(tt);
  } catch {
    aborted = tt;
    break;
  }
  curve.push({ t: tt, x: s.worldX, vx: s.vx, crashed: s.crashed });
  console.log([tt, s.worldX.toFixed(0), s.vx.toFixed(0), s.crashed, s.liftoffs, s.padLaunches].join('\t'));
  if (s.crashed) { console.log('★ crash 발생 — 이후 측정 중단'); break; }
}
await ctx.close();
await browser.close();
if (aborted !== null) console.log('★ 측정 중단 t=' + aborted + 's (그 이전 곡선으로 역산 진행)');

const mtimesAfter = ['main.ts', 'game/physics.ts', 'game/track.ts'].map(mt);
const drifted = mtimesBefore.join('|') !== mtimesAfter.join('|');
console.log('');
console.log('측정 종료 시 소스 mtime 변화 = ' + (drifted ? '★DRIFT(측정 중 소스가 바뀜 - 재측정 필요)' : '없음(측정 유효)'));
for (const m of mtimesAfter) console.log('  ' + m);

// ── 역산 ────────────────────────────────────────────────────────────────────
let mono = true;
for (let i = 1; i < curve.length; i++) if (curve[i].x < curve[i - 1].x) mono = false;
console.log('');
console.log('worldX(t) 단조증가 = ' + (mono ? 'OK' : 'VIOLATION(역산 불가)'));

function timeAt(distance) {
  for (let i = 1; i < curve.length; i++) {
    if (curve[i].x >= distance) {
      const a = curve[i - 1], b = curve[i];
      const f = (distance - a.x) / (b.x - a.x);
      return a.t + f * (b.t - a.t);
    }
  }
  return NaN; // 측정 범위 밖
}

console.log('');
console.log('='.repeat(78));
console.log('거리 → 도달시간 역산 [측정]');
console.log('='.repeat(78));
console.log(['길이(px)', '도달시간(s)', '구간평균속도(px/s)'].join('\t'));
const out = {};
for (const d of targets) {
  const t = timeAt(d);
  out[d] = Number.isFinite(t) ? Number(t.toFixed(3)) : null;
  console.log([
    d,
    Number.isFinite(t) ? t.toFixed(2) : 'OUT_OF_RANGE',
    Number.isFinite(t) ? (d / t).toFixed(1) : '-',
  ].join('\t'));
}

// 참고: 구간별 순간속도 요약(가속 프로파일 근거)
const seg = (a, b) => {
  const pts = curve.filter((p) => p.t >= a && p.t <= b);
  if (pts.length < 2) return '-';
  const first = pts[0], last = pts[pts.length - 1];
  return ((last.x - first.x) / (last.t - first.t)).toFixed(1);
};
console.log('');
console.log('구간 평균속도(px/s): 0~2s=' + seg(0, 2) + '  2~5s=' + seg(2, 5) +
  '  5~10s=' + seg(5, 10) + '  10~20s=' + seg(10, 20) + '  20~' + T_MAX + 's=' + seg(20, T_MAX));

console.log('');
console.log('JSON_DIST_TO_SECONDS=' + JSON.stringify(out));
console.log('실행시각=' + new Date().toISOString());
