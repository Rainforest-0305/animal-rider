// daily_live_verify.cjs — 일일 접속 보상 «실브라우저» 검증 + AFTER 캡처.
//
// dist(프로덕션 빌드)를 그대로 띄운다. 검증 항목:
//   (A) v1 저장본 → v2 마이그레이션이 «진행도를 하나도 잃지 않는다»
//   (B) 날짜 경계 — 같은날 / 어제→오늘 / 자정 직전→직후 / ★시계 되돌림
//   (C) ★DST(23시간·25시간 날) — Playwright timezoneId 로 «진짜» 시간대를 바꾼다
//       (노드 하네스는 이 환경에서 TZ 를 못 바꾼다. 그래서 여기서 한다.)
//   (D) localStorage 불가 / 꽉 참
//   (E) 9개 로케일 360px 오버플로
//   (F) FPS 같은-세션 A/B (토스트 떠 있을 때 vs 사라진 뒤)
//   (G) 콘솔 에러 0
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('C:/Users/USER/Downloads/20260802_Partner업무/08_매칭앱/build/web/node_modules/playwright');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const SHOTS = process.argv[2] || path.join(ROOT, 'tools', 'daily_verify_out');
const PORT = 4191;
const BASE = `http://127.0.0.1:${PORT}`;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
fs.mkdirSync(SHOTS, { recursive: true });

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  if (p === '/__blank') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end('<!doctype html><title>blank</title>'); return; }
  const f = path.join(DIST, p);
  if (!f.startsWith(path.resolve(DIST)) || !fs.existsSync(f)) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  res.end(fs.readFileSync(f));
});

const lines = [];
let fail = 0;
function say(s) { console.log(s); lines.push(s); }
function check(ok, msg, extra) {
  say(`  ${ok ? 'OK  ' : 'FAIL'} ${msg}${extra !== undefined ? `  → ${extra}` : ''}`);
  if (!ok) fail++;
}

// ── 시계 조작: Date «만» 갈아끼운다. 타이머/rAF 는 건드리지 않는다 ─────────────
//   (Playwright clock.install 은 rAF·setTimeout 까지 장악해 게임 루프가 멈춘다 —
//    FPS 를 재야 하므로 쓸 수 없다. 우리 로직은 Date.now()/new Date(ms) 만 쓴다.)
const dateShim = (fixedNowMs) => {
  const RealDate = Date;
  const bootReal = RealDate.now();
  class FakeDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(fixedNowMs + (RealDate.now() - bootReal));
      else super(...args);
    }
    static now() { return fixedNowMs + (RealDate.now() - bootReal); }
  }
  // eslint-disable-next-line no-global-assign
  window.Date = FakeDate;
};

// v1 저장본(마이그레이션 대조군). 별 12 · 보석 600 · 보유 1종 · 뽑기 1회.
const V1 = {
  v: 1, savedAt: 1787000000000,
  starsByStage: { 'Easy-1': 3, 'Easy-2': 2, 'Easy-3': 1, 'Easy-4': 1, 'Easy-5': 1, 'Easy-6': 1, 'Easy-7': 1, 'Easy-8': 1, 'Easy-9': 1 },
  gacha: { gems: 600, ownedIds: ['sallang'], drawsCompleted: 1 },
  conditionCounters: { login_streak: 0, challenge_count: 7, customization_categories: 2 },
  collectionMode: 'full_roster_24',
};
const V1_STARS = Object.values(V1.starsByStage).reduce((a, b) => a + b, 0); // 유도값(손으로 안 적는다)

const dbg = (page) => page.evaluate(() => window.__debug ? {
  saveStatus: window.__debug.saveStatus, stars: window.__debug.profileStars,
  gems: window.__debug.gachaGems, owned: window.__debug.gachaOwnedCount,
  ownedIds: window.__debug.gachaOwnedIds,
  draws: window.__debug.gachaDrawsCompleted,
} : null);
const save = (page) => page.evaluate(() => { try { return JSON.parse(localStorage.getItem('ar.save')); } catch { return null; } });

(async () => {
  await new Promise((r) => server.listen(PORT, r));
  const browser = await chromium.launch();
  const consoleErrs = [];

  /** 컨텍스트 1개를 열고 fn 을 돌린다. */
  async function withCtx(opts, fn) {
    const ctx = await browser.newContext({
      viewport: opts.viewport || { width: 390, height: 844 },
      deviceScaleFactor: opts.dsf ?? 2,
      locale: opts.locale || 'ko-KR',
      ...(opts.timezoneId ? { timezoneId: opts.timezoneId } : {}),
    });
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error') consoleErrs.push(`[${opts.tag}] ${m.text()}`); });
    page.on('pageerror', (e) => consoleErrs.push(`[${opts.tag}] PAGEERROR ${e.message}`));
    try { await fn(page, ctx); } finally { await ctx.close(); }
  }

  /** 저장본을 «게임이 안 뜬 페이지»에서 주입한다(뜬 페이지에서 하면 pagehide 저장이 덮어쓴다). */
  async function seed(page, obj) {
    await page.goto(`${BASE}/__blank`, { waitUntil: 'load' });
    await page.evaluate((v) => { localStorage.clear(); localStorage.setItem('ar.onb.seen', '1'); if (v) localStorage.setItem('ar.save', v); },
      obj ? JSON.stringify(obj) : null);
  }
  async function boot(page, nowMs) {
    if (nowMs !== undefined) await page.addInitScript(dateShim, nowMs);
    await page.goto(`${BASE}/?fx=1`, { waitUntil: 'load' });
    await page.waitForFunction(() => !!window.__debug, null, { timeout: 12000 });
    await page.waitForTimeout(500);
  }
  const at = (y, m, d, hh = 10, mm = 0) => Date.UTC(y, m - 1, d, hh, mm) - 9 * 3600000; // KST 벽시계 → epoch

  // ══ (A) v1 → v2 마이그레이션 ═════════════════════════════════════════════
  say('=== (A) v1 저장본 → v2 마이그레이션 (진행도 보존) ===');
  await withCtx({ tag: 'A' }, async (page) => {
    await seed(page, V1);
    const before = await page.evaluate(() => JSON.parse(localStorage.getItem('ar.save')));
    check(before.v === 1 && before.daily === undefined, `주입 확인: v=1, daily 필드 없음`);
    await boot(page, at(2026, 8, 18));

    const d = await dbg(page);
    check(d.saveStatus === 'migrated', `saveStatus='migrated' (버려지지 않았다)`, d.saveStatus);
    check(d.stars === V1_STARS, `★별 ${V1_STARS} 보존`, d.stars);
    check(d.owned === V1.gacha.ownedIds.length && d.draws === V1.gacha.drawsCompleted,
      `★보유 ${V1.gacha.ownedIds.length}종·뽑기횟수 보존`, `${d.owned}종 [${d.ownedIds}] draws=${d.draws}`);

    const s = await save(page);
    check(s.v === 2, `저장본이 v2 로 올라갔다`, s.v);
    check(!!s.daily && s.daily.lastClaimDay === '2026-08-18' && s.daily.streak === 1,
      `daily 신설 + 오늘 첫 수령`, JSON.stringify(s.daily));
    check(s.conditionCounters.challenge_count === V1.conditionCounters.challenge_count
      && s.conditionCounters.customization_categories === V1.conditionCounters.customization_categories,
      `다른 조건 카운터도 보존`, JSON.stringify(s.conditionCounters));
    // ★ 보석: v1 잔액 + 오늘 지급분. 액수 자체는 노드 하네스가 상수에서 유도해 검증한다.
    check(d.gems > V1.gacha.gems, `보석이 늘었다 ${V1.gacha.gems} → ${d.gems}`, `+${d.gems - V1.gacha.gems}`);
    check(s.conditionCounters.login_streak === s.daily.streak, `login_streak 이 daily.streak 에서 유도됨`, s.conditionCounters.login_streak);
    await page.screenshot({ path: path.join(SHOTS, 'AFTER_daily_toast_390x844.png') });
  });

  // ══ (B) 날짜 경계 ════════════════════════════════════════════════════════
  say('\n=== (B) 날짜 경계 ===');
  await withCtx({ tag: 'B' }, async (page) => {
    await seed(page, null);
    // D1
    await boot(page, at(2026, 8, 18, 10));
    let s = await save(page); let d = await dbg(page);
    const g1 = d.gems, day1 = s.daily.streak;
    check(day1 === 1, 'D1: 연속 1일', day1);

    // 같은 날 재접속 → 추가 지급 0
    await page.goto(`${BASE}/__blank`, { waitUntil: 'load' });
    await boot(page, at(2026, 8, 18, 23, 30));
    d = await dbg(page); s = await save(page);
    check(d.gems === g1 && s.daily.streak === 1, '★같은 날 재접속: 추가 지급 0 (보석 복제 없음)', `${d.gems} / ${s.daily.streak}일`);

    // ★자정 직전 → 직후
    await page.goto(`${BASE}/__blank`, { waitUntil: 'load' });
    await boot(page, at(2026, 8, 18, 23, 59));
    const gPre = (await dbg(page)).gems;
    await page.goto(`${BASE}/__blank`, { waitUntil: 'load' });
    await boot(page, at(2026, 8, 19, 0, 1));
    d = await dbg(page); s = await save(page);
    const gained = d.gems - gPre;
    check(s.daily.streak === 2 && gained > 0, '★자정 직전(23:59) → 직후(00:01): 다음날로 지급', `연속 ${s.daily.streak}일 +${gained}`);

    // ★시계를 뒤로
    const snapshot = JSON.stringify(s.daily);
    const gBefore = d.gems;
    await page.goto(`${BASE}/__blank`, { waitUntil: 'load' });
    await boot(page, at(2026, 8, 17, 10));
    d = await dbg(page); s = await save(page);
    check(d.gems === gBefore, '★시계를 하루 뒤로: 추가 지급 0', `${d.gems}`);
    check(JSON.stringify(s.daily) === snapshot, '★시계를 하루 뒤로: daily 상태가 전혀 바뀌지 않는다', JSON.stringify(s.daily));

    // 되돌린 뒤 실제 날짜로 복귀 → 정상 지급(정직한 유저 보호)
    await page.goto(`${BASE}/__blank`, { waitUntil: 'load' });
    await boot(page, at(2026, 8, 20, 10));
    s = await save(page);
    check(s.daily.streak === 3, '되돌림 후 실제 다음날 복귀: 연속 유지되며 정상 지급', `${s.daily.streak}일`);

    // 하루 건너뜀 → 연속 끊김
    await page.goto(`${BASE}/__blank`, { waitUntil: 'load' });
    await boot(page, at(2026, 8, 25, 10));
    s = await save(page);
    check(s.daily.streak === 1 && s.daily.maxStreak === 3, '5일 공백: 연속 1로 리셋, maxStreak 3 보존',
      `streak=${s.daily.streak} max=${s.daily.maxStreak}`);
  });

  // ══ (C) DST — «진짜» 시간대를 바꾼다 ══════════════════════════════════════
  say('\n=== (C) DST (Playwright timezoneId = America/New_York) ===');
  await withCtx({ tag: 'C', timezoneId: 'America/New_York' }, async (page) => {
    await seed(page, null);
    const tz = await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
    check(tz === 'America/New_York', `★시간대가 «실제로» 바뀌었다(양성대조)`, tz);
    // 2026-03-08 이 DST 시작일: 03-07 20:00 EST(UTC-5) → 03-08 20:00 EDT(UTC-4) = 23시간 간격
    const t1 = Date.UTC(2026, 2, 8, 1, 0);   // 2026-03-07 20:00 EST
    const t2 = Date.UTC(2026, 2, 9, 0, 0);   // 2026-03-08 20:00 EDT
    const t3 = Date.UTC(2026, 2, 10, 0, 0);  // 2026-03-09 20:00 EDT
    check((t2 - t1) / 3600000 === 23, `대조: 두 시점 간격이 «23시간»이다(DST 를 실제로 밟는다)`, (t2 - t1) / 3600000);
    await boot(page, t1);
    let s = await save(page);
    check(s.daily.lastClaimDay === '2026-03-07' && s.daily.streak === 1, 'DST 전날: 3/07 · 연속 1일', `${s.daily.lastClaimDay}/${s.daily.streak}`);
    await page.goto(`${BASE}/__blank`, { waitUntil: 'load' }); await boot(page, t2);
    s = await save(page);
    check(s.daily.lastClaimDay === '2026-03-08' && s.daily.streak === 2,
      '★23시간짜리 날(봄 앞당김)에도 연속 2일 — 시차 때문에 하루를 건너뛰지 않는다', `${s.daily.lastClaimDay}/${s.daily.streak}`);
    await page.goto(`${BASE}/__blank`, { waitUntil: 'load' }); await boot(page, t3);
    s = await save(page);
    check(s.daily.streak === 3, 'DST 다음날도 연속 3일', s.daily.streak);
  });
  await withCtx({ tag: 'C2', timezoneId: 'America/New_York' }, async (page) => {
    await seed(page, null);
    // 2026-11-01 이 DST 종료일: 10-31 20:00 EDT(UTC-4) → 11-01 20:00 EST(UTC-5) = 25시간
    const t1 = Date.UTC(2026, 10, 1, 0, 0);   // 2026-10-31 20:00 EDT
    const t2 = Date.UTC(2026, 10, 2, 1, 0);   // 2026-11-01 20:00 EST
    check((t2 - t1) / 3600000 === 25, `대조: 간격이 «25시간»이다`, (t2 - t1) / 3600000);
    await boot(page, t1);
    await page.goto(`${BASE}/__blank`, { waitUntil: 'load' }); await boot(page, t2);
    const s = await save(page);
    check(s.daily.lastClaimDay === '2026-11-01' && s.daily.streak === 2,
      '★25시간짜리 날(가을 되돌림)에도 연속 2일 — 하루를 «두 번» 세지 않는다', `${s.daily.lastClaimDay}/${s.daily.streak}`);
  });

  // ══ (D) 저장소 불가 / 꽉 참 ══════════════════════════════════════════════
  say('\n=== (D) localStorage 불가 · 꽉 참 ===');
  const warnsD = [];
  await withCtx({ tag: 'D' }, async (page) => {
    page.on('console', (m) => { if (m.type() === 'warning') warnsD.push(m.text()); });
    await page.addInitScript(() => {
      // 「쓰기만» 막힌 환경(사파리 프라이빗·용량초과). 읽기는 된다 — 가장 함정인 조합이다.
      const real = window.localStorage;
      Object.defineProperty(window, 'localStorage', { configurable: true, get: () => ({
        getItem: (k) => real.getItem(k),
        setItem: () => { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; },
        removeItem: (k) => real.removeItem(k), clear: () => real.clear(), key: (i) => real.key(i),
        get length() { return real.length; },
      }) });
    });
    await page.goto(`${BASE}/?fx=1`, { waitUntil: 'load' });
    let alive = false;
    try { await page.waitForFunction(() => !!window.__debug, null, { timeout: 12000 }); alive = true; } catch { /* */ }
    check(alive, '★쓰기가 막혀도 게임이 «켜진다»');
    if (alive) {
      const d = await dbg(page);
      check(d.gems === 0, '★쓰기 불가 시 일일 보상을 지급하지 «않는다» (매 로드 재지급 방지)', d.gems);
      check(warnsD.some((w) => w.includes('저장소를 쓸 수 없어')), '이유가 콘솔 경고로 «드러난다»(조용한 실패 아님)',
        warnsD.filter((w) => w.includes('저장소')).length + '건');
    }
    await page.screenshot({ path: path.join(SHOTS, 'AFTER_storage_blocked_390x844.png') });
  });

  // ══ (E) 9개 로케일 × 360px 오버플로 ═══════════════════════════════════════
  say('\n=== (E) 9개 로케일 · 360px 토스트 오버플로 ===');
  const LOCALES = ['en-US', 'ko-KR', 'ja-JP', 'zh-CN', 'es-ES', 'pt-BR', 'de-DE', 'fr-FR', 'ru-RU'];
  const overflowRows = [];
  for (const loc of LOCALES) {
    await withCtx({ tag: `E:${loc}`, locale: loc, viewport: { width: 360, height: 640 } }, async (page) => {
      await seed(page, null);
      // 연속 5일(=최대 지급액)에서 «가장 긴 문자열»이 나온다. 그 최악을 잰다.
      await boot(page, at(2026, 8, 18));
      for (let i = 1; i <= 4; i++) { await page.goto(`${BASE}/__blank`, { waitUntil: 'load' }); await boot(page, at(2026, 8, 18 + i)); }
      await page.waitForTimeout(1200);
      const m = await page.evaluate(() => {
        const t = document.querySelector('.ar-toast.daily');
        if (!t) return null;
        const line = t;
        const cs = getComputedStyle(t);
        const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.35;
        return {
          text: t.textContent.trim().replace(/\s+/g, ' '),
          w: Math.round(t.getBoundingClientRect().width),
          right: Math.round(t.getBoundingClientRect().right),
          left: Math.round(t.getBoundingClientRect().left),
          vw: window.innerWidth,
          scrollOverflow: t.scrollWidth - t.clientWidth,
          // ★ 행수는 «패딩을 뺀» 내용 높이로 센다. 패딩(11px x2)을 포함해 나누면
          //   한 줄짜리도 2행으로 나온다 — 앞선 측정에서 실제로 그렇게 잘못 셌다.
          rows: Math.max(1, Math.round(
            (t.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)) / lh)),
        };
      });
      if (!m) { check(false, `[${loc}] 토스트를 찾지 못했다`); return; }
      const clipped = m.left < 0 || m.right > m.vw || m.scrollOverflow > 1;
      check(!clipped, `[${loc}] 오버플로 0 (폭 ${m.w}/${m.vw}px, 잘림 ${m.scrollOverflow}px, ${m.rows}행)`, `"${m.text}"`);
      overflowRows.push({ loc, ...m });
      await page.screenshot({ path: path.join(SHOTS, `AFTER_toast_${loc}_360x640.png`), clip: { x: 0, y: 0, width: 360, height: 260 } });
    });
  }
  say('  ── 로케일별 실측 ──');
  overflowRows.forEach((r) => say(`     ${r.loc.padEnd(6)} ${String(r.w).padStart(3)}px ${r.rows}행  "${r.text}"`));

  // ══ (F) FPS 같은-세션 A/B ════════════════════════════════════════════════
  say('\n=== (F) FPS 같은-세션 A/B (토스트 표시중 vs 사라진 뒤) ===');
  await withCtx({ tag: 'F', dsf: 1, viewport: { width: 390, height: 844 } }, async (page) => {
    await seed(page, null);
    await boot(page, at(2026, 8, 18));
    const measure = () => page.evaluate(() => new Promise((res) => {
      let n = 0; const t0 = performance.now();
      const tick = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(tick);
        else res({ fps: +(n / ((performance.now() - t0) / 1000)).toFixed(1), toast: !!document.querySelector('.ar-toast.daily') }); };
      requestAnimationFrame(tick);
    }));
    await page.waitForTimeout(700);
    const A = await measure();               // 토스트가 떠 있는 구간
    await page.waitForTimeout(4500);         // 소멸 대기
    const B = await measure();               // 토스트가 없는 구간
    say(`     A(토스트 ${A.toast ? '있음' : '없음'}) = ${A.fps} fps / B(토스트 ${B.toast ? '있음' : '없음'}) = ${B.fps} fps`);
    check(A.toast === true, '양성대조: A 구간에 토스트가 실제로 떠 있었다', A.toast);
    check(B.toast === false, '양성대조: B 구간엔 없었다', B.toast);
    check(A.fps >= 55 && B.fps >= 55, '두 구간 모두 55fps 이상', `${A.fps} / ${B.fps}`);
    check(B.fps - A.fps <= 3, '토스트로 인한 프레임 손실 ≤ 3fps', `${(B.fps - A.fps).toFixed(1)}fps`);
  });

  // ══ (H) 도감 진행바가 «살아났는지» ═══════════════════════════════════════
  say('\n=== (H) 도감 — 하늘(SPECIAL) 진행바가 움직인다 ===');
  await withCtx({ tag: 'H' }, async (page) => {
    await seed(page, null);
    await boot(page, at(2026, 8, 18));
    for (let i = 1; i <= 4; i++) { await page.goto(`${BASE}/__blank`, { waitUntil: 'load' }); await boot(page, at(2026, 8, 18 + i)); }
    await page.getByRole('button', { name: /도감/ }).click();
    await page.waitForTimeout(700);
    await page.locator('.ar-body').evaluate((n) => { n.scrollTop = n.scrollHeight; });
    await page.waitForTimeout(400);
    const conds = await page.$$eval('.ar-cond', (ns) => ns.map((n) => n.textContent.trim()));
    const login = conds.find((t) => t.includes('접속'));
    check(!!login && !/\b0\//.test(login), `★「${login}」 — 0 에서 «움직였다»`, JSON.stringify(conds));
    const bar = await page.$eval('.ar-crit.miss .ar-prog > i', (n) => n.style.width).catch(() => null);
    check(!!bar && bar !== '0%', `진행바 폭 ${bar}`, bar);
    await page.screenshot({ path: path.join(SHOTS, 'AFTER_roster_390x844.png') });
  });

  // ══ (I) 완전 신규 유저 — 조작 안내와 «겹치지 않는다» ═══════════════════════
  say('\n=== (I) 완전 신규(조작 안내 미시청) — 토스트 2장이 같은 자리에서 겹치는가 ===');
  await withCtx({ tag: 'I' }, async (page) => {
    // ★ ar.onb.seen 을 «심지 않는다». 조작 안내와 일일 보상이 동시에 발생하는 유일한 경로다.
    await page.goto(`${BASE}/__blank`, { waitUntil: 'load' });
    await page.evaluate(() => localStorage.clear());
    await boot(page, at(2026, 8, 18));
    const snap = () => page.evaluate(() => {
      const all = [...document.querySelectorAll('.ar-toast')];
      return all.map((t) => ({ daily: t.classList.contains('daily'), shown: t.classList.contains('in'),
        top: Math.round(t.getBoundingClientRect().top), h: Math.round(t.getBoundingClientRect().height) }));
    });
    const t0 = await snap();
    check(t0.filter((x) => x.shown).length <= 1,
      '★첫 프레임대: 화면에 «떠 있는» 토스트가 최대 1장', JSON.stringify(t0));
    check(t0.some((x) => !x.daily), '  이때 보이는 건 조작 안내다');
    await page.screenshot({ path: path.join(SHOTS, 'AFTER_new_user_hint_390x844.png') });
    // 조작 안내는 4.5초 뒤 사라진다. 그 뒤 보상 토스트가 «혼자» 떠야 한다.
    await page.waitForTimeout(6200);
    const t1 = await snap();
    check(t1.filter((x) => x.shown).length === 1 && t1.filter((x) => x.shown)[0].daily,
      '★안내가 사라진 뒤 보상 토스트가 «혼자» 뜬다', JSON.stringify(t1));
    await page.screenshot({ path: path.join(SHOTS, 'AFTER_new_user_daily_390x844.png') });
    const s = await save(page);
    check(s.daily.streak === 1 && s.gacha.gems > 0, '신규 유저도 D1 보상을 받는다(설계서 D1 누적 재현)',
      `연속 ${s.daily.streak}일 · 보석 ${s.gacha.gems}`);
  });

  // ══ (G) 콘솔 ═════════════════════════════════════════════════════════════
  say('\n=== (G) 콘솔 에러 ===');
  check(consoleErrs.length === 0, `콘솔 에러/페이지에러 0건`, consoleErrs.length);
  consoleErrs.forEach((e) => say(`     ${e}`));

  say(`\n=== 결과: ${fail === 0 ? 'ALL PASS' : `${fail} FAIL`} ===`);
  fs.writeFileSync(path.join(SHOTS, 'live_verify_log.txt'), lines.join('\n'), 'utf8');
  await browser.close();
  server.close();
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('HARNESS ERROR', e); server.close(); process.exit(2); });
