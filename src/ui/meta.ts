// ui/meta.ts — 메타게임 «순수 모델» 계층(DOM 0줄). 화면 3종이 공통으로 읽는다.
//
// ★ 이 파일의 존재 이유: stages.ts 에는 «스테이지 48개 객체»가 없다. TIERS 6개와
//   각 티어의 stageCount 만 있고 48은 그 합(TOTAL_STAGES)으로만 존재한다.
//   그래서 화면이 쓸 «스테이지 1개» 단위를 여기서 TIERS 로부터 유도한다.
//   ── 하드코딩 금지 원칙: 48/144/95/57 같은 숫자를 여기 적지 않는다. 전부
//      stages.ts / roster.ts / gacha.ts 가 export 한 값에서 계산된다. TIERS 의
//      stageCount 를 바꾸면 화면의 스테이지 수·별 총량·게이트가 자동으로 따라간다.
//      (buildStageList() 말미의 런타임 검산이 그 등가성을 매 로드마다 확인한다)
//
// 소유(ownedIds) 정의: 가챠 보유(gacha.ownedIds, 20종 풀) ∪ 조건해금 SPECIAL 4종.
//   SPECIAL 은 보석으로 살 수 없고 roster.ts 의 unlock 조건 충족으로만 들어온다.
import { TIERS, TIER_GATES, TOTAL_STAGES, TOTAL_STARS } from '../game/stages';
import type { Tier, TierDef } from '../game/stages';
import { ROSTER, collectionProgress, DEFAULT_COLLECTION_MODE } from '../game/roster';
import type { CritterSpec, CollectionMode, Grade } from '../game/roster';
import type { GachaState } from '../game/gacha';
// 스테이지 «유도 길이» 단일 소스(Partner 승인 2026-08-06: targetScore × 0.7 × SEGMENT_LENGTH).
// 여기서 길이를 다시 계산하지 않고 그 모듈이 만든 표를 그대로 받아 쓴다.
import { buildStageLengthTable } from '../game/stageLength';

// ── 스테이지 단위(TIERS 에서 유도) ────────────────────────────────────────────
export interface StageInfo {
  id: string; // `${tier}-${numberInTier}` — 저장키. 티어 구성이 바뀌어도 의미가 유지된다.
  index: number; // 0-based 전역 순서
  number: number; // 1-based 전역 번호(1..TOTAL_STAGES)
  numberInTier: number; // 1-based 티어 내 번호
  tier: Tier;
  def: TierDef; // 목표점수·목표회전·부활지급 등 원본 티어 스펙(참조만)
  maxStars: number; // = def.starsPerStage
  gateStars: number; // 이 티어 진입에 필요한 누적 별(TIER_GATES, 없으면 0)
  /**
   * 이 스테이지의 «끝 X좌표»(px). game/stageLength.ts 가 targetScore 에서 유도한 값.
   * ★ main.ts 는 이걸 그대로 쓰면 된다 — `state.worldX >= currentStage.lengthPx`.
   *   예전에 1스테이지 종료 지점을 4000px 로 «상수 하나에 박아두던» 방식을 대체한
   *   값이며, stageLength.ts 를 별도로 import 할 필요가 없다(그쪽이 바뀌면 여기
   *   값도 자동으로 따라간다).
   */
  lengthPx: number;
}

export function gateStarsFor(tier: Tier): number {
  return TIER_GATES.find((g) => g.tier === tier)?.requiredStars ?? 0;
}

export function buildStageList(): StageInfo[] {
  // 길이표도 TIERS 를 같은 순서로 훑어 만들어진다 — 두 유도가 어긋나면 아래에서 터진다.
  const lengthRows = buildStageLengthTable();
  const out: StageInfo[] = [];
  for (const def of TIERS) {
    const gate = gateStarsFor(def.tier);
    for (let n = 1; n <= def.stageCount; n++) {
      const stageNo = out.length + 1;
      const row = lengthRows[out.length];
      // ★ 교차검증: 길이표의 (번호·티어·티어내순번)이 내 유도와 일치해야 한다.
      //   일치하지 않으면 «다른 스테이지의 길이»를 화면·판정에 쓰게 된다 — 조용히
      //   틀리느니 로드 시점에 터뜨린다.
      if (!row || row.stageNo !== stageNo || row.tier !== def.tier || row.indexInTier !== n) {
        throw new Error(
          `ui/meta: stageLength 표 불일치 — expected #${stageNo} ${def.tier}/${n}, ` +
            `got ${row ? `#${row.stageNo} ${row.tier}/${row.indexInTier}` : 'undefined'}`
        );
      }
      out.push({
        id: `${def.tier}-${n}`,
        index: out.length,
        number: stageNo,
        numberInTier: n,
        tier: def.tier,
        def,
        maxStars: def.starsPerStage,
        gateStars: gate,
        lengthPx: row.lengthPx,
      });
    }
  }
  // 런타임 검산: 유도 결과가 stages.ts 의 합계와 어긋나면 화면이 거짓말을 하는 것이다.
  const starSum = out.reduce((s, st) => s + st.maxStars, 0);
  if (out.length !== TOTAL_STAGES || starSum !== TOTAL_STARS) {
    throw new Error(
      `ui/meta: derived stages(${out.length}/${starSum}) != stages.ts(${TOTAL_STAGES}/${TOTAL_STARS})`
    );
  }
  return out;
}

export const STAGES: StageInfo[] = buildStageList();

export function stageById(id: string): StageInfo | undefined {
  return STAGES.find((s) => s.id === id);
}

/** 티어 목록 + 그 티어에 속한 스테이지들(화면의 섹션 단위) */
export function stagesByTier(): Array<{ def: TierDef; gateStars: number; stages: StageInfo[] }> {
  return TIERS.map((def) => ({
    def,
    gateStars: gateStarsFor(def.tier),
    stages: STAGES.filter((s) => s.tier === def.tier),
  }));
}

// ── 진행도 ────────────────────────────────────────────────────────────────────
/**
 * 조건해금 SPECIAL 4종의 카운터. roster.ts 의 SpecialUnlockCondition.kind 와 1:1.
 * 'stage_stars' 는 별도 카운터가 없다 — totalStars(progress) 를 그대로 쓴다.
 */
export interface ConditionCounters {
  login_streak: number; // 연속 접속 일수
  challenge_count: number; // 완료한 챌린지 수
  customization_categories: number; // 해금한 커스터마이즈 카테고리 수
}

export interface MetaProgress {
  /** stageId -> 획득 별(0~maxStars). 없으면 0(미클리어). */
  starsByStage: Record<string, number>;
  /** gacha.ts 의 상태 객체를 «그대로» 공유한다(복사본 금지 — drawGacha 가 여기를 변형한다). */
  gacha: GachaState;
  conditionCounters: ConditionCounters;
  /** 컬렉션 완주 정의. 기본 full_roster_24(roster.ts 확정치). */
  collectionMode?: CollectionMode;
}

export function createMetaProgress(gacha: GachaState, seed?: Partial<MetaProgress>): MetaProgress {
  return {
    starsByStage: {},
    gacha,
    conditionCounters: { login_streak: 0, challenge_count: 0, customization_categories: 0 },
    collectionMode: DEFAULT_COLLECTION_MODE,
    ...seed,
  };
}

export function stageStars(p: MetaProgress, stageId: string): number {
  return p.starsByStage[stageId] ?? 0;
}

export function totalStars(p: MetaProgress): number {
  return STAGES.reduce((s, st) => s + stageStars(p, st.id), 0);
}

export const MAX_TOTAL_STARS = TOTAL_STARS;
export const STAGE_COUNT = TOTAL_STAGES;

/** 별은 «최고 기록»만 남긴다(재도전으로 별이 깎이지 않게). 갱신됐으면 true. */
export function recordStageResult(p: MetaProgress, stageId: string, stars: number): boolean {
  const prev = stageStars(p, stageId);
  if (stars <= prev) return false;
  p.starsByStage[stageId] = stars;
  return true;
}

// ── 해금 판정 ─────────────────────────────────────────────────────────────────
export type LockReason = 'gate' | 'prev';
export interface StageLockState {
  unlocked: boolean;
  reason?: LockReason;
  /** reason==='gate' 일 때 필요한 누적 별(TIER_GATES 값) */
  needStars?: number;
  /** reason==='prev' 일 때 먼저 깨야 하는 스테이지 */
  needStage?: StageInfo;
}

/**
 * 해금 규칙(자체설계, 두 조건의 AND):
 *   (1) 티어 게이트 — 누적 별 >= TIER_GATES 의 requiredStars (Easy 는 0)
 *   (2) 직전 스테이지 클리어 — 전역 순서상 앞 스테이지의 별 >= 1
 * 첫 스테이지는 항상 해금(온보딩 원칙: 로드 즉시 플레이).
 */
export function stageLockState(stage: StageInfo, p: MetaProgress): StageLockState {
  if (stage.index === 0) return { unlocked: true };
  const stars = totalStars(p);
  if (stars < stage.gateStars) {
    return { unlocked: false, reason: 'gate', needStars: stage.gateStars };
  }
  const prev = STAGES[stage.index - 1];
  if (stageStars(p, prev.id) < 1) {
    return { unlocked: false, reason: 'prev', needStage: prev };
  }
  return { unlocked: true };
}

/** 해금돼 있으면서 3별이 아닌 첫 스테이지(= 지금 밀어야 할 곳). 없으면 마지막. */
export function nextPlayableStage(p: MetaProgress): StageInfo {
  for (const s of STAGES) {
    if (!stageLockState(s, p).unlocked) continue;
    if (stageStars(p, s.id) < s.maxStars) return s;
  }
  return STAGES[STAGES.length - 1];
}

// ── 로스터/컬렉션 ─────────────────────────────────────────────────────────────
export interface SpecialUnlockState {
  unlocked: boolean;
  current: number;
  target: number;
  kind: NonNullable<CritterSpec['unlock']>['kind'];
}

/** SPECIAL(조건해금) 1종의 현재 진행. 가챠 종은 null. */
export function specialUnlockState(c: CritterSpec, p: MetaProgress): SpecialUnlockState | null {
  const cond = c.unlock;
  if (!cond) return null;
  const current =
    cond.kind === 'stage_stars' ? totalStars(p) : p.conditionCounters[cond.kind] ?? 0;
  return { unlocked: current >= cond.target, current, target: cond.target, kind: cond.kind };
}

/** 가챠 보유 ∪ 조건충족 SPECIAL. 로스터 화면·완주 판정이 쓰는 단일 정의. */
export function ownedIds(p: MetaProgress): Set<string> {
  const set = new Set<string>(p.gacha.ownedIds);
  for (const c of ROSTER) {
    const st = specialUnlockState(c, p);
    if (st?.unlocked) set.add(c.id);
  }
  return set;
}

export function isOwned(c: CritterSpec, p: MetaProgress): boolean {
  if (p.gacha.ownedIds.has(c.id)) return true;
  return specialUnlockState(c, p)?.unlocked === true;
}

export function collectionStatus(p: MetaProgress) {
  return collectionProgress(ownedIds(p), p.collectionMode ?? DEFAULT_COLLECTION_MODE);
}

/** 등급 표시 순서. ROSTER 에 실제로 존재하는 등급만, 등장 순서대로(하드코딩 아님). */
export function gradesInRoster(): Grade[] {
  const seen: Grade[] = [];
  for (const c of ROSTER) if (!seen.includes(c.grade)) seen.push(c.grade);
  return seen;
}

export function rosterByGrade(): Array<{ grade: Grade; members: CritterSpec[] }> {
  return gradesInRoster().map((grade) => ({
    grade,
    members: ROSTER.filter((c) => c.grade === grade),
  }));
}
