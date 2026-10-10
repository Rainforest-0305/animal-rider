// ui/_devtest.ts — UI «단독» 렌더 하네스. main.ts 미배선 상태에서 화면 3종을
// 눈으로 확인하기 위한 개발용 진입점이다. 제품 번들에 들어가지 않는다
// (index.html 이 이 파일을 참조하지 않는다 — _devtest.html 전용).
//
//   npm run dev  →  http://localhost:5183/src/ui/_devtest.html
//
// URL 파라미터(헤드리스 스크린샷을 결정적으로 만들기 위한 것):
//   ?screen=stages|roster|gacha|clear   해당 화면을 즉시 연다
//   ?stars=57                           별 57개를 앞 스테이지부터 채운다
//   ?gems=1200                          보석
//   ?owned=6                            가챠 6회 뽑은 상태(시드 고정 rng)
//   ?login=30&challenge=30&custom=4     SPECIAL 조건 카운터
//   ?locale=ko                          로케일 강제(미지정=브라우저 감지)
//   ?hintms=600000                      조작 안내 토스트 유지시간(ms). 기본 4500 이라
//                                       느린 헤드리스 실행에서는 «측정 전에 사라져»
//                                       같은 조건인데 요소 수가 달라진다(실측: 6개 차이).
//                                       점검 스크립트는 이 값을 크게 줘서 고정한다.
import { createGachaState, drawGacha } from '../game/gacha';
import { SUPPORTED_LOCALES } from '../i18n';
import type { Locale } from '../i18n';
import {
  createMetaUI,
  createMetaProgress,
  STAGES,
  MAX_TOTAL_STARS,
  STAGE_COUNT,
  totalStars,
  collectionStatus,
} from './index';
import type { MetaProgress } from './index';

const QS = new URLSearchParams(location.search);
const num = (k: string, d = 0) => Number(QS.get(k) ?? d) || d;

/** 결정적 난수(mulberry32) — 시드 고정이라 스크린샷이 매번 같다. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedProgress(): MetaProgress {
  const gacha = createGachaState(0);
  const p = createMetaProgress(gacha);

  // 별: 앞 스테이지부터 3별씩 채운다(해금 규칙상 순서대로여야 의미가 있다).
  let budget = Math.min(num('stars', 0), MAX_TOTAL_STARS);
  for (const s of STAGES) {
    if (budget <= 0) break;
    const give = Math.min(s.maxStars, budget);
    p.starsByStage[s.id] = give;
    budget -= give;
  }

  // 보유: 실제 drawGacha 를 돌려서 «가격 곡선·drawsCompleted» 까지 일관되게 만든다.
  const wantOwned = num('owned', 0);
  if (wantOwned > 0) {
    gacha.gems = 10 ** 9;
    const rng = mulberry32(20260806);
    for (let i = 0; i < wantOwned; i++) drawGacha(gacha, rng);
  }
  gacha.gems = num('gems', 0);

  p.conditionCounters.login_streak = num('login', 0);
  p.conditionCounters.challenge_count = num('challenge', 0);
  p.conditionCounters.customization_categories = num('custom', 0);
  return p;
}

const localeParam = QS.get('locale');
const locale: Locale | undefined = SUPPORTED_LOCALES.includes(localeParam as Locale)
  ? (localeParam as Locale)
  : undefined;

const progress = seedProgress();

const meta = createMetaUI({
  progress,
  locale,
  // 하네스에서는 «항상» 조작 안내가 뜨게 한다(localStorage 로 1회만 뜨는 게 기본값이라
  // 두 번째 실행부터 안 보여서 스크린샷이 달라진다 — 실측으로 발견).
  controlHint: { force: true, ...(QS.has('hintms') ? { durationMs: num('hintms', 4500) } : {}) },
  onPlayStage: (stage) => {
    log(`onPlayStage → ${stage.id} (#${stage.number}, ${stage.tier}) — 게임이 런을 시작할 자리`);
  },
  onDrawn: (species) => log(`onDrawn → ${species.nameRomaji} (${species.grade})`),
});

// ── 하네스 패널(제품 UI 아님) ───────────────────────────────────────────────
const panel = document.getElementById('harness') as HTMLDivElement;
const logBox = document.getElementById('log') as HTMLPreElement;

function log(s: string): void {
  logBox.textContent = `${new Date().toLocaleTimeString()}  ${s}\n${logBox.textContent}`;
}

function stats(): string {
  const col = collectionStatus(progress);
  return [
    `derived stages = ${STAGES.length} (stages.ts TOTAL_STAGES=${STAGE_COUNT})`,
    `derived stars  = ${MAX_TOTAL_STARS}`,
    `owned = ${col.owned}/${col.total}  complete=${col.complete}`,
    `stars = ${totalStars(progress)}  gems = ${progress.gacha.gems}  draws = ${progress.gacha.drawsCompleted}`,
  ].join('\n');
}

function refreshStats(): void {
  (document.getElementById('stats') as HTMLPreElement).textContent = stats();
}

const buttons: Array<[string, () => void]> = [
  ['스테이지 선택', () => meta.openStages()],
  ['로스터', () => meta.openRoster()],
  ['가챠', () => meta.openGacha()],
  [
    '클리어 연출(첫 사이클)',
    () => {
      // 첫 사이클 재현: 1스테이지 클리어 → 별 → 마일스톤 보석 → 가챠 자동 노출
      progress.gacha.gems += 600;
      meta.presentStageClear({
        stage: STAGES[0],
        stars: 3,
        score: STAGES[0].def.targetScore,
        rotations: STAGES[0].def.targetRotationsCumulative,
        gemsAwarded: 600,
      });
    },
  ],
  ['닫기', () => meta.closeAll()],
];

for (const [label, fn] of buttons) {
  const b = document.createElement('button');
  b.textContent = label;
  b.className = 'hbtn';
  b.addEventListener('click', () => {
    fn();
    refreshStats();
    log(label);
  });
  panel.appendChild(b);
}

refreshStats();
window.setInterval(refreshStats, 500);

// 헤드리스 검산용 훅
(window as unknown as { __ui: unknown }).__ui = {
  meta,
  progress,
  stageCount: STAGES.length,
  maxStars: MAX_TOTAL_STARS,
  // 티어별 «유도 길이» — game/stageLength.ts 값이 StageInfo 까지 실제로 왔는지 검산용.
  lengthsByTier: STAGES.reduce<Record<string, number>>((acc, s) => {
    acc[s.tier] = s.lengthPx;
    return acc;
  }, {}),
  stageLengths: STAGES.map((s) => s.lengthPx),
};

const auto = QS.get('screen');
if (auto === 'stages') meta.openStages();
else if (auto === 'roster') meta.openRoster();
else if (auto === 'gacha') meta.openGacha();
else if (auto === 'clear') {
  progress.gacha.gems += 600; // 마일스톤 보상 지급까지 재현(게임 쪽 경제 로직 대역)
  meta.presentStageClear({
    stage: STAGES[0],
    stars: 3,
    score: STAGES[0].def.targetScore,
    rotations: STAGES[0].def.targetRotationsCumulative,
    gemsAwarded: 600,
  });
}
