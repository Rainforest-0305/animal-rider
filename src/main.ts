// main.ts — 마일스톤① 플레이어블. 원터치: 지면=가속, 공중=반시계 회전.
// 2026-08-06 개편: 평지 고정 → «곡선 지형 + 지형추종 물리 + 모바일 세로 반응형 캔버스».
import { applyDocumentTitle } from './brand';
import { initAudio, playBgmLoop, playJumpSfx, playLandingSfx } from './audio';
// GRAVITY 는 §7.4 권고대로 «연출 파티클»에도 같은 상수를 재사용한다(물리 변경 아님).
import { stepRider, GRAVITY, AIR_ROTATION_MIN_CLEARANCE } from './game/physics';
import type { TerrainSampler, RiderState } from './game/physics';
import { judgeLanding, jumpScore, normalizeAngle } from './game/score';
import { buildStageTrack, SEGMENT_LENGTH, groundYAt, groundSlopeAt } from './game/track';
import type { Segment } from './game/track';
import { ROSTER } from './game/roster';
// §10 종별 실루엣 모듈(정본). 등급 팔레트도 여기가 단일 소스 — main.ts 로컬 사본은 폐기했다.
import { drawCritterArt, speciesForRosterId } from './render/critterArt';
// 존(테마) 배경 파이프. «이미지 레이어 + 지면 타일», 에셋 없으면 아래 도형 렌더로 폴백한다.
import {
  zoneForStageIndex, setActiveZone, activeZone, drawZoneBackground, zoneGroundPattern, zoneTrim, zoneAssetStatus,
} from './render/zones';
import type { ZoneViewport } from './render/zones';
import type { Grade } from './game/roster';
import { TIERS, judgeStars } from './game/stages';
import { createGachaState } from './game/gacha';
import { createMetaUI, createMetaProgress, nextPlayableStage, totalStars, stageStars, STAGES, detectLocale } from './ui';
import type { StageInfo } from './ui';
// 전복 오버레이 문구. ★ 한글 리터럴을 직접 박으면 9개 로케일 전부에서 한글이 뜬다
//   (실측: en 로케일 UI 인데 「꽈당!」이 그대로 나왔다 — MS Store 심사자가 보는 화면이다).
import { t } from './i18n';
import { GACHA_POOL } from './game/roster';
// 진행도 영속화(별·도감·보석). 저장 «대상/시점/손상내성»은 save.ts 머리말 참조.
import { loadInto, saveProgress } from './save';

// 전복 오버레이용 로케일. ★ 렌더 루프 안에서 detectLocale() 을 부르면 매 프레임
//   navigator.languages 를 다시 읽는다 — 값은 세션 중 바뀌지 않으므로 한 번만 잡는다.
//   (UI 모듈들과 «같은» 감지 함수를 쓴다. 화면마다 언어가 갈리면 안 된다.)
const LOCALE = detectLocale();

// ── 스테이지 진행(④ 통합) ──────────────────────────────────────────────────
// ★ 구 «1스테이지 데모» 하드코딩 5건(스테이지1 전용 티어 상수·고정 종료거리·사전적립 별
//   11개·누적별 12 임계 일회성 판정·젬 600 일회성 지급)은 전량 폐기하고 48스테이지 순회
//   구조로 대체했다. 폐기된 식별자 문자열은 감사 grep 에 계속 걸리므로 여기 적지 않는다.
const gachaState = createGachaState(0);
const progress = createMetaProgress(gachaState);
// ★ 저장본 복원은 «여기서 한 번». 아래의 nextPlayableStage()/createMetaUI() 가 이미
//   복원된 progress 를 읽어야 하므로, 그것들보다 반드시 앞에 있어야 한다.
//   loadInto() 는 어떤 경우에도 throw 하지 않는다(저장본이 깨져도 게임은 켜진다).
const saveLoad = loadInto(progress);

// 별 마일스톤 보상 — 단일소스: tools/economy_sim.mjs:22-24
//   STAR_MILESTONE_STEP = 12 / STAR_MILESTONE_REWARD = 600
//   주석 원문: 「D3 / R-B: 별 12개마다 600, 총 12회=7,200(1회성)」
// 즉 «반복 12회»가 원래 확정치다. 총별 144 / 12 = 12회 x 600 = 7,200 으로 검산 일치.
// 내가 만든 수치가 아니라 확정 경제값을 그대로 옮긴 것이므로 stub(0) 로 두지 않는다 —
// 0 으로 두면 젬 수입이 0이 되어 가챠가 영원히 안 열리고 온보딩 DoD 가 깨진다.
const STAR_MILESTONE_STEP = 12;
const STAR_MILESTONE_REWARD = 600;
// ★ 저장본에서 «복원하지 않고 유도»한다. awardMilestoneGems() 는 별이 늘 때만
//   단조증가하므로 이 값은 언제나 floor(누적별 / STEP) 과 같다(불변식).
//   0 으로 두면 새로고침할 때마다 이미 준 마일스톤이 «다시» 지급되는 보석 복제가 된다.
//   저장본이 없으면 totalStars=0 이라 그대로 0 이다(신규 유저 동작 무변경).
let awardedMilestones = Math.floor(totalStars(progress) / STAR_MILESTONE_STEP);

// 스테이지 길이는 UI 쪽 meta.ts 가 stageLength.ts 를 흡수해 StageInfo.lengthPx 로 노출한다.
// main.ts 에서 stageLength.ts 를 «다시» import 하지 않는다 — 같은 산식이 두 경로로
// 존재하면 한쪽만 바뀌었을 때 조용히 어긋난다(교차검증 throw 는 meta.ts 가 담당).

applyDocumentTitle();

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const hud = document.getElementById('hud') as HTMLDivElement;

let track: Segment[] = [];

// 물리 모듈에 넘길 지형 샘플러(물리는 track 을 직접 모른다).
const terrain: TerrainSampler = { heightAt: groundYAt, slopeAt: groundSlopeAt };

// ── 반응형 캔버스 ──────────────────────────────────────────────────────────
// 최종 타겟이 «모바일 세로·터치 우선»이라 캔버스를 뷰포트에 맞춘다.
// 내부 해상도는 DPR 배율, 그리기 좌표는 CSS px 로 통일(ctx.setTransform 으로 흡수).
// ★ 「화면에 담을 월드 폭」(VIEW_WORLD_W_*) 근거: MAX_SPEED 1400px/s 는 원래 960px 캔버스(=1.46화면/초)
//   기준으로 잡힌 값이다. 세로 폰에서 화면에 620px만 담으면 체감 2.5화면/초가 되어
//   지형을 읽을 시간이 없다(실측 후 620 -> 800 으로 상향). 800 이면 390px 폰에서
//   1.75화면/초로 원 설계 의도에 가깝고, 파장 2200px 구릉의 굴곡도 화면 안에서 읽힌다.
//
// ★★ 2026-08-18 카메라 줌 개편 — «캐릭터를 주인공으로» ★★
//   [문제·실측] 종전 식은 scale = clamp(viewW / 800, 0.42, 1.0) 이었다.
//     데스크톱 1920 에서 viewW/800 = 2.4 가 SCALE_MAX(=1.0)에 «걸려» 월드를 1:1 로
//     그렸다. 그 결과 화면에 담기는 월드 폭이 «세로폰 800px vs 데스크톱 1920px» 로
//     2.4배 갈라졌고, 라이더는 1920 화면에서 폭 약 48px = 화면폭의 2.5% 로 쪼그라들었다
//     (헤드리스 캡처 실측). 같은 라이더가 430px 세로폰에서는 폭 약 35px = 8.1% 다.
//     ⇒ 「캐릭터가 너무 작다」는 ★«데스크톱 전용» 문제였다. 모바일은 원래 정상이었다.
//   [원칙] 스케일은 «화면 폭»이 아니라 «화면에 담을 월드 폭»으로 정한다.
//     VIEW_WORLD_W_* 하나만 보면 어떤 해상도에서든 시야가 같다 — 해상도가 커지면
//     더 «멀리» 보이는 게 아니라 더 «크게» 보인다.
//   [상한 근거 = 지형 가독성] 무한정 당기면 다음 도약대가 화면에 안 들어와 플레이가
//     망가진다. 그래서 «플레이어 앞쪽 최소 시야»를 하드 상한으로 둔다(AHEAD_WORLD_MIN).
//     구간 길이 500px · 킥커 간격 1600px 이라 앞쪽 560px 이면 다음 구간 마커는 항상,
//     도약대 웨지는 접근 중에 화면 안에 들어온다.
//     560 이라는 값 자체는 «이미 돌고 있던 세로폰 시야»에서 가져왔다: 430px 폰 기준
//     (430 - PLAYER_SCREEN_X 120.4) / 0.5375 = 576 월드px. 그 아래로는 절대 안 내려가게
//     잡은 것이라, 이 개편으로 세로 모바일의 scale 은 «수치가 바뀌지 않는다».
//   [세로/가로를 다르게 두는 이유] 세로폰은 폭이 좁아 이미 상한에 붙어 있다(더 당길
//     여지 자체가 없다). 가로는 여유가 크므로 별도 값을 둔다. 가로를 세로와 같은 800 으로
//     두면 1920 에서 scale 2.4 까지 가는데, 그러면 앞쪽 시야가 658월드px 로 떨어져
//     최대비행거리(발사속도 약 2030 · 34° → 약 1730월드px) 대비 착지 예측이 어려워진다.
//
//   ⛔ 여기를 «상수 하나»로 뭉뚱그리지 마라 (2026-08-18 회귀 실사고):
//     다른 라인이 REF_VIEW_WORLD_W 800->620 / SCALE_MAX 1.0->1.30 / ART_SCALE 0.46->0.72
//     로 «한 상수»에서 캐릭터를 키우려다, 데스크톱은 고쳤지만 ★최우선 타겟인 세로폰의
//     시야를 800->620 월드px 로 «29% 악화»시켰다(390px 폰 1.75화면/초 -> 2.26화면/초.
//     같은 월드좌표에서 구간 아치·깃발이 하나 덜 보인다 - A/B 캡처로 실증됨).
//     캐릭터 크기와 시야는 «세로/가로에서 서로 다른 제약»을 받는다. 분리해서 잡아라.
//     ★ART_SCALE 도 올리지 않는다 — 그건 카메라가 아니라 «캐릭터 대 지형 비율»을 바꾸는
//       아트 결정이고, 캐릭터만 커져 도약대·깃발과의 크기 관계가 무너진다.
const VIEW_WORLD_W_PORTRAIT = 800;  // 세로: 화면에 담을 «월드» 가로 폭(px) — 기존과 동일
const VIEW_WORLD_W_LANDSCAPE = 900; // 가로: 종전 1920(=1:1) → 900 으로 당긴다
const AHEAD_WORLD_MIN = 560;        // 플레이어 앞쪽에 «반드시» 보여야 할 월드 폭(px)
const SCALE_MIN = 0.42;
const SCALE_MAX = 3.2; // 종전 1.0. 이 상한에 걸리면 4K 급에서 다시 줌아웃되므로 넉넉히 둔다
const DPR_MAX = 2.5;
const RIDER_MIN_SCALE = 0.7; // 작은 화면에서 라이더가 점처럼 작아지지 않게

// 검증용 훅(둘 다 «URL 파라미터가 있을 때만» 동작 — 평소엔 완전히 비활성):
//   ?auto=1  «지면=가속, 공중=무입력» 정책으로 스스로 달린다(헤드리스 검산 정책 B와 동일).
//   ?ff=12   첫 렌더 전에 12초치 물리를 고정 dt 로 미리 돌린다. 헤드리스 스크린샷에서
//            requestAnimationFrame 이 제대로 안 도는 문제를 피하려고 둔 «결정적» 진행.
const QS = new URLSearchParams(location.search);
const AUTO_PLAY = QS.get('auto') === '1';
const FAST_FORWARD_S = Math.min(120, Math.max(0, Number(QS.get('ff') ?? 0) || 0));
const COINCIDE_TEST = QS.get('coincide') === '1';
// ?nostack=1 — 스코어팝 겹침회피를 «끈다». 수정 전 상태를 같은 프레임에서 재현해
// 수정 전/후를 동일 구도로 대조하기 위한 검증 전용 스위치.
const NO_STACK = QS.get('nostack') === '1';
// ?oldcolor=1 — §11.3 색조 하향 «전»(원색 골드)을 재현하는 검증 전용 스위치.
const OLD_SEG_COLOR = QS.get('oldcolor') === '1';
// ?freeze=1 — ff 로 진행한 뒤 «시뮬레이션을 멈춘다»(렌더만 계속).
// ★ 이게 없으면 ff 이후에도 requestAnimationFrame 이 계속 돌아, 스크린샷 타이밍에 따라
//   상태가 달라진다(실측: 같은 ff=1.30 인데 관측 worldX 1342 vs 캡처 843). 수정 전/후를
//   «같은 프레임»으로 대조하려면 반드시 고정해야 한다.
const FREEZE_AFTER_FF = QS.get('freeze') === '1';
// ?debug=1 일 때만 디버그 HUD 텍스트를 «화면에» 노출한다.
// ★ window.__debug 는 «항상» 유지한다 — qa-live 등 자동검증이 그걸 읽는다.
//   화면 텍스트만 감추는 것이고 관측 경로를 끊는 게 아니다.
const DEBUG_HUD = QS.get('debug') === '1';
// window.__debug 노출 게이트.
// ★ ?debug=1 «또는» 다른 디버그 파라미터가 하나라도 있으면 노출한다.
//   순수 프로덕션 URL 에서는 감추되, 이미 돌고 있는 검증 하네스(auto/ff/freeze/fx/…)를
//   깨뜨리지 않기 위해서다 — 지금 qa-live 가 그 URL 들로 측정 중이라, 노출 조건을
//   ?debug=1 «단독»으로 좁히면 진행 중인 남의 측정이 통째로 무효가 된다.
const DEBUG_PARAM_KEYS = ['debug', 'auto', 'ff', 'freeze', 'fx', 'coincide', 'grade', 'critter', 'nostack', 'oldcolor', 'mount', 'stage',
  'noFx', 'noMarker', 'noPassFx', 'noPop', 'noParticle', 'noFlash', 'zone'];
const EXPOSE_DEBUG = DEBUG_PARAM_KEYS.some((k) => QS.has(k));

// ── 성능 원인분리용 ON/OFF 토글 (qa-live 측정 전용) ────────────────────────
// 각 토글은 «갱신과 그리기 양쪽»을 모두 건너뛴다. 한쪽만 끄면 그 기능의 실제 비용이
// 측정에 안 잡혀 원인분리가 무의미해진다.
//   ?noMarker=1    §11.1/11.2 구간 마커(깃발/아치) 그리기 off
//   ?noPassFx=1    §11.3 구간 통과 이펙트(플래시+파티클+「+1」팝) off
//   ?noPop=1       스코어팝 전체(§7.1 「×2」 + §11.3 「+1」) off
//   ?noParticle=1  파티클 전체(착지/램프/금가루/통과) off
//   ?noFlash=1     플래시(원형 확산) 전체 off
//   ?noFx=1        위 이펙트 4종을 한 번에 off(마커는 유지) — 베이스라인용
const NO_FX_ALL = QS.get('noFx') === '1';
const NO_MARKER = QS.get('noMarker') === '1';
const NO_PASS_FX = NO_FX_ALL || QS.get('noPassFx') === '1';
const NO_POP = NO_FX_ALL || QS.get('noPop') === '1';
const NO_PARTICLE = NO_FX_ALL || QS.get('noParticle') === '1';
const NO_FLASH = NO_FX_ALL || QS.get('noFlash') === '1';
if (!DEBUG_HUD) hud.style.display = 'none';

let viewW = 960; // CSS px
let viewH = 540; // CSS px
let scale = 1; // 월드 px -> 화면 CSS px
let PLAYER_SCREEN_X = 220; // CSS px
let GROUND_SCREEN_Y = 380; // CSS px, 접지 시 라이더가 놓이는 화면 높이

function resizeCanvas() {
  // ★ 04_땅따먹기(territory-clash)가 MS Store 인증을 통과한 패턴을 그대로 따른다:
  //   픽셀버퍼 크기를 «CSS 가 정한 canvas.clientWidth/Height» 에 맞추고 DPR 배율만 얹는다.
  //   window.innerWidth 를 직접 쓰지 않는다 — 그러면 레터박스·safe-area·컨테이너 패딩이
  //   생겼을 때 CSS 크기와 픽셀버퍼가 어긋나 지형이 잘리거나 늘어난다.
  const dpr = Math.min(window.devicePixelRatio || 1, DPR_MAX);
  viewW = Math.max(1, canvas.clientWidth || window.innerWidth);
  viewH = Math.max(1, canvas.clientHeight || window.innerHeight);
  canvas.width = Math.round(viewW * dpr);
  canvas.height = Math.round(viewH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // 비율 기반 재계산(가로/세로 공통).
  // ★ PLAYER_SCREEN_X 를 scale «보다 먼저» 구한다 — 앞쪽 시야 상한 계산에 필요하다.
  PLAYER_SCREEN_X = Math.min(Math.max(viewW * 0.28, 70), 340);
  const portrait = viewH >= viewW;

  // ── 카메라 줌 ──
  // ① 「화면에 담을 월드 폭」에서 스케일을 얻는다(해상도가 커지면 «더 크게» 보인다).
  // ② 지형 가독성 상한: 플레이어 앞쪽으로 AHEAD_WORLD_MIN 월드px 은 반드시 남긴다.
  //    (다음 도약대·킥커가 화면 밖으로 밀려나면 플레이가 망가진다 — 이 줄이 그 방지턱이다)
  const refWorldW = portrait ? VIEW_WORLD_W_PORTRAIT : VIEW_WORLD_W_LANDSCAPE;
  const scaleByView = viewW / refWorldW;
  const scaleByReadability = (viewW - PLAYER_SCREEN_X) / AHEAD_WORLD_MIN;
  scale = Math.min(SCALE_MAX, Math.max(SCALE_MIN, Math.min(scaleByView, scaleByReadability)));

  // 세로에서는 점프 여유(위쪽 하늘)를 더 준다.
  GROUND_SCREEN_Y = viewH * (portrait ? 0.68 : 0.7);

  hud.style.fontSize = viewW < 520 ? '10px' : '13px';
  hud.style.maxWidth = `${Math.round(viewW - 12)}px`;
}
window.addEventListener('resize', resizeCanvas);
window.addEventListener('orientationchange', resizeCanvas);
resizeCanvas();

// ── 상태 ───────────────────────────────────────────────────────────────────
// ★ GameState 는 RiderState 를 «그대로 포함»한다(구조적 타이핑으로 stepRider 에 직접 넘긴다).
// 필드를 따로 복사·동기화하지 않으므로 물리와 HUD 가 어긋날 수 없다.
interface GameState extends RiderState {
  y: number; // 지표면 대비 높이(HUD 호환: 0 이면 접지)
  touching: boolean; crashed: boolean;
  sSegTotal: number; jumpsScorePoints: number; totalScore: number;
  lastLanding: string; lastJumpRotations: number; lastJumpMultiplier: number;
  frame: number;
  sRotCountTotal: number; // raw 완주 회전수 누적(배수 미적용) - 별판정용
  stageCleared: boolean;
  stageStars: number; // 이번 스테이지 획득 별(1~3)
  profileStars: number; // 누적 별(진행상태에서 계산)
  milestoneTriggered: boolean;
  // ── 곡선 지형 도입분 ──
  lastLandingRelDeg: number; // 마지막 착지의 지형 대비 상대각(판정에 실제로 쓴 값)
  lastLandingSlopeDeg: number; // 마지막 착지 지점의 지형각
  liftoffs: number; // 자연 이함 횟수(도약대 제외)
  padLaunches: number; // 도약대 발사 횟수
}

function freshRunState(): Pick<GameState,
  'worldX' | 'vx' | 'y' | 'vy' | 'airborne' | 'rotationDeg' | 'crashed' |
  'worldY' | 'groundY' | 'slope' | 'tangentSpeed' | 'airRotationDeg' | 'takeoffAngleDeg'> {
  return {
    worldX: 0, vx: 0, y: 0, vy: 0, airborne: false, rotationDeg: 0, crashed: false,
    worldY: groundYAt(0), groundY: groundYAt(0), slope: groundSlopeAt(0),
    tangentSpeed: 0, airRotationDeg: 0, takeoffAngleDeg: 0,
  };
}

const state: GameState = {
  ...freshRunState(),
  touching: false,
  sSegTotal: 0, jumpsScorePoints: 0, totalScore: 0,
  lastLanding: '-', lastJumpRotations: 0, lastJumpMultiplier: 0,
  frame: 0,
  sRotCountTotal: 0, stageCleared: false, stageStars: 0,
  profileStars: 0, milestoneTriggered: false,
  lastLandingRelDeg: 0, lastLandingSlopeDeg: 0,
  liftoffs: 0, padLaunches: 0,
};

let lastSegmentIndex = 0;
const launchedSegmentIndices = new Set<number>();

// 카메라: 세로축은 «라이더 발밑 지형»을 약간의 지연을 두고 따라간다.
// 지연 덕에 언덕을 오르내리는 게 화면에서도 위아래 움직임으로 읽힌다.
const CAM_FOLLOW_RATE = 2.2; // 1/s — 낮을수록 카메라가 늦게 따라와 언덕 오르내림이 화면에서 크게 읽힌다
let camY = groundYAt(0);

// 아트 애니메이션용 경과시간(초) — 램프 글로우 펄스·시머·망토 웨이브가 참조한다.
let artTime = 0;
let crashTintT = 0;

// ── 오디오 배선 ────────────────────────────────────────────────────────────
// 브라우저 자동재생 정책: initAudio() 는 «사용자 제스처 핸들러 안»에서만 성립한다.
// 실패해도 throw 하지 않고 no-op 이라 게임 진행에는 지장이 없다(오디오 담당 실측).
let audioStarted = false;
function startAudioOnce() {
  if (audioStarted) return;
  if (!initAudio()) return; // 실패해도 게임은 그대로 진행
  audioStarted = true;
  playBgmLoop();
}

/**
 * 점프 SFX 게이트.
 * ★ 스니펫은 「이함 분기(pad/natural 양쪽)에 playJumpSfx()」였지만 natural 을 그대로
 *   물리면 «초당 4.4회»가 난다 — 마루를 스칠 때 생기는 수 px짜리 미세 이함이 60초에
 *   266회 발생하는 게 실측값이다(자연 이함 266회/60s). 그래서 natural 은 «회전 입력이
 *   먹기 시작하는 지상고(AIR_ROTATION_MIN_CLEARANCE=16px)»를 넘긴 «진짜 점프»에서만
 *   1회 울리게 게이트한다. 도약대(pad)는 항상 즉시 울린다.
 */
let jumpSfxArmed = false;

function setTouching(v: boolean) { state.touching = v; }

function restartRun() {
  Object.assign(state, freshRunState());
  state.lastLanding = '-';
  state.lastJumpRotations = 0;
  state.lastJumpMultiplier = 0;
  state.lastLandingRelDeg = 0;
  state.lastLandingSlopeDeg = 0;
  lastSegmentIndex = 0;
  launchedSegmentIndices.clear();
  camY = groundYAt(0);
  particles.length = 0;
  flashes.length = 0;
  scorePops.length = 0;
  markerPulse.clear();
  state.totalScore = 0;
  state.sSegTotal = 0;
  state.jumpsScorePoints = 0;
  state.sRotCountTotal = 0;
  state.liftoffs = 0;
  state.padLaunches = 0;
  jumpSfxArmed = false;
  // 진행도(별·젬·보유동물)는 계정 단위라 런 재시작으로 되돌리지 않는다.
}

// ── 런 라이프사이클 ────────────────────────────────────────────────────────
let currentStage: StageInfo = nextPlayableStage(progress);
let stageEndX = 0;
let runActive = false;

function startRun(stage: StageInfo) {
  currentStage = stage;
  stageEndX = stage.lengthPx;
  track = buildStageTrack(stageEndX, stage.def.launchPadCount);
  // 존(테마) 전환 — 8스테이지마다 배경이 바뀐다. 에셋 로드는 «비차단»이라 런 시작을 막지 않는다.
  setActiveZone(zoneForStageIndex(stage.index));
  restartRun();
  // ★ «이번 런의 결과» 필드는 반드시 여기서 초기화한다. 안 하면 직전 스테이지의
  //   클리어 상태가 그대로 남아 새 런이 시작부터 «클리어됨»으로 보인다
  //   (실측: 2단계 시작 직후 stageCleared=true, stageStars=1 로 남아 있었다).
  state.stageCleared = false;
  state.stageStars = 0;
  state.milestoneTriggered = false;
  state.profileStars = totalStars(progress);
  runActive = true;
  meta.closeAll();
}

/** 별 마일스톤 지급액 계산(이번 클리어로 «새로» 넘긴 마일스톤만). */
function awardMilestoneGems(newStars: number): number {
  const prev = stageStars(progress, currentStage.id);
  const projected = totalStars(progress) - prev + Math.max(newStars, prev);
  const due = Math.floor(projected / STAR_MILESTONE_STEP);
  if (due <= awardedMilestones) return 0;
  const gems = (due - awardedMilestones) * STAR_MILESTONE_REWARD;
  awardedMilestones = due;
  gachaState.gems += gems;
  return gems;
}

function endRun() {
  runActive = false;
  setTouching(false); // 결과 모달이 뜨는 순간 입력 상태를 놓아준다
  const star = judgeStars(currentStage.def, state.totalScore, state.sRotCountTotal, 0, true);
  state.stageCleared = true;
  state.stageStars = star.stars;
  const gems = awardMilestoneGems(star.stars);
  state.milestoneTriggered = gems > 0;
  meta.presentStageClear({
    stage: currentStage,
    stars: star.stars,
    score: state.totalScore,
    rotations: state.sRotCountTotal,
    gemsAwarded: gems,
  });
  state.profileStars = totalStars(progress);
  // ★ 저장 시점①: 스테이지 클리어가 «확정된 직후». presentStageClear() 안에서
  //   recordStageResult() 가 이미 별을 갱신했고, 마일스톤 보석도 위에서 반영됐다.
  //   매 프레임 저장은 하지 않는다 — 의미 있는 변화가 확정된 순간만이다.
  saveProgress(progress);
}

const meta = createMetaUI({
  progress,
  onPlayStage: (stage) => startRun(stage),
  // ★ 저장 시점②: 가챠 획득 직후(보유동물·보석·뽑기횟수가 한꺼번에 바뀐다).
  onDrawn: () => saveProgress(progress),
});

// ★ 저장 시점③(안전망): 탭을 숨기거나 페이지를 떠날 때. ①②로 이미 저장돼 있으면
//   같은 내용을 한 번 더 쓰는 것뿐이라 부작용이 없다. 모바일은 pagehide 가 오지 않는
//   경우가 있어 visibilitychange 도 같이 건다.
function flushSave(): void {
  saveProgress(progress);
}
window.addEventListener('pagehide', flushSave);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushSave();
});

/**
 * UI 모달(스테이지선택/도감/뽑기/결과)이 떠 있으면 게임 입력을 받지 않는다.
 * ★ 실측 결함 2건을 막는다(2026-08-09 렌즈② 실행테스트):
 *   ① 모달 위에서 Space 를 누르면 touching 이 true 로 새어 들어갔다.
 *   ② 전복 상태에서 모달을 열고 Space 를 누르면 startRun 이 돌아 «유저가 보고 있던
 *      모달이 멋대로 닫히고» 런이 재시작됐다(crashed=false 로 전환 실측).
 *   UI 버튼 조작에 Space/Enter 를 쓰는 사용자가 있으므로 실사용에서 충분히 밟는 경로다.
 */
function uiBlockingInput(): boolean {
  return meta.current() !== null;
}

canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  startAudioOnce(); // 오디오 해금은 «어떤» 제스처에서든 해두는 게 이득이라 가드 앞에 둔다
  if (uiBlockingInput()) return;
  if (state.crashed) { startRun(currentStage); return; }
  setTouching(true);
});
window.addEventListener('pointerup', () => setTouching(false));
window.addEventListener('pointercancel', () => setTouching(false));
window.addEventListener('keydown', (e) => {
  if (e.code !== 'Space') return;
  startAudioOnce();
  if (uiBlockingInput()) return; // 모달 위 Space 는 UI 쪽(버튼 활성화)에 맡긴다
  e.preventDefault();
  if (state.crashed) { startRun(currentStage); return; }
  setTouching(true);
});
// keyup 은 가드하지 않는다 — 해제 경로를 막으면 touching 이 true 로 굳어버린다.
window.addEventListener('keyup', (e) => { if (e.code === 'Space') setTouching(false); });

function currentSegmentIndex(worldX: number): number {
  return Math.floor(worldX / SEGMENT_LENGTH);
}
function segmentAt(idx: number): Segment | undefined {
  return track[idx];
}

function update(dt: number) {
  const padIdx = currentSegmentIndex(state.worldX);
  const padSeg = segmentAt(padIdx);
  const launchPadHere = !!padSeg && padSeg.type === 'launch' && !launchedSegmentIndices.has(padIdx);

  // ★ 물리는 전부 physics.ts 의 stepRider 한 곳에서 돈다(헤드리스 검산도 같은 함수를 쓴다).
  // 자동주행: 지면에선 가속, 공중에선 무입력(헤드리스 검산에서 60초 무전복 확인된 정책).
  if (AUTO_PLAY) state.touching = !state.airborne;
  const ev = stepRider(state, dt, terrain, { touching: state.touching, launchPadHere });

  if (ev.liftoff === 'pad') {
    launchedSegmentIndices.add(padIdx);
    state.padLaunches++;
    playJumpSfx(); // 도약대는 항상
    jumpSfxArmed = false;
  } else if (ev.liftoff === 'natural') {
    state.liftoffs++;
    jumpSfxArmed = true; // «진짜 점프»가 되면 그때 울린다(아래 지상고 게이트)
  }
  // 자연 이함이 실제 점프로 커진 순간에만 1회
  if (jumpSfxArmed && state.airborne && state.worldY - state.groundY > AIR_ROTATION_MIN_CLEARANCE) {
    playJumpSfx();
    jumpSfxArmed = false;
  }

  if (ev.landing) {
    // ★ 착지 판정은 «지형 대비 상대각»(stepRider 가 계산해 준 relDeg). 절대각(수평 0도)으로
    //   재면 완만한 내리막에 수평으로 잘 내려앉아도 전복으로 오판정된다.
    const relDeg = normalizeAngle(ev.landing.relDeg);
    const quality = judgeLanding(relDeg);
    playLandingSfx(quality); // perfect/normal/crash 3종 자동 분기
    jumpSfxArmed = false;
    const result = jumpScore(ev.landing.airRotationDeg, quality);
    state.lastLanding = quality;
    state.lastLandingRelDeg = relDeg;
    state.lastLandingSlopeDeg = ev.landing.slopeDeg;
    state.lastJumpRotations = result.sRot;
    state.lastJumpMultiplier = result.multiplier;
    // §7 착지 판정별 이펙트(판정 로직은 건드리지 않고 «연출만» 분기)
    landingEffect(quality, state.worldX, state.worldY);
    spawnScorePop(quality, result.sRot, result.points, state.worldX, state.worldY);
    // 검증 훅 ?coincide=1 — §7.1(perfect 착지)과 §11.3(구간 통과)이 «같은 프레임»에
    // 겹쳐 터질 때 유저가 구분 가능한지 보기 위해 의도적으로 동시발화시킨다.
    // (우연히 찍히길 기다리지 말라는 지시. 색 조정 여부는 캡처를 «본 뒤»에 판단한다.)
    if (COINCIDE_TEST && quality === 'perfect') {
      // 회전 0바퀴 완전착지는 ×2 팝이 안 뜬다(점수 0). 캡처 목적상 ×2 를 강제로 띄워
      // §7.1(×2 골드) 과 §11.3(+1 골드) 이 같은 프레임에 겹치는 «최악 배치»를 만든다.
      pushScorePop({ x: state.worldX, y: state.worldY, text: '×2', color: PAL.fxGold, life: 0.8, maxLife: 0.8, rise: 40, bounce: 1.2, size: 24 });
      segmentPassEffect(state.worldX, state.worldY);
    }
    if (quality === 'crash') {
      state.crashed = true;
      crashTintT = 0.15;
    } else {
      state.jumpsScorePoints += result.points;
      state.totalScore += result.points;
      state.sRotCountTotal += result.sRot;
    }
  }

  state.y = state.worldY - state.groundY; // HUD 호환: y=0 이면 접지

  // ★ 골인선 «너머» 구간은 점수로 치지 않는다.
  //   런 종료는 「목표거리 통과 + 접지」라 공중에 떠 있으면 골인선을 지나쳐 착지한다
  //   (실측: 길이 4200px 인데 종료 시 worldX 5205 — 2구간 초과 득점).
  //   그대로 두면 Easy 에서 구간점수만 8→최대 13 이 되어 목표점수 12 를 넘겨버려,
  //   stageLength.ts 의 설계의도(구간점수만으로 ★2 불가)가 무너진다.
  const maxScoringSeg = Math.floor(stageEndX / SEGMENT_LENGTH);
  const segIdx = Math.min(currentSegmentIndex(state.worldX), maxScoringSeg);
  if (segIdx > lastSegmentIndex) {
    const inc = segIdx - lastSegmentIndex;
    state.sSegTotal += inc;
    state.totalScore += inc;
    // §11.3 통과 이펙트 — 마커가 선 구간(비-도약)만, 마커당 1회.
    for (let k = lastSegmentIndex + 1; k <= segIdx; k++) {
      if (!isMarkerSegment(k)) continue;
      markerPulse.set(k, MARKER_PULSE_S);
      segmentPassEffect(state.worldX, state.worldY);
    }
    lastSegmentIndex = segIdx;
  }

  // 스테이지 골인 판정 — 접지 상태에서 목표 거리 통과 시 런 종료
  if (runActive && !state.airborne && state.worldX >= stageEndX) {
    endRun();
  }
}

function updateCamera(dt: number) {
  const target = groundYAt(state.worldX);
  camY += (target - camY) * (1 - Math.exp(-CAM_FOLLOW_RATE * dt));
  // 라이더가 화면 밖으로 나가지 않도록 밴드 클램프.
  const bandTop = viewH * 0.16;
  const bandBottom = viewH * 0.86;
  const screenY = GROUND_SCREEN_Y - (state.worldY - camY) * scale;
  if (screenY < bandTop) camY += (bandTop - screenY) / scale;
  else if (screenY > bandBottom) camY += (bandBottom - screenY) / scale;
}

// ── 렌더 ───────────────────────────────────────────────────────────────────
// ★ 마일스톤③ 1차 아트 교체(2026-08-06). 폐기한 플레이스홀더 3종:
//   ① 라이더 삼각형 3점 path  → 네발 동물 실루엣(귀·다리·꼬리, 보드 탑승)
//   ② 회색 구간막대 + "LAUNCH" 글자 → 페넌트 깃발 + 나무 램프(쉐브론 화살표, 글자 없음)
//   ③ 하늘 단색 → 스펙 §4 하늘 그라디언트 + 패럴랙스 3겹(먼산 0.15x / 구름 0.35x / 근경둔덕 0.6x)
//   venture-designer 의 art_direction_spec.md 도착 시 이 팔레트/실루엣을 정밀 교체한다.
//   좌표는 전부 자체 설계값(원작 에셋 비복제).

// §3 등급 팔레트는 §10 모듈(render/critterArt.ts)이 단일 소스다.
// main.ts 에 있던 로컬 GradePalette/GRADE_PALETTES 사본은 중복이라 삭제했다.

// 장착 동물 — ④ 통합에서 «실제 선택된 로스터 항목»으로 교체될 훅.
// 지금은 로스터 1번(kkang/COMMON)이 기본. ?grade=EPIC 로 미리보기 가능(디자인 검수용).
const gradeParam = (QS.get('grade') || '').toUpperCase();
const equippedGrade: Grade =
  (['COMMON', 'RARE', 'EPIC', 'SPECIAL'] as const).includes(gradeParam as Grade)
    ? (gradeParam as Grade)
    : ROSTER[0].grade;
// 장착 종. ?critter=<로스터id> 로 미리보기 가능(디자인 검수용).
const equippedSpecies = speciesForRosterId(QS.get('critter') || ROSTER[0].id);

// §4·§5·§6 배경/지형/도약대 팔레트 — 스펙 값 그대로.
const PAL = {
  skyTop: '#00A6E6', skyMid: '#5FD9F5', skyLow: '#FFEFB0', // §4.1
  mountain: '#A9B2F5', // §4.2
  nearHill: '#6BEF7E', // §4.4
  groundTop: '#34C24E', groundBot: '#0B6B34', // §5.1
  grassCap: '#95F05C', grassTuft: '#52D96A', groundLine: '#08512A', soilSpot: '#127A3C', // §5.2~5.5
  rampLow: '#FF8A5C', rampHigh: '#E1461E', rampLine: '#8A2A0F', // §6
  chevron: '#FFF3B0', rampGlow: '#FFE14D', strut: '#3A3A3A',
  riderJacketTop: '#3EC6E0', riderJacketBot: '#1E8FA8', riderJacketLine: '#0F5A6B', // §2.2
  riderPants: '#2B2B33', riderSkin: '#FFD9B3', helmet: '#F5F5F5',
  fxGold: '#FFD84D', fxWhite: '#FFFFFF', fxDust: '#C9A56A', // §7
  fxCrash: '#FF4D4D', fxShardA: '#7A6A5C', fxShardB: '#5A4A3C',
  // §11 구간 마커 — 기둥 아이보리~그레이는 §5 그린과 대비되면서 §4.3 구름 흰색과 맞는다
  poleTop: '#F5F5F0', poleBot: '#C9C4B8', poleLine: '#8A8578',
  goldLine: '#B5750A', rope: '#8A5A2B', bannerCoral: '#FF6F59',
  // §11.3 구간통과 = «고빈도» 피드백이라 §7.1 퍼펙트착지(원색 골드 #FFD84D)보다
  // 한 단계 내린 화이트골드를 쓴다. 신규 색이 아니라 §6 쉐브론과 같은 값(#FFF3B0).
  segPass: '#FFF3B0',
} as const;

// §2 실루엣 로컬좌표는 «키 약 96px, bbox y -120..4» 기준이라 화면에 그대로 쓰면 과대하다.
// 화면상 캐릭터 높이 ≈ 57px(scale 1.0) 가 되도록 축소 배율을 곱한다.
// ★ 이 값은 «캐릭터 대 지형(도약대·깃발·아치)» 비율이다. 캐릭터가 작아 보인다고 여기를
//   올리면 안 된다 — 캐릭터만 커지고 지형지물은 그대로라 크기 관계가 무너진다.
//   화면상 크기는 «카메라 줌»(VIEW_WORLD_W_*)으로 잡는다. 2026-08-18 회귀 사고의 교훈.
const ART_SCALE = 0.46;

/** 결정적 의사난수(월드 좌표 기반) — 프레임마다 배경이 떨리지 않게 한다. */
function hash01(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** roundRect 미지원 환경(iOS Safari 16.3 이하)이 있어 직접 구현한다. */
function rrect(x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function worldToScreenX(wx: number, camX: number): number {
  return (wx - camX) * scale;
}
function worldToScreenY(wy: number): number {
  return GROUND_SCREEN_Y - (wy - camY) * scale;
}

/** 캡슐(둥근 끝 선분) — 라이더 팔·다리용 */
function capsule(x1: number, y1: number, x2: number, y2: number, w: number, color: string) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineWidth = w;
  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
}

// ── §4 배경 ────────────────────────────────────────────────────────────────
function drawSky() {
  const sky = ctx.createLinearGradient(0, 0, 0, viewH);
  sky.addColorStop(0.0, PAL.skyTop);
  sky.addColorStop(0.65, PAL.skyMid);
  sky.addColorStop(1.0, PAL.skyLow);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, viewW, viewH);
}

/**
 * §4.2 먼 산(스크롤 0.15x). 화면 좌표 기준으로 위상만 흘린다.
 * ★ 초안에서 «월드 높이 × 세로시차» 방식으로 짰다가, 먼 산(250×0.25)과 중경(140×0.5)이
 *   화면상 거의 같은 높이로 붕괴해 먼 레이어가 통째로 가려지는 버그가 났다(실측: 배경이
 *   납작한 띠 하나). 스펙대로 «화면상 기준선 + 진폭»을 직접 지정하는 방식으로 확정한다.
 */
function drawMountainLayer(camX: number) {
  const A = 90 * Math.max(scale, 0.7);
  const L = 900 * Math.max(scale, 0.7);
  const baseY = horizonY(0.12);
  ctx.beginPath();
  ctx.moveTo(-50, baseY);
  for (let sx = -50; sx <= viewW + 50; sx += 20) {
    const phase = sx + camX * 0.15 * scale;
    const y = baseY - (A * 0.6 + A * 0.4 * Math.sin((phase / L) * 2 * Math.PI));
    ctx.lineTo(sx, y);
  }
  ctx.lineTo(viewW + 50, viewH);
  ctx.lineTo(-50, viewH);
  ctx.closePath();
  ctx.fillStyle = PAL.mountain;
  ctx.fill();
}

/** §4.4 근경 둔덕(스크롤 0.6x) — 지형선 바로 위, 장식 전용 */
function drawNearHillLayer(camX: number) {
  const A = 25 * Math.max(scale, 0.7);
  const L = 400 * Math.max(scale, 0.7);
  const baseY = horizonY(0.035);
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.beginPath();
  ctx.moveTo(-50, baseY);
  for (let sx = -50; sx <= viewW + 50; sx += 14) {
    const phase = sx + camX * 0.6 * scale;
    const y = baseY - (A * 0.6 + A * 0.4 * Math.sin((phase / L) * 2 * Math.PI));
    ctx.lineTo(sx, y);
  }
  ctx.lineTo(viewW + 50, viewH);
  ctx.lineTo(-50, viewH);
  ctx.closePath();
  ctx.fillStyle = PAL.nearHill;
  ctx.fill();
  ctx.restore();
}

/**
 * 배경 레이어의 «지평선» 화면 Y. 카메라 세로이동을 약하게만 반영해(0.18) 원근을 준다.
 * frac 은 화면 높이 대비 지평선을 얼마나 위로 올릴지.
 */
function horizonY(frac: number): number {
  return GROUND_SCREEN_Y - viewH * frac + camY * scale * 0.18;
}

/** §4.3 구름(스크롤 0.35x) */
function drawCloud(x: number, y: number, s: number) {
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath();
  ctx.arc(x, y, 20 * s, 0, Math.PI * 2);
  ctx.arc(x - 22 * s, y + 4 * s, 14 * s, 0, Math.PI * 2);
  ctx.arc(x + 22 * s, y + 3 * s, 16 * s, 0, Math.PI * 2);
  ctx.arc(x + 4 * s, y - 10 * s, 15 * s, 0, Math.PI * 2);
  ctx.fill();
}
function drawClouds(camX: number) {
  const spacing = 800;
  const scrolled = camX * 0.35;
  const i0 = Math.floor((scrolled - 300 / scale) / spacing);
  const i1 = Math.ceil((scrolled + (viewW + 300) / scale) / spacing);
  const presetY = [0.15, 0.24, 0.19, 0.32];
  for (let i = i0; i <= i1; i++) {
    const x = (i * spacing - scrolled) * scale;
    const y = viewH * presetY[((i % 4) + 4) % 4] + camY * scale * 0.08;
    drawCloud(x, y, (0.8 + 0.5 * hash01(i + 57)) * Math.max(scale, 0.65));
  }
}

// ── §6 도약대 웨지 ─────────────────────────────────────────────────────────
/**
 * 물리상 도약대는 «구간에 진입하는 순간»(= seg.startX) 발사된다. 그래서 웨지도
 * seg.startX 에 지형 접선각으로 세운다 — 보이는 위치와 실제 발사 위치가 일치한다.
 */
function drawLaunchWedge(seg: Segment, camX: number, t: number) {
  const sx = worldToScreenX(seg.startX, camX);
  const sy = worldToScreenY(groundYAt(seg.startX));
  if (sx < -140 || sx > viewW + 140) return;
  const ang = Math.atan(groundSlopeAt(seg.startX));

  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(-ang);
  ctx.scale(scale, scale);
  ctx.lineJoin = 'round';

  // 받침 스트럿
  ctx.beginPath();
  ctx.moveTo(6, 0);
  ctx.lineTo(58, -38);
  ctx.lineTo(58, 0);
  ctx.closePath();
  ctx.globalAlpha = 0.6;
  ctx.fillStyle = PAL.strut;
  ctx.fill();
  ctx.globalAlpha = 1;

  // 웨지 본체 (70px 폭 / 34° → 높이 47px)
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(70, -47);
  ctx.quadraticCurveTo(76, -52, 70, -56);
  ctx.lineTo(60, -50);
  ctx.lineTo(0, -8);
  ctx.closePath();
  const wg = ctx.createLinearGradient(0, 0, 70, -56);
  wg.addColorStop(0, PAL.rampLow);
  wg.addColorStop(1, PAL.rampHigh);
  ctx.fillStyle = wg;
  ctx.fill();
  ctx.strokeStyle = PAL.rampLine;
  ctx.lineWidth = 3;
  ctx.stroke();

  // 쉐브론 3개(경사면과 평행, 뒤로 갈수록 흐리게)
  const alphas = [0.9, 0.6, 0.35];
  for (let i = 0; i < 3; i++) {
    const d = 46 - i * 18; // 경사면을 따라간 거리
    const cx = d * Math.cos(-0.5934); // 34deg = 0.5934rad, 화면상 위로
    const cy = d * Math.sin(-0.5934);
    ctx.save();
    ctx.translate(cx, cy - 9);
    ctx.rotate(-0.5934);
    ctx.globalAlpha = alphas[i];
    ctx.fillStyle = PAL.chevron;
    ctx.beginPath();
    ctx.moveTo(-7, -5);
    ctx.lineTo(0, 0);
    ctx.lineTo(-7, 5);
    ctx.lineTo(-4, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ctx.globalAlpha = 1;

  // 엣지 글로우(1초 주기 알파 펄스)
  ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * Math.PI * 2);
  ctx.strokeStyle = PAL.rampGlow;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(70, -47);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.restore();
}

// ── §11 구간 마커 ──────────────────────────────────────────────────────────
/** 기둥 세로 그라디언트(§11.1/§11.2 공통 톤) */
function poleGradient(h: number): CanvasGradient {
  const g = ctx.createLinearGradient(0, -h, 0, 0);
  g.addColorStop(0, PAL.poleTop);
  g.addColorStop(1, PAL.poleBot);
  return g;
}

function groundShadow(offsetX: number) {
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.beginPath();
  ctx.ellipse(offsetX, 0, 10, 4, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** §11.1 경량 마커 — 지형 기울기와 무관하게 «항상 화면상 수직»(가독성 우선) */
function drawSegmentFlag(worldX: number, camX: number, t: number, pulse: number) {
  const sx = worldToScreenX(worldX, camX);
  if (sx < -200 || sx > viewW + 200) return; // §11.1 컬링
  const sy = worldToScreenY(groundYAt(worldX));
  ctx.save();
  ctx.translate(sx, sy);
  ctx.scale(scale * pulse, scale * pulse);
  groundShadow(0);

  ctx.beginPath();
  ctx.moveTo(-2, 0);
  ctx.lineTo(-2, -62);
  ctx.lineTo(2, -62);
  ctx.lineTo(2, 0);
  ctx.closePath();
  ctx.fillStyle = poleGradient(62);
  ctx.fill();
  ctx.strokeStyle = PAL.poleLine;
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(0, -64, 4, 0, Math.PI * 2);
  ctx.closePath();
  ctx.fillStyle = PAL.fxGold;
  ctx.fill();
  ctx.strokeStyle = PAL.goldLine;
  ctx.stroke();

  const flutter = Math.sin(t * 3 + worldX * 0.01) * 3; // 마커마다 worldX 로 위상차
  ctx.beginPath();
  ctx.moveTo(2, -58);
  ctx.lineTo(28 + flutter, -52);
  ctx.lineTo(2, -46);
  ctx.closePath();
  ctx.fillStyle = PAL.fxGold;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

function pointOnQuad(tt: number, p0: [number, number], p1: [number, number], p2: [number, number]) {
  const mt = 1 - tt;
  return {
    x: mt * mt * p0[0] + 2 * mt * tt * p1[0] + tt * tt * p2[0],
    y: mt * mt * p0[1] + 2 * mt * tt * p1[1] + tt * tt * p2[1],
  };
}

/** §11.2 중량 마커(아치) — 5구간마다. 라이더가 두 기둥 사이를 통과하는 게이트. */
function drawSegmentArch(worldX: number, camX: number, pulse: number) {
  const sx = worldToScreenX(worldX, camX);
  if (sx < -260 || sx > viewW + 260) return;
  const sy = worldToScreenY(groundYAt(worldX));
  ctx.save();
  ctx.translate(sx, sy);
  ctx.scale(scale * pulse, scale * pulse);

  const drawArchPole = (offsetX: number) => {
    groundShadow(offsetX);
    ctx.beginPath();
    ctx.moveTo(offsetX - 3, 0);
    ctx.lineTo(offsetX - 3, -86);
    ctx.lineTo(offsetX + 3, -86);
    ctx.lineTo(offsetX + 3, 0);
    ctx.closePath();
    ctx.fillStyle = poleGradient(86);
    ctx.fill();
    ctx.strokeStyle = PAL.poleLine;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(offsetX, -88, 5, 0, Math.PI * 2);
    ctx.closePath();
    ctx.fillStyle = PAL.fxGold;
    ctx.fill();
    ctx.strokeStyle = PAL.goldLine;
    ctx.lineWidth = 1;
    ctx.stroke();
  };
  drawArchPole(-90);
  drawArchPole(90);

  // 처진 배너 로프(캐터너리 근사)
  const p0: [number, number] = [-90, -86];
  const p1: [number, number] = [0, -60];
  const p2: [number, number] = [90, -86];
  ctx.beginPath();
  ctx.moveTo(p0[0], p0[1]);
  ctx.quadraticCurveTo(p1[0], p1[1], p2[0], p2[1]);
  ctx.strokeStyle = PAL.rope;
  ctx.lineWidth = 2;
  ctx.stroke();

  const flagColors = [PAL.fxGold, PAL.bannerCoral];
  for (let i = 0; i < 7; i++) {
    const tt = 0.1 + i * (0.8 / 6);
    const { x, y } = pointOnQuad(tt, p0, p1, p2);
    ctx.beginPath();
    ctx.moveTo(x - 6, y);
    ctx.lineTo(x + 6, y);
    ctx.lineTo(x, y + 12);
    ctx.closePath();
    ctx.fillStyle = flagColors[i % 2];
    ctx.fill();
    ctx.strokeStyle = PAL.rope;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.restore();
}

/** 화면에 걸리는 구간 마커 전부 그린다(도약 구간 제외). */
function drawSegmentMarkers(worldLeft: number, worldRight: number, camX: number, t: number) {
  if (NO_MARKER) return;
  const k0 = Math.max(1, Math.floor(worldLeft / SEGMENT_LENGTH));
  const k1 = Math.ceil(worldRight / SEGMENT_LENGTH);
  for (let k = k0; k <= k1; k++) {
    if (!isMarkerSegment(k)) continue;
    const wx = k * SEGMENT_LENGTH;
    // §11.3 통과 마커 스케일 펄스 1.0 → 1.15 → 1.0
    const left = markerPulse.get(k) ?? 0;
    let pulse = 1;
    if (left > 0) {
      const u = 1 - left / MARKER_PULSE_S; // 0 → 1
      pulse = 1 + 0.15 * Math.sin(u * Math.PI);
    }
    if (isArchSegment(k)) drawSegmentArch(wx, camX, pulse);
    else drawSegmentFlag(wx, camX, t, pulse);
  }
}

// ── §2 라이더 실루엣 ───────────────────────────────────────────────────────
// ★ v0.1 인라인 구현(drawCritterBody/drawRiderFigure/drawGradeDecor)은 삭제했다.
//   그 버전은 EPIC 림라이트·SPECIAL 시머가 «토끼 bean path» 에 하드코딩돼 있어
//   조류/양서류에서 실루엣이 어긋난다. §10 모듈은 critterBodyPath(species) 로
//   종별 대응되므로 8종 전부에서 맞는다.

/** 라이더 전체 — 접지점 원점, 회전/스케일은 호출부 책임(§10 모듈 계약). */
function drawRiderArt(s: number, grade: Grade, t: number) {
  ctx.save();
  ctx.scale(s, s);
  drawCritterArt(ctx, { species: equippedSpecies, grade, t });
  ctx.restore();
}

// ── §7 착지/회전 이펙트 ────────────────────────────────────────────────────
// 파티클 좌표는 «월드»(y+ = 위, 물리와 동일)로 둔다. 그래야 카메라가 움직여도 제자리에 남는다.
interface EffectParticle {
  x: number; y: number; vx: number; vy: number;
  life: number; maxLife: number;
  size: number; color: string; shape: 'circle' | 'star' | 'shard';
  rotation: number; rotSpeed: number;
  gravity: number;
}
interface EffectFlash {
  x: number; y: number; life: number; maxLife: number;
  r0: number; r1: number; core: string; rim: string | null;
}
/**
 * §7.1 스코어 팝. ★ 「DoD 잔존 0」은 «프로토타입 잔재»(삼각형 3점·회색 막대·"LAUNCH")
 * 한정이지 «캔버스 텍스트 금지»가 아니다(venture-lead 정정, 2026-08-06). 스코어 팝과
 * 전복 안내는 «의도된 게임 피드백»이라 제거 대상이 아니다 — 지우지 말 것.
 */
interface ScorePop {
  x: number; y: number; text: string; color: string;
  life: number; maxLife: number;
  dy: number; // 동시 다발 시 세로로 어긋나게 쌓는 오프셋(화면 px)
  rise: number; // 위로 떠오르는 거리(px)
  bounce: number; // 스케일 바운스 정점
  size: number; // 폰트 크기(px)
}
/**
 * 이펙트 전용 시드 난수. ★ 왜 Math.random 을 안 쓰나 —
 * 「수정 전/후를 같은 구도로 비교하라」는 요구를 만족하려면 두 캡처가 «같은 프레임에서
 * 같은 파티클 배치»여야 한다. Math.random 이면 매 실행마다 흩어짐이 달라져 대조가 안 된다.
 * 시드 고정이라도 시퀀스는 충분히 흩어져 보이므로 연출 품질에는 영향이 없다.
 */
let fxSeed = 0x2f6e2b1;
function fxRand(): number {
  fxSeed = (Math.imul(fxSeed, 1664525) + 1013904223) >>> 0;
  return fxSeed / 4294967296;
}

const particles: EffectParticle[] = [];
const flashes: EffectFlash[] = [];
const scorePops: ScorePop[] = [];
const MAX_PARTICLES = 220;

function spawnParticle(p: EffectParticle) {
  if (NO_PARTICLE) return;
  if (particles.length >= MAX_PARTICLES) particles.shift();
  particles.push(p);
}

/**
 * §7.1/§7.2 스코어 팝. 배수가 «실제로 붙은» 경우에만 ×2 를 띄운다 —
 * 회전 0바퀴 완전착지는 점수가 0이라, 거기에 ×2 를 띄우면 거짓 피드백이 된다.
 */
function spawnScorePop(quality: string, sRot: number, points: number, x: number, y: number) {
  if (sRot < 1) return; // 회전 미완주 = 획득 점수 0 → 팝 없음
  if (quality === 'perfect') {
    pushScorePop({ x, y, text: '×2', color: PAL.fxGold, life: 0.8, maxLife: 0.8, rise: 40, bounce: 1.2, size: 24 });
  } else if (quality === 'normal') {
    // 스펙: 배율 없는 흰색 숫자만(선택) — 획득 점수를 그대로 보여준다.
    pushScorePop({ x, y, text: `+${points}`, color: PAL.fxWhite, life: 0.7, maxLife: 0.7, rise: 34, bounce: 1.15, size: 21 });
  }
}

/**
 * 팝 스폰 공통 경로. ★ 동시발화 캡처에서 «+1 팝 8개가 가로로 뭉쳐 판독 불가»가 실측으로
 * 나왔다. 월드좌표가 가까운 생존 팝 수만큼 세로로 어긋나게 쌓아 겹침을 없앤다.
 */
function pushScorePop(p: Omit<ScorePop, 'dy'>) {
  if (NO_POP) return;
  let near = 0;
  for (const q of scorePops) if (Math.abs(q.x - p.x) < 90) near++;
  scorePops.push({ ...p, dy: NO_STACK ? 0 : -near * 20 });
}

// ── §11 구간 통과(+1점) 피드백 ─────────────────────────────────────────────
// 마커는 «비-도약 구간 경계»에만 선다(도약대 구간은 §6 램프가 점유 — 시각 충돌 방지).
// 5구간(2500px)마다는 중량 아치, 나머지는 경량 깃발.
const MARKER_PULSE_S = 0.2;
/** 통과한 마커의 잔여 펄스시간: 구간 index -> 남은 초 */
const markerPulse = new Map<number, number>();

function isMarkerSegment(idx: number): boolean {
  if (idx <= 0) return false;
  const seg = track[idx];
  return !!seg && seg.type !== 'launch';
}
function isArchSegment(idx: number): boolean {
  return idx % 5 === 0;
}

/** §11.3 통과 이펙트 — 라이더 위치에서 발생. 7.1 perfect 보다 «작고 짧게». */
function segmentPassEffect(x: number, y: number) {
  if (NO_PASS_FX) return;
  pushFlash({ x, y, life: 0.18, maxLife: 0.18, r0: 0, r1: 40, core: OLD_SEG_COLOR ? PAL.fxGold : PAL.segPass, rim: PAL.fxWhite });
  const n = 8 + Math.floor(fxRand() * 3);
  for (let i = 0; i < n; i++) {
    const a = Math.PI * (0.15 + 0.7 * fxRand());
    const sp = 100 + fxRand() * 100;
    spawnParticle({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: 0.3 + fxRand() * 0.15, maxLife: 0.45,
      size: 2.6, color: OLD_SEG_COLOR ? PAL.fxGold : PAL.segPass, shape: 'star',
      rotation: fxRand() * 6.28, rotSpeed: (fxRand() - 0.5) * 8, gravity: GRAVITY * 0.5,
    });
  }
  pushScorePop({ x, y, text: '+1', color: OLD_SEG_COLOR ? PAL.fxGold : PAL.segPass, life: 0.5, maxLife: 0.5, rise: 24, bounce: 1.15, size: 17 });
}

function pushFlash(f: EffectFlash) {
  if (NO_FLASH) return;
  flashes.push(f);
}

function landingEffect(quality: string, x: number, y: number) {
  if (quality === 'perfect') {
    pushFlash({ x, y, life: 0.2, maxLife: 0.2, r0: 0, r1: 60, core: PAL.fxWhite, rim: PAL.fxGold });
    const n = 12 + Math.floor(fxRand() * 5);
    for (let i = 0; i < n; i++) {
      const a = Math.PI * (0.08 + 0.84 * fxRand()); // 위쪽 180도 부채꼴
      const sp = 120 + fxRand() * 140;
      spawnParticle({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 0.5 + fxRand() * 0.2, maxLife: 0.7,
        size: 4, color: fxRand() < 0.5 ? PAL.fxGold : PAL.fxWhite, shape: 'star',
        rotation: fxRand() * 6.28, rotSpeed: (fxRand() - 0.5) * 10, gravity: GRAVITY,
      });
    }
  } else if (quality === 'normal') {
    pushFlash({ x, y, life: 0.18, maxLife: 0.18, r0: 0, r1: 30, core: PAL.fxWhite, rim: null });
    const n = 6 + Math.floor(fxRand() * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.PI * (0.15 + 0.7 * fxRand());
      const sp = 60 + fxRand() * 60;
      spawnParticle({
        x, y, vx: Math.cos(a) * sp * 1.4, vy: Math.sin(a) * sp * 0.5,
        life: 0.4, maxLife: 0.4,
        size: 3 + fxRand() * 2, color: PAL.fxDust, shape: 'circle',
        rotation: 0, rotSpeed: 0, gravity: GRAVITY * 0.6,
      });
    }
  } else {
    pushFlash({ x, y, life: 0.15, maxLife: 0.15, r0: 0, r1: 50, core: PAL.fxCrash, rim: PAL.fxWhite });
    const n = 10 + Math.floor(fxRand() * 5);
    for (let i = 0; i < n; i++) {
      const a = Math.PI * fxRand();
      const sp = 90 + fxRand() * 170;
      spawnParticle({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 0.7 + fxRand() * 0.2, maxLife: 0.9,
        size: 4 + fxRand() * 3,
        color: fxRand() < 0.5 ? PAL.fxShardA : PAL.fxShardB, shape: 'shard',
        rotation: fxRand() * 6.28, rotSpeed: (fxRand() - 0.5) * 14, gravity: GRAVITY,
      });
    }
    for (let i = 0; i < 3; i++) {
      spawnParticle({
        x, y: y + 28 + i * 6, vx: (fxRand() - 0.5) * 40, vy: 20 + fxRand() * 20,
        life: 0.9, maxLife: 0.9, size: 5, color: PAL.fxWhite, shape: 'star',
        rotation: 0, rotSpeed: 3, gravity: 0,
      });
    }
  }
}

function updateEffects(dt: number) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.vy -= p.gravity * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.rotation += p.rotSpeed * dt;
    p.life -= dt;
    if (p.life <= 0) particles.splice(i, 1);
  }
  for (let i = flashes.length - 1; i >= 0; i--) {
    flashes[i].life -= dt;
    if (flashes[i].life <= 0) flashes.splice(i, 1);
  }
  for (let i = scorePops.length - 1; i >= 0; i--) {
    scorePops[i].life -= dt;
    if (scorePops[i].life <= 0) scorePops.splice(i, 1);
  }
  for (const [k, v] of markerPulse) {
    const nv = v - dt;
    if (nv <= 0) markerPulse.delete(k); else markerPulse.set(k, nv);
  }
  // §6 램프 앰비언트 파티클 — 플레이어 앞쪽 가까운 도약대에서만
  rampSpawnTimer -= dt;
  if (rampSpawnTimer <= 0) {
    rampSpawnTimer = 0.3;
    for (const seg of track) {
      const d = seg.startX - state.worldX;
      if (seg.type !== 'launch' || d < -120 || d > 700) continue;
      const bx = seg.startX + 20 + fxRand() * 50;
      spawnParticle({
        x: bx, y: groundYAt(seg.startX) + 20 + fxRand() * 30,
        vx: 0, vy: 26 + fxRand() * 18,
        life: 0.8, maxLife: 0.8, size: 2, color: PAL.chevron, shape: 'circle',
        rotation: 0, rotSpeed: 0, gravity: 0,
      });
      break;
    }
  }
  // §3.2 SPECIAL 금가루 트레일
  if (equippedGrade === 'SPECIAL' && !state.crashed) {
    goldTrailTimer -= dt;
    if (goldTrailTimer <= 0) {
      goldTrailTimer = 0.15;
      spawnParticle({
        x: state.worldX - 12, y: state.worldY + 10,
        vx: -20 - fxRand() * 30, vy: -10 - fxRand() * 20,
        life: 0.6, maxLife: 0.6, size: 2.5, color: PAL.fxGold, shape: 'star',
        rotation: 0, rotSpeed: 6, gravity: 0,
      });
    }
  }
}
let rampSpawnTimer = 0;
let goldTrailTimer = 0;

// 검증 훅 ?fx=1 — «실제 스폰 경로»로 파티클을 채워 상한 판단용 CPU 측정을 가능하게 한다.
// (측정 코드가 파티클 그리기를 재구현하면 의미가 없어서, 진짜 landingEffect 를 부른다.)
if (QS.get('fx') === '1') {
  (window as unknown as { __fxBurst: (n: number) => number }).__fxBurst = (n: number) => {
    while (particles.length < n) landingEffect('crash', state.worldX, state.worldY);
    return particles.length;
  };
}

function drawStarShape(r: number) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 === 0 ? r : r * 0.45;
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(a) * rr;
    const y = Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function drawEffects(camX: number) {
  for (const f of flashes) {
    const k = 1 - f.life / f.maxLife;
    const x = worldToScreenX(f.x, camX);
    const y = worldToScreenY(f.y);
    const r = (f.r0 + (f.r1 - f.r0) * k) * scale;
    ctx.save();
    if (f.rim) {
      ctx.globalAlpha = (1 - k) * 0.8;
      ctx.strokeStyle = f.rim;
      ctx.lineWidth = 4 * scale;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = (1 - k) * 0.7;
    ctx.fillStyle = f.core;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  for (const p of particles) {
    const x = worldToScreenX(p.x, camX);
    const y = worldToScreenY(p.y);
    if (x < -40 || x > viewW + 40) continue;
    ctx.save();
    ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
    ctx.translate(x, y);
    ctx.rotate(p.rotation);
    ctx.fillStyle = p.color;
    const s = p.size * scale;
    if (p.shape === 'star') {
      drawStarShape(s);
      ctx.fill();
    } else if (p.shape === 'shard') {
      ctx.beginPath();
      ctx.moveTo(-s, s * 0.6);
      ctx.lineTo(s, 0);
      ctx.lineTo(-s * 0.4, -s * 0.8);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, s, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

/** §7.1 스코어 팝 렌더 — 스케일 바운스(0→1.2→1.0) + 위로 40px + 페이드 */
function drawScorePops(camX: number) {
  for (const p of scorePops) {
    const t = 1 - p.life / p.maxLife; // 0 → 1
    const x = worldToScreenX(p.x, camX);
    const y = worldToScreenY(p.y) - 24 * scale - p.rise * t * scale + p.dy;
    let s: number;
    if (t < 0.18) s = (t / 0.18) * p.bounce;
    else if (t < 0.36) s = p.bounce - (p.bounce - 1) * ((t - 0.18) / 0.18);
    else s = 1.0;
    const alpha = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4;
    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.textAlign = 'center';
    ctx.font = `bold ${Math.round(p.size * Math.max(scale, 0.72))}px system-ui, sans-serif`;
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(30,20,10,0.55)';
    ctx.strokeText(p.text, 0, 0);
    ctx.fillStyle = p.color;
    ctx.fillText(p.text, 0, 0);
    ctx.restore();
  }
}

function render() {
  const camX = state.worldX - PLAYER_SCREEN_X / scale;
  const worldLeft = camX - 40 / scale;
  const worldRight = camX + (viewW + 40) / scale;
  const sampleStep = 12 / scale;

  // ── 배경 ──
  // ① 존 에셋(이미지 레이어)이 준비돼 있으면 그걸로 그린다.
  // ② 없으면 §4 도형 렌더로 폴백한다 — 에셋이 하나도 없어도 게임은 그대로 돈다.
  const zvp: ZoneViewport = {
    viewW, viewH, scale, camX, camY, groundScreenY: GROUND_SCREEN_Y,
  };
  if (!drawZoneBackground(ctx, zvp)) {
    drawSky();
    drawMountainLayer(camX);
    drawClouds(camX);
    drawNearHillLayer(camX);
  }

  // ── §5 지형 — groundYAt() 을 그대로 샘플링하므로 물리와 같은 곡선이다 ──
  const pts: Array<[number, number]> = [];
  for (let wx = worldLeft; wx <= worldRight; wx += sampleStep) {
    pts.push([worldToScreenX(wx, camX), worldToScreenY(groundYAt(wx))]);
  }
  pts.push([worldToScreenX(worldRight, camX), worldToScreenY(groundYAt(worldRight))]);

  const topLinePath = () => {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  };

  // 5.1 바디 — 존 지면 타일이 있으면 «패턴», 없으면 기존 그라디언트.
  //   ★ path 는 한 번만 만들고 fillStyle 만 갈아끼운다(두 경로가 같은 곡선을 쓴다는 보장).
  topLinePath();
  ctx.lineTo(pts[pts.length - 1][0], viewH + 60);
  ctx.lineTo(pts[0][0], viewH + 60);
  ctx.closePath();
  const groundPat = zoneGroundPattern(ctx, zvp);
  if (groundPat) {
    ctx.fillStyle = groundPat;
    ctx.fill();
    // 타일 그대로만 깔면 «아래로 갈수록 어두워지는» 깊이감이 사라져 스티커처럼 보인다.
    //   기존 그라디언트가 만들던 명암만 얇게 얹는다(색은 안 바꾸고 어둡게만).
    ctx.save();
    const shade = ctx.createLinearGradient(0, GROUND_SCREEN_Y - viewH * 0.1, 0, viewH);
    shade.addColorStop(0, 'rgba(0,0,0,0)');
    shade.addColorStop(1, 'rgba(0,0,0,0.30)');
    ctx.fillStyle = shade;
    ctx.fill();
    ctx.restore();
  } else {
    const bodyG = ctx.createLinearGradient(0, GROUND_SCREEN_Y - viewH * 0.1, 0, viewH);
    bodyG.addColorStop(0, PAL.groundTop);
    bodyG.addColorStop(1, PAL.groundBot);
    ctx.fillStyle = bodyG;
    ctx.fill();
  }

  // 5.5 흙 반점(잔디 캡 아래) — «단색 면을 깨뜨리려고» 둔 장식이다. 타일이 깔린
  //   경우엔 무늬가 이미 있으므로 겹쳐 찍지 않는다(지저분해진다).
  if (!groundPat) {
    ctx.save();
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = PAL.soilSpot;
    const spotStep = 140;
    for (let wx = Math.ceil(worldLeft / spotStep) * spotStep; wx <= worldRight; wx += spotStep) {
      const x = worldToScreenX(wx, camX);
      const y = worldToScreenY(groundYAt(wx)) + (26 + 40 * hash01(wx)) * scale;
      ctx.beginPath();
      ctx.ellipse(x, y, 5 * scale, 3 * scale, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // 지형 «가장자리» 색 — 존이 지정한 값이 있으면 그걸 쓰고, 없으면 PAL 그대로.
  //   ★ 사막·설원·밤하늘 지면 위에 형광 초록 잔디가 그려지는 걸 막는 장치다.
  //     PAL 블록 자체는 «다른 라인 소유»라 손대지 않고, 여기서 «읽을 값만» 고른다.
  const trim = zoneTrim();
  const trimCap = trim ? trim.cap : PAL.grassCap;
  const trimTuft = trim ? trim.tuft : PAL.grassTuft;
  const trimLine = trim ? trim.line : PAL.groundLine;
  const drawTufts = trim ? trim.tufts : true;

  // 5.4 잔디 텁(상단 라인을 따라 작은 스파이크)
  if (drawTufts) {
    ctx.fillStyle = trimTuft;
    const tuftStep = 24;
    for (let wx = Math.ceil(worldLeft / tuftStep) * tuftStep; wx <= worldRight; wx += tuftStep) {
      const x = worldToScreenX(wx, camX);
      const y = worldToScreenY(groundYAt(wx));
      const h = (4 + 5 * hash01(wx * 0.37)) * scale;
      ctx.beginPath();
      ctx.moveTo(x - 3 * scale, y);
      ctx.lineTo(x, y - h);
      ctx.lineTo(x + 3 * scale, y);
      ctx.closePath();
      ctx.fill();
    }
  }

  // 5.2 잔디 캡 스트라이프(상단 라인에서 아래로 8px)
  const capT = 8 * Math.max(scale, 0.7);
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  for (let i = pts.length - 1; i >= 0; i--) ctx.lineTo(pts[i][0], pts[i][1] + capT);
  ctx.closePath();
  ctx.fillStyle = trimCap;
  ctx.fill();

  // 5.3 상단 곡선만 stroke
  topLinePath();
  ctx.strokeStyle = trimLine;
  ctx.lineWidth = 3 * Math.max(scale, 0.7);
  ctx.stroke();

  // ── §11 구간 마커 ──
  drawSegmentMarkers(worldLeft, worldRight, camX, artTime);

  // ── §6 도약대 웨지 ──
  for (const seg of track) {
    if (seg.type !== 'launch') continue;
    if (seg.endX < worldLeft || seg.startX > worldRight) continue;
    drawLaunchWedge(seg, camX, artTime);
  }

  drawEffects(camX);

  // ── §2 라이더 — 접지 중이면 지형각, 공중이면 누적 자세각(둘 다 state.rotationDeg) ──
  const py = worldToScreenY(state.worldY);
  const rs = Math.max(scale, RIDER_MIN_SCALE) * ART_SCALE;
  ctx.save();
  ctx.translate(PLAYER_SCREEN_X, py);
  // 반시계: 캔버스 y-down 좌표계에서 rotate()의 양의 각도는 시각적으로 시계방향.
  // rotationDeg(내부 누적, 양수)를 화면상 반시계로 보이게 하려면 음의 라디안 사용.
  // (아트 스펙 §1 이 «렌더 접합 시 실측 확인 필수»로 남긴 항목 — 오르막 경사에서
  //  기수가 같이 들리는지 스크린샷으로 대조해 확인했다.)
  ctx.rotate((-state.rotationDeg * Math.PI) / 180);
  drawRiderArt(rs, equippedGrade, artTime);
  // §7.3 전복 시 실루엣 빨강 틴트(150ms)
  if (state.crashed && crashTintT > 0) {
    ctx.save();
    ctx.globalAlpha = 0.3 * (crashTintT / 0.15);
    ctx.scale(rs, rs);
    ctx.fillStyle = PAL.fxCrash;
    ctx.beginPath();
    ctx.arc(20, -60, 62, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();

  drawScorePops(camX); // 라이더 위에 얹는다

  if (state.crashed) {
    ctx.save();
    ctx.fillStyle = 'rgba(20,16,30,0.42)';
    ctx.fillRect(0, 0, viewW, viewH);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.round(Math.min(46, viewW * 0.1))}px system-ui, sans-serif`;
    ctx.fillText(t(LOCALE, 'landing.crash'), viewW / 2, viewH / 2);
    ctx.font = `${Math.round(Math.min(17, viewW * 0.04))}px system-ui, sans-serif`;
    ctx.fillStyle = PAL.fxGold;
    ctx.fillText(t(LOCALE, 'crash.restart'), viewW / 2, viewH / 2 + 34);
    ctx.restore();
  }
}

interface CycleDebug extends GameState {
  // 존 상태 — 자동검증(헤드리스)이 «지금 어느 존인지 / 이미지로 그렸는지 폴백인지»를
  // 화면 픽셀이 아니라 값으로 확인할 수 있어야 한다. 색만 보고 판정하면 오판한다.
  zoneId: string;
  zoneNameKo: string;
  zoneAssetsReady: number;
  zoneAssetsTotal: number;
  zoneUsingImages: boolean;
  gachaGems: number;
  gachaDrawsCompleted: number;
  gachaOwnedIds: string[];
  gachaOwnedCount: number;
  gachaPoolSize: number;
  lastPulledId: string | null;
  viewW: number;
  viewH: number;
  scale: number;
  fxParticles: number;
  fxScorePops: number;
  fxScorePopsNear: number;
  stageEndX: number;
  stageId: string;
  stageNumber: number;
  fxFlashes: number;
  equippedGrade: Grade;
  /** 이번 로드에서 저장본을 어떻게 처리했는지(empty/loaded/corrupt/version-mismatch/unavailable). */
  saveStatus: string;
}

let lastPulledId: string | null = null;

function publishDebug() {
  const ownedArr = Array.from(gachaState.ownedIds);
  if (ownedArr.length > 0) lastPulledId = ownedArr[ownedArr.length - 1];
  const zs = zoneAssetStatus();
  const full: CycleDebug = {
    ...state,
    zoneId: zs.zoneId,
    zoneNameKo: zs.zoneNameKo,
    zoneAssetsReady: zs.ready,
    zoneAssetsTotal: zs.total,
    zoneUsingImages: zs.usingImages,
    gachaGems: gachaState.gems,
    gachaDrawsCompleted: gachaState.drawsCompleted,
    gachaOwnedIds: ownedArr,
    gachaOwnedCount: ownedArr.length,
    gachaPoolSize: GACHA_POOL.length,
    lastPulledId,
    viewW, viewH, scale,
    fxParticles: particles.length,
    fxScorePops: scorePops.length,
    fxScorePopsNear: scorePops.filter((q) => Math.abs(q.x - state.worldX) < 420).length,
    stageEndX,
    stageId: currentStage.id,
    stageNumber: currentStage.number,
    fxFlashes: flashes.length,
    equippedGrade,
    saveStatus: saveLoad.status,
  };
  if (EXPOSE_DEBUG) (window as unknown as { __debug: CycleDebug }).__debug = full;
  if (!DEBUG_HUD) return;
  hud.textContent =
`frame=${state.frame}
worldX=${state.worldX.toFixed(0)} vx=${state.vx.toFixed(0)} y=${state.y.toFixed(0)} vy=${state.vy.toFixed(0)}
airborne=${state.airborne} touching=${state.touching} crashed=${state.crashed}
rotationDeg=${state.rotationDeg.toFixed(1)}
zone=${activeZone().nameKo}(${zs.zoneId}) assets=${zs.ready}/${zs.total} images=${zs.usingImages}
groundY=${state.groundY.toFixed(0)} slope=${state.slope.toFixed(3)}(${((Math.atan(state.slope) * 180) / Math.PI).toFixed(1)}deg) liftoffs=${state.liftoffs} pads=${state.padLaunches}
S_seg=${state.sSegTotal}  S_rot(points)=${state.jumpsScorePoints}  lastLanding=${state.lastLanding} lastRot=${state.lastJumpRotations} lastMult=${state.lastJumpMultiplier}
landRel=${state.lastLandingRelDeg.toFixed(1)}deg landSlope=${state.lastLandingSlopeDeg.toFixed(1)}deg
SCORE=${state.totalScore}
--- CYCLE ---
stageCleared=${state.stageCleared} stageStars=${state.stageStars} profileStars=${state.profileStars} milestone=${state.milestoneTriggered}
gachaGems=${gachaState.gems} draws=${gachaState.drawsCompleted}/${GACHA_POOL.length} owned=${JSON.stringify(ownedArr)}`;
}

let lastTime: number | null = null;
const MAX_SUBSTEP = 1 / 120; // 착지 판정 정밀도 확보용 서브스텝

function advance(dt: number) {
  let remain = dt;
  while (remain > 1e-6) {
    const sub = Math.min(remain, MAX_SUBSTEP);
    update(sub);
    remain -= sub;
    if (state.crashed) break;
  }
}

// 검증 훅 ?stage=N — N번(1-based) 스테이지를 «잠금 무시하고» 바로 시작한다.
// 후반 티어는 별 게이트 때문에 정상 경로로는 즉시 도달할 수 없어, 티어별 동작 확인이
// 불가능해진다. QA/성능측정에서 후반 스테이지를 바로 띄우는 용도.
const stageParam = Number(QS.get('stage') ?? 0) || 0;
const startStage =
  stageParam >= 1 && stageParam <= STAGES.length
    ? STAGES[stageParam - 1]
    : nextPlayableStage(progress);

// ★ 로드 즉시 플레이 시작(시작 메뉴 없음). 조작안내는 UI 쪽 토스트가 담당.
startRun(startStage);

if (FAST_FORWARD_S > 0) {
  const FF_FRAME = 1 / 60;
  // ★ 런이 끝나면(골인/전복) 멈춘다. 안 그러면 ff 값이 스테이지 길이보다 클 때
  //   골인선 «너머»(트랙 데이터가 없어 마커·도약대가 하나도 없는 구간)에 정지해
  //   성능/시각 측정이 비대표 장면에서 이뤄진다(실측: ff>=5 에서 마커 0개).
  for (let t = 0; t < FAST_FORWARD_S && !state.crashed && runActive; t += FF_FRAME) {
    state.frame++;
    advance(FF_FRAME);
    // ★ 이펙트도 «같이» 노화시켜야 한다. 빠뜨렸더니 파티클·스코어팝이 런 전체에 걸쳐
    //   한 번도 소멸하지 않고 누적돼(ff=10 에서 팝 52개), 실제로는 있을 수 없는 상태가
    //   만들어졌다 — 그 상태로 대조 캡처를 찍어 「팝이 안 보인다」로 헤맸다.
    artTime += FF_FRAME;
    if (crashTintT > 0) crashTintT = Math.max(0, crashTintT - FF_FRAME);
    updateEffects(FF_FRAME);
    updateCamera(FF_FRAME);
  }
}

function step(now: number) {
  if (lastTime === null) lastTime = now;
  let dt = (now - lastTime) / 1000;
  dt = Math.min(dt, 1 / 30);
  lastTime = now;
  state.frame++;

  const uiOpen = meta.current() !== null;
  if (!FREEZE_AFTER_FF) {
    if (!state.crashed && !uiOpen) advance(dt);
    artTime += dt;
  }
  if (!FREEZE_AFTER_FF) {
    if (crashTintT > 0) crashTintT = Math.max(0, crashTintT - dt);
    updateEffects(dt);
    updateCamera(dt);
  }
  render();
  publishDebug();
  requestAnimationFrame(step);
}

requestAnimationFrame(step);
