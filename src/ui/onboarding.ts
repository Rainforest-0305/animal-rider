// ui/onboarding.ts — 조작 안내 토스트(로데오 스탬피드 벤치마크 격차 ①).
//
// ┌ 사용법 (main.ts 배선) ────────────────────────────────────────────────────
// │ import { showControlHint } from './ui/onboarding';
// │ const hint = showControlHint();          // 로드 직후 «즉시» 호출
// │ // 유저가 첫 입력을 하면 자동으로 사라진다. 강제로 없애려면:
// │ hint.dismiss();
// └───────────────────────────────────────────────────────────────────────────
//
// ★ 요건: «첫 3초 이내» 조작 안내가 화면에 뜬다. 기본 delayMs=0 이라 첫 프레임에
//   뜬다(3초 여유를 다 쓰지 않는다).
// ★ «별도 화면으로 막지 않는다» — 토스트는 pointer-events:none 이라 탭이 그대로
//   캔버스로 통과한다. 즉시플레이 원칙(CrazyGames 전량거절 사유) 유지.
// ★ 표시 조건: 기본은 «매 로드»가 아니라 첫 방문 1회 + 첫 입력 전까지. 저장소
//   접근이 막힌 환경(사파리 프라이빗 등)에서도 죽지 않게 try/catch 로 감싼다.
import { el, overlayRoot } from './dom';
import { icon } from './icons';
import { ensureStyles } from './styles';
import { ut, detectLocale } from './uiStrings';
import type { Locale } from '../i18n';

const SEEN_KEY = 'ar.onb.seen';

export interface ControlHintOptions {
  locale?: Locale;
  /** 표시까지 대기(ms). 기본 0 — 첫 프레임에 뜬다. */
  delayMs?: number;
  /** 자동 소멸까지(ms). 기본 4500. 첫 입력이 오면 그 전에 사라진다. */
  durationMs?: number;
  /** true 면 이미 본 적 있어도 다시 보여준다(디버그/하네스용). 기본 false. */
  force?: boolean;
}

export interface ControlHint {
  dismiss(): void;
  readonly node: HTMLElement | null;
}

function seenBefore(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

function markSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, '1');
  } catch {
    /* 저장소 불가 환경 — 안내가 매번 떠도 게임 진행에는 지장 없다 */
  }
}

export function showControlHint(opts: ControlHintOptions = {}): ControlHint {
  ensureStyles();
  if (!opts.force && seenBefore()) return { dismiss: () => {}, node: null };

  const locale = opts.locale ?? detectLocale();
  const toast = el('div', { class: 'ar-toast', role: 'status' }, [
    icon('tap'),
    el('span', {}, [
      el('b', { text: ut(locale, 'onb.tap') }),
      el('span', { class: 'sep', text: ' · ' }),
      el('span', { text: ut(locale, 'onb.air') }),
    ]),
  ]);
  toast.setAttribute('aria-live', 'polite');

  const root = overlayRoot();
  const timers: number[] = [];
  let dead = false;

  function dismiss(): void {
    if (dead) return;
    dead = true;
    timers.forEach((t) => window.clearTimeout(t));
    window.removeEventListener('pointerdown', onFirstInput, true);
    window.removeEventListener('keydown', onFirstInput, true);
    toast.classList.remove('in');
    window.setTimeout(() => toast.remove(), 260);
    markSeen();
  }

  // 첫 입력이 들어오면 «안내는 역할을 다한 것» — 즉시 치운다.
  function onFirstInput(): void {
    timers.push(window.setTimeout(dismiss, 500)); // 손가락이 닿은 뒤 잠깐은 남겨 읽을 시간을 준다
    window.removeEventListener('pointerdown', onFirstInput, true);
    window.removeEventListener('keydown', onFirstInput, true);
  }

  const show = () => {
    if (dead) return;
    root.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('in'));
    window.addEventListener('pointerdown', onFirstInput, true);
    window.addEventListener('keydown', onFirstInput, true);
    timers.push(window.setTimeout(dismiss, opts.durationMs ?? 4500));
  };

  const delay = opts.delayMs ?? 0;
  if (delay <= 0) show();
  else timers.push(window.setTimeout(show, delay));

  return { dismiss, node: toast };
}

/** 하네스/QA 용: "본 적 있음" 플래그 리셋. */
export function resetControlHintSeen(): void {
  try {
    localStorage.removeItem(SEEN_KEY);
  } catch {
    /* noop */
  }
}
