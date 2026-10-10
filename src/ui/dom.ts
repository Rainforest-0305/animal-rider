// ui/dom.ts — DOM 소도구. 프레임워크 없음(번들 0 추가).
// 접근성 공통(모달 role/aria, 포커스 트랩, ESC, 포커스 복귀)이 여기 모여 있다.

import { icon } from './icons';

export type Attrs = Partial<{
  class: string;
  text: string;
  html: string;
  type: string;
  id: string;
  disabled: boolean;
  ariaLabel: string;
  ariaHidden: boolean;
  role: string;
  tabIndex: number;
  dataset: Record<string, string>;
  style: Partial<CSSStyleDeclaration>;
  on: Partial<Record<keyof HTMLElementEventMap, (e: Event) => void>>;
}>;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  children: Array<Node | string | null | undefined> = []
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (attrs.class) node.className = attrs.class;
  if (attrs.text !== undefined) node.textContent = attrs.text;
  if (attrs.html !== undefined) node.innerHTML = attrs.html;
  if (attrs.id) node.id = attrs.id;
  if (attrs.role) node.setAttribute('role', attrs.role);
  if (attrs.ariaLabel) node.setAttribute('aria-label', attrs.ariaLabel);
  if (attrs.ariaHidden !== undefined) node.setAttribute('aria-hidden', String(attrs.ariaHidden));
  if (attrs.tabIndex !== undefined) node.tabIndex = attrs.tabIndex;
  if (attrs.type && 'type' in node) (node as unknown as { type: string }).type = attrs.type;
  if (attrs.disabled !== undefined && 'disabled' in node) {
    (node as unknown as { disabled: boolean }).disabled = attrs.disabled;
  }
  if (attrs.dataset) for (const [k, v] of Object.entries(attrs.dataset)) node.dataset[k] = v;
  if (attrs.style) Object.assign(node.style, attrs.style);
  if (attrs.on) {
    for (const [evt, fn] of Object.entries(attrs.on)) {
      if (fn) node.addEventListener(evt, fn as EventListener);
    }
  }
  for (const c of children) {
    if (c === null || c === undefined) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

export function clear(node: Element): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

/**
 * 오버레이 루트. index.html 에 `<div id="ui-overlay">` 가 «있으면 그걸 쓰고»,
 * 없으면 만들어 body 에 붙인다 — index.html 을 안 고쳐도 동작한다(락 충돌 회피).
 */
export const OVERLAY_ROOT_ID = 'ui-overlay';

export function overlayRoot(): HTMLElement {
  const found = document.getElementById(OVERLAY_ROOT_ID);
  if (found) return found;
  const made = el('div', { id: OVERLAY_ROOT_ID, class: 'ar-root' });
  document.body.appendChild(made);
  return made;
}

/** ★★☆ 같은 별 표시. 스크린리더에는 "2/3" 로 읽힌다. */
export function starRow(earned: number, max: number, cls = ''): HTMLElement {
  const wrap = el('span', {
    class: `ar-stars ${cls}`.trim(),
    role: 'img',
    ariaLabel: `${earned}/${max}`,
  });
  for (let i = 0; i < max; i++) {
    // ★ 문자(이모지/글리프)가 아니라 아이콘이다 — 폰트에 따라 모양·굵기가 달라지는
    //   문제를 없앤다. 빈 별도 «보인다»(--star-off): 개편 전 #d5dee7 은 흰 배경에서
    //   대비 1.36:1 로 사실상 사라져서 「몇 개 중 몇 개」가 읽히지 않았다(실측).
    const s = el('span', { class: i < earned ? 'ar-star on' : 'ar-star off' });
    s.appendChild(icon('star'));
    wrap.appendChild(s);
  }
  return wrap;
}

export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * 모달 1장의 수명 관리: 포커스 트랩 + ESC + 열기 전 포커스 복귀 + 배경 aria-hidden.
 * 반환된 dispose() 를 닫을 때 반드시 호출한다.
 */
export function trapModal(panel: HTMLElement, onEscape: () => void): () => void {
  const prevFocus = document.activeElement as HTMLElement | null;

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onEscape();
      return;
    }
    if (e.key !== 'Tab') return;
    const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (n) => n.offsetParent !== null || n === document.activeElement
    );
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  document.addEventListener('keydown', onKey, true);
  // 첫 포커스는 «패널 자체»에 준다(tabindex=-1). 첫 버튼에 주면 마우스/터치로 열었을
  // 때도 포커스 링이 뜨는 브라우저가 있어 기본 CTA 위에 노란 테두리가 남는다(실측).
  // 패널에 포커스가 있어도 Tab 은 패널 안 요소로 들어가므로 키보드 접근성은 그대로다.
  panel.focus?.();

  return () => {
    document.removeEventListener('keydown', onKey, true);
    prevFocus?.focus?.();
  };
}

/** 다음 프레임에 클래스를 붙여 CSS 트랜지션이 확실히 발화하게 한다. */
export function nextFrame(fn: () => void): void {
  requestAnimationFrame(() => requestAnimationFrame(fn));
}
