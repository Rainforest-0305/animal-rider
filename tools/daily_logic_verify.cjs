// daily_logic_verify.cjs — src/daily.ts 순수 로직 검증(브라우저 없음).
//
// ★ 규율: 기대값을 «문자 그대로 박지 않는다». 200/230/320 같은 숫자를 적어 두면
//   상수를 고쳐도 테스트가 통과해 틀린 값을 «고정»해 버린다(조직 실사고 이력).
//   전부 DAILY_BASE_GEMS / DAILY_STREAK_STEP / DAILY_STREAK_BONUS_CAP 에서 «유도»한다.
//
// 실행: node tools/daily_logic_verify.cjs        (cwd = build/animal-stunt)
//       TZ=America/New_York node tools/daily_logic_verify.cjs   ← DST 구간 재실행
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src', 'daily.ts');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ar-daily-'));
const OUT = path.join(TMP, 'daily.cjs');

// daily.ts 는 import 가 «0건»이라 번들 없이 타입만 벗기면 그대로 돌아간다.
// (esbuild CLI 대신 노드 API 를 쓴다 — 윈도우에서 .cmd 를 spawn 하면 EINVAL)
const esbuild = require(path.join(ROOT, 'node_modules', 'esbuild'));
const srcText = fs.readFileSync(SRC, 'utf8');
// ★ 양성대조: 이 파일이 정말 «import 0건»이라는 전제가 깨지면 조용히 틀린 걸
//   테스트하게 된다. 전제를 여기서 확인하고 깨지면 즉시 멈춘다.
if (/^\s*import\s/m.test(srcText)) {
  console.error('FATAL: src/daily.ts 에 import 가 생겼다 — 이 하네스의 트랜스파일 전제가 깨졌다.');
  process.exit(3);
}
fs.writeFileSync(OUT, esbuild.transformSync(srcText, { loader: 'ts', format: 'cjs' }).code, 'utf8');
const D = require(OUT);

const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone; // ★ «실제로» 적용된 시간대
const TZ_ENV = process.env.TZ;
let fail = 0;
const lines = [];
function say(s) { console.log(s); lines.push(s); }
function check(ok, msg, extra) {
  say(`  ${ok ? 'OK  ' : 'FAIL'} ${msg}${extra !== undefined ? `  → ${extra}` : ''}`);
  if (!ok) fail++;
}
/** 로컬 시각으로 epoch ms 를 만든다(테스트가 시간대에 끌려다니지 않게 명시적으로). */
function localMs(y, m, d, hh = 12, mm = 0, ss = 0) {
  return new Date(y, m - 1, d, hh, mm, ss, 0).getTime();
}
function eqState(a, b) {
  return a.lastClaimDay === b.lastClaimDay && a.lastClaimAtMs === b.lastClaimAtMs
    && a.streak === b.streak && a.maxStreak === b.maxStreak;
}

say(`=== daily.ts 순수 로직 검증 (실제 적용 시간대=${TZ}) ===`);
if (TZ_ENV && TZ_ENV !== TZ) {
  say(`  ⚠️ TZ 환경변수(${TZ_ENV})가 «먹지 않았다» — 실제 적용은 ${TZ} 다. DST 항목은 SKIP 된다.`);
} else if (!TZ_ENV) {
  say(`  ⚠️ TZ 환경변수가 런타임에 전달되지 않는 환경이다(process.env.TZ=undefined).`);
}
say(`상수: BASE=${D.DAILY_BASE_GEMS} STEP=${D.DAILY_STREAK_STEP} CAP=${D.DAILY_STREAK_BONUS_CAP} MAX=${D.DAILY_MAX_GEMS}`);

// ── ① 지급액 수식 — 전부 상수에서 «유도» ────────────────────────────────────
say('\n[①] 지급액 수식 (1차설계서 4.3: 200 + min(120, 30 x (연속일-1)))');
const BASE = D.DAILY_BASE_GEMS, STEP = D.DAILY_STREAK_STEP, CAP = D.DAILY_STREAK_BONUS_CAP;
check(D.DAILY_MAX_GEMS === BASE + CAP, '파생 MAX = BASE + CAP', D.DAILY_MAX_GEMS);
check(D.dailyGemsForStreak(1) === BASE, '연속 1일 = BASE', D.dailyGemsForStreak(1));
check(D.dailyGemsForStreak(2) === BASE + STEP, '연속 2일 = BASE + STEP', D.dailyGemsForStreak(2));
const capDay = 1 + CAP / STEP; // 증가분이 상한에 «정확히 닿는» 첫 날 (유도값)
check(Number.isInteger(capDay), `상한 도달일이 정수다(CAP/STEP)`, capDay);
check(D.dailyGemsForStreak(capDay) === D.DAILY_MAX_GEMS, `연속 ${capDay}일 = MAX`, D.dailyGemsForStreak(capDay));
check(D.dailyGemsForStreak(capDay - 1) < D.DAILY_MAX_GEMS, `연속 ${capDay - 1}일 < MAX`, D.dailyGemsForStreak(capDay - 1));
let mono = true, over = false, prev = -1;
for (let n = 1; n <= 400; n++) {
  const g = D.dailyGemsForStreak(n);
  if (g < prev) mono = false;
  if (g > D.DAILY_MAX_GEMS) over = true;
  prev = g;
}
check(mono, '연속일이 늘 때 지급액이 줄지 않는다(1..400)');
check(!over, 'MAX 를 넘는 지급액이 없다(1..400)');
check(D.dailyGemsForStreak(0) === BASE && D.dailyGemsForStreak(-9) === BASE, '연속일 0/음수는 1일로 클램프(0원 조용히 지급 금지)');
// economy_sim.mjs 의 원식과 «값이 같은지» 교차검증(수식 복제 어긋남 탐지)
let simMatch = true;
for (let n = 1; n <= 60; n++) {
  const sim = Math.min(BASE + Math.min(CAP, STEP * (n - 1)), BASE + CAP);
  if (sim !== D.dailyGemsForStreak(n)) simMatch = false;
}
check(simMatch, 'tools/economy_sim.mjs dailyLetterSetGross 와 1..60 전 구간 값 일치');

// ── ② 날짜 키 ────────────────────────────────────────────────────────────────
say('\n[②] 날짜 키 / 달력 일수');
check(D.dayKeyOf(localMs(2026, 8, 18, 0, 0, 0)) === '2026-08-18', '자정 직후 = 그날 키');
check(D.dayKeyOf(localMs(2026, 8, 18, 23, 59, 59)) === '2026-08-18', '자정 직전 = 그날 키');
check(D.dayKeyOf(localMs(2026, 1, 5)) === '2026-01-05', '한자리 월/일 0 패딩');
check(!D.isDayKey('2026-8-18') && !D.isDayKey('') && !D.isDayKey(null) && !D.isDayKey(20260818),
  '형식이 아닌 값은 날짜 키가 아니다');
check(Number.isNaN(D.dayNumberOf('nope')), '깨진 키 → NaN(판정 불가로 드러난다)');
const boundaries = [
  ['연 경계', '2026-12-31', '2027-01-01'],
  ['월 경계', '2026-08-31', '2026-09-01'],
  ['윤년 2/28→2/29', '2028-02-28', '2028-02-29'],
  ['윤년 2/29→3/01', '2028-02-29', '2028-03-01'],
  ['평년 2/28→3/01', '2026-02-28', '2026-03-01'],
];
for (const [name, a, b] of boundaries) {
  const diff = D.dayNumberOf(b) - D.dayNumberOf(a);
  check(diff === 1, `${name}: ${a} → ${b} 는 1일`, diff);
}

// ── ③ 롤오버 판정 ───────────────────────────────────────────────────────────
say('\n[③] 롤오버 판정');
const fresh = D.emptyDailyState();
const first = D.evaluateDaily(fresh, localMs(2026, 8, 18, 9));
check(first.outcome === 'granted' && first.streak === 1 && first.gems === BASE,
  '신규 유저: 첫 지급 = 연속 1일 · BASE', `${first.outcome}/${first.streak}/${first.gems}`);
check(first.streakBroken === false, '첫 지급은 「끊김」이 아니다');

const already = D.evaluateDaily(first.next, localMs(2026, 8, 18, 23, 59, 59));
check(already.outcome === 'already' && already.gems === 0, '같은 날 재접속: 무지급', already.outcome);
check(eqState(already.next, first.next), '같은 날 재접속: 상태 불변');

// ★ 자정 경계 — 23:59:59 에 받고 00:00:01 에 다시 켠다
const midnight = D.evaluateDaily(
  D.evaluateDaily(fresh, localMs(2026, 8, 18, 23, 59, 59)).next,
  localMs(2026, 8, 19, 0, 0, 1)
);
check(midnight.outcome === 'granted' && midnight.streak === 2 && midnight.gems === BASE + STEP,
  '자정 직전 → 직후(1분 12초 뒤)도 「다음 날」로 정상 지급', `${midnight.streak}일/${midnight.gems}`);

// ★ DST — 하루가 23/25시간이 되는 날.
//   ⚠️ 이 환경(Windows/Git Bash)에서는 TZ 환경변수가 node 에 «전달되지 않는다»
//      (TZ=... node / env TZ=... / export TZ 셋 다 process.env.TZ === undefined 실측).
//      그래서 여기서 DST 를 「통과」로 적으면 «죽은 검사기»가 된다 — 시스템 시간대가
//      DST 없는 곳(Asia/Seoul)이면 23/25시간 날이 애초에 존재하지 않기 때문이다.
//   ⇒ 실제 DST 검증은 브라우저 쪽(tools/daily_live_verify.cjs, Playwright
//      timezoneId 로 «진짜» 시간대를 바꾼다)에서 한다. 여기서는 이 런타임이
//      DST 를 밟았는지 «측정해서» PASS / SKIP 을 정직하게 갈라 적는다.
for (const [name, y, m, d] of [['봄 앞당김', 2026, 3, 8], ['가을 되돌림', 2026, 11, 1]]) {
  const hours = (localMs(y, m, d + 1, 0) - localMs(y, m, d, 0)) / 3600000;
  const evenA = D.evaluateDaily(fresh, localMs(y, m, d - 1, 20));
  const evenB = D.evaluateDaily(evenA.next, localMs(y, m, d, 20));
  const evenC = D.evaluateDaily(evenB.next, localMs(y, m, d + 1, 20));
  const ok = evenB.outcome === 'granted' && evenB.streak === 2 && evenC.streak === 3;
  if (hours === 24) {
    say(`  SKIP DST ${name}(${y}-${m}-${d}): 이 런타임 시간대에서 이 날은 24시간이라 DST 를 «밟지 않는다»` +
      ` — 브라우저 하네스가 검증한다 (참고: 연속 ${evenA.streak}→${evenB.streak}→${evenC.streak})`);
  } else {
    check(ok, `DST ${name}: 하루 = ${hours}시간이어도 연속 1→2→3`,
      `${evenA.streak}/${evenB.streak}/${evenC.streak}`);
  }
}

const gap2 = D.evaluateDaily(first.next, localMs(2026, 8, 20, 9));
check(gap2.outcome === 'granted' && gap2.streak === 1 && gap2.streakBroken === true,
  '하루 건너뜀(2일 차): 연속 끊김 → 1일로 리셋', `${gap2.streak}/${gap2.streakBroken}`);
check(gap2.maxStreak === Math.max(first.next.maxStreak, 1), '끊겨도 maxStreak 는 줄지 않는다', gap2.maxStreak);

// ★ 시계를 뒤로 돌린 경우
const rewound = D.evaluateDaily(first.next, localMs(2026, 8, 17, 9));
check(rewound.outcome === 'clock-rewound' && rewound.gems === 0, '시계 되돌림: 무지급', rewound.outcome);
check(eqState(rewound.next, first.next), '★시계 되돌림: 상태가 «전혀» 바뀌지 않는다');
// 되돌렸다가 진짜 날짜로 복귀하면 정상 지급돼야 한다(정직한 유저를 벌하지 않는다)
const backToReal = D.evaluateDaily(rewound.next, localMs(2026, 8, 19, 9));
check(backToReal.outcome === 'granted' && backToReal.streak === 2,
  '되돌림 후 실제 다음날 복귀: 정상 지급 + 연속 유지', `${backToReal.outcome}/${backToReal.streak}`);
// 크게 되감아도(작년) 마찬가지
const farBack = D.evaluateDaily(first.next, localMs(2025, 1, 1, 9));
check(farBack.outcome === 'clock-rewound' && eqState(farBack.next, first.next), '1년 되감기도 상태 불변');
// 미래로 크게 감았다가 돌아온 경우 = 다음 지급이 그 미래 날짜를 넘어야만 열린다
const jumped = D.evaluateDaily(fresh, localMs(2030, 1, 1, 9));
const afterJump = D.evaluateDaily(jumped.next, localMs(2026, 8, 18, 9));
check(afterJump.outcome === 'clock-rewound' && afterJump.gems === 0,
  '★미래로 감아 수령 후 실시간 복귀: 추가 지급 0(이득 없음)', afterJump.outcome);

// ★ 하루씩 앞으로 감기 = 막을 수 없다. 「막힌다」고 거짓 주장하지 않고 그 사실을 고정한다.
let st = fresh, days = 0;
for (let i = 0; i < 30; i++) {
  const ev = D.evaluateDaily(st, localMs(2026, 8, 18 + i, 9));
  if (ev.outcome === 'granted') days++;
  st = ev.next;
}
check(st.streak === 30 && days === 30,
  '★[알려진 미봉] 하루씩 30번 앞당기면 연속 30일이 된다 — 서버 없이는 차단 불가', `streak=${st.streak}`);

// 30일 연속 지급 총액 = 유도 계산과 일치해야 한다
let total = 0, expect = 0;
let s2 = fresh;
for (let i = 0; i < 30; i++) {
  const ev = D.evaluateDaily(s2, localMs(2026, 8, 18 + i, 9));
  total += ev.gems; s2 = ev.next;
  expect += BASE + Math.min(CAP, STEP * i);
}
check(total === expect, '30일 연속 총 지급액이 수식 유도값과 일치', `${total} == ${expect}`);

// ── ④ 저장본 정규화 ─────────────────────────────────────────────────────────
say('\n[④] 저장본 오염 내성 (sanitizeDailyState)');
const poison = [
  ['null', null], ['배열', [1, 2]], ['문자열', 'x'], ['숫자', 7],
  ['필드 타입 뒤죽박죽', { lastClaimDay: 5, lastClaimAtMs: 'x', streak: {}, maxStreak: [] }],
  ['NaN/Infinity', { lastClaimDay: '2026-08-18', lastClaimAtMs: NaN, streak: Infinity, maxStreak: -Infinity }],
  ['음수', { lastClaimDay: '2026-08-18', lastClaimAtMs: -5, streak: -9, maxStreak: -9 }],
  ['잘못된 날짜형식', { lastClaimDay: '2026/08/18', streak: 12 }],
];
for (const [name, raw] of poison) {
  let s = null, threw = false;
  try { s = D.sanitizeDailyState(raw); } catch { threw = true; }
  const sane = !threw && s && typeof s.streak === 'number' && s.streak >= 0
    && Number.isFinite(s.streak) && s.maxStreak >= s.streak
    && (s.lastClaimDay === '' || D.isDayKey(s.lastClaimDay))
    && Number.isFinite(s.lastClaimAtMs) && s.lastClaimAtMs >= 0;
  check(sane, `[${name}] throw 없이 안전한 상태로 정규화`, JSON.stringify(s));
}
// ★ 모순 조합: 수령일이 없는데 연속일만 있는 상태 → 매 로드마다 재지급되는 구멍
const contradiction = D.sanitizeDailyState({ lastClaimDay: '2026/08/18', streak: 12, maxStreak: 12 });
check(contradiction.streak === 0, '★수령일 없이 연속일만 있는 모순 → 연속일 0 (재지급 구멍 차단)', contradiction.streak);
check(contradiction.maxStreak === 12, '  단 maxStreak 기록은 보존한다', contradiction.maxStreak);

// ── ⑤ 알림 슬롯 ─────────────────────────────────────────────────────────────
say('\n[⑤] 지급 알림 슬롯 (소비형)');
D.postDailyGrant({ gems: BASE, streak: 1, maxStreak: 1, streakBroken: false });
check(D.peekDailyGrant() !== null, '올려두면 보인다');
check(D.takeDailyGrant() !== null, '한 번은 가져간다');
check(D.takeDailyGrant() === null, '★두 번째는 null (토스트가 두 번 뜨지 않는다)');

say(`\n=== 결과: ${fail === 0 ? 'ALL PASS' : `${fail} FAIL`} (TZ=${TZ}) ===`);
fs.rmSync(TMP, { recursive: true, force: true });
process.exit(fail === 0 ? 0 : 1);
