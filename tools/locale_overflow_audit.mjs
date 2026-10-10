#!/usr/bin/env node
/* locale_overflow_audit.mjs — 9개 로케일 × 데스크톱/모바일 전 화면 넘침·잘림 전수점검.
 *
 * 실행:
 *   node tools/locale_overflow_audit.mjs > tools/locale_audit_out/run.log 2>&1 ; echo "EXIT=$?"
 * 옵션:
 *   --locales=ko,de       (기본: src/i18n 의 SUPPORTED_LOCALES 전량)
 *   --screens=roster      (기본: none,stages,roster,gacha,clear)
 *   --viewports=mobile    (기본: desktop,mobile)
 *   --no-draws            가챠 뽑기 루프 생략(빠른 재실행용)
 *   --keep                하네스/번들 산출물 유지(디버깅용)
 *
 * ★ 하드코딩 없음 — 재실행 안정성의 핵심:
 *   · 로케일 목록 = src/i18n 의 SUPPORTED_LOCALES 를 번들해서 «읽는다».
 *   · 종 목록/등급/이름 = src/game/roster.ts 의 ROSTER 를 번들해서 «읽는다».
 *     8종이든 24종이든 40종이든 이 파일을 고칠 필요가 없다.
 *   · 화면 요소도 «렌더된 DOM 전수»를 훑는다(선택자 화이트리스트 없음).
 *   따라서 roster.ts 에 종이 추가되면 그대로 재실행만 하면 된다.
 *
 * ★ 측정주체 = 실제 Chrome 렌더엔진. 문자폭 추정모델이 아니다.
 *   조건·한계·면제(SKIPPED)는 리포트 말미에 전부 출력한다.
 */
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'locale_audit_out');
const T0 = Date.now();

const ARGV = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] ?? '1'] : [a, '1'];
  })
);

fs.mkdirSync(OUT, { recursive: true });

const log = (...a) => console.log(...a);
const hr = (c = '=') => log(c.repeat(96));

// ───────────────────────────────────────────────────────────────────────────
// 1) 정본 소스에서 «사실»을 읽어온다(하드코딩 금지 지점)
// ───────────────────────────────────────────────────────────────────────────
const factsEntry = path.join(OUT, '_facts_entry.ts');
fs.writeFileSync(
  factsEntry,
  [
    "export { SUPPORTED_LOCALES, FALLBACK_LOCALE } from '../../src/i18n';",
    "export { ROSTER, GACHA_POOL, CONDITION_POOL } from '../../src/game/roster';",
    "export { UI_MESSAGES } from '../../src/ui/uiStrings';",
    "export { TOTAL_STAGES, TOTAL_STARS } from '../../src/game/stages';",
  ].join('\n'),
  'utf8'
);
await build({
  entryPoints: [factsEntry],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  outfile: path.join(OUT, '_facts.mjs'),
  logLevel: 'error',
});
const FACTS = await import('file://' + path.join(OUT, '_facts.mjs'));
const LOCALES = ARGV.locales ? ARGV.locales.split(',') : [...FACTS.SUPPORTED_LOCALES];
const ROSTER = FACTS.ROSTER;
const GACHA_POOL = FACTS.GACHA_POOL;

// ───────────────────────────────────────────────────────────────────────────
// 2) 하네스 빌드(제품 UI 를 그대로 태운다 — 별도 목업 아님)
// ───────────────────────────────────────────────────────────────────────────
await build({
  entryPoints: [path.join(ROOT, 'src', 'ui', '_devtest.ts')],
  bundle: true,
  format: 'iife',
  target: ['chrome110'],
  outfile: path.join(OUT, 'devtest.js'),
  logLevel: 'error',
});
fs.copyFileSync(path.join(__dirname, 'locale_audit_probe.js'), path.join(OUT, 'probe.js'));

const devtestHtml = fs.readFileSync(path.join(ROOT, 'src', 'ui', '_devtest.html'), 'utf8');
const harnessHtml = devtestHtml
  .replace('<script type="module" src="./_devtest.ts"></script>',
           '<script src="./devtest.js"></script>\n<script src="./probe.js"></script>');
if (harnessHtml === devtestHtml) throw new Error('harness 스크립트 치환 실패 — _devtest.html 구조가 바뀌었다');
fs.writeFileSync(path.join(OUT, 'harness.html'), harnessHtml, 'utf8');

// ───────────────────────────────────────────────────────────────────────────
// 3) 정적 서버(file:// 는 스크립트/CORS 제약이 있어 로컬 http 로 띄운다)
// ───────────────────────────────────────────────────────────────────────────
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  const f = path.join(OUT, p === '/' ? 'harness.html' : p.replace(/^\/+/, ''));
  if (!f.startsWith(OUT) || !fs.existsSync(f)) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
  res.end(fs.readFileSync(f));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const PORT = server.address().port;
const BASE = `http://127.0.0.1:${PORT}/harness.html`;

// ───────────────────────────────────────────────────────────────────────────
// 4) Chrome 헤드리스 + CDP(의존성 추가 없음 — Node 내장 WebSocket 사용)
// ───────────────────────────────────────────────────────────────────────────
function findChrome() {
  const cands = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  ].filter(Boolean);
  for (const c of cands) if (fs.existsSync(c)) return c;
  throw new Error('Chrome/Edge 실행파일을 못 찾았다 — CHROME_PATH 로 지정하라');
}
const CHROME = findChrome();
const PROFILE = fs.mkdtempSync(path.join(os.tmpdir(), 'ar-audit-'));
const DPORT = 9000 + (process.pid % 900);
const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${DPORT}`,
  `--user-data-dir=${PROFILE}`,
  '--no-first-run', '--no-default-browser-check', '--disable-extensions',
  '--disable-background-networking', '--disable-sync', '--mute-audio',
  '--disable-features=Translate,MediaRouter',
  // 헤드리스에서 창이 «가려진» 것으로 판정되면 rAF/타이머가 멈춘다 → 측정이 멎는다.
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  '--disable-background-timer-throttling',
  'about:blank',
], { stdio: 'ignore' });

async function waitTarget() {
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${DPORT}/json/list`);
      const list = await r.json();
      const page = list.find((t) => t.type === 'page');
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch { /* 아직 안 떴다 */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('CDP 타깃을 못 잡았다');
}
const wsUrl = await waitTarget();

class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map(); this.handlers = new Map();
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id != null) {
        const p = this.pending.get(m.id); this.pending.delete(m.id);
        if (!p) return;
        m.error ? p.rej(new Error(m.method + ' ' + JSON.stringify(m.error))) : p.res(m.result);
      } else {
        (this.handlers.get(m.method) || []).forEach((h) => h(m.params));
      }
    });
  }
  on(method, fn) {
    if (!this.handlers.has(method)) this.handlers.set(method, []);
    this.handlers.get(method).push(fn);
  }
  once(method) {
    return new Promise((res) => {
      const h = (p) => { const arr = this.handlers.get(method); arr.splice(arr.indexOf(h), 1); res(p); };
      this.on(method, h);
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((res, rej) => {
      this.pending.set(id, { res, rej });
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); rej(new Error('CDP timeout: ' + method)); } }, 30000);
    });
  }
}
const ws = new WebSocket(wsUrl);
await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
const cdp = new CDP(ws);
await cdp.send('Page.enable');
await cdp.send('Runtime.enable');
await cdp.send('DOM.enable');
await cdp.send('CSS.enable');
const pageErrors = [];
cdp.on('Runtime.exceptionThrown', (p) => pageErrors.push(p?.exceptionDetails?.text + ' ' + (p?.exceptionDetails?.exception?.description || '')));

// ───────────────────────────────────────────────────────────────────────────
// 5) 점검 매트릭스
// ───────────────────────────────────────────────────────────────────────────
// ★ 커버리지 자가심문으로 추가된 뷰포트:
//   styles.ts 의 @media (min-height:760px) 는 패널을 «화면 중앙»으로 바꾼다.
//   1280x800 / 390x844 만 돌리면 그 «미만» 분기(하단 시트)는 한 번도 안 타본다.
//   그래서 640/390 높이 두 종을 넣어 두 분기를 다 지나가게 한다.
//   @media (max-width:430px) 분기도 mobile/short 가 탄다.
const VIEWPORTS = {
  desktop: { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false },
  mobile: { width: 390, height: 844, deviceScaleFactor: 3, mobile: true },
  short: { width: 360, height: 640, deviceScaleFactor: 3, mobile: true },
  landscape: { width: 844, height: 390, deviceScaleFactor: 3, mobile: true },
};
/** 화면이 «정말 그 화면인지» 확인할 근거 요소(없으면 그 실행의 PASS 는 무효). */
const EVIDENCE = {
  none: '.ar-toast',
  stages: '.ar-tile',
  roster: '.ar-crit',
  gacha: '.ar-card',
  clear: '.ar-clear',
};
const VP_NAMES = ARGV.viewports ? ARGV.viewports.split(',') : Object.keys(VIEWPORTS);

// 시드 2종: «초기»(0 진행)와 «후반»(전부 채움). 최장 문자열은 양쪽에 갈려 있다
// (초기=보석부족/미보유, 후반=완주!/전부모았어요/세자리 숫자).
const SEEDS = {
  early: { stars: 0, gems: 0, owned: 0, login: 0, challenge: 0, custom: 0 },
  late: { stars: 9999, gems: 999999, owned: 999, login: 999, challenge: 999, custom: 9 },
  // ★ 'mid' 는 커버리지 실증이 «찾아낸» 구멍을 메우려고 추가했다(추측 아님).
  //   early = 보석 0     → 뽑기 불가 → HUD 가챠버튼이 ghost
  //   late  = 전종 보유  → 풀 완주   → 역시 ghost
  //   즉 두 시드 어디서도 «뽑을 수 있는» 상태(주황 강조 .ar-btn.gacha)가 안 나왔다.
  //   실측: button.ar-btn.gacha 면제 378회 / 측정 0회 = 진짜 사각지대였다.
  //   보석은 넉넉하고 미보유 종이 남은 중간 상태를 만들어 그 분기를 태운다.
  mid: { stars: 60, gems: 99999, owned: 3, login: 10, challenge: 5, custom: 2 },
};
const SCREENS = ARGV.screens ? ARGV.screens.split(',') : ['none', 'stages', 'roster', 'gacha', 'clear'];

function urlFor(locale, screen, seedName) {
  const s = SEEDS[seedName];
  const q = new URLSearchParams({
    locale, stars: s.stars, gems: s.gems, owned: s.owned,
    login: s.login, challenge: s.challenge, custom: s.custom,
    hintms: '600000', // 토스트가 측정 «전에» 사라지지 않게 고정(재현성)
  });
  if (screen !== 'none') q.set('screen', screen);
  return `${BASE}?${q}`;
}

async function evalJs(expr, awaitPromise = false) {
  const r = await cdp.send('Runtime.evaluate', {
    expression: expr, returnByValue: true, awaitPromise,
  });
  if (r.exceptionDetails) throw new Error('page eval: ' + JSON.stringify(r.exceptionDetails).slice(0, 400));
  return r.result.value;
}

const RUNS = [];
const EVIDENCE_FAILS = [];
let loadCount = 0;

async function visit(locale, screen, seedName, vpName, record = true) {
  const vp = VIEWPORTS[vpName];
  await cdp.send('Emulation.setDeviceMetricsOverride', vp);
  // 뽑기 연출을 «동기»로 만들어 결정적으로 잰다(reduced-motion 경로는 제품 코드에 이미 있다).
  await cdp.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
  process.stderr.write(`  · ${vpName}/${locale}/${screen}/${seedName}\n`);
  const loaded = cdp.once('Page.loadEventFired');
  await cdp.send('Page.navigate', { url: urlFor(locale, screen, seedName) });
  await loaded;
  loadCount++;
  // ★ 400ms 인 이유(추측 아님, 실측): 메타 화면을 열면 안내 토스트가 dismiss 되는데
  //   실제 DOM 제거는 260ms 뒤 타이머다(onboarding.ts). 180ms 에 재면 토스트가
  //   «있을 때도 없을 때도» 있어 같은 조건인데 요소 수가 6개씩 흔들렸다
  //   (실측: 1550/1556/1562 로 갈림). 제거가 끝난 뒤에 잰다.
  await evalJs('window.__settle(400)', true);
  // ★ 자기검증: 재기 «전에» 그 화면의 근거 요소가 실제로 프레임에 있는지 본다.
  //   요소가 0개라 결함 0 인 «빈 화면 PASS» 가 가장 흔한 거짓 통과다.
  const ev = await evalJs(`window.__evidence(${JSON.stringify(EVIDENCE[screen] || '.ar-root')})`);
  const a = await evalJs('window.__audit()');
  a.locale = locale; a.screen = screen; a.seed = seedName; a.viewport = vpName;
  a.evidence = ev;
  if (!ev.ok) EVIDENCE_FAILS.push(`${vpName}/${locale}/${screen}/${seedName} — ${ev.selector} 0개`);
  if (record) RUNS.push(a);
  return a;
}

/** 실제로 어떤 «물리 폰트»가 글자를 그렸는지 — 측정조건 진술용(두부글자 판별). */
async function platformFonts(selector) {
  try {
    const { root } = await cdp.send('DOM.getDocument', { depth: -1 });
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector });
    if (!nodeId) return null;
    const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });
    return fonts.map((f) => `${f.familyName}×${f.glyphCount}`).join(', ');
  } catch { return null; }
}

// ───────────────────────────────────────────────────────────────────────────
// 6) 실행
// ───────────────────────────────────────────────────────────────────────────
hr();
log('애니멀 라이더 — 로케일 전수 레이아웃 점검 (넘침·잘림)');
log('실행시각    :', new Date().toISOString(), '/ KST', new Date(Date.now() + 9 * 3600e3).toISOString().replace('T', ' ').slice(0, 19));
log('측정엔진    :', CHROME);
log('로케일      :', LOCALES.join(', '), `(${LOCALES.length}개, src/i18n/SUPPORTED_LOCALES 에서 «읽음»)`);
log('로스터      :', `${ROSTER.length}종 (가챠풀 ${GACHA_POOL.length} / 조건해금 ${ROSTER.length - GACHA_POOL.length})`);
log('  등급구성  :', Object.entries(ROSTER.reduce((m, c) => ((m[c.grade] = (m[c.grade] || 0) + 1), m), {})).map(([g, n]) => `${g}=${n}`).join(' '));
log('스테이지    :', `${FACTS.TOTAL_STAGES}개 / 별 ${FACTS.TOTAL_STARS}`);
log('뷰포트      :', VP_NAMES.map((v) => `${v} ${VIEWPORTS[v].width}x${VIEWPORTS[v].height}@${VIEWPORTS[v].deviceScaleFactor}x`).join(' | '));
log('화면        :', SCREENS.join(', '), '/ 시드:', Object.keys(SEEDS).join(', '));
hr();

// ── 0) 양성대조 — 탐지기가 «살아 있는지»부터 증명한다 ──────────────────────
// ERR 0건은 탐지기가 죽어 있어도 나온다. 실측 전에 반드시 걸려야 할 가짜 결함을
// 심어 발화를 확인한다. 실패하면 이 실행의 PASS 는 무효로 처리한다.
await visit(LOCALES[0], 'roster', 'late', VP_NAMES[0], false);
const SELFTEST = await evalJs('window.__selftest()');
log('[0] 탐지기 양성대조(positive control)');
log('    발화한 코드 :', SELFTEST.fired.join(', ') || '(없음)');
log('    미발화      :', SELFTEST.missing.join(', ') || '없음');
log('    판정        :', SELFTEST.ok ? 'OK — 탐지기 살아 있음' : '★ 무효 — 탐지기가 결함을 못 잡는다');
hr('-');

const fontReport = {};
for (const vpName of VP_NAMES) {
  for (const locale of LOCALES) {
    for (const seedName of Object.keys(SEEDS)) {
      for (const screen of SCREENS) {
        await visit(locale, screen, seedName, vpName);
      }
    }
    if (!fontReport[locale]) {
      // ★ 폰트 확인은 «그 로케일의 문자»가 실제로 들어있는 요소에서 재야 한다.
      //   처음엔 .ar-crit .nm(종 이름)에서 쟀는데, 종 이름은 9개 로케일 전부
      //   로마자라 ja/zh 도 «Malgun Gothic» 이 나왔다 — CJK 폰트에 대해 아무것도
      //   증명하지 못하는 수치였다. 화면 제목(.ar-title)은 로케일 문자로 번역된다.
      await visit(locale, 'roster', 'late', vpName, false);
      fontReport[locale] = {
        title: await platformFonts('.ar-title'),
        titleText: await evalJs("document.querySelector('.ar-title')?.textContent ?? ''"),
      };
    }
  }
}

// 가챠 뽑기 루프 — 카드 «앞면»에 종 이름이 실제로 얹힌 상태를 종별로 측정.
// 카드는 150x200px 고정이라 뷰포트 폭에 반응하지 않는다 → 2종 뷰포트로 충분.
const drawRuns = [];
if (!ARGV['no-draws']) {
  for (const vpName of VP_NAMES.filter((v) => v === 'desktop' || v === 'mobile')) {
    for (const locale of LOCALES) {
      const vp = VIEWPORTS[vpName];
      await cdp.send('Emulation.setDeviceMetricsOverride', vp);
      const loaded = cdp.once('Page.loadEventFired');
      await cdp.send('Page.navigate', {
        url: `${BASE}?${new URLSearchParams({ locale, screen: 'gacha', gems: '99999999', stars: '9999', login: '999', challenge: '999', custom: '9', hintms: '600000' })}`,
      });
      await loaded;
      loadCount++;
      await evalJs('window.__settle(400)', true);
      // ★ 로케일마다 «다른 종»이 뽑히면 같은 자리를 비교해도 다른 단어를 비교하게 된다.
      //   난수를 고정해 9개 로케일이 «같은 순서»로 같은 종을 뽑게 만든다.
      await evalJs('window.__seedRandom(20260809)');
      const list = await evalJs('window.__drawAll()', true);
      for (const a of list) {
        a.locale = locale; a.screen = 'gacha-card'; a.seed = 'draw'; a.viewport = vpName;
        RUNS.push(a); drawRuns.push(a);
      }
    }
  }
}

// ── 파괴 폭 스캔 — «안 터졌다» 대신 «몇 px 에서 터지나»를 낸다 ─────────────
// 로케일별 안전여유를 «비교 가능한 한 숫자»로 만든다. 넓은 화면에서 전부 PASS 인
// 것은 안전마진을 말해주지 않는다 — 독일어가 341px 에서 터지고 한국어가 288px 에서
// 터진다면 그 차이가 곧 위험도다. 재로드 없이 뷰포트만 줄여 리플로우시킨다.
const WIDTHS = [430, 412, 393, 375, 360, 344, 320, 300, 280, 260, 240, 220, 200];
const breakScan = {};
if (!ARGV['no-scan']) {
  for (const locale of LOCALES) {
    breakScan[locale] = {};
    for (const screen of SCREENS) {
     // ★ 두 시드 다 돌린다. 최장 문자열이 시드에 갈려 있다 — 예: ru «Не хватает
     //   кристаллов»(보석부족)는 early 에서만 뜬다. late 만 스캔하면 못 본다.
     for (const seedName of Object.keys(SEEDS)) {
      // ★ «먼저 폭을 맞추고» 로드한다. 반대로 하면 기본 창 크기로 로드된 뒤 첫 폭에서
      //   리사이즈가 겹쳐, 첫 측정만 패널 높이가 덜 잡힌 상태로 찍힌다
      //   (실측: 430px 첫 프로브에서만 OFFSCREEN_Y bottom=975 — 412px 부터는 사라짐.
      //    실제 결함이 아니라 «리사이즈 직후 1회» 허상이었다).
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: WIDTHS[0], height: 844, deviceScaleFactor: 3, mobile: true,
      });
      const loaded = cdp.once('Page.loadEventFired');
      await cdp.send('Page.navigate', { url: urlFor(locale, screen, seedName) });
      await loaded;
      loadCount++;
      await evalJs('window.__settle(400)', true);

      const errAt = async (w) => {
        await cdp.send('Emulation.setDeviceMetricsOverride', {
          width: w, height: 844, deviceScaleFactor: 3, mobile: true,
        });
        await evalJs('window.__settle(120,400)', true);
        const a = await evalJs('window.__audit()');
        return a.findings.filter((f) => f.sev === 'ERR');
      };
      // 폭이 좁아질수록 나빠진다는 «단조성»을 가정한 이분탐색(선형 13회 → 4~5회).
      // 경계 양쪽(파괴폭 / 그 위 폭)을 실제로 찍어 확인하므로 경계값 자체는 실측이다.
      let lo = 0, hi = WIDTHS.length - 1, firstBreakIdx = null;
      let lastOk = null, firstBreak = null, breakDetail = null;
      // WIDTHS 는 «넓은 → 좁은» 순이다. 찾는 것은 «ERR 이 나는 가장 넓은 폭»
      // = ERR 이 나는 가장 «작은 인덱스». mid 가 터지면 왼쪽(더 넓은 쪽)을 더 판다.
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        const e = await errAt(WIDTHS[mid]);
        if (e.length > 0) {
          firstBreakIdx = mid;
          firstBreak = WIDTHS[mid];
          breakDetail = `${e[0].code} «${e[0].text.slice(0, 40)}» ${JSON.stringify(e[0].detail)} [seed=${seedName}]`;
          hi = mid - 1;
        } else {
          lastOk = WIDTHS[mid];
          lo = mid + 1;
        }
      }
      // 경계 재확인(단조성 가정이 깨졌으면 여기서 드러난다)
      if (firstBreakIdx !== null && firstBreakIdx > 0) {
        const above = await errAt(WIDTHS[firstBreakIdx - 1]);
        if (above.length > 0) breakDetail += ' ★단조성위반: 더 넓은 폭에서도 ERR';
      }
      // 두 시드 중 «더 일찍(넓은 폭에서) 터지는» 쪽을 그 화면의 값으로 남긴다.
      const prev = breakScan[locale][screen];
      if (!prev || (firstBreak ?? 0) > (prev.firstBreak ?? 0)) {
        breakScan[locale][screen] = { lastOk, firstBreak, breakDetail, seed: seedName };
      }
      process.stderr.write(`  ~ scan ${locale}/${screen}/${seedName}: ok>=${lastOk} break@${firstBreak}\n`);
     }
    }
  }
}

server.close();
try { chrome.kill(); } catch { /* noop */ }

// ───────────────────────────────────────────────────────────────────────────
// 7) 집계
// ───────────────────────────────────────────────────────────────────────────
const totalEls = RUNS.reduce((s, r) => s + r.total, 0);
const totalSkipped = RUNS.reduce((s, r) => s + r.skipped, 0);
const totalTextless = RUNS.reduce((s, r) => s + (r.textless || 0), 0);
const totalMeasured = totalEls - totalSkipped;
const skipHist = {};
for (const r of RUNS) for (const [k, v] of Object.entries(r.skipReasons)) skipHist[k] = (skipHist[k] || 0) + v;

const allFindings = [];
for (const r of RUNS) {
  for (const f of r.findings) {
    allFindings.push({ ...f, locale: r.locale, screen: r.screen, seed: r.seed, viewport: r.viewport });
  }
}
const errs = allFindings.filter((f) => f.sev === 'ERR');
const warns = allFindings.filter((f) => f.sev === 'WARN');

// ── 로케일별 결과표 ────────────────────────────────────────────────────────
log('\n[1] 로케일 × 뷰포트 결과 (ERR=넘침/잘림 확정, WARN=주의)');
hr('-');
log('locale   viewport   screens  elements  ERR  WARN   판정');
hr('-');
const rowKey = (r) => `${r.locale}|${r.viewport}`;
const byLV = {};
for (const r of RUNS) {
  const k = rowKey(r);
  byLV[k] = byLV[k] || { runs: 0, els: 0, err: 0, warn: 0 };
  byLV[k].runs++; byLV[k].els += r.total;
  byLV[k].err += r.findings.filter((f) => f.sev === 'ERR').length;
  byLV[k].warn += r.findings.filter((f) => f.sev === 'WARN').length;
}
for (const vpName of VP_NAMES) {
  for (const locale of LOCALES) {
    const s = byLV[`${locale}|${vpName}`];
    if (!s) continue;
    log(
      locale.padEnd(9) + vpName.padEnd(11) + String(s.runs).padStart(5) +
      String(s.els).padStart(11) + String(s.err).padStart(5) + String(s.warn).padStart(6) +
      '   ' + (s.err === 0 ? 'PASS' : 'FAIL')
    );
  }
}

// ── 결함 상세 ──────────────────────────────────────────────────────────────
log('\n[2] 결함 상세');
hr('-');
function groupFindings(arr) {
  const g = {};
  for (const f of arr) {
    const k = `${f.code}|${f.key}|${f.text}`;
    g[k] = g[k] || { code: f.code, key: f.key, text: f.text, where: new Set(), detail: f.detail, max: 0 };
    g[k].where.add(`${f.locale}/${f.viewport}/${f.screen}/${f.seed}`);
    const by = Number(f.detail?.by ?? 0);
    if (by > g[k].max) { g[k].max = by; g[k].detail = f.detail; }
  }
  return Object.values(g).sort((a, b) => b.max - a.max || b.where.size - a.where.size);
}
if (errs.length === 0) log('ERR 0건 — 넘침/잘림 확정 결함 없음');
for (const g of groupFindings(errs)) {
  const w = [...g.where];
  log(`  [ERR ${g.code}] ${g.max ? `초과 ${g.max}px ` : ''}${g.text ? `«${g.text}» ` : ''}`);
  log(`      요소: ${g.key}`);
  log(`      상세: ${JSON.stringify(g.detail)}`);
  log(`      발생: ${w.length}건 — ${w.slice(0, 8).join(', ')}${w.length > 8 ? ` … 외 ${w.length - 8}` : ''}`);
}
log('');
if (warns.length === 0) log('WARN 0건');
for (const g of groupFindings(warns).slice(0, 20)) {
  const w = [...g.where];
  log(`  [WARN ${g.code}] ${g.text ? `«${g.text}» ` : ''}${JSON.stringify(g.detail)}`);
  log(`      요소: ${g.key}  발생 ${w.length}건 — ${w.slice(0, 6).join(', ')}${w.length > 6 ? ' …' : ''}`);
}

// ── 긴 언어 vs CJK: 서로 다른 깨짐 방식으로 «따로» 센다 ────────────────────
log('\n[3] 깨짐 방식 분리 — 긴 언어(가로폭)와 CJK(줄바꿈/세로) 를 같은 잣대로 세지 않는다');
hr('-');
const base = {}; // key -> en 기준 {w,h,lines}
for (const r of RUNS) {
  if (r.locale !== 'en') continue;
  for (const [k, m] of Object.entries(r.metrics)) base[`${r.viewport}|${r.screen}|${r.seed}|${k}`] = m;
}
const widthDelta = {}, lineDelta = {}, heightDelta = {};
for (const r of RUNS) {
  if (r.locale === 'en') continue;
  for (const [k, m] of Object.entries(r.metrics)) {
    const b = base[`${r.viewport}|${r.screen}|${r.seed}|${k}`];
    if (!b || m.w == null || b.w == null) continue;
    const L = r.locale;
    // ★ 폭비는 «의미 있는 길이»에서만 센다. '·' 같은 1글자 구분자는 절대폭이
    //   8px 대라 로케일 폰트가 조금만 달라도 비율이 1.5배로 튄다 — 그걸 «독일어가
    //   57% 길다»로 읽으면 오진이다(실제로 첫 실행에서 그렇게 나왔다).
    if (b.w >= 20) {
      widthDelta[L] = widthDelta[L] || { n: 0, sum: 0, max: 0, worst: null };
      const ratio = m.w / b.w;
      widthDelta[L].n++; widthDelta[L].sum += ratio;
      if (ratio > widthDelta[L].max) { widthDelta[L].max = ratio; widthDelta[L].worst = `${m.text} (${b.w}→${m.w}px, ${r.screen}/${r.viewport})`; }
    }
    if (m.lines > b.lines) {
      lineDelta[L] = lineDelta[L] || { n: 0, worst: null, maxd: 0 };
      lineDelta[L].n++;
      if (m.lines - b.lines > lineDelta[L].maxd) { lineDelta[L].maxd = m.lines - b.lines; lineDelta[L].worst = `${m.text} (${b.lines}→${m.lines}줄, ${r.screen}/${r.viewport})`; }
    }
    if (m.h > b.h) {
      heightDelta[L] = heightDelta[L] || { n: 0, max: 0, worst: null };
      heightDelta[L].n++;
      const d = m.h - b.h;
      if (d > heightDelta[L].max) { heightDelta[L].max = d; heightDelta[L].worst = `${m.text} (+${Math.round(d)}px, ${r.screen}/${r.viewport})`; }
    }
  }
}
log('locale   평균폭비(en=1)  최대폭비   줄수증가건  최대줄증가  높이증가건  최대높이증가');
hr('-');
for (const L of LOCALES) {
  if (L === 'en') { log('en'.padEnd(9) + '기준'); continue; }
  const w = widthDelta[L], l = lineDelta[L] || { n: 0, maxd: 0 }, h = heightDelta[L] || { n: 0, max: 0 };
  log(
    L.padEnd(9) +
    (w ? (w.sum / w.n).toFixed(3) : '-').padStart(10) +
    (w ? w.max.toFixed(2) : '-').padStart(11) +
    String(l.n).padStart(12) + String(l.maxd).padStart(12) +
    String(h.n).padStart(12) + (h.max ? Math.round(h.max) + 'px' : '-').padStart(14)
  );
}
log('\n  가로폭 최대 사례(긴 언어 진단):');
for (const L of LOCALES) if (widthDelta[L]?.worst) log(`    ${L.padEnd(9)} ×${widthDelta[L].max.toFixed(2)}  ${widthDelta[L].worst}`);
log('  줄바꿈/세로 최대 사례(CJK 진단):');
for (const L of LOCALES) if (lineDelta[L]?.worst) log(`    ${L.padEnd(9)} ${lineDelta[L].worst}`);

// ── 음역 노출 카운트(별도 항목) ────────────────────────────────────────────
log('\n[4] 로마자 음역 원문 노출 — 면제(SKIPPED)와 «별개» 항목으로 센다');
hr('-');
const romajiNames = ROSTER.map((c) => c.nameRomaji);
const koNames = ROSTER.map((c) => c.nameKo);
const HANGUL = /[\uAC00-\uD7A3]/;
const romajiCount = {}, hangulLeak = {}, romajiWhich = {};
for (const r of RUNS) {
  const L = r.locale;
  romajiCount[L] = romajiCount[L] || 0;
  hangulLeak[L] = hangulLeak[L] || [];
  romajiWhich[L] = romajiWhich[L] || new Set();
  for (const t of r.texts) {
    for (const nm of romajiNames) {
      if (t === nm || new RegExp(`(^|[^A-Za-z])${nm}([^A-Za-z]|$)`).test(t)) {
        romajiCount[L]++; romajiWhich[L].add(nm);
      }
    }
    if (L !== 'ko' && HANGUL.test(t)) hangulLeak[L].push(`${r.screen}/${r.viewport}: ${t}`);
  }
}
log('locale   음역노출(회)  노출된 고유명사 종수  한글누출');
hr('-');
for (const L of LOCALES) {
  log(
    L.padEnd(9) + String(romajiCount[L] || 0).padStart(10) +
    String(romajiWhich[L]?.size || 0).padStart(20) + '종' +
    String(hangulLeak[L]?.length || 0).padStart(10) + '건' +
    (L === 'ko' ? '   (ko 는 nameKo 표기가 정상 — 음역 0 이 기대값)' : '')
  );
}
const romajiTotal = Object.entries(romajiCount).filter(([L]) => L !== 'ko').reduce((s, [, v]) => s + v, 0);
const romajiSpecies = new Set();
for (const [L, s] of Object.entries(romajiWhich)) if (L !== 'ko') for (const x of s) romajiSpecies.add(x);
log(`\n  합계: 비-ko 8개 로케일에서 음역 원문 노출 ${romajiTotal}회, 고유명사 ${romajiSpecies.size}/${ROSTER.length}종`);
log(`  노출 종: ${[...romajiSpecies].sort().join(', ') || '(없음)'}`);
log(`  미노출 종: ${romajiNames.filter((n) => !romajiSpecies.has(n)).join(', ') || '(없음)'}`);
log('  ※ 판정 아님. roster.ts 는 «로마자는 9개 언어 공통 고정, 번역하지 않는다»가 설계다.');
log('    이 표는 그 «설계가 실제 화면에 몇 자리로 나타나는지»의 실측 카운트다.');
log('    한글누출은 다르다 — 비-ko 로케일에 한글이 뜨면 그건 결함이다(위 표 확인).');

// ── 종 커버리지(증거 전이 금지: 화면별로 «따로» 표기) ──────────────────────
log('\n[5] 종 커버리지 — 어느 화면에서 실제로 측정됐는지 «분리» 표기');
hr('-');
const seenRoster = new Set(), seenCard = new Set();
for (const r of RUNS) {
  const set = r.screen === 'gacha-card' ? seenCard : (r.screen === 'roster' ? seenRoster : null);
  if (!set) continue;
  for (const t of r.texts) {
    for (const c of ROSTER) {
      if (t === c.nameRomaji || t === c.nameKo) set.add(c.id);
    }
  }
}
log(`  로스터 화면에서 이름이 렌더된 종 : ${seenRoster.size}/${ROSTER.length}`);
log(`  가챠 결과카드에서 렌더된 종      : ${seenCard.size}/${ROSTER.length} (가챠풀 ${GACHA_POOL.length}종이 상한 — 조건해금 종은 카드에 뜰 수 없다)`);
const missRoster = ROSTER.filter((c) => !seenRoster.has(c.id)).map((c) => c.id);
if (missRoster.length) log(`  ★ 로스터에서 이름 미확인: ${missRoster.join(', ')} (미보유 카드는 «???» 로 렌더되는 게 정상)`);
log(`  총 측정 조합 = ${RUNS.length} (페이지 로드 ${loadCount}회, 뽑기 측정 ${drawRuns.length}회)`);

// ── 파괴 폭(안전여유) ──────────────────────────────────────────────────────
log('\n[5-b] 파괴 폭 스캔 — «안 터졌다»가 아니라 «몇 px 에서 터지나»');
hr('-');
log('  뷰포트를 줄여가며 첫 ERR 이 나오는 폭을 찾는다. 숫자가 작을수록 여유가 크다.');
log(`  탐색 폭: ${WIDTHS.join(' → ')} (높이 844 고정, mobile)`);
log('');
log('  ※ 실제 최소 기기폭은 320px(iPhone SE 계열). 320 미만은 «잠재 위험»이지 라이브 결함이 아니다.');
log('');
log('locale   ' + SCREENS.map((s) => s.padStart(11)).join('') + '     최악(가장 먼저 터지는 폭)');
hr('-');
const scanWorst = {};
for (const locale of LOCALES) {
  const row = breakScan[locale] || {};
  let worst = 0, worstScreen = null;
  const cells = SCREENS.map((s) => {
    const c = row[s];
    if (!c) return '-'.padStart(11);
    if (c.firstBreak === null) return 'OK(≥200)'.padStart(11);
    if (c.firstBreak > worst) { worst = c.firstBreak; worstScreen = s; }
    return `break@${c.firstBreak}`.padStart(11);
  });
  scanWorst[locale] = { worst, worstScreen, detail: worstScreen ? row[worstScreen].breakDetail : null };
  log(locale.padEnd(9) + cells.join('') + '     ' + (worst ? `${worst}px (${worstScreen})` : '200px 까지 무결'));
}
log('');
for (const locale of LOCALES) {
  const w = scanWorst[locale];
  if (w?.detail) log(`  ${locale.padEnd(9)} 첫 파괴 내용: ${w.detail}`);
}

// ── 면제/한계 ──────────────────────────────────────────────────────────────
log('\n[6] 이 점검기가 «못 잡는 것» + 면제 개수');
hr('-');
log(`SKIPPED: ${totalSkipped}/${totalEls}`);
log('');
log('  ★「ERR 0건」의 «분모»를 명시한다 — 0건이 부재의 증거로 오독되지 않게:');
log(`    전체 요소            ${String(totalEls).padStart(7)}`);
log(`    실제 측정된 요소     ${String(totalMeasured).padStart(7)}  (${((totalMeasured / totalEls) * 100).toFixed(1)}%)  ← ERR 0 은 «이 분모»에 대한 것이다`);
log(`    측정 못 한 요소      ${String(totalSkipped).padStart(7)}  (${((totalSkipped / totalEls) * 100).toFixed(1)}%)  ← 아래 사유별`);
log(`      └ 그중 글자없음    ${String(totalTextless).padStart(7)}  (기하검사는 «전부 했다». 면제 아님 — 분모에 포함돼 있다)`);
log('');
log('  면제 사유별(예시 요소까지 같이 낸다 — 면제는 조용히 커진다):');
const skipSample = {};
for (const r of RUNS) for (const [k, v] of Object.entries(r.skipSamples || {})) {
  skipSample[k] = skipSample[k] || new Set();
  for (const s of v) if (skipSample[k].size < 3) skipSample[k].add(s);
}
for (const [k, v] of Object.entries(skipHist).sort((a, b) => b[1] - a[1])) {
  log(`    ${k.padEnd(22)} ${String(v).padStart(6)}   예: ${[...(skipSample[k] || [])].map((s) => s.split('>').pop()).join(' | ') || '-'}`);
}
log('');
// ★ 커버리지 실증: 720개 조합을 «합쳐서» 한 번도 측정 안 된 요소 종류를 찾는다.
//   면제 건수만으로는 「그 요소가 영영 안 재졌는지」를 알 수 없다. 같은 요소가
//   다른 조합에서 측정됐다면 사각지대가 아니다 — 그걸 주장이 아니라 수치로 낸다.
const measuredSig = new Map(), skippedSig = new Map();
for (const r of RUNS) {
  for (const [s, n] of Object.entries(r.measuredSigs || {})) measuredSig.set(s, (measuredSig.get(s) || 0) + n);
  for (const [s, n] of Object.entries(r.skippedSigs || {})) skippedSig.set(s, (skippedSig.get(s) || 0) + n);
}
const neverMeasured = [...skippedSig.keys()].filter((s) => !measuredSig.has(s)).sort();
const skippedButCovered = [...skippedSig.keys()].filter((s) => measuredSig.has(s)).sort();
log('  ★ 커버리지 실증(720개 조합 합산) — 「면제 = 사각지대 아님」을 주장이 아니라 수치로:');
log(`    측정된 요소 종류        ${String(measuredSig.size).padStart(4)}종`);
log(`    면제된 적 있는 종류     ${String(skippedSig.size).padStart(4)}종`);
log(`      └ 다른 조합에서 측정  ${String(skippedButCovered.length).padStart(4)}종  ← 사각지대 아님(실증됨)`);
log(`      └ ★어디서도 미측정   ${String(neverMeasured.length).padStart(4)}종  ← 이게 진짜 사각지대다`);
if (neverMeasured.length) {
  for (const s of neverMeasured) log(`         ★ ${s}  (면제 ${skippedSig.get(s)}회, 측정 0회)`);
} else {
  log('         → 0종. 면제된 요소는 «전부» 다른 조합에서 최소 1회 실측됐다.');
}
log('');
log('  면제가 «사각지대»인지에 대한 판단(사유별):');
log('    · display:none — 모달이 열린 동안 감춰지는 HUD 바/칩이다. 감춰진 상태를 재는 건');
log('      의미가 없고, 같은 요소를 screen=none 조합에서 «실제로 측정»한다(사각지대 아님).');
log('    · zero-rect  — 위 감춰진 부모의 자식들. 자기 display 는 none 이 아니라 rect 만 0 이다.');
log('      역시 screen=none 에서 측정된다(사각지대 아님).');
log('    · backface-away — 3D 카드의 «뒤를 보고 있는» 면. 화면에 존재하지 않는다.');
log('      뒤집힌 뒤 앞면이 되면 그때 측정된다(뽑기 360회에서 실측됨).');
log('    → 즉 위 면제는 «같은 요소를 다른 조합에서 측정»하는 구조다. 이건 이제 주장이');
log(`      아니라 바로 위 «커버리지 실증» 수치로 검증된다(어디서도 미측정 = ${neverMeasured.length}종).`);
if (neverMeasured.length) {
  log('      ★ 0종이 아니다. 위에 뜬 종류는 «클래스가 바뀌는 요소»일 수 있으니 반드시');
  log('        findings.json 의 coverage.measuredSigList 에서 «변형된 이름»으로 측정됐는지');
  log('        확인하고, 아니면 시드/조합을 늘려서 실제로 태워라. 확인 없이 넘기지 마라.');
}
log('      남은 한계: 커버리지 단위가 요소 «종류»(tag+class)다. 같은 종류의 개별');
log('      인스턴스 하나가 특정 조합에서만 안 재졌을 가능성까지는 배제하지 못한다.');
log('');
log('  못 잡는 것(명시):');
[
  '(a) 색 대비·가독성 — 기하만 잰다. 흐린 회색 텍스트가 안 읽히는 건 못 잡는다.',
  '(b) 겹침(overlap) — 두 요소가 서로 덮는 상황은 판정 로직에 없다. 잘림/넘침만 본다.',
  '(c) 이모지 폰트 차이 — 실기기(iOS/안드로이드)의 이모지 폭은 Windows Chrome 과 다르다.',
  '(d) 애니메이션 «도중» 프레임 — settle 후 정지 상태만 잰다.',
  '(e) 실기기 스크롤바 폭/주소창 축소(dvh 변동) — 에뮬레이션 값 고정이다.',
  '(f) 번역 «품질» — 뜻이 틀렸거나 어색한 번역은 기하로 판별 불가.',
  '(g) 로마자 음역이 «정상 번역인지» 여부 — 라틴계 로케일에서는 코드로 구분 불가.',
  '     그래서 [4] 는 판정 대신 «노출 카운트»로 낸다(면제로 숨기지 않는다).',
].forEach((s) => log('    ' + s));
log('');
log('  측정조건(수치의 전제):');
log('    · 렌더엔진 = 위 Chrome 실행파일, 헤드리스(--headless=new)');
log('    · prefers-reduced-motion: reduce 로 고정 → 뽑기 연출이 동기 실행돼 결정적으로 측정됨');
log('    · 허용오차 TOL=1.0px');
log('    · 실제 글자를 그린 물리폰트(로케일별, 화면제목 .ar-title 기준):');
for (const [L, f] of Object.entries(fontReport)) {
  log(`        ${L.padEnd(9)} «${f.titleText}» → ${f.title || '(측정불가)'}`);
}
log('      ※ 종 이름(.ar-crit .nm)이 아니라 «제목»에서 잰다 — 종 이름은 9개 로케일 전부');
log('        로마자라 ja/zh 에서도 라틴 폰트가 나와 CJK 렌더링을 전혀 증명하지 못한다.');

if (pageErrors.length) {
  log('\n[!] 페이지 런타임 예외 ' + pageErrors.length + '건:');
  pageErrors.slice(0, 10).forEach((e) => log('    ' + e));
}

// ── 결론 ───────────────────────────────────────────────────────────────────
log('\n[7] 자기검증 — 측정한 화면이 «정말 그 화면이었나»');
hr('-');
log(`  근거요소 확인: ${RUNS.filter((r) => r.evidence).length}건 중 실패 ${EVIDENCE_FAILS.length}건`);
for (const f of EVIDENCE_FAILS.slice(0, 12)) log('    ★ ' + f);
if (EVIDENCE_FAILS.length === 0) log('    전 조합에서 대상 화면 요소가 실제로 렌더돼 있었다(빈 화면 PASS 아님).');

hr();
const invalid = !SELFTEST.ok || EVIDENCE_FAILS.length > 0;
const verdict = invalid ? 'INVALID(측정 자체가 신뢰불가)' : errs.length === 0 ? 'PASS' : 'FAIL';
// ★ 분모를 «판정과 한 줄에» 묶는다. 「ERR 0 → PASS」만 떼어 인용되면 그 순간
//   과장이 된다 — 100% 를 잰 게 아니기 때문이다(Chief 지시, 총력전 라운드).
log(`RESULT: ${verdict} — ERR ${errs.length}건 / WARN ${warns.length}건`);
log(`  ★단, 측정된 ${totalMeasured}개(${((totalMeasured / totalEls) * 100).toFixed(1)}%)에 대해서다.`);
log(`   미측정 ${totalSkipped}개(${((totalSkipped / totalEls) * 100).toFixed(1)}%)는 판정 대상이 아니었다. (SKIPPED: ${totalSkipped}/${totalEls})`);
log(`   ※ 이 두 줄을 떼고 「ERR 0 → PASS」만 인용하지 마라.`);
log(`양성대조: ${SELFTEST.ok ? 'OK' : '실패 — 이 실행의 PASS 는 증거가 아니다'} / 근거요소 실패: ${EVIDENCE_FAILS.length}건`);
log(`소요 ${((Date.now() - T0) / 1000).toFixed(1)}s`);
hr();

fs.writeFileSync(path.join(OUT, 'findings.json'), JSON.stringify({
  when: new Date().toISOString(), chrome: CHROME, locales: LOCALES,
  selftest: SELFTEST,
  roster: ROSTER.length, runs: RUNS.length,
  totalEls, totalMeasured, totalSkipped, totalTextless, skipHist,
  coverage: {
    measuredSigTypes: measuredSig.size,
    skippedSigTypes: skippedSig.size,
    skippedButCoveredTypes: skippedButCovered.length,
    neverMeasuredTypes: neverMeasured,
    // 측정된 종류 전량을 남긴다 — 「그 요소가 재졌나」를 나중에 «파일로» 확인할 수 있어야
    // 한다. 로그 요약만 있으면 다음 사람이 다시 실행해야 알 수 있다.
    measuredSigList: [...measuredSig.entries()].sort((a, b) => b[1] - a[1]).map(([s, n]) => `${s} ×${n}`),
    skippedSigList: [...skippedSig.entries()].sort((a, b) => b[1] - a[1]).map(([s, n]) => `${s} ×${n}`),
  },
  errors: errs, warnings: warns, romajiCount, romajiSpecies: [...romajiSpecies],
  breakScan, fontReport, evidenceFails: EVIDENCE_FAILS,
}, null, 2), 'utf8');

if (!ARGV.keep) {
  for (const f of ['_facts_entry.ts', '_facts.mjs']) {
    try { fs.unlinkSync(path.join(OUT, f)); } catch { /* noop */ }
  }
}
try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch { /* noop */ }
process.exitCode = errs.length === 0 ? 0 : 2;
