// ── src/render/critterArt.ts ───────────────────────────────────────────────
// COMMON 8종 파츠 스왑 렌더 모듈 — art_direction_spec.md §2(라이더 실루엣) /
// §3(등급 팔레트) / §10(COMMON 8종 확장 v1.1) 구현.
//
// 이 파일은 «캔버스 2D API만» 쓴다(§0-1). 외부 이미지·스프라이트 0건.
// physics.ts 를 참조하지 않는다(§0-2, D1) — 순수 그리기 레이어다.
//
// 좌표계(§1): 원점 = 접지점, x+ = 진행방향(오른쪽), y+ = 아래(canvas 네이티브).
// 스케일 1.0 = 캐릭터 키 약 96px. 호출부에서 translate/scale/rotate 를 건다.
//
// 구조(§10.0): 완전 별개 드로잉 함수 8개가 아니라
//   서브베이스 3개(mammal / bird / frog) + 파츠 파라미터 스왑.
//
//   drawCritterBody(ctx, species, palette)
//     └ mammal(5종: rabbit·squirrel·hedgehog·piglet·goat)
//     └ bird(2종: sparrow·duck)
//     └ frog(1종: frog)
//
// roster.ts id 대응(§10 서두):
//   kkang=rabbit · daram=squirrel · komul=hedgehog · dotom=piglet
//   bangul=goat · chong=sparrow · dwidung=duck · malang=frog
//
// ★★ 스펙 §10.9 표와의 «의도적 차이» — 반드시 읽을 것 ★★
//   §2.2 는 mountPoint 를 «라이더 재킷 캡슐의 중심»으로 정의한다
//   (「몸통(재킷): 둥근 사각 캡슐, 중심 (6,-78)」). 재킷 높이가 22px 이므로
//   «엉덩이가 닿는 선»은 mountPoint.y + 11 이고, 산토끼 기준값 (6,-78) 의
//   좌석선은 -67 로 등라인(-54, 픽셀 실측)보다 13px 위다.
//   그런데 §10.9 의 신규 4종 값은 그 여유가 없이 «몸통 최고점 자체»에 잡혀
//   있다 — 실측: 참새 좌석선 -67 vs 등라인 -82(15px 파묻힘) · 오리 -63 vs -78
//   (15px) · 개구리 -29 vs -52(23px, 게다가 눈 위) · 고슴도치 -55 vs 가시끝 -67
//   (12px, 「가시에 안 걸리게」라는 §10.3 서술과 반대). 즉 신규 4종은
//   mountPoint 를 «접점»으로 계산한 것으로 보이며, 그대로 그리면 라이더가
//   몸통에 파묻힌다(_devtest.html 의 [mount: spec] 토글로 재현된다).
//   → MOUNT_POINTS(적용값)는 후보값 몽타주를 실제로 렌더해 눈으로 고른 값이다.
//     스펙 원문 값은 MOUNT_POINTS_SPEC_V11 로 그대로 보존했고
//     getMountPoint(s,'spec') 으로 언제든 A/B 비교된다. 디자이너 확정 시
//     둘 중 하나만 남기면 된다(§10.9 표만 고치면 되고 드로잉 코드는 무관).

import type { Grade } from '../game/roster';

// ── 타입 ───────────────────────────────────────────────────────────────────

// ★ species 키는 «내부 식별자»다 — 화면에 뜨지 않는다(표시명은 roster.ts 의
//   nameKo/nameRomaji). 그래서 roster 의 BAN_LIST_ROMAJI(상표 회피명단)와는
//   무관하다. UI 가 이 키를 그대로 노출하면 안 된다.
export type Species =
  // COMMON 8 (v1.1 §10)
  | 'rabbit'
  | 'squirrel'
  | 'hedgehog'
  | 'piglet'
  | 'goat'
  | 'sparrow'
  | 'duck'
  | 'frog'
  // RARE 7 (v1.3 §12.4)
  | 'boar'
  | 'deer'
  | 'otter'
  | 'ox'
  | 'kangaroo'
  | 'fox'
  | 'wolf'
  // EPIC 5 (v1.3 §12.5)
  | 'cheetah'
  | 'rhino'
  | 'panther'
  | 'hawk'
  | 'serpent'
  // SPECIAL 4 (v1.3 §12.6)
  | 'crane'
  | 'flamedeer'
  | 'snowleopard'
  | 'turtle';

/** §12.0 — 신규 베이스는 serpentine 하나뿐. 거북은 frog 베이스 «재해석»(§12.3). */
export type SpeciesBase = 'mammal' | 'bird' | 'frog' | 'serpentine';

/** §10.0 파츠 파라미터. ★ 'floppy-side'(염소)·'curl-up'(오리)는 §10.5/§10.7 의
 *  실제 path 를 살리기 위한 «추가»다 — 스펙의 기존 값은 하나도 바꾸지 않았다. */
export type EarStyle =
  | 'long-rabbit'
  | 'short-round'
  | 'tiny-nub'
  | 'floppy-down'
  | 'floppy-side'
  | 'pointy-triangle' // §12.1 여우·늑대·치타·흑표범·눈표범 공용
  | 'none';
export type TailStyle =
  | 'pompom'
  | 'bushy'
  | 'stub'
  | 'curly'
  | 'fan-short'
  | 'curl-up'
  // §12.1 신규 5종
  | 'paddle' // 수달
  | 'tufted' // 황소
  | 'thick-balance' // 캥거루
  | 'long-whip' // 치타·눈표범(§12.5 개정 전엔 흑표범도 — panther 주석 참조)
  | 'droop-bushy' // 늑대
  | 'fan-long' // 매(§12.1 조류)
  | 'none';
export type SnoutStyle =
  | 'none'
  | 'point'
  | 'cylinder-flat'
  | 'tusked' // §12.1 멧돼지(cylinder-flat + 엄니)
  | 'beak-cone'
  | 'beak-spatula'
  | 'beak-hook' // §12.1 매
  | 'beak-long'; // §12.6 학
export type ExtraPart =
  | 'spikes'
  | 'horns'
  | 'antlers' // §12.1 사슴·불꽃사슴
  | 'horn-nose' // §12.1 코뿔소
  | 'spots' // §12.1 치타·눈표범
  | 'mane-bristle'; // §12.1 멧돼지

/** 조류 다리/발 스타일(§10.6 기본 · §10.7 물갈퀴 · §12.1 발톱 · §12.6 학의 긴 다리). */
export type BirdLegStyle = 'twig' | 'web' | 'talon' | 'long-twig';

export interface SpeciesParams {
  base: SpeciesBase;
  earStyle: EarStyle;
  tailStyle: TailStyle;
  snout: SnoutStyle;
  extras: ExtraPart[];
  /** 조류 전용. 미지정 시 'twig'. */
  legStyle?: BirdLegStyle;
  /** 조류 전용. 몸통·날개·꼬리를 통째로 올리는 양(학=16, §12.6). */
  bodyLift?: number;
  mountPoint: [number, number]; // §10.9 (적용값)
  /** 등급 장식 앵커 — 동물 «머리» 기준점. §3.2 SPECIAL 후광이 이 위 80px 에 뜬다. */
  headAnchor: [number, number];
  /** 등급 장식 앵커 — RARE 반다나(목) 중심. */
  neckAnchor: [number, number];
  /** SPECIAL 후광 앵커. 미지정 시 headAnchor(=산토끼 관례). 머리가 라이더보다
   *  한참 낮거나(거북·이무기) 높은(학) 종만 따로 준다 — 후광은 «라이더 머리 위»에
   *  떠야 의미가 있기 때문. */
  haloAnchor?: [number, number];
}

export interface MountPoint {
  x: number;
  y: number;
}
export type MountPointInput = MountPoint | readonly [number, number];

/** §3.1 */
export interface GradePalette {
  bodyTop: string;
  bodyBottom: string;
  bodyOutline: string;
  earInner: string;
  accessory: string;
  glow?: string;
  shimmer?: boolean;
}

// ── §3.1 등급 팔레트 ───────────────────────────────────────────────────────

export const GRADE_PALETTES: Record<Grade, GradePalette> = {
  COMMON: {
    bodyTop: '#FFD79A',
    bodyBottom: '#E8933F',
    bodyOutline: '#7A4415',
    earInner: '#FFD9C8',
    accessory: '#FF8A3D',
  },
  RARE: {
    bodyTop: '#7FF0FF',
    bodyBottom: '#22B8D9',
    bodyOutline: '#0C5A70',
    earInner: '#D9FBFF',
    accessory: '#1E7FE0',
    glow: '#5FE8FF',
  },
  EPIC: {
    bodyTop: '#D6A0FF',
    bodyBottom: '#7A22E0',
    bodyOutline: '#3C0F75',
    earInner: '#F0DDFF',
    accessory: '#B84DFF',
    glow: '#C77BFF',
  },
  SPECIAL: {
    bodyTop: '#FFF07A',
    bodyBottom: '#FFA80A',
    bodyOutline: '#A85E00',
    earInner: '#FFFAE0',
    accessory: '#FFFFFF',
    glow: '#FFD400',
    shimmer: true,
  },
};

export function paletteFor(grade: Grade): GradePalette {
  return GRADE_PALETTES[grade];
}

/** §2.2 라이더 고정색(등급 무관). 커스터마이징 시스템의 훅 지점(§9). */
export const RIDER_COLORS = {
  pants: '#2B2B33',
  jacketTop: '#3EC6E0',
  jacketBot: '#1E8FA8',
  jacketLine: '#0F5A6B',
  skin: '#FFD9B3',
  helmet: '#F5F5F5',
} as const;

/** 뿔은 등급 무관 자연색(§10.5). 가지뿔(§12.1 antlers)·코뿔(horn-nose)도 재사용. */
export const HORN_COLOR = '#EDE6D6';

/** 엄니(§12.1 tusked) — 상아색 고정, 등급 무관(HORN_COLOR와 같은 원칙). */
export const TUSK_COLOR = '#F5F0E0';

/**
 * §12.1 늑대 droop-bushy 꼬리 상향 보정량. 0 이면 스펙 원좌표(꼬리 최하단 y=+30
 * = 지면 30px 아래). 근거는 drawMammalTail 의 해당 분기 주석 참조.
 */
export const DROOP_TAIL_LIFT = 20;

/**
 * §10.12.1 결정 — 부리·물갈퀴·발 같은 «해부학적 파츠»는 등급 팔레트의
 * accessory 를 쓰지 않는다. SPECIAL 의 accessory 가 순백(#FFFFFF)이라
 * 부리·발이 하얗게 오염되던 문제의 근본 수정이다(내가 8종 SPECIAL 캡처에서
 * 실제로 확인한 증상 — 참새 부리가 몸통과 분리되지 않았다).
 * 값은 «신규 색이 아니라» GRADE_PALETTES.COMMON.accessory 를 고정 재사용한 것 →
 * COMMON 렌더 결과는 픽셀 단위로 기존과 동일하다(시각적 회귀 0).
 */
export const BEAK_FOOT_COLOR = '#E8935A';

/** §12.1.1 — 매·학만 해부학적 고정색 예외(맹금류/학은 부리·다리가 어둡다). */
export const ANATOMY_COLOR_OVERRIDE: Partial<Record<Species, string>> = {
  hawk: '#4A4038', // 어두운 그레이브라운
  crane: '#2B2B33', // = RIDER_COLORS.pants 재사용(신규색 0건)
};

export function anatomyColor(species: Species): string {
  return ANATOMY_COLOR_OVERRIDE[species] ?? BEAK_FOOT_COLOR;
}

// ── roster.ts id ↔ species ─────────────────────────────────────────────────

/** roster.ts 24종 전량 대응(v1.3에서 완비 — 폴백에 의존하는 종 0건). */
export const SPECIES_BY_ROSTER_ID: Record<string, Species> = {
  // COMMON 8
  kkang: 'rabbit', // 깡총 · 산토끼
  daram: 'squirrel', // 다람 · 다람쥐
  komul: 'hedgehog', // 꼬물 · 고슴도치
  dotom: 'piglet', // 도톰 · 새끼돼지
  bangul: 'goat', // 방울 · 염소
  chong: 'sparrow', // 총총 · 참새
  dwidung: 'duck', // 뒤뚱 · 오리
  malang: 'frog', // 말랑 · 개구리
  // RARE 7
  bureung: 'boar', // 부릉 · 멧돼지
  sappun: 'deer', // 사뿐 · 사슴
  seureuk: 'otter', // 스륵 · 수달
  ureong: 'ox', // 우렁 · 황소
  huljjeok: 'kangaroo', // 훌쩍 · 캥거루
  sallang: 'fox', // 살랑 · 여우
  eoseul: 'wolf', // 어슬 · 늑대
  // EPIC 5
  beonjjeok: 'cheetah', // 번쩍 · 치타
  udu: 'rhino', // 우두 · 코뿔소
  geurim: 'panther', // 그림 · 흑표범
  hwing: 'hawk', // 휘잉 · 매
  mireu: 'serpent', // 미르 · 이무기
  // SPECIAL 4
  haneul: 'crane', // 하늘 · 학
  bulti: 'flamedeer', // 불티 · 불꽃사슴
  seori: 'snowleopard', // 서리 · 눈표범
  doldam: 'turtle', // 돌담 · 돌거북
};

/** 미지의 id 만 기준형(rabbit)으로 폴백한다 — 24종은 전부 전용 실루엣이 있다. */
export function speciesForRosterId(id: string): Species {
  return SPECIES_BY_ROSTER_ID[id] ?? 'rabbit';
}

/** 화면 대조·검수용 고정 순서(등급 순 = roster.ts 순서). */
export const SPECIES_ORDER: readonly Species[] = [
  'rabbit',
  'squirrel',
  'hedgehog',
  'piglet',
  'goat',
  'sparrow',
  'duck',
  'frog',
  'boar',
  'deer',
  'otter',
  'ox',
  'kangaroo',
  'fox',
  'wolf',
  'cheetah',
  'rhino',
  'panther',
  'hawk',
  'serpent',
  'crane',
  'flamedeer',
  'snowleopard',
  'turtle',
];

/** v1.3 신규 16종만(검수 하네스 기본 표시용). */
export const SPECIES_ORDER_V13: readonly Species[] = SPECIES_ORDER.slice(8);

export const SPECIES_LABEL_KO: Record<Species, string> = {
  rabbit: '깡총(산토끼)',
  squirrel: '다람(다람쥐)',
  hedgehog: '꼬물(고슴도치)',
  piglet: '도톰(새끼돼지)',
  goat: '방울(염소)',
  sparrow: '총총(참새)',
  duck: '뒤뚱(오리)',
  frog: '말랑(개구리)',
  boar: '부릉(멧돼지)',
  deer: '사뿐(사슴)',
  otter: '스륵(수달)',
  ox: '우렁(황소)',
  kangaroo: '훌쩍(캥거루)',
  fox: '살랑(여우)',
  wolf: '어슬(늑대)',
  cheetah: '번쩍(치타)',
  rhino: '우두(코뿔소)',
  panther: '그림(흑표범)',
  hawk: '휘잉(매)',
  serpent: '미르(이무기)',
  crane: '하늘(학)',
  flamedeer: '불티(불꽃사슴)',
  snowleopard: '서리(눈표범)',
  turtle: '돌담(돌거북)',
};

/** roster.ts 등급(팔레트 선택용 참고 — 실제 등급 판정은 roster.ts 가 단일 소스). */
export const SPECIES_GRADE_HINT: Record<Species, Grade> = {
  rabbit: 'COMMON',
  squirrel: 'COMMON',
  hedgehog: 'COMMON',
  piglet: 'COMMON',
  goat: 'COMMON',
  sparrow: 'COMMON',
  duck: 'COMMON',
  frog: 'COMMON',
  boar: 'RARE',
  deer: 'RARE',
  otter: 'RARE',
  ox: 'RARE',
  kangaroo: 'RARE',
  fox: 'RARE',
  wolf: 'RARE',
  cheetah: 'EPIC',
  rhino: 'EPIC',
  panther: 'EPIC',
  hawk: 'EPIC',
  serpent: 'EPIC',
  crane: 'SPECIAL',
  flamedeer: 'SPECIAL',
  snowleopard: 'SPECIAL',
  turtle: 'SPECIAL',
};

// ── §10.9 마운트 포인트 ────────────────────────────────────────────────────

/**
 * 스펙 원문 값(보존용 A/B 비교) — §10.9(v1.1 8종) + §12.7(v1.3 16종).
 * v1.1 8종 중 4종은 파묻힘이 실측돼 적용값이 다르다(파일 상단 주석 참조).
 */
export const MOUNT_POINTS_SPEC: Record<Species, [number, number]> = {
  // §10.9 v1.1
  rabbit: [6, -78],
  squirrel: [6, -78],
  hedgehog: [2, -66],
  piglet: [6, -76],
  goat: [6, -78],
  sparrow: [0, -78],
  duck: [0, -74],
  frog: [0, -40],
  // §12.7 v1.3 — [준용] 14종
  boar: [6, -78],
  deer: [6, -78],
  otter: [6, -78],
  ox: [6, -78],
  kangaroo: [6, -78],
  fox: [6, -78],
  wolf: [6, -78],
  cheetah: [6, -78],
  rhino: [2, -78],
  panther: [6, -78],
  hawk: [0, -96],
  crane: [0, -112],
  flamedeer: [6, -78],
  snowleopard: [6, -78],
  // §12.7 v1.3 — [추정, 미검증] 2종(디자이너가 렌더검증 권고한 항목)
  serpent: [24, -58],
  turtle: [0, -62],
};

/** @deprecated v1.1 이름. MOUNT_POINTS_SPEC 를 쓴다. */
export const MOUNT_POINTS_SPEC_V11 = MOUNT_POINTS_SPEC;

/**
 * 적용값. 4종만 스펙과 다르다(hedgehog / sparrow / duck / frog).
 * 결정 방식: 후보값을 _devtest.html 의 variants 몽타주로 «한 화면에 나란히 렌더»해
 * 눈으로 고르고(2026-08-06, 헤드리스 Chrome 실캡처), 픽셀 실측으로 재확인했다.
 * 「등라인보다 N px 위」 같은 단일 공식은 안 쓴다 — 몸통이 둥근 조류에서는
 * 같은 여유가 «뜬 것»으로 보이기 때문(포유류 13px = 정상, 조류 13px = 부유).
 * 각 값 옆 여유는 「좌석선(mount.y+11) 대비 좌석 x 열의 실루엣 최고점」 실측치다.
 */
export const MOUNT_POINTS: Record<Species, [number, number]> = {
  rabbit: [6, -78], // = 스펙(기준형). 여유 13.0
  squirrel: [6, -78], // = 스펙(몸통 불변). 여유 13.0
  hedgehog: [2, -78], // 스펙 -66(가시에 파묻힘) → 엉덩이가 가시 능선에 «얹히는» 값. 여유 0.0
  piglet: [6, -76], // = 스펙. 여유 11.0
  goat: [6, -78], // = 스펙. 여유 13.0
  sparrow: [0, -96], // 스펙 -78(15px 파묻힘) → 둥근 등에 얹히는 값. 여유 3.0
  duck: [0, -93], // 스펙 -74(15px 파묻힘) → 여유 4.0
  frog: [-12, -58], // 스펙 (0,-40)(눈 위에 올라탐) → 눈 «뒤» 등판으로 이동. 여유 ≈9

  // ── v1.3 §12.7 ──────────────────────────────────────────────────────────
  // [준용] 14종: 몸통 path 가 §10.9 실측 PASS 종과 «완전히 동일»해서 그 값을
  // 그대로 쓴다. 그래도 16종 전부 렌더 검증은 돌렸다(디자이너 근거를 신뢰하되
  // 확인은 내가 한다 — v1.1 때 [준용]처럼 보이던 값이 실제로는 틀렸던 전례).
  boar: [6, -78],
  deer: [6, -78],
  otter: [6, -78],
  ox: [6, -78],
  kangaroo: [6, -78],
  fox: [6, -78],
  wolf: [6, -78],
  cheetah: [6, -78],
  rhino: [2, -78], // hedgehog 보정값 재사용(가시는 없지만 rabbit 과 같은 여유가 나온다)
  panther: [6, -78],
  hawk: [0, -96], // = sparrow 실측 보정값(몸통 타원 동일)
  crane: [0, -112], // = sparrow -96 을 몸통 상향 -16 만큼 평행이동
  flamedeer: [6, -78],
  snowleopard: [6, -78],
  // [추정 → 실측 교정] 2종. 스펙 §12.7 이 [추정,미검증]으로 명시한 값은 둘 다
  // 실제로 파묻혔다(픽셀 실측: 이무기 여유 -13.0 / 거북 -5.0). 디자이너 경고 적중.
  serpent: [24, -72], // 스펙 -58 → 능선(-60) 위에 얹히는 값. 여유 1.0
  // (-70 은 실측 여유 -1.0 으로 «1px 파묻힘»이라 탈락 — 눈으로는 구분이 안 되는
  //  차이여서 픽셀 실측이 아니었으면 그냥 통과시켰을 값이다.)
  turtle: [0, -70], // 스펙 -62 → 등딱지 정점(-56) 위. 여유 3.0
};

/**
 * 라이더 «발끝이 몸통 안»이라는 판정을 구조적으로 만족할 수 없는 종.
 * 이무기: 리본 몸통의 두께가 x=24 에서 19px(-60~-41)인데 라이더의
 * 좌석→발끝 길이는 30.5px 다 — 어떤 mountPoint 를 줘도 발이 몸통 밖으로 나온다.
 * 다리를 짧게 고치는 건 §2.2 라이더 고정 지오메트리 변경이라 내 권한 밖이라
 * «다리가 코일 옆으로 늘어진» 상태를 채택하고 여기 근거를 남긴다.
 */
export const FEET_MAY_HANG: readonly Species[] = ['serpent'];

export type MountSource = 'applied' | 'spec';

/** §10.9 표 조회. source='spec' 이면 스펙 원문 값(A/B 비교용). */
export function getMountPoint(species: Species, source: MountSource = 'applied'): MountPoint {
  const [x, y] = (source === 'spec' ? MOUNT_POINTS_SPEC_V11 : MOUNT_POINTS)[species];
  return { x, y };
}

// ── 종별 파라미터 표(§10.0) ────────────────────────────────────────────────

export const SPECIES_PARAMS: Record<Species, SpeciesParams> = {
  rabbit: {
    base: 'mammal',
    earStyle: 'long-rabbit',
    tailStyle: 'pompom',
    snout: 'none',
    extras: [],
    mountPoint: MOUNT_POINTS.rabbit,
    headAnchor: [34, -58],
    neckAnchor: [29, -51],
  },
  squirrel: {
    base: 'mammal',
    earStyle: 'short-round',
    tailStyle: 'bushy',
    snout: 'none',
    extras: [],
    mountPoint: MOUNT_POINTS.squirrel,
    headAnchor: [34, -58],
    neckAnchor: [29, -51],
  },
  hedgehog: {
    base: 'mammal',
    earStyle: 'tiny-nub',
    tailStyle: 'stub',
    snout: 'point',
    extras: ['spikes'],
    mountPoint: MOUNT_POINTS.hedgehog,
    headAnchor: [34, -58],
    neckAnchor: [31, -49],
  },
  piglet: {
    base: 'mammal',
    earStyle: 'floppy-down',
    tailStyle: 'curly',
    snout: 'cylinder-flat',
    extras: [],
    mountPoint: MOUNT_POINTS.piglet,
    headAnchor: [34, -58],
    neckAnchor: [29, -51],
  },
  goat: {
    base: 'mammal',
    earStyle: 'floppy-side',
    tailStyle: 'pompom',
    snout: 'none',
    extras: ['horns'],
    mountPoint: MOUNT_POINTS.goat,
    headAnchor: [34, -58],
    neckAnchor: [29, -51],
  },
  sparrow: {
    base: 'bird',
    earStyle: 'none',
    tailStyle: 'fan-short',
    snout: 'beak-cone',
    extras: [],
    mountPoint: MOUNT_POINTS.sparrow,
    headAnchor: [26, -78],
    neckAnchor: [20, -62],
  },
  duck: {
    base: 'bird',
    earStyle: 'none',
    tailStyle: 'curl-up',
    snout: 'beak-spatula',
    extras: [],
    mountPoint: MOUNT_POINTS.duck,
    headAnchor: [26, -78],
    neckAnchor: [20, -62],
  },
  frog: {
    base: 'frog',
    earStyle: 'none',
    tailStyle: 'none',
    snout: 'none',
    extras: [],
    mountPoint: MOUNT_POINTS.frog,
    headAnchor: [11, -43],
    neckAnchor: [16, -26],
  },

  // ── RARE 7 (§12.4) — 몸통/머리/다리/눈코는 §2.1 무변경, 파츠만 조합 ──────
  boar: {
    base: 'mammal',
    earStyle: 'floppy-down',
    tailStyle: 'stub',
    snout: 'tusked',
    extras: ['mane-bristle'],
    mountPoint: MOUNT_POINTS.boar,
    headAnchor: [34, -58],
    neckAnchor: [29, -51],
  },
  deer: {
    base: 'mammal',
    earStyle: 'floppy-side',
    tailStyle: 'stub',
    snout: 'none',
    extras: ['antlers'],
    mountPoint: MOUNT_POINTS.deer,
    headAnchor: [34, -58],
    neckAnchor: [29, -51],
  },
  otter: {
    base: 'mammal',
    earStyle: 'short-round',
    tailStyle: 'paddle',
    snout: 'none',
    extras: [],
    mountPoint: MOUNT_POINTS.otter,
    headAnchor: [34, -58],
    neckAnchor: [29, -51],
  },
  ox: {
    base: 'mammal',
    earStyle: 'floppy-side',
    tailStyle: 'tufted',
    snout: 'none',
    extras: ['horns'],
    mountPoint: MOUNT_POINTS.ox,
    headAnchor: [34, -58],
    neckAnchor: [29, -51],
  },
  kangaroo: {
    base: 'mammal',
    earStyle: 'short-round',
    tailStyle: 'thick-balance',
    snout: 'none',
    extras: [],
    mountPoint: MOUNT_POINTS.kangaroo,
    headAnchor: [34, -58],
    neckAnchor: [29, -51],
  },
  fox: {
    base: 'mammal',
    earStyle: 'pointy-triangle',
    tailStyle: 'bushy',
    snout: 'point',
    extras: [],
    mountPoint: MOUNT_POINTS.fox,
    headAnchor: [34, -58],
    neckAnchor: [29, -51],
  },
  wolf: {
    base: 'mammal',
    earStyle: 'pointy-triangle',
    tailStyle: 'droop-bushy',
    snout: 'point',
    extras: [],
    mountPoint: MOUNT_POINTS.wolf,
    headAnchor: [34, -58],
    neckAnchor: [29, -51],
  },

  // ── EPIC 5 (§12.5) ──────────────────────────────────────────────────────
  cheetah: {
    base: 'mammal',
    earStyle: 'pointy-triangle',
    tailStyle: 'long-whip',
    snout: 'none',
    extras: ['spots'],
    mountPoint: MOUNT_POINTS.cheetah,
    headAnchor: [34, -58],
    neckAnchor: [29, -51],
  },
  rhino: {
    base: 'mammal',
    earStyle: 'tiny-nub',
    tailStyle: 'stub',
    snout: 'none',
    extras: ['horn-nose'],
    mountPoint: MOUNT_POINTS.rhino,
    headAnchor: [34, -58],
    neckAnchor: [29, -51],
  },
  panther: {
    base: 'mammal',
    earStyle: 'pointy-triangle',
    // §12.5 개정 — 원안은 치타·눈표범과 같은 'long-whip' 이었다. 치타와 흑표범은
    // 등급이 같아(둘 다 EPIC) 팔레트까지 동일해서, spots 유무만으로는 축소
    // 실루엣에서 구분이 되지 않았다(§12.9 한계 기록). 신규 파츠를 만들지 않고
    // §10.3 의 기존 'stub' 로 바꿔 «꼬리 길이»라는 형태 축을 하나 더 준다.
    tailStyle: 'stub',
    snout: 'none',
    extras: [], // §12.5 — 무늬 없는 단색(치타는 spots 있음)
    mountPoint: MOUNT_POINTS.panther,
    headAnchor: [34, -58],
    neckAnchor: [29, -51],
  },
  hawk: {
    base: 'bird',
    earStyle: 'none',
    tailStyle: 'fan-long',
    snout: 'beak-hook',
    extras: [],
    legStyle: 'talon',
    mountPoint: MOUNT_POINTS.hawk,
    headAnchor: [26, -78],
    neckAnchor: [20, -62],
  },
  serpent: {
    base: 'serpentine',
    earStyle: 'none',
    tailStyle: 'none',
    snout: 'none',
    extras: [],
    mountPoint: MOUNT_POINTS.serpent,
    headAnchor: [44, -50],
    neckAnchor: [32, -52],
    haloAnchor: [30, -38], // 머리가 라이더보다 낮아 후광 앵커를 따로 준다
  },

  // ── SPECIAL 4 (§12.6) ───────────────────────────────────────────────────
  crane: {
    base: 'bird',
    earStyle: 'none',
    tailStyle: 'fan-short',
    snout: 'beak-long',
    extras: [],
    legStyle: 'long-twig',
    bodyLift: 16,
    mountPoint: MOUNT_POINTS.crane,
    headAnchor: [26, -130],
    neckAnchor: [16, -106],
    haloAnchor: [20, -92], // 학 머리는 라이더보다 훨씬 높다
  },
  flamedeer: {
    base: 'mammal',
    earStyle: 'floppy-side',
    tailStyle: 'stub',
    snout: 'none',
    extras: ['antlers'],
    mountPoint: MOUNT_POINTS.flamedeer,
    headAnchor: [34, -58],
    neckAnchor: [29, -51],
  },
  snowleopard: {
    base: 'mammal',
    earStyle: 'pointy-triangle',
    tailStyle: 'long-whip',
    snout: 'none',
    extras: ['spots'],
    mountPoint: MOUNT_POINTS.snowleopard,
    headAnchor: [34, -58],
    neckAnchor: [29, -51],
  },
  turtle: {
    base: 'frog', // §12.3 — 신규 베이스가 아니라 frog 서브베이스의 «재해석»
    earStyle: 'none',
    tailStyle: 'stub',
    snout: 'none',
    extras: [],
    mountPoint: MOUNT_POINTS.turtle,
    headAnchor: [34, -20],
    neckAnchor: [26, -14],
    haloAnchor: [10, -42], // 거북 머리는 낮게 앞으로 나온다
  },
};

export function speciesBase(species: Species): SpeciesBase {
  return SPECIES_PARAMS[species].base;
}

// ── 로컬 캔버스 헬퍼(모듈 자급자족 — main.ts 의존 0) ───────────────────────

function capsule(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  w: number,
  color: string
): void {
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

function rrect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function bodyGradient(
  ctx: CanvasRenderingContext2D,
  topY: number,
  botY: number,
  pal: GradePalette
): CanvasGradient {
  const g = ctx.createLinearGradient(0, topY, 0, botY);
  g.addColorStop(0, pal.bodyTop);
  g.addColorStop(1, pal.bodyBottom);
  return g;
}

function fillStroke(
  ctx: CanvasRenderingContext2D,
  fill: string | CanvasGradient,
  stroke: string | null,
  w = 2
): void {
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = w;
    ctx.stroke();
  }
}

// ── 서브베이스 A: 포유류형(§2.1 + §10.1~10.5) ──────────────────────────────

/** §2.1 몸통 bean path(등급 림라이트·SPECIAL 시머 clip 에서도 재사용). */
function mammalBodyPath(ctx: CanvasRenderingContext2D): void {
  ctx.beginPath();
  ctx.moveTo(-30, -10);
  ctx.quadraticCurveTo(-38, -30, -20, -48); // 엉덩이 → 등
  ctx.quadraticCurveTo(-2, -56, 16, -50); // 등 라인 → 어깨
  ctx.quadraticCurveTo(30, -46, 30, -30); // 가슴 앞쪽
  ctx.quadraticCurveTo(30, -14, 18, -8); // 배 앞쪽
  ctx.quadraticCurveTo(-6, -2, -30, -10); // 배 → 꼬리쪽 닫기
  ctx.closePath();
}

function drawMammalTail(
  ctx: CanvasRenderingContext2D,
  style: TailStyle,
  pal: GradePalette
): void {
  if (style === 'pompom') {
    // §2.1 동글동글 폼폼
    ctx.beginPath();
    ctx.arc(-34, -16, 7, 0, Math.PI * 2);
    fillStroke(ctx, pal.bodyTop, pal.bodyOutline, 2);
  } else if (style === 'bushy') {
    // §10.2 다람쥐 부시테일 — 몸통보다 «먼저» 그려야 등 위 실루엣이 안 잘린다
    ctx.beginPath();
    ctx.moveTo(-28, -14);
    ctx.quadraticCurveTo(-52, -20, -54, -50);
    ctx.quadraticCurveTo(-56, -78, -34, -86);
    ctx.quadraticCurveTo(-40, -66, -30, -48);
    ctx.quadraticCurveTo(-22, -28, -28, -14);
    ctx.closePath();
    const tg = ctx.createLinearGradient(0, -86, 0, -14);
    tg.addColorStop(0, pal.bodyTop);
    tg.addColorStop(1, pal.bodyBottom);
    fillStroke(ctx, tg, pal.bodyOutline, 2);
    // 결 텍스처(§10.2 선택항목)
    ctx.save();
    ctx.strokeStyle = pal.bodyBottom;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.moveTo(-34, -24);
    ctx.quadraticCurveTo(-48, -44, -40, -74);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-30, -30);
    ctx.quadraticCurveTo(-42, -48, -36, -70);
    ctx.stroke();
    ctx.restore();
  } else if (style === 'stub') {
    // §10.3 고슴도치 스텁
    ctx.beginPath();
    ctx.ellipse(-32, -12, 4, 3, 0, 0, Math.PI * 2);
    fillStroke(ctx, pal.bodyBottom, pal.bodyOutline, 1.5);
  } else if (style === 'paddle') {
    // §12.1 수달 — 낮고 넓은 노
    ctx.beginPath();
    ctx.moveTo(-30, -14);
    ctx.quadraticCurveTo(-52, -10, -58, -16);
    ctx.quadraticCurveTo(-52, -22, -30, -20);
    ctx.closePath();
    fillStroke(ctx, bodyGradient(ctx, -22, -10, pal), pal.bodyOutline, 2);
  } else if (style === 'tufted') {
    // §12.1 황소 — 얇은 줄 + 끝 술
    ctx.save();
    ctx.strokeStyle = pal.bodyOutline;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-30, -18);
    ctx.quadraticCurveTo(-44, -14, -46, 2);
    ctx.stroke();
    ctx.restore();
    ctx.beginPath();
    ctx.arc(-46, 6, 5, 0, Math.PI * 2);
    fillStroke(ctx, pal.bodyBottom, pal.bodyOutline, 1.5);
  } else if (style === 'thick-balance') {
    // §12.1 캥거루 — 굵고 긴 균형 꼬리
    ctx.beginPath();
    ctx.moveTo(-28, -20);
    ctx.quadraticCurveTo(-50, -18, -62, 4);
    ctx.quadraticCurveTo(-50, 10, -34, -6);
    ctx.quadraticCurveTo(-26, -14, -28, -20);
    ctx.closePath();
    fillStroke(ctx, bodyGradient(ctx, -20, 10, pal), pal.bodyOutline, 2);
  } else if (style === 'long-whip') {
    // §12.1 치타·흑표범·눈표범 — 길고 가는 채찍꼬리 + 어두운 팁
    ctx.beginPath();
    ctx.moveTo(-28, -14);
    ctx.quadraticCurveTo(-50, -10, -56, -30);
    ctx.quadraticCurveTo(-58, -46, -48, -52);
    ctx.quadraticCurveTo(-46, -40, -40, -22);
    ctx.quadraticCurveTo(-34, -12, -28, -14);
    ctx.closePath();
    fillStroke(ctx, bodyGradient(ctx, -52, -10, pal), pal.bodyOutline, 2);
    ctx.beginPath();
    ctx.ellipse(-49, -49, 5, 4, 0, 0, Math.PI * 2);
    ctx.fillStyle = pal.bodyOutline;
    ctx.fill();
  } else if (style === 'droop-bushy') {
    // §12.1 늑대 — 아래로 처진 부시테일.
    // ★ 실측 교정(2026-08-09): 스펙 원좌표는 꼬리 최하단이 y=+30 이다. 원점이
    //   «접지점»(§1)이므로 그대로 그리면 꼬리가 지면 아래 30px 로 내려간다 —
    //   main.ts 는 지형을 «먼저» 그리고 캐릭터를 나중에 얹으므로(코드 확인)
    //   화면에서는 흙 위에 꼬리가 «꽂혀» 보인다. 렌더 캡처로 확인했다.
    //   같은 절의 캥거루(+10)·황소(+11)는 지면에 «닿는» 정도라 정상이었다 —
    //   그래서 스타일 전체가 아니라 이 꼬리만 -20 올려 최하단을 +10 에 맞춘다.
    //   원좌표를 보존해 두니 디자이너가 원복하려면 DROOP_TAIL_LIFT 를 0 으로.
    ctx.save();
    ctx.translate(0, -DROOP_TAIL_LIFT);
    ctx.beginPath();
    ctx.moveTo(-28, -14);
    ctx.quadraticCurveTo(-46, -8, -50, 10);
    ctx.quadraticCurveTo(-54, 26, -42, 30);
    ctx.quadraticCurveTo(-34, 20, -32, 0);
    ctx.quadraticCurveTo(-30, -8, -28, -14);
    ctx.closePath();
    fillStroke(ctx, bodyGradient(ctx, -14, 30, pal), pal.bodyOutline, 2);
    ctx.restore();
  } else if (style === 'curly') {
    // §10.4 돼지 나선 꼬리(stroke 전용)
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = pal.bodyOutline;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(-30, -18, 6, 0, 1.5 * Math.PI);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(-27, -21, 3, Math.PI, 2.5 * Math.PI);
    ctx.stroke();
    ctx.restore();
  }
}

function drawMammalEars(
  ctx: CanvasRenderingContext2D,
  style: EarStyle,
  pal: GradePalette,
  side: 'far' | 'near'
): void {
  const fill = side === 'far' ? pal.bodyBottom : pal.bodyTop;
  switch (style) {
    case 'long-rabbit': // §2.1
      if (side === 'far') {
        ctx.beginPath();
        ctx.moveTo(34, -70);
        ctx.quadraticCurveTo(26, -100, 30, -118);
        ctx.quadraticCurveTo(34, -100, 44, -72);
        ctx.closePath();
        fillStroke(ctx, fill, pal.bodyOutline, 2);
      } else {
        ctx.beginPath();
        ctx.moveTo(42, -68);
        ctx.quadraticCurveTo(48, -98, 54, -120);
        ctx.quadraticCurveTo(60, -98, 50, -70);
        ctx.closePath();
        fillStroke(ctx, fill, pal.bodyOutline, 2);
        // 내이(외곽선 없음)
        ctx.beginPath();
        ctx.moveTo(46, -76);
        ctx.quadraticCurveTo(49, -96, 53, -110);
        ctx.quadraticCurveTo(56, -96, 51, -78);
        ctx.closePath();
        ctx.fillStyle = pal.earInner;
        ctx.fill();
      }
      break;
    case 'short-round': // §10.2
      if (side === 'far') {
        ctx.beginPath();
        ctx.moveTo(30, -68);
        ctx.quadraticCurveTo(26, -80, 32, -86);
        ctx.quadraticCurveTo(38, -80, 36, -68);
        ctx.closePath();
      } else {
        ctx.beginPath();
        ctx.moveTo(40, -66);
        ctx.quadraticCurveTo(38, -80, 46, -86);
        ctx.quadraticCurveTo(52, -78, 48, -66);
        ctx.closePath();
      }
      fillStroke(ctx, fill, pal.bodyOutline, 2);
      break;
    case 'tiny-nub': // §10.3 작은 원형 돌기
      ctx.beginPath();
      if (side === 'far') ctx.arc(34, -72, 5, 0, Math.PI * 2);
      else ctx.arc(44, -70, 5, 0, Math.PI * 2);
      fillStroke(ctx, fill, pal.bodyOutline, 1.5);
      break;
    case 'floppy-down': // §10.4 아래로 처진 삼각(돼지)
      if (side === 'far') {
        ctx.beginPath();
        ctx.moveTo(28, -68);
        ctx.quadraticCurveTo(20, -64, 22, -54);
        ctx.quadraticCurveTo(30, -58, 34, -68);
        ctx.closePath();
      } else {
        ctx.beginPath();
        ctx.moveTo(38, -70);
        ctx.quadraticCurveTo(32, -66, 34, -56);
        ctx.quadraticCurveTo(42, -60, 46, -70);
        ctx.closePath();
      }
      fillStroke(ctx, fill, pal.bodyOutline, 2);
      break;
    case 'pointy-triangle': // §12.1 여우·늑대·치타·흑표범·눈표범
      if (side === 'far') {
        ctx.beginPath();
        ctx.moveTo(30, -66);
        ctx.lineTo(26, -92);
        ctx.lineTo(38, -70);
        ctx.closePath();
      } else {
        ctx.beginPath();
        ctx.moveTo(40, -64);
        ctx.lineTo(37, -94);
        ctx.lineTo(50, -68);
        ctx.closePath();
      }
      fillStroke(ctx, fill, pal.bodyOutline, 2);
      break;
    case 'floppy-side': // §10.5 양옆으로 늘어짐(염소)
      if (side === 'far') {
        ctx.beginPath();
        ctx.moveTo(30, -64);
        ctx.quadraticCurveTo(24, -52, 28, -42);
        ctx.quadraticCurveTo(36, -50, 36, -64);
        ctx.closePath();
      } else {
        ctx.beginPath();
        ctx.moveTo(40, -64);
        ctx.quadraticCurveTo(36, -50, 42, -40);
        ctx.quadraticCurveTo(48, -50, 48, -64);
        ctx.closePath();
      }
      fillStroke(ctx, fill, pal.bodyOutline, 2);
      break;
    default:
      break;
  }
}

/** §10.3 등 라인 가시 8개(몸통 직후·머리 전에 오버레이). */
const SPIKE_BASE: [number, number][] = [
  [-22, -50],
  [-16, -55],
  [-9, -58],
  [-2, -59],
  [5, -58],
  [12, -56],
  [19, -52],
  [25, -48],
];

function drawSpikes(ctx: CanvasRenderingContext2D, pal: GradePalette): void {
  drawRidgeSpikes(ctx, SPIKE_BASE, 10, pal.bodyOutline);
}

/** 가시 능선의 최고점 y(라이더 안착 검산에 쓴다). */
export function spikeRidgeTopY(): number {
  return ridgeTopY(SPIKE_BASE, 10); // ≈ -68.5
}

/** §12.1 멧돼지 갈기 — §10.3 가시 패턴 재사용, 돌출량만 -6 으로 축소. */
const BOAR_MANE_BASE: [number, number][] = [
  [-14, -46],
  [-8, -50],
  [-1, -52],
  [6, -51],
  [13, -48],
];

/** 삼각 돌기열 공통 로직(가시 §10.3 / 갈기 §12.1 / 이무기 프릴 §12.2). */
function drawRidgeSpikes(
  ctx: CanvasRenderingContext2D,
  base: [number, number][],
  protrude: number,
  color: string,
  alpha = 1
): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  for (let i = 0; i < base.length - 1; i++) {
    const [x1, y1] = base[i];
    const [x2, y2] = base[i + 1];
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2 - protrude;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(mx, my);
    ctx.lineTo(x2, y2);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/** 돌기열의 최고점 y(라이더 클리어런스 검산용). */
function ridgeTopY(base: [number, number][], protrude: number): number {
  let top = 0;
  for (let i = 0; i < base.length - 1; i++) {
    const my = (base[i][1] + base[i + 1][1]) / 2 - protrude;
    if (my < top) top = my;
  }
  return top;
}

/** §12.1 spots — 치타·눈표범. 몸통 fill 직후(다리·귀보다 먼저) 그린다. */
const SPOT_POS: [number, number, number][] = [
  [10, -42, 3.5],
  [-4, -36, 3],
  [18, -30, 3],
  [-12, -24, 2.8],
  [4, -16, 3],
  [-20, -38, 2.5],
  [20, -46, 2.5],
];

function drawSpots(ctx: CanvasRenderingContext2D, pal: GradePalette): void {
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = pal.bodyOutline;
  for (const [sx, sy, sr] of SPOT_POS) {
    ctx.beginPath();
    ctx.arc(sx, sy, sr, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** §12.1 antlers — 사슴·불꽃사슴. 가지뿔(HORN_COLOR 재사용), 귀·머리보다 먼저. */
function drawAntlers(ctx: CanvasRenderingContext2D, pal: GradePalette): void {
  const one = (dx: number) => {
    ctx.save();
    ctx.translate(dx, 0);
    ctx.beginPath();
    ctx.moveTo(30, -72);
    ctx.quadraticCurveTo(22, -92, 28, -108);
    ctx.lineTo(31, -105);
    ctx.quadraticCurveTo(26, -90, 33, -72);
    ctx.closePath();
    fillStroke(ctx, HORN_COLOR, pal.bodyOutline, 1.5);
    ctx.beginPath(); // 곁가지 1
    ctx.moveTo(27, -96);
    ctx.lineTo(18, -100);
    ctx.lineTo(26, -90);
    ctx.closePath();
    fillStroke(ctx, HORN_COLOR, pal.bodyOutline, 1.5);
    ctx.beginPath(); // 곁가지 2
    ctx.moveTo(29, -84);
    ctx.lineTo(20, -86);
    ctx.lineTo(28, -78);
    ctx.closePath();
    fillStroke(ctx, HORN_COLOR, pal.bodyOutline, 1.5);
    ctx.restore();
  };
  one(0); // 먼쪽
  one(8); // 가까운쪽
}

/** §12.1 horn-nose — 코뿔소. 머리 그린 «뒤»에 코 위로 올린다. */
function drawNoseHorn(ctx: CanvasRenderingContext2D, pal: GradePalette): void {
  ctx.beginPath();
  ctx.moveTo(46, -56);
  ctx.quadraticCurveTo(50, -64, 58, -66);
  ctx.quadraticCurveTo(52, -60, 50, -52);
  ctx.closePath();
  fillStroke(ctx, HORN_COLOR, pal.bodyOutline, 1.5);
}

/** §10.5 뿔 2개 — 귀·머리보다 «먼저» 그려 뒤에 배치. */
function drawHorns(ctx: CanvasRenderingContext2D, pal: GradePalette): void {
  ctx.beginPath();
  ctx.moveTo(30, -72);
  ctx.quadraticCurveTo(25, -86, 32, -94);
  ctx.lineTo(35, -91);
  ctx.quadraticCurveTo(30, -82, 34, -72);
  ctx.closePath();
  fillStroke(ctx, HORN_COLOR, pal.bodyOutline, 1.5);
  ctx.beginPath();
  ctx.moveTo(38, -72);
  ctx.quadraticCurveTo(33, -86, 40, -94);
  ctx.lineTo(43, -91);
  ctx.quadraticCurveTo(38, -82, 42, -72);
  ctx.closePath();
  fillStroke(ctx, HORN_COLOR, pal.bodyOutline, 1.5);
}

function drawMammalSnout(
  ctx: CanvasRenderingContext2D,
  style: SnoutStyle,
  pal: GradePalette
): void {
  if (style === 'point') {
    // §10.3 뾰족한 코끝
    ctx.beginPath();
    ctx.moveTo(48, -58);
    ctx.lineTo(60, -55);
    ctx.lineTo(48, -52);
    ctx.closePath();
    ctx.fillStyle = pal.bodyOutline;
    ctx.fill();
  } else if (style === 'cylinder-flat' || style === 'tusked') {
    // §10.4 납작 원통 스냅 + 콧구멍
    ctx.beginPath();
    ctx.ellipse(50, -56, 8, 6, 0, 0, Math.PI * 2);
    fillStroke(ctx, pal.earInner, pal.bodyOutline, 1.5);
    ctx.fillStyle = pal.bodyOutline;
    ctx.beginPath();
    ctx.ellipse(47, -56, 1.5, 1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(53, -56, 1.5, 1, 0, 0, Math.PI * 2);
    ctx.fill();
    if (style === 'tusked') {
      // §12.1 엄니 2개(상아색 고정)
      for (const dx of [0, 4]) {
        ctx.save();
        ctx.translate(dx, 0);
        ctx.beginPath();
        ctx.moveTo(44, -52);
        ctx.quadraticCurveTo(40, -46, 44, -42);
        ctx.lineTo(47, -44);
        ctx.quadraticCurveTo(46, -49, 48, -52);
        ctx.closePath();
        fillStroke(ctx, TUSK_COLOR, pal.bodyOutline, 1);
        ctx.restore();
      }
    }
  }
}

/** 서브베이스 A. 그림 순서 §1: 꼬리 → 뒷다리 → 몸통 → (가시) → 앞다리 →
 *  (뿔) → 먼쪽 귀 → 머리 → 가까운쪽 귀 → 주둥이 → 볼/눈. */
function drawMammalBody(
  ctx: CanvasRenderingContext2D,
  species: Species,
  pal: GradePalette
): void {
  const p = SPECIES_PARAMS[species];
  const grad = bodyGradient(ctx, -56, -2, pal);
  ctx.lineJoin = 'round';

  drawMammalTail(ctx, p.tailStyle, pal);

  // 뒷다리
  ctx.beginPath();
  ctx.moveTo(-30, -22);
  ctx.quadraticCurveTo(-36, -8, -24, 2);
  ctx.quadraticCurveTo(-12, -6, -16, -22);
  ctx.closePath();
  fillStroke(ctx, pal.bodyBottom, pal.bodyOutline, 2);

  // 몸통
  mammalBodyPath(ctx);
  fillStroke(ctx, grad, pal.bodyOutline, 3);

  // §12.1 반점 — 몸통 fill 직후, 다리·귀보다 먼저(다리에 가려지는 건 자연스럽게)
  if (p.extras.indexOf('spots') >= 0) drawSpots(ctx, pal);

  if (p.extras.indexOf('spikes') >= 0) drawSpikes(ctx, pal);
  if (p.extras.indexOf('mane-bristle') >= 0) {
    drawRidgeSpikes(ctx, BOAR_MANE_BASE, 6, pal.bodyOutline);
  }

  // 앞다리
  ctx.beginPath();
  ctx.moveTo(16, -16);
  ctx.quadraticCurveTo(11, -6, 16, 4);
  ctx.quadraticCurveTo(24, -2, 24, -16);
  ctx.closePath();
  fillStroke(ctx, pal.bodyTop, pal.bodyOutline, 2);

  if (p.extras.indexOf('horns') >= 0) drawHorns(ctx, pal);
  if (p.extras.indexOf('antlers') >= 0) drawAntlers(ctx, pal);

  drawMammalEars(ctx, p.earStyle, pal, 'far');

  // 머리
  ctx.beginPath();
  ctx.arc(34, -58, 17, 0, Math.PI * 2);
  fillStroke(ctx, grad, pal.bodyOutline, 3);

  drawMammalEars(ctx, p.earStyle, pal, 'near');
  drawMammalSnout(ctx, p.snout, pal);
  if (p.extras.indexOf('horn-nose') >= 0) drawNoseHorn(ctx, pal);

  // 볼 블러시(§2.1) — 원통 주둥이가 있으면 자리 겹치니 생략
  if (p.snout !== 'cylinder-flat' && p.snout !== 'tusked') {
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = pal.accessory;
    ctx.beginPath();
    ctx.ellipse(38, -52, 4.5, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // 눈 + 하이라이트
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(44, -60, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(45.5, -61.5, 1, 0, Math.PI * 2);
  ctx.fill();
}

// ── 서브베이스 B: 조류형(§10.6 / §10.7) ────────────────────────────────────

function birdBodyPath(ctx: CanvasRenderingContext2D, species: Species): void {
  ctx.beginPath();
  if (species === 'duck') ctx.ellipse(2, -50, 27, 26, 0, 0, Math.PI * 2); // §10.7 통통
  else ctx.ellipse(2, -52, 24, 28, 0, 0, Math.PI * 2); // §10.6
  ctx.closePath();
}

/** §10.7 물갈퀴 발. */
function drawWebFoot(ctx: CanvasRenderingContext2D, x: number, y: number, color: string): void {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - 6, y + 4);
  ctx.lineTo(x - 2, y + 5);
  ctx.lineTo(x, y + 3);
  ctx.lineTo(x + 2, y + 5);
  ctx.lineTo(x + 6, y + 4);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

/** §12.1 매 발톱. */
function drawTalonFoot(ctx: CanvasRenderingContext2D, x: number, y: number, color: string): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  for (const dx of [-6, 0, 6]) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + dx * 0.6, y + 3, x + dx, y + 5);
    ctx.stroke();
  }
  ctx.restore();
}

/** §10.6 참새식 갈퀴선 발. */
function drawTwigFoot(ctx: CanvasRenderingContext2D, x: number, y: number, color: string): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - 6, y + 4);
  ctx.moveTo(x, y);
  ctx.lineTo(x + 6, y + 4);
  ctx.stroke();
  ctx.restore();
}

/**
 * 서브베이스 B. §10.6 참새 구조가 원형이고, 종별로 다리길이(legStyle)·
 * 몸통 상향(bodyLift)·부리·꼬리만 갈아끼운다.
 * ★ 부리·발은 palette.accessory 가 아니라 anatomyColor(species) 를 쓴다(§10.12.1).
 */
function drawBirdBody(
  ctx: CanvasRenderingContext2D,
  species: Species,
  pal: GradePalette
): void {
  const p = SPECIES_PARAMS[species];
  const lift = p.bodyLift ?? 0; // 학 = 16(§12.6)
  const grad = bodyGradient(ctx, -80 - lift, -24 - lift, pal);
  const anat = anatomyColor(species);
  ctx.lineJoin = 'round';

  // 다리(가는 선) — 몸통보다 먼저. 발(y=-8)은 고정, 엉덩이 쪽만 위로 늘린다.
  const legTopA = p.legStyle === 'long-twig' ? -42 : -26;
  const legTopB = p.legStyle === 'long-twig' ? -40 : -24;
  ctx.save();
  ctx.strokeStyle = p.legStyle === 'long-twig' ? anat : pal.bodyOutline;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-6, -8);
  ctx.lineTo(-6, legTopA);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(8, -8);
  ctx.lineTo(8, legTopB);
  ctx.stroke();
  ctx.restore();

  // 발
  if (p.legStyle === 'web') {
    drawWebFoot(ctx, -6, -8, anat);
    drawWebFoot(ctx, 8, -8, anat);
  } else if (p.legStyle === 'talon') {
    drawTalonFoot(ctx, -6, -8, anat);
    drawTalonFoot(ctx, 8, -8, anat);
  } else {
    drawTwigFoot(ctx, -6, -8, anat);
    drawTwigFoot(ctx, 8, -8, anat);
  }

  // ── 여기부터 «몸통 세트»(꼬리·몸통·날개·머리·부리·눈)는 lift 만큼 통째로 위로
  ctx.save();
  ctx.translate(0, -lift);

  // 꼬리 — 몸통보다 먼저 그려 뿌리가 몸통에 가려지게
  if (p.tailStyle === 'fan-short' || p.tailStyle === 'fan-long') {
    const bx = -22;
    const by = -54;
    const tips: [number, number][] =
      p.tailStyle === 'fan-long'
        ? [
            [-40, -44],
            [-46, -52],
            [-40, -60],
          ] // §12.1 매 — 팁만 더 바깥
        : [
            [-34, -46],
            [-38, -52],
            [-34, -58],
          ]; // §10.6 참새·학
    for (const [tx, ty] of tips) {
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(tx, ty);
      ctx.lineTo(bx - 4, by + (ty - by) * 0.3);
      ctx.closePath();
      fillStroke(ctx, pal.bodyTop, pal.bodyOutline, 1);
    }
  } else if (p.tailStyle === 'curl-up') {
    ctx.beginPath();
    ctx.moveTo(-20, -50);
    ctx.quadraticCurveTo(-32, -54, -30, -64);
    ctx.quadraticCurveTo(-22, -60, -16, -48);
    ctx.closePath();
    fillStroke(ctx, pal.bodyTop, pal.bodyOutline, 2);
  }

  // 몸통
  birdBodyPath(ctx, species);
  fillStroke(ctx, grad, pal.bodyOutline, 3);

  // 날개
  ctx.beginPath();
  ctx.moveTo(-6, -40);
  ctx.quadraticCurveTo(-26, -46, -24, -66);
  ctx.quadraticCurveTo(-10, -58, -2, -42);
  ctx.closePath();
  fillStroke(ctx, pal.bodyBottom, pal.bodyOutline, 2);

  if (p.snout === 'beak-long') {
    // §12.6 학 — 긴 S자 목 + 높은 머리 + 긴 부리(몸통 위에 별도로 얹는다)
    ctx.beginPath();
    ctx.moveTo(12, -90);
    ctx.quadraticCurveTo(28, -104, 24, -122);
    ctx.quadraticCurveTo(20, -132, 12, -128);
    ctx.quadraticCurveTo(18, -114, 8, -96);
    ctx.closePath();
    fillStroke(ctx, grad, pal.bodyOutline, 2);

    ctx.beginPath();
    ctx.arc(26, -130, 10, 0, Math.PI * 2);
    fillStroke(ctx, grad, pal.bodyOutline, 3);

    ctx.beginPath();
    ctx.moveTo(34, -132);
    ctx.lineTo(54, -129);
    ctx.lineTo(34, -126);
    ctx.closePath();
    ctx.fillStyle = anat;
    ctx.fill();

    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(32, -131, 1.8, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // 머리
    ctx.beginPath();
    ctx.arc(26, -78, 14, 0, Math.PI * 2);
    fillStroke(ctx, grad, pal.bodyOutline, 3);

    // 부리
    if (p.snout === 'beak-spatula') {
      ctx.beginPath();
      ctx.moveTo(36, -80);
      ctx.quadraticCurveTo(52, -82, 54, -77);
      ctx.quadraticCurveTo(52, -73, 36, -75);
      ctx.closePath();
      fillStroke(ctx, anat, pal.bodyOutline, 1.5);
    } else if (p.snout === 'beak-hook') {
      // §12.1 매 — 맹금류 갈고리 부리
      ctx.beginPath();
      ctx.moveTo(38, -80);
      ctx.quadraticCurveTo(50, -79, 52, -74);
      ctx.quadraticCurveTo(46, -75, 40, -73);
      ctx.quadraticCurveTo(36, -77, 38, -80);
      ctx.closePath();
      ctx.fillStyle = anat;
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(38, -79);
      ctx.lineTo(50, -77);
      ctx.lineTo(38, -74);
      ctx.closePath();
      ctx.fillStyle = anat;
      ctx.fill();
    }

    // 눈
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(34, -80, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(35, -81, 0.7, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

// ── 서브베이스 C: 양서류형(§10.8) ──────────────────────────────────────────

function frogBodyPath(ctx: CanvasRenderingContext2D): void {
  ctx.beginPath();
  ctx.moveTo(-28, -6);
  ctx.quadraticCurveTo(-34, -30, -8, -38);
  ctx.quadraticCurveTo(18, -40, 30, -26);
  ctx.quadraticCurveTo(34, -12, 24, -4);
  ctx.quadraticCurveTo(0, 4, -28, -6);
  ctx.closePath();
}

/** §12.3 거북 등딱지 — frog 돔을 더 높인 «재해석»(신규 베이스 아님). */
function turtleBodyPath(ctx: CanvasRenderingContext2D): void {
  ctx.beginPath();
  ctx.moveTo(-26, -6);
  ctx.quadraticCurveTo(-32, -42, -6, -54);
  ctx.quadraticCurveTo(20, -56, 30, -34);
  ctx.quadraticCurveTo(34, -14, 22, -4);
  ctx.quadraticCurveTo(0, 6, -26, -6);
  ctx.closePath();
}

/** §12.3 돌거북(Doldam). frog 서브베이스 확장 — 돔 상향 + 작은 머리 + 다리 4개. */
function drawTurtleBody(ctx: CanvasRenderingContext2D, pal: GradePalette): void {
  const grad = bodyGradient(ctx, -54, 6, pal);
  ctx.lineJoin = 'round';

  // 꼬리(작은 뾰족 스텁) — 등딱지보다 먼저 그려 뿌리를 가린다
  ctx.beginPath();
  ctx.moveTo(-26, -4);
  ctx.lineTo(-34, 0);
  ctx.lineTo(-26, 4);
  ctx.closePath();
  ctx.fillStyle = pal.bodyBottom;
  ctx.fill();

  // 다리 4개(등딱지 테두리 아래 짧은 돌기) — 등딱지보다 먼저
  const LEG_POS: [number, number][] = [
    [-20, -8],
    [-4, 2],
    [14, -4],
    [24, -14],
  ];
  for (const [lx, ly] of LEG_POS) {
    ctx.beginPath();
    ctx.ellipse(lx, ly, 6, 4, 0, 0, Math.PI * 2);
    fillStroke(ctx, pal.bodyBottom, pal.bodyOutline, 1.5);
  }

  // 머리(작게, 앞쪽으로 내밈) — 등딱지보다 먼저 그려 목 이음새를 감춘다
  ctx.beginPath();
  ctx.arc(34, -20, 9, 0, Math.PI * 2);
  fillStroke(ctx, grad, pal.bodyOutline, 3);
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(37, -21, 1.8, 0, Math.PI * 2);
  ctx.fill();

  // 등딱지
  turtleBodyPath(ctx);
  fillStroke(ctx, grad, pal.bodyOutline, 3);

  // 등딱지 무늬
  ctx.save();
  ctx.strokeStyle = pal.bodyOutline;
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-16, -30);
  ctx.lineTo(0, -42);
  ctx.lineTo(14, -32);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-8, -14);
  ctx.lineTo(6, -24);
  ctx.lineTo(18, -16);
  ctx.stroke();
  ctx.restore();
}

// ── 서브베이스 D: 서펜타인형(§12.2) — 이무기 전용 ─────────────────────────

/** §12.2 두꺼운 S자 리본 몸통(위 능선 → 되접어 아래 능선). */
function serpentBodyPath(ctx: CanvasRenderingContext2D): void {
  ctx.beginPath();
  ctx.moveTo(-40, -6);
  ctx.quadraticCurveTo(-30, -30, -6, -28);
  ctx.quadraticCurveTo(14, -26, 10, -46);
  ctx.quadraticCurveTo(6, -60, 24, -58);
  ctx.quadraticCurveTo(36, -57, 40, -46); // 위쪽 능선 끝
  ctx.quadraticCurveTo(34, -40, 24, -42); // 아래쪽 능선으로 되접어 두께 형성
  ctx.quadraticCurveTo(10, -44, 12, -32);
  ctx.quadraticCurveTo(14, -18, -4, -16);
  ctx.quadraticCurveTo(-24, -14, -32, 6);
  ctx.quadraticCurveTo(-36, 10, -40, -6);
  ctx.closePath();
}

/** §12.2 이무기(Mireu). 다리·날개·뿔 없음 — 몸통 + 수염만으로 실루엣을 만든다. */
function drawSerpentBody(ctx: CanvasRenderingContext2D, pal: GradePalette): void {
  const grad = bodyGradient(ctx, -58, 10, pal);
  ctx.lineJoin = 'round';

  serpentBodyPath(ctx);
  fillStroke(ctx, grad, pal.bodyOutline, 3);

  // 등 지느러미 프릴(위 능선을 따라 짧은 삼각)
  drawRidgeSpikes(
    ctx,
    [
      [-4, -27],
      [10, -45],
      [24, -57],
    ],
    5,
    pal.bodyOutline,
    0.7
  );

  // 머리(몸통 앞끝, 살짝 쳐든 형태)
  ctx.beginPath();
  ctx.arc(44, -50, 12, 0, Math.PI * 2);
  fillStroke(ctx, grad, pal.bodyOutline, 3);

  // 수염 2가닥 — «뿔 대신» 신비 포인트(뿔 없는 이무기 로어, §12.2)
  ctx.save();
  ctx.strokeStyle = pal.bodyOutline;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(50, -48);
  ctx.quadraticCurveTo(60, -46, 64, -38);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(50, -44);
  ctx.quadraticCurveTo(58, -38, 60, -28);
  ctx.stroke();
  ctx.restore();

  // 눈 + 하이라이트
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(50, -53, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(51.5, -54.5, 1, 0, Math.PI * 2);
  ctx.fill();
}

function drawFrogBody(ctx: CanvasRenderingContext2D, pal: GradePalette): void {
  const grad = bodyGradient(ctx, -40, 0, pal);
  ctx.lineJoin = 'round';

  // 몸통(낮고 넓은 돔)
  frogBodyPath(ctx);
  fillStroke(ctx, grad, pal.bodyOutline, 3);

  // 눈 2개(머리 위로 돌출)
  ctx.beginPath();
  ctx.arc(6, -42, 10, 0, Math.PI * 2);
  fillStroke(ctx, pal.bodyTop, pal.bodyOutline, 2);
  ctx.beginPath();
  ctx.arc(16, -44, 11, 0, Math.PI * 2);
  fillStroke(ctx, pal.bodyTop, pal.bodyOutline, 2);

  // 눈동자(가로로 납작) + 하이라이트
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(6, -42, 4, 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(16, -44, 4.5, 2.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(7, -43, 0.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(17.5, -45, 0.8, 0, Math.PI * 2);
  ctx.fill();

  // 앞다리(작은 팔)
  ctx.beginPath();
  ctx.moveTo(22, -22);
  ctx.quadraticCurveTo(30, -14, 26, -4);
  ctx.quadraticCurveTo(18, -8, 18, -20);
  ctx.closePath();
  fillStroke(ctx, pal.bodyBottom, pal.bodyOutline, 2);

  // 뒷다리(접힌 허벅지)
  ctx.beginPath();
  ctx.moveTo(-30, -16);
  ctx.quadraticCurveTo(-40, -8, -34, 6);
  ctx.quadraticCurveTo(-20, 6, -18, -10);
  ctx.quadraticCurveTo(-22, -18, -30, -16);
  ctx.closePath();
  fillStroke(ctx, pal.bodyBottom, pal.bodyOutline, 2);

  // 물갈퀴 발(3갈래 부채)
  ctx.beginPath();
  ctx.moveTo(-34, 4);
  ctx.quadraticCurveTo(-30, 10, -20, 8);
  ctx.quadraticCurveTo(-16, 4, -20, 0);
  ctx.closePath();
  ctx.fillStyle = pal.accessory;
  ctx.fill();

  // 목/턱 패치
  ctx.save();
  ctx.globalAlpha = 0.6;
  ctx.fillStyle = pal.earInner;
  ctx.beginPath();
  ctx.ellipse(0, -10, 8, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ── 공개 API: 동물 몸체 ────────────────────────────────────────────────────

/**
 * §2.1 + §10 — 종별 동물 몸체. 원점 = 접지점.
 * 호출부에서 translate/scale/rotate 를 건 상태로 부른다.
 */
export function drawCritterBody(
  ctx: CanvasRenderingContext2D,
  species: Species,
  palette: GradePalette
): void {
  ctx.save();
  switch (SPECIES_PARAMS[species].base) {
    case 'bird':
      drawBirdBody(ctx, species, palette);
      break;
    case 'frog':
      // §12.3 — 거북은 같은 서브베이스의 «재해석»이라 여기서 분기한다
      if (species === 'turtle') drawTurtleBody(ctx, palette);
      else drawFrogBody(ctx, palette);
      break;
    case 'serpentine':
      drawSerpentBody(ctx, palette);
      break;
    default:
      drawMammalBody(ctx, species, palette);
      break;
  }
  ctx.restore();
}

/** 몸통 실루엣 path 만 만든다(EPIC 림라이트·SPECIAL 시머 clip 용, fill/stroke 없음). */
export function critterBodyPath(ctx: CanvasRenderingContext2D, species: Species): void {
  const p = SPECIES_PARAMS[species];
  switch (p.base) {
    case 'bird': {
      // 학은 몸통이 통째로 위로 올라가 있다(§12.6) — clip path 도 같이 올린다
      const lift = p.bodyLift ?? 0;
      if (lift) {
        ctx.save();
        ctx.translate(0, -lift);
        birdBodyPath(ctx, species);
        ctx.restore();
      } else {
        birdBodyPath(ctx, species);
      }
      break;
    }
    case 'frog':
      if (species === 'turtle') turtleBodyPath(ctx);
      else frogBodyPath(ctx);
      break;
    case 'serpentine':
      serpentBodyPath(ctx);
      break;
    default:
      mammalBodyPath(ctx);
      break;
  }
}

// ── 공개 API: 라이더(§2.2) ─────────────────────────────────────────────────

/** §2.2 파츠의 기준 앵커(= 산토끼 mountPoint). 다른 종은 이 차이만큼 평행이동. */
export const RIDER_REF_MOUNT: MountPoint = { x: 6, y: -78 };

/** 라이더 파츠 로컬 지오메트리(검산·문서화용 — 그리기 코드와 «같은 상수»를 쓴다). */
export const RIDER_METRICS = {
  jacketW: 16,
  jacketH: 22,
  jacketR: 7,
  jacketTiltDeg: -8,
  /** 재킷 하단 = mountPoint.y + 11 (엉덩이가 닿는 선) */
  seatOffsetY: 11,
  /** 다리 캡슐 하단(발) = mountPoint.y + 38, 캡슐 두께 7 → 시각 최하단 +41.5 */
  footOffsetY: 38,
  footVisualOffsetY: 41.5,
  /** 머리 중심 = mountPoint.y - 22, 헬멧 상단 = -32 */
  headOffsetY: -22,
  helmetTopOffsetY: -32,
} as const;

function normalizeMount(mp: MountPointInput): MountPoint {
  return Array.isArray(mp) ? { x: mp[0], y: mp[1] } : (mp as MountPoint);
}

/**
 * §2.2 라이더 치비. mountPoint = «재킷 캡슐의 중심»(스펙 정의).
 * 내부 좌표는 산토끼 기준 절대좌표이고, 전체 파츠 세트를
 * (mountPoint.x - 6, mountPoint.y + 78) 만큼 평행이동해 그린다.
 * accent 는 헬멧 스트라이프에 쓰는 등급 accessory 색(기본 COMMON).
 */
export function drawRiderFigure(
  ctx: CanvasRenderingContext2D,
  mountPoint: MountPointInput,
  accent: string = GRADE_PALETTES.COMMON.accessory
): void {
  const mp = normalizeMount(mountPoint);
  ctx.save();
  ctx.translate(mp.x - RIDER_REF_MOUNT.x, mp.y - RIDER_REF_MOUNT.y);
  ctx.lineJoin = 'round';

  // 다리(그립) — 대부분 몸통에 가려진다
  capsule(ctx, 4, -66, 12, -40, 7, RIDER_COLORS.pants);

  // 몸통(재킷) — 약 -8° 기울인 캡슐
  ctx.save();
  ctx.translate(6, -78);
  ctx.rotate((RIDER_METRICS.jacketTiltDeg * Math.PI) / 180);
  const jg = ctx.createLinearGradient(0, -11, 0, 11);
  jg.addColorStop(0, RIDER_COLORS.jacketTop);
  jg.addColorStop(1, RIDER_COLORS.jacketBot);
  rrect(ctx, -8, -11, 16, 22, 7);
  ctx.fillStyle = jg;
  ctx.fill();
  ctx.strokeStyle = RIDER_COLORS.jacketLine;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();

  capsule(ctx, 2, -84, -12, -102, 5, RIDER_COLORS.jacketTop); // 뒤팔(만세)
  capsule(ctx, 12, -82, 26, -70, 5, RIDER_COLORS.jacketBot); // 앞팔(그립)

  // 머리
  ctx.beginPath();
  ctx.arc(8, -100, 9, 0, Math.PI * 2);
  ctx.fillStyle = RIDER_COLORS.skin;
  ctx.fill();

  // 눈
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(6, -99, 1.2, 0, Math.PI * 2);
  ctx.arc(11, -99, 1.2, 0, Math.PI * 2);
  ctx.fill();

  // 헬멧(위쪽 180° 캡) + 등급 accent 스트라이프
  ctx.beginPath();
  ctx.arc(8, -100, 10, Math.PI, 0);
  ctx.closePath();
  ctx.fillStyle = RIDER_COLORS.helmet;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = accent;
  ctx.beginPath();
  ctx.arc(8, -100, 8.5, Math.PI, 0);
  ctx.stroke();

  ctx.restore();
}

/** 라이더 엉덩이(재킷 하단) y — 검산용. */
export function riderSeatY(mountPoint: MountPointInput): number {
  return normalizeMount(mountPoint).y + RIDER_METRICS.seatOffsetY;
}
/** 라이더 발끝 y(캡슐 두께 포함) — 검산용. */
export function riderFootY(mountPoint: MountPointInput): number {
  return normalizeMount(mountPoint).y + RIDER_METRICS.footVisualOffsetY;
}

// ── §3.2 등급 장식 ─────────────────────────────────────────────────────────

/**
 * 등급별 장식. COMMON 은 장식 없음(§3.2).
 * 반다나/후광 앵커는 종별(SPECIES_PARAMS.neckAnchor / headAnchor)로 옮겨
 * 조류·양서류에서도 목/머리 위에 붙는다. 산토끼에서는 스펙 좌표와 동일하다.
 */
export function drawGradeDecor(
  ctx: CanvasRenderingContext2D,
  species: Species,
  palette: GradePalette,
  grade: Grade,
  t: number,
  mount?: MountPointInput
): void {
  const p = SPECIES_PARAMS[species];
  ctx.save();
  if (grade === 'RARE') {
    // 목 반다나 — 산토끼 기준 삼각 (24,-54)-(34,-54)-(29,-44), 중심 (29,-51)
    const dx = p.neckAnchor[0] - 29;
    const dy = p.neckAnchor[1] + 51;
    ctx.translate(dx, dy);
    ctx.beginPath();
    ctx.moveTo(24, -54);
    ctx.lineTo(34, -54);
    ctx.lineTo(29, -44);
    ctx.closePath();
    ctx.fillStyle = palette.accessory;
    ctx.fill();
  } else if (grade === 'EPIC') {
    // 라이더 등 뒤 망토 — mountPoint 기준 상대좌표(종 무관하게 등에 붙는다)
    const mp = mount ? normalizeMount(mount) : getMountPoint(species);
    const w = Math.sin(t * 6) * 4;
    ctx.translate(mp.x - RIDER_REF_MOUNT.x, mp.y - RIDER_REF_MOUNT.y);
    ctx.beginPath();
    ctx.moveTo(-4, -70);
    ctx.quadraticCurveTo(-14 + w, -60, -16 + w, -50);
    ctx.lineTo(-6, -48);
    ctx.closePath();
    ctx.fillStyle = palette.accessory;
    ctx.fill();
    // §10.12.2 — 망토만 유일하게 외곽선이 빠져 있어 저대비였다(accessory #B36BFF vs
    // bodyTop #C58BFF = 1.32:1). 색은 그대로 두고 다른 파츠와 같은 관례(bodyOutline
    // stroke)를 적용해 해결한다. 신규색 0건.
    ctx.strokeStyle = palette.bodyOutline;
    ctx.lineWidth = 2;
    ctx.stroke();
  } else if (grade === 'SPECIAL') {
    // 머리 위 후광(살짝 bob) — haloAnchor(없으면 headAnchor) 위 80px.
    // 산토끼에서는 (34,-138)로 스펙과 정확히 일치한다.
    const anchor = p.haloAnchor ?? p.headAnchor;
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = palette.glow ?? '#FFD84D';
    ctx.beginPath();
    ctx.arc(anchor[0], anchor[1] - 80 + Math.sin(t * 3) * 3, 14, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// ── 통합 진입점 ────────────────────────────────────────────────────────────

export interface CritterArtOptions {
  species: Species;
  grade: Grade;
  /** 초 단위 시간(파도·시머·bob 애니메이션). */
  t?: number;
  /** 팔레트 오버라이드(미지정 시 등급 팔레트). */
  palette?: GradePalette;
  /** mountPoint 소스(디자인 A/B 검수용). */
  mountSource?: MountSource;
  /** mountPoint 직접 지정(튜닝 하네스 전용 — 지정 시 mountSource 무시). */
  mountOverride?: MountPointInput;
}

/**
 * 동물 + 등급장식 + 라이더 «한 번에». 원점 = 접지점, 스케일/회전은 호출부 책임.
 * 그림 순서 §1 준수: 동물 → 등급장식 → 라이더(항상 최상단).
 */
export function drawCritterArt(ctx: CanvasRenderingContext2D, opts: CritterArtOptions): void {
  const { species, grade } = opts;
  const t = opts.t ?? 0;
  const pal = opts.palette ?? GRADE_PALETTES[grade];
  const mp = opts.mountOverride
    ? normalizeMount(opts.mountOverride)
    : getMountPoint(species, opts.mountSource ?? 'applied');

  ctx.save();

  // EPIC 림라이트 — 본체를 1.06배 glow 단색으로 먼저 깔고 위에 덮어 그린다
  if (grade === 'EPIC' && pal.glow) {
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.scale(1.06, 1.06);
    const g = pal.glow;
    drawCritterBody(ctx, species, { ...pal, bodyTop: g, bodyBottom: g, bodyOutline: g });
    ctx.restore();
  }

  drawCritterBody(ctx, species, pal);
  drawGradeDecor(ctx, species, pal, grade, t, mp);
  drawRiderFigure(ctx, mp, pal.accessory);

  // SPECIAL 시머 스윕 — 종별 몸통 path 안에서만 대각 띠가 훑는다
  if (pal.shimmer) {
    ctx.save();
    critterBodyPath(ctx, species);
    ctx.clip();
    const sweep = ((t % 1.2) / 1.2) * 130 - 50;
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.moveTo(-40 + sweep, 10);
    ctx.lineTo(10 + sweep, -70);
    ctx.stroke();
    ctx.restore();
  }

  ctx.restore();
}
