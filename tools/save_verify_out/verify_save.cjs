// verify_save.cjs — 애니멀라이더 «진행도 저장» 실렌더 검증.
// (a) 신규유저 / (b) 진행발생 / (c) 새로고침 후 잔존 / (d) 손상 주입 내성
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('C:/Users/USER/Downloads/20260802_Partner업무/08_매칭앱/build/web/node_modules/playwright');

const DIST = 'C:/Users/USER/Downloads/20260802_Partner업무/05_동물라이더/build/animal-stunt/dist';
const OUT = 'C:/Users/USER/AppData/Local/Temp/claude/C--Users-urimk/6c09fee0-e9fe-4985-8b5b-f7ed5a2f171a/scratchpad/shots';
const PORT = 4187;
const BASE = `http://127.0.0.1:${PORT}`;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };

fs.mkdirSync(OUT, { recursive: true });

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  if (p === '/__blank') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end('<!doctype html><title>blank</title>'); return; }
  const f = path.join(DIST, p);
  if (!f.startsWith(path.resolve(DIST)) || !fs.existsSync(f)) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  res.end(fs.readFileSync(f));
});

const log = [];
function say(s) { console.log(s); log.push(s); }

const consoleMsgs = [];
function attach(page) {
  page.on('console', (m) => consoleMsgs.push({ phase: PHASE, type: m.type(), text: m.text() }));
  page.on('pageerror', (e) => consoleMsgs.push({ phase: PHASE, type: 'pageerror', text: String(e) }));
}
let PHASE = 'boot';

const dbg = (page) => page.evaluate(() => {
  const d = window.__debug;
  if (!d) return null;
  return { saveStatus: d.saveStatus, profileStars: d.profileStars, stageCleared: d.stageCleared,
    stageStars: d.stageStars, stageId: d.stageId, gems: d.gachaGems, owned: d.gachaOwnedIds,
    ownedCount: d.gachaOwnedCount, draws: d.gachaDrawsCompleted, worldX: Math.round(d.worldX) };
});
const rawSave = (page) => page.evaluate(() => localStorage.getItem('ar.save'));

(async () => {
  await new Promise((r) => server.listen(PORT, r));
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 430, height: 860 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  attach(page);
  let fail = 0;
  const check = (ok, msg) => { say(`${ok ? '  OK  ' : '  FAIL'} ${msg}`); if (!ok) fail++; };

  // ── (a) 신규 유저 ────────────────────────────────────────────────────────
  PHASE = 'a';
  say('\n=== (a) 신규 유저: 저장본 없이 정상 시작 ===');
  await page.goto(`${BASE}/?fx=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__debug, null, { timeout: 10000 });
  await page.waitForTimeout(1200); // 온보딩 토스트 노출
  const a = await dbg(page);
  say(`  __debug = ${JSON.stringify(a)}`);
  check((await rawSave(page)) === null, "localStorage['ar.save'] 없음(신규)");
  check(a.saveStatus === 'empty', `saveStatus='empty' (실측 '${a.saveStatus}')`);
  check(a.profileStars === 0 && a.ownedCount === 0 && a.gems === 0, '별 0 / 보유 0 / 보석 0');
  const toast = await page.locator('.ar-toast').count();
  check(toast === 1, `온보딩 조작안내 토스트 표시(실측 ${toast}개)`);
  await page.screenshot({ path: `${OUT}/a_new_user.png` });

  // ── (b) 진행 발생: 스테이지 클리어 12회 → 마일스톤 보석 → 가챠 1회 ───────
  PHASE = 'b';
  say('\n=== (b) 진행 발생: 스테이지 클리어(별 적립) ===');
  const cleared = [];
  for (let n = 1; n <= 12; n++) {
    let ok = false;
    for (let attempt = 1; attempt <= 3 && !ok; attempt++) {
      await page.goto(`${BASE}/?stage=${n}&auto=1&ff=60&fx=1`, { waitUntil: 'load' });
      try {
        await page.waitForFunction(() => window.__debug && window.__debug.stageCleared === true, null, { timeout: 15000 });
        ok = true;
      } catch { /* 재시도 */ }
    }
    const d = await dbg(page);
    cleared.push(`${d.stageId}:${d.stageStars}`);
    if (!ok) say(`  ! stage ${n} 클리어 실패`);
  }
  say(`  클리어 기록 = ${cleared.join(' ')}`);
  const b = await dbg(page);
  say(`  __debug = ${JSON.stringify(b)}`);
  check(b.profileStars >= 12, `누적 별 ${b.profileStars} (>=12)`);
  check(b.gems >= 600, `마일스톤 보석 ${b.gems} (>=600)`);
  const savedB = await rawSave(page);
  say(`  저장본 = ${savedB}`);
  check(!!savedB && JSON.parse(savedB).v === 1, '저장본에 스키마 버전 v=1');
  await page.screenshot({ path: `${OUT}/b_progress_stageclear.png` });

  // (b2) 가챠 1회 — 저장 시점② 검증
  PHASE = 'b2';
  say('\n--- (b2) 가챠 획득 저장 ---');
  await page.goto(`${BASE}/?fx=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__debug, null, { timeout: 10000 });
  await page.click('.ar-hudbar .ar-btn.gacha');
  await page.waitForSelector('.ar-gacha .ar-btn.gacha.big', { timeout: 5000 });
  await page.click('.ar-gacha .ar-btn.gacha.big');
  await page.waitForFunction(() => window.__debug && window.__debug.gachaOwnedCount === 1, null, { timeout: 8000 });
  await page.waitForTimeout(800);
  const b2 = await dbg(page);
  say(`  __debug = ${JSON.stringify(b2)}`);
  const savedB2 = JSON.parse(await rawSave(page));
  say(`  저장본 = ${JSON.stringify(savedB2)}`);
  check(savedB2.gacha.ownedIds.length === 1, `저장본 보유동물 ${JSON.stringify(savedB2.gacha.ownedIds)}`);
  check(savedB2.gacha.drawsCompleted === 1, `저장본 뽑기횟수 ${savedB2.gacha.drawsCompleted}`);
  await page.screenshot({ path: `${OUT}/b2_gacha_drawn.png` });

  const expect = { stars: b2.profileStars, gems: b2.gems, owned: b2.owned.slice().sort() };

  // ── (c) 새로고침 → 잔존 ─────────────────────────────────────────────────
  PHASE = 'c';
  say('\n=== (c) 새로고침 후 상태 잔존 ===');
  await page.goto(`${BASE}/?fx=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__debug, null, { timeout: 10000 });
  await page.waitForTimeout(600);
  const c = await dbg(page);
  say(`  __debug = ${JSON.stringify(c)}`);
  check(c.saveStatus === 'loaded', `saveStatus='loaded' (실측 '${c.saveStatus}')`);
  check(c.profileStars === expect.stars, `별 ${c.profileStars} == 새로고침 전 ${expect.stars}`);
  check(c.gems === expect.gems, `보석 ${c.gems} == 새로고침 전 ${expect.gems}`);
  check(JSON.stringify(c.owned.slice().sort()) === JSON.stringify(expect.owned), `보유동물 ${JSON.stringify(c.owned)} == 새로고침 전 ${JSON.stringify(expect.owned)}`);
  // HUD(★/💎/도감) 가 보이도록 캡처
  await page.screenshot({ path: `${OUT}/c_after_reload_hud.png` });
  // 스테이지 선택 화면(별 잔존이 눈으로 보이는 곳)
  await page.click('.ar-hudbar .ar-btn.ghost');
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/c_after_reload_stages.png` });
  // 도감
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  await page.click('.ar-hudbar .ar-btn.ghost >> nth=1');
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/c_after_reload_roster.png` });

  // ★ 보석 복제 회귀 검증: 새로고침을 한 번 더 해도 마일스톤 보석이 재지급되지 않아야 한다
  await page.goto(`${BASE}/?fx=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__debug, null, { timeout: 10000 });
  const c2 = await dbg(page);
  check(c2.gems === expect.gems, `2회 새로고침 후에도 보석 ${c2.gems} (마일스톤 재지급 없음)`);

  // ── (d) 손상 주입 ───────────────────────────────────────────────────────
  PHASE = 'd';
  say('\n=== (d) 손상 주입 내성 ===');
  const cases = [
    ['garbage-string', 'THIS IS NOT JSON {{{ <-- garbage', 'corrupt', { stars: 0, ownedCount: 0 }],
    ['version-mismatch', JSON.stringify({ v: 99, starsByStage: { 'Easy-1': 3 } }), 'version-mismatch', { stars: 0, ownedCount: 0 }],
    ['no-v-field', JSON.stringify({ starsByStage: { 'Easy-1': 3 } }), 'corrupt', { stars: 0, ownedCount: 0 }],
    ['array-root', JSON.stringify([1, 2, 3]), 'corrupt', { stars: 0, ownedCount: 0 }],
    ['type-mismatch-fields', JSON.stringify({ v: 1, starsByStage: 'nope', gacha: 123, conditionCounters: null }), 'loaded', { stars: 0, ownedCount: 0 }],
    ['poisoned-values', '{"v":1,"savedAt":null,"starsByStage":{"Easy-1":999,"NO_SUCH_STAGE":3,"Easy-2":-5},"gacha":{"gems":-1,"ownedIds":["kkang",7,"NOT_A_CRITTER"],"drawsCompleted":"x"},"conditionCounters":{"login_streak":1e400}}', 'loaded', { stars: 3, ownedCount: 1 }],
  ];
  for (const [name, payload, wantStatus, want] of cases) {
    // ★ 주입은 «게임이 안 떠 있는 같은 오리진 페이지»에서 한다.
    //   게임 페이지에서 주입하면 이탈 시 pagehide 저장(안전망)이 주입값을 «덮어써»
    //   손상이 없던 일이 된다(실측: 1차 시도에서 6케이스 전부 loaded 로 나왔다).
    await page.goto(`${BASE}/__blank`, { waitUntil: 'load' });
    await page.evaluate((v) => localStorage.setItem('ar.save', v), payload);
    const injected = await page.evaluate(() => localStorage.getItem('ar.save'));
    check(injected === payload, `[${name}] 주입 확인(${JSON.stringify(String(injected).slice(0, 40))}…)`);
    await page.goto(`${BASE}/?fx=1`, { waitUntil: 'load' });
    let alive = false, d = null;
    try {
      await page.waitForFunction(() => !!window.__debug, null, { timeout: 8000 });
      d = await dbg(page);
      alive = true;
    } catch { /* 게임이 안 켜진 것 */ }
    check(alive, `[${name}] 게임이 켜진다`);
    if (alive) {
      check(d.saveStatus === wantStatus, `[${name}] saveStatus='${d.saveStatus}' (기대 '${wantStatus}')`);
      check(d.profileStars === want.stars && d.ownedCount === want.ownedCount,
        `[${name}] 별 ${d.profileStars}/보유 ${d.ownedCount} (기대 ${want.stars}/${want.ownedCount})`);
      say(`      → ${JSON.stringify(d)}`);
    }
    if (name === 'garbage-string') await page.screenshot({ path: `${OUT}/d_corrupt_garbage.png` });
  }

  // ── 콘솔 집계 ───────────────────────────────────────────────────────────
  say('\n=== 콘솔 집계 ===');
  const errs = consoleMsgs.filter((m) => m.type === 'error' || m.type === 'pageerror');
  const warns = consoleMsgs.filter((m) => m.type === 'warning' || m.type === 'warn');
  say(`  error/pageerror = ${errs.length}`);
  errs.forEach((e) => say(`    [${e.phase}] ${e.text}`));
  say(`  warning = ${warns.length} (손상 주입 단계의 «의도된» 경고 포함)`);
  warns.forEach((w) => say(`    [${w.phase}] ${w.text}`));
  check(errs.filter((e) => e.phase !== 'd').length === 0, '손상 주입 외 구간 콘솔 에러 0');
  check(errs.length === 0, '전 구간 콘솔 에러 0');

  say(`\n=== 결과: ${fail === 0 ? 'ALL PASS' : `${fail} FAIL`} ===`);
  fs.writeFileSync(`${OUT}/verify_log.txt`, log.join('\n'), 'utf8');
  await browser.close();
  server.close();
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('HARNESS ERROR', e); server.close(); process.exit(2); });
