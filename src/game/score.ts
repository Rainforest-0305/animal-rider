// score.ts — 점수 규칙. 설계서 4.1절.
// 구간통과 +1 / 회전 1바퀴 +1 / 완전착지 배수 x2(회전점수에만) / 미완회전 0점.
import { PERFECT_LANDING_TOLERANCE_DEG, NORMAL_LANDING_TOLERANCE_DEG } from './physics';

export type LandingQuality = 'perfect' | 'normal' | 'crash';

export function judgeLanding(landingAngleDeg: number): LandingQuality {
  const norm = normalizeAngle(landingAngleDeg);
  const absDeviation = Math.min(norm, 360 - norm); // 0(수평) 기준 최소 편차
  if (absDeviation <= PERFECT_LANDING_TOLERANCE_DEG) return 'perfect';
  if (absDeviation <= NORMAL_LANDING_TOLERANCE_DEG) return 'normal';
  return 'crash';
}

export function normalizeAngle(deg: number): number {
  let a = deg % 360;
  if (a < 0) a += 360;
  return a;
}

/**
 * 회전 «인정» 임계(바퀴). 이 비율 이상 돌면 1회전으로 친다.
 *
 * ★ 2026-08-09 도입 근거(실측): 도약 실패분의 회전값이 0.95 / 0.88 / 0.84 / 0.81 처럼
 *   «1바퀴 바로 아래»에 몰려 있었다. 순수 floor 는 0.95바퀴를 0점으로 깎는데,
 *   플레이어 눈에는 «다 돌았는데 점수가 안 붙는» 버그로 읽힌다(납득성 문제).
 *
 * ★ 임의의 상수(0.90 등)를 «쓰지 않는다». 임계는 물리에서 «유도»된다:
 *   c바퀴만 돌고 착지하면 착지 편차가 (1-c)×360° 다. 이 편차가 NORMAL_LANDING_TOLERANCE_DEG
 *   를 넘으면 «전복»이라 플레이어는 애초에 그 회전을 시도할 수 없다.
 *   따라서 인정 가능한 하한 = 1 - NORMAL/360 (현재 값 기준 약 0.894) 이 «물리적 상한»이고,
 *   이보다 낮게 잡아도 전복이라 아무도 못 쓰며, 높게 잡으면 쓸 수 있는 회전을 버리는 것이다.
 *   ⇒ 이렇게 유도하면 「대충 돌아도 점수」(예: 0.5바퀴)는 구조적으로 불가능하다 — 그건 전복이다.
 *   ⇒ 착지 허용각을 바꾸면 이 임계도 «자동으로» 따라간다(두 값이 어긋날 수 없다).
 */
export const ROTATION_CREDIT_THRESHOLD = 1 - NORMAL_LANDING_TOLERANCE_DEG / 360;

export function rotationsCompleted(totalRotationDeg: number): number {
  // 미완 회전은 0점(floor)이 원칙이나, ROTATION_CREDIT_THRESHOLD 이상 돈 잔여분은 1회전으로 인정한다.
  // 예) 현재 임계(≈0.894) 기준 0.95바퀴 → 1회전, 0.84바퀴 → 0회전.
  const turns = Math.abs(totalRotationDeg) / 360;
  return Math.floor(turns + (1 - ROTATION_CREDIT_THRESHOLD));
}

export function jumpScore(totalRotationDeg: number, quality: LandingQuality): { sRot: number; multiplier: number; points: number } {
  const sRot = rotationsCompleted(totalRotationDeg);
  // ★ 2026-08-09 소프트락 해소: 완전착지 배수 x2 → x8 (실측 기반으로 «탐색해서» 정한 값).
  //   회전점수 공급원이 도약대뿐이고(자연이함 실측 0.26바퀴=0점), 종전 x2로는 Moderate1 이상에서
  //   targetScore 도달이 «구조적으로» 불가 → 도달 별 46/144 에서 진행 영구정지였다.
  //   x8 을 고른 근거: 티어별 «최악가정 허용실패»(좋은 도약부터 실패시켰을 때 목표점수를 지키는 여유)를
  //   실측 회전용량으로 계산해 «전 티어 1회 이상»을 만족하는 최소 배수를 탐색한 결과가 x8 이다
  //   (x4~x7 은 Moderate1 이 0회라 «최적플레이 전제»가 되어 원래 문제를 게이트만 옮겨 재현한다).
  //   탐색 원문: tools/tolerance_sweep.log
  //   ⚠ Easy 는 어떤 배수로도 허용실패 0 이다 — 2개 도약 중 «1바퀴를 넘길 수 있는 도약이 1개»뿐이라
  //     구조적이다(배수로 못 고친다). 다만 재도전이 자유롭고 별은 스테이지별 최대치가 남으므로
  //     «불가능»이 아니라 «1회 숙련 판정»이다. 이걸 더 완화하려면 지형/물리(안2) 영역이라 별건이다.
  //   stages.ts launchPadCount 상향과 «한 쌍»으로 적용된다. 한쪽만 되돌리면 다시 144 밑으로 떨어진다.
  const multiplier = quality === 'perfect' ? 8 : 1; // crash는 별도 처리(런 종료), 여기선 방어적으로 1
  const points = sRot * multiplier;
  return { sRot, multiplier, points };
}
