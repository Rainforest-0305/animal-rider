// sky_fps_ab.cjs — 하늘 렌더 경로 수정의 «60fps 회귀» 측정.
// 같은 세션·같은 입력(?auto=1)·같은 해상도로 프레임 간격을 모아 avg/p50/p95/worst 를 낸다.
// ★ 한 번 재는 걸로 판정하지 않는다 — REPEAT 회 반복해 중앙값을 본다(노트북 부하가 튄다).
const PW = 'C:/Users/USER/Downloads/20260802_Partner업무/08_매칭앱/build/web/node_modules/playwright';
const { chromium } = require(PW);

const TAG = process.argv[2] || 'RUN';
const PORT = process.argv[3] || '5185';
const REPEAT = Number(process.argv[4] || 3);
const ZONES = ['meadow', 'volcano'];   // 밝은 존 / 무거운 존
const SIZES = [[1920, 1080], [390, 844]];
const SAMPLE_MS = 6000;

const pct = (a, p) => a.length ? a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))] : NaN;

(async () => {
  // ★ 헤드리스 1920 은 rAF 가 30Hz 로 «고정»된다(BEFORE/AFTER 둘 다 p50=33.3ms).
//   그 상태로는 렌더 «비용»이 안 보인다 — vsync 를 풀어 실제 처리량을 잰다.
const browser = await chromium.launch({ args: ['--disable-gpu-vsync', '--disable-frame-rate-limit'] });
  const rows = [];
  for (const z of ZONES) {
    for (const [w, h] of SIZES) {
      const runs = [];
      for (let r = 0; r < REPEAT; r++) {
        const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale: 'en-US' });
        const page = await ctx.newPage();
        await page.addInitScript(() => { try { localStorage.setItem('ar.onb.seen', '1'); } catch {} });
        await page.goto(`http://localhost:${PORT}/?zone=${z}&auto=1`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(2500); // 에셋 디코드·워밍업이 측정에 섞이지 않게
        const d = await page.evaluate((ms) => new Promise((res) => {
          const out = []; let last = performance.now(); const t0 = last;
          const tick = (t) => { out.push(t - last); last = t;
            if (t - t0 < ms) requestAnimationFrame(tick); else res(out.slice(5)); };
          requestAnimationFrame(tick);
        }), SAMPLE_MS);
        runs.push(d);
        await ctx.close();
      }
      // 반복 중 «중앙값 런» 하나를 대표로 쓴다
      const byAvg = runs.map((d) => ({ d, avg: d.reduce((a, b) => a + b, 0) / d.length }))
        .sort((a, b) => a.avg - b.avg);
      const rep = byAvg[Math.floor(byAvg.length / 2)].d;
      rows.push({ zone: z, size: `${w}x${h}`, n: rep.length,
        avg: +(rep.reduce((a, b) => a + b, 0) / rep.length).toFixed(2),
        fps: +(1000 / (rep.reduce((a, b) => a + b, 0) / rep.length)).toFixed(1),
        p50: +pct(rep, 0.5).toFixed(2), p95: +pct(rep, 0.95).toFixed(2),
        worst: +Math.max(...rep).toFixed(2),
        over20ms: rep.filter((x) => x > 20).length });
    }
  }
  await browser.close();
  for (const r of rows) console.log(`${TAG} ${r.zone.padEnd(8)} ${r.size.padEnd(9)} n=${r.n} avg=${r.avg}ms(${r.fps}fps) p50=${r.p50} p95=${r.p95} worst=${r.worst} >20ms=${r.over20ms}`);
})();
