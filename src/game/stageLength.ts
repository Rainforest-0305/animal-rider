// stageLength.ts — 스테이지 «유도 길이» 단일 소스.
//
// Partner 승인(2026-08-06): 스테이지 길이 = targetScore × 0.7 × SEGMENT_LENGTH.
// 설계의도: «구간점수만으로 ★2(targetScore)가 거저 되지 않게» 한다.
//   구간통과 점수는 1구간당 +1점(score.ts / 설계서 4.1절)이므로,
//   완주만 해서 얻는 구간점수는 floor(길이/SEGMENT_LENGTH) = floor(targetScore × 0.7)
//   → targetScore 의 70% 언저리에서 «반드시 모자란다».
//   나머지 30%는 회전점수(+완전착지 x2)로만 메울 수 있다 → ★2가 실력 조건이 된다.
//
// ★ 이 파일은 «길이 밸런스»만 다룬다. 확정 경제(1단 24종·서리 별57·
//   라이트75/코어30/헤비30·격차 2.50배 하한)와는 무관하며 그 수치를 참조·변경하지 않는다.
//
// 락: 이 파일이 SEGMENT_SCORE_SHARE 의 «유일한» 정의처다. 0.7 을 다른 곳에
//     다시 쓰지 말고 여기서 import 할 것.

import { SEGMENT_LENGTH } from './track';
import { TIERS } from './stages';
import type { Tier } from './stages';

/**
 * 스테이지 목표점수(★2) 중 «구간통과 점수»가 담당하는 비율.
 * 나머지 (1 - SEGMENT_SCORE_SHARE) 는 회전/완전착지로만 채울 수 있다.
 * Partner 승인값 0.7 — 임의 변경 금지(밸런스 승인 사항).
 */
export const SEGMENT_SCORE_SHARE = 0.7;

/**
 * 목표점수 → 스테이지 유도 길이(px).
 *
 * Math.round 를 쓰는 이유: 0.7 은 2진 부동소수로 정확히 표현되지 않아
 * 12 * 0.7 * 500 = 4199.999999999999 가 나온다. 그대로 두면 길이가 1px 짧아지고
 * ceil 계산이 뒤틀린다. 산식 자체는 그대로 두고 «표현 오차만» 제거한다.
 */
export function deriveStageLengthPx(targetScore: number): number {
  return Math.round(targetScore * SEGMENT_SCORE_SHARE * SEGMENT_LENGTH);
}

/**
 * 길이(px) → 그 길이를 덮는 데 필요한 구간(SEGMENT_LENGTH 단위) 개수.
 * 마지막 구간이 잘리더라도 «존재는 한다»는 뜻이라 ceil.
 */
export function deriveSegmentCount(lengthPx: number): number {
  return Math.ceil(lengthPx / SEGMENT_LENGTH);
}

/**
 * 완주만 했을 때 실제로 «획득되는» 구간통과 점수.
 * 구간은 완전히 통과해야 +1 이므로 floor. 이 값이 targetScore 보다 작아야
 * 설계의도(구간점수만으로 ★2 불가)가 성립한다 — 표 스크립트가 이걸 검증한다.
 */
export function segmentPointsOnFullRun(lengthPx: number): number {
  return Math.floor(lengthPx / SEGMENT_LENGTH);
}

/** 목표점수 → 구간개수(편의 함수). */
export function deriveStageSegmentCount(targetScore: number): number {
  return deriveSegmentCount(deriveStageLengthPx(targetScore));
}

/**
 * 라이더 «정상주행» 전진속도(px/s) — [측정].
 *
 * 측정 방법: vite dev(:5183) + Playwright chromium, `?auto=1&ff=t&freeze=1` 로
 *   t를 0.25s 격자로 훑어 window.__debug.worldX 를 읽어 worldX(t) 곡선을 만든 값.
 *   정책 = 지면 가속 / 공중 무입력(main.ts 가 말하는 헤드리스 검산 정책 B).
 * 실측 구간평균: 0~2s=815 / 2~5s=1795 / 5~10s=1431 / 10~20s=1424 / 20~26s=1424 px/s
 *   → 출발 2초는 가속 구간이라 느리고, 이후 1420 대에서 안정된다.
 * 원문 로그: tools/stage_times_run3.log, 요약: tools/measured_stage_times.json
 *
 * ★ 물리 상수가 아니라 «관측값»이다. physics.ts / track.ts 지형이 바뀌면
 *   tools/measure_stage_times.mjs 를 다시 돌려 갱신해야 한다.
 */
export const MEASURED_STEADY_SPEED_PX_PER_S = 1420;

/**
 * 출발 가속으로 잃는 시간(초) — [측정].
 * 정상속도로 처음부터 달렸다고 가정했을 때와 실측 도달시간의 차이.
 * 실측: 4200px 은 2.96s 예상 대비 3.31s 소요(+0.35s), 8400px 이상은 +0.03s 이하로 수렴.
 * 짧은 스테이지(스테이지1)에서만 유의미하다.
 */
export const MEASURED_STARTUP_PENALTY_S = 0.35;

/**
 * 유도 길이 → 예상 주행시간(초).
 * 정상속도 나눗셈 + 출발 가속 손실(짧은 거리에서만 유의). 정밀값이 필요하면
 * tools/measure_stage_times.mjs 의 실측 역산표를 직접 쓸 것.
 */
export function estimateRunSeconds(
  lengthPx: number,
  steadySpeedPxPerS: number = MEASURED_STEADY_SPEED_PX_PER_S
): number {
  const startupPenalty = MEASURED_STARTUP_PENALTY_S * Math.exp(-lengthPx / 4200);
  return lengthPx / steadySpeedPxPerS + startupPenalty;
}

export interface StageLengthRow {
  stageNo: number; // 1..48 전역 번호
  tier: Tier;
  indexInTier: number; // 1..stageCount
  targetScore: number;
  lengthPx: number;
  segmentCount: number;
  segmentPointsOnFullRun: number;
  estimatedSeconds: number;
}

/**
 * 48스테이지 전체 유도표를 «계산»해서 돌려준다.
 * 표는 사람이 적는 게 아니라 이 함수가 만든다(손으로 적은 표는 상수 정정 시 썩는다).
 */
export function buildStageLengthTable(
  steadySpeedPxPerS: number = MEASURED_STEADY_SPEED_PX_PER_S
): StageLengthRow[] {
  const rows: StageLengthRow[] = [];
  let stageNo = 0;
  for (const t of TIERS) {
    for (let i = 1; i <= t.stageCount; i++) {
      stageNo++;
      const lengthPx = deriveStageLengthPx(t.targetScore);
      rows.push({
        stageNo,
        tier: t.tier,
        indexInTier: i,
        targetScore: t.targetScore,
        lengthPx,
        segmentCount: deriveSegmentCount(lengthPx),
        segmentPointsOnFullRun: segmentPointsOnFullRun(lengthPx),
        estimatedSeconds: estimateRunSeconds(lengthPx, steadySpeedPxPerS),
      });
    }
  }
  return rows;
}

/** 1-based 스테이지 번호 → 유도 길이(px). 범위를 벗어나면 마지막 티어 기준. */
export function stageLengthPxByStageNo(stageNo: number): number {
  let remaining = stageNo;
  for (const t of TIERS) {
    if (remaining <= t.stageCount) return deriveStageLengthPx(t.targetScore);
    remaining -= t.stageCount;
  }
  return deriveStageLengthPx(TIERS[TIERS.length - 1].targetScore);
}

/**
 * 스테이지1(Easy) 유도 길이. main.ts 가 데모 시절 쓰던 옛 고정 종료거리
 * 하드코딩(값 4000)을 대체할 값이다. 온보딩("첫 3분 안에 수집·성장") 요건 판정 대상.
 * ※ 폐기된 상수의 «이름»은 일부러 적지 않는다 — 감사 grep 이 이력주석을
 *   활성코드로 오판하는 사고가 있었다(2026-08-09 규율).
 */
export const STAGE_1_LENGTH_PX = deriveStageLengthPx(TIERS[0].targetScore);
