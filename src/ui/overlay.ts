// ui/overlay.ts — 모달 «껍데기» 1종. 화면 3종(스테이지/로스터/가챠)과
// 스테이지클리어 연출이 전부 이걸 재사용한다.
//
// 사용법:
//   const m = createModal({ titleText:'스테이지', onClose:()=>handle.close() });
//   m.body.appendChild(...);  m.open();   // 애니메이션 포함 표시
//   m.destroy();                          // 닫기(포커스 복귀·리스너 해제까지)
import { el, clear, overlayRoot, trapModal, nextFrame } from './dom';
import { icon } from './icons';
import { ensureStyles } from './styles';

export interface ScreenHandle {
  /** 화면을 닫는다(중복 호출 안전). */
  close(): void;
  /** 진행도 변경 후 다시 그린다. 닫혀 있으면 무시. */
  refresh(): void;
  /** 열려 있는지 */
  isOpen(): boolean;
  /** 루트 패널(테스트/추가배선용) */
  readonly panel: HTMLElement;
}

export interface ModalParts {
  scrim: HTMLElement;
  panel: HTMLElement;
  head: HTMLElement;
  body: HTMLElement;
  /** 헤더 우측 카운터 텍스트(예: "12 / 144") */
  setCount(text: string): void;
  open(): void;
  destroy(): void;
  isOpen(): boolean;
}

let seq = 0;

export function createModal(opts: {
  titleText: string;
  /** 스크림(배경) 탭으로 닫히게 할지. 기본 true. 클리어 연출처럼 강제 확인이 필요하면 false. */
  dismissOnScrim?: boolean;
  /** 헤더 X 버튼 표시. 기본 true. */
  closeButton?: boolean;
  closeLabel?: string;
  onClose: () => void;
}): ModalParts {
  ensureStyles();
  const root = overlayRoot();
  const id = `ar-modal-${++seq}`;

  let open = false;
  let disposeTrap: (() => void) | null = null;

  const scrim = el('div', {
    class: 'ar-scrim',
    on: {
      pointerdown: (e: Event) => {
        if (opts.dismissOnScrim === false) return;
        if (e.target === scrim) opts.onClose();
      },
    },
  });

  const title = el('h2', { class: 'ar-title', text: opts.titleText, id: `${id}-t` });
  const count = el('span', { class: 'ar-count' });
  const closeBtn = el('button', {
    class: 'ar-x',
    type: 'button',
    ariaLabel: opts.closeLabel ?? 'Close',
    on: { click: () => opts.onClose() },
  }, [icon('x')]);

  const head = el('div', { class: 'ar-head' }, [
    title,
    el('span', { class: 'ar-spacer' }),
    count,
    opts.closeButton === false ? null : closeBtn,
  ]);
  const body = el('div', { class: 'ar-body' });
  const panel = el(
    'div',
    { class: 'ar-panel', role: 'dialog', tabIndex: -1 },
    [head, body]
  );
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-labelledby', `${id}-t`);

  return {
    scrim,
    panel,
    head,
    body,
    isOpen: () => open,
    setCount(text: string) {
      count.textContent = text;
    },
    open() {
      if (open) return;
      open = true;
      root.appendChild(scrim);
      root.appendChild(panel);
      nextFrame(() => {
        scrim.classList.add('in');
        panel.classList.add('in');
      });
      disposeTrap = trapModal(panel, () => opts.onClose());
    },
    destroy() {
      if (!open) return;
      open = false;
      disposeTrap?.();
      disposeTrap = null;
      scrim.classList.remove('in');
      panel.classList.remove('in');
      const kill = () => {
        scrim.remove();
        clear(body);
        panel.remove();
      };
      // 트랜지션이 꺼져 있어도(reduced motion) 확실히 제거되도록 타이머 병행.
      window.setTimeout(kill, 220);
    },
  };
}
