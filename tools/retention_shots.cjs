// retention_shots.cjs — 리텐션 장치 전/후 실렌더 캡처.
// playwright 는 08_매칭앱 레인의 node_modules 를 «읽기만» 한다(설치 0).
const PW = 'C:/Users/USER/Downloads/20260802_Partner업무/08_매칭앱/build/web/node_modules/playwright';
const { chromium } = require(PW);
const path = require('path');

const OUT = process.argv[2];        // 출력 폴더
const TAG = process.argv[3];        // 'BEFORE' | 'AFTER'
const URL = 'http://localhost:5183/';

// v1 세이브(기존 유저 대조군) — 별 12·보석 600·미보유
const V1_SAVE = JSON.stringify({
  v: 1, savedAt: 1787000000000,
  starsByStage: { 'Easy-1':1,'Easy-2':1,'Easy-3':1,'Easy-4':1,'Easy-5':1,'Easy-6':1,
                  'Easy-7':1,'Easy-8':1,'Easy-9':1,'Easy-10':1,'Moderate1-1':1,'Moderate1-2':1 },
  gacha: { gems: 600, ownedIds: [], drawsCompleted: 0 },
  conditionCounters: { login_streak: 0, challenge_count: 0, customization_categories: 0 },
  collectionMode: 'full_roster_24',
});

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const shot = async (name, w, h, fn, opts = {}) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2,
      locale: opts.locale || 'ko-KR' });
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`${name}: ${m.text()}`); });
    page.on('pageerror', (e) => errors.push(`${name}: PAGEERROR ${e.message}`));
    await page.addInitScript((s) => {
      try { localStorage.setItem('ar.save', s); localStorage.setItem('ar.onb.seen', '1'); } catch {}
    }, V1_SAVE);
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);
    if (fn) await fn(page);
    await page.screenshot({ path: path.join(OUT, `${TAG}_${name}_${w}x${h}.png`) });
    await ctx.close();
  };

  // ① 인게임 HUD (보석 잔액이 보이는 화면)
  await shot('hud', 390, 844, null);
  // ② 도감 — SPECIAL 하늘의 「접속 n/30일」 진행바
  await shot('roster', 390, 844, async (page) => {
    await page.getByRole('button', { name: /도감/ }).click();
    await page.waitForTimeout(700);
    await page.locator('.ar-body').evaluate((n) => { n.scrollTop = n.scrollHeight; });
    await page.waitForTimeout(400);
  });
  // ③ 360px 최소폭 도감
  await shot('roster_min', 360, 640, async (page) => {
    await page.getByRole('button', { name: /도감/ }).click();
    await page.waitForTimeout(700);
    await page.locator('.ar-body').evaluate((n) => { n.scrollTop = n.scrollHeight; });
    await page.waitForTimeout(400);
  });

  await browser.close();
  console.log(`[${TAG}] 콘솔에러 ${errors.length}건`);
  errors.forEach((e) => console.log('  ' + e));
})();
