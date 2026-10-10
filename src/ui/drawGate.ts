// ui/drawGate.ts — 뽑기 «가능 여부» 판정을 한 곳으로 모은 이음매(seam).
//
// ★ 이 파일의 목적은 리텐션 훅(시간게이트·광고보상)을 «나중에 끼워 넣을 자리»를
//   미리 만들어 두는 것뿐이다. 지금은 쿨다운도 광고도 «구현하지 않는다».
//   - 시간게이트/광고보상은 ④단계 사안(현시점 미착수가 정상).
//   - 실제 광고 SDK 연동은 외부연동이라 Partner 승인 대상이다. 여기서 하지 않는다.
//   - 가챠 «경제»(가격 600/+50/1200, 중복없음)는 game/gacha.ts 단일 소스다.
//     이 파일은 경제를 바꾸지 않는다 — 「지금 뽑을 수 있는가」만 답한다.
//
// 나중에 쿨다운을 넣을 때는 setDrawGate() 로 구현체만 갈아끼우면 되고,
// 화면 코드(gacha.ts / hud-overlay.ts / index.ts)는 손대지 않는다.
//
//   setDrawGate({
//     canDraw(p, now) {
//       const base = DEFAULT_DRAW_GATE.canDraw(p, now);
//       if (!base.allowed) return base;
//       if (now < nextFreeDrawAt) return { allowed:false, reason:'cooldown', retryAtMs: nextFreeDrawAt };
//       return base;
//     },
//   });
import { nextGachaPrice } from '../game/gacha';
import { GACHA_POOL } from '../game/roster';
import type { MetaProgress } from './meta';

export type DrawBlockReason =
  | 'pool_empty' // 뽑을 종이 남아있지 않음(중복없음 정책상 풀 완주)
  | 'insufficient_gems' // 보석 부족
  | 'cooldown' // ★ 미구현(자리만 있음)
  | 'ad_required'; // ★ 미구현(자리만 있음, 실제 SDK 연동은 승인 대상)

export interface DrawGateResult {
  allowed: boolean;
  reason?: DrawBlockReason;
  /** cooldown 일 때 다시 가능해지는 시각(epoch ms). 지금은 아무도 채우지 않는다. */
  retryAtMs?: number;
  /** 다음 뽑기 가격(표시용). game/gacha.ts 계산 결과 그대로. */
  price: number;
  /** 남은 미보유 종 수(표시용). */
  remaining: number;
}

export interface DrawGate {
  canDraw(progress: MetaProgress, now?: number): DrawGateResult;
}

/** 기본 게이트: 풀 잔여 + 보석만 본다(시간게이트 없음 = 현재 확정 사양). */
export const DEFAULT_DRAW_GATE: DrawGate = {
  canDraw(progress: MetaProgress): DrawGateResult {
    const g = progress.gacha;
    const remaining = GACHA_POOL.filter((c) => !g.ownedIds.has(c.id)).length;
    const price = nextGachaPrice(g);
    if (remaining === 0) return { allowed: false, reason: 'pool_empty', price, remaining };
    if (g.gems < price) return { allowed: false, reason: 'insufficient_gems', price, remaining };
    return { allowed: true, price, remaining };
  },
};

let active: DrawGate = DEFAULT_DRAW_GATE;

/** 게이트 구현 교체(리텐션 훅 삽입 지점). 화면 코드는 건드리지 않는다. */
export function setDrawGate(gate: DrawGate): void {
  active = gate;
}

export function getDrawGate(): DrawGate {
  return active;
}

/** 화면들이 부르는 단일 창구. */
export function canDrawGacha(progress: MetaProgress, now: number = Date.now()): DrawGateResult {
  return active.canDraw(progress, now);
}
