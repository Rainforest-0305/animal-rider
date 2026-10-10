// gacha.ts — 뽑기 가격·중복없음 정책. 단일 소스. economy_sim.mjs와 같은
// 공식을 쓰며 값이 일치함을 tools/collection_paths_sim.mjs 계열 스크립트로
// 대조한다(수식은 여기 1곳에만 존재, mjs쪽은 별도 node 런타임이라 부득이
// 동일수식 복제 - 값 일치는 실행출력으로 증명, 4항 참조).
// 결정4(Partner 확정): 가챠 중복없음 [자체설계 — 확정]. 상한 1,200.
import { GACHA_POOL, ROSTER } from './roster';
import type { CritterSpec } from './roster';

export const GACHA_BASE_PRICE = 600;
export const GACHA_PRICE_STEP = 50;
export const GACHA_PRICE_CAP = 1200;

export function gachaPriceForDraw(drawIndex1Based: number): number {
  return Math.min(GACHA_BASE_PRICE + GACHA_PRICE_STEP * (drawIndex1Based - 1), GACHA_PRICE_CAP);
}

export interface GachaState {
  ownedIds: Set<string>;
  drawsCompleted: number; // 1차 로스터 뽑기풀(20종) 기준
  gems: number;
}

export function nextGachaPrice(state: GachaState): number {
  return gachaPriceForDraw(state.drawsCompleted + 1);
}

// 중복 없음: 미보유분에서만 추첨. 미보유 종이 없으면(풀 완주) 뽑기 불가.
export function drawGacha(state: GachaState, rng: () => number = Math.random): { species: CritterSpec | null; cost: number } {
  const unowned = GACHA_POOL.filter((c) => !state.ownedIds.has(c.id));
  if (unowned.length === 0) return { species: null, cost: 0 };
  const cost = nextGachaPrice(state);
  if (state.gems < cost) return { species: null, cost };
  const idx = Math.floor(rng() * unowned.length);
  const species = unowned[idx];
  state.ownedIds.add(species.id);
  state.gems -= cost;
  state.drawsCompleted += 1;
  return { species, cost };
}

export function createGachaState(initialGems = 0): GachaState {
  return { ownedIds: new Set<string>(), drawsCompleted: 0, gems: initialGems };
}

// 검산용: 20종/30종 완주 누적비용 (economy_sim.mjs GACHA_COST_1ST/EXPANDED와 대조)
export function cumulativeCostForPool(poolSize: number): number {
  let total = 0;
  for (let n = 1; n <= poolSize; n++) total += gachaPriceForDraw(n);
  return total;
}

export const ROSTER_REF = ROSTER; // re-export for convenience in demo wiring
