// save.ts — 진행도 영속화(localStorage). 앱 계층(main.ts 와 같은 레벨).
//
// ★ 배치 이유: 저장 대상은 «게임 모델(game/gacha)»과 «메타 모델(ui/meta)»에 걸쳐 있다.
//   game/ 은 ui/ 를 import 하지 않는 단방향 규칙(ui/index.ts 머리말)이라 game/save.ts 로
//   둘 수 없다. ui/ 도 아니다(DOM 0줄, 화면과 무관). 그래서 둘 다 읽을 수 있는 앱 계층에 둔다.
//
// ★ 저장 «대상»은 추측이 아니라 실제 state 정의를 읽어서 정했다:
//   · progress.starsByStage      (ui/meta.ts MetaProgress) — 스테이지별 획득 별 = 최고기록
//     (recordStageResult 주석: 「별은 «최고 기록»만 남긴다」 — 별도 best-score 필드는 «없다»)
//   · progress.gacha.ownedIds    (game/gacha.ts GachaState) — 보유 동물 = 도감 해금분
//   · progress.gacha.gems        (         〃          ) — 보석 잔액
//   · progress.gacha.drawsCompleted (      〃          ) — 다음 뽑기 «가격»이 여기서 나온다
//   · progress.conditionCounters (ui/meta.ts) — SPECIAL 4종 조건해금 카운터
//   · progress.collectionMode    (ui/meta.ts) — 컬렉션 완주 정의
//   해금 스테이지는 별도 필드가 아니다 — stageLockState() 가 별에서 «유도»한다.
//   따라서 별만 복원하면 해금 상태가 그대로 따라온다(중복 저장 금지).
//
// ★ 저장하지 «않는» 것(코드에 그 상태가 존재하지 않아서다 — 없는 걸 지어내지 않는다):
//   · 선택 캐릭터 — main.ts 의 equippedSpecies 는 const 다. ?critter= 디버그 파라미터
//     말고는 «게임 중 바꿀 수단이 없다». 선택 UI 가 생기면 그때 이 스키마에 추가한다.
//   · 언어 설정 — ui/uiStrings.ts detectLocale() 이 navigator 에서 «매번 감지»한다.
//     언어 선택 UI 가 없어 저장할 «사용자 선택»이 존재하지 않는다.
//   · 사운드 on/off — audio.ts 에 setMuted/isMuted 는 있으나 main.ts·ui/ 어디서도
//     호출하지 않는다(토글 UI 없음). 역시 저장할 사용자 선택이 없다.
//   · 온보딩 플래그 — ui/onboarding.ts 가 'ar.onb.seen' 키로 «이미» 저장 중이다.
//     그 파일을 건드리지 않고 그대로 둔다(양성대조이자 기존 동작).
//   · 마일스톤 지급 횟수(main.ts awardedMilestones) — 항상 floor(총별/12) 와 «같다»
//     (awardMilestoneGems 는 별이 늘 때만 단조증가). 저장하지 않고 로드 시 별에서
//     유도한다. 유도하지 않으면 새로고침마다 보석이 재지급되는 «복제 버그»가 된다.
//
// ─────────────────────────────────────────────────────────────────────────────
// v2 (2026-08-18) — 일일 접속 보상 / 연속일
// ─────────────────────────────────────────────────────────────────────────────
// ★ 추가된 것은 daily 하나뿐이고, v1 저장본은 «버리지 않고 그대로 실어 올린다»
//   (migrate() 참조). 이전 구현은 v 가 다르면 «전량 초기화»했다 — 그대로 두고
//   버전만 올렸다면 기존 유저의 별·도감·보석이 통째로 사라졌을 것이다.
// ★ conditionCounters.login_streak 은 이제 «유도값»이다. 진실은 daily.streak 한 곳뿐이고
//   로드/저장 양쪽에서 그걸 복사한다. 두 곳에 각각 쌓으면 반드시 어긋난다
//   (awardedMilestones 를 별에서 유도한 것과 같은 규율).
import type { MetaProgress } from './ui';
import { STAGES } from './ui';
import { GACHA_POOL } from './game/roster';
import type { CollectionMode } from './game/roster';
import {
  emptyDailyState,
  sanitizeDailyState,
  evaluateDaily,
  postDailyGrant,
} from './daily';
import type { DailyState } from './daily';

/** 저장 키. 스키마 버전은 «값 안»의 v 필드가 들고 있다(키에 박으면 낡은 본을 못 본다). */
export const SAVE_KEY = 'ar.save';
/** ★ 스키마 버전. 구조를 바꾸면 반드시 올린다. 낡은 본은 migrate() 로 «끌어올린다». */
export const SAVE_VERSION = 2;
/** 마이그레이션 경로가 «존재하는» 가장 낮은 버전. 이보다 낮으면 안전 초기화. */
export const OLDEST_MIGRATABLE_VERSION = 1;

export interface SaveDataV2 {
  v: number;
  savedAt: number;
  starsByStage: Record<string, number>;
  gacha: { gems: number; ownedIds: string[]; drawsCompleted: number };
  conditionCounters: { login_streak: number; challenge_count: number; customization_categories: number };
  collectionMode?: CollectionMode;
  /** v2 신설. 일일 접속 보상·연속일. 규칙 정의는 daily.ts. */
  daily: DailyState;
}

/** 옛 이름 유지(외부 참조가 깨지지 않게). 구조는 v2 가 정본이다. */
export type SaveDataV1 = SaveDataV2;

export type LoadStatus =
  | 'empty' // 저장본 없음(신규 유저) — 정상 경로
  | 'loaded' // 정상 복원(같은 버전)
  | 'migrated' // ★ 낡은 버전을 «끌어올려» 복원(진행도 보존)
  | 'version-mismatch' // 마이그레이션 경로가 없는 v → 안전 초기화
  | 'corrupt' // JSON 파싱 실패/구조 불일치 → 안전 초기화
  | 'unavailable'; // localStorage 접근 불가(프라이빗 모드 등)

export interface LoadResult {
  status: LoadStatus;
  data: SaveDataV2 | null;
  /**
   * ★ 이번 로드에서 일일 보상이 «지급되고 저장까지 끝났으면» 그 내역. 아니면 null.
   *   화면 쪽은 이걸 직접 읽지 않고 daily.ts 의 takeDailyGrant() 로 가져간다
   *   (main.ts 를 경유하지 않기 위해서다 — 그 파일은 이번 작업 무접촉 대상).
   */
  dailyGranted?: { gems: number; streak: number } | null;
}

const LOG = '[animal-stunt/save]';

/**
 * ★ 일일 상태의 «런타임 보관처». progress(MetaProgress) 안에 넣지 않은 이유:
 *   그 타입은 ui/meta.ts 소유이고 main.ts 가 createMetaProgress() 로 만든다 —
 *   거기 필드를 늘리면 main.ts 를 고쳐야 한다(이번 작업 무접촉 대상).
 *   여기 두면 saveProgress(progress) 시그니처가 그대로라 main.ts 는 한 줄도
 *   바뀌지 않으면서 daily 가 «같이» 저장된다.
 */
let dailyState: DailyState = emptyDailyState();

/** 테스트/진단용: 지금 메모리에 있는 일일 상태(복사본). */
export function currentDailyState(): DailyState {
  return { ...dailyState };
}

// ── 저장소 접근(전부 try/catch — 여기서 throw 가 새면 게임이 «안 켜진다») ────────
function rawGet(key: string): string | null | undefined {
  try {
    return localStorage.getItem(key);
  } catch {
    return undefined; // undefined = 저장소 자체를 못 씀
  }
}
function rawSet(key: string, val: string): boolean {
  try {
    localStorage.setItem(key, val);
    return true;
  } catch {
    return false; // 용량초과·프라이빗모드 — 게임은 계속 돌아야 한다
  }
}
function rawRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* noop */
  }
}
/**
 * 저장소를 «실제로 쓸 수 있는가». 읽기만 되고 쓰기가 막힌 환경(사파리 프라이빗,
 * 용량 초과)이 있으므로 읽기 성공만으로 판단하지 않는다 — 실제로 써 보고 지운다.
 */
function storageUsable(): boolean {
  const probe = `${SAVE_KEY}.probe`;
  try {
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

// ── 정규화 헬퍼(타입 불일치·NaN·Infinity·음수·미지의 id 를 전부 흡수) ───────────
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function intIn(v: unknown, min: number, max: number, fallback = 0): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(v)));
}

const STAGE_MAX_STARS = new Map<string, number>(STAGES.map((s) => [s.id, s.maxStars]));
const GACHA_IDS = new Set<string>(GACHA_POOL.map((c) => c.id));
const COLLECTION_MODES: readonly string[] = ['gacha_pool_20', 'full_roster_24'];

/**
 * 낡은 저장본을 «현재 스키마 모양»으로 끌어올린다. 값은 하나도 버리지 않는다.
 * ★ 반환 null = 끌어올릴 방법이 없다(안전 초기화 대상).
 *
 * v1 → v2: daily 가 없던 시절의 저장본이다. «비어 있는» daily 를 붙인다.
 *   비워 두면 evaluateDaily() 가 이 유저를 「첫 지급」으로 보고 오늘 200 을 준다 —
 *   기존 유저에게 보상이 «사라지는» 방향이 아니라 «오늘부터 시작»하는 방향이라
 *   손해가 없다. 연속일을 지어내지 않는 것도 중요하다(없던 기록을 만들면 하늘이
 *   근거 없이 해금될 수 있다).
 */
function migrate(raw: Record<string, unknown>, from: number): Record<string, unknown> | null {
  if (from === SAVE_VERSION) return raw;
  if (from < OLDEST_MIGRATABLE_VERSION || from > SAVE_VERSION) return null;

  let cur: Record<string, unknown> = raw;
  let v = from;
  if (v === 1) {
    cur = { ...cur, daily: emptyDailyState() };
    v = 2;
  }
  // 여기서 v 가 SAVE_VERSION 이 아니면 «위 사다리에 빠진 단이 있다»는 뜻이다.
  // 조용히 통과시키면 반쯤 변환된 본이 저장돼 다음 로드에서 더 깨진다.
  if (v !== SAVE_VERSION) return null;
  return { ...cur, v: SAVE_VERSION };
}

/**
 * 저장본 → 안전한 SaveDataV2. 어떤 입력이 와도 throw 하지 않는다.
 * 모르는 스테이지 id·모르는 동물 id 는 «조용히 버리는 게 맞다»(로스터가 바뀐 경우).
 */
function sanitize(raw: unknown): SaveDataV2 | null {
  if (!isPlainObject(raw)) return null;

  const stars: Record<string, number> = {};
  if (isPlainObject(raw.starsByStage)) {
    for (const [id, val] of Object.entries(raw.starsByStage)) {
      const max = STAGE_MAX_STARS.get(id);
      if (max === undefined) continue; // 존재하지 않는 스테이지 id
      const n = intIn(val, 0, max, 0);
      if (n > 0) stars[id] = n;
    }
  }

  const g = isPlainObject(raw.gacha) ? raw.gacha : {};
  const owned: string[] = [];
  if (Array.isArray(g.ownedIds)) {
    for (const id of g.ownedIds) {
      if (typeof id !== 'string') continue;
      if (!GACHA_IDS.has(id)) continue; // 가챠풀 밖의 id(SPECIAL 은 조건해금이라 여기 없다)
      if (!owned.includes(id)) owned.push(id);
    }
  }
  // 뽑기 횟수는 «가격»을 결정한다. 보유 수보다 작으면 가격이 되돌아가므로 하한을 건다.
  const draws = Math.max(owned.length, intIn(g.drawsCompleted, 0, GACHA_POOL.length, owned.length));

  const cc = isPlainObject(raw.conditionCounters) ? raw.conditionCounters : {};
  const BIG = 1e9;

  const modeRaw = raw.collectionMode;
  const mode =
    typeof modeRaw === 'string' && COLLECTION_MODES.includes(modeRaw)
      ? (modeRaw as CollectionMode)
      : undefined;

  const daily = sanitizeDailyState(raw.daily);

  return {
    v: SAVE_VERSION,
    savedAt: intIn(raw.savedAt, 0, Number.MAX_SAFE_INTEGER, 0),
    starsByStage: stars,
    gacha: {
      gems: intIn(g.gems, 0, BIG, 0),
      ownedIds: owned,
      drawsCompleted: draws,
    },
    conditionCounters: {
      // ★ login_streak 은 «읽지 않는다» — daily.streak 에서 유도한다(단일 소스).
      //   저장본에 다른 값이 들어 있어도 그쪽이 낡은 것이다.
      login_streak: daily.streak,
      challenge_count: intIn(cc.challenge_count, 0, BIG, 0),
      customization_categories: intIn(cc.customization_categories, 0, BIG, 0),
    },
    daily,
    ...(mode ? { collectionMode: mode } : {}),
  };
}

/** 저장본을 읽는다. ★ 어떤 경우에도 throw 하지 않는다 — 실패는 status 로 «드러낸다». */
export function loadSave(): LoadResult {
  const raw = rawGet(SAVE_KEY);
  if (raw === undefined) {
    console.warn(`${LOG} localStorage 사용 불가 — 저장 없이 진행한다(진행도가 남지 않는다).`);
    return { status: 'unavailable', data: null };
  }
  if (raw === null) return { status: 'empty', data: null }; // 신규 유저 — 정상

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    console.warn(`${LOG} 저장본 JSON 파싱 실패 — 초기화하고 새로 시작한다.`, e);
    rawRemove(SAVE_KEY);
    return { status: 'corrupt', data: null };
  }

  if (!isPlainObject(parsed)) {
    console.warn(`${LOG} 저장본이 객체가 아니다(${Array.isArray(parsed) ? 'array' : typeof parsed}) — 초기화한다.`);
    rawRemove(SAVE_KEY);
    return { status: 'corrupt', data: null };
  }

  const v = parsed.v;
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    console.warn(`${LOG} 저장본에 스키마 버전(v)이 없다 — 초기화한다.`);
    rawRemove(SAVE_KEY);
    return { status: 'corrupt', data: null };
  }

  // ★ 버전이 달라도 «먼저 끌어올려 본다». 예전 구현은 여기서 곧장 버렸는데,
  //   그 동작이 남아 있었다면 v2 배포 순간 기존 유저의 진행도가 전부 사라진다.
  const migrated = migrate(parsed, v);
  if (!migrated) {
    console.warn(
      `${LOG} 스키마 버전 ${v} → ${SAVE_VERSION} 마이그레이션 경로가 없다 — 안전하게 초기화한다.`
    );
    rawRemove(SAVE_KEY);
    return { status: 'version-mismatch', data: null };
  }

  const data = sanitize(migrated);
  if (!data) {
    console.warn(`${LOG} 저장본 구조 불일치 — 초기화한다.`);
    rawRemove(SAVE_KEY);
    return { status: 'corrupt', data: null };
  }
  return { status: v === SAVE_VERSION ? 'loaded' : 'migrated', data };
}

/**
 * 저장본을 «기존 progress 객체에 그대로» 반영한다.
 * ★ 객체를 새로 만들지 않는다 — progress.gacha 는 main.ts 의 gachaState 와 «같은 객체»라
 *   교체하면 drawGacha() 가 다른 객체를 변형하게 되어 조용히 어긋난다.
 */
export function applySave(progress: MetaProgress, data: SaveDataV2): void {
  for (const k of Object.keys(progress.starsByStage)) delete progress.starsByStage[k];
  for (const [id, n] of Object.entries(data.starsByStage)) progress.starsByStage[id] = n;

  progress.gacha.ownedIds.clear();
  for (const id of data.gacha.ownedIds) progress.gacha.ownedIds.add(id);
  progress.gacha.gems = data.gacha.gems;
  progress.gacha.drawsCompleted = data.gacha.drawsCompleted;

  progress.conditionCounters.login_streak = data.conditionCounters.login_streak;
  progress.conditionCounters.challenge_count = data.conditionCounters.challenge_count;
  progress.conditionCounters.customization_categories = data.conditionCounters.customization_categories;

  if (data.collectionMode) progress.collectionMode = data.collectionMode;

  dailyState = data.daily; // 이후 저장에 실릴 «현재» 일일 상태
}

/**
 * 저장본이 있으면 읽어서 progress 에 반영하고, ★이어서 «오늘 몫»을 판정·지급한다.
 * 반환값은 진단용.
 *
 * ★ 지급 순서가 이 함수의 핵심이다 — 「반영 → 저장 → 실패하면 되돌림」.
 *   반대로 「저장 없이 반영」하면 브라우저가 그 직후 죽었을 때 다음 로드에서
 *   같은 날 몫을 «또» 받는다(보석 복제). 그래서 저장이 성공한 뒤에만 지급을 확정한다.
 */
export function loadInto(progress: MetaProgress): LoadResult {
  dailyState = emptyDailyState();
  postDailyGrant(null);

  const res = loadSave();
  if (res.data) {
    try {
      applySave(progress, res.data);
    } catch (e) {
      // 여기까지 오면 내 정규화가 못 막은 케이스다. 게임을 죽이느니 기본값으로 간다.
      console.warn(`${LOG} 저장본 적용 실패 — 기본값으로 시작한다.`, e);
      dailyState = emptyDailyState();
      return { status: 'corrupt', data: null, dailyGranted: null };
    }
  }

  const granted = rolloverDaily(progress);
  return { ...res, dailyGranted: granted };
}

/**
 * 일일 접속 보상 롤오버. loadInto() 안에서만 부른다(부팅 1회).
 * 지급했으면 그 내역을, 아니면 null 을 돌려준다.
 */
function rolloverDaily(progress: MetaProgress): { gems: number; streak: number } | null {
  // ★ 저장소를 못 쓰면 «주지 않는다». 지급 사실을 남길 수 없으므로 새로고침마다
  //   200 씩 재지급되는 보석 복제가 된다. 조용히 넘어가지 않고 이유를 남긴다.
  if (!storageUsable()) {
    console.warn(`${LOG} 저장소를 쓸 수 없어 일일 접속 보상을 지급하지 않는다(재지급 방지).`);
    return null;
  }

  const ev = evaluateDaily(dailyState, Date.now());

  if (ev.outcome === 'clock-rewound') {
    console.warn(
      `${LOG} 기기 시계가 마지막 수령일(${dailyState.lastClaimDay})보다 과거다(${ev.gapDays}일) — ` +
        `일일 보상을 지급하지 않고 상태도 바꾸지 않는다.`
    );
    return null;
  }
  if (ev.outcome !== 'granted') return null;

  // ① 되돌릴 수 있게 이전 값을 붙잡아 둔다
  const prevDaily = dailyState;
  const prevGems = progress.gacha.gems;
  const prevStreak = progress.conditionCounters.login_streak;

  // ② 반영
  dailyState = ev.next;
  progress.gacha.gems = prevGems + ev.gems;
  progress.conditionCounters.login_streak = ev.streak;

  // ③ 저장. 실패하면 «없던 일»로 되돌린다(안 준 채로 게임은 계속 돌아간다).
  if (!saveProgress(progress)) {
    dailyState = prevDaily;
    progress.gacha.gems = prevGems;
    progress.conditionCounters.login_streak = prevStreak;
    console.warn(`${LOG} 일일 보상 저장 실패 — 지급을 취소했다(다음 실행에서 다시 시도한다).`);
    return null;
  }

  postDailyGrant({
    gems: ev.gems,
    streak: ev.streak,
    maxStreak: ev.maxStreak,
    streakBroken: ev.streakBroken,
  });
  return { gems: ev.gems, streak: ev.streak };
}

/** 현재 progress 를 직렬화해 저장. ★ 실패해도 throw 하지 않는다(게임 진행 우선). */
export function saveProgress(progress: MetaProgress): boolean {
  let json: string;
  try {
    const data: SaveDataV2 = {
      v: SAVE_VERSION,
      savedAt: Date.now(),
      starsByStage: { ...progress.starsByStage },
      gacha: {
        gems: progress.gacha.gems,
        ownedIds: Array.from(progress.gacha.ownedIds),
        drawsCompleted: progress.gacha.drawsCompleted,
      },
      conditionCounters: {
        ...progress.conditionCounters,
        // ★ 유도값. 화면에서 만졌든 말든 진실은 daily.streak 하나다.
        login_streak: dailyState.streak,
      },
      daily: { ...dailyState },
      ...(progress.collectionMode ? { collectionMode: progress.collectionMode } : {}),
    };
    json = JSON.stringify(data);
  } catch (e) {
    console.warn(`${LOG} 진행도 직렬화 실패 — 이번 저장을 건너뛴다.`, e);
    return false;
  }
  const ok = rawSet(SAVE_KEY, json);
  if (!ok) console.warn(`${LOG} 진행도 저장 실패(저장소 쓰기 거부) — 이번 진행이 남지 않는다.`);
  return ok;
}

/** QA/디버그용: 저장본 삭제. 메모리 상태도 같이 비운다(반쯤 남으면 다음 저장이 되살린다). */
export function clearSave(): void {
  rawRemove(SAVE_KEY);
  dailyState = emptyDailyState();
  postDailyGrant(null);
}
