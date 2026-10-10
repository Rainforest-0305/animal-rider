// daily.ts — 「하루 뒤 다시 켤 이유」의 «순수 모델».
//
// ★ 이 파일은 import 가 0건이다. DOM 도 localStorage 도 Date.now() 도 «직접» 쓰지
//   않는다(시각은 전부 인자로 받는다). 그래야 날짜 경계·시계 조작을 노드에서
//   그대로 재현해 검증할 수 있다 — 브라우저 없이 테스트되는 게 이 파일의 존재 이유다.
//
// ─────────────────────────────────────────────────────────────────────────────
// 무엇을 구현하나 — «새 기획이 아니라 확정 사양의 미구현분»이다
// ─────────────────────────────────────────────────────────────────────────────
// 1차설계서 v1.0 「4.3 재화 획득 수식」의 확정 행:
//
//     획득처       | 수식                              | 일/회 금액 | 원전 라벨
//     일일 문자 세트 | 200 + min(120, 30 x (연속일 - 1)) | 200 ~ 320  | [확인]
//
// 같은 절의 확정 서술: 「챌린지 100개 소진 후에는 일일 문자 세트가 «유일한 정기
// 수입원»이 되며 상한이 320/일이다.」 그리고 「4.7 초반 이탈 구간」의 확정 서술:
//     「D1 에 560 으로 첫 뽑기(600)에 40 이 모자란다. … D1 에 첫 뽑기가 안 되는
//      것은 «의도적»으로 두지 않았다 — 40 보석 차이라 「내일이면 된다」가 명확히
//      보이는 거리이고, 이것이 «D2 복귀 동기»가 된다.」
// 즉 「하루 뒤 켤 이유」는 이 프로젝트에서 이미 «확정»돼 있었고 구현만 없었다.
// 나는 경제를 새로 만들지 않는다 — 위 수식을 그대로 옮긴다.
//
// 이 연속일(streak)은 동시에 game/roster.ts 의 SPECIAL 「하늘」
// (unlock: { kind:'login_streak', target:30 }) 의 카운터다. 지금까지 이 카운터를
// «올리는 코드가 한 줄도 없어서» 하늘은 영구 획득 불가였고, 따라서 기본 컬렉션
// 모드(full_roster_24)의 24/24 완주 자체가 성립하지 않았다.
//
// ─────────────────────────────────────────────────────────────────────────────
// ★ 시계 조작 — 「막을 수 있는 것」과 「막을 수 없는 것」을 나눠 적는다
// ─────────────────────────────────────────────────────────────────────────────
// 서버도 계정도 «없다». 판정 근거는 기기 시계뿐이다. 그러니 완전 방어는 «불가능»하다.
// 그 사실을 숨기지 않고, 대신 «되돌리기로는 이득이 0» 이 되게 설계한다.
//
//   ① 시계를 «뒤로» 돌린다        → 지급 0. 상태도 «전혀 바뀌지 않는다».
//      (마지막 수령일보다 «큰» 날짜여야만 다음 지급이 열리므로 되감기는 손해도 이득도 아니다.
//       되감았다가 실제 날짜로 돌아오면 그때 정상 지급된다 — 정직한 유저를 벌하지 않는다.)
//   ② 시계를 «2일 이상 앞으로» 돌린다 → 하루치만 지급되고 «연속일이 1로 끊긴다». 손해다.
//   ③ 시계를 «정확히 하루씩» 앞으로 돌린다 → ★막을 수 없다. 30번 반복하면 하늘이 열린다.
//      경과 실시간 하한(예: 「6시간 이상 지나야 지급」)으로 막는 방법이 있으나
//      «채택하지 않았다» — 밤 23:50 에 하고 다음날 00:10 에 켜는 «정상» 유저가
//      정확히 그 규칙에 걸린다. 치터를 잡자고 정직한 유저를 벌하지 않는다.
//      서버가 생기기 전까지 ③은 «알려진 미봉»으로 남긴다.
//
// 날짜는 «로컬» 날짜다(UTC 아님). 유저의 하루는 유저의 자정에 바뀐다.
// 비교는 문자열 'YYYY-MM-DD' 를 다시 «달력 일수»로 환산해서 한다 — DST 로 하루가
// 23/25시간이 되는 날에도 일수 차이가 정확히 1이 되게 하기 위해서다.

// ── 확정 상수(1차설계서 4.3). ★ 여기가 «유일한» 정의처다 ────────────────────
/** 1일차(연속 1일) 지급액. */
export const DAILY_BASE_GEMS = 200;
/** 연속 하루마다 늘어나는 액수. */
export const DAILY_STREAK_STEP = 30;
/** 증가분의 상한. 즉 최대 지급액 = BASE + STEP_CAP. */
export const DAILY_STREAK_BONUS_CAP = 120;
/** 파생값(하드코딩 아님): 320. 설계서 표의 「200 ~ 320」과 일치해야 한다. */
export const DAILY_MAX_GEMS = DAILY_BASE_GEMS + DAILY_STREAK_BONUS_CAP;

/**
 * 연속 n일차의 지급액. 설계서 4.3 수식 그대로.
 *   200 + min(120, 30 x (n - 1))
 * n<=0 은 호출측 버그이므로 1로 클램프한다(0원을 조용히 주지 않는다).
 */
export function dailyGemsForStreak(streakDay: number): number {
  const n = Math.max(1, Math.floor(streakDay));
  return DAILY_BASE_GEMS + Math.min(DAILY_STREAK_BONUS_CAP, DAILY_STREAK_STEP * (n - 1));
}

// ── 날짜 키 ───────────────────────────────────────────────────────────────────
const DAY_MS = 86400000;

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/** epoch ms → 「로컬」 달력 날짜 키 'YYYY-MM-DD'. */
export function dayKeyOf(nowMs: number): string {
  const d = new Date(nowMs);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** 'YYYY-MM-DD' 형식인가. 저장본이 오염됐을 때 조용히 통과시키지 않기 위한 관문. */
export function isDayKey(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

/**
 * 날짜 키 → 「달력 일수」(1970-01-01 = 0). ★ Date.UTC 를 쓰는 이유:
 * 키는 이미 «로컬 달력 날짜»라서 시간대·DST 를 다시 태우면 안 된다. 순수한
 * 연/월/일 산수로만 환산해야 두 날짜의 차이가 언제나 정확한 정수 일수가 된다.
 * 형식이 아니면 NaN 을 돌려 호출측이 «판정 불가»로 다루게 한다.
 */
export function dayNumberOf(key: string): number {
  if (!isDayKey(key)) return NaN;
  const y = Number(key.slice(0, 4));
  const m = Number(key.slice(5, 7));
  const d = Number(key.slice(8, 10));
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

// ── 상태 ──────────────────────────────────────────────────────────────────────
export interface DailyState {
  /** 마지막으로 «지급받은» 로컬 날짜 키. '' = 아직 한 번도 받지 않음. */
  lastClaimDay: string;
  /** 그때의 epoch ms. 판정에는 쓰지 않는다 — 진단·분쟁 확인용 기록이다. */
  lastClaimAtMs: number;
  /** 현재 연속 접속일. 하늘(login_streak)의 카운터 «단일 소스». */
  streak: number;
  /**
   * ★ 지금까지의 최고 연속일. 판정에는 쓰지 않는다.
   *   「연속 30일」이 한 번 끊기면 0부터 다시라는 것이 확정 사양(roster.ts)인데,
   *   그 가혹함을 나중에 Partner 가 「누적 30일」·「최고 연속 30일」로 완화하기로
   *   결정할 수 있다. 그때 «이미 쌓여 있는 데이터»가 없으면 유저 진행이 증발한다.
   *   지금 판정을 바꾸지 않으면서 그 선택지를 살려두는 값이다.
   */
  maxStreak: number;
}

export function emptyDailyState(): DailyState {
  return { lastClaimDay: '', lastClaimAtMs: 0, streak: 0, maxStreak: 0 };
}

export type DailyOutcome =
  /** 지급했다. */
  | 'granted'
  /** 오늘 몫은 이미 받았다(같은 날 재접속). 정상 경로다. */
  | 'already'
  /** ★ 기기 시계가 마지막 수령일보다 «과거»다. 지급 0, 상태 불변. */
  | 'clock-rewound';

export interface DailyEval {
  outcome: DailyOutcome;
  /** 지급액. granted 가 아니면 0. */
  gems: number;
  /** 판정 후 연속일(= 저장될 값). */
  streak: number;
  /** 하늘 조건 표시용. 판정 후 최고 연속일. */
  maxStreak: number;
  /** 하루 이상 비어서 연속이 «끊겼는가»(첫 지급은 false). */
  streakBroken: boolean;
  /** 마지막 수령일로부터 지난 일수. 첫 지급/판정불가면 null. */
  gapDays: number | null;
  /** 저장해야 할 새 상태. outcome!=='granted' 면 prev 와 «값이 같다». */
  next: DailyState;
}

/**
 * 오늘 몫을 줄지 판정한다. ★ 부작용 0 — 아무것도 저장하지 않고 결과만 돌려준다.
 * 저장·지급의 «원자성»은 호출측(save.ts)이 책임진다.
 */
export function evaluateDaily(prev: DailyState, nowMs: number): DailyEval {
  const todayKey = dayKeyOf(nowMs);
  const stay = (outcome: DailyOutcome, gapDays: number | null): DailyEval => ({
    outcome,
    gems: 0,
    streak: prev.streak,
    maxStreak: prev.maxStreak,
    streakBroken: false,
    gapDays,
    next: { ...prev },
  });

  // 첫 지급(신규 유저 또는 저장본에 daily 가 없던 v1 유저).
  if (!isDayKey(prev.lastClaimDay)) {
    return grant(prev, todayKey, nowMs, 1, false, null);
  }

  const gap = dayNumberOf(todayKey) - dayNumberOf(prev.lastClaimDay);
  // 날짜 키가 깨져 판정할 수 없으면 «주지 않는다». 모르면 안 주는 쪽이 안전하다
  // (조용히 매 로드마다 지급되는 보석 복제보다 하루 안 주는 쪽이 낫다).
  if (!Number.isFinite(gap)) return stay('already', null);

  if (gap < 0) return stay('clock-rewound', gap); // ① 되감기 — 이득 0, 상태 불변
  if (gap === 0) return stay('already', 0); // 같은 날 재접속

  // gap >= 1. 정확히 1이면 연속, 2 이상이면 끊긴 것이다(② 앞당기기가 손해가 되는 지점).
  const broken = gap >= 2;
  const nextStreak = broken ? 1 : prev.streak + 1;
  return grant(prev, todayKey, nowMs, nextStreak, broken, gap);
}

function grant(
  prev: DailyState,
  todayKey: string,
  nowMs: number,
  streak: number,
  broken: boolean,
  gapDays: number | null
): DailyEval {
  const maxStreak = Math.max(prev.maxStreak, streak);
  return {
    outcome: 'granted',
    gems: dailyGemsForStreak(streak),
    streak,
    maxStreak,
    streakBroken: broken,
    gapDays,
    next: { lastClaimDay: todayKey, lastClaimAtMs: nowMs, streak, maxStreak },
  };
}

/**
 * 저장본에서 읽은 정체불명의 값 → 안전한 DailyState. 어떤 입력에도 throw 하지 않는다.
 * (save.ts 의 sanitize 와 같은 규율. 여기 두는 이유는 «날짜 규칙»이 이 파일 소유라서다.)
 */
export function sanitizeDailyState(raw: unknown): DailyState {
  const out = emptyDailyState();
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return out;
  const r = raw as Record<string, unknown>;

  if (isDayKey(r.lastClaimDay)) out.lastClaimDay = r.lastClaimDay;
  if (typeof r.lastClaimAtMs === 'number' && Number.isFinite(r.lastClaimAtMs) && r.lastClaimAtMs >= 0) {
    out.lastClaimAtMs = Math.floor(r.lastClaimAtMs);
  }
  const num = (v: unknown): number =>
    typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
  out.streak = num(r.streak);
  out.maxStreak = Math.max(num(r.maxStreak), out.streak);

  // 수령일이 없는데 연속일만 있는 상태는 «있을 수 없다»(그 조합이면 매 로드마다
  // 재지급된다). 날짜가 없으면 연속일도 0으로 되돌린다 — 모순은 조용히 두지 않는다.
  if (!out.lastClaimDay) out.streak = 0;
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// 지급 «알림» 전달 슬롯
// ─────────────────────────────────────────────────────────────────────────────
// ★ 왜 이 상태가 하필 여기 있나 (계층 문제)
//   지급은 로드 시점(save.ts)에 일어나고, 그걸 «보여주는» 것은 ui/ 다. 그런데
//   save.ts 는 ui/ 를 import 한다 — 반대 방향으로 부르면 순환이 된다. main.ts 를
//   경유하면 되지만 main.ts 는 이번 작업의 «무접촉» 대상이다.
//   그래서 «아무것도 import 하지 않는» 이 파일이 둘의 공통 바닥이 된다.
//   save.ts 가 놓고, ui/ 가 «한 번만» 가져간다(take = 소비형이라 두 번 뜨지 않는다).

export interface DailyGrant {
  gems: number;
  streak: number;
  maxStreak: number;
  streakBroken: boolean;
}

let pendingGrant: DailyGrant | null = null;

/** save.ts 전용. 지급이 «저장까지 성공한 뒤»에만 부른다. */
export function postDailyGrant(g: DailyGrant | null): void {
  pendingGrant = g;
}

/** ui/ 전용. 한 번 가져가면 비워진다. */
export function takeDailyGrant(): DailyGrant | null {
  const g = pendingGrant;
  pendingGrant = null;
  return g;
}

/** 테스트용: 슬롯을 들여다본다(비우지 않는다). */
export function peekDailyGrant(): DailyGrant | null {
  return pendingGrant;
}
