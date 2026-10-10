// roster.ts — 1차 로스터 24종. 설계서 2.2절 로마자 표기(고유명사, 번역 안 함).
// ★ D1: 성능 수치 0건. 등급 차이는 외형/연출 전용(스프라이트·발자국·트레일
// ·착지이펙트·사운드) — 이 파일에 물리값을 두면 반려 대상이다.
// ★ 부록 B-1 회피명단(동물계열 Fox/Hawk/Buzzard/Robin/Dragon/Claw/Shell/
// Stripes/Skeleton/Skull 포함) 재대조 완료 — 로마자 24종 전수 0건 충돌.

// 별 총량은 stages.ts 가 «계산해서» export 한다(48스테이지 × 3별). 여기서 144 를
// 다시 적으면 티어 구성이 바뀔 때 한쪽만 낡는다 — 하드코딩 복제 대신 유도로 받는다.
import { TOTAL_STARS } from './stages';

export type Grade = 'COMMON' | 'RARE' | 'EPIC' | 'SPECIAL';
export type AcquisitionPath = 'gacha' | 'condition';

export interface SpecialUnlockCondition {
  kind: 'login_streak' | 'challenge_count' | 'stage_stars' | 'customization_categories';
  target: number; // 조건 자체의 숫자(일/개/별/카테고리)
  dailyCap?: number; // ★ venture-secretary 구조수정(2026-08-05): challenge_count 전용,
  // "챌린지 N개 완료"의 일일 «상한»(Bulti 카운트 전용 - 원 챌린지 보석수입 페이스와는
  // 별개 트래킹이라는 가정. 경제시뮬 48/30/25/186/114/114 체인은 이 상한의 영향을
  // 받지 않는다 - 범위 해석은 Partner 확인 필요, 아래 unlockDaysFor() 주석 참조).
  starEquivalent?: number; // ★ stage_stars가 아닌 kind가 실제로는 별 적립에 의존할 때
  // (예: customization_categories) 일수 계산의 실제 구동값. ⑥ 확정 후 이 숫자만
  // 재조정하면 된다(단일 소스 원칙, physics.ts/brand.ts와 같은 패턴).
}

export interface CritterSpec {
  id: string; // 내부 식별자(영문 소문자, brand 무관)
  nameKo: string;
  nameRomaji: string; // 9개 언어 공통 고정 표기, 번역하지 않음
  animalKo: string;
  grade: Grade;
  acquisition: AcquisitionPath;
  unlock?: SpecialUnlockCondition; // acquisition==='condition'일 때만 존재
}

// COMMON 8 / RARE 7 / EPIC 5 / SPECIAL 4 = 24종
export const ROSTER: CritterSpec[] = [
  { id: 'kkang', nameKo: '깡총', nameRomaji: 'Kkang', animalKo: '산토끼', grade: 'COMMON', acquisition: 'gacha' },
  { id: 'daram', nameKo: '다람', nameRomaji: 'Daram', animalKo: '다람쥐', grade: 'COMMON', acquisition: 'gacha' },
  { id: 'komul', nameKo: '꼬물', nameRomaji: 'Komul', animalKo: '고슴도치', grade: 'COMMON', acquisition: 'gacha' },
  { id: 'dotom', nameKo: '도톰', nameRomaji: 'Dotom', animalKo: '새끼돼지', grade: 'COMMON', acquisition: 'gacha' },
  { id: 'bangul', nameKo: '방울', nameRomaji: 'Bangul', animalKo: '염소', grade: 'COMMON', acquisition: 'gacha' },
  { id: 'chong', nameKo: '총총', nameRomaji: 'Chong', animalKo: '참새', grade: 'COMMON', acquisition: 'gacha' },
  { id: 'dwidung', nameKo: '뒤뚱', nameRomaji: 'Dwidung', animalKo: '오리', grade: 'COMMON', acquisition: 'gacha' },
  { id: 'malang', nameKo: '말랑', nameRomaji: 'Malang', animalKo: '개구리', grade: 'COMMON', acquisition: 'gacha' },
  { id: 'bureung', nameKo: '부릉', nameRomaji: 'Bureung', animalKo: '멧돼지', grade: 'RARE', acquisition: 'gacha' },
  { id: 'sappun', nameKo: '사뿐', nameRomaji: 'Sappun', animalKo: '사슴', grade: 'RARE', acquisition: 'gacha' },
  { id: 'seureuk', nameKo: '스륵', nameRomaji: 'Seureuk', animalKo: '수달', grade: 'RARE', acquisition: 'gacha' },
  { id: 'ureong', nameKo: '우렁', nameRomaji: 'Ureong', animalKo: '황소', grade: 'RARE', acquisition: 'gacha' },
  { id: 'huljjeok', nameKo: '훌쩍', nameRomaji: 'Huljjeok', animalKo: '캥거루', grade: 'RARE', acquisition: 'gacha' },
  { id: 'sallang', nameKo: '살랑', nameRomaji: 'Sallang', animalKo: '여우', grade: 'RARE', acquisition: 'gacha' },
  { id: 'eoseul', nameKo: '어슬', nameRomaji: 'Eoseul', animalKo: '늑대', grade: 'RARE', acquisition: 'gacha' },
  { id: 'beonjjeok', nameKo: '번쩍', nameRomaji: 'Beonjjeok', animalKo: '치타', grade: 'EPIC', acquisition: 'gacha' },
  { id: 'udu', nameKo: '우두', nameRomaji: 'Udu', animalKo: '코뿔소', grade: 'EPIC', acquisition: 'gacha' },
  { id: 'geurim', nameKo: '그림', nameRomaji: 'Geurim', animalKo: '흑표범', grade: 'EPIC', acquisition: 'gacha' },
  { id: 'hwing', nameKo: '휘잉', nameRomaji: 'Hwing', animalKo: '매', grade: 'EPIC', acquisition: 'gacha' },
  { id: 'mireu', nameKo: '미르', nameRomaji: 'Mireu', animalKo: '이무기', grade: 'EPIC', acquisition: 'gacha' },
  // ★ 2026-08-05 SPECIAL 재설계 2차(Partner 결정1/2, ⑥ 실제 별적립모델 반영):
  // 하늘30/불티30(challenge_count) 유지. 서리 95->57 로 재도출(라이트70~80일
  // 목표, tools/collection_paths_sim.mjs 실행값). 결과: 1단완주 light=75
  // core=30 heavy=30, 격차 2.50x. ★ 「격차<=2.0」 기준은 «폐기»됐다 - 불티75일/
  // 하늘30일이 만드는 2.50x는 별적립률 무관 구조적 하한이라 위반이 아니다.
  // 신판정 기준은 (a)라이트70~80일 단독 + (e-신)헤비>=하늘30(자동충족).
  // 돌담(별48상당) < 서리(별57) 순서 유지 확인(역전 없음). 코어는 95->57로
  // 지배조건이 서리->하늘/가챠로 바뀌며 40->30일로 이동(부작용, 위반 아님).
  { id: 'haneul', nameKo: '하늘', nameRomaji: 'Haneul', animalKo: '학', grade: 'SPECIAL', acquisition: 'condition', unlock: { kind: 'login_streak', target: 30 } },
  { id: 'bulti', nameKo: '불티', nameRomaji: 'Bulti', animalKo: '불꽃사슴', grade: 'SPECIAL', acquisition: 'condition', unlock: { kind: 'challenge_count', target: 30 } },
  { id: 'seori', nameKo: '서리', nameRomaji: 'Seori', animalKo: '눈표범', grade: 'SPECIAL', acquisition: 'condition', unlock: { kind: 'stage_stars', target: 57 } }, // Partner결정2 2026-08-05: 95->57, 시뮬재도출(라이트70~80일 목표)
  { id: 'doldam', nameKo: '돌담', nameRomaji: 'Doldam', animalKo: '돌거북', grade: 'SPECIAL', acquisition: 'condition', unlock: { kind: 'customization_categories', target: 4, starEquivalent: 48 } },
];

// 부록 B-1 회피명단 재대조(동물계열 위험명단 포함) - 로마자 24종 전수 0건 확인.
const BAN_LIST_ROMAJI = [
  'Rider', 'Ryder', 'Racer', 'Sprint', 'Dash', 'Swift', 'Moped', 'BMX', 'Trice', 'Suki',
  'Drift', 'Derby', 'Max', 'Flint', 'Chooper', 'Tokyo', 'Harley', 'Wire',
  'Surge', 'Fit', 'Digi', 'Buzzard', 'Thrust', 'Neon', 'Fox', 'Airo', 'Rally', 'Horus', 'Muscle', 'Hawk', 'Flow',
  'Rush', 'Hood', 'Smooth', 'Skeleton', 'Sharp', 'Claw', 'Batt', 'Prime', 'Node', 'Cyber',
  'Jigawatt', 'Skate', 'Cart', 'Tank', 'Spoily', 'Derp', 'Stripes', 'Blitz', 'Outback', 'Golf',
  'Robin', 'Shell', 'Decall', 'Skull', 'Solar', 'Freedom', 'Bullet', 'Hyper', 'Rocket', 'Spitfire',
  'Dragon', 'Delorean', 'Charger', 'Amplifier',
];

export function verifyNoRomajiCollision(): { ok: boolean; collisions: string[] } {
  const lower = BAN_LIST_ROMAJI.map((s) => s.toLowerCase());
  const collisions = ROSTER
    .map((c) => c.nameRomaji)
    .filter((name) => lower.includes(name.toLowerCase()));
  return { ok: collisions.length === 0, collisions };
}

export function gradeCount(grade: Grade): number {
  return ROSTER.filter((c) => c.grade === grade).length;
}

export const GACHA_POOL = ROSTER.filter((c) => c.acquisition === 'gacha'); // 20종
export const CONDITION_POOL = ROSTER.filter((c) => c.acquisition === 'condition'); // 4종(SPECIAL)

// ★ 1단 "컬렉션 완주" 정의 이중모드 - Partner 미확정. 선택은 파라미터 하나로 바뀐다.
export type CollectionMode = 'gacha_pool_20' | 'full_roster_24';

// ★ Partner 확정(2026-08-05): 기본값 = full_roster_24.
// 최신 실행값(서리 57 재도출 후): light=75 core=30 heavy=30, 격차2.50x(구조적
// 하한, 위반아님). 판정기준은 (a)라이트70~80일 + (e-신)헤비>=하늘30 이다
// (「격차<=2.0」 폐기). SPECIAL 4종은 조건해금(보석0원)이라 24종으로 가도
// 1단 비용 20,100은 불변 - 완주일만 늘고 과금구조는 그대로다.
// gacha_pool_20 분기는 지우지 않는다(되돌아올 수 있는 축). 최신 기준선은
// tools/collection_paths_sim.mjs 실행출력.
export const DEFAULT_COLLECTION_MODE: CollectionMode = 'full_roster_24';

export function collectionTargetSet(mode: CollectionMode = DEFAULT_COLLECTION_MODE): CritterSpec[] {
  return mode === 'gacha_pool_20' ? GACHA_POOL : ROSTER;
}

export function collectionProgress(
  ownedIds: Set<string>,
  mode: CollectionMode = DEFAULT_COLLECTION_MODE
): { owned: number; total: number; complete: boolean } {
  const target = collectionTargetSet(mode);
  const owned = target.filter((c) => ownedIds.has(c.id)).length;
  return { owned, total: target.length, complete: owned === target.length };
}

// ---------------------------------------------------------------------------
// SPECIAL 4종 해금 소요일 계산기.
// ★ 주석 정정(2026-08-06): stages.ts 는 «이미 확정»됐다(TOTAL_STARS=48×3=144 를 계산해서
//   export). 별 총량은 위에서 import 로 받으므로 이 파일에 더는 플레이스홀더가 없다.
//   별 «적립률»(starsPerDay)은 여전히 caller 주입 구조를 유지한다 — 아키타입마다 다르고
//   이 파일이 알 바가 아니기 때문이지, 미확정이라서가 아니다.
export interface ArchetypePace {
  challengesPerDay: number;
  // caller 주입(하드코딩 금지). 현행 caller(tools/collection_paths_sim.mjs)는
  // runsPerDay × AVG_STARS_PER_RUN 으로 «유도»해서 넣는다: light 0.768 / core 2.4 / heavy 4.8.
  // 옛 주석의 「플레이스홀더 144/60=2.4 균등」은 폐기됐다(core 앵커로만 남아 있다).
  starsPerDay: number;
}

export function unlockDaysFor(cond: SpecialUnlockCondition, pace: ArchetypePace): number {
  switch (cond.kind) {
    case 'login_streak':
      return cond.target; // 캘린더 기반, 아키타입 무관
    case 'challenge_count': {
      const rate = cond.dailyCap ? Math.min(pace.challengesPerDay, cond.dailyCap) : pace.challengesPerDay;
      return Math.ceil(cond.target / rate);
    }
    case 'stage_stars':
      return Math.ceil(cond.target / pace.starsPerDay);
    case 'customization_categories': {
      const stars = cond.starEquivalent ?? cond.target * (TOTAL_STARS / 12);
      return Math.ceil(stars / pace.starsPerDay);
    }
    default:
      throw new Error('unknown unlock kind');
  }
}
