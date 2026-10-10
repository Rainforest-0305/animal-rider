// sky_crash_shots.cjs — 결함 A(추락문구 하드코딩) / 결함 B(하늘 가로타일링) 전후 실렌더 캡처.
// playwright 는 08_매칭앱 레인의 node_modules 를 «읽기만» 한다(설치 0).
//
// ★ 추락 유발 방식(실측으로 확정한 것):
//   ?auto=1 «지면=가속 / 공중=무입력» 정책은 «설계상 안 죽는다» — ff=90 을 돌려도
//   crashed=false 였다. 게다가 ?freeze=1 은 시뮬레이션을 멈추므로 키 입력도 안 먹는다.
//   ⇒ freeze 없이 Space 를 «누른 채로 유지»한다(공중 회전 누적 -> 착지 각도 불일치 -> 전복).
//   ⇒ keydown 을 반복하면 안 된다. 전복 상태에서의 keydown 은 startRun() 이라 런이 재시작된다.
const PW = 'C:/Users/USER/Downloads/20260802_Partner업무/08_매칭앱/build/web/node_modules/playwright';
const { chromium } = require(PW);
const path = require('path');
const fs = require('fs');

const OUT = process.argv[2];
const TAG = process.argv[3];                       // 'BEFORE' | 'AFTER'
const PORT = process.argv[4] || '5185';
const BASE = PORT.startsWith('http') ? PORT : `http://localhost:${PORT}/`;

const ZONES = ['meadow', 'forest', 'desert', 'snow', 'volcano', 'starry'];
const LOCALES = ['en', 'ko', 'ja', 'zh-Hans', 'es', 'pt-BR', 'de', 'fr', 'ru'];
const NAV = { en: 'en-US', ko: 'ko-KR', ja: 'ja-JP', 'zh-Hans': 'zh-CN', es: 'es-ES',
  'pt-BR': 'pt-BR', de: 'de-DE', fr: 'fr-FR', ru: 'ru-RU' };

fs.mkdirSync(OUT, { recursive: true });

// ★ 측정 문자열은 «로케일 파일에서 직접 읽는다». 하네스에 다시 적으면 그게 틀렸을 때
//   측정이 통과해 버린다(테스트가 틀린 값을 고정하는 실패형).
const MSG_DIR = path.join(__dirname, '..', 'src', 'i18n', 'messages');
const FILE_OF = { en: 'en.ts', ko: 'ko.ts', ja: 'ja.ts', 'zh-Hans': 'zh-Hans.ts', es: 'es.ts',
  'pt-BR': 'pt-BR.ts', de: 'de.ts', fr: 'fr.ts', ru: 'ru.ts' };
const LOCALE_TEXT = {};
for (const [loc, f] of Object.entries(FILE_OF)) {
  const src = fs.readFileSync(path.join(MSG_DIR, f), 'utf8');
  const pick = (k) => {
    const m = src.match(new RegExp(`'${k.replace('.', '\\.')}':\\s*'([^']*)'`));
    return m ? m[1] : null;
  };
  LOCALE_TEXT[loc] = { title: pick('landing.crash'), hint: pick('crash.restart') };
  if (!LOCALE_TEXT[loc].title || !LOCALE_TEXT[loc].hint) {
    console.log(`!! ${loc}: 키 누락 ${JSON.stringify(LOCALE_TEXT[loc])}`);
  }
}

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const notes = [];

  const open = async (w, h, locale) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: h },
      deviceScaleFactor: 1, locale: NAV[locale] || 'en-US' });
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`${w}x${h}/${locale}: ${m.text()}`); });
    page.on('pageerror', (e) => errors.push(`${w}x${h}/${locale}: PAGEERROR ${e.message}`));
    await page.addInitScript(() => { try { localStorage.setItem('ar.onb.seen', '1'); } catch {} });
    return { ctx, page };
  };

  // ── ① 존 배경: 6존 × (1920x1080, 390x844) × (ff=0, ff=2) ────────────────
  for (const z of ZONES) {
    for (const [w, h] of [[1920, 1080], [390, 844]]) {
      for (const ff of [0, 2]) {
        const { ctx, page } = await open(w, h, 'en');
        const q = `?zone=${z}&freeze=1${ff ? `&auto=1&ff=${ff}` : ''}`;
        await page.goto(BASE + q, { waitUntil: 'networkidle' });
        await page.waitForTimeout(5200); // 일일보상 토스트가 사라질 때까지
        const st = await page.evaluate(() => {
          const d = window.__debug || {};
          return { zone: d.zoneId, ready: `${d.zoneAssetsReady}/${d.zoneAssetsTotal}`,
            imgs: d.zoneUsingImages, worldX: Math.round(d.worldX || 0) };
        });
        notes.push(`${TAG} zone ${z} ${w}x${h} ff=${ff} -> ${JSON.stringify(st)}`);
        await page.screenshot({ path: path.join(OUT, `${TAG}_zone-${z}_${w}x${h}_ff${ff}.png`) });
        await ctx.close();
      }
    }
  }

  // ── ② 추락 화면: 9개 로케일 ────────────────────────────────────────────
  const crashShot = async (locale, w, h) => {
    const { ctx, page } = await open(w, h, locale);
    await page.goto(BASE + '?freeze=0', { waitUntil: 'networkidle' });
    await page.waitForTimeout(5200); // 토스트 소멸 대기
    await page.keyboard.down('Space');
    let crashed = false;
    for (let i = 0; i < 60 && !crashed; i++) {
      await page.waitForTimeout(400);
      crashed = await page.evaluate(() => !!(window.__debug && window.__debug.crashed));
    }
    await page.keyboard.up('Space');
    await page.waitForTimeout(400);
    // ★ 캔버스 fillText 는 «폭 제한이 없다». 실제 그려지는 폭을 같은 폰트로 재서
    //   화면 밖으로 나가는지(넘침) 값으로 확인한다 — 눈으로만 보면 놓친다.
    const m = await page.evaluate((texts) => {
      const c = document.querySelector('canvas');
      const g = c.getContext('2d');
      const vw = c.clientWidth;
      const measure = (font, s) => { g.save(); g.font = font; const w = g.measureText(s).width; g.restore(); return w; };
      const titleFont = `bold ${Math.round(Math.min(46, vw * 0.1))}px system-ui, sans-serif`;
      const hintFont = `${Math.round(Math.min(17, vw * 0.04))}px system-ui, sans-serif`;
      const titleW = texts ? Math.round(measure(titleFont, texts.title)) : null;
      const hintW = texts ? Math.round(measure(hintFont, texts.hint)) : null;
      // 캔버스 textAlign=center 라 «폭이 viewW 를 넘으면» 좌우가 잘린다.
      return { vw, titleFont, hintFont, texts, titleW, hintW,
        overflow: (titleW > vw) || (hintW > vw) };
    }, LOCALE_TEXT[locale]);
    notes.push(`${TAG} crash ${locale} ${w}x${h} crashed=${crashed} ${JSON.stringify(m)}`);
    await page.screenshot({ path: path.join(OUT, `${TAG}_crash-${locale}_${w}x${h}.png`) });
    await ctx.close();
    return crashed;
  };

  for (const l of LOCALES) await crashShot(l, 390, 844);
  await crashShot('en', 1920, 1080);
  await crashShot('de', 1920, 1080);

  await browser.close();
  fs.writeFileSync(path.join(OUT, `${TAG}_notes.txt`), notes.join('\n') + '\n', 'utf8');
  console.log(notes.join('\n'));
  console.log(`[${TAG}] 콘솔에러 ${errors.length}건`);
  errors.forEach((e) => console.log('  ' + e));
})();
