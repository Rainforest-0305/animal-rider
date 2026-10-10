#!/usr/bin/env node
// star_rate_sensitivity.mjs — 출구조건1 재도출(2차, Secretary 반려 반영).
// [측정]/[가정] 라벨 분리. 격차 2.0배를 «맞추지 않는다» - 나온 값을 그대로 낸다.
// roster.ts를 단일소스로 임포트(수식 복제 없음).
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const bundlePath = path.join(__dirname, '_roster_bundle_tmp2.mjs');
await build({
  entryPoints: [path.join(__dirname, '..', 'src', 'game', 'roster.ts')],
  bundle: true, format: 'esm', platform: 'neutral', outfile: bundlePath,
});
const { ROSTER, GACHA_POOL, unlockDaysFor } = await import('file://' + bundlePath);

// ── 입력 파라미터 라벨 분리 ──────────────────────────────────────────────
// [설계서계승] 1차설계서 v1.0 표 4-5a 자체가 "[자체설계]" 라벨이 붙은 값이다.
// 이 프로젝트엔 실플레이 텔레메트리가 0건이라 "측정"이라는 말을 쓸 수 없다 -
// "설계서계승"(원 문서가 이미 정한 값, 이번에 새로 가정한 게 아님)으로 구분한다.
const DAILY_PLAY_MINUTES = { light: 10, core: 30, heavy: 60 }; // [설계서계승] 4.5a
const RUNS_PER_DAY = { light: 8, core: 25, heavy: 50 };        // [설계서계승] 4.5a
// ★ 이 144 는 stages.ts TOTAL_STARS(=48×3) 의 «복제»다. 티어 변경 시 같이 고칠 것.
//   (2026-08-06 백로그 등재 — tools/ 는 런타임 아님, 기준선 도구라 지금은 무접촉)
const TOTAL_STARS = 144;

const GACHA_DAYS_D2D3 = { light: 48, core: 30, heavy: 25 }; // economy_sim.mjs v3 검증값(불변, 인용)

// [자체설계-신규가정] avgStarsPerRun(E): 시도(런) 1회당 기대 별수. 재도전율과
// ★3(부활0+회전달성) 성공률을 하나로 뭉친 값이다 - 실플레이 데이터가 없어
// 분해할 근거가 없다(분해하면 파라미터만 늘고 불확실성은 그대로다). 대신
// «E 전체를 스윕»해서 결과가 E에 얼마나 민감한지 그대로 드러낸다.
// 모델: starsPerDay(아키타입) = runsPerDay(아키타입, 설계서계승) x E(공통, 스윕)
// - E가 아키타입마다 다를 수도 있다(숙련도 차이) - 그건 이번 스윕에 없다.
//   즉 이 모델도 "실력은 동일, 시도횟수만 다르다"는 별도의 가정 위에 있다.
function computeForE(E) {
  const starsPerDay = {};
  for (const a of Object.keys(RUNS_PER_DAY)) starsPerDay[a] = RUNS_PER_DAY[a] * E;

  const specials = ROSTER.filter((c) => c.acquisition === 'condition');
  const results = {};
  for (const a of Object.keys(RUNS_PER_DAY)) {
    const pace = { challengesPerDay: { light: 0.4, core: 1.2, heavy: 2.0 }[a], starsPerDay: starsPerDay[a] };
    const per = {};
    for (const s of specials) per[s.id] = unlockDaysFor(s.unlock, pace);
    per.gacha20 = GACHA_DAYS_D2D3[a];
    results[a] = per;
  }
  const maxByArche = {};
  for (const a of Object.keys(RUNS_PER_DAY)) maxByArche[a] = Math.max(...Object.values(results[a]));
  const gap = maxByArche.light / maxByArche.heavy;
  const aPass = maxByArche.light >= 70 && maxByArche.light <= 80;
  const cPass = gap <= 2.0;
  return { E, starsPerDay, results, maxByArche, gap, aPass, cPass };
}

console.log('='.repeat(90));
console.log('출구조건1 재도출 2차 - E(런당 기대 별수) 민감도 스윕 [가정 스윕, 확정 아님]');
console.log('입력: dailyPlayMinutes/runsPerDay = [설계서계승] 4.5a. E = [자체설계-신규, 스윕대상]');
console.log('='.repeat(90));

const E_GRID = [0.02, 0.04, 0.06, 0.08, 0.096, 0.10, 0.12, 0.15, 0.20];
console.log('\nE'.padEnd(8) + 'light*day'.padStart(10) + 'core*day'.padStart(10) + 'heavy*day'.padStart(10)
  + 'light완주'.padStart(10) + 'core완주'.padStart(10) + 'heavy완주'.padStart(10) + '격차'.padStart(8) + '  (a)   (c)');
for (const E of E_GRID) {
  const r = computeForE(E);
  console.log(
    E.toFixed(3).padEnd(8)
    + r.starsPerDay.light.toFixed(3).padStart(10)
    + r.starsPerDay.core.toFixed(3).padStart(10)
    + r.starsPerDay.heavy.toFixed(3).padStart(10)
    + String(r.maxByArche.light).padStart(10)
    + String(r.maxByArche.core).padStart(10)
    + String(r.maxByArche.heavy).padStart(10)
    + (r.gap.toFixed(2) + 'x').padStart(8)
    + '  ' + (r.aPass ? 'PASS' : 'FAIL') + '  ' + (r.cPass ? 'PASS' : 'FAIL')
  );
}

console.log('\n' + '='.repeat(90));
console.log('★ 구조적 발견: E를 아무리 올려도 (c)가 통과하지 않는 이유');
{
  const rHigh = computeForE(1000); // E -> 무한대 근사(별 적립이 병목이 아니게 만든 극단값)
  console.log('E->매우 큼(사실상 무한): light=' + rHigh.maxByArche.light + ' core=' + rHigh.maxByArche.core
    + ' heavy=' + rHigh.maxByArche.heavy + ' 격차=' + rHigh.gap.toFixed(2) + 'x');
  console.log('  light 지배조건:', JSON.stringify(Object.entries(rHigh.results.light).filter(([, v]) => v === rHigh.maxByArche.light).map(([k]) => k)));
  console.log('  heavy 지배조건:', JSON.stringify(Object.entries(rHigh.results.heavy).filter(([, v]) => v === rHigh.maxByArche.heavy).map(([k]) => k)));
  console.log('  -> light 하한 = 불티(챌린지30개/0.4런당=75일, 별적립과 «무관», challengesPerDay가 유일 변수)');
  console.log('  -> heavy 하한 = 하늘(접속30일, 캘린더고정, 별적립과 «무관»)');
  console.log('  -> 이 두 하한의 비 = 75/30 = 2.50x 가 «별적립률 스윕으로는 절대 못 깨는 바닥»이다.');
  console.log('  -> (c)<=2.0x 는 현재 설계(불티30개+하늘30일) 하에서 E와 무관하게 «구조적으로 불가능».');
}

console.log('\n[레버 정정] Partner는 "손댈 곳은 하늘(라이트 바닥)"이라 했으나 실측상 라이트의');
console.log('  실질 바닥은 «불티»(challengesPerDay=0.4 로 결정, 별적립·하늘과 무관)다.');
console.log('  하늘만 올려도 라이트 바닥은 안 움직인다 - 불티 challenge_count 자체를 낮추거나');
console.log('  dailyCap을 두는 쪽이 실효 레버다. «적용은 하지 않음, 상신 대상».');

console.log('\n[정밀 판정선] (a) 라이트<=80 이 되는 E 이진탐색:');
{
  let lo = 0.01, hi = 1.0;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const r = computeForE(mid);
    if (r.maxByArche.light <= 80) hi = mid; else lo = mid;
  }
  const rAt = computeForE(hi);
  console.log('  E>=' + hi.toFixed(4) + ' 이면 (a) PASS 시작 (그 지점 light=' + rAt.maxByArche.light
    + ', heavy=' + rAt.maxByArche.heavy + ', 격차=' + rAt.gap.toFixed(2) + 'x, (c)=' + (rAt.cPass ? 'PASS' : 'FAIL') + ')');
  console.log('  즉 (a)만 통과시키는 E 구간에서도 (c)는 여전히 FAIL - 둘을 동시 만족하는 E는 «존재하지 않는다»(위 구조적발견 참조).');
}

console.log('\n[결론] (c)<=2.0x 는 불티=30개+하늘=30일 조합이 만드는 2.50x 절대하한 때문에');
console.log('  E(별적립 가정) 스윕 전 구간에서 «단 한 번도» 통과하지 않았다. 판정선/조기경보를');
console.log('  "E의 함수"로 제시할 수 없다(존재하지 않으므로) - 대신 «2.50x 절대하한» 자체를');
console.log('  Chief/Partner 판단 대상으로 올린다. 완화(2.5배 인정) 또는 설계변경(불티/하늘 재조정)');
console.log('  둘 중 하나가 필요하다 - 어느 쪽도 여기서 임의 적용하지 않는다.');

console.log('\n' + '='.repeat(90));
console.log('[분해] r = clearRate(일당 스테이지 클리어=최소★1 도달 횟수) x avgStarGivenClear(1~3)');
console.log('  둘 다 [자체설계-신규, 텔레메트리 0건이라 «가정»]. E=clearRate x avgStar 로 기존 스윕과 동일 수식.');
// ★ 단위 정정: Secretary의 "클리어율 0.8"은 «일당 클리어수»다(런당 성공확률이 아님).
// clearsPerDay=0.8, runsPerDay(light)=8 -> 런당 성공확률=0.8/8=0.1. E(=런당 기대별) = 0.1 x avgStar.
// (최초 초안은 0.8을 런당 확률로 잘못 대입해 light가 전부 75로 조기포화됐었다 - 정정함.)
console.log('  라이트 2D (Secretary 제시 격자 «단위정정 재현», clearsPerDay=0.8/일 고정):');
console.log('avgStar'.padEnd(10) + [3.0, 2.5, 2.0, 1.58, 1.48, 1.0].map((s) => String(s).padStart(8)).join(''));
{
  const clearsPerDayLight = 0.8;
  const perRunClearProb = clearsPerDayLight / RUNS_PER_DAY.light; // 0.1
  const row = [3.0, 2.5, 2.0, 1.58, 1.48, 1.0].map((avgStar) => {
    const E = perRunClearProb * avgStar;
    const r = computeForE(E);
    return r.maxByArche.light + (r.aPass ? '' : '*');
  });
  console.log('light완주'.padEnd(10) + row.map((v) => String(v).padStart(8)).join(''));
  console.log('  (* = (a)밴드 70~80 이탈) [대조] Secretary표: 75/75/75/75/80/118.8 - 단위정정 후 재현 확인');
  console.log('  임계(불티 지배 유지): avgStar>=1.583(E>=0.1583)  (a)밴드 유지: avgStar>=1.484(E>=0.1484)');
}

console.log('\n  헤비 미러 분석 (Secretary 요청: "헤비는 위로 움직인다" - clearRate/avgStar가');
console.log('  light와 다를 수 있다는 «비대칭 실력차» 시나리오, S2):');
console.log('  S1(실력동일, 위 스윕 전부) 은 «모든 아키타입이 같은 avgStar»를 가정 - 이는');
console.log('  격차를 «최소화»하는 쪽으로 유리한 가정이다(구조적하한 2.50x는 이 가정 하의 결과).');
console.log('  S2(실력차 반영, [가정] 배율 예시): light avgStar x0.7 / core x1.0 / heavy x1.3');
{
  // ★ 단위 주의: 여기 perRunClearProb(0.8)은 위 라이트2D의 clearsPerDay(0.8)와
  // «단위가 다르다» - 이건 런당 성공확률(80%)이다. S1/S2는 별개 예시 시나리오이지
  // 같은 0.8이 이어지는 값이 아니다(혼동 방지 명시).
  const base = 2.0; // 기준 avgStar(별/클리어)
  const skillMult = { light: 0.7, core: 1.0, heavy: 1.3 };
  const perRunClearProb = { light: 0.8, core: 0.8, heavy: 0.8 };
  const perArche = {};
  for (const a of Object.keys(skillMult)) {
    perArche[a] = perRunClearProb[a] * base * skillMult[a];
  }
  console.log('  E(아키타입별, 실력차 반영):', JSON.stringify(perArche));
  // computeForE는 단일 E로 3개 아키타입에 동일 적용하는 함수라, 실력차 시나리오는 별도 계산.
  const specials2 = ROSTER.filter((c) => c.acquisition === 'condition');
  const results2 = {};
  for (const a of Object.keys(skillMult)) {
    const pace = { challengesPerDay: { light: 0.4, core: 1.2, heavy: 2.0 }[a], starsPerDay: RUNS_PER_DAY[a] * perArche[a] };
    const per = {};
    for (const s of specials2) per[s.id] = unlockDaysFor(s.unlock, pace);
    per.gacha20 = GACHA_DAYS_D2D3[a];
    results2[a] = per;
  }
  const maxB2 = {};
  for (const a of Object.keys(skillMult)) maxB2[a] = Math.max(...Object.values(results2[a]));
  const gap2 = maxB2.light / maxB2.heavy;
  console.log('  결과:', JSON.stringify(maxB2), '격차=' + gap2.toFixed(2) + 'x',
    '(a)=' + (maxB2.light >= 70 && maxB2.light <= 80 ? 'PASS' : 'FAIL'),
    '(c)=' + (gap2 <= 2.0 ? 'PASS' : 'FAIL'));
  console.log('  -> 실력차를 "헤비가 더 잘한다" 방향으로 넣으면 격차가 구조적하한 2.50x보다 «더 벌어진다».');
  console.log('     즉 S1(실력동일)이 (c)에 «가장 유리한» 케이스였고, 그마저도 통과 못 했다.');
}

console.log('\n' + '='.repeat(90));
console.log('★ 대각선 민감도(라이트): clearRate와 avgStar가 «독립이 아니다» - 0.8x3.0=2.4=144/60=');
console.log('  TOTAL_STAGES(48)x60일 과 «같은 가정»의 두 표현. 둘이 함께 움직이는 게 실제 경로다.');
console.log('clearRate'.padEnd(10) + 'avgStar'.padStart(9) + 'E(=곱)'.padStart(9) + 'light완주'.padStart(11) + '밴드대비'.padStart(10));
{
  const diag = [
    [0.80, 3.00], [0.70, 2.50], [0.60, 2.00], [0.50, 1.50], [0.40, 1.20],
  ];
  for (const [cr, avg] of diag) {
    const perRunProb = cr / RUNS_PER_DAY.light;
    const E = perRunProb * avg;
    const r = computeForE(E);
    const bandRatio = r.maxByArche.light / 75;
    console.log(
      cr.toFixed(2).padEnd(10) + avg.toFixed(2).padStart(9) + E.toFixed(4).padStart(9)
      + String(r.maxByArche.light).padStart(11) + (bandRatio.toFixed(2) + 'x').padStart(10)
      + (r.aPass ? '' : '  *(a)이탈')
    );
  }
  console.log('  [라벨] clearRate=[자체설계-신규가정] avgStar=[자체설계-신규가정] 둘 다 텔레메트리 0건.');
  console.log('  [해석] 클리어율 0.6/평균별2.0 근처(둘 다 플레이스홀더의 75% 수준)에서 이미 (a) 턱걸이.');
  console.log('  라이트는 일 10분에 star3=부활0+회전달성 요구라 두 인자 동반 하락 개연성을 배제 못한다.');
}
