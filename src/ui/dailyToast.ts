// ui/dailyToast.ts — 「오늘 몫을 받았다」를 알리는 토스트 1장.
//
// ┌ 배선 ─────────────────────────────────────────────────────────────────────
// │ const grant = takeDailyGrant();          // daily.ts 슬롯에서 «한 번만» 가져간다
// │ if (grant) showDailyToast({ locale, grant });
// └───────────────────────────────────────────────────────────────────────────
//
// ★ 왜 «화면(모달)»이 아니라 토스트인가
//   로드 즉시 플레이가 시작돼야 한다 — 시작 메뉴/전면 시트를 띄우면 CrazyGames
//   4종 전량거절 사유(ui/index.ts 머리말)를 그대로 재현한다. 토스트는
//   pointer-events:none 이라 탭이 그대로 캔버스로 통과하고, 아무것도 막지 않는다.
//   보상은 «이미 지갑에 들어와» 있고 우상단 보석 칩이 그 숫자를 이미 보여준다 —
//   토스트는 「어디서 생긴 돈인지」와 「연속 며칠째인지」만 말하면 된다.
//
// ★ 새 문자열 0개. 두 키 모두 9개 로케일에 «이미» 있다:
//     clear.reward      '+{n} gems' / '보석 +{n}' / '+{n} Edelsteine' …
//     cond.login_streak 'Log in {a}/{b} days' / '접속 {a}/{b}일' …
//   특히 두 번째는 도감의 하늘(SPECIAL) 진행바가 쓰는 «바로 그» 문자열이다.
//   토스트에서 본 숫자가 도감에서 그대로 이어지므로 설명이 필요 없다.
//
// ★ 새 색 0개. .ar-toast(잉크 스티커) 를 그대로 상속한다. 아이콘만 흰색으로
//   되돌린다 — 기본값 --star(호박)는 「별」 전용 역할색이라 보석에 쓰면 신호가
//   겹치고, --prize(주황 #b8500a)는 잉크색 바탕에서 대비가 무너진다.
//   어두운 스티커 위에서 정직한 선택은 흰색이다(#fff 는 styles.ts 가 이미 쓰는 값).
//
// ★ 사행성 표현 금지(앱스인토스/MS Store 등급 제약): 확률·긴급성·「내일 놓치면
//   손해」류 압박 문구를 넣지 않는다. 받은 액수와 며칠째인지, 사실만 적는다.
import { el, overlayRoot } from './dom';
import { icon } from './icons';
import { ensureStyles } from './styles';
import { ut, detectLocale } from './uiStrings';
import type { Locale } from '../i18n';
import { ROSTER } from '../game/roster';
import type { DailyGrant } from '../daily';

/**
 * 연속 접속으로 열리는 종의 목표 일수. ★ 30 을 여기 적지 않는다 —
 * roster.ts 의 unlock 조건에서 «찾아온다». 확정치가 바뀌면 자동으로 따라간다.
 * 그런 종이 없어지면 undefined 가 되고, 그때는 연속일 표시를 «생략»한다.
 */
export function loginStreakTarget(): number | undefined {
  return ROSTER.find((c) => c.unlock?.kind === 'login_streak')?.unlock?.target;
}

export interface DailyToastOptions {
  grant: DailyGrant;
  locale?: Locale;
  /** 표시까지 대기(ms). 기본 600 — 첫 페인트와 겹치지 않게 한 박자 둔다. */
  delayMs?: number;
  /** 자동 소멸까지(ms). 기본 4200. */
  durationMs?: number;
  /**
   * ★ 이 노드가 DOM 에서 «사라진 뒤에» 뜬다. 조작 안내 토스트를 넘겨주면 된다 —
   *   둘 다 화면 같은 자리(.ar-toast)라 겹치면 글자가 포개진다. 고정 지연 상수로
   *   때우지 않는 이유: 유저가 첫 입력을 하면 안내가 «예정보다 일찍» 사라지는데,
   *   그때 상수를 기다리면 아무것도 없는 화면을 몇 초 쳐다보게 된다.
   */
  waitFor?: HTMLElement | null;
}

export interface DailyToastHandle {
  dismiss(): void;
  readonly node: HTMLElement;
}

/** waitFor 노드가 사라질 때까지 기다렸다가 fn 을 부른다(최대 capMs). */
function afterGone(node: HTMLElement | null | undefined, capMs: number, fn: () => void): number[] {
  const timers: number[] = [];
  // 아직 붙지도 않은 노드면 기다릴 대상이 아니다(안내가 지연 표시 설정이거나 이미 끝난 경우).
  if (!node || !node.isConnected) {
    timers.push(window.setTimeout(fn, 0));
    return timers;
  }
  const STEP = 150;
  let waited = 0;
  const tick = (): void => {
    if (!node.isConnected || waited >= capMs) {
      fn();
      return;
    }
    waited += STEP;
    timers.push(window.setTimeout(tick, STEP));
  };
  timers.push(window.setTimeout(tick, STEP));
  return timers;
}

export function showDailyToast(opts: DailyToastOptions): DailyToastHandle {
  ensureStyles();
  const locale = opts.locale ?? detectLocale();
  const g = opts.grant;

  // ★ flex 로 감싸지 않는다 — «보통 인라인 텍스트»여야 폭이 남을 때 한 줄로 펴진다
  //   (styles.ts .ar-toast .seg 주석의 180px 사고 참조). 조각 안에서만 nowrap.
  const parts: Array<Node> = [
    el('span', { class: 'seg' }, [
      icon('diamond', 't-gem'),
      el('b', { text: ` ${ut(locale, 'clear.reward', { n: g.gems })}` }),
    ]),
  ];

  // 연속일은 «아직 목표에 닿지 않았을 때만» 보여준다. 30일을 넘긴 유저에게
  // 「접속 41/30일」은 말이 안 되고, 그 종은 이미 도감에 들어가 있다.
  const target = loginStreakTarget();
  if (target !== undefined && g.streak <= target) {
    parts.push(el('span', { class: 'sep', text: ' · ' }));
    parts.push(
      el('span', { class: 'seg', text: ut(locale, 'cond.login_streak', { a: g.streak, b: target }) })
    );
  }

  const toast = el('div', { class: 'ar-toast daily', role: 'status' }, parts);
  toast.setAttribute('aria-live', 'polite');

  const root = overlayRoot();
  let timers: number[] = [];
  let dead = false;
  let shown = false;

  function dismiss(): void {
    if (dead) return;
    dead = true;
    timers.forEach((t) => window.clearTimeout(t));
    timers = [];
    if (!shown) return; // 뜨기도 전에 취소됐으면 붙인 것도 없다
    toast.classList.remove('in');
    window.setTimeout(() => toast.remove(), 260);
  }

  const show = (): void => {
    if (dead) return;
    shown = true;
    root.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('in'));
    timers.push(window.setTimeout(dismiss, opts.durationMs ?? 4200));
  };

  const delay = opts.delayMs ?? 600;
  timers = timers.concat(
    afterGone(opts.waitFor, 9000, () => {
      if (dead) return;
      timers.push(window.setTimeout(show, delay));
    })
  );

  return { dismiss, node: toast };
}
