// track.ts — 마일스톤① 곡선 지형(절차생성). 평지 고정을 폐기하고 연속 곡선으로 교체.
//
// 좌표·파라미터는 전부 자체 설계값이다(3.1절 절차생성 원칙 유지, 원작 좌표 비복제).
// 지형은 «해석적으로 정의»된다 — 높이 H(x)와 그 도함수 H'(x)가 같은 식에서 나오므로
// 물리(경사 가속·이함 판정)와 렌더(폴리라인)가 같은 곡선을 본다.
//
// H(x) = ease(x) * [ Σ Ai·sin(2π·x/Li + φi)  +  Σ kicker_k(x) ]
//   - Σ sin : 완만하게 굽이치는 «구릉». 곡률이 낮아 중력만으로는 잘 안 뜬다(주행 리듬 담당).
//   - kicker : 비대칭 raised-cosine 둔덕. 앞면은 완만(탈 수 있게), 뒷면은 짧고 가팔라서
//              «마루 곡률»이 커진다 → 일정 속도 이상이면 중력이 지형을 못 따라가 자연 이함.
//   - ease   : 출발 구간(0~START_EASE_X)을 평지로 만들어 시작 직후 사고를 막는다.
//
// 좌표계: worldX 는 오른쪽 +, H 는 «위쪽 +»(월드 높이). 화면 변환은 main.ts 담당.

export interface Segment {
  startX: number;
  endX: number;
  type: 'flat' | 'launch';
}

export const SEGMENT_LENGTH = 500; // px, 구간 통과 판정 단위
export const TRACK_TOTAL_LENGTH = 60000; // px, 테스트 트랙 총 길이(30초 이상 주행 확보)
export const LAUNCH_PAD_SEGMENT_INDICES = [3, 8, 13]; // 3개 지점(자체설계) — 회전0/일반/완전착지 3케이스 순차 실증용
const LAUNCH_PAD_REPEAT_FROM = 19; // 위 3개 이후로는 주기 배치(장거리 주행용)
const LAUNCH_PAD_REPEAT_EVERY = 14;

export function isLaunchSegment(index: number): boolean {
  if (LAUNCH_PAD_SEGMENT_INDICES.includes(index)) return true;
  if (index < LAUNCH_PAD_REPEAT_FROM) return false;
  return (index - LAUNCH_PAD_REPEAT_FROM) % LAUNCH_PAD_REPEAT_EVERY === 0;
}

export function buildTestTrack(): Segment[] {
  const segments: Segment[] = [];
  let x = 0;
  let i = 0;
  while (x < TRACK_TOTAL_LENGTH) {
    const type: Segment['type'] = isLaunchSegment(i) ? 'launch' : 'flat';
    segments.push({ startX: x, endX: x + SEGMENT_LENGTH, type });
    x += SEGMENT_LENGTH;
    i++;
  }
  return segments;
}

/**
 * 스테이지 1개용 트랙. 길이와 도약대 «개수»를 받아 절차 생성한다.
 * 도약대 개수는 stages.ts 의 TierDef.launchPadCount 를 그대로 반영한다(티어별 확정치).
 * 배치는 시작/끝 구간을 피해 균등 분산 — 시작 직후(START_EASE_X 완충구간)에
 * 도약대가 걸리면 속도가 안 붙은 채 발사돼 사고가 난다.
 */
export function buildStageTrack(totalLength: number, launchPadCount: number): Segment[] {
  const count = Math.max(3, Math.ceil(totalLength / SEGMENT_LENGTH));
  const firstIdx = 2;              // 0,1 구간은 가속 구간으로 비워 둔다
  const lastIdx = count - 2;       // 마지막 구간엔 두지 않는다(골인 직전 발사 방지)
  const pads = new Set<number>();
  const span = lastIdx - firstIdx + 1;
  if (launchPadCount > 0 && span > 0) {
    for (let i = 0; i < launchPadCount; i++) {
      const idx = firstIdx + Math.round(((i + 0.5) * span) / launchPadCount) - 1;
      pads.add(Math.min(lastIdx, Math.max(firstIdx, idx)));
    }
  }
  const segments: Segment[] = [];
  for (let i = 0; i < count; i++) {
    segments.push({
      startX: i * SEGMENT_LENGTH,
      endX: (i + 1) * SEGMENT_LENGTH,
      type: pads.has(i) ? 'launch' : 'flat',
    });
  }
  return segments;
}

// ── 지형 파라미터(자체 설계) ────────────────────────────────────────────────
// ★ 실측(tools 검산, x=0..60000 를 0.5px 간격 주사):
//   높이 -82.6 ~ +124.3 / 언덕 낙차 중앙값 103px·최대 182px
//   최대 오르막 |H'| = 0.410(22.3°) — GROUND_ACCEL/GRAVITY = 0.409 와 사실상 동일하게
//     맞춰 놨다. 즉 «터치 유지 시 거의 모든 오르막을 등판»할 수 있다.
//     (0.001 초과분은 폭이 극히 좁아 관성으로 통과. 만약을 위해 physics.ts 에
//      역주행(rollback) 허용을 넣어 스톨 잠금이 생기지 않게 했다.)
//   최대 볼록곡률 |H''| = 1.33e-2 → 이함 최소속도 408 px/s (MAX_SPEED 1400 대비 여유)
//   해석적 도함수 vs 중앙차분 최대오차 2.1e-5 (도함수 검산 통과)
export interface TerrainWave { amplitude: number; wavelength: number; phase: number; }

export const TERRAIN_WAVES: TerrainWave[] = [
  { amplitude: 60, wavelength: 2200, phase: 0.00 }, // |H'|max 0.171
  { amplitude: 18, wavelength: 1050, phase: 1.13 }, // |H'|max 0.108
  { amplitude: 5, wavelength: 610, phase: 2.57 },   // |H'|max 0.052
];

// 킥커(비대칭 둔덕): 앞면 KICKER_RISE_W 로 완만히 올라가고 뒷면 KICKER_FALL_W 로 짧게 떨어진다.
// raised-cosine 은 u=0(마루)·|u|=1(끝단)에서 기울기가 0이라, 폭이 다른 두 반쪽을 이어도 C1 연속이다.
export const KICKER_FIRST_X = 1150;
export const KICKER_SPACING = 1600;
export const KICKER_RISE_W = 560; // 앞면 반폭(완만)
export const KICKER_FALL_W = 140; // 뒷면 반폭(가파름 → 마루 곡률 ↑ → 자연 이함)
export const KICKER_AMPLITUDES = [34, 52, 42]; // 순환

export const START_EASE_X = 700; // 이 구간은 평지에서 지형으로 부드럽게 전이

const TAU = Math.PI * 2;

function kickerAmplitude(k: number): number {
  const n = KICKER_AMPLITUDES.length;
  return KICKER_AMPLITUDES[((k % n) + n) % n];
}

function kickerCenterX(k: number): number {
  return KICKER_FIRST_X + k * KICKER_SPACING;
}

/** 킥커 1개의 높이 기여 */
function kickerHeight(worldX: number, k: number): number {
  const a = kickerAmplitude(k);
  const dx = worldX - kickerCenterX(k);
  const w = dx < 0 ? KICKER_RISE_W : KICKER_FALL_W;
  if (Math.abs(dx) >= w) return 0;
  return a * 0.5 * (1 + Math.cos((Math.PI * dx) / w));
}

/** 킥커 1개의 기울기 기여(해석적 도함수) */
function kickerSlope(worldX: number, k: number): number {
  const a = kickerAmplitude(k);
  const dx = worldX - kickerCenterX(k);
  const w = dx < 0 ? KICKER_RISE_W : KICKER_FALL_W;
  if (Math.abs(dx) >= w) return 0;
  return -a * 0.5 * (Math.PI / w) * Math.sin((Math.PI * dx) / w);
}

/** 관여 가능한 킥커 인덱스 범위(국소 함수라 이웃 몇 개만 보면 된다) */
function kickerRange(worldX: number): { from: number; to: number } {
  const k0 = Math.floor((worldX - KICKER_FIRST_X) / KICKER_SPACING);
  return { from: k0 - 1, to: k0 + 1 };
}

/** 출발 완충: 0..START_EASE_X 를 smoothstep 으로 0→1 */
function startEase(worldX: number): number {
  if (worldX <= 0) return 0;
  if (worldX >= START_EASE_X) return 1;
  const t = worldX / START_EASE_X;
  return t * t * (3 - 2 * t);
}
function startEaseSlope(worldX: number): number {
  if (worldX <= 0 || worldX >= START_EASE_X) return 0;
  const t = worldX / START_EASE_X;
  return (6 * t * (1 - t)) / START_EASE_X;
}

/** ease 를 적용하기 전의 «원지형» 높이 */
function rawHeight(worldX: number): number {
  let h = 0;
  for (const w of TERRAIN_WAVES) {
    h += w.amplitude * Math.sin((TAU * worldX) / w.wavelength + w.phase);
  }
  const { from, to } = kickerRange(worldX);
  for (let k = from; k <= to; k++) {
    if (k < 0) continue;
    h += kickerHeight(worldX, k);
  }
  return h;
}

/** ease 를 적용하기 전의 «원지형» 기울기(해석적 도함수) */
function rawSlope(worldX: number): number {
  let s = 0;
  for (const w of TERRAIN_WAVES) {
    s += w.amplitude * (TAU / w.wavelength) * Math.cos((TAU * worldX) / w.wavelength + w.phase);
  }
  const { from, to } = kickerRange(worldX);
  for (let k = from; k <= to; k++) {
    if (k < 0) continue;
    s += kickerSlope(worldX, k);
  }
  return s;
}

/** 지형 높이(월드 y, 위쪽 +). 이전 버전의 «항상 0» 을 대체한다. */
export function groundYAt(worldX: number): number {
  return startEase(worldX) * rawHeight(worldX);
}

/**
 * 지형 기울기 dH/dx. 해석적 도함수(곱미분: e'·h + e·h').
 * 수치미분이 아니라 같은 식에서 유도하므로 렌더 곡선과 정확히 일치한다.
 */
export function groundSlopeAt(worldX: number): number {
  return startEaseSlope(worldX) * rawHeight(worldX) + startEase(worldX) * rawSlope(worldX);
}

/** 기울기의 각도(rad). + = 오르막(오른쪽으로 올라감) */
export function groundAngleAt(worldX: number): number {
  return Math.atan(groundSlopeAt(worldX));
}

/** 기울기의 각도(deg). */
export function groundAngleDegAt(worldX: number): number {
  return (groundAngleAt(worldX) * 180) / Math.PI;
}
