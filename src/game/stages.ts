// stages.ts — 48스테이지 6구간. 설계서 5장 구조(10/8/8/8/8/6=48, 별144) 계승.
// ★ 목표회전은 옛 3/6/10/15/21/28(런누적, 원설계 각주의 도달불가능한 죽은 값 가정 기반)을
// «폐기»하고 실측 상한(1회 도약 약 1.09회전, 무캡·물리무변경 확정 - D1/결정2)
// 에 맞춰 «1~3회전(런누적)»으로 재설계했다. 좌표는 절차생성(track.ts 재사용),
// 원작 좌표 베끼기 없음.
import { SEGMENT_LENGTH } from './track';

export type Tier = 'Easy' | 'Moderate1' | 'Moderate2' | 'Difficult1' | 'Difficult2' | 'Extreme';

export interface TierDef {
  tier: Tier;
  stageCount: number;
  starsPerStage: number; // 항상 3
  targetScore: number; // ★2 조건
  targetRotationsCumulative: number; // ★3 조건(런 누적, «도약당 아님» - 재설계 근거 참조)
  fieldBand: '0~30' | '30~50' | '50~80' | '80+';
  revivesProvided: boolean;
  launchPadCount: number; // 스테이지당 도약대 수(회전목표 달성 여유분 포함, 자체설계)
}

// 목표점수(★2)는 설계서 5.1절 값 계승(구간+회전점수 결합식 기준, 물리 무관이라 유지).
export const TIERS: TierDef[] = [
  { tier: 'Easy', stageCount: 10, starsPerStage: 3, targetScore: 12, targetRotationsCumulative: 1, fieldBand: '0~30', revivesProvided: false, launchPadCount: 2 },
  { tier: 'Moderate1', stageCount: 8, starsPerStage: 3, targetScore: 24, targetRotationsCumulative: 1, fieldBand: '0~30', revivesProvided: false, launchPadCount: 3 },
  { tier: 'Moderate2', stageCount: 8, starsPerStage: 3, targetScore: 38, targetRotationsCumulative: 2, fieldBand: '30~50', revivesProvided: true, launchPadCount: 4 },
  // ★ 2026-08-09 소프트락 해소(Partner 승인, A+E2안): launchPadCount 상향 3건.
  //   Difficult1 5→6 / Difficult2 6→7 / Extreme 7→9.
  //   근거: 최대점수 = floor(0.7×targetScore) + 회전점수. 회전점수 공급원은 «도약대뿐»이고
  //   (자연이함 실측 0.26바퀴 → floor 0점), 종전 도약대 수로는 Moderate1 이상에서
  //   targetScore 에 «구조적으로» 도달 불가 → ★2/★3 불가 → 도달 별 46/144 에서 진행 영구정지였다.
  //   완전착지 배수 x2→x3(score.ts)와 «함께» 적용해야 144/144 가 성립한다. 둘은 한 쌍이다.
  //   targetScore·TIER_GATES·별총량·스테이지 길이는 «무변경»(경제 재산출 회피).
  { tier: 'Difficult1', stageCount: 8, starsPerStage: 3, targetScore: 52, targetRotationsCumulative: 2, fieldBand: '50~80', revivesProvided: true, launchPadCount: 6 },
  { tier: 'Difficult2', stageCount: 8, starsPerStage: 3, targetScore: 68, targetRotationsCumulative: 3, fieldBand: '50~80', revivesProvided: true, launchPadCount: 8 },
  { tier: 'Extreme', stageCount: 6, starsPerStage: 3, targetScore: 88, targetRotationsCumulative: 3, fieldBand: '80+', revivesProvided: true, launchPadCount: 11 },
];

export const TOTAL_STAGES = TIERS.reduce((s, t) => s + t.stageCount, 0); // 48
export const TOTAL_STARS = TIERS.reduce((s, t) => s + t.stageCount * t.starsPerStage, 0); // 144

// ★2/★3 판정 기준(5.2절 계승, 물리 무관 부분은 유지, 회전만 재설계 반영)
export interface StarResult {
  stars: 1 | 2 | 3;
  reachedGoal: boolean;
  targetScoreMet: boolean;
  targetRotationsMet: boolean;
  revivesUsed: number;
}

export function judgeStars(
  tierDef: TierDef,
  finalScore: number,
  cumulativeRotations: number,
  revivesUsed: number,
  reachedGoal: boolean
): StarResult {
  if (!reachedGoal) {
    return { stars: 1, reachedGoal: false, targetScoreMet: false, targetRotationsMet: false, revivesUsed };
  }
  const targetScoreMet = finalScore >= tierDef.targetScore;
  const targetRotationsMet = cumulativeRotations >= tierDef.targetRotationsCumulative;
  if (targetScoreMet && targetRotationsMet && revivesUsed === 0) {
    return { stars: 3, reachedGoal: true, targetScoreMet, targetRotationsMet, revivesUsed };
  }
  if (targetScoreMet) {
    return { stars: 2, reachedGoal: true, targetScoreMet, targetRotationsMet, revivesUsed };
  }
  return { stars: 1, reachedGoal: true, targetScoreMet, targetRotationsMet, revivesUsed };
}

// 5.3절 티어 해금 게이트(별 누적, 원전 산식 유지 - 물리/회전과 무관)
export const TIER_GATES: { tier: Tier; requiredStars: number }[] = [
  { tier: 'Moderate1', requiredStars: 15 },
  { tier: 'Moderate2', requiredStars: 32 },
  { tier: 'Difficult1', requiredStars: 50 },
  { tier: 'Difficult2', requiredStars: 72 },
  { tier: 'Extreme', requiredStars: 95 }, // 이 95는 roster.ts seori(서리, 별57)와
  // «더 이상 연동되지 않는다»(Partner 결정2, 2026-08-05, 의도적 단절). 서리는
  // Extreme 해금 «전» 시점에 쥐도록 재설계됨 - 되돌리려면 이 이력부터 재론할 것.
];
